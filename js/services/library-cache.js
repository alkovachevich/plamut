import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";

const CACHE_KEY = "plamut_library_cache_v6";

const LEGACY_CACHE_KEYS = [
  "plamut_library_cache_v5",
  "plamut_library_cache_v4",
  "plamut_library_cache_v3",
  "plamut_library_cache_v2",
  "plamut_library_cache"
];

const CACHE_TTL_MS = 1000 * 60 * 10;
const STALE_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
const LIST_DB_TIMEOUT_MS = 9000;
const FULL_DB_TIMEOUT_MS = 14000;

const loadPromises = new Map();
const refreshPromises = new Map();

function now() {
  return Date.now();
}

function clean(value = "") {
  return String(value || "").trim();
}

function cleanLower(value = "") {
  return clean(value).toLowerCase();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isUsefulValue(value) {
  const text = clean(value);
  return Boolean(text && text !== "undefined" && text !== "null");
}

function isUsefulObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function pickStableValue(previousValue, incomingValue) {
  return isUsefulValue(incomingValue) ? incomingValue : previousValue;
}

function pickStableNumber(previousValue, incomingValue) {
  const incomingNumber = Number(incomingValue);
  if (Number.isFinite(incomingNumber) && incomingNumber > 0) {
    return incomingValue;
  }

  return previousValue;
}

function pickStableJson(previousValue, incomingValue) {
  const previousObject = isUsefulObject(previousValue) ? previousValue : {};
  const incomingObject = isUsefulObject(incomingValue) ? incomingValue : {};

  return {
    ...previousObject,
    ...incomingObject
  };
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};

    const parsed = safeJsonParse(raw, {});
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache || {}));
  } catch (error) {
    console.warn("library-cache: write skipped", error);
  }
}

function cleanupLegacyCache() {
  try {
    LEGACY_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn("library-cache: legacy cleanup skipped", error);
  }
}

function emptyBucket() {
  return {
    list: [],
    full: [],
    categories: {},
    updated_at: {
      list: 0,
      full: 0
    },
    last_refresh_at: 0
  };
}

function emptyCategoryBucket() {
  return {
    list: [],
    full: [],
    updated_at: {
      list: 0,
      full: 0
    }
  };
}

function migrateLegacyCache() {
  const current = readCache();

  if (Object.keys(current).length) {
    cleanupLegacyCache();
    return;
  }

  try {
    for (const key of LEGACY_CACHE_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = safeJsonParse(raw, {});
      if (!parsed || typeof parsed !== "object") continue;

      const migrated = {};

      Object.entries(parsed).forEach(([userId, bucket]) => {
        const cleanUserId = clean(userId);
        if (!cleanUserId) return;

        const list = dedupeAndSort(safeArray(bucket?.list));
        const full = dedupeAndSort(safeArray(bucket?.full));

        migrated[cleanUserId] = {
          list,
          full,
          categories: normalizeCategoriesFromItems(list, full),
          updated_at: {
            list: Number(bucket?.updated_at?.list || bucket?.list_updated_at || bucket?.updated_at || 0),
            full: Number(bucket?.updated_at?.full || bucket?.full_updated_at || bucket?.updated_at || 0)
          },
          last_refresh_at: Number(bucket?.last_refresh_at || bucket?.updated_at || 0)
        };
      });

      if (Object.keys(migrated).length) {
        writeCache(migrated);
        break;
      }
    }
  } catch (error) {
    console.warn("library-cache: migration skipped", error);
  }

  cleanupLegacyCache();
}

function normalizeBucket(bucket = {}) {
  const normalized = emptyBucket();

  normalized.list = dedupeAndSort(safeArray(bucket.list));
  normalized.full = dedupeAndSort(safeArray(bucket.full));
  normalized.updated_at = {
    list: Number(bucket?.updated_at?.list || 0),
    full: Number(bucket?.updated_at?.full || 0)
  };
  normalized.last_refresh_at = Number(bucket?.last_refresh_at || 0);

  normalized.categories = {};

  if (bucket.categories && typeof bucket.categories === "object") {
    Object.entries(bucket.categories).forEach(([category, value]) => {
      const cleanCategory = cleanLower(category);
      if (!cleanCategory) return;

      normalized.categories[cleanCategory] = {
        list: dedupeAndSort(safeArray(value?.list)),
        full: dedupeAndSort(safeArray(value?.full)),
        updated_at: {
          list: Number(value?.updated_at?.list || 0),
          full: Number(value?.updated_at?.full || 0)
        }
      };
    });
  }

  if (!Object.keys(normalized.categories).length && (normalized.list.length || normalized.full.length)) {
    normalized.categories = normalizeCategoriesFromItems(normalized.list, normalized.full);
  }

  return normalized;
}

function normalizeCategoriesFromItems(listItems = [], fullItems = []) {
  const categories = {};

  function pushItems(mode, items) {
    safeArray(items).forEach((item) => {
      const category = resolveItemCategory(item);
      if (!category) return;

      if (!categories[category]) {
        categories[category] = emptyCategoryBucket();
      }

      categories[category][mode].push(item);
    });
  }

  pushItems("list", listItems);
  pushItems("full", fullItems);

  Object.keys(categories).forEach((category) => {
    categories[category].list = dedupeAndSort(categories[category].list);
    categories[category].full = dedupeAndSort(categories[category].full);
  });

  return categories;
}

function getUserBucket(cache, userId) {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return null;

  cache[cleanUserId] = normalizeBucket(cache[cleanUserId] || {});
  return cache[cleanUserId];
}

function getCategoryBucket(bucket, category) {
  const cleanCategory = cleanLower(category);
  if (!cleanCategory) return null;

  if (!bucket.categories[cleanCategory]) {
    bucket.categories[cleanCategory] = emptyCategoryBucket();
  }

  bucket.categories[cleanCategory] = {
    ...emptyCategoryBucket(),
    ...bucket.categories[cleanCategory],
    list: dedupeAndSort(safeArray(bucket.categories[cleanCategory].list)),
    full: dedupeAndSort(safeArray(bucket.categories[cleanCategory].full)),
    updated_at: {
      list: Number(bucket.categories[cleanCategory]?.updated_at?.list || 0),
      full: Number(bucket.categories[cleanCategory]?.updated_at?.full || 0)
    }
  };

  return bucket.categories[cleanCategory];
}

function isExpired(updatedAt = 0) {
  return !updatedAt || now() - Number(updatedAt || 0) > CACHE_TTL_MS;
}

function isTooOld(updatedAt = 0) {
  return !updatedAt || now() - Number(updatedAt || 0) > STALE_CACHE_MAX_AGE_MS;
}

function resolveItemCategory(item = {}) {
  return cleanLower(item?.media_entities?.category || item?.category || "");
}

function itemDedupeKey(item = {}) {
  const userMediaId = Number(item?.id || 0);
  if (userMediaId) return `user_media:${userMediaId}`;

  const entityId = Number(item?.entity_id || item?.media_entities?.id || 0);
  if (entityId) return `entity:${entityId}`;

  const canonical = cleanLower(item?.media_entities?.canonical_key || "");
  if (canonical) return `canonical:${canonical}`;

  return "";
}

function mergeMediaEntities(previousEntity = {}, incomingEntity = {}) {
  const previous = isUsefulObject(previousEntity) ? previousEntity : {};
  const incoming = isUsefulObject(incomingEntity) ? incomingEntity : {};

  return {
    ...previous,
    ...incoming,

    id: incoming.id || previous.id || null,
    canonical_key: pickStableValue(previous.canonical_key, incoming.canonical_key),
    category: pickStableValue(previous.category, incoming.category),
    primary_source: pickStableValue(previous.primary_source, incoming.primary_source),

    title_primary: pickStableValue(previous.title_primary, incoming.title_primary),
    title_ru: pickStableValue(previous.title_ru, incoming.title_ru),
    title_en: pickStableValue(previous.title_en, incoming.title_en),
    original_title: pickStableValue(previous.original_title, incoming.original_title),

    year: pickStableNumber(previous.year, incoming.year),

    cover_url: pickStableValue(previous.cover_url, incoming.cover_url),
    description_ru: pickStableValue(previous.description_ru, incoming.description_ru),
    description_en: pickStableValue(previous.description_en, incoming.description_en),

    external_ids: pickStableJson(previous.external_ids, incoming.external_ids),
    meta: pickStableJson(previous.meta, incoming.meta),

    universe_key: pickStableValue(previous.universe_key, incoming.universe_key),
    relations_built_at: pickStableValue(previous.relations_built_at, incoming.relations_built_at),
    relations_status: pickStableValue(previous.relations_status, incoming.relations_status)
  };
}

function mergeLibraryItems(previous = {}, incoming = {}) {
  const previousItem = isUsefulObject(previous) ? previous : {};
  const incomingItem = isUsefulObject(incoming) ? incoming : {};

  return {
    ...previousItem,
    ...incomingItem,

    id: incomingItem.id || previousItem.id || null,
    user_id: pickStableValue(previousItem.user_id, incomingItem.user_id),
    entity_id: incomingItem.entity_id || previousItem.entity_id || incomingItem.media_entities?.id || previousItem.media_entities?.id || null,
    category: pickStableValue(previousItem.category, incomingItem.category),
    status: pickStableValue(previousItem.status, incomingItem.status),
    folder_name:
      incomingItem.folder_name === null
        ? null
        : pickStableValue(previousItem.folder_name, incomingItem.folder_name),
    created_at: pickStableValue(previousItem.created_at, incomingItem.created_at),
    updated_at: pickStableValue(previousItem.updated_at, incomingItem.updated_at),

    media_entities: mergeMediaEntities(
      previousItem.media_entities || {},
      incomingItem.media_entities || {}
    )
  };
}

function dedupeAndSort(items = []) {
  const map = new Map();

  safeArray(items).forEach((item) => {
    if (!item || typeof item !== "object") return;

    const key = itemDedupeKey(item);
    if (!key) return;

    if (!map.has(key)) {
      map.set(key, item);
      return;
    }

    map.set(key, mergeLibraryItems(map.get(key), item));
  });

  return Array.from(map.values()).sort((a, b) => {
    const aTime = new Date(a?.created_at || 0).getTime();
    const bTime = new Date(b?.created_at || 0).getTime();
    return bTime - aTime;
  });
}

function getMode(mode = "list") {
  return mode === "full" ? "full" : "list";
}

function getUpdatedAt(bucket, { mode = "list", category = "" } = {}) {
  const cleanMode = getMode(mode);
  const cleanCategory = cleanLower(category);

  if (!cleanCategory) {
    return Number(bucket?.updated_at?.[cleanMode] || 0);
  }

  const categoryBucket = getCategoryBucket(bucket, cleanCategory);
  return Number(categoryBucket?.updated_at?.[cleanMode] || 0);
}

function getItems(bucket, { mode = "list", category = "" } = {}) {
  const cleanMode = getMode(mode);
  const cleanCategory = cleanLower(category);

  if (!cleanCategory) {
    return safeArray(bucket?.[cleanMode]);
  }

  const categoryBucket = getCategoryBucket(bucket, cleanCategory);
  return safeArray(categoryBucket?.[cleanMode]);
}

function assignItems(bucket, items = [], { mode = "list", category = "" } = {}) {
  const cleanMode = getMode(mode);
  const cleanCategory = cleanLower(category);
  const normalized = dedupeAndSort(items);

  if (cleanCategory) {
    const categoryBucket = getCategoryBucket(bucket, cleanCategory);

    categoryBucket[cleanMode] = normalized;
    categoryBucket.updated_at[cleanMode] = now();

    const otherItems = safeArray(bucket[cleanMode]).filter(
      (item) => resolveItemCategory(item) !== cleanCategory
    );

    bucket[cleanMode] = dedupeAndSort([...normalized, ...otherItems]);
    bucket.updated_at[cleanMode] = now();
    bucket.last_refresh_at = now();

    return;
  }

  bucket[cleanMode] = normalized;
  bucket.updated_at[cleanMode] = now();
  bucket.last_refresh_at = now();

  bucket.categories = normalizeCategoriesFromItems(bucket.list, bucket.full);
}

function buildSelect(mode = "list") {
  const common = `
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

  return common;
}

async function fetchUserLibraryFromDb(userId, { mode = "list", category = "" } = {}) {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return [];

  const cleanMode = getMode(mode);
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

  return dedupeAndSort(data || []);
}

function makeKey(userId, { mode = "list", category = "", suffix = "" } = {}) {
  return [
    clean(userId),
    getMode(mode),
    cleanLower(category),
    clean(suffix)
  ].join("::");
}

function shouldRefresh(userId, { mode = "list", category = "" } = {}) {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return false;

  const cache = readCache();
  const bucket = getUserBucket(cache, cleanUserId);
  const updatedAt = getUpdatedAt(bucket, { mode, category });

  return isExpired(updatedAt);
}

migrateLegacyCache();

export function clearLibraryCache(userId = null) {
  if (!userId) {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (error) {
      console.warn("library-cache: clear skipped", error);
    }
    return;
  }

  const cache = readCache();
  delete cache[clean(userId)];
  writeCache(cache);
}

export function getCachedLibrary(
  userId,
  {
    mode = "list",
    category = "",
    allowExpired = false,
    allowVeryOld = false
  } = {}
) {
  const cleanUserId = clean(userId);
  if (!cleanUserId) return [];

  const cache = readCache();
  const bucket = getUserBucket(cache, cleanUserId);
  if (!bucket) return [];

  const updatedAt = getUpdatedAt(bucket, { mode, category });

  if (!allowVeryOld && isTooOld(updatedAt)) {
    return [];
  }

  if (!allowExpired && isExpired(updatedAt)) {
    return [];
  }

  return getItems(bucket, { mode, category });
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

  return getCachedLibrary(userId, {
    mode,
    category,
    allowExpired
  }).find((item) => cleanLower(item?.media_entities?.canonical_key) === key) || null;
}

export function updateCachedLibraryItem(userId, item, { category = "" } = {}) {
  const cleanUserId = clean(userId);
  if (!cleanUserId || !item) return;

  const cache = readCache();
  const bucket = getUserBucket(cache, cleanUserId);
  const itemCategory = cleanLower(category || resolveItemCategory(item));

  ["list", "full"].forEach((mode) => {
    const existing = getItems(bucket, { mode });
    bucket[mode] = dedupeAndSort([item, ...existing]);
    bucket.updated_at[mode] = now();

    if (itemCategory) {
      const categoryBucket = getCategoryBucket(bucket, itemCategory);
      categoryBucket[mode] = dedupeAndSort([item, ...categoryBucket[mode]]);
      categoryBucket.updated_at[mode] = now();
    }
  });

  bucket.last_refresh_at = now();
  cache[cleanUserId] = bucket;
  writeCache(cache);
}

export function replaceCachedLibraryItem(userId, item, { category = "" } = {}) {
  updateCachedLibraryItem(userId, item, { category });
}

export function removeCachedLibraryItem(userId, userMediaId, { category = "" } = {}) {
  const cleanUserId = clean(userId);
  const cleanId = Number(userMediaId || 0);

  if (!cleanUserId || !cleanId) return;

  const cache = readCache();
  const bucket = getUserBucket(cache, cleanUserId);

  ["list", "full"].forEach((mode) => {
    bucket[mode] = dedupeAndSort(
      safeArray(bucket[mode]).filter((item) => Number(item?.id || 0) !== cleanId)
    );
    bucket.updated_at[mode] = now();
  });

  const categories = category
    ? [cleanLower(category)]
    : Object.keys(bucket.categories || {});

  categories.forEach((categoryName) => {
    const categoryBucket = getCategoryBucket(bucket, categoryName);

    ["list", "full"].forEach((mode) => {
      categoryBucket[mode] = dedupeAndSort(
        safeArray(categoryBucket[mode]).filter((item) => Number(item?.id || 0) !== cleanId)
      );
      categoryBucket.updated_at[mode] = now();
    });
  });

  bucket.last_refresh_at = now();
  cache[cleanUserId] = bucket;
  writeCache(cache);
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

  const cleanMode = getMode(mode);
  const cleanCategory = cleanLower(category);
  const key = makeKey(cleanUserId, {
    mode: cleanMode,
    category: cleanCategory,
    suffix: "refresh"
  });

  if (!force && refreshPromises.has(key)) {
    return refreshPromises.get(key);
  }

  const promise = (async () => {
    const freshItems = await fetchUserLibraryFromDb(cleanUserId, {
      mode: cleanMode,
      category: cleanCategory
    });

    const cache = readCache();
    const bucket = getUserBucket(cache, cleanUserId);

    assignItems(bucket, freshItems, {
      mode: cleanMode,
      category: cleanCategory
    });

    cache[cleanUserId] = bucket;
    writeCache(cache);

    return getItems(bucket, {
      mode: cleanMode,
      category: cleanCategory
    });
  })().finally(() => {
    refreshPromises.delete(key);
  });

  refreshPromises.set(key, promise);
  return promise;
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

  const cleanMode = getMode(mode);
  const cleanCategory = cleanLower(category);

  if (!force && !shouldRefresh(cleanUserId, { mode: cleanMode, category: cleanCategory })) {
    return;
  }

  refreshUserLibrary(cleanUserId, {
    mode: cleanMode,
    category: cleanCategory,
    force
  }).catch((error) => {
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

  const cleanMode = getMode(mode);
  const cleanCategory = cleanLower(category);

  const key = makeKey(cleanUserId, {
    mode: cleanMode,
    category: cleanCategory,
    suffix: `${allowStale ? "stale" : "fresh"}:${forceRefresh ? "force" : "normal"}`
  });

  if (loadPromises.has(key)) {
    return loadPromises.get(key);
  }

  const freshCache = getCachedLibrary(cleanUserId, {
    mode: cleanMode,
    category: cleanCategory,
    allowExpired: false,
    allowVeryOld: false
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

  const staleCache = getCachedLibrary(cleanUserId, {
    mode: cleanMode,
    category: cleanCategory,
    allowExpired: true,
    allowVeryOld: false
  });

  if (allowStale && staleCache.length && !forceRefresh) {
    if (backgroundRefresh) {
      refreshUserLibraryInBackground(cleanUserId, {
        mode: cleanMode,
        category: cleanCategory
      });
    }

    return staleCache;
  }

  const promise = refreshUserLibrary(cleanUserId, {
    mode: cleanMode,
    category: cleanCategory,
    force: forceRefresh
  })
    .catch((error) => {
      console.warn("library-cache: DB load failed, using cache fallback", error);
      return staleCache;
    })
    .finally(() => {
      loadPromises.delete(key);
    });

  loadPromises.set(key, promise);
  return promise;
}
