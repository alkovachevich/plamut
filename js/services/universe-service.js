import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";
import { normalizeString, safeArray, uniqueArray } from "../utils.js";
import { fetchJsonCached } from "./api-cache.js";
import {
  loadUserLibrary,
  getCachedLibrary,
  updateCachedLibraryItem
} from "./library-cache.js";
import {
  updateUniverseBuildJob,
  UNIVERSE_JOB_STATUS
} from "./universe-build-jobs.js";

const DEFAULT_TIMEOUT_MS = 30000;
const EDGE_FUNCTION_NAME = "plamut-universe-normalize";

const RELATION_LABELS = {
  direct_sequel: "Прямое продолжение",
  direct_prequel: "Прямой приквел",
  adaptation: "Экранизация",
  source_material: "Источник",
  spin_off: "Спинофф",
  same_universe: "Одна вселенная",
  book_series: "Серия книг",
  release_order: "Порядок выхода",
  story_chronology: "Хронология событий",
  related_work: "Связанное",
  alternate_version: "Альтернативная версия",
  reboot: "Перезапуск",
  remake: "Ремейк"
};

const RELATION_TYPES = new Set([
  "direct_sequel",
  "direct_prequel",
  "adaptation",
  "source_material",
  "spin_off",
  "same_universe",
  "book_series",
  "release_order",
  "story_chronology",
  "related_work",
  "alternate_version",
  "reboot",
  "remake"
]);

const ALLOWED_DB_SOURCES = new Set([
  "library",
  "wikidata",
  "user",
  "openai"
]);

function clean(value = "") {
  return String(value || "").trim();
}

function cleanLower(value = "") {
  return clean(value).toLowerCase();
}

function slugify(value = "") {
  return normalizeString(value)
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function compact(value = "") {
  return normalizeString(value).replace(/\s+/g, " ").trim();
}

function resolveTitle(entity = {}) {
  return (
    entity.title_primary ||
    entity.title_ru ||
    entity.title_en ||
    entity.original_title ||
    entity.title ||
    "Без названия"
  );
}

function resolveDescription(entity = {}) {
  return entity.description_ru || entity.description_en || entity.description || "";
}

function normalizeRelationType(type = "") {
  const cleanType = cleanLower(type);
  return RELATION_TYPES.has(cleanType) ? cleanType : "related_work";
}

function normalizeRelationSource(source = "") {
  const cleanSource = cleanLower(source);

  if (ALLOWED_DB_SOURCES.has(cleanSource)) {
    return cleanSource;
  }

  if (cleanSource === "openai" || cleanSource === "ai") {
    return "openai";
  }

  return "wikidata";
}

function normalizeConfidence(value, fallback = 0.65) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function normalizeWorkId(value = "") {
  return clean(value).replace("/works/", "");
}

function titleCandidates(entity = {}) {
  return uniqueArray([
    entity.title_primary,
    entity.title_ru,
    entity.title_en,
    entity.original_title,
    entity.title
  ])
    .map(compact)
    .filter(Boolean);
}

function firstUsefulWords(title = "") {
  const stopWords = new Set([
    "и",
    "and",
    "the",
    "a",
    "an",
    "of",
    "de",
    "la",
    "le",
    "книга",
    "book",
    "роман",
    "novel",
    "том",
    "volume",
    "часть",
    "part",
    "season",
    "сезон",
    "movie",
    "film",
    "фильм",
    "серия"
  ]);

  return compact(title)
    .split(" ")
    .filter((word) => word && !stopWords.has(word))
    .slice(0, 3);
}

function knownUniverseKeyFromTitle(title = "") {
  const normalized = compact(title);

  const known = [
    ["harry potter", "harry-potter", "Harry Potter"],
    ["гарри поттер", "harry-potter", "Гарри Поттер"],
    ["iron man", "marvel", "Marvel"],
    ["железный человек", "marvel", "Marvel"],
    ["avengers", "marvel", "Marvel"],
    ["мстители", "marvel", "Marvel"],
    ["marvel", "marvel", "Marvel"],
    ["star wars", "star-wars", "Star Wars"],
    ["звездные войны", "star-wars", "Звёздные войны"],
    ["звёздные войны", "star-wars", "Звёздные войны"],
    ["lord of the rings", "middle-earth", "Middle-earth"],
    ["властелин колец", "middle-earth", "Средиземье"],
    ["hobbit", "middle-earth", "Middle-earth"],
    ["хоббит", "middle-earth", "Средиземье"],
    ["witcher", "witcher", "The Witcher"],
    ["ведьмак", "witcher", "Ведьмак"],
    ["naruto", "naruto", "Naruto"],
    ["наруто", "naruto", "Naruto"]
  ];

  const match = known.find(([needle]) => normalized.includes(needle));
  if (!match) return null;

  return {
    universe_key: match[1],
    title: match[2]
  };
}

export function deriveUniverseInfo(entity = {}) {
  const titles = titleCandidates(entity);

  for (const title of titles) {
    const known = knownUniverseKeyFromTitle(title);
    if (known) return known;
  }

  const baseTitle = titles[0] || compact(resolveTitle(entity));
  const words = firstUsefulWords(baseTitle);

  if (!words.length) {
    const fallback = entity.canonical_key || `entity-${entity.id || Date.now()}`;

    return {
      universe_key: slugify(fallback),
      title: resolveTitle(entity)
    };
  }

  return {
    universe_key: slugify(words.join("-")),
    title: words.map((word) => word.slice(0, 1).toUpperCase() + word.slice(1)).join(" ")
  };
}

function entityToAiPayload(entity = {}) {
  return {
    id: entity.id || null,
    canonical_key: entity.canonical_key || "",
    category: entity.category || "",
    title_primary: entity.title_primary || "",
    title_ru: entity.title_ru || "",
    title_en: entity.title_en || "",
    original_title: entity.original_title || "",
    year: entity.year || null,
    description_ru: entity.description_ru || "",
    description_en: entity.description_en || "",
    external_ids: entity.external_ids || {},
    universe_key: entity.universe_key || ""
  };
}

function itemToAiPayload(item = {}) {
  const entity = item.media_entities || item;

  return {
    user_media_id: item.id || null,
    status: item.status || "",
    folder_name: item.folder_name || "",
    entity: entityToAiPayload(entity)
  };
}

function normalizeAiResult(payload = {}, seedEntity = {}) {
  const fallbackUniverse = deriveUniverseInfo(seedEntity);
  const universe = payload?.universe || {};

  const universeKey = slugify(
    universe.universe_key ||
      universe.key ||
      payload.universe_key ||
      fallbackUniverse.universe_key ||
      seedEntity.universe_key ||
      seedEntity.canonical_key
  );

  const title = clean(
    universe.title ||
      payload.title ||
      universe.name ||
      fallbackUniverse.title ||
      resolveTitle(seedEntity)
  );

  const description = clean(
    universe.description ||
      payload.description ||
      resolveDescription(seedEntity)
  );

  const relations = safeArray(payload?.relations)
    .map((relation, index) => ({
      from_entity_id: Number(relation.from_entity_id || relation.from_id || seedEntity.id),
      to_entity_id: Number(relation.to_entity_id || relation.to_id),
      relation_type: normalizeRelationType(relation.relation_type || relation.type),
      confidence: normalizeConfidence(relation.confidence, 0.75),
      sort_order: Number.isFinite(Number(relation.sort_order)) ? Number(relation.sort_order) : index,
      source: "wikidata",
      metadata_json: {
        ...(relation.metadata_json || relation.metadata || {}),
        reason: clean(relation.reason || relation.explanation || "")
      }
    }))
    .filter((relation) => relation.from_entity_id && relation.to_entity_id);

  const order = safeArray(payload?.release_order || payload?.story_chronology || payload?.order || payload?.chronology)
    .map((entry, index) => ({
      entity_id: Number(entry.entity_id || entry.id),
      sort_order: Number.isFinite(Number(entry.sort_order)) ? Number(entry.sort_order) : index
    }))
    .filter((entry) => entry.entity_id);

  return {
    universe: {
      universe_key: universeKey,
      title,
      description
    },
    relations,
    order
  };
}

async function invokeUniverseNormalizeFunction({ seedEntity, items, localRelations }) {
  const supabase = getSupabaseClient();

  const payload = {
    seed: entityToAiPayload(seedEntity),
    library_items: safeArray(items).map(itemToAiPayload),
    wikidata_data: safeArray(localRelations),
    local_relations: safeArray(localRelations),
    existing_entities: safeArray(items).map((item) => item.media_entities || item),
    instruction:
      "Normalize one media universe. Return JSON with universe, relations and chronology/order. Use only provided IDs. Do not invent unavailable entity IDs."
  };

  const { data, error } = await withTimeout(
    supabase.functions.invoke(EDGE_FUNCTION_NAME, {
      body: payload
    }),
    "OpenAI нормализация вселенной",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ data: null, error }));

  if (error) {
    console.warn("OpenAI universe normalization skipped:", error);
    return null;
  }

  return data || null;
}

function sharedExternalId(a = {}, b = {}) {
  const aIds = a.external_ids || {};
  const bIds = b.external_ids || {};

  if (aIds.wikidata && bIds.wikidata && aIds.wikidata === bIds.wikidata) return true;
  if (aIds.tmdb && bIds.tmdb && String(aIds.tmdb) === String(bIds.tmdb)) return true;
  if (aIds.imdb && bIds.imdb && String(aIds.imdb) === String(bIds.imdb)) return true;
  if (aIds.anilist && bIds.anilist && String(aIds.anilist) === String(bIds.anilist)) return true;
  if (aIds.mal && bIds.mal && String(aIds.mal) === String(bIds.mal)) return true;

  const aWork = normalizeWorkId(aIds.openlibrary_work);
  const bWork = normalizeWorkId(bIds.openlibrary_work);

  if (aWork && bWork && aWork === bWork) return true;

  const aIsbn = safeArray(aIds.isbn).map(String);
  const bIsbn = safeArray(bIds.isbn).map(String);

  return aIsbn.some((isbn) => bIsbn.includes(isbn));
}

function sameUniverseByTitle(a = {}, b = {}) {
  const aInfo = deriveUniverseInfo(a);
  const bInfo = deriveUniverseInfo(b);

  return Boolean(
    aInfo.universe_key &&
      bInfo.universe_key &&
      aInfo.universe_key === bInfo.universe_key
  );
}

function relationTypeBetween(a = {}, b = {}) {
  if (a.category === "books" && ["movies", "series", "anime"].includes(b.category)) {
    return "adaptation";
  }

  if (b.category === "books" && ["movies", "series", "anime"].includes(a.category)) {
    return "source_material";
  }

  if (a.category === "books" && b.category === "books") {
    return "book_series";
  }

  if (a.category === b.category) {
    return "related_work";
  }

  return "same_universe";
}

function scoreRelation(a = {}, b = {}) {
  if (sharedExternalId(a, b)) return 1;
  if (clean(a.universe_key) && clean(a.universe_key) === clean(b.universe_key)) return 0.85;
  return 0.6;
}

function reverseRelationType(type = "related_work") {
  if (type === "adaptation") return "source_material";
  if (type === "source_material") return "adaptation";
  if (type === "direct_sequel") return "direct_prequel";
  if (type === "direct_prequel") return "direct_sequel";
  return type;
}

function sortUniverseItems(items = [], orderMap = new Map()) {
  return [...safeArray(items)].sort((a, b) => {
    const aId = Number(a.media_entities?.id || a.entity_id || a.id);
    const bId = Number(b.media_entities?.id || b.entity_id || b.id);

    if (orderMap.has(aId) || orderMap.has(bId)) {
      return (orderMap.get(aId) ?? 9999) - (orderMap.get(bId) ?? 9999);
    }

    const ay = Number(a.media_entities?.year || 0);
    const by = Number(b.media_entities?.year || 0);

    if (ay && by && ay !== by) return ay - by;

    return resolveTitle(a.media_entities || {}).localeCompare(
      resolveTitle(b.media_entities || {}),
      "ru"
    );
  });
}

async function fetchUserLibrary(userId, options = {}) {
  if (!userId) return [];

  const cached = getCachedLibrary(userId, {
    mode: options.mode || "full"
  });

  if (cached.length) return cached;

  const full = await loadUserLibrary(userId, {
    mode: "full",
    allowStale: true,
    backgroundRefresh: false
  }).catch(() => []);

  if (full.length) return full;

  return loadUserLibrary(userId, {
    mode: "list",
    allowStale: true,
    backgroundRefresh: false
  }).catch(() => []);
}

async function fetchUserLibraryEntryByEntityId(userId, entityId) {
  if (!userId || !entityId) return null;

  const libraryItems = await fetchUserLibrary(userId, { mode: "full" });
  const cached = libraryItems.find((item) => Number(item.entity_id) === Number(entityId));

  if (cached) return cached;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("user_media")
      .select(`
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
      `)
      .eq("user_id", userId)
      .eq("entity_id", entityId)
      .maybeSingle(),
    "Загрузка элемента библиотеки",
    DEFAULT_TIMEOUT_MS
  );

  if (error) throw error;

  return data || null;
}

async function fetchSavedRelations(entityId) {
  if (!entityId) return [];

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("media_relations")
      .select("*")
      .eq("from_entity_id", entityId)
      .order("confidence", { ascending: false }),
    "Загрузка связей",
    DEFAULT_TIMEOUT_MS
  );

  if (error) throw error;

  return safeArray(data);
}

async function fetchUniverseGroup(universeKey) {
  if (!universeKey) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("universe_groups")
      .select("*")
      .eq("universe_key", universeKey)
      .maybeSingle(),
    "Загрузка группы вселенной",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ data: null, error }));

  if (error) {
    console.warn("fetchUniverseGroup skipped:", error);
    return null;
  }

  return data || null;
}

async function fetchUniverseMembers(universeKey) {
  if (!universeKey) return [];

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("universe_members")
      .select(`
        *,
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
      `)
      .eq("universe_key", universeKey)
      .order("sort_order", { ascending: true }),
    "Загрузка участников вселенной",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ data: [], error }));

  if (error) {
    console.warn("fetchUniverseMembers skipped:", error);
    return [];
  }

  return safeArray(data)
    .filter((row) => row.media_entities)
    .map((row) => ({
      id: null,
      entity_id: row.entity_id,
      category: row.media_entities.category,
      status: "planned",
      folder_name: null,
      created_at: null,
      sort_order: row.sort_order ?? null,
      role: row.role || "member",
      media_entities: row.media_entities
    }));
}

async function fetchRelationsForEntityIds(entityIds = []) {
  const ids = uniqueArray(safeArray(entityIds).map(Number).filter(Boolean));
  if (!ids.length) return [];

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("media_relations")
      .select("*")
      .in("from_entity_id", ids)
      .order("confidence", { ascending: false }),
    "Загрузка связей вселенной",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ data: [], error }));

  if (error) {
    console.warn("fetchRelationsForEntityIds skipped:", error);
    return [];
  }

  return safeArray(data);
}

async function upsertUniverseGroup({
  universe_key,
  title,
  description = "",
  cover_url = "",
  source = "library",
  metadata_json = {}
}) {
  const supabase = getSupabaseClient();

  const payload = {
    universe_key,
    title,
    description,
    cover_url,
    source: normalizeRelationSource(source),
    metadata_json
  };

  const { data, error } = await withTimeout(
    supabase
      .from("universe_groups")
      .upsert(payload, { onConflict: "universe_key" })
      .select()
      .single(),
    "Сохранение группы вселенной",
    DEFAULT_TIMEOUT_MS
  );

  if (error) throw error;

  return data;
}

async function upsertUniverseMembers(universeKey, items = [], orderMap = new Map()) {
  const supabase = getSupabaseClient();

  const rows = sortUniverseItems(items, orderMap)
    .map((item, index) => {
      const entityId = item.media_entities?.id || item.entity_id || item.id;
      if (!entityId) return null;

      return {
        universe_key: universeKey,
        entity_id: entityId,
        role: item.role || "member",
        sort_order: orderMap.has(Number(entityId)) ? orderMap.get(Number(entityId)) : index
      };
    })
    .filter(Boolean);

  if (!rows.length) return [];

  const { data, error } = await withTimeout(
    supabase
      .from("universe_members")
      .upsert(rows, { onConflict: "universe_key,entity_id" })
      .select(),
    "Сохранение участников вселенной",
    DEFAULT_TIMEOUT_MS
  );

  if (error) throw error;

  return data || [];
}

async function upsertMediaRelations(rows = []) {
  const cleanRows = safeArray(rows)
    .filter((row) => row.from_entity_id && row.to_entity_id && row.from_entity_id !== row.to_entity_id)
    .map((row, index) => ({
      from_entity_id: Number(row.from_entity_id),
      to_entity_id: Number(row.to_entity_id),
      relation_type: normalizeRelationType(row.relation_type),
      source: normalizeRelationSource(row.source),
      confidence: normalizeConfidence(row.confidence),
      sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index,
      metadata_json: row.metadata_json || {}
    }));

  if (!cleanRows.length) return [];

  const uniqueRows = Array.from(
    new Map(
      cleanRows.map((row) => [
        `${row.from_entity_id}:${row.to_entity_id}:${row.relation_type}`,
        row
      ])
    ).values()
  );

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("media_relations")
      .upsert(uniqueRows, { onConflict: "from_entity_id,to_entity_id,relation_type" })
      .select(),
    "Сохранение связей",
    DEFAULT_TIMEOUT_MS
  );

  if (error) throw error;

  return data || [];
}

async function markRelationsStatus(entityId, status, universeKey = null) {
  if (!entityId) return;

  const supabase = getSupabaseClient();

  const payload = {
    relations_status: status
  };

  if (status === "ready") {
    payload.relations_built_at = new Date().toISOString();
  }

  if (universeKey) {
    payload.universe_key = universeKey;
  }

  await withTimeout(
    supabase.from("media_entities").update(payload).eq("id", entityId),
    "Обновление статуса связей",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => {
    console.warn("markRelationsStatus skipped:", error);
  });
}

function getUniverseItemsForSeed(seedEntity, libraryItems = []) {
  if (!seedEntity) return [];

  return safeArray(libraryItems).filter((item) => {
    const entity = item.media_entities;
    if (!entity?.id) return false;
    if (entity.id === seedEntity.id) return true;
    if (sharedExternalId(seedEntity, entity)) return true;
    if (seedEntity.universe_key && entity.universe_key && seedEntity.universe_key === entity.universe_key) return true;
    return false;
  });
}

function buildRelationRows(seedEntity, items = []) {
  return safeArray(items)
    .filter((item) => item.media_entities?.id && item.media_entities.id !== seedEntity.id)
    .flatMap((item, index) => {
      const target = item.media_entities;
      const type = relationTypeBetween(seedEntity, target);
      const confidence = scoreRelation(seedEntity, target);
      const reverseType = reverseRelationType(type);

      return [
        {
          from_entity_id: seedEntity.id,
          to_entity_id: target.id,
          relation_type: type,
          source: "library",
          confidence,
          sort_order: index,
          metadata_json: {
            reason: sharedExternalId(seedEntity, target)
              ? "shared_external_id"
              : "same_universe_key"
          }
        },
        {
          from_entity_id: target.id,
          to_entity_id: seedEntity.id,
          relation_type: reverseType,
          source: "library",
          confidence,
          sort_order: index,
          metadata_json: {
            reason: "reverse_relation"
          }
        }
      ];
    });
}

function buildReverseAiRelations(relations = []) {
  return safeArray(relations).map((relation) => ({
    from_entity_id: relation.to_entity_id,
    to_entity_id: relation.from_entity_id,
    relation_type: reverseRelationType(relation.relation_type),
    source: "wikidata",
    confidence: relation.confidence,
    sort_order: relation.sort_order,
    metadata_json: {
      ...(relation.metadata_json || {}),
      reason: relation.metadata_json?.reason
        ? `reverse: ${relation.metadata_json.reason}`
        : "reverse_relation"
    }
  }));
}

async function fetchWikidataSearch(entity = {}) {
  const title = entity.title_primary || entity.title_en || entity.title_ru || entity.original_title || "";
  if (!title) return [];

  return fetchJsonCached(
    "wikidata",
    { type: "search", title },
    async () => {
      const url = new URL("https://www.wikidata.org/w/api.php");
      url.searchParams.set("action", "wbsearchentities");
      url.searchParams.set("format", "json");
      url.searchParams.set("search", title);
      url.searchParams.set("language", "en");
      url.searchParams.set("origin", "*");
      url.searchParams.set("limit", "10");

      const res = await fetch(url.toString());
      if (!res.ok) return [];

      const data = await res.json();
      return safeArray(data?.search);
    },
    { ttlMs: 1000 * 60 * 60 * 24 * 7 }
  ).catch(() => []);
}

async function saveWikidataEntities(items = [], fallbackCategory = "unknown") {
  const rows = safeArray(items)
    .filter((item) => item?.id && item?.label)
    .map((item) => ({
      canonical_key: `${fallbackCategory}:wikidata:${item.id}`.toLowerCase(),
      category: fallbackCategory || "unknown",
      primary_source: "wikidata",
      title_primary: item.label || item.id,
      title_en: item.label || "",
      title_ru: "",
      original_title: item.label || "",
      year: null,
      cover_url: "",
      description_en: item.description || "",
      description_ru: "",
      external_ids: {
        wikidata: item.id
      },
      meta: {
        wikidata_search: item
      }
    }));

  if (!rows.length) return [];

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("media_entities")
      .upsert(rows, { onConflict: "canonical_key" })
      .select("*"),
    "Сохранение Wikidata сущностей",
    DEFAULT_TIMEOUT_MS
  );

  if (error) {
    console.warn("saveWikidataEntities skipped:", error);
    return [];
  }

  return data || [];
}


function preDedupeUniverseItems(seedEntity, items = [], limit = 40) {
  const map = new Map();

  const seedKey = cleanLower(seedEntity?.canonical_key || "") || `id:${seedEntity?.id || "seed"}`;
  map.set(seedKey, {
    id: null,
    entity_id: seedEntity?.id,
    category: seedEntity?.category,
    status: "planned",
    folder_name: null,
    created_at: null,
    media_entities: seedEntity
  });

  safeArray(items).forEach((item) => {
    const entity = item.media_entities || item;
    if (!entity?.id && !entity?.canonical_key) return;

    const canonicalKey = cleanLower(entity.canonical_key || "");
    const key = canonicalKey || `id:${entity.id}`;

    if (!map.has(key)) {
      map.set(key, {
        ...item,
        media_entities: entity
      });
    }
  });

  return Array.from(map.values()).slice(0, limit);
}

function dedupeUniverseItems(items = []) {
  const map = new Map();

  safeArray(items).forEach((item) => {
    const entity = item.media_entities || item;
    if (!entity) return;

    const key = [
      cleanLower(entity.canonical_key),
      cleanLower(entity.external_ids?.wikidata),
      cleanLower(String(entity.external_ids?.tmdb || "")),
      cleanLower(String(entity.external_ids?.imdb || "")),
      cleanLower(entity.external_ids?.openlibrary_work),
      ...safeArray(entity.external_ids?.isbn).map((isbn) => cleanLower(String(isbn)))
    ].find(Boolean) || `entity:${entity.id || Math.random()}`;

    if (!map.has(key)) {
      map.set(key, { ...item, media_entities: entity });
      return;
    }

    const existing = map.get(key);
    map.set(key, {
      ...existing,
      ...item,
      media_entities: {
        ...existing.media_entities,
        ...entity,
        title_primary: existing.media_entities?.title_primary || entity.title_primary,
        title_ru: existing.media_entities?.title_ru || entity.title_ru,
        title_en: existing.media_entities?.title_en || entity.title_en,
        original_title: existing.media_entities?.original_title || entity.original_title,
        year: existing.media_entities?.year || entity.year,
        cover_url: existing.media_entities?.cover_url || entity.cover_url,
        external_ids: {
          ...(existing.media_entities?.external_ids || {}),
          ...(entity.external_ids || {})
        }
      }
    });
  });

  return Array.from(map.values());
}
function buildOrderMap(aiOrder = [], fallbackItems = []) {
  const orderMap = new Map();

  safeArray(aiOrder).forEach((entry, index) => {
    const entityId = Number(entry.entity_id || entry.id);
    if (entityId) orderMap.set(entityId, Number(entry.sort_order ?? index));
  });

  if (orderMap.size) return orderMap;

  sortUniverseItems(fallbackItems).forEach((item, index) => {
    const entityId = Number(item.media_entities?.id || item.entity_id || item.id);
    if (entityId) orderMap.set(entityId, index);
  });

  return orderMap;
}

async function readPersistedUniverseForEntity(entity = {}) {
  const universeKey = clean(entity.universe_key);
  if (!universeKey) return null;

  const group = await fetchUniverseGroup(universeKey);
  const members = await fetchUniverseMembers(universeKey);

  if (!group || !members.length) return null;

  const entityIds = members.map((item) => item.media_entities?.id).filter(Boolean);
  const relations = await fetchRelationsForEntityIds(entityIds);

  return {
    universe: group,
    items: members,
    relations
  };
}

export async function buildUniverseForJob(job, entity) {
  if (!job?.id || !entity?.id) return null;

  try {
    await updateUniverseBuildJob(job.id, {
      status: UNIVERSE_JOB_STATUS.BUILDING,
      progress_current: 1,
      progress_total: 9,
      progress_label: "Проверяем сохранённую вселенную"
    });

    const persisted = await readPersistedUniverseForEntity(entity);

    if (persisted?.universe?.universe_key && persisted.items.length) {
      await updateUniverseBuildJob(job.id, {
        status: UNIVERSE_JOB_STATUS.READY,
        progress_current: 9,
        progress_total: 9,
        progress_label: "Готово из БД",
        universe_key: persisted.universe.universe_key,
        result_payload: {
          universe_key: persisted.universe.universe_key,
          members_count: persisted.items.length,
          relations_count: persisted.relations.length,
          source: "db"
        }
      });

      return persisted;
    }

    await updateUniverseBuildJob(job.id, {
      progress_current: 2,
      progress_label: "Читаем библиотеку"
    });

    const userId = job.owner_user_id;
    const libraryItems = await fetchUserLibrary(userId, { mode: "full" });

    await updateUniverseBuildJob(job.id, {
      progress_current: 3,
      progress_label: "Ищем локальные связи"
    });

    const seedEntry =
      libraryItems.find((item) => Number(item.entity_id) === Number(entity.id)) ||
      {
        entity_id: entity.id,
        category: entity.category,
        status: "planned",
        media_entities: entity
      };

    const localUniverseItems = getUniverseItemsForSeed(entity, [
      seedEntry,
      ...libraryItems
    ]);

    await updateUniverseBuildJob(job.id, {
      progress_current: 4,
      progress_label: "Проверяем Wikidata"
    });

    const wikidataItems = await fetchWikidataSearch(entity);

    await updateUniverseBuildJob(job.id, {
      progress_current: 5,
      progress_label: "Сохраняем найденные сущности"
    });

    const savedWikidataEntities = await saveWikidataEntities(
      wikidataItems,
      entity.category || "unknown"
    );

    const wikidataLibraryLikeItems = savedWikidataEntities.map((saved) => ({
      id: null,
      entity_id: saved.id,
      category: saved.category,
      status: "planned",
      folder_name: null,
      created_at: new Date().toISOString(),
      media_entities: saved
    }));

    const allItemsMap = new Map();

    [...localUniverseItems, ...wikidataLibraryLikeItems].forEach((item) => {
      const key = item.media_entities?.canonical_key || item.media_entities?.id;
      if (key) allItemsMap.set(key, item);
    });

    const allItems = dedupeUniverseItems(Array.from(allItemsMap.values()));
    const localRelationRows = buildRelationRows(entity, allItems);

    await updateUniverseBuildJob(job.id, {
      progress_current: 6,
      progress_label: "Нормализуем через OpenAI"
    });

    const aiCandidates = preDedupeUniverseItems(entity, allItems, 40);

    const aiPayload = await invokeUniverseNormalizeFunction({
      seedEntity: entity,
      items: aiCandidates,
      localRelations: localRelationRows
    });

    const aiResult = aiPayload
      ? normalizeAiResult(aiPayload, entity)
      : null;

    const fallbackUniverse = deriveUniverseInfo(entity);
    const universeKey = slugify(
      aiResult?.universe?.universe_key ||
        job.universe_key ||
        fallbackUniverse.universe_key ||
        entity.canonical_key
    );

    const universeTitle =
      aiResult?.universe?.title ||
      fallbackUniverse.title ||
      resolveTitle(entity);

    const orderMap = buildOrderMap(aiResult?.order || [], allItems);
    const cover =
      allItems.find((item) => item.media_entities?.cover_url)?.media_entities?.cover_url ||
      entity.cover_url ||
      "";

    await updateUniverseBuildJob(job.id, {
      progress_current: 7,
      progress_label: "Сохраняем группу и участников"
    });

    const universe = await upsertUniverseGroup({
      universe_key: universeKey,
      title: universeTitle,
      description: aiResult?.universe?.description || resolveDescription(entity),
      cover_url: cover,
      source: aiResult ? "wikidata" : "library",
      metadata_json: {
        job_id: job.id,
        seed_entity_id: entity.id,
        ai_used: Boolean(aiResult),
        fallback_used: !aiResult
      }
    });

    await upsertUniverseMembers(universeKey, allItems, orderMap);

    await updateUniverseBuildJob(job.id, {
      progress_current: 8,
      progress_label: "Сохраняем связи"
    });

    const aiRelations = safeArray(aiResult?.relations);
    const relationRows = aiRelations.length
      ? [...aiRelations, ...buildReverseAiRelations(aiRelations)]
      : localRelationRows;

    const savedRelations = await upsertMediaRelations(relationRows);

    const sortedItems = sortUniverseItems(allItems, orderMap);

    await Promise.all(
      sortedItems.map((item) =>
        markRelationsStatus(item.media_entities.id, "ready", universeKey)
      )
    );

    sortedItems.forEach((item) => {
      if (item?.id) {
        updateCachedLibraryItem(userId, {
          ...item,
          media_entities: {
            ...(item.media_entities || {}),
            universe_key: universeKey,
            relations_status: "ready",
            relations_built_at: new Date().toISOString()
          }
        });
      }
    });

    await updateUniverseBuildJob(job.id, {
      status: UNIVERSE_JOB_STATUS.READY,
      progress_current: 9,
      progress_total: 9,
      progress_label: "Готово",
      universe_key: universeKey,
      result_payload: {
        universe_key: universeKey,
        universe_id: universe?.id || null,
        members_count: sortedItems.length,
        relations_count: savedRelations.length,
        ai_used: Boolean(aiResult)
      }
    });

    return {
      universe_key: universeKey,
      universe,
      items: sortedItems,
      relations: savedRelations
    };
  } catch (error) {
    console.error("buildUniverseForJob error:", error);

    await updateUniverseBuildJob(job.id, {
      status: UNIVERSE_JOB_STATUS.FAILED,
      progress_label: "Ошибка построения",
      error_message: error.message || "Ошибка построения"
    });

    await markRelationsStatus(entity.id, "failed");

    return null;
  }
}

export async function buildUniverseForEntity({ userId, entityId }) {
  if (!userId || !entityId) {
    return {
      universe: null,
      items: [],
      relations: []
    };
  }

  await markRelationsStatus(entityId, "building");

  try {
    const seedEntry = await fetchUserLibraryEntryByEntityId(userId, entityId);

    if (!seedEntry?.media_entities) {
      await markRelationsStatus(entityId, "failed");

      return {
        universe: null,
        items: [],
        relations: []
      };
    }

    const seedEntity = seedEntry.media_entities;
    const persisted = await readPersistedUniverseForEntity(seedEntity);

    if (persisted?.universe && persisted.items.length) {
      return persisted;
    }

    const libraryItems = await fetchUserLibrary(userId, { mode: "full" });
    const universeItems = dedupeUniverseItems(getUniverseItemsForSeed(seedEntity, libraryItems));
    const localRelationRows = buildRelationRows(seedEntity, universeItems);

    const aiCandidates = preDedupeUniverseItems(seedEntity, universeItems, 40);

    const aiPayload = await invokeUniverseNormalizeFunction({
      seedEntity,
      items: aiCandidates,
      localRelations: localRelationRows
    });

    const aiResult = aiPayload
      ? normalizeAiResult(aiPayload, seedEntity)
      : null;

    const fallbackInfo = deriveUniverseInfo(seedEntity);
    const universeKey = slugify(
      aiResult?.universe?.universe_key ||
        fallbackInfo.universe_key ||
        seedEntity.canonical_key
    );

    const orderMap = buildOrderMap(aiResult?.order || [], universeItems);
    const sortedItems = sortUniverseItems(universeItems, orderMap);
    const cover =
      sortedItems.find((item) => item.media_entities?.cover_url)?.media_entities?.cover_url ||
      "";

    const universe = await upsertUniverseGroup({
      universe_key: universeKey,
      title: aiResult?.universe?.title || fallbackInfo.title,
      description: aiResult?.universe?.description || resolveDescription(seedEntity),
      cover_url: cover,
      source: aiResult ? "wikidata" : "library",
      metadata_json: {
        seed_entity_id: seedEntity.id,
        ai_used: Boolean(aiResult)
      }
    });

    await upsertUniverseMembers(universeKey, sortedItems, orderMap);

    const aiRelations = safeArray(aiResult?.relations);
    const relationRows = aiRelations.length
      ? [...aiRelations, ...buildReverseAiRelations(aiRelations)]
      : localRelationRows;

    const savedRelations = await upsertMediaRelations(relationRows);

    await Promise.all(
      sortedItems.map((item) =>
        markRelationsStatus(item.media_entities.id, "ready", universeKey)
      )
    );

    return {
      universe,
      items: sortedItems,
      relations: savedRelations
    };
  } catch (error) {
    console.error("buildUniverseForEntity error:", error);
    await markRelationsStatus(entityId, "failed");
    throw error;
  }
}

export async function getRelatedItemsForEntity({ userId, entityId }) {
  if (!entityId) return [];

  const savedRelations = await fetchSavedRelations(entityId).catch(() => []);

  if (!userId) return savedRelations;

  const libraryItems = await fetchUserLibrary(userId, { mode: "list" }).catch(() => []);

  if (savedRelations.length) {
    const targetIds = new Set(savedRelations.map((rel) => Number(rel.to_entity_id)));

    return libraryItems.filter((item) =>
      targetIds.has(Number(item.media_entities?.id))
    );
  }

  const seedEntry = libraryItems.find((item) => Number(item.entity_id) === Number(entityId));

  if (!seedEntry?.media_entities) return [];

  return getUniverseItemsForSeed(seedEntry.media_entities, libraryItems).filter(
    (item) => Number(item.media_entities?.id) !== Number(entityId)
  );
}

export async function getUserUniverses(userId) {
  if (!userId) return [];

  const libraryItems = await fetchUserLibrary(userId, { mode: "list" }).catch(() => []);
  const knownUniverseKeys = uniqueArray(
    libraryItems
      .map((item) => clean(item.media_entities?.universe_key))
      .filter(Boolean)
  );

  const persistedGroups = [];

  for (const universeKey of knownUniverseKeys) {
    const group = await fetchUniverseGroup(universeKey);
    const members = await fetchUniverseMembers(universeKey);

    if (group && members.length) {
      const done = members.filter((item) => item.status === "done").length;

      persistedGroups.push({
        ...group,
        items: members,
        total: members.length,
        done,
        progress: members.length ? done / members.length : 0
      });
    }
  }

  if (persistedGroups.length) {
    return persistedGroups.sort((a, b) => {
      const at = Number(a.total || a.items?.length || 0);
      const bt = Number(b.total || b.items?.length || 0);
      return bt - at || String(a.title || "").localeCompare(String(b.title || ""), "ru");
    });
  }

  const grouped = new Map();

  for (const item of libraryItems) {
    const entity = item.media_entities;
    if (!entity?.id) continue;

    const info = entity.universe_key
      ? {
          universe_key: entity.universe_key,
          title: deriveUniverseInfo(entity).title
        }
      : deriveUniverseInfo(entity);

    if (!grouped.has(info.universe_key)) {
      grouped.set(info.universe_key, {
        universe_key: info.universe_key,
        title: info.title,
        cover_url: entity.cover_url || "",
        description: resolveDescription(entity),
        items: []
      });
    }

    const group = grouped.get(info.universe_key);
    group.items.push(item);

    if (!group.cover_url && entity.cover_url) {
      group.cover_url = entity.cover_url;
    }

    if (!group.description && resolveDescription(entity)) {
      group.description = resolveDescription(entity);
    }
  }

  return [...grouped.values()]
    .filter((group) => group.items.length > 1)
    .map((group) => {
      const sorted = sortUniverseItems(group.items);
      const done = sorted.filter((item) => item.status === "done").length;

      return {
        ...group,
        items: sorted,
        total: sorted.length,
        done,
        progress: sorted.length ? done / sorted.length : 0
      };
    })
    .sort((a, b) => b.total - a.total || a.title.localeCompare(b.title, "ru"));
}

export async function getUniverseDetails({ userId, universeKey }) {
  if (!userId || !universeKey) {
    return {
      universe: null,
      items: [],
      relations: []
    };
  }

  const group = await fetchUniverseGroup(universeKey);
  const members = await fetchUniverseMembers(universeKey);

  if (group && members.length) {
    const entityIds = members.map((item) => item.media_entities?.id).filter(Boolean);
    const relations = await fetchRelationsForEntityIds(entityIds);

    return {
      universe: group,
      items: members,
      relations
    };
  }

  const universes = await getUserUniverses(userId);
  const localUniverse = universes.find((item) => item.universe_key === universeKey);

  if (!localUniverse) {
    return {
      universe: null,
      items: [],
      relations: []
    };
  }

  return {
    universe: localUniverse,
    items: localUniverse.items,
    relations: []
  };
}

export function getRelationLabel(type = "related_work") {
  return RELATION_LABELS[type] || RELATION_LABELS.related_work;
}
