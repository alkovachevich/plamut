import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";

const JOBS_TABLE = "universe_build_jobs";
const DEFAULT_TIMEOUT_MS = 12000;

export const UNIVERSE_JOB_STATUS = {
  QUEUED: "queued",
  BUILDING: "building",
  READY: "ready",
  FAILED: "failed"
};

function cleanText(value = "") {
  return String(value || "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeStatus(status = "") {
  const clean = cleanText(status).toLowerCase();

  if (Object.values(UNIVERSE_JOB_STATUS).includes(clean)) {
    return clean;
  }

  return UNIVERSE_JOB_STATUS.QUEUED;
}

function normalizeJob(row = {}) {
  if (!row) return null;

  const current = normalizeNumber(row.progress_current, 0);
  const total = normalizeNumber(row.progress_total, 0);
  const percent = total > 0
    ? Math.max(0, Math.min(100, Math.round((current / total) * 100)))
    : 0;

  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    seed_entity_id: row.seed_entity_id,
    seed_canonical_key: row.seed_canonical_key || "",
    universe_key: row.universe_key || "",
    status: normalizeStatus(row.status),
    progress_current: current,
    progress_total: total,
    progress_percent: percent,
    progress_label: row.progress_label || "",
    error_message: row.error_message || "",
    result_payload: normalizePayload(row.result_payload),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    started_at: row.started_at || null,
    finished_at: row.finished_at || null
  };
}

export function getUniverseJobPercent(job = {}) {
  if (!job) return 0;

  const current = normalizeNumber(job.progress_current, 0);
  const total = normalizeNumber(job.progress_total, 0);

  if (!total) return 0;

  return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}

export function isUniverseJobActive(job = {}) {
  return [
    UNIVERSE_JOB_STATUS.QUEUED,
    UNIVERSE_JOB_STATUS.BUILDING
  ].includes(job?.status);
}

export function isUniverseJobFinished(job = {}) {
  return [
    UNIVERSE_JOB_STATUS.READY,
    UNIVERSE_JOB_STATUS.FAILED
  ].includes(job?.status);
}

export async function getLatestUniverseBuildJob({
  userId,
  entityId,
  canonicalKey = ""
}) {
  const cleanUserId = cleanText(userId);
  const cleanCanonicalKey = cleanText(canonicalKey);

  if (!cleanUserId && !entityId && !cleanCanonicalKey) return null;

  const supabase = getSupabaseClient();

  let query = supabase
    .from(JOBS_TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (cleanUserId) {
    query = query.eq("owner_user_id", cleanUserId);
  }

  if (entityId) {
    query = query.eq("seed_entity_id", entityId);
  } else if (cleanCanonicalKey) {
    query = query.eq("seed_canonical_key", cleanCanonicalKey);
  }

  const { data, error } = await withTimeout(
    query,
    "Загрузка задачи построения",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ data: [], error }));

  if (error) {
    console.warn("getLatestUniverseBuildJob skipped:", error);
    return null;
  }

  return normalizeJob(Array.isArray(data) ? data[0] : null);
}

export async function createUniverseBuildJob({
  userId,
  entityId,
  canonicalKey = "",
  universeKey = ""
}) {
  const cleanUserId = cleanText(userId);
  const cleanCanonicalKey = cleanText(canonicalKey);
  const cleanUniverseKey = cleanText(universeKey);

  if (!cleanUserId) {
    throw new Error("Не найден пользователь");
  }

  if (!entityId && !cleanCanonicalKey) {
    throw new Error("Не найдена карточка для построения");
  }

  const existing = await getLatestUniverseBuildJob({
    userId: cleanUserId,
    entityId,
    canonicalKey: cleanCanonicalKey
  });

  if (existing && isUniverseJobActive(existing)) {
    return existing;
  }

  if (existing?.status === UNIVERSE_JOB_STATUS.READY && existing.universe_key) {
    return existing;
  }

  const supabase = getSupabaseClient();

  const payload = {
    owner_user_id: cleanUserId,
    seed_entity_id: entityId || null,
    seed_canonical_key: cleanCanonicalKey || null,
    universe_key: cleanUniverseKey || null,
    status: UNIVERSE_JOB_STATUS.QUEUED,
    progress_current: 0,
    progress_total: 9,
    progress_label: "Задача поставлена в очередь",
    error_message: null,
    result_payload: {}
  };

  const { data, error } = await withTimeout(
    supabase
      .from(JOBS_TABLE)
      .insert(payload)
      .select("*")
      .single(),
    "Создание задачи построения",
    DEFAULT_TIMEOUT_MS
  );

  if (error) throw error;

  return normalizeJob(data);
}

export async function updateUniverseBuildJob(jobId, patch = {}) {
  if (!jobId) return null;

  const supabase = getSupabaseClient();

  const cleanPatch = {
    updated_at: nowIso()
  };

  if (patch.status !== undefined) {
    cleanPatch.status = normalizeStatus(patch.status);
  }

  if (patch.progress_current !== undefined) {
    cleanPatch.progress_current = normalizeNumber(patch.progress_current, 0);
  }

  if (patch.progress_total !== undefined) {
    cleanPatch.progress_total = normalizeNumber(patch.progress_total, 9);
  }

  if (patch.progress_label !== undefined) {
    cleanPatch.progress_label = cleanText(patch.progress_label);
  }

  if (patch.universe_key !== undefined) {
    cleanPatch.universe_key = cleanText(patch.universe_key) || null;
  }

  if (patch.result_payload !== undefined) {
    cleanPatch.result_payload = normalizePayload(patch.result_payload);
  }

  if (patch.error_message !== undefined) {
    cleanPatch.error_message = cleanText(patch.error_message) || null;
  }

  if (
    patch.status === UNIVERSE_JOB_STATUS.BUILDING &&
    patch.started_at === undefined
  ) {
    cleanPatch.started_at = nowIso();
  }

  if (
    [UNIVERSE_JOB_STATUS.READY, UNIVERSE_JOB_STATUS.FAILED].includes(patch.status) &&
    patch.finished_at === undefined
  ) {
    cleanPatch.finished_at = nowIso();
  }

  if (patch.started_at !== undefined) {
    cleanPatch.started_at = patch.started_at;
  }

  if (patch.finished_at !== undefined) {
    cleanPatch.finished_at = patch.finished_at;
  }

  const { data, error } = await withTimeout(
    supabase
      .from(JOBS_TABLE)
      .update(cleanPatch)
      .eq("id", jobId)
      .select("*")
      .single(),
    "Обновление задачи построения",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ data: null, error }));

  if (error) {
    console.warn("updateUniverseBuildJob skipped:", error);
    return null;
  }

  return normalizeJob(data);
}

export async function getUniverseBuildJob(jobId) {
  if (!jobId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(JOBS_TABLE)
      .select("*")
      .eq("id", jobId)
      .maybeSingle(),
    "Загрузка задачи построения",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ data: null, error }));

  if (error) {
    console.warn("getUniverseBuildJob skipped:", error);
    return null;
  }

  return normalizeJob(data);
}

export async function pollUniverseBuildJob(jobId) {
  return getUniverseBuildJob(jobId);
}

export async function getActiveUniverseBuildJobs(userId) {
  const cleanUserId = cleanText(userId);
  if (!cleanUserId) return [];

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(JOBS_TABLE)
      .select("*")
      .eq("owner_user_id", cleanUserId)
      .in("status", [
        UNIVERSE_JOB_STATUS.QUEUED,
        UNIVERSE_JOB_STATUS.BUILDING
      ])
      .order("created_at", { ascending: false }),
    "Активные задачи построения",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ data: [], error }));

  if (error) {
    console.warn("getActiveUniverseBuildJobs skipped:", error);
    return [];
  }

  return Array.isArray(data) ? data.map(normalizeJob).filter(Boolean) : [];
}

export async function getRecentUniverseBuildJobs(userId, limit = 10) {
  const cleanUserId = cleanText(userId);
  if (!cleanUserId) return [];

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(JOBS_TABLE)
      .select("*")
      .eq("owner_user_id", cleanUserId)
      .in("status", [
        UNIVERSE_JOB_STATUS.READY,
        UNIVERSE_JOB_STATUS.FAILED
      ])
      .order("updated_at", { ascending: false })
      .limit(limit),
    "История задач построения",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ data: [], error }));

  if (error) {
    console.warn("getRecentUniverseBuildJobs skipped:", error);
    return [];
  }

  return Array.isArray(data) ? data.map(normalizeJob).filter(Boolean) : [];
}

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
        table: JOBS_TABLE,
        filter: `id=eq.${jobId}`
      },
      (payload) => {
        callback(normalizeJob(payload.new));
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToUserUniverseJobs(userId, callback) {
  const cleanUserId = cleanText(userId);

  if (!cleanUserId || typeof callback !== "function") {
    return () => {};
  }

  const supabase = getSupabaseClient();

  const channel = supabase
    .channel(`universe-jobs-${cleanUserId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: JOBS_TABLE,
        filter: `owner_user_id=eq.${cleanUserId}`
      },
      (payload) => {
        callback(normalizeJob(payload.new));
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function renderUniverseJobProgress(job = {}) {
  if (!job) return "";

  const percent = getUniverseJobPercent(job);
  const current = normalizeNumber(job.progress_current, 0);
  const total = normalizeNumber(job.progress_total, 0);
  const label = job.progress_label || "Построение вселенной";

  if (job.status === UNIVERSE_JOB_STATUS.READY) {
    return "Вселенная готова";
  }

  if (job.status === UNIVERSE_JOB_STATUS.FAILED) {
    return job.error_message || "Ошибка построения";
  }

  if (total > 0) {
    return `${label} · ${current} из ${total} · ${percent}%`;
  }

  return label;
}
