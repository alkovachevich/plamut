import { SEARCH_LIMITS, TMDB_API_KEY, API_ENDPOINTS } from "../config.js";
import { normalizeString, compactString, uniqueArray, safeArray } from "../utils.js";
import { addToUserLibrary } from "./entity-db.js";
import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";

const SEARCH_TIMEOUT_MS = 9000;
const BOOKS_LIMIT = 18;
const BOOKS_AUTHOR_LIMIT = 18;
const WIKIDATA_LIMIT = 10;
const TMDB_LIMIT = 12;
const ANILIST_LIMIT = 10;
const SUPABASE_SEARCH_TIMEOUT_MS = 6000;

const SEARCH_CACHE_TTL_MS = 1000 * 60 * 3;
const searchCache = new Map();
const PLACEHOLDER_COVER_URL = "/placeholder.jpg";

function getSearchCacheKey(scope = "global", query = "", category = "") {
  return `${scope}:${compactString(query)}:${category}`;
}

function getCachedSearchResult(key = "") {
  const row = searchCache.get(key);
  if (!row) return null;
  if (Date.now() - row.ts > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return row.value;
}

function setCachedSearchResult(key = "", value = null) {
  if (!key) return;
  searchCache.set(key, { ts: Date.now(), value });
}

function normalizeQuery(value = "") {
  return normalizeString(value || "");
}

function getSystemLanguage() {
  const htmlLang = typeof document !== "undefined"
    ? String(document?.documentElement?.lang || "").trim().toLowerCase()
    : "";
  if (htmlLang.startsWith("en")) return "en";
  if (htmlLang.startsWith("ru")) return "ru";

  const localStorageLang = typeof localStorage !== "undefined"
    ? String(localStorage.getItem("plamut_language") || "").trim().toLowerCase()
    : "";
  if (localStorageLang === "en") return "en";
  if (localStorageLang === "ru") return "ru";

  return "ru";
}

function hasCyrillic(value = "") {
  return /[А-Яа-яЁёІіЇїЄє]/.test(String(value || ""));
}

function emptyGroups() {
  return {
    books: [],
    movies: [],
    series: [],
    anime: [],
    manga: []
  };
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

function flattenGroups(groups = {}) {
  const result = [];

  Object.values(groups).forEach((items) => {
    safeArray(items).forEach((item) => result.push(item));
  });

  return result;
}

function sortByScoreInternal(items = []) {
  return [...items].sort((a, b) => (b.score || 0) - (a.score || 0));
}

function limitInternal(items = [], limit = SEARCH_LIMITS.PAGE_RESULTS) {
  return items.slice(0, limit);
}

function groupItems(items = []) {
  const groups = emptyGroups();

  for (const item of items) {
    if (groups[item.category]) {
      groups[item.category].push(item);
    }
  }

  return groups;
}

function safeNumberYear(value) {
  if (value === null || value === undefined || value === "") return null;

  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function cleanTitleForDedupe(value = "") {
  return normalizeString(value)
    .replace(/\bкнига\b/g, "")
    .replace(/\bbook\b/g, "")
    .replace(/\bроман\b/g, "")
    .replace(/\bnovel\b/g, "")
    .replace(/\bтом\b/g, "")
    .replace(/\bvolume\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTitleKeys(item = {}) {
  return uniqueArray([
    item.title,
    item.title_primary,
    item.title_ru,
    item.title_en,
    item.original_title,
    ...safeArray(item.aliases)
  ])
    .map(cleanTitleForDedupe)
    .filter(Boolean);
}


function sanitizeCategory(value = "") {
  const category = String(value || "").trim().toLowerCase();
  return ["books", "movies", "series", "anime", "manga"].includes(category)
    ? category
    : "";
}

function normalizeExternalIds(ids = {}) {
  const source = ids && typeof ids === "object" ? ids : {};
  return {
    wikidata: source.wikidata || null,
    tmdb: source.tmdb || null,
    imdb: source.imdb || null,
    openlibrary_work: source.openlibrary_work || null,
    isbn: uniqueArray(safeArray(source.isbn).map(String).filter(Boolean)),
    anilist: source.anilist || null,
    mal: source.mal || null,
    edition_key: uniqueArray(safeArray(source.edition_key).map(String).filter(Boolean))
  };
}

function normalizeSearchResult(raw = {}) {
  const category = sanitizeCategory(raw.category);
  const title = String(raw.title || raw.title_primary || raw.title_ru || raw.title_en || raw.original_title || "").trim();
  const canonical = String(raw.canonical_key || "").trim();
  const originalTitle = String(raw.original_title || raw.title_en || raw.title_ru || title).trim();
  const external_ids = normalizeExternalIds(raw.external_ids || {});

  if (!category || !title || !canonical) return null;

  return {
    canonical_key: canonical,
    category,
    title,
    title_ru: String(raw.title_ru || "").trim(),
    title_en: String(raw.title_en || "").trim(),
    original_title: originalTitle,
    year: safeNumberYear(raw.year),
    cover_url: String(raw.cover_url || "").trim(),
    external_ids,
    score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0,
    aliases: uniqueArray(safeArray(raw.aliases).map(String).filter(Boolean)),
    description_ru: String(raw.description_ru || "").trim(),
    description_en: String(raw.description_en || "").trim(),
    primary_source: String(raw.primary_source || "").trim(),
    meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {}
  };
}

function pickBestItem(items = []) {
  return safeArray(items)
    .filter(Boolean)
    .sort((a, b) => {
      const aHasCover = a.cover_url ? 1 : 0;
      const bHasCover = b.cover_url ? 1 : 0;
      if (bHasCover !== aHasCover) return bHasCover - aHasCover;

      const aHasYear = a.year ? 1 : 0;
      const bHasYear = b.year ? 1 : 0;
      if (bHasYear !== aHasYear) return bHasYear - aHasYear;

      const aIds = Object.values(a.external_ids || {}).flat().filter(Boolean).length;
      const bIds = Object.values(b.external_ids || {}).flat().filter(Boolean).length;
      if (bIds !== aIds) return bIds - aIds;

      return (b.score || 0) - (a.score || 0);
    })[0] || null;
}

function hasSharedValue(a = [], b = []) {
  const set = new Set(safeArray(a).filter(Boolean).map(String));
  return safeArray(b).some((value) => set.has(String(value)));
}

function pickBetterText(existingValue = "", incomingValue = "") {
  const a = String(existingValue || "").trim();
  const b = String(incomingValue || "").trim();
  if (!a) return b;
  if (!b) return a;
  return b.length > a.length ? b : a;
}

function pickBooksDescription(existing = {}, incoming = {}, field = "description_ru") {
  const existingText = String(existing?.[field] || "").trim();
  const incomingText = String(incoming?.[field] || "").trim();

  if (!existingText) return incomingText;
  if (!incomingText) return existingText;

  const existingNoise = hasBookScreenDescriptionNoise({ [field]: existingText });
  const incomingNoise = hasBookScreenDescriptionNoise({ [field]: incomingText });

  if (existingNoise && !incomingNoise) return incomingText;
  if (!existingNoise && incomingNoise) return existingText;

  const existingSource = String(existing?.primary_source || "").trim().toLowerCase();
  const incomingSource = String(incoming?.primary_source || "").trim().toLowerCase();

  if (existingSource === "openlibrary" && incomingSource !== "openlibrary") return existingText;
  if (incomingSource === "openlibrary" && existingSource !== "openlibrary") return incomingText;

  return incomingText.length > existingText.length ? incomingText : existingText;
}

function mergeItems(existing, incoming) {
  if (!existing?.category || !incoming?.category || existing.category !== incoming.category) {
    console.debug("merge conflict: category mismatch", existing?.canonical_key, incoming?.canonical_key);
    return existing || incoming || null;
  }

  const canMergeBooks = existing.category === "books" && hasBookMergeSignal(existing, incoming);
  if (!hasStrictSharedIds(existing, incoming) && !canMergeBooks) {
    console.debug("merge conflict: no shared ids/signals", existing?.canonical_key, incoming?.canonical_key);
    return existing;
  }

  if (existing.category === "books" && (hasBookScreenDescriptionNoise(existing) || hasBookScreenDescriptionNoise(incoming))) {
    console.debug("merge conflict: books with screen-like description", existing?.canonical_key, incoming?.canonical_key);
    return existing || incoming || null;
  }

  const existingIds = existing.external_ids || {};
  const incomingIds = incoming.external_ids || {};
  const existingMeta = existing.meta && typeof existing.meta === "object" ? existing.meta : {};
  const incomingMeta = incoming.meta && typeof incoming.meta === "object" ? incoming.meta : {};
  const resolvedWikidataRelations = {
    series: uniqueArray([
      ...safeArray(existingMeta.wikidata_relations?.series),
      ...safeArray(incomingMeta.wikidata_relations?.series)
    ]),
    previous: uniqueArray([
      ...safeArray(existingMeta.wikidata_relations?.previous),
      ...safeArray(incomingMeta.wikidata_relations?.previous),
      ...safeArray(existingMeta.wikidata_relations?.follows),
      ...safeArray(incomingMeta.wikidata_relations?.follows)
    ]),
    next: uniqueArray([
      ...safeArray(existingMeta.wikidata_relations?.next),
      ...safeArray(incomingMeta.wikidata_relations?.next),
      ...safeArray(existingMeta.wikidata_relations?.followed_by),
      ...safeArray(incomingMeta.wikidata_relations?.followed_by)
    ]),
    based_on: uniqueArray([
      ...safeArray(existingMeta.wikidata_relations?.based_on),
      ...safeArray(incomingMeta.wikidata_relations?.based_on)
    ]),
    derivative_work: uniqueArray([
      ...safeArray(existingMeta.wikidata_relations?.derivative_work),
      ...safeArray(incomingMeta.wikidata_relations?.derivative_work)
    ]),
    adaptations: uniqueArray([
      ...safeArray(existingMeta.wikidata_relations?.adaptations),
      ...safeArray(incomingMeta.wikidata_relations?.adaptations)
    ]),
    editions_or_translations: uniqueArray([
      ...safeArray(existingMeta.wikidata_relations?.editions_or_translations),
      ...safeArray(incomingMeta.wikidata_relations?.editions_or_translations)
    ])
  };
  const resolvedAuthorNames = uniqueArray([
    ...safeArray(existingMeta.author_names),
    ...safeArray(incomingMeta.author_names)
  ]);
  const resolvedAuthorKeys = uniqueArray([
    ...safeArray(existingMeta.author_keys),
    ...safeArray(incomingMeta.author_keys)
  ]);
  const resolvedAuthorWikidataId = existingMeta.author_wikidata_id || incomingMeta.author_wikidata_id || null;
  const resolvedWikidataLabels = {
    ru: pickBetterText(existingMeta?.wikidata_labels?.ru, incomingMeta?.wikidata_labels?.ru),
    en: pickBetterText(existingMeta?.wikidata_labels?.en, incomingMeta?.wikidata_labels?.en)
  };
  const resolvedWikidataAliases = {
    ru: uniqueArray([
      ...safeArray(existingMeta?.wikidata_aliases?.ru),
      ...safeArray(incomingMeta?.wikidata_aliases?.ru)
    ]),
    en: uniqueArray([
      ...safeArray(existingMeta?.wikidata_aliases?.en),
      ...safeArray(incomingMeta?.wikidata_aliases?.en)
    ])
  };
  const resolvedSeriesCandidates = uniqueArray([
    existingMeta.wikidata_series_name,
    incomingMeta.wikidata_series_name,
    ...safeArray(existingMeta.series_candidates),
    ...safeArray(incomingMeta.series_candidates),
    ...safeArray(existingMeta.wikidata_relations?.series),
    ...safeArray(incomingMeta.wikidata_relations?.series),
    existingMeta.series_name,
    incomingMeta.series_name
  ].filter(Boolean));
  const resolvedSeriesName =
    existingMeta.wikidata_series_name ||
    incomingMeta.wikidata_series_name ||
    existingMeta.series_name ||
    incomingMeta.series_name ||
    resolvedSeriesCandidates[0] ||
    "";
  const resolvedBookSearchMode =
    existing.category === "books"
      ? (existingMeta.book_search_mode === "title" || incomingMeta.book_search_mode === "title"
          ? "title"
          : (incomingMeta.book_search_mode || existingMeta.book_search_mode || ""))
      : "";
  const resolvedSeriesItems = Array.from(new Map(
    [...safeArray(existingMeta.series_items), ...safeArray(incomingMeta.series_items)]
      .filter((row) => row && row.wikidata)
      .map((row) => [row.wikidata, row])
  ).values());
  const resolvedSeriesOrder = Number.isFinite(Number(existingMeta.series_order))
    ? Number(existingMeta.series_order)
    : (Number.isFinite(Number(incomingMeta.series_order)) ? Number(incomingMeta.series_order) : null);

  return {
    ...existing,
    ...incoming,
    canonical_key: existing.canonical_key || incoming.canonical_key,
    category: existing.category || incoming.category,
    title: pickBetterText(existing.title, incoming.title),
    title_ru: pickBetterText(existing.title_ru, incoming.title_ru),
    title_en: pickBetterText(existing.title_en, incoming.title_en),
    original_title: pickBetterText(existing.original_title, incoming.original_title),
    year: existing.year || incoming.year || null,
    cover_url: existing.cover_url || incoming.cover_url || "",
    description_ru:
      existing.category === "books"
        ? pickBooksDescription(existing, incoming, "description_ru")
        : pickBetterText(existing.description_ru, incoming.description_ru),
    description_en:
      existing.category === "books"
        ? pickBooksDescription(existing, incoming, "description_en")
        : pickBetterText(existing.description_en, incoming.description_en),
    aliases: uniqueArray([...safeArray(existing.aliases), ...safeArray(incoming.aliases)]),
    external_ids: {
      ...existingIds,
      ...incomingIds,
      isbn: uniqueArray([
        ...safeArray(existingIds.isbn),
        ...safeArray(incomingIds.isbn)
      ]),
      edition_key: uniqueArray([
        ...safeArray(existingIds.edition_key),
        ...safeArray(incomingIds.edition_key)
      ]),
      ia: uniqueArray([
        ...safeArray(existingIds.ia),
        ...safeArray(incomingIds.ia)
      ])
    },
    primary_source: resolveBooksPrimarySource(existing, incoming),
    score: Math.max(existing.score || 0, incoming.score || 0),
    meta: {
      ...existingMeta,
      ...incomingMeta,
      author_names: resolvedAuthorNames,
      author_keys: resolvedAuthorKeys,
      author_wikidata_id: resolvedAuthorWikidataId,
      wikidata_labels: resolvedWikidataLabels,
      wikidata_aliases: resolvedWikidataAliases,
      series_name: resolvedSeriesName,
      series_items: resolvedSeriesItems,
      series_order: resolvedSeriesOrder,
      series_candidates: resolvedSeriesCandidates,
      wikidata_relations: resolvedWikidataRelations,
      ...(resolvedBookSearchMode ? { book_search_mode: resolvedBookSearchMode } : {})
    }
  };
}

function areSameBook(a = {}, b = {}) {
  if (a.category !== "books" || b.category !== "books") return false;
  return hasBookMergeSignal(a, b);
}

function dedupeBooks(items = []) {
  const result = [];

  for (const item of safeArray(items)) {
    if (!item?.canonical_key) continue;

    const existingIndex = result.findIndex((candidate) => areSameBook(candidate, item));

    if (existingIndex >= 0) {
      result[existingIndex] = mergeItems(result[existingIndex], item);
    } else {
      result.push(item);
    }
  }

  return result;
}

function identityKeys(item = {}) {
  const ids = item.external_ids || {};
  const categoryPrefix = item.category ? `${item.category}:` : "";
  const keys = [item.canonical_key].filter(Boolean);

  if (ids.wikidata) keys.push(`${categoryPrefix}wikidata:${ids.wikidata}`);
  if (ids.tmdb) keys.push(`${categoryPrefix}tmdb:${ids.tmdb}`);
  if (ids.imdb) keys.push(`${categoryPrefix}imdb:${ids.imdb}`);
  if (ids.anilist) keys.push(`${categoryPrefix}anilist:${ids.anilist}`);
  if (ids.mal) keys.push(`${categoryPrefix}mal:${ids.mal}`);
  if (ids.openlibrary_work) {
    keys.push(`${categoryPrefix}olwork:${normalizeOpenLibraryWorkKey(ids.openlibrary_work)}`);
  }
  if (item.category !== "books") {
    safeArray(ids.isbn).forEach((isbn) => keys.push(`${categoryPrefix}isbn:${String(isbn)}`));
  }

  return uniqueArray(keys.filter(Boolean));
}

function dedupeAll(items = []) {
  const normalized = safeArray(items)
    .map((item) => normalizeSearchResult(item))
    .filter(Boolean);

  const grouped = new Map();

  normalized.forEach((item) => {
    const keys = identityKeys(item);
    let groupKey = keys.find((key) => grouped.has(key));

    if (!groupKey) {
      groupKey = keys[0] || item.canonical_key;
      grouped.set(groupKey, [item]);
      keys.forEach((key) => grouped.set(key, grouped.get(groupKey)));
      return;
    }

    const bucket = grouped.get(groupKey) || [];
    bucket.push(item);
    keys.forEach((key) => grouped.set(key, bucket));
  });

  const uniqueBuckets = [];
  const seenBuckets = new Set();

  Array.from(grouped.values()).forEach((bucket) => {
    if (!bucket || seenBuckets.has(bucket)) return;
    seenBuckets.add(bucket);
    uniqueBuckets.push(bucket);
  });

  return uniqueBuckets
    .map((bucket) => {
      const best = pickBestItem(bucket);
      if (!best) return null;
      return safeArray(bucket).reduce((acc, item) => {
        if (!acc?.category || !item?.category || acc.category !== item.category) return acc;
        return mergeItems(acc, item);
      }, best);
    })
    .map((item) => normalizeSearchResult(item))
    .filter((item) => item && item.title && item.canonical_key);
}

function openLibraryCoverUrlFromId(coverId) {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : "";
}

function openLibraryCoverUrlFromIsbn(isbn) {
  return isbn ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg` : "";
}

function openLibraryCoverUrlFromOlid(olid) {
  return olid ? `https://covers.openlibrary.org/b/olid/${encodeURIComponent(olid)}-L.jpg` : "";
}

function wikimediaFileUrl(filename = "") {
  const clean = String(filename || "").trim();
  if (!clean) return "";

  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(clean)}`;
}

function normalizeOpenLibraryWorkKey(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (raw.startsWith("/works/")) {
    return raw.replace("/works/", "");
  }

  return raw;
}

function buildOpenLibraryCover(doc = {}) {
  if (doc.cover_i) {
    return openLibraryCoverUrlFromId(doc.cover_i);
  }

  const isbn = safeArray(doc?.isbn)[0] || "";
  if (isbn) {
    return openLibraryCoverUrlFromIsbn(isbn);
  }

  const editionKey = safeArray(doc?.edition_key)[0] || "";
  if (editionKey) {
    return openLibraryCoverUrlFromOlid(editionKey);
  }

  const ia = safeArray(doc?.ia)[0] || "";
  if (ia) {
    return openLibraryCoverUrlFromOlid(ia);
  }

  return "";
}

/* =========================
   BOOKS
========================= */

function mapSupabaseBookRowToSearchItem(row = {}, language = "ru") {
  const ids = row.external_ids && typeof row.external_ids === "object" ? row.external_ids : {};
  const titleRu = String(row.title_ru || "").trim();
  const titleEn = String(row.title_en || "").trim();
  const originalTitle = String(row.original_title || titleEn || titleRu || row.title_primary || "").trim();
  const title = language === "en"
    ? (titleEn || titleRu || originalTitle)
    : (titleRu || titleEn || originalTitle);

  return normalizeSearchResult({
    canonical_key: row.canonical_key || "",
    category: "books",
    title,
    title_ru: titleRu,
    title_en: titleEn,
    original_title: originalTitle,
    year: row.year || null,
    cover_url: String(row.cover_url || "").trim(),
    external_ids: ids,
    aliases: uniqueArray([
      ...safeArray(row.aliases),
      row.title_primary,
      row.title_ru,
      row.title_en,
      row.original_title
    ]),
    description_ru: String(row.description_ru || "").trim(),
    description_en: String(row.description_en || "").trim(),
    primary_source: String(row.primary_source || "").trim(),
    meta: row.meta && typeof row.meta === "object" ? row.meta : {}
  });
}

async function fetchBooksFromSupabase(query = "", language = "ru") {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return [];
  const supabase = getSupabaseClient();
  const normalized = normalizeString(cleanQuery);
  const categoryFilter = "books";

  const entityQuery = supabase
    .from("media_entities")
    .select("id,canonical_key,category,primary_source,title_primary,title_ru,title_en,original_title,year,cover_url,description_ru,description_en,external_ids,meta")
    .eq("category", categoryFilter)
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

  if (entitiesError) return [];

  const aliasRows = safeArray(aliasesResult?.data);
  const aliasIds = uniqueArray(aliasRows.map((row) => row.entity_id).filter(Boolean));
  let aliasEntities = [];

  if (aliasIds.length) {
    const { data } = await withTimeout(
      supabase
        .from("media_entities")
        .select("id,canonical_key,category,primary_source,title_primary,title_ru,title_en,original_title,year,cover_url,description_ru,description_en,external_ids,meta")
        .eq("category", categoryFilter)
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

  return dedupeAll(
    [...safeArray(entities), ...aliasEntities]
      .map((row) => mapSupabaseBookRowToSearchItem({
        ...row,
        aliases: aliasByEntityId.get(row.id) || []
      }, language))
      .filter(Boolean)
  );
}

async function fetchOpenLibraryByTitle(query) {
  const url = new URL("https://openlibrary.org/search.json");

  url.searchParams.set("title", query);
  url.searchParams.set("limit", String(BOOKS_LIMIT));
  url.searchParams.set(
    "fields",
    [
      "key",
      "title",
      "subtitle",
      "alternative_title",
      "author_name",
      "author_key",
      "first_publish_year",
      "cover_i",
      "isbn",
      "edition_key",
      "ia",
      "subject",
      "person",
      "place",
      "time"
    ].join(",")
  );

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Open Library failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.docs || [];
}

async function fetchOpenLibraryByAuthor(query) {
  const url = new URL("https://openlibrary.org/search.json");

  url.searchParams.set("author", query);
  url.searchParams.set("limit", String(BOOKS_AUTHOR_LIMIT));
  url.searchParams.set(
    "fields",
    [
      "key",
      "title",
      "subtitle",
      "alternative_title",
      "author_name",
      "author_key",
      "first_publish_year",
      "cover_i",
      "isbn",
      "edition_key",
      "ia",
      "subject",
      "person",
      "place",
      "time"
    ].join(",")
  );

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Open Library author failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.docs || [];
}

function extractOpenLibrarySeriesName(doc = {}) {
  const subjectPool = [
    ...safeArray(doc?.subject),
    ...safeArray(doc?.person),
    ...safeArray(doc?.place),
    ...safeArray(doc?.time)
  ];
  const subjects = subjectPool.map((value) => String(value || "").trim()).filter(Boolean);
  const explicitSeries = subjects.find((value) => /(book series|книжн(ая|ой) серия|цикл|series)/i.test(value));
  if (explicitSeries) return explicitSeries;
  return "";
}

function mapOpenLibraryDoc(doc, { mode = "title", language = "ru" } = {}) {
  const workKey = typeof doc?.key === "string" ? doc.key : "";
  const normalizedWorkKey = normalizeOpenLibraryWorkKey(workKey);

  const isbnList = uniqueArray([...safeArray(doc?.isbn).slice(0, 8)]);
  const editionKeys = uniqueArray([...safeArray(doc?.edition_key).slice(0, 8)]);
  const iaKeys = uniqueArray([...safeArray(doc?.ia).slice(0, 5)]);
  const authorNames = uniqueArray([...safeArray(doc?.author_name).map(String).filter(Boolean)]);
  const authorKeys = uniqueArray([...safeArray(doc?.author_key).map(String).filter(Boolean)]);
  const seriesName = extractOpenLibrarySeriesName(doc);
  const openLibraryAlternatives = uniqueArray(safeArray(doc?.alternative_title).map(String).filter(Boolean));
  const openLibraryRuAlternative = openLibraryAlternatives.find((value) => hasCyrillic(value)) || "";
  const sourceTitle = String(doc?.title || "").trim();
  const titleRu = hasCyrillic(sourceTitle) ? sourceTitle : openLibraryRuAlternative;
  const titleEn = sourceTitle;
  const normalizedTitle = language === "en"
    ? (titleEn || titleRu || sourceTitle)
    : (titleRu || titleEn || sourceTitle);

  return {
    canonical_key: normalizedWorkKey
      ? `books:openlibrary:${normalizedWorkKey}`
      : `books:openlibrary:search:${compactString(doc?.title || "unknown")}`,
    category: "books",
    primary_source: "openlibrary",
    title: normalizedTitle,
    title_ru: titleRu,
    title_en: titleEn,
    original_title: sourceTitle,
    year: doc?.first_publish_year || null,
    cover_url: buildOpenLibraryCover(doc),
    description_ru: "",
    description_en: "",
    aliases: uniqueArray([
      sourceTitle,
      ...openLibraryAlternatives,
      ...(doc?.subtitle ? [doc.subtitle] : []),
      ...authorNames
    ]),
    external_ids: {
      openlibrary_work: normalizedWorkKey || null,
      isbn: isbnList,
      edition_key: editionKeys,
      ia: iaKeys
    },
    meta: {
      openlibrary_cover_i: doc?.cover_i || null,
      author_names: authorNames,
      author_keys: authorKeys,
      openlibrary_alternative_titles: openLibraryAlternatives,
      series_name: seriesName,
      series_candidates: uniqueArray([seriesName].filter(Boolean)),
      book_search_mode: mode
    },
    score: 0
  };
}

async function fetchWikidataCandidates(query) {
  const runSearch = async (language = "ru") => {
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.searchParams.set("action", "wbsearchentities");
    url.searchParams.set("format", "json");
    url.searchParams.set("language", language);
    url.searchParams.set("uselang", language);
    url.searchParams.set("type", "item");
    url.searchParams.set("origin", "*");
    url.searchParams.set("limit", String(WIKIDATA_LIMIT));
    url.searchParams.set("search", query);

    const response = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Wikidata failed: ${response.status}`);
    const payload = await response.json();
    return payload?.search || [];
  };

  const [ru, en] = await Promise.allSettled([runSearch("ru"), runSearch("en")]);
  const merged = uniqueArray([
    ...safeArray(ru.status === "fulfilled" ? ru.value : []).map((row) => row?.id).filter(Boolean),
    ...safeArray(en.status === "fulfilled" ? en.value : []).map((row) => row?.id).filter(Boolean)
  ]);

  const dict = new Map();
  safeArray(ru.status === "fulfilled" ? ru.value : []).forEach((row) => row?.id && dict.set(row.id, row));
  safeArray(en.status === "fulfilled" ? en.value : []).forEach((row) => row?.id && !dict.has(row.id) && dict.set(row.id, row));
  return merged.map((id) => dict.get(id)).filter(Boolean).slice(0, WIKIDATA_LIMIT * 2);
}

async function fetchWikidataEntityDetails(ids = []) {
  if (!ids.length) return {};

  const url = new URL("https://www.wikidata.org/w/api.php");

  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("props", "labels|aliases|claims|descriptions|sitelinks");
  url.searchParams.set("languages", "ru|en");
  url.searchParams.set("origin", "*");
  url.searchParams.set("ids", ids.join("|"));

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Wikidata details failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.entities || {};
}

async function fetchWikipediaSummary(title = "", language = "ru") {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) return "";
  const endpoint = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTitle)}`;
  const response = await fetchWithTimeout(endpoint, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Wikipedia ${language} failed: ${response.status}`);
  const payload = await response.json();
  const type = String(payload?.type || "").toLowerCase();
  const extract = String(payload?.extract || "").trim();
  if (!extract || type.includes("disambiguation")) return "";
  return extract.replace(/\n+/g, "\n").trim();
}

async function fetchOpenLibraryWorkDetails(workId = "") {
  const normalized = normalizeOpenLibraryWorkKey(workId);
  if (!normalized) return null;
  const response = await fetchWithTimeout(`https://openlibrary.org/works/${encodeURIComponent(normalized)}.json`, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`OpenLibrary work failed: ${response.status}`);
  return response.json();
}

function extractYearFromWikidataClaims(claims = {}) {
  for (const claim of safeArray(claims.P577)) {
    const value = claim?.mainsnak?.datavalue?.value?.time;

    if (typeof value === "string") {
      const match = value.match(/[+-](\d{4})-/);
      if (match) return Number(match[1]);
    }
  }

  return null;
}

const WIKIDATA_ALLOWED_BOOK_TYPES = new Set([
  "Q571", // book
  "Q8261", // novel
  "Q7725634", // literary work
  "Q47461344", // written work
  "Q277759", // book series
  "Q3331189" // version, edition, or translation
]);

const WIKIDATA_BANNED_BOOK_TYPES = new Set([
  "Q11424", // film
  "Q5398426", // television series
  "Q95074", // fictional character
  "Q5", // human
  "Q7889", // video game
  "Q43229" // organization
]);

const BOOK_SCREEN_NOISE_WORDS = ["film", "movie", "series", "tv", "сериал", "фильм"];

function getWikidataTypeIds(claims = {}) {
  return uniqueArray(
    safeArray(claims?.P31)
      .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
      .filter(Boolean)
  );
}

function isAllowedWikidataBook(claims = {}) {
  const typeIds = getWikidataTypeIds(claims);
  if (!typeIds.length) return false;
  if (typeIds.some((id) => WIKIDATA_BANNED_BOOK_TYPES.has(id))) return false;
  return typeIds.some((id) => WIKIDATA_ALLOWED_BOOK_TYPES.has(id));
}

function hasBookScreenDescriptionNoise(item = {}) {
  const desc = compactString(`${item.description_ru || ""} ${item.description_en || ""}`);
  return BOOK_SCREEN_NOISE_WORDS.some((word) => desc.includes(word));
}

function hasStrictSharedIds(a = {}, b = {}) {
  const aIds = a.external_ids || {};
  const bIds = b.external_ids || {};

  if (aIds.openlibrary_work && bIds.openlibrary_work && normalizeOpenLibraryWorkKey(aIds.openlibrary_work) === normalizeOpenLibraryWorkKey(bIds.openlibrary_work)) {
    return true;
  }
  if (aIds.wikidata && bIds.wikidata && aIds.wikidata === bIds.wikidata) return true;
  if (aIds.tmdb && bIds.tmdb && String(aIds.tmdb) === String(bIds.tmdb)) return true;
  if (a.category !== "books" && b.category !== "books" && hasSharedValue(aIds.isbn, bIds.isbn)) return true;
  return false;
}

function tokenizeNormalizedTitle(value = "") {
  return uniqueArray(
    compactString(value)
      .split(" ")
      .map((token) => token.trim())
      .filter(Boolean)
  );
}

function calcTitleSimilarity(a = "", b = "") {
  const left = tokenizeNormalizedTitle(a);
  const right = tokenizeNormalizedTitle(b);
  if (!left.length || !right.length) return 0;

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) intersection += 1;
  });

  return (2 * intersection) / (leftSet.size + rightSet.size);
}

function collectBookAuthors(item = {}) {
  const meta = item?.meta && typeof item.meta === "object" ? item.meta : {};
  return uniqueArray([
    ...safeArray(meta.author_names),
    ...safeArray(meta.author_keys),
    ...safeArray(meta.authors),
    ...safeArray(item.authors)
  ].map((value) => compactString(value)).filter(Boolean));
}

function hasBookAuthorOverlap(a = {}, b = {}) {
  const authorsA = collectBookAuthors(a);
  const authorsB = collectBookAuthors(b);
  if (!authorsA.length || !authorsB.length) return false;
  return hasSharedValue(authorsA, authorsB);
}

function hasBookSoftMergeSignal(a = {}, b = {}) {
  if (a.category !== "books" || b.category !== "books") return false;
  if (!hasBookAuthorOverlap(a, b)) return false;

  const aTitles = getTitleKeys(a);
  const bTitles = getTitleKeys(b);
  if (!aTitles.length || !bTitles.length) return false;

  return aTitles.some((left) => bTitles.some((right) => {
    if (left === right) return true;
    return calcTitleSimilarity(left, right) > 0.9;
  }));
}

function hasBookMergeSignal(a = {}, b = {}) {
  if (a.category !== "books" || b.category !== "books") return false;
  if (hasStrictSharedIds(a, b)) return true;
  if (hasBookScreenDescriptionNoise(a) || hasBookScreenDescriptionNoise(b)) return false;
  return hasBookSoftMergeSignal(a, b);
}

function resolveBooksPrimarySource(existing = {}, incoming = {}) {
  if (existing.category !== "books" || incoming.category !== "books") {
    return existing.primary_source || incoming.primary_source || "";
  }

  if (existing.primary_source === "wikidata" || incoming.primary_source === "wikidata") {
    return "wikidata";
  }

  return existing.primary_source || incoming.primary_source || "";
}

function extractOpenLibraryWorkIdFromClaims(claims = {}) {
  return (
    safeArray(claims.P648)
      .map((claim) => claim?.mainsnak?.datavalue?.value)
      .find(Boolean) || null
  );
}

function extractIsbnValuesFromClaims(claims = {}) {
  return uniqueArray([
    ...safeArray(claims.P957).map((claim) => claim?.mainsnak?.datavalue?.value),
    ...safeArray(claims.P212).map((claim) => claim?.mainsnak?.datavalue?.value)
  ].filter(Boolean));
}

function extractImageFromWikidataClaims(claims = {}) {
  const image = safeArray(claims.P18)
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .find(Boolean);

  return image ? wikimediaFileUrl(image) : "";
}

function extractEntityIdsFromClaims(claims = {}, property = "") {
  return uniqueArray(
    safeArray(claims?.[property])
      .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
      .filter(Boolean)
  );
}

function resolveWikidataEntityRefs(ids = [], entities = {}) {
  return uniqueArray(ids.map((id) => {
    const entity = entities?.[id];
    const label = entity?.labels?.ru?.value || entity?.labels?.en?.value || "";
    return label || "";
  }));
}

function normalizeBookDisplayLanguage(item = {}, language = "ru") {
  if (item.category !== "books") return item;

  const titleRu = String(item.title_ru || "").trim();
  const titleEn = String(item.title_en || "").trim();
  const originalTitle = String(item.original_title || "").trim();
  const aliases = uniqueArray(safeArray(item.aliases).map(String).filter(Boolean));
  const wikidataLabels = item?.meta?.wikidata_labels || {};
  const wikidataAliases = item?.meta?.wikidata_aliases || {};
  const alternativeTitles = safeArray(item?.meta?.openlibrary_alternative_titles).map(String).filter(Boolean);
  const authorNames = safeArray(item?.meta?.author_names).map(String).filter(Boolean);
  const localizedAuthorName = language === "en"
    ? (authorNames.find((name) => !hasCyrillic(name)) || authorNames[0] || "")
    : (authorNames.find((name) => hasCyrillic(name)) || authorNames[0] || "");

  const ruAlias = uniqueArray([
    ...safeArray(wikidataAliases?.ru),
    ...aliases
  ]).find((alias) => hasCyrillic(alias)) || "";
  const enAlias = uniqueArray([
    ...safeArray(wikidataAliases?.en),
    ...aliases
  ]).find((alias) => !hasCyrillic(alias)) || "";
  const ruAlternative = alternativeTitles.find((alias) => hasCyrillic(alias)) || "";
  const itemTitle = String(item.title || "").trim();

  const localizedTitle = language === "en"
    ? (
      titleEn ||
      String(wikidataLabels?.en || "").trim() ||
      originalTitle ||
      enAlias ||
      titleRu ||
      itemTitle
    )
    : (
      titleRu ||
      String(wikidataLabels?.ru || "").trim() ||
      ruAlias ||
      ruAlternative ||
      (hasCyrillic(itemTitle) ? itemTitle : "") ||
      originalTitle ||
      titleEn ||
      itemTitle
    );

  return {
    ...item,
    title: String(localizedTitle || item.title || "").trim(),
    title_ru: titleRu || (hasCyrillic(localizedTitle) ? String(localizedTitle) : ""),
    title_en: titleEn || (!hasCyrillic(localizedTitle) ? String(localizedTitle) : ""),
    original_title: originalTitle || titleEn || titleRu || item.title || "",
    meta: {
      ...(item.meta || {}),
      author_display_name: localizedAuthorName,
      normalization_ready: true
    }
  };
}

function extractSeriesOrderFromClaims(claims = {}) {
  const values = safeArray(claims?.P179)
    .map((claim) => safeArray(claim?.qualifiers?.P1545).map((row) => row?.datavalue?.value).find(Boolean))
    .filter(Boolean)
    .map((value) => Number(String(value).replace(",", ".")))
    .filter((value) => Number.isFinite(value));

  return values.length ? values[0] : null;
}

function getEntityDisplayLabel(entity = {}) {
  return String(entity?.labels?.ru?.value || entity?.labels?.en?.value || "").trim();
}

function extractSeriesItemsFromSeriesEntity(seriesEntity = {}, entities = {}) {
  const seriesClaims = seriesEntity?.claims || {};
  const partOfSeriesIds = extractEntityIdsFromClaims(seriesClaims, "P527");

  const mapped = partOfSeriesIds.map((id) => {
    const entity = entities?.[id] || {};
    const label = getEntityDisplayLabel(entity);
    const itemClaims = entity?.claims || {};
    const year = extractYearFromWikidataClaims(itemClaims);
    const rawOrder = safeArray(itemClaims?.P179)
      .filter((claim) => claim?.mainsnak?.datavalue?.value?.id === seriesEntity?.id)
      .map((claim) => safeArray(claim?.qualifiers?.P1545).map((row) => row?.datavalue?.value).find(Boolean))
      .find(Boolean) || "";
    const order = Number(String(rawOrder).replace(",", "."));

    return {
      wikidata: id,
      title: label,
      year: Number.isFinite(year) ? year : null,
      order: Number.isFinite(order) ? order : null
    };
  }).filter((row) => row.wikidata && row.title);

  return mapped.sort((a, b) => {
    const aOrder = Number.isFinite(a.order) ? a.order : Number.POSITIVE_INFINITY;
    const bOrder = Number.isFinite(b.order) ? b.order : Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aYear = Number.isFinite(a.year) ? a.year : Number.POSITIVE_INFINITY;
    const bYear = Number.isFinite(b.year) ? b.year : Number.POSITIVE_INFINITY;
    if (aYear !== bYear) return aYear - bYear;
    return a.title.localeCompare(b.title, "ru");
  });
}

function mapWikidataBookEntity(searchItem, details, entities = {}, seriesItemsById = {}, wikiExtracts = {}) {
  const labels = details?.labels || {};
  const aliases = details?.aliases || {};
  const claims = details?.claims || {};
  const descriptions = details?.descriptions || {};
  const sitelinks = details?.sitelinks || {};

  const titleRu = labels?.ru?.value || "";
  const titleEn = labels?.en?.value || "";
  const aliasesRu = safeArray(aliases?.ru).map((item) => item?.value).filter(Boolean);
  const aliasesEn = safeArray(aliases?.en).map((item) => item?.value).filter(Boolean);
  const isbns = extractIsbnValuesFromClaims(claims);
  const openLibraryWork = extractOpenLibraryWorkIdFromClaims(claims);
  const wikidataImage = extractImageFromWikidataClaims(claims);
  const authorIds = extractEntityIdsFromClaims(claims, "P50");
  const seriesIds = extractEntityIdsFromClaims(claims, "P179");
  const previousIds = extractEntityIdsFromClaims(claims, "P155");
  const nextIds = extractEntityIdsFromClaims(claims, "P156");
  const basedOnIds = extractEntityIdsFromClaims(claims, "P144");
  const derivativeIds = uniqueArray([
    ...extractEntityIdsFromClaims(claims, "P4969"),
    ...extractEntityIdsFromClaims(claims, "P361")
  ]);
  const adaptationIds = extractEntityIdsFromClaims(claims, "P1441");
  const editionsOrTranslationsIds = uniqueArray([
    ...extractEntityIdsFromClaims(claims, "P629"),
    ...extractEntityIdsFromClaims(claims, "P747")
  ]);
  const resolvedSeries = resolveWikidataEntityRefs(seriesIds, entities);
  const resolvedSeriesName = resolvedSeries[0] || "";
  const authorNames = resolveWikidataEntityRefs(authorIds, entities);
  const authorId = authorIds[0] || null;
  const seriesId = seriesIds[0] || null;
  const seriesItems = seriesId ? safeArray(seriesItemsById?.[seriesId]) : [];
  const seriesOrder = extractSeriesOrderFromClaims(claims);
  const previousLabel = resolveWikidataEntityRefs(previousIds, entities);
  const nextLabel = resolveWikidataEntityRefs(nextIds, entities);
  const qid = searchItem.id;
  const wikiRuExtract = String(wikiExtracts?.[qid]?.ru || "").trim();
  const wikiEnExtract = String(wikiExtracts?.[qid]?.en || "").trim();

  return {
    canonical_key: `books:wikidata:${searchItem.id}`,
    category: "books",
    primary_source: "wikidata",
    title: titleRu || titleEn || searchItem?.label || "",
    title_ru: titleRu,
    title_en: titleEn,
    original_title: titleEn || titleRu || searchItem?.label || "",
    year: extractYearFromWikidataClaims(claims),
    cover_url: wikidataImage || "",
    description_ru: wikiRuExtract || descriptions?.ru?.value || "",
    description_en: wikiEnExtract || descriptions?.en?.value || "",
    aliases: uniqueArray([
      searchItem?.label,
      searchItem?.match?.text,
      titleRu,
      titleEn,
      ...aliasesRu,
      ...aliasesEn
    ]),
    external_ids: {
      wikidata: searchItem.id,
      openlibrary_work: openLibraryWork,
      isbn: isbns
    },
    meta: {
      wikidata_p18: safeArray(claims.P18).map((claim) => claim?.mainsnak?.datavalue?.value).find(Boolean) || "",
      wikidata_labels: {
        ru: titleRu,
        en: titleEn
      },
      wikidata_sitelinks: {
        ruwiki: sitelinks?.ruwiki?.title || "",
        enwiki: sitelinks?.enwiki?.title || ""
      },
      wikidata_aliases: {
        ru: aliasesRu,
        en: aliasesEn
      },
      author_keys: authorIds,
      author_names: authorNames,
      author_wikidata_id: authorId,
      wikidata_series_name: resolvedSeriesName,
      series_name: resolvedSeriesName,
      series_items: seriesItems,
      series_order: seriesOrder,
      series_candidates: uniqueArray([
        ...resolvedSeries,
        ...seriesIds
      ]),
      wikidata_relations: {
        series: uniqueArray([...resolvedSeries, ...seriesIds]),
        previous: uniqueArray([...previousLabel, ...previousIds]),
        next: uniqueArray([...nextLabel, ...nextIds]),
        based_on: uniqueArray([...resolveWikidataEntityRefs(basedOnIds, entities), ...basedOnIds]),
        adaptations: uniqueArray([...resolveWikidataEntityRefs(adaptationIds, entities), ...adaptationIds]),
        derivative_work: uniqueArray([...resolveWikidataEntityRefs(derivativeIds, entities), ...derivativeIds]),
        editions_or_translations: uniqueArray([...resolveWikidataEntityRefs(editionsOrTranslationsIds, entities), ...editionsOrTranslationsIds])
      }
    },
    score: 0
  };
}

function fallbackCoverResolver(entity = {}) {
  const category = sanitizeCategory(entity.category);
  const ids = entity.external_ids || {};

  if (category === "books") {
    const fromCoverId = openLibraryCoverUrlFromId(entity?.meta?.openlibrary_cover_i || ids.cover_i);
    if (fromCoverId) return fromCoverId;

    const isbn = safeArray(ids.isbn)[0] || "";
    if (isbn) return openLibraryCoverUrlFromIsbn(isbn);

    const edition = safeArray(ids.edition_key)[0] || "";
    if (edition) return openLibraryCoverUrlFromOlid(edition);

    const wdP18 = entity?.meta?.wikidata_p18 || "";
    if (wdP18) return wikimediaFileUrl(wdP18);
  }

  if (category === "movies" || category === "series") {
    if (entity?.meta?.tmdb_poster_path) {
      return buildTmdbImage(entity.meta.tmdb_poster_path);
    }
  }

  if (category === "anime" || category === "manga") {
    if (entity?.meta?.anilist_cover) {
      return entity.meta.anilist_cover;
    }
  }

  return "";
}

function applyFinalCategoryFilter(items = [], category = "") {
  const normalized = sanitizeCategory(category);
  return safeArray(items).filter((item) => !normalized || sanitizeCategory(item.category) === normalized);
}

function applyBookScreenPenalty(item = {}) {
  if (item.category !== "books") return item;
  if (hasBookScreenDescriptionNoise(item)) {
    return { ...item, score: (item.score || 0) - 100 };
  }
  return item;
}

function scoreBookResult(query, item) {
  const q = compactString(query);
  const title = compactString(item.title || "");
  const titleRu = compactString(item.title_ru || "");
  const titleEn = compactString(item.title_en || "");
  const originalTitle = compactString(item.original_title || "");
  const searchMode = String(item?.meta?.book_search_mode || "").trim().toLowerCase();
  const aliases = safeArray(item.aliases).map(compactString);
  const authorNames = uniqueArray([
    ...safeArray(item?.meta?.author_names),
    ...safeArray(item?.meta?.authors),
    ...safeArray(item?.authors)
  ])
    .map(compactString)
    .filter(Boolean);

  let score = 0;
  const titlesPool = uniqueArray([title, titleRu, titleEn, originalTitle].filter(Boolean));

  if (titlesPool.some((candidate) => candidate === q)) score += 420;
  if (titlesPool.some((candidate) => candidate.startsWith(q))) score += 180;
  if (titlesPool.some((candidate) => candidate.includes(q))) score += 110;
  if (aliases.includes(q)) score += 90;
  if (aliases.some((alias) => alias.startsWith(q))) score += 55;
  if (aliases.some((alias) => alias.includes(q))) score += 35;
  if (authorNames.includes(q)) score += 45;
  if (authorNames.some((author) => author.includes(q))) score += 24;
  if (searchMode === "title") score += 70;
  if (searchMode === "author") score += 12;
  if (item.cover_url) score += 8;
  if (item.year) score += 10;
  if (Object.keys(item.external_ids || {}).some((key) => {
    const value = item.external_ids?.[key];
    return Array.isArray(value) ? value.length : Boolean(value);
  })) score += 15;
  if ((item.title || "").trim().length < 2) score -= 50;

  return score;
}

function enrichBooksWithOpenLibrary(wikidataItems, openLibraryItems) {
  return safeArray(wikidataItems).map((item) => {
    const match = safeArray(openLibraryItems).find((candidate) => hasBookMergeSignal(item, candidate));
    return match ? mergeItems(item, match) : item;
  });
}

function sortBooksSeriesAware(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aSeries = compactString(a?.meta?.series_name || "");
    const bSeries = compactString(b?.meta?.series_name || "");
    if (aSeries && bSeries && aSeries === bSeries) {
      const aOrder = Number.isFinite(Number(a?.meta?.series_order)) ? Number(a.meta.series_order) : Number.POSITIVE_INFINITY;
      const bOrder = Number.isFinite(Number(b?.meta?.series_order)) ? Number(b.meta.series_order) : Number.POSITIVE_INFINITY;
      if (aOrder !== bOrder) return aOrder - bOrder;
      const aYear = Number.isFinite(Number(a?.year)) ? Number(a.year) : Number.POSITIVE_INFINITY;
      const bYear = Number.isFinite(Number(b?.year)) ? Number(b.year) : Number.POSITIVE_INFINITY;
      if (aYear !== bYear) return aYear - bYear;
    }
    return (b.score || 0) - (a.score || 0);
  });
}

async function searchBooks(query, { modal = true } = {}) {
  const cleanQuery = normalizeQuery(query);
  const language = getSystemLanguage();

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  const dbResultsPromise = fetchBooksFromSupabase(cleanQuery, language).catch(() => []);

  const [olTitleResult, olAuthorResult, wdResult, dbResults] = await Promise.allSettled([
    fetchOpenLibraryByTitle(cleanQuery),
    fetchOpenLibraryByAuthor(cleanQuery),
    fetchWikidataCandidates(cleanQuery),
    dbResultsPromise
  ]);

  const openLibraryTitleItems =
    olTitleResult.status === "fulfilled"
      ? safeArray(olTitleResult.value).map((doc) => mapOpenLibraryDoc(doc, { mode: "title", language }))
      : [];

  const openLibraryAuthorItems =
    olAuthorResult.status === "fulfilled"
      ? safeArray(olAuthorResult.value).map((doc) => mapOpenLibraryDoc(doc, { mode: "author", language }))
      : [];

  let wikidataItems = [];
  let openLibraryItems = [...openLibraryTitleItems, ...openLibraryAuthorItems];
  const supabaseItems = dbResults.status === "fulfilled" ? safeArray(dbResults.value) : [];

  if (wdResult.status === "fulfilled") {
    const ids = uniqueArray(safeArray(wdResult.value)
      .map((item) => item.id)
      .filter(Boolean));

    const detailsResult = await fetchWikidataEntityDetails(ids).catch(() => ({}));
    const filteredCandidates = safeArray(wdResult.value).filter((candidate) => {
      const details = detailsResult[candidate.id] || {};
      const claims = details?.claims || {};
      const typeIds = getWikidataTypeIds(claims);
      const allowed = isAllowedWikidataBook(claims);
      if (!typeIds.length) return false;
      if (!allowed) return false;
      return true;
    });

    const bookEntityIds = filteredCandidates.map((candidate) => candidate.id);
    const authorIds = uniqueArray(bookEntityIds.flatMap((id) => extractEntityIdsFromClaims(detailsResult?.[id]?.claims || {}, "P50")));
    const seriesIds = uniqueArray(bookEntityIds.flatMap((id) => extractEntityIdsFromClaims(detailsResult?.[id]?.claims || {}, "P179")));
    const authorOnlyIds = uniqueArray(safeArray(wdResult.value)
      .filter((candidate) => {
        const claims = detailsResult?.[candidate.id]?.claims || {};
        const types = getWikidataTypeIds(claims);
        return types.includes("Q5");
      })
      .map((candidate) => candidate.id));
    if (authorOnlyIds.length) {
      const authorBookIds = uniqueArray(authorOnlyIds.flatMap((authorId) => {
        const claims = detailsResult?.[authorId]?.claims || {};
        return extractEntityIdsFromClaims(claims, "P800");
      }));
      if (authorBookIds.length) {
        const authorBookEntities = await fetchWikidataEntityDetails(authorBookIds).catch(() => ({}));
        authorBookIds.forEach((id) => {
          if (!detailsResult[id] && authorBookEntities[id]) detailsResult[id] = authorBookEntities[id];
        });
      }
    }
    const relationIds = uniqueArray(bookEntityIds.flatMap((id) => {
      const claims = detailsResult?.[id]?.claims || {};
      return [
        ...extractEntityIdsFromClaims(claims, "P155"),
        ...extractEntityIdsFromClaims(claims, "P156"),
        ...extractEntityIdsFromClaims(claims, "P144"),
        ...extractEntityIdsFromClaims(claims, "P4969"),
        ...extractEntityIdsFromClaims(claims, "P629"),
        ...extractEntityIdsFromClaims(claims, "P747")
      ];
    }));
    const firstLevelRefIds = uniqueArray([...authorIds, ...seriesIds, ...relationIds]);
    const firstLevelRefs = await fetchWikidataEntityDetails(firstLevelRefIds).catch(() => ({}));
    const seriesItemIds = uniqueArray(seriesIds.flatMap((seriesId) => extractEntityIdsFromClaims(firstLevelRefs?.[seriesId]?.claims || {}, "P527")));
    const seriesItemEntities = await fetchWikidataEntityDetails(seriesItemIds).catch(() => ({}));
    const mergedRefs = { ...firstLevelRefs, ...seriesItemEntities };
    const wikiExtracts = {};
    await Promise.allSettled(filteredCandidates.map(async (candidate) => {
      const sl = detailsResult?.[candidate.id]?.sitelinks || {};
      const ruTitle = sl?.ruwiki?.title || "";
      const enTitle = sl?.enwiki?.title || "";
      const [ru, en] = await Promise.allSettled([
        ruTitle ? fetchWikipediaSummary(ruTitle, "ru") : Promise.resolve(""),
        enTitle ? fetchWikipediaSummary(enTitle, "en") : Promise.resolve("")
      ]);
      wikiExtracts[candidate.id] = {
        ru: ru.status === "fulfilled" ? ru.value : "",
        en: en.status === "fulfilled" ? en.value : ""
      };
    }));
    const seriesItemsById = {};
    seriesIds.forEach((seriesId) => {
      const seriesEntity = firstLevelRefs?.[seriesId];
      if (!seriesEntity) return;
      seriesItemsById[seriesId] = extractSeriesItemsFromSeriesEntity(seriesEntity, mergedRefs);
    });

    wikidataItems = filteredCandidates
      .map((candidate) => {
        const details = detailsResult[candidate.id] || {};
        return mapWikidataBookEntity(candidate, details, mergedRefs, seriesItemsById, wikiExtracts);
      })
      .filter(Boolean);
  }

  const enrichedOlItems = await Promise.allSettled(openLibraryItems.map(async (item) => {
    const workId = item?.external_ids?.openlibrary_work;
    if (!workId) return item;
    const details = await fetchOpenLibraryWorkDetails(workId).catch(() => null);
    const description = typeof details?.description === "string"
      ? details.description
      : String(details?.description?.value || "").trim();
    const covers = safeArray(details?.covers);
    return {
      ...item,
      cover_url: item.cover_url || openLibraryCoverUrlFromId(covers[0]) || "",
      description_en: item.description_en || description || "",
      meta: {
        ...(item.meta || {}),
        openlibrary_covers: covers
      }
    };
  }));

  openLibraryItems = enrichedOlItems
    .filter((row) => row.status === "fulfilled")
    .map((row) => row.value);

  const enrichedWikidata = enrichBooksWithOpenLibrary(wikidataItems, openLibraryItems);
  const sourcePool = [...supabaseItems, ...(enrichedWikidata.length ? enrichedWikidata : []), ...openLibraryItems];
  const deduped = dedupeBooks(sourcePool)
    .map((item) => normalizeBookDisplayLanguage(item, language))
    .map((item) => ({
      ...item,
      cover_url: item.cover_url || fallbackCoverResolver(item),
      score: scoreBookResult(cleanQuery, item)
    }))
    .sort((a, b) => b.score - a.score);

  const ordered = sortBooksSeriesAware(deduped);
  return modal ? ordered.slice(0, SEARCH_LIMITS.MODAL_RESULTS) : ordered;
}

/* =========================
   MOVIES / SERIES
========================= */

function buildTmdbImage(path) {
  return path ? `https://image.tmdb.org/t/p/w500${path}` : "";
}

function mapTmdbItem(item = {}, forcedCategory = "") {
  const isSeries = forcedCategory ? forcedCategory === "series" : item.media_type === "tv";

  const title =
    item.title ||
    item.name ||
    item.original_title ||
    item.original_name ||
    "";

  const originalTitle =
    item.original_title ||
    item.original_name ||
    title ||
    "";

  const yearSource = item.release_date || item.first_air_date || "";
  const year = yearSource ? Number(String(yearSource).slice(0, 4)) : null;

  return {
    canonical_key: `${isSeries ? "series" : "movies"}:tmdb:${item.id}`,
    category: isSeries ? "series" : "movies",
    primary_source: "tmdb",
    title,
    original_title: originalTitle,
    year: safeNumberYear(year),
    cover_url: buildTmdbImage(item.poster_path),
    description_ru: item.overview || "",
    description_en: "",
    aliases: uniqueArray([title, originalTitle]),
    external_ids: { tmdb: item.id },
    meta: {
      tmdb_poster_path: item.poster_path || ""
    },
    score: item.poster_path ? 20 : 0
  };
}

async function searchTmdbMulti(query) {
  const cleanQuery = normalizeQuery(query);

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  if (!TMDB_API_KEY) return [];

  const url = new URL("https://api.themoviedb.org/3/search/multi");

  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("query", cleanQuery);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "ru-RU");
  url.searchParams.set("page", "1");

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`TMDB failed: ${response.status}`);
  }

  const payload = await response.json();

  return safeArray(payload?.results)
    .filter((item) => item?.media_type === "movie" || item?.media_type === "tv")
    .map((item) => mapTmdbItem(item))
    .slice(0, TMDB_LIMIT);
}

function scoreScreenResult(query, item) {
  const q = compactString(query);
  const title = compactString(item.title || "");
  const originalTitle = compactString(item.original_title || "");
  const aliases = safeArray(item.aliases).map(compactString);
  let score = item.score || 0;

  if (title === q || originalTitle === q) score += 150;
  if (aliases.includes(q)) score += 100;
  if (title.startsWith(q) || originalTitle.startsWith(q) || aliases.some((alias) => alias.startsWith(q))) score += 50;
  if (title.includes(q) || originalTitle.includes(q) || aliases.some((alias) => alias.includes(q))) score += 20;
  if (item.cover_url) score += 40;
  if (item.year) score += 10;
  if (Object.keys(item.external_ids || {}).some((key) => {
    const value = item.external_ids?.[key];
    return Array.isArray(value) ? value.length : Boolean(value);
  })) score += 15;
  if (!item.cover_url) score -= 35;
  if ((item.title || "").trim().length < 2) score -= 50;

  return score;
}

async function searchMovies(query) {
  const multi = await searchTmdbMulti(query);
  return safeArray(multi)
    .filter((item) => item.category === 'movies')
    .map((item) => ({ ...item, score: scoreScreenResult(query, item) }))
    .sort((a,b)=>b.score-a.score)
    .slice(0, SEARCH_LIMITS.MODAL_RESULTS);
}

async function searchSeries(query) {
  const multi = await searchTmdbMulti(query);
  return safeArray(multi)
    .filter((item) => item.category === 'series')
    .map((item) => ({ ...item, score: scoreScreenResult(query, item) }))
    .sort((a,b)=>b.score-a.score)
    .slice(0, SEARCH_LIMITS.MODAL_RESULTS);
}

/* =========================
   ANIME / MANGA
========================= */

function buildAniListGraphqlBody(query, type) {
  return {
    query: `
      query ($search: String, $type: MediaType) {
        Page(page: 1, perPage: ${ANILIST_LIMIT}) {
          media(search: $search, type: $type) {
            id
            title {
              romaji
              english
              native
            }
            description(asHtml: false)
            coverImage {
              large
              medium
            }
            startDate {
              year
            }
          }
        }
      }
    `,
    variables: {
      search: query,
      type: type === "manga" ? "MANGA" : "ANIME"
    }
  };
}

function cleanAniListDescription(value = "") {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function mapAniListItem(item = {}, category = "anime") {
  const title =
    item?.title?.native ||
    item?.title?.english ||
    item?.title?.romaji ||
    "";

  const originalTitle =
    item?.title?.romaji ||
    item?.title?.english ||
    item?.title?.native ||
    title;

  return {
    canonical_key: `${category}:anilist:${item.id}`,
    category,
    primary_source: "anilist",
    title,
    original_title: originalTitle,
    year: safeNumberYear(item?.startDate?.year),
    cover_url: item?.coverImage?.large || item?.coverImage?.medium || "",
    description_ru: cleanAniListDescription(item?.description || ""),
    description_en: "",
    aliases: uniqueArray([
      item?.title?.native,
      item?.title?.english,
      item?.title?.romaji
    ]),
    external_ids: { anilist: item.id },
    meta: {
      anilist_cover: item?.coverImage?.large || item?.coverImage?.medium || ""
    },
    score: item?.coverImage?.large ? 20 : 0
  };
}

async function searchAnimeOrManga(query, category = "anime") {
  const cleanQuery = normalizeQuery(query);

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  const anilistItems = await (async () => {
    const response = await fetchWithTimeout(API_ENDPOINTS.ANILIST, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(buildAniListGraphqlBody(cleanQuery, category))
    });

    if (!response.ok) {
      throw new Error(`AniList failed: ${response.status}`);
    }

    const payload = await response.json();
    return safeArray(payload?.data?.Page?.media)
      .map((item) => mapAniListItem(item, category));
  })().catch((error) => {
    console.debug("AniList search error:", error);
    return [];
  });

  if (anilistItems.length) {
    return anilistItems
      .map((item) => ({ ...item, score: scoreScreenResult(cleanQuery, item) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, SEARCH_LIMITS.MODAL_RESULTS);
  }

  const jikanType = category === "manga" ? "manga" : "anime";
  const jikanUrl = new URL(`${API_ENDPOINTS.JIKAN}/${jikanType}`);
  jikanUrl.searchParams.set("q", cleanQuery);
  jikanUrl.searchParams.set("limit", String(ANILIST_LIMIT));
  jikanUrl.searchParams.set("sfw", "true");

  const jikanResponse = await fetchWithTimeout(jikanUrl.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!jikanResponse.ok) {
    throw new Error(`Jikan failed: ${jikanResponse.status}`);
  }

  const jikanPayload = await jikanResponse.json();
  const jikanItems = safeArray(jikanPayload?.data).map((item = {}) => {
    const title = item?.title || item?.title_english || item?.title_japanese || "";
    const originalTitle = item?.title_japanese || item?.title_english || title;
    return {
      canonical_key: `${category}:mal:${item?.mal_id}`,
      category,
      primary_source: "jikan",
      title,
      original_title: originalTitle,
      year: safeNumberYear(item?.year || item?.aired?.prop?.from?.year || item?.published?.prop?.from?.year),
      cover_url: item?.images?.jpg?.large_image_url || item?.images?.jpg?.image_url || "",
      description_ru: String(item?.synopsis || "").trim(),
      description_en: "",
      aliases: uniqueArray([title, originalTitle, item?.title_english, item?.title_japanese]),
      external_ids: { mal: item?.mal_id || null },
      meta: {
        mal_id: item?.mal_id || null
      },
      score: item?.images?.jpg?.large_image_url ? 20 : 0
    };
  });

  return jikanItems
    .map((item) => ({ ...item, score: scoreScreenResult(cleanQuery, item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_LIMITS.MODAL_RESULTS);
}

function hasAnimeOrMangaMatch(item, animeMangaItems = []) {
  const itemTitles = getTitleKeys(item);

  if (!itemTitles.length) return false;

  return safeArray(animeMangaItems).some((candidate) => {
    const candidateTitles = getTitleKeys(candidate);
    return itemTitles.some((title) => candidateTitles.includes(title));
  });
}

function filterCrossCategoryNoise({ books = [], moviesSeries = [], anime = [], manga = [] }) {
  const animeMangaItems = [...anime, ...manga];

  const filteredMoviesSeries = safeArray(moviesSeries).filter((item) => {
    if (!animeMangaItems.length) return true;

    const itemTitle = compactString(item.title || item.original_title || "");
    const isLikelyAnimeTitle = hasAnimeOrMangaMatch(item, animeMangaItems);

    if (isLikelyAnimeTitle) return false;

    if (itemTitle.includes("naruto") || itemTitle.includes("наруто")) {
      return false;
    }

    return true;
  });

  const filteredBooks = safeArray(books).filter((item) => {
    if (!animeMangaItems.length) return true;

    const itemTitle = compactString(item.title || item.original_title || "");

    if (itemTitle.includes("naruto") || itemTitle.includes("наруто")) {
      return false;
    }

    return true;
  });

  return {
    books: filteredBooks,
    moviesSeries: filteredMoviesSeries,
    anime,
    manga
  };
}

function hasConflictData(item = {}) {
  if (item.category === "books") {
    const ids = item.external_ids || {};
    if (ids.tmdb || ids.imdb) return true;
  }
  return false;
}

function validateFinalItem(item = {}) {
  if (!item?.title || !item?.category || !item?.canonical_key) {
    console.debug("invalid entity: missing required fields", item?.canonical_key || item?.title || "unknown");
    return false;
  }
  if (!["books", "movies", "series", "anime", "manga"].includes(item.category)) {
    console.debug("invalid entity: unsupported category", item.category, item.canonical_key);
    return false;
  }
  if (hasConflictData(item)) {
    console.debug("invalid entity: conflicting data", item.canonical_key);
    return false;
  }
  return true;
}

/* =========================
   MAIN
========================= */

export async function runGlobalSearch(query) {
  const cleanQuery = normalizeQuery(query);
  const language = getSystemLanguage();
  const cacheKey = getSearchCacheKey("global", cleanQuery);
  const cached = getCachedSearchResult(cacheKey);
  if (cached) return cached;

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return emptyGroups();
  }

  const settled = await Promise.allSettled([
    searchBooks(cleanQuery),
    searchMovies(cleanQuery),
    searchSeries(cleanQuery),
    searchAnimeOrManga(cleanQuery, "anime"),
    searchAnimeOrManga(cleanQuery, "manga")
  ]);

  const grouped = {
    books: settled[0].status === "fulfilled" ? settled[0].value : [],
    movies: settled[1].status === "fulfilled" ? settled[1].value : [],
    series: settled[2].status === "fulfilled" ? settled[2].value : [],
    anime: settled[3].status === "fulfilled" ? settled[3].value : [],
    manga: settled[4].status === "fulfilled" ? settled[4].value : []
  };

  const merged = dedupeAll(flattenGroups(grouped))
    .map((item) => item?.category === "books" ? normalizeBookDisplayLanguage(item, language) : item)
    .map((item) => ({
      ...item,
      score: item.category === "books" ? scoreBookResult(cleanQuery, item) : scoreScreenResult(cleanQuery, item)
    }))
    .map((item) => {
      const cover = item.cover_url || fallbackCoverResolver(item);
      const missingCoverPenalty = item.category === "books" ? 0 : 20;
      return {
        ...item,
        cover_url: cover,
        score: cover ? item.score : (item.score || 0) - missingCoverPenalty
      };
    })
    .map((item) => applyBookScreenPenalty(item))
    .map((item) => normalizeSearchResult(item))
    .filter((item) => item && validateFinalItem(item))
    .sort((a, b) => b.score - a.score);

  const groupedResult = groupItems(merged);
  setCachedSearchResult(cacheKey, groupedResult);

  return groupedResult;
}

export async function runCategorySearch(query, category) {
  const cleanQuery = normalizeQuery(query);
  const language = getSystemLanguage();
  const normalizedCategory = sanitizeCategory(category);
  const cacheKey = getSearchCacheKey("category", cleanQuery, normalizedCategory);
  const cached = getCachedSearchResult(cacheKey);
  if (cached) return cached;

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  let result = [];

  if (normalizedCategory === "books") result = dedupeAll(await searchBooks(cleanQuery, { modal: false }));
  if (normalizedCategory === "movies") result = dedupeAll(await searchMovies(cleanQuery));
  if (normalizedCategory === "series") result = dedupeAll(await searchSeries(cleanQuery));
  if (normalizedCategory === "anime") result = dedupeAll(await searchAnimeOrManga(cleanQuery, "anime"));
  if (normalizedCategory === "manga") result = dedupeAll(await searchAnimeOrManga(cleanQuery, "manga"));

  result = applyFinalCategoryFilter(result, normalizedCategory)
    .map((item) => item?.category === "books" ? normalizeBookDisplayLanguage(item, language) : item)
    .map((item) => {
      const cover = item.cover_url || fallbackCoverResolver(item);
      const missingCoverPenalty = item.category === "books" ? 0 : 20;
      return {
        ...item,
        cover_url: cover,
        score: cover ? (item.score || 0) : (item.score || 0) - missingCoverPenalty
      };
    })
    .map((item) => applyBookScreenPenalty(item))
    .filter((item) => validateFinalItem(item))
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  setCachedSearchResult(cacheKey, result);
  return result;
}

export async function addSearchResultDirectlyToLibrary({ userId, item }) {
  if (!userId) {
    throw new Error("Нужно войти в аккаунт");
  }

  if (!item?.canonical_key) {
    throw new Error("Некорректная карточка");
  }

  return addToUserLibrary({
    userId,
    entity: item
  });
}

export function flattenResults(grouped) {
  return flattenGroups(grouped);
}

export function sortByScore(items = []) {
  return sortByScoreInternal(items);
}

export function limitResults(items = [], limit = SEARCH_LIMITS.PAGE_RESULTS) {
  return limitInternal(items, limit);
}
