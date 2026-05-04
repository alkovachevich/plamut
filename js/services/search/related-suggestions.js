import { getSupabaseClient, withTimeout } from "../../lib/supabase-client.js";
import { safeArray, uniqueArray } from "../../utils.js";
import {
  fetchWikidataEntities,
  getClaimEntityIds,
  mapWikidataEntityToPatch
} from "./wikidata-source.js";

const RELATION_CANDIDATES_TABLE = "relation_candidates";
const WRITE_TIMEOUT_MS = 9000;
const SEARCH_TIMEOUT_MS = 8500;
const MAX_DIRECT_TARGETS = 10;
const MAX_REVERSE_TARGETS = 8;
const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";

const DIRECT_RELATION_PROPERTIES = [
  { property: "P144", relation_type: "based_on", confidence: 0.92 },
  { property: "P155", relation_type: "previous_part", confidence: 0.9 },
  { property: "P156", relation_type: "next_part", confidence: 0.9 },
  { property: "P179", relation_type: "part_of_series", confidence: 0.82 },
  { property: "P361", relation_type: "part_of", confidence: 0.72 },
  { property: "P527", relation_type: "has_part", confidence: 0.62 },
  { property: "P4969", relation_type: "derivative_work", confidence: 0.78 }
];

function clean(value = "") {
  return String(value || "").trim();
}

function normalizeJson(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function cleanWikidataId(value = "") {
  const id = clean(value).replace("http://www.wikidata.org/entity/", "");
  return /^Q\d+$/i.test(id) ? id.toUpperCase() : "";
}

function cleanOwnerUserId(value = "") {
  const id = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : "";
}

function getEntityWikidataId(entity = {}) {
  const ids = normalizeJson(entity.external_ids, {});
  const meta = normalizeJson(entity.meta, {});

  return cleanWikidataId(
    ids.wikidata ||
    ids.wikidata_id ||
    entity.wikidata_id ||
    meta.wikidata_id ||
    ""
  );
}

function isTruthyFlag(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function isProtectedEntity(entity = {}) {
  const canonicalKey = clean(entity.canonical_key).toLowerCase();
  const universeKey = clean(entity.universe_key).toLowerCase();
  const meta = normalizeJson(entity.meta, {});

  return Boolean(
    isTruthyFlag(entity.manual_locked) ||
    isTruthyFlag(meta.manual_locked) ||
    isTruthyFlag(meta.seed_locked) ||
    isTruthyFlag(meta.seed_final) ||
    isTruthyFlag(meta.manual_reference) ||
    isTruthyFlag(meta.enrichment_protected) ||
    universeKey ||
    canonicalKey.startsWith("marvel:") ||
    canonicalKey.startsWith("mcu:") ||
    canonicalKey.startsWith("seed:") ||
    canonicalKey.startsWith("manual:")
  );
}

function fetchWithTimeout(url, options = {}, timeoutMs = SEARCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => {
    clearTimeout(timer);
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    throw new Error(`Related suggestions request failed: ${response.status}`);
  }

  return response.json();
}

async function fetchReverseAdaptationIds(sourceWikidataId = "") {
  const id = cleanWikidataId(sourceWikidataId);
  if (!id) return [];

  const query = `
    SELECT ?work WHERE {
      ?work wdt:P144 wd:${id}.
      FILTER(?work != wd:${id})
    }
    LIMIT ${MAX_REVERSE_TARGETS}
  `;

  const url = new URL(WIKIDATA_SPARQL_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");

  const payload = await fetchJson(url.toString(), {
    headers: {
      Accept: "application/sparql-results+json"
    }
  }).catch(() => null);

  return uniqueArray(
    safeArray(payload?.results?.bindings)
      .map((row) => cleanWikidataId(row?.work?.value))
      .filter(Boolean)
  );
}

function mapEntityPatchForPayload(patch = {}) {
  return {
    wikidata_id: cleanWikidataId(patch.wikidata_id),
    title_ru: clean(patch.title_ru),
    title_en: clean(patch.title_en),
    original_title: clean(patch.original_title),
    year: patch.year || null,
    cover_url: clean(patch.cover_url),
    description_ru: clean(patch.description_ru),
    description_en: clean(patch.description_en),
    aliases: safeArray(patch.aliases).map(clean).filter(Boolean)
  };
}

async function buildDirectCandidates(entity = {}, wikidataEntity = {}, ownerUserId = "") {
  const candidates = [];

  DIRECT_RELATION_PROPERTIES.forEach((config) => {
    const ids = getClaimEntityIds(wikidataEntity, [config.property]).slice(0, MAX_DIRECT_TARGETS);

    ids.forEach((targetId) => {
      const cleanTargetId = cleanWikidataId(targetId);
      if (!cleanTargetId) return;

      candidates.push({
        owner_user_id: ownerUserId,
        source_entity_id: entity.id,
        relation_type: config.relation_type,
        source: "wikidata",
        status: "suggested",
        confidence: config.confidence,
        wikidata_entity_id: cleanTargetId,
        candidate_payload: {
          target_wikidata_id: cleanTargetId,
          source_wikidata_id: getEntityWikidataId(entity),
          wikidata_property: config.property,
          relation_type: config.relation_type,
          direction: "direct"
        }
      });
    });
  });

  return candidates;
}

async function buildReverseAdaptationCandidates(entity = {}, ownerUserId = "") {
  const sourceWikidataId = getEntityWikidataId(entity);
  const reverseIds = await fetchReverseAdaptationIds(sourceWikidataId);

  return reverseIds.map((targetId) => ({
    owner_user_id: ownerUserId,
    source_entity_id: entity.id,
    relation_type: "adaptation",
    source: "wikidata",
    status: "suggested",
    confidence: 0.86,
    wikidata_entity_id: targetId,
    candidate_payload: {
      target_wikidata_id: targetId,
      source_wikidata_id: sourceWikidataId,
      wikidata_property: "P144",
      relation_type: "adaptation",
      direction: "reverse"
    }
  }));
}

async function enrichCandidatePayloads(candidates = []) {
  const ids = uniqueArray(
    safeArray(candidates)
      .map((candidate) => cleanWikidataId(candidate.wikidata_entity_id))
      .filter(Boolean)
  ).slice(0, 24);

  if (!ids.length) return candidates;

  const entities = await fetchWikidataEntities(ids).catch(() => []);
  const patchById = new Map();

  safeArray(entities).forEach((wikidataEntity) => {
    const patch = mapWikidataEntityToPatch(wikidataEntity);
    const id = cleanWikidataId(patch?.wikidata_id || wikidataEntity?.id);
    if (!id) return;
    patchById.set(id, mapEntityPatchForPayload(patch));
  });

  return safeArray(candidates).map((candidate) => {
    const targetId = cleanWikidataId(candidate.wikidata_entity_id);
    const target = patchById.get(targetId) || { wikidata_id: targetId };

    return {
      ...candidate,
      candidate_payload: {
        ...normalizeJson(candidate.candidate_payload, {}),
        target
      }
    };
  });
}

function dedupeCandidates(candidates = []) {
  const seen = new Set();

  return safeArray(candidates).filter((candidate) => {
    const targetId = cleanWikidataId(candidate.wikidata_entity_id);
    if (!candidate.owner_user_id || !candidate.source_entity_id || !targetId) return false;

    const key = `${candidate.owner_user_id}:${candidate.source_entity_id}:${candidate.relation_type}:${targetId}`;
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

async function saveCandidatesWithUpsert(supabase, candidates = []) {
  return withTimeout(
    supabase
      .from(RELATION_CANDIDATES_TABLE)
      .upsert(candidates, {
        onConflict: "owner_user_id,source_entity_id,relation_type,wikidata_entity_id",
        ignoreDuplicates: false
      })
      .select("id"),
    "Сохранение подсказок связанных произведений",
    WRITE_TIMEOUT_MS
  );
}

async function saveCandidatesWithInsertFallback(supabase, candidates = []) {
  return withTimeout(
    supabase
      .from(RELATION_CANDIDATES_TABLE)
      .insert(candidates)
      .select("id"),
    "Fallback-сохранение подсказок связанных произведений",
    WRITE_TIMEOUT_MS
  );
}

export async function buildRelatedSuggestionsForEntity(entity = {}, options = {}) {
  const ownerUserId = cleanOwnerUserId(options.ownerUserId || options.userId || "");

  if (!entity?.id) return [];
  if (!ownerUserId) return [];
  if (isProtectedEntity(entity)) return [];

  const wikidataId = getEntityWikidataId(entity);
  if (!wikidataId) return [];

  const [wikidataEntity] = await fetchWikidataEntities([wikidataId]).catch(() => []);
  if (!wikidataEntity?.id) return [];

  const [direct, reverseAdaptations] = await Promise.allSettled([
    buildDirectCandidates(entity, wikidataEntity, ownerUserId),
    buildReverseAdaptationCandidates(entity, ownerUserId)
  ]);

  const rawCandidates = [
    ...safeArray(direct.status === "fulfilled" ? direct.value : []),
    ...safeArray(reverseAdaptations.status === "fulfilled" ? reverseAdaptations.value : [])
  ];

  return enrichCandidatePayloads(dedupeCandidates(rawCandidates));
}

export async function saveRelatedSuggestionsForEntity(entity = {}, options = {}) {
  const candidates = await buildRelatedSuggestionsForEntity(entity, options);
  if (!candidates.length) {
    return {
      saved: 0,
      skipped: true,
      reason: "empty"
    };
  }

  const supabase = getSupabaseClient();

  const { data, error } = await saveCandidatesWithUpsert(supabase, candidates)
    .catch((error) => ({ data: [], error }));

  if (!error) {
    return {
      saved: safeArray(data).length,
      skipped: false,
      reason: ""
    };
  }

  console.warn("Related suggestions upsert failed, trying insert fallback:", error);

  const { data: fallbackData, error: fallbackError } = await saveCandidatesWithInsertFallback(supabase, candidates)
    .catch((error) => ({ data: [], error }));

  if (fallbackError) {
    console.warn("Related suggestions save skipped:", fallbackError);
    return {
      saved: 0,
      skipped: true,
      reason: "save_failed"
    };
  }

  return {
    saved: safeArray(fallbackData).length,
    skipped: false,
    reason: "insert_fallback"
  };
}
