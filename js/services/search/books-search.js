import { SEARCH_LIMITS } from "../../config.js";
import { compactString, normalizeString, safeArray, uniqueArray } from "../../utils.js";
import { getSupabaseClient, withTimeout } from "../../lib/supabase-client.js";

const SEARCH_TIMEOUT_MS = 9000;
const SUPABASE_SEARCH_TIMEOUT_MS = 6000;
const WIKIDATA_LIMIT = 14;
const OPEN_LIBRARY_LIMIT = 18;

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

function clean(value = "") {
  return String(value || "").trim();
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
  ].map(clean).filter(Boolean));
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
  const existing = clean(existingValue);
  const incoming = clean(incomingValue);

  if (!existing) return incoming;
  if (!incoming) return existing;

  return incoming.length > existing.length ? incoming : existing;
}

function pickTitleByLanguage(row = {}, language = "ru") {
  const titleRu = clean(row.title_ru);
  const titleEn = clean(row.title_en);
  const originalTitle = clean(row.original_title || row.title_primary || titleEn || titleRu);

  if (language === "en") {
    return titleEn || titleRu || originalTitle;
  }

  return titleRu || titleEn || originalTitle;
}

function wikimediaFileUrl(filename = "") {
  const value = clean(filename);
  if (!value) return "";
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(value)}`;
}

function openLibraryCoverUrlFromId(coverId) {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : "";
}

function buildOpenLibraryCover(doc = {}) {
  return doc.cover_i ? openLibraryCoverUrlFromId(doc.cover_i) : "";
}

function normalizeOpenLibraryWorkKey(value = "") {
  const raw = clean(value);
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

  const wikidataId = clean(ids.wikidata);
  const openLibraryWork = normalizeOpenLibraryWorkKey(ids.openlibrary_work || ids.openlibrary || raw.openlibrary_work || "");

  const authors = uniqueArray([
    ...safeArray(raw?.meta?.author_names),
    ...safeArray(raw?.authors),
    ...safeArray(raw?.author_names)
  ].map(clean).filter(Boolean));

  const title =
    clean(raw.title) ||
    pickTitleByLanguage(raw, language) ||
    clean(raw.original_title);

  if (!title) return null;

  const canonicalKey = wikidataId
    ? `books:wikidata:${wikidataId}`
    : `books:work:${normalizeWorkKey(title, authors[0] || "")}`;

  const titleRu = clean(raw.title_ru);
  const titleEn = clean(raw.title_en);
  const descriptionRu = clean(raw.description_ru || raw?.meta?.description_ru || "");
  const descriptionEn = clean(raw.description_en || raw?.meta?.description_en || raw?.meta?.synopsis || "");

  return {
    canonical_key: canonicalKey,
    category: "books",

    title,
    title_primary: language === "en"
      ? titleEn || titleRu || title
      : titleRu || titleEn || title,
    title_ru: titleRu,
    title_en: titleEn,
    original_title: clean(raw.original_title || titleEn || titleRu || title),

    year: safeYear(raw.year),
    cover_url: clean(raw.cover_url),

    description_ru: descriptionRu,
    description_en: descriptionEn,

    aliases: uniqueArray(safeArray(raw.aliases).map(clean).filter(Boolean)),

    external_ids: {
      wikidata: wikidataId || null,
      openlibrary_work: openLibraryWork || null
    },

    primary_source: clean(raw.primary_source || raw.source || ""),
    score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0,

    meta: {
      ...(raw.meta && typeof raw.meta === "object" ? raw.meta : {}),
      source: clean(raw.primary_source || raw.source || raw?.meta?.source || ""),
      author_names: authors,
      metadata_status:
        raw.cover_url && (descriptionRu || descriptionEn)
          ? "partial"
          : "needs_enrichment"
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
  ].map(clean).filter(Boolean));

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
  const cleanQuery = clean(query);
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
      aliasByEntityId.get(row.entity_id).push(clean(row.alias));
    });

    return dedupeBooks(
      [...safeArray(entities), ...aliasEntities]
        .map((row) => mapSupabaseBookRow({
          ...row,
          aliases: aliasByEntityId.get(row.id) || []
        }, language))
        .filter(Boolean),
      language
    );
  } catch (error) {
    console.warn("Books Supabase search skipped:", error);
    return [];
  }
}

async function fetchWikidataSearch(query = "") {
  const cleanQuery = clean(query);
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
  const cleanIds = uniqueArray(safeArray(ids).map(clean).filter(Boolean));
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
  const time = clean(value?.time);
  if (!time) return null;

  const match = time.match(/[+-]?(\d{4})/);
  if (!match) return null;

  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

async function fetchWikidataLabels(ids = []) {
  const cleanIds = uniqueArray(safeArray(ids).map(clean).filter(Boolean)).slice(0, 20);
  if (!cleanIds.length) return new Map();

  try {
    const entities = await fetchWikidataEntities(cleanIds);
    const map = new Map();

    entities.forEach((entity) => {
      const id = clean(entity?.id);
      if (!id || id === "-1") return;

      map.set(id, {
        ru: clean(entity?.labels?.ru?.value),
        en: clean(entity?.labels?.en?.value)
      });
    });

    return map;
  } catch (error) {
    console.warn("Wikidata label fetch failed:", error);
    return new Map();
  }
}

function mapWikidataEntity(entity = {}, language = "ru", labelMap = new Map()) {
  const wikidataId = clean(entity?.id);
  if (!wikidataId || wikidataId === "-1") return null;
  if (!isLikelyBookEntity(entity)) return null;

  const titleRu = clean(entity?.labels?.ru?.value);
  const titleEn = clean(entity?.labels?.en?.value);
  const descriptionRu = clean(entity?.descriptions?.ru?.value);
  const descriptionEn = clean(entity?.descriptions?.en?.value);

  const aliasesRu = safeArray(entity?.aliases?.ru).map((row) => row?.value).filter(Boolean);
  const aliasesEn = safeArray(entity?.aliases?.en).map((row) => row?.value).filter(Boolean);

  const title = language === "en"
    ? titleEn || titleRu
    : titleRu || titleEn;

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
        .filter(Boolean),
      language
    );
  } catch (error) {
    console.warn("Wikidata books search failed:", error);
    return [];
  }
}

async function fetchOpenLibraryByTitle(query = "") {
  const cleanQuery = clean(query);
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

async function fetchOpenLibraryWorkDescription(workKey = "") {
  const cleanWorkKey = normalizeOpenLibraryWorkKey(workKey);
  if (!cleanWorkKey) return "";

  try {
    const response = await fetchWithTimeout(`https://openlibrary.org/works/${encodeURIComponent(cleanWorkKey)}.json`, {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) return "";

    const payload = await response.json();
    return typeof payload.description === "string"
      ? clean(payload.description)
      : clean(payload.description?.value);
  } catch {
    return "";
  }
}

function extractOpenLibrarySeriesName(doc = {}) {
  const subjectPool = [
    ...safeArray(doc?.subject),
    ...safeArray(doc?.person),
    ...safeArray(doc?.place),
    ...safeArray(doc?.time)
  ];

  const subjects = subjectPool.map(clean).filter(Boolean);

  return subjects.find((value) =>
    /(book series|книжн(ая|ой) серия|цикл|series)/i.test(value)
  ) || "";
}

async function mapOpenLibraryDoc(doc = {}, language = "ru") {
  const sourceTitle = clean(doc?.title);

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
    ? titleEn || titleRu || sourceTitle
    : titleRu || titleEn || sourceTitle;

  if (!title) return null;

  const seriesName = extractOpenLibrarySeriesName(doc);
  const descriptionEn = await fetchOpenLibraryWorkDescription(workKey);

  return normalizeBookItem({
    title,
    title_ru: titleRu,
    title_en: titleEn,
    original_title: sourceTitle,
    year: doc?.first_publish_year || null,
    cover_url: buildOpenLibraryCover(doc),
    description_ru: "",
    description_en: descriptionEn,
    aliases: uniqueArray([
      sourceTitle,
      ...alternatives,
      doc?.subtitle,
      ...authors
    ].map(clean).filter(Boolean)),
    external_ids: {
      openlibrary_work: workKey || null
    },
    primary_source: "openlibrary",
    score: descriptionEn ? 190 : 150,
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
  ].map(clean).filter(Boolean)).slice(0, 4);

  const titleResults = await Promise.allSettled(
    titleQueries.map((value) => fetchOpenLibraryByTitle(value))
  );

  const docs = titleResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const mapped = await Promise.all(docs.map((doc) => mapOpenLibraryDoc(doc, language)));

  return dedupeBooks(mapped.filter(Boolean), language);
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

  const aWikidata = clean(a?.external_ids?.wikidata);
  const bWikidata = clean(b?.external_ids?.wikidata);
  const aOpenLibrary = clean(a?.external_ids?.openlibrary_work);
  const bOpenLibrary = clean(b?.external_ids?.openlibrary_work);

  if (aWikidata && bWikidata && aWikidata === bWikidata) return true;
  if (aOpenLibrary && bOpenLibrary && aOpenLibrary === bOpenLibrary) return true;
  if (hasSharedTitle(a, b) && hasSharedAuthor(a, b)) return true;
  if (hasSharedTitle(a, b) && hasSharedSeries(a, b)) return true;

  return false;
}

function pickBestCover(existing = "", incoming = "") {
  const current = clean(existing);
  const next = clean(incoming);

  if (!current) return next;
  if (!next) return current;
  if (current === "/placeholder.jpg" && next !== "/placeholder.jpg") return next;

  return current;
}

function mergeBookItems(existing = {}, incoming = {}, language = "ru") {
  const existingIds = existing.external_ids || {};
  const incomingIds = incoming.external_ids || {};
  const existingMeta = existing.meta && typeof existing.meta === "object" ? existing.meta : {};
  const incomingMeta = incoming.meta && typeof incoming.meta === "object" ? incoming.meta : {};

  const wikidataId = existingIds.wikidata || incomingIds.wikidata || null;
  const title = pickBetterText(existing.title, incoming.title);

  const resolvedAuthors = uniqueArray([
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
      ...incomingMeta,
      ...existingMeta,
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
  }, language);
}

function dedupeBooks(items = [], language = "ru") {
  const result = [];

  safeArray(items).filter(Boolean).forEach((item) => {
    const normalized = normalizeBookItem(item, language);
    if (!normalized) return;

    const existingIndex = result.findIndex((candidate) => areSameBook(candidate, normalized));

    if (existingIndex >= 0) {
      result[existingIndex] = mergeBookItems(result[existingIndex], normalized, language);
    } else {
      result.push(normalized);
    }
  });

  return result;
}

function enrichWikidataWithOpenLibrary(wikidataItems = [], openLibraryItems = [], language = "ru") {
  return safeArray(wikidataItems).map((wikidataItem) => {
    const match = safeArray(openLibraryItems).find((openLibraryItem) =>
      areSameBook(wikidataItem, openLibraryItem)
    );

    if (!match) return wikidataItem;
    return mergeBookItems(wikidataItem, match, language);
  });
}

function scoreBookResult(item = {}, query = "") {
  const q = compactString(query);
  const titles = getTitleKeys(item).map(compactString);
  const authors = getBookAuthors(item).map(compactString);

  let score = Number(item.score || 0);

  if (titles.some((title) => title === q)) score += 250;
  if (titles.some((title) => title.includes(q))) score += 120;
  if (authors.some((author) => author.includes(q))) score += 40;
  if (item.cover_url) score += 25;
  if (item.description_ru || item.description_en) score += 20;
  if (item.external_ids?.wikidata) score += 80;
  if (item.external_ids?.openlibrary_work) score += 35;
  if (item.meta?.author_names?.length) score += 20;
  if (item.meta?.series_name) score += 10;

  return score;
}

export async function runBooksSearch(query = "", options = {}) {
  const cleanQuery = clean(query);
  const language = options.language === "en" ? "en" : "ru";

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  const [supabaseItems, wikidataItems] = await Promise.all([
    fetchBooksFromSupabase(cleanQuery, language),
    fetchWikidataBooks(cleanQuery, language)
  ]);

  const openLibraryItems = await fetchOpenLibraryBooks(cleanQuery, wikidataItems, language);

  const enrichedWikidataItems = enrichWikidataWithOpenLibrary(
    wikidataItems,
    openLibraryItems,
    language
  );

  return dedupeBooks(
    [
      ...supabaseItems,
      ...enrichedWikidataItems,
      ...openLibraryItems
    ],
    language
  )
    .map((item) => ({
      ...item,
      score: scoreBookResult(item, cleanQuery)
    }))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, options.global ? SEARCH_LIMITS.MODAL_RESULTS : SEARCH_LIMITS.PAGE_RESULTS);
}
