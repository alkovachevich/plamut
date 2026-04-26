import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";
import { safeArray } from "../utils.js";

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

const CACHE_TTL_MS = 1000 * 60 * 5;

const cache = {
  byUser: new Map(),
  pending: new Map()
};

function now() {
  return Date.now();
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function getUserKey(userId) {
  return cleanText(userId);
}

function getItemEntity(item = {}) {
  return item.media_entities || item.entity || item;
}

function getStableItemKey(item = {}) {
  const entity = getItemEntity(item);

  return (
    cleanText(entity.canonical_key) ||
    cleanText(item.canonical_key) ||
    [
      cleanText(entity.category || item.category),
      cleanText(entity.primary_source),
      cleanText(entity.external_ids?.wikidata),
      cleanText(entity.external_ids?.tmdb),
      cleanText(entity.external_ids?.openlibrary_work),
      cleanText(entity.external_ids?.anilist),
      cleanText(entity.title_primary || entity.title_ru || entity.title_en || entity.original_title),
      cleanText(entity.year)
    ]
      .filter(Boolean)
      .join(":")
      .toLowerCase()
  );
}

function normalizeCachedItem(item = {}) {
  const entity = getItemEntity(item);
  const canonicalKey = getStableItemKey(item);

  return {
    ...item,
    media_entities: {
      ...entity,
      canonical_key: cleanText(entity.canonical_key) || canonicalKey
    }
  };
}

export function dedupeLibraryItems(items = []) {
  const map = new Map();

  safeArray(items).forEach((item) => {
    if (!item?.media_entities && !item?.entity) return;

    const key = getStableItemKey(item);
    if (!key) return;

    const current = map.get(key);

    if (!current) {
      map.set(key, normalizeCachedItem(item));
      return;
    }

    const currentDate = new Date(current.created_at || 0).getTime();
    const nextDate = new Date(item.created_at || 0).getTime();

    map.set(
      key,
      normalizeCachedItem({
        ...current,
        ...item,
        created_at: nextDate > currentDate ? item.created_at : current.created_at,
        media_entities: {
          ...(current.media_entities || {}),
          ...(item.media_entities || {})
        }
      })
    );
  });

  return Array.from(map.values()).sort((a, b) => {
    const ad = new Date(a.created_at || 0).getTime();
    const bd = new Date(b.created_at || 0).getTime();
    return bd - ad;
  });
}

function readCache(userId) {
  const key = getUserKey(userId);
  if (!key) return null;

  const entry = cache.byUser.get(key);
  if (!entry) return null;

  if (now() - entry.createdAt > CACHE_TTL_MS) {
    return {
      ...entry,
      expired: true
    };
  }

  return {
    ...entry,
    expired: false
  };
}

function writeCache(userId, items = []) {
  const key = getUserKey(userId);
  if (!key) return [];

  const deduped = dedupeLibraryItems(items);

  cache.byUser.set(key, {
    createdAt: now(),
    items: deduped
  });

  return deduped;
}

export function clearLibraryCache(userId = null) {
  if (!userId) {
    cache.byUser.clear();
    cache.pending.clear();
    return;
  }

  const key = getUserKey(userId);
  cache.byUser.delete(key);
  cache.pending.delete(key);
}

export function getCachedLibrary(userId) {
  const entry = readCache(userId);
  return entry?.items || [];
}

export function getCachedLibraryItem(userId, canonicalKey) {
  const key = cleanText(canonicalKey);
  if (!key) return null;

  return getCachedLibrary(userId).find((item) => {
    const entity = item.media_entities || {};
    return entity.canonical_key === key;
  }) || null;
}

export async function fetchUserLibraryFromDb(userId, options = {}) {
  const cleanUserId = getUserKey(userId);
  if (!cleanUserId) return [];

  const {
    category = "",
    timeout = 30000
  } = options;

  const supabase = getSupabaseClient();

  let query = supabase
    .from("user_media")
    .select(USER_MEDIA_SELECT)
    .eq("user_id", cleanUserId)
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await withTimeout(
    query,
    "Загрузка библиотеки",
    timeout
  );

  if (error) throw error;

  return dedupeLibraryItems(
    safeArray(data).filter((item) => item?.media_entities)
  );
}

export async function loadUserLibrary(userId, options = {}) {
  const cleanUserId = getUserKey(userId);
  if (!cleanUserId) return [];

  const {
    category = "",
    force = false,
    backgroundRefresh = true
  } = options;

  const cacheKey = `${cleanUserId}:${category || "all"}`;
  const cached = readCache(cacheKey);

  if (!force && cached?.items?.length && !cached.expired) {
    return cached.items;
  }

  if (!force && cached?.items?.length && cached.expired && backgroundRefresh) {
    refreshUserLibrary(userId, { category }).catch((error) => {
      console.warn("Library background refresh skipped:", error);
    });

    return cached.items;
  }

  return refreshUserLibrary(userId, { category });
}

export async function refreshUserLibrary(userId, options = {}) {
  const cleanUserId = getUserKey(userId);
  if (!cleanUserId) return [];

  const category = cleanText(options.category);
  const cacheKey = `${cleanUserId}:${category || "all"}`;

  if (cache.pending.has(cacheKey)) {
    return cache.pending.get(cacheKey);
  }

  const promise = fetchUserLibraryFromDb(cleanUserId, { category })
    .then((items) => writeCache(cacheKey, items))
    .finally(() => {
      cache.pending.delete(cacheKey);
    });

  cache.pending.set(cacheKey, promise);

  return promise;
}

export function updateCachedLibraryItem(userId, updatedItem, options = {}) {
  const cleanUserId = getUserKey(userId);
  if (!cleanUserId || !updatedItem) return [];

  const category = cleanText(options.category || updatedItem.category);
  const cacheKeys = [
    `${cleanUserId}:all`,
    category ? `${cleanUserId}:${category}` : ""
  ].filter(Boolean);

  let result = [];

  cacheKeys.forEach((cacheKey) => {
    const entry = readCache(cacheKey);
    const items = entry?.items || [];

    const updatedKey = getStableItemKey(updatedItem);
    const nextItems = dedupeLibraryItems([
      updatedItem,
      ...items.filter((item) => getStableItemKey(item) !== updatedKey)
    ]);

    cache.byUser.set(cacheKey, {
      createdAt: now(),
      items: nextItems
    });

    result = nextItems;
  });

  return result;
}

export function removeCachedLibraryItem(userId, userMediaId, options = {}) {
  const cleanUserId = getUserKey(userId);
  const cleanId = Number(userMediaId);

  if (!cleanUserId || !cleanId) return [];

  const category = cleanText(options.category);
  const cacheKeys = [
    `${cleanUserId}:all`,
    category ? `${cleanUserId}:${category}` : ""
  ].filter(Boolean);

  let result = [];

  cacheKeys.forEach((cacheKey) => {
    const entry = readCache(cacheKey);
    const nextItems = safeArray(entry?.items).filter((item) => Number(item.id) !== cleanId);

    cache.byUser.set(cacheKey, {
      createdAt: now(),
      items: nextItems
    });

    result = nextItems;
  });

  return result;
}

export function getLibraryCacheDebugInfo() {
  return {
    keys: Array.from(cache.byUser.keys()),
    pending: Array.from(cache.pending.keys()),
    sizes: Array.from(cache.byUser.entries()).map(([key, value]) => ({
      key,
      size: value.items?.length || 0,
      ageMs: now() - value.createdAt
    }))
  };
}
