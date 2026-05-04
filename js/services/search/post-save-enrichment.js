import { enrichMediaEntityManually, shouldEnrichEntity } from "../metadata-enrichment.js";

const pendingEntityIds = new Set();
const RECENTLY_SCHEDULED_TTL_MS = 1000 * 60 * 3;
const recentlyScheduledAt = new Map();

function cleanId(value) {
  const id = Number(value || 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function cleanupRecentScheduleCache() {
  const now = Date.now();

  for (const [entityId, ts] of recentlyScheduledAt.entries()) {
    if (now - Number(ts || 0) > RECENTLY_SCHEDULED_TTL_MS) {
      recentlyScheduledAt.delete(entityId);
    }
  }
}

function wasRecentlyScheduled(entityId) {
  cleanupRecentScheduleCache();

  const ts = recentlyScheduledAt.get(entityId);
  if (!ts) return false;

  return Date.now() - Number(ts || 0) <= RECENTLY_SCHEDULED_TTL_MS;
}

export function schedulePostSaveMetadataEnrichment(entity = {}) {
  const entityId = cleanId(entity?.id);

  if (!entityId) return false;
  if (!shouldEnrichEntity(entity)) return false;
  if (pendingEntityIds.has(entityId)) return false;
  if (wasRecentlyScheduled(entityId)) return false;

  pendingEntityIds.add(entityId);
  recentlyScheduledAt.set(entityId, Date.now());

  const run = async () => {
    try {
      await enrichMediaEntityManually(entityId);
    } catch (error) {
      console.warn("Post-save metadata enrichment skipped:", error);
    } finally {
      pendingEntityIds.delete(entityId);
    }
  };

  if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
    window.setTimeout(run, 1200);
  } else {
    setTimeout(run, 1200);
  }

  return true;
}
