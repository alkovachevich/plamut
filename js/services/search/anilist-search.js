import { API_ENDPOINTS } from "../../config.js";
import { compactString, safeArray, uniqueArray } from "../../utils.js";

const ANILIST_LIMIT = 12;
const SEARCH_TIMEOUT_MS = 9000;

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

function normalizeMediaType(category = "") {
  return category === "manga" ? "MANGA" : "ANIME";
}

function normalizeCategory(category = "") {
  return category === "manga" ? "manga" : "anime";
}

function pickTitle(title = {}, language = "ru") {
  const romaji = String(title?.romaji || "").trim();
  const english = String(title?.english || "").trim();
  const native = String(title?.native || "").trim();

  if (language === "en") {
    return english || romaji || native;
  }

  return native || english || romaji;
}

function pickOriginalTitle(title = {}) {
  return (
    String(title?.romaji || "").trim() ||
    String(title?.english || "").trim() ||
    String(title?.native || "").trim()
  );
}

function getYearFromAniList(media = {}) {
  const year = Number(media?.startDate?.year);
  return Number.isFinite(year) ? year : null;
}

function mapAniListItem(media = {}, category = "anime", language = "ru") {
  const normalizedCategory = normalizeCategory(category);
  const id = media?.id ? String(media.id) : "";

  if (!id) return null;

  const title = pickTitle(media.title, language);
  const originalTitle = pickOriginalTitle(media.title);

  if (!title && !originalTitle) return null;

  const cover =
    String(media?.coverImage?.extraLarge || "").trim() ||
    String(media?.coverImage?.large || "").trim() ||
    String(media?.coverImage?.medium || "").trim();

  const description = String(media?.description || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const synonyms = safeArray(media?.synonyms)
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const titleValues = [
    media?.title?.romaji,
    media?.title?.english,
    media?.title?.native,
    ...synonyms
  ].map((value) => String(value || "").trim()).filter(Boolean);

  return {
    canonical_key: `${normalizedCategory}:anilist:${id}`,
    category: normalizedCategory,
    title: title || originalTitle,
    title_ru: "",
    title_en: String(media?.title?.english || media?.title?.romaji || "").trim(),
    original_title: originalTitle || title,
    year: getYearFromAniList(media),
    cover_url: cover,
    description_ru: "",
    description_en: description,
    aliases: uniqueArray(titleValues),
    external_ids: {
      anilist: id,
      mal: media?.idMal ? String(media.idMal) : null
    },
    primary_source: "anilist",
    score: Number(media?.popularity || 0),
    meta: {
      source: "anilist",
      format: media?.format || "",
      status: media?.status || "",
      episodes: media?.episodes || null,
      chapters: media?.chapters || null,
      volumes: media?.volumes || null,
      genres: safeArray(media?.genres),
      synonyms,
      average_score: media?.averageScore || null,
      popularity: media?.popularity || null,
      start_date: media?.startDate || null,
      end_date: media?.endDate || null,
      site_url: media?.siteUrl || ""
    }
  };
}

async function fetchAniList(query = "", category = "anime", language = "ru") {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return [];

  const mediaType = normalizeMediaType(category);

  const graphqlQuery = `
    query SearchMedia($search: String!, $type: MediaType!, $perPage: Int!) {
      Page(page: 1, perPage: $perPage) {
        media(search: $search, type: $type, sort: POPULARITY_DESC) {
          id
          idMal
          type
          format
          status
          episodes
          chapters
          volumes
          genres
          averageScore
          popularity
          siteUrl
          title {
            romaji
            english
            native
          }
          synonyms
          description(asHtml: false)
          startDate {
            year
            month
            day
          }
          endDate {
            year
            month
            day
          }
          coverImage {
            extraLarge
            large
            medium
          }
        }
      }
    }
  `;

  const response = await fetchWithTimeout(API_ENDPOINTS.ANILIST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      query: graphqlQuery,
      variables: {
        search: cleanQuery,
        type: mediaType,
        perPage: ANILIST_LIMIT
      }
    })
  });

  if (!response.ok) {
    throw new Error(`AniList failed: ${response.status}`);
  }

  const payload = await response.json();

  if (payload?.errors?.length) {
    throw new Error(`AniList GraphQL error: ${payload.errors[0]?.message || "unknown"}`);
  }

  return safeArray(payload?.data?.Page?.media)
    .map((media) => mapAniListItem(media, category, language))
    .filter(Boolean);
}

function mapJikanAnimeItem(item = {}, category = "anime", language = "ru") {
  const normalizedCategory = normalizeCategory(category);
  const malId = item?.mal_id ? String(item.mal_id) : "";

  if (!malId) return null;

  const title =
    String(item?.title || "").trim() ||
    String(item?.title_english || "").trim() ||
    String(item?.title_japanese || "").trim();

  if (!title) return null;

  const cover =
    String(item?.images?.jpg?.large_image_url || "").trim() ||
    String(item?.images?.jpg?.image_url || "").trim() ||
    String(item?.images?.webp?.large_image_url || "").trim() ||
    String(item?.images?.webp?.image_url || "").trim();

  const aliases = uniqueArray([
    item?.title,
    item?.title_english,
    item?.title_japanese,
    ...safeArray(item?.titles).map((row) => row?.title)
  ].map((value) => String(value || "").trim()).filter(Boolean));

  const year =
    Number(item?.year) ||
    Number(item?.aired?.prop?.from?.year) ||
    Number(item?.published?.prop?.from?.year) ||
    null;

  return {
    canonical_key: `${normalizedCategory}:mal:${malId}`,
    category: normalizedCategory,
    title,
    title_ru: "",
    title_en: String(item?.title_english || item?.title || "").trim(),
    original_title: String(item?.title_japanese || item?.title || "").trim(),
    year: Number.isFinite(year) ? year : null,
    cover_url: cover,
    description_ru: "",
    description_en: String(item?.synopsis || "").trim(),
    aliases,
    external_ids: {
      anilist: null,
      mal: malId
    },
    primary_source: "jikan",
    score: Number(item?.score || item?.popularity || 0),
    meta: {
      source: "jikan",
      type: item?.type || "",
      status: item?.status || "",
      episodes: item?.episodes || null,
      chapters: item?.chapters || null,
      volumes: item?.volumes || null,
      genres: safeArray(item?.genres).map((genre) => genre?.name).filter(Boolean),
      url: item?.url || ""
    }
  };
}

async function fetchJikan(query = "", category = "anime", language = "ru") {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return [];

  const normalizedCategory = normalizeCategory(category);
  const endpointType = normalizedCategory === "manga" ? "manga" : "anime";

  const url = new URL(`${API_ENDPOINTS.JIKAN}/${endpointType}`);
  url.searchParams.set("q", cleanQuery);
  url.searchParams.set("limit", String(ANILIST_LIMIT));
  url.searchParams.set("order_by", "popularity");
  url.searchParams.set("sort", "asc");

  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Jikan failed: ${response.status}`);
  }

  const payload = await response.json();

  return safeArray(payload?.data)
    .map((item) => mapJikanAnimeItem(item, normalizedCategory, language))
    .filter(Boolean);
}

function dedupeAniListResults(items = []) {
  const map = new Map();

  safeArray(items).forEach((item) => {
    if (!item?.canonical_key) return;

    const ids = item.external_ids || {};
    const key =
      ids.anilist
        ? `${item.category}:anilist:${ids.anilist}`
        : ids.mal
          ? `${item.category}:mal:${ids.mal}`
          : `${item.category}:title:${compactString(item.title || item.original_title || "")}`;

    if (!map.has(key)) {
      map.set(key, item);
      return;
    }

    const existing = map.get(key);

    map.set(key, {
      ...existing,
      ...item,
      title: existing.title || item.title,
      original_title: existing.original_title || item.original_title,
      cover_url: existing.cover_url || item.cover_url,
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
        ...(item.meta || {})
      },
      score: Math.max(existing.score || 0, item.score || 0)
    });
  });

  return Array.from(map.values());
}

export async function runAniListCategorySearch(query = "", category = "anime", options = {}) {
  const normalizedCategory = normalizeCategory(category);
  const language = options.language || "ru";

  try {
    const anilistResults = await fetchAniList(query, normalizedCategory, language);

    if (anilistResults.length) {
      return dedupeAniListResults(anilistResults);
    }
  } catch (error) {
    console.warn(`AniList ${normalizedCategory} search failed, trying Jikan fallback:`, error);
  }

  try {
    const jikanResults = await fetchJikan(query, normalizedCategory, language);
    return dedupeAniListResults(jikanResults);
  } catch (error) {
    console.warn(`Jikan ${normalizedCategory} fallback failed:`, error);
    return [];
  }
}

export async function runAnimeSearch(query = "", options = {}) {
  return runAniListCategorySearch(query, "anime", options);
}

export async function runMangaSearch(query = "", options = {}) {
  return runAniListCategorySearch(query, "manga", options);
}
