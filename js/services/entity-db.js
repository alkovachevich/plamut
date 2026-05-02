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

const VALID_CATEGORIES = new Set(["books", "movies", "series", "anime", "manga"]);

const ALLOWED_PRIMARY_SOURCES = new Set([
  "wikidata",
  "openlibrary",
  "tmdb",
  "anilist",
  "jikan",
  "manual",
  "system",
  "search",
  "supabase",
  "alias"
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

function normalizeCategory(value = "") {
  const category = cleanLower(value);

  if (category === "book") return "books";
  if (category === "movie") return "movies";
  if (category === "tv") return "series";

  return VALID_CATEGORIES.has(category) ? category : "";
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

  if (normalized.anilist && !normalized.anilist_id) {
    normalized.anilist_id = cleanText(normalized.anilist);
  }

  if (normalized.anilist_id && !normalized.anilist) {
    normalized.anilist = cleanText(normalized.anilist_id);
  }

  if (normalized.mal && !normalized.mal_id) {
    normalized.mal_id = cleanText(normalized.mal);
  }

  if (normalized.mal_id && !normalized.mal) {
    normalized.mal = cleanText(normalized.mal_id);
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
    isTruthyFlag(meta.enrichment_protected) ||
    universeKey === "marvel" ||
    canonicalKey.startsWith("marvel:") ||
    canonicalKey.startsWith("mcu:") ||
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
  const category = normalizeCategory(entity.category);
  const ids = buildExternalIds(entity);

  if (category === "books") {
    if (ids.wikidata) return `books:wikidata:${cleanText(ids.wikidata)}`.toLowerCase();
    if (ids.wikidata_id) return `books:wikidata:${cleanText(ids.wikidata_id)}`.toLowerCase();

    if (ids.openlibrary_work) {
      return `books:openlibrary:${normalizeOpenLibraryWork(ids.openlibrary_work)}`.toLowerCase();
    }

    if (existing.startsWith("books:wikidata:")) return existing;
    if (existing.startsWith("books:openlibrary:")) return existing;
    if (existing.startsWith("books:work:")) return existing;

    const title = buildTitlePrimary(entity) || buildOriginalTitle(entity);
    const author = getBookAuthorForIdentity(entity);

    return `books:work:${slugifyWorkIdentity(title, author)}`.toLowerCase();
  }

  if (existing) return existing;

  const source = normalizePrimarySource(entity.primary_source || entity.source || "");

  if (category && ids.wikidata) return `${category}:wikidata:${ids.wikidata}`.toLowerCase();
  if (category && ids.wikidata_id) return `${category}:wikidata:${ids.wikidata_id}`.toLowerCase();
  if (category && ids.tmdb_id) return `${category}:tmdb:${ids.tmdb_id}`.toLowerCase();
  if (category && ids.tmdb) return `${category}:tmdb:${ids.tmdb}`.toLowerCase();
  if (category && ids.imdb_id) return `${category}:imdb:${ids.imdb_id}`.toLowerCase();
  if (category && ids.imdb) return `${category}:imdb:${ids.imdb}`.toLowerCase();
  if (category && ids.anilist_id) return `${category}:anilist:${ids.anilist_id}`.toLowerCase();
  if (category && ids.anilist) return `${category}:anilist:${ids.anilist}`.toLowerCase();
  if (category && ids.mal_id) return `${category}:mal:${ids.mal_id}`.toLowerCase();
  if (category && ids.mal) return `${category}:mal:${ids.mal}`.toLowerCase();

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
    entity.display_title,
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
    normalizeCategory(entity.category) ||
    normalizeCategory(String(canonicalKey).split(":")[0]) ||
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
        canonical_key: cleanText(entity.canonical_key),
        category: normalizeCategory(entity.category),
        external_ids: buildExternalIds(entity),
        meta: normalizeJson(entity.meta, {})
      };
    }
  })();

  const missing = [];

  if (!cleanText(normalized.canonical_key)) missing.push("canonical_key");
  if (!normalizeCategory(normalized.category)) missing.push("category");
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

function possibleCanonicalKeys(entity = {}) {
  const ids = entity.external_ids || {};
  const category = normalizeCategory(entity.category);

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
  if (cached?.id) return cached;

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
  const keys = possibleCanonicalKeys(entity);

  if (!keys.length) return null;

  try {
    return await getEntityByAnyCanonicalKey(keys);
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
  if (isHardLockedEntity(entity) || isAuthoritativeEntity(entity)) return;
  if (!shouldEnrichEntity(entity)) return;

  window.setTimeout?.(() => {
    enrichMediaEntityInBackground(entity).catch((error) => {
      console.warn("Entity enrichment skipped:", error);
    });
  }, 50);
}

async function insertCompleteEntity(entity = {}) {
  const completeEntity = assertCompleteEntityForCatalog(entity);
  const payload = buildEntityPayload(completeEntity);
  const key = cleanLower(payload.canonical_key);

  if (pendingEntitySaveByCanonicalKey.has(key)) {
    return pendingEntitySaveByCanonicalKey.get(key);
  }

  const promise = (async () => {
    const existing = await findDuplicateEntity(completeEntity);
    if (existing?.id) {
      setCachedEntity(existing);
      await saveAliases(existing.id, completeEntity.aliases, completeEntity.primary_source).catch(() => []);
      return existing;
    }

    const supabase = getSupabaseClient();

    const { data, error } = await withTimeout(
      supabase
        .from(MEDIA_ENTITIES_TABLE)
        .insert(payload)
        .select("*")
        .maybeSingle(),
      "Создание полной карточки",
      WRITE_TIMEOUT_MS
    );

    if (error) throw error;

    const created = data || null;

    if (created?.id) {
      setCachedEntity(created);
      await saveAliases(created.id, completeEntity.aliases, completeEntity.primary_source).catch(() => []);
      scheduleEntityEnrichment(created);
    }

    return created;
  })()
    .finally(() => {
      pendingEntitySaveByCanonicalKey.delete(key);
    });

  pendingEntitySaveByCanonicalKey.set(key, promise);
  return promise;
}

export async function saveEntityIfMissing(entity = {}) {
  const normalized = normalizeEntity(entity);
  const existing = await findDuplicateEntity(normalized);

  if (existing?.id) {
    setCachedEntity(existing);
    await saveAliases(existing.id, normalized.aliases, normalized.primary_source).catch(() => []);
    return existing;
  }

  return insertCompleteEntity(normalized);
}

async function getExistingUserMedia(userId, entityId) {
  const cached = getCachedUserMedia(userId, entityId);
  if (cached?.id) return cached;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(USER_MEDIA_TABLE)
      .select(USER_MEDIA_WITH_ENTITY_SELECT)
      .eq("user_id", userId)
      .eq("entity_id", entityId)
      .maybeSingle(),
    "Проверка карточки в библиотеке",
    READ_TIMEOUT_MS
  );

  if (error) throw error;

  if (data?.id) {
    setCachedUserMedia(userId, entityId, data);
  }

  return data || null;
}

async function insertUserMedia({ userId, entity, status = "planned", folderName = "" }) {
  const userMediaKey = `${userId}:${entity.id}`;

  if (pendingUserMediaByKey.has(userMediaKey)) {
    return pendingUserMediaByKey.get(userMediaKey);
  }

  const promise = (async () => {
    const existing = await getExistingUserMedia(userId, entity.id);

    if (existing?.id) {
      return {
        alreadyExists: true,
        userMedia: existing,
        entity: existing.media_entities || entity
      };
    }

    const supabase = getSupabaseClient();

    const payload = {
      user_id: userId,
      entity_id: entity.id,
      category: entity.category,
      status: cleanText(status) || "planned",
      folder_name: cleanText(folderName) || null
    };

    const { data, error } = await withTimeout(
      supabase
        .from(USER_MEDIA_TABLE)
        .insert(payload)
        .select(USER_MEDIA_WITH_ENTITY_SELECT)
        .maybeSingle(),
      "Добавление карточки в библиотеку",
      WRITE_TIMEOUT_MS
    );

    if (error) throw error;

    const row = data || null;

    if (row?.id) {
      setCachedUserMedia(userId, entity.id, row);
      updateCachedLibraryItem(userId, row);
    }

    return {
      alreadyExists: false,
      userMedia: row,
      entity: row?.media_entities || entity
    };
  })()
    .finally(() => {
      pendingUserMediaByKey.delete(userMediaKey);
    });

  pendingUserMediaByKey.set(userMediaKey, promise);
  return promise;
}

export async function addToUserLibrary({
  userId,
  entity,
  status = "planned",
  folderName = ""
} = {}) {
  if (!userId) {
    throw new Error("addToUserLibrary: userId is required");
  }

  if (!entity || typeof entity !== "object") {
    throw new Error("addToUserLibrary: entity is required");
  }

  const normalized = normalizeEntity(entity);
  const existing = await findDuplicateEntity(normalized);

  if (existing?.id) {
    setCachedEntity(existing);
    await saveAliases(existing.id, normalized.aliases, normalized.primary_source).catch(() => []);

    return insertUserMedia({
      userId,
      entity: existing,
      status,
      folderName
    });
  }

  const completeEntity = assertCompleteEntityForCatalog(normalized);
  const created = await insertCompleteEntity(completeEntity);

  if (!created?.id) {
    throw new Error("Не удалось создать карточку");
  }

  return insertUserMedia({
    userId,
    entity: created,
    status,
    folderName
  });
}

export async function findEntityBySearchIdentity(item = {}) {
  const normalized = normalizeEntity(item);
  return findDuplicateEntity(normalized);
}

export async function ensureEntityForLibrary(item = {}) {
  const normalized = normalizeEntity(item);
  const existing = await findDuplicateEntity(normalized);

  if (existing?.id) return existing;

  return insertCompleteEntity(normalized);
}
