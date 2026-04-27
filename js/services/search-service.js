import { SEARCH_LIMITS, TMDB_API_KEY, API_ENDPOINTS } from "../config.js";
import { normalizeString, compactString, uniqueArray, safeArray } from "../utils.js";
import { addToUserLibrary } from "./entity-db.js";

const SEARCH_TIMEOUT_MS = 9000;

const BOOKS_MODAL_LIMIT = 15;
const BOOKS_PAGE_LIMIT = 50;
const BOOKS_TITLE_LIMIT = 24;
const BOOKS_AUTHOR_LIMIT = 36;

const TMDB_LIMIT = 12;
const ANILIST_LIMIT = 10;
const JIKAN_LIMIT = 10;

const SEARCH_CACHE_TTL_MS = 1000 * 60 * 3;
const searchCache = new Map();

function getSearchCacheKey(scope = "global", query = "", category = "") {
  return `${scope}:${compactString(query)}:${category}`;
}

function getCachedSearchResult(key = "") {
  const row = searchCache.get(key);

  if (!row) return null;

  if (Date.now() - row.ts > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }

  return row.value;
}

function setCachedSearchResult(key = "", value = null) {
  if (!key) return;
  searchCache.set(key, { ts: Date.now(), value });
}

function fetchWithTimeout(url, options = {}, timeoutMs = SEARCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => {
    clearTimeout(timer);
  });
}

function normalizeQuery(value = "") {
  return normalizeString(value || "");
}

function sanitizeCategory(value = "") {
  const category = String(value || "").trim().toLowerCase();

  return ["books", "movies", "series", "anime", "manga"].includes(category)
    ? category
    : "";
}

function emptyGroups() {
  return {
    books: [],
    movies: [],
    series: [],
    anime: [],
    manga: []
  };
}

function safeNumberYear(value) {
  if (value === null || value === undefined || value === "") return null;

  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function cleanText(value = "") {
  return typeof value === "string" ? value.trim() : String(value || "").trim();
}

function normalizeOpenLibraryWorkKey(value = "") {
  const raw = cleanText(value);

  if (!raw) return "";

  return raw
    .replace("/works/", "")
    .replace(/^works\//, "")
    .trim();
}

function openLibraryCoverUrlFromId(coverId) {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : "";
}

function openLibraryCoverUrlFromIsbn(isbn) {
  return isbn ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg` : "";
}

function openLibraryCoverUrlFromOlid(olid) {
  return olid ? `https://covers.openlibrary.org/b/olid/${encodeURIComponent(olid)}-L.jpg` : "";
}

function wikimediaFileUrl(filename = "") {
  const clean = cleanText(filename);
  if (!clean) return "";

  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(clean)}`;
}

function normalizeExternalIds(ids = {}) {
  const source = ids && typeof ids === "object" ? ids : {};

  return {
    wikidata: source.wikidata || null,
    tmdb: source.tmdb || null,
    imdb: source.imdb || null,
    openlibrary_work: source.openlibrary_work
      ? normalizeOpenLibraryWorkKey(source.openlibrary_work)
      : null,
    isbn: uniqueArray(safeArray(source.isbn).map(String).filter(Boolean)),
    anilist: source.anilist || null,
    mal: source.mal || null,
    edition_key: uniqueArray(safeArray(source.edition_key).map(String).filter(Boolean)),
    ia: uniqueArray(safeArray(source.ia).map(String).filter(Boolean))
  };
}

function normalizeSearchResult(raw = {}) {
  const category = sanitizeCategory(raw.category);
  const title = cleanText(
    raw.title ||
    raw.title_primary ||
    raw.title_ru ||
    raw.title_en ||
    raw.original_title ||
    ""
  );
  const canonical = cleanText(raw.canonical_key);
  const originalTitle = cleanText(raw.original_title || raw.title_en || "");

  if (!category || !title || !canonical) return null;

  return {
    canonical_key: canonical.toLowerCase(),
    category,
    title,
    title_ru: cleanText(raw.title_ru),
    title_en: cleanText(raw.title_en),
    original_title: originalTitle && originalTitle !== title ? originalTitle : "",
    year: safeNumberYear(raw.year),
    cover_url: cleanText(raw.cover_url),
    external_ids: normalizeExternalIds(raw.external_ids || {}),
    score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0,
    aliases: uniqueArray(safeArray(raw.aliases).map(String).filter(Boolean)),
    description_ru: cleanText(raw.description_ru),
    description_en: cleanText(raw.description_en),
    primary_source: cleanText(raw.primary_source),
    meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {}
  };
}

function flattenGroups(groups = {}) {
  const result = [];

  Object.values(groups || {}).forEach((items) => {
    safeArray(items).forEach((item) => {
      if (item) result.push(item);
    });
  });

  return result;
}

function sortByScoreInternal(items = []) {
  return [...items].sort((a, b) => (b.score || 0) - (a.score || 0));
}

function limitInternal(items = [], limit = SEARCH_LIMITS.PAGE_RESULTS) {
  return safeArray(items).slice(0, limit);
}

function groupItems(items = []) {
  const groups = emptyGroups();

  safeArray(items).forEach((item) => {
    const category = sanitizeCategory(item?.category);
    if (category && groups[category]) {
      groups[category].push(item);
    }
  });

  return groups;
}

function hasSharedValue(a = [], b = []) {
  const set = new Set(safeArray(a).filter(Boolean).map(String));
  return safeArray(b).some((value) => set.has(String(value)));
}

function hasStrictSharedIds(a = {}, b = {}) {
  const aIds = a.external_ids || {};
  const bIds = b.external_ids || {};

  if (
    aIds.openlibrary_work &&
    bIds.openlibrary_work &&
    normalizeOpenLibraryWorkKey(aIds.openlibrary_work) === normalizeOpenLibraryWorkKey(bIds.openlibrary_work)
  ) {
    return true;
  }

  if (aIds.wikidata && bIds.wikidata && aIds.wikidata === bIds.wikidata) return true;
  if (aIds.tmdb && bIds.tmdb && String(aIds.tmdb) === String(bIds.tmdb)) return true;
  if (aIds.anilist && bIds.anilist && String(aIds.anilist) === String(bIds.anilist)) return true;
  if (aIds.mal && bIds.mal && String(aIds.mal) === String(bIds.mal)) return true;
  if (hasSharedValue(aIds.isbn, bIds.isbn)) return true;

  return false;
}

function mergeSimpleItems(existing = {}, incoming = {}) {
  if (!existing?.category || !incoming?.category || existing.category !== incoming.category) {
    return existing || incoming || null;
  }

  const existingIds = existing.external_ids || {};
  const incomingIds = incoming.external_ids || {};

  const mergedMeta = {
    ...(existing.meta || {}),
    ...(incoming.meta || {})
  };

  const authorNames = uniqueArray([
    ...safeArray(existing?.meta?.author_names),
    ...safeArray(incoming?.meta?.author_names)
  ].filter(Boolean));

  if (authorNames.length) {
    mergedMeta.author_names = authorNames;
  }

  if (!mergedMeta.series_name) {
    mergedMeta.series_name =
      existing?.meta?.series_name ||
      incoming?.meta?.series_name ||
      "";
  }

  return normalizeSearchResult({
    ...existing,
    ...incoming,
    canonical_key: existing.canonical_key || incoming.canonical_key,
    category: existing.category,
    title: existing.title || incoming.title,
    title_ru: existing.title_ru || incoming.title_ru,
    title_en: existing.title_en || incoming.title_en,
    original_title: existing.original_title || incoming.original_title,
    year: existing.year || incoming.year || null,
    cover_url: existing.cover_url || incoming.cover_url || "",
    description_ru: existing.description_ru || incoming.description_ru || "",
    description_en: existing.description_en || incoming.description_en || "",
    primary_source: existing.primary_source || incoming.primary_source || "",
    aliases: uniqueArray([
      ...safeArray(existing.aliases),
      ...safeArray(incoming.aliases)
    ]),
    external_ids: {
      ...existingIds,
      ...incomingIds,
      isbn: uniqueArray([
        ...safeArray(existingIds.isbn),
        ...safeArray(incomingIds.isbn)
      ]),
      edition_key: uniqueArray([
        ...safeArray(existingIds.edition_key),
        ...safeArray(incomingIds.edition_key)
      ]),
      ia: uniqueArray([
        ...safeArray(existingIds.ia),
        ...safeArray(incomingIds.ia)
      ])
    },
    meta: mergedMeta,
    score: Math.max(existing.score || 0, incoming.score || 0)
  });
}

function dedupeItems(items = []) {
  const result = [];

  safeArray(items).forEach((item) => {
    const normalized = normalizeSearchResult(item);
    if (!normalized) return;

    const existingIndex = result.findIndex((candidate) => {
      if (candidate.category !== normalized.category) return false;

      if (hasStrictSharedIds(candidate, normalized)) return true;

      return (
        candidate.canonical_key &&
        normalized.canonical_key &&
        candidate.canonical_key === normalized.canonical_key
      );
    });

    if (existingIndex >= 0) {
      result[existingIndex] = mergeSimpleItems(result[existingIndex], normalized);
    } else {
      result.push(normalized);
    }
  });

  return result.filter(Boolean);
}

/* =========================
   BOOKS
========================= */

function detectQueryLanguage(query = "") {
  return /[а-яё]/i.test(query) ? "ru" : "en";
}

function buildOpenLibraryCover(doc = {}) {
  if (doc.cover_i) return openLibraryCoverUrlFromId(doc.cover_i);

  const isbn = safeArray(doc.isbn)[0] || "";
  if (isbn) return openLibraryCoverUrlFromIsbn(isbn);

  const editionKey = safeArray(doc.edition_key)[0] || "";
  if (editionKey) return openLibraryCoverUrlFromOlid(editionKey);

  const ia = safeArray(doc.ia)[0] || "";
  if (ia) return openLibraryCoverUrlFromOlid(ia);

  return "";
}

async function fetchOpenLibrarySearch(params = {}, limit = BOOKS_TITLE_LIMIT) {
  const url = new URL("https://openlibrary.org/search.json");

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim()) {
      url.searchParams.set(key, String(value).trim());
    }
  });

  url.searchParams.set("limit", String(limit));
  url.searchParams.set(
    "fields",
    [
      "key",
      "title",
      "subtitle",
      "alternative_title",
      "author_name",
      "author_key",
      "first_publish_year",
      "cover_i",
      "isbn",
      "edition_key",
      "ia",
      "subject",
      "person",
      "place",
      "time"
    ].join(",")
  );

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Open Library search failed: ${response.status}`);
  }

  const payload = await response.json();
  return safeArray(payload?.docs);
}

async function fetchOpenLibraryByTitle(query = "", limit = BOOKS_TITLE_LIMIT) {
  return fetchOpenLibrarySearch({ title: query }, limit);
}

async function fetchOpenLibraryByAuthor(query = "", limit = BOOKS_AUTHOR_LIMIT) {
  return fetchOpenLibrarySearch({ author: query }, limit);
}

function extractSeriesNameFromOpenLibraryDoc(doc = {}) {
  const subjects = [
    ...safeArray(doc.subject),
    ...safeArray(doc.person),
    ...safeArray(doc.place),
    ...safeArray(doc.time)
  ].map(String);

  const seriesCandidate = subjects.find((subject) => {
    const value = compactString(subject);
    return (
      value.includes("series") ||
      value.includes("book series") ||
      value.includes("цикл") ||
      value.includes("серия")
    );
  });

  return cleanText(seriesCandidate);
}

function chooseBookTitleForQuery(doc = {}, query = "") {
  const language = detectQueryLanguage(query);

  const title = cleanText(doc.title);
  const alternatives = safeArray(doc.alternative_title).map(cleanText).filter(Boolean);

  if (language === "ru") {
    const ruAlternative = alternatives.find((item) => /[а-яё]/i.test(item));
    return ruAlternative || title;
  }

  const enAlternative = alternatives.find((item) => /^[\x00-\x7F]+$/.test(item));
  return enAlternative || title;
}

function mapOpenLibraryBookDoc(doc = {}, sourceMode = "title", query = "") {
  const workKey = normalizeOpenLibraryWorkKey(doc.key);
  const isbnList = uniqueArray(safeArray(doc.isbn).slice(0, 12).map(String).filter(Boolean));
  const editionKeys = uniqueArray(safeArray(doc.edition_key).slice(0, 12).map(String).filter(Boolean));
  const iaKeys = uniqueArray(safeArray(doc.ia).slice(0, 8).map(String).filter(Boolean));
  const authors = uniqueArray(safeArray(doc.author_name).map(cleanText).filter(Boolean));
  const authorKeys = uniqueArray(safeArray(doc.author_key).map(cleanText).filter(Boolean));
  const title = chooseBookTitleForQuery(doc, query);
  const originalTitle = cleanText(doc.title);

  return normalizeSearchResult({
    canonical_key: workKey
      ? `books:openlibrary:${workKey}`
      : `books:openlibrary:search:${compactString(`${title}:${authors.join(",")}:${doc.first_publish_year || ""}`)}`,
    category: "books",
    primary_source: "openlibrary",
    title,
    original_title: originalTitle && originalTitle !== title ? originalTitle : "",
    year: safeNumberYear(doc.first_publish_year),
    cover_url: buildOpenLibraryCover(doc),
    description_ru: "",
    description_en: "",
    aliases: uniqueArray([
      title,
      originalTitle,
      doc.subtitle,
      ...safeArray(doc.alternative_title),
      ...authors
    ].filter(Boolean)),
    external_ids: {
      openlibrary_work: workKey || null,
      isbn: isbnList,
      edition_key: editionKeys,
      ia: iaKeys
    },
    meta: {
      author_names: authors,
      author_keys: authorKeys,
      series_name: extractSeriesNameFromOpenLibraryDoc(doc),
      openlibrary_cover_i: doc.cover_i || null,
      book_search_mode: sourceMode
    },
    score: 0
  });
}

async function fetchWikidataCandidates(query = "", language = "ru", limit = 10) {
  const url = new URL("https://www.wikidata.org/w/api.php");

  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("language", language);
  url.searchParams.set("uselang", language);
  url.searchParams.set("type", "item");
  url.searchParams.set("origin", "*");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("search", query);

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Wikidata search failed: ${response.status}`);
  }

  const payload = await response.json();
  return safeArray(payload?.search);
}

async function fetchWikidataEntityDetails(ids = []) {
  const cleanIds = uniqueArray(safeArray(ids).map(cleanText).filter(Boolean));

  if (!cleanIds.length) return {};

  const url = new URL("https://www.wikidata.org/w/api.php");

  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("props", "labels|aliases|claims|descriptions");
  url.searchParams.set("languages", "ru|en");
  url.searchParams.set("origin", "*");
  url.searchParams.set("ids", cleanIds.join("|"));

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Wikidata details failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.entities || {};
}

function getWikidataClaimItemIds(claims = {}, prop = "") {
  return uniqueArray(
    safeArray(claims?.[prop])
      .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
      .filter(Boolean)
  );
}

function getWikidataClaimStrings(claims = {}, prop = "") {
  return uniqueArray(
    safeArray(claims?.[prop])
      .map((claim) => claim?.mainsnak?.datavalue?.value)
      .filter(Boolean)
  );
}

function extractYearFromWikidataClaims(claims = {}) {
  for (const claim of safeArray(claims.P577)) {
    const value = claim?.mainsnak?.datavalue?.value?.time;

    if (typeof value === "string") {
      const match = value.match(/[+-](\d{4})-/);
      if (match) return Number(match[1]);
    }
  }

  return null;
}

const WIKIDATA_ALLOWED_BOOK_TYPES = new Set([
  "Q571",
  "Q8261",
  "Q7725634",
  "Q47461344",
  "Q277759"
]);

const WIKIDATA_BANNED_BOOK_TYPES = new Set([
  "Q11424",
  "Q5398426",
  "Q95074",
  "Q5",
  "Q7889",
  "Q43229"
]);

function isAllowedWikidataBook(claims = {}) {
  const typeIds = getWikidataClaimItemIds(claims, "P31");

  if (!typeIds.length) return false;
  if (typeIds.some((id) => WIKIDATA_BANNED_BOOK_TYPES.has(id))) return false;

  return typeIds.some((id) => WIKIDATA_ALLOWED_BOOK_TYPES.has(id));
}

function extractOpenLibraryWorkIdFromClaims(claims = {}) {
  return getWikidataClaimStrings(claims, "P648")[0] || null;
}

function extractIsbnValuesFromClaims(claims = {}) {
  return uniqueArray([
    ...getWikidataClaimStrings(claims, "P957"),
    ...getWikidataClaimStrings(claims, "P212")
  ].filter(Boolean));
}

function extractImageFromWikidataClaims(claims = {}) {
  const image = getWikidataClaimStrings(claims, "P18")[0] || "";
  return image ? wikimediaFileUrl(image) : "";
}

function mapWikidataBookEntity(entity = {}, query = "") {
  const id = cleanText(entity.id);
  const claims = entity.claims || {};

  if (!id || !isAllowedWikidataBook(claims)) return null;

  const labelRu = cleanText(entity.labels?.ru?.value);
  const labelEn = cleanText(entity.labels?.en?.value);

  const title = /[а-яё]/i.test(query)
    ? (labelRu || labelEn)
    : (labelEn || labelRu);

  const originalTitle = labelEn && labelEn !== title ? labelEn : "";

  const authors = getWikidataClaimItemIds(claims, "P50");
  const isbnList = extractIsbnValuesFromClaims(claims);

  return normalizeSearchResult({
    canonical_key: `books:wikidata:${id}`,
    category: "books",
    primary_source: "wikidata",

    title,
    original_title: originalTitle,
    year: extractYearFromWikidataClaims(claims),

    cover_url: extractImageFromWikidataClaims(claims),

    external_ids: {
      wikidata: id,
      openlibrary_work: extractOpenLibraryWorkIdFromClaims(claims),
      isbn: isbnList
    },

    meta: {
      author_ids: authors,
      series_name: ""
    },

    score: 0
  });
}

// =========================
// SCORING
// =========================

function scoreBook(query, item) {
  const q = compactString(query);
  const title = compactString(item.title || "");
  const original = compactString(item.original_title || "");

  let score = 0;

  if (title === q) score += 200;
  if (title.startsWith(q)) score += 120;
  if (title.includes(q)) score += 60;

  if (original && original.includes(q)) score += 40;

  if (item.year) score += 5;

  return score;
}

// =========================
// SERIES GROUPING
// =========================

function groupBooksBySeries(items = []) {
  const seriesMap = new Map();
  const result = [];

  safeArray(items).forEach((item) => {
    const series = cleanText(item?.meta?.series_name);

    if (!series) {
      result.push(item);
      return;
    }

    if (!seriesMap.has(series)) {
      seriesMap.set(series, {
        ...item,
        meta: {
          ...item.meta,
          is_series_parent: true,
          series_items: []
        }
      });
    }

    seriesMap.get(series).meta.series_items.push(item);
  });

  return [...seriesMap.values(), ...result];
}

// =========================
// BOOK SEARCH PIPELINE
// =========================

async function searchBooksInternal(query = "", mode = "modal") {
  const clean = normalizeQuery(query);

  if (!clean || clean.length < 2) return [];

  const language = detectQueryLanguage(clean);

  // 1. TITLE SEARCH (PRIORITY)
  const titleDocs = await fetchOpenLibraryByTitle(clean, BOOKS_TITLE_LIMIT)
    .catch(() => []);

  const titleItems = titleDocs.map((doc) =>
    mapOpenLibraryBookDoc(doc, "title", clean)
  );

  // 2. AUTHOR SEARCH (SECONDARY)
  const authorDocs = await fetchOpenLibraryByAuthor(clean, BOOKS_AUTHOR_LIMIT)
    .catch(() => []);

  const authorItems = authorDocs.map((doc) =>
    mapOpenLibraryBookDoc(doc, "author", clean)
  );

  // 3. WIKIDATA ENRICHMENT
  let wikidataItems = [];

  try {
    const candidates = await fetchWikidataCandidates(clean, language, 8);
    const ids = candidates.map((c) => c.id).filter(Boolean);

    const entities = await fetchWikidataEntityDetails(ids);

    wikidataItems = Object.values(entities)
      .map((entity) => mapWikidataBookEntity(entity, clean))
      .filter(Boolean);
  } catch (e) {
    console.warn("Wikidata skipped:", e);
  }

  // 4. MERGE ALL
  const merged = dedupeItems([
    ...titleItems,
    ...authorItems,
    ...wikidataItems
  ]);

  // 5. SCORE
  const scored = merged.map((item) => ({
    ...item,
    score: scoreBook(clean, item)
  }));

  // 6. SORT
  const sorted = sortByScoreInternal(scored);

  // 7. GROUP SERIES
  const grouped = groupBooksBySeries(sorted);

  // 8. LIMIT
  const limit = mode === "modal"
    ? BOOKS_MODAL_LIMIT
    : BOOKS_PAGE_LIMIT;

  return grouped.slice(0, limit);
}

/* =========================
   MOVIES / SERIES
========================= */

function buildTmdbImage(path) {
  return path ? `https://image.tmdb.org/t/p/w500${path}` : "";
}

function mapTmdbItem(item = {}, forcedCategory = "") {
  const isSeries = forcedCategory
    ? forcedCategory === "series"
    : item.media_type === "tv";

  const title =
    item.title ||
    item.name ||
    item.original_title ||
    item.original_name ||
    "";

  const originalTitle =
    item.original_title ||
    item.original_name ||
    "";

  const yearSource = item.release_date || item.first_air_date || "";
  const year = yearSource ? Number(String(yearSource).slice(0, 4)) : null;

  return normalizeSearchResult({
    canonical_key: `${isSeries ? "series" : "movies"}:tmdb:${item.id}`,
    category: isSeries ? "series" : "movies",
    primary_source: "tmdb",
    title,
    original_title: originalTitle && originalTitle !== title ? originalTitle : "",
    year,
    cover_url: buildTmdbImage(item.poster_path),
    description_ru: item.overview || "",
    description_en: "",
    aliases: uniqueArray([
      item.title,
      item.name,
      item.original_title,
      item.original_name
    ].filter(Boolean)),
    external_ids: {
      tmdb: item.id
    },
    meta: {
      tmdb_poster_path: item.poster_path || "",
      popularity: item.popularity || 0,
      vote_average: item.vote_average || 0
    },
    score: Number(item.popularity || 0)
  });
}

async function searchTmdb(query = "", category = "") {
  if (!TMDB_API_KEY) return [];

  const clean = cleanText(query);
  if (!clean) return [];

  const url = new URL(
    category === "movies"
      ? "https://api.themoviedb.org/3/search/movie"
      : category === "series"
        ? "https://api.themoviedb.org/3/search/tv"
        : "https://api.themoviedb.org/3/search/multi"
  );

  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("query", clean);
  url.searchParams.set("language", "ru-RU");
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("page", "1");

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`TMDB search failed: ${response.status}`);
  }

  const payload = await response.json();

  return safeArray(payload?.results)
    .filter((item) => {
      if (category === "movies") return true;
      if (category === "series") return true;
      return item.media_type === "movie" || item.media_type === "tv";
    })
    .map((item) => mapTmdbItem(item, category))
    .filter(Boolean)
    .slice(0, TMDB_LIMIT);
}

/* =========================
   ANIME / MANGA
========================= */

function mapAniListItem(media = {}, forcedCategory = "") {
  const isManga = forcedCategory
    ? forcedCategory === "manga"
    : media.type === "MANGA";

  const title =
    media.title?.romaji ||
    media.title?.english ||
    media.title?.native ||
    "";

  const originalTitle =
    media.title?.native ||
    media.title?.romaji ||
    title ||
    "";

  const year = media.startDate?.year || null;

  return normalizeSearchResult({
    canonical_key: `${isManga ? "manga" : "anime"}:anilist:${media.id}`,
    category: isManga ? "manga" : "anime",
    primary_source: "anilist",
    title,
    original_title: originalTitle && originalTitle !== title ? originalTitle : "",
    year,
    cover_url: media.coverImage?.large || media.coverImage?.medium || "",
    description_ru: "",
    description_en: cleanText(
      String(media.description || "").replace(/<[^>]+>/g, " ")
    ),
    aliases: uniqueArray([
      media.title?.romaji,
      media.title?.english,
      media.title?.native
    ].filter(Boolean)),
    external_ids: {
      anilist: media.id,
      mal: media.idMal || null
    },
    meta: {
      anilist_cover: media.coverImage?.large || media.coverImage?.medium || "",
      format: media.format || "",
      status: media.status || "",
      episodes: media.episodes || null,
      chapters: media.chapters || null,
      volumes: media.volumes || null
    },
    score: Number(media.popularity || 0)
  });
}

async function searchAniList(query = "", category = "") {
  const clean = cleanText(query);
  if (!clean) return [];

  const type = category === "manga" ? "MANGA" : "ANIME";

  const graphql = `
    query ($search: String, $type: MediaType, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(search: $search, type: $type) {
          id
          idMal
          type
          format
          status
          description
          popularity
          episodes
          chapters
          volumes
          startDate {
            year
          }
          title {
            romaji
            english
            native
          }
          coverImage {
            large
            medium
          }
        }
      }
    }
  `;

  const response = await fetchWithTimeout(API_ENDPOINTS.ANILIST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      query: graphql,
      variables: {
        search: clean,
        type,
        perPage: ANILIST_LIMIT
      }
    })
  });

  if (!response.ok) {
    throw new Error(`AniList search failed: ${response.status}`);
  }

  const payload = await response.json();

  return safeArray(payload?.data?.Page?.media)
    .map((item) => mapAniListItem(item, category))
    .filter(Boolean);
}

async function searchJikan(query = "", category = "") {
  const clean = cleanText(query);
  if (!clean) return [];

  const endpoint = category === "manga"
    ? `${API_ENDPOINTS.JIKAN}/manga`
    : `${API_ENDPOINTS.JIKAN}/anime`;

  const url = new URL(endpoint);

  url.searchParams.set("q", clean);
  url.searchParams.set("limit", String(JIKAN_LIMIT));

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Jikan search failed: ${response.status}`);
  }

  const payload = await response.json();

  return safeArray(payload?.data)
    .map((item) => {
      const isManga = category === "manga";

      return normalizeSearchResult({
        canonical_key: `${isManga ? "manga" : "anime"}:mal:${item.mal_id}`,
        category: isManga ? "manga" : "anime",
        primary_source: "jikan",
        title: item.title || item.title_english || item.title_japanese || "",
        original_title: item.title_japanese || item.title || "",
        year: item.year || null,
        cover_url: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || "",
        description_ru: "",
        description_en: item.synopsis || "",
        aliases: uniqueArray([
          item.title,
          item.title_english,
          item.title_japanese
        ].filter(Boolean)),
        external_ids: {
          mal: item.mal_id
        },
        meta: {
          anilist_cover: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || "",
          type: item.type || "",
          status: item.status || ""
        },
        score: Number(item.score || 0)
      });
    })
    .filter(Boolean);
}

async function searchAnimeOrManga(query = "", category = "anime") {
  const [aniListResult, jikanResult] = await Promise.allSettled([
    searchAniList(query, category),
    searchJikan(query, category)
  ]);

  const items = [
    ...(aniListResult.status === "fulfilled" ? aniListResult.value : []),
    ...(jikanResult.status === "fulfilled" ? jikanResult.value : [])
  ];

  return sortByScoreInternal(dedupeItems(items)).slice(0, ANILIST_LIMIT);
}

/* =========================
   SEARCH DISPATCH
========================= */

async function searchByCategory(query = "", category = "", mode = "modal") {
  const clean = normalizeQuery(query);
  const normalizedCategory = sanitizeCategory(category);

  if (!clean || clean.length < SEARCH_LIMITS.MIN_QUERY_LENGTH || !normalizedCategory) {
    return [];
  }

  if (normalizedCategory === "books") {
    return searchBooksInternal(clean, mode);
  }

  if (normalizedCategory === "movies") {
    return searchTmdb(clean, "movies").catch((error) => {
      console.warn("Movies search skipped:", error);
      return [];
    });
  }

  if (normalizedCategory === "series") {
    return searchTmdb(clean, "series").catch((error) => {
      console.warn("Series search skipped:", error);
      return [];
    });
  }

  if (normalizedCategory === "anime") {
    return searchAnimeOrManga(clean, "anime").catch((error) => {
      console.warn("Anime search skipped:", error);
      return [];
    });
  }

  if (normalizedCategory === "manga") {
    return searchAnimeOrManga(clean, "manga").catch((error) => {
      console.warn("Manga search skipped:", error);
      return [];
    });
  }

  return [];
}

/* =========================
   PUBLIC API
========================= */

export async function runGlobalSearch(query = "") {
  const clean = normalizeQuery(query);

  if (!clean || clean.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return emptyGroups();
  }

  const cacheKey = getSearchCacheKey("global", clean, "");
  const cached = getCachedSearchResult(cacheKey);

  if (cached) return cached;

  const [
    booksResult,
    moviesResult,
    seriesResult,
    animeResult,
    mangaResult
  ] = await Promise.allSettled([
    searchByCategory(clean, "books", "modal"),
    searchByCategory(clean, "movies", "modal"),
    searchByCategory(clean, "series", "modal"),
    searchByCategory(clean, "anime", "modal"),
    searchByCategory(clean, "manga", "modal")
  ]);

  const groups = {
    books: booksResult.status === "fulfilled" ? booksResult.value : [],
    movies: moviesResult.status === "fulfilled" ? moviesResult.value : [],
    series: seriesResult.status === "fulfilled" ? seriesResult.value : [],
    anime: animeResult.status === "fulfilled" ? animeResult.value : [],
    manga: mangaResult.status === "fulfilled" ? mangaResult.value : []
  };

  setCachedSearchResult(cacheKey, groups);

  return groups;
}

export async function runCategorySearch(query = "", category = "") {
  const clean = normalizeQuery(query);
  const normalizedCategory = sanitizeCategory(category);

  if (!clean || clean.length < SEARCH_LIMITS.MIN_QUERY_LENGTH || !normalizedCategory) {
    return [];
  }

  const cacheKey = getSearchCacheKey("category", clean, normalizedCategory);
  const cached = getCachedSearchResult(cacheKey);

  if (cached) return cached;

  const mode = normalizedCategory === "books" ? "page" : "modal";
  const result = await searchByCategory(clean, normalizedCategory, mode);

  setCachedSearchResult(cacheKey, result);

  return result;
}

export function flattenResults(groups = {}) {
  return flattenGroups(groups);
}

export function sortByScore(items = []) {
  return sortByScoreInternal(items);
}

export function limitResults(items = [], limit = SEARCH_LIMITS.PAGE_RESULTS) {
  return limitInternal(items, limit);
}

export async function addSearchResultDirectlyToLibrary({ userId, item }) {
  if (!userId) {
    throw new Error("Пользователь не найден");
  }

  const normalized = normalizeSearchResult(item);

  if (!normalized) {
    throw new Error("Некорректный результат поиска");
  }

  const entity = {
    canonical_key: normalized.canonical_key,
    category: normalized.category,
    primary_source: normalized.primary_source || "search",

    title: normalized.title,
    title_primary: normalized.title,
    title_ru: normalized.title_ru || "",
    title_en: normalized.title_en || "",
    original_title: normalized.original_title || "",

    year: normalized.year,
    cover_url: normalized.cover_url || "",

    description_ru: normalized.description_ru || "",
    description_en: normalized.description_en || "",

    external_ids: normalized.external_ids || {},
    aliases: normalized.aliases || [],
    meta: normalized.meta || {}
  };

  return addToUserLibrary({
    userId,
    entity,
    status: "planned"
  });
}
