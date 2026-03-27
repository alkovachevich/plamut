function normalizeSpaces(value){
  return String(value || "").replace(/\s+/g, " ").trim();
}

const FANTLAB_TIMEOUT_MS = 9000;
const FANTLAB_RESULT_LIMIT = 10;

function normalizeComparisonText(value){
  return normalizeSpaces(value).toLowerCase().replace(/ё/g, "е");
}

function hasCyrillic(text){
  return /[А-Яа-яЁё]/.test(String(text || ""));
}

function hasLatin(text){
  return /[A-Za-z]/.test(String(text || ""));
}

function looksLikeRussian(text){
  const sample = String(text || "");
  if(!sample || /[іїєґІЇЄҐ]/.test(sample)) return false;
  const letters = sample.match(/[A-Za-zА-Яа-яЁё]/g) || [];
  if(letters.length < 4) return false;
  const cyrillic = sample.match(/[А-Яа-яЁё]/g) || [];
  return (cyrillic.length / letters.length) >= 0.5;
}

function looksLikeEnglish(text){
  const sample = String(text || "");
  if(!sample) return false;
  const letters = sample.match(/[A-Za-zА-Яа-яЁё]/g) || [];
  if(letters.length < 4) return false;
  const latin = sample.match(/[A-Za-z]/g) || [];
  return (latin.length / letters.length) >= 0.5;
}

function buildCanonicalKey(source, rawId, title){
  if(rawId) return `Books:${source}:${rawId}`;
  return `Books:${source}:${normalizeComparisonText(title || "untitled")}`;
}

function safeJson(value){
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function pickCreator(item){
  const direct = normalizeSpaces(
    item.author_name ||
    item.author ||
    item.autor ||
    item.writer ||
    item.creator ||
    ""
  );
  if(direct) return direct;

  const authors = Array.isArray(item.authors)
    ? item.authors
    : Array.isArray(item.authorlist)
      ? item.authorlist
      : [];

  return normalizeSpaces(
    authors
      .map((author) => normalizeSpaces(author?.name || author?.title || author?.fio || ""))
      .filter(Boolean)
      .join(", ")
  );
}

function pickCover(item){
  return normalizeSpaces(
    item.cover ||
    item.cover_url ||
    item.image ||
    item.image_url ||
    item.poster ||
    item.pic ||
    item.img ||
    ""
  );
}

function normalizeFantlabItem(item){
  if(!item || typeof item !== "object") return null;

  const titleRaw = normalizeSpaces(
    item.title ||
    item.name ||
    item.work_title ||
    item.work_name ||
    item.rusname ||
    item.orgname ||
    ""
  );

  if(!titleRaw || titleRaw.length < 2) return null;
  if(/^[\W_\d-]+$/u.test(titleRaw)) return null;

  const titleRuRaw = normalizeSpaces(item.title_ru || item.rusname || "");
  const titleEnRaw = normalizeSpaces(item.title_en || item.orgname || "");
  const titleOriginalRaw = normalizeSpaces(
    item.title_original ||
    item.original_title ||
    item.name_original ||
    titleRaw
  );

  const descriptionRaw = normalizeSpaces(
    item.description ||
    item.annotation ||
    item.work_description ||
    item.anons ||
    ""
  );

  const creator = pickCreator(item);
  const cover = pickCover(item);

  const workId = normalizeSpaces(
    item.work_id ||
    item.workid ||
    item.workId ||
    item.id ||
    item.work?.id ||
    ""
  );

  const title_ru = titleRuRaw || (looksLikeRussian(titleRaw) ? titleRaw : "");
  const title_en = titleEnRaw || (looksLikeEnglish(titleRaw) ? titleRaw : "");
  const title_original = titleOriginalRaw || titleRaw;

  let description_ru = "";
  let description_en = "";
  let description_original = "";

  if(descriptionRaw){
    if(looksLikeRussian(descriptionRaw)){
      description_ru = descriptionRaw;
    } else if(looksLikeEnglish(descriptionRaw)){
      description_en = descriptionRaw;
      description_original = descriptionRaw;
    } else if(hasCyrillic(descriptionRaw) && !hasLatin(descriptionRaw)){
      description_ru = descriptionRaw;
    } else {
      description_original = descriptionRaw;
    }
  }

  const workKeyBase = workId || normalizeComparisonText(`${titleRaw}:${creator || ""}`);
  const work_key = `fantlab:${workKeyBase}`;

  return {
    title: titleRaw,
    title_ru,
    title_en,
    title_original,
    creator,
    cover,
    description: description_ru || description_original || description_en || descriptionRaw || "",
    description_ru,
    description_original: description_original || description_en || "",
    description_en: description_en || description_original || "",
    work_key,
    canonical_key: buildCanonicalKey("fantlab", workId || workKeyBase, titleRaw),
    source: "fantlab"
  };
}

function dedupeBooks(items){
  const seen = new Set();
  const result = [];

  for(const item of items){
    if(!item || !item.title) continue;
    const key = item.work_key || item.canonical_key || normalizeComparisonText(`${item.title}:${item.creator || ""}`);
    if(seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function extractFantlabNodes(payload){
  const out = [];
  const queue = [payload];
  const seen = new Set();

  while(queue.length){
    const current = queue.shift();
    if(!current || typeof current !== "object") continue;
    if(seen.has(current)) continue;
    seen.add(current);

    if(Array.isArray(current)){
      for(const item of current){
        if(item && typeof item === "object") queue.push(item);
      }
      continue;
    }

    const titleCandidate =
      current.title ||
      current.name ||
      current.work_title ||
      current.work_name ||
      current.rusname ||
      current.orgname;

    if(typeof titleCandidate === "string" && normalizeSpaces(titleCandidate)){
      out.push(current);
    }

    for(const value of Object.values(current)){
      if(value && typeof value === "object"){
        queue.push(value);
      }
    }
  }

  return out;
}

function getFantlabEndpointBuilders(){
  return [
    (query) => `https://api.fantlab.ru/search?query=${encodeURIComponent(query)}`,
    (query) => `https://api.fantlab.ru/search?term=${encodeURIComponent(query)}`,
    (query) => `https://api.fantlab.ru/search?q=${encodeURIComponent(query)}`
  ];
}

async function fetchFantlabWithTimeout(url, timeoutMs = FANTLAB_TIMEOUT_MS){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json, text/plain;q=0.9, */*;q=0.8",
        "User-Agent": "Mozilla/5.0 FantLabProxy/1.0"
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function tryFantlabEndpoints(query){
  const debug = [];
  const builders = getFantlabEndpointBuilders();

  for(const buildUrl of builders){
    const url = buildUrl(query);

    try {
      const response = await fetchFantlabWithTimeout(url);
      const text = await response.text();

      debug.push({
        url,
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        preview: String(text || "").slice(0, 500)
      });

      if(!response.ok) continue;

      const payload = safeJson(text);
      if(!payload) continue;

      return { payload, debug, selectedUrl: url };
    } catch (error) {
      debug.push({
        url,
        ok: false,
        status: "FETCH_ERROR",
        error: String(error?.message || error)
      });
    }
  }

  return { payload: null, debug, selectedUrl: "" };
}

module.exports = async function handler(req, res){
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  const query = normalizeSpaces(req?.query?.q || "");
  const debugMode = String(req?.query?.debug || "") === "1";

  if(!query){
    if(debugMode){
      return res.status(200).json({
        ok: true,
        query,
        results: [],
        debug: ["empty query"]
      });
    }
    return res.status(200).json([]);
  }

  try {
    const { payload, debug, selectedUrl } = await tryFantlabEndpoints(query);

    if(!payload){
      if(debugMode){
        return res.status(200).json({
          ok: false,
          query,
          selectedUrl,
          results: [],
          debug
        });
      }
      return res.status(200).json([]);
    }

    const nodes = extractFantlabNodes(payload);
    const normalized = dedupeBooks(
      nodes.map((item) => normalizeFantlabItem(item)).filter(Boolean)
    ).slice(0, FANTLAB_RESULT_LIMIT);

    if(debugMode){
      return res.status(200).json({
        ok: true,
        query,
        selectedUrl,
        nodesFound: nodes.length,
        resultsCount: normalized.length,
        debug,
        results: normalized
      });
    }

    return res.status(200).json(normalized);
  } catch (error) {
    if(debugMode){
      return res.status(200).json({
        ok: false,
        query,
        results: [],
        debug: [{ handlerError: String(error?.message || error) }]
      });
    }
    return res.status(200).json([]);
  }
};
