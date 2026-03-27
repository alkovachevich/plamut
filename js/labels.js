import { t } from "./i18n.js";

export const BASE_CATEGORIES = ["Books", "Movies", "Series", "Anime", "Manga", "Blacklist"];
export const BASE_STATUSES = ["Planned", "In progress", "Done", "Dropped", "Info"];

export function getCategoryLabel(category, lang){
  const key = String(category || "");
  if(!key) return "";
  return t(`categoryNames.${key}`, key, lang);
}

export function getStatusLabel(status, lang){
  const key = String(status || "");
  if(!key) return "";
  return t(`statuses.${key}`, key, lang);
}

export function getCategoryOptions(lang){
  return BASE_CATEGORIES.map((value) => ({
    value,
    label: getCategoryLabel(value, lang)
  }));
}

export function getStatusOptions(lang){
  return BASE_STATUSES.map((value) => ({
    value,
    label: getStatusLabel(value, lang)
  }));
}
