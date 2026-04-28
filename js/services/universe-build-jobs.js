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

function unwrapRow(value) {
  if (!value) return null;

  if (value.job) return unwrapRow(value.job);
  if (value.data) return unwrapRow(value.data);
  if (Array.isArray(value)) return value[0] || null;

  return value;
}

function normalizeJob(value = {}) {
  const row = unwrapRow(value);
  if (!row) return null;

  const current = normalizeNumber(row.progress_current, 0);
  const total = normalizeNumber(row.progress_total, 9);
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
  return normalizeJob(job)?.progress_percent || 0;
}

export function isUniverseJobActive(job = {}) {
  const normalized = normalizeJob(job);

  return [
    UNIVERSE_JOB_STATUS.QUEUED,
    UNIVERSE_JOB_STATUS.BUILDING
  ].includes(normalized?.status);
}

export function isUniverseJobFinished(job = {}) {
  const normalized = normalizeJob(job);

  return [
    UNIVERSE_JOB_STATUS.READY,
    UNIVERSE_JOB_STATUS.FAILED
  ].includes(normalized?.status);
}

function isLikelyStuckJob(job = {}, maxAgeMs = 90 * 1000) {
  const normalized = normalizeJob(job);
  if (!normalized) return false;
  if (!isUniverseJobActive(normalized)) return false;

  const ts = new Date(normalized.updated_at || normalized.created_at || "").getTime();
  if (!Number.isFinite(ts) || ts <= 0) return false;

  return Date.now() - ts > maxAgeMs;
}

export async function getLatestUniverseBuildJob({
  userId,
  entityId,
  canonicalKey = ""
}) {
  const cleanUserId = cleanText(userId);
  const cleanCanonicalKey = cleanText(canonicalKey);

  if (!cleanUserId || (!entityId && !cleanCanonicalKey)) return null;

  const supabase = getSupabaseClient();

  let query = supabase
    .from(JOBS_TABLE)
    .select("*")
    .eq("owner_user_id", cleanUserId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (entityId) {
    query = query.eq("seed_entity_id", entityId);
  } else {
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

  return normalizeJob(data);
}

export async function createUniverseBuildJob({
  userId,
  entityId,
  canonicalKey = "",
  universeKey = "",
  force = false
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
    if (!force || !isLikelyStuckJob(existing)) {
      return existing;
    }
  }

  if (!force && existing?.status === UNIVERSE_JOB_STATUS.READY && existing.universe_key) {
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

  const job = normalizeJob(data);

  if (!job?.id) {
    console.warn("createUniverseBuildJob invalid response:", data);
    throw new Error("Задача построения не была создана");
  }

  return job;
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

export function renderUniverseJobProgress(job = {}) {
  const normalized = normalizeJob(job);
  if (!normalized) return "";

  if (normalized.status === UNIVERSE_JOB_STATUS.READY) {
    return "Вселенная готова";
  }

  if (normalized.status === UNIVERSE_JOB_STATUS.FAILED) {
    return normalized.error_message || "Ошибка построения";
  }

  if (normalized.progress_total > 0) {
    return `${normalized.progress_label || "Построение вселенной"} · ${normalized.progress_current} из ${normalized.progress_total} · ${normalized.progress_percent}%`;
  }

  return normalized.progress_label || "Построение вселенной";
}
