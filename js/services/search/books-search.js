import { SEARCH_LIMITS } from "../../config.js";
import { safeArray, uniqueArray } from "../../utils.js";

const SEARCH_TIMEOUT_MS = 8500;
const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
const WIKIPEDIA_RU_API_URL = "https://ru.wikipedia.org/w/api.php";
const WIKIPEDIA_EN_API_URL = "https://en.wikipedia.org/w/api.php";
const OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";
const OPEN_LIBRARY_WORK_URL = "https://openlibrary.org/works";
const OPEN_LIBRARY_COVER_BASE_URL = "https://covers.openlibrary.org/b/id";
const COMMONS_FILE_BASE_URL = "https://commons.wikimedia.org/wiki/Special:FilePath";

const WIKIDATA_SEARCH_LIMIT = 18;
const WIKIDATA_ENTITY_LIMIT = 45;
const OPEN_LIBRARY_LIMIT = 16;
const WIKIPEDIA_ENRICH_LIMIT = 5;

const BOOK_TYPE_IDS = new Set([
  "Q571",      // book
  "Q8261",     // novel
  "Q7725634",  // literary work
  "Q47461344", // written work
  "Q49084",    // short story
  "Q25379",    // play
  "Q5185279"   // poem
]);

const BOOK_SERIES_TYPE_IDS = new Set([
  "Q277759",  // book series
  "Q7725310"  // series of creative works
]);

const AUTHOR_TYPE_IDS = new Set(["Q5"]);

const NON_BOOK_TYPE_IDS = new Set([
  "Q5",       // human
  "Q11424",   // film
  "Q5398426", // television series
  "Q15416",   // television program
  "Q7889",    // video game
  "Q1107",    // anime
  "Q95074",   // fictional character
  "Q43229",   // organization
  "Q4830453"  // business
]);

const FORBIDDEN_ENTITY_PATTERNS = [
  "film",
  "movie",
  "television series",
  "tv series",
  "television program",
  "video game",
  "computer game",
  "game boy",
  "playstation",
  "xbox",
  "nintendo",
  "fictional character",
  "фильм",
  "кинофильм",
  "телесериал",
  "мультсериал",
  "компьютерная игра",
  "видеоигра",
  "игра для",
  "персонаж"
];

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

function normalizeYear(value) {
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
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function containsForbiddenPattern(...values) {
  const text = values.map(normalizeText).filter(Boolean).join(" ");
  if (!text) return false;
  return FORBIDDEN_ENTITY_PATTERNS.some((pattern) => text.includes(normalizeText(pattern)));
}

function isNoisyTitle(title = "") {
  const text = normalizeText(title);
  if (!text || text.length < 2) return true;
  return NOISE_TITLE_PATTERNS.some((pattern) => text.includes(normalizeText(pattern)));
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
  ].map(cleanLower).filter(Boolean).join(" ");
}

function getSitelinkTitles(entity = {}) {
  return [
    entity?.sitelinks?.ruwiki?.title,
    entity?.sitelinks?.enwiki?.title
  ].map(clean).filter(Boolean);
}

function isAuthorEntity(entity = {}) {
  const typeIds = getClaimEntityIds(entity, ["P31"]);
  const description = getEntityDescriptionText(entity);

  return (
    typeIds.some((id) => AUTHOR_TYPE_IDS.has(id)) &&
    ["writer", "author", "novelist", "poet", "писатель", "писательница", "автор", "романист", "поэт"].some((word) => description.includes(word))
  );
}

function isBookSeriesEntity(entity = {}) {
  const typeIds = getEntityTypeIds(entity);
  const description = getEntityDescriptionText(entity);

  if (typeIds.some((id) => BOOK_SERIES_TYPE_IDS.has(id))) return true;
  return ["book series", "novel series", "literary series", "серия книг", "книжная серия", "цикл романов", "литературный цикл"].some((word) => description.includes(word));
}

function isForbiddenNonBookEntity(entity = {}) {
  const typeIds = getEntityTypeIds(entity);
  const description = getEntityDescriptionText(entity);
  const sitelinks = getSitelinkTitles(entity).join(" ");

  if (typeIds.some((id) => NON_BOOK_TYPE_IDS.has(id))) return true;
  if (containsForbiddenPattern(description, sitelinks)) return true;

  return false;
}

function isBookWorkEntity(entity = {}) {
  if (!entity?.id || entity.id === "-1") return false;
  if (isAuthorEntity(entity)) return false;
  if (isBookSeriesEntity(entity)) return false;
  if (isForbiddenNonBookEntity(entity)) return false;

  const typeIds = getEntityTypeIds(entity);
  const description = getEntityDescriptionText(entity);
  const hasAuthor = getClaimEntityIds(entity, ["P50"]).length > 0;

  if (typeIds.some((id) => BOOK_TYPE_IDS.has(id))) return true;
  if (hasAuthor && ["book", "novel", "literary work", "written work", "роман", "книга", "литературное произведение", "пьеса", "рассказ", "повесть"].some((word) => description.includes(word))) return true;

  return false;
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
    if (candidate === q) score = Math.max(score, 360);
    else if (candidate.startsWith(q)) score = Math.max(score, 280);
    else if (q.startsWith(candidate)) score = Math.max(score, 220);
    else if (candidate.includes(q)) score = Math.max(score, 170);
    else {
      const qWords = q.split(/\s+/).filter(Boolean);
      const cWords = candidate.split(/\s+/).filter(Boolean);
      const overlap = qWords.filter((word) => cWords.includes(word)).length;
      if (overlap) score = Math.max(score, Math.round((overlap / qWords.length) * 130));
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
  const year = normalizeYear(item.year);
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

  const title = normalizeTitleKey(item.title_primary || item.title || item.title_ru || item.title_en || item.original_title || "untitled").replace(/\s+/g, "-");
  const author = normalizePersonKey(getBookAuthors(item)[0] || "");
  const year = normalizeYear(item.year);

  return ["books", "work", title || "untitled", author, year || ""].filter(Boolean).join(":").toLowerCase();
}

function getBestTitle({ titleRu = "", titleEn = "", originalTitle = "", language = "ru" } = {}) {
  return language === "en"
    ? clean(titleEn || titleRu || originalTitle)
    : clean(titleRu || titleEn || originalTitle);
}

function normalizeBookItem(raw = {}, language = "ru") {
  const ids = raw.external_ids && typeof raw.external_ids === "object" ? raw.external_ids : {};
  const wikidataId = clean(ids.wikidata || ids.wikidata_id || raw.wikidata_id || "");
  const openLibraryWork = normalizeOpenLibraryWork(ids.openlibrary_work || ids.openlibrary || raw.openlibrary_work || raw.openlibrary_id || "");
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

  const descriptionRu = containsForbiddenPattern(raw.description_ru) ? "" : clean(raw.description_ru || raw?.meta?.description_ru || "");
  const descriptionEn = containsForbiddenPattern(raw.description_en) ? "" : clean(raw.description_en || raw?.meta?.description_en || raw?.meta?.synopsis || "");
  const coverUrl = clean(raw.cover_url);

  const base = {
    category: "books",
    title,
    title_primary: language === "en" ? titleEn || titleRu || title : titleRu || titleEn || title,
    title_ru: titleRu,
    title_en: titleEn,
    original_title: originalTitle || title,
    year: normalizeYear(raw.year),
    cover_url: coverUrl,
    description_ru: descriptionRu,
    description_en: descriptionEn,
    aliases: uniqueArray(safeArray(raw.aliases).map(clean).filter(Boolean)),
    external_ids: Object.fromEntries(Object.entries({
      wikidata: wikidataId || "",
      wikidata_id: wikidataId || "",
      openlibrary_work: openLibraryWork || ""
    }).filter(([, value]) => clean(value))),
    primary_source: clean(raw.primary_source || raw.source || (wikidataId ? "wikidata" : "openlibrary")),
    score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0,
    meta: {
      ...(raw.meta && typeof raw.meta === "object" ? raw.meta : {}),
      source: clean(raw.primary_source || raw.source || raw?.meta?.source || (wikidataId ? "wikidata" : "openlibrary")),
      author_names: authors,
      series_name: clean(raw?.meta?.series_name || raw.series_name || raw.series || ""),
      metadata_status: coverUrl && (descriptionRu || descriptionEn) ? "ready" : "needs_enrichment"
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

  const payload = await fetchJson(url.toString(), { headers: { Accept: "application/json" } });
  return safeArray(payload?.search).map((item) => item?.id).filter(Boolean);
}

async function fetchWikidataEntities(ids = []) {
  const cleanIds = uniqueArray(safeArray(ids).map(clean).filter(Boolean)).slice(0, WIKIDATA_ENTITY_LIMIT);
  if (!cleanIds.length) return [];

  const url = new URL(WIKIDATA_API_URL);
  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("props", "labels|aliases|descriptions|claims|sitelinks");
  url.searchParams.set("languages", "ru|en");
  url.searchParams.set("ids", cleanIds.join("|"));

  const payload = await fetchJson(url.toString(), { headers: { Accept: "application/json" } });
  return Object.values(payload?.entities || {}).filter((item) => item?.id && item.id !== "-1");
}

async function fetchWikidataLabels(ids = []) {
  const entities = await fetchWikidataEntities(uniqueArray(ids).slice(0, 80)).catch(() => []);
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

async function fetchWikipediaExtractByExactSitelink(title = "", language = "ru") {
  const cleanTitle = clean(title);
  if (!cleanTitle) return null;
  if (containsForbiddenPattern(cleanTitle)) return null;

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

  const payload = await fetchJson(url.toString(), { headers: { Accept: "application/json" } }).catch(() => null);
  const page = Object.values(payload?.query?.pages || {})[0];
  if (!page || page.missing) return null;

  const extract = clean(page.extract);
  const pageTitle = clean(page.title);
  if (containsForbiddenPattern(pageTitle, extract)) return null;

  return {
    title: pageTitle,
    extract,
    image: clean(page?.original?.source)
  };
}

async function enrichWithWikipediaSitelinksOnly(items = []) {
  const head = safeArray(items).slice(0, WIKIPEDIA_ENRICH_LIMIT);
  const tail = safeArray(items).slice(WIKIPEDIA_ENRICH_LIMIT);

  const results = await Promise.allSettled(head.map(async (item) => {
    const entity = item.__wikidataEntity || null;
    const ruSitelink = clean(entity?.sitelinks?.ruwiki?.title);
    const enSitelink = clean(entity?.sitelinks?.enwiki?.title);

    const [ru, en] = await Promise.allSettled([
      item.description_ru || !ruSitelink ? null : fetchWikipediaExtractByExactSitelink(ruSitelink, "ru"),
      item.description_en || !enSitelink ? null : fetchWikipediaExtractByExactSitelink(enSitelink, "en")
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
        wikipedia_ru_title: ruPayload?.title || item.meta?.wikipedia_ru_title || "",
        wikipedia_en_title: enPayload?.title || item.meta?.wikipedia_en_title || "",
        sources: {
          ...(item.meta?.sources || {}),
          description_ru: ruPayload?.extract ? "wikipedia_ru_sitelink" : item.meta?.sources?.description_ru || "",
          description_en: enPayload?.extract ? "wikipedia_en_sitelink" : item.meta?.sources?.description_en || "",
          image: item.cover_url ? item.meta?.sources?.image || "" : (ruPayload?.image || enPayload?.image ? "wikipedia_pageimage_sitelink" : "")
        }
      }
    }, "ru");
  }));

  return [
    ...results.flatMap((result, index) => result.status === "fulfilled" && result.value ? [result.value] : [head[index]]),
    ...tail
  ];
}

function mapWikidataEntity(entity = {}, language = "ru", labelMap = new Map(), query = "") {
  const wikidataId = clean(entity?.id);
  if (!wikidataId || wikidataId === "-1") return null;
  if (!isBookWorkEntity(entity)) return null;

  const titleRu = clean(entity?.labels?.ru?.value);
  const titleEn = clean(entity?.labels?.en?.value);
  const descriptionRu = containsForbiddenPattern(entity?.descriptions?.ru?.value) ? "" : clean(entity?.descriptions?.ru?.value);
  const descriptionEn = containsForbiddenPattern(entity?.descriptions?.en?.value) ? "" : clean(entity?.descriptions?.en?.value);
  const aliasesRu = safeArray(entity?.aliases?.ru).map((row) => clean(row?.value)).filter(Boolean);
  const aliasesEn = safeArray(entity?.aliases?.en).map((row) => clean(row?.value)).filter(Boolean);
  const authorIds = getClaimEntityIds(entity, ["P50"]);
  const seriesIds = getClaimEntityIds(entity, ["P179", "P361"]);
  const previousIds = getClaimEntityIds(entity, ["P155"]);
  const nextIds = getClaimEntityIds(entity, ["P156"]);
  const basedOnIds = getClaimEntityIds(entity, ["P144"]);
  const authorNames = uniqueArray(authorIds.flatMap((id) => {
    const labels = labelMap.get(id) || {};
    return language === "en" ? [labels.en, labels.ru] : [labels.ru, labels.en];
  }).map(clean).filter(Boolean));
  const seriesNames = uniqueArray(seriesIds.flatMap((id) => {
    const labels = labelMap.get(id) || {};
    return language === "en" ? [labels.en, labels.ru] : [labels.ru, labels.en];
  }).map(clean).filter(Boolean));
  const publicationDate = getClaimValue(entity, "P577");
  const inceptionDate = getClaimValue(entity, "P571");
  const imageValue = getClaimValue(entity, "P18");
  const title = getBestTitle({ titleRu, titleEn, originalTitle: titleEn || titleRu, language });

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
    external_ids: { wikidata: wikidataId, wikidata_id: wikidataId },
    primary_source: "wikidata",
    score: scoreTitleMatch({ query, title, titleRu, titleEn, aliases: [titleRu, titleEn, ...aliasesRu, ...aliasesEn] }) + 1200,
    meta: {
      source: "wikidata",
      wikidata_labels: { ru: titleRu, en: titleEn },
      wikidata_aliases: { ru: aliasesRu, en: aliasesEn },
      wikidata_sitelinks: {
        ru: clean(entity?.sitelinks?.ruwiki?.title),
        en: clean(entity?.sitelinks?.enwiki?.title)
      },
      author_names: authorNames,
      author_wikidata_ids: authorIds,
      series_name: seriesNames[0] || "",
      series_candidates: seriesNames,
      series_wikidata_ids: seriesIds,
      wikidata_relations: { series: seriesIds, previous: previousIds, next: nextIds, based_on: basedOnIds },
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

  return item ? { ...item, __wikidataEntity: entity } : null;
}

async function fetchWikidataBooks(query = "", language = "ru") {
  const cleanQuery = clean(query);
  if (!cleanQuery) return [];

  const searchLanguages = uniqueArray([
    language === "en" ? "en" : "ru",
    hasCyrillic(cleanQuery) ? "ru" : "en",
    "ru",
    "en"
  ]);

  const searchResults = await Promise.allSettled(searchLanguages.map((lang) => searchWikidataIds(cleanQuery, lang)));
  const searchIds = uniqueArray(searchResults.flatMap((result) => result.status === "fulfilled" ? result.value : []));
  if (!searchIds.length) return [];

  const entities = await fetchWikidataEntities(searchIds).catch(() => []);
  const bookEntities = entities.filter(isBookWorkEntity);
  const labelIds = uniqueArray(bookEntities.flatMap((entity) => [
    ...getClaimEntityIds(entity, ["P50"]),
    ...getClaimEntityIds(entity, ["P179", "P361"])
  ]));
  const labelMap = await fetchWikidataLabels(labelIds);

  return bookEntities.map((entity) => mapWikidataEntity(entity, language, labelMap, cleanQuery)).filter(Boolean);
}

function getOpenLibraryAuthorNames(doc = {}) {
  return uniqueArray([...safeArray(doc.author_name), ...safeArray(doc.author_alternative_name)].map(clean).filter(Boolean)).slice(0, 8);
}

function mapOpenLibraryDoc(doc = {}, language = "ru", query = "") {
  const title = clean(doc.title);
  if (!title || isNoisyTitle(title)) return null;

  const authors = getOpenLibraryAuthorNames(doc);
  const workKey = normalizeOpenLibraryWork(doc.key || "");
  const year = normalizeYear(doc.first_publish_year || safeArray(doc.publish_year).filter(Boolean).sort((a, b) => a - b)[0]);
  const titleSuggest = clean(doc.title_suggest);
  const titleEn = hasCyrillic(title) ? "" : title;
  const titleRu = hasCyrillic(title) ? title : "";
  const languageCodes = safeArray(doc.language).map(cleanLower);

  return normalizeBookItem({
    title,
    title_ru: titleRu,
    title_en: titleEn || title,
    original_title: titleEn || titleSuggest || title,
    year,
    cover_url: openLibraryCoverUrlFromId(doc.cover_i),
    description_ru: "",
    description_en: "",
    aliases: uniqueArray([title, titleSuggest, ...safeArray(doc.alternative_title), ...safeArray(doc.subtitle)].map(clean).filter(Boolean)),
    external_ids: { openlibrary_work: workKey },
    primary_source: "openlibrary",
    score: scoreTitleMatch({ query, title, titleRu, titleEn: titleEn || title, aliases: [titleSuggest, ...safeArray(doc.alternative_title)] }) +
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
      sources: { identity: "openlibrary", image: doc.cover_i ? "openlibrary_cover" : "" }
    }
  }, language);
}

async function fetchOpenLibraryDescription(workId = "") {
  const normalizedWork = normalizeOpenLibraryWork(workId);
  if (!normalizedWork) return "";

  const payload = await fetchJson(`${OPEN_LIBRARY_WORK_URL}/${encodeURIComponent(normalizedWork)}.json`, { headers: { Accept: "application/json" } }).catch(() => null);
  if (typeof payload?.description === "string") return clean(payload.description);
  return clean(payload?.description?.value);
}

async function fetchOpenLibraryBooks(query = "", language = "ru") {
  const cleanQuery = clean(query);
  if (!cleanQuery) return [];

  const url = new URL(OPEN_LIBRARY_SEARCH_URL);
  url.searchParams.set("q", cleanQuery);
  url.searchParams.set("limit", String(OPEN_LIBRARY_LIMIT));
  url.searchParams.set("fields", "key,title,title_suggest,alternative_title,subtitle,author_name,author_alternative_name,first_publish_year,publish_year,cover_i,edition_count,language,subject");

  const payload = await fetchJson(url.toString(), { headers: { Accept: "application/json" } });
  const mapped = safeArray(payload?.docs).map((doc) => mapOpenLibraryDoc(doc, language, cleanQuery)).filter(Boolean);
  const top = mapped.slice(0, 4);
  const rest = mapped.slice(4);

  const enrichedTop = await Promise.allSettled(top.map(async (item) => {
    if (item.description_en || item.description_ru) return item;
    const description = await fetchOpenLibraryDescription(item.external_ids?.openlibrary_work).catch(() => "");
    return normalizeBookItem({
      ...item,
      description_en: containsForbiddenPattern(description) ? "" : description,
      meta: {
        ...(item.meta || {}),
        sources: { ...(item.meta?.sources || {}), description_en: description ? "openlibrary_work" : "" }
      }
    }, language);
  }));

  return [
    ...enrichedTop.flatMap((result, index) => result.status === "fulfilled" && result.value ? [result.value] : [top[index]]),
    ...rest
  ];
}

function mergeBookItems(existing = {}, incoming = {}) {
  return {
    ...existing,
    ...incoming,
    canonical_key: existing.canonical_key || incoming.canonical_key,
    category: "books",
    title: existing.title || incoming.title,
    title_primary: existing.title_primary || incoming.title_primary || incoming.title,
    title_ru: existing.title_ru || incoming.title_ru,
    title_en: existing.title_en || incoming.title_en,
    original_title: existing.original_title || incoming.original_title,
    year: existing.year || incoming.year || null,
    cover_url: existing.cover_url || incoming.cover_url,
    description_ru: existing.description_ru || incoming.description_ru,
    description_en: existing.description_en || incoming.description_en,
    aliases: uniqueArray([...safeArray(existing.aliases), ...safeArray(incoming.aliases)]),
    external_ids: { ...(existing.external_ids || {}), ...(incoming.external_ids || {}) },
    meta: {
      ...(existing.meta || {}),
      ...(incoming.meta || {}),
      author_names: uniqueArray([...safeArray(existing.meta?.author_names), ...safeArray(incoming.meta?.author_names)].map(clean).filter(Boolean)),
      metadata_status: (existing.cover_url || incoming.cover_url) && (existing.description_ru || incoming.description_ru || existing.description_en || incoming.description_en) ? "ready" : "needs_enrichment"
    },
    primary_source: existing.primary_source === "wikidata" ? existing.primary_source : incoming.primary_source || existing.primary_source,
    score: Math.max(existing.score || 0, incoming.score || 0),
    identity_keys: uniqueArray([...safeArray(existing.identity_keys), ...safeArray(incoming.identity_keys)])
  };
}

function dedupeBookResults(items = []) {
  const result = [];
  const byKey = new Map();

  safeArray(items).forEach((item) => {
    if (!item) return;
    const keys = uniqueArray([item.canonical_key, ...safeArray(item.identity_keys)].map((key) => cleanLower(key)).filter(Boolean));
    const existingKey = keys.find((key) => byKey.has(key));

    if (!existingKey) {
      result.push(item);
      keys.forEach((key) => byKey.set(key, item));
      return;
    }

    const existing = byKey.get(existingKey);
    const merged = mergeBookItems(existing, item);
    const index = result.indexOf(existing);
    if (index >= 0) result[index] = merged;
    uniqueArray([merged.canonical_key, ...safeArray(merged.identity_keys)].map((key) => cleanLower(key)).filter(Boolean)).forEach((key) => byKey.set(key, merged));
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

function cleanForOutput(item = {}) {
  const { __wikidataEntity, ...rest } = item;
  return rest;
}

export async function runBooksSearch(query = "", options = {}) {
  const cleanQuery = clean(query);
  if (!cleanQuery) return [];

  const language = options.language === "en" ? "en" : "ru";

  const [wikidata, openLibrary] = await Promise.allSettled([
    fetchWikidataBooks(cleanQuery, language),
    fetchOpenLibraryBooks(cleanQuery, language)
  ]);

  const merged = dedupeBookResults([
    ...safeArray(wikidata.status === "fulfilled" ? wikidata.value : []),
    ...safeArray(openLibrary.status === "fulfilled" ? openLibrary.value : [])
  ]);

  const withWikipedia = await enrichWithWikipediaSitelinksOnly(sortBooks(merged)).catch(() => merged);

  return sortBooks(dedupeBookResults(withWikipedia))
    .slice(0, SEARCH_LIMITS?.PAGE_RESULTS || 30)
    .map(cleanForOutput);
}
