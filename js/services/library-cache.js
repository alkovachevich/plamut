import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";

const CACHE_KEY = "plamut_library_cache_v4";
const LEGACY_CACHE_KEYS = [
  "plamut_library_cache_v3",
  "plamut_library_cache_v2",
  "plamut_library_cache"
];

const CACHE_TTL = 1000 * 60 * 10;
const LIST_DB_TIMEOUT_MS = 8000;
const FULL_DB_TIMEOUT_MS = 12000;
const RETRY_AFTER_TIMEOUT_MS = 2500;
const MAX_DEFERRED_RETRIES = 2;

const loadPromisesByKey = new Map();
const refreshPromisesByKey = new Map();
const retryTimersByUserId = new Map();
const retryAttemptsByUserId = new Map();

function now() {
  return Date.now();
}

function clean(value = "") {
  return String(value || "").trim();
}

function cleanLower(value = "") {
  return clean(value).toLowerCase();
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function readRawCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};

    const parsed = safeJsonParse(raw, {});
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRawCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn("library-cache: write skipped", error);
  }
}

function readLegacyCache() {
  try {
    for (const key of LEGACY_CACHE_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = safeJsonParse(raw, {});
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    }
  } catch {
    return {};
  }

  return {};
}

function cleanupLegacyCacheKeys() {
  try {
    LEGACY_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn("library-cache: legacy cleanup skipped", error);
  }
}

function normalizeCategoryBucket(input = {}) {
  return {
    list: Array.isArray(input.list) ? input.list : [],
    full: Array.isArray(input.full) ? input.full : [],
    updated_at: {
      list: Number(input?.updated_at?.list || input?.list_updated_at || 0),
      full: Number(input?.updated_at?.full || input?.full_updated_at || 0)
    }
  };
}

function normalizeBucket(input = {}) {
  const categories = input.categories && typeof input.categories === "object"
    ? input.categories
    : {};

  const normalizedCategories = {};

  Object.entries(categories).forEach(([category, value]) => {
    const cleanCategory = cleanLower(category);
    if (!cleanCategory) return;
    normalizedCategories[cleanCategory] = normalizeCategoryBucket(value);
  });

  const legacyUpdatedAt = Number(input.updated_at || 0);

  return {
    updated_at: {
      list: Number(input?.updated_at?.list || input.list_updated_at || legacyUpdatedAt || 0),
      full: Number(input?.updated_at?.full || input.full_updated_at || legacyUpdatedAt || 0)
    },
    full: Array.isArray(input.full) ? input.full : [],
    list: Array.isArray(input.list) ? input.list : [],
    categories: normalizedCategories
  };
}

function isBrokenBucket(bucket = {}) {
  if (!bucket || typeof bucket !== "object") return true;
  if (!Array.isArray(bucket.list) || !Array.isArray(bucket.full)) return true;
  if (!bucket.categories || typeof bucket.categories !== "object") return true;
  return false;
}

function migrateLegacyCacheIfNeeded() {
  const current = readRawCache();
  if (Object.keys(current).length) {
    cleanupLegacyCacheKeys();
    return;
  }

  const legacy = readLegacyCache();
  if (!legacy || !Object.keys(legacy).length) {
    cleanupLegacyCacheKeys();
    return;
  }

  const migrated = {};

  Object.entries(legacy).forEach(([userId, bucket]) => {
    const cleanUserId = clean(userId);
    if (!cleanUserId) return;
    migrated[cleanUserId] = normalizeBucket(bucket);
  });

  if (Object.keys(migrated).length) {
    writeRawCache(migrated);
  }

  cleanupLegacyCacheKeys();
}

migrateLegacyCacheIfNeeded();

function getUserBucket(cache, userId) {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return null;

  if (!cache[cleanUserId]) {
    cache[cleanUserId] = normalizeBucket({});
  }

  cache[cleanUserId] = normalizeBucket(cache[cleanUserId]);
  return cache[cleanUserId];
}

function ensureCategoryBucket(bucket, category = "") {
  const cleanCategory = cleanLower(category);
  if (!cleanCategory) return null;

  if (!bucket.categories[cleanCategory]) {
    bucket.categories[cleanCategory] = normalizeCategoryBucket({});
  }

  bucket.categories[cleanCategory] = normalizeCategoryBucket(bucket.categories[cleanCategory]);
  return bucket.categories[cleanCategory];
}

function isExpired(updatedAt = 0) {
  return !updatedAt || now() - Number(updatedAt || 0) > CACHE_TTL;
}

function isTimeoutError(error) {
  return /превышено время ожидания/i.test(String(error?.message || ""));
}

function resolveItemCategory(item = {}) {
  return cleanLower(item?.media_entities?.category || item?.category || "");
}

function itemDedupeKey(item = {}) {
  const canonical = cleanLower(item?.media_entities?.canonical_key || "");
  if (canonical) return `canonical:${canonical}`;

  const entityId = Number(item?.entity_id || item?.media_entities?.id || 0);
  if (entityId) return `entity:${entityId}`;

  const userMediaId = Number(item?.id || 0);
  if (userMediaId) return `user_media:${userMediaId}`;

  return "";
}

function mergeLibraryItems(previous = {}, incoming = {}) {
  return {
    ...previous,
    ...incoming,
    media_entities: {
      ...(previous.media_entities || {}),
      ...(incoming.media_entities || {})
    }
  };
}

function dedupeAndSort(items = []) {
  const map = new Map();

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const key = itemDedupeKey(item);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }

    map.set(key, mergeLibraryItems(map.get(key), item));
  }

  return [...map.values()].sort((a, b) => {
    const at = new Date(a?.created_at || 0).getTime();
    const bt = new Date(b?.created_at || 0).getTime();
    return bt - at;
  });
}

function hasValidItems(items) {
  return Array.isArray(items) && items.every((item) => item && typeof item === "object");
}

function updateCategoryBucketsFromItems(bucket, mode, items = []) {
  const categories = {};

  for (const item of items) {
    const category = resolveItemCategory(item);
    if (!category) continue;

    if (!categories[category]) {
      categories[category] = [];
    }

    categories[category].push(item);
  }

  Object.entries(categories).forEach(([category, categoryItems]) => {
    const categoryBucket = ensureCategoryBucket(bucket, category);
    categoryBucket[mode] = dedupeAndSort(categoryItems);
    categoryBucket.updated_at[mode] = bucket.updated_at[mode] || now();
  });
}

function assignBucketItems(bucket, mode, items = [], { category = "" } = {}) {
  const cleanMode = mode === "full" ? "full" : "list";
  const cleanCategory = cleanLower(category);
  const normalized = dedupeAndSort(items);

  if (cleanCategory) {
    const categoryBucket = ensureCategoryBucket(bucket, cleanCategory);
    categoryBucket[cleanMode] = normalized;
    categoryBucket.updated_at[cleanMode] = now();

    const otherItems = bucket[cleanMode].filter(
      (item) => resolveItemCategory(item) !== cleanCategory
    );

    bucket[cleanMode] = dedupeAndSort([...normalized, ...otherItems]);
  } else {
    bucket[cleanMode] = normalized;
    bucket.updated_at[cleanMode] = now();
    updateCategoryBucketsFromItems(bucket, cleanMode, normalized);
  }
}

function getBucketUpdatedAt(bucket, { mode = "list", category = "" } = {}) {
  const cleanMode = mode === "full" ? "full" : "list";
  const cleanCategory = cleanLower(category);

  if (!cleanCategory) {
    return Number(bucket?.updated_at?.[cleanMode] || 0);
  }

  const categoryBucket = ensureCategoryBucket(bucket, cleanCategory);
  return Number(categoryBucket?.updated_at?.[cleanMode] || 0);
}

function getBucketItems(bucket, { mode = "list", category = "" } = {}) {
  const cleanMode = mode === "full" ? "full" : "list";
  const cleanCategory = cleanLower(category);

  if (!cleanCategory) {
    return Array.isArray(bucket[cleanMode]) ? bucket[cleanMode] : [];
  }

  const categoryBucket = ensureCategoryBucket(bucket, cleanCategory);
  return Array.isArray(categoryBucket?.[cleanMode]) ? categoryBucket[cleanMode] : [];
}

function readUserBucket(userId) {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return null;

  const cache = readRawCache();
  const bucket = normalizeBucket(cache[cleanUserId]);

  if (isBrokenBucket(bucket)) return null;
  return bucket;
}

function getLocalLibrarySnapshot(userId, { mode = "list", category = "" } = {}) {
  const bucket = readUserBucket(userId);
  if (!bucket) return [];
  return getBucketItems(bucket, { mode, category });
}

function scheduleRetry(userId) {
  const cleanUserId = clean(userId);
  if (!cleanUserId || retryTimersByUserId.has(cleanUserId)) return;

  const attempts = Number(retryAttemptsByUserId.get(cleanUserId) || 0);
  if (attempts >= MAX_DEFERRED_RETRIES) return;

  const timerId = setTimeout(() => {
    retryTimersByUserId.delete(cleanUserId);
    retryAttemptsByUserId.set(cleanUserId, attempts + 1);

    refreshUserLibrary(cleanUserId, {
      mode: "list",
      category: "",
      force: true
    }).catch((error) => {
      console.warn("library-cache: deferred DB retry skipped", error);
      if (isTimeoutError(error)) {
        scheduleRetry(cleanUserId);
      }
    });
  }, RETRY_AFTER_TIMEOUT_MS);

  retryTimersByUserId.set(cleanUserId, timerId);
}

function buildSelect(mode = "list") {
  if (mode === "full") {
    return `
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
  }

  return `
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
}

async function fetchUserLibraryFromDb(userId, { mode = "list", category = "" } = {}) {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return [];

  const cleanMode = mode === "full" ? "full" : "list";
  const cleanCategory = cleanLower(category);
  const supabase = getSupabaseClient();

  let query = supabase
    .from("user_media")
    .select(buildSelect(cleanMode))
    .eq("user_id", cleanUserId)
    .order("created_at", { ascending: false });

  if (cleanCategory) {
    query = query.eq("category", cleanCategory);
  }

  const timeoutMs = cleanMode === "full" ? FULL_DB_TIMEOUT_MS : LIST_DB_TIMEOUT_MS;

  const { data, error } = await withTimeout(
    query,
    cleanMode === "full" ? "Загрузка полной библиотеки" : "Загрузка списка библиотеки",
    timeoutMs
  );

  if (error) throw error;

  return dedupeAndSort(Array.isArray(data) ? data : []);
}

function shouldBackgroundRefresh(userId, { mode = "list", category = "" } = {}) {
  const bucket = readUserBucket(userId);
  if (!bucket) return true;

  const updatedAt = getBucketUpdatedAt(bucket, { mode, category });
  return isExpired(updatedAt);
}

function refreshKey(userId, { mode = "list", category = "" } = {}) {
  return `${clean(userId)}::${mode === "full" ? "full" : "list"}::${cleanLower(category)}`;
}

export function clearLibraryCache(userId = null) {
  if (!userId) {
    localStorage.removeItem(CACHE_KEY);
    return;
  }

  const cache = readRawCache();
  delete cache[clean(userId)];
  writeRawCache(cache);
}

export function getCachedLibrary(
  userId,
  {
    mode = "list",
    category = "",
    allowExpired = false
  } = {}
) {
  const bucket = readUserBucket(userId);
  if (!bucket) return [];

  const updatedAt = getBucketUpdatedAt(bucket, { mode, category });

  if (!allowExpired && isExpired(updatedAt)) {
    return [];
  }

  return getBucketItems(bucket, { mode, category });
}

export function getCachedLibraryItem(
  userId,
  canonicalKey,
  {
    mode = "list",
    category = "",
    allowExpired = true
  } = {}
) {
  const key = cleanLower(canonicalKey);
  if (!key) return null;

  const list = getCachedLibrary(userId, {
    mode,
    category,
    allowExpired
  });

  return list.find((item) => cleanLower(item?.media_entities?.canonical_key) === key) || null;
}

export function updateCachedLibraryItem(userId, item, { category = "" } = {}) {
  const cleanUserId = clean(userId);
  if (!cleanUserId || !item) return;

  const cache = readRawCache();
  const bucket = getUserBucket(cache, cleanUserId);
  const itemCategory = cleanLower(category || resolveItemCategory(item));

  ["list", "full"].forEach((mode) => {
    const source = Array.isArray(bucket[mode]) ? bucket[mode] : [];
    const next = dedupeAndSort([item, ...source]);
    bucket[mode] = next;
    bucket.updated_at[mode] = now();

    if (itemCategory) {
      const categoryBucket = ensureCategoryBucket(bucket, itemCategory);
      categoryBucket[mode] = dedupeAndSort([item, ...(categoryBucket[mode] || [])]);
      categoryBucket.updated_at[mode] = now();
    }
  });

  cache[cleanUserId] = bucket;
  writeRawCache(cache);
}

export function removeCachedLibraryItem(userId, userMediaId, { category = "" } = {}) {
  const cleanUserId = clean(userId);
  const cleanId = Number(userMediaId || 0);
  if (!cleanUserId || !cleanId) return;

  const cache = readRawCache();
  const bucket = cache[cleanUserId] ? normalizeBucket(cache[cleanUserId]) : null;
  if (!bucket) return;

  ["list", "full"].forEach((mode) => {
    bucket[mode] = dedupeAndSort(
      (bucket[mode] || []).filter((item) => Number(item?.id || 0) !== cleanId)
    );
    bucket.updated_at[mode] = now();
  });

  const cleanCategory = cleanLower(category);

  if (cleanCategory) {
    const categoryBucket = ensureCategoryBucket(bucket, cleanCategory);

    ["list", "full"].forEach((mode) => {
      categoryBucket[mode] = dedupeAndSort(
        (categoryBucket[mode] || []).filter((item) => Number(item?.id || 0) !== cleanId)
      );
      categoryBucket.updated_at[mode] = now();
    });
  } else {
    Object.keys(bucket.categories || {}).forEach((bucketCategory) => {
      const categoryBucket = ensureCategoryBucket(bucket, bucketCategory);

      ["list", "full"].forEach((mode) => {
        categoryBucket[mode] = dedupeAndSort(
          (categoryBucket[mode] || []).filter((item) => Number(item?.id || 0) !== cleanId)
        );
        categoryBucket.updated_at[mode] = now();
      });
    });
  }

  cache[cleanUserId] = bucket;
  writeRawCache(cache);
}

export async function refreshUserLibrary(
  userId,
  {
    mode = "list",
    category = "",
    force = false
  } = {}
) {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return [];

  const cleanMode = mode === "full" ? "full" : "list";
  const cleanCategory = cleanLower(category);
  const key = refreshKey(cleanUserId, { mode: cleanMode, category: cleanCategory });

  if (!force && refreshPromisesByKey.has(key)) {
    return refreshPromisesByKey.get(key);
  }

  const refreshPromise = (async () => {
    const fresh = await fetchUserLibraryFromDb(cleanUserId, {
      mode: cleanMode,
      category: cleanCategory
    });

    if (!hasValidItems(fresh)) {
      throw new Error("library-cache: invalid DB payload");
    }

    const cache = readRawCache();
    const bucket = getUserBucket(cache, cleanUserId);

    assignBucketItems(bucket, cleanMode, fresh, {
      category: cleanCategory
    });

    cache[cleanUserId] = bucket;
    writeRawCache(cache);
    retryAttemptsByUserId.set(cleanUserId, 0);

    return getBucketItems(bucket, {
      mode: cleanMode,
      category: cleanCategory
    });
  })().finally(() => {
    refreshPromisesByKey.delete(key);
  });

  refreshPromisesByKey.set(key, refreshPromise);
  return refreshPromise;
}

export function refreshUserLibraryInBackground(
  userId,
  {
    mode = "list",
    category = "",
    force = false
  } = {}
) {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return;

  const cleanMode = mode === "full" ? "full" : "list";
  const cleanCategory = cleanLower(category);

  if (!force && !shouldBackgroundRefresh(cleanUserId, { mode: cleanMode, category: cleanCategory })) {
    return;
  }

  refreshUserLibrary(cleanUserId, {
    mode: cleanMode,
    category: cleanCategory,
    force
  }).catch((error) => {
    if (isTimeoutError(error)) {
      console.warn("library-cache: background refresh timed out", error);
      scheduleRetry(cleanUserId);
      return;
    }

    console.warn("library-cache: background refresh skipped", error);
  });
}

export async function loadUserLibrary(
  userId,
  {
    mode = "list",
    category = "",
    allowStale = true,
    backgroundRefresh = true,
    forceRefresh = false
  } = {}
) {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return [];

  const cleanMode = mode === "full" ? "full" : "list";
  const cleanCategory = cleanLower(category);
  const loadKey = `${cleanUserId}::${cleanMode}::${cleanCategory}::${allowStale ? "stale" : "fresh"}::${forceRefresh ? "force" : "normal"}`;

  if (loadPromisesByKey.has(loadKey)) {
    return loadPromisesByKey.get(loadKey);
  }

  const freshCache = getCachedLibrary(cleanUserId, {
    mode: cleanMode,
    category: cleanCategory,
    allowExpired: false
  });

  if (freshCache.length && !forceRefresh) {
    if (backgroundRefresh) {
      refreshUserLibraryInBackground(cleanUserId, {
        mode: cleanMode,
        category: cleanCategory
      });
    }

    return freshCache;
  }

  const staleSnapshot = getLocalLibrarySnapshot(cleanUserId, {
    mode: cleanMode,
    category: cleanCategory
  });

  if (allowStale && staleSnapshot.length && !forceRefresh) {
    if (backgroundRefresh) {
      refreshUserLibraryInBackground(cleanUserId, {
        mode: cleanMode,
        category: cleanCategory
      });
    }

    return staleSnapshot;
  }

  const loadPromise = (async () => {
    try {
      return await refreshUserLibrary(cleanUserId, {
        mode: cleanMode,
        category: cleanCategory,
        force: forceRefresh
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        console.warn("library-cache: DB load timed out, showing local data", error);
        scheduleRetry(cleanUserId);
      } else {
        console.warn("library-cache: DB load failed, using fallback cache", error);
      }

      return staleSnapshot;
    } finally {
      loadPromisesByKey.delete(loadKey);
    }
  })();

  loadPromisesByKey.set(loadKey, loadPromise);
  return loadPromise;
}
