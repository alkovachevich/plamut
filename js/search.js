import { normalizeSpaces, normalizeComparisonText, detectISBN } from "./utils.js";

export function hasCyrillic(text){
  return /[А-Яа-яЁё]/.test(String(text || ""));
}

export function hasLatin(text){
  return /[A-Za-z]/.test(String(text || ""));
}

export function normalizeSearchQuery(query){
  const text = normalizeSpaces(query);
  return {
    text,
    comparison: normalizeComparisonText(text),
    isbn: detectISBN(text),
    hasCyrillic: hasCyrillic(text),
    hasLatin: hasLatin(text)
  };
}

export function itemMatchesQuery(item, queryMeta){
  if(!queryMeta?.comparison && !queryMeta?.isbn) return false;

  if(queryMeta?.isbn){
    const itemIsbn = detectISBN(item?.isbn || item?.work_key || "");
    if(itemIsbn && itemIsbn === queryMeta.isbn){
      return true;
    }
  }

  const haystack = normalizeComparisonText([
    item?.title,
    item?.title_ru,
    item?.title_en,
    item?.title_original,
    item?.original_title,
    item?.creator,
    item?.description_ru,
    item?.description_original,
    item?.description_en
  ].filter(Boolean).join(" "));

  return haystack.includes(queryMeta.comparison || "");
}

export async function searchMediaWithFallback(query, kind, limit, providers = {}){
  const primary = await providers.searchJikanApi?.(query, kind, limit);
  if(Array.isArray(primary) && primary.length){
    return primary;
  }

  const aniListKind = kind === "anime" ? "ANIME" : "MANGA";
  const fallback = await providers.searchAniListApi?.(query, aniListKind, limit);
  return Array.isArray(fallback) ? fallback : [];
}
