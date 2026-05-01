import {
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  normalizeLanguage,
  normalizeTheme,
  resolveAppliedTheme
} from "./config.js";

const listeners = new Set();

const STORAGE_KEYS = {
  theme: "plamut_theme",
  language: "plamut_language",
  temporaryCardItem: "plamut_temporary_card_item",
  storedCardItems: "plamut_stored_card_items_v1",
  categoryViewState: "plamut_category_view_state_v1"
};

export const state = {
  user: null,
  authStatus: "restoring",

  language: DEFAULT_LANGUAGE,
  theme: DEFAULT_THEME,

  route: "/",
  routeParams: {},

  sidebarOpen: false,

  authModalOpen: false,
  authMode: "login",

  searchModalOpen: false,
  searchQuery: "",
  searchContextCategory: "",

  currentCategory: ""
};

let systemThemeListenerBound = false;

function emit() {
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (error) {
      console.warn("state listener error:", error);
    }
  });
}

function safeParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? safeParse(raw, fallback) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("state storage write skipped:", error);
  }
}

function applyThemeToDocument(theme = state.theme) {
  const appliedTheme = resolveAppliedTheme(theme);

  document.documentElement.setAttribute("data-theme", appliedTheme);
  document.documentElement.setAttribute("data-theme-mode", normalizeTheme(theme));
}

function applyLanguageToDocument(language = state.language) {
  document.documentElement.lang = normalizeLanguage(language);
}

function bindSystemThemeListenerOnce() {
  if (systemThemeListenerBound) return;
  systemThemeListenerBound = true;

  try {
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!media) return;

    const handler = () => {
      if (state.theme === "system") {
        applyThemeToDocument("system");
        emit();
      }
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handler);
      return;
    }

    if (typeof media.addListener === "function") {
      media.addListener(handler);
    }
  } catch (error) {
    console.warn("system theme listener skipped:", error);
  }
}

export function subscribe(fn) {
  if (typeof fn !== "function") {
    return () => {};
  }

  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setUser(user) {
  state.user = user || null;
  emit();
}

export function logoutUser() {
  state.user = null;
  state.authStatus = "guest";
  closeSearchModal(false);
  closeAuthModal(false);
  emit();
}

export function setAuthStatus(status = "guest") {
  const next = ["restoring", "authenticated", "guest", "error"].includes(status)
    ? status
    : "guest";

  if (state.authStatus === next) return;

  state.authStatus = next;
  emit();
}

export function setTheme(theme) {
  const next = normalizeTheme(theme);

  if (state.theme === next) {
    applyThemeToDocument(next);
    return;
  }

  state.theme = next;
  applyThemeToDocument(next);

  try {
    localStorage.setItem(STORAGE_KEYS.theme, next);
  } catch {}

  emit();
}

export function setLanguage(language) {
  const next = normalizeLanguage(language);

  if (state.language === next) {
    applyLanguageToDocument(next);
    return;
  }

  state.language = next;
  applyLanguageToDocument(next);

  try {
    localStorage.setItem(STORAGE_KEYS.language, next);
  } catch {}

  emit();
}

export function setRoute(route = "/", params = {}) {
  state.route = route || "/";
  state.routeParams = params || {};
  emit();
}

export function openSidebar() {
  if (state.sidebarOpen) return;
  state.sidebarOpen = true;
  emit();
}

export function closeSidebar() {
  if (!state.sidebarOpen) return;
  state.sidebarOpen = false;
  emit();
}

export function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  emit();
}

export function openAuthModal(mode = "login") {
  state.authModalOpen = true;
  state.authMode = mode === "register" ? "register" : "login";
  emit();
}

export function closeAuthModal(shouldEmit = true) {
  state.authModalOpen = false;
  if (shouldEmit) emit();
}

export function setAuthMode(mode = "login") {
  const next = mode === "register" ? "register" : "login";

  if (state.authMode === next) return;

  state.authMode = next;
  emit();
}

export function openSearchModal(query = "", options = {}) {
  state.searchModalOpen = true;
  state.searchQuery = cleanText(query);
  state.searchContextCategory = cleanText(options.category || options.searchContextCategory || "");
  emit();
}

export function closeSearchModal(shouldEmit = true) {
  state.searchModalOpen = false;
  state.searchQuery = "";
  state.searchContextCategory = "";

  if (shouldEmit) emit();
}

export function setSearchQuery(query = "") {
  state.searchQuery = cleanText(query);
  emit();
}

export function setSearchContextCategory(category = "") {
  state.searchContextCategory = cleanText(category);
  emit();
}

export function setCurrentCategory(category = "") {
  state.currentCategory = cleanText(category);
  emit();
}

export function setTemporaryCardItem(item) {
  if (!item || typeof item !== "object") return;

  try {
    sessionStorage.setItem(STORAGE_KEYS.temporaryCardItem, JSON.stringify(item));
  } catch {}

  const key = cleanText(item.canonical_key);
  if (!key) return;

  const stored = readJsonStorage(STORAGE_KEYS.storedCardItems, {});
  stored[key.toLowerCase()] = {
    ...item,
    stored_at: Date.now()
  };

  writeJsonStorage(STORAGE_KEYS.storedCardItems, stored);
}

export function getTemporaryCardItem() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.temporaryCardItem);
    return raw ? safeParse(raw, null) : null;
  } catch {
    return null;
  }
}

export function getStoredCardItemByKey(key = "") {
  const cleanKey = cleanText(key).toLowerCase();
  if (!cleanKey) return null;

  const stored = readJsonStorage(STORAGE_KEYS.storedCardItems, {});
  return stored?.[cleanKey] || null;
}

export function clearTemporaryCardItem() {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.temporaryCardItem);
  } catch {}
}

export function getCategoryViewState(category = "") {
  const cleanCategory = cleanText(category);
  if (!cleanCategory) return {};

  const stored = readJsonStorage(STORAGE_KEYS.categoryViewState, {});
  return stored?.[cleanCategory] || {};
}

export function setCategoryViewState(category = "", viewState = {}) {
  const cleanCategory = cleanText(category);
  if (!cleanCategory) return;

  const stored = readJsonStorage(STORAGE_KEYS.categoryViewState, {});
  stored[cleanCategory] = {
    ...(stored[cleanCategory] || {}),
    ...(viewState || {})
  };

  writeJsonStorage(STORAGE_KEYS.categoryViewState, stored);
}

export function initState() {
  let theme = DEFAULT_THEME;
  let language = DEFAULT_LANGUAGE;

  try {
    theme = normalizeTheme(localStorage.getItem(STORAGE_KEYS.theme) || DEFAULT_THEME);
    language = normalizeLanguage(localStorage.getItem(STORAGE_KEYS.language) || DEFAULT_LANGUAGE);
  } catch {}

  state.theme = theme;
  state.language = language;

  applyThemeToDocument(theme);
  applyLanguageToDocument(language);
  bindSystemThemeListenerOnce();

  emit();
}
