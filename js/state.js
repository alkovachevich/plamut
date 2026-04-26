import {
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  LOCAL_STORAGE_KEYS,
  DEFAULT_USER
} from "./config.js";

const listeners = new Set();

const TEMP_CARD_STORAGE_KEY = "plamut_temp_card_item";
const LAST_CARD_STORAGE_KEY = "plamut_last_card_item";

export const state = {
  route: "/",
  routeParams: {},

  sidebarOpen: false,
  searchModalOpen: false,
  authModalOpen: false,
  authMode: "login",

  searchQuery: "",
  searchResults: null,

  theme: localStorage.getItem(LOCAL_STORAGE_KEYS.THEME) || DEFAULT_THEME,
  language: localStorage.getItem(LOCAL_STORAGE_KEYS.LANGUAGE) || DEFAULT_LANGUAGE,

  user: { ...DEFAULT_USER },

  currentCategory: null,
  currentItem: null,
  currentUniverse: null
};

window.__PLAMUT_STATE__ = state;

export function setState(patch = {}) {
  Object.assign(state, patch);
  window.__PLAMUT_STATE__ = state;
  listeners.forEach((listener) => listener(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setRoute(route, params = {}) {
  setState({
    route,
    routeParams: params
  });
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

export function openSearchModal(initialQuery = "") {
  setState({
    searchModalOpen: true,
    searchQuery: initialQuery
  });
}

export function closeSearchModal() {
  setState({
    searchModalOpen: false
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

export function setCurrentItem(item) {
  setState({ currentItem: item });
}

export function setCurrentUniverse(universe) {
  setState({ currentUniverse: universe });
}

function readStoredCard(key) {
  try {
    const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.warn("readStoredCard error:", error);
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

    const payload = JSON.stringify(item);

    sessionStorage.setItem(key, payload);
    localStorage.setItem(key, payload);
  } catch (error) {
    console.warn("writeStoredCard error:", error);
  }
}

export function setTemporaryCardItem(item) {
  setCurrentItem(item || null);

  writeStoredCard(TEMP_CARD_STORAGE_KEY, item || null);

  if (item?.canonical_key) {
    writeStoredCard(LAST_CARD_STORAGE_KEY, item);
  }
}

export function getTemporaryCardItem() {
  if (state.currentItem?.canonical_key) {
    return state.currentItem;
  }

  return readStoredCard(TEMP_CARD_STORAGE_KEY);
}

export function getLastCardItem() {
  if (state.currentItem?.canonical_key) {
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
      return String(item?.canonical_key || "").trim().toLowerCase() === key;
    }) || null
  );
}

export function clearTemporaryCardItem() {
  setCurrentItem(null);

  writeStoredCard(TEMP_CARD_STORAGE_KEY, null);
}
