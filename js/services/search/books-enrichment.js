import { safeArray, uniqueArray } from "../../utils.js";
import { fetchBestWikipediaSummary } from "./wikipedia-source.js";
import { fetchBestWikidataPatch, wikidataPatchLooksUseful } from "./wikidata-source.js";

const BOOK_ENRICH_LIMIT = 5;

function clean(value = "") {
  return String(value || "").trim();
}

function normalizeJson(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function titleCandidates(item = {}) {
  const meta = normalizeJson(item.meta, {});

  return uniqueArray([
    item.title,
    item.title_primary,
    item.title_ru,
    item.title_en,
    item.original_title,
    ...safeArray(item.aliases),
    ...safeArray(meta?.wikidata_aliases?.ru),
    ...safeArray(meta?.wikidata_aliases?.en),
    meta.wikipedia_ru_title,
    meta.wikipedia_en_title
  ].map(clean).filter(Boolean));
}

function metadataStatusForBook(item = {}) {
  return item.cover_url && (item.description_ru || item.description_en)
    ? "ready"
    : "needs_enrichment";
}

function mapWikipediaSummaryToPatch(summary = {}, language = "ru") {
  if (!summary) return null;

  return {
    title_ru: language === "ru" ? clean(summary.title) : "",
    title_en: language === "en" ? clean(summary.title) : "",
    description_ru: language === "ru" ? clean(summary.extract) : "",
    description_en: language === "en" ? clean(summary.extract) : "",
    cover_url: clean(summary.image),
    aliases: [summary.title].filter(Boolean),
    meta: {
      [`wikipedia_${language}_loaded`]: true,
      [`wikipedia_${language}_title`]: clean(summary.title),
      [`wikipedia_${language}_source`]: clean(summary.source)
    }
  };
}

function mergeBookSearchPatch(item = {}, patch = {}) {
  if (!patch || typeof patch !== "object") return item;

  const ids = normalizeJson(item.external_ids, {});
  const incomingWikidataId = clean(patch.wikidata_id || patch.external_ids?.wikidata || "");

  const next = {
    ...item,
    title_ru: item.title_ru || clean(patch.title_ru),
    title_en: item.title_en || clean(patch.title_en),
    original_title: item.original_title || clean(patch.original_title),
    year: item.year || patch.year || null,
    cover_url: item.cover_url || clean(patch.cover_url),
    description_ru: item.description_ru || clean(patch.description_ru),
    description_en: item.description_en || clean(patch.description_en),
    aliases: uniqueArray([
      ...safeArray(item.aliases),
      ...safeArray(patch.aliases),
      patch.title_ru,
      patch.title_en,
      patch.original_title
    ].map(clean).filter(Boolean)),
    external_ids: {
      ...ids,
      ...(incomingWikidataId
        ? { wikidata: incomingWikidataId, wikidata_id: incomingWikidataId }
        : {})
    },
    meta: {
      ...normalizeJson(item.meta, {}),
      ...normalizeJson(patch.meta, {}),
      book_localized_enrichment: true,
      metadata_status: "needs_enrichment"
    }
  };

  next.meta.metadata_status = metadataStatusForBook(next);
  return next;
}

export async function enrichBookSearchResults(items = [], language = "ru") {
  const base = safeArray(items);
  const head = base.slice(0, BOOK_ENRICH_LIMIT);
  const tail = base.slice(BOOK_ENRICH_LIMIT);
  const enrichedHead = [];

  for (const item of head) {
    let current = item;
    const candidates = titleCandidates(current);

    if (!current.external_ids?.wikidata && !current.external_ids?.wikidata_id) {
      const wikidataPatch = await fetchBestWikidataPatch(candidates, language).catch(() => null);
      if (wikidataPatchLooksUseful(wikidataPatch)) {
        current = mergeBookSearchPatch(current, wikidataPatch);
      }
    }

    if (!current.description_ru) {
      const wikiRu = await fetchBestWikipediaSummary(titleCandidates(current), "ru").catch(() => null);
      current = mergeBookSearchPatch(current, mapWikipediaSummaryToPatch(wikiRu, "ru"));
    }

    if (!current.description_en) {
      const wikiEn = await fetchBestWikipediaSummary(titleCandidates(current), "en").catch(() => null);
      current = mergeBookSearchPatch(current, mapWikipediaSummaryToPatch(wikiEn, "en"));
    }

    enrichedHead.push(current);
  }

  return [...enrichedHead, ...tail];
}
