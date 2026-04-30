import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";
import { safeArray } from "../utils.js";

const DEFAULT_TIMEOUT_MS = 20000;
const LIST_TIMEOUT_MS = 16000;

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
    description: row.description_ru || row.description_en || row.description || "",
    description_ru: row.description_ru || "",
    description_en: row.description_en || "",
    cover_url: row.cover_url || "",
    source: row.source || "manual",
    is_public: row.is_public !== false,
    metadata_json: row.metadata_json || {}
  };
}

function normalizeContinuity(row = {}) {
  if (!row?.id) return null;

  return {
    id: row.id,
    universe_id: row.universe_id,
    continuity_key: row.continuity_key || "",
    title: row.title || row.continuity_key || "Continuity",
    type: row.type || "main",
    description: row.description || "",
    sort_order: Number(row.sort_order || 0)
  };
}

function normalizeBranch(row = {}) {
  if (!row?.id) return null;

  return {
    id: row.id,
    universe_id: row.universe_id,
    continuity_id: row.continuity_id || null,
    branch_key: row.branch_key || "",
    title: row.title || row.branch_key || "Branch",
    type: row.type || "main_series",
    description: row.description || "",
    sort_order: Number(row.sort_order || 0)
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

function normalizeUniverseLink(row = {}) {
  const entity = normalizeEntity(row.media_entities || row.entity || {});
  if (!entity) return null;

  const universe = normalizeUniverse(row.universes || row.universe || {});
  const continuity = normalizeContinuity(row.universe_continuities || row.continuity || {});
  const branch = normalizeBranch(row.universe_branches || row.branch || {});

  return {
    id: row.id || null,

    universe_id: row.universe_id || universe?.id || null,
    continuity_id: row.continuity_id || continuity?.id || null,
    branch_id: row.branch_id || branch?.id || null,
    entity_id: entity.id,

    role: row.role || "member",
    release_order: row.release_order ?? null,
    story_order: row.story_order ?? null,
    branch_order: row.branch_order ?? null,
    is_core: row.is_core !== false,
    metadata_json: row.metadata_json || {},

    universe,
    continuity,
    branch,

    universe_key: universe?.universe_key || "",
    universe_title: universe?.title || "",

    continuity_key: continuity?.continuity_key || "",
    continuity_title: continuity?.title || "",
    continuity_type: continuity?.type || "",

    branch_key: branch?.branch_key || "",
    branch_title: branch?.title || "",
    branch_type: branch?.type || "",

    category: entity.category,
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

function sortLinks(items = [], mode = "release") {
  return [...safeArray(items)].sort((a, b) => {
    const aOrder =
      mode === "story"
        ? a.story_order ?? a.release_order ?? a.branch_order ?? 9999
        : mode === "branch"
          ? a.branch_order ?? a.story_order ?? a.release_order ?? 9999
          : a.release_order ?? a.story_order ?? a.branch_order ?? 9999;

    const bOrder =
      mode === "story"
        ? b.story_order ?? b.release_order ?? b.branch_order ?? 9999
        : mode === "branch"
          ? b.branch_order ?? b.story_order ?? b.release_order ?? 9999
          : b.release_order ?? b.story_order ?? b.branch_order ?? 9999;

    if (Number(aOrder) !== Number(bOrder)) return Number(aOrder) - Number(bOrder);

    return String(a.media_entities?.title_primary || "").localeCompare(
      String(b.media_entities?.title_primary || ""),
      "ru"
    );
  });
}

function uniqueLinksByEntity(items = []) {
  const seen = new Set();
  const result = [];

  safeArray(items).forEach((item) => {
    const key = Number(item.entity_id || item.media_entities?.id || 0);
    if (!key || seen.has(key)) return;

    seen.add(key);
    result.push(item);
  });

  return result;
}

async function safeQuery(promise, label = "Запрос", timeoutMs = DEFAULT_TIMEOUT_MS) {
  const { data, error } = await withTimeout(
    promise,
    label,
    timeoutMs
  ).catch((error) => ({ data: [], error }));

  if (error) {
    console.warn(`${label} skipped:`, error);
    return [];
  }

  return safeArray(data);
}

export async function getUserUniversesFromDb() {
  const supabase = getSupabaseClient();

  const { data: universeRows, error: universeError } = await withTimeout(
    supabase
      .from("universes")
      .select("*")
      .eq("is_public", true)
      .order("title", { ascending: true })
      .limit(50),
    "Загрузка списка вселенных из БД",
    LIST_TIMEOUT_MS
  ).catch((error) => ({ data: [], error }));

  if (universeError) {
    console.warn("getUserUniversesFromDb universes skipped:", universeError);
    return [];
  }

  const universes = safeArray(universeRows)
    .map(normalizeUniverse)
    .filter(Boolean);

  if (!universes.length) return [];

  const results = await Promise.all(
    universes.map(async (universe) => {
      const [linkRows, relationRows, branchRows] = await Promise.all([
        safeQuery(
          supabase
            .from("universe_item_links")
            .select("entity_id")
            .eq("universe_id", universe.id)
            .limit(1000),
          `Счётчик элементов ${universe.universe_key}`,
          LIST_TIMEOUT_MS
        ),
        safeQuery(
          supabase
            .from("universe_relations")
            .select("id")
            .eq("universe_id", universe.id)
            .limit(1000),
          `Счётчик связей ${universe.universe_key}`,
          LIST_TIMEOUT_MS
        ),
        safeQuery(
          supabase
            .from("universe_branches")
            .select("id")
            .eq("universe_id", universe.id)
            .limit(300),
          `Счётчик веток ${universe.universe_key}`,
          LIST_TIMEOUT_MS
        )
      ]);

      const entityIds = new Set(
        safeArray(linkRows)
          .map((row) => Number(row.entity_id || 0))
          .filter(Boolean)
      );

      return {
        ...universe,
        total: entityIds.size,
        done: 0,
        in_library_count: 0,
        not_added_count: entityIds.size,
        relations_count: safeArray(relationRows).length,
        branches_count: safeArray(branchRows).length,
        progress: 0
      };
    })
  );

  return results;
}

export async function getUniverseDetailsFromDb({ universeKey = "" } = {}) {
  const key = clean(universeKey);

  if (!key) {
    return {
      universe: null,
      items: [],
      links: [],
      relations: [],
      branches: [],
      continuities: []
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
  ).catch((error) => ({ data: null, error }));

  if (universeError) throw universeError;

  const universe = normalizeUniverse(universeRow);

  if (!universe) {
    return {
      universe: null,
      items: [],
      links: [],
      relations: [],
      branches: [],
      continuities: []
    };
  }

  const [
    linkRows,
    relationRows,
    continuityRows,
    branchRows
  ] = await Promise.all([
    safeQuery(
      supabase
        .from("universe_item_links")
        .select(`
          id,
          universe_id,
          continuity_id,
          branch_id,
          entity_id,
          role,
          release_order,
          story_order,
          branch_order,
          is_core,
          metadata_json,
          universe_continuities (
            id,
            universe_id,
            continuity_key,
            title,
            type,
            description,
            sort_order
          ),
          universe_branches (
            id,
            universe_id,
            continuity_id,
            branch_key,
            title,
            type,
            description,
            sort_order
          ),
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
        .order("release_order", { ascending: true })
        .limit(1000),
      "Загрузка V3 элементов вселенной",
      DEFAULT_TIMEOUT_MS
    ),
    safeQuery(
      supabase
        .from("universe_relations")
        .select("*")
        .eq("universe_id", universe.id)
        .order("sort_order", { ascending: true })
        .limit(1000),
      "Загрузка связей вселенной",
      DEFAULT_TIMEOUT_MS
    ),
    safeQuery(
      supabase
        .from("universe_continuities")
        .select("*")
        .eq("universe_id", universe.id)
        .order("sort_order", { ascending: true }),
      "Загрузка линий канона вселенной",
      DEFAULT_TIMEOUT_MS
    ),
    safeQuery(
      supabase
        .from("universe_branches")
        .select("*")
        .eq("universe_id", universe.id)
        .order("sort_order", { ascending: true }),
      "Загрузка веток вселенной",
      DEFAULT_TIMEOUT_MS
    )
  ]);

  const links = sortLinks(
    safeArray(linkRows)
      .map(normalizeUniverseLink)
      .filter(Boolean),
    "release"
  );

  const items = uniqueLinksByEntity(links);

  const relations = safeArray(relationRows)
    .map(normalizeRelation)
    .filter((relation) => relation.from_entity_id && relation.to_entity_id);

  const continuities = safeArray(continuityRows)
    .map(normalizeContinuity)
    .filter(Boolean);

  const branches = safeArray(branchRows)
    .map(normalizeBranch)
    .filter(Boolean);

  return {
    universe,
    items,
    links,
    relations,
    branches,
    continuities
  };
}

export async function getRelatedItemsForEntityFromDb({ entityId } = {}) {
  const cleanEntityId = Number(entityId || 0);

  if (!cleanEntityId) return [];

  const supabase = getSupabaseClient();

  const relationRows = await safeQuery(
    supabase
      .from("universe_relations")
      .select("*")
      .or(`from_entity_id.eq.${cleanEntityId},to_entity_id.eq.${cleanEntityId}`)
      .order("sort_order", { ascending: true })
      .limit(80),
    "Загрузка связанных элементов из БД",
    DEFAULT_TIMEOUT_MS
  );

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

  const entityRows = await safeQuery(
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

export async function getEntityUniverseLinksFromDb({ entityId } = {}) {
  const cleanEntityId = Number(entityId || 0);

  if (!cleanEntityId) return [];

  const supabase = getSupabaseClient();

  const rows = await safeQuery(
    supabase
      .from("universe_item_links")
      .select(`
        id,
        universe_id,
        continuity_id,
        branch_id,
        entity_id,
        role,
        release_order,
        story_order,
        branch_order,
        is_core,
        metadata_json,
        universes (
          id,
          universe_key,
          title,
          title_ru,
          title_en,
          description_ru,
          description_en,
          cover_url,
          source,
          is_public,
          metadata_json
        ),
        universe_continuities (
          id,
          universe_id,
          continuity_key,
          title,
          type,
          description,
          sort_order
        ),
        universe_branches (
          id,
          universe_id,
          continuity_id,
          branch_key,
          title,
          type,
          description,
          sort_order
        ),
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
      .eq("entity_id", cleanEntityId)
      .order("branch_order", { ascending: true })
      .limit(100),
    "Загрузка вселенных карточки",
    DEFAULT_TIMEOUT_MS
  );

  return safeArray(rows)
    .map(normalizeUniverseLink)
    .filter(Boolean)
    .sort((a, b) => {
      const au = a.universe_title || "";
      const bu = b.universe_title || "";
      if (au !== bu) return au.localeCompare(bu, "ru");

      const ac = a.continuity?.sort_order ?? 9999;
      const bc = b.continuity?.sort_order ?? 9999;
      if (ac !== bc) return ac - bc;

      const ab = a.branch?.sort_order ?? 9999;
      const bb = b.branch?.sort_order ?? 9999;
      if (ab !== bb) return ab - bb;

      return Number(a.branch_order ?? 9999) - Number(b.branch_order ?? 9999);
    });
}
