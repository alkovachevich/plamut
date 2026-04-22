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

/* =========================
   HELPERS
========================= */

function normalizeQuery(value = "") {
  return String(value).trim();
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
   GLOBAL SEARCH
========================= */

export async function runGlobalSearch(query) {
  const clean = normalizeQuery(query);
  const groups = emptyGroups();

  if (clean.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return groups;
  }

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
    console.warn("Global search error:", error);
  }

  const movieSeriesSplit = splitMovieAndSeries(
    moviesAndSeries.map(formatMovieForUi)
  );

  groups.books = addCategoryLabels(
    books.map(formatBookForUi),
    "books"
  );

  groups.movies = addCategoryLabels(
    movieSeriesSplit.movies,
    "movies"
  );

  groups.series = addCategoryLabels(
    movieSeriesSplit.series,
    "series"
  );

  groups.anime = addCategoryLabels(
    anime.map(formatAnimeMangaForUi),
    "anime"
  );

  groups.manga = addCategoryLabels(
    manga.map(formatAnimeMangaForUi),
    "manga"
  );

  return groups;
}

/* =========================
   CATEGORY SEARCH
========================= */

export async function runCategorySearch(query, category) {
  const clean = normalizeQuery(query);

  if (clean.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  if (category === "books") {
    const results = await searchBooks(clean);
    return addCategoryLabels(results.map(formatBookForUi), "books");
  }

  if (category === "movies" || category === "series") {
    const results = await searchMoviesAndSeries(clean);
    const formatted = results.map(formatMovieForUi);
    return addCategoryLabels(
      formatted.filter((item) => item.category === category),
      category
    );
  }

  if (category === "anime" || category === "manga") {
    const results = await searchAnimeOrManga(clean, category);
    return addCategoryLabels(
      results.map(formatAnimeMangaForUi),
      category
    );
  }

  return [];
}

/* =========================
   FLATTEN (для full search page)
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
