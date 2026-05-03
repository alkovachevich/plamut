import { SEARCH_LIMITS } from "../../config.js";
import { safeArray, uniqueArray } from "../../utils.js";

const SEARCH_TIMEOUT_MS = 9500;

const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
const WIKIPEDIA_RU_API_URL = "https://ru.wikipedia.org/w/api.php";
const WIKIPEDIA_EN_API_URL = "https://en.wikipedia.org/w/api.php";
const OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";
const OPEN_LIBRARY_WORK_URL = "https://openlibrary.org/works";
const OPEN_LIBRARY_COVER_BASE_URL = "https://covers.openlibrary.org/b/id";
const COMMONS_FILE_BASE_URL = "https://commons.wikimedia.org/wiki/Special:FilePath";

const WIKIDATA_SEARCH_LIMIT = 20;
const WIKIDATA_ENTITY_CHUNK_SIZE = 40;
const WIKIDATA_SERIES_EXPAND_LIMIT = 12;
const OPEN_LIBRARY_LIMIT = 30;

const BOOK_TYPE_IDS = new Set([
  "Q571",
  "Q8261",
  "Q7725634",
  "Q47461344",
  "Q49084",
  "Q7725634",
  "Q25379",
  "Q5185279",
  "Q7725634"
]);

const BOOK_SERIES_TYPE_IDS = new Set([
  "Q277759",
  "Q7725310",
  "Q47461344"
]);

const AUTHOR_TYPE_IDS = new Set(["Q5"]);

const NON_BOOK_TYPE_IDS = new Set([
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
  "Q4167410",
  "Q7889",
  "Q43229"
]);

const NOISE_TITLE_PATTERNS = [
  "summary",
  "study guide",
  "workbook",
  "companion",
  "analysis",
  "criticism",
  "interpretation",
  "sparknotes",
  "cliffsnotes",
  "lesson plans",
  "teacher guide",
  "student guide",
  "book review",
  "reading guide",
  "unofficial",
  "guidebook",
  "journal",
  "notebook",
  "coloring book",
  "activity book",
  "blank book",
  "low content",
  "large print",
  "краткое содержание",
  "пересказ",
  "рабочая тетрадь",
  "учебное пособие",
  "пособие",
  "путеводитель",
  "компаньон",
  "критика",
  "анализ"
];

function clean(value = "") {
  return String(value || "").trim();
}

function cleanLower(value = "") {
  return clean(value).toLowerCase();
}

function safeYear(value) {
  if (value === null || value === undefined || value === "") return null;

  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function hasCyrillic(value = "") {
  return /[А-Яа-яЁёІіЇїЄє]/.test(String(value || ""));
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

function normalizeTitleKey(value = "") {
  return normalizeText(value)
    .replace(/^the\s+/i, "")
    .replace(/^a\s+/i, "")
    .replace(/^an\s+/i, "")
    .trim();
}

function normalizePersonKey(value = "") {
  return normalizeTitleKey(value).replace(/\s+/g, "");
}

function normalizeOpenLibraryWork(value = "") {
  return clean(value).replace("/works/", "");
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

  if (!text || text.length < 2) return true;

  return NOISE_TITLE_PATTERNS.some((pattern) => text.includes(pattern));
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

function wikimediaFileUrl(filename = "") {
  const value = clean(filename);
  if (!value) return "";
  return `${COMMONS_FILE_BASE_URL}/${encodeURIComponent(value)}`;
}

function openLibraryCoverUrlFromId(coverId) {
  return coverId ? `${OPEN_LIBRARY_COVER_BASE_URL}/${coverId}-L.jpg` : "";
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
  return uniqueArray([
    ...getClaimEntityIds(entity, ["P31"]),
    ...getClaimEntityIds(entity, ["P279"])
  ]);
}

function getEntityDescriptionText(entity = {}) {
  return [
    entity?.descriptions?.ru?.value,
    entity?.descriptions?.en?.value
  ]
    .map(cleanLower)
    .filter(Boolean)
    .join(" ");
}

function isAuthorEntity(entity = {}) {
  const typeIds = getClaimEntityIds(entity, ["P31"]);
  const description = getEntityDescriptionText(entity);

  return (
    typeIds.some((id) => AUTHOR_TYPE_IDS.has(id)) &&
    [
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
    ].some((word) => description.includes(word))
  );
}

function isBookSeriesEntity(entity = {}) {
  const typeIds = getEntityTypeIds(entity);
  const description = getEntityDescriptionText(entity);

  if (typeIds.some((id) => BOOK_SERIES_TYPE_IDS.has(id))) return true;

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

function isBookWorkEntity(entity = {}) {
  if (!entity?.id || entity.id === "-1") return false;
  if (isAuthorEntity(entity)) return false;
  if (isBookSeriesEntity(entity)) return false;

  const typeIds = getEntityTypeIds(entity);
  const description = getEntityDescriptionText(entity);

  if (typeIds.some((id) => NON_BOOK_TYPE_IDS.has(id))) return false;
  if (typeIds.some((id) => BOOK_TYPE_IDS.has(id))) return true;

  if (
    description.includes("film") ||
    description.includes("movie") ||
    description.includes("television series") ||
    description.includes("video game") ||
    description.includes("fictional character") ||
    description.includes("фильм") ||
    description.includes("телесериал") ||
    description.includes("видеоигра") ||
    description.includes("персонаж")
  ) {
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
    "рассказ",
    "повесть"
  ].some((word) => description.includes(word));
}

function getBestTitle({ titleRu = "", titleEn = "", originalTitle = "", language = "ru" } = {}) {
  if (language === "en") {
    return clean(titleEn || titleRu || originalTitle);
  }

  return clean(titleRu || titleEn || originalTitle);
}

function scoreTitleMatch({ query = "", title = "", titleRu = "", titleEn = "", aliases = [] } = {}) {
  const q = normalizeTitleKey(query);
  if (!q) return 0;

  const candidates = uniqueArray([
    title,
    titleRu,
    titleEn,
    ...safeArray(aliases)
  ].map(normalizeTitleKey).filter(Boolean));

  let score = 0;

  candidates.forEach((candidate) => {
    if (candidate === q) score = Math.max(score, 320);
    else if (candidate.startsWith(q)) score = Math.max(score, 250);
    else if (q.startsWith(candidate)) score = Math.max(score, 210);
    else if (candidate.includes(q)) score = Math.max(score, 170);
    else {
      const qWords = q.split(/\s+/).filter(Boolean);
      const cWords = candidate.split(/\s+/).filter(Boolean);
      const overlap = qWords.filter((word) => cWords.includes(word)).length;

      if (overlap) {
        score = Math.max(score, Math.round((overlap / qWords.length) * 130));
      }
    }
  });

  return score;
}

function getBookAuthors(item = {}) {
  return uniqueArray([
    ...safeArray(item?.meta?.author_names),
    ...safeArray(item?.meta?.authors),
    ...safeArray(item?.authors),
    ...safeArray(item?.author_names)
  ].map(clean).filter(Boolean));
}

function buildBookIdentityKeys(item = {}) {
  const ids = item.external_ids || {};
  const wikidataId = clean(ids.wikidata || ids.wikidata_id);
  const openLibraryWork = normalizeOpenLibraryWork(ids.openlibrary_work || ids.openlibrary || "");

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
  const openLibraryWork = normalizeOpenLibraryWork(ids.openlibrary_work || ids.openlibrary || "");

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
  const openLibraryWork = normalizeOpenLibraryWork(
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
  const title = clean(raw.title) || getBestTitle({ titleRu, titleEn, originalTitle, language });

  if (!title) return null;
  if (isNoisyTitle(title) && !wikidataId) return null;

  const descriptionRu = clean(raw.description_ru || raw?.meta?.description_ru || "");
  const descriptionEn = clean(raw.description_en || raw?.meta?.description_en || raw?.meta?.synopsis || "");
  const coverUrl = clean(raw.cover_url);

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
    cover_url: coverUrl,

    description_ru: descriptionRu,
    description_en: descriptionEn,

    aliases: uniqueArray(safeArray(raw.aliases).map(clean).filter(Boolean)),

    external_ids: Object.fromEntries(
      Object.entries({
        wikidata: wikidataId || "",
        wikidata_id: wikidataId || "",
        openlibrary_work: openLibraryWork || ""
      }).filter(([, value]) => clean(value))
    ),

    primary_source: clean(raw.primary_source || raw.source || (wikidataId ? "wikidata" : "openlibrary")),
    score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0,

    meta: {
      ...(raw.meta && typeof raw.meta === "object" ? raw.meta : {}),
      source: clean(raw.primary_source || raw.source || raw?.meta?.source || (wikidataId ? "wikidata" : "openlibrary")),
      author_names: authors,
      series_name: clean(raw?.meta?.series_name || raw.series_name || raw.series || ""),
      metadata_status:
        coverUrl && (descriptionRu || descriptionEn)
          ? "ready"
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

  const chunks = [];

  for (let i = 0; i < cleanIds.length; i += WIKIDATA_ENTITY_CHUNK_SIZE) {
    chunks.push(cleanIds.slice(i, i + WIKIDATA_ENTITY_CHUNK_SIZE));
  }

  const results = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const url = new URL(WIKIDATA_API_URL);

      url.searchParams.set("action", "wbgetentities");
      url.searchParams.set("format", "json");
      url.searchParams.set("origin", "*");
      url.searchParams.set("props", "labels|aliases|descriptions|claims|sitelinks");
      url.searchParams.set("languages", "ru|en");
      url.searchParams.set("ids", chunk.join("|"));

      const payload = await fetchJson(url.toString(), {
        headers: { Accept: "application/json" }
      });

      return Object.values(payload?.entities || {}).filter((item) => item?.id && item.id !== "-1");
    })
  );

  return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

async function fetchWikidataLabels(ids = []) {
  const entities = await fetchWikidataEntities(uniqueArray(ids).slice(0, 120));
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

async function fetchWikidataSeriesMembers(seriesEntity = {}) {
  const seriesId = clean(seriesEntity.id);
  if (!seriesId) return [];

  const query = `
    SELECT ?work WHERE {
      {
        ?work wdt:P179 wd:${seriesId}.
      }
      UNION
      {
        ?work wdt:P361 wd:${seriesId}.
      }
      ?work wdt:P31/wdt:P279* ?type.
      VALUES ?type {
        wd:Q571
        wd:Q8261
        wd:Q7725634
        wd:Q47461344
        wd:Q49084
        wd:Q5185279
      }
    }
    LIMIT ${WIKIDATA_SERIES_EXPAND_LIMIT}
  `;

  const url = new URL("https://query.wikidata.org/sparql");
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");

  const payload = await fetchJson(url.toString(), {
    headers: {
      Accept: "application/sparql-results+json"
    }
  }).catch(() => null);

  return uniqueArray(
    safeArray(payload?.results?.bindings)
      .map((row) => clean(row?.work?.value).split("/").pop())
      .filter(Boolean)
  );
}

async function fetchWikipediaExtractByTitle(title = "", language = "ru") {
  const cleanTitle = clean(title);
  if (!cleanTitle) return null;

  const apiUrl = language === "en" ? WIKIPEDIA_EN_API_URL : WIKIPEDIA_RU_API_URL;
  const url = new URL(apiUrl);

  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("prop", "extracts|pageimages");
  url.searchParams.set("exintro", "1");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("piprop", "original");
  url.searchParams.set("titles", cleanTitle);

  const payload = await fetchJson(url.toString(), {
    headers: { Accept: "application/json" }
  }).catch(() => null);

  const page = Object.values(payload?.query?.pages || {})[0];
  if (!page || page.missing) return null;

  return {
    title: clean(page.title),
    extract: clean(page.extract),
    image: clean(page?.original?.source)
  };
}

async function enrichWithWikipedia(items = []) {
  const results = await Promise.allSettled(
    safeArray(items).map(async (item) => {
      const entity = item.__wikidataEntity || null;
      const ruTitle = clean(entity?.sitelinks?.ruwiki?.title || item.title_ru);
      const enTitle = clean(entity?.sitelinks?.enwiki?.title || item.title_en || item.original_title);

      const [ru, en] = await Promise.allSettled([
        fetchWikipediaExtractByTitle(ruTitle, "ru"),
        fetchWikipediaExtractByTitle(enTitle, "en")
      ]);

      const ruPayload = ru.status === "fulfilled" ? ru.value : null;
      const enPayload = en.status === "fulfilled" ? en.value : null;

      return normalizeBookItem({
        ...item,
        description_ru: item.description_ru || ruPayload?.extract || "",
        description_en: item.description_en || enPayload?.extract || "",
        cover_url: item.cover_url || ruPayload?.image || enPayload?.image || "",
        meta: {
          ...(item.meta || {}),
          wikipedia_ru_title: ruPayload?.title || "",
          wikipedia_en_title: enPayload?.title || "",
          sources: {
            ...(item.meta?.sources || {}),
            description_ru: ruPayload?.extract ? "wikipedia_ru" : item.meta?.sources?.description_ru || "",
            description_en: enPayload?.extract ? "wikipedia_en" : item.meta?.sources?.description_en || "",
            image: item.cover_url ? item.meta?.sources?.image || "" : (ruPayload?.image || enPayload?.image ? "wikipedia_pageimage" : "")
          }
        }
      }, "ru");
    })
  );

  return results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
}

function mapWikidataEntity(entity = {}, language = "ru", labelMap = new Map(), query = "") {
  const wikidataId = clean(entity?.id);
  if (!wikidataId || wikidataId === "-1") return null;
  if (!isBookWorkEntity(entity)) return null;

  const titleRu = clean(entity?.labels?.ru?.value);
  const titleEn = clean(entity?.labels?.en?.value);
  const descriptionRu = clean(entity?.descriptions?.ru?.value);
  const descriptionEn = clean(entity?.descriptions?.en?.value);

  const aliasesRu = safeArray(entity?.aliases?.ru).map((row) => clean(row?.value)).filter(Boolean);
  const aliasesEn = safeArray(entity?.aliases?.en).map((row) => clean(row?.value)).filter(Boolean);

  const authorIds = getClaimEntityIds(entity, ["P50"]);
  const seriesIds = getClaimEntityIds(entity, ["P179", "P361"]);
  const previousIds = getClaimEntityIds(entity, ["P155"]);
  const nextIds = getClaimEntityIds(entity, ["P156"]);
  const basedOnIds = getClaimEntityIds(entity, ["P144"]);

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

  const publicationDate = getClaimValue(entity, "P577");
  const inceptionDate = getClaimValue(entity, "P571");
  const imageValue = getClaimValue(entity, "P18");

  const title = getBestTitle({
    titleRu,
    titleEn,
    originalTitle: titleEn || titleRu,
    language
  });

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
    score: scoreTitleMatch({
      query,
      title,
      titleRu,
      titleEn,
      aliases: [titleRu, titleEn, ...aliasesRu, ...aliasesEn]
    }) + 900,
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
      },
      sources: {
        identity: "wikidata",
        title_ru: titleRu ? "wikidata" : "",
        title_en: titleEn ? "wikidata" : "",
        description_ru: descriptionRu ? "wikidata_description" : "",
        description_en: descriptionEn ? "wikidata_description" : "",
        image: imageValue ? "wikidata_p18" : ""
      }
    },
    __wikidataEntity: entity
  }, language);

  if (!item) return null;

  return {
    ...item,
    __wikidataEntity: entity
  };
}

async function fetchWikidataBooks(query = "", language = "ru") {
  const cleanQuery = clean(query);
  if (!cleanQuery) return [];

  const searchLanguages = uniqueArray([
    language,
    hasCyrillic(cleanQuery) ? "ru" : "en",
    "ru",
    "en"
  ]);

  const searchResults = await Promise.allSettled(
    searchLanguages.map((lang) => searchWikidataIds(cleanQuery, lang))
  );

  const searchIds = uniqueArray(
    searchResults.flatMap((result) => result.status === "fulfilled" ? result.value : [])
  );

  if (!searchIds.length) return [];

  const searchEntities = await fetchWikidataEntities(searchIds);

  const seriesEntities = searchEntities.filter(isBookSeriesEntity);
  const directBookEntities = searchEntities.filter(isBookWorkEntity);

  const expandedSeriesIds = uniqueArray(
    (
      await Promise.allSettled(seriesEntities.map(fetchWikidataSeriesMembers))
    ).flatMap((result) => result.status === "fulfilled" ? result.value : [])
  );

  const allEntities = await fetchWikidataEntities(
    uniqueArray([
      ...directBookEntities.map((entity) => entity.id),
      ...expandedSeriesIds
    ])
  );

  const bookEntities = allEntities.filter(isBookWorkEntity);

  const labelIds = uniqueArray(
    bookEntities.flatMap((entity) => [
      ...getClaimEntityIds(entity, ["P50"]),
      ...getClaimEntityIds(entity, ["P179", "P361"])
    ])
  );

  const labelMap = await fetchWikidataLabels(labelIds);

  return bookEntities
    .map((entity) => mapWikidataEntity(entity, language, labelMap, cleanQuery))
    .filter(Boolean);
}

function getOpenLibraryAuthorNames(doc = {}) {
  return uniqueArray([
    ...safeArray(doc.author_name),
    ...safeArray(doc.author_alternative_name)
  ].map(clean).filter(Boolean)).slice(0, 8);
}

function mapOpenLibraryDoc(doc = {}, language = "ru", query = "") {
  const title = clean(doc.title);
  if (!title || isNoisyTitle(title)) return null;

  const authors = getOpenLibraryAuthorNames(doc);
  const workKey = normalizeOpenLibraryWork(doc.key || "");
  const year = safeYear(doc.first_publish_year || safeArray(doc.publish_year).filter(Boolean).sort((a, b) => a - b)[0]);

  const titleSuggest = clean(doc.title_suggest);
  const titleEn = hasCyrillic(title) ? "" : title;
  const titleRu = hasCyrillic(title) ? title : "";
  const languageCodes = safeArray(doc.language).map(cleanLower);

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
        query,
        title,
        titleRu,
        titleEn: titleEn || title,
        aliases: [titleSuggest, ...safeArray(doc.alternative_title)]
      }) +
      (doc.cover_i ? 180 : 0) +
      (authors.length ? 110 : 0) +
      (year ? 45 : 0) +
      Math.min(Number(doc.edition_count || 0), 120),
    meta: {
      source: "openlibrary",
      author_names: authors,
      openlibrary_languages: languageCodes,
      openlibrary_edition_count: doc.edition_count || 0,
      openlibrary_subjects: safeArray(doc.subject).slice(0, 20),
      sources: {
        openlibrary_work: workKey ? "openlibrary" : "",
        cover: doc.cover_i ? "openlibrary_cover_i" : "",
        author: authors.length ? "openlibrary" : "",
        year: year ? "openlibrary" : ""
      }
    }
  }, language);

  return item;
}

async function fetchOpenLibraryByQuery(query = "", language = "ru", options = {}) {
  const cleanQuery = clean(query);
  if (!cleanQuery) return [];

  const url = new URL(OPEN_LIBRARY_SEARCH_URL);

  url.searchParams.set("q", cleanQuery);
  url.searchParams.set("limit", String(options.global ? Math.min(OPEN_LIBRARY_LIMIT, 18) : OPEN_LIBRARY_LIMIT));
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
    "subject"
  ].join(","));

  const payload = await fetchJson(url.toString(), {
    headers: { Accept: "application/json" }
  }).catch(() => null);

  return safeArray(payload?.docs)
    .map((doc) => mapOpenLibraryDoc(doc, language, cleanQuery))
    .filter(Boolean);
}

async function fetchOpenLibraryByWikidataItem(item = {}, language = "ru") {
  const title = clean(item.title_en || item.original_title || item.title_primary || item.title_ru || item.title);
  if (!title) return null;

  const authors = getBookAuthors(item);
  const author = authors[0] || "";
  const year = safeYear(item.year);

  const url = new URL(OPEN_LIBRARY_SEARCH_URL);

  url.searchParams.set("title", title);
  if (author) url.searchParams.set("author", author);

  url.searchParams.set("limit", "8");
  url.searchParams.set("fields", [
    "key",
    "title",
    "title_suggest",
    "alternative_title",
    "author_name",
    "first_publish_year",
    "publish_year",
    "cover_i",
    "edition_count",
    "language",
    "subject"
  ].join(","));

  const payload = await fetchJson(url.toString(), {
    headers: { Accept: "application/json" }
  }).catch(() => null);

  const docs = safeArray(payload?.docs)
    .map((doc) => mapOpenLibraryDoc(doc, language, title))
    .filter(Boolean)
    .map((candidate) => ({
      candidate,
      score:
        scoreTitleMatch({
          query: title,
          title: candidate.title,
          titleRu: candidate.title_ru,
          titleEn: candidate.title_en,
          aliases: candidate.aliases
        }) +
        (author && getBookAuthors(candidate).some((name) => normalizePersonKey(name).includes(normalizePersonKey(author))) ? 200 : 0) +
        (year && candidate.year && Math.abs(candidate.year - year) <= 1 ? 100 : 0) +
        (candidate.cover_url ? 120 : 0)
    }))
    .sort((a, b) => b.score - a.score);

  return docs[0]?.candidate || null;
}

async function enrichWithOpenLibrary(items = [], language = "ru") {
  const results = await Promise.allSettled(
    safeArray(items).map(async (item) => {
      const ol = await fetchOpenLibraryByWikidataItem(item, language);

      if (!ol) return item;

      return mergeBookItems(item, {
        ...ol,
        score: Number(item.score || 0) + Math.min(Number(ol.score || 0), 250)
      });
    })
  );

  return results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
}

async function fetchOpenLibraryWorkDescription(item = {}) {
  const workId = normalizeOpenLibraryWork(item?.external_ids?.openlibrary_work || item?.external_ids?.openlibrary || "");
  if (!workId) return item;

  if (item.description_en || item.description_ru) return item;

  const payload = await fetchJson(`${OPEN_LIBRARY_WORK_URL}/${encodeURIComponent(workId)}.json`, {
    headers: { Accept: "application/json" }
  }).catch(() => null);

  if (!payload) return item;

  const description =
    typeof payload.description === "string"
      ? payload.description
      : clean(payload.description?.value);

  if (!description) return item;

  return normalizeBookItem({
    ...item,
    description_en: item.description_en || description,
    meta: {
      ...(item.meta || {}),
      sources: {
        ...(item.meta?.sources || {}),
        description_en: "openlibrary_work"
      }
    }
  }, "ru") || item;
}

async function enrichOpenLibraryDescriptions(items = []) {
  const results = await Promise.allSettled(
    safeArray(items).map(fetchOpenLibraryWorkDescription)
  );

  return results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
}

function mergeBookItems(existing = {}, incoming = {}) {
  const existingIds = existing.external_ids || {};
  const incomingIds = incoming.external_ids || {};
  const existingMeta = existing.meta || {};
  const incomingMeta = incoming.meta || {};

  const existingAuthors = getBookAuthors(existing);
  const incomingAuthors = getBookAuthors(incoming);

  const pickText = (a = "", b = "") => {
    const left = clean(a);
    const right = clean(b);

    if (!left) return right;
    if (!right) return left;

    return right.length > left.length ? right : left;
  };

  const pickTitle = (a = "", b = "") => {
    const left = clean(a);
    const right = clean(b);

    if (!left) return right;
    return left;
  };

  const merged = {
    ...existing,
    ...incoming,

    canonical_key: existing.canonical_key || incoming.canonical_key,
    category: "books",

    title: pickTitle(existing.title, incoming.title),
    title_primary: pickTitle(existing.title_primary, incoming.title_primary),
    title_ru: pickTitle(existing.title_ru, incoming.title_ru),
    title_en: pickTitle(existing.title_en, incoming.title_en),
    original_title: pickTitle(existing.original_title, incoming.original_title),

    year: existing.year || incoming.year || null,
    cover_url: existing.cover_url || incoming.cover_url || "",

    description_ru: pickText(existing.description_ru, incoming.description_ru),
    description_en: pickText(existing.description_en, incoming.description_en),

    aliases: uniqueArray([
      ...safeArray(existing.aliases),
      ...safeArray(incoming.aliases)
    ].map(clean).filter(Boolean)),

    external_ids: {
      ...incomingIds,
      ...existingIds,
      openlibrary_work: existingIds.openlibrary_work || incomingIds.openlibrary_work || "",
      wikidata: existingIds.wikidata || incomingIds.wikidata || "",
      wikidata_id: existingIds.wikidata_id || incomingIds.wikidata_id || existingIds.wikidata || incomingIds.wikidata || ""
    },

    primary_source: existing.primary_source === "wikidata" ? "wikidata" : existing.primary_source || incoming.primary_source || "openlibrary",

    score: Math.max(Number(existing.score || 0), Number(incoming.score || 0)),

    meta: {
      ...incomingMeta,
      ...existingMeta,
      author_names: uniqueArray([...existingAuthors, ...incomingAuthors].filter(Boolean)),
      series_name: existingMeta.series_name || incomingMeta.series_name || "",
      sources: {
        ...(incomingMeta.sources || {}),
        ...(existingMeta.sources || {})
      }
    }
  };

  return normalizeBookItem(merged, "ru");
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
  return [...safeArray(items)].sort((a, b) => {
    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;

    const ay = Number(a.year || 0);
    const by = Number(b.year || 0);

    if (ay && by && ay !== by) return ay - by;

    return clean(a.title_primary || a.title).localeCompare(clean(b.title_primary || b.title), "ru");
  });
}

function limitBooks(items = [], options = {}) {
  const limit = options.global
    ? SEARCH_LIMITS.MODAL_RESULTS
    : SEARCH_LIMITS.PAGE_RESULTS;

  return safeArray(items).slice(0, limit);
}

export async function runBooksSearch(query = "", options = {}) {
  const cleanQuery = clean(query);
  const language = options.language === "en" ? "en" : "ru";

  if (!cleanQuery) return [];

  const wikidataItems = await fetchWikidataBooks(cleanQuery, language).catch((error) => {
    console.warn("Wikidata book search failed:", error);
    return [];
  });

  const withWikipedia = await enrichWithWikipedia(wikidataItems).catch((error) => {
    console.warn("Wikipedia book enrichment failed:", error);
    return wikidataItems;
  });

  const withOpenLibrary = await enrichWithOpenLibrary(withWikipedia, language).catch((error) => {
    console.warn("Open Library book matching failed:", error);
    return withWikipedia;
  });

  const openLibraryFallback = await fetchOpenLibraryByQuery(cleanQuery, language, options).catch((error) => {
    console.warn("Open Library fallback failed:", error);
    return [];
  });

  const merged = dedupeBooks([
    ...withOpenLibrary,
    ...openLibraryFallback
  ], language);

  const withOlDescriptions = await enrichOpenLibraryDescriptions(merged).catch((error) => {
    console.warn("Open Library descriptions failed:", error);
    return merged;
  });

  return limitBooks(
    sortBooks(
      dedupeBooks(withOlDescriptions, language)
        .filter((item) => item?.title && !isNoisyTitle(item.title))
    ),
    options
  );
}
