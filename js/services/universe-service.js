import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";
import { normalizeString, safeArray, uniqueArray } from "../utils.js";
import { fetchJsonCached } from "./api-cache.js";
import {
  updateUniverseBuildJob,
  UNIVERSE_JOB_STATUS
} from "./universe-build-jobs.js";

const DEFAULT_TIMEOUT_MS = 30000;
const UNIVERSE_FUNCTION_NAME = "plamut-universe-normalize";

const USER_MEDIA_SELECT = `
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
    entity.title ||
    "Без названия"
  );
}

function resolveDescription(entity = {}) {
  return entity.description_ru || entity.description_en || entity.description || "";
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
    entity.original_title,
    entity.title
  ])
    .map(compact)
    .filter(Boolean);
}

function normalizeWorkId(value = "") {
  return String(value || "").replace("/works/", "").trim();
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

    return resolveTitle(a.media_entities || {}).localeCompare(
      resolveTitle(b.media_entities || {}),
      "ru"
    );
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
    DEFAULT_TIMEOUT_MS
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

async function upsertUniverseGroup({
  universe_key,
  title,
  description = "",
  cover_url = "",
  source = "library",
  metadata_json = {}
}) {
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
    DEFAULT_TIMEOUT_MS
  );

  if (error) throw error;

  return data;
}

async function upsertUniverseMembers(universeKey, items = [], orderMap = new Map()) {
  const supabase = getSupabaseClient();

  const rows = sortUniverseItems(items)
    .map((item, index) => {
      const entityId = item.media_entities?.id || item.id;
      if (!entityId) return null;

      return {
        universe_key: universeKey,
        entity_id: entityId,
        role: "member",
        sort_order: orderMap.has(entityId) ? orderMap.get(entityId) : index
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
      from_entity_id: row.from_entity_id,
      to_entity_id: row.to_entity_id,
      relation_type: row.relation_type || "related_work",
      source: row.source || "library",
      confidence: Number(row.confidence || 0.65),
      sort_order: Number(row.sort_order || index),
      metadata_json: row.metadata_json || {}
    }));

  if (!cleanRows.length) return [];

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("media_relations")
      .upsert(cleanRows, { onConflict: "from_entity_id,to_entity_id,relation_type" })
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

  const seedInfo = deriveUniverseInfo(seedEntity);

  return safeArray(libraryItems).filter((item) => {
    const entity = item.media_entities;
    if (!entity?.id) return false;
    if (entity.id === seedEntity.id) return true;
    if (sharedExternalId(seedEntity, entity)) return true;

    const itemInfo = deriveUniverseInfo(entity);
    return itemInfo.universe_key === seedInfo.universe_key;
  });
}

function buildRelationRows(seedEntity, items = []) {
  return safeArray(items)
    .filter((item) => item.media_entities?.id && item.media_entities.id !== seedEntity.id)
    .flatMap((item, index) => {
      const target = item.media_entities;
      const type = relationTypeBetween(seedEntity, target);
      const confidence = scoreRelation(seedEntity, target);

      const reverseType =
        type === "adaptation"
          ? "source_material"
          : type === "source_material"
            ? "adaptation"
            : type;

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

export async function buildUniverseForJob(job, entity) {
  if (!job?.id || !entity?.id) return null;

  try {
    await updateUniverseBuildJob(job.id, {
      status: UNIVERSE_JOB_STATUS.BUILDING,
      progress_current: 1,
      progress_total: 8,
      progress_label: "Читаем библиотеку"
    });

    const userId = job.owner_user_id;
    const libraryItems = await fetchUserLibrary(userId).catch(() => []);

    await updateUniverseBuildJob(job.id, {
      progress_current: 2,
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
      progress_current: 3,
      progress_label: "Проверяем Wikidata cache"
    });

    const wikidataItems = await fetchWikidataSearch(entity);

    await updateUniverseBuildJob(job.id, {
      progress_current: 4,
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

    const allItems = Array.from(allItemsMap.values());

    await updateUniverseBuildJob(job.id, {
      progress_current: 5,
      progress_label: "Создаём группу вселенной"
    });

    const universeInfo = deriveUniverseInfo(entity);
    const universeKey = slugify(job.universe_key || universeInfo.universe_key || entity.canonical_key);
    const universeTitle = universeInfo.title || resolveTitle(entity);
    const cover = allItems.find((item) => item.media_entities?.cover_url)?.media_entities?.cover_url || entity.cover_url || "";

    const universe = await upsertUniverseGroup({
      universe_key: universeKey,
      title: universeTitle,
      description: resolveDescription(entity),
      cover_url: cover,
      source: "job",
      metadata_json: {
        job_id: job.id,
        seed_entity_id: entity.id
      }
    });

    await updateUniverseBuildJob(job.id, {
      progress_current: 6,
      progress_label: "Сохраняем участников"
    });

    await upsertUniverseMembers(universeKey, allItems);

    await updateUniverseBuildJob(job.id, {
      progress_current: 7,
      progress_label: "Сохраняем связи"
    });

    const relationRows = buildRelationRows(entity, allItems);
    const savedRelations = await upsertMediaRelations(relationRows);

    await markRelationsStatus(entity.id, "ready", universeKey);

    await updateUniverseBuildJob(job.id, {
      status: UNIVERSE_JOB_STATUS.READY,
      progress_current: 8,
      progress_total: 8,
      progress_label: "Готово",
      universe_key: universeKey,
      result_payload: {
        universe_key: universeKey,
        universe_id: universe?.id || null,
        members_count: allItems.length,
        relations_count: savedRelations.length
      }
    });

    return {
      universe_key: universeKey,
      universe,
      items: allItems,
      relations: savedRelations
    };
  } catch (error) {
    console.error("buildUniverseForJob error:", error);

    await updateUniverseBuildJob(job.id, {
      status: UNIVERSE_JOB_STATUS.FAILED,
      progress_label: "Ошибка построения",
      error_message: error.message || "Ошибка построения"
    });

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
    const libraryItems = await fetchUserLibrary(userId);
    const universeInfo = deriveUniverseInfo(seedEntity);
    const universeItems = getUniverseItemsForSeed(seedEntity, libraryItems);
    const sortedItems = sortUniverseItems(universeItems);
    const universeKey = slugify(universeInfo.universe_key);
    const cover = sortedItems.find((item) => item.media_entities?.cover_url)?.media_entities?.cover_url || "";

    const universe = await upsertUniverseGroup({
      universe_key: universeKey,
      title: universeInfo.title,
      description: resolveDescription(seedEntity),
      cover_url: cover,
      source: "library",
      metadata_json: {
        seed_entity_id: seedEntity.id
      }
    });

    const relationRows = buildRelationRows(seedEntity, sortedItems);
    const savedRelations = await upsertMediaRelations(relationRows);

    await upsertUniverseMembers(universeKey, sortedItems);

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

  const libraryItems = await fetchUserLibrary(userId).catch(() => []);

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

  const libraryItems = await fetchUserLibrary(userId).catch(() => []);
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

  const result = [...grouped.values()]
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

  result.forEach((universe) => {
    upsertUniverseGroup({
      universe_key: universe.universe_key,
      title: universe.title,
      description: universe.description,
      cover_url: universe.cover_url,
      source: "library",
      metadata_json: {
        auto_cached: true
      }
    })
      .then(() => upsertUniverseMembers(universe.universe_key, universe.items))
      .catch((error) => {
        console.warn("Universe cache skipped:", error);
      });
  });

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

  const supabase = getSupabaseClient();

  const { data: members } = await withTimeout(
    supabase
      .from("universe_members")
      .select(`
        *,
        media_entities (*)
      `)
      .eq("universe_key", universeKey)
      .order("sort_order", { ascending: true }),
    "Загрузка участников вселенной",
    DEFAULT_TIMEOUT_MS
  ).catch(() => ({ data: [] }));

  const memberItems = safeArray(members)
    .filter((row) => row.media_entities)
    .map((row) => ({
      id: null,
      entity_id: row.entity_id,
      category: row.media_entities.category,
      status: "planned",
      folder_name: null,
      created_at: null,
      media_entities: row.media_entities
    }));

  if (memberItems.length) {
    const { data: group } = await withTimeout(
      supabase
        .from("universe_groups")
        .select("*")
        .eq("universe_key", universeKey)
        .maybeSingle(),
      "Загрузка группы вселенной",
      DEFAULT_TIMEOUT_MS
    ).catch(() => ({ data: null }));

    const entityIds = memberItems.map((item) => item.media_entities?.id).filter(Boolean);

    const { data: relationsData } = entityIds.length
      ? await withTimeout(
          supabase
            .from("media_relations")
            .select("*")
            .in("from_entity_id", entityIds),
          "Загрузка связей вселенной",
          DEFAULT_TIMEOUT_MS
        ).catch(() => ({ data: [] }))
      : { data: [] };

    return {
      universe: group || {
        universe_key: universeKey,
        title: universeKey,
        description: "",
        cover_url: ""
      },
      items: memberItems,
      relations: safeArray(relationsData)
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
