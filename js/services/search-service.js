import { SEARCH_LIMITS, TMDB_API_KEY, API_ENDPOINTS } from "../config.js";
import { normalizeString, compactString, uniqueArray, safeArray } from "../utils.js";
import { addToUserLibrary } from "./entity-db.js";

const SEARCH_TIMEOUT_MS = 9000;
const BOOKS_LIMIT = 18;
const WIKIDATA_LIMIT = 10;
const TMDB_LIMIT = 12;
const ANILIST_LIMIT = 10;

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

function normalizeQuery(value = "") {
  return normalizeString(value || "");
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

function flattenGroups(groups = {}) {
  const result = [];

  Object.values(groups).forEach((items) => {
    safeArray(items).forEach((item) => result.push(item));
  });

  return result;
}

function sortByScoreInternal(items = []) {
  return [...items].sort((a, b) => (b.score || 0) - (a.score || 0));
}

function limitInternal(items = [], limit = SEARCH_LIMITS.PAGE_RESULTS) {
  return items.slice(0, limit);
}

function groupItems(items = []) {
  const groups = emptyGroups();

  for (const item of items) {
    if (groups[item.category]) {
      groups[item.category].push(item);
    }
  }

  return groups;
}

function safeNumberYear(value) {
  if (value === null || value === undefined || value === "") return null;

  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function cleanTitleForDedupe(value = "") {
  return normalizeString(value)
    .replace(/\bкнига\b/g, "")
    .replace(/\bbook\b/g, "")
    .replace(/\bроман\b/g, "")
    .replace(/\bnovel\b/g, "")
    .replace(/\bтом\b/g, "")
    .replace(/\bvolume\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTitleKeys(item = {}) {
  return uniqueArray([
    item.title,
    item.title_primary,
    item.title_ru,
    item.title_en,
    item.original_title,
    ...safeArray(item.aliases)
  ])
    .map(cleanTitleForDedupe)
    .filter(Boolean);
}


function sanitizeCategory(value = "") {
  const category = String(value || "").trim().toLowerCase();
  return ["books", "movies", "series", "anime", "manga"].includes(category)
    ? category
    : "";
}

function normalizeExternalIds(ids = {}) {
  const source = ids && typeof ids === "object" ? ids : {};
  return {
    wikidata: source.wikidata || null,
    tmdb: source.tmdb || null,
    imdb: source.imdb || null,
    openlibrary_work: source.openlibrary_work || null,
    isbn: uniqueArray(safeArray(source.isbn).map(String).filter(Boolean)),
    anilist: source.anilist || null,
    mal: source.mal || null,
    edition_key: uniqueArray(safeArray(source.edition_key).map(String).filter(Boolean))
  };
}

function normalizeSearchResult(raw = {}) {
  const category = sanitizeCategory(raw.category);
  const title = String(raw.title || raw.title_primary || raw.title_ru || raw.title_en || raw.original_title || "").trim();
  const canonical = String(raw.canonical_key || "").trim();
  const originalTitle = String(raw.original_title || raw.title_en || raw.title_ru || title).trim();
  const external_ids = normalizeExternalIds(raw.external_ids || {});

  if (!category || !title || !canonical) return null;

  return {
    canonical_key: canonical,
    category,
    title,
    original_title: originalTitle,
    year: safeNumberYear(raw.year),
    cover_url: String(raw.cover_url || "").trim(),
    external_ids,
    score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0,
    aliases: uniqueArray(safeArray(raw.aliases).map(String).filter(Boolean)),
    description_ru: String(raw.description_ru || "").trim(),
    description_en: String(raw.description_en || "").trim(),
    primary_source: String(raw.primary_source || "").trim(),
    meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {}
  };
}

function pickBestItem(items = []) {
  return safeArray(items)
    .filter(Boolean)
    .sort((a, b) => {
      const aHasCover = a.cover_url ? 1 : 0;
      const bHasCover = b.cover_url ? 1 : 0;
      if (bHasCover !== aHasCover) return bHasCover - aHasCover;

      const aHasYear = a.year ? 1 : 0;
      const bHasYear = b.year ? 1 : 0;
      if (bHasYear !== aHasYear) return bHasYear - aHasYear;

      const aIds = Object.values(a.external_ids || {}).flat().filter(Boolean).length;
      const bIds = Object.values(b.external_ids || {}).flat().filter(Boolean).length;
      if (bIds !== aIds) return bIds - aIds;

      return (b.score || 0) - (a.score || 0);
    })[0] || null;
}

function hasSharedValue(a = [], b = []) {
  const set = new Set(safeArray(a).filter(Boolean).map(String));
  return safeArray(b).some((value) => set.has(String(value)));
}

function pickBetterText(existingValue = "", incomingValue = "") {
  const a = String(existingValue || "").trim();
  const b = String(incomingValue || "").trim();
  if (!a) return b;
  if (!b) return a;
  return b.length > a.length ? b : a;
}

function pickBooksDescription(existing = {}, incoming = {}, field = "description_ru") {
  const existingText = String(existing?.[field] || "").trim();
  const incomingText = String(incoming?.[field] || "").trim();

  if (!existingText) return incomingText;
  if (!incomingText) return existingText;

  const existingNoise = hasBookScreenDescriptionNoise({ [field]: existingText });
  const incomingNoise = hasBookScreenDescriptionNoise({ [field]: incomingText });

  if (existingNoise && !incomingNoise) return incomingText;
  if (!existingNoise && incomingNoise) return existingText;

  const existingSource = String(existing?.primary_source || "").trim().toLowerCase();
  const incomingSource = String(incoming?.primary_source || "").trim().toLowerCase();

  if (existingSource === "openlibrary" && incomingSource !== "openlibrary") return existingText;
  if (incomingSource === "openlibrary" && existingSource !== "openlibrary") return incomingText;

  return incomingText.length > existingText.length ? incomingText : existingText;
}

function mergeItems(existing, incoming) {
  if (!existing?.category || !incoming?.category || existing.category !== incoming.category) {
    console.warn("merge conflict: category mismatch", existing?.canonical_key, incoming?.canonical_key);
    return existing || incoming || null;
  }

  if (!hasStrictSharedIds(existing, incoming)) {
    console.warn("merge conflict: no strict shared ids", existing?.canonical_key, incoming?.canonical_key);
    return existing;
  }

  if (existing.category === "books" && (hasBookScreenDescriptionNoise(existing) || hasBookScreenDescriptionNoise(incoming))) {
    console.warn("merge conflict: books with screen-like description", existing?.canonical_key, incoming?.canonical_key);
    return existing || incoming || null;
  }

  const existingIds = existing.external_ids || {};
  const incomingIds = incoming.external_ids || {};

  return {
    ...existing,
    ...incoming,
    canonical_key: existing.canonical_key || incoming.canonical_key,
    category: existing.category || incoming.category,
    title: pickBetterText(existing.title, incoming.title),
    title_ru: pickBetterText(existing.title_ru, incoming.title_ru),
    title_en: pickBetterText(existing.title_en, incoming.title_en),
    original_title: pickBetterText(existing.original_title, incoming.original_title),
    year: existing.year || incoming.year || null,
    cover_url: existing.cover_url || incoming.cover_url || "",
    description_ru:
      existing.category === "books"
        ? pickBooksDescription(existing, incoming, "description_ru")
        : pickBetterText(existing.description_ru, incoming.description_ru),
    description_en:
      existing.category === "books"
        ? pickBooksDescription(existing, incoming, "description_en")
        : pickBetterText(existing.description_en, incoming.description_en),
    aliases: uniqueArray([...safeArray(existing.aliases), ...safeArray(incoming.aliases)]),
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
    primary_source: resolveBooksPrimarySource(existing, incoming),
    score: Math.max(existing.score || 0, incoming.score || 0)
  };
}

function areSameBook(a = {}, b = {}) {
  if (a.category !== "books" || b.category !== "books") return false;
  return hasStrictSharedIds(a, b);
}

function dedupeBooks(items = []) {
  const result = [];

  for (const item of safeArray(items)) {
    if (!item?.canonical_key) continue;

    const existingIndex = result.findIndex((candidate) => areSameBook(candidate, item));

    if (existingIndex >= 0) {
      result[existingIndex] = mergeItems(result[existingIndex], item);
    } else {
      result.push(item);
    }
  }

  return result;
}

function identityKeys(item = {}) {
  const ids = item.external_ids || {};
  const categoryPrefix = item.category ? `${item.category}:` : "";
  const keys = [item.canonical_key].filter(Boolean);

  if (ids.wikidata) keys.push(`${categoryPrefix}wikidata:${ids.wikidata}`);
  if (ids.tmdb) keys.push(`${categoryPrefix}tmdb:${ids.tmdb}`);
  if (ids.imdb) keys.push(`${categoryPrefix}imdb:${ids.imdb}`);
  if (ids.anilist) keys.push(`${categoryPrefix}anilist:${ids.anilist}`);
  if (ids.mal) keys.push(`${categoryPrefix}mal:${ids.mal}`);
  if (ids.openlibrary_work) {
    keys.push(`${categoryPrefix}olwork:${normalizeOpenLibraryWorkKey(ids.openlibrary_work)}`);
  }
  safeArray(ids.isbn).forEach((isbn) => keys.push(`${categoryPrefix}isbn:${String(isbn)}`));

  return uniqueArray(keys.filter(Boolean));
}

function dedupeAll(items = []) {
  const normalized = safeArray(items)
    .map((item) => normalizeSearchResult(item))
    .filter(Boolean);

  const grouped = new Map();

  normalized.forEach((item) => {
    const keys = identityKeys(item);
    let groupKey = keys.find((key) => grouped.has(key));

    if (!groupKey) {
      groupKey = keys[0] || item.canonical_key;
      grouped.set(groupKey, [item]);
      keys.forEach((key) => grouped.set(key, grouped.get(groupKey)));
      return;
    }

    const bucket = grouped.get(groupKey) || [];
    bucket.push(item);
    keys.forEach((key) => grouped.set(key, bucket));
  });

  const uniqueBuckets = [];
  const seenBuckets = new Set();

  Array.from(grouped.values()).forEach((bucket) => {
    if (!bucket || seenBuckets.has(bucket)) return;
    seenBuckets.add(bucket);
    uniqueBuckets.push(bucket);
  });

  return uniqueBuckets
    .map((bucket) => {
      const best = pickBestItem(bucket);
      if (!best) return null;
      return safeArray(bucket).reduce((acc, item) => {
        if (!acc?.category || !item?.category || acc.category !== item.category) return acc;
        return mergeItems(acc, item);
      }, best);
    })
    .map((item) => normalizeSearchResult(item))
    .filter((item) => item && item.title && item.canonical_key);
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
  const clean = String(filename || "").trim();
  if (!clean) return "";

  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(clean)}`;
}

function normalizeOpenLibraryWorkKey(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (raw.startsWith("/works/")) {
    return raw.replace("/works/", "");
  }

  return raw;
}

function buildOpenLibraryCover(doc = {}) {
  if (doc.cover_i) {
    return openLibraryCoverUrlFromId(doc.cover_i);
  }

  const isbn = safeArray(doc?.isbn)[0] || "";
  if (isbn) {
    return openLibraryCoverUrlFromIsbn(isbn);
  }

  const editionKey = safeArray(doc?.edition_key)[0] || "";
  if (editionKey) {
    return openLibraryCoverUrlFromOlid(editionKey);
  }

  const ia = safeArray(doc?.ia)[0] || "";
  if (ia) {
    return openLibraryCoverUrlFromOlid(ia);
  }

  return "";
}

/* =========================
   BOOKS
========================= */

async function fetchOpenLibraryByTitle(query) {
  const url = new URL("https://openlibrary.org/search.json");

  url.searchParams.set("title", query);
  url.searchParams.set("limit", String(BOOKS_LIMIT));
  url.searchParams.set(
    "fields",
    [
      "key",
      "title",
      "subtitle",
      "alternative_title",
      "author_name",
      "first_publish_year",
      "cover_i",
      "isbn",
      "edition_key",
      "ia"
    ].join(",")
  );

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Open Library failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.docs || [];
}

function mapOpenLibraryDoc(doc) {
  const workKey = typeof doc?.key === "string" ? doc.key : "";
  const normalizedWorkKey = normalizeOpenLibraryWorkKey(workKey);

  const isbnList = uniqueArray([...safeArray(doc?.isbn).slice(0, 8)]);
  const editionKeys = uniqueArray([...safeArray(doc?.edition_key).slice(0, 8)]);
  const iaKeys = uniqueArray([...safeArray(doc?.ia).slice(0, 5)]);

  return {
    canonical_key: normalizedWorkKey
      ? `books:openlibrary:${normalizedWorkKey}`
      : `books:openlibrary:search:${compactString(doc?.title || "unknown")}`,
    category: "books",
    primary_source: "openlibrary",
    title: doc?.title || "",
    original_title: doc?.title || "",
    year: doc?.first_publish_year || null,
    cover_url: buildOpenLibraryCover(doc),
    description_ru: "",
    description_en: "",
    aliases: uniqueArray([
      doc?.title,
      ...safeArray(doc?.alternative_title),
      ...(doc?.subtitle ? [doc.subtitle] : []),
      ...safeArray(doc?.author_name)
    ]),
    external_ids: {
      openlibrary_work: normalizedWorkKey || null,
      isbn: isbnList,
      edition_key: editionKeys,
      ia: iaKeys
    },
    meta: {
      openlibrary_cover_i: doc?.cover_i || null
    },
    score: 0
  };
}

async function fetchWikidataCandidates(query) {
  const url = new URL("https://www.wikidata.org/w/api.php");

  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "ru");
  url.searchParams.set("uselang", "ru");
  url.searchParams.set("type", "item");
  url.searchParams.set("origin", "*");
  url.searchParams.set("limit", String(WIKIDATA_LIMIT));
  url.searchParams.set("search", query);

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Wikidata failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.search || [];
}

async function fetchWikidataEntityDetails(ids = []) {
  if (!ids.length) return {};

  const url = new URL("https://www.wikidata.org/w/api.php");

  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("props", "labels|aliases|claims|descriptions");
  url.searchParams.set("languages", "ru|en");
  url.searchParams.set("origin", "*");
  url.searchParams.set("ids", ids.join("|"));

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Wikidata details failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.entities || {};
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
  "Q571", // book
  "Q8261", // novel
  "Q7725634", // literary work
  "Q47461344", // written work
  "Q277759" // book series
]);

const WIKIDATA_BANNED_BOOK_TYPES = new Set([
  "Q11424", // film
  "Q5398426", // television series
  "Q95074", // fictional character
  "Q5", // human
  "Q7889", // video game
  "Q43229" // organization
]);

const BOOK_SCREEN_NOISE_WORDS = ["film", "movie", "series", "tv", "сериал", "фильм"];

function getWikidataTypeIds(claims = {}) {
  return uniqueArray(
    safeArray(claims?.P31)
      .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
      .filter(Boolean)
  );
}

function isAllowedWikidataBook(claims = {}) {
  const typeIds = getWikidataTypeIds(claims);
  if (!typeIds.length) return false;
  if (typeIds.some((id) => WIKIDATA_BANNED_BOOK_TYPES.has(id))) return false;
  return typeIds.some((id) => WIKIDATA_ALLOWED_BOOK_TYPES.has(id));
}

function hasBookScreenDescriptionNoise(item = {}) {
  const desc = compactString(`${item.description_ru || ""} ${item.description_en || ""}`);
  return BOOK_SCREEN_NOISE_WORDS.some((word) => desc.includes(word));
}

function hasStrictSharedIds(a = {}, b = {}) {
  const aIds = a.external_ids || {};
  const bIds = b.external_ids || {};

  if (aIds.openlibrary_work && bIds.openlibrary_work && normalizeOpenLibraryWorkKey(aIds.openlibrary_work) === normalizeOpenLibraryWorkKey(bIds.openlibrary_work)) {
    return true;
  }
  if (aIds.wikidata && bIds.wikidata && aIds.wikidata === bIds.wikidata) return true;
  if (aIds.tmdb && bIds.tmdb && String(aIds.tmdb) === String(bIds.tmdb)) return true;
  if (hasSharedValue(aIds.isbn, bIds.isbn)) return true;
  return false;
}

function resolveBooksPrimarySource(existing = {}, incoming = {}) {
  if (existing.category !== "books" || incoming.category !== "books") {
    return existing.primary_source || incoming.primary_source || "";
  }

  if (existing.primary_source === "openlibrary" || incoming.primary_source === "openlibrary") {
    return "openlibrary";
  }

  return existing.primary_source || incoming.primary_source || "";
}

function extractOpenLibraryWorkIdFromClaims(claims = {}) {
  return (
    safeArray(claims.P648)
      .map((claim) => claim?.mainsnak?.datavalue?.value)
      .find(Boolean) || null
  );
}

function extractIsbnValuesFromClaims(claims = {}) {
  return uniqueArray([
    ...safeArray(claims.P957).map((claim) => claim?.mainsnak?.datavalue?.value),
    ...safeArray(claims.P212).map((claim) => claim?.mainsnak?.datavalue?.value)
  ].filter(Boolean));
}

function extractImageFromWikidataClaims(claims = {}) {
  const image = safeArray(claims.P18)
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .find(Boolean);

  return image ? wikimediaFileUrl(image) : "";
}

function mapWikidataBookEntity(searchItem, details) {
  const labels = details?.labels || {};
  const aliases = details?.aliases || {};
  const claims = details?.claims || {};
  const descriptions = details?.descriptions || {};

  const titleRu = labels?.ru?.value || "";
  const titleEn = labels?.en?.value || "";
  const isbns = extractIsbnValuesFromClaims(claims);
  const openLibraryWork = extractOpenLibraryWorkIdFromClaims(claims);
  const wikidataImage = extractImageFromWikidataClaims(claims);

  return {
    canonical_key: `books:wikidata:${searchItem.id}`,
    category: "books",
    primary_source: "wikidata",
    title: titleRu || titleEn || searchItem?.label || "",
    original_title: titleEn || titleRu || searchItem?.label || "",
    year: extractYearFromWikidataClaims(claims),
    cover_url: openLibraryCoverUrlFromIsbn(isbns[0]) || wikidataImage,
    description_ru: descriptions?.ru?.value || "",
    description_en: descriptions?.en?.value || "",
    aliases: uniqueArray([
      searchItem?.label,
      searchItem?.match?.text,
      titleRu,
      titleEn,
      ...safeArray(aliases?.ru).map((item) => item?.value),
      ...safeArray(aliases?.en).map((item) => item?.value)
    ]),
    external_ids: {
      wikidata: searchItem.id,
      openlibrary_work: openLibraryWork,
      isbn: isbns
    },
    meta: {
      wikidata_p18: safeArray(claims.P18).map((claim) => claim?.mainsnak?.datavalue?.value).find(Boolean) || ""
    },
    score: 0
  };
}

function fallbackCoverResolver(entity = {}) {
  const category = sanitizeCategory(entity.category);
  const ids = entity.external_ids || {};

  if (category === "books") {
    const fromCoverId = openLibraryCoverUrlFromId(entity?.meta?.openlibrary_cover_i || ids.cover_i);
    if (fromCoverId) return fromCoverId;

    const isbn = safeArray(ids.isbn)[0] || "";
    if (isbn) return openLibraryCoverUrlFromIsbn(isbn);

    const edition = safeArray(ids.edition_key)[0] || "";
    if (edition) return openLibraryCoverUrlFromOlid(edition);

    const wdP18 = entity?.meta?.wikidata_p18 || "";
    if (wdP18) return wikimediaFileUrl(wdP18);
  }

  if (category === "movies" || category === "series") {
    if (entity?.meta?.tmdb_poster_path) {
      return buildTmdbImage(entity.meta.tmdb_poster_path);
    }
  }

  if (category === "anime" || category === "manga") {
    if (entity?.meta?.anilist_cover) {
      return entity.meta.anilist_cover;
    }
  }

  return "";
}

function applyFinalCategoryFilter(items = [], category = "") {
  const normalized = sanitizeCategory(category);
  return safeArray(items).filter((item) => !normalized || sanitizeCategory(item.category) === normalized);
}

function applyBookScreenPenalty(item = {}) {
  if (item.category !== "books") return item;
  if (hasBookScreenDescriptionNoise(item)) {
    return { ...item, score: (item.score || 0) - 100 };
  }
  return item;
}

function scoreBookResult(query, item) {
  const q = compactString(query);
  const title = compactString(item.title || "");
  const aliases = safeArray(item.aliases).map(compactString);

  let score = 0;

  if (title === q) score += 150;
  if (aliases.includes(q)) score += 100;
  if (title.startsWith(q) || aliases.some((alias) => alias.startsWith(q))) score += 50;
  if (title.includes(q) || aliases.some((alias) => alias.includes(q))) score += 20;
  if (item.cover_url) score += 40;
  if (item.year) score += 10;
  if (Object.keys(item.external_ids || {}).some((key) => {
    const value = item.external_ids?.[key];
    return Array.isArray(value) ? value.length : Boolean(value);
  })) score += 15;
  if (!item.cover_url) score -= 35;
  if ((item.title || "").trim().length < 2) score -= 50;

  return score;
}

function enrichBooksWithOpenLibrary(wikidataItems, openLibraryItems) {
  return safeArray(wikidataItems).map((item) => {
    const itemIsbns = safeArray(item.external_ids?.isbn);
    const itemWork = item.external_ids?.openlibrary_work || "";

    const match = safeArray(openLibraryItems).find((candidate) => {
      const candidateIsbns = safeArray(candidate.external_ids?.isbn);
      const candidateWork = candidate.external_ids?.openlibrary_work || "";

      if (itemWork && candidateWork && itemWork === candidateWork) return true;
      if (itemIsbns.some((isbn) => candidateIsbns.includes(isbn))) return true;

      return false;
    });

    if (!match) return item;

    return mergeItems(match, item);
  });
}

async function searchBooks(query) {
  const cleanQuery = normalizeQuery(query);

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  const [olResult, wdResult] = await Promise.allSettled([
    fetchOpenLibraryByTitle(cleanQuery),
    fetchWikidataCandidates(cleanQuery)
  ]);

  const openLibraryItems =
    olResult.status === "fulfilled"
      ? safeArray(olResult.value).map(mapOpenLibraryDoc)
      : [];

  let wikidataItems = [];

  if (wdResult.status === "fulfilled") {
    const ids = safeArray(wdResult.value)
      .map((item) => item.id)
      .filter(Boolean);

    const detailsResult = await fetchWikidataEntityDetails(ids).catch(() => ({}));

    wikidataItems = safeArray(wdResult.value)
      .map((candidate) => {
        const details = detailsResult[candidate.id] || {};
        const claims = details?.claims || {};
        const typeIds = getWikidataTypeIds(claims);
        const allowed = isAllowedWikidataBook(claims);
        const mapped = mapWikidataBookEntity(candidate, details);

        if (!typeIds.length) {
          console.warn("filtered wikidata item: missing P31", candidate.id);
          return null;
        }

        if (!allowed) {
          console.warn("filtered wikidata item: banned/non-book P31", candidate.id, typeIds);
          return null;
        }

        return mapped;
      })
      .filter(Boolean);
  }

  const enrichedWikidata = enrichBooksWithOpenLibrary(wikidataItems, openLibraryItems);

  return dedupeBooks([...openLibraryItems, ...enrichedWikidata])
    .map((item) => ({
      ...item,
      score: scoreBookResult(cleanQuery, item)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_LIMITS.MODAL_RESULTS);
}

/* =========================
   MOVIES / SERIES
========================= */

function buildTmdbImage(path) {
  return path ? `https://image.tmdb.org/t/p/w500${path}` : "";
}

function mapTmdbItem(item = {}, forcedCategory = "") {
  const isSeries = forcedCategory ? forcedCategory === "series" : item.media_type === "tv";

  const title =
    item.title ||
    item.name ||
    item.original_title ||
    item.original_name ||
    "";

  const originalTitle =
    item.original_title ||
    item.original_name ||
    title ||
    "";

  const yearSource = item.release_date || item.first_air_date || "";
  const year = yearSource ? Number(String(yearSource).slice(0, 4)) : null;

  return {
    canonical_key: `${isSeries ? "series" : "movies"}:tmdb:${item.id}`,
    category: isSeries ? "series" : "movies",
    primary_source: "tmdb",
    title,
    original_title: originalTitle,
    year: safeNumberYear(year),
    cover_url: buildTmdbImage(item.poster_path),
    description_ru: item.overview || "",
    description_en: "",
    aliases: uniqueArray([title, originalTitle]),
    external_ids: { tmdb: item.id },
    meta: {
      tmdb_poster_path: item.poster_path || ""
    },
    score: item.poster_path ? 20 : 0
  };
}

async function searchTmdbMulti(query) {
  const cleanQuery = normalizeQuery(query);

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  if (!TMDB_API_KEY) return [];

  const url = new URL("https://api.themoviedb.org/3/search/multi");

  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("query", cleanQuery);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "ru-RU");
  url.searchParams.set("page", "1");

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`TMDB failed: ${response.status}`);
  }

  const payload = await response.json();

  return safeArray(payload?.results)
    .filter((item) => item?.media_type === "movie" || item?.media_type === "tv")
    .map((item) => mapTmdbItem(item))
    .slice(0, TMDB_LIMIT);
}

function scoreScreenResult(query, item) {
  const q = compactString(query);
  const title = compactString(item.title || "");
  const originalTitle = compactString(item.original_title || "");
  const aliases = safeArray(item.aliases).map(compactString);
  let score = item.score || 0;

  if (title === q || originalTitle === q) score += 150;
  if (aliases.includes(q)) score += 100;
  if (title.startsWith(q) || originalTitle.startsWith(q) || aliases.some((alias) => alias.startsWith(q))) score += 50;
  if (title.includes(q) || originalTitle.includes(q) || aliases.some((alias) => alias.includes(q))) score += 20;
  if (item.cover_url) score += 40;
  if (item.year) score += 10;
  if (Object.keys(item.external_ids || {}).some((key) => {
    const value = item.external_ids?.[key];
    return Array.isArray(value) ? value.length : Boolean(value);
  })) score += 15;
  if (!item.cover_url) score -= 35;
  if ((item.title || "").trim().length < 2) score -= 50;

  return score;
}

async function searchMovies(query) {
  const multi = await searchTmdbMulti(query);
  return safeArray(multi)
    .filter((item) => item.category === 'movies')
    .map((item) => ({ ...item, score: scoreScreenResult(query, item) }))
    .sort((a,b)=>b.score-a.score)
    .slice(0, SEARCH_LIMITS.MODAL_RESULTS);
}

async function searchSeries(query) {
  const multi = await searchTmdbMulti(query);
  return safeArray(multi)
    .filter((item) => item.category === 'series')
    .map((item) => ({ ...item, score: scoreScreenResult(query, item) }))
    .sort((a,b)=>b.score-a.score)
    .slice(0, SEARCH_LIMITS.MODAL_RESULTS);
}

/* =========================
   ANIME / MANGA
========================= */

function buildAniListGraphqlBody(query, type) {
  return {
    query: `
      query ($search: String, $type: MediaType) {
        Page(page: 1, perPage: ${ANILIST_LIMIT}) {
          media(search: $search, type: $type) {
            id
            title {
              romaji
              english
              native
            }
            description(asHtml: false)
            coverImage {
              large
              medium
            }
            startDate {
              year
            }
          }
        }
      }
    `,
    variables: {
      search: query,
      type: type === "manga" ? "MANGA" : "ANIME"
    }
  };
}

function cleanAniListDescription(value = "") {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function mapAniListItem(item = {}, category = "anime") {
  const title =
    item?.title?.native ||
    item?.title?.english ||
    item?.title?.romaji ||
    "";

  const originalTitle =
    item?.title?.romaji ||
    item?.title?.english ||
    item?.title?.native ||
    title;

  return {
    canonical_key: `${category}:anilist:${item.id}`,
    category,
    primary_source: "anilist",
    title,
    original_title: originalTitle,
    year: safeNumberYear(item?.startDate?.year),
    cover_url: item?.coverImage?.large || item?.coverImage?.medium || "",
    description_ru: cleanAniListDescription(item?.description || ""),
    description_en: "",
    aliases: uniqueArray([
      item?.title?.native,
      item?.title?.english,
      item?.title?.romaji
    ]),
    external_ids: { anilist: item.id },
    meta: {
      anilist_cover: item?.coverImage?.large || item?.coverImage?.medium || ""
    },
    score: item?.coverImage?.large ? 20 : 0
  };
}

async function searchAnimeOrManga(query, category = "anime") {
  const cleanQuery = normalizeQuery(query);

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  const response = await fetchWithTimeout(API_ENDPOINTS.ANILIST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(buildAniListGraphqlBody(cleanQuery, category))
  });

  if (!response.ok) {
    throw new Error(`AniList failed: ${response.status}`);
  }

  const payload = await response.json();

  return safeArray(payload?.data?.Page?.media)
    .map((item) => mapAniListItem(item, category))
    .map((item) => ({ ...item, score: scoreScreenResult(cleanQuery, item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_LIMITS.MODAL_RESULTS);
}

function hasAnimeOrMangaMatch(item, animeMangaItems = []) {
  const itemTitles = getTitleKeys(item);

  if (!itemTitles.length) return false;

  return safeArray(animeMangaItems).some((candidate) => {
    const candidateTitles = getTitleKeys(candidate);
    return itemTitles.some((title) => candidateTitles.includes(title));
  });
}

function filterCrossCategoryNoise({ books = [], moviesSeries = [], anime = [], manga = [] }) {
  const animeMangaItems = [...anime, ...manga];

  const filteredMoviesSeries = safeArray(moviesSeries).filter((item) => {
    if (!animeMangaItems.length) return true;

    const itemTitle = compactString(item.title || item.original_title || "");
    const isLikelyAnimeTitle = hasAnimeOrMangaMatch(item, animeMangaItems);

    if (isLikelyAnimeTitle) return false;

    if (itemTitle.includes("naruto") || itemTitle.includes("наруто")) {
      return false;
    }

    return true;
  });

  const filteredBooks = safeArray(books).filter((item) => {
    if (!animeMangaItems.length) return true;

    const itemTitle = compactString(item.title || item.original_title || "");

    if (itemTitle.includes("naruto") || itemTitle.includes("наруто")) {
      return false;
    }

    return true;
  });

  return {
    books: filteredBooks,
    moviesSeries: filteredMoviesSeries,
    anime,
    manga
  };
}

function hasConflictData(item = {}) {
  if (item.category === "books") {
    const ids = item.external_ids || {};
    if (ids.tmdb || ids.imdb) return true;
  }
  return false;
}

function validateFinalItem(item = {}) {
  if (!item?.title || !item?.category || !item?.canonical_key) {
    console.warn("invalid entity: missing required fields", item?.canonical_key || item?.title || "unknown");
    return false;
  }
  if (!["books", "movies", "series", "anime", "manga"].includes(item.category)) {
    console.warn("invalid entity: unsupported category", item.category, item.canonical_key);
    return false;
  }
  if (hasConflictData(item)) {
    console.warn("invalid entity: conflicting data", item.canonical_key);
    return false;
  }
  return true;
}

/* =========================
   MAIN
========================= */

export async function runGlobalSearch(query) {
  const cleanQuery = normalizeQuery(query);
  const cacheKey = getSearchCacheKey("global", cleanQuery);
  const cached = getCachedSearchResult(cacheKey);
  if (cached) return cached;

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return emptyGroups();
  }

  const settled = await Promise.allSettled([
    searchBooks(cleanQuery),
    searchMovies(cleanQuery),
    searchSeries(cleanQuery),
    searchAnimeOrManga(cleanQuery, "anime"),
    searchAnimeOrManga(cleanQuery, "manga")
  ]);

  const grouped = {
    books: settled[0].status === "fulfilled" ? settled[0].value : [],
    movies: settled[1].status === "fulfilled" ? settled[1].value : [],
    series: settled[2].status === "fulfilled" ? settled[2].value : [],
    anime: settled[3].status === "fulfilled" ? settled[3].value : [],
    manga: settled[4].status === "fulfilled" ? settled[4].value : []
  };

  const merged = dedupeAll(flattenGroups(grouped))
    .map((item) => ({
      ...item,
      score: item.category === "books" ? scoreBookResult(cleanQuery, item) : scoreScreenResult(cleanQuery, item)
    }))
    .map((item) => {
      const cover = item.cover_url || fallbackCoverResolver(item);
      return {
        ...item,
        cover_url: cover,
        score: cover ? item.score : (item.score || 0) - 20
      };
    })
    .map((item) => applyBookScreenPenalty(item))
    .map((item) => normalizeSearchResult(item))
    .filter((item) => item && validateFinalItem(item))
    .sort((a, b) => b.score - a.score);

  const groupedResult = groupItems(merged);
  setCachedSearchResult(cacheKey, groupedResult);

  return groupedResult;
}

export async function runCategorySearch(query, category) {
  const cleanQuery = normalizeQuery(query);
  const normalizedCategory = sanitizeCategory(category);
  const cacheKey = getSearchCacheKey("category", cleanQuery, normalizedCategory);
  const cached = getCachedSearchResult(cacheKey);
  if (cached) return cached;

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  let result = [];

  if (normalizedCategory === "books") result = dedupeAll(await searchBooks(cleanQuery));
  if (normalizedCategory === "movies") result = dedupeAll(await searchMovies(cleanQuery));
  if (normalizedCategory === "series") result = dedupeAll(await searchSeries(cleanQuery));
  if (normalizedCategory === "anime") result = dedupeAll(await searchAnimeOrManga(cleanQuery, "anime"));
  if (normalizedCategory === "manga") result = dedupeAll(await searchAnimeOrManga(cleanQuery, "manga"));

  result = applyFinalCategoryFilter(result, normalizedCategory)
    .map((item) => {
      const cover = item.cover_url || fallbackCoverResolver(item);
      return {
        ...item,
        cover_url: cover,
        score: cover ? (item.score || 0) : (item.score || 0) - 20
      };
    })
    .map((item) => applyBookScreenPenalty(item))
    .filter((item) => validateFinalItem(item))
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  setCachedSearchResult(cacheKey, result);
  return result;
}

export async function addSearchResultDirectlyToLibrary({ userId, item }) {
  if (!userId) {
    throw new Error("Нужно войти в аккаунт");
  }

  if (!item?.canonical_key) {
    throw new Error("Некорректная карточка");
  }

  return addToUserLibrary({
    userId,
    entity: item
  });
}

export function flattenResults(grouped) {
  return flattenGroups(grouped);
}

export function sortByScore(items = []) {
  return sortByScoreInternal(items);
}

export function limitResults(items = [], limit = SEARCH_LIMITS.PAGE_RESULTS) {
  return limitInternal(items, limit);
}
