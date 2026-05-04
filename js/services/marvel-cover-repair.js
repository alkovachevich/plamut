import { TMDB_API_KEY } from "../config.js";
import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";
import { safeArray } from "../utils.js";

const MEDIA_ENTITIES_TABLE = "media_entities";
const READ_TIMEOUT_MS = 12000;
const WRITE_TIMEOUT_MS = 12000;
const SEARCH_TIMEOUT_MS = 9000;
const IMAGE_CHECK_TIMEOUT_MS = 4500;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

function clean(value = "") {
  return String(value || "").trim();
}

function cleanLower(value = "") {
  return clean(value).toLowerCase();
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

function getYearFromDate(value = "") {
  const text = clean(value);
  if (!text) return null;
  const year = Number(text.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function buildTmdbCover(path = "") {
  const value = clean(path);
  return value ? `${TMDB_IMAGE_BASE_URL}${value}` : "";
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
    throw new Error(`Marvel cover repair request failed: ${response.status}`);
  }

  return response.json();
}

function isMarvelSeedEntity(entity = {}) {
  const canonicalKey = cleanLower(entity.canonical_key);
  const universeKey = cleanLower(entity.universe_key);
  const meta = normalizeJson(entity.meta, {});

  return Boolean(
    universeKey === "marvel" ||
    canonicalKey.startsWith("marvel:") ||
    canonicalKey.startsWith("mcu:") ||
    meta.universe_key === "marvel" ||
    meta.seed_universe === "marvel" ||
    meta.seed_source === "marvel" ||
    meta.source === "mcu_seed"
  );
}

function isSupportedCategory(entity = {}) {
  return entity.category === "movies" || entity.category === "series";
}

function isClearlyBadCoverUrl(value = "") {
  const url = clean(value);
  const lower = url.toLowerCase();

  if (!url) return true;
  if (lower === "null" || lower === "undefined") return true;
  if (lower.includes("/null")) return true;
  if (lower.includes("/undefined")) return true;
  if (lower.includes("placeholder")) return true;
  if (lower.includes("no-image")) return true;
  if (lower.endsWith("/w500")) return true;
  if (lower.endsWith("/original")) return true;

  return false;
}

function probeImage(url = "") {
  const cover = clean(url);

  if (!cover || isClearlyBadCoverUrl(cover)) {
    return Promise.resolve(false);
  }

  if (typeof Image === "undefined") {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(() => resolve(false), IMAGE_CHECK_TIMEOUT_MS);

    image.onload = () => {
      clearTimeout(timer);
      resolve(Boolean(image.naturalWidth && image.naturalHeight));
    };

    image.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };

    image.referrerPolicy = "no-referrer";
    image.src = cover;
  });
}

function getTmdbType(entity = {}) {
  const meta = normalizeJson(entity.meta, {});

  if (meta.tmdb_type === "tv") return "tv";
  if (meta.tmdb_type === "movie") return "movie";
  if (entity.category === "series") return "tv";

  return "movie";
}

function getTmdbId(entity = {}) {
  const ids = normalizeJson(entity.external_ids, {});
  return clean(ids.tmdb || ids.tmdb_id);
}

function titleCandidates(entity = {}) {
  return [
    entity.original_title,
    entity.title_en,
    entity.title_primary,
    entity.title_ru
  ]
    .map(clean)
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, 4);
}

function normalizeCompareTitle(value = "") {
  return cleanLower(value)
    .replace(/ё/g, "е")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9а-яе]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTmdbItemTitle(item = {}, tmdbType = "movie") {
  return tmdbType === "tv"
    ? clean(item.original_name || item.name)
    : clean(item.original_title || item.title);
}

function getTmdbItemYear(item = {}, tmdbType = "movie") {
  return tmdbType === "tv"
    ? getYearFromDate(item.first_air_date)
    : getYearFromDate(item.release_date);
}

function scoreTmdbCandidate(item = {}, entity = {}, tmdbType = "movie") {
  if (!item?.poster_path) return -999;

  const entityYear = normalizeYear(entity.year);
  const itemYear = getTmdbItemYear(item, tmdbType);
  const itemTitle = normalizeCompareTitle(getTmdbItemTitle(item, tmdbType));
  const titles = titleCandidates(entity).map(normalizeCompareTitle).filter(Boolean);

  let score = 0;

  if (titles.some((title) => title && title === itemTitle)) score += 120;
  if (titles.some((title) => title && (title.includes(itemTitle) || itemTitle.includes(title)))) score += 35;

  if (entityYear && itemYear) {
    if (entityYear === itemYear) score += 90;
    else if (Math.abs(entityYear - itemYear) <= 1) score += 35;
    else score -= 130;
  }

  score += Math.min(Number(item.popularity || 0), 150) / 15;

  return score;
}

async function fetchTmdbDetailsCover(entity = {}) {
  const tmdbId = getTmdbId(entity);
  if (!tmdbId || !TMDB_API_KEY) return null;

  const tmdbType = getTmdbType(entity);
  const url = new URL(`${TMDB_BASE_URL}/${tmdbType}/${tmdbId}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", "ru-RU");
  url.searchParams.set("append_to_response", "external_ids");

  const payload = await fetchJson(url.toString()).catch(() => null);
  const cover = buildTmdbCover(payload?.poster_path);

  if (!cover) return null;

  return {
    cover_url: cover,
    tmdb_id: tmdbId,
    tmdb_type: tmdbType,
    source: "tmdb_details",
    confidence: 0.98
  };
}

async function fetchTmdbSearchCover(entity = {}) {
  if (!TMDB_API_KEY) return null;

  const tmdbType = getTmdbType(entity);
  const titles = titleCandidates(entity);
  const entityYear = normalizeYear(entity.year);

  for (const title of titles) {
    const url = new URL(`${TMDB_BASE_URL}/search/${tmdbType}`);
    url.searchParams.set("api_key", TMDB_API_KEY);
    url.searchParams.set("query", title);
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("page", "1");
    url.searchParams.set("language", "ru-RU");

    if (entityYear && tmdbType === "movie") {
      url.searchParams.set("year", String(entityYear));
    }

    const payload = await fetchJson(url.toString()).catch(() => null);
    const candidates = safeArray(payload?.results)
      .slice(0, 8)
      .map((item) => ({
        item,
        score: scoreTmdbCandidate(item, entity, tmdbType)
      }))
      .filter((row) => row.score >= 70)
      .sort((a, b) => b.score - a.score);

    const best = candidates[0]?.item;
    const cover = buildTmdbCover(best?.poster_path);

    if (cover) {
      return {
        cover_url: cover,
        tmdb_id: best.id ? String(best.id) : "",
        tmdb_type: tmdbType,
        source: "tmdb_search",
        confidence: 0.82,
        matched_title: title,
        matched_year: getTmdbItemYear(best, tmdbType) || null,
        matched_original_title: getTmdbItemTitle(best, tmdbType)
      };
    }
  }

  return null;
}

async function fetchMarvelSeedEntities() {
  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(MEDIA_ENTITIES_TABLE)
      .select("id, canonical_key, category, title_primary, title_ru, title_en, original_title, year, cover_url, external_ids, meta, universe_key, manual_locked, manual_verified")
      .or("universe_key.eq.marvel,canonical_key.ilike.marvel:%,canonical_key.ilike.mcu:%")
      .in("category", ["movies", "series"])
      .order("year", { ascending: true }),
    "Загрузка Marvel карточек для проверки обложек",
    READ_TIMEOUT_MS
  );

  if (error) throw error;

  return safeArray(data).filter((entity) => isMarvelSeedEntity(entity) && isSupportedCategory(entity));
}

async function updateCoverOnly(entity = {}, patch = {}) {
  const supabase = getSupabaseClient();
  const previousCover = clean(entity.cover_url);
  const meta = normalizeJson(entity.meta, {});
  const ids = normalizeJson(entity.external_ids, {});

  const payload = {
    cover_url: patch.cover_url,
    external_ids: {
      ...ids,
      ...(patch.tmdb_id
        ? {
          tmdb: ids.tmdb || patch.tmdb_id,
          tmdb_id: ids.tmdb_id || patch.tmdb_id
        }
        : {})
    },
    meta: {
      ...meta,
      tmdb_type: meta.tmdb_type || patch.tmdb_type,
      cover_source: patch.source,
      cover_confidence: patch.confidence,
      marvel_cover_repaired_at: new Date().toISOString(),
      marvel_cover_repair_previous_url: previousCover,
      marvel_cover_repair_scope: "cover_url_only"
    }
  };

  const { data, error } = await withTimeout(
    supabase
      .from(MEDIA_ENTITIES_TABLE)
      .update(payload)
      .eq("id", entity.id)
      .select("id, canonical_key, title_primary, cover_url, meta")
      .maybeSingle(),
    "Безопасное обновление обложки Marvel карточки",
    WRITE_TIMEOUT_MS
  );

  if (error) throw error;
  return data || null;
}

export async function findMarvelCoverRepairCandidates(options = {}) {
  const checkImages = options.checkImages !== false;
  const entities = await fetchMarvelSeedEntities();
  const candidates = [];

  for (const entity of entities) {
    const currentCover = clean(entity.cover_url);
    const clearlyBad = isClearlyBadCoverUrl(currentCover);
    const alive = clearlyBad || !checkImages ? false : await probeImage(currentCover);

    if (!clearlyBad && alive) continue;

    candidates.push({
      id: entity.id,
      canonical_key: entity.canonical_key,
      title_primary: entity.title_primary,
      title_ru: entity.title_ru,
      title_en: entity.title_en,
      original_title: entity.original_title,
      year: entity.year,
      category: entity.category,
      current_cover_url: currentCover,
      reason: clearlyBad ? "missing_or_invalid_url" : "image_failed_to_load",
      external_ids: entity.external_ids,
      meta: entity.meta
    });
  }

  return candidates;
}

export async function repairMarvelUniverseCovers(options = {}) {
  const dryRun = options.dryRun !== false;
  const checkImages = options.checkImages !== false;
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 80;

  const entities = (await fetchMarvelSeedEntities()).slice(0, limit);
  const results = [];

  for (const entity of entities) {
    const currentCover = clean(entity.cover_url);
    const clearlyBad = isClearlyBadCoverUrl(currentCover);
    const alive = clearlyBad || !checkImages ? false : await probeImage(currentCover);

    if (!clearlyBad && alive) {
      results.push({
        id: entity.id,
        title: entity.title_primary,
        canonical_key: entity.canonical_key,
        action: "skipped",
        reason: "cover_ok",
        cover_url: currentCover
      });
      continue;
    }

    const patch =
      await fetchTmdbDetailsCover(entity).catch(() => null) ||
      await fetchTmdbSearchCover(entity).catch(() => null);

    if (!patch?.cover_url) {
      results.push({
        id: entity.id,
        title: entity.title_primary,
        canonical_key: entity.canonical_key,
        action: "skipped",
        reason: "no_safe_tmdb_cover_found",
        current_cover_url: currentCover
      });
      continue;
    }

    if (dryRun) {
      results.push({
        id: entity.id,
        title: entity.title_primary,
        canonical_key: entity.canonical_key,
        action: "dry_run_update_cover",
        reason: clearlyBad ? "missing_or_invalid_url" : "image_failed_to_load",
        current_cover_url: currentCover,
        next_cover_url: patch.cover_url,
        source: patch.source,
        confidence: patch.confidence,
        tmdb_id: patch.tmdb_id || ""
      });
      continue;
    }

    const updated = await updateCoverOnly(entity, patch).catch((error) => {
      results.push({
        id: entity.id,
        title: entity.title_primary,
        canonical_key: entity.canonical_key,
        action: "failed",
        reason: error?.message || String(error),
        current_cover_url: currentCover,
        next_cover_url: patch.cover_url
      });
      return null;
    });

    if (updated?.id) {
      results.push({
        id: entity.id,
        title: entity.title_primary,
        canonical_key: entity.canonical_key,
        action: "updated_cover_only",
        previous_cover_url: currentCover,
        next_cover_url: updated.cover_url,
        source: patch.source,
        confidence: patch.confidence,
        tmdb_id: patch.tmdb_id || ""
      });
    }
  }

  const summary = {
    dryRun,
    checked: results.length,
    planned: results.filter((row) => row.action === "dry_run_update_cover").length,
    updated: results.filter((row) => row.action === "updated_cover_only").length,
    skipped: results.filter((row) => row.action === "skipped").length,
    failed: results.filter((row) => row.action === "failed").length
  };

  console.table(results);
  console.info("Marvel cover repair summary:", summary);

  return {
    summary,
    results
  };
}

if (typeof window !== "undefined") {
  window.PlamutMarvelCoverRepair = {
    findMarvelCoverRepairCandidates,
    repairMarvelUniverseCovers
  };
}
