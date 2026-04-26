import { getSupabaseClient } from "../lib/supabase-client.js";
import { updateUniverseBuildJob, UNIVERSE_JOB_STATUS } from "./universe-build-jobs.js";

function log(...args) {
  console.log("UNIVERSE:", ...args);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRelation(item = {}) {
  return {
    from_entity_id: item.from_entity_id,
    to_entity_id: item.to_entity_id,
    relation_type: item.relation_type || "related_work",
    source: "wikidata", // 🔥 ФИКС
    confidence: item.confidence || 0.7,
    metadata_json: item.metadata_json || {}
  };
}

async function saveRelations(relations = []) {
  const supabase = getSupabaseClient();

  if (!relations.length) return;

  const payload = relations.map(normalizeRelation);

  const { error } = await supabase
    .from("media_relations")
    .insert(payload);

  if (error) {
    console.error("UNIVERSE: saveRelations error", error);
    throw error;
  }
}

async function callNormalizeFunction(payload) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.functions.invoke(
    "plamut-universe-normalize",
    {
      body: payload
    }
  );

  if (error) {
    console.error("UNIVERSE: normalize error", error);
    throw error;
  }

  return data;
}

export async function buildUniverseForJob(job, entity) {
  if (!job?.id || !entity?.id) {
    console.warn("UNIVERSE: invalid job or entity");
    return null;
  }

  log("START", { job, entity });

  try {
    await updateUniverseBuildJob(job.id, {
      status: UNIVERSE_JOB_STATUS.BUILDING,
      progress_current: 1,
      progress_label: "Сбор данных"
    });

    const seed = {
      id: entity.id,
      title: entity.title_primary,
      canonical_key: entity.canonical_key
    };

    const payload = {
      seed,
      items: [seed]
    };

    await updateUniverseBuildJob(job.id, {
      progress_current: 5,
      progress_label: "Нормализация через AI"
    });

    const normalized = await callNormalizeFunction(payload);

    if (!normalized) {
      throw new Error("normalize вернул пусто");
    }

    const relations = safeArray(normalized.relations);

    await updateUniverseBuildJob(job.id, {
      progress_current: 7,
      progress_label: "Сохранение связей"
    });

    await saveRelations(relations);

    const universeKey =
      normalized.universe_key ||
      `universe:${entity.canonical_key}`;

    await updateUniverseBuildJob(job.id, {
      status: UNIVERSE_JOB_STATUS.READY,
      progress_current: 9,
      progress_label: "Готово",
      universe_key: universeKey
    });

    log("DONE", universeKey);

    return {
      universe_key: universeKey
    };

  } catch (error) {
    console.error("UNIVERSE: build failed", error);

    await updateUniverseBuildJob(job.id, {
      status: UNIVERSE_JOB_STATUS.FAILED,
      error_message: error.message
    });

    return null;
  }
}
