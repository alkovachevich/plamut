import { getSupabaseClient } from "../lib/supabase-client.js";
import { normalizeString } from "../utils.js";

/* =========================
   CONFIG
========================= */

const TABLE = "match_cache";
const TTL_HOURS = 24;

/* =========================
   HELPERS
========================= */

function normalizeQuery(query = "") {
  return normalizeString(query || "");
}

function isExpired(createdAt) {
  if (!createdAt) return true;

  const created = new Date(createdAt).getTime();
  const now = Date.now();

  const diffHours = (now - created) / (1000 * 60 * 60);

  return diffHours > TTL_HOURS;
}

/* =========================
   GET CACHE
========================= */

export async function getSearchCache(query) {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from(TABLE)
    .select(`
      query_normalized,
      entity_ids,
      created_at
    `)
    .eq("query_normalized", normalized)
    .maybeSingle();

  if (error) {
    console.warn("Cache read error:", error);
    return null;
  }

  if (!data) return null;

  if (isExpired(data.created_at)) {
    return null;
  }

  return data.entity_ids || [];
}

/* =========================
   SAVE CACHE
========================= */

export async function saveSearchCache(query, entityIds = []) {
  const normalized = normalizeQuery(query);

  if (!normalized || !entityIds.length) return;

  const supabase = getSupabaseClient();

  const payload = {
    query_normalized: normalized,
    entity_ids: entityIds,
    created_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from(TABLE)
    .upsert(payload, {
      onConflict: "query_normalized"
    });

  if (error) {
    console.warn("Cache save error:", error);
  }
}

/* =========================
   RESOLVE ENTITIES FROM CACHE
========================= */

export async function getEntitiesByIds(entityIds = []) {
  if (!entityIds.length) return [];

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("media_entities")
    .select(`
      id,
      canonical_key,
      category,
      title_primary,
      title_ru,
      title_en,
      original_title,
      year,
      cover_url,
      description_ru,
      description_en
    `)
    .in("id", entityIds);

  if (error) {
    console.warn("Cache entities fetch error:", error);
    return [];
  }

  return data || [];
}
