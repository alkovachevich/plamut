import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";
import { safeArray } from "../utils.js";

const DEFAULT_TIMEOUT_MS = 25000;
const LIST_TIMEOUT_MS = 25000;

const FALLBACK_UNIVERSES = [
  {
    id: null,
    universe_key: "marvel",
    title: "Marvel",
    title_ru: "Marvel",
    title_en: "Marvel",
    description: "Эталонная вселенная Plamut.",
    description_ru: "Эталонная вселенная Plamut.",
    description_en: "Plamut reference universe.",
    cover_url: "",
    source: "manual",
    is_public: true,
    metadata_json: {
      manual_locked: true,
      manual_verified: true,
      reference_universe: true
    },
    total: 0,
    done: 0,
    in_library_count: 0,
    not_added_count: 0,
    relations_count: 0,
    branches_count: 0,
    progress: 0,
    __fallback: true
  }
];

function clean(value = "") {
  return String(value || "").trim();
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeUniverse(row = {}) {
  if (!row?.id && !row?.universe_key) return null;

  return {
    id: row.id || null,
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
    relations_status: row.relations_status || "",
    manual_locked: row.manual_locked === true,
    manual_verified: row.manual_verified === true
  };
}

function normalizeUniverseLink(row = {}) {
  const entity = normalizeEntity(row.media_entities || row.entity || {});
  if (!entity) return null;

  const universe = normalizeUniverse(row.universes || row.universe || {});
  const continuity = normalizeContinuity(row.universe_continuities || row.continuity || {});
  const branch = normalizeBranch(row.universe_branches || row.branch || {});

  const releaseOrder = toNumberOrNull(row.release_order);
  const storyOrder = toNumberOrNull(row.story_order);
  const branchOrder = toNumberOrNull(row.branch_order);

  return {
    id: row.id || null,
    universe_id: row.universe_id || universe?.id || null,
    continuity_id: row.continuity_id || continuity?.id || null,
    branch_id: row.branch_id || branch?.id || null,
    entity_id: entity.id,

    role: row.role || "member",
    release_order: releaseOrder,
    story_order: storyOrder,
    branch_order: branchOrder,
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
    year: entity.year,
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

function getLinkYear(link = {}) {
  const year = Number(link.year || link.media_entities?.year || 0);
  return Number.isFinite(year) && year > 0 ? year : 9999;
}

function getSortOrder(link = {}, mode = "release") {
  if (mode === "story") {
    return link.story_order ?? link.release_order ?? link.branch_order ?? 9999;
  }

  if (mode === "branch") {
    return link.branch_order ?? link.story_order ?? link.release_order ?? 9999;
  }

  if (mode === "year") {
    return getLinkYear(link);
  }

  return link.release_order ?? link.story_order ?? link.branch_order ?? 9999;
}

function sortLinks(items = [], mode = "release") {
  return [...safeArray(items)].sort((a, b) => {
    const aContinuity = a.continuity?.sort_order ?? 9999;
    const bContinuity = b.continuity?.sort_order ?? 9999;

    if (mode === "branch" && aContinuity !== bContinuity) {
      return aContinuity - bContinuity;
    }

    const aBranch = a.branch?.sort_order ?? 9999;
    const bBranch = b.branch?.sort_order ?? 9999;

    if (mode === "branch" && aBranch !== bBranch) {
      return aBranch - bBranch;
    }

    const aOrder = Number(getSortOrder(a, mode));
    const bOrder = Number(getSortOrder(b, mode));

    if (aOrder !== bOrder) return aOrder - bOrder;

    const ay = getLinkYear(a);
    const by = getLinkYear(b);

    if (ay !== by) return ay - by;

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

async function safeQuery(query, label = "Запрос к БД", timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const { data, error } = await withTimeout(query, label, timeoutMs);

    if (error) {
      console.warn(`${label} skipped:`, error);
      return [];
    }

    return safeArray(data);
  } catch (error) {
    console.warn(`${label} skipped:`, error);
    return [];
  }
}

export async function getUserUniversesFromDb() {
  const supabase = getSupabaseClient();

  const universeRows = await safeQuery(
    supabase
      .from("universes")
      .select("*")
      .eq("is_public", true)
      .order("title", { ascending: true })
      .limit(50),
    "Загрузка списка вселенных из БД",
    LIST_TIMEOUT_MS
  );

  const universes = safeArray(universeRows)
    .map(normalizeUniverse)
    .filter(Boolean);

  if (!universes.length) {
    return FALLBACK_UNIVERSES;
  }

  const results = await Promise.all(
    universes.map(async (universe) => {
      const [linkRows, relationRows, branchRows] = await Promise.all([
        safeQuery(
          supabase
            .from("universe_item_links")
            .select("entity_id")
            .eq("universe_id", universe.id)
            .limit(5000),
          `Счётчик элементов ${universe.universe_key}`,
          LIST_TIMEOUT_MS
        ),
        safeQuery(
          supabase
            .from("universe_relations")
            .select("id")
            .eq("universe_id", universe.id)
            .limit(5000),
          `Счётчик связей ${universe.universe_key}`,
          LIST_TIMEOUT_MS
        ),
        safeQuery(
          supabase
            .from("universe_branches")
            .select("id")
            .eq("universe_id", universe.id)
            .limit(1000),
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

  return results.length ? results : FALLBACK_UNIVERSES;
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

  const universeRows = await safeQuery(
    supabase
      .from("universes")
      .select("*")
      .eq("universe_key", key)
      .limit(1),
    "Загрузка вселенной из БД",
    DEFAULT_TIMEOUT_MS
  );

  const universe = normalizeUniverse(safeArray(universeRows)[0]);

  if (!universe?.id) {
    return {
      universe: normalizeUniverse(FALLBACK_UNIVERSES.find((item) => item.universe_key === key)),
      items: [],
      links: [],
      relations: [],
      branches: [],
      continuities: []
    };
  }

  const [linkRows, relationRows, continuityRows, branchRows] = await Promise.all([
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
            relations_status,
            manual_locked,
            manual_verified
          )
        `)
        .eq("universe_id", universe.id)
        .order("release_order", { ascending: true, nullsFirst: false })
        .limit(3000),
      "Загрузка элементов вселенной",
      DEFAULT_TIMEOUT_MS
    ),
    safeQuery(
      supabase
        .from("universe_relations")
        .select("*")
        .eq("universe_id", universe.id)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .limit(3000),
      "Загрузка связей вселенной",
      DEFAULT_TIMEOUT_MS
    ),
    safeQuery(
      supabase
        .from("universe_continuities")
        .select("*")
        .eq("universe_id", universe.id)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .limit(500),
      "Загрузка линий канона вселенной",
      DEFAULT_TIMEOUT_MS
    ),
    safeQuery(
      supabase
        .from("universe_branches")
        .select("*")
        .eq("universe_id", universe.id)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .limit(1000),
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
      .order("sort_order", { ascending: true, nullsFirst: false })
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
        relations_status,
        manual_locked,
        manual_verified
      `)
      .in("id", relatedIds)
      .limit(100),
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
          relations_status,
          manual_locked,
          manual_verified
        )
      `)
      .eq("entity_id", cleanEntityId)
      .order("branch_order", { ascending: true, nullsFirst: false })
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
