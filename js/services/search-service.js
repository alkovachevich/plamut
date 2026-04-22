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
  normalizeString,
  safeArray
} from "../utils.js";

import {
  saveEntityIfMissing,
  saveAliases
} from "./entity-db.js";

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
    console.warn("DB search error:", error);
    return [];
  }

  return (data || [])
    .map((row) => row.media_entities)
    .filter(Boolean);
}

/* =========================
   DB SAVE
========================= */

async function persistResults(items = []) {
  const result = [];

  for (const item of items) {
    try {
      const saved = await saveEntityIfMissing(item);

      if (saved?.id && item.aliases) {
        await saveAliases(saved.id, item.aliases);
      }

      result.push(saved);
    } catch (e) {
      console.warn("Persist error:", e);
    }
  }

  return result;
}

/* =========================
   FORMAT DB → UI
========================= */

function formatDbEntity(entity) {
  return {
    canonical_key: entity.canonical_key,
    category: entity.category,
    title: entity.title_primary || "",
    original_title: entity.original_title || "",
    year: entity.year || null,
    cover_url: entity.cover_url || "",
    description_ru: entity.description_ru || "",
    description_en: entity.description_en || "",
    score: 50 // базовый score для DB
  };
}

/* =========================
   GLOBAL SEARCH (DB FIRST)
========================= */

export async function runGlobalSearch(query) {
  const clean = normalizeQuery(query);
  const groups = emptyGroups();

  if (!clean || clean.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return groups;
  }

  /* =========================
     1. TRY DB
  ========================= */

  let dbResults = [];

  try {
    dbResults = await searchInDatabase(clean);
  } catch (e) {
    console.warn("DB search failed:", e);
  }

  if (dbResults.length) {
    const formatted = dbResults.map(formatDbEntity);

    formatted.forEach((item) => {
      const category = item.category;
      if (!groups[category]) return;
      groups[category].push({
        ...item,
        category_label: CATEGORY_LABELS[category] || category
      });
    });

    return groups;
  }

  /* =========================
     2. FALLBACK API
  ========================= */

  let books = [];
  let moviesAndSeries = [];
  let anime = [];
  let manga = [];

  try {
    [books, moviesAndSeries, anime, manga] = await Promise.all([
      searchBooks(clean),
      searchMoviesAndSeries(clean),
      searchAnimeOrManga(clean, "anime"),
      searchAnimeOrManga(clean, "manga")
    ]);
  } catch (error) {
    console.warn("Global search API error:", error);
  }

  /* =========================
     FORMAT API
  ========================= */

  const movieSeriesSplit = splitMovieAndSeries(
    moviesAndSeries.map(formatMovieForUi)
  );

  const formattedBooks = books.map(formatBookForUi);
  const formattedMovies = movieSeriesSplit.movies;
  const formattedSeries = movieSeriesSplit.series;
  const formattedAnime = anime.map(formatAnimeMangaForUi);
  const formattedManga = manga.map(formatAnimeMangaForUi);

  /* =========================
     SAVE TO DB
  ========================= */

  await persistResults([
    ...formattedBooks,
    ...formattedMovies,
    ...formattedSeries,
    ...formattedAnime,
    ...formattedManga
  ]);

  /* =========================
     RETURN GROUPED
  ========================= */

  groups.books = addCategoryLabels(formattedBooks, "books");
  groups.movies = addCategoryLabels(formattedMovies, "movies");
  groups.series = addCategoryLabels(formattedSeries, "series");
  groups.anime = addCategoryLabels(formattedAnime, "anime");
  groups.manga = addCategoryLabels(formattedManga, "manga");

  return groups;
}

/* =========================
   CATEGORY SEARCH
========================= */

export async function runCategorySearch(query, category) {
  const clean = normalizeQuery(query);

  if (!clean || clean.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  /* 1. DB */

  const db = await searchInDatabase(clean);

  if (db.length) {
    return db
      .filter((item) => item.category === category)
      .map(formatDbEntity);
  }

  /* 2. API */

  if (category === "books") {
    const results = await searchBooks(clean);
    const formatted = results.map(formatBookForUi);
    await persistResults(formatted);
    return addCategoryLabels(formatted, "books");
  }

  if (category === "movies" || category === "series") {
    const results = await searchMoviesAndSeries(clean);
    const formatted = results.map(formatMovieForUi);
    await persistResults(formatted);

    return addCategoryLabels(
      formatted.filter((item) => item.category === category),
      category
    );
  }

  if (category === "anime" || category === "manga") {
    const results = await searchAnimeOrManga(clean, category);
    const formatted = results.map(formatAnimeMangaForUi);
    await persistResults(formatted);

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
  return [...items].sort((a, b) => (b.score || 0) - (a.score || 0));
}

export function limitResults(items = [], limit = SEARCH_LIMITS.PAGE_RESULTS) {
  return items.slice(0, limit);
}
