import {
  getSupabaseClient,
  withTimeout,
  getCurrentSession
} from "../lib/supabase-client.js";
import { safeArray } from "../utils.js";

const USER_MEDIA_LIST_SELECT = `
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
    title_primary,
    title_ru,
    title_en,
    original_title,
    year,
    cover_url,
    universe_key
  )
`;

const USER_MEDIA_FULL_SELECT = `
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
const LIBRARY_TIMEOUT_MS = 9000;

const cache = {
  byKey: new Map(),
  pending: new Map()
};

function now() {
  return Date.now();
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function buildCacheKey(userId, category = "", mode = "list") {
  const cleanUserId = cleanText(userId);
  const cleanCategory = cleanText(category) || "all";
  const cleanMode = cleanText(mode) || "list";
  return `${cleanUserId}:${cleanCategory}:${cleanMode}`;
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
      cleanText(entity.id || item.entity_id),
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

function readCache(cacheKey) {
  if (!cacheKey) return null;

  const entry = cache.byKey.get(cacheKey);
  if (!entry) return null;

  return {
    ...entry,
    expired: now() - entry.createdAt > CACHE_TTL_MS
  };
}

function writeCache(cacheKey, items = []) {
  if (!cacheKey) return [];

  const deduped = dedupeLibraryItems(items);

  cache.byKey.set(cacheKey, {
    createdAt: now(),
    items: deduped
  });

  return deduped;
}

async function hasValidSessionForUser(userId) {
  const session = await getCurrentSession().catch(() => null);
  return Boolean(session?.user?.id && session.user.id === userId);
}

function getSelectByMode(mode = "list") {
  return mode === "full" ? USER_MEDIA_FULL_SELECT : USER_MEDIA_LIST_SELECT;
}

export function clearLibraryCache(userId = null) {
  if (!userId) {
    cache.byKey.clear();
    cache.pending.clear();
    return;
  }

  const prefix = `${cleanText(userId)}:`;

  Array.from(cache.byKey.keys()).forEach((key) => {
    if (key.startsWith(prefix)) cache.byKey.delete(key);
  });

  Array.from(cache.pending.keys()).forEach((key) => {
    if (key.startsWith(prefix)) cache.pending.delete(key);
  });
}

export function getCachedLibrary(userId, options = {}) {
  const mode = cleanText(options.mode) || "list";
  const cacheKey = buildCacheKey(userId, options.category, mode);
  const entry = readCache(cacheKey);
  return entry?.items || [];
}

export function getCachedLibraryItem(userId, canonicalKey, options = {}) {
  const key = cleanText(canonicalKey);
  if (!key) return null;

  const mode = cleanText(options.mode) || "list";

  return (
    getCachedLibrary(userId, { ...options, mode }).find((item) => {
      const entity = item.media_entities || {};
      return entity.canonical_key === key;
    }) || null
  );
}

export async function fetchUserLibraryFromDb(userId, options = {}) {
  const cleanUserId = cleanText(userId);
  if (!cleanUserId) return [];

  const category = cleanText(options.category);
  const mode = cleanText(options.mode) || "list";

  const sessionOk = await hasValidSessionForUser(cleanUserId);
  if (!sessionOk) return [];

  const supabase = getSupabaseClient();

  let query = supabase
    .from("user_media")
    .select(getSelectByMode(mode))
    .eq("user_id", cleanUserId)
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await withTimeout(
    query,
    "Загрузка библиотеки",
    LIBRARY_TIMEOUT_MS
  );

  if (error) throw error;

  return dedupeLibraryItems(
    safeArray(data).filter((item) => item?.media_entities)
  );
}

export async function loadUserLibrary(userId, options = {}) {
  const cleanUserId = cleanText(userId);
  if (!cleanUserId) return [];

  const category = cleanText(options.category);
  const mode = cleanText(options.mode) || "list";
  const force = Boolean(options.force);
  const allowStale = options.allowStale !== false;
  const backgroundRefresh = Boolean(options.backgroundRefresh);
  const cacheKey = buildCacheKey(cleanUserId, category, mode);
  const cached = readCache(cacheKey);

  if (!force && cached?.items?.length && !cached.expired) {
    return cached.items;
  }

  if (!force && allowStale && cached?.items?.length) {
    if (backgroundRefresh) {
      refreshUserLibrary(cleanUserId, { category, mode }).catch((error) => {
        console.warn("Library background refresh skipped:", error);
      });
    }

    return cached.items;
  }

  try {
    return await refreshUserLibrary(cleanUserId, { category, mode });
  } catch (error) {
    console.warn("Library initial load skipped:", error);
    return cached?.items || [];
  }
}

export async function refreshUserLibrary(userId, options = {}) {
  const cleanUserId = cleanText(userId);
  if (!cleanUserId) return [];

  const category = cleanText(options.category);
  const mode = cleanText(options.mode) || "list";
  const cacheKey = buildCacheKey(cleanUserId, category, mode);

  if (cache.pending.has(cacheKey)) {
    return cache.pending.get(cacheKey);
  }

  const promise = fetchUserLibraryFromDb(cleanUserId, { category, mode })
    .then((items) => writeCache(cacheKey, items))
    .catch((error) => {
      console.warn("Library refresh failed:", error);
      return readCache(cacheKey)?.items || [];
    })
    .finally(() => {
      cache.pending.delete(cacheKey);
    });

  cache.pending.set(cacheKey, promise);

  return promise;
}

export function updateCachedLibraryItem(userId, updatedItem, options = {}) {
  const cleanUserId = cleanText(userId);
  if (!cleanUserId || !updatedItem) return [];

  const category = cleanText(options.category || updatedItem.category);
  const updatedKey = getStableItemKey(updatedItem);

  const cacheKeys = Array.from(cache.byKey.keys()).filter((key) => {
    if (!key.startsWith(`${cleanUserId}:`)) return false;
    if (!category) return true;

    return (
      key === buildCacheKey(cleanUserId, "", "list") ||
      key === buildCacheKey(cleanUserId, "", "full") ||
      key === buildCacheKey(cleanUserId, category, "list") ||
      key === buildCacheKey(cleanUserId, category, "full")
    );
  });

  let result = [];

  cacheKeys.forEach((cacheKey) => {
    const entry = readCache(cacheKey);
    const items = entry?.items || [];

    const nextItems = dedupeLibraryItems([
      updatedItem,
      ...items.filter((item) => getStableItemKey(item) !== updatedKey)
    ]);

    cache.byKey.set(cacheKey, {
      createdAt: now(),
      items: nextItems
    });

    result = nextItems;
  });

  return result;
}

export function removeCachedLibraryItem(userId, userMediaId, options = {}) {
  const cleanUserId = cleanText(userId);
  const cleanId = Number(userMediaId);

  if (!cleanUserId || !cleanId) return [];

  const category = cleanText(options.category);

  const cacheKeys = Array.from(cache.byKey.keys()).filter((key) => {
    if (!key.startsWith(`${cleanUserId}:`)) return false;
    if (!category) return true;

    return (
      key === buildCacheKey(cleanUserId, "", "list") ||
      key === buildCacheKey(cleanUserId, "", "full") ||
      key === buildCacheKey(cleanUserId, category, "list") ||
      key === buildCacheKey(cleanUserId, category, "full")
    );
  });

  let result = [];

  cacheKeys.forEach((cacheKey) => {
    const entry = readCache(cacheKey);
    const nextItems = safeArray(entry?.items).filter((item) => Number(item.id) !== cleanId);

    cache.byKey.set(cacheKey, {
      createdAt: now(),
      items: nextItems
    });

    result = nextItems;
  });

  return result;
}

export function getLibraryCacheDebugInfo() {
  return {
    keys: Array.from(cache.byKey.keys()),
    pending: Array.from(cache.pending.keys()),
    sizes: Array.from(cache.byKey.entries()).map(([key, value]) => ({
      key,
      size: value.items?.length || 0,
      ageMs: now() - value.createdAt
    }))
  };
}
