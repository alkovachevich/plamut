import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";
import { normalizeString, safeArray, uniqueArray } from "../utils.js";

const UNIVERSE_FUNCTION_NAME = "plamut-universe-normalize";

const USER_MEDIA_SELECT = `
  id,
  user_id,
  entity_id,
  category,
  status,
  folder_name,
  created_at,
  media_entities (
    id,
    canonical_key,
    category,
    title_primary,
    title_ru,
    title_en,
    original_title,
    year,
    cover_url,
    description_ru,
    description_en,
    external_ids,
    universe_key,
    relations_built_at,
    relations_status
  )
`;

const RELATION_LABELS = {
  related_work: "Связанное",
  same_universe: "Одна вселенная",
  adaptation: "Экранизация",
  source_material: "Источник",
  sequel: "Продолжение",
  prequel: "Приквел",
  spin_off: "Спинофф",
  remake: "Ремейк"
};

function clean(value = "") {
  return String(value || "").trim();
}

function resolveTitle(entity = {}) {
  return (
    entity.title_primary ||
    entity.title_ru ||
    entity.title_en ||
    entity.original_title ||
    "Без названия"
  );
}

function resolveDescription(entity = {}) {
  return entity.description_ru || entity.description_en || "";
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

function titleCandidates(entity = {}) {
  return uniqueArray([
    entity.title_primary,
    entity.title_ru,
    entity.title_en,
    entity.original_title
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
    "сезон"
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
    ["гарри поттер", "harry-potter", "Harry Potter"],
    ["naruto", "naruto", "Naruto"],
    ["наруто", "naruto", "Naruto"],
    ["witcher", "witcher", "The Witcher"],
    ["ведьмак", "witcher", "Ведьмак"],
    ["the witcher", "witcher", "The Witcher"],
    ["iron man", "marvel", "Marvel"],
    ["железный человек", "marvel", "Marvel"],
    ["marvel", "marvel", "Marvel"],
    ["avengers", "marvel", "Marvel"],
    ["мстители", "marvel", "Marvel"],
    ["star wars", "star-wars", "Star Wars"],
    ["звездные войны", "star-wars", "Звёздные войны"],
    ["звёздные войны", "star-wars", "Звёздные войны"],
    ["lord of the rings", "middle-earth", "Middle-earth"],
    ["властелин колец", "middle-earth", "Средиземье"],
    ["hobbit", "middle-earth", "Middle-earth"],
    ["хоббит", "middle-earth", "Средиземье"]
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

  const universeTitle = words
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");

  return {
    universe_key: slugify(words.join("-")),
    title: universeTitle
  };
}

function normalizeWorkId(value = "") {
  return String(value || "")
    .replace("/works/", "")
    .trim();
}

function sharedExternalId(a = {}, b = {}) {
  const aIds = a.external_ids || {};
  const bIds = b.external_ids || {};

  if (aIds.wikidata && bIds.wikidata && aIds.wikidata === bIds.wikidata) return true;
  if (aIds.tmdb && bIds.tmdb && String(aIds.tmdb) === String(bIds.tmdb)) return true;
  if (aIds.anilist && bIds.anilist && String(aIds.anilist) === String(bIds.anilist)) return true;

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

  if (!aInfo.universe_key || !bInfo.universe_key) return false;

  return aInfo.universe_key === bInfo.universe_key;
}

function relationTypeBetween(a = {}, b = {}) {
  if (a.category === "books" && ["movies", "series", "anime"].includes(b.category)) {
    return "adaptation";
  }

  if (b.category === "books" && ["movies", "series", "anime"].includes(a.category)) {
    return "source_material";
  }

  if (a.category === "manga" && b.category === "anime") {
    return "adaptation";
  }

  if (a.category === "anime" && b.category === "manga") {
    return "source_material";
  }

  if (a.category !== b.category) {
    return "same_universe";
  }

  return "related_work";
}

function scoreRelation(a = {}, b = {}) {
  if (sharedExternalId(a, b)) return 1;
  if (sameUniverseByTitle(a, b)) return 0.82;
  return 0.55;
}

function sortUniverseItems(items = []) {
  return [...items].sort((a, b) => {
    const ay = Number(a.media_entities?.year || 0);
    const by = Number(b.media_entities?.year || 0);

    if (ay && by && ay !== by) return ay - by;

    const at = resolveTitle(a.media_entities || {});
    const bt = resolveTitle(b.media_entities || {});

    return at.localeCompare(bt, "ru");
  });
}

async function fetchUserLibrary(userId) {
  if (!userId) return [];

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("user_media")
      .select(USER_MEDIA_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    "Загрузка библиотеки",
    30000
  );

  if (error) throw error;

  return safeArray(data).filter((item) => item?.media_entities);
}

async function fetchUserLibraryEntryByEntityId(userId, entityId) {
  if (!userId || !entityId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("user_media")
      .select(USER_MEDIA_SELECT)
      .eq("user_id", userId)
      .eq("entity_id", entityId)
      .maybeSingle(),
    "Загрузка элемента библиотеки",
    30000
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
    30000
  );

  if (error) throw error;

  return safeArray(data);
}

async function upsertUniverseGroup({ universe_key, title, description = "", cover_url = "", source = "system", metadata_json = {} }) {
  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("universe_groups")
      .upsert(
        {
          universe_key,
          title,
          description,
          cover_url,
          source,
          metadata_json
        },
        { onConflict: "universe_key" }
      )
      .select()
      .single(),
    "Сохранение группы вселенной",
    30000
  );

  if (error) throw error;

  return data;
}

async function upsertUniverseMembers(universeKey, items = [], orderMap = new Map()) {
  const supabase = getSupabaseClient();

  const rows = sortUniverseItems(items).map((item, fallbackIndex) => {
    const entityId = item.media_entities.id;
    const order = orderMap.has(entityId) ? orderMap.get(entityId) : fallbackIndex;

    return {
      universe_key: universeKey,
      entity_id: entityId,
      role: "member",
      sort_order: Number.isFinite(Number(order)) ? Number(order) : fallbackIndex
    };
  });

  if (!rows.length) return [];

  const { data, error } = await withTimeout(
    supabase
      .from("universe_members")
      .upsert(rows, { onConflict: "universe_key,entity_id" })
      .select(),
    "Сохранение участников вселенной",
    30000
  );

  if (error) throw error;

  return data || [];
}

async function upsertMediaRelations(rows = []) {
  if (!rows.length) return [];

  const supabase = getSupabaseClient();

  const cleanRows = rows
    .filter((row) => row.from_entity_id && row.to_entity_id && row.from_entity_id !== row.to_entity_id)
    .map((row, index) => ({
      from_entity_id: row.from_entity_id,
      to_entity_id: row.to_entity_id,
      relation_type: row.relation_type || "related_work",
      source: row.source || "openai",
      confidence: Number(row.confidence || 0.65),
      sort_order: Number(row.sort_order || index),
      metadata_json: row.metadata_json || {}
    }));

  if (!cleanRows.length) return [];

  const { data, error } = await withTimeout(
    supabase
      .from("media_relations")
      .upsert(cleanRows, { onConflict: "from_entity_id,to_entity_id,relation_type" })
      .select(),
    "Сохранение связей",
    30000
  );

  if (error) throw error;

  return data || [];
}

async function upsertRelationCandidates(rows = []) {
  if (!rows.length) return [];

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("relation_candidates")
      .upsert(rows, {
        onConflict: "owner_user_id,seed_entity_id,target_entity_id,relation_type,source"
      })
      .select(),
    "Сохранение кандидатов связей",
    30000
  );

  if (error) {
    console.warn("Relation candidates save skipped:", error);
    return [];
  }

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

  const { error } = await withTimeout(
    supabase
      .from("media_entities")
      .update(payload)
      .eq("id", entityId),
    "Обновление статуса связей",
    30000
  ).catch((error) => ({ error }));

  if (error) {
    console.warn("markRelationsStatus skipped:", error);
  }
}

function getUniverseItemsForSeed(seedEntity, libraryItems = []) {
  if (!seedEntity) return [];

  const seedInfo = deriveUniverseInfo(seedEntity);

  return libraryItems.filter((item) => {
    const entity = item.media_entities;

    if (!entity?.id) return false;
    if (entity.id === seedEntity.id) return true;
    if (sharedExternalId(seedEntity, entity)) return true;

    const itemInfo = deriveUniverseInfo(entity);

    return itemInfo.universe_key === seedInfo.universe_key;
  });
}

function buildCandidateRows({ userId, seedEntity, items = [] }) {
  if (!userId || !seedEntity?.id) return [];

  return items
    .filter((item) => item.media_entities?.id && item.media_entities.id !== seedEntity.id)
    .map((item) => {
      const target = item.media_entities;
      const relationType = relationTypeBetween(seedEntity, target);
      const confidence = scoreRelation(seedEntity, target);

      return {
        owner_user_id: userId,
        seed_entity_id: seedEntity.id,
        target_entity_id: target.id,
        seed_canonical_key: seedEntity.canonical_key || null,
        target_canonical_key: target.canonical_key || null,
        relation_type: relationType,
        source: "library",
        status: "suggested",
        confidence,
        candidate_payload: {
          seed_title: resolveTitle(seedEntity),
          seed_category: seedEntity.category,
          target_title: resolveTitle(target),
          target_category: target.category,
          target_year: target.year || null,
          reason: sharedExternalId(seedEntity, target) ? "shared_external_id" : "same_universe_key"
        }
      };
    });
}

function buildNormalizePayload({ seedEntity, candidateRows = [] }) {
  return {
    seed: {
      id: seedEntity.id,
      title: resolveTitle(seedEntity),
      category: seedEntity.category,
      year: seedEntity.year || null,
      canonical_key: seedEntity.canonical_key || "",
      external_ids: seedEntity.external_ids || {}
    },
    candidates: candidateRows.map((row) => ({
      seed_entity_id: row.seed_entity_id,
      target_entity_id: row.target_entity_id,
      seed_title: row.candidate_payload?.seed_title || "",
      target_title: row.candidate_payload?.target_title || "",
      seed_category: row.candidate_payload?.seed_category || "",
      target_category: row.candidate_payload?.target_category || "",
      relation_type: row.relation_type,
      source: row.source,
      confidence: row.confidence,
      payload: row.candidate_payload || {}
    }))
  };
}

function fallbackNormalize({ seedEntity, universeInfo, candidateRows = [] }) {
  return {
    universe_title: universeInfo.title || resolveTitle(seedEntity),
    universe_key: universeInfo.universe_key || slugify(resolveTitle(seedEntity)),
    relations: candidateRows
      .filter((row) => row.target_entity_id)
      .map((row, index) => ({
        seed_entity_id: row.seed_entity_id,
        target_entity_id: row.target_entity_id,
        relation_type: row.relation_type || "related_work",
        confidence: row.confidence || 0.55,
        order_hint: index,
        reason: "Локальная связь по библиотеке и названию вселенной"
      }))
  };
}

async function normalizeWithEdgeFunction({ seedEntity, universeInfo, candidateRows = [] }) {
  if (!candidateRows.length) {
    return fallbackNormalize({ seedEntity, universeInfo, candidateRows });
  }

  const supabase = getSupabaseClient();

  try {
    const { data, error } = await withTimeout(
      supabase.functions.invoke(UNIVERSE_FUNCTION_NAME, {
        body: buildNormalizePayload({
          seedEntity,
          candidateRows
        })
      }),
      "Нормализация вселенной",
      45000
    );

    if (error) {
      throw error;
    }

    if (!data || !Array.isArray(data.relations)) {
      throw new Error("Invalid normalize response");
    }

    return {
      universe_title: data.universe_title || universeInfo.title || resolveTitle(seedEntity),
      universe_key: data.universe_key || universeInfo.universe_key,
      relations: data.relations
    };
  } catch (error) {
    console.warn("OpenAI universe normalize fallback used:", error);

    return fallbackNormalize({
      seedEntity,
      universeInfo,
      candidateRows
    });
  }
}

function buildRelationRowsFromNormalized({ seedEntity, normalized, candidateRows = [] }) {
  const candidateByTarget = new Map(
    candidateRows.map((row) => [Number(row.target_entity_id), row])
  );

  const rows = [];

  safeArray(normalized.relations).forEach((relation, index) => {
    const targetId = Number(relation.target_entity_id);
    const seedId = Number(relation.seed_entity_id || seedEntity.id);

    if (!targetId || !seedId || targetId === seedId) return;

    const candidate = candidateByTarget.get(targetId);
    const relationType = relation.relation_type || candidate?.relation_type || "related_work";
    const confidence = Math.max(0, Math.min(1, Number(relation.confidence || candidate?.confidence || 0.65)));
    const orderHint = relation.order_hint ?? index;

    rows.push({
      from_entity_id: seedId,
      to_entity_id: targetId,
      relation_type: relationType,
      source: "openai",
      confidence,
      sort_order: Number.isFinite(Number(orderHint)) ? Number(orderHint) : index,
      metadata_json: {
        reason: relation.reason || "",
        normalized_by: "plamut-universe-normalize",
        candidate_source: candidate?.source || "unknown"
      }
    });

    const reverseType =
      relationType === "adaptation"
        ? "source_material"
        : relationType === "source_material"
          ? "adaptation"
          : relationType;

    rows.push({
      from_entity_id: targetId,
      to_entity_id: seedId,
      relation_type: reverseType,
      source: "openai",
      confidence,
      sort_order: Number(seedEntity.year || 0),
      metadata_json: {
        reason: relation.reason || "",
        normalized_by: "plamut-universe-normalize",
        candidate_source: candidate?.source || "unknown"
      }
    });
  });

  return rows;
}

function buildOrderMapFromNormalized(normalized = {}) {
  const map = new Map();

  safeArray(normalized.relations).forEach((relation, index) => {
    const targetId = Number(relation.target_entity_id);
    const order = relation.order_hint ?? index;

    if (targetId && Number.isFinite(Number(order))) {
      map.set(targetId, Number(order));
    }
  });

  return map;
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
    const libraryItems = await fetchUserLibrary(userId);
    const universeInfo = deriveUniverseInfo(seedEntity);
    const universeItems = getUniverseItemsForSeed(seedEntity, libraryItems);
    const sortedItems = sortUniverseItems(universeItems);

    const candidateRows = buildCandidateRows({
      userId,
      seedEntity,
      items: sortedItems
    });

    await upsertRelationCandidates(candidateRows);

    const normalized = await normalizeWithEdgeFunction({
      seedEntity,
      universeInfo,
      candidateRows
    });

    const finalUniverseKey = slugify(normalized.universe_key || universeInfo.universe_key);
    const finalUniverseTitle = clean(normalized.universe_title) || universeInfo.title || resolveTitle(seedEntity);
    const cover = sortedItems.find((item) => item.media_entities?.cover_url)?.media_entities?.cover_url || "";
    const description = resolveDescription(seedEntity);

    const universe = await upsertUniverseGroup({
      universe_key: finalUniverseKey,
      title: finalUniverseTitle,
      description,
      cover_url: cover,
      source: "openai",
      metadata_json: {
        seed_entity_id: seedEntity.id,
        normalized: true
      }
    });

    const relationRows = buildRelationRowsFromNormalized({
      seedEntity,
      normalized,
      candidateRows
    });

    const savedRelations = await upsertMediaRelations(relationRows);

    const orderMap = buildOrderMapFromNormalized(normalized);
    orderMap.set(seedEntity.id, -1);

    await upsertUniverseMembers(finalUniverseKey, sortedItems, orderMap);

    await Promise.all(
      sortedItems.map((item) =>
        markRelationsStatus(item.media_entities.id, "ready", finalUniverseKey)
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
  if (!userId || !entityId) return [];

  const seedEntry = await fetchUserLibraryEntryByEntityId(userId, entityId).catch(() => null);
  if (!seedEntry?.media_entities) return [];

  const savedRelations = await fetchSavedRelations(entityId).catch(() => []);
  const libraryItems = await fetchUserLibrary(userId).catch(() => []);

  if (savedRelations.length) {
    const targetIds = new Set(savedRelations.map((rel) => rel.to_entity_id));

    return libraryItems.filter((item) => targetIds.has(item.media_entities?.id));
  }

  const localItems = getUniverseItemsForSeed(seedEntry.media_entities, libraryItems);

  return localItems.filter((item) => item.media_entities?.id !== entityId);
}

export async function getUserUniverses(userId) {
  if (!userId) return [];

  const libraryItems = await fetchUserLibrary(userId);
  const grouped = new Map();

  for (const item of libraryItems) {
    const entity = item.media_entities;
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

  const result = [...grouped.values()]
    .filter((group) => group.items.length > 1)
    .map((group) => {
      const sorted = sortUniverseItems(group.items);
      const done = sorted.filter((item) => item.status === "done").length;
      const progress = sorted.length ? done / sorted.length : 0;

      return {
        ...group,
        items: sorted,
        total: sorted.length,
        done,
        progress
      };
    })
    .sort((a, b) => b.total - a.total || a.title.localeCompare(b.title, "ru"));

  for (const universe of result) {
    try {
      await upsertUniverseGroup({
        universe_key: universe.universe_key,
        title: universe.title,
        description: universe.description,
        cover_url: universe.cover_url,
        source: "library",
        metadata_json: {
          auto_cached: true
        }
      });

      await upsertUniverseMembers(universe.universe_key, universe.items);
    } catch (error) {
      console.warn("Universe cache skipped:", error);
    }
  }

  return result;
}

export async function getUniverseDetails({ userId, universeKey }) {
  if (!userId || !universeKey) {
    return {
      universe: null,
      items: [],
      relations: []
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

  const supabase = getSupabaseClient();

  const entityIds = localUniverse.items
    .map((item) => item.media_entities?.id)
    .filter(Boolean);

  let relations = [];

  if (entityIds.length) {
    const { data, error } = await withTimeout(
      supabase
        .from("media_relations")
        .select("*")
        .in("from_entity_id", entityIds),
      "Загрузка связей вселенной",
      30000
    ).catch((error) => ({ data: [], error }));

    if (!error) {
      relations = safeArray(data).filter((rel) => entityIds.includes(rel.to_entity_id));
    }
  }

  if (!relations.length) {
    for (const item of localUniverse.items) {
      const entity = item.media_entities;
      const related = localUniverse.items.filter((candidate) => candidate.media_entities.id !== entity.id);

      related.forEach((candidate) => {
        relations.push({
          from_entity_id: entity.id,
          to_entity_id: candidate.media_entities.id,
          relation_type: relationTypeBetween(entity, candidate.media_entities),
          confidence: scoreRelation(entity, candidate.media_entities)
        });
      });
    }
  }

  return {
    universe: localUniverse,
    items: localUniverse.items,
    relations
  };
}

export function getRelationLabel(type = "related_work") {
  return RELATION_LABELS[type] || RELATION_LABELS.related_work;
}
