function normalizeSpaces(value){
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeComparisonText(value){
  return normalizeSpaces(value)
    .toLowerCase()
    .replace(/ё/g, "е");
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

    const titleCandidate = current.title || current.name || current.work_title || current.work_name || current.rusname || current.orgname;
    if(typeof titleCandidate === "string" && normalizeSpaces(titleCandidate)){
      out.push(current);
    }

    const nestedKeys = [
      "works", "items", "data", "result", "search", "matches", "books", "list", "entities", "payload", "response"
    ];

    for(const key of nestedKeys){
      const value = current[key];
      if(value && typeof value === "object") queue.push(value);
    }

    for(const value of Object.values(current)){
      if(value && typeof value === "object" && (Array.isArray(value) || Object.keys(value).length <= 25)){
        queue.push(value);
      }
    }
  }

  return out;
}

function pickCreator(item){
  const direct = normalizeSpaces(item.author_name || item.author || item.autor || item.writer || "");
  if(direct) return direct;
  const authors = Array.isArray(item.authors) ? item.authors : Array.isArray(item.authorlist) ? item.authorlist : [];
  return normalizeSpaces(authors
    .map((author) => normalizeSpaces(author?.name || author?.title || author?.fio || ""))
    .filter(Boolean)
    .join(", "));
}

function pickCover(item){
  return normalizeSpaces(
    item.cover
    || item.cover_url
    || item.image
    || item.image_url
    || item.poster
    || item.pic
    || item.img
    || ""
  );
}

function normalizeFantlabItem(item){
  if(!item || typeof item !== "object") return null;

  const titleRaw = normalizeSpaces(item.title || item.name || item.work_title || item.work_name || item.rusname || item.orgname || "");
  if(!titleRaw) return null;

  const titleRuRaw = normalizeSpaces(item.title_ru || item.rusname || "");
  const titleEnRaw = normalizeSpaces(item.title_en || item.orgname || "");
  const titleOriginalRaw = normalizeSpaces(item.title_original || item.original_title || item.name_original || titleRaw);

  const descriptionRaw = normalizeSpaces(item.description || item.annotation || item.work_description || item.anons || "");
  const creator = pickCreator(item);
  const cover = pickCover(item);

  const workId = normalizeSpaces(
    item.work_id
    || item.workid
    || item.workId
    || item.id
    || item.work?.id
    || ""
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
      if(looksLikeEnglish(descriptionRaw)) description_en = descriptionRaw;
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

async function fetchFantlab(query){
  const endpoint = `https://api.fantlab.ru/search?query=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Accept": "application/json, text/plain;q=0.9, */*;q=0.8"
    }
  });

  if(!response.ok) return null;

  const text = await response.text();
  if(!text) return null;
  return safeJson(text);
}

module.exports = async function handler(req, res){
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");

  const query = normalizeSpaces(req?.query?.q || "");
  if(!query){
    return res.status(200).json([]);
  }

  try {
    const payload = await fetchFantlab(query);
    if(!payload){
      return res.status(200).json([]);
    }

    const normalized = dedupeBooks(
      extractFantlabNodes(payload)
        .map((item) => normalizeFantlabItem(item))
        .filter(Boolean)
    );

    return res.status(200).json(normalized);
  } catch {
    return res.status(200).json([]);
  }
};
