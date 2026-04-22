import { API_ENDPOINTS } from "../config.js";


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
          extraLarge
          large
          medium
        }
        synonyms
      }
    }
  }
`;


function normalizeString(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function compactNormalized(value = "") {
  return normalizeString(value).replace(/\s+/g, "");
}


function safeArray(value) {
  return Array.isArray(value) ? value : [];
}


function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}


function scoreCandidate(query, candidate) {
  const normalizedQuery = compactNormalized(query);
  const aliases = candidate.aliases || [];
  const normalizedAliases = aliases.map(compactNormalized);


  let score = 0;


  if (normalizedAliases.includes(normalizedQuery)) score += 100;


  for (const alias of normalizedAliases) {
    if (alias.startsWith(normalizedQuery) && normalizedQuery.length >= 2) {
      score += 40;
      break;
    }
  }


  for (const alias of normalizedAliases) {
    if (alias.includes(normalizedQuery) && normalizedQuery.length >= 2) {
      score += 20;
      break;
    }
  }


  if (candidate.primary_source === "anilist") score += 15;
  if (candidate.cover_url) score += 5;
  if (candidate.year) score += 3;


  return score;
}


function toUnifiedAnimeEntityFromAniList(item, requestedType) {
  const category = requestedType === "MANGA" ? "manga" : "anime";
  const aliases = uniqueStrings([
    item?.title?.romaji,
    item?.title?.english,
    item?.title?.native,
    ...safeArray(item?.synonyms)
  ]);


  return {
    canonical_key: `${category}:anilist:${item.id}`,
    category,
    primary_source: "anilist",
    title_primary: item?.title?.romaji || item?.title?.english || item?.title?.native || "",
    title_en: item?.title?.english || "",
    title_ru: "",
    original_title: item?.title?.native || item?.title?.romaji || "",
    year: item?.seasonYear || item?.startDate?.year || null,
    cover_url: item?.coverImage?.large || item?.coverImage?.medium || "",
    external_ids: {
      anilist: item.id
    },
    aliases,
    meta: {
      format: item?.format || null,
      episodes: item?.episodes || null,
      chapters: item?.chapters || null,
      volumes: item?.volumes || null
    }
  };
}


function toUnifiedAnimeEntityFromJikan(item, requestedCategory) {
  const category = requestedCategory === "manga" ? "manga" : "anime";
  const titleEn =
    item?.title_english ||
    safeArray(item?.titles).find((entry) => entry.type === "English")?.title ||
    "";


  const titleNative =
    safeArray(item?.titles).find((entry) =>
      ["Japanese", "Default"].includes(entry.type)
    )?.title || item?.title || "";


  const aliases = uniqueStrings([
    item?.title,
    item?.title_english,
    item?.title_japanese,
    ...safeArray(item?.titles).map((entry) => entry.title),
    ...safeArray(item?.title_synonyms)
  ]);


  return {
    canonical_key: `${category}:mal:${item.mal_id}`,
    category,
    primary_source: "mal",
    title_primary: item?.title || titleEn || titleNative || "",
    title_en: titleEn,
    title_ru: "",
    original_title: item?.title_japanese || titleNative || "",
    year: item?.year || item?.aired?.prop?.from?.year || item?.published?.prop?.from?.year || null,
    cover_url: item?.images?.jpg?.large_image_url || item?.images?.jpg?.image_url || "",
    external_ids: {
      mal: item.mal_id
    },
    aliases,
    meta: {
      episodes: item?.episodes || null,
      chapters: item?.chapters || null,
      volumes: item?.volumes || null,
      status: item?.status || null
    }
  };
}


function mergeByAliasAndYear(items) {
  const map = new Map();


  for (const item of items) {
    const aliasKey = compactNormalized(item.title_primary || item.original_title || "");
    const yearKey = item.year || "unknown";
    const key = `${item.category}:${aliasKey}:${yearKey}`;


    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }


    const existing = map.get(key);


    const merged = {
      ...existing,
      ...item,
      primary_source: existing.primary_source === "anilist" ? existing.primary_source : item.primary_source,
      canonical_key: existing.primary_source === "anilist" ? existing.canonical_key : item.canonical_key,
      title_en: existing.title_en || item.title_en,
      title_ru: existing.title_ru || item.title_ru,
      original_title: existing.original_title || item.original_title,
      cover_url: existing.cover_url || item.cover_url,
      aliases: uniqueStrings([...(existing.aliases || []), ...(item.aliases || [])]),
      external_ids: {
        ...(existing.external_ids || {}),
        ...(item.external_ids || {})
      },
      meta: {
        ...(existing.meta || {}),
        ...(item.meta || {})
      }
    };


    map.set(key, merged);
  }


  return [...map.values()];
}


async function fetchAniList(query, type, limit = 10) {
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
        type,
        perPage: limit
      }
    })
  });


  if (!response.ok) {
    throw new Error(`AniList search failed: ${response.status}`);
  }


  const payload = await response.json();
  const items = payload?.data?.Page?.media || [];
  return items.map((item) => toUnifiedAnimeEntityFromAniList(item, type));
}


async function fetchJikan(query, category, limit = 10) {
  const endpoint = category === "manga" ? "manga" : "anime";
  const url = new URL(`${API_ENDPOINTS.JIKAN}/${endpoint}`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));


  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });


  if (!response.ok) {
    throw new Error(`Jikan search failed: ${response.status}`);
  }


  const payload = await response.json();
  const items = payload?.data || [];
  return items.map((item) => toUnifiedAnimeEntityFromJikan(item, category));
}


function rankResults(query, items) {
  return items
    .map((item) => ({
      ...item,
      search_score: scoreCandidate(query, item)
    }))
    .sort((a, b) => b.search_score - a.search_score);
}


export async function searchAnimeOrManga(query, category = "anime", limit = 15) {
  const cleanQuery = normalizeString(query);


  if (!cleanQuery || cleanQuery.length < 2) {
    return [];
  }


  const normalizedCategory = category === "manga" ? "manga" : "anime";
  const aniListType = normalizedCategory === "manga" ? "MANGA" : "ANIME";


  let aniListResults = [];
  let jikanResults = [];


  try {
    aniListResults = await fetchAniList(cleanQuery, aniListType, Math.min(limit, 12));
  } catch (error) {
    console.warn("AniList search error:", error);
  }


  const shouldUseFallback =
    aniListResults.length < Math.min(5, limit);


  if (shouldUseFallback) {
    try {
      jikanResults = await fetchJikan(cleanQuery, normalizedCategory, Math.min(limit, 10));
    } catch (error) {
      console.warn("Jikan search error:", error);
    }
  }


  const merged = mergeByAliasAndYear([...aniListResults, ...jikanResults]);
  return rankResults(cleanQuery, merged).slice(0, limit);
}


export function formatAnimeMangaForUi(entity) {
  return {
    canonical_key: entity.canonical_key,
    category: entity.category,
    category_label: entity.category === "manga" ? "Manga" : "Anime",
    title: entity.title_primary || entity.original_title || "",
    original_title: entity.original_title || "",
    year: entity.year || null,
    cover_url: entity.cover_url || "",
    primary_source: entity.primary_source,
    external_ids: entity.external_ids || {},
    aliases: entity.aliases || [],
    search_score: entity.search_score || 0
  };
}
