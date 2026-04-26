import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";

const CACHE_KEY = "plamut_library_cache_v2";
const CACHE_TTL = 1000 * 60 * 10; // 10 минут

function now() {
  return Date.now();
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn("library-cache: write skipped", error);
  }
}

function getUserBucket(cache, userId) {
  if (!userId) return null;

  if (!cache[userId]) {
    cache[userId] = {
      updated_at: 0,
      full: [],
      list: []
    };
  }

  return cache[userId];
}

export function clearLibraryCache(userId = null) {
  if (!userId) {
    localStorage.removeItem(CACHE_KEY);
    return;
  }

  const cache = readCache();
  delete cache[userId];
  writeCache(cache);
}

export function getCachedLibrary(userId, { mode = "list" } = {}) {
  if (!userId) return [];

  const cache = readCache();
  const bucket = cache[userId];

  if (!bucket) return [];

  const isExpired = now() - Number(bucket.updated_at || 0) > CACHE_TTL;
  if (isExpired) return [];

  return Array.isArray(bucket[mode]) ? bucket[mode] : [];
}

export function getCachedLibraryItem(userId, canonicalKey, { mode = "list" } = {}) {
  if (!userId || !canonicalKey) return null;

  const list = getCachedLibrary(userId, { mode });
  return list.find(
    (item) =>
      item?.media_entities?.canonical_key === canonicalKey
  ) || null;
}

export function updateCachedLibraryItem(userId, item) {
  if (!userId || !item?.media_entities?.canonical_key) return;

  const cache = readCache();
  const bucket = getUserBucket(cache, userId);

  ["list", "full"].forEach((mode) => {
    const arr = Array.isArray(bucket[mode]) ? bucket[mode] : [];

    const index = arr.findIndex(
      (i) =>
        i?.media_entities?.canonical_key === item.media_entities.canonical_key
    );

    if (index >= 0) {
      arr[index] = {
        ...arr[index],
        ...item,
        media_entities: {
          ...(arr[index].media_entities || {}),
          ...(item.media_entities || {})
        }
      };
    } else {
      arr.unshift(item);
    }

    bucket[mode] = arr;
  });

  bucket.updated_at = now();
  writeCache(cache);
}

export function removeCachedLibraryItem(userId, userMediaId) {
  if (!userId || !userMediaId) return;

  const cache = readCache();
  const bucket = cache[userId];

  if (!bucket) return;

  ["list", "full"].forEach((mode) => {
    const arr = Array.isArray(bucket[mode]) ? bucket[mode] : [];

    bucket[mode] = arr.filter(
      (item) => Number(item.id) !== Number(userMediaId)
    );
  });

  bucket.updated_at = now();
  writeCache(cache);
}

async function fetchUserLibraryFromDb(userId, { mode = "list" } = {}) {
  if (!userId) return [];

  const supabase = getSupabaseClient();

  const select =
    mode === "full"
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

  const { data, error } = await withTimeout(
    supabase
      .from("user_media")
      .select(select)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    "Загрузка библиотеки",
    15000
  );

  if (error) {
    console.warn("library-cache: DB load failed", error);
    return [];
  }

  return Array.isArray(data) ? data : [];
}

export async function loadUserLibrary(
  userId,
  {
    mode = "list",
    allowStale = true,
    backgroundRefresh = true
  } = {}
) {
  if (!userId) return [];

  const cache = readCache();
  const bucket = getUserBucket(cache, userId);

  const cached = getCachedLibrary(userId, { mode });

  if (cached.length && allowStale) {
    if (backgroundRefresh) {
      fetchUserLibraryFromDb(userId, { mode: "full" })
        .then((fresh) => {
          if (!fresh.length) return;

          const nextCache = readCache();
          const nextBucket = getUserBucket(nextCache, userId);

          nextBucket.full = fresh;
          nextBucket.list = fresh;
          nextBucket.updated_at = now();

          writeCache(nextCache);
        })
        .catch(() => {});
    }

    return cached;
  }

  const fresh = await fetchUserLibraryFromDb(userId, { mode: "full" });

  if (!fresh.length) return cached;

  bucket.full = fresh;
  bucket.list = fresh;
  bucket.updated_at = now();

  writeCache(cache);

  return mode === "full" ? fresh : fresh;
}
