import { translations } from "./translations.js";
import { state } from "./state.js";

export function t() {
  return translations[state.currentLanguage];
}
