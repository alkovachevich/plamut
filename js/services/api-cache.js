import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";

const API_CACHE_TABLE = "api_cache";
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const MEMORY_CACHE_TTL_MS = 1000 * 60 * 10;
const API_CACHE_DISABLED_KEY = "plamut-api-cache-disabled";

const memoryCache = new Map();
const pendingReads = new Map();
const pendingWrites = new Map();

let apiCacheDisabledForSession =
  typeof window !== "undefined" &&
  window.sessionStorage?.getItem(API_CACHE_DISABLED_KEY) === "1";

function now() {
  return Date.now();
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function disableApiCacheForSession(reason = "") {
  apiCacheDisabledForSession = true;

  if (typeof window !== "undefined") {
    try {
      window.sessionStorage?.setItem(API_CACHE_DISABLED_KEY, "1");
    } catch {
      // ignore sessionStorage failures
    }
  }

  if (reason) {
    console.warn(reason);
  }
}

function isPermissionError(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();

  if (status === 401 || status === 403) return true;
  if (code === "42501") return true;
  if (message.includes("permission denied")) return true;
  if (message.includes("42501")) return true;
  if (message.includes("row-level security")) return true;

  return false;
}

function stableStringify(value) {
  if (value === null || value === undefined) return "";

  if (typeof value !== "object") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${key}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function hashString(value = "") {
  let hash = 0;
  const str = String(value || "");

  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function clonePayload(payload) {
  if (payload === null || payload === undefined) return payload;

  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return payload;
  }
}

function getMemoryCache(cacheKey = "") {
  const key = cleanText(cacheKey);
  if (!key) return null;

  const row = memoryCache.get(key);
  if (!row) return null;

  if (now() - Number(row.ts || 0) > MEMORY_CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }

  return clonePayload(row.payload);
}

function setMemoryCache(cacheKey = "", payload = null) {
  const key = cleanText(cacheKey);
  if (!key) return;

  memoryCache.set(key, {
    payload: clonePayload(payload),
    ts: now()
  });
}

function normalizeFallback(fallback) {
  return Array.isArray(fallback) ? [...fallback] : fallback;
}

export function buildApiCacheKey(source, query) {
  const cleanSource = cleanText(source).toLowerCase() || "unknown";
  const normalizedQuery = stableStringify(query);
  const queryHash = hashString(normalizedQuery);

  return {
    cache_key: `${cleanSource}:${queryHash}`,
    source: cleanSource,
    query_hash: queryHash
  };
}

export function buildExpiresAt(ttlMs = DEFAULT_TTL_MS) {
  return new Date(Date.now() + ttlMs).toISOString();
}

export async function getApiCache(source, query) {
  const { cache_key } = buildApiCacheKey(source, query);

  const memoryPayload = getMemoryCache(cache_key);
  if (memoryPayload !== null && memoryPayload !== undefined) {
    return memoryPayload;
  }

  if (apiCacheDisabledForSession) {
    return null;
  }

  if (pendingReads.has(cache_key)) {
    return pendingReads.get(cache_key);
  }

  const readPromise = (async () => {
    const supabase = getSupabaseClient();

    const { data, error } = await withTimeout(
      supabase
        .from(API_CACHE_TABLE)
        .select("payload")
        .eq("cache_key", cache_key)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle(),
      "Чтение api cache",
      DEFAULT_TIMEOUT_MS
    ).catch((error) => ({ data: null, error }));

    if (error) {
      if (isPermissionError(error)) {
        disableApiCacheForSession("getApiCache permission denied, disable api_cache for session");
        return null;
      }

      console.warn("getApiCache skipped:", error);
      return null;
    }

    const payload = data?.payload ?? null;

    if (payload !== null && payload !== undefined) {
      setMemoryCache(cache_key, payload);
    }

    return clonePayload(payload);
  })().finally(() => {
    pendingReads.delete(cache_key);
  });

  pendingReads.set(cache_key, readPromise);
  return readPromise;
}

export async function setApiCache(source, query, payload, options = {}) {
  const { ttlMs = DEFAULT_TTL_MS } = options;
  const key = buildApiCacheKey(source, query);

  setMemoryCache(key.cache_key, payload);

  if (apiCacheDisabledForSession) {
    return null;
  }

  if (pendingWrites.has(key.cache_key)) {
    return pendingWrites.get(key.cache_key);
  }

  const writePromise = (async () => {
    const supabase = getSupabaseClient();

    const row = {
      ...key,
      payload: payload ?? {},
      expires_at: buildExpiresAt(ttlMs)
    };

    const { data, error } = await withTimeout(
      supabase
        .from(API_CACHE_TABLE)
        .upsert(row, { onConflict: "cache_key" })
        .select("cache_key")
        .maybeSingle(),
      "Запись api cache",
      DEFAULT_TIMEOUT_MS
    ).catch((error) => ({ data: null, error }));

    if (error) {
      if (isPermissionError(error)) {
        disableApiCacheForSession("setApiCache permission denied, disable api_cache for session");
        return null;
      }

      console.warn("setApiCache skipped:", error);
      return null;
    }

    return data || null;
  })().finally(() => {
    pendingWrites.delete(key.cache_key);
  });

  pendingWrites.set(key.cache_key, writePromise);
  return writePromise;
}

export async function fetchJsonCached(source, query, fetcher, options = {}) {
  const {
    ttlMs = DEFAULT_TTL_MS,
    force = false,
    fallback = []
  } = options;

  const { cache_key } = buildApiCacheKey(source, query);

  if (!force) {
    const memoryPayload = getMemoryCache(cache_key);

    if (memoryPayload !== null && memoryPayload !== undefined) {
      return memoryPayload;
    }
  }

  if (!force && !apiCacheDisabledForSession) {
    try {
      const cached = await getApiCache(source, query);
      if (cached !== null && cached !== undefined) return cached;
    } catch (error) {
      console.warn("fetchJsonCached read-through skipped:", error);
    }
  }

  let payload;

  try {
    payload = await fetcher();
  } catch (error) {
    console.warn("fetchJsonCached fetch failed, using fallback:", error);
    payload = normalizeFallback(fallback);
  }

  if (payload === null || payload === undefined) {
    payload = normalizeFallback(fallback);
  }

  setMemoryCache(cache_key, payload);

  if (!apiCacheDisabledForSession) {
    setApiCache(source, query, payload, { ttlMs }).catch((error) => {
      console.warn("fetchJsonCached write-through skipped:", error);
    });
  }

  return clonePayload(payload);
}

export function isApiCacheDisabledForSession() {
  return apiCacheDisabledForSession;
}

export async function clearExpiredApiCache() {
  if (apiCacheDisabledForSession) {
    return false;
  }

  const supabase = getSupabaseClient();

  const { error } = await withTimeout(
    supabase
      .from(API_CACHE_TABLE)
      .delete()
      .lt("expires_at", new Date().toISOString()),
    "Очистка api cache",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ error }));

  if (error) {
    if (isPermissionError(error)) {
      disableApiCacheForSession("clearExpiredApiCache permission denied, disable api_cache for session");
      return false;
    }

    console.warn("clearExpiredApiCache skipped:", error);
    return false;
  }

  memoryCache.clear();
  return true;
}
