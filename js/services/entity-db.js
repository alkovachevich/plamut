import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";
import { normalizeString, safeArray, uniqueArray } from "../utils.js";

const MEDIA_ENTITIES_TABLE = "media_entities";
const ENTITY_ALIASES_TABLE = "entity_aliases";
const USER_MEDIA_TABLE = "user_media";

function cleanText(value = "") {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeYear(value) {
  if (value === null || value === undefined || value === "") return null;
  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function normalizeJson(value, fallback = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  return value;
}

function normalizeArray(value) {
  return uniqueArray(
    safeArray(value)
      .map((item) => cleanText(item))
      .filter(Boolean)
  );
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

export function normalizeEntity(entity = {}) {
  const canonicalKey = cleanText(entity.canonical_key);

  if (!canonicalKey) {
    throw new Error("У сущности нет canonical_key");
  }

  const category =
    cleanText(entity.category) ||
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
      cleanText(entity.primary_source) ||
      extractPrimarySourceFromCanonicalKey(canonicalKey),

    title_primary: titlePrimary,
    title_ru: cleanText(entity.title_ru),
    title_en: cleanText(entity.title_en),
    original_title: buildOriginalTitle(entity),

    year: normalizeYear(entity.year),
    cover_url: cleanText(entity.cover_url),

    description_ru: cleanText(entity.description_ru || entity.description || ""),
    description_en: cleanText(entity.description_en || ""),

    external_ids: normalizeJson(entity.external_ids, {}),
    meta: normalizeJson(entity.meta, {}),

    aliases: normalizeArray([
      ...safeArray(entity.aliases),
      entity.title,
      entity.title_primary,
      entity.title_ru,
      entity.title_en,
      entity.original_title
    ])
  };
}

export async function getEntityByCanonicalKey(canonicalKey) {
  const key = cleanText(canonicalKey);
  if (!key) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(MEDIA_ENTITIES_TABLE)
      .select("*")
      .eq("canonical_key", key)
      .maybeSingle(),
    "Загрузка карточки из БД"
  );

  if (error) {
    throw error;
  }

  return data || null;
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

  if (!rows.length) {
    return [];
  }

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(ENTITY_ALIASES_TABLE)
      .upsert(rows, { onConflict: "entity_id,alias_normalized" })
      .select("*"),
    "Сохранение алиасов"
  );

  if (error) {
    throw error;
  }

  return data || [];
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

function mergeEntityPayload(existing, incoming) {
  return {
    canonical_key: incoming.canonical_key,
    category: incoming.category || existing?.category || "",
    primary_source: incoming.primary_source || existing?.primary_source || "manual",

    title_primary: incoming.title_primary || existing?.title_primary || "",
    title_ru: incoming.title_ru || existing?.title_ru || "",
    title_en: incoming.title_en || existing?.title_en || "",
    original_title: incoming.original_title || existing?.original_title || "",

    year: incoming.year ?? existing?.year ?? null,
    cover_url: incoming.cover_url || existing?.cover_url || "",

    description_ru: incoming.description_ru || existing?.description_ru || "",
    description_en: incoming.description_en || existing?.description_en || "",

    external_ids: {
      ...(existing?.external_ids || {}),
      ...(incoming.external_ids || {})
    },
    meta: {
      ...(existing?.meta || {}),
      ...(incoming.meta || {})
    }
  };
}

export async function saveEntityIfMissing(inputEntity) {
  const entity = normalizeEntity(inputEntity);
  const supabase = getSupabaseClient();

  const existing = await getEntityByCanonicalKey(entity.canonical_key).catch(() => null);
  const payload = buildEntityPayload(existing ? mergeEntityPayload(existing, entity) : entity);

  const { data, error } = await withTimeout(
    supabase
      .from(MEDIA_ENTITIES_TABLE)
      .upsert(payload, { onConflict: "canonical_key" })
      .select("*")
      .single(),
    "Сохранение сущности"
  );

  if (error) {
    throw error;
  }

  await saveAliases(data.id, entity.aliases, entity.primary_source).catch((error) => {
    console.warn("Aliases save skipped:", error);
  });

  return data;
}

export async function getUserLibraryEntry(userId, entityId) {
  const cleanUserId = cleanText(userId);

  if (!cleanUserId || !entityId) {
    return null;
  }

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(USER_MEDIA_TABLE)
      .select("*")
      .eq("user_id", cleanUserId)
      .eq("entity_id", entityId)
      .maybeSingle(),
    "Проверка библиотеки"
  );

  if (error) {
    throw error;
  }

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
    return {
      added: false,
      alreadyExists: true,
      entity: savedEntity,
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
      .select("*")
      .single(),
    "Добавление в библиотеку"
  );

  if (error) {
    throw error;
  }

  return {
    added: true,
    alreadyExists: false,
    entity: savedEntity,
    userMedia: data
  };
}
