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

const SEARCH_CACHE_TTL_MS = 1000 * 60 * 3;
const searchCache = new Map();

const VALID_CATEGORIES = ["books", "movies", "series", "anime", "manga"];

function getSearchCacheKey(scope = "global", query = "", category = "") {
  return `${scope}:${String(query || "").trim().toLowerCase()}:${category}`;
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

function normalizeCategory(category = "") {
  const normalized = String(category || "").trim().toLowerCase();
  return VALID_CATEGORIES.includes(normalized) ? normalized : "";
}

function normalizeYear(value) {
  if (value === null || value === undefined || value === "") return null;

  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function normalizeSearchItem(item = {}) {
  const category = normalizeCategory(item.category);

  if (!category) return null;

  const canonicalKey = String(item.canonical_key || "").trim();
  const title = String(
    item.title ||
    item.title_primary ||
    item.title_ru ||
    item.title_en ||
    item.original_title ||
    ""
  ).trim();

  if (!canonicalKey || !title) return null;

  return {
    canonical_key: canonicalKey,
    category,
    title,
    title_ru: String(item.title_ru || "").trim(),
    title_en: String(item.title_en || "").trim(),
    original_title: String(item.original_title || title).trim(),
    year: normalizeYear(item.year),
    cover_url: String(item.cover_url || "").trim(),
    description_ru: String(item.description_ru || "").trim(),
    description_en: String(item.description_en || "").trim(),
    aliases: safeArray(item.aliases).map(String).filter(Boolean),
    external_ids: item.external_ids && typeof item.external_ids === "object"
      ? item.external_ids
      : {},
    primary_source: String(item.primary_source || "").trim(),
    score: Number.isFinite(Number(item.score)) ? Number(item.score) : 0,
    meta: item.meta && typeof item.meta === "object" ? item.meta : {}
  };
}

function normalizeSearchItems(items = []) {
  return safeArray(items)
    .map((item) => normalizeSearchItem(item))
    .filter(Boolean);
}

function mergeSearchItems(existing = {}, incoming = {}) {
  return {
    ...existing,
    ...incoming,
    canonical_key: existing.canonical_key || incoming.canonical_key,
    category: existing.category || incoming.category,
    title: existing.title || incoming.title,
    title_ru: existing.title_ru || incoming.title_ru,
    title_en: existing.title_en || incoming.title_en,
    original_title: existing.original_title || incoming.original_title,
    year: existing.year || incoming.year || null,
    cover_url: existing.cover_url || incoming.cover_url,
    description_ru: existing.description_ru || incoming.description_ru,
    description_en: existing.description_en || incoming.description_en,
    aliases: Array.from(new Set([
      ...safeArray(existing.aliases),
      ...safeArray(incoming.aliases)
    ])),
    external_ids: {
      ...(existing.external_ids || {}),
      ...(incoming.external_ids || {})
    },
    meta: {
      ...(existing.meta || {}),
      ...(incoming.meta || {})
    },
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

export async function runCategorySearch(query = "", category = "") {
  const cleanQuery = String(query || "").trim();
  const normalizedCategory = normalizeCategory(category);

  if (!cleanQuery || !normalizedCategory) return [];

  const cacheKey = getSearchCacheKey("category", cleanQuery, normalizedCategory);
  const cached = getCachedSearchResult(cacheKey);

  if (cached) {
    return cached;
  }

  const language = getSystemLanguage();

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
}

export async function runGlobalSearch(query = "") {
  const cleanQuery = String(query || "").trim();

  if (!cleanQuery) {
    return emptyGroups();
  }

  const cacheKey = getSearchCacheKey("global", cleanQuery, "");
  const cached = getCachedSearchResult(cacheKey);

  if (cached) {
    return cached;
  }

  const language = getSystemLanguage();

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

  return addToUserLibrary({
    userId,
    entity: item
  });
}
