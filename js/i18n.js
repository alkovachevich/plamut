import { translations } from "./translations.js";
import { state } from "./state.js";

function resolveDictionary(lang = state.currentLanguage){
  return translations[lang] || translations.ru || translations.en || {};
}

export function t(key = "", fallback = "", lang = state.currentLanguage) {
  const dictionary = resolveDictionary(lang);
  if(!key){
    return dictionary;
  }

  const value = String(key)
    .split(".")
    .reduce((acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined), dictionary);

  if(value !== undefined && value !== null && value !== ""){
    return value;
  }

  const englishValue = String(key)
    .split(".")
    .reduce((acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined), resolveDictionary("en"));

  if(englishValue !== undefined && englishValue !== null && englishValue !== ""){
    return englishValue;
  }

  return fallback || key;
}
