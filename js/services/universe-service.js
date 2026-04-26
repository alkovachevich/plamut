import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";
import { fetchJsonCached } from "./api-cache.js";
import {
  updateUniverseBuildJob,
  UNIVERSE_JOB_STATUS
} from "./universe-build-jobs.js";

const DEFAULT_TIMEOUT_MS = 15000;

function cleanText(v = "") {
  return String(v || "").trim();
}

async function fetchWikidataRelations(entity) {
  const title =
    entity.title_primary ||
    entity.title_en ||
    entity.title_ru ||
    "";

  if (!title) return [];

  return fetchJsonCached(
    "wikidata",
    { title },
    async () => {
      const url = new URL("https://www.wikidata.org/w/api.php");

      url.searchParams.set("action", "wbsearchentities");
      url.searchParams.set("format", "json");
      url.searchParams.set("search", title);
      url.searchParams.set("language", "en");
      url.searchParams.set("origin", "*");

      const res = await fetch(url.toString());
      if (!res.ok) return [];

      const data = await res.json();
      return data?.search || [];
    },
    { ttlMs: 1000 * 60 * 60 * 24 * 7 }
  );
}

async function saveEntities(supabase, items = []) {
  if (!items.length) return [];

  const rows = items.map((item) => ({
    canonical_key: `wikidata:${item.id}`,
    category: "unknown",
    title_primary: item.label,
    external_ids: {
      wikidata: item.id
    }
  }));

  const { data, error } = await withTimeout(
    supabase
      .from("media_entities")
      .upsert(rows, { onConflict: "canonical_key" })
      .select(),
    "Сохранение сущностей",
    DEFAULT_TIMEOUT_MS
  );

  if (error) throw error;

  return data || [];
}

export async function buildUniverseForJob(job, entity) {
  const supabase = getSupabaseClient();

  try {
    await updateUniverseBuildJob(job.id, {
      status: UNIVERSE_JOB_STATUS.BUILDING,
      progress_current: 1,
      progress_label: "Поиск связей (Wikidata)"
    });

    const wikidata = await fetchWikidataRelations(entity);

    await updateUniverseBuildJob(job.id, {
      progress_current: 3,
      progress_label: "Сохранение сущностей"
    });

    const savedEntities = await saveEntities(supabase, wikidata);

    await updateUniverseBuildJob(job.id, {
      progress_current: 6,
      progress_label: "Формирование вселенной"
    });

    const universeKey =
      entity.canonical_key || `universe:${Date.now()}`;

    const universeRows = savedEntities.map((e) => ({
      universe_key: universeKey,
      entity_id: e.id
    }));

    await supabase
      .from("universe_members")
      .insert(universeRows);

    await updateUniverseBuildJob(job.id, {
      status: UNIVERSE_JOB_STATUS.READY,
      progress_current: 8,
      progress_label: "Готово",
      universe_key: universeKey
    });

    return {
      universe_key: universeKey
    };
  } catch (error) {
    console.error("Universe build failed:", error);

    await updateUniverseBuildJob(job.id, {
      status: UNIVERSE_JOB_STATUS.FAILED,
      error_message: error.message || "Ошибка"
    });

    return null;
  }
}

export async function getRelatedItemsForEntity({ entityId }) {
  if (!entityId) return [];

  const supabase = getSupabaseClient();

  const { data } = await supabase
    .from("media_relations")
    .select(`
      *,
      target:to_entity_id (*)
    `)
    .eq("from_entity_id", entityId);

  return data || [];
}
