import { normalizeSpaces, normalizeComparisonText } from "../utils.js";

function readDebugSearchFlag(){
  try {
    if(typeof window === "undefined") return false;
    return window.localStorage && window.localStorage.getItem("DEBUG_SEARCH") === "true";
  } catch {
    return false;
  }
}

const DEBUG_SEARCH = readDebugSearchFlag();

export function normalizeRuText(text){
  return normalizeSpaces(String(text || "")
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/[«»“”„‟]/g, '"')
    .replace(/[’']/g, "'")
    .replace(/[^A-Za-zА-Яа-яЁё0-9\s"'\-]+/g, " "));
}

export function isCyrillicQuery(query){
  const clean = normalizeSpaces(query);
  if(!clean) return false;
  return /[\u0400-\u04FF]/u.test(clean);
}

export function isDebugSearchEnabled(){
  return DEBUG_SEARCH;
}

export async function searchFantLabBooks(query, options = {}){
  const clean = normalizeSpaces(query);
  if(!clean) return [];

  const debug = Boolean(options.debug || DEBUG_SEARCH);
  const url = `/api/books/fantlab?q=${encodeURIComponent(clean)}${debug ? "&debug=1" : ""}`;
  const response = await fetch(url);
  if(!response.ok){
    throw new Error(`FantLab HTTP ${response.status}`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload) ? payload : (Array.isArray(payload.results) ? payload.results : []);

  return dedupeFantLabResults(rankFantLabResults(items, clean));
}

export function rankFantLabResults(results = [], query = ""){
  const queryKey = normalizeRuText(query);
  return results
    .filter(Boolean)
    .map((item) => {
      const titleKey = normalizeRuText(item.title || "");
      const authorKey = normalizeRuText(item.author_name || item.creator || "");
      let score = Number(item.score || 0);

      if(queryKey && titleKey === queryKey) score += 80;
      else if(queryKey && titleKey.startsWith(queryKey)) score += 48;
      else if(queryKey && titleKey.includes(queryKey)) score += 24;

      if(item.fantlab_url && /\/work\d+\b/i.test(item.fantlab_url)) score += 20;
      if(authorKey && queryKey.includes(authorKey)) score += 24;
      if(item.release_year && queryKey.includes(String(item.release_year))) score += 8;

      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score);
}

export function dedupeFantLabResults(results = []){
  const bestByKey = new Map();

  for(const item of results){
    const key = item.fantlab_work_id
      ? `fantlab:work:${item.fantlab_work_id}`
      : normalizeComparisonText(item.fantlab_url || `${item.title || ""}:${item.author_name || ""}`);

    const prev = bestByKey.get(key);
    if(!prev || Number(item.score || 0) > Number(prev.score || 0)){
      bestByKey.set(key, item);
    }
  }

  return Array.from(bestByKey.values());
}

export function mergeFantLabWithFallback(fantlabResults = [], fallbackResults = []){
  const merged = [];
  const seen = new Set();

  function getKey(item){
    return normalizeComparisonText(`${item.title || ""}:${item.creator || item.author_name || ""}`);
  }

  for(const sourceList of [fantlabResults, fallbackResults]){
    for(const item of sourceList){
      const key = getKey(item);
      if(!key) continue;
      if(seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

export function shouldFallbackFromFantLab(results = [], query = ""){
  if(!Array.isArray(results) || !results.length) return true;
  const queryKey = normalizeRuText(query);
  const strong = results.filter((item) => {
    const title = normalizeRuText(item.title || "");
    return Number(item.score || 0) >= 45 || (queryKey && title.includes(queryKey));
  });
  return strong.length === 0;
}
