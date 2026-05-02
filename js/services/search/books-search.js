import { SEARCH_LIMITS } from "../../config.js";
import { safeArray, uniqueArray } from "../../utils.js";

const SEARCH_TIMEOUT_MS = 9000;

const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
const OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";
const OPEN_LIBRARY_COVER_BASE_URL = "https://covers.openlibrary.org/b/id";
const COMMONS_FILE_BASE_URL = "https://commons.wikimedia.org/wiki/Special:FilePath";

const WIKIDATA_SEARCH_LIMIT = 16;
const OPEN_LIBRARY_LIMIT_MODAL = 18;
const OPEN_LIBRARY_LIMIT_PAGE = 36;

const WIKIDATA_BOOK_TYPES = new Set([
  "Q571",
  "Q8261",
  "Q7725634",
  "Q47461344",
  "Q49084",
  "Q5185279",
  "Q25379",
  "Q277759",
  "Q7725310"
]);

const WIKIDATA_AUTHOR_TYPES = new Set(["Q5"]);

const WIKIDATA_SERIES_TYPES = new Set([
  "Q277759",
  "Q7725310",
  "Q47461344"
]);

const WIKIDATA_NOT_BOOK_TYPES = new Set([
  "Q5",
  "Q11424",
  "Q5398426",
  "Q15416",
  "Q1107",
  "Q95074",
  "Q21191270",
  "Q386724",
  "Q9509",
  "Q15632617",
  "Q15773347",
  "Q215380",
  "Q21198342",
  "Q4167410"
]);

const NOISE_TITLE_PATTERNS = [
  "summary",
  "study guide",
  "workbook",
  "companion",
  "analysis",
  "criticism",
  "interpretation",
  "interpretations",
  "sparknotes",
  "cliffsnotes",
  "lesson plans",
  "teacher guide",
  "student guide",
  "book review",
  "reading guide",
  "complete series",
  "box set",
  "boxed set",
  "collection",
  "omnibus",
  "set of",
  "books 1",
  "books 2",
  "books 3",
  "books 4",
  "books 5",
  "dramatization",
  "adaptation",
  "movie tie-in",
  "unofficial",
  "guidebook",
  "journal",
  "notebook",
  "coloring book",
  "activity book",
  "blank book",
  "low content",
  "large print",
  "литературная критика",
  "критика",
  "анализ",
  "пересказ",
  "краткое содержание",
  "рабочая тетрадь",
  "учебное пособие",
  "пособие",
  "путеводитель",
  "компаньон",
  "экранизация",
  "адаптация"
];

const AUTHOR_QUERY_HINTS = [
  "author:",
  "by:",
  "books by",
  "произведения",
  "книги автора",
  "автор:",
  "библиография"
];

const SERIES_QUERY_HINTS = [
  "series:",
  "цикл",
  "серия книг",
  "book series",
  "novel series"
];

function clean(value = "") {
  return String(value || "").trim();
}

function cleanLower(value = "") {
  return clean(value).toLowerCase();
}

function hasCyrillic(value = "") {
  return /[А-Яа-яЁёІіЇїЄє]/.test(String(value || ""));
}

function safeYear(value) {
  if (value === null || value === undefined || value === "") return null;

  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function getYearFromDate(value = "") {
  const text = clean(value);
  if (!text) return null;

  const match = text.match(/[+-]?(\d{4})/);
  if (!match) return null;

  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function getYearFromWikidataTime(value) {
  return getYearFromDate(value?.time || "");
}

function normalizeText(value = "") {
  return cleanLower(value)
    .replace(/ё/g, "е")
    .replace(/&/g, " and ")
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9а-яе]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value = "") {
  return normalizeText(value).replace(/\s+/g, "");
}

function stripBookNoise(value = "") {
  return normalizeText(value)
    .replace(/\bbook\b/g, "")
    .replace(/\bnovel\b/g, "")
    .replace(/\bvolume\b/g, "")
    .replace(/\bvol\b/g, "")
    .replace(/\bpart\b/g, "")
    .replace(/\bкнига\b/g, "")
    .replace(/\bроман\b/g, "")
    .replace(/\bтом\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitleKey(value = "") {
  return stripBookNoise(value)
    .replace(/^the\s+/i, "")
    .replace(/^a\s+/i, "")
    .replace(/^an\s+/i, "")
    .trim();
}

function normalizePersonKey(value = "") {
  return compactText(value)
    .replace(/[^a-z0-9а-яе]/gi, "");
}

function normalizeOpenLibraryWorkKey(value = "") {
  const raw = clean(value);
  if (!raw) return "";
  return raw.replace("/works/", "");
}

function openLibraryCoverUrlFromId(coverId) {
  return coverId ? `${OPEN_LIBRARY_COVER_BASE_URL}/${coverId}-L.jpg` : "";
}

function wikimediaFileUrl(filename = "") {
  const value = clean(filename);
  if (!value) return "";
  return `${COMMONS_FILE_BASE_URL}/${encodeURIComponent(value)}`;
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

function isNoisyTitle(title = "") {
  const text = normalizeText(title);
  if (!text) return true;

  if (text.length < 2) return true;

  return NOISE_TITLE_PATTERNS.some((pattern) => text.includes(pattern));
}

function isLikelyIsbn(value = "") {
  const compact = clean(value).replace(/[^0-9xX]/g, "");
  return compact.length === 10 || compact.length === 13;
}

function isAuthorIntent(query = "") {
  const text = normalizeText(query);

  if (!text) return false;
  if (isLikelyIsbn(text)) return false;

  return AUTHOR_QUERY_HINTS.some((hint) => text.includes(normalizeText(hint)));
}

function isSeriesIntent(query = "") {
  const text = normalizeText(query);

  if (!text) return false;

  return SERIES_QUERY_HINTS.some((hint) => text.includes(normalizeText(hint)));
}

function isSpecificBookIntent(query = "") {
  const text = normalizeText(query);

  if (!text) return false;
  if (isLikelyIsbn(text)) return true;
  if (isAuthorIntent(text) || isSeriesIntent(text)) return false;

  const words = text.split(/\s+/).filter(Boolean);

  if (words.length >= 2) return true;
  if (hasCyrillic(query) && words.length >= 1) return true;

  return false;
}

function getClaimValues(entity = {}, property = "") {
  return safeArray(entity?.claims?.[property])
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .filter(Boolean);
}

function getClaimValue(entity = {}, property = "") {
  return getClaimValues(entity, property)[0] || null;
}

function getEntityIdFromClaimValue(value) {
  if (!value || typeof value !== "object") return "";
  return value.id || (value["entity-type"] === "item" && value["numeric-id"] ? `Q${value["numeric-id"]}` : "");
}

function getClaimEntityIds(entity = {}, properties = []) {
  return uniqueArray(
    safeArray(properties)
      .flatMap((property) =>
        getClaimValues(entity, property)
          .map(getEntityIdFromClaimValue)
          .filter(Boolean)
      )
  );
}

function getEntityTypeIds(entity = {}) {
  return getClaimEntityIds(entity, ["P31", "P279", "P136"]);
}

function getEntityDescriptions(entity = {}) {
  return [
    entity?.descriptions?.ru?.value,
    entity?.descriptions?.en?.value
  ]
    .map(cleanLower)
    .filter(Boolean)
    .join(" ");
}

function isLikelyAuthorEntity(entity = {}) {
  const id = clean(entity?.id);
  if (!id || id === "-1") return false;

  const typeIds = getClaimEntityIds(entity, ["P31"]);
  const description = getEntityDescriptions(entity);

  const hasHumanType = typeIds.some((typeId) => WIKIDATA_AUTHOR_TYPES.has(typeId));
  const looksLikeWriter = [
    "writer",
    "author",
    "novelist",
    "poet",
    "playwright",
    "screenwriter",
    "писатель",
    "писательница",
    "автор",
    "романист",
    "поэт",
    "драматург",
    "сценарист"
  ].some((word) => description.includes(word));

  return hasHumanType && looksLikeWriter;
}

function isLikelySeriesEntity(entity = {}) {
  const id = clean(entity?.id);
  if (!id || id === "-1") return false;

  const typeIds = getEntityTypeIds(entity);
  const description = getEntityDescriptions(entity);

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
  const description = getEntityDescriptions(entity);
  const labels = [
    entity?.labels?.ru?.value,
    entity?.labels?.en?.value
  ].map(cleanLower).join(" ");

  if (typeIds.some((typeId) => WIKIDATA_NOT_BOOK_TYPES.has(typeId))) return false;
  if (typeIds.some((typeId) => WIKIDATA_BOOK_TYPES.has(typeId))) return true;

  if (description.includes("fictional character")) return false;
  if (description.includes("персонаж")) return false;
  if (description.includes("film")) return false;
  if (description.includes("movie")) return false;
  if (description.includes("television series")) return false;
  if (description.includes("video game")) return false;
  if (description.includes("фильм")) return false;
  if (description.includes("телесериал")) return false;
  if (description.includes("видеоигра")) return false;

  if (labels && isNoisyTitle(labels)) return false;

  return [
    "book",
    "novel",
    "literary work",
    "written work",
    "роман",
    "книга",
    "литературное произведение",
    "пьеса",
    "рассказ",
    "повесть"
  ].some((word) => description.includes(word));
}

function getBestLanguageTitle({ titleRu = "", titleEn = "", originalTitle = "", language = "ru" } = {}) {
  if (language === "en") {
    return clean(titleEn || titleRu || originalTitle);
  }

  return clean(titleRu || titleEn || originalTitle);
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

function buildBookIdentityKeys(item = {}) {
  const ids = item.external_ids || {};
  const wikidataId = clean(ids.wikidata || ids.wikidata_id);
  const openLibraryWork = normalizeOpenLibraryWorkKey(ids.openlibrary_work || ids.openlibrary || "");
  const titles = uniqueArray([
    item.title,
    item.title_primary,
    item.title_ru,
    item.title_en,
    item.original_title,
    ...safeArray(item.aliases)
  ].map(normalizeTitleKey).filter(Boolean));

  const authors = getBookAuthors(item).map(normalizePersonKey).filter(Boolean);
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
  });

  return uniqueArray(keys.filter(Boolean));
}

function buildCanonicalKey(item = {}) {
  const ids = item.external_ids || {};
  const wikidataId = clean(ids.wikidata || ids.wikidata_id);
  const openLibraryWork = normalizeOpenLibraryWorkKey(ids.openlibrary_work || ids.openlibrary || "");

  if (wikidataId) return `books:wikidata:${wikidataId}`.toLowerCase();
  if (openLibraryWork) return `books:openlibrary:${openLibraryWork}`.toLowerCase();

  const title = normalizeTitleKey(item.title_primary || item.title || item.title_ru || item.title_en || item.original_title || "untitled")
    .replace(/\s+/g, "-");
  const author = normalizePersonKey(getBookAuthors(item)[0] || "");
  const year = safeYear(item.year);

  return ["books", "work", title || "untitled", author, year || ""]
    .filter(Boolean)
    .join(":")
    .toLowerCase();
}

function normalizeBookItem(raw = {}, language = "ru") {
  const ids = raw.external_ids && typeof raw.external_ids === "object" ? raw.external_ids : {};
  const wikidataId = clean(ids.wikidata || ids.wikidata_id || raw.wikidata_id || "");
  const openLibraryWork = normalizeOpenLibraryWorkKey(
    ids.openlibrary_work ||
    ids.openlibrary ||
    raw.openlibrary_work ||
    raw.openlibrary_id ||
    ""
  );

  const authors = uniqueArray([
    ...safeArray(raw?.meta?.author_names),
    ...safeArray(raw?.meta?.authors),
    ...safeArray(raw?.authors),
    ...safeArray(raw?.author_names)
  ].map(clean).filter(Boolean));

  const titleRu = clean(raw.title_ru);
  const titleEn = clean(raw.title_en);
  const originalTitle = clean(raw.original_title || titleEn || titleRu || raw.title || "");
  const title = clean(raw.title) || getBestLanguageTitle({ titleRu, titleEn, originalTitle, language });

  if (!title) return null;
  if (isNoisyTitle(title) && !wikidataId) return null;

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
    original_title: originalTitle || title,

    year: safeYear(raw.year),
    cover_url: clean(raw.cover_url),

    description_ru: descriptionRu,
    description_en: descriptionEn,

    aliases: uniqueArray(safeArray(raw.aliases).map(clean).filter(Boolean)),

    external_ids: {
      wikidata: wikidataId || null,
      wikidata_id: wikidataId || null,
      openlibrary_work: openLibraryWork || null
    },

    primary_source: clean(raw.primary_source || raw.source || ""),
    score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0,

    meta: {
      ...(raw.meta && typeof raw.meta === "object" ? raw.meta : {}),
      source: clean(raw.primary_source || raw.source || raw?.meta?.source || ""),
      author_names: authors,
      series_name: clean(raw?.meta?.series_name || raw.series_name || raw.series || ""),
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

async function searchWikidataIds(query = "", language = "ru") {
  const cleanQuery = clean(query);
  if (!cleanQuery) return [];

  const url = new URL(WIKIDATA_API_URL);

  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("language", language);
  url.searchParams.set("uselang", language);
  url.searchParams.set("type", "item");
  url.searchParams.set("origin", "*");
  url.searchParams.set("limit", String(WIKIDATA_SEARCH_LIMIT));
  url.searchParams.set("search", cleanQuery);

  const payload = await fetchJson(url.toString(), {
    headers: { Accept: "application/json" }
  });

  return safeArray(payload?.search)
    .map((item) => item?.id)
    .filter(Boolean);
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

  return Object.values(payload?.entities || {}).filter((item) => item?.id && item.id !== "-1");
}

async function fetchWikidataLabels(ids = []) {
  const cleanIds = uniqueArray(safeArray(ids).map(clean).filter(Boolean)).slice(0, 80);
  if (!cleanIds.length) return new Map();

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
}

function mapWikidataEntity(entity = {}, language = "ru", labelMap = new Map(), query = "") {
  const wikidataId = clean(entity?.id);
  if (!wikidataId || wikidataId === "-1") return null;
  if (!isLikelyBookEntity(entity)) return null;

  const titleRu = clean(entity?.labels?.ru?.value);
  const titleEn = clean(entity?.labels?.en?.value);
  const descriptionRu = clean(entity?.descriptions?.ru?.value);
  const descriptionEn = clean(entity?.descriptions?.en?.value);

  const aliasesRu = safeArray(entity?.aliases?.ru).map((row) => clean(row?.value)).filter(Boolean);
  const aliasesEn = safeArray(entity?.aliases?.en).map((row) => clean(row?.value)).filter(Boolean);

  const title = getBestLanguageTitle({
    titleRu,
    titleEn,
    originalTitle: titleEn || titleRu,
    language
  });

  if (!title) return null;

  const authorIds = getClaimEntityIds(entity, ["P50"]);
  const seriesIds = getClaimEntityIds(entity, ["P179", "P361"]);

  const authorNames = uniqueArray(
    authorIds.flatMap((id) => {
      const labels = labelMap.get(id) || {};
      return language === "en" ? [labels.en, labels.ru] : [labels.ru, labels.en];
    }).map(clean).filter(Boolean)
  );

  const seriesNames = uniqueArray(
    seriesIds.flatMap((id) => {
      const labels = labelMap.get(id) || {};
      return language === "en" ? [labels.en, labels.ru] : [labels.ru, labels.en];
    }).map(clean).filter(Boolean)
  );

  const imageValue = getClaimValue(entity, "P18");
  const publicationDate = getClaimValue(entity, "P577");
  const inceptionDate = getClaimValue(entity, "P571");

  const previousIds = getClaimEntityIds(entity, ["P155"]);
  const nextIds = getClaimEntityIds(entity, ["P156"]);
  const basedOnIds = getClaimEntityIds(entity, ["P144"]);

  const item = normalizeBookItem({
    title,
    title_ru: titleRu,
    title_en: titleEn,
    original_title: titleEn || titleRu || title,
    year: getYearFromWikidataTime(publicationDate) || getYearFromWikidataTime(inceptionDate),
    cover_url: wikimediaFileUrl(imageValue),
    description_ru: descriptionRu,
    description_en: descriptionEn,
    aliases: uniqueArray([titleRu, titleEn, ...aliasesRu, ...aliasesEn].filter(Boolean)),
    external_ids: {
      wikidata: wikidataId,
      wikidata_id: wikidataId
    },
    primary_source: "wikidata",
    score: scoreTitleMatch({ title, titleRu, titleEn, aliases: [titleRu, titleEn, ...aliasesRu, ...aliasesEn], query }) + 700,
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

  return item;
}

function scoreTitleMatch({ title = "", titleRu = "", titleEn = "", aliases = [], query = "" } = {}) {
  const q = normalizeTitleKey(query);
  if (!q) return 0;

  const titleKeys = uniqueArray([
    title,
    titleRu,
    titleEn,
    ...safeArray(aliases)
  ].map(normalizeTitleKey).filter(Boolean));

  let score = 0;

  titleKeys.forEach((key) => {
    if (!key) return;

    if (key === q) score = Math.max(score, 280);
    else if (key.startsWith(q)) score = Math.max(score, 210);
    else if (q.startsWith(key)) score = Math.max(score, 180);
    else if (key.includes(q)) score = Math.max(score, 130);
    else {
      const queryWords = q.split(/\s+/).filter(Boolean);
      const titleWords = key.split(/\s+/).filter(Boolean);
      const overlap = queryWords.filter((word) => titleWords.includes(word)).length;

      if (overlap) {
        score = Math.max(score, Math.round((overlap / queryWords.length) * 100));
      }
    }
  });

  return score;
}

async function fetchWikidataBooksFromSearch(query = "", language = "ru") {
  const cleanQuery = clean(query);
  if (!cleanQuery) return [];

  try {
    const [ruIds, enIds] = await Promise.allSettled([
      searchWikidataIds(cleanQuery, "ru"),
      searchWikidataIds(cleanQuery, "en")
    ]);

    const ids = uniqueArray([
      ...safeArray(ruIds.status === "fulfilled" ? ruIds.value : []),
      ...safeArray(enIds.status === "fulfilled" ? enIds.value : [])
    ]);

    if (!ids.length) return [];

    const entities = await fetchWikidataEntities(ids);
    const books = entities.filter(isLikelyBookEntity);

    const labelIds = uniqueArray(
      books.flatMap((entity) => [
        ...getClaimEntityIds(entity, ["P50"]),
        ...getClaimEntityIds(entity, ["P179", "P361"])
      ])
    );

    const labelMap = await fetchWikidataLabels(labelIds);

    return dedupeBooks(
      books
        .map((entity) => mapWikidataEntity(entity, language, labelMap, cleanQuery))
        .filter(Boolean)
        .filter((item) => passesSpecificBookFilter(item, cleanQuery)),
      language
    );
  } catch (error) {
    console.warn("Wikidata books search failed:", error);
    return [];
  }
}

function getOpenLibraryAuthorNames(doc = {}) {
  return uniqueArray([
    ...safeArray(doc.author_name),
    ...safeArray(doc.author_alternative_name)
  ].map(clean).filter(Boolean)).slice(0, 6);
}

function getOpenLibrarySeriesName(doc = {}) {
  const subjects = [
    ...safeArray(doc.subject),
    ...safeArray(doc.place),
    ...safeArray(doc.person)
  ].map(clean).filter(Boolean);

  const series = subjects.find((item) => {
    const text = normalizeText(item);
    return text.includes("series") || text.includes("цикл") || text.includes("серия");
  });

  return clean(series || "");
}

function mapOpenLibraryDoc(doc = {}, language = "ru", query = "") {
  const title = clean(doc.title);
  if (!title || isNoisyTitle(title)) return null;

  const authors = getOpenLibraryAuthorNames(doc);
  const workKey = normalizeOpenLibraryWorkKey(doc.key || safeArray(doc.edition_key)[0] || "");
  const year = safeYear(doc.first_publish_year || safeArray(doc.publish_year).filter(Boolean).sort((a, b) => a - b)[0]);

  const titleSuggest = clean(doc.title_suggest);
  const titleEn = hasCyrillic(title) ? "" : title;
  const titleRu = hasCyrillic(title) ? title : "";

  const languageCodes = safeArray(doc.language).map(cleanLower);
  const isRussianDoc = languageCodes.includes("rus") || languageCodes.includes("ru") || hasCyrillic(title);
  const isEnglishDoc = languageCodes.includes("eng") || languageCodes.includes("en") || !hasCyrillic(title);

  const item = normalizeBookItem({
    title,
    title_ru: titleRu,
    title_en: titleEn || title,
    original_title: titleEn || titleSuggest || title,
    year,
    cover_url: openLibraryCoverUrlFromId(doc.cover_i),
    description_ru: "",
    description_en: "",
    aliases: uniqueArray([
      title,
      titleSuggest,
      ...safeArray(doc.alternative_title),
      ...safeArray(doc.subtitle)
    ].map(clean).filter(Boolean)),
    external_ids: {
      openlibrary_work: workKey
    },
    primary_source: "openlibrary",
    score:
      scoreTitleMatch({
        title,
        titleRu,
        titleEn: titleEn || title,
        aliases: [titleSuggest, ...safeArray(doc.alternative_title)],
        query
      }) +
      (doc.cover_i ? 70 : 0) +
      (authors.length ? 60 : 0) +
      (year ? 25 : 0) +
      (isRussianDoc && language === "ru" ? 45 : 0) +
      (isEnglishDoc && language === "en" ? 45 : 0) +
      Math.min(Number(doc.edition_count || 0), 80),
    meta: {
      source: "openlibrary",
      author_names: authors,
      series_name: getOpenLibrarySeriesName(doc),
      openlibrary_languages: languageCodes,
      openlibrary_edition_count: doc.edition_count || 0,
      openlibrary_subjects: safeArray(doc.subject).slice(0, 20)
    }
  }, language);

  if (!item) return null;
  if (!passesOpenLibraryQualityFilter(item, doc, query)) return null;

  return item;
}

function passesOpenLibraryQualityFilter(item = {}, doc = {}, query = "") {
  if (!item?.title) return false;
  if (isNoisyTitle(item.title)) return false;

  const titleKey = normalizeTitleKey(item.title);
  const queryKey = normalizeTitleKey(query);

  if (!titleKey || !queryKey) return false;

  const authors = getBookAuthors(item);
  const hasWork = Boolean(item.external_ids?.openlibrary_work);
  const hasCover = Boolean(item.cover_url);
  const hasYear = Boolean(item.year);

  const titleScore = scoreTitleMatch({
    title: item.title,
    titleRu: item.title_ru,
    titleEn: item.title_en,
    aliases: item.aliases,
    query
  });

  if (isSpecificBookIntent(query)) {
    if (titleScore < 100 && !titleKey.includes(queryKey) && !queryKey.includes(titleKey)) return false;
    if (!authors.length && !hasWork) return false;
  }

  const subjectText = safeArray(doc.subject).map(normalizeText).join(" ");
  if (subjectText.includes("juvenile literature") && !titleKey.includes(queryKey)) return false;

  if (!hasWork && !hasCover && !hasYear) return false;

  return true;
}

async function fetchOpenLibraryBooks(query = "", language = "ru", options = {}) {
  const cleanQuery = clean(query);
  if (!cleanQuery) return [];

  try {
    const url = new URL(OPEN_LIBRARY_SEARCH_URL);
    const limit = options.global ? OPEN_LIBRARY_LIMIT_MODAL : OPEN_LIBRARY_LIMIT_PAGE;

    if (isLikelyIsbn(cleanQuery)) {
      url.searchParams.set("isbn", cleanQuery.replace(/[^0-9xX]/g, ""));
    } else {
      url.searchParams.set("title", cleanQuery);
    }

    url.searchParams.set("limit", String(limit));
    url.searchParams.set("fields", [
      "key",
      "title",
      "title_suggest",
      "alternative_title",
      "subtitle",
      "author_name",
      "author_alternative_name",
      "first_publish_year",
      "publish_year",
      "cover_i",
      "edition_count",
      "language",
      "subject",
      "place",
      "person"
    ].join(","));

    const payload = await fetchJson(url.toString(), {
      headers: { Accept: "application/json" }
    });

    return dedupeBooks(
      safeArray(payload?.docs)
        .map((doc) => mapOpenLibraryDoc(doc, language, cleanQuery))
        .filter(Boolean)
        .filter((item) => passesSpecificBookFilter(item, cleanQuery)),
      language
    );
  } catch (error) {
    console.warn("Open Library books search failed:", error);
    return [];
  }
}

function passesSpecificBookFilter(item = {}, query = "") {
  if (!isSpecificBookIntent(query)) return true;

  const queryKey = normalizeTitleKey(query);
  const titleKeys = uniqueArray([
    item.title,
    item.title_primary,
    item.title_ru,
    item.title_en,
    item.original_title,
    ...safeArray(item.aliases)
  ].map(normalizeTitleKey).filter(Boolean));

  if (!queryKey || !titleKeys.length) return false;

  const directMatch = titleKeys.some((key) =>
    key === queryKey ||
    key.includes(queryKey) ||
    queryKey.includes(key)
  );

  if (directMatch) return true;

  const queryWords = queryKey.split(/\s+/).filter(Boolean);
  const bestOverlap = Math.max(
    ...titleKeys.map((key) => {
      const titleWords = key.split(/\s+/).filter(Boolean);
      const overlap = queryWords.filter((word) => titleWords.includes(word)).length;
      return queryWords.length ? overlap / queryWords.length : 0;
    })
  );

  return bestOverlap >= 0.68;
}

function mergeBookItems(existing = {}, incoming = {}) {
  const existingIds = existing.external_ids || {};
  const incomingIds = incoming.external_ids || {};
  const existingMeta = existing.meta || {};
  const incomingMeta = incoming.meta || {};

  const existingAuthors = getBookAuthors(existing);
  const incomingAuthors = getBookAuthors(incoming);

  const existingSeries = getBookSeries(existing);
  const incomingSeries = getBookSeries(incoming);

  const pickText = (a = "", b = "") => {
    const left = clean(a);
    const right = clean(b);

    if (!left) return right;
    if (!right) return left;

    return right.length > left.length ? right : left;
  };

  const pickCover = (a = "", b = "") => {
    const left = clean(a);
    const right = clean(b);

    if (!left) return right;
    if (!right) return left;

    if (existing.primary_source === "wikidata") return left;
    if (incoming.primary_source === "wikidata") return right;

    return left;
  };

  const merged = {
    ...existing,
    ...incoming,

    canonical_key: existing.canonical_key || incoming.canonical_key,
    category: "books",

    title: pickText(existing.title, incoming.title),
    title_primary: pickText(existing.title_primary, incoming.title_primary),
    title_ru: pickText(existing.title_ru, incoming.title_ru),
    title_en: pickText(existing.title_en, incoming.title_en),
    original_title: pickText(existing.original_title, incoming.original_title),

    year: existing.year || incoming.year || null,
    cover_url: pickCover(existing.cover_url, incoming.cover_url),

    description_ru: pickText(existing.description_ru, incoming.description_ru),
    description_en: pickText(existing.description_en, incoming.description_en),

    aliases: uniqueArray([
      ...safeArray(existing.aliases),
      ...safeArray(incoming.aliases)
    ].map(clean).filter(Boolean)),

    external_ids: {
      ...existingIds,
      ...incomingIds
    },

    primary_source: existing.primary_source === "wikidata" ? existing.primary_source : incoming.primary_source || existing.primary_source,

    score: Math.max(Number(existing.score || 0), Number(incoming.score || 0)),

    meta: {
      ...existingMeta,
      ...incomingMeta,
      author_names: uniqueArray([...existingAuthors, ...incomingAuthors].filter(Boolean)),
      series_name: existingSeries || incomingSeries || ""
    }
  };

  return {
    ...merged,
    canonical_key: buildCanonicalKey(merged),
    identity_keys: buildBookIdentityKeys(merged)
  };
}

function dedupeBooks(items = [], language = "ru") {
  const normalized = safeArray(items)
    .map((item) => normalizeBookItem(item, language))
    .filter(Boolean);

  const result = [];
  const keyToItem = new Map();

  normalized.forEach((item) => {
    const keys = uniqueArray([
      item.canonical_key,
      ...safeArray(item.identity_keys)
    ].map(cleanLower).filter(Boolean));

    const existingKey = keys.find((key) => keyToItem.has(key));

    if (!existingKey) {
      result.push(item);
      keys.forEach((key) => keyToItem.set(key, item));
      return;
    }

    const existing = keyToItem.get(existingKey);
    const merged = mergeBookItems(existing, item);

    const index = result.indexOf(existing);
    if (index >= 0) {
      result[index] = merged;
    }

    uniqueArray([
      merged.canonical_key,
      ...safeArray(merged.identity_keys)
    ].map(cleanLower).filter(Boolean)).forEach((key) => keyToItem.set(key, merged));
  });

  return result;
}

function sortBooks(items = []) {
  return [...safeArray(items)]
    .sort((a, b) => {
      const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;

      const ay = Number(a.year || 0);
      const by = Number(b.year || 0);

      if (ay && by && ay !== by) return ay - by;

      return clean(a.title_primary || a.title).localeCompare(clean(b.title_primary || b.title), "ru");
    });
}

function limitBooks(items = [], options = {}) {
  const limit = options.global ? SEARCH_LIMITS.MODAL_RESULTS : SEARCH_LIMITS.PAGE_RESULTS;
  return safeArray(items).slice(0, limit);
}

export async function runBooksSearch(query = "", options = {}) {
  const cleanQuery = clean(query);
  const language = options.language === "en" ? "en" : "ru";

  if (!cleanQuery) return [];

  const shouldAvoidBroadBibliography = isSpecificBookIntent(cleanQuery);

  const sources = await Promise.allSettled([
    fetchWikidataBooksFromSearch(cleanQuery, language),
    fetchOpenLibraryBooks(cleanQuery, language, options)
  ]);

  let items = sources.flatMap((result) =>
    result.status === "fulfilled" ? safeArray(result.value) : []
  );

  if (shouldAvoidBroadBibliography) {
    items = items.filter((item) => passesSpecificBookFilter(item, cleanQuery));
  }

  return limitBooks(
    sortBooks(
      dedupeBooks(items, language)
        .filter((item) => !isNoisyTitle(item.title))
    ),
    options
  );
}
