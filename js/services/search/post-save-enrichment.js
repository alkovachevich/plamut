import { enrichMediaEntityManually, shouldEnrichEntity } from "../metadata-enrichment.js";
import { saveRelatedSuggestionsForEntity } from "./related-suggestions.js";

const pendingEntityIds = new Set();
const pendingSuggestionEntityIds = new Set();
const RECENTLY_SCHEDULED_TTL_MS = 1000 * 60 * 3;
const RECENTLY_SCHEDULED_SUGGESTIONS_TTL_MS = 1000 * 60 * 10;
const recentlyScheduledAt = new Map();
const recentlyScheduledSuggestionsAt = new Map();

function cleanId(value) {
  const id = Number(value || 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function cleanupCache(map, ttlMs) {
  const now = Date.now();

  for (const [entityId, ts] of map.entries()) {
    if (now - Number(ts || 0) > ttlMs) {
      map.delete(entityId);
    }
  }
}

function wasRecentlyScheduled(entityId) {
  cleanupCache(recentlyScheduledAt, RECENTLY_SCHEDULED_TTL_MS);

  const ts = recentlyScheduledAt.get(entityId);
  if (!ts) return false;

  return Date.now() - Number(ts || 0) <= RECENTLY_SCHEDULED_TTL_MS;
}

function wasRecentlyScheduledSuggestions(entityId) {
  cleanupCache(recentlyScheduledSuggestionsAt, RECENTLY_SCHEDULED_SUGGESTIONS_TTL_MS);

  const ts = recentlyScheduledSuggestionsAt.get(entityId);
  if (!ts) return false;

  return Date.now() - Number(ts || 0) <= RECENTLY_SCHEDULED_SUGGESTIONS_TTL_MS;
}

function runLater(fn, delayMs = 1200) {
  if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
    window.setTimeout(fn, delayMs);
  } else {
    setTimeout(fn, delayMs);
  }
}

export function schedulePostSaveRelatedSuggestions(entity = {}) {
  const entityId = cleanId(entity?.id);

  if (!entityId) return false;
  if (pendingSuggestionEntityIds.has(entityId)) return false;
  if (wasRecentlyScheduledSuggestions(entityId)) return false;

  pendingSuggestionEntityIds.add(entityId);
  recentlyScheduledSuggestionsAt.set(entityId, Date.now());

  runLater(async () => {
    try {
      await saveRelatedSuggestionsForEntity(entity);
    } catch (error) {
      console.warn("Post-save related suggestions skipped:", error);
    } finally {
      pendingSuggestionEntityIds.delete(entityId);
    }
  }, 2600);

  return true;
}

export function schedulePostSaveMetadataEnrichment(entity = {}) {
  const entityId = cleanId(entity?.id);

  if (!entityId) return false;

  schedulePostSaveRelatedSuggestions(entity);

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

  runLater(run, 1200);

  return true;
}
