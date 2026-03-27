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
