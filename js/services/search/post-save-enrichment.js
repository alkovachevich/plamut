import { enrichMediaEntityManually, shouldEnrichEntity } from "../metadata-enrichment.js";
import { saveRelatedSuggestionsForEntity } from "./related-suggestions.js";

const pendingEntityIds = new Set();
const pendingSuggestionKeys = new Set();
const RECENTLY_SCHEDULED_TTL_MS = 1000 * 60 * 3;
const RECENTLY_SCHEDULED_SUGGESTIONS_TTL_MS = 1000 * 60 * 10;
const recentlyScheduledAt = new Map();
const recentlyScheduledSuggestionsAt = new Map();

function cleanId(value) {
  const id = Number(value || 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function cleanUserId(value = "") {
  const id = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : "";
}

function suggestionKey(entityId, userId = "") {
  const cleanEntityId = cleanId(entityId);
  const cleanOwnerId = cleanUserId(userId);

  if (!cleanEntityId) return "";
  return cleanOwnerId ? `${cleanOwnerId}:${cleanEntityId}` : `current-user:${cleanEntityId}`;
}

function cleanupCache(map, ttlMs) {
  const now = Date.now();

  for (const [key, ts] of map.entries()) {
    if (now - Number(ts || 0) > ttlMs) {
      map.delete(key);
    }
  }
}

function wasRecentlyScheduled(entityId) {
  cleanupCache(recentlyScheduledAt, RECENTLY_SCHEDULED_TTL_MS);

  const ts = recentlyScheduledAt.get(entityId);
  if (!ts) return false;

  return Date.now() - Number(ts || 0) <= RECENTLY_SCHEDULED_TTL_MS;
}

function wasRecentlyScheduledSuggestions(key) {
  cleanupCache(recentlyScheduledSuggestionsAt, RECENTLY_SCHEDULED_SUGGESTIONS_TTL_MS);

  const ts = recentlyScheduledSuggestionsAt.get(key);
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

export function schedulePostSaveRelatedSuggestions(entity = {}, options = {}) {
  const entityId = cleanId(entity?.id);
  const ownerUserId = cleanUserId(options.userId || options.ownerUserId || "");
  const key = suggestionKey(entityId, ownerUserId);

  if (!entityId || !key) return false;
  if (pendingSuggestionKeys.has(key)) return false;
  if (wasRecentlyScheduledSuggestions(key)) return false;

  pendingSuggestionKeys.add(key);
  recentlyScheduledSuggestionsAt.set(key, Date.now());

  runLater(async () => {
    try {
      await saveRelatedSuggestionsForEntity(entity, ownerUserId ? { ownerUserId } : {});
    } catch (error) {
      console.warn("Post-save related suggestions skipped:", error);
    } finally {
      pendingSuggestionKeys.delete(key);
    }
  }, 2600);

  return true;
}

export function schedulePostSaveMetadataEnrichment(entity = {}, options = {}) {
  const entityId = cleanId(entity?.id);

  if (!entityId) return false;

  schedulePostSaveRelatedSuggestions(entity, options);

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
