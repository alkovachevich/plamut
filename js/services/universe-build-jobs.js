import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";

const TABLE = "universe_build_jobs";
const DEFAULT_TIMEOUT_MS = 10000;

export const UNIVERSE_JOB_STATUS = {
  PENDING: "pending",
  BUILDING: "building",
  READY: "ready",
  FAILED: "failed"
};

function clean(value = "") {
  return String(value || "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeStatus(status) {
  const s = clean(status).toLowerCase();
  if (Object.values(UNIVERSE_JOB_STATUS).includes(s)) return s;
  return UNIVERSE_JOB_STATUS.PENDING;
}

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  return payload;
}

/**
 * Создание или получение уже существующей задачи
 */
export async function createUniverseBuildJob({
  userId,
  entityId,
  universeKey = null
}) {
  if (!userId || !entityId) {
    throw new Error("createUniverseBuildJob: missing params");
  }

  const supabase = getSupabaseClient();

  // проверяем есть ли уже активная задача
  const { data: existing } = await withTimeout(
    supabase
      .from(TABLE)
      .select("*")
      .eq("owner_user_id", userId)
      .eq("entity_id", entityId)
      .in("status", [UNIVERSE_JOB_STATUS.PENDING, UNIVERSE_JOB_STATUS.BUILDING])
      .limit(1),
    "Проверка существующей задачи",
    DEFAULT_TIMEOUT_MS
  ).catch(() => ({ data: null }));

  if (existing && existing.length) {
    return existing[0];
  }

  const payload = {
    owner_user_id: userId,
    entity_id: entityId,
    universe_key: universeKey,
    status: UNIVERSE_JOB_STATUS.PENDING,
    progress_current: 0,
    progress_total: 9,
    progress_label: "Ожидание",
    created_at: nowIso(),
    updated_at: nowIso()
  };

  const { data, error } = await withTimeout(
    supabase
      .from(TABLE)
      .insert(payload)
      .select("*")
      .single(),
    "Создание задачи",
    DEFAULT_TIMEOUT_MS
  );

  if (error) throw error;

  return data;
}

/**
 * Обновление задачи
 */
export async function updateUniverseBuildJob(jobId, patch = {}) {
  if (!jobId) return null;

  const supabase = getSupabaseClient();

  const payload = {
    ...patch,
    status: normalizeStatus(patch.status),
    progress_current: normalizeNumber(patch.progress_current),
    progress_total: normalizeNumber(patch.progress_total || 9),
    progress_label: clean(patch.progress_label),
    universe_key: patch.universe_key || null,
    result_payload: normalizePayload(patch.result_payload),
    error_message: clean(patch.error_message),
    updated_at: nowIso()
  };

  const { data, error } = await withTimeout(
    supabase
      .from(TABLE)
      .update(payload)
      .eq("id", jobId)
      .select("*")
      .single(),
    "Обновление задачи",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ data: null, error }));

  if (error) {
    console.warn("updateUniverseBuildJob skipped:", error);
    return null;
  }

  return data;
}

/**
 * Получение одной задачи
 */
export async function getUniverseBuildJob(jobId) {
  if (!jobId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(TABLE)
      .select("*")
      .eq("id", jobId)
      .maybeSingle(),
    "Загрузка задачи",
    DEFAULT_TIMEOUT_MS
  );

  if (error) throw error;

  return data || null;
}

/**
 * Получение всех активных задач пользователя
 */
export async function getActiveUniverseBuildJobs(userId) {
  if (!userId) return [];

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(TABLE)
      .select("*")
      .eq("owner_user_id", userId)
      .in("status", [UNIVERSE_JOB_STATUS.PENDING, UNIVERSE_JOB_STATUS.BUILDING])
      .order("created_at", { ascending: false }),
    "Активные задачи",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ data: [], error }));

  if (error) {
    console.warn("getActiveUniverseBuildJobs skipped:", error);
    return [];
  }

  return data || [];
}

/**
 * Получение последних завершённых задач
 */
export async function getRecentUniverseBuildJobs(userId, limit = 10) {
  if (!userId) return [];

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(TABLE)
      .select("*")
      .eq("owner_user_id", userId)
      .in("status", [UNIVERSE_JOB_STATUS.READY, UNIVERSE_JOB_STATUS.FAILED])
      .order("updated_at", { ascending: false })
      .limit(limit),
    "История задач",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ data: [], error }));

  if (error) {
    console.warn("getRecentUniverseBuildJobs skipped:", error);
    return [];
  }

  return data || [];
}

/**
 * Подписка на обновление задачи (realtime)
 */
export function subscribeToUniverseJob(jobId, callback) {
  if (!jobId || typeof callback !== "function") {
    return () => {};
  }

  const supabase = getSupabaseClient();

  const channel = supabase
    .channel(`universe-job-${jobId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: TABLE,
        filter: `id=eq.${jobId}`
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Подписка на все задачи пользователя
 */
export function subscribeToUserUniverseJobs(userId, callback) {
  if (!userId || typeof callback !== "function") {
    return () => {};
  }

  const supabase = getSupabaseClient();

  const channel = supabase
    .channel(`universe-jobs-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: TABLE,
        filter: `owner_user_id=eq.${userId}`
      },
      (payload) => {
        callback(payload.new);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
