import { SEARCH_LIMITS } from "../../config.js";
import { compactString, normalizeString, safeArray, uniqueArray } from "../../utils.js";
import { getSupabaseClient, withTimeout } from "../../lib/supabase-client.js";

const SEARCH_TIMEOUT_MS = 9000;
const SUPABASE_SEARCH_TIMEOUT_MS = 6000;
const WIKIDATA_LIMIT = 14;
const OPEN_LIBRARY_LIMIT_MODAL = 18;
const OPEN_LIBRARY_LIMIT_PAGE = 60;

const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";
const OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";

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

const WIKIDATA_SERIES_TYPES = new Set([
  "Q277759",
  "Q7725310",
  "Q47461344"
]);

const WIKIDATA_AUTHOR_TYPES = new Set([
  "Q5"
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

function clean(value = "") {
  return String(value || "").trim();
}

function cleanLower(value = "") {
  return clean(value).toLowerCase();
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
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

function hasCyrillic(value = "") {
  return /[А-Яа-яЁёІіЇїЄє]/.test(String(value || ""));
}

function safeYear(value) {
  if (value === null || value === undefined || value === "") return null;
  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function getYearFromWikidataTime(value) {
  const time = clean(value?.time);
  if (!time) return null;

  const match = time.match(/[+-]?(\d{4})/);
  if (!match) return null;

  const year = Number(match[1]);
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
    .replace(/\bvol\b/g, "")
    .replace(/\bcomplete\b/g, "")
    .replace(/\bseries\b/g, "")
    .replace(/\bset\b/g, "")
    .replace(/\bbox\b/g, "")
    .replace(/\bboxed\b/g, "")
    .replace(/\bcollection\b/g, "")
    .replace(/\bomnibus\b/g, "")
    .replace(/\bsummary\b/g, "")
    .replace(/\bguide\b/g, "")
    .replace(/\bworkbook\b/g, "")
    .replace(/\bcompanion\b/g, "")
    .replace(/\banalysis\b/g, "")
    .replace(/\bcriticism\b/g, "")
    .replace(/\binterpretation\b/g, "")
    .replace(/\binterpretations\b/g, "")
    .replace(/\bdramatization\b/g, "")
    .replace(/\badaptation\b/g, "")
    .replace(/\bsparknotes\b/g, "")
    .replace(/\bcliffsnotes\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBookTitleKey(value = "") {
  return compactString(cleanTitle(value))
    .replace(/ё/g, "е")
    .replace(/^the/, "")
    .replace(/^a/, "")
    .replace(/^an/, "");
}

function normalizePersonKey(value = "") {
  return compactString(value)
    .replace(/ё/g, "е")
    .replace(/[^a-z0-9а-яе]/gi, "");
}

function normalizeOpenLibraryWorkKey(value = "") {
  const raw = clean(value);
  if (!raw) return "";
  return raw.startsWith("/works/") ? raw.replace("/works/", "") : raw;
}

function normalizeWorkKey(title = "", author = "", year = "") {
  const titlePart = normalizeBookTitleKey(title || "unknown");
  const authorPart = normalizePersonKey(author || "");
  const yearPart = safeYear(year) || "";
  return [titlePart, authorPart, yearPart].filter(Boolean).join(":") || "unknown";
}

function openLibraryCoverUrlFromId(coverId) {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : "";
}

function wikimediaFileUrl(filename = "") {
  const value = clean(filename);
  if (!value) return "";
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(value)}`;
}

function getBookAuthors(item = {}) {
  return uniqueArray([
    ...safeArray(item?.meta?.author_names),
    ...safeArray(item?.meta?.authors),
    ...safeArray(item?.authors),
    ...safeArray(item?.author_names)
  ].map(clean).filter(Boolean));
}

function getBookSeries(item = {}) {
  return clean(item?.meta?.series_name || item?.series_name || item?.series || "");
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
    .map(normalizeBookTitleKey)
    .filter(Boolean);
}

function getBestTitle(item = {}, language = "ru") {
  if (language === "en") {
    return clean(item.title_en || item.title || item.title_primary || item.title_ru || item.original_title);
  }

  return clean(item.title_ru || item.title || item.title_primary || item.title_en || item.original_title);
}

function pickBetterText(existingValue = "", incomingValue = "") {
  const existing = clean(existingValue);
  const incoming = clean(incomingValue);

  if (!existing) return incoming;
  if (!incoming) return existing;

  return incoming.length > existing.length ? incoming : existing;
}

function pickBestCover(existing = "", incoming = "") {
  const current = clean(existing);
  const next = clean(incoming);

  if (!current) return next;
  if (!next) return current;
  if (current === "/placeholder.jpg" && next !== "/placeholder.jpg") return next;

  return current;
}

function pickTitleByLanguage(row = {}, language = "ru") {
  const titleRu = clean(row.title_ru);
  const titleEn = clean(row.title_en);
  const originalTitle = clean(row.original_title || row.title_primary || titleEn || titleRu);

  if (language === "en") return titleEn || titleRu || originalTitle;
  return titleRu || titleEn || originalTitle;
}

function isNoisyTitle(title = "") {
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
    "criticism",
    "interpretation",
    "interpretations",
    "dramatization",
    "adaptation",
    "set of",
    "books",
    "sparknotes",
    "cliffsnotes",
    "lesson plans",
    "teacher guide",
    "student guide",
    "literary criticism"
  ].some((pattern) => text.includes(pattern));
}

function buildCanonicalKey(item = {}) {
  const ids = item.external_ids || {};
  const wikidataId = clean(ids.wikidata);
  const openLibraryWork = normalizeOpenLibraryWorkKey(ids.openlibrary_work || ids.openlibrary || "");

  if (wikidataId) return `books:wikidata:${wikidataId}`;
  if (openLibraryWork) return `books:openlibrary:${openLibraryWork}`;

  const title = getBestTitle(item, "ru") || getBestTitle(item, "en") || item.title;
  const authors = getBookAuthors(item);

  return `books:work:${normalizeWorkKey(title, authors[0] || "", item.year)}`;
}

function buildBookIdentityKeys(item = {}) {
  const ids = item.external_ids || {};
  const wikidataId = clean(ids.wikidata);
  const openLibraryWork = normalizeOpenLibraryWorkKey(ids.openlibrary_work || ids.openlibrary || "");
  const titles = getTitleKeys(item);
  const authors = getBookAuthors(item).map(normalizePersonKey).filter(Boolean);
  const series = normalizeBookTitleKey(getBookSeries(item));
  const year = safeYear(item.year);

  const keys = [];

  if (wikidataId) keys.push(`wikidata:${wikidataId}`);
  if (openLibraryWork) keys.push(`openlibrary:${openLibraryWork}`);

  titles.forEach((title) => {
    authors.forEach((author) => {
      keys.push(`title-author:${title}:${author}`);
      if (year) keys.push(`title-author-year:${title}:${author}:${year}`);
    });

    if (year) keys.push(`title-year:${title}:${year}`);
    if (series) keys.push(`title-series:${title}:${series}`);
  });

  return uniqueArray(keys.filter(Boolean));
}

function normalizeBookItem(raw = {}, language = "ru") {
  const ids = raw.external_ids && typeof raw.external_ids === "object" ? raw.external_ids : {};
  const wikidataId = clean(ids.wikidata);
  const openLibraryWork = normalizeOpenLibraryWorkKey(ids.openlibrary_work || ids.openlibrary || raw.openlibrary_work || "");

  const authors = uniqueArray([
    ...safeArray(raw?.meta?.author_names),
    ...safeArray(raw?.authors),
    ...safeArray(raw?.author_names)
  ].map(clean).filter(Boolean));

  const title = clean(raw.title) || pickTitleByLanguage(raw, language) || clean(raw.original_title);

  if (!title) return null;
  if (isNoisyTitle(title) && !wikidataId) return null;

  const titleRu = clean(raw.title_ru);
  const titleEn = clean(raw.title_en);
  const descriptionRu = clean(raw.description_ru || raw?.meta?.description_ru || "");
  const descriptionEn = clean(raw.description_en || raw?.meta?.description_en || raw?.meta?.synopsis || "");

  const base = {
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

  return {
    ...base,
    canonical_key: buildCanonicalKey(base),
    identity_keys: buildBookIdentityKeys(base)
  };
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

function getEntityTypeIds(entity = {}) {
  return getClaimEntityIds(entity, ["P31", "P279", "P136"]);
}

function isLikelyAuthorEntity(entity = {}) {
  const id = clean(entity?.id);
  if (!id || id === "-1") return false;

  const typeIds = getClaimEntityIds(entity, ["P31"]);
  const description = [
    entity?.descriptions?.ru?.value,
    entity?.descriptions?.en?.value
  ].map((value) => String(value || "").toLowerCase()).join(" ");

  const hasHumanType = typeIds.some((typeId) => WIKIDATA_AUTHOR_TYPES.has(typeId));
  const looksLikeWriter = [
    "writer",
    "author",
    "novelist",
    "poet",
    "playwright",
    "писатель",
    "писательница",
    "автор",
    "романист",
    "поэт",
    "драматург"
  ].some((word) => description.includes(word));

  return hasHumanType && looksLikeWriter;
}

function isLikelySeriesEntity(entity = {}) {
  const id = clean(entity?.id);
  if (!id || id === "-1") return false;

  const typeIds = getEntityTypeIds(entity);
  const description = [
    entity?.descriptions?.ru?.value,
    entity?.descriptions?.en?.value
  ].map((value) => String(value || "").toLowerCase()).join(" ");

  if (typeIds.some((typeId) => WIKIDATA_SERIES_TYPES.has(typeId))) return true;

  return [
    "book series",
    "novel series",
    "literary series",
    "серия книг",
    "книжная серия",
    "цикл романов",
    "литературный цикл"
  ].some((word) => description.includes(word));
}

function isLikelyBookEntity(entity = {}) {
  const id = clean(entity?.id);
  if (!id || id === "-1") return false;

  if (isLikelyAuthorEntity(entity)) return false;
  if (isLikelySeriesEntity(entity)) return false;

  const typeIds = getEntityTypeIds(entity);

  if (typeIds.some((typeId) => WIKIDATA_NOT_BOOK_TYPES.has(typeId))) return false;
  if (typeIds.some((typeId) => WIKIDATA_BOOK_TYPES.has(typeId))) return true;

  const description = [
    entity?.descriptions?.ru?.value,
    entity?.descriptions?.en?.value
  ].map((value) => String(value || "").toLowerCase()).join(" ");

  const labels = [
    entity?.labels?.ru?.value,
    entity?.labels?.en?.value
  ].map((value) => String(value || "").toLowerCase()).join(" ");

  if (description.includes("fictional character") || description.includes("персонаж")) return false;
  if (labels.includes("harry potter") && description.includes("character")) return false;

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

async function fetchWikidataSearch(query = "") {
  const cleanQuery = clean(query);
  if (!cleanQuery) return [];

  const runSearch = async (language = "ru") => {
    const url = new URL(WIKIDATA_API_URL);

    url.searchParams.set("action", "wbsearchentities");
    url.searchParams.set("format", "json");
    url.searchParams.set("language", language);
    url.searchParams.set("uselang", language);
    url.searchParams.set("type", "item");
    url.searchParams.set("origin", "*");
    url.searchParams.set("limit", String(WIKIDATA_LIMIT));
    url.searchParams.set("search", cleanQuery);

    const payload = await fetchJson(url.toString(), {
      headers: { Accept: "application/json" }
    });

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

  const url = new URL(WIKIDATA_API_URL);

  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("props", "labels|aliases|descriptions|claims");
  url.searchParams.set("languages", "ru|en");
  url.searchParams.set("ids", cleanIds.join("|"));

  const payload = await fetchJson(url.toString(), {
    headers: { Accept: "application/json" }
  });

  return Object.values(payload?.entities || {});
}

async function fetchWikidataLabels(ids = []) {
  const cleanIds = uniqueArray(safeArray(ids).map(clean).filter(Boolean)).slice(0, 80);
  if (!cleanIds.length) return new Map();

  try {
    const chunks = [];

    for (let i = 0; i < cleanIds.length; i += 40) {
      chunks.push(cleanIds.slice(i, i + 40));
    }

    const results = await Promise.allSettled(chunks.map((chunk) => fetchWikidataEntities(chunk)));
    const entities = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
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

  const title = language === "en" ? titleEn || titleRu : titleRu || titleEn;
  if (!title) return null;

  const authorIds = getClaimEntityIds(entity, ["P50"]);
  const authorNames = uniqueArray(
    authorIds.flatMap((id) => {
      const labels = labelMap.get(id) || {};
      return language === "en" ? [labels.en, labels.ru] : [labels.ru, labels.en];
    }).filter(Boolean)
  );

  const seriesIds = getClaimEntityIds(entity, ["P179", "P361"]);
  const seriesNames = uniqueArray(
    seriesIds.flatMap((id) => {
      const labels = labelMap.get(id) || {};
      return language === "en" ? [labels.en, labels.ru] : [labels.ru, labels.en];
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
    aliases: uniqueArray([titleRu, titleEn, ...aliasesRu, ...aliasesEn].filter(Boolean)),
    external_ids: { wikidata: wikidataId },
    primary_source: "wikidata",
    score: 900,
    meta: {
      source: "wikidata",
      wikidata_labels: { ru: titleRu, en: titleEn },
      wikidata_aliases: { ru: aliasesRu, en: aliasesEn },
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

async function fetchWikidataRelatedWorkIdsForAuthor(authorId = "", limit = 80) {
  const cleanAuthorId = clean(authorId);
  if (!cleanAuthorId) return [];

  const sparql = `
    SELECT DISTINCT ?work WHERE {
      ?work wdt:P50 wd:${cleanAuthorId}.
      OPTIONAL { ?work wdt:P577 ?date. }
      OPTIONAL { ?work wdt:P18 ?image. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }
    }
    LIMIT ${Math.max(1, Math.min(Number(limit) || 80, 120))}
  `;

  const url = new URL(WIKIDATA_SPARQL_URL);
  url.searchParams.set("query", sparql);
  url.searchParams.set("format", "json");

  const payload = await fetchJson(url.toString(), {
    headers: {
      Accept: "application/sparql-results+json"
    }
  });

  return uniqueArray(
    safeArray(payload?.results?.bindings)
      .map((row) => clean(row?.work?.value).split("/").pop())
      .filter(Boolean)
  );
}

async function fetchWikidataRelatedWorkIdsForSeries(seriesId = "", limit = 80) {
  const cleanSeriesId = clean(seriesId);
  if (!cleanSeriesId) return [];

  const sparql = `
    SELECT DISTINCT ?work WHERE {
      {
        ?work wdt:P179 wd:${cleanSeriesId}.
      }
      UNION
      {
        ?work wdt:P361 wd:${cleanSeriesId}.
      }
      UNION
      {
        wd:${cleanSeriesId} wdt:P527 ?work.
      }
      OPTIONAL { ?work wdt:P577 ?date. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }
    }
    LIMIT ${Math.max(1, Math.min(Number(limit) || 80, 120))}
  `;

  const url = new URL(WIKIDATA_SPARQL_URL);
  url.searchParams.set("query", sparql);
  url.searchParams.set("format", "json");

  const payload = await fetchJson(url.toString(), {
    headers: {
      Accept: "application/sparql-results+json"
    }
  });

  return uniqueArray(
    safeArray(payload?.results?.bindings)
      .map((row) => clean(row?.work?.value).split("/").pop())
      .filter(Boolean)
  );
}

async function fetchWikidataBooksByIds(ids = [], language = "ru") {
  const cleanIds = uniqueArray(safeArray(ids).map(clean).filter(Boolean));
  if (!cleanIds.length) return [];

  const entities = await fetchWikidataEntities(cleanIds);
  const filtered = entities.filter(isLikelyBookEntity);

  const relatedIds = uniqueArray(
    filtered.flatMap((entity) => [
      ...getClaimEntityIds(entity, ["P50"]),
      ...getClaimEntityIds(entity, ["P179", "P361"])
    ])
  );

  const labelMap = await fetchWikidataLabels(relatedIds);

  return dedupeBooks(
    filtered.map((entity) => mapWikidataEntity(entity, language, labelMap)).filter(Boolean),
    language
  );
}

async function fetchWikidataBooksFromSearch(query = "", language = "ru") {
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
      filtered.map((entity) => mapWikidataEntity(entity, language, labelMap)).filter(Boolean),
      language
    );
  } catch (error) {
    console.warn("Wikidata books search failed:", error);
    return [];
  }
}

async function detectWikidataIntent(query = "", options = {}) {
  const cleanQuery = clean(query);
  const language = options.language === "en" ? "en" : "ru";
  const limit = options.global ? SEARCH_LIMITS.MODAL_RESULTS : SEARCH_LIMITS.PAGE_RESULTS;

  try {
    const ids = await fetchWikidataSearch(cleanQuery);
    const entities = await fetchWikidataEntities(ids);

    const authors = entities.filter(isLikelyAuthorEntity);
    const series = entities.filter(isLikelySeriesEntity);
    const books = entities.filter(isLikelyBookEntity);

    if (authors.length) {
      const author = authors[0];
      const authorId = clean(author.id);
      const workIds = await fetchWikidataRelatedWorkIdsForAuthor(
        authorId,
        options.global ? 30 : 100
      ).catch(() => []);

      const authorBooks = await fetchWikidataBooksByIds(workIds, language).catch(() => []);

      return {
        type: "author",
        entityId: authorId,
        entity,
        items: authorBooks.slice(0, limit)
      };
    }

    if (series.length) {
      const seriesEntity = series[0];
      const seriesId = clean(seriesEntity.id);
      const workIds = await fetchWikidataRelatedWorkIdsForSeries(
        seriesId,
        options.global ? 30 : 100
      ).catch(() => []);

      const seriesBooks = await fetchWikidataBooksByIds(workIds, language).catch(() => []);

      return {
        type: "series",
        entityId: seriesId,
        entity: seriesEntity,
        items: seriesBooks.slice(0, limit)
      };
    }

    if (books.length) {
      const labelMap = await fetchWikidataLabels(
        uniqueArray(
          books.flatMap((entity) => [
            ...getClaimEntityIds(entity, ["P50"]),
            ...getClaimEntityIds(entity, ["P179", "P361"])
          ])
        )
      );

      return {
        type: "book",
        entityId: clean(books[0]?.id),
        entity: books[0],
        items: dedupeBooks(
          books.map((entity) => mapWikidataEntity(entity, language, labelMap)).filter(Boolean),
          language
        ).slice(0, limit)
      };
    }
  } catch (error) {
    console.warn("Wikidata intent detection skipped:", error);
  }

  return {
    type: "unknown",
    entityId: "",
    entity: null,
    items: []
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

async function fetchOpenLibraryByTitle(query = "", limit = OPEN_LIBRARY_LIMIT_MODAL) {
  const cleanQuery = clean(query);
  if (!cleanQuery) return [];

  const url = new URL(OPEN_LIBRARY_SEARCH_URL);

  url.searchParams.set("title", cleanQuery);
  url.searchParams.set("limit", String(limit));
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

  const payload = await fetchJson(url.toString(), {
    headers: { Accept: "application/json" }
  });

  return safeArray(payload?.docs);
}

async function fetchOpenLibraryByAuthor(query = "", limit = OPEN_LIBRARY_LIMIT_PAGE) {
  const cleanQuery = clean(query);
  if (!cleanQuery) return [];

  const url = new URL(OPEN_LIBRARY_SEARCH_URL);

  url.searchParams.set("author", cleanQuery);
  url.searchParams.set("limit", String(limit));
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
    "time",
    "edition_count"
  ].join(","));

  const payload = await fetchJson(url.toString(), {
    headers: { Accept: "application/json" }
  });

  return safeArray(payload?.docs);
}

async function fetchOpenLibraryWorkDescription(workKey = "") {
  const cleanWorkKey = normalizeOpenLibraryWorkKey(workKey);
  if (!cleanWorkKey) return "";

  try {
    const payload = await fetchJson(`https://openlibrary.org/works/${encodeURIComponent(cleanWorkKey)}.json`, {
      headers: { Accept: "application/json" }
    });

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

  if (isNoisyTitle(sourceTitle)) return null;

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
    cover_url: doc.cover_i ? openLibraryCoverUrlFromId(doc.cover_i) : "",
    description_ru: "",
    description_en: descriptionEn,
    aliases: uniqueArray([sourceTitle, ...alternatives, doc?.subtitle, ...authors].map(clean).filter(Boolean)),
    external_ids: { openlibrary_work: workKey || null },
    primary_source: "openlibrary",
    score: Number(doc?.edition_count || 0) + (descriptionEn ? 190 : 150),
    meta: {
      source: "openlibrary",
      openlibrary_work: workKey || null,
      openlibrary_cover_i: doc?.cover_i || null,
      author_names: authors,
      author_keys: uniqueArray(safeArray(doc?.author_key).map(String).filter(Boolean)),
      series_name: seriesName,
      series_candidates: uniqueArray([seriesName].filter(Boolean)),
      edition_count: doc?.edition_count || null
    }
  }, language);
}

async function fetchOpenLibraryBooksByTitles(queries = [], language = "ru", limit = OPEN_LIBRARY_LIMIT_MODAL) {
  const titleQueries = uniqueArray(safeArray(queries).map(clean).filter(Boolean)).slice(0, 8);

  const titleResults = await Promise.allSettled(
    titleQueries.map((value) => fetchOpenLibraryByTitle(value, limit))
  );

  const docs = titleResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const mapped = await Promise.all(docs.map((doc) => mapOpenLibraryDoc(doc, language)));

  return dedupeBooks(mapped.filter(Boolean), language);
}

async function fetchOpenLibraryBooksByAuthor(query = "", language = "ru", limit = OPEN_LIBRARY_LIMIT_PAGE) {
  try {
    const docs = await fetchOpenLibraryByAuthor(query, limit);
    const mapped = await Promise.all(docs.map((doc) => mapOpenLibraryDoc(doc, language)));
    return dedupeBooks(mapped.filter(Boolean), language);
  } catch (error) {
    console.warn("Open Library author search skipped:", error);
    return [];
  }
}

function hasAnySharedIdentity(a = {}, b = {}) {
  const aKeys = new Set(buildBookIdentityKeys(a));
  return buildBookIdentityKeys(b).some((key) => aKeys.has(key));
}

function hasSharedTitle(a = {}, b = {}) {
  const aTitles = new Set(getTitleKeys(a));
  return getTitleKeys(b).some((title) => aTitles.has(title));
}

function hasSharedAuthor(a = {}, b = {}) {
  const aAuthors = new Set(getBookAuthors(a).map(normalizePersonKey).filter(Boolean));
  return getBookAuthors(b).some((author) => aAuthors.has(normalizePersonKey(author)));
}

function hasSharedSeries(a = {}, b = {}) {
  const aSeries = normalizeBookTitleKey(getBookSeries(a));
  const bSeries = normalizeBookTitleKey(getBookSeries(b));
  return Boolean(aSeries && bSeries && aSeries === bSeries);
}

function hasCloseYear(a = {}, b = {}) {
  const ay = safeYear(a.year);
  const by = safeYear(b.year);

  if (!ay || !by) return false;
  return Math.abs(ay - by) <= 1;
}

function areSameBook(a = {}, b = {}) {
  if (a.category !== "books" || b.category !== "books") return false;

  const aWikidata = clean(a?.external_ids?.wikidata);
  const bWikidata = clean(b?.external_ids?.wikidata);
  const aOpenLibrary = clean(a?.external_ids?.openlibrary_work);
  const bOpenLibrary = clean(b?.external_ids?.openlibrary_work);

  if (aWikidata && bWikidata && aWikidata === bWikidata) return true;
  if (aOpenLibrary && bOpenLibrary && aOpenLibrary === bOpenLibrary) return true;
  if (hasAnySharedIdentity(a, b)) return true;
  if (hasSharedTitle(a, b) && hasSharedAuthor(a, b)) return true;
  if (hasSharedTitle(a, b) && hasCloseYear(a, b)) return true;
  if (hasSharedTitle(a, b) && hasSharedSeries(a, b)) return true;

  return false;
}

function mergeBookItems(existing = {}, incoming = {}, language = "ru") {
  const existingIds = existing.external_ids || {};
  const incomingIds = incoming.external_ids || {};
  const existingMeta = existing.meta && typeof existing.meta === "object" ? existing.meta : {};
  const incomingMeta = incoming.meta && typeof incoming.meta === "object" ? incoming.meta : {};

  const wikidataId = existingIds.wikidata || incomingIds.wikidata || null;
  const openLibraryWork = existingIds.openlibrary_work || incomingIds.openlibrary_work || null;

  const resolvedAuthors = uniqueArray([
    ...getBookAuthors(existing),
    ...getBookAuthors(incoming)
  ]);

  const title = pickBetterText(existing.title, incoming.title);

  const mergedBase = {
    ...existing,
    ...incoming,

    title,
    title_primary: pickBetterText(existing.title_primary, incoming.title_primary),
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
    ].map(clean).filter(Boolean)),

    external_ids: {
      wikidata: wikidataId,
      openlibrary_work: openLibraryWork
    },

    primary_source: wikidataId
      ? "wikidata"
      : openLibraryWork
        ? "openlibrary"
        : (existing.primary_source || incoming.primary_source || "merged"),

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
  };

  const normalized = normalizeBookItem(mergedBase, language);

  return {
    ...normalized,
    canonical_key: buildCanonicalKey(normalized),
    identity_keys: buildBookIdentityKeys(normalized)
  };
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

  return result.map((item) => {
    const { identity_keys, ...publicItem } = item;
    return publicItem;
  });
}

function enrichKnownItemsWithOpenLibrary(knownItems = [], openLibraryItems = [], language = "ru") {
  return safeArray(knownItems).map((knownItem) => {
    const match = safeArray(openLibraryItems).find((openLibraryItem) =>
      areSameBook(knownItem, openLibraryItem)
    );

    if (!match) return knownItem;
    return mergeBookItems(knownItem, match, language);
  });
}

function scoreBookResult(item = {}, query = "") {
  const q = normalizeBookTitleKey(query);
  const titles = getTitleKeys(item);
  const authors = getBookAuthors(item).map(normalizePersonKey);
  const authorQuery = normalizePersonKey(query);

  let score = Number(item.score || 0);

  if (titles.some((title) => title === q)) score += 300;
  if (titles.some((title) => title.includes(q))) score += 150;
  if (authors.some((author) => author.includes(authorQuery))) score += 90;
  if (item.cover_url) score += 25;
  if (item.description_ru || item.description_en) score += 20;
  if (item.external_ids?.wikidata) score += 100;
  if (item.external_ids?.openlibrary_work) score += 35;
  if (item.meta?.author_names?.length) score += 20;
  if (item.meta?.series_name) score += 10;
  if (item.meta?.edition_count) score += Math.min(Number(item.meta.edition_count || 0), 100);

  return score;
}

function finalSort(items = [], query = "") {
  return [...safeArray(items)]
    .map((item) => ({
      ...item,
      score: scoreBookResult(item, query)
    }))
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

export async function runBooksSearch(query = "", options = {}) {
  const cleanQuery = clean(query);
  const language = options.language === "en" ? "en" : "ru";
  const isModal = Boolean(options.global);
  const limit = isModal ? SEARCH_LIMITS.MODAL_RESULTS : SEARCH_LIMITS.PAGE_RESULTS;

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  const intent = await detectWikidataIntent(cleanQuery, {
    language,
    global: isModal
  });

  const [supabaseItems, wikidataSearchItems] = await Promise.all([
    fetchBooksFromSupabase(cleanQuery, language),
    fetchWikidataBooksFromSearch(cleanQuery, language)
  ]);

  let primaryItems = [];

  if (intent.type === "author") {
    const openLibraryAuthorItems = await fetchOpenLibraryBooksByAuthor(
      cleanQuery,
      language,
      isModal ? OPEN_LIBRARY_LIMIT_MODAL : OPEN_LIBRARY_LIMIT_PAGE
    );

    primaryItems = dedupeBooks([
      ...intent.items,
      ...openLibraryAuthorItems,
      ...supabaseItems
    ], language);
  } else if (intent.type === "series") {
    const titleQueries = uniqueArray([
      cleanQuery,
      ...safeArray(intent.items).flatMap((item) => [
        item.title,
        item.title_ru,
        item.title_en,
        item.original_title
      ])
    ].map(clean).filter(Boolean));

    const openLibrarySeriesItems = await fetchOpenLibraryBooksByTitles(
      titleQueries,
      language,
      isModal ? OPEN_LIBRARY_LIMIT_MODAL : OPEN_LIBRARY_LIMIT_PAGE
    );

    primaryItems = dedupeBooks([
      ...intent.items,
      ...enrichKnownItemsWithOpenLibrary(intent.items, openLibrarySeriesItems, language),
      ...openLibrarySeriesItems.filter((item) =>
        safeArray(intent.items).some((knownItem) => areSameBook(knownItem, item))
      ),
      ...supabaseItems
    ], language);
  } else {
    const titleQueries = uniqueArray([
      cleanQuery,
      ...wikidataSearchItems.flatMap((item) => [
        item.title,
        item.title_ru,
        item.title_en,
        item.original_title
      ])
    ].map(clean).filter(Boolean));

    const openLibraryTitleItems = await fetchOpenLibraryBooksByTitles(
      titleQueries,
      language,
      isModal ? OPEN_LIBRARY_LIMIT_MODAL : OPEN_LIBRARY_LIMIT_PAGE
    );

    primaryItems = dedupeBooks([
      ...supabaseItems,
      ...wikidataSearchItems,
      ...enrichKnownItemsWithOpenLibrary(wikidataSearchItems, openLibraryTitleItems, language),
      ...openLibraryTitleItems.filter((item) =>
        wikidataSearchItems.length
          ? wikidataSearchItems.some((knownItem) => areSameBook(knownItem, item))
          : true
      )
    ], language);
  }

  return finalSort(primaryItems, cleanQuery).slice(0, limit);
}
