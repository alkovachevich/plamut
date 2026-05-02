import { TMDB_API_KEY } from "../config.js";
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

const COVER_CONFIDENCE = {
  tmdb_details: 1,
  tmdb_find_imdb: 0.98,
  tmdb_search: 0.9,
  wikidata: 0.72,
  openlibrary: 0.68,
  wikipedia: 0.55,
  unknown: 0.2
};

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

function isTruthyFlag(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

export function isHardLockedEntity(entity = {}) {
  const canonicalKey = cleanLower(entity.canonical_key);
  const universeKey = cleanLower(entity.universe_key);
  const meta = normalizeJson(entity.meta, {});

  return (
    isTruthyFlag(entity.manual_locked) ||
    isTruthyFlag(meta.manual_locked) ||
    isTruthyFlag(meta.seed_locked) ||
    isTruthyFlag(meta.seed_final) ||
    isTruthyFlag(meta.manual_reference) ||
    isTruthyFlag(meta.enrichment_protected) ||
    universeKey === "marvel" ||
    canonicalKey.startsWith("marvel:") ||
    canonicalKey.startsWith("mcu:") ||
    canonicalKey.startsWith("seed:") ||
    canonicalKey.startsWith("manual:")
  );
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

  if (!hasUsefulCover(entity.cover_url)) missing.push("cover_url");
  if (!hasUsefulText(entity.description_ru)) missing.push("description_ru");
  if (!hasUsefulText(entity.description_en)) missing.push("description_en");

  return missing;
}

function getMetadataStatus(entity = {}) {
  const missing = getMissingFields(entity);

  if (!missing.length) return "ready";
  if (missing.length >= 3) return "needs_enrichment";
  return "partial";
}

function getCurrentCoverConfidence(entity = {}) {
  const meta = normalizeJson(entity.meta, {});
  const value = Number(meta.cover_confidence);

  if (Number.isFinite(value)) return value;

  return hasUsefulCover(entity.cover_url) ? COVER_CONFIDENCE.unknown : 0;
}

function getPatchCoverConfidence(patch = {}) {
  const meta = normalizeJson(patch.meta, {});
  const explicit = Number(meta.cover_confidence);

  if (Number.isFinite(explicit)) return explicit;

  const source = cleanText(patch.__cover_source || patch.__source);

  if (source.startsWith("tmdb_details")) return COVER_CONFIDENCE.tmdb_details;
  if (source.startsWith("tmdb_find_imdb")) return COVER_CONFIDENCE.tmdb_find_imdb;
  if (source.startsWith("tmdb_search")) return COVER_CONFIDENCE.tmdb_search;
  if (source.startsWith("wikidata")) return COVER_CONFIDENCE.wikidata;
  if (source.startsWith("openlibrary")) return COVER_CONFIDENCE.openlibrary;
  if (source.startsWith("wikipedia")) return COVER_CONFIDENCE.wikipedia;

  return COVER_CONFIDENCE.unknown;
}

function pickBetterText(current = "", incoming = "") {
  const left = cleanText(current);
  const right = cleanText(incoming);

  if (!left) return right;
  if (!right) return left;

  if (right.length >= left.length + 24) return right;
  return left;
}

function pickBetterTitle(current = "", incoming = "") {
  const left = cleanText(current);
  const right = cleanText(incoming);

  if (!left) return right;
  if (!right) return left;

  return left;
}

function mergeEntityMetadata(entity = {}, patch = {}) {
  if (isHardLockedEntity(entity)) {
    return entity;
  }

  const currentMeta = normalizeJson(entity.meta, {});
  const patchMeta = normalizeJson(patch.meta, {});
  const currentIds = normalizeJson(entity.external_ids, {});
  const patchIds = normalizeJson(patch.external_ids, {});

  const currentCover = cleanText(entity.cover_url);
  const incomingCover = cleanText(patch.cover_url);
  const incomingConfidence = getPatchCoverConfidence(patch);
  const currentConfidence = getCurrentCoverConfidence(entity);

  const shouldUseIncomingCover =
    hasUsefulCover(incomingCover) &&
    (!hasUsefulCover(currentCover) || incomingConfidence > currentConfidence);

  const next = {
    ...entity,

    title_primary: pickBetterTitle(entity.title_primary, patch.title_primary),
    title_ru: pickBetterTitle(entity.title_ru, patch.title_ru),
    title_en: pickBetterTitle(entity.title_en, patch.title_en),
    original_title: pickBetterTitle(entity.original_title, patch.original_title),

    year: normalizeYear(entity.year) || normalizeYear(patch.year),

    cover_url: shouldUseIncomingCover ? incomingCover : currentCover,

    description_ru: pickBetterText(entity.description_ru, patch.description_ru),
    description_en: pickBetterText(entity.description_en, patch.description_en),

    external_ids: {
      ...currentIds,
      ...patchIds
    }
  };

  next.meta = {
    ...currentMeta,
    ...patchMeta,
    metadata_status: getMetadataStatus(next),
    metadata_checked_at: new Date().toISOString()
  };

  if (shouldUseIncomingCover) {
    next.meta.cover_source = cleanText(patch.__cover_source || patch.__source || "unknown");
    next.meta.cover_confidence = incomingConfidence;
    next.meta.cover_updated_at = new Date().toISOString();
  }

  return next;
}

function buildUpdatePayload(entity = {}) {
  return {
    title_primary: cleanText(entity.title_primary),
    title_ru: cleanText(entity.title_ru),
    title_en: cleanText(entity.title_en),
    original_title: cleanText(entity.original_title),
    year: normalizeYear(entity.year),
    cover_url: cleanText(entity.cover_url),
    description_ru: cleanText(entity.description_ru),
    description_en: cleanText(entity.description_en),
    external_ids: normalizeJson(entity.external_ids, {}),
    meta: normalizeJson(entity.meta, {})
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

function getYearFromDate(value = "") {
  const raw = cleanText(value);
  if (!raw) return null;

  const match = raw.match(/[+-]?(\d{4})/);
  if (!match) return null;

  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function buildTmdbCover(path = "") {
  const clean = cleanText(path);
  return clean ? `${TMDB_IMAGE_BASE_URL}${clean}` : "";
}

function getTmdbId(entity = {}) {
  const ids = normalizeJson(entity.external_ids, {});
  return cleanText(ids.tmdb || ids.tmdb_id);
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

function getTitleCandidates(entity = {}) {
  return uniqueArray([
    entity.original_title,
    entity.title_en,
    entity.title_primary,
    entity.title_ru,
    entity.title
  ].map(cleanText).filter(Boolean));
}

function getOriginalTitleCandidates(entity = {}) {
  return uniqueArray([
    entity.original_title,
    entity.title_en
  ].map(cleanText).filter(Boolean));
}

function getLocalizedTitleCandidates(entity = {}) {
  return uniqueArray([
    entity.title_primary,
    entity.title_ru,
    entity.title
  ].map(cleanText).filter(Boolean));
}

function normalizeCompareTitle(value = "") {
  return cleanLower(value)
    .replace(/ё/g, "е")
    .replace(/&/g, " and ")
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

function getTmdbResultYear(item = {}, type = "movie") {
  return type === "tv"
    ? getYearFromDate(item.first_air_date)
    : getYearFromDate(item.release_date);
}

function hasStrongTitleMatch(item = {}, entity = {}, type = "movie") {
  const originalCandidates = getOriginalTitleCandidates(entity)
    .map(normalizeCompareTitle)
    .filter(Boolean);

  const itemOriginal = normalizeCompareTitle(getTmdbResultOriginalTitle(item, type));

  if (!originalCandidates.length || !itemOriginal) return false;

  return originalCandidates.some((title) => title === itemOriginal);
}

function hasWeakLocalizedTitleMatch(item = {}, entity = {}, type = "movie") {
  const localizedCandidates = getLocalizedTitleCandidates(entity)
    .map(normalizeCompareTitle)
    .filter(Boolean);

  const itemLocalized = normalizeCompareTitle(getTmdbResultTitle(item, type));

  if (!localizedCandidates.length || !itemLocalized) return false;

  return localizedCandidates.some((title) => title === itemLocalized);
}

function scoreTmdbCandidate(item = {}, entity = {}, type = "movie", { allowLocalizedMatch = false } = {}) {
  const entityYear = normalizeYear(entity.year);
  const itemYear = getTmdbResultYear(item, type);
  const strongTitleMatch = hasStrongTitleMatch(item, entity, type);
  const weakLocalizedMatch = allowLocalizedMatch
    ? hasWeakLocalizedTitleMatch(item, entity, type)
    : false;

  let score = 0;

  if (item.poster_path) score += 35;
  if (item.overview) score += 8;

  if (entityYear && itemYear) {
    if (entityYear === itemYear) score += 60;
    else if (Math.abs(entityYear - itemYear) <= 1) score += 25;
    else score -= 80;
  }

  if (strongTitleMatch) score += 80;
  if (weakLocalizedMatch) score += 12;

  score += Math.min(Number(item.popularity || 0), 100) / 20;

  return score;
}

function pickBestTmdbCandidate(results = [], entity = {}, type = "movie", options = {}) {
  const entityYear = normalizeYear(entity.year);
  const originalCandidates = getOriginalTitleCandidates(entity);
  const allowLocalizedMatch = Boolean(options.allowLocalizedMatch);

  let candidates = safeArray(results)
    .filter((item) => item?.id)
    .slice(0, 8);

  if (entityYear) {
    const yearMatches = candidates.filter((item) => {
      const itemYear = getTmdbResultYear(item, type);
      return itemYear && Math.abs(itemYear - entityYear) <= 1;
    });

    if (yearMatches.length) candidates = yearMatches;
  }

  if (originalCandidates.length) {
    const originalMatches = candidates.filter((item) => hasStrongTitleMatch(item, entity, type));
    if (originalMatches.length) candidates = originalMatches;
  }

  if (!candidates.length && allowLocalizedMatch) {
    candidates = safeArray(results)
      .filter((item) => item?.id)
      .filter((item) => hasWeakLocalizedTitleMatch(item, entity, type))
      .slice(0, 8);
  }

  const scored = candidates
    .map((item) => ({
      item,
      score: scoreTmdbCandidate(item, entity, type, { allowLocalizedMatch })
    }))
    .sort((a, b) => b.score - a.score);

  const withPoster = scored.find((candidate) => candidate.item.poster_path);
  return (withPoster || scored[0])?.item || null;
}

async function fetchTmdbDetails(entity = {}, language = "ru") {
  const ids = normalizeJson(entity.external_ids, {});
  const tmdbId = getTmdbId(entity);

  if (!tmdbId || !TMDB_API_KEY) return null;

  const type = getTmdbType(entity);
  const url = new URL(`${TMDB_BASE_URL}/${type}/${tmdbId}`);

  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", language === "en" ? "en-US" : "ru-RU");
  url.searchParams.set("append_to_response", "external_ids,images");

  const payload = await fetchJson(url.toString(), {
    headers: { Accept: "application/json" }
  });

  const title = type === "tv"
    ? cleanText(payload.name)
    : cleanText(payload.title);

  const originalTitle = type === "tv"
    ? cleanText(payload.original_name)
    : cleanText(payload.original_title);

  const year = type === "tv"
    ? getYearFromDate(payload.first_air_date)
    : getYearFromDate(payload.release_date);

  const fallbackPoster =
    safeArray(payload?.images?.posters).find((poster) => poster?.file_path)?.file_path ||
    safeArray(payload?.images?.backdrops).find((backdrop) => backdrop?.file_path)?.file_path ||
    "";

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
      ...ids,
      tmdb: tmdbId,
      tmdb_id: ids.tmdb_id || tmdbId,
      imdb: cleanText(payload?.external_ids?.imdb_id) || ids.imdb || null,
      imdb_id: cleanText(payload?.external_ids?.imdb_id) || ids.imdb_id || ids.imdb || null
    },
    meta: {
      tmdb_type: type,
      tmdb_details_loaded: true,
      tmdb_vote_average: payload.vote_average || null,
      tmdb_vote_count: payload.vote_count || null,
      tmdb_popularity: payload.popularity || null,
      tmdb_original_language: payload.original_language || "",
      cover_source: "tmdb_details",
      cover_confidence: COVER_CONFIDENCE.tmdb_details
    },
    __source: `tmdb_details_${language}`,
    __cover_source: "tmdb_details"
  };
}

async function fetchTmdbFindByImdb(entity = {}, language = "ru") {
  const ids = normalizeJson(entity.external_ids, {});

  if (!ids.imdb && !ids.imdb_id) return null;
  if (!TMDB_API_KEY) return null;

  const imdbId = cleanText(ids.imdb || ids.imdb_id);
  const url = new URL(`${TMDB_BASE_URL}/find/${encodeURIComponent(imdbId)}`);

  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("external_source", "imdb_id");
  url.searchParams.set("language", language === "en" ? "en-US" : "ru-RU");

  const payload = await fetchJson(url.toString(), {
    headers: { Accept: "application/json" }
  });

  const category = normalizeCategory(entity.category);
  const result = category === "series"
    ? safeArray(payload.tv_results)[0]
    : safeArray(payload.movie_results)[0];

  if (!result?.id) return null;

  const patch = await fetchTmdbDetails(
    {
      ...entity,
      external_ids: {
        ...ids,
        tmdb: String(result.id),
        tmdb_id: String(result.id)
      }
    },
    language
  );

  if (!patch) return null;

  return {
    ...patch,
    meta: {
      ...normalizeJson(patch.meta, {}),
      cover_source: "tmdb_find_imdb",
      cover_confidence: COVER_CONFIDENCE.tmdb_find_imdb
    },
    __source: `tmdb_find_imdb_${language}`,
    __cover_source: "tmdb_find_imdb"
  };
}

async function fetchTmdbBySingleSearch(entity = {}, query = "", language = "ru", options = {}) {
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
    headers: { Accept: "application/json" }
  });

  const result = pickBestTmdbCandidate(payload.results, entity, type, options);
  if (!result?.id) return null;

  const patch = await fetchTmdbDetails(
    {
      ...entity,
      external_ids: {
        ...normalizeJson(entity.external_ids, {}),
        tmdb: String(result.id),
        tmdb_id: String(result.id)
      }
    },
    language
  );

  if (!patch) return null;

  return {
    ...patch,
    meta: {
      ...normalizeJson(patch.meta, {}),
      cover_source: "tmdb_search",
      cover_confidence: COVER_CONFIDENCE.tmdb_search
    },
    __source: `tmdb_search_${language}`,
    __cover_source: "tmdb_search"
  };
}

async function fetchTmdbPatch(entity = {}, language = "ru") {
  if (!TMDB_API_KEY) return null;

  const ids = normalizeJson(entity.external_ids, {});

  if (ids.tmdb || ids.tmdb_id) {
    return fetchTmdbDetails(entity, language);
  }

  if (ids.imdb || ids.imdb_id) {
    const byImdb = await fetchTmdbFindByImdb(entity, language).catch((error) => {
      console.warn("TMDB find by IMDb skipped:", error);
      return null;
    });

    if (byImdb?.cover_url || byImdb?.description_ru || byImdb?.description_en) return byImdb;
  }

  const strongQueries = getOriginalTitleCandidates(entity);
  const weakQueries = getLocalizedTitleCandidates(entity);

  for (const query of strongQueries) {
    try {
      const patch = await fetchTmdbBySingleSearch(entity, query, language, {
        allowLocalizedMatch: false
      });

      if (patch?.cover_url || patch?.description_ru || patch?.description_en) return patch;
    } catch (error) {
      console.warn(`TMDB strong search skipped for "${query}":`, error);
    }
  }

  if (normalizeYear(entity.year)) {
    for (const query of weakQueries) {
      try {
        const patch = await fetchTmdbBySingleSearch(entity, query, language, {
          allowLocalizedMatch: true
        });

        if (patch?.cover_url || patch?.description_ru || patch?.description_en) return patch;
      } catch (error) {
        console.warn(`TMDB weak search skipped for "${query}":`, error);
      }
    }
  }

  return null;
}

function openLibraryCoverUrlFromId(coverId) {
  return coverId ? `${OPEN_LIBRARY_COVER_BASE_URL}/${coverId}-L.jpg` : "";
}

function normalizeOpenLibraryWork(value = "") {
  return cleanText(value).replace("/works/", "");
}

async function fetchOpenLibraryPatch(entity = {}) {
  const ids = normalizeJson(entity.external_ids, {});
  let workId = normalizeOpenLibraryWork(ids.openlibrary_work || ids.openlibrary || "");

  if (!workId) {
    const title = getTitleCandidates(entity)[0];
    if (!title) return null;

    const url = new URL(`${OPEN_LIBRARY_BASE_URL}/search.json`);
    url.searchParams.set("title", title);
    url.searchParams.set("limit", "8");
    url.searchParams.set("fields", "key,title,cover_i,author_name,first_publish_year,language");

    const searchPayload = await fetchJson(url.toString(), {
      headers: { Accept: "application/json" }
    }).catch(() => null);

    const first = safeArray(searchPayload?.docs)
      .filter((item) => item?.key)
      .find((item) => item.cover_i || item.author_name?.length);

    workId = normalizeOpenLibraryWork(first?.key || "");
  }

  if (!workId) return null;

  const payload = await fetchJson(`${OPEN_LIBRARY_BASE_URL}/works/${encodeURIComponent(workId)}.json`, {
    headers: { Accept: "application/json" }
  }).catch(() => null);

  if (!payload) return null;

  const description =
    typeof payload.description === "string"
      ? payload.description
      : cleanText(payload.description?.value);

  const title = cleanText(payload.title);
  const coverId = safeArray(payload.covers)[0];

  return {
    title_primary: title,
    title_en: title,
    original_title: title,
    cover_url: openLibraryCoverUrlFromId(coverId),
    description_en: description,
    external_ids: {
      ...ids,
      openlibrary_work: workId
    },
    meta: {
      openlibrary_loaded: true,
      cover_source: "openlibrary",
      cover_confidence: COVER_CONFIDENCE.openlibrary
    },
    __source: "openlibrary",
    __cover_source: "openlibrary"
  };
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

function getYearFromWikidataTime(value) {
  const time = cleanText(value?.time);
  if (!time) return null;

  const match = time.match(/[+-]?(\d{4})/);
  if (!match) return null;

  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
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
  url.searchParams.set("limit", "6");
  url.searchParams.set("search", cleanQuery);

  const payload = await fetchJson(url.toString(), {
    headers: { Accept: "application/json" }
  });

  return safeArray(payload?.search)
    .map((item) => cleanText(item?.id))
    .filter(Boolean);
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
    headers: { Accept: "application/json" }
  });

  return Object.values(payload?.entities || {}).filter((item) => item?.id && item.id !== "-1");
}

async function fetchWikidataPatch(entity = {}) {
  const ids = normalizeJson(entity.external_ids, {});
  let wikidataId = cleanText(ids.wikidata || ids.wikidata_id);

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
      ...ids,
      wikidata: wikidataId,
      wikidata_id: wikidataId
    },
    meta: {
      wikidata_loaded: true,
      wikidata_id: wikidataId,
      cover_source: "wikidata",
      cover_confidence: COVER_CONFIDENCE.wikidata
    },
    __source: "wikidata",
    __cover_source: "wikidata"
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
        headers: { Accept: "application/json" }
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
        headers: { Accept: "application/json" }
      });

      const page = Object.values(summaryPayload?.query?.pages || {})[0];
      if (!page) continue;

      const extract = cleanText(page.extract);
      const image = cleanText(page?.original?.source);

      if (!extract && !image) continue;

      return {
        title_primary: cleanText(page.title),
        [language === "en" ? "description_en" : "description_ru"]: extract,
        cover_url: image,
        meta: {
          [`wikipedia_${language}_loaded`]: true,
          [`wikipedia_${language}_title`]: cleanText(page.title),
          cover_source: "wikipedia",
          cover_confidence: COVER_CONFIDENCE.wikipedia
        },
        __source: `wikipedia_${language}`,
        __cover_source: "wikipedia"
      };
    } catch (error) {
      console.warn(`Wikipedia ${language} summary skipped for "${title}":`, error);
    }
  }

  return null;
}

async function buildMetadataPatch(entity = {}, options = {}) {
  if (isHardLockedEntity(entity)) return null;

  const category = normalizeCategory(entity.category);
  const language = options.language === "en" ? "en" : "ru";
  const patches = [];

  if (category === "movies" || category === "series") {
    const tmdbRu = await fetchTmdbPatch(entity, "ru").catch((error) => {
      console.warn("TMDB RU patch skipped:", error);
      return null;
    });

    if (tmdbRu) patches.push(tmdbRu);

    const afterRu = patches.reduce((current, patch) => mergeEntityMetadata(current, patch), entity);

    if (!hasUsefulText(afterRu.description_en)) {
      const tmdbEn = await fetchTmdbPatch(afterRu, "en").catch((error) => {
        console.warn("TMDB EN patch skipped:", error);
        return null;
      });

      if (tmdbEn) patches.push(tmdbEn);
    }
  }

  if (category === "books") {
    const openLibrary = await fetchOpenLibraryPatch(entity).catch((error) => {
      console.warn("Open Library patch skipped:", error);
      return null;
    });

    if (openLibrary) patches.push(openLibrary);
  }

  const wikidata = await fetchWikidataPatch(entity).catch((error) => {
    console.warn("Wikidata patch skipped:", error);
    return null;
  });

  if (wikidata) patches.push(wikidata);

  const afterStructured = patches.reduce((current, patch) => mergeEntityMetadata(current, patch), entity);

  if (!hasUsefulText(afterStructured.description_ru)) {
    const wikiRu = await fetchWikipediaSummary(afterStructured, "ru").catch((error) => {
      console.warn("Wikipedia RU patch skipped:", error);
      return null;
    });

    if (wikiRu) patches.push(wikiRu);
  }

  const afterRu = patches.reduce((current, patch) => mergeEntityMetadata(current, patch), entity);

  if (!hasUsefulText(afterRu.description_en)) {
    const wikiEn = await fetchWikipediaSummary(afterRu, "en").catch((error) => {
      console.warn("Wikipedia EN patch skipped:", error);
      return null;
    });

    if (wikiEn) patches.push(wikiEn);
  }

  if (!patches.length) return null;

  return patches.reduce((current, patch) => mergeEntityMetadata(current, patch), entity);
}

function hasMetadataImprovement(before = {}, after = {}) {
  if (isHardLockedEntity(before)) return false;

  if (!hasUsefulCover(before.cover_url) && hasUsefulCover(after.cover_url)) return true;
  if (!hasUsefulText(before.description_ru) && hasUsefulText(after.description_ru)) return true;
  if (!hasUsefulText(before.description_en) && hasUsefulText(after.description_en)) return true;

  if (
    hasUsefulCover(after.cover_url) &&
    getCurrentCoverConfidence(after) > getCurrentCoverConfidence(before)
  ) {
    return true;
  }

  if (cleanText(after.description_ru).length >= cleanText(before.description_ru).length + 24) return true;
  if (cleanText(after.description_en).length >= cleanText(before.description_en).length + 24) return true;

  return false;
}

async function fetchCurrentEntityForUpdate(entity = {}) {
  if (!entity?.id) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(MEDIA_ENTITIES_TABLE)
      .select("*")
      .eq("id", entity.id)
      .maybeSingle(),
    "Проверка карточки перед обогащением",
    READ_TIMEOUT_MS
  );

  if (error) throw error;

  return data || null;
}

export function shouldEnrichEntity(entity = {}) {
  if (!entity?.id) return false;
  if (isHardLockedEntity(entity)) return false;

  const category = normalizeCategory(entity.category);
  if (!category) return false;

  return getMissingFields(entity).length > 0;
}

export async function enrichMediaEntityInBackground(entity = {}, options = {}) {
  if (!entity?.id) {
    return {
      skipped: true,
      reason: "missing_entity_id",
      entity
    };
  }

  if (isHardLockedEntity(entity)) {
    return {
      skipped: true,
      reason: "manual_locked",
      entity
    };
  }

  const key = String(entity.id);

  if (pendingEnrichmentByEntityId.has(key)) {
    return pendingEnrichmentByEntityId.get(key);
  }

  const promise = (async () => {
    const current = await fetchCurrentEntityForUpdate(entity).catch((error) => {
      console.warn("Current entity load skipped before enrichment:", error);
      return null;
    });

    const safeCurrent = current || entity;

    if (isHardLockedEntity(safeCurrent)) {
      return {
        skipped: true,
        reason: "manual_locked",
        entity: safeCurrent
      };
    }

    if (!shouldEnrichEntity(safeCurrent)) {
      return {
        skipped: true,
        reason: "metadata_ready",
        entity: safeCurrent
      };
    }

    const enriched = await buildMetadataPatch(safeCurrent, options).catch((error) => {
      console.warn("Metadata patch build skipped:", error);
      return null;
    });

    if (!enriched || isHardLockedEntity(enriched)) {
      return {
        skipped: true,
        reason: "no_patch",
        entity: safeCurrent
      };
    }

    if (!hasMetadataImprovement(safeCurrent, enriched)) {
      const metaOnly = {
        ...normalizeJson(safeCurrent.meta, {}),
        metadata_status: getMetadataStatus(safeCurrent),
        metadata_checked_at: new Date().toISOString()
      };

      if (isHardLockedEntity(safeCurrent)) {
        return {
          skipped: true,
          reason: "manual_locked",
          entity: safeCurrent
        };
      }

      const supabase = getSupabaseClient();

      const { data, error } = await withTimeout(
        supabase
          .from(MEDIA_ENTITIES_TABLE)
          .update({ meta: metaOnly })
          .eq("id", safeCurrent.id)
          .select("*")
          .maybeSingle(),
        "Обновление статуса метаданных",
        WRITE_TIMEOUT_MS
      ).catch((error) => ({ data: null, error }));

      if (error) {
        console.warn("Metadata status update skipped:", error);
      }

      return {
        skipped: true,
        reason: "no_improvement",
        entity: data || safeCurrent
      };
    }

    const payload = buildUpdatePayload(enriched);
    const supabase = getSupabaseClient();

    const beforeWrite = await fetchCurrentEntityForUpdate(safeCurrent).catch(() => safeCurrent);

    if (isHardLockedEntity(beforeWrite)) {
      return {
        skipped: true,
        reason: "manual_locked",
        entity: beforeWrite
      };
    }

    const { data, error } = await withTimeout(
      supabase
        .from(MEDIA_ENTITIES_TABLE)
        .update(payload)
        .eq("id", safeCurrent.id)
        .select("*")
        .maybeSingle(),
      "Обогащение карточки",
      WRITE_TIMEOUT_MS
    );

    if (error) throw error;

    return {
      skipped: false,
      reason: "",
      entity: data || enriched
    };
  })()
    .finally(() => {
      pendingEnrichmentByEntityId.delete(key);
    });

  pendingEnrichmentByEntityId.set(key, promise);
  return promise;
}

export async function repairMissingMetadata({ category = "", limit = 30, language = "ru" } = {}) {
  const normalizedCategory = normalizeCategory(category);
  const supabase = getSupabaseClient();

  let query = supabase
    .from(MEDIA_ENTITIES_TABLE)
    .select("*")
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 30, 80)));

  if (normalizedCategory) {
    query = query.eq("category", normalizedCategory);
  }

  const { data, error } = await withTimeout(
    query,
    "Поиск карточек для ремонта метаданных",
    READ_TIMEOUT_MS
  );

  if (error) throw error;

  const candidates = safeArray(data)
    .filter((entity) => shouldEnrichEntity(entity))
    .filter((entity) => !isHardLockedEntity(entity));

  const results = [];

  for (const entity of candidates) {
    const result = await enrichMediaEntityInBackground(entity, { language }).catch((error) => ({
      skipped: true,
      reason: error?.message || "error",
      entity
    }));

    results.push(result);
  }

  return results;
}

export function scheduleMetadataAutoRepair() {
  return () => {};
}
