// js/services/metadata-enrichment.js

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

const COVER_CONFIDENCE = {
  tmdb_details: 1,
  tmdb_find_imdb: 0.98,
  tmdb_search: 0.9,
  openlibrary: 0.78,
  wikidata: 0.66,
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

function getMissingMetadataFields(entity = {}) {
  const missing = [];

  if (!hasUsefulCover(entity.cover_url)) missing.push("cover_url");

  if (!hasUsefulText(entity.description_ru) && !hasUsefulText(entity.description_en)) {
    missing.push("description");
  }

  if (!normalizeJson(entity.external_ids, {}).wikidata && !normalizeJson(entity.external_ids, {}).wikidata_id) {
    if (entity.category === "books" && !normalizeJson(entity.external_ids, {}).openlibrary_work) {
      missing.push("external_ids");
    }
  }

  if (entity.category !== "books" && !normalizeYear(entity.year)) {
    missing.push("year");
  }

  return missing;
}

function getMetadataStatus(entity = {}) {
  return getMissingMetadataFields(entity).length ? "needs_enrichment" : "ready";
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

function normalizeCompareTitle(value = "") {
  return cleanLower(value)
    .replace(/ё/g, "е")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9а-яе]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function scoreTmdbCandidate(item = {}, entity = {}, type = "movie") {
  const entityYear = normalizeYear(entity.year);
  const itemYear = getTmdbResultYear(item, type);
  const strongTitleMatch = hasStrongTitleMatch(item, entity, type);

  let score = 0;

  if (item.poster_path) score += 35;
  if (item.overview) score += 8;

  if (entityYear && itemYear) {
    if (entityYear === itemYear) score += 60;
    else if (Math.abs(entityYear - itemYear) <= 1) score += 25;
    else score -= 80;
  }

  if (strongTitleMatch) score += 90;

  score += Math.min(Number(item.popularity || 0), 100) / 20;

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
  const tmdbId = getTmdbId(entity);

  if (!tmdbId || !TMDB_API_KEY) return null;

  const ids = normalizeJson(entity.external_ids, {});
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
      tmdb_id: tmdbId,
      imdb: cleanText(payload?.external_ids?.imdb_id) || ids.imdb || "",
      imdb_id: cleanText(payload?.external_ids?.imdb_id) || ids.imdb_id || ids.imdb || ""
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

async function fetchTmdbBySearch(entity = {}, language = "ru") {
  if (!TMDB_API_KEY) return null;

  const type = getTmdbType(entity);
  const queries = getOriginalTitleCandidates(entity);

  for (const query of queries) {
    const url = new URL(`${TMDB_BASE_URL}/search/${type}`);

    url.searchParams.set("api_key", TMDB_API_KEY);
    url.searchParams.set("query", query);
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("page", "1");
    url.searchParams.set("language", language === "en" ? "en-US" : "ru-RU");

    const payload = await fetchJson(url.toString(), {
      headers: { Accept: "application/json" }
    }).catch(() => null);

    const result = pickBestTmdbCandidate(payload?.results, entity, type);

    if (!result?.id) continue;

    return fetchTmdbDetails(
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
  }

  return null;
}

function normalizeOpenLibraryWork(value = "") {
  return cleanText(value).replace("/works/", "");
}

function openLibraryCoverUrlFromId(coverId) {
  return coverId ? `${OPEN_LIBRARY_COVER_BASE_URL}/${coverId}-L.jpg` : "";
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

  const description =
    typeof payload?.description === "string"
      ? payload.description
      : cleanText(payload?.description?.value);

  const title = cleanText(payload?.title);
  const coverId = safeArray(payload?.covers)[0];

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
      foundIds.push(...await searchWikidataIds(title, "ru").catch(() => []));
      foundIds.push(...await searchWikidataIds(title, "en").catch(() => []));
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
    const searchUrl = new URL(apiUrl);

    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("srlimit", "1");
    searchUrl.searchParams.set("srsearch", title);

    const searchPayload = await fetchJson(searchUrl.toString(), {
      headers: { Accept: "application/json" }
    }).catch(() => null);

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
    }).catch(() => null);

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
  }

  return null;
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
  if (source.startsWith("tmdb_search")) return COVER_CONFIDENCE.tmdb_search;
  if (source.startsWith("openlibrary")) return COVER_CONFIDENCE.openlibrary;
  if (source.startsWith("wikidata")) return COVER_CONFIDENCE.wikidata;
  if (source.startsWith("wikipedia")) return COVER_CONFIDENCE.wikipedia;

  return COVER_CONFIDENCE.unknown;
}

function pickBetterText(current = "", incoming = "") {
  const left = cleanText(current);
  const right = cleanText(incoming);

  if (!left) return right;
  if (!right) return left;

  return right.length >= left.length + 24 ? right : left;
}

function pickBetterTitle(current = "", incoming = "") {
  const left = cleanText(current);
  const right = cleanText(incoming);

  if (!left) return right;
  return left;
}

function mergeEntityMetadata(entity = {}, patch = {}) {
  if (isHardLockedEntity(entity)) return entity;

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

  const missing = getMissingMetadataFields(next);

  next.meta = {
    ...currentMeta,
    ...patchMeta,
    metadata_status: missing.length ? "needs_enrichment" : "ready",
    missing_fields: missing,
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
  const missing = getMissingMetadataFields(entity);

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
    meta: {
      ...normalizeJson(entity.meta, {}),
      metadata_status: missing.length ? "needs_enrichment" : "ready",
      missing_fields: missing,
      metadata_checked_at: new Date().toISOString()
    }
  };
}

async function buildMetadataPatch(entity = {}) {
  if (isHardLockedEntity(entity)) return null;

  const category = normalizeCategory(entity.category);
  const patches = [];

  if (category === "movies" || category === "series") {
    const tmdbRu = await (
      getTmdbId(entity)
        ? fetchTmdbDetails(entity, "ru")
        : fetchTmdbBySearch(entity, "ru")
    ).catch(() => null);

    if (tmdbRu) patches.push(tmdbRu);

    const afterRu = patches.reduce((current, patch) => mergeEntityMetadata(current, patch), entity);

    if (!hasUsefulText(afterRu.description_en)) {
      const tmdbEn = await (
        getTmdbId(afterRu)
          ? fetchTmdbDetails(afterRu, "en")
          : fetchTmdbBySearch(afterRu, "en")
      ).catch(() => null);

      if (tmdbEn) patches.push(tmdbEn);
    }
  }

  if (category === "books") {
    const openLibrary = await fetchOpenLibraryPatch(entity).catch(() => null);
    if (openLibrary) patches.push(openLibrary);
  }

  const wikidata = await fetchWikidataPatch(entity).catch(() => null);
  if (wikidata) patches.push(wikidata);

  const afterStructured = patches.reduce((current, patch) => mergeEntityMetadata(current, patch), entity);

  if (!hasUsefulText(afterStructured.description_ru)) {
    const wikiRu = await fetchWikipediaSummary(afterStructured, "ru").catch(() => null);
    if (wikiRu) patches.push(wikiRu);
  }

  const afterRu = patches.reduce((current, patch) => mergeEntityMetadata(current, patch), entity);

  if (!hasUsefulText(afterRu.description_en)) {
    const wikiEn = await fetchWikipediaSummary(afterRu, "en").catch(() => null);
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

async function fetchCurrentEntity(entityId) {
  if (!entityId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(MEDIA_ENTITIES_TABLE)
      .select("*")
      .eq("id", entityId)
      .maybeSingle(),
    "Проверка карточки",
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

  return getMissingMetadataFields(entity).length > 0;
}

export async function enrichMediaEntityManually(entityId) {
  const current = await fetchCurrentEntity(entityId);

  if (!current?.id) {
    return {
      skipped: true,
      reason: "not_found",
      entity: null
    };
  }

  if (isHardLockedEntity(current)) {
    return {
      skipped: true,
      reason: "manual_locked",
      entity: current
    };
  }

  const enriched = await buildMetadataPatch(current).catch((error) => {
    console.warn("Manual metadata enrichment failed:", error);
    return null;
  });

  if (!enriched || !hasMetadataImprovement(current, enriched)) {
    return {
      skipped: true,
      reason: "no_improvement",
      entity: current
    };
  }

  const beforeWrite = await fetchCurrentEntity(current.id).catch(() => current);

  if (isHardLockedEntity(beforeWrite)) {
    return {
      skipped: true,
      reason: "manual_locked",
      entity: beforeWrite
    };
  }

  const payload = buildUpdatePayload(enriched);
  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(MEDIA_ENTITIES_TABLE)
      .update(payload)
      .eq("id", current.id)
      .select("*")
      .maybeSingle(),
    "Ручное обогащение карточки",
    WRITE_TIMEOUT_MS
  );

  if (error) throw error;

  return {
    skipped: false,
    reason: "",
    entity: data || enriched
  };
}

export async function enrichMediaEntityInBackground(entity = {}) {
  return {
    skipped: true,
    reason: "auto_enrichment_disabled",
    entity
  };
}

export async function repairMissingMetadata() {
  return [];
}

export function scheduleMetadataAutoRepair() {
  return () => {};
}
