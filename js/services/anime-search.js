import { API_ENDPOINTS, SEARCH_LIMITS } from "../config.js";
import {
  normalizeString,
  compactString,
  safeArray,
  uniqueArray
} from "../utils.js";

/* =========================
   ANILIST GRAPHQL
========================= */

const ANILIST_QUERY = `
  query ($search: String, $type: MediaType, $perPage: Int) {
    Page(perPage: $perPage) {
      media(search: $search, type: $type, sort: SEARCH_MATCH) {
        id
        type
        format
        episodes
        chapters
        volumes
        seasonYear
        startDate {
          year
        }
        title {
          romaji
          english
          native
        }
        coverImage {
          large
          medium
        }
        synonyms
      }
    }
  }
`;

/* =========================
   HELPERS
========================= */

function buildAliasesFromAniList(item) {
  return uniqueArray([
    item?.title?.romaji,
    item?.title?.english,
    item?.title?.native,
    ...safeArray(item?.synonyms)
  ]);
}

function buildAliasesFromJikan(item) {
  return uniqueArray([
    item?.title,
    item?.title_english,
    item?.title_japanese,
    ...safeArray(item?.titles).map((t) => t?.title),
    ...safeArray(item?.title_synonyms)
  ]);
}

function scoreEntity(query, entity) {
  const q = compactString(query);
  const title = compactString(entity.title_primary || "");
  const aliases = safeArray(entity.aliases).map(compactString);

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

  if (entity.primary_source === "anilist") score += 15;
  if (entity.cover_url) score += 5;
  if (entity.year) score += 4;

  return score;
}

/* =========================
   MAPPERS
========================= */

function mapAniListItem(item, requestedType) {
  const category = requestedType === "MANGA" ? "manga" : "anime";

  return {
    canonical_key: `${category}:anilist:${item.id}`,
    category,
    primary_source: "anilist",

    title_primary:
      item?.title?.romaji ||
      item?.title?.english ||
      item?.title?.native ||
      "",

    title_ru: "",
    title_en: item?.title?.english || "",
    original_title:
      item?.title?.native ||
      item?.title?.romaji ||
      "",

    year:
      item?.seasonYear ||
      item?.startDate?.year ||
      null,

    cover_url:
      item?.coverImage?.large ||
      item?.coverImage?.medium ||
      "",

    description_ru: "",
    description_en: "",

    aliases: buildAliasesFromAniList(item),

    external_ids: {
      anilist: item.id
    },

    meta: {
      type: item?.type || null,
      format: item?.format || null,
      episodes: item?.episodes || null,
      chapters: item?.chapters || null,
      volumes: item?.volumes || null
    }
  };
}

function mapJikanItem(item, category) {
  return {
    canonical_key: `${category}:mal:${item.mal_id}`,
    category,
    primary_source: "mal",

    title_primary:
      item?.title ||
      item?.title_english ||
      item?.title_japanese ||
      "",

    title_ru: "",
    title_en: item?.title_english || "",
    original_title:
      item?.title_japanese ||
      item?.title ||
      "",

    year:
      item?.year ||
      item?.aired?.prop?.from?.year ||
      item?.published?.prop?.from?.year ||
      null,

    cover_url:
      item?.images?.jpg?.large_image_url ||
      item?.images?.jpg?.image_url ||
      "",

    description_ru: item?.synopsis || "",
    description_en: "",

    aliases: buildAliasesFromJikan(item),

    external_ids: {
      mal: item?.mal_id || null
    },

    meta: {
      episodes: item?.episodes || null,
      chapters: item?.chapters || null,
      volumes: item?.volumes || null,
      status: item?.status || null,
      type: item?.type || null
    }
  };
}

/* =========================
   FETCHERS
========================= */

async function fetchAniList(query, requestedType) {
  const response = await fetch(API_ENDPOINTS.ANILIST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      query: ANILIST_QUERY,
      variables: {
        search: query,
        type: requestedType,
        perPage: 12
      }
    })
  });

  if (!response.ok) {
    throw new Error(`AniList request failed: ${response.status}`);
  }

  const payload = await response.json();
  const list = payload?.data?.Page?.media || [];

  return list.map((item) => mapAniListItem(item, requestedType));
}

async function fetchJikan(query, category) {
  const endpoint = category === "manga" ? "manga" : "anime";
  const url = new URL(`${API_ENDPOINTS.JIKAN}/${endpoint}`);

  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Jikan request failed: ${response.status}`);
  }

  const payload = await response.json();
  const list = payload?.data || [];

  return list.map((item) => mapJikanItem(item, category));
}

/* =========================
   MERGE
========================= */

function mergeEntities(items) {
  const map = new Map();

  for (const item of items) {
    const mergeKey = [
      item.category,
      compactString(item.title_primary || item.original_title || ""),
      item.year || "0"
    ].join(":");

    if (!map.has(mergeKey)) {
      map.set(mergeKey, item);
      continue;
    }

    const existing = map.get(mergeKey);

    const merged = {
      ...existing,
      ...item,
      primary_source:
        existing.primary_source === "anilist"
          ? existing.primary_source
          : item.primary_source,

      canonical_key:
        existing.primary_source === "anilist"
          ? existing.canonical_key
          : item.canonical_key,

      title_en: existing.title_en || item.title_en,
      original_title: existing.original_title || item.original_title,
      cover_url: existing.cover_url || item.cover_url,
      description_ru: existing.description_ru || item.description_ru,

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
        ...(item.meta || {})
      }
    };

    map.set(mergeKey, merged);
  }

  return [...map.values()];
}

/* =========================
   MAIN SEARCH
========================= */

export async function searchAnimeOrManga(query, category = "anime") {
  const cleanQuery = normalizeString(query);

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  const normalizedCategory = category === "manga" ? "manga" : "anime";
  const aniListType = normalizedCategory === "manga" ? "MANGA" : "ANIME";

  let aniListResults = [];
  let jikanResults = [];

  try {
    aniListResults = await fetchAniList(cleanQuery, aniListType);
  } catch (error) {
    console.warn("AniList search error:", error);
  }

  if (aniListResults.length < 5) {
    try {
      jikanResults = await fetchJikan(cleanQuery, normalizedCategory);
    } catch (error) {
      console.warn("Jikan search error:", error);
    }
  }

  const merged = mergeEntities([...aniListResults, ...jikanResults]);

  return merged
    .map((item) => ({
      ...item,
      score: scoreEntity(cleanQuery, item)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_LIMITS.MODAL_RESULTS);
}

/* =========================
   UI FORMAT
========================= */

export function formatAnimeMangaForUi(entity) {
  return {
    canonical_key: entity.canonical_key,
    category: entity.category,
    title: entity.title_primary || "",
    original_title: entity.original_title || "",
    year: entity.year || null,
    cover_url: entity.cover_url || "",
    aliases: safeArray(entity.aliases),
    description_ru: entity.description_ru || "",
    external_ids: entity.external_ids || {},
    score: entity.score || 0
  };
}
