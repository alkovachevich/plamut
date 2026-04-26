import {
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  LOCAL_STORAGE_KEYS,
  DEFAULT_USER
} from "./config.js";

const listeners = new Set();

const STORAGE_VERSION = 3;
const ROUTE_STATE_KEY = "plamut_route_state_v1";
const CATEGORY_VIEW_STATE_KEY = "plamut_category_view_state_v1";
const TEMP_CARD_STORAGE_KEY = "plamut_temp_card_item_v3";
const LAST_CARD_STORAGE_KEY = "plamut_last_card_item_v3";
const OLD_CARD_STORAGE_KEYS = [
  "plamut_temp_card_item",
  "plamut_last_card_item"
];

function cleanupOldStorage() {
  try {
    OLD_CARD_STORAGE_KEYS.forEach((key) => {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    });
  } catch (error) {
    console.warn("state: old storage cleanup skipped", error);
  }
}

cleanupOldStorage();

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("state: write storage skipped", error);
  }
}

function normalizeRouteState(payload = {}) {
  return {
    route: typeof payload.route === "string" ? payload.route : "/",
    routeParams: payload.routeParams && typeof payload.routeParams === "object" ? payload.routeParams : {}
  };
}

const persistedRoute = normalizeRouteState(readJsonStorage(ROUTE_STATE_KEY, {}));
const persistedCategoryViewState = readJsonStorage(CATEGORY_VIEW_STATE_KEY, {});

export const state = {
  route: persistedRoute.route || "/",
  routeParams: persistedRoute.routeParams || {},

  sidebarOpen: false,
  searchModalOpen: false,
  authModalOpen: false,
  authMode: "login",

  searchQuery: "",
  searchResults: null,
  searchContextCategory: null,

  theme: localStorage.getItem(LOCAL_STORAGE_KEYS.THEME) || DEFAULT_THEME,
  language: localStorage.getItem(LOCAL_STORAGE_KEYS.LANGUAGE) || DEFAULT_LANGUAGE,

  user: { ...DEFAULT_USER },

  currentCategory: null,
  categoryViewState: persistedCategoryViewState && typeof persistedCategoryViewState === "object" ? persistedCategoryViewState : {},
  currentItem: null,
  currentUniverse: null
};

window.__PLAMUT_STATE__ = state;

function hasPatchChanges(patch = {}) {
  return Object.entries(patch).some(([key, value]) => state[key] !== value);
}

function sameStoredCard(a = null, b = null) {
  if (!a && !b) return true;
  if (!a || !b) return false;

  return JSON.stringify({
    id: a.id ?? null,
    canonical_key: a.canonical_key || "",
    category: a.category || "",
    title_primary: a.title_primary || "",
    title_ru: a.title_ru || "",
    title_en: a.title_en || "",
    original_title: a.original_title || "",
    year: a.year ?? null,
    cover_url: a.cover_url || "",
    description_ru: a.description_ru || "",
    description_en: a.description_en || "",
    relations_status: a.relations_status || "",
    universe_key: a.universe_key || ""
  }) === JSON.stringify({
    id: b.id ?? null,
    canonical_key: b.canonical_key || "",
    category: b.category || "",
    title_primary: b.title_primary || "",
    title_ru: b.title_ru || "",
    title_en: b.title_en || "",
    original_title: b.original_title || "",
    year: b.year ?? null,
    cover_url: b.cover_url || "",
    description_ru: b.description_ru || "",
    description_en: b.description_en || "",
    relations_status: b.relations_status || "",
    universe_key: b.universe_key || ""
  });
}

export function setState(patch = {}) {
  if (!patch || typeof patch !== "object" || !hasPatchChanges(patch)) {
    return;
  }

  Object.assign(state, patch);
  window.__PLAMUT_STATE__ = state;
  listeners.forEach((listener) => listener(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setRoute(route, params = {}) {
  const next = {
    route,
    routeParams: params && typeof params === "object" ? params : {}
  };

  writeJsonStorage(ROUTE_STATE_KEY, next);

  setState(next);
}

export function setTheme(theme) {
  localStorage.setItem(LOCAL_STORAGE_KEYS.THEME, theme);
  setState({ theme });
}

export function setLanguage(language) {
  localStorage.setItem(LOCAL_STORAGE_KEYS.LANGUAGE, language);
  setState({ language });
}

export function openSidebar() {
  setState({ sidebarOpen: true });
}

export function closeSidebar() {
  setState({ sidebarOpen: false });
}

export function openSearchModal(initialQuery = "", options = {}) {
  const contextCategory = typeof options.category === "string" ? options.category : null;

  setState({
    searchModalOpen: true,
    searchQuery: initialQuery,
    searchContextCategory: contextCategory || null
  });
}

export function closeSearchModal() {
  setState({
    searchModalOpen: false,
    searchContextCategory: null
  });
}

export function openAuthModal(mode = "login") {
  setState({
    authModalOpen: true,
    authMode: mode === "register" ? "register" : "login"
  });
}

export function closeAuthModal() {
  setState({
    authModalOpen: false
  });
}

export function setAuthMode(mode = "login") {
  setState({
    authMode: mode === "register" ? "register" : "login"
  });
}

export function setSearchQuery(query) {
  setState({ searchQuery: query });
}

export function setSearchResults(results) {
  setState({ searchResults: results });
}

export function setUser(user) {
  setState({
    user: {
      ...DEFAULT_USER,
      ...user
    }
  });
}

export function logoutUser() {
  clearTemporaryCardItem();

  setState({
    user: { ...DEFAULT_USER }
  });
}

export function setCurrentCategory(category) {
  setState({ currentCategory: category });
}

export function setCategoryViewState(category, patch = {}) {
  const key = String(category || "").trim().toLowerCase();
  if (!key) return;

  const prev = state.categoryViewState?.[key] || {};
  const next = {
    ...state.categoryViewState,
    [key]: {
      ...prev,
      ...patch
    }
  };

  writeJsonStorage(CATEGORY_VIEW_STATE_KEY, next);
  setState({ categoryViewState: next });
}

export function getCategoryViewState(category) {
  const key = String(category || "").trim().toLowerCase();
  if (!key) return null;

  return state.categoryViewState?.[key] || null;
}

export function setCurrentItem(item) {
  if (sameStoredCard(state.currentItem, item)) return;
  setState({ currentItem: item });
}

export function setCurrentUniverse(universe) {
  setState({ currentUniverse: universe });
}

function normalizeStoredCard(item) {
  if (!item || typeof item !== "object") return null;
  if (!item.canonical_key) return null;
  if (item.__fallback) return null;

  return {
    version: STORAGE_VERSION,
    saved_at: Date.now(),
    ...item,
    title_primary:
      item.title_primary ||
      item.title ||
      item.title_ru ||
      item.title_en ||
      item.original_title ||
      "",
    title_ru: item.title_ru || "",
    title_en: item.title_en || "",
    original_title: item.original_title || item.title || "",
    description_ru: item.description_ru || item.description || "",
    description_en: item.description_en || "",
    external_ids: item.external_ids || {},
    meta: item.meta || {}
  };
}

function readStoredCard(key) {
  try {
    const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== STORAGE_VERSION) return null;
    if (!parsed.canonical_key || parsed.__fallback) return null;

    return parsed;
  } catch (error) {
    console.warn("state: readStoredCard skipped", error);
    return null;
  }
}

function writeStoredCard(key, item) {
  try {
    if (!item) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
      return;
    }

    const normalized = normalizeStoredCard(item);
    if (!normalized) return;

    const payload = JSON.stringify(normalized);

    sessionStorage.setItem(key, payload);
    localStorage.setItem(key, payload);
  } catch (error) {
    console.warn("state: writeStoredCard skipped", error);
  }
}

export function setTemporaryCardItem(item) {
  const normalized = normalizeStoredCard(item);

  setCurrentItem(normalized || null);

  writeStoredCard(TEMP_CARD_STORAGE_KEY, normalized);

  if (normalized?.canonical_key) {
    writeStoredCard(LAST_CARD_STORAGE_KEY, normalized);
  }
}

export function getTemporaryCardItem() {
  if (state.currentItem?.canonical_key && !state.currentItem.__fallback) {
    return state.currentItem;
  }

  return readStoredCard(TEMP_CARD_STORAGE_KEY);
}

export function getLastCardItem() {
  if (state.currentItem?.canonical_key && !state.currentItem.__fallback) {
    return state.currentItem;
  }

  return readStoredCard(LAST_CARD_STORAGE_KEY);
}

export function getStoredCardItemByKey(canonicalKey = "") {
  const key = String(canonicalKey || "").trim().toLowerCase();
  if (!key) return null;

  const candidates = [
    state.currentItem,
    readStoredCard(TEMP_CARD_STORAGE_KEY),
    readStoredCard(LAST_CARD_STORAGE_KEY)
  ];

  return (
    candidates.find((item) => {
      if (!item?.canonical_key || item.__fallback) return false;
      return String(item.canonical_key || "").trim().toLowerCase() === key;
    }) || null
  );
}

export function clearTemporaryCardItem() {
  setCurrentItem(null);
  writeStoredCard(TEMP_CARD_STORAGE_KEY, null);
}

export function clearAllPersistentUiCache() {
  clearTemporaryCardItem();

  try {
    sessionStorage.removeItem(LAST_CARD_STORAGE_KEY);
    localStorage.removeItem(LAST_CARD_STORAGE_KEY);
  } catch (error) {
    console.warn("state: clear persistent UI cache skipped", error);
  }
}
