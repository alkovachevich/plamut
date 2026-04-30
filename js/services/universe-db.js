import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";
import { safeArray } from "../utils.js";

const DEFAULT_TIMEOUT_MS = 30000;
const LIST_TIMEOUT_MS = 45000;

function clean(value = "") {
  return String(value || "").trim();
}

function normalizeUniverse(row = {}) {
  if (!row?.id) return null;

  return {
    id: row.id,
    universe_key: row.universe_key || "",
    title: row.title || row.title_ru || row.title_en || row.universe_key || "Вселенная",
    title_ru: row.title_ru || "",
    title_en: row.title_en || "",
    description: row.description_ru || row.description_en || "",
    description_ru: row.description_ru || "",
    description_en: row.description_en || "",
    cover_url: row.cover_url || "",
    source: row.source || "manual",
    is_public: row.is_public !== false,
    metadata_json: row.metadata_json || {}
  };
}

function normalizeEntity(row = {}) {
  if (!row?.id) return null;

  return {
    id: row.id,
    canonical_key: row.canonical_key || "",
    category: row.category || "",
    primary_source: row.primary_source || "",
    title_primary: row.title_primary || "",
    title_ru: row.title_ru || "",
    title_en: row.title_en || "",
    original_title: row.original_title || "",
    year: row.year || null,
    cover_url: row.cover_url || "",
    description_ru: row.description_ru || "",
    description_en: row.description_en || "",
    external_ids: row.external_ids || {},
    meta: row.meta || {},
    universe_key: row.universe_key || "",
    relations_built_at: row.relations_built_at || null,
    relations_status: row.relations_status || ""
  };
}

function normalizeUniverseItem(row = {}) {
  const entity = normalizeEntity(row.media_entities || row.entity || {});
  if (!entity) return null;

  return {
    id: row.id || null,
    entity_id: entity.id,
    category: entity.category,
    status: row.status || "",
    folder_name: row.folder_name || "",
    role: row.role || "member",
    release_order: row.release_order ?? null,
    story_order: row.story_order ?? null,
    phase: row.phase || "",
    arc: row.arc || "",
    is_core: row.is_core !== false,
    metadata_json: row.metadata_json || {},
    media_entities: entity
  };
}

function normalizeRelation(row = {}) {
  return {
    id: row.id || null,
    universe_id: row.universe_id || null,
    from_entity_id: Number(row.from_entity_id || 0),
    to_entity_id: Number(row.to_entity_id || 0),
    relation_type: row.relation_type || "related_work",
    sort_order: row.sort_order ?? null,
    confidence: Number(row.confidence ?? 1),
    source: row.source || "manual",
    metadata_json: row.metadata_json || {}
  };
}

function sortItems(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const ar = Number(a.release_order ?? 9999);
    const br = Number(b.release_order ?? 9999);
    if (ar !== br) return ar - br;

    const ay = Number(a.media_entities?.year || 0);
    const by = Number(b.media_entities?.year || 0);
    if (ay && by && ay !== by) return ay - by;

    return String(a.media_entities?.title_primary || "").localeCompare(
      String(b.media_entities?.title_primary || ""),
      "ru"
    );
  });
}

export async function getUserUniversesFromDb() {
  const supabase = getSupabaseClient();

  const { data: universeRows, error: universeError } = await withTimeout(
    supabase
      .from("universes")
      .select("*")
      .eq("is_public", true)
      .order("title", { ascending: true }),
    "Загрузка списка вселенных из БД",
    LIST_TIMEOUT_MS
  );

  if (universeError) throw universeError;

  const universes = safeArray(universeRows)
    .map(normalizeUniverse)
    .filter(Boolean);

  if (!universes.length) return [];

  const universeIds = universes.map((universe) => universe.id);

  const itemsResult = await withTimeout(
    supabase
      .from("universe_items")
      .select("universe_id, entity_id")
      .in("universe_id", universeIds),
    "Загрузка счётчиков элементов вселенных",
    LIST_TIMEOUT_MS
  ).catch((error) => {
    console.warn("Universe item counters skipped:", error);
    return { data: [] };
  });

  const relationsResult = await withTimeout(
    supabase
      .from("universe_relations")
      .select("universe_id, id")
      .in("universe_id", universeIds),
    "Загрузка счётчиков связей вселенных",
    LIST_TIMEOUT_MS
  ).catch((error) => {
    console.warn("Universe relation counters skipped:", error);
    return { data: [] };
  });

  const itemCountByUniverse = new Map();
  const relationCountByUniverse = new Map();

  safeArray(itemsResult.data).forEach((row) => {
    const key = Number(row.universe_id || 0);
    itemCountByUniverse.set(key, (itemCountByUniverse.get(key) || 0) + 1);
  });

  safeArray(relationsResult.data).forEach((row) => {
    const key = Number(row.universe_id || 0);
    relationCountByUniverse.set(key, (relationCountByUniverse.get(key) || 0) + 1);
  });

  return universes.map((universe) => {
    const total = itemCountByUniverse.get(Number(universe.id)) || 0;
    const relations = relationCountByUniverse.get(Number(universe.id)) || 0;

    return {
      ...universe,
      total,
      done: 0,
      in_library_count: 0,
      not_added_count: total,
      relations_count: relations,
      progress: 0
    };
  });
}

export async function getUniverseDetailsFromDb({ universeKey = "" } = {}) {
  const key = clean(universeKey);

  if (!key) {
    return {
      universe: null,
      items: [],
      relations: []
    };
  }

  const supabase = getSupabaseClient();

  const { data: universeRow, error: universeError } = await withTimeout(
    supabase
      .from("universes")
      .select("*")
      .eq("universe_key", key)
      .maybeSingle(),
    "Загрузка вселенной из БД",
    DEFAULT_TIMEOUT_MS
  );

  if (universeError) throw universeError;

  const universe = normalizeUniverse(universeRow);

  if (!universe) {
    return {
      universe: null,
      items: [],
      relations: []
    };
  }

  const itemsResult = await withTimeout(
    supabase
      .from("universe_items")
      .select(`
        id,
        universe_id,
        entity_id,
        role,
        release_order,
        story_order,
        phase,
        arc,
        is_core,
        metadata_json,
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
      .eq("universe_id", universe.id)
      .order("release_order", { ascending: true }),
    "Загрузка элементов вселенной",
    DEFAULT_TIMEOUT_MS
  );

  if (itemsResult.error) throw itemsResult.error;

  const relationsResult = await withTimeout(
    supabase
      .from("universe_relations")
      .select("*")
      .eq("universe_id", universe.id)
      .order("sort_order", { ascending: true }),
    "Загрузка связей вселенной",
    DEFAULT_TIMEOUT_MS
  );

  if (relationsResult.error) throw relationsResult.error;

  const items = sortItems(
    safeArray(itemsResult.data)
      .map(normalizeUniverseItem)
      .filter(Boolean)
  );

  const relations = safeArray(relationsResult.data)
    .map(normalizeRelation)
    .filter((relation) => relation.from_entity_id && relation.to_entity_id);

  return {
    universe,
    items,
    relations
  };
}

export async function getRelatedItemsForEntityFromDb({ entityId } = {}) {
  const cleanEntityId = Number(entityId || 0);

  if (!cleanEntityId) return [];

  const supabase = getSupabaseClient();

  const { data: relationRows, error: relationsError } = await withTimeout(
    supabase
      .from("universe_relations")
      .select("*")
      .or(`from_entity_id.eq.${cleanEntityId},to_entity_id.eq.${cleanEntityId}`)
      .order("sort_order", { ascending: true })
      .limit(80),
    "Загрузка связанных элементов из БД",
    DEFAULT_TIMEOUT_MS
  );

  if (relationsError) throw relationsError;

  const relations = safeArray(relationRows)
    .map(normalizeRelation)
    .filter((relation) => relation.from_entity_id && relation.to_entity_id);

  const relatedIds = [
    ...new Set(
      relations
        .map((relation) =>
          relation.from_entity_id === cleanEntityId
            ? relation.to_entity_id
            : relation.from_entity_id
        )
        .filter(Boolean)
    )
  ];

  if (!relatedIds.length) return [];

  const { data: entityRows, error: entitiesError } = await withTimeout(
    supabase
      .from("media_entities")
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
        relations_status
      `)
      .in("id", relatedIds),
    "Загрузка карточек связанных элементов",
    DEFAULT_TIMEOUT_MS
  );

  if (entitiesError) throw entitiesError;

  const byId = new Map(
    safeArray(entityRows)
      .map(normalizeEntity)
      .filter(Boolean)
      .map((entity) => [Number(entity.id), entity])
  );

  return relatedIds
    .map((id) => {
      const entity = byId.get(Number(id));
      if (!entity) return null;

      return {
        id: null,
        entity_id: entity.id,
        category: entity.category,
        status: "",
        folder_name: "",
        media_entities: entity
      };
    })
    .filter(Boolean);
}
