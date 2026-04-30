import { SEARCH_LIMITS } from "../../config.js";
import { compactString, normalizeString, safeArray, uniqueArray } from "../../utils.js";
import { getSupabaseClient, withTimeout } from "../../lib/supabase-client.js";

const SEARCH_TIMEOUT_MS = 9000;
const SUPABASE_SEARCH_TIMEOUT_MS = 6000;
const WIKIDATA_LIMIT = 14;
const OPEN_LIBRARY_LIMIT = 18;
const PLACEHOLDER_COVER_URL = "/placeholder.jpg";

const WIKIDATA_BOOK_TYPES = new Set([
  "Q571",
  "Q8261",
  "Q7725634",
  "Q47461344",
  "Q49084",
  "Q5185279",
  "Q25379",
  "Q277759"
]);

const WIKIDATA_NOT_BOOK_TYPES = new Set([
  "Q11424",
  "Q5398426",
  "Q15416",
  "Q1107",
  "Q5",
  "Q95074",
  "Q21191270",
  "Q386724",
  "Q9509",
  "Q15632617",
  "Q15773347"
]);

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

function hasCyrillic(value = "") {
  return /[А-Яа-яЁёІіЇїЄє]/.test(String(value || ""));
}

function safeYear(value) {
  if (value === null || value === undefined || value === "") return null;
  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function cleanTitle(value = "") {
  return normalizeString(value)
    .replace(/\bкнига\b/g, "")
    .replace(/\bbook\b/g, "")
    .replace(/\bроман\b/g, "")
    .replace(/\bnovel\b/g, "")
    .replace(/\bтом\b/g, "")
    .replace(/\bvolume\b/g, "")
    .replace(/\bcomplete\b/g, "")
    .replace(/\bseries\b/g, "")
    .replace(/\bset\b/g, "")
    .replace(/\bbox\b/g, "")
    .replace(/\bcollection\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWorkKey(title = "", author = "") {
  const titlePart = compactString(cleanTitle(title || "unknown"));
  const authorPart = compactString(cleanTitle(author || ""));
  return [titlePart, authorPart].filter(Boolean).join(":") || "unknown";
}

function getBookAuthors(item = {}) {
  return uniqueArray([
    ...safeArray(item?.meta?.author_names),
    ...safeArray(item?.meta?.authors),
    ...safeArray(item?.authors),
    ...safeArray(item?.author_names)
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

function getTitleKeys(item = {}) {
  return uniqueArray([
    item.title,
    item.title_primary,
    item.title_ru,
    item.title_en,
    item.original_title,
    ...safeArray(item.aliases),
    ...safeArray(item?.meta?.wikidata_aliases?.ru),
    ...safeArray(item?.meta?.wikidata_aliases?.en)
  ])
    .map(cleanTitle)
    .filter(Boolean);
}

function pickBetterText(existingValue = "", incomingValue = "") {
  const existing = String(existingValue || "").trim();
  const incoming = String(incomingValue || "").trim();

  if (!existing) return incoming;
  if (!incoming) return existing;

  return incoming.length > existing.length ? incoming : existing;
}

function pickTitleByLanguage(row = {}, language = "ru") {
  const titleRu = String(row.title_ru || "").trim();
  const titleEn = String(row.title_en || "").trim();
  const originalTitle = String(row.original_title || row.title_primary || titleEn || titleRu || "").trim();

  if (language === "en") {
    return titleEn || titleRu || originalTitle;
  }

  return titleRu || titleEn || originalTitle;
}

function wikimediaFileUrl(filename = "") {
  const clean = String(filename || "").trim();
  if (!clean) return "";
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(clean)}`;
}

function openLibraryCoverUrlFromId(coverId) {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : "";
}

function buildOpenLibraryCover(doc = {}) {
  if (doc.cover_i) return openLibraryCoverUrlFromId(doc.cover_i);
  return "";
}

function normalizeOpenLibraryWorkKey(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("/works/") ? raw.replace("/works/", "") : raw;
}

function isNoisyOpenLibraryTitle(title = "") {
  const text = normalizeString(title);

  if (!text) return true;

  return [
    "complete series",
    "complete dune series",
    "box set",
    "boxed set",
    "collection",
    "omnibus",
    "study guide",
    "summary",
    "workbook",
    "radiographie",
    "guide",
    "companion",
    "analysis",
    "set of",
    "books"
  ].some((pattern) => text.includes(pattern));
}

function normalizeBookItem(raw = {}, language = "ru") {
  const ids = raw.external_ids && typeof raw.external_ids === "object"
    ? raw.external_ids
    : {};

  const wikidataId = String(ids.wikidata || "").trim();

  const authors = uniqueArray([
    ...safeArray(raw?.meta?.author_names),
    ...safeArray(raw?.authors),
    ...safeArray(raw?.author_names)
  ].map((value) => String(value || "").trim()).filter(Boolean));

  const title =
    String(raw.title || "").trim() ||
    pickTitleByLanguage(raw, language) ||
    String(raw.original_title || "").trim();

  if (!title) return null;

  const canonicalKey = wikidataId
    ? `books:wikidata:${wikidataId}`
    : `books:work:${normalizeWorkKey(title, authors[0] || "")}`;

  return {
    canonical_key: canonicalKey,
    category: "books",
    title,
    title_ru: String(raw.title_ru || "").trim(),
    title_en: String(raw.title_en || "").trim(),
    original_title: String(raw.original_title || raw.title_en || raw.title_ru || title).trim(),
    year: safeYear(raw.year),
    cover_url: String(raw.cover_url || "").trim(),
    description_ru: String(raw.description_ru || "").trim(),
    description_en: String(raw.description_en || "").trim(),
    aliases: uniqueArray(safeArray(raw.aliases).map((value) => String(value || "").trim()).filter(Boolean)),
    external_ids: {
      wikidata: wikidataId || null,
      openlibrary_work: ids.openlibrary_work || null
    },
    primary_source: String(raw.primary_source || "").trim(),
    score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0,
    meta: {
      ...(raw.meta && typeof raw.meta === "object" ? raw.meta : {}),
      author_names: authors
    }
  };
}

function mapSupabaseBookRow(row = {}, language = "ru") {
  const ids = row.external_ids && typeof row.external_ids === "object" ? row.external_ids : {};

  const aliases = uniqueArray([
    ...safeArray(row.aliases),
    row.title_primary,
    row.title_ru,
    row.title_en,
    row.original_title
  ].map((value) => String(value || "").trim()).filter(Boolean));

  return normalizeBookItem({
    title: pickTitleByLanguage(row, language),
    title_ru: row.title_ru || "",
    title_en: row.title_en || "",
    original_title: row.original_title || row.title_primary || "",
    year: row.year || null,
    cover_url: row.cover_url || "",
    description_ru: row.description_ru || "",
    description_en: row.description_en || "",
    aliases,
    external_ids: {
      wikidata: ids.wikidata || null,
      openlibrary_work: ids.openlibrary_work || null
    },
    primary_source: row.primary_source || "supabase",
    meta: row.meta && typeof row.meta === "object" ? row.meta : {},
    score: 1000
  }, language);
}

async function fetchBooksFromSupabase(query = "", language = "ru") {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return [];

  try {
    const supabase = getSupabaseClient();
    const normalized = normalizeString(cleanQuery);

    const entityQuery = supabase
      .from("media_entities")
      .select("id,canonical_key,category,primary_source,title_primary,title_ru,title_en,original_title,year,cover_url,description_ru,description_en,external_ids,meta")
      .eq("category", "books")
      .or(`title_primary.ilike.%${cleanQuery}%,title_ru.ilike.%${cleanQuery}%,title_en.ilike.%${cleanQuery}%,original_title.ilike.%${cleanQuery}%,canonical_key.ilike.%${cleanQuery}%`)
      .limit(25);

    const [{ data: entities, error: entitiesError }, aliasesResult] = await Promise.all([
      withTimeout(entityQuery, "books search media_entities", SUPABASE_SEARCH_TIMEOUT_MS)
        .catch((error) => ({ data: [], error })),
      withTimeout(
        supabase
          .from("entity_aliases")
          .select("entity_id,alias")
          .or(`alias.ilike.%${cleanQuery}%,alias_normalized.ilike.%${normalized}%`)
          .limit(40),
        "books search entity_aliases",
        SUPABASE_SEARCH_TIMEOUT_MS
      ).catch(() => ({ data: [], error: null }))
    ]);

    if (entitiesError) {
      console.warn("Books Supabase search skipped:", entitiesError);
      return [];
    }

    const aliasRows = safeArray(aliasesResult?.data);
    const aliasIds = uniqueArray(aliasRows.map((row) => row.entity_id).filter(Boolean));
    let aliasEntities = [];

    if (aliasIds.length) {
      const { data } = await withTimeout(
        supabase
          .from("media_entities")
          .select("id,canonical_key,category,primary_source,title_primary,title_ru,title_en,original_title,year,cover_url,description_ru,description_en,external_ids,meta")
          .eq("category", "books")
          .in("id", aliasIds),
        "books search media_entities by alias",
        SUPABASE_SEARCH_TIMEOUT_MS
      ).catch(() => ({ data: [] }));

      aliasEntities = safeArray(data);
    }

    const aliasByEntityId = new Map();

    aliasRows.forEach((row) => {
      if (!row?.entity_id) return;
      if (!aliasByEntityId.has(row.entity_id)) aliasByEntityId.set(row.entity_id, []);
      aliasByEntityId.get(row.entity_id).push(String(row.alias || "").trim());
    });

    return dedupeBooks(
      [...safeArray(entities), ...aliasEntities]
        .map((row) => mapSupabaseBookRow({
          ...row,
          aliases: aliasByEntityId.get(row.id) || []
        }, language))
        .filter(Boolean)
    );
  } catch (error) {
    console.warn("Books Supabase search skipped:", error);
    return [];
  }
}

async function fetchWikidataSearch(query = "") {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return [];

  const runSearch = async (language = "ru") => {
    const url = new URL("https://www.wikidata.org/w/api.php");

    url.searchParams.set("action", "wbsearchentities");
    url.searchParams.set("format", "json");
    url.searchParams.set("language", language);
    url.searchParams.set("uselang", language);
    url.searchParams.set("type", "item");
    url.searchParams.set("origin", "*");
    url.searchParams.set("limit", String(WIKIDATA_LIMIT));
    url.searchParams.set("search", cleanQuery);

    const response = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`Wikidata search failed: ${response.status}`);
    }

    const payload = await response.json();
    return safeArray(payload?.search);
  };

  const [ru, en] = await Promise.allSettled([
    runSearch("ru"),
    runSearch("en")
  ]);

  return uniqueArray([
    ...safeArray(ru.status === "fulfilled" ? ru.value : []),
    ...safeArray(en.status === "fulfilled" ? en.value : [])
  ].map((item) => item?.id).filter(Boolean));
}

async function fetchWikidataEntities(ids = []) {
  const cleanIds = uniqueArray(safeArray(ids).map(String).filter(Boolean));
  if (!cleanIds.length) return [];

  const url = new URL("https://www.wikidata.org/w/api.php");

  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("props", "labels|aliases|descriptions|claims");
  url.searchParams.set("languages", "ru|en");
  url.searchParams.set("ids", cleanIds.join("|"));

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Wikidata entities failed: ${response.status}`);
  }

  const payload = await response.json();
  return Object.values(payload?.entities || {});
}

function getClaimValue(entity = {}, property = "") {
  const claim = safeArray(entity?.claims?.[property])[0];
  return claim?.mainsnak?.datavalue?.value || null;
}

function getClaimValues(entity = {}, property = "") {
  return safeArray(entity?.claims?.[property])
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .filter(Boolean);
}

function getEntityIdFromClaimValue(value) {
  if (!value || typeof value !== "object") return "";
  return value.id || (value["entity-type"] === "item" && value["numeric-id"] ? `Q${value["numeric-id"]}` : "");
}

function getClaimEntityIds(entity = {}, properties = []) {
  return uniqueArray(
    safeArray(properties).flatMap((property) =>
      getClaimValues(entity, property)
        .map(getEntityIdFromClaimValue)
        .filter(Boolean)
    )
  );
}

function isLikelyBookEntity(entity = {}) {
  const typeIds = getClaimEntityIds(entity, ["P31", "P279", "P136"]);

  if (typeIds.some((id) => WIKIDATA_NOT_BOOK_TYPES.has(id))) {
    return false;
  }

  if (typeIds.some((id) => WIKIDATA_BOOK_TYPES.has(id))) {
    return true;
  }

  const description = [
    entity?.descriptions?.ru?.value,
    entity?.descriptions?.en?.value
  ].map((value) => String(value || "").toLowerCase()).join(" ");

  const labels = [
    entity?.labels?.ru?.value,
    entity?.labels?.en?.value
  ].map((value) => String(value || "").toLowerCase()).join(" ");

  if (description.includes("fictional character") || description.includes("персонаж")) {
    return false;
  }

  if (labels.includes("harry potter") && description.includes("character")) {
    return false;
  }

  return [
    "book",
    "novel",
    "literary work",
    "written work",
    "роман",
    "книга",
    "литературное произведение",
    "пьеса",
    "рассказ"
  ].some((word) => description.includes(word));
}

function getYearFromWikidataTime(value) {
  const time = String(value?.time || "").trim();
  if (!time) return null;

  const match = time.match(/[+-]?(\d{4})/);
  if (!match) return null;

  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

async function fetchWikidataLabels(ids = []) {
  const cleanIds = uniqueArray(safeArray(ids).map(String).filter(Boolean)).slice(0, 20);
  if (!cleanIds.length) return new Map();

  try {
    const entities = await fetchWikidataEntities(cleanIds);
    const map = new Map();

    entities.forEach((entity) => {
      const id = String(entity?.id || "").trim();
      if (!id || id === "-1") return;

      map.set(id, {
        ru: String(entity?.labels?.ru?.value || "").trim(),
        en: String(entity?.labels?.en?.value || "").trim()
      });
    });

    return map;
  } catch (error) {
    console.warn("Wikidata label fetch failed:", error);
    return new Map();
  }
}

function mapWikidataEntity(entity = {}, language = "ru", labelMap = new Map()) {
  const wikidataId = String(entity?.id || "").trim();
  if (!wikidataId || wikidataId === "-1") return null;
  if (!isLikelyBookEntity(entity)) return null;

  const titleRu = String(entity?.labels?.ru?.value || "").trim();
  const titleEn = String(entity?.labels?.en?.value || "").trim();
  const descriptionRu = String(entity?.descriptions?.ru?.value || "").trim();
  const descriptionEn = String(entity?.descriptions?.en?.value || "").trim();

  const aliasesRu = safeArray(entity?.aliases?.ru).map((row) => row?.value).filter(Boolean);
  const aliasesEn = safeArray(entity?.aliases?.en).map((row) => row?.value).filter(Boolean);

  const title = language === "en"
    ? (titleEn || titleRu)
    : (titleRu || titleEn);

  if (!title) return null;

  const authorIds = getClaimEntityIds(entity, ["P50"]);
  const authorNames = uniqueArray(
    authorIds.flatMap((id) => {
      const labels = labelMap.get(id) || {};
      return language === "en"
        ? [labels.en, labels.ru]
        : [labels.ru, labels.en];
    }).filter(Boolean)
  );

  const seriesIds = getClaimEntityIds(entity, ["P179", "P361"]);
  const seriesNames = uniqueArray(
    seriesIds.flatMap((id) => {
      const labels = labelMap.get(id) || {};
      return language === "en"
        ? [labels.en, labels.ru]
        : [labels.ru, labels.en];
    }).filter(Boolean)
  );

  const imageValue = getClaimValue(entity, "P18");
  const publicationDate = getClaimValue(entity, "P577");
  const inceptionDate = getClaimValue(entity, "P571");

  const previousIds = getClaimEntityIds(entity, ["P155"]);
  const nextIds = getClaimEntityIds(entity, ["P156"]);
  const basedOnIds = getClaimEntityIds(entity, ["P144"]);

  return normalizeBookItem({
    title,
    title_ru: titleRu,
    title_en: titleEn,
    original_title: titleEn || titleRu || title,
    year: getYearFromWikidataTime(publicationDate) || getYearFromWikidataTime(inceptionDate),
    cover_url: wikimediaFileUrl(imageValue),
    description_ru: descriptionRu,
    description_en: descriptionEn,
    aliases: uniqueArray([
      titleRu,
      titleEn,
      ...aliasesRu,
      ...aliasesEn
    ].filter(Boolean)),
    external_ids: {
      wikidata: wikidataId
    },
    primary_source: "wikidata",
    score: 900,
    meta: {
      source: "wikidata",
      wikidata_labels: {
        ru: titleRu,
        en: titleEn
      },
      wikidata_aliases: {
        ru: aliasesRu,
        en: aliasesEn
      },
      author_names: authorNames,
      author_wikidata_ids: authorIds,
      series_name: seriesNames[0] || "",
      series_candidates: seriesNames,
      series_wikidata_ids: seriesIds,
      wikidata_relations: {
        series: seriesIds,
        previous: previousIds,
        next: nextIds,
        based_on: basedOnIds
      }
    }
  }, language);
}

async function fetchWikidataBooks(query = "", language = "ru") {
  try {
    const ids = await fetchWikidataSearch(query);
    const entities = await fetchWikidataEntities(ids);
    const filtered = entities.filter(isLikelyBookEntity);

    const relatedIds = uniqueArray(
      filtered.flatMap((entity) => [
        ...getClaimEntityIds(entity, ["P50"]),
        ...getClaimEntityIds(entity, ["P179", "P361"])
      ])
    );

    const labelMap = await fetchWikidataLabels(relatedIds);

    return dedupeBooks(
      filtered
        .map((entity) => mapWikidataEntity(entity, language, labelMap))
        .filter(Boolean)
    );
  } catch (error) {
    console.warn("Wikidata books search failed:", error);
    return [];
  }
}

async function fetchOpenLibraryByTitle(query = "") {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return [];

  const url = new URL("https://openlibrary.org/search.json");

  url.searchParams.set("title", cleanQuery);
  url.searchParams.set("limit", String(OPEN_LIBRARY_LIMIT));
  url.searchParams.set("fields", [
    "key",
    "title",
    "subtitle",
    "alternative_title",
    "author_name",
    "author_key",
    "first_publish_year",
    "cover_i",
    "subject",
    "person",
    "place",
    "time"
  ].join(","));

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Open Library title failed: ${response.status}`);
  }

  const payload = await response.json();
  return safeArray(payload?.docs);
}

function extractOpenLibrarySeriesName(doc = {}) {
  const subjectPool = [
    ...safeArray(doc?.subject),
    ...safeArray(doc?.person),
    ...safeArray(doc?.place),
    ...safeArray(doc?.time)
  ];

  const subjects = subjectPool.map((value) => String(value || "").trim()).filter(Boolean);

  return subjects.find((value) =>
    /(book series|книжн(ая|ой) серия|цикл|series)/i.test(value)
  ) || "";
}

function mapOpenLibraryDoc(doc = {}, language = "ru") {
  const sourceTitle = String(doc?.title || "").trim();

  if (isNoisyOpenLibraryTitle(sourceTitle)) {
    return null;
  }

  const workKey = normalizeOpenLibraryWorkKey(doc?.key || "");
  const alternatives = uniqueArray(safeArray(doc?.alternative_title).map(String).filter(Boolean));
  const ruAlternative = alternatives.find((value) => hasCyrillic(value)) || "";
  const authors = uniqueArray(safeArray(doc?.author_name).map(String).filter(Boolean));

  const titleRu = hasCyrillic(sourceTitle) ? sourceTitle : ruAlternative;
  const titleEn = sourceTitle;

  const title = language === "en"
    ? (titleEn || titleRu || sourceTitle)
    : (titleRu || titleEn || sourceTitle);

  if (!title) return null;

  const seriesName = extractOpenLibrarySeriesName(doc);

  return normalizeBookItem({
    title,
    title_ru: titleRu,
    title_en: titleEn,
    original_title: sourceTitle,
    year: doc?.first_publish_year || null,
    cover_url: buildOpenLibraryCover(doc),
    description_ru: "",
    description_en: "",
    aliases: uniqueArray([
      sourceTitle,
      ...alternatives,
      doc?.subtitle,
      ...authors
    ].map((value) => String(value || "").trim()).filter(Boolean)),
    external_ids: {
      openlibrary_work: workKey || null
    },
    primary_source: "openlibrary",
    score: 150,
    meta: {
      source: "openlibrary",
      openlibrary_work: workKey || null,
      openlibrary_cover_i: doc?.cover_i || null,
      author_names: authors,
      author_keys: uniqueArray(safeArray(doc?.author_key).map(String).filter(Boolean)),
      series_name: seriesName,
      series_candidates: uniqueArray([seriesName].filter(Boolean))
    }
  }, language);
}

async function fetchOpenLibraryBooks(query = "", wikidataItems = [], language = "ru") {
  const titleQueries = uniqueArray([
    query,
    ...safeArray(wikidataItems).flatMap((item) => [
      item.title,
      item.title_ru,
      item.title_en,
      item.original_title
    ])
  ].map((value) => String(value || "").trim()).filter(Boolean)).slice(0, 4);

  const titleResults = await Promise.allSettled(
    titleQueries.map((value) => fetchOpenLibraryByTitle(value))
  );

  return dedupeBooks([
    ...titleResults.flatMap((result) => result.status === "fulfilled" ? result.value : [])
  ].map((doc) => mapOpenLibraryDoc(doc, language)).filter(Boolean));
}

function hasSharedTitle(a = {}, b = {}) {
  const aTitles = new Set(getTitleKeys(a));
  return getTitleKeys(b).some((title) => aTitles.has(title));
}

function hasSharedAuthor(a = {}, b = {}) {
  const aAuthors = new Set(getBookAuthors(a).map(compactString).filter(Boolean));
  return getBookAuthors(b).some((author) => aAuthors.has(compactString(author)));
}

function hasSharedSeries(a = {}, b = {}) {
  const aSeries = compactString(a?.meta?.series_name || "");
  const bSeries = compactString(b?.meta?.series_name || "");
  return Boolean(aSeries && bSeries && aSeries === bSeries);
}

function areSameBook(a = {}, b = {}) {
  if (a.category !== "books" || b.category !== "books") return false;

  const aWikidata = String(a?.external_ids?.wikidata || "").trim();
  const bWikidata = String(b?.external_ids?.wikidata || "").trim();

  if (aWikidata && bWikidata && aWikidata === bWikidata) return true;
  if (hasSharedTitle(a, b) && hasSharedAuthor(a, b)) return true;
  if (hasSharedTitle(a, b) && hasSharedSeries(a, b)) return true;

  return false;
}

function pickBestCover(existing = "", incoming = "") {
  const current = String(existing || "").trim();
  const next = String(incoming || "").trim();

  if (!current) return next;
  if (!next) return current;

  const currentIsPlaceholder = current === PLACEHOLDER_COVER_URL;
  const nextIsPlaceholder = next === PLACEHOLDER_COVER_URL;

  if (currentIsPlaceholder && !nextIsPlaceholder) return next;

  return current;
}

function mergeBookItems(existing = {}, incoming = {}) {
  const existingIds = existing.external_ids || {};
  const incomingIds = incoming.external_ids || {};
  const existingMeta = existing.meta && typeof existing.meta === "object" ? existing.meta : {};
  const incomingMeta = incoming.meta && typeof incoming.meta === "object" ? incoming.meta : {};

  const wikidataId = existingIds.wikidata || incomingIds.wikidata || null;
  const title = pickBetterText(existing.title, incoming.title);

  const wikidataItem = existingIds.wikidata ? existing : incomingIds.wikidata ? incoming : null;
  const resolvedAuthors = wikidataItem ? getBookAuthors(wikidataItem) : uniqueArray([
    ...getBookAuthors(existing),
    ...getBookAuthors(incoming)
  ]);

  return normalizeBookItem({
    ...existing,
    ...incoming,
    canonical_key: wikidataId
      ? `books:wikidata:${wikidataId}`
      : `books:work:${normalizeWorkKey(title, resolvedAuthors[0] || "")}`,
    title,
    title_ru: pickBetterText(existing.title_ru, incoming.title_ru),
    title_en: pickBetterText(existing.title_en, incoming.title_en),
    original_title: pickBetterText(existing.original_title, incoming.original_title),
    year: existing.year || incoming.year || null,
    cover_url: pickBestCover(existing.cover_url, incoming.cover_url),
    description_ru: pickBetterText(existing.description_ru, incoming.description_ru),
    description_en: pickBetterText(existing.description_en, incoming.description_en),
    aliases: uniqueArray([
      ...safeArray(existing.aliases),
      ...safeArray(incoming.aliases)
    ]),
    external_ids: {
      wikidata: wikidataId,
      openlibrary_work: existingIds.openlibrary_work || incomingIds.openlibrary_work || null
    },
    primary_source: wikidataId ? "wikidata" : (existing.primary_source || incoming.primary_source || "merged"),
    score: Math.max(existing.score || 0, incoming.score || 0),
    meta: {
      ...(incomingMeta || {}),
      ...(existingMeta || {}),
      author_names: resolvedAuthors,
      series_name: existingMeta.series_name || incomingMeta.series_name || "",
      series_candidates: uniqueArray([
        ...safeArray(existingMeta.series_candidates),
        ...safeArray(incomingMeta.series_candidates)
      ]),
      wikidata_relations: {
        ...(existingMeta.wikidata_relations && typeof existingMeta.wikidata_relations === "object" ? existingMeta.wikidata_relations : {}),
        ...(incomingMeta.wikidata_relations && typeof incomingMeta.wikidata_relations === "object" ? incomingMeta.wikidata_relations : {})
      }
    }
  });
}

function dedupeBooks(items = []) {
  const result = [];

  safeArray(items).filter(Boolean).forEach((item) => {
    const normalized = normalizeBookItem(item);
    if (!normalized) return;

    const existingIndex = result.findIndex((candidate) => areSameBook(candidate, normalized));

    if (existingIndex >= 0) {
      result[existingIndex] = mergeBookItems(result[existingIndex], normalized);
    } else {
      result.push(normalized);
    }
  });

  return result;
}

function enrichWikidataWithOpenLibrary(wikidataItems = [], openLibraryItems = []) {
  return safeArray(wikidataItems).map((wikidataItem) => {
    const match = safeArray(openLibraryItems).find((openLibraryItem) =>
      areSameBook(wikidataItem, openLibraryItem)
    );

    if (!match) return wikidataItem;

    return mergeBookItems(wikidataItem, {
      ...match,
      title: wikidataItem.title,
      title_ru: wikidataItem.title_ru,
      title_en: wikidataItem.title_en,
      original_title: wikidataItem.original_title,
      description_ru: wikidataItem.description_ru,
      description_en: wikidataItem.description_en,
      meta: {
        ...(match.meta || {}),
        ...(wikidataItem.meta || {})
      }
    });
  });
}

function sortBooksForQuery(query = "", items = [], language = "ru") {
  const cleanQuery = cleanTitle(query);
  const queryIsRu = hasCyrillic(query);

  return [...safeArray(items)].sort((a, b) => {
    const aHasRu = hasCyrillic(a.title_ru || a.title || "");
    const bHasRu = hasCyrillic(b.title_ru || b.title || "");

    if (queryIsRu && aHasRu !== bHasRu) {
      return aHasRu ? -1 : 1;
    }

    const aExact = getTitleKeys(a).some((title) => title === cleanQuery);
    const bExact = getTitleKeys(b).some((title) => title === cleanQuery);

    if (aExact !== bExact) return aExact ? -1 : 1;

    return (b.score || 0) - (a.score || 0);
  });
}

function mergeBookSources(query = "", saved = [], wikidata = [], openLibrary = [], language = "ru") {
  const cleanSaved = dedupeBooks(saved);
  const cleanWikidata = dedupeBooks(wikidata);
  const cleanOpenLibrary = dedupeBooks(openLibrary).filter((item) => !isNoisyOpenLibraryTitle(item.title || item.original_title));

  if (cleanWikidata.length) {
    const enrichedWikidata = enrichWikidataWithOpenLibrary(cleanWikidata, cleanOpenLibrary);
    return sortBooksForQuery(query, dedupeBooks([...cleanSaved, ...enrichedWikidata]), language);
  }

  return sortBooksForQuery(query, dedupeBooks([...cleanSaved, ...cleanOpenLibrary]), language);
}

export async function runBooksSearch(query = "", options = {}) {
  const cleanQuery = String(query || "").trim();
  const language = options.language || "ru";

  if (cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  const saved = await fetchBooksFromSupabase(cleanQuery, language);
  const wikidata = await fetchWikidataBooks(cleanQuery, language);
  const openLibrary = await fetchOpenLibraryBooks(cleanQuery, wikidata, language);

  return mergeBookSources(cleanQuery, saved, wikidata, openLibrary, language);
}
