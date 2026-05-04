import { safeArray, uniqueArray } from "../../utils.js";

function clean(value = "") {
  return String(value || "").trim();
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

export function isUsefulCover(value = "") {
  const cover = clean(value);
  if (!cover) return false;
  if (cover === "undefined" || cover === "null") return false;
  if (cover.includes("/placeholder")) return false;
  return /^https?:\/\//i.test(cover) || cover.startsWith("/");
}

export function isUsefulDescription(value = "", minLength = 40) {
  return clean(value).length >= minLength;
}

export function isProtectedEntity(entity = {}) {
  const canonicalKey = clean(entity.canonical_key).toLowerCase();
  const universeKey = clean(entity.universe_key).toLowerCase();
  const meta = normalizeJson(entity.meta, {});

  return Boolean(
    entity.manual_locked === true ||
    meta.manual_locked === true ||
    meta.manual_locked === "true" ||
    meta.seed_locked === true ||
    meta.seed_locked === "true" ||
    meta.seed_final === true ||
    meta.seed_final === "true" ||
    meta.manual_reference === true ||
    meta.manual_reference === "true" ||
    meta.enrichment_protected === true ||
    meta.enrichment_protected === "true" ||
    universeKey ||
    canonicalKey.startsWith("marvel:") ||
    canonicalKey.startsWith("mcu:") ||
    canonicalKey.startsWith("seed:") ||
    canonicalKey.startsWith("manual:")
  );
}

function pickAdditiveText(current = "", incoming = "") {
  const left = clean(current);
  const right = clean(incoming);

  if (!left) return right;
  if (!right) return left;

  return right.length >= left.length + 80 ? right : left;
}

function pickAdditiveTitle(current = "", incoming = "") {
  const left = clean(current);
  const right = clean(incoming);
  return left || right;
}

function pickAdditiveCover(current = "", incoming = "") {
  const left = clean(current);
  const right = clean(incoming);

  if (isUsefulCover(left)) return left;
  return isUsefulCover(right) ? right : left;
}

export function getMetadataMissingFields(entity = {}) {
  const missing = [];
  const ids = normalizeJson(entity.external_ids, {});

  if (!isUsefulCover(entity.cover_url)) missing.push("cover_url");

  if (!isUsefulDescription(entity.description_ru) && !isUsefulDescription(entity.description_en)) {
    missing.push("description");
  }

  if (!ids.wikidata && !ids.wikidata_id && !ids.tmdb && !ids.tmdb_id && !ids.anilist && !ids.anilist_id && !ids.mal && !ids.mal_id && !ids.openlibrary_work) {
    missing.push("external_ids");
  }

  if (entity.category !== "books" && !normalizeYear(entity.year)) {
    missing.push("year");
  }

  return missing;
}

export function getMetadataStatus(entity = {}) {
  const missing = getMetadataMissingFields(entity);
  return missing.length ? "needs_enrichment" : "ready";
}

export function mergeMetadataAdditive(current = {}, incoming = {}) {
  if (!incoming || typeof incoming !== "object") return current;
  if (isProtectedEntity(current)) return current;

  const currentIds = normalizeJson(current.external_ids, {});
  const incomingIds = normalizeJson(incoming.external_ids, {});
  const currentMeta = normalizeJson(current.meta, {});
  const incomingMeta = normalizeJson(incoming.meta, {});

  const next = {
    ...current,

    canonical_key: current.canonical_key,
    category: current.category,
    universe_key: current.universe_key,
    relations_status: current.relations_status,

    title_primary: pickAdditiveTitle(current.title_primary, incoming.title_primary || incoming.title),
    title_ru: pickAdditiveTitle(current.title_ru, incoming.title_ru),
    title_en: pickAdditiveTitle(current.title_en, incoming.title_en),
    original_title: pickAdditiveTitle(current.original_title, incoming.original_title),

    year: normalizeYear(current.year) || normalizeYear(incoming.year),
    cover_url: pickAdditiveCover(current.cover_url, incoming.cover_url),

    description_ru: pickAdditiveText(current.description_ru, incoming.description_ru),
    description_en: pickAdditiveText(current.description_en, incoming.description_en),

    aliases: uniqueArray([
      ...safeArray(current.aliases),
      ...safeArray(incoming.aliases),
      incoming.title,
      incoming.title_primary,
      incoming.title_ru,
      incoming.title_en,
      incoming.original_title
    ].map(clean).filter(Boolean)),

    external_ids: {
      ...currentIds,
      ...incomingIds
    }
  };

  const missing = getMetadataMissingFields(next);

  next.meta = {
    ...currentMeta,
    ...incomingMeta,
    metadata_status: missing.length ? "needs_enrichment" : "ready",
    missing_fields: missing,
    additive_merge_checked_at: new Date().toISOString()
  };

  return next;
}
