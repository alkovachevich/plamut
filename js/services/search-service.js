import { SEARCH_LIMITS } from "../config.js";
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

function dedupeByCanonicalKey(items = []) {
  const map = new Map();

  for (const item of items) {
    if (!item?.canonical_key) continue;
    if (!map.has(item.canonical_key)) {
      map.set(item.canonical_key, item);
    }
  }

  return [...map.values()];
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

function buildBookCoverFromOpenLibrary(doc = {}) {
  if (doc?.cover_i) {
    return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
  }
  return "";
}

function safeNumberYear(value) {
  if (value === null || value === undefined || value === "") return null;
  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

/* =========================
   BOOKS
========================= */

async function fetchWikidataCandidates(query) {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "ru");
  url.searchParams.set("uselang", "ru");
  url.searchParams.set("type", "item");
  url.searchParams.set("origin", "*");
  url.searchParams.set("limit", "12");
  url.searchParams.set("search", query);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Wikidata search failed: ${response.status}`);
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
  const publicationClaims = safeArray(claims.P577);

  for (const claim of publicationClaims) {
    const value = claim?.mainsnak?.datavalue?.value?.time;
    if (typeof value === "string") {
      const match = value.match(/[+-](\d{4})-/);
      if (match) return Number(match[1]);
    }
  }

  return null;
}

function extractOpenLibraryWorkIdFromClaims(claims = {}) {
  const values = safeArray(claims.P648).map(
    (claim) => claim?.mainsnak?.datavalue?.value
  );
  return values.find(Boolean) || null;
}

function extractIsbnValuesFromClaims(claims = {}) {
  const isbn10 = safeArray(claims.P957).map(
    (claim) => claim?.mainsnak?.datavalue?.value
  );

  const isbn13 = safeArray(claims.P212).map(
    (claim) => claim?.mainsnak?.datavalue?.value
  );

  return uniqueArray([...isbn10, ...isbn13]);
}

function mapWikidataBookEntity(searchItem, entityDetails) {
  const labels = entityDetails?.labels || {};
  const aliases = entityDetails?.aliases || {};
  const claims = entityDetails?.claims || {};
  const descriptions = entityDetails?.descriptions || {};

  const titleRu = labels?.ru?.value || "";
  const titleEn = labels?.en?.value || "";
  const originalTitle = titleRu || titleEn || searchItem?.label || "";

  return {
    canonical_key: `books:wikidata:${searchItem.id}`,
    category: "books",
    primary_source: "wikidata",
    title: titleRu || titleEn || searchItem?.label || "",
    original_title: originalTitle,
    year: extractYearFromWikidataClaims(claims),
    cover_url: "",
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
      openlibrary_work: extractOpenLibraryWorkIdFromClaims(claims),
      isbn: extractIsbnValuesFromClaims(claims)
    },
    score: 0
  };
}

async function fetchOpenLibraryByTitle(query) {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("title", query);
  url.searchParams.set("limit", "12");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Open Library title search failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.docs || [];
}

async function fetchOpenLibraryByIsbn(isbnList = []) {
  const clean = isbnList.filter(Boolean).slice(0, 5);
  if (!clean.length) return [];

  const docs = [];

  for (const isbn of clean) {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("isbn", isbn);
    url.searchParams.set("limit", "3");

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) continue;

    const payload = await response.json();
    docs.push(...safeArray(payload?.docs));
  }

  return docs;
}

function mapOpenLibraryDoc(doc) {
  const workKey = typeof doc?.key === "string" ? doc.key : "";
  const normalizedWorkKey = workKey.startsWith("/works/")
    ? workKey.replace("/works/", "")
    : workKey;

  return {
    canonical_key: normalizedWorkKey
      ? `books:openlibrary:${normalizedWorkKey}`
      : `books:openlibrary:search:${compactString(doc?.title || "unknown")}`,
    category: "books",
    primary_source: "openlibrary",
    title: doc?.title || "",
    original_title: doc?.title || "",
    year: doc?.first_publish_year || null,
    cover_url: buildBookCoverFromOpenLibrary(doc),
    description_ru: "",
    description_en: "",
    aliases: uniqueArray([
      doc?.title,
      ...safeArray(doc?.alternative_title),
      ...(doc?.subtitle ? [doc.subtitle] : [])
    ]),
    external_ids: {
      openlibrary_work: normalizedWorkKey || null,
      isbn: uniqueArray([...safeArray(doc?.isbn).slice(0, 5)])
    },
    score: 0
  };
}

function intersects(a = [], b = []) {
  const setB = new Set(b.filter(Boolean));
  return a.some((value) => setB.has(value));
}

function findBestOpenLibraryMatchForBook(item, openLibraryItems = []) {
  const itemTitle = compactString(item.title || item.original_title || "");
  const itemYear = item.year || null;
  const itemWork = item?.external_ids?.openlibrary_work || null;
  const itemIsbns = safeArray(item?.external_ids?.isbn);

  for (const candidate of openLibraryItems) {
    const candidateTitle = compactString(candidate.title || candidate.original_title || "");
    const candidateYear = candidate.year || null;
    const candidateWork = candidate?.external_ids?.openlibrary_work || null;
    const candidateIsbns = safeArray(candidate?.external_ids?.isbn);

    if (itemWork && candidateWork && itemWork === candidateWork) {
      return candidate;
    }

    if (itemIsbns.length && candidateIsbns.length && intersects(itemIsbns, candidateIsbns)) {
      return candidate;
    }

    if (itemTitle && candidateTitle && itemTitle === candidateTitle) {
      if (!itemYear || !candidateYear || itemYear === candidateYear) {
        return candidate;
      }
    }
  }

  return null;
}

function enrichBookItems(wikidataItems = [], openLibraryItems = []) {
  return wikidataItems.map((item) => {
    const match = findBestOpenLibraryMatchForBook(item, openLibraryItems);

    if (!match) return item;

    return {
      ...item,
      cover_url: item.cover_url || match.cover_url || "",
      aliases: uniqueArray([
        ...safeArray(item.aliases),
        ...safeArray(match.aliases)
      ]),
      external_ids: {
        ...(match.external_ids || {}),
        ...(item.external_ids || {})
      }
    };
  });
}

function scoreBookResult(query, item) {
  const q = compactString(query);
  const title = compactString(item.title || "");
  const aliases = safeArray(item.aliases).map(compactString);

  let score = 0;

  if (title === q) score += 120;
  if (aliases.includes(q)) score += 100;
  if (title.startsWith(q)) score += 40;

  for (const alias of aliases) {
    if (alias.startsWith(q)) {
      score += 35;
      break;
    }
  }

  for (const alias of aliases) {
    if (alias.includes(q)) {
      score += 20;
      break;
    }
  }

  if (item.primary_source === "wikidata") score += 20;
  if (item.cover_url) score += 10;
  if (item.year) score += 4;

  return score;
}

async function searchBooks(query) {
  const cleanQuery = normalizeQuery(query);

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  let wikidataItems = [];
  let openLibraryItems = [];

  try {
    const wikidataCandidates = await fetchWikidataCandidates(cleanQuery);
    const wikidataIds = wikidataCandidates.map((item) => item.id).filter(Boolean);
    const wikidataDetails = await fetchWikidataEntityDetails(wikidataIds);

    wikidataItems = wikidataCandidates.map((candidate) =>
      mapWikidataBookEntity(candidate, wikidataDetails[candidate.id] || {})
    );
  } catch (error) {
    console.warn("Wikidata books search error:", error);
  }

  try {
    const wikidataIsbns = uniqueArray(
      wikidataItems.flatMap((item) => safeArray(item?.external_ids?.isbn))
    );

    const [byTitle, byIsbn] = await Promise.all([
      fetchOpenLibraryByTitle(cleanQuery),
      fetchOpenLibraryByIsbn(wikidataIsbns)
    ]);

    openLibraryItems = [...byTitle, ...byIsbn].map(mapOpenLibraryDoc);
    wikidataItems = enrichBookItems(wikidataItems, openLibraryItems);
  } catch (error) {
    console.warn("Open Library books search error:", error);
  }

  return dedupeByCanonicalKey([...wikidataItems, ...openLibraryItems])
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
    score: 0
  };
}

function scoreMovieLike(query, item) {
  const q = compactString(query);
  const title = compactString(item.title || "");
  const original = compactString(item.original_title || "");

  let score = 0;
  if (title === q || original === q) score += 120;
  if (title.startsWith(q) || original.startsWith(q)) score += 40;
  if (title.includes(q) || original.includes(q)) score += 20;
  if (item.cover_url) score += 8;
  if (item.year) score += 4;

  return score;
}

async function searchMoviesAndSeries(query) {
  const cleanQuery = normalizeQuery(query);
  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  const url = new URL("https://api.themoviedb.org/3/search/multi");
  url.searchParams.set("api_key", "fc8eab333882a74fe8c8a633e4676d98");
  url.searchParams.set("query", cleanQuery);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "ru-RU");
  url.searchParams.set("page", "1");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`TMDB search failed: ${response.status}`);
  }

  const payload = await response.json();

  return safeArray(payload?.results)
    .filter((item) => item?.media_type === "movie" || item?.media_type === "tv")
    .map(mapTmdbItem)
    .map((item) => ({
      ...item,
      score: scoreMovieLike(cleanQuery, item)
    }))
    .sort((a, b) => b.score - a.score)
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
            type
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
    score: 0
  };
}

function scoreAnimeLike(query, item) {
  const q = compactString(query);
  const title = compactString(item.title || "");
  const original = compactString(item.original_title || "");
  const aliases = safeArray(item.aliases).map(compactString);

  let score = 0;
  if (title === q || original === q || aliases.includes(q)) score += 120;
  if (title.startsWith(q) || original.startsWith(q)) score += 40;
  if (title.includes(q) || original.includes(q)) score += 20;
  if (item.cover_url) score += 8;
  if (item.year) score += 4;

  return score;
}

async function searchAnimeOrManga(query, category = "anime") {
  const cleanQuery = normalizeQuery(query);
  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(buildAniListGraphqlBody(cleanQuery, category))
  });

  if (!response.ok) {
    throw new Error(`AniList search failed: ${response.status}`);
  }

  const payload = await response.json();

  return safeArray(payload?.data?.Page?.media)
    .map((item) => mapAniListItem(item, category))
    .map((item) => ({
      ...item,
      score: scoreAnimeLike(cleanQuery, item)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_LIMITS.MODAL_RESULTS);
}

/* =========================
   MAIN
========================= */

export async function runGlobalSearch(query) {
  const cleanQuery = normalizeQuery(query);

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return emptyGroups();
  }

  let books = [];
  let moviesAndSeries = [];
  let anime = [];
  let manga = [];

  try {
    [books, moviesAndSeries, anime, manga] = await Promise.all([
      searchBooks(cleanQuery),
      searchMoviesAndSeries(cleanQuery),
      searchAnimeOrManga(cleanQuery, "anime"),
      searchAnimeOrManga(cleanQuery, "manga")
    ]);
  } catch (error) {
    console.warn("Global API search error:", error);
  }

  return groupItems(
    dedupeByCanonicalKey([
      ...books,
      ...moviesAndSeries,
      ...anime,
      ...manga
    ])
  );
}

export async function runCategorySearch(query, category) {
  const grouped = await runGlobalSearch(query);
  return safeArray(grouped?.[category]);
}

export async function addSearchResultDirectlyToLibrary({ userId, item }) {
  if (!userId) {
    throw new Error("User is required");
  }

  if (!item?.canonical_key) {
    throw new Error("Search item is invalid");
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
