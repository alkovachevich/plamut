import {
  SEARCH_LIMITS,
  API_ENDPOINTS
} from "../config.js";
import {
  normalizeString,
  compactString,
  uniqueArray,
  safeArray
} from "../utils.js";

/* =========================
   WIKIDATA
========================= */

async function fetchWikidataCandidates(query) {
  const url = new URL("https://www.wikidata.org/w/api.php");

  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "ru");
  url.searchParams.set("uselang", "ru");
  url.searchParams.set("type", "item");
  url.searchParams.set("origin", "*");
  url.searchParams.set("limit", "12");
  url.searchParams.set("search", query);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Wikidata search failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.search || [];
}

async function fetchWikidataEntityDetails(ids = []) {
  if (!ids.length) return {};

  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("props", "labels|aliases|claims|descriptions|sitelinks");
  url.searchParams.set("languages", "ru|en");
  url.searchParams.set("sitefilter", "enwiki|ruwiki");
  url.searchParams.set("origin", "*");
  url.searchParams.set("ids", ids.join("|"));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Wikidata details failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.entities || {};
}

function extractYearFromWikidataClaims(claims = {}) {
  const publicationClaims = safeArray(claims.P577);

  for (const claim of publicationClaims) {
    const value = claim?.mainsnak?.datavalue?.value?.time;
    if (typeof value === "string") {
      const match = value.match(/[+-](\d{4})-/);
      if (match) return Number(match[1]);
    }
  }

  return null;
}

function extractOpenLibraryWorkIdFromClaims(claims = {}) {
  const values = safeArray(claims.P648).map(
    (claim) => claim?.mainsnak?.datavalue?.value
  );

  return values.find(Boolean) || null;
}

function extractGoogleBooksIdFromClaims(claims = {}) {
  const values = safeArray(claims.P675).map(
    (claim) => claim?.mainsnak?.datavalue?.value
  );

  return values.find(Boolean) || null;
}

function extractIsbnValuesFromClaims(claims = {}) {
  const isbn10 = safeArray(claims.P957).map(
    (claim) => claim?.mainsnak?.datavalue?.value
  );

  const isbn13 = safeArray(claims.P212).map(
    (claim) => claim?.mainsnak?.datavalue?.value
  );

  return uniqueArray([...isbn10, ...isbn13]);
}

function mapWikidataBookEntity(searchItem, entityDetails) {
  const labels = entityDetails?.labels || {};
  const aliases = entityDetails?.aliases || {};
  const claims = entityDetails?.claims || {};
  const descriptions = entityDetails?.descriptions || {};

  const titleRu = labels?.ru?.value || "";
  const titleEn = labels?.en?.value || "";
  const originalTitle = titleRu || titleEn || searchItem?.label || "";
  const allAliases = uniqueArray([
    searchItem?.label,
    searchItem?.match?.text,
    titleRu,
    titleEn,
    ...safeArray(aliases?.ru).map((item) => item?.value),
    ...safeArray(aliases?.en).map((item) => item?.value)
  ]);

  return {
    canonical_key: `books:wikidata:${searchItem.id}`,
    category: "books",
    primary_source: "wikidata",
    title_primary: titleRu || titleEn || searchItem?.label || "",
    title_ru: titleRu,
    title_en: titleEn,
    original_title: originalTitle,
    year: extractYearFromWikidataClaims(claims),
    cover_url: "",
    description_ru: descriptions?.ru?.value || "",
    description_en: descriptions?.en?.value || "",
    aliases: allAliases,
    external_ids: {
      wikidata: searchItem.id,
      openlibrary_work: extractOpenLibraryWorkIdFromClaims(claims),
      google_books: extractGoogleBooksIdFromClaims(claims),
      isbn: extractIsbnValuesFromClaims(claims)
    }
  };
}

/* =========================
   OPEN LIBRARY
========================= */

async function fetchOpenLibraryByTitle(query) {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("title", query);
  url.searchParams.set("limit", "10");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Open Library title search failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.docs || [];
}

async function fetchOpenLibraryByIsbn(isbnList = []) {
  const clean = isbnList.filter(Boolean).slice(0, 3);
  if (!clean.length) return [];

  const docs = [];

  for (const isbn of clean) {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("isbn", isbn);
    url.searchParams.set("limit", "3");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) continue;

    const payload = await response.json();
    docs.push(...safeArray(payload?.docs));
  }

  return docs;
}

function pickOpenLibraryCover(doc) {
  if (doc?.cover_i) {
    return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
  }
  return "";
}

function buildOpenLibraryAliases(doc) {
  return uniqueArray([
    doc?.title,
    ...safeArray(doc?.alternative_title),
    ...safeArray(doc?.subtitle ? [doc.subtitle] : [])
  ]);
}

function mapOpenLibraryDoc(doc) {
  const workKey = typeof doc?.key === "string" ? doc.key : "";
  const normalizedWorkKey = workKey.startsWith("/works/") ? workKey.replace("/works/", "") : workKey;

  return {
    canonical_key: normalizedWorkKey
      ? `books:openlibrary:${normalizedWorkKey}`
      : `books:openlibrary:search:${compactString(doc?.title || "unknown")}`,
    category: "books",
    primary_source: "openlibrary",
    title_primary: doc?.title || "",
    title_ru: "",
    title_en: doc?.title || "",
    original_title: doc?.title || "",
    year: doc?.first_publish_year || null,
    cover_url: pickOpenLibraryCover(doc),
    description_ru: "",
    description_en: "",
    aliases: buildOpenLibraryAliases(doc),
    external_ids: {
      openlibrary_work: normalizedWorkKey || null,
      isbn: uniqueArray([
        ...safeArray(doc?.isbn).slice(0, 5)
      ])
    }
  };
}

/* =========================
   MERGE
========================= */

function scoreBookResult(query, item) {
  const q = compactString(query);
  const title = compactString(item.title_primary || "");
  const aliases = safeArray(item.aliases).map(compactString);

  let score = 0;

  if (title === q) score += 120;
  if (aliases.includes(q)) score += 100;

  if (title.startsWith(q)) score += 40;

  for (const alias of aliases) {
    if (alias.startsWith(q)) {
      score += 35;
      break;
    }
  }

  for (const alias of aliases) {
    if (alias.includes(q)) {
      score += 20;
      break;
    }
  }

  if (item.primary_source === "wikidata") score += 20;
  if (item.cover_url) score += 5;
  if (item.year) score += 4;
  if (item.description_ru || item.description_en) score += 2;

  return score;
}

function mergeBookItems(items) {
  const map = new Map();

  for (const item of items) {
    const key = [
      item.category,
      compactString(item.title_primary || item.original_title || ""),
      item.year || "0"
    ].join(":");

    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }

    const existing = map.get(key);

    const merged = {
      ...existing,
      ...item,
      primary_source:
        existing.primary_source === "wikidata"
          ? existing.primary_source
          : item.primary_source,
      canonical_key:
        existing.primary_source === "wikidata"
          ? existing.canonical_key
          : item.canonical_key,
      title_ru: existing.title_ru || item.title_ru,
      title_en: existing.title_en || item.title_en,
      original_title: existing.original_title || item.original_title,
      cover_url: existing.cover_url || item.cover_url,
      description_ru: existing.description_ru || item.description_ru,
      description_en: existing.description_en || item.description_en,
      aliases: uniqueArray([
        ...safeArray(existing.aliases),
        ...safeArray(item.aliases)
      ]),
      external_ids: {
        ...(existing.external_ids || {}),
        ...(item.external_ids || {})
      }
    };

    map.set(key, merged);
  }

  return [...map.values()];
}

/* =========================
   MAIN SEARCH
========================= */

export async function searchBooks(query) {
  const cleanQuery = normalizeString(query);

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return [];
  }

  let wikidataItems = [];
  let openLibraryItems = [];

  try {
    const wikidataCandidates = await fetchWikidataCandidates(cleanQuery);
    const wikidataIds = wikidataCandidates.map((item) => item.id).filter(Boolean);
    const wikidataDetails = await fetchWikidataEntityDetails(wikidataIds);

    wikidataItems = wikidataCandidates.map((candidate) =>
      mapWikidataBookEntity(candidate, wikidataDetails[candidate.id] || {})
    );
  } catch (error) {
    console.warn("Wikidata books search error:", error);
  }

  try {
    const wikidataIsbns = uniqueArray(
      wikidataItems.flatMap((item) => safeArray(item?.external_ids?.isbn))
    );

    const [byTitle, byIsbn] = await Promise.all([
      fetchOpenLibraryByTitle(cleanQuery),
      fetchOpenLibraryByIsbn(wikidataIsbns)
    ]);

    openLibraryItems = uniqueArray([...byTitle, ...byIsbn]).map(mapOpenLibraryDoc);
  } catch (error) {
    console.warn("Open Library books search error:", error);
  }

  const merged = mergeBookItems([...wikidataItems, ...openLibraryItems]);

  return merged
    .map((item) => ({
      ...item,
      score: scoreBookResult(cleanQuery, item)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_LIMITS.MODAL_RESULTS);
}

/* =========================
   UI FORMAT
========================= */

export function formatBookForUi(item) {
  return {
    canonical_key: item.canonical_key,
    category: "books",
    title: item.title_primary || "",
    original_title: item.original_title || "",
    year: item.year || null,
    cover_url: item.cover_url || "",
    aliases: safeArray(item.aliases),
    description_ru: item.description_ru || "",
    description_en: item.description_en || "",
    external_ids: item.external_ids || {},
    score: item.score || 0
  };
}
