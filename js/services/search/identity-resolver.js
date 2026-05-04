import { safeArray, uniqueArray } from "../../utils.js";

function clean(value = "") {
  return String(value || "").trim();
}

function cleanLower(value = "") {
  return clean(value).toLowerCase();
}

function normalizeJson(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function normalizeCategory(category = "") {
  const value = cleanLower(category);
  if (value === "book") return "books";
  if (value === "movie") return "movies";
  if (value === "tv") return "series";
  return ["books", "movies", "series", "anime", "manga"].includes(value) ? value : "";
}

function normalizeOpenLibraryWork(value = "") {
  return clean(value).replace("/works/", "");
}

export function normalizeExternalIds(ids = {}) {
  const source = normalizeJson(ids, {});
  const wikidata = clean(source.wikidata || source.wikidata_id);
  const tmdb = clean(source.tmdb || source.tmdb_id);
  const imdb = clean(source.imdb || source.imdb_id);
  const anilist = clean(source.anilist || source.anilist_id);
  const mal = clean(source.mal || source.mal_id);
  const openlibraryWork = normalizeOpenLibraryWork(source.openlibrary_work || source.openlibrary);

  return Object.fromEntries(
    Object.entries({
      ...source,
      wikidata,
      wikidata_id: wikidata,
      tmdb,
      tmdb_id: tmdb,
      imdb,
      imdb_id: imdb,
      anilist,
      anilist_id: anilist,
      mal,
      mal_id: mal,
      openlibrary_work: openlibraryWork
    }).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      if (value && typeof value === "object") return Object.keys(value).length > 0;
      return clean(value) !== "";
    })
  );
}

export function buildCanonicalKeyFromIdentity(entity = {}) {
  const category = normalizeCategory(entity.category);
  const ids = normalizeExternalIds(entity.external_ids || {});
  const existing = cleanLower(entity.canonical_key);

  if (category === "books") {
    if (ids.wikidata) return `books:wikidata:${ids.wikidata}`.toLowerCase();
    if (ids.openlibrary_work) return `books:openlibrary:${ids.openlibrary_work}`.toLowerCase();
    if (existing) return existing;
  }

  if (category && ids.wikidata) return `${category}:wikidata:${ids.wikidata}`.toLowerCase();
  if (category && ids.tmdb) return `${category}:tmdb:${ids.tmdb}`.toLowerCase();
  if (category && ids.imdb) return `${category}:imdb:${ids.imdb}`.toLowerCase();
  if (category && ids.anilist) return `${category}:anilist:${ids.anilist}`.toLowerCase();
  if (category && ids.mal) return `${category}:mal:${ids.mal}`.toLowerCase();

  return existing;
}

export function getIdentityKeys(entity = {}) {
  const category = normalizeCategory(entity.category);
  const ids = normalizeExternalIds(entity.external_ids || {});
  const keys = [];

  if (entity.canonical_key) keys.push(`canonical:${cleanLower(entity.canonical_key)}`);
  if (category && ids.wikidata) keys.push(`${category}:wikidata:${cleanLower(ids.wikidata)}`);
  if (category && ids.tmdb) keys.push(`${category}:tmdb:${cleanLower(ids.tmdb)}`);
  if (category && ids.imdb) keys.push(`${category}:imdb:${cleanLower(ids.imdb)}`);
  if (category && ids.anilist) keys.push(`${category}:anilist:${cleanLower(ids.anilist)}`);
  if (category && ids.mal) keys.push(`${category}:mal:${cleanLower(ids.mal)}`);
  if (category === "books" && ids.openlibrary_work) keys.push(`books:openlibrary:${cleanLower(ids.openlibrary_work)}`);

  return uniqueArray(keys.filter(Boolean));
}

export function findIdentityMatch(candidate = {}, existingItems = []) {
  const candidateKeys = new Set(getIdentityKeys(candidate));
  if (!candidateKeys.size) return null;

  return safeArray(existingItems).find((item) =>
    getIdentityKeys(item).some((key) => candidateKeys.has(key))
  ) || null;
}

export function identityLooksStrong(entity = {}) {
  const ids = normalizeExternalIds(entity.external_ids || {});
  return Boolean(
    ids.wikidata ||
    ids.tmdb ||
    ids.imdb ||
    ids.anilist ||
    ids.mal ||
    ids.openlibrary_work
  );
}
