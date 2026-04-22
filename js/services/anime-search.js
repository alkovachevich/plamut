import { API_ENDPOINTS, SEARCH_LIMITS } from "../config.js";
import {
  normalizeString,
  compactString,
  safeArray,
  uniqueArray
} from "../utils.js";

/* =========================
   ANILIST QUERY
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
        startDate { year }
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
   NORMALIZATION
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
    ...safeArray(item?.titles).map((t) => t.title),
    ...safeArray(item?.title_synonyms)
  ]);
}

/* =========================
   FORMATTERS
========================= */

function mapAniList(item, type) {
  const category = type === "MANGA" ? "manga" : "anime";

  return {
    canonical_key: `${category}:anilist:${item.id}`,
    category,
    primary_source: "anilist",

    title_primary:
      item?.title?.romaji ||
      item?.title?.english ||
      item?.title?.native ||
      "",

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

    aliases: buildAliasesFromAniList(item),

    external_ids: {
      anilist: item.id
    }
  };
}

function mapJikan(item, category) {
  return {
    canonical_key: `${category}:mal:${item.mal_id}`,
    category,
    primary_source: "mal",

    title_primary: item?.title || "",
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

    aliases: buildAliasesFromJikan(item),

    external_ids: {
      mal: item.mal_id
    }
  };
}

/* =========================
   SCORING
========================= */

function scoreResult(query, entity) {
  const q = compactString(query);
  const aliases = entity.aliases.map(compactString);

  let score = 0;

  if (aliases.includes(q)) score += 100;

  for (const alias of aliases) {
    if (alias.startsWith(q)) score += 40;
    if (alias.includes(q)) score += 20;
  }

  if (entity.primary_source === "anilist") score += 10;
  if (entity.cover_url) score += 5;

  return score;
}

/* =========================
   MERGE
========================= */

function mergeResults(list) {
  const map = new Map();

  for (const item of list) {
    const key =
      item.category +
      ":" +
      compactString(item.title_primary) +
      ":" +
      (item.year || "0");

    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }

    const existing = map.get(key);

    map.set(key, {
      ...existing,
      ...item,
      aliases: uniqueArray([
        ...existing.aliases,
        ...item.aliases
      ])
    });
  }

  return [...map.values()];
}

/* =========================
   FETCHERS
========================= */

async function fetchAniList(query, type) {
  const res = await fetch(API_ENDPOINTS.ANILIST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: ANILIST_QUERY,
      variables: {
        search: query,
        type,
        perPage: 12
      }
    })
  });

  if (!res.ok) throw new Error("AniList error");

  const json = await res.json();
  const list = json?.data?.Page?.media || [];

  return list.map((item) => mapAniList(item, type));
}

async function fetchJikan(query, category) {
  const endpoint = category === "manga" ? "manga" : "anime";

  const url = new URL(`${API_ENDPOINTS.JIKAN}/${endpoint}`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");

  const res = await fetch(url.toString());

  if (!res.ok) throw new Error("Jikan error");

  const json = await res.json();
  const list = json?.data || [];

  return list.map((item) => mapJikan(item, category));
}

/* =========================
   MAIN SEARCH
========================= */

export async function searchAnimeOrManga(query, category = "anime") {
  const clean = normalizeString(query);

  if (!clean || clean.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  const type = category === "manga" ? "MANGA" : "ANIME";

  let ani = [];
  let jikan = [];

  try {
    ani = await fetchAniList(clean, type);
  } catch (e) {
    console.warn("AniList fail", e);
  }

  if (ani.length < 5) {
    try {
      jikan = await fetchJikan(clean, category);
    } catch (e) {
      console.warn("Jikan fail", e);
    }
  }

  const merged = mergeResults([...ani, ...jikan]);

  return merged
    .map((item) => ({
      ...item,
      score: scoreResult(clean, item)
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
    title: entity.title_primary,
    original_title: entity.original_title,
    year: entity.year,
    cover_url: entity.cover_url,
    aliases: entity.aliases
  };
}
