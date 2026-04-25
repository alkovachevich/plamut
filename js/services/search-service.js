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

function dedupeByCanonicalKey(items = []) {
  const map = new Map();

  for (const item of items) {
    if (!item?.canonical_key) continue;

    if (!map.has(item.canonical_key)) {
      map.set(item.canonical_key, item);
      continue;
    }

    const existing = map.get(item.canonical_key);

    map.set(item.canonical_key, {
      ...existing,
      ...item,
      cover_url: existing.cover_url || item.cover_url || "",
      description_ru: existing.description_ru || item.description_ru || "",
      description_en: existing.description_en || item.description_en || "",
      aliases: uniqueArray([...safeArray(existing.aliases), ...safeArray(item.aliases)]),
      external_ids: {
        ...(existing.external_ids || {}),
        ...(item.external_ids || {})
      },
      score: Math.max(existing.score || 0, item.score || 0)
    });
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

function safeNumberYear(value) {
  if (value === null || value === undefined || value === "") return null;
  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function openLibraryCoverUrlFromId(coverId) {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : "";
}

function openLibraryCoverUrlFromIsbn(isbn) {
  return isbn ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg` : "";
}

/* =========================
   BOOKS
========================= */

async function fetchOpenLibraryByTitle(query) {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("title", query);
  url.searchParams.set("limit", "20");

  const response = await fetch(url.toString(), {
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
  const normalizedWorkKey = workKey.startsWith("/works/")
    ? workKey.replace("/works/", "")
    : workKey;

  const isbn = safeArray(doc?.isbn)[0] || "";
  const coverFromId = openLibraryCoverUrlFromId(doc?.cover_i);
  const coverFromIsbn = openLibraryCoverUrlFromIsbn(isbn);

  return {
    canonical_key: normalizedWorkKey
      ? `books:openlibrary:${normalizedWorkKey}`
      : `books:openlibrary:search:${compactString(doc?.title || "unknown")}`,
    category: "books",
    primary_source: "openlibrary",
    title: doc?.title || "",
    original_title: doc?.title || "",
    year: doc?.first_publish_year || null,
    cover_url: coverFromId || coverFromIsbn || "",
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
      isbn: uniqueArray([...safeArray(doc?.isbn).slice(0, 8)])
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
  url.searchParams.set("limit", "12");
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
  ]);
}

function mapWikidataBookEntity(searchItem, details) {
  const labels = details?.labels || {};
  const aliases = details?.aliases || {};
  const claims = details?.claims || {};
  const descriptions = details?.descriptions || {};

  const titleRu = labels?.ru?.value || "";
  const titleEn = labels?.en?.value || "";
  const isbns = extractIsbnValuesFromClaims(claims);

  return {
    canonical_key: `books:wikidata:${searchItem.id}`,
    category: "books",
    primary_source: "wikidata",
    title: titleRu || titleEn || searchItem?.label || "",
    original_title: titleEn || titleRu || searchItem?.label || "",
    year: extractYearFromWikidataClaims(claims),
    cover_url: openLibraryCoverUrlFromIsbn(isbns[0]),
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

  if (title === q) score += 120;
  if (aliases.includes(q)) score += 100;
  if (title.startsWith(q)) score += 40;
  if (aliases.some((alias) => alias.startsWith(q))) score += 35;
  if (aliases.some((alias) => alias.includes(q))) score += 20;
  if (item.cover_url) score += 25;
  if (item.primary_source === "openlibrary") score += 12;
  if (item.year) score += 4;

  return score;
}

function enrichBooksWithOpenLibrary(wikidataItems, openLibraryItems) {
  return wikidataItems.map((item) => {
    const itemTitle = compactString(item.title || item.original_title || "");
    const itemIsbns = safeArray(item.external_ids?.isbn);
    const itemWork = item.external_ids?.openlibrary_work || "";

    const match = openLibraryItems.find((candidate) => {
      const candidateTitle = compactString(candidate.title || candidate.original_title || "");
      const candidateIsbns = safeArray(candidate.external_ids?.isbn);
      const candidateWork = candidate.external_ids?.openlibrary_work || "";

      if (itemWork && candidateWork && itemWork === candidateWork) return true;
      if (itemIsbns.some((isbn) => candidateIsbns.includes(isbn))) return true;
      if (itemTitle && candidateTitle && itemTitle === candidateTitle) return true;

      return false;
    });

    if (!match) return item;

    return {
      ...item,
      cover_url: item.cover_url || match.cover_url || "",
      aliases: uniqueArray([...safeArray(item.aliases), ...safeArray(match.aliases)]),
      external_ids: {
        ...(match.external_ids || {}),
        ...(item.external_ids || {})
      }
    };
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

    wikidataItems = safeArray(wdResult.value).map((candidate) =>
      mapWikidataBookEntity(candidate, detailsResult[candidate.id] || {})
    );
  }

  const enrichedWikidata = enrichBooksWithOpenLibrary(wikidataItems, openLibraryItems);

  return dedupeByCanonicalKey([...openLibraryItems, ...enrichedWikidata])
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

  return groupItems(
    dedupeByCanonicalKey([
      ...(settled[0].status === "fulfilled" ? settled[0].value : []),
      ...(settled[1].status === "fulfilled" ? settled[1].value : []),
      ...(settled[2].status === "fulfilled" ? settled[2].value : []),
      ...(settled[3].status === "fulfilled" ? settled[3].value : [])
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
