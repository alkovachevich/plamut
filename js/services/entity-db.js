import { getSupabaseClient } from "../lib/supabase-client.js";
import { normalizeString, safeArray, uniqueArray } from "../utils.js";

const MEDIA_ENTITIES_TABLE = "media_entities";
const ENTITY_ALIASES_TABLE = "entity_aliases";
const USER_MEDIA_TABLE = "user_media";

/* =========================
   NORMALIZATION
========================= */

function cleanText(value = "") {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullableText(value = "") {
  const result = cleanText(value);
  return result || "";
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

function buildTitlePrimary(entity = {}) {
  return (
    cleanText(entity.title_primary) ||
    cleanText(entity.title) ||
    cleanText(entity.original_title) ||
    cleanText(entity.title_ru) ||
    cleanText(entity.title_en) ||
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

function buildDescriptionRu(entity = {}) {
  return cleanNullableText(entity.description_ru || entity.description || "");
}

function buildDescriptionEn(entity = {}) {
  return cleanNullableText(entity.description_en || "");
}

function buildPrimarySource(entity = {}) {
  return (
    cleanText(entity.primary_source) ||
    extractPrimarySourceFromCanonicalKey(entity.canonical_key) ||
    "unknown"
  );
}

function extractPrimarySourceFromCanonicalKey(canonicalKey = "") {
  const parts = String(canonicalKey).split(":").filter(Boolean);
  return parts[1] || "";
}

export function normalizeEntity(entity = {}) {
  const canonicalKey = cleanText(entity.canonical_key);

  if (!canonicalKey) {
    throw new Error("normalizeEntity: canonical_key is required");
  }

  const category =
    cleanText(entity.category) ||
    String(canonicalKey).split(":")[0] ||
    "";

  if (!category) {
    throw new Error("normalizeEntity: category is required");
  }

  const titlePrimary = buildTitlePrimary(entity);

  if (!titlePrimary) {
    throw new Error("normalizeEntity: title_primary/title is required");
  }

  return {
    canonical_key: canonicalKey,
    category,
    primary_source: buildPrimarySource(entity),

    title_primary: titlePrimary,
    title_ru: cleanNullableText(entity.title_ru),
    title_en: cleanNullableText(entity.title_en),
    original_title: buildOriginalTitle(entity),

    year: normalizeYear(entity.year),
    cover_url: cleanNullableText(entity.cover_url),

    description_ru: buildDescriptionRu(entity),
    description_en: buildDescriptionEn(entity),

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

/* =========================
   ENTITY FETCH
========================= */

export async function getEntityByCanonicalKey(canonicalKey) {
  const key = cleanText(canonicalKey);
  if (!key) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from(MEDIA_ENTITIES_TABLE)
    .select("*")
    .eq("canonical_key", key)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

/* =========================
   ALIASES
========================= */

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

  const { data, error } = await supabase
    .from(ENTITY_ALIASES_TABLE)
    .upsert(rows, {
      onConflict: "entity_id,alias_normalized"
    })
    .select("*");

  if (error) {
    throw error;
  }

  return data || [];
}

/* =========================
   ENTITY SAVE
========================= */

function buildEntityInsertPayload(entity) {
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
    primary_source:
      incoming.primary_source || existing?.primary_source || "unknown",

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

  const existing = await getEntityByCanonicalKey(entity.canonical_key);
  const payload = buildEntityInsertPayload(
    existing ? mergeEntityPayload(existing, entity) : entity
  );

  const { data, error } = await supabase
    .from(MEDIA_ENTITIES_TABLE)
    .upsert(payload, {
      onConflict: "canonical_key"
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await saveAliases(data.id, entity.aliases, entity.primary_source);

  return data;
}

/* =========================
   USER LIBRARY
========================= */

export async function getUserLibraryEntry(userId, entityId) {
  const cleanUserId = cleanText(userId);

  if (!cleanUserId || !entityId) {
    return null;
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from(USER_MEDIA_TABLE)
    .select("*")
    .eq("user_id", cleanUserId)
    .eq("entity_id", entityId)
    .maybeSingle();

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
    throw new Error("addToUserLibrary: userId is required");
  }

  if (!entity || typeof entity !== "object") {
    throw new Error("addToUserLibrary: entity is required");
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

  const { data, error } = await supabase
    .from(USER_MEDIA_TABLE)
    .insert(insertPayload)
    .select("*")
    .single();

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
