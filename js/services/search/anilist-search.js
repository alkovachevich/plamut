import { API_ENDPOINTS } from "../../config.js";
import { compactString, safeArray, uniqueArray } from "../../utils.js";
import { fetchBestWikipediaSummary } from "./wikipedia-source.js";
import { fetchBestWikidataPatch, wikidataPatchLooksUseful } from "./wikidata-source.js";

const ANILIST_LIMIT = 12;
const SEARCH_TIMEOUT_MS = 9000;
const LOCALIZED_ENRICH_LIMIT = 4;

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

function clean(value = "") {
  return String(value || "").trim();
}

function normalizeMediaType(category = "") {
  return category === "manga" ? "MANGA" : "ANIME";
}

function normalizeCategory(category = "") {
  return category === "manga" ? "manga" : "anime";
}

function stripHtml(value = "") {
  return clean(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickTitle(title = {}, language = "ru") {
  const romaji = clean(title?.romaji);
  const english = clean(title?.english);
  const native = clean(title?.native);

  if (language === "en") {
    return english || romaji || native;
  }

  return native || english || romaji;
}

function pickOriginalTitle(title = {}) {
  return (
    clean(title?.romaji) ||
    clean(title?.english) ||
    clean(title?.native)
  );
}

function getYearFromAniList(media = {}) {
  const year = Number(media?.startDate?.year);
  return Number.isFinite(year) ? year : null;
}

function getYearFromJikan(item = {}) {
  const year =
    Number(item?.year) ||
    Number(item?.aired?.prop?.from?.year) ||
    Number(item?.published?.prop?.from?.year) ||
    null;

  return Number.isFinite(year) ? year : null;
}

function metadataStatusForItem(item = {}) {
  return item.cover_url && (item.description_ru || item.description_en)
    ? "partial"
    : "needs_enrichment";
}

function titleCandidates(item = {}) {
  return uniqueArray([
    item.title,
    item.title_primary,
    item.title_ru,
    item.title_en,
    item.original_title,
    ...safeArray(item.aliases)
  ].map(clean).filter(Boolean));
}

function mergeLocalizedPatch(item = {}, patch = {}) {
  if (!patch || typeof patch !== "object") return item;

  const ids = item.external_ids || {};
  const incomingWikidataId = clean(patch.wikidata_id || patch.external_ids?.wikidata || "");

  const next = {
    ...item,
    title_ru: item.title_ru || clean(patch.title_ru),
    title_en: item.title_en || clean(patch.title_en),
    original_title: item.original_title || clean(patch.original_title),
    year: item.year || patch.year || null,
    cover_url: item.cover_url || clean(patch.cover_url),
    description_ru: item.description_ru || clean(patch.description_ru || patch.extract_ru),
    description_en: item.description_en || clean(patch.description_en || patch.extract_en),
    aliases: uniqueArray([
      ...safeArray(item.aliases),
      ...safeArray(patch.aliases),
      patch.title_ru,
      patch.title_en,
      patch.original_title
    ].map(clean).filter(Boolean)),
    external_ids: {
      ...ids,
      ...(incomingWikidataId
        ? { wikidata: incomingWikidataId, wikidata_id: incomingWikidataId }
        : {})
    },
    meta: {
      ...(item.meta || {}),
      ...(patch.meta || {}),
      localized_enrichment: true,
      metadata_status: "needs_enrichment"
    }
  };

  next.meta.metadata_status = metadataStatusForItem(next);
  return next;
}

function mapWikipediaSummaryToPatch(summary = {}, language = "ru") {
  if (!summary) return null;

  return {
    title_ru: language === "ru" ? clean(summary.title) : "",
    title_en: language === "en" ? clean(summary.title) : "",
    description_ru: language === "ru" ? clean(summary.extract) : "",
    description_en: language === "en" ? clean(summary.extract) : "",
    cover_url: clean(summary.image),
    aliases: [summary.title].filter(Boolean),
    meta: {
      [`wikipedia_${language}_loaded`]: true,
      [`wikipedia_${language}_title`]: clean(summary.title),
      [`wikipedia_${language}_source`]: clean(summary.source)
    }
  };
}

async function enrichAnimeMangaResults(items = [], language = "ru") {
  const base = safeArray(items);
  const head = base.slice(0, LOCALIZED_ENRICH_LIMIT);
  const tail = base.slice(LOCALIZED_ENRICH_LIMIT);

  const enrichedHead = [];

  for (const item of head) {
    let current = item;
    const candidates = titleCandidates(item);

    const wikidataPatch = await fetchBestWikidataPatch(candidates, language).catch(() => null);
    if (wikidataPatchLooksUseful(wikidataPatch)) {
      current = mergeLocalizedPatch(current, wikidataPatch);
    }

    if (!current.description_ru) {
      const wikiRu = await fetchBestWikipediaSummary(titleCandidates(current), "ru").catch(() => null);
      current = mergeLocalizedPatch(current, mapWikipediaSummaryToPatch(wikiRu, "ru"));
    }

    if (!current.description_en) {
      const wikiEn = await fetchBestWikipediaSummary(titleCandidates(current), "en").catch(() => null);
      current = mergeLocalizedPatch(current, mapWikipediaSummaryToPatch(wikiEn, "en"));
    }

    enrichedHead.push(current);
  }

  return [...enrichedHead, ...tail];
}

function mapAniListItem(media = {}, category = "anime", language = "ru") {
  const normalizedCategory = normalizeCategory(category);
  const id = media?.id ? String(media.id) : "";

  if (!id) return null;

  const title = pickTitle(media.title, language);
  const originalTitle = pickOriginalTitle(media.title);

  if (!title && !originalTitle) return null;

  const cover =
    clean(media?.coverImage?.extraLarge) ||
    clean(media?.coverImage?.large) ||
    clean(media?.coverImage?.medium);

  const description = stripHtml(media?.description);

  const synonyms = safeArray(media?.synonyms)
    .map(clean)
    .filter(Boolean);

  const titleValues = [
    media?.title?.romaji,
    media?.title?.english,
    media?.title?.native,
    ...synonyms
  ].map(clean).filter(Boolean);

  return {
    canonical_key: `${normalizedCategory}:anilist:${id}`,
    category: normalizedCategory,

    title: title || originalTitle,
    title_primary: title || originalTitle,
    title_ru: "",
    title_en: clean(media?.title?.english || media?.title?.romaji),
    original_title: originalTitle || title,

    year: getYearFromAniList(media),
    cover_url: cover,

    description_ru: "",
    description_en: description,

    aliases: uniqueArray(titleValues),

    external_ids: {
      anilist: id,
      anilist_id: id,
      mal: media?.idMal ? String(media.idMal) : null,
      mal_id: media?.idMal ? String(media.idMal) : null
    },

    primary_source: "anilist",
    score: Number(media?.popularity || media?.averageScore || 0),

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
      site_url: media?.siteUrl || "",
      metadata_status:
        cover && description
          ? "partial"
          : "needs_enrichment"
    }
  };
}

async function fetchAniList(query = "", category = "anime", language = "ru") {
  const cleanQuery = clean(query);
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

function mapJikanItem(item = {}, category = "anime") {
  const normalizedCategory = normalizeCategory(category);
  const malId = item?.mal_id ? String(item.mal_id) : "";

  if (!malId) return null;

  const title =
    clean(item?.title) ||
    clean(item?.title_english) ||
    clean(item?.title_japanese);

  if (!title) return null;

  const cover =
    clean(item?.images?.jpg?.large_image_url) ||
    clean(item?.images?.jpg?.image_url) ||
    clean(item?.images?.webp?.large_image_url) ||
    clean(item?.images?.webp?.image_url);

  const aliases = uniqueArray([
    item?.title,
    item?.title_english,
    item?.title_japanese,
    ...safeArray(item?.titles).map((row) => row?.title)
  ].map(clean).filter(Boolean));

  const synopsis = clean(item?.synopsis);

  return {
    canonical_key: `${normalizedCategory}:mal:${malId}`,
    category: normalizedCategory,

    title,
    title_primary: title,
    title_ru: "",
    title_en: clean(item?.title_english || item?.title),
    original_title: clean(item?.title_japanese || item?.title),

    year: getYearFromJikan(item),
    cover_url: cover,

    description_ru: "",
    description_en: synopsis,

    aliases,

    external_ids: {
      anilist: null,
      mal: malId,
      mal_id: malId
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
      url: item?.url || "",
      metadata_status:
        cover && synopsis
          ? "partial"
          : "needs_enrichment"
    }
  };
}

async function fetchJikanFallback(query = "", category = "anime") {
  const cleanQuery = clean(query);
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
    .map((item) => mapJikanItem(item, normalizedCategory))
    .filter(Boolean);
}

function mergeItems(existing = {}, incoming = {}) {
  return {
    ...existing,
    ...incoming,

    canonical_key: existing.canonical_key || incoming.canonical_key,
    category: existing.category || incoming.category,

    title: existing.title || incoming.title,
    title_primary: existing.title_primary || incoming.title_primary || incoming.title,
    title_ru: existing.title_ru || incoming.title_ru,
    title_en: existing.title_en || incoming.title_en,
    original_title: existing.original_title || incoming.original_title,

    year: existing.year || incoming.year || null,
    cover_url: existing.cover_url || incoming.cover_url,

    description_ru: existing.description_ru || incoming.description_ru,
    description_en: existing.description_en || incoming.description_en,

    aliases: uniqueArray([
      ...safeArray(existing.aliases),
      ...safeArray(incoming.aliases)
    ]),

    external_ids: {
      ...(existing.external_ids || {}),
      ...(incoming.external_ids || {})
    },

    meta: {
      ...(existing.meta || {}),
      ...(incoming.meta || {}),
      metadata_status:
        (existing.cover_url || incoming.cover_url) &&
        (existing.description_en || incoming.description_en || existing.description_ru || incoming.description_ru)
          ? "partial"
          : "needs_enrichment"
    },

    primary_source: existing.primary_source || incoming.primary_source,
    score: Math.max(existing.score || 0, incoming.score || 0)
  };
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

    map.set(key, mergeItems(map.get(key), item));
  });

  return Array.from(map.values());
}

export async function runAniListCategorySearch(query = "", category = "anime", options = {}) {
  const normalizedCategory = normalizeCategory(category);
  const language = options.language || "ru";

  try {
    const anilistResults = await fetchAniList(query, normalizedCategory, language);

    if (anilistResults.length) {
      const deduped = dedupeAniListResults(anilistResults);
      return enrichAnimeMangaResults(deduped, language).catch(() => deduped);
    }

    console.warn(`AniList ${normalizedCategory} returned empty results, trying Jikan fallback.`);
  } catch (error) {
    console.warn(`AniList ${normalizedCategory} search failed, trying Jikan fallback:`, error);
  }

  try {
    const jikanResults = await fetchJikanFallback(query, normalizedCategory);
    const deduped = dedupeAniListResults(jikanResults);
    return enrichAnimeMangaResults(deduped, language).catch(() => deduped);
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
