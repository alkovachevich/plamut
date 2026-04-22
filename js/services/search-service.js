import { SEARCH_LIMITS } from "../config.js";
import {
  formatAnimeMangaForUi,
  searchAnimeOrManga
} from "./anime-search.js";

function normalizeQuery(value = "") {
  return String(value).trim();
}

function buildGroupedResults() {
  return {
    books: [],
    movies: [],
    series: [],
    anime: [],
    manga: []
  };
}

export async function runGlobalSearch(query) {
  const cleanQuery = normalizeQuery(query);
  const grouped = buildGroupedResults();

  if (cleanQuery.length < 2) {
    return grouped;
  }

  const [animeResults, mangaResults] = await Promise.all([
    searchAnimeOrManga(cleanQuery, "anime", SEARCH_LIMITS.MODAL_RESULTS).catch(() => []),
    searchAnimeOrManga(cleanQuery, "manga", SEARCH_LIMITS.MODAL_RESULTS).catch(() => [])
  ]);

  grouped.anime = animeResults.map(formatAnimeMangaForUi);
  grouped.manga = mangaResults.map(formatAnimeMangaForUi);

  return grouped;
}

export async function runCategorySearch(query, category) {
  const cleanQuery = normalizeQuery(query);

  if (cleanQuery.length < 2) {
    return [];
  }

  if (category === "anime" || category === "manga") {
    const results = await searchAnimeOrManga(
      cleanQuery,
      category,
      SEARCH_LIMITS.CATEGORY_RESULTS
    );

    return results.map(formatAnimeMangaForUi);
  }

  return [];
}

export function flattenGroupedResults(groupedResults) {
  const output = [];
  for (const [category, items] of Object.entries(groupedResults)) {
    for (const item of items) {
      output.push({
        ...item,
        category
      });
    }
  }
  return output;
}
