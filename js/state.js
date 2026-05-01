const listeners = new Set();

export const state = {
  user: null,

  language: "ru",
  theme: "dark",

  route: "/",
  routeParams: {},

  sidebarOpen: false,
  authModalOpen: false,
  authMode: "login"
};

function emit() {
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (e) {
      console.warn("state listener error:", e);
    }
  });
}

/* =========================
   SUBSCRIBE
========================= */

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* =========================
   USER
========================= */

export function setUser(user) {
  state.user = user || null;
  emit();
}

/* =========================
   THEME / LANGUAGE
========================= */

export function setTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  state.theme = next;

  document.documentElement.setAttribute("data-theme", next);

  try {
    localStorage.setItem("plamut_theme", next);
  } catch {}

  emit();
}

export function setLanguage(lang) {
  const next = lang === "en" ? "en" : "ru";
  state.language = next;

  try {
    localStorage.setItem("plamut_lang", next);
  } catch {}

  emit();
}

/* =========================
   ROUTER
========================= */

export function setRoute(path, params = {}) {
  state.route = path || "/";
  state.routeParams = params || {};
  emit();
}

/* =========================
   SIDEBAR
========================= */

export function openSidebar() {
  state.sidebarOpen = true;
  emit();
}

export function closeSidebar() {
  state.sidebarOpen = false;
  emit();
}

/* =========================
   AUTH MODAL
========================= */

export function openAuthModal(mode = "login") {
  state.authModalOpen = true;
  state.authMode = mode === "register" ? "register" : "login";
  emit();
}

export function closeAuthModal() {
  state.authModalOpen = false;
  emit();
}

export function setAuthMode(mode) {
  state.authMode = mode === "register" ? "register" : "login";
  emit();
}

/* =========================
   INIT (PERSISTENCE)
========================= */

export function initState() {
  try {
    const savedTheme = localStorage.getItem("plamut_theme");
    const savedLang = localStorage.getItem("plamut_lang");

    if (savedTheme) {
      state.theme = savedTheme;
      document.documentElement.setAttribute("data-theme", savedTheme);
    }

    if (savedLang) {
      state.language = savedLang;
    }
  } catch {}

  emit();
}
