import { SEARCH_LIMITS, CATEGORY_LABELS } from "../config.js";
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

/* =========================
   GLOBAL SEARCH (ALL CATEGORIES)
========================= */

export async function runGlobalSearch(query) {
  const clean = normalizeQuery(query);
  const groups = emptyGroups();

  if (clean.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return groups;
  }

  /* ===== Anime + Manga (реально работает) ===== */

  let anime = [];
  let manga = [];

  try {
    [anime, manga] = await Promise.all([
      searchAnimeOrManga(clean, "anime"),
      searchAnimeOrManga(clean, "manga")
    ]);
  } catch (e) {
    console.warn("Anime/Manga search error:", e);
  }

  groups.anime = addCategoryLabels(
    anime.map(formatAnimeMangaForUi),
    "anime"
  );

  groups.manga = addCategoryLabels(
    manga.map(formatAnimeMangaForUi),
    "manga"
  );

  /* ===== Остальные категории (пока пустые, но структура есть) ===== */

  groups.books = [];
  groups.movies = [];
  groups.series = [];

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
   FLATTEN (для страниц)
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
   SORT HELPERS
========================= */

export function sortByScore(items = []) {
  return [...items].sort((a, b) => (b.score || 0) - (a.score || 0));
}

export function limitResults(items = [], limit = SEARCH_LIMITS.PAGE_RESULTS) {
  return items.slice(0, limit);
}
