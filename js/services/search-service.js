import { SEARCH_LIMITS, CATEGORY_LABELS } from "../config.js";

import {
  searchBooks,
  formatBookForUi
} from "./books-search.js";

import {
  searchMoviesAndSeries,
  formatMovieForUi
} from "./movies-search.js";

import {
  searchAnimeOrManga,
  formatAnimeMangaForUi
} from "./anime-search.js";

import {
  getSupabaseClient
} from "../lib/supabase-client.js";

import {
  normalizeString
} from "../utils.js";

import {
  saveEntityIfMissing,
  saveAliases
} from "./entity-db.js";

import {
  getSearchCache,
  saveSearchCache,
  getEntitiesByIds
} from "./search-cache.js";

/* =========================
   HELPERS
========================= */

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

function addCategoryLabels(items, category) {
  return items.map((item) => ({
    ...item,
    category,
    category_label: CATEGORY_LABELS[category] || category
  }));
}

function splitMovieAndSeries(items = []) {
  return {
    movies: items.filter((item) => item.category === "movies"),
    series: items.filter((item) => item.category === "series")
  };
}

function formatDbEntity(entity) {
  return {
    canonical_key: entity.canonical_key,
    category: entity.category,
    title: entity.title_primary || entity.title_ru || entity.title_en || "",
    original_title: entity.original_title || "",
    year: entity.year || null,
    cover_url: entity.cover_url || "",
    description_ru: entity.description_ru || "",
    description_en: entity.description_en || "",
    score: 50
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

function groupFlatResults(items = []) {
  const groups = emptyGroups();

  for (const item of items) {
    const category = item.category;
    if (!groups[category]) continue;

    groups[category].push({
      ...item,
      category_label: CATEGORY_LABELS[category] || category
    });
  }

  return groups;
}

function sortByScoreInternal(items = []) {
  return [...items].sort((a, b) => (b.score || 0) - (a.score || 0));
}

function limitInternal(items = [], limit = SEARCH_LIMITS.PAGE_RESULTS) {
  return items.slice(0, limit);
}

/* =========================
   DB SEARCH (ALIASES)
========================= */

async function searchInDatabase(query) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("entity_aliases")
    .select(`
      entity_id,
      media_entities (
        id,
        canonical_key,
        category,
        title_primary,
        title_ru,
        title_en,
        original_title,
        year,
        cover_url,
        description_ru,
        description_en
      )
    `)
    .ilike("alias_normalized", `%${query}%`)
    .limit(50);

  if (error) {
    console.warn("DB alias search error:", error);
    return [];
  }

  return dedupeByCanonicalKey(
    (data || [])
      .map((row) => row.media_entities)
      .filter(Boolean)
      .map(formatDbEntity)
  );
}

/* =========================
   DB SAVE
========================= */

async function persistResults(items = []) {
  const result = [];

  for (const item of items) {
    try {
      const saved = await saveEntityIfMissing(item);

      if (saved?.id && item.aliases?.length) {
        await saveAliases(saved.id, item.aliases, item.primary_source || "search");
      }

      result.push(saved);
    } catch (e) {
      console.warn("Persist error:", e);
    }
  }

  return result;
}

/* =========================
   CACHE
========================= */

async function searchFromCache(query) {
  const entityIds = await getSearchCache(query);

  if (!entityIds?.length) {
    return [];
  }

  const entities = await getEntitiesByIds(entityIds);

  if (!entities.length) {
    return [];
  }

  return dedupeByCanonicalKey(entities.map(formatDbEntity));
}

async function saveResultsToCache(query, entities = []) {
  const ids = entities
    .map((item) => item?.id)
    .filter(Boolean);

  if (!ids.length) return;

  await saveSearchCache(query, ids);
}

/* =========================
   API FALLBACK
========================= */

async function runApiSearch(cleanQuery) {
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
    console.warn("Global search API error:", error);
  }

  const movieSeriesSplit = splitMovieAndSeries(
    moviesAndSeries.map(formatMovieForUi)
  );

  const formattedBooks = books.map(formatBookForUi);
  const formattedMovies = movieSeriesSplit.movies;
  const formattedSeries = movieSeriesSplit.series;
  const formattedAnime = anime.map(formatAnimeMangaForUi);
  const formattedManga = manga.map(formatAnimeMangaForUi);

  return {
    flat: dedupeByCanonicalKey([
      ...formattedBooks,
      ...formattedMovies,
      ...formattedSeries,
      ...formattedAnime,
      ...formattedManga
    ]),
    grouped: {
      books: addCategoryLabels(formattedBooks, "books"),
      movies: addCategoryLabels(formattedMovies, "movies"),
      series: addCategoryLabels(formattedSeries, "series"),
      anime: addCategoryLabels(formattedAnime, "anime"),
      manga: addCategoryLabels(formattedManga, "manga")
    }
  };
}

/* =========================
   GLOBAL SEARCH
========================= */

export async function runGlobalSearch(query) {
  const clean = normalizeQuery(query);

  if (!clean || clean.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return emptyGroups();
  }

  /* 1. CACHE */
  try {
    const cacheResults = await searchFromCache(clean);

    if (cacheResults.length) {
      return groupFlatResults(
        limitInternal(sortByScoreInternal(cacheResults), SEARCH_LIMITS.PAGE_RESULTS)
      );
    }
  } catch (e) {
    console.warn("Cache search failed:", e);
  }

  /* 2. DB */
  try {
    const dbResults = await searchInDatabase(clean);

    if (dbResults.length) {
      const supabase = getSupabaseClient();

      const { data } = await supabase
        .from("media_entities")
        .select("id, canonical_key")
        .in(
          "canonical_key",
          dbResults.map((item) => item.canonical_key)
        );

      await saveResultsToCache(clean, data || []);

      return groupFlatResults(
        limitInternal(sortByScoreInternal(dbResults), SEARCH_LIMITS.PAGE_RESULTS)
      );
    }
  } catch (e) {
    console.warn("DB search failed:", e);
  }

  /* 3. API */
  const apiResult = await runApiSearch(clean);

  const savedEntities = await persistResults(apiResult.flat);
  await saveResultsToCache(clean, savedEntities);

  return apiResult.grouped;
}

/* =========================
   CATEGORY SEARCH
========================= */

export async function runCategorySearch(query, category) {
  const clean = normalizeQuery(query);

  if (!clean || clean.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  /* 1. CACHE */
  try {
    const cacheResults = await searchFromCache(clean);

    if (cacheResults.length) {
      return limitInternal(
        sortByScoreInternal(
          cacheResults.filter((item) => item.category === category)
        ),
        SEARCH_LIMITS.PAGE_RESULTS
      ).map((item) => ({
        ...item,
        category_label: CATEGORY_LABELS[category] || category
      }));
    }
  } catch (e) {
    console.warn("Category cache search failed:", e);
  }

  /* 2. DB */
  try {
    const dbResults = await searchInDatabase(clean);
    const filtered = dbResults.filter((item) => item.category === category);

    if (filtered.length) {
      const supabase = getSupabaseClient();

      const { data } = await supabase
        .from("media_entities")
        .select("id, canonical_key")
        .in(
          "canonical_key",
          filtered.map((item) => item.canonical_key)
        );

      await saveResultsToCache(clean, data || []);

      return limitInternal(sortByScoreInternal(filtered), SEARCH_LIMITS.PAGE_RESULTS).map((item) => ({
        ...item,
        category_label: CATEGORY_LABELS[category] || category
      }));
    }
  } catch (e) {
    console.warn("Category DB search failed:", e);
  }

  /* 3. API */
  if (category === "books") {
    const results = await searchBooks(clean);
    const formatted = results.map(formatBookForUi);
    const saved = await persistResults(formatted);
    await saveResultsToCache(clean, saved);
    return addCategoryLabels(formatted, "books");
  }

  if (category === "movies" || category === "series") {
    const results = await searchMoviesAndSeries(clean);
    const formatted = results.map(formatMovieForUi);
    const filtered = formatted.filter((item) => item.category === category);
    const saved = await persistResults(filtered);
    await saveResultsToCache(clean, saved);

    return addCategoryLabels(filtered, category);
  }

  if (category === "anime" || category === "manga") {
    const results = await searchAnimeOrManga(clean, category);
    const formatted = results.map(formatAnimeMangaForUi);
    const saved = await persistResults(formatted);
    await saveResultsToCache(clean, saved);

    return addCategoryLabels(formatted, category);
  }

  return [];
}

/* =========================
   FLATTEN
========================= */

export function flattenResults(grouped) {
  const result = [];

  Object.entries(grouped).forEach(([category, items]) => {
    items.forEach((item) => {
      result.push({
        ...item,
        category
      });
    });
  });

  return result;
}

/* =========================
   SORT / LIMIT
========================= */

export function sortByScore(items = []) {
  return sortByScoreInternal(items);
}

export function limitResults(items = [], limit = SEARCH_LIMITS.PAGE_RESULTS) {
  return limitInternal(items, limit);
}
