const FANTLAB_SEARCH_URL = "https://fantlab.ru/searchmain";
const FANTLAB_TIMEOUT_MS = 10000;
const FANTLAB_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FANTLAB_THROTTLE_MS = 1300;
const FANTLAB_RESULT_LIMIT = 12;

const memoryCache = new Map();
let lastFantlabRequestAt = 0;

function normalizeSpaces(value){
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeRuText(text){
  return normalizeSpaces(String(text || "")
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/[«»“”„‟]/g, '"')
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}\s"'\-]+/gu, " "));
}

function decodeHtmlEntities(input){
  return String(input || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code) || 32))
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16) || 32));
}

function stripHtml(html){
  return normalizeSpaces(decodeHtmlEntities(String(html || "").replace(/<[^>]+>/g, " ")));
}

function pickYear(text){
  const match = String(text || "").match(/\b(18\d{2}|19\d{2}|20\d{2}|21\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function extractFantlabWorkId(url){
  const clean = String(url || "");
  const idMatch = clean.match(/\/(work|edition|autor|cycle)(\d+)\b/i);
  if(idMatch) return idMatch[2];
  const queryMatch = clean.match(/[?&](?:work|id)=(\d+)/i);
  return queryMatch ? queryMatch[1] : "";
}

function canonicalFantlabUrl(url){
  const clean = String(url || "").trim();
  if(!clean) return "";
  try {
    const parsed = new URL(clean, "https://fantlab.ru");
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function isLikelyBookUrl(url){
  return /\/work\d+\b/i.test(url) || /\/edition\d+\b/i.test(url);
}

function isExcludedUrl(url){
  return /\/(forum|blog|news|award|autor\d+\/responses|articles?)\b/i.test(url);
}

function parseFantlabSearchResults(html){
  const body = String(html || "");
  if(!body) return [];

  const anchors = [];
  const anchorRe = /<a\b([^>]*href\s*=\s*["'][^"']+["'][^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while((match = anchorRe.exec(body))){
    const attr = match[1] || "";
    const hrefMatch = attr.match(/href\s*=\s*["']([^"']+)["']/i);
    const href = hrefMatch ? hrefMatch[1] : "";
    if(!href) continue;

    const absoluteUrl = canonicalFantlabUrl(href.startsWith("http") ? href : `https://fantlab.ru${href.startsWith("/") ? "" : "/"}${href}`);
    if(!absoluteUrl || !/fantlab\.ru/i.test(absoluteUrl)) continue;
    if(isExcludedUrl(absoluteUrl)) continue;
    if(!isLikelyBookUrl(absoluteUrl)) continue;

    const title = stripHtml(match[2]);
    if(!title || title.length < 2) continue;

    const nearText = body.slice(Math.max(0, match.index - 220), Math.min(body.length, match.index + 520));
    const metadata = stripHtml(nearText);
    const authorMatch = metadata.match(/(?:автор|author)\s*[:\-]?\s*([^.;|]+)/i);
    const cycleMatch = metadata.match(/(?:цикл|серия|cycle|series)\s*[:\-]?\s*([^.;|]+)/i);

    anchors.push({
      title,
      fantlab_url: absoluteUrl,
      fantlab_work_id: extractFantlabWorkId(absoluteUrl),
      author_name: normalizeSpaces(authorMatch ? authorMatch[1] : ""),
      release_year: pickYear(metadata),
      series_name: normalizeSpaces(cycleMatch ? cycleMatch[1] : ""),
      search_language: "ru",
      source: "fantlab",
      category: "Books",
      short_source_note: "FantLab",
      relevance_hint: metadata
    });
  }

  return anchors;
}

function buildScore(item, query){
  const q = normalizeRuText(query);
  const title = normalizeRuText(item.title || "");
  const author = normalizeRuText(item.author_name || "");
  const hint = normalizeRuText(item.relevance_hint || "");

  let score = 0;
  if(title === q) score += 120;
  else if(title.startsWith(q)) score += 80;
  else if(title.includes(q)) score += 48;

  if(q && hint.includes(q)) score += 16;
  if(author && q && q.includes(author)) score += 32;
  if(item.fantlab_url && /\/work\d+\b/i.test(item.fantlab_url)) score += 20;
  if(item.release_year && q.includes(String(item.release_year))) score += 12;
  if(item.series_name) score += 6;

  return score;
}

function dedupeFantlabResults(items){
  const byKey = new Map();
  for(const item of items){
    const key = item.fantlab_work_id
      ? `work:${item.fantlab_work_id}`
      : (item.fantlab_url || "")
        || `${normalizeRuText(item.title)}::${normalizeRuText(item.author_name)}`;

    const previous = byKey.get(key);
    if(!previous || (item.score || 0) > (previous.score || 0)){
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

function rankFantlabResults(items, query){
  return items
    .map((item) => ({ ...item, score: buildScore(item, query) }))
    .filter((item) => item.score >= 20)
    .sort((a, b) => b.score - a.score);
}

function getCache(queryNormalized){
  const entry = memoryCache.get(queryNormalized);
  if(!entry) return null;
  if(Date.now() > entry.expiresAt){
    memoryCache.delete(queryNormalized);
    return null;
  }
  return entry.payload;
}

function setCache(queryNormalized, payload){
  memoryCache.set(queryNormalized, {
    payload,
    createdAt: Date.now(),
    expiresAt: Date.now() + FANTLAB_CACHE_TTL_MS
  });
}

async function throttleFantlabRequests(){
  const now = Date.now();
  const waitMs = FANTLAB_THROTTLE_MS - (now - lastFantlabRequestAt);
  if(waitMs > 0){
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  lastFantlabRequestAt = Date.now();
}

async function fetchFantlabSearchPage(query){
  await throttleFantlabRequests();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FANTLAB_TIMEOUT_MS);

  try {
    const response = await fetch(`${FANTLAB_SEARCH_URL}?searchstr=${encodeURIComponent(query)}`, {
      method: "GET",
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent": "PlamutBot/1.0 (+public search integration)"
      },
      signal: controller.signal
    });

    if(!response.ok){
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function handler(req, res){
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const query = normalizeSpaces(req?.query?.q || "");
  const debugMode = String(req?.query?.debug || "") === "1";
  const queryNormalized = normalizeRuText(query);

  if(!queryNormalized){
    return res.status(200).json(debugMode ? { ok: true, results: [], debug: ["empty query"] } : []);
  }

  try {
    const cached = getCache(queryNormalized);
    if(cached){
      return res.status(200).json(debugMode ? { ok: true, cached: true, results: cached } : cached);
    }

    const html = await fetchFantlabSearchPage(query);
    const parsed = parseFantlabSearchResults(html);
    const ranked = rankFantlabResults(parsed, query);
    const deduped = dedupeFantlabResults(ranked)
      .slice(0, FANTLAB_RESULT_LIMIT)
      .map((item) => ({
        source: "fantlab",
        category: "Books",
        title: item.title,
        original_title: "",
        author_name: item.author_name || "",
        author_url: "",
        release_year: item.release_year || null,
        language: "ru",
        series_name: item.series_name || "",
        cycle_name: item.series_name || "",
        fantlab_url: item.fantlab_url,
        fantlab_work_id: item.fantlab_work_id || "",
        cover_url: "",
        short_source_note: "FantLab",
        score: item.score || 0
      }));

    setCache(queryNormalized, deduped);

    return res.status(200).json(debugMode ? {
      ok: true,
      cached: false,
      raw_results: parsed.length,
      ranked_results: ranked.length,
      deduped_results: deduped.length,
      results: deduped
    } : deduped);
  } catch (error) {
    return res.status(200).json(debugMode ? {
      ok: false,
      results: [],
      error: String(error?.message || error)
    } : []);
  }
};
