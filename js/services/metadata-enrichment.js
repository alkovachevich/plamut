import { TMDB_API_KEY, API_ENDPOINTS } from "../config.js";
import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";
import { safeArray, uniqueArray } from "../utils.js";

const MEDIA_ENTITIES_TABLE = "media_entities";

const READ_TIMEOUT_MS = 9000;
const WRITE_TIMEOUT_MS = 12000;
const SEARCH_TIMEOUT_MS = 9000;

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const OPEN_LIBRARY_BASE_URL = "https://openlibrary.org";
const OPEN_LIBRARY_COVER_BASE_URL = "https://covers.openlibrary.org/b/id";
const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
const WIKIPEDIA_RU_API_URL = "https://ru.wikipedia.org/w/api.php";
const WIKIPEDIA_EN_API_URL = "https://en.wikipedia.org/w/api.php";

const pendingEnrichmentByEntityId = new Map();
const pendingRepairKey = "repair";

function cleanText(value = "") {
  return String(value || "").trim();
}

function cleanLower(value = "") {
  return cleanText(value).toLowerCase();
}

function normalizeCategory(value = "") {
  const category = cleanLower(value);
  return ["books", "movies", "series", "anime", "manga"].includes(category)
    ? category
    : "";
}

function normalizeJson(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function normalizeYear(value) {
  if (value === null || value === undefined || value === "") return null;
  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function hasUsefulText(value = "", minLength = 40) {
  return cleanText(value).length >= minLength;
}

function hasUsefulCover(value = "") {
  const cover = cleanText(value);
  if (!cover) return false;
  if (cover === "undefined" || cover === "null") return false;
  if (cover.includes("/placeholder")) return false;
  return /^https?:\/\//i.test(cover) || cover.startsWith("/");
}

function getMissingFields(entity = {}) {
  const missing = [];

  if (!hasUsefulCover(entity.cover_url)) {
    missing.push("cover_url");
  }

  if (!hasUsefulText(entity.description_ru)) {
    missing.push("description_ru");
  }

  if (!hasUsefulText(entity.description_en)) {
    missing.push("description_en");
  }

  return missing;
}

function getMetadataStatus(entity = {}) {
  const missing = getMissingFields(entity);

  if (!missing.length) return "ready";
  if (missing.length >= 3) return "needs_enrichment";
  return "partial";
}

function buildQuality(entity = {}, sources = []) {
  const missing = getMissingFields(entity);

  return {
    has_cover: hasUsefulCover(entity.cover_url),
    has_description_ru: hasUsefulText(entity.description_ru),
    has_description_en: hasUsefulText(entity.description_en),
    missing_fields: missing,
    sources: uniqueArray(sources.map(cleanText).filter(Boolean)),
    updated_at: new Date().toISOString()
  };
}

function pickBetterText(current = "", incoming = "") {
  const left = cleanText(current);
  const right = cleanText(incoming);

  if (!left) return right;
  if (!right) return left;

  return right.length > left.length ? right : left;
}

function pickBetterCover(current = "", incoming = "") {
  const left = cleanText(current);
  const right = cleanText(incoming);

  if (!hasUsefulCover(left)) return right;
  if (!hasUsefulCover(right)) return left;

  return left;
}

function mergeExternalIds(current = {}, incoming = {}) {
  return {
    ...normalizeJson(current, {}),
    ...normalizeJson(incoming, {})
  };
}

function mergeMeta(current = {}, incoming = {}) {
  return {
    ...normalizeJson(current, {}),
    ...normalizeJson(incoming, {})
  };
}

function mergeEntityMetadata(entity = {}, patch = {}) {
  const externalIds = mergeExternalIds(entity.external_ids, patch.external_ids);
  const meta = mergeMeta(entity.meta, patch.meta);

  return {
    ...entity,

    title_primary: pickBetterText(entity.title_primary, patch.title_primary),
    title_ru: pickBetterText(entity.title_ru, patch.title_ru),
    title_en: pickBetterText(entity.title_en, patch.title_en),
    original_title: pickBetterText(entity.original_title, patch.original_title),

    year: normalizeYear(entity.year) || normalizeYear(patch.year),

    cover_url: pickBetterCover(entity.cover_url, patch.cover_url),

    description_ru: pickBetterText(entity.description_ru, patch.description_ru),
    description_en: pickBetterText(entity.description_en, patch.description_en),

    external_ids: externalIds,
    meta
  };
}

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

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

function getTitleCandidates(entity = {}) {
  return uniqueArray([
    entity.title_primary,
    entity.title_ru,
    entity.title_en,
    entity.original_title,
    entity.title
  ].map(cleanText).filter(Boolean));
}

function getBestTitle(entity = {}) {
  return (
    cleanText(entity.title_primary) ||
    cleanText(entity.title_ru) ||
    cleanText(entity.title_en) ||
    cleanText(entity.original_title) ||
    cleanText(entity.title) ||
    ""
  );
}

function getTmdbType(entity = {}) {
  const category = normalizeCategory(entity.category);
  const meta = normalizeJson(entity.meta, {});
  const canonicalKey = cleanLower(entity.canonical_key);

  if (meta.tmdb_type === "tv") return "tv";
  if (meta.tmdb_type === "movie") return "movie";
  if (category === "series") return "tv";
  if (canonicalKey.includes(":tv:")) return "tv";
  return "movie";
}

function buildTmdbCover(path = "") {
  const clean = cleanText(path);
  return clean ? `${TMDB_IMAGE_BASE_URL}${clean}` : "";
}

function getYearFromDate(value = "") {
  const raw = cleanText(value);
  if (!raw) return null;

  const year = Number(raw.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function getTmdbResultYear(item = {}, type = "movie") {
  return type === "tv"
    ? getYearFromDate(item.first_air_date)
    : getYearFromDate(item.release_date);
}

function normalizeCompareTitle(value = "") {
  return cleanLower(value)
    .replace(/ё/g, "е")
    .replace(/[^a-z0-9а-яе]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTmdbResultTitle(item = {}, type = "movie") {
  return type === "tv"
    ? cleanText(item.name || item.original_name)
    : cleanText(item.title || item.original_title);
}

function getTmdbResultOriginalTitle(item = {}, type = "movie") {
  return type === "tv"
    ? cleanText(item.original_name || item.name)
    : cleanText(item.original_title || item.title);
}

function scoreTmdbCandidate(item = {}, entity = {}, type = "movie") {
  const entityYear = normalizeYear(entity.year);
  const itemYear = getTmdbResultYear(item, type);
  const entityTitles = getTitleCandidates(entity).map(normalizeCompareTitle).filter(Boolean);
  const itemTitles = [
    getTmdbResultTitle(item, type),
    getTmdbResultOriginalTitle(item, type)
  ].map(normalizeCompareTitle).filter(Boolean);

  let score = 0;

  if (item.poster_path) score += 40;
  if (item.overview) score += 10;

  if (entityYear && itemYear) {
    if (entityYear === itemYear) score += 40;
    else if (Math.abs(entityYear - itemYear) <= 1) score += 20;
    else score -= 20;
  }

  if (entityTitles.length && itemTitles.length) {
    const exact = itemTitles.some((itemTitle) => entityTitles.includes(itemTitle));
    const partial = itemTitles.some((itemTitle) =>
      entityTitles.some((entityTitle) =>
        itemTitle.includes(entityTitle) || entityTitle.includes(itemTitle)
      )
    );

    if (exact) score += 35;
    else if (partial) score += 18;
  }

  score += Math.min(Number(item.popularity || 0), 100) / 10;

  return score;
}

function pickBestTmdbCandidate(results = [], entity = {}, type = "movie") {
  const candidates = safeArray(results)
    .filter((item) => item?.id)
    .slice(0, 8)
    .map((item) => ({
      item,
      score: scoreTmdbCandidate(item, entity, type)
    }))
    .sort((a, b) => b.score - a.score);

  const withPoster = candidates.find((candidate) => candidate.item.poster_path);
  return (withPoster || candidates[0])?.item || null;
}

async function fetchTmdbDetails(entity = {}, language = "ru") {
  const ids = normalizeJson(entity.external_ids, {});
  const tmdbId = cleanText(ids.tmdb);

  if (!tmdbId || !TMDB_API_KEY) return null;

  const type = getTmdbType(entity);
  const url = new URL(`${TMDB_BASE_URL}/${type}/${tmdbId}`);

  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", language === "en" ? "en-US" : "ru-RU");
  url.searchParams.set("append_to_response", "external_ids,images");

  const payload = await fetchJson(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  const title =
    type === "tv"
      ? cleanText(payload.name)
      : cleanText(payload.title);

  const originalTitle =
    type === "tv"
      ? cleanText(payload.original_name)
      : cleanText(payload.original_title);

  const year =
    type === "tv"
      ? getYearFromDate(payload.first_air_date)
      : getYearFromDate(payload.release_date);

  const fallbackPoster = safeArray(payload?.images?.posters)
    .find((poster) => poster?.file_path)?.file_path || "";

  return {
    title_primary: title || originalTitle,
    title_ru: language === "ru" ? title : "",
    title_en: language === "en" ? title : "",
    original_title: originalTitle || title,
    year,
    cover_url: buildTmdbCover(payload.poster_path || fallbackPoster),
    description_ru: language === "ru" ? cleanText(payload.overview) : "",
    description_en: language === "en" ? cleanText(payload.overview) : "",
    external_ids: {
      tmdb: tmdbId,
      imdb: cleanText(payload?.external_ids?.imdb_id) || ids.imdb || null
    },
    meta: {
      tmdb_type: type,
      tmdb_details_loaded: true,
      tmdb_vote_average: payload.vote_average || null,
      tmdb_vote_count: payload.vote_count || null,
      tmdb_popularity: payload.popularity || null,
      tmdb_homepage: payload.homepage || "",
      tmdb_status: payload.status || "",
      tmdb_original_language: payload.original_language || ""
    },
    __source: `tmdb_${language}`
  };
}

async function fetchTmdbBySingleSearch(entity = {}, query = "", language = "ru") {
  if (!TMDB_API_KEY) return null;

  const cleanQuery = cleanText(query);
  if (!cleanQuery) return null;

  const type = getTmdbType(entity);
  const url = new URL(`${TMDB_BASE_URL}/search/${type}`);

  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("query", cleanQuery);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("page", "1");
  url.searchParams.set("language", language === "en" ? "en-US" : "ru-RU");

  const payload = await fetchJson(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  const result = pickBestTmdbCandidate(payload.results, entity, type);
  if (!result?.id) return null;

  return fetchTmdbDetails(
    {
      ...entity,
      external_ids: {
        ...normalizeJson(entity.external_ids, {}),
        tmdb: String(result.id)
      }
    },
    language
  );
}

async function fetchTmdbBySearch(entity = {}, language = "ru") {
  if (!TMDB_API_KEY) return null;

  const queries = uniqueArray([
    entity.title_ru,
    entity.title_en,
    entity.original_title,
    entity.title_primary,
    entity.title
  ].map(cleanText).filter(Boolean));

  for (const query of queries) {
    try {
      const patch = await fetchTmdbBySingleSearch(entity, query, language);
      if (patch?.cover_url || patch?.description_ru || patch?.description_en) {
        return patch;
      }
    } catch (error) {
      console.warn(`TMDB search skipped for "${query}":`, error);
    }
  }

  return null;
}

function wikimediaFileUrl(filename = "") {
  const clean = cleanText(filename);
  if (!clean) return "";
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(clean)}`;
}

function getClaimValues(entity = {}, property = "") {
  return safeArray(entity?.claims?.[property])
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .filter(Boolean);
}

function getClaimValue(entity = {}, property = "") {
  return getClaimValues(entity, property)[0] || null;
}

function getEntityIdFromClaimValue(value) {
  if (!value || typeof value !== "object") return "";
  return value.id || (value["entity-type"] === "item" && value["numeric-id"] ? `Q${value["numeric-id"]}` : "");
}

function getClaimEntityIds(entity = {}, properties = []) {
  return uniqueArray(
    safeArray(properties)
      .flatMap((property) => getClaimValues(entity, property))
      .map(getEntityIdFromClaimValue)
      .filter(Boolean)
  );
}

function getYearFromWikidataTime(value) {
  const time = cleanText(value?.time);
  if (!time) return null;

  const match = time.match(/[+-]?(\d{4})/);
  if (!match) return null;

  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

async function fetchWikidataEntities(ids = []) {
  const cleanIds = uniqueArray(safeArray(ids).map(cleanText).filter(Boolean));
  if (!cleanIds.length) return [];

  const url = new URL(WIKIDATA_API_URL);

  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("props", "labels|aliases|descriptions|claims|sitelinks");
  url.searchParams.set("languages", "ru|en");
  url.searchParams.set("ids", cleanIds.join("|"));

  const payload = await fetchJson(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  return Object.values(payload?.entities || {}).filter((item) => item?.id && item.id !== "-1");
}

async function searchWikidataIds(query = "", language = "ru") {
  const cleanQuery = cleanText(query);
  if (!cleanQuery) return [];

  const url = new URL(WIKIDATA_API_URL);

  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("language", language);
  url.searchParams.set("uselang", language);
  url.searchParams.set("type", "item");
  url.searchParams.set("origin", "*");
  url.searchParams.set("limit", "8");
  url.searchParams.set("search", cleanQuery);

  const payload = await fetchJson(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  return safeArray(payload?.search)
    .map((item) => cleanText(item?.id))
    .filter(Boolean);
}

async function fetchWikidataPatch(entity = {}) {
  const ids = normalizeJson(entity.external_ids, {});
  let wikidataId = cleanText(ids.wikidata);

  if (!wikidataId) {
    const titles = getTitleCandidates(entity).slice(0, 2);
    const foundIds = [];

    for (const title of titles) {
      try {
        foundIds.push(...await searchWikidataIds(title, "ru"));
        foundIds.push(...await searchWikidataIds(title, "en"));
      } catch (error) {
        console.warn("Wikidata search skipped:", error);
      }
    }

    wikidataId = uniqueArray(foundIds)[0] || "";
  }

  if (!wikidataId) return null;

  const [wikidataEntity] = await fetchWikidataEntities([wikidataId]);
  if (!wikidataEntity) return null;

  const titleRu = cleanText(wikidataEntity?.labels?.ru?.value);
  const titleEn = cleanText(wikidataEntity?.labels?.en?.value);
  const descriptionRu = cleanText(wikidataEntity?.descriptions?.ru?.value);
  const descriptionEn = cleanText(wikidataEntity?.descriptions?.en?.value);
  const imageValue = getClaimValue(wikidataEntity, "P18");
  const publicationDate = getClaimValue(wikidataEntity, "P577");
  const inceptionDate = getClaimValue(wikidataEntity, "P571");

  const previousIds = getClaimEntityIds(wikidataEntity, ["P155"]);
  const nextIds = getClaimEntityIds(wikidataEntity, ["P156"]);
  const seriesIds = getClaimEntityIds(wikidataEntity, ["P179", "P361"]);
  const basedOnIds = getClaimEntityIds(wikidataEntity, ["P144"]);

  return {
    title_primary: titleRu || titleEn,
    title_ru: titleRu,
    title_en: titleEn,
    original_title: titleEn || titleRu,
    year: getYearFromWikidataTime(publicationDate) || getYearFromWikidataTime(inceptionDate),
    cover_url: wikimediaFileUrl(imageValue),
    description_ru: descriptionRu,
    description_en: descriptionEn,
    external_ids: {
      wikidata: wikidataId
    },
    meta: {
      wikidata_loaded: true,
      wikidata_id: wikidataId,
      wikidata_relations: {
        previous: previousIds,
        next: nextIds,
        series: seriesIds,
        based_on: basedOnIds
      }
    },
    __source: "wikidata"
  };
}

async function fetchWikipediaSummary(entity = {}, language = "ru") {
  const titleCandidates = getTitleCandidates(entity).slice(0, 3);
  if (!titleCandidates.length) return null;

  const apiUrl = language === "en" ? WIKIPEDIA_EN_API_URL : WIKIPEDIA_RU_API_URL;

  for (const title of titleCandidates) {
    try {
      const searchUrl = new URL(apiUrl);

      searchUrl.searchParams.set("action", "query");
      searchUrl.searchParams.set("format", "json");
      searchUrl.searchParams.set("origin", "*");
      searchUrl.searchParams.set("list", "search");
      searchUrl.searchParams.set("srlimit", "1");
      searchUrl.searchParams.set("srsearch", title);

      const searchPayload = await fetchJson(searchUrl.toString(), {
        headers: {
          Accept: "application/json"
        }
      });

      const pageTitle = cleanText(safeArray(searchPayload?.query?.search)[0]?.title);
      if (!pageTitle) continue;

      const summaryUrl = new URL(apiUrl);

      summaryUrl.searchParams.set("action", "query");
      summaryUrl.searchParams.set("format", "json");
      summaryUrl.searchParams.set("origin", "*");
      summaryUrl.searchParams.set("prop", "extracts|pageimages");
      summaryUrl.searchParams.set("exintro", "1");
      summaryUrl.searchParams.set("explaintext", "1");
      summaryUrl.searchParams.set("piprop", "original");
      summaryUrl.searchParams.set("titles", pageTitle);

      const summaryPayload = await fetchJson(summaryUrl.toString(), {
        headers: {
          Accept: "application/json"
        }
      });

      const page = Object.values(summaryPayload?.query?.pages || {})[0];
      const extract = cleanText(page?.extract);
      const cover = cleanText(page?.original?.source);

      if (!extract && !cover) continue;

      return {
        cover_url: cover,
        description_ru: language === "ru" ? extract : "",
        description_en: language === "en" ? extract : "",
        meta: {
          [`wikipedia_${language}_title`]: pageTitle,
          [`wikipedia_${language}_loaded`]: true
        },
        __source: `wikipedia_${language}`
      };
    } catch (error) {
      console.warn(`Wikipedia ${language} summary skipped:`, error);
    }
  }

  return null;
}

function openLibraryCoverUrlFromId(coverId) {
  const id = cleanText(coverId);
  return id ? `${OPEN_LIBRARY_COVER_BASE_URL}/${id}-L.jpg` : "";
}

async function fetchOpenLibraryWork(entity = {}) {
  const ids = normalizeJson(entity.external_ids, {});
  let workId = cleanText(ids.openlibrary_work).replace("/works/", "");

  if (!workId) {
    const title = getBestTitle(entity);
    if (!title) return null;

    const searchUrl = new URL(`${OPEN_LIBRARY_BASE_URL}/search.json`);

    searchUrl.searchParams.set("title", title);
    searchUrl.searchParams.set("limit", "1");
    searchUrl.searchParams.set("fields", "key,title,author_name,first_publish_year,cover_i");

    const searchPayload = await fetchJson(searchUrl.toString(), {
      headers: {
        Accept: "application/json"
      }
    });

    const doc = safeArray(searchPayload?.docs)[0];
    workId = cleanText(doc?.key).replace("/works/", "");

    if (!workId && doc?.cover_i) {
      return {
        cover_url: openLibraryCoverUrlFromId(doc.cover_i),
        year: normalizeYear(doc.first_publish_year),
        external_ids: {},
        meta: {
          openlibrary_search_loaded: true
        },
        __source: "openlibrary_search"
      };
    }
  }

  if (!workId) return null;

  const workPayload = await fetchJson(`${OPEN_LIBRARY_BASE_URL}/works/${encodeURIComponent(workId)}.json`, {
    headers: {
      Accept: "application/json"
    }
  });

  let description = "";

  if (typeof workPayload.description === "string") {
    description = cleanText(workPayload.description);
  } else if (workPayload.description && typeof workPayload.description === "object") {
    description = cleanText(workPayload.description.value);
  }

  const coverId = safeArray(workPayload.covers)[0];

  return {
    title_primary: cleanText(workPayload.title),
    cover_url: openLibraryCoverUrlFromId(coverId),
    description_en: description,
    external_ids: {
      openlibrary_work: workId
    },
    meta: {
      openlibrary_work: workId,
      openlibrary_loaded: true
    },
    __source: "openlibrary"
  };
}

async function fetchAniListDetails(entity = {}) {
  const ids = normalizeJson(entity.external_ids, {});
  const anilistId = cleanText(ids.anilist);
  const title = getBestTitle(entity);

  if (!anilistId && !title) return null;

  const graphqlQuery = `
    query EnrichMedia($id: Int, $search: String, $type: MediaType) {
      Media(id: $id, search: $search, type: $type) {
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
        coverImage {
          extraLarge
          large
          medium
        }
      }
    }
  `;

  const category = normalizeCategory(entity.category);
  const mediaType = category === "manga" ? "MANGA" : "ANIME";

  const response = await fetchWithTimeout(API_ENDPOINTS.ANILIST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      query: graphqlQuery,
      variables: {
        id: anilistId ? Number(anilistId) : null,
        search: anilistId ? null : title,
        type: mediaType
      }
    })
  });

  if (!response.ok) {
    throw new Error(`AniList details failed: ${response.status}`);
  }

  const payload = await response.json();

  if (payload?.errors?.length) {
    throw new Error(`AniList GraphQL error: ${payload.errors[0]?.message || "unknown"}`);
  }

  const media = payload?.data?.Media;
  if (!media?.id) return null;

  const cover =
    cleanText(media?.coverImage?.extraLarge) ||
    cleanText(media?.coverImage?.large) ||
    cleanText(media?.coverImage?.medium);

  const description = cleanText(media.description)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title_primary:
      cleanText(media?.title?.native) ||
      cleanText(media?.title?.english) ||
      cleanText(media?.title?.romaji),
    title_en:
      cleanText(media?.title?.english) ||
      cleanText(media?.title?.romaji),
    original_title:
      cleanText(media?.title?.romaji) ||
      cleanText(media?.title?.native),
    year: normalizeYear(media?.startDate?.year),
    cover_url: cover,
    description_en: description,
    external_ids: {
      anilist: String(media.id),
      mal: media.idMal ? String(media.idMal) : null
    },
    meta: {
      anilist_loaded: true,
      anilist_format: media.format || "",
      anilist_status: media.status || "",
      anilist_genres: safeArray(media.genres),
      anilist_synonyms: safeArray(media.synonyms),
      anilist_site_url: media.siteUrl || "",
      anilist_average_score: media.averageScore || null,
      anilist_popularity: media.popularity || null
    },
    __source: "anilist"
  };
}

async function fetchJikanDetails(entity = {}) {
  const ids = normalizeJson(entity.external_ids, {});
  const malId = cleanText(ids.mal);

  if (!malId) return null;

  const category = normalizeCategory(entity.category);
  const endpointType = category === "manga" ? "manga" : "anime";

  const payload = await fetchJson(`${API_ENDPOINTS.JIKAN}/${endpointType}/${encodeURIComponent(malId)}`, {
    headers: {
      Accept: "application/json"
    }
  });

  const item = payload?.data;
  if (!item?.mal_id) return null;

  const cover =
    cleanText(item?.images?.jpg?.large_image_url) ||
    cleanText(item?.images?.jpg?.image_url) ||
    cleanText(item?.images?.webp?.large_image_url) ||
    cleanText(item?.images?.webp?.image_url);

  const year =
    normalizeYear(item?.year) ||
    normalizeYear(item?.aired?.prop?.from?.year) ||
    normalizeYear(item?.published?.prop?.from?.year);

  return {
    title_primary: cleanText(item.title),
    title_en: cleanText(item.title_english || item.title),
    original_title: cleanText(item.title_japanese || item.title),
    year,
    cover_url: cover,
    description_en: cleanText(item.synopsis),
    external_ids: {
      mal: String(item.mal_id)
    },
    meta: {
      jikan_loaded: true,
      jikan_url: cleanText(item.url),
      jikan_type: cleanText(item.type),
      jikan_status: cleanText(item.status),
      jikan_genres: safeArray(item.genres).map((genre) => genre?.name).filter(Boolean)
    },
    __source: "jikan"
  };
}

async function runPatchPipeline(entity = {}) {
  const category = normalizeCategory(entity.category);
  const patches = [];

  async function tryPatch(fn) {
    try {
      const patch = await fn();
      if (patch) patches.push(patch);
    } catch (error) {
      console.warn("metadata enrichment source skipped:", error);
    }
  }

  if (category === "movies" || category === "series") {
    await tryPatch(() => fetchTmdbDetails(entity, "ru"));
    await tryPatch(() => fetchTmdbDetails(entity, "en"));
    await tryPatch(() => fetchTmdbBySearch(entity, "ru"));
    await tryPatch(() => fetchTmdbBySearch(entity, "en"));
    await tryPatch(() => fetchWikidataPatch(entity));
    await tryPatch(() => fetchWikipediaSummary(entity, "ru"));
    await tryPatch(() => fetchWikipediaSummary(entity, "en"));
  }

  if (category === "books") {
    await tryPatch(() => fetchWikidataPatch(entity));
    await tryPatch(() => fetchOpenLibraryWork(entity));
    await tryPatch(() => fetchWikipediaSummary(entity, "ru"));
    await tryPatch(() => fetchWikipediaSummary(entity, "en"));
  }

  if (category === "anime" || category === "manga") {
    await tryPatch(() => fetchAniListDetails(entity));
    await tryPatch(() => fetchJikanDetails(entity));
    await tryPatch(() => fetchWikidataPatch(entity));
    await tryPatch(() => fetchWikipediaSummary(entity, "ru"));
    await tryPatch(() => fetchWikipediaSummary(entity, "en"));
  }

  return patches;
}

async function fetchEntityById(entityId) {
  const id = Number(entityId || 0);
  if (!id) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(MEDIA_ENTITIES_TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle(),
    "Загрузка карточки для обогащения",
    READ_TIMEOUT_MS
  );

  if (error) throw error;
  return data || null;
}

async function updateEntityMetadata(entityId, entity, sources = []) {
  const id = Number(entityId || 0);
  if (!id) return null;

  const missing = getMissingFields(entity);
  const status = missing.length ? "partial" : "ready";
  const quality = buildQuality(entity, sources);

  const payload = {
    title_primary: cleanText(entity.title_primary),
    title_ru: cleanText(entity.title_ru),
    title_en: cleanText(entity.title_en),
    original_title: cleanText(entity.original_title),
    year: normalizeYear(entity.year),
    cover_url: cleanText(entity.cover_url),
    description_ru: cleanText(entity.description_ru),
    description_en: cleanText(entity.description_en),
    external_ids: normalizeJson(entity.external_ids, {}),
    meta: normalizeJson(entity.meta, {}),
    metadata_status: status,
    metadata_quality: quality,
    missing_fields: missing,
    last_enriched_at: new Date().toISOString()
  };

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(MEDIA_ENTITIES_TABLE)
      .update(payload)
      .eq("id", id)
      .select("*")
      .maybeSingle(),
    "Обновление метаданных карточки",
    WRITE_TIMEOUT_MS
  );

  if (error) throw error;
  return data || null;
}

async function markEntityMetadataStatus(entityId, entity = {}) {
  const id = Number(entityId || 0);
  if (!id) return null;

  const missing = getMissingFields(entity);
  const status = getMetadataStatus(entity);
  const quality = buildQuality(entity, []);

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(MEDIA_ENTITIES_TABLE)
      .update({
        metadata_status: status,
        metadata_quality: quality,
        missing_fields: missing
      })
      .eq("id", id)
      .select("*")
      .maybeSingle(),
    "Обновление статуса метаданных",
    WRITE_TIMEOUT_MS
  );

  if (error) throw error;
  return data || null;
}

export function analyzeEntityMetadata(entity = {}) {
  const missing = getMissingFields(entity);

  return {
    status: getMetadataStatus(entity),
    missing_fields: missing,
    quality: buildQuality(entity, [])
  };
}

export function shouldEnrichEntity(entity = {}) {
  if (!entity || typeof entity !== "object") return false;

  const missing = getMissingFields(entity);
  if (missing.length) return true;

  const status = cleanText(entity.metadata_status);
  return status === "needs_enrichment" || status === "partial";
}

export async function enrichMediaEntity(inputEntityOrId) {
  const inputIsId =
    typeof inputEntityOrId === "number" ||
    (typeof inputEntityOrId === "string" && /^\d+$/.test(inputEntityOrId));

  const entity = inputIsId
    ? await fetchEntityById(inputEntityOrId)
    : inputEntityOrId;

  if (!entity?.id) return null;

  if (!shouldEnrichEntity(entity)) {
    return markEntityMetadataStatus(entity.id, entity).catch(() => entity);
  }

  const patches = await runPatchPipeline(entity);

  let merged = { ...entity };
  const sources = [];

  patches.forEach((patch) => {
    merged = mergeEntityMetadata(merged, patch);
    if (patch.__source) sources.push(patch.__source);
  });

  return updateEntityMetadata(entity.id, merged, sources);
}

export function enrichMediaEntityInBackground(inputEntityOrId) {
  const entityId =
    typeof inputEntityOrId === "object"
      ? Number(inputEntityOrId?.id || 0)
      : Number(inputEntityOrId || 0);

  if (!entityId) return;

  if (pendingEnrichmentByEntityId.has(entityId)) {
    return;
  }

  const promise = enrichMediaEntity(inputEntityOrId)
    .catch((error) => {
      console.warn("metadata enrichment skipped:", error);
      return null;
    })
    .finally(() => {
      pendingEnrichmentByEntityId.delete(entityId);
    });

  pendingEnrichmentByEntityId.set(entityId, promise);
}

export async function repairMissingMetadata({ limit = 25, category = "" } = {}) {
  if (pendingEnrichmentByEntityId.has(pendingRepairKey)) {
    return pendingEnrichmentByEntityId.get(pendingRepairKey);
  }

  const promise = (async () => {
    const supabase = getSupabaseClient();
    const cleanCategory = normalizeCategory(category);

    let query = supabase
      .from(MEDIA_ENTITIES_TABLE)
      .select("*")
      .or(
        [
          "cover_url.is.null",
          "cover_url.eq.",
          "description_ru.is.null",
          "description_ru.eq.",
          "description_en.is.null",
          "description_en.eq.",
          "metadata_status.eq.needs_enrichment",
          "metadata_status.eq.partial"
        ].join(",")
      )
      .order("updated_at", { ascending: true })
      .limit(Math.max(1, Math.min(Number(limit) || 25, 50)));

    if (cleanCategory) {
      query = query.eq("category", cleanCategory);
    }

    const { data, error } = await withTimeout(
      query,
      "Поиск карточек без метаданных",
      READ_TIMEOUT_MS
    );

    if (error) throw error;

    const rows = safeArray(data);
    const updated = [];

    for (const row of rows) {
      try {
        const result = await enrichMediaEntity(row);
        if (result?.id) updated.push(result);
      } catch (error) {
        console.warn("repairMissingMetadata item skipped:", error);
      }
    }

    return updated;
  })().finally(() => {
    pendingEnrichmentByEntityId.delete(pendingRepairKey);
  });

  pendingEnrichmentByEntityId.set(pendingRepairKey, promise);
  return promise;
}

export function repairMissingMetadataInBackground(options = {}) {
  if (pendingEnrichmentByEntityId.has(pendingRepairKey)) {
    return;
  }

  repairMissingMetadata(options).catch((error) => {
    console.warn("repairMissingMetadata skipped:", error);
  });
}

export function prepareEntityMetadataPatch(entity = {}) {
  const status = getMetadataStatus(entity);
  const missing = getMissingFields(entity);

  return {
    metadata_status: status,
    metadata_quality: buildQuality(entity, []),
    missing_fields: missing
  };
}
