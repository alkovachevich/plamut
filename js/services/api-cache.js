import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";

const API_CACHE_TABLE = "api_cache";
const DEFAULT_TIMEOUT_MS = 12000;

function isPermissionError(error) {
  const status = Number(error?.status || error?.code || 0);
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();

  if (status === 403) return true;
  if (code === "42501") return true;
  if (message.includes("permission denied")) return true;
  if (message.includes("42501")) return true;

  return false;
}


function cleanText(value = "") {
  return String(value || "").trim();
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

export function buildExpiresAt(ttlMs = 1000 * 60 * 60 * 24 * 7) {
  return new Date(Date.now() + ttlMs).toISOString();
}

export async function getApiCache(source, query) {
  const { cache_key } = buildApiCacheKey(source, query);
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
      console.warn("getApiCache permission denied, fallback to direct fetch");
      return null;
    }

    console.warn("getApiCache skipped:", error);
    return null;
  }

  return data?.payload || null;
}

export async function setApiCache(source, query, payload, options = {}) {
  const { ttlMs = 1000 * 60 * 60 * 24 * 7 } = options;
  const key = buildApiCacheKey(source, query);
  const supabase = getSupabaseClient();

  const row = {
    ...key,
    payload: payload || {},
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
      console.warn("setApiCache permission denied, skip cache write");
      return null;
    }

    console.warn("setApiCache skipped:", error);
    return null;
  }

  return data;
}

export async function fetchJsonCached(source, query, fetcher, options = {}) {
  const {
    ttlMs = 1000 * 60 * 60 * 24 * 7,
    force = false,
    fallback = []
  } = options;

  if (!force) {
    try {
      const cached = await getApiCache(source, query);
      if (cached !== null && cached !== undefined) return cached;
    } catch (error) {
      console.warn("fetchJsonCached read-through disabled:", error);
    }
  }

  let payload = null;

  try {
    payload = await fetcher();
  } catch (error) {
    console.warn("fetchJsonCached fetch failed, using fallback:", error);
    payload = Array.isArray(fallback) ? [...fallback] : fallback;
  }

  if (payload === null || payload === undefined) {
    payload = Array.isArray(fallback) ? [...fallback] : fallback;
  }

  try {
    await setApiCache(source, query, payload, { ttlMs });
  } catch (error) {
    console.warn("fetchJsonCached write-through disabled:", error);
  }

  return payload;
}

export async function clearExpiredApiCache() {
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
    console.warn("clearExpiredApiCache skipped:", error);
    return false;
  }

  return true;
}
