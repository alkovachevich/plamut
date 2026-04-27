import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";

const CACHE_KEY = "plamut_library_cache_v3";
const LEGACY_CACHE_KEYS = ["plamut_library_cache_v2", "plamut_library_cache"];
const CACHE_TTL = 1000 * 60 * 10;
const LIBRARY_DB_TIMEOUT_MS = 14000;
const RETRY_AFTER_TIMEOUT_MS = 2500;
const MAX_DEFERRED_RETRIES = 2;

const loadPromisesByUserId = new Map();
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

function cleanupLegacyCacheKeys() {
  try {
    LEGACY_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn("library-cache: legacy cleanup skipped", error);
  }
}

cleanupLegacyCacheKeys();

function normalizeBucket(input = {}) {
  const categories = input.categories && typeof input.categories === "object"
    ? input.categories
    : {};

  return {
    updated_at: Number(input.updated_at || 0),
    full: Array.isArray(input.full) ? input.full : [],
    list: Array.isArray(input.list) ? input.list : [],
    categories
  };
}

function hasValidItems(items) {
  return Array.isArray(items) && items.every((item) => item && typeof item === "object");
}

function isBrokenBucket(bucket = {}) {
  if (!bucket || typeof bucket !== "object") return true;
  if (!Array.isArray(bucket.list) || !Array.isArray(bucket.full)) return true;
  if (!bucket.categories || typeof bucket.categories !== "object") return true;
  return false;
}

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
    bucket.categories[cleanCategory] = {
      list: [],
      full: []
    };
  }

  const value = bucket.categories[cleanCategory];
  bucket.categories[cleanCategory] = {
    list: Array.isArray(value.list) ? value.list : [],
    full: Array.isArray(value.full) ? value.full : []
  };

  return bucket.categories[cleanCategory];
}

function isExpired(updatedAt = 0) {
  return now() - Number(updatedAt || 0) > CACHE_TTL;
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

function dedupeAndSort(items = []) {
  const map = new Map();

  for (const item of items) {
    const key = itemDedupeKey(item);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }

    const prev = map.get(key) || {};
    map.set(key, {
      ...prev,
      ...item,
      media_entities: {
        ...(prev.media_entities || {}),
        ...(item.media_entities || {})
      }
    });
  }

  return [...map.values()].sort((a, b) => {
    const at = new Date(a?.created_at || 0).getTime();
    const bt = new Date(b?.created_at || 0).getTime();
    return bt - at;
  });
}

function assignBucketItems(bucket, mode, items = []) {
  const normalized = dedupeAndSort(items);
  bucket[mode] = normalized;

  const categories = {};
  for (const item of normalized) {
    const category = resolveItemCategory(item);
    if (!category) continue;

    if (!categories[category]) {
      categories[category] = { list: [], full: [] };
    }

    categories[category][mode].push(item);
  }

  Object.entries(categories).forEach(([category, byMode]) => {
    const categoryBucket = ensureCategoryBucket(bucket, category);
    categoryBucket[mode] = dedupeAndSort(byMode[mode]);
  });
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

function getLocalLibrarySnapshot(userId, { mode = "list", category = "" } = {}) {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return [];

  const cache = readRawCache();
  const bucket = normalizeBucket(cache[cleanUserId]);
  if (isBrokenBucket(bucket)) return [];
  return getBucketItems(bucket, { mode, category });
}

function isTimeoutError(error) {
  return /превышено время ожидания/i.test(String(error?.message || ""));
}

function scheduleRetry(userId) {
  const cleanUserId = clean(userId);
  if (!cleanUserId || retryTimersByUserId.has(cleanUserId)) return;
  const attempts = Number(retryAttemptsByUserId.get(cleanUserId) || 0);
  if (attempts >= MAX_DEFERRED_RETRIES) return;

  const timerId = setTimeout(() => {
    retryTimersByUserId.delete(cleanUserId);
    retryAttemptsByUserId.set(cleanUserId, attempts + 1);
    refreshUserLibrary(cleanUserId, { mode: "full", category: "" }).catch((error) => {
      console.warn("library-cache: deferred DB retry skipped", error);
      if (isTimeoutError(error)) {
        scheduleRetry(cleanUserId);
      }
    });
  }, RETRY_AFTER_TIMEOUT_MS);

  retryTimersByUserId.set(cleanUserId, timerId);
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

export function getCachedLibrary(userId, { mode = "list", category = "" } = {}) {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return [];

  const cache = readRawCache();
  const bucket = normalizeBucket(cache[cleanUserId]);
  if (isBrokenBucket(bucket)) return [];

  if (!bucket.updated_at || isExpired(bucket.updated_at)) {
    return [];
  }

  return getBucketItems(bucket, { mode, category });
}

export function getCachedLibraryItem(userId, canonicalKey, { mode = "list", category = "" } = {}) {
  const key = cleanLower(canonicalKey);
  if (!key) return null;

  const list = getCachedLibrary(userId, { mode, category });

  return list.find((item) => cleanLower(item?.media_entities?.canonical_key) === key) || null;
}

export function updateCachedLibraryItem(userId, item, { category = "" } = {}) {
  const cleanUserId = clean(userId);
  if (!cleanUserId || !item) return;

  const cache = readRawCache();
  const bucket = getUserBucket(cache, cleanUserId);

  ["list", "full"].forEach((mode) => {
    const source = Array.isArray(bucket[mode]) ? bucket[mode] : [];
    const withItem = [item, ...source];
    assignBucketItems(bucket, mode, withItem);
  });

  const scopedCategory = cleanLower(category || resolveItemCategory(item));
  if (scopedCategory) {
    const scopedBucket = ensureCategoryBucket(bucket, scopedCategory);
    ["list", "full"].forEach((mode) => {
      scopedBucket[mode] = dedupeAndSort([item, ...(scopedBucket[mode] || [])]);
    });
  }

  bucket.updated_at = now();
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
  });

  const cleanCategory = cleanLower(category);
  if (cleanCategory) {
    const categoryBucket = ensureCategoryBucket(bucket, cleanCategory);
    ["list", "full"].forEach((mode) => {
      categoryBucket[mode] = dedupeAndSort(
        (categoryBucket[mode] || []).filter((item) => Number(item?.id || 0) !== cleanId)
      );
    });
  } else {
    Object.keys(bucket.categories || {}).forEach((bucketCategory) => {
      const categoryBucket = ensureCategoryBucket(bucket, bucketCategory);
      ["list", "full"].forEach((mode) => {
        categoryBucket[mode] = dedupeAndSort(
          (categoryBucket[mode] || []).filter((item) => Number(item?.id || 0) !== cleanId)
        );
      });
    });
  }

  bucket.updated_at = now();
  cache[cleanUserId] = bucket;
  writeRawCache(cache);
}

async function fetchUserLibraryFromDb(userId, { mode = "list", category = "" } = {}) {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return [];

  const supabase = getSupabaseClient();

  const select = mode === "full"
    ? `
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
    `
    : `
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
        cover_url
      )
    `;

  let query = supabase
    .from("user_media")
    .select(select)
    .eq("user_id", cleanUserId)
    .order("created_at", { ascending: false });

  const cleanCategory = cleanLower(category);
  if (cleanCategory) {
    query = query.eq("category", cleanCategory);
  }

  const { data, error } = await withTimeout(query, "Загрузка библиотеки", LIBRARY_DB_TIMEOUT_MS);

  if (error) {
    throw error;
  }

  return dedupeAndSort(Array.isArray(data) ? data : []);
}

export async function refreshUserLibrary(userId, { mode = "full", category = "" } = {}) {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return [];

  const cache = readRawCache();
  const bucket = getUserBucket(cache, cleanUserId);

  const fresh = await fetchUserLibraryFromDb(cleanUserId, {
    mode: "full",
    category: ""
  });

  if (!hasValidItems(fresh)) {
    throw new Error("library-cache: invalid DB payload");
  }

  assignBucketItems(bucket, "full", fresh);
  assignBucketItems(bucket, "list", fresh);

  bucket.updated_at = now();
  writeRawCache(cache);
  retryAttemptsByUserId.set(cleanUserId, 0);

  return getBucketItems(bucket, { mode, category });
}

export async function loadUserLibrary(
  userId,
  {
    mode = "list",
    category = "",
    allowStale = true,
    backgroundRefresh = true
  } = {}
) {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return [];

  const loadKey = `${cleanUserId}::${mode}::${cleanLower(category)}`;
  if (loadPromisesByUserId.has(loadKey)) {
    return loadPromisesByUserId.get(loadKey);
  }

  const cached = getCachedLibrary(cleanUserId, { mode, category });
  const localSnapshot = cached.length ? cached : getLocalLibrarySnapshot(cleanUserId, { mode, category });

  if (localSnapshot.length && allowStale) {
    if (backgroundRefresh) {
      refreshUserLibrary(cleanUserId, { mode: "full" }).catch((error) => {
        console.warn("library-cache: background refresh skipped", error);
      });
    }

    return localSnapshot;
  }

  const loadPromise = (async () => {
    try {
      return await refreshUserLibrary(cleanUserId, { mode, category });
    } catch (error) {
      if (isTimeoutError(error)) {
        console.warn("library-cache: DB load timed out, showing local data", error);
        scheduleRetry(cleanUserId);
      } else {
        console.warn("library-cache: DB load failed, using fallback cache", error);
      }

      return localSnapshot;
    } finally {
      loadPromisesByUserId.delete(loadKey);
    }
  })();

  loadPromisesByUserId.set(loadKey, loadPromise);
  return loadPromise;
}
