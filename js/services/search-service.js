import { SEARCH_LIMITS, TMDB_API_KEY, API_ENDPOINTS } from "../config.js";
import { normalizeString, compactString, uniqueArray, safeArray } from "../utils.js";
import { addToUserLibrary } from "./entity-db.js";

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

function hasSharedValue(a = [], b = []) {
  const set = new Set(safeArray(a).filter(Boolean).map(String));
  return safeArray(b).some((value) => set.has(String(value)));
}

function mergeItems(existing, incoming) {
  return {
    ...existing,
    ...incoming,
    title: existing.title || incoming.title || "",
    original_title: existing.original_title || incoming.original_title || "",
    year: existing.year || incoming.year || null,
    cover_url: existing.cover_url || incoming.cover_url || "",
    description_ru: existing.description_ru || incoming.description_ru || "",
    description_en: existing.description_en || incoming.description_en || "",
    aliases: uniqueArray([...safeArray(existing.aliases), ...safeArray(incoming.aliases)]),
    external_ids: {
      ...(existing.external_ids || {}),
      ...(incoming.external_ids || {}),
      isbn: uniqueArray([
        ...safeArray(existing.external_ids?.isbn),
        ...safeArray(incoming.external_ids?.isbn)
      ]),
      edition_key: uniqueArray([
        ...safeArray(existing.external_ids?.edition_key),
        ...safeArray(incoming.external_ids?.edition_key)
      ]),
      ia: uniqueArray([
        ...safeArray(existing.external_ids?.ia),
        ...safeArray(incoming.external_ids?.ia)
      ])
    },
    score: Math.max(existing.score || 0, incoming.score || 0)
  };
}

function areSameBook(a = {}, b = {}) {
  if (a.category !== "books" || b.category !== "books") return false;

  const aIds = a.external_ids || {};
  const bIds = b.external_ids || {};

  if (aIds.openlibrary_work && bIds.openlibrary_work && aIds.openlibrary_work === bIds.openlibrary_work) {
    return true;
  }

  if (aIds.wikidata && bIds.wikidata && aIds.wikidata === bIds.wikidata) {
    return true;
  }

  if (hasSharedValue(aIds.isbn, bIds.isbn)) {
    return true;
  }

  const aTitles = getTitleKeys(a);
  const bTitles = getTitleKeys(b);

  if (!aTitles.length || !bTitles.length) return false;

  const sameTitle = aTitles.some((title) => bTitles.includes(title));
  if (!sameTitle) return false;

  if (a.year && b.year) {
    return Math.abs(Number(a.year) - Number(b.year)) <= 1;
  }

  return true;
}

function dedupeBooks(items = []) {
  const result = [];

  for (const item of items) {
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

function dedupeByCanonicalKey(items = []) {
  const map = new Map();

  for (const item of items) {
    if (!item?.canonical_key) continue;

    if (!map.has(item.canonical_key)) {
      map.set(item.canonical_key, item);
      continue;
    }

    map.set(item.canonical_key, mergeItems(map.get(item.canonical_key), item));
  }

  return [...map.values()];
}

function dedupeAll(items = []) {
  const byCanonical = dedupeByCanonicalKey(items);
  const books = dedupeBooks(byCanonical.filter((item) => item.category === "books"));
  const rest = byCanonical.filter((item) => item.category !== "books");

  return [...books, ...rest];
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
  url.searchParams.set("limit", "24");
  url.searchParams.set("fields", [
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
  ].join(","));

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Open Library failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.docs || [];
}

async function fetchOpenLibraryWorkCover(workKey) {
  const normalizedWorkKey = normalizeOpenLibraryWorkKey(workKey);
  if (!normalizedWorkKey) return "";

  try {
    const response = await fetch(`https://openlibrary.org/works/${encodeURIComponent(normalizedWorkKey)}.json`, {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) return "";

    const payload = await response.json();
    const coverId = safeArray(payload?.covers).find(Boolean);

    return coverId ? openLibraryCoverUrlFromId(coverId) : "";
  } catch {
    return "";
  }
}

async function enrichOpenLibraryItemsWithWorkCovers(items = []) {
  const result = [];

  for (const item of items) {
    if (item.cover_url) {
      result.push(item);
      continue;
    }

    const work = item.external_ids?.openlibrary_work || "";
    const cover = await fetchOpenLibraryWorkCover(work);

    result.push({
      ...item,
      cover_url: cover || item.cover_url || ""
    });
  }

  return result;
}

function mapOpenLibraryDoc(doc) {
  const workKey = typeof doc?.key === "string" ? doc.key : "";
  const normalizedWorkKey = normalizeOpenLibraryWorkKey(workKey);

  const isbnList = uniqueArray([...safeArray(doc?.isbn).slice(0, 12)]);
  const editionKeys = uniqueArray([...safeArray(doc?.edition_key).slice(0, 12)]);
  const iaKeys = uniqueArray([...safeArray(doc?.ia).slice(0, 8)]);

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
  url.searchParams.set("limit", "14");
  url.searchParams.set("search", query);

  const response = await fetch(url.toString(), {
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

  const response = await fetch(url.toString(), {
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
    score: 0
  };
}

function scoreBookResult(query, item) {
  const q = compactString(query);
  const title = compactString(item.title || "");
  const aliases = safeArray(item.aliases).map(compactString);

  let score = 0;

  if (title === q) score += 140;
  if (aliases.includes(q)) score += 115;
  if (title.startsWith(q)) score += 45;
  if (aliases.some((alias) => alias.startsWith(q))) score += 38;
  if (aliases.some((alias) => alias.includes(q))) score += 22;
  if (item.cover_url) score += 35;
  if (item.primary_source === "openlibrary") score += 14;
  if (item.year) score += 5;

  return score;
}

function enrichBooksWithOpenLibrary(wikidataItems, openLibraryItems) {
  return wikidataItems.map((item) => {
    const itemTitle = cleanTitleForDedupe(item.title || item.original_title || "");
    const itemIsbns = safeArray(item.external_ids?.isbn);
    const itemWork = item.external_ids?.openlibrary_work || "";

    const match = openLibraryItems.find((candidate) => {
      const candidateTitle = cleanTitleForDedupe(candidate.title || candidate.original_title || "");
      const candidateIsbns = safeArray(candidate.external_ids?.isbn);
      const candidateWork = candidate.external_ids?.openlibrary_work || "";

      if (itemWork && candidateWork && itemWork === candidateWork) return true;
      if (itemIsbns.some((isbn) => candidateIsbns.includes(isbn))) return true;
      if (itemTitle && candidateTitle && itemTitle === candidateTitle) return true;

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

  let openLibraryItems =
    olResult.status === "fulfilled"
      ? safeArray(olResult.value).map(mapOpenLibraryDoc)
      : [];

  openLibraryItems = await enrichOpenLibraryItemsWithWorkCovers(openLibraryItems);

  let wikidataItems = [];

  if (wdResult.status === "fulfilled") {
    const ids = safeArray(wdResult.value)
      .map((item) => item.id)
      .filter(Boolean);

    const detailsResult = await fetchWikidataEntityDetails(ids).catch(() => ({}));

    wikidataItems = safeArray(wdResult.value).map((candidate) =>
      mapWikidataBookEntity(candidate, detailsResult[candidate.id] || {})
    );
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

function mapTmdbItem(item = {}) {
  const isSeries = item.media_type === "tv";
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
    score: item.poster_path ? 20 : 0
  };
}

async function searchMoviesAndSeries(query) {
  const cleanQuery = normalizeQuery(query);

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  const url = new URL("https://api.themoviedb.org/3/search/multi");
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("query", cleanQuery);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "ru-RU");
  url.searchParams.set("page", "1");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`TMDB failed: ${response.status}`);
  }

  const payload = await response.json();

  return safeArray(payload?.results)
    .filter((item) => item?.media_type === "movie" || item?.media_type === "tv")
    .map(mapTmdbItem)
    .slice(0, SEARCH_LIMITS.MODAL_RESULTS);
}

/* =========================
   ANIME / MANGA
========================= */

function buildAniListGraphqlBody(query, type) {
  return {
    query: `
      query ($search: String, $type: MediaType) {
        Page(page: 1, perPage: 12) {
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
    description_ru: item?.description || "",
    description_en: "",
    aliases: uniqueArray([
      item?.title?.native,
      item?.title?.english,
      item?.title?.romaji
    ]),
    external_ids: { anilist: item.id },
    score: item?.coverImage?.large ? 20 : 0
  };
}

async function searchAnimeOrManga(query, category = "anime") {
  const cleanQuery = normalizeQuery(query);

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  const response = await fetch(API_ENDPOINTS.ANILIST, {
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
    .slice(0, SEARCH_LIMITS.MODAL_RESULTS);
}

function hasAnimeOrMangaMatch(item, animeMangaItems = []) {
  const itemTitles = getTitleKeys(item);

  if (!itemTitles.length) return false;

  return animeMangaItems.some((candidate) => {
    const candidateTitles = getTitleKeys(candidate);
    return itemTitles.some((title) => candidateTitles.includes(title));
  });
}

function filterCrossCategoryNoise({ books = [], moviesSeries = [], anime = [], manga = [] }) {
  const animeMangaItems = [...anime, ...manga];

  const filteredMoviesSeries = moviesSeries.filter((item) => {
    if (!animeMangaItems.length) return true;

    const itemTitle = compactString(item.title || item.original_title || "");
    const isLikelyAnimeTitle = hasAnimeOrMangaMatch(item, animeMangaItems);

    if (isLikelyAnimeTitle) return false;

    if (itemTitle.includes("naruto") || itemTitle.includes("наруто")) {
      return false;
    }

    return true;
  });

  const filteredBooks = books.filter((item) => {
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

/* =========================
   MAIN
========================= */

export async function runGlobalSearch(query) {
  const cleanQuery = normalizeQuery(query);

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return emptyGroups();
  }

  const settled = await Promise.allSettled([
    searchBooks(cleanQuery),
    searchMoviesAndSeries(cleanQuery),
    searchAnimeOrManga(cleanQuery, "anime"),
    searchAnimeOrManga(cleanQuery, "manga")
  ]);

  const books = settled[0].status === "fulfilled" ? settled[0].value : [];
  const moviesSeries = settled[1].status === "fulfilled" ? settled[1].value : [];
  const anime = settled[2].status === "fulfilled" ? settled[2].value : [];
  const manga = settled[3].status === "fulfilled" ? settled[3].value : [];

  const filtered = filterCrossCategoryNoise({
    books,
    moviesSeries,
    anime,
    manga
  });

  return groupItems(
    dedupeAll([
      ...filtered.books,
      ...filtered.moviesSeries,
      ...filtered.anime,
      ...filtered.manga
    ])
  );
}

export async function runCategorySearch(query, category) {
  const grouped = await runGlobalSearch(query);
  return safeArray(grouped?.[category]);
}

export async function addSearchResultDirectlyToLibrary({ userId, item }) {
  if (!userId) {
    throw new Error("Нужно войти в аккаунт");
  }

  if (!item?.canonical_key) {
    throw new Error("Некорректная карточка");
  }

  return await addToUserLibrary({
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
