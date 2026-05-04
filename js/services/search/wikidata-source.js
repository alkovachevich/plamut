import { safeArray, uniqueArray } from "../../utils.js";

const SEARCH_TIMEOUT_MS = 7500;
const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
const COMMONS_FILE_BASE_URL = "https://commons.wikimedia.org/wiki/Special:FilePath";

function clean(value = "") {
  return String(value || "").trim();
}

function cleanLower(value = "") {
  return clean(value).toLowerCase();
}

function normalizeLanguage(language = "ru") {
  return language === "en" ? "en" : "ru";
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
    throw new Error(`Wikidata request failed: ${response.status}`);
  }

  return response.json();
}

export function wikimediaFileUrl(filename = "") {
  const value = clean(filename);
  if (!value) return "";
  return `${COMMONS_FILE_BASE_URL}/${encodeURIComponent(value)}`;
}

export function getClaimValues(entity = {}, property = "") {
  return safeArray(entity?.claims?.[property])
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .filter(Boolean);
}

export function getClaimValue(entity = {}, property = "") {
  return getClaimValues(entity, property)[0] || null;
}

export function getEntityIdFromClaimValue(value) {
  if (!value || typeof value !== "object") return "";
  return value.id || (value["entity-type"] === "item" && value["numeric-id"] ? `Q${value["numeric-id"]}` : "");
}

export function getClaimEntityIds(entity = {}, properties = []) {
  return uniqueArray(
    safeArray(properties)
      .flatMap((property) =>
        getClaimValues(entity, property)
          .map(getEntityIdFromClaimValue)
          .filter(Boolean)
      )
  );
}

export function getYearFromWikidataTime(value) {
  const text = clean(value?.time || "");
  if (!text) return null;

  const match = text.match(/[+-]?(\d{4})/);
  if (!match) return null;

  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

export async function searchWikidataIds(query = "", language = "ru", limit = 8) {
  const cleanQuery = clean(query);
  if (!cleanQuery) return [];

  const lang = normalizeLanguage(language);
  const url = new URL(WIKIDATA_API_URL);

  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("language", lang);
  url.searchParams.set("uselang", lang);
  url.searchParams.set("type", "item");
  url.searchParams.set("origin", "*");
  url.searchParams.set("limit", String(Math.max(1, Math.min(Number(limit) || 8, 20))));
  url.searchParams.set("search", cleanQuery);

  const payload = await fetchJson(url.toString(), {
    headers: { Accept: "application/json" }
  }).catch(() => null);

  return safeArray(payload?.search)
    .map((item) => clean(item?.id))
    .filter(Boolean);
}

export async function fetchWikidataEntities(ids = []) {
  const cleanIds = uniqueArray(safeArray(ids).map(clean).filter(Boolean));
  if (!cleanIds.length) return [];

  const url = new URL(WIKIDATA_API_URL);

  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("props", "labels|aliases|descriptions|claims|sitelinks");
  url.searchParams.set("languages", "ru|en");
  url.searchParams.set("ids", cleanIds.slice(0, 50).join("|"));

  const payload = await fetchJson(url.toString(), {
    headers: { Accept: "application/json" }
  }).catch(() => null);

  return Object.values(payload?.entities || {})
    .filter((item) => item?.id && item.id !== "-1");
}

export function mapWikidataEntityToPatch(entity = {}) {
  const id = clean(entity?.id);
  if (!id || id === "-1") return null;

  const titleRu = clean(entity?.labels?.ru?.value);
  const titleEn = clean(entity?.labels?.en?.value);
  const descriptionRu = clean(entity?.descriptions?.ru?.value);
  const descriptionEn = clean(entity?.descriptions?.en?.value);
  const aliasesRu = safeArray(entity?.aliases?.ru).map((row) => clean(row?.value)).filter(Boolean);
  const aliasesEn = safeArray(entity?.aliases?.en).map((row) => clean(row?.value)).filter(Boolean);
  const imageValue = getClaimValue(entity, "P18");
  const publicationDate = getClaimValue(entity, "P577");
  const inceptionDate = getClaimValue(entity, "P571");

  return {
    wikidata_id: id,
    title_ru: titleRu,
    title_en: titleEn,
    original_title: titleEn || titleRu,
    description_ru: descriptionRu,
    description_en: descriptionEn,
    year: getYearFromWikidataTime(publicationDate) || getYearFromWikidataTime(inceptionDate),
    cover_url: wikimediaFileUrl(imageValue),
    aliases: uniqueArray([titleRu, titleEn, ...aliasesRu, ...aliasesEn].filter(Boolean)),
    meta: {
      wikidata_id: id,
      wikidata_labels: { ru: titleRu, en: titleEn },
      wikidata_aliases: { ru: aliasesRu, en: aliasesEn },
      wikidata_sitelinks: {
        ru: clean(entity?.sitelinks?.ruwiki?.title),
        en: clean(entity?.sitelinks?.enwiki?.title)
      },
      source: "wikidata"
    }
  };
}

export async function fetchBestWikidataPatch(titles = [], language = "ru") {
  const queries = uniqueArray(safeArray(titles).map(clean).filter(Boolean)).slice(0, 3);
  const languages = uniqueArray([normalizeLanguage(language), "ru", "en"]);
  const ids = [];

  for (const query of queries) {
    for (const lang of languages) {
      ids.push(...await searchWikidataIds(query, lang, 5).catch(() => []));
    }
  }

  const entities = await fetchWikidataEntities(uniqueArray(ids).slice(0, 20));

  for (const entity of entities) {
    const patch = mapWikidataEntityToPatch(entity);
    if (patch?.wikidata_id) return patch;
  }

  return null;
}

export function wikidataPatchLooksUseful(patch = {}) {
  return Boolean(
    patch?.wikidata_id ||
    patch?.cover_url ||
    patch?.description_ru ||
    patch?.description_en ||
    safeArray(patch?.aliases).length
  );
}

export function wikidataEntityTypeIds(entity = {}) {
  return uniqueArray([
    ...getClaimEntityIds(entity, ["P31"]),
    ...getClaimEntityIds(entity, ["P279"])
  ].map(cleanLower).filter(Boolean));
}
