import { normalizeSpaces, normalizeComparisonText, normalizeLanguageCode, detectISBN } from "./utils.js";

export function normalizeAuthorName(author = ""){
  return normalizeComparisonText(String(author || ""))
    .replace(/\b(dr|mr|mrs|ms|prof)\.?\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTitleForMatch(title = ""){
  return normalizeComparisonText(String(title || ""))
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(book|книга|том|часть|vol|volume|edition|издание)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function areLikelySameBook(left = {}, right = {}){
  if(!left || !right) return false;
  if(left.isbn && right.isbn && detectISBN(left.isbn) === detectISBN(right.isbn)) return true;
  if(left.work_key && right.work_key && left.work_key === right.work_key) return true;
  if(left.canonical_key && right.canonical_key && left.canonical_key === right.canonical_key) return true;

  const leftTitle = normalizeTitleForMatch(left.title || left.title_original || "");
  const rightTitle = normalizeTitleForMatch(right.title || right.title_original || "");
  if(!leftTitle || !rightTitle || leftTitle !== rightTitle) return false;

  const leftAuthor = normalizeAuthorName(left.creator || "");
  const rightAuthor = normalizeAuthorName(right.creator || "");
  if(leftAuthor && rightAuthor) return leftAuthor === rightAuthor;

  const leftYear = Number(left.release_year || left.year || 0);
  const rightYear = Number(right.release_year || right.year || 0);
  if(leftYear && rightYear) return Math.abs(leftYear - rightYear) <= 1;
  return true;
}

export function normalizeBookAuthorData(book = {}){
  const authors = Array.isArray(book.author_name) ? book.author_name : Array.isArray(book.authors) ? book.authors : [];
  return normalizeSpaces(
    authors
      .map((author) => normalizeSpaces(typeof author === "string" ? author : author?.name || ""))
      .filter(Boolean)
      .join(", ")
  );
}

export function normalizeBookLanguageData(book = {}){
  const raw = Array.isArray(book.language) ? book.language : [];
  return raw
    .map((lang) => normalizeLanguageCode(lang))
    .filter(Boolean);
}
