import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";
import { normalizeString, safeArray, uniqueArray } from "../utils.js";
import { updateCachedLibraryItem } from "./library-cache.js";

const MEDIA_ENTITIES_TABLE = "media_entities";
const ENTITY_ALIASES_TABLE = "entity_aliases";
const USER_MEDIA_TABLE = "user_media";

const DEFAULT_TIMEOUT_MS = 12000;

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
    relations_status
  )
`;

function cleanText(value = "") {
  return typeof value === "string" ? value.trim() : String(value || "").trim();
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

function normalizeOpenLibraryWork(value = "") {
  return cleanText(value).replace("/works/", "");
}

function extractPrimarySourceFromCanonicalKey(canonicalKey = "") {
  const parts = String(canonicalKey).split(":").filter(Boolean);
  return parts[1] || "manual";
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
  const externalIds = normalizeJson(entity.external_ids, {});
  const result = { ...externalIds };

  if (result.openlibrary_work) {
    result.openlibrary_work = normalizeOpenLibraryWork(result.openlibrary_work);
  }

  return result;
}

function buildCanonicalKey(entity = {}) {
  const existing = cleanText(entity.canonical_key);
  if (existing) return existing.toLowerCase();

  const category = cleanText(entity.category).toLowerCase();
  const source = cleanText(entity.primary_source || entity.source || "").toLowerCase();
  const ids = buildExternalIds(entity);

  if (category && ids.wikidata) return `${category}:wikidata:${ids.wikidata}`.toLowerCase();
  if (category && ids.tmdb) return `${category}:tmdb:${ids.tmdb}`.toLowerCase();
  if (category && ids.imdb) return `${category}:imdb:${ids.imdb}`.toLowerCase();
  if (category && ids.anilist) return `${category}:anilist:${ids.anilist}`.toLowerCase();
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
    cleanText(entity.category).toLowerCase() ||
    String(canonicalKey).split(":")[0] ||
    "";

  if (!category) {
    throw new Error("У сущности нет category");
  }

  const titlePrimary = buildTitlePrimary(entity);

  if (!titlePrimary) {
    throw new Error("У сущности нет названия");
  }

  return {
    canonical_key: canonicalKey,
    category,
    primary_source:
      cleanText(entity.primary_source || entity.source) ||
      extractPrimarySourceFromCanonicalKey(canonicalKey),

    title_primary: titlePrimary,
    title_ru: cleanText(entity.title_ru),
    title_en: cleanText(entity.title_en),
    original_title: buildOriginalTitle(entity),

    year: normalizeYear(entity.year),
    cover_url: cleanText(entity.cover_url),

    description_ru: cleanText(entity.description_ru || entity.description || ""),
    description_en: cleanText(entity.description_en || ""),

    external_ids: buildExternalIds(entity),
    meta: normalizeJson(entity.meta, {}),

    aliases: buildAliasList(entity)
  };
}

function buildEntityPayload(entity) {
  return {
    canonical_key: entity.canonical_key,
    category: entity.category,
    primary_source: entity.primary_source,

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

function mergeEntityPayload(existing = {}, incoming = {}) {
  return {
    canonical_key: existing.canonical_key || incoming.canonical_key,
    category: incoming.category || existing.category || "",
    primary_source: incoming.primary_source || existing.primary_source || "manual",

    title_primary: incoming.title_primary || existing.title_primary || "",
    title_ru: incoming.title_ru || existing.title_ru || "",
    title_en: incoming.title_en || existing.title_en || "",
    original_title: incoming.original_title || existing.original_title || "",

    year: incoming.year ?? existing.year ?? null,
    cover_url: incoming.cover_url || existing.cover_url || "",

    description_ru: incoming.description_ru || existing.description_ru || "",
    description_en: incoming.description_en || existing.description_en || "",

    external_ids: {
      ...(existing.external_ids || {}),
      ...(incoming.external_ids || {})
    },

    meta: {
      ...(existing.meta || {}),
      ...(incoming.meta || {})
    }
  };
}

function possibleCanonicalKeys(entity = {}) {
  const ids = entity.external_ids || {};

  return uniqueArray(
    [
      entity.canonical_key,
      ids.wikidata ? `${entity.category}:wikidata:${ids.wikidata}` : "",
      ids.tmdb ? `${entity.category}:tmdb:${ids.tmdb}` : "",
      ids.imdb ? `${entity.category}:imdb:${ids.imdb}` : "",
      ids.anilist ? `${entity.category}:anilist:${ids.anilist}` : "",
      ids.mal ? `${entity.category}:mal:${ids.mal}` : "",
      ids.openlibrary_work ? `${entity.category}:openlibrary:${ids.openlibrary_work}` : ""
    ]
      .map((key) => cleanText(key).toLowerCase())
      .filter(Boolean)
  );
}

export async function getEntityByCanonicalKey(canonicalKey) {
  const key = cleanText(canonicalKey).toLowerCase();
  if (!key) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(MEDIA_ENTITIES_TABLE)
      .select("*")
      .eq("canonical_key", key)
      .maybeSingle(),
    "Загрузка карточки из БД",
    DEFAULT_TIMEOUT_MS
  );

  if (error) throw error;

  return data || null;
}

async function findDuplicateEntity(entity = {}) {
  const keys = possibleCanonicalKeys(entity);
  if (!keys.length) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(MEDIA_ENTITIES_TABLE)
      .select("*")
      .in("canonical_key", keys)
      .limit(1),
    "Поиск дубля сущности",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ data: [], error }));

  if (error) {
    console.warn("findDuplicateEntity skipped:", error);
    return null;
  }

  return data?.[0] || null;
}

function buildAliasRows(entityId, aliases = [], source = "entity") {
  const normalizedSource = cleanText(source) || "entity";

  return normalizeArray(aliases)
    .map((alias) => {
      const aliasNormalized = normalizeString(alias);
      if (!aliasNormalized) return null;

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
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ data: [], error }));

  if (error) {
    console.warn("Aliases save skipped:", error);
    return [];
  }

  return data || [];
}

export async function saveEntityIfMissing(inputEntity) {
  const entity = normalizeEntity(inputEntity);
  const supabase = getSupabaseClient();

  const existing =
    (await getEntityByCanonicalKey(entity.canonical_key).catch(() => null)) ||
    (await findDuplicateEntity(entity).catch(() => null));

  const mergedPayload = existing
    ? mergeEntityPayload(existing, entity)
    : buildEntityPayload(entity);

  const payload = buildEntityPayload({
    ...entity,
    ...mergedPayload,
    canonical_key: existing?.canonical_key || entity.canonical_key
  });

  const { data, error } = await withTimeout(
    supabase
      .from(MEDIA_ENTITIES_TABLE)
      .upsert(payload, { onConflict: "canonical_key" })
      .select("*")
      .single(),
    "Сохранение сущности",
    DEFAULT_TIMEOUT_MS
  );

  if (error) throw error;

  saveAliases(data.id, entity.aliases, entity.primary_source).catch((error) => {
    console.warn("saveEntityIfMissing aliases skipped:", error);
  });

  return data;
}

export async function getUserLibraryEntry(userId, entityId) {
  const cleanUserId = cleanText(userId);

  if (!cleanUserId || !entityId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(USER_MEDIA_TABLE)
      .select(USER_MEDIA_WITH_ENTITY_SELECT)
      .eq("user_id", cleanUserId)
      .eq("entity_id", entityId)
      .maybeSingle(),
    "Проверка библиотеки",
    DEFAULT_TIMEOUT_MS
  );

  if (error) throw error;

  return data || null;
}

export async function isAlreadyInUserLibrary(userId, entityId) {
  const existing = await getUserLibraryEntry(userId, entityId);
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
  const existingEntry = await getUserLibraryEntry(cleanUserId, savedEntity.id);

  if (existingEntry) {
    updateCachedLibraryItem(cleanUserId, existingEntry, {
      category: existingEntry.category || savedEntity.category
    });

    return {
      added: false,
      alreadyExists: true,
      entity: existingEntry.media_entities || savedEntity,
      userMedia: existingEntry
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
    DEFAULT_TIMEOUT_MS
  );

  if (error) throw error;

  updateCachedLibraryItem(cleanUserId, data, {
    category: data.category || savedEntity.category
  });

  return {
    added: true,
    alreadyExists: false,
    entity: data.media_entities || savedEntity,
    userMedia: data
  };
}
