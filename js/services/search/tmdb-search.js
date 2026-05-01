import { TMDB_API_KEY } from "../../config.js";
import { compactString, safeArray, uniqueArray } from "../../utils.js";

const TMDB_LIMIT = 12;
const SEARCH_TIMEOUT_MS = 9000;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

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

function clean(value = "") {
  return String(value || "").trim();
}

function normalizeCategory(category = "") {
  return category === "series" ? "series" : "movies";
}

function getTmdbType(category = "") {
  return normalizeCategory(category) === "series" ? "tv" : "movie";
}

function getYearFromDate(value = "") {
  const raw = clean(value);
  if (!raw) return null;

  const year = Number(raw.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function buildTmdbCover(path = "") {
  const value = clean(path);
  return value ? `${TMDB_IMAGE_BASE_URL}${value}` : "";
}

function pickTitle(item = {}, category = "movies", language = "ru") {
  const normalizedCategory = normalizeCategory(category);

  const localizedTitle = normalizedCategory === "series"
    ? clean(item?.name)
    : clean(item?.title);

  const originalTitle = normalizedCategory === "series"
    ? clean(item?.original_name)
    : clean(item?.original_title);

  if (language === "en") {
    return originalTitle || localizedTitle;
  }

  return localizedTitle || originalTitle;
}

function pickOriginalTitle(item = {}, category = "movies") {
  const normalizedCategory = normalizeCategory(category);

  return normalizedCategory === "series"
    ? clean(item?.original_name || item?.name)
    : clean(item?.original_title || item?.title);
}

function getReleaseYear(item = {}, category = "movies") {
  const normalizedCategory = normalizeCategory(category);

  return normalizedCategory === "series"
    ? getYearFromDate(item?.first_air_date)
    : getYearFromDate(item?.release_date);
}

function getLocalizedDescription(item = {}, language = "ru") {
  const overview = clean(item?.overview);
  return language === "en"
    ? { description_ru: "", description_en: overview }
    : { description_ru: overview, description_en: "" };
}

function mapTmdbItem(item = {}, category = "movies", language = "ru") {
  const normalizedCategory = normalizeCategory(category);
  const tmdbType = getTmdbType(normalizedCategory);
  const id = item?.id ? String(item.id) : "";

  if (!id) return null;

  const title = pickTitle(item, normalizedCategory, language);
  const originalTitle = pickOriginalTitle(item, normalizedCategory);

  if (!title && !originalTitle) return null;

  const aliases = uniqueArray([
    item?.title,
    item?.name,
    item?.original_title,
    item?.original_name
  ].map(clean).filter(Boolean));

  const descriptions = getLocalizedDescription(item, language);

  return {
    canonical_key: `${normalizedCategory}:tmdb:${tmdbType}:${id}`,
    category: normalizedCategory,

    title: title || originalTitle,
    title_primary: title || originalTitle,
    title_ru: language === "ru" ? title : "",
    title_en: language === "en" ? title : "",
    original_title: originalTitle || title,

    year: getReleaseYear(item, normalizedCategory),
    cover_url: buildTmdbCover(item?.poster_path),

    description_ru: descriptions.description_ru,
    description_en: descriptions.description_en,

    aliases,

    external_ids: {
      tmdb: id,
      imdb: null,
      wikidata: null
    },

    primary_source: "tmdb",
    score: Number(item?.popularity || item?.vote_average || 0),

    meta: {
      source: "tmdb",
      tmdb_type: tmdbType,
      adult: Boolean(item?.adult),
      original_language: item?.original_language || "",
      vote_average: item?.vote_average || null,
      vote_count: item?.vote_count || null,
      popularity: item?.popularity || null,
      backdrop_path: item?.backdrop_path || "",
      genre_ids: safeArray(item?.genre_ids),
      metadata_status:
        item?.poster_path && item?.overview
          ? "partial"
          : "needs_enrichment"
    }
  };
}

async function fetchTmdbSearch(query = "", category = "movies", language = "ru") {
  const cleanQuery = clean(query);
  if (!cleanQuery || !TMDB_API_KEY) return [];

  const normalizedCategory = normalizeCategory(category);
  const tmdbType = getTmdbType(normalizedCategory);

  const url = new URL(`${TMDB_BASE_URL}/search/${tmdbType}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("query", cleanQuery);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("page", "1");
  url.searchParams.set("language", language === "en" ? "en-US" : "ru-RU");

  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`TMDB ${normalizedCategory} failed: ${response.status}`);
  }

  const payload = await response.json();

  return safeArray(payload?.results)
    .slice(0, TMDB_LIMIT)
    .map((item) => mapTmdbItem(item, normalizedCategory, language))
    .filter(Boolean);
}

async function fetchTmdbDetailsById(item = {}, language = "ru") {
  const tmdbId = clean(item?.external_ids?.tmdb);
  const tmdbType = item?.meta?.tmdb_type || getTmdbType(item.category);

  if (!tmdbId || !TMDB_API_KEY) return item;

  const url = new URL(`${TMDB_BASE_URL}/${tmdbType}/${tmdbId}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", language === "en" ? "en-US" : "ru-RU");
  url.searchParams.set("append_to_response", "external_ids");

  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) return item;

  const payload = await response.json();

  const mapped = mapTmdbItem(payload, item.category, language);
  if (!mapped) return item;

  return mergeTmdbResults([item], [{
    ...mapped,
    external_ids: {
      ...mapped.external_ids,
      imdb: clean(payload?.external_ids?.imdb_id)
    },
    meta: {
      ...mapped.meta,
      details_loaded: true,
      homepage: clean(payload.homepage),
      status: clean(payload.status),
      runtime: payload.runtime || null,
      number_of_seasons: payload.number_of_seasons || null,
      number_of_episodes: payload.number_of_episodes || null
    }
  }])[0] || item;
}

async function enrichTmdbResultsWithDetails(items = [], language = "ru") {
  const base = safeArray(items).slice(0, TMDB_LIMIT);

  const results = await Promise.allSettled(
    base.map((item) => fetchTmdbDetailsById(item, language))
  );

  return results.map((result, index) =>
    result.status === "fulfilled" ? result.value : base[index]
  );
}

async function fetchTmdbSearchFallbackLanguage(query = "", category = "movies", language = "ru") {
  const primary = await fetchTmdbSearch(query, category, language);

  let merged = primary;

  if (language !== "en") {
    try {
      const fallback = await fetchTmdbSearch(query, category, "en");
      merged = mergeTmdbResults(primary, fallback);
    } catch (error) {
      console.warn(`TMDB ${category} fallback language failed:`, error);
    }
  }

  const detailsRu = language === "en"
    ? []
    : await enrichTmdbResultsWithDetails(merged, "ru").catch(() => []);

  const detailsEn = await enrichTmdbResultsWithDetails(merged, "en").catch(() => []);

  return mergeTmdbResults(
    mergeTmdbResults(merged, detailsRu),
    detailsEn
  );
}

function mergeTmdbResults(primaryItems = [], fallbackItems = []) {
  const map = new Map();

  [...safeArray(primaryItems), ...safeArray(fallbackItems)].forEach((item) => {
    if (!item?.canonical_key) return;

    const key = item.external_ids?.tmdb
      ? `${item.category}:tmdb:${item.external_ids.tmdb}`
      : `${item.category}:title:${compactString(item.title || item.original_title || "")}`;

    if (!map.has(key)) {
      map.set(key, item);
      return;
    }

    const existing = map.get(key);

    map.set(key, {
      ...existing,
      ...item,

      canonical_key: existing.canonical_key || item.canonical_key,
      category: existing.category || item.category,

      title: existing.title || item.title,
      title_primary: existing.title_primary || item.title_primary || item.title,
      title_ru: existing.title_ru || item.title_ru,
      title_en: existing.title_en || item.title_en,
      original_title: existing.original_title || item.original_title,

      year: existing.year || item.year || null,
      cover_url: existing.cover_url || item.cover_url,

      description_ru: existing.description_ru || item.description_ru,
      description_en: existing.description_en || item.description_en,

      aliases: uniqueArray([
        ...safeArray(existing.aliases),
        ...safeArray(item.aliases)
      ]),

      external_ids: {
        ...(existing.external_ids || {}),
        ...(item.external_ids || {})
      },

      meta: {
        ...(existing.meta || {}),
        ...(item.meta || {}),
        metadata_status:
          (existing.cover_url || item.cover_url) &&
          (existing.description_ru || item.description_ru || existing.description_en || item.description_en)
            ? "partial"
            : "needs_enrichment"
      },

      score: Math.max(existing.score || 0, item.score || 0)
    });
  });

  return Array.from(map.values());
}

export async function runTmdbCategorySearch(query = "", category = "movies", options = {}) {
  const normalizedCategory = normalizeCategory(category);
  const language = options.language || "ru";

  try {
    return await fetchTmdbSearchFallbackLanguage(query, normalizedCategory, language);
  } catch (error) {
    console.warn(`TMDB ${normalizedCategory} search failed:`, error);
    return [];
  }
}

export async function runMovieSearch(query = "", options = {}) {
  return runTmdbCategorySearch(query, "movies", options);
}

export async function runSeriesSearch(query = "", options = {}) {
  return runTmdbCategorySearch(query, "series", options);
}
