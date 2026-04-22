import { TMDB_API_KEY, SEARCH_LIMITS } from "../config.js";
import {
  normalizeString,
  compactString,
  uniqueArray,
  safeArray
} from "../utils.js";

/* =========================
   TMDB FETCH
========================= */

async function fetchTMDBMulti(query) {
  const url = new URL("https://api.themoviedb.org/3/search/multi");

  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("query", query);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "ru-RU");
  url.searchParams.set("page", "1");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`TMDB search failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.results || [];
}

/* =========================
   HELPERS
========================= */

function buildTMDBCover(path) {
  if (!path) return "";
  return `https://image.tmdb.org/t/p/w500${path}`;
}

function extractYear(item) {
  const date =
    item?.release_date ||
    item?.first_air_date ||
    "";

  if (!date) return null;

  const year = date.split("-")[0];
  return Number(year) || null;
}

function buildAliases(item) {
  return uniqueArray([
    item?.title,
    item?.name,
    item?.original_title,
    item?.original_name
  ]);
}

function mapTMDBItem(item) {
  const isMovie = item.media_type === "movie";
  const isTV = item.media_type === "tv";

  if (!isMovie && !isTV) return null;

  const category = isMovie ? "movies" : "series";

  return {
    canonical_key: `${category}:tmdb:${item.id}`,
    category,
    primary_source: "tmdb",

    title_primary:
      item?.title ||
      item?.name ||
      "",

    title_ru:
      item?.title ||
      item?.name ||
      "",

    title_en:
      item?.original_title ||
      item?.original_name ||
      "",

    original_title:
      item?.original_title ||
      item?.original_name ||
      "",

    year: extractYear(item),

    cover_url: buildTMDBCover(
      item?.poster_path ||
      item?.backdrop_path
    ),

    description_ru: item?.overview || "",
    description_en: "",

    aliases: buildAliases(item),

    external_ids: {
      tmdb: item.id
    }
  };
}

/* =========================
   SCORE
========================= */

function scoreMovie(query, item) {
  const q = compactString(query);
  const title = compactString(item.title_primary || "");
  const aliases = safeArray(item.aliases).map(compactString);

  let score = 0;

  if (title === q) score += 120;
  if (aliases.includes(q)) score += 100;

  if (title.startsWith(q)) score += 40;

  for (const alias of aliases) {
    if (alias.startsWith(q)) {
      score += 35;
      break;
    }
  }

  for (const alias of aliases) {
    if (alias.includes(q)) {
      score += 20;
      break;
    }
  }

  if (item.cover_url) score += 5;
  if (item.year) score += 4;
  if (item.description_ru) score += 2;

  return score;
}

/* =========================
   MERGE (на будущее под Wikidata)
========================= */

function mergeMovies(items) {
  const map = new Map();

  for (const item of items) {
    if (!item) continue;

    const key = [
      item.category,
      compactString(item.title_primary || item.original_title || ""),
      item.year || "0"
    ].join(":");

    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }

    const existing = map.get(key);

    const merged = {
      ...existing,
      ...item,
      cover_url: existing.cover_url || item.cover_url,
      description_ru: existing.description_ru || item.description_ru,
      aliases: uniqueArray([
        ...safeArray(existing.aliases),
        ...safeArray(item.aliases)
      ]),
      external_ids: {
        ...(existing.external_ids || {}),
        ...(item.external_ids || {})
      }
    };

    map.set(key, merged);
  }

  return [...map.values()];
}

/* =========================
   MAIN SEARCH
========================= */

export async function searchMoviesAndSeries(query) {
  const clean = normalizeString(query);

  if (!clean || clean.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  let tmdbItems = [];

  try {
    const raw = await fetchTMDBMulti(clean);

    tmdbItems = raw
      .map(mapTMDBItem)
      .filter(Boolean);
  } catch (error) {
    console.warn("TMDB search error:", error);
  }

  const merged = mergeMovies(tmdbItems);

  return merged
    .map((item) => ({
      ...item,
      score: scoreMovie(clean, item)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_LIMITS.MODAL_RESULTS);
}

/* =========================
   UI FORMAT
========================= */

export function formatMovieForUi(item) {
  return {
    canonical_key: item.canonical_key,
    category: item.category,
    title: item.title_primary || "",
    original_title: item.original_title || "",
    year: item.year || null,
    cover_url: item.cover_url || "",
    aliases: safeArray(item.aliases),
    description_ru: item.description_ru || "",
    external_ids: item.external_ids || {},
    score: item.score || 0
  };
}
