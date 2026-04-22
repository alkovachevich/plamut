import {
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  LOCAL_STORAGE_KEYS,
  DEFAULT_USER
} from "./config.js";

const listeners = new Set();

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

/* =========================
   STATE CORE
========================= */

export function setState(patch = {}) {
  Object.assign(state, patch);
  window.__PLAMUT_STATE__ = state;
  listeners.forEach((listener) => listener(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* =========================
   ROUTE STATE
========================= */

export function setRoute(route, params = {}) {
  setState({
    route,
    routeParams: params
  });
}

/* =========================
   THEME
========================= */

export function setTheme(theme) {
  localStorage.setItem(LOCAL_STORAGE_KEYS.THEME, theme);
  setState({ theme });
}

/* =========================
   LANGUAGE
========================= */

export function setLanguage(language) {
  localStorage.setItem(LOCAL_STORAGE_KEYS.LANGUAGE, language);
  setState({ language });
}

/* =========================
   UI CONTROLS
========================= */

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

/* =========================
   AUTH MODAL
========================= */

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

/* =========================
   SEARCH
========================= */

export function setSearchQuery(query) {
  setState({ searchQuery: query });
}

export function setSearchResults(results) {
  setState({ searchResults: results });
}

/* =========================
   USER
========================= */

export function setUser(user) {
  setState({
    user: {
      ...DEFAULT_USER,
      ...user
    }
  });
}

export function logoutUser() {
  setState({
    user: { ...DEFAULT_USER }
  });
}

/* =========================
   CONTEXT
========================= */

export function setCurrentCategory(category) {
  setState({ currentCategory: category });
}

export function setCurrentItem(item) {
  setState({ currentItem: item });
}

export function setCurrentUniverse(universe) {
  setState({ currentUniverse: universe });
}
