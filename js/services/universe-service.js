import { getSupabaseClient } from "../lib/supabase-client.js";
import { normalizeString, safeArray, uniqueArray } from "../utils.js";

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
      universe_key: fallback.replace(/[^a-z0-9а-яё-]+/gi, "-").toLowerCase(),
      title: resolveTitle(entity)
    };
  }

  const universeTitle = words
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");

  return {
    universe_key: words.join("-").replace(/[^a-z0-9а-яё-]+/gi, "-").toLowerCase(),
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

  const { data, error } = await supabase
    .from("user_media")
    .select(USER_MEDIA_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return safeArray(data).filter((item) => item?.media_entities);
}

async function fetchUserLibraryEntryByEntityId(userId, entityId) {
  if (!userId || !entityId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_media")
    .select(USER_MEDIA_SELECT)
    .eq("user_id", userId)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

async function upsertUniverseGroup({ universe_key, title, description = "", cover_url = "" }) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("universe_groups")
    .upsert(
      {
        universe_key,
        title,
        description,
        cover_url,
        source: "library",
        metadata_json: {}
      },
      { onConflict: "universe_key" }
    )
    .select()
    .single();

  if (error) throw error;

  return data;
}

async function upsertUniverseMembers(universeKey, items = []) {
  const supabase = getSupabaseClient();

  const rows = sortUniverseItems(items).map((item, index) => ({
    universe_key: universeKey,
    entity_id: item.media_entities.id,
    role: "member",
    sort_order: index
  }));

  if (!rows.length) return [];

  const { data, error } = await supabase
    .from("universe_members")
    .upsert(rows, { onConflict: "universe_key,entity_id" })
    .select();

  if (error) throw error;

  return data || [];
}

async function upsertMediaRelations(seedEntity, items = []) {
  const supabase = getSupabaseClient();

  if (!seedEntity?.id) return [];

  const rows = [];

  for (const item of items) {
    const target = item.media_entities;

    if (!target?.id || target.id === seedEntity.id) continue;

    const relationType = relationTypeBetween(seedEntity, target);
    const confidence = scoreRelation(seedEntity, target);

    rows.push({
      from_entity_id: seedEntity.id,
      to_entity_id: target.id,
      relation_type: relationType,
      source: "library",
      confidence,
      sort_order: Number(target.year || 0),
      metadata_json: {
        title: resolveTitle(target),
        category: target.category
      }
    });

    rows.push({
      from_entity_id: target.id,
      to_entity_id: seedEntity.id,
      relation_type: relationType === "adaptation" ? "source_material" : relationType,
      source: "library",
      confidence,
      sort_order: Number(seedEntity.year || 0),
      metadata_json: {
        title: resolveTitle(seedEntity),
        category: seedEntity.category
      }
    });
  }

  if (!rows.length) return [];

  const { data, error } = await supabase
    .from("media_relations")
    .upsert(rows, { onConflict: "from_entity_id,to_entity_id,relation_type" })
    .select();

  if (error) throw error;

  return data || [];
}

async function markRelationsBuilt(entityId, universeKey) {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("media_entities")
    .update({
      universe_key: universeKey,
      relations_status: "ready",
      relations_built_at: new Date().toISOString()
    })
    .eq("id", entityId);

  if (error) {
    console.warn("markRelationsBuilt skipped:", error);
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

export async function buildUniverseForEntity({ userId, entityId }) {
  if (!userId || !entityId) {
    return {
      universe: null,
      items: [],
      relations: []
    };
  }

  const seedEntry = await fetchUserLibraryEntryByEntityId(userId, entityId);

  if (!seedEntry?.media_entities) {
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
  const cover = sortedItems.find((item) => item.media_entities?.cover_url)?.media_entities?.cover_url || "";
  const description = resolveDescription(seedEntity);

  const universe = await upsertUniverseGroup({
    universe_key: universeInfo.universe_key,
    title: universeInfo.title,
    description,
    cover_url: cover
  });

  await upsertUniverseMembers(universeInfo.universe_key, sortedItems);
  const relations = await upsertMediaRelations(seedEntity, sortedItems);

  await Promise.all(
    sortedItems.map((item) =>
      markRelationsBuilt(item.media_entities.id, universeInfo.universe_key)
    )
  );

  return {
    universe,
    items: sortedItems,
    relations
  };
}

export async function getRelatedItemsForEntity({ userId, entityId }) {
  if (!userId || !entityId) return [];

  const built = await buildUniverseForEntity({ userId, entityId });

  return built.items.filter((item) => item.media_entities?.id !== entityId);
}

export async function getUserUniverses(userId) {
  if (!userId) return [];

  const libraryItems = await fetchUserLibrary(userId);
  const grouped = new Map();

  for (const item of libraryItems) {
    const entity = item.media_entities;
    const info = deriveUniverseInfo(entity);

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
        cover_url: universe.cover_url
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

  const relations = [];

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

  return {
    universe: localUniverse,
    items: localUniverse.items,
    relations
  };
}

export function getRelationLabel(type = "related_work") {
  return RELATION_LABELS[type] || RELATION_LABELS.related_work;
}
