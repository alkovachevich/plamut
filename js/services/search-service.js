import { SEARCH_LIMITS } from "../config.js";
import { safeArray } from "../utils.js";
import {
  addToUserLibrary,
  getEntityCompleteness
} from "./entity-db.js";
import {
  getSupabaseClient,
  withTimeout
} from "../lib/supabase-client.js";
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
const DB_SEARCH_TIMEOUT_MS = 6500;

const MEDIA_ENTITIES_TABLE = "media_entities";
const ENTITY_ALIASES_TABLE = "entity_aliases";

const searchCache = new Map();
const pendingSearches = new Map();

const VALID_CATEGORIES = ["books", "movies", "series", "anime", "manga"];

const LOCAL_DB_SCORE_BOOST = 1200;
const ALIAS_DB_SCORE_BOOST = 1150;
const API_SCORE_BOOST = 0;

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

function normalizeTitleKey(value = "") {
  return cleanLower(value)
    .replace(/ё/g, "е")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9а-яе]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePersonKey(value = "") {
  return normalizeTitleKey(value).replace(/\s+/g, "");
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

    wikidata: cleanText(ids.wikidata || ids.wikidata_id || item.wikidata_id || meta.wikidata_id || ""),
    wikidata_id: cleanText(ids.wikidata_id || ids.wikidata || item.wikidata_id || meta.wikidata_id || ""),

    tmdb: cleanText(ids.tmdb || ids.tmdb_id || item.tmdb_id || meta.tmdb_id || ""),
    tmdb_id: cleanText(ids.tmdb_id || ids.tmdb || item.tmdb_id || meta.tmdb_id || ""),

    imdb: cleanText(ids.imdb || ids.imdb_id || item.imdb_id || meta.imdb_id || ""),
    imdb_id: cleanText(ids.imdb_id || ids.imdb || item.imdb_id || meta.imdb_id || ""),

    anilist: cleanText(ids.anilist || ids.anilist_id || item.anilist_id || meta.anilist_id || ""),
    anilist_id: cleanText(ids.anilist_id || ids.anilist || item.anilist_id || meta.anilist_id || ""),

    mal: cleanText(ids.mal || ids.mal_id || item.mal_id || meta.mal_id || ""),
    mal_id: cleanText(ids.mal_id || ids.mal || item.mal_id || meta.mal_id || ""),

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

function getBookAuthors(item = {}) {
  const meta = normalizeJson(item.meta, {});

  return Array.from(
    new Set(
      [
        ...safeArray(meta.author_names),
        ...safeArray(meta.authors),
        ...safeArray(item.author_names),
        ...safeArray(item.authors)
      ]
        .map(cleanText)
        .filter(Boolean)
    )
  );
}

function getBookSeries(item = {}) {
  const meta = normalizeJson(item.meta, {});
  return cleanText(meta.series_name || meta.series || item.series_name || item.series || "");
}

function resolveDisplayTitle(item = {}, language = "ru") {
  if (language === "en") {
    return cleanText(
      item.title_en ||
      item.title ||
      item.title_primary ||
      item.title_ru ||
      item.original_title ||
      ""
    );
  }

  return cleanText(
    item.title_ru ||
    item.title ||
    item.title_primary ||
    item.title_en ||
    item.original_title ||
    ""
  );
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

  const title = normalizeTitleKey(
    item.title ||
    item.title_primary ||
    item.title_ru ||
    item.title_en ||
    item.original_title ||
    "untitled"
  ).replace(/\s+/g, "-");

  const year = normalizeYear(item.year);

  if (category === "books") {
    const author = normalizePersonKey(getBookAuthors(item)[0] || "");
    return [
      "books",
      "work",
      title || "untitled",
      author,
      year || ""
    ]
      .filter(Boolean)
      .join(":")
      .toLowerCase();
  }

  return [
    category || "unknown",
    cleanLower(item.primary_source || item.source || "manual"),
    title || "untitled",
    year || ""
  ]
    .filter(Boolean)
    .join(":")
    .toLowerCase();
}

function normalizeSearchItem(item = {}, options = {}) {
  const language = options.language === "en" ? "en" : "ru";
  const category = normalizeCategory(item.category);

  if (!category) return null;

  const displayTitle = resolveDisplayTitle(item, language);

  const fallbackTitle = cleanText(
    item.title ||
    item.title_primary ||
    item.title_ru ||
    item.title_en ||
    item.original_title ||
    ""
  );

  const title = displayTitle || fallbackTitle;

  if (!title) return null;

  const canonicalKey = buildCanonicalKey({
    ...item,
    title
  });

  if (!canonicalKey) return null;

  const meta = normalizeJson(item.meta, {});
  const externalIds = extractExternalIds(item);
  const descriptions = extractDescriptionFields(item);
  const source = cleanText(item.primary_source || item.source || meta.source || "");

  const normalized = {
    canonical_key: canonicalKey,
    category,

    title,
    display_title: title,
    title_primary: cleanText(item.title_primary || title),
    title_ru: cleanText(item.title_ru),
    title_en: cleanText(item.title_en),
    original_title: cleanText(item.original_title || item.title_en || item.title_primary || title),

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
    primary_source: source || "search",
    score: Number.isFinite(Number(item.score)) ? Number(item.score) : 0,

    meta: {
      ...meta,
      search_source: source || "search",
      search_preview: true,
      metadata_status:
        isUsefulCover(item.cover_url || meta.cover_url) &&
        (descriptions.description_ru || descriptions.description_en)
          ? "partial"
          : "needs_enrichment"
    }
  };

  if (category === "books") {
    const authors = getBookAuthors(item);
    const seriesName = getBookSeries(item);

    normalized.title_primary =
      normalized.title_ru ||
      normalized.title_primary ||
      normalized.title_en ||
      normalized.original_title ||
      normalized.title;

    normalized.meta = {
      ...normalized.meta,
      author_names: authors,
      series_name: seriesName
    };
  }

  return normalized;
}

function normalizeSearchItems(items = [], options = {}) {
  return safeArray(items)
    .map((item) => normalizeSearchItem(item, options))
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
    display_title: pickStableText(existing.display_title, incoming.display_title),
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

function getBookDedupeKeys(item = {}) {
  if (item.category !== "books") return [];

  const ids = normalizeJson(item.external_ids, {});
  const titles = [
    item.title,
    item.title_primary,
    item.title_ru,
    item.title_en,
    item.original_title,
    ...safeArray(item.aliases)
  ]
    .map(normalizeTitleKey)
    .filter(Boolean);

  const authors = getBookAuthors(item)
    .map(normalizePersonKey)
    .filter(Boolean);

  const year = normalizeYear(item.year);
  const keys = [];

  if (ids.wikidata) keys.push(`book:wikidata:${cleanLower(ids.wikidata)}`);
  if (ids.wikidata_id) keys.push(`book:wikidata:${cleanLower(ids.wikidata_id)}`);
  if (ids.openlibrary_work) keys.push(`book:openlibrary:${cleanLower(ids.openlibrary_work)}`);

  titles.forEach((title) => {
    authors.forEach((author) => {
      keys.push(`book:title-author:${title}:${author}`);
      if (year) keys.push(`book:title-author-year:${title}:${author}:${year}`);
    });

    if (year) keys.push(`book:title-year:${title}:${year}`);
  });

  return Array.from(new Set(keys));
}

function getGeneralDedupeKeys(item = {}) {
  const ids = normalizeJson(item.external_ids, {});
  const keys = [];

  if (item.canonical_key) keys.push(`canonical:${cleanLower(item.canonical_key)}`);
  if (item.category && ids.wikidata) keys.push(`${item.category}:wikidata:${cleanLower(ids.wikidata)}`);
  if (item.category && ids.wikidata_id) keys.push(`${item.category}:wikidata:${cleanLower(ids.wikidata_id)}`);
  if (item.category && ids.tmdb) keys.push(`${item.category}:tmdb:${cleanLower(ids.tmdb)}`);
  if (item.category && ids.tmdb_id) keys.push(`${item.category}:tmdb:${cleanLower(ids.tmdb_id)}`);
  if (item.category && ids.imdb) keys.push(`${item.category}:imdb:${cleanLower(ids.imdb)}`);
  if (item.category && ids.imdb_id) keys.push(`${item.category}:imdb:${cleanLower(ids.imdb_id)}`);
  if (item.category && ids.anilist) keys.push(`${item.category}:anilist:${cleanLower(ids.anilist)}`);
  if (item.category && ids.anilist_id) keys.push(`${item.category}:anilist:${cleanLower(ids.anilist_id)}`);
  if (item.category && ids.mal) keys.push(`${item.category}:mal:${cleanLower(ids.mal)}`);
  if (item.category && ids.mal_id) keys.push(`${item.category}:mal:${cleanLower(ids.mal_id)}`);

  return keys;
}

function getDedupeKeys(item = {}) {
  return Array.from(new Set([
    ...getGeneralDedupeKeys(item),
    ...getBookDedupeKeys(item)
  ].filter(Boolean)));
}

function dedupeByIdentity(items = [], options = {}) {
  const normalized = normalizeSearchItems(items, options);
  const byKey = new Map();
  const result = [];

  normalized.forEach((item) => {
    const keys = getDedupeKeys(item);

    const existingKey = keys.find((key) => byKey.has(key));

    if (!existingKey) {
      result.push(item);
      keys.forEach((key) => byKey.set(key, item));
      return;
    }

    const existing = byKey.get(existingKey);
    const merged = mergeSearchItems(existing, item);

    const index = result.indexOf(existing);
    if (index >= 0) {
      result[index] = merged;
    }

    getDedupeKeys(merged).forEach((key) => byKey.set(key, merged));
  });

  return result;
}

function sortByScoreInternal(items = []) {
  return [...safeArray(items)].sort((a, b) => (b.score || 0) - (a.score || 0));
}

function limitInternal(items = [], limit = SEARCH_LIMITS.PAGE_RESULTS) {
  return safeArray(items).slice(0, limit);
}

function groupItems(items = [], options = {}) {
  const groups = emptyGroups();

  normalizeSearchItems(items, options).forEach((item) => {
    if (groups[item.category]) {
      groups[item.category].push(item);
    }
  });

  return groups;
}

function sanitizeIlikeTerm(query = "") {
  return cleanText(query)
    .replace(/[%_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function boostItems(items = [], boost = 0, source = "") {
  return safeArray(items).map((item) => ({
    ...item,
    primary_source: item.primary_source || source,
    score: Number(item.score || 0) + boost,
    meta: {
      ...normalizeJson(item.meta, {}),
      search_source: item.primary_source || source || normalizeJson(item.meta, {}).search_source || "",
      local_db_match: source === "supabase" || source === "alias"
    }
  }));
}

function mapMediaEntityRowToSearchItem(row = {}, language = "ru", source = "supabase") {
  const ids = normalizeJson(row.external_ids, {});
  const meta = normalizeJson(row.meta, {});

  const item = {
    canonical_key: row.canonical_key,
    category: row.category,
    primary_source: row.primary_source || source,

    title: resolveDisplayTitle(row, language),
    title_primary: row.title_primary || "",
    title_ru: row.title_ru || "",
    title_en: row.title_en || "",
    original_title: row.original_title || "",

    year: row.year || null,
    cover_url: row.cover_url || "",

    description_ru: row.description_ru || "",
    description_en: row.description_en || "",

    external_ids: ids,
    aliases: safeArray(row.aliases),
    score: source === "alias" ? ALIAS_DB_SCORE_BOOST : LOCAL_DB_SCORE_BOOST,

    meta: {
      ...meta,
      source,
      search_source: source,
      search_preview: false,
      local_db_match: true
    }
  };

  return normalizeSearchItem(item, { language });
}

async function searchMediaEntitiesByTitle(query = "", category = "", language = "ru") {
  const cleanQuery = sanitizeIlikeTerm(query);
  const normalizedCategory = normalizeCategory(category);

  if (!cleanQuery || !normalizedCategory) return [];

  try {
    const supabase = getSupabaseClient();
    const pattern = `%${cleanQuery}%`;

    const { data, error } = await withTimeout(
      supabase
        .from(MEDIA_ENTITIES_TABLE)
        .select(`
          id,
          canonical_key,
          category,
          primary_source,
          title_primary,
          title_ru,
          title_en,
          original_title,
          year,
          cover_url,
          description_ru,
          description_en,
          external_ids,
          meta,
          universe_key,
          relations_status,
          manual_locked,
          manual_verified
        `)
        .eq("category", normalizedCategory)
        .or(
          [
            `title_primary.ilike.${pattern}`,
            `title_ru.ilike.${pattern}`,
            `title_en.ilike.${pattern}`,
            `original_title.ilike.${pattern}`
          ].join(",")
        )
        .limit(24),
      "Поиск карточек в БД",
      DB_SEARCH_TIMEOUT_MS
    );

    if (error) {
      console.warn("Local title search skipped:", error);
      return [];
    }

    return safeArray(data)
      .map((row) => mapMediaEntityRowToSearchItem(row, language, "supabase"))
      .filter(Boolean);
  } catch (error) {
    console.warn("Local title search failed:", error);
    return [];
  }
}

async function searchMediaEntitiesByAliases(query = "", category = "", language = "ru") {
  const cleanQuery = sanitizeIlikeTerm(query);
  const normalizedCategory = normalizeCategory(category);

  if (!cleanQuery || !normalizedCategory) return [];

  try {
    const supabase = getSupabaseClient();
    const pattern = `%${cleanQuery}%`;

    const { data: aliasRows, error: aliasError } = await withTimeout(
      supabase
        .from(ENTITY_ALIASES_TABLE)
        .select("entity_id, alias, alias_normalized, source")
        .ilike("alias_normalized", pattern)
        .limit(40),
      "Поиск алиасов",
      DB_SEARCH_TIMEOUT_MS
    );

    if (aliasError) {
      console.warn("Alias search skipped:", aliasError);
      return [];
    }

    const entityIds = Array.from(
      new Set(
        safeArray(aliasRows)
          .map((row) => Number(row.entity_id || 0))
          .filter(Boolean)
      )
    );

    if (!entityIds.length) return [];

    const { data: entityRows, error: entityError } = await withTimeout(
      supabase
        .from(MEDIA_ENTITIES_TABLE)
        .select(`
          id,
          canonical_key,
          category,
          primary_source,
          title_primary,
          title_ru,
          title_en,
          original_title,
          year,
          cover_url,
          description_ru,
          description_en,
          external_ids,
          meta,
          universe_key,
          relations_status,
          manual_locked,
          manual_verified
        `)
        .eq("category", normalizedCategory)
        .in("id", entityIds)
        .limit(40),
      "Загрузка карточек по алиасам",
      DB_SEARCH_TIMEOUT_MS
    );

    if (entityError) {
      console.warn("Alias entity load skipped:", entityError);
      return [];
    }

    return safeArray(entityRows)
      .map((row) => mapMediaEntityRowToSearchItem(row, language, "alias"))
      .filter(Boolean);
  } catch (error) {
    console.warn("Alias search failed:", error);
    return [];
  }
}

async function runLocalSearchForCategory(query = "", category = "", options = {}) {
  const language = options.language === "en" ? "en" : "ru";

  const [titleResults, aliasResults] = await Promise.allSettled([
    searchMediaEntitiesByTitle(query, category, language),
    searchMediaEntitiesByAliases(query, category, language)
  ]);

  return [
    ...safeArray(titleResults.status === "fulfilled" ? titleResults.value : []),
    ...safeArray(aliasResults.status === "fulfilled" ? aliasResults.value : [])
  ];
}

async function runExternalSearchForCategory(query = "", category = "", options = {}) {
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

async function runSearchForCategory(query = "", category = "", options = {}) {
  const normalizedCategory = normalizeCategory(category);

  if (!normalizedCategory) return [];

  const language = options.language === "en" ? "en" : "ru";

  const localResults = await runLocalSearchForCategory(query, normalizedCategory, {
    ...options,
    language
  });

  const externalResults = await runExternalSearchForCategory(query, normalizedCategory, {
    ...options,
    language
  }).catch((error) => {
    console.warn(`External search failed (${normalizedCategory}):`, error);
    return [];
  });

  return [
    ...boostItems(localResults, LOCAL_DB_SCORE_BOOST, "supabase"),
    ...boostItems(externalResults, API_SCORE_BOOST, "api")
  ];
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
        sortByScoreInternal(dedupeByIdentity(items, { language })),
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
            sortByScoreInternal(dedupeByIdentity(items, { language })),
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
  return groupItems(items, { language: getSystemLanguage() });
}

export function getSearchResultSaveReadiness(item = {}) {
  const language = getSystemLanguage();
  const normalizedItem = normalizeSearchItem(item, { language });

  if (!normalizedItem) {
    return {
      ready: false,
      complete: false,
      item: null,
      missing: ["invalid_search_item"],
      reason: "Search item is not valid"
    };
  }

  const completeness = getEntityCompleteness(normalizedItem);

  return {
    ready: Boolean(completeness.complete),
    complete: Boolean(completeness.complete),
    item: completeness.entity || normalizedItem,
    missing: safeArray(completeness.missing),
    reason: completeness.complete
      ? ""
      : `Карточка неполная. Не хватает: ${safeArray(completeness.missing).join(", ")}`
  };
}

export async function addSearchResultDirectlyToLibrary({ userId, item }) {
  if (!userId || !item) {
    throw new Error("Missing userId or item");
  }

  const readiness = getSearchResultSaveReadiness(item);

  if (!readiness.item) {
    throw new Error("Search item is not valid");
  }

  if (!readiness.ready) {
    const error = new Error(readiness.reason || "Карточка пока не готова к сохранению");
    error.code = "INCOMPLETE_SEARCH_RESULT";
    error.missing = readiness.missing;
    error.item = readiness.item;
    error.readiness = readiness;
    throw error;
  }

  return addToUserLibrary({
    userId,
    entity: readiness.item
  });
}
