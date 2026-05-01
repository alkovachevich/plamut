import { SEARCH_LIMITS } from "../config.js";
import { safeArray } from "../utils.js";
import { addToUserLibrary } from "./entity-db.js";
import { runBooksSearch } from "./search/books-search.js";
import {
  runMovieSearch,
  runSeriesSearch
} from "./search/tmdb-search.js";
import {
  runAnimeSearch,
  runMangaSearch
} from "./search/anilist-search.js";

const SEARCH_CACHE_TTL_MS = 1000 * 60 * 5;

const searchCache = new Map();
const pendingSearches = new Map();

const VALID_CATEGORIES = ["books", "movies", "series", "anime", "manga"];

function now() {
  return Date.now();
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function cleanLower(value = "") {
  return cleanText(value).toLowerCase();
}

function normalizeCategory(category = "") {
  const normalized = cleanLower(category);
  return VALID_CATEGORIES.includes(normalized) ? normalized : "";
}

function normalizeYear(value) {
  if (value === null || value === undefined || value === "") return null;

  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function normalizeJson(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function normalizeAliases(value = []) {
  return Array.from(
    new Set(
      safeArray(value)
        .map(cleanText)
        .filter(Boolean)
    )
  );
}

function isUsefulCover(value = "") {
  const cover = cleanText(value);
  if (!cover) return false;
  if (cover === "undefined" || cover === "null") return false;
  if (cover.includes("/placeholder")) return false;
  return /^https?:\/\//i.test(cover) || cover.startsWith("/");
}

function pickStableText(previous = "", incoming = "") {
  const left = cleanText(previous);
  const right = cleanText(incoming);

  if (!left) return right;
  if (!right) return left;

  return right.length > left.length ? right : left;
}

function pickStableCover(previous = "", incoming = "") {
  const left = cleanText(previous);
  const right = cleanText(incoming);

  if (!isUsefulCover(left)) return right;
  if (!isUsefulCover(right)) return left;

  return left;
}

function getSearchCacheKey(scope = "global", query = "", category = "") {
  return `${scope}:${cleanLower(query)}:${cleanLower(category)}`;
}

function getCachedSearchResult(key = "") {
  const row = searchCache.get(key);

  if (!row) return null;

  if (now() - row.ts > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }

  return row.value;
}

function setCachedSearchResult(key = "", value = null) {
  if (!key) return;
  searchCache.set(key, { ts: now(), value });
}

function getSystemLanguage() {
  const htmlLang = typeof document !== "undefined"
    ? String(document?.documentElement?.lang || "").trim().toLowerCase()
    : "";

  if (htmlLang.startsWith("en")) return "en";
  if (htmlLang.startsWith("ru")) return "ru";

  const localStorageLang = typeof localStorage !== "undefined"
    ? String(localStorage.getItem("plamut_language") || "").trim().toLowerCase()
    : "";

  if (localStorageLang === "en") return "en";
  if (localStorageLang === "ru") return "ru";

  return "ru";
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

function extractDescriptionFields(item = {}) {
  const meta = normalizeJson(item.meta, {});
  const description = cleanText(item.description);
  const descriptionRu = cleanText(
    item.description_ru ||
    meta.description_ru ||
    meta.overview_ru ||
    meta.extract_ru ||
    ""
  );
  const descriptionEn = cleanText(
    item.description_en ||
    meta.description_en ||
    meta.overview_en ||
    meta.synopsis ||
    meta.extract_en ||
    ""
  );

  return {
    description_ru: descriptionRu || (description && !descriptionEn ? description : ""),
    description_en: descriptionEn || (description && !descriptionRu ? description : "")
  };
}

function extractExternalIds(item = {}) {
  const ids = normalizeJson(item.external_ids, {});
  const meta = normalizeJson(item.meta, {});

  return {
    ...ids,

    wikidata: cleanText(ids.wikidata || item.wikidata_id || meta.wikidata_id || ""),
    tmdb: cleanText(ids.tmdb || item.tmdb_id || meta.tmdb_id || ""),
    imdb: cleanText(ids.imdb || item.imdb_id || meta.imdb_id || ""),
    anilist: cleanText(ids.anilist || item.anilist_id || meta.anilist_id || ""),
    mal: cleanText(ids.mal || item.mal_id || meta.mal_id || ""),
    openlibrary_work: cleanText(
      ids.openlibrary_work ||
      ids.openlibrary ||
      item.openlibrary_work ||
      item.openlibrary_id ||
      meta.openlibrary_work ||
      ""
    ).replace("/works/", "")
  };
}

function buildCanonicalKey(item = {}) {
  const existing = cleanLower(item.canonical_key);
  if (existing) return existing;

  const category = normalizeCategory(item.category);
  const ids = extractExternalIds(item);

  if (category && ids.wikidata) return `${category}:wikidata:${ids.wikidata}`.toLowerCase();
  if (category && ids.tmdb) return `${category}:tmdb:${ids.tmdb}`.toLowerCase();
  if (category && ids.imdb) return `${category}:imdb:${ids.imdb}`.toLowerCase();
  if (category && ids.anilist) return `${category}:anilist:${ids.anilist}`.toLowerCase();
  if (category && ids.mal) return `${category}:mal:${ids.mal}`.toLowerCase();

  if (category === "books" && ids.openlibrary_work) {
    return `books:openlibrary:${ids.openlibrary_work}`.toLowerCase();
  }

  const title = cleanLower(
    item.title ||
    item.title_primary ||
    item.title_ru ||
    item.title_en ||
    item.original_title ||
    "untitled"
  )
    .replace(/ё/g, "е")
    .replace(/[^a-z0-9а-яе]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const year = normalizeYear(item.year);

  return [category || "unknown", cleanLower(item.primary_source || item.source || "manual"), title, year || ""]
    .filter(Boolean)
    .join(":")
    .toLowerCase();
}

function normalizeSearchItem(item = {}) {
  const category = normalizeCategory(item.category);

  if (!category) return null;

  const title = cleanText(
    item.title ||
    item.title_primary ||
    item.title_ru ||
    item.title_en ||
    item.original_title ||
    ""
  );

  if (!title) return null;

  const canonicalKey = buildCanonicalKey(item);
  if (!canonicalKey) return null;

  const meta = normalizeJson(item.meta, {});
  const externalIds = extractExternalIds(item);
  const descriptions = extractDescriptionFields(item);

  const normalized = {
    canonical_key: canonicalKey,
    category,

    title,
    title_primary: cleanText(item.title_primary || title),
    title_ru: cleanText(item.title_ru),
    title_en: cleanText(item.title_en),
    original_title: cleanText(item.original_title || title),

    year: normalizeYear(item.year),
    cover_url: cleanText(item.cover_url || meta.cover_url || ""),

    description_ru: descriptions.description_ru,
    description_en: descriptions.description_en,

    aliases: normalizeAliases([
      ...safeArray(item.aliases),
      item.title,
      item.title_primary,
      item.title_ru,
      item.title_en,
      item.original_title
    ]),

    external_ids: externalIds,
    primary_source: cleanText(item.primary_source || item.source || meta.source || ""),
    score: Number.isFinite(Number(item.score)) ? Number(item.score) : 0,

    meta: {
      ...meta,
      search_source: cleanText(item.primary_source || item.source || meta.source || ""),
      metadata_status:
        isUsefulCover(item.cover_url || meta.cover_url) &&
        (descriptions.description_ru || descriptions.description_en)
          ? "partial"
          : "needs_enrichment"
    }
  };

  if (category === "books") {
    normalized.title_primary =
      normalized.title_ru ||
      normalized.title_primary ||
      normalized.title_en ||
      normalized.original_title ||
      normalized.title;

    normalized.meta = {
      ...normalized.meta,
      author_names: safeArray(meta.author_names || item.author_names || item.authors).filter(Boolean),
      series_name: cleanText(meta.series_name || item.series_name || item.series || "")
    };
  }

  return normalized;
}

function normalizeSearchItems(items = []) {
  return safeArray(items)
    .map((item) => normalizeSearchItem(item))
    .filter(Boolean);
}

function mergeSearchItems(existing = {}, incoming = {}) {
  const existingIds = normalizeJson(existing.external_ids, {});
  const incomingIds = normalizeJson(incoming.external_ids, {});
  const existingMeta = normalizeJson(existing.meta, {});
  const incomingMeta = normalizeJson(incoming.meta, {});

  return {
    ...existing,
    ...incoming,

    canonical_key: existing.canonical_key || incoming.canonical_key,
    category: existing.category || incoming.category,

    title: pickStableText(existing.title, incoming.title),
    title_primary: pickStableText(existing.title_primary, incoming.title_primary),
    title_ru: pickStableText(existing.title_ru, incoming.title_ru),
    title_en: pickStableText(existing.title_en, incoming.title_en),
    original_title: pickStableText(existing.original_title, incoming.original_title),

    year: existing.year || incoming.year || null,
    cover_url: pickStableCover(existing.cover_url, incoming.cover_url),

    description_ru: pickStableText(existing.description_ru, incoming.description_ru),
    description_en: pickStableText(existing.description_en, incoming.description_en),

    aliases: Array.from(new Set([
      ...safeArray(existing.aliases),
      ...safeArray(incoming.aliases)
    ].map(cleanText).filter(Boolean))),

    external_ids: {
      ...existingIds,
      ...incomingIds
    },

    meta: {
      ...existingMeta,
      ...incomingMeta
    },

    primary_source: existing.primary_source || incoming.primary_source || "",
    score: Math.max(existing.score || 0, incoming.score || 0)
  };
}

function dedupeByCanonical(items = []) {
  const map = new Map();

  normalizeSearchItems(items).forEach((item) => {
    if (!map.has(item.canonical_key)) {
      map.set(item.canonical_key, item);
      return;
    }

    map.set(
      item.canonical_key,
      mergeSearchItems(map.get(item.canonical_key), item)
    );
  });

  return Array.from(map.values());
}

function sortByScoreInternal(items = []) {
  return [...safeArray(items)].sort((a, b) => (b.score || 0) - (a.score || 0));
}

function limitInternal(items = [], limit = SEARCH_LIMITS.PAGE_RESULTS) {
  return safeArray(items).slice(0, limit);
}

function groupItems(items = []) {
  const groups = emptyGroups();

  normalizeSearchItems(items).forEach((item) => {
    if (groups[item.category]) {
      groups[item.category].push(item);
    }
  });

  return groups;
}

async function runSearchForCategory(query = "", category = "", options = {}) {
  const normalizedCategory = normalizeCategory(category);

  if (!normalizedCategory) return [];

  switch (normalizedCategory) {
    case "books":
      return runBooksSearch(query, options);

    case "movies":
      return runMovieSearch(query, options);

    case "series":
      return runSeriesSearch(query, options);

    case "anime":
      return runAnimeSearch(query, options);

    case "manga":
      return runMangaSearch(query, options);

    default:
      return [];
  }
}

async function runWithDedupedPromise(key, fn) {
  if (pendingSearches.has(key)) {
    return pendingSearches.get(key);
  }

  const promise = fn()
    .finally(() => {
      pendingSearches.delete(key);
    });

  pendingSearches.set(key, promise);
  return promise;
}

export async function runCategorySearch(query = "", category = "") {
  const cleanQuery = cleanText(query);
  const normalizedCategory = normalizeCategory(category);

  if (!cleanQuery || !normalizedCategory) return [];

  const cacheKey = getSearchCacheKey("category", cleanQuery, normalizedCategory);
  const cached = getCachedSearchResult(cacheKey);

  if (cached) return cached;

  const language = getSystemLanguage();

  return runWithDedupedPromise(cacheKey, async () => {
    try {
      const items = await runSearchForCategory(cleanQuery, normalizedCategory, {
        language
      });

      const normalized = limitInternal(
        sortByScoreInternal(dedupeByCanonical(items)),
        SEARCH_LIMITS.CATEGORY_RESULTS
      );

      setCachedSearchResult(cacheKey, normalized);
      return normalized;
    } catch (error) {
      console.warn(`Category search failed (${normalizedCategory}):`, error);
      setCachedSearchResult(cacheKey, []);
      return [];
    }
  });
}

export async function runGlobalSearch(query = "") {
  const cleanQuery = cleanText(query);

  if (!cleanQuery) {
    return emptyGroups();
  }

  const cacheKey = getSearchCacheKey("global", cleanQuery, "");
  const cached = getCachedSearchResult(cacheKey);

  if (cached) return cached;

  const language = getSystemLanguage();

  return runWithDedupedPromise(cacheKey, async () => {
    const results = await Promise.allSettled(
      VALID_CATEGORIES.map(async (category) => {
        const items = await runSearchForCategory(cleanQuery, category, {
          language,
          global: true
        });

        return {
          category,
          items: limitInternal(
            sortByScoreInternal(dedupeByCanonical(items)),
            SEARCH_LIMITS.MODAL_RESULTS
          )
        };
      })
    );

    const groups = emptyGroups();

    results.forEach((result) => {
      if (result.status !== "fulfilled") return;

      const category = result.value?.category;
      const items = result.value?.items || [];

      if (groups[category]) {
        groups[category] = items;
      }
    });

    setCachedSearchResult(cacheKey, groups);
    return groups;
  });
}

export function flattenResults(groupedResults = {}) {
  const result = [];

  Object.values(groupedResults || {}).forEach((items) => {
    safeArray(items).forEach((item) => result.push(item));
  });

  return result;
}

export function sortByScore(items = []) {
  return sortByScoreInternal(items);
}

export function limitResults(items = [], limit = SEARCH_LIMITS.PAGE_RESULTS) {
  return limitInternal(items, limit);
}

export function groupResults(items = []) {
  return groupItems(items);
}

export async function addSearchResultDirectlyToLibrary({ userId, item }) {
  if (!userId || !item) {
    throw new Error("Missing userId or item");
  }

  const normalizedItem = normalizeSearchItem(item);

  if (!normalizedItem) {
    throw new Error("Search item is not valid");
  }

  return addToUserLibrary({
    userId,
    entity: normalizedItem
  });
}
