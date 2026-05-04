import { safeArray } from "../../utils.js";

const SEARCH_TIMEOUT_MS = 7000;
const WIKIPEDIA_RU_API_URL = "https://ru.wikipedia.org/w/api.php";
const WIKIPEDIA_EN_API_URL = "https://en.wikipedia.org/w/api.php";

function clean(value = "") {
  return String(value || "").trim();
}

function unique(values = []) {
  return Array.from(new Set(safeArray(values).map(clean).filter(Boolean)));
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
    throw new Error(`Wikipedia request failed: ${response.status}`);
  }

  return response.json();
}

function apiUrlForLanguage(language = "ru") {
  return language === "en" ? WIKIPEDIA_EN_API_URL : WIKIPEDIA_RU_API_URL;
}

export async function searchWikipediaPageTitles(query = "", language = "ru", limit = 3) {
  const cleanQuery = clean(query);
  if (!cleanQuery) return [];

  const url = new URL(apiUrlForLanguage(language));

  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("list", "search");
  url.searchParams.set("srlimit", String(Math.max(1, Math.min(Number(limit) || 3, 6))));
  url.searchParams.set("srsearch", cleanQuery);

  const payload = await fetchJson(url.toString(), {
    headers: { Accept: "application/json" }
  }).catch(() => null);

  return safeArray(payload?.query?.search)
    .map((row) => clean(row?.title))
    .filter(Boolean);
}

export async function fetchWikipediaSummaryByTitle(title = "", language = "ru") {
  const cleanTitle = clean(title);
  if (!cleanTitle) return null;

  const url = new URL(apiUrlForLanguage(language));

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

  const extract = clean(page.extract);
  const image = clean(page?.original?.source);

  if (!extract && !image) return null;

  return {
    title: clean(page.title),
    language: language === "en" ? "en" : "ru",
    extract,
    image,
    source: `wikipedia_${language === "en" ? "en" : "ru"}`
  };
}

export async function fetchBestWikipediaSummary(titles = [], language = "ru") {
  const candidates = unique(titles).slice(0, 4);

  for (const title of candidates) {
    const direct = await fetchWikipediaSummaryByTitle(title, language).catch(() => null);
    if (direct?.extract || direct?.image) return direct;

    const searched = await searchWikipediaPageTitles(title, language, 1).catch(() => []);
    const foundTitle = searched[0] || "";
    if (!foundTitle || foundTitle === title) continue;

    const fallback = await fetchWikipediaSummaryByTitle(foundTitle, language).catch(() => null);
    if (fallback?.extract || fallback?.image) return fallback;
  }

  return null;
}
