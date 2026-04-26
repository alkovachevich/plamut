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

function normalizeJob(row = {}) {
  if (!row) return null;

  const current = Number(row.progress_current || 0);
  const total = Number(row.progress_total || 0);
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 0;

  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    seed_entity_id: row.seed_entity_id,
    seed_canonical_key: row.seed_canonical_key || "",
    universe_key: row.universe_key || "",
    status: row.status || UNIVERSE_JOB_STATUS.QUEUED,
    progress_current: current,
    progress_total: total,
    progress_percent: percent,
    progress_label: row.progress_label || "",
    error_message: row.error_message || "",
    result_payload: row.result_payload || {},
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    started_at: row.started_at || null,
    finished_at: row.finished_at || null
  };
}

export function getUniverseJobPercent(job = {}) {
  if (!job) return 0;

  const current = Number(job.progress_current || 0);
  const total = Number(job.progress_total || 0);

  if (!total) return 0;

  return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}

export function isUniverseJobActive(job = {}) {
  return [UNIVERSE_JOB_STATUS.QUEUED, UNIVERSE_JOB_STATUS.BUILDING].includes(job?.status);
}

export function isUniverseJobFinished(job = {}) {
  return [UNIVERSE_JOB_STATUS.READY, UNIVERSE_JOB_STATUS.FAILED].includes(job?.status);
}

export async function getLatestUniverseBuildJob({ userId, entityId, canonicalKey = "" }) {
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
    return {
      created: false,
      job: existing
    };
  }

  if (existing?.status === UNIVERSE_JOB_STATUS.READY && existing.universe_key) {
    return {
      created: false,
      job: existing
    };
  }

  const supabase = getSupabaseClient();

  const payload = {
    owner_user_id: cleanUserId,
    seed_entity_id: entityId || null,
    seed_canonical_key: cleanCanonicalKey || null,
    universe_key: cleanUniverseKey || null,
    status: UNIVERSE_JOB_STATUS.QUEUED,
    progress_current: 0,
    progress_total: 8,
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

  return {
    created: true,
    job: normalizeJob(data)
  };
}

export async function updateUniverseBuildJob(jobId, patch = {}) {
  if (!jobId) return null;

  const supabase = getSupabaseClient();

  const cleanPatch = {
    ...patch,
    updated_at: new Date().toISOString()
  };

  if (patch.status === UNIVERSE_JOB_STATUS.BUILDING && !patch.started_at) {
    cleanPatch.started_at = new Date().toISOString();
  }

  if (
    [UNIVERSE_JOB_STATUS.READY, UNIVERSE_JOB_STATUS.FAILED].includes(patch.status) &&
    !patch.finished_at
  ) {
    cleanPatch.finished_at = new Date().toISOString();
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

export async function pollUniverseBuildJob(jobId) {
  if (!jobId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from(JOBS_TABLE)
      .select("*")
      .eq("id", jobId)
      .maybeSingle(),
    "Проверка задачи построения",
    DEFAULT_TIMEOUT_MS
  ).catch((error) => ({ data: null, error }));

  if (error) {
    console.warn("pollUniverseBuildJob skipped:", error);
    return null;
  }

  return normalizeJob(data);
}

export function renderUniverseJobProgress(job = {}) {
  if (!job) return "";

  const percent = getUniverseJobPercent(job);
  const current = Number(job.progress_current || 0);
  const total = Number(job.progress_total || 0);
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
