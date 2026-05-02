import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";
import { normalizeString, safeArray, uniqueArray } from "../utils.js";
import { updateCachedLibraryItem } from "./library-cache.js";
import {
  enrichMediaEntityInBackground,
  shouldEnrichEntity
} from "./metadata-enrichment.js";

const MEDIA_ENTITIES_TABLE = "media_entities";
const ENTITY_ALIASES_TABLE = "entity_aliases";
const USER_MEDIA_TABLE = "user_media";

const READ_TIMEOUT_MS = 9000;
const WRITE_TIMEOUT_MS = 14000;

const entityCacheByCanonicalKey = new Map();
const userMediaCacheByKey = new Map();
const pendingEntitySaveByCanonicalKey = new Map();
const pendingUserMediaByKey = new Map();

const CACHE_TTL_MS = 1000 * 60 * 5;

const ALLOWED_PRIMARY_SOURCES = new Set([
  "wikidata",
  "openlibrary",
  "tmdb",
  "anilist",
  "jikan",
  "manual",
  "system"
]);

const AUTHORITATIVE_CANONICAL_PREFIXES = [
  "marvel:",
  "mcu:",
  "seed:",
  "manual:"
];

const HARD_ID_KEYS = [
  "tmdb_id",
  "tmdb",
  "wikidata_id",
  "wikidata",
  "imdb_id",
  "imdb",
  "anilist_id",
  "anilist",
  "mal_id",
  "mal",
  "openlibrary_work"
];

const USER_MEDIA_WITH_ENTITY_SELECT = `
  id,
  user_id,
  entity_id,
  category,
  status,
  folder_name,
  created_at,
  updated_at,
  media_entities (
    id,
    canonical_key,
    category,
    primary_source,
    title_primary,
    title_ru,
    title_en,
    original_title,
    year,
    cover_url,
    description_ru,
    description_en,
    external_ids,
    meta,
    universe_key,
    relations_built_at,
    relations_status,
    manual_locked,
    manual_verified
  )
`;

function cleanText(value = "") {
  return typeof value === "string" ? value.trim() : String(value || "").trim();
}

function cleanLower(value = "") {
  return cleanText(value).toLowerCase();
}

function normalizeYear(value) {
  if (value === null || value === undefined || value === "") return null;

  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function normalizeJson(value, fallback = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return value;
}

function normalizeArray(value) {
  return uniqueArray(
    safeArray(value)
      .map((item) => cleanText(item))
      .filter(Boolean)
  );
}

function normalizePrimarySource(value = "") {
  const source = cleanLower(value);
  return ALLOWED_PRIMARY_SOURCES.has(source) ? source : "manual";
}

function normalizeOpenLibraryWork(value = "") {
  return cleanText(value).replace("/works/", "");
}

function normalizeExternalIdValue(value) {
  if (value === null || value === undefined || value === "") return "";
  return cleanLower(String(value).replace("/works/", ""));
}

function normalizeExternalIdsMap(value = {}) {
  const ids = normalizeJson(value, {});
  const normalized = { ...ids };

  if (normalized.openlibrary_work) {
    normalized.openlibrary_work = normalizeOpenLibraryWork(normalized.openlibrary_work);
  }

  if (normalized.openlibrary) {
    normalized.openlibrary = normalizeOpenLibraryWork(normalized.openlibrary);
  }

  if (normalized.tmdb && !normalized.tmdb_id) {
    normalized.tmdb_id = cleanText(normalized.tmdb);
  }

  if (normalized.tmdb_id && !normalized.tmdb) {
    normalized.tmdb = cleanText(normalized.tmdb_id);
  }

  if (normalized.imdb && !normalized.imdb_id) {
    normalized.imdb_id = cleanText(normalized.imdb);
  }

  if (normalized.imdb_id && !normalized.imdb) {
    normalized.imdb = cleanText(normalized.imdb_id);
  }

  if (normalized.wikidata && !normalized.wikidata_id) {
    normalized.wikidata_id = cleanText(normalized.wikidata);
  }

  if (normalized.wikidata_id && !normalized.wikidata) {
    normalized.wikidata = cleanText(normalized.wikidata_id);
  }

  return normalized;
}

function getHardIdentityIds(entity = {}) {
  const ids = normalizeExternalIdsMap(entity.external_ids || {});
  const result = {};

  for (const key of HARD_ID_KEYS) {
    const value = normalizeExternalIdValue(ids[key]);
    if (value) result[key] = value;
  }

  return result;
}

function hasHardIdentity(entity = {}) {
  return Object.keys(getHardIdentityIds(entity)).length > 0;
}

function hasExternalIdConflict(existing = {}, incoming = {}) {
  const existingIds = getHardIdentityIds(existing);
  const incomingIds = getHardIdentityIds(incoming);

  for (const key of HARD_ID_KEYS) {
    if (existingIds[key] && incomingIds[key] && existingIds[key] !== incomingIds[key]) {
      return true;
    }
  }

  return false;
}

function hasCategoryConflict(existing = {}, incoming = {}) {
  const existingCategory = cleanLower(existing.category);
  const incomingCategory = cleanLower(incoming.category);

  if (!existingCategory || !incomingCategory) return false;
  if (existingCategory === incomingCategory) return false;

  const screenCategories = new Set(["movies", "series"]);
  if (screenCategories.has(existingCategory) && screenCategories.has(incomingCategory)) {
    return false;
  }

  return true;
}

function isTruthyFlag(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function isHardLockedEntity(entity = {}) {
  const canonicalKey = cleanLower(entity.canonical_key);
  const universeKey = cleanLower(entity.universe_key);
  const meta = normalizeJson(entity.meta, {});

  return (
    isTruthyFlag(entity.manual_locked) ||
    isTruthyFlag(meta.manual_locked) ||
    isTruthyFlag(meta.seed_locked) ||
    isTruthyFlag(meta.seed_final) ||
    isTruthyFlag(meta.manual_reference) ||
    universeKey === "marvel" ||
    canonicalKey.startsWith("marvel:") ||
    canonicalKey.startsWith("seed:") ||
    canonicalKey.startsWith("manual:")
  );
}

function isAuthoritativeEntity(entity = {}) {
  const canonicalKey = cleanLower(entity.canonical_key);
  const meta = normalizeJson(entity.meta, {});

  return (
    isHardLockedEntity(entity) ||
    AUTHORITATIVE_CANONICAL_PREFIXES.some((prefix) => canonicalKey.startsWith(prefix)) ||
    cleanLower(meta.franchise) === "marvel" ||
    Boolean(meta.seed_version) ||
    cleanLower(entity.primary_source) === "system"
  );
}

function canMergeEntities(existing = {}, incoming = {}) {
  if (!existing?.id && !existing?.canonical_key) return true;

  if (isHardLockedEntity(existing)) {
    return false;
  }

  const existingKey = cleanLower(existing.canonical_key);
  const incomingKey = cleanLower(incoming.canonical_key);

  if (existingKey && incomingKey && existingKey === incomingKey) {
    return true;
  }

  if (hasCategoryConflict(existing, incoming)) {
    return false;
  }

  if (hasExternalIdConflict(existing, incoming)) {
    return false;
  }

  const existingHasHardId = hasHardIdentity(existing);
  const incomingHasHardId = hasHardIdentity(incoming);

  if (existingHasHardId && incomingHasHardId) {
    const existingIds = getHardIdentityIds(existing);
    const incomingIds = getHardIdentityIds(incoming);
    const sharedKeys = HARD_ID_KEYS.filter((key) => existingIds[key] && incomingIds[key]);

    return sharedKeys.length > 0;
  }

  if (isAuthoritativeEntity(existing) || isAuthoritativeEntity(incoming)) {
    return false;
  }

  return true;
}

function makeEntityCacheRow(entity) {
  return {
    value: entity || null,
    ts: Date.now()
  };
}

function getCachedEntity(canonicalKey = "") {
  const key = cleanLower(canonicalKey);
  if (!key) return null;

  const row = entityCacheByCanonicalKey.get(key);
  if (!row) return null;

  if (Date.now() - Number(row.ts || 0) > CACHE_TTL_MS) {
    entityCacheByCanonicalKey.delete(key);
    return null;
  }

  return row.value || null;
}

function setCachedEntity(entity) {
  const key = cleanLower(entity?.canonical_key);
  if (!key || !entity?.id) return;

  entityCacheByCanonicalKey.set(key, makeEntityCacheRow(entity));
}

function getUserMediaCacheKey(userId, entityId) {
  const cleanUserId = cleanText(userId);
  const cleanEntityId = Number(entityId || 0);

  if (!cleanUserId || !cleanEntityId) return "";
  return `${cleanUserId}:${cleanEntityId}`;
}

function getCachedUserMedia(userId, entityId) {
  const key = getUserMediaCacheKey(userId, entityId);
  if (!key) return null;

  const row = userMediaCacheByKey.get(key);
  if (!row) return null;

  if (Date.now() - Number(row.ts || 0) > CACHE_TTL_MS) {
    userMediaCacheByKey.delete(key);
    return null;
  }

  return row.value || null;
}

function setCachedUserMedia(userId, entityId, value) {
  const key = getUserMediaCacheKey(userId, entityId);
  if (!key || !value) return;

  userMediaCacheByKey.set(key, {
    value,
    ts: Date.now()
  });
}

function extractPrimarySourceFromCanonicalKey(canonicalKey = "") {
  const parts = String(canonicalKey).split(":").filter(Boolean);
  return normalizePrimarySource(parts[1] || "manual");
}

function buildTitlePrimary(entity = {}) {
  return (
    cleanText(entity.title_primary) ||
    cleanText(entity.title) ||
    cleanText(entity.title_ru) ||
    cleanText(entity.title_en) ||
    cleanText(entity.original_title) ||
    ""
  );
}

function buildOriginalTitle(entity = {}) {
  return (
    cleanText(entity.original_title) ||
    cleanText(entity.title_en) ||
    cleanText(entity.title) ||
    cleanText(entity.title_primary) ||
    ""
  );
}

function buildExternalIds(entity = {}) {
  return normalizeExternalIdsMap(entity.external_ids);
}

function slugifyWorkIdentity(title = "", author = "") {
  const titlePart = normalizeString(title)
    .replace(/\bкнига\b/g, "")
    .replace(/\bbook\b/g, "")
    .replace(/\bроман\b/g, "")
    .replace(/\bnovel\b/g, "")
    .replace(/\bтом\b/g, "")
    .replace(/\bvolume\b/g, "")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const authorPart = normalizeString(author)
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return [titlePart || "untitled", authorPart]
    .filter(Boolean)
    .join("-");
}

function getBookAuthorForIdentity(entity = {}) {
  const meta = normalizeJson(entity.meta, {});

  return (
    cleanText(safeArray(meta.author_names)[0]) ||
    cleanText(safeArray(meta.authors)[0]) ||
    cleanText(safeArray(entity.author_names)[0]) ||
    cleanText(safeArray(entity.authors)[0]) ||
    ""
  );
}

function buildCanonicalKey(entity = {}) {
  const existing = cleanLower(entity.canonical_key);
  const category = cleanLower(entity.category);
  const ids = buildExternalIds(entity);

  if (category === "books") {
    if (ids.wikidata) {
      return `books:wikidata:${cleanText(ids.wikidata)}`.toLowerCase();
    }

    if (existing.startsWith("books:wikidata:")) {
      return existing;
    }

    if (existing.startsWith("books:work:")) {
      return existing;
    }

    const title = buildTitlePrimary(entity) || buildOriginalTitle(entity);
    const author = getBookAuthorForIdentity(entity);

    return `books:work:${slugifyWorkIdentity(title, author)}`.toLowerCase();
  }

  if (existing) return existing;

  const source = normalizePrimarySource(entity.primary_source || entity.source || "");

  if (category && ids.wikidata) return `${category}:wikidata:${ids.wikidata}`.toLowerCase();
  if (category && ids.tmdb_id) return `${category}:tmdb:${ids.tmdb_id}`.toLowerCase();
  if (category && ids.tmdb) return `${category}:tmdb:${ids.tmdb}`.toLowerCase();
  if (category && ids.imdb_id) return `${category}:imdb:${ids.imdb_id}`.toLowerCase();
  if (category && ids.imdb) return `${category}:imdb:${ids.imdb}`.toLowerCase();
  if (category && ids.anilist_id) return `${category}:anilist:${ids.anilist_id}`.toLowerCase();
  if (category && ids.anilist) return `${category}:anilist:${ids.anilist}`.toLowerCase();
  if (category && ids.mal_id) return `${category}:mal:${ids.mal_id}`.toLowerCase();
  if (category && ids.mal) return `${category}:mal:${ids.mal}`.toLowerCase();

  if (category && ids.openlibrary_work) {
    return `${category}:openlibrary:${ids.openlibrary_work}`.toLowerCase();
  }

  const title = normalizeString(
    buildTitlePrimary(entity) || buildOriginalTitle(entity)
  )
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const year = normalizeYear(entity.year);

  return [category || "unknown", source || "manual", title || "untitled", year || ""]
    .filter(Boolean)
    .join(":")
    .toLowerCase();
}

function buildAliasList(entity = {}) {
  return normalizeArray([
    ...safeArray(entity.aliases),
    entity.title,
    entity.title_primary,
    entity.title_ru,
    entity.title_en,
    entity.original_title
  ]);
}

export function normalizeEntity(entity = {}) {
  const canonicalKey = buildCanonicalKey(entity);

  if (!canonicalKey) {
    throw new Error("У сущности нет canonical_key");
  }

  const category =
    cleanLower(entity.category) ||
    String(canonicalKey).split(":")[0] ||
    "";

  if (!category) {
    throw new Error("У сущности нет category");
  }

  const titlePrimary = buildTitlePrimary(entity);

  if (!titlePrimary) {
    throw new Error("У сущности нет названия");
  }

  const externalIds = buildExternalIds(entity);
  const meta = normalizeJson(entity.meta, {});

  return {
    canonical_key: canonicalKey,
    category,
    primary_source:
      normalizePrimarySource(entity.primary_source || entity.source) ||
      extractPrimarySourceFromCanonicalKey(canonicalKey),

    title_primary: titlePrimary,
    title_ru: cleanText(entity.title_ru),
    title_en: cleanText(entity.title_en),
    original_title: buildOriginalTitle(entity),

    year: normalizeYear(entity.year),
    cover_url: cleanText(entity.cover_url),

    description_ru: cleanText(entity.description_ru || entity.description || ""),
    description_en: cleanText(entity.description_en || ""),

    external_ids: externalIds,
    meta,

    aliases: buildAliasList(entity)
  };
}

function buildEntityPayload(entity) {
  return {
    canonical_key: entity.canonical_key,
    category: entity.category,
    primary_source: normalizePrimarySource(entity.primary_source),

    title_primary: entity.title_primary,
    title_ru: entity.title_ru,
    title_en: entity.title_en,
    original_title: entity.original_title,

    year: entity.year,
    cover_url: entity.cover_url,

    description_ru: entity.description_ru,
    description_en: entity.description_en,

    external_ids: entity.external_ids,
    meta: entity.meta
  };
}

function hasUsefulCover(value = "") {
  const cover = cleanText(value);

  if (!cover) return false;
  if (cover === "undefined" || cover === "null") return false;
  if (cover.includes("/placeholder")) return false;

  return /^https?:\/\//i.test(cover) || cover.startsWith("/");
}

function hasUsefulDescription(entity = {}) {
  return (
    cleanText(entity.description_ru).length >= 80 ||
    cleanText(entity.description_en).length >= 80
  );
}

function hasUsefulTitle(entity = {}) {
  return Boolean(
    cleanText(entity.title_primary) ||
    cleanText(entity.title_ru) ||
    cleanText(entity.title_en) ||
    cleanText(entity.original_title) ||
    cleanText(entity.title)
  );
}

function hasUsefulBookAuthor(entity = {}) {
  if (entity.category !== "books") return true;

  const meta = normalizeJson(entity.meta, {});
  return Boolean(
    cleanText(safeArray(meta.author_names)[0]) ||
    cleanText(safeArray(meta.authors)[0]) ||
    cleanText(safeArray(entity.author_names)[0]) ||
    cleanText(safeArray(entity.authors)[0])
  );
}

export function getEntityCompleteness(entity = {}) {
  const normalized = (() => {
    try {
      return normalizeEntity(entity);
    } catch {
      return {
        ...entity,
        category: cleanLower(entity.category),
        external_ids: buildExternalIds(entity),
        meta: normalizeJson(entity.meta, {})
      };
    }
  })();

  const missing = [];

  if (!cleanText(normalized.canonical_key)) missing.push("canonical_key");
  if (!cleanText(normalized.category)) missing.push("category");
  if (!hasUsefulTitle(normalized)) missing.push("title");
  if (!hasUsefulCover(normalized.cover_url)) missing.push("cover_url");
  if (!hasUsefulDescription(normalized)) missing.push("description");
  if (!hasHardIdentity(normalized)) missing.push("external_ids");

  if (normalized.category !== "books" && !normalizeYear(normalized.year)) {
    missing.push("year");
  }

  if (normalized.category === "books" && !hasUsefulBookAuthor(normalized)) {
    missing.push("author");
  }

  return {
    complete: missing.length === 0,
    missing,
    entity: normalized
  };
}

export function isCompleteEntity(entity = {}) {
  return getEntityCompleteness(entity).complete;
}

function assertCompleteEntityForCatalog(entity = {}) {
  const completeness = getEntityCompleteness(entity);

  if (completeness.complete) {
    return completeness.entity;
  }

  const missingText = completeness.missing.join(", ");

  throw new Error(
    `Карточка неполная и не может быть сохранена в каталог. Не хватает: ${missingText}`
  );
}

function pickBetterText(a = "", b = "") {
  const left = cleanText(a);
  const right = cleanText(b);

  if (!left) return right;
  if (!right) return left;

  return right.length > left.length ? right : left;
}

function pickBetterCover(a = "", b = "") {
  const left = cleanText(a);
  const right = cleanText(b);

  if (!left) return right;
  if (!right) return left;

  return left;
}

function looksLikeScreenDescription(value = "") {
  const text = cleanLower(value);

  if (!text) return false;

  return ["фильм", "film", "movie", "сериал", "tv series", "телесериал"].some((word) =>
    text.includes(word)
  );
}

function pickBookDescription(a = "", b = "") {
  const left = cleanText(a);
  const right = cleanText(b);

  if (!left) return right;
  if (!right) return left;

  const leftNoise = looksLikeScreenDescription(left);
  const rightNoise = looksLikeScreenDescription(right);

  if (!leftNoise && rightNoise) return left;
  if (leftNoise && !rightNoise) return right;

  return right.length > left.length ? right : left;
}

function mergeEntityPayload(existing = {}, incoming = {}) {
  if (!canMergeEntities(existing, incoming)) {
    console.warn("mergeEntityPayload blocked unsafe merge", {
      existing: existing?.canonical_key,
      incoming: incoming?.canonical_key,
      existingIds: existing?.external_ids,
      incomingIds: incoming?.external_ids
    });

    return buildEntityPayload(existing);
  }

  const existingAuthoritative = isAuthoritativeEntity(existing);
  const incomingAuthoritative = isAuthoritativeEntity(incoming);

  const existingCategory = cleanLower(existing.category);
  const incomingCategory = cleanLower(incoming.category);
  const isBookEntity = existingCategory === "books" || incomingCategory === "books";

  const existingIds = normalizeJson(existing.external_ids, {});
  const incomingIds = normalizeJson(incoming.external_ids, {});

  const resolvedExternalIds = normalizeExternalIdsMap({
    ...existingIds,
    ...incomingIds
  });

  const resolvedCategory = isBookEntity
    ? "books"
    : existingCategory || incomingCategory || "";

  const mergedMeta = {
    ...normalizeJson(existing.meta, {}),
    ...normalizeJson(incoming.meta, {})
  };

  const resolvedCanonicalKey = isBookEntity
    ? buildCanonicalKey({
        ...existing,
        ...incoming,
        category: "books",
        external_ids: resolvedExternalIds,
        title_primary: pickBetterText(existing.title_primary, incoming.title_primary),
        title_ru: pickBetterText(existing.title_ru, incoming.title_ru),
        title_en: pickBetterText(existing.title_en, incoming.title_en),
        original_title: pickBetterText(existing.original_title, incoming.original_title),
        meta: mergedMeta
      })
    : existing.canonical_key || incoming.canonical_key;

  const resolvedPrimarySource = normalizePrimarySource(
    incoming.primary_source ||
      existing.primary_source ||
      (resolvedExternalIds.tmdb || resolvedExternalIds.tmdb_id ? "tmdb" : "") ||
      (resolvedExternalIds.wikidata || resolvedExternalIds.wikidata_id ? "wikidata" : "") ||
      "manual"
  );

  if (existingAuthoritative && !incomingAuthoritative) {
    return {
      canonical_key: existing.canonical_key || resolvedCanonicalKey,
      category: existing.category || resolvedCategory,
      primary_source: existing.primary_source || resolvedPrimarySource,

      title_primary: existing.title_primary || incoming.title_primary,
      title_ru: existing.title_ru || incoming.title_ru,
      title_en: existing.title_en || incoming.title_en,
      original_title: existing.original_title || incoming.original_title,

      year: existing.year ?? incoming.year ?? null,
      cover_url: existing.cover_url || incoming.cover_url,

      description_ru: existing.description_ru || incoming.description_ru,
      description_en: existing.description_en || incoming.description_en,

      external_ids: resolvedExternalIds,
      meta: mergedMeta
    };
  }

  return {
    canonical_key: resolvedCanonicalKey,
    category: resolvedCategory,
    primary_source: resolvedPrimarySource,

    title_primary: incomingAuthoritative
      ? incoming.title_primary || existing.title_primary
      : pickBetterText(existing.title_primary, incoming.title_primary),
    title_ru: incomingAuthoritative
      ? incoming.title_ru || existing.title_ru
      : pickBetterText(existing.title_ru, incoming.title_ru),
    title_en: incomingAuthoritative
      ? incoming.title_en || existing.title_en
      : pickBetterText(existing.title_en, incoming.title_en),
    original_title: incomingAuthoritative
      ? incoming.original_title || existing.original_title
      : pickBetterText(existing.original_title, incoming.original_title),

    year: incoming.year ?? existing.year ?? null,
    cover_url: incomingAuthoritative
      ? incoming.cover_url || existing.cover_url
      : pickBetterCover(existing.cover_url, incoming.cover_url),

    description_ru: isBookEntity
      ? pickBookDescription(existing.description_ru, incoming.description_ru)
      : incomingAuthoritative
        ? incoming.description_ru || existing.description_ru
        : pickBetterText(existing.description_ru, incoming.description_ru),

    description_en: isBookEntity
      ? pickBookDescription(existing.description_en, incoming.description_en)
      : incomingAuthoritative
        ? incoming.description_en || existing.description_en
        : pickBetterText(existing.description_en, incoming.description_en),

    external_ids: resolvedExternalIds,
    meta: mergedMeta
  };
}

function possibleCanonicalKeys(entity = {}) {
  const ids = entity.external_ids || {};
  const category = cleanLower(entity.category);

  return uniqueArray(
    [
      entity.canonical_key,
      ids.wikidata_id ? `${category}:wikidata:${ids.wikidata_id}` : "",
      ids.wikidata ? `${category}:wikidata:${ids.wikidata}` : "",
      ids.tmdb_id ? `${category}:tmdb:${ids.tmdb_id}` : "",
      ids.tmdb ? `${category}:tmdb:${ids.tmdb}` : "",
      ids.imdb_id ? `${category}:imdb:${ids.imdb_id}` : "",
      ids.imdb ? `${category}:imdb:${ids.imdb}` : "",
      ids.anilist_id ? `${category}:anilist:${ids.anilist_id}` : "",
      ids.anilist ? `${category}:anilist:${ids.anilist}` : "",
      ids.mal_id ? `${category}:mal:${ids.mal_id}` : "",
      ids.mal ? `${category}:mal:${ids.mal}` : "",

      category === "books" && ids.openlibrary_work
        ? `books:openlibrary:${normalizeOpenLibraryWork(ids.openlibrary_work)}`
        : "",

      category !== "books" && ids.openlibrary_work
        ? `${category}:openlibrary:${normalizeOpenLibraryWork(ids.openlibrary_work)}`
        : ""
    ]
      .map((key) => cleanLower(key))
      .filter(Boolean)
  );
}

async function getEntityByAnyCanonicalKey(keys = []) {
  const cleanKeys = uniqueArray(safeArray(keys).map(cleanLower).filter(Boolean));
  if (!cleanKeys.length) return null;

  for (const key of cleanKeys) {
    const cached = getCachedEntity(key);
    if (cached?.id) return cached;
  }

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(MEDIA_ENTITIES_TABLE)
      .select("*")
      .in("canonical_key", cleanKeys)
      .limit(1),
    "Поиск сущности",
    READ_TIMEOUT_MS
  );

  if (error) throw error;

  const entity = data?.[0] || null;

  if (entity?.id) {
    setCachedEntity(entity);
  }

  return entity;
}

export async function getEntityByCanonicalKey(canonicalKey) {
  const key = cleanLower(canonicalKey);

  if (!key) return null;

  const cached = getCachedEntity(key);
  if (cached?.id) return cached;

  const entity = await getEntityByAnyCanonicalKey([key]);
  return entity || null;
}

export async function getEntityLightByCanonicalKey(canonicalKey) {
  const key = cleanLower(canonicalKey);

  if (!key) return null;

  const cached = getCachedEntity(key);

  if (cached?.id) {
    return cached;
  }

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(MEDIA_ENTITIES_TABLE)
      .select(`
        id,
        canonical_key,
        category,
        primary_source,
        title_primary,
        title_ru,
        title_en,
        original_title,
        year,
        cover_url,
        description_ru,
        description_en,
        external_ids,
        meta,
        universe_key,
        relations_built_at,
        relations_status,
        manual_locked,
        manual_verified
      `)
      .eq("canonical_key", key)
      .maybeSingle(),
    "Быстрая загрузка карточки из БД",
    READ_TIMEOUT_MS
  );

  if (error) throw error;

  if (data?.id) {
    setCachedEntity(data);
    scheduleEntityEnrichment(data);
  }

  return data || null;
}

async function findDuplicateEntity(entity = {}) {
  const exactKey = cleanLower(entity.canonical_key);

  if (exactKey) {
    const exact = await getEntityByAnyCanonicalKey([exactKey]).catch(() => null);
    if (exact?.id) return exact;
  }

  const keys = possibleCanonicalKeys(entity).filter((key) => key !== exactKey);
  if (!keys.length) return null;

  try {
    const candidate = await getEntityByAnyCanonicalKey(keys);
    if (!candidate?.id) return null;

    if (!canMergeEntities(candidate, entity)) {
      console.warn("findDuplicateEntity blocked unsafe duplicate match", {
        candidate: candidate.canonical_key,
        incoming: entity.canonical_key,
        candidateIds: candidate.external_ids,
        incomingIds: entity.external_ids
      });
      return null;
    }

    return candidate;
  } catch (error) {
    console.warn("findDuplicateEntity skipped:", error);
    return null;
  }
}

function buildAliasRows(entityId, aliases = [], source = "entity") {
  const normalizedSource = cleanText(source) || "entity";
  const seen = new Set();

  return normalizeArray(aliases)
    .map((alias) => {
      const aliasNormalized = normalizeString(alias);

      if (!aliasNormalized) return null;
      if (seen.has(aliasNormalized)) return null;

      seen.add(aliasNormalized);

      return {
        entity_id: entityId,
        alias,
        alias_normalized: aliasNormalized,
        source: normalizedSource
      };
    })
    .filter(Boolean);
}

export async function saveAliases(entityId, aliases = [], source = "entity") {
  if (!entityId) {
    throw new Error("saveAliases: entityId is required");
  }

  const rows = buildAliasRows(entityId, aliases, source);

  if (!rows.length) return [];

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(ENTITY_ALIASES_TABLE)
      .upsert(rows, { onConflict: "entity_id,alias_normalized" })
      .select("*"),
    "Сохранение алиасов",
    WRITE_TIMEOUT_MS
  ).catch((error) => ({ data: [], error }));

  if (error) {
    console.warn("Aliases save skipped:", error);
    return [];
  }

  return data || [];
}

function scheduleEntityEnrichment(entity = {}) {
  if (!entity?.id) return;

  if (isHardLockedEntity(entity) || isAuthoritativeEntity(entity)) {
    return;
  }

  if (!shouldEnrichEntity(entity)) {
    return;
  }

  enrichMediaEntityInBackground(entity);
}

export async function saveEntityIfMissing(inputEntity) {
  const entity = normalizeEntity(inputEntity);
  const cacheKey = cleanLower(entity.canonical_key);

  const cached = getCachedEntity(cacheKey);
  if (cached?.id) {
    scheduleEntityEnrichment(cached);
    return cached;
  }

  if (pendingEntitySaveByCanonicalKey.has(cacheKey)) {
    return pendingEntitySaveByCanonicalKey.get(cacheKey);
  }

  const promise = (async () => {
    const existing = await findDuplicateEntity(entity).catch(() => null);

    if (existing?.id) {
      setCachedEntity(existing);
      scheduleEntityEnrichment(existing);
      return existing;
    }

    const completeEntity = assertCompleteEntityForCatalog(entity);
    const payload = buildEntityPayload(completeEntity);

    const supabase = getSupabaseClient();

    const { data, error } = await withTimeout(
      supabase
        .from(MEDIA_ENTITIES_TABLE)
        .insert(payload)
        .select("*")
        .single(),
      "Сохранение полной сущности",
      WRITE_TIMEOUT_MS
    );

    if (error) throw error;

    setCachedEntity(data);

    saveAliases(data.id, completeEntity.aliases, completeEntity.primary_source).catch((error) => {
      console.warn("saveEntityIfMissing aliases skipped:", error);
    });

    scheduleEntityEnrichment(data);

    return data;
  })().finally(() => {
    pendingEntitySaveByCanonicalKey.delete(cacheKey);
  });

  pendingEntitySaveByCanonicalKey.set(cacheKey, promise);
  return promise;
}

export async function getUserLibraryEntryLight(userId, entityId) {
  const cleanUserId = cleanText(userId);
  const cleanEntityId = Number(entityId || 0);

  if (!cleanUserId || !cleanEntityId) return null;

  const cached = getCachedUserMedia(cleanUserId, cleanEntityId);
  if (cached) return cached;

  const cacheKey = getUserMediaCacheKey(cleanUserId, cleanEntityId);

  if (pendingUserMediaByKey.has(cacheKey)) {
    return pendingUserMediaByKey.get(cacheKey);
  }

  const promise = (async () => {
    const supabase = getSupabaseClient();

    const { data, error } = await withTimeout(
      supabase
        .from(USER_MEDIA_TABLE)
        .select(USER_MEDIA_WITH_ENTITY_SELECT)
        .eq("user_id", cleanUserId)
        .eq("entity_id", cleanEntityId)
        .maybeSingle(),
      "Быстрая проверка библиотеки",
      READ_TIMEOUT_MS
    );

    if (error) throw error;

    if (data) {
      setCachedUserMedia(cleanUserId, cleanEntityId, data);

      if (data.media_entities?.id) {
        setCachedEntity(data.media_entities);
        scheduleEntityEnrichment(data.media_entities);
      }
    }

    return data || null;
  })().finally(() => {
    pendingUserMediaByKey.delete(cacheKey);
  });

  pendingUserMediaByKey.set(cacheKey, promise);
  return promise;
}

export async function getUserLibraryEntry(userId, entityId, { full = true } = {}) {
  const cleanUserId = cleanText(userId);
  const cleanEntityId = Number(entityId || 0);

  if (!cleanUserId || !cleanEntityId) return null;

  if (!full) {
    return getUserLibraryEntryLight(cleanUserId, cleanEntityId);
  }

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(USER_MEDIA_TABLE)
      .select(USER_MEDIA_WITH_ENTITY_SELECT)
      .eq("user_id", cleanUserId)
      .eq("entity_id", cleanEntityId)
      .maybeSingle(),
    "Проверка библиотеки",
    READ_TIMEOUT_MS
  );

  if (error) throw error;

  if (data) {
    setCachedUserMedia(cleanUserId, cleanEntityId, data);

    if (data.media_entities?.id) {
      setCachedEntity(data.media_entities);
      scheduleEntityEnrichment(data.media_entities);
    }
  }

  return data || null;
}

export async function isAlreadyInUserLibrary(userId, entityId) {
  const existing = await getUserLibraryEntryLight(userId, entityId);
  return Boolean(existing);
}

export async function addToUserLibrary({
  userId,
  entity,
  status = "planned",
  folderName = ""
}) {
  const cleanUserId = cleanText(userId);

  if (!cleanUserId) {
    throw new Error("Пользователь не найден");
  }

  if (!entity || typeof entity !== "object") {
    throw new Error("Не передана карточка для добавления");
  }

  const savedEntity = await saveEntityIfMissing(entity);

  const existingEntry = await getUserLibraryEntryLight(cleanUserId, savedEntity.id);

  if (existingEntry) {
    const cachedEntry = {
      ...existingEntry,
      media_entities: existingEntry.media_entities || savedEntity
    };

    setCachedUserMedia(cleanUserId, savedEntity.id, cachedEntry);

    updateCachedLibraryItem(cleanUserId, cachedEntry, {
      category: existingEntry.category || savedEntity.category
    });

    scheduleEntityEnrichment(savedEntity);

    return {
      added: false,
      alreadyExists: true,
      entity: savedEntity,
      userMedia: cachedEntry
    };
  }

  const supabase = getSupabaseClient();

  const insertPayload = {
    user_id: cleanUserId,
    entity_id: savedEntity.id,
    category: savedEntity.category,
    status: cleanText(status) || "planned",
    folder_name: cleanText(folderName) || null
  };

  const { data, error } = await withTimeout(
    supabase
      .from(USER_MEDIA_TABLE)
      .insert(insertPayload)
      .select(USER_MEDIA_WITH_ENTITY_SELECT)
      .single(),
    "Добавление в библиотеку",
    WRITE_TIMEOUT_MS
  );

  if (error) throw error;

  const cachedEntry = {
    ...data,
    media_entities: data.media_entities || savedEntity
  };

  setCachedUserMedia(cleanUserId, savedEntity.id, cachedEntry);

  updateCachedLibraryItem(cleanUserId, cachedEntry, {
    category: cachedEntry.category || savedEntity.category
  });

  scheduleEntityEnrichment(cachedEntry.media_entities || savedEntity);

  return {
    added: true,
    alreadyExists: false,
    entity: cachedEntry.media_entities || savedEntity,
    userMedia: cachedEntry
  };
}
