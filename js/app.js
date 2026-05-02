import { ROUTES } from "./config.js";
import { initRouter } from "./router.js";
import {
  state,
  subscribe,
  setUser,
  logoutUser,
  closeAuthModal,
  setTheme,
  setLanguage,
  setAuthStatus,
  initState
} from "./state.js";

import { renderHeader } from "./components/header.js";
import { renderSidebar } from "./components/sidebar.js";
import { renderSearchModal } from "./components/search-modal.js";
import { renderAuthModal } from "./components/auth-modal.js";

import { renderHomePage } from "./pages/home.js";
import { renderCategoriesPage } from "./pages/categories.js";
import { renderCategoryPage } from "./pages/category.js";
import { renderSearchPage } from "./pages/search.js";
import { renderCardPage } from "./pages/card.js";
import { renderUniversesPage } from "./pages/universes.js";
import { renderUniversePage } from "./pages/universe.js";
import { renderSettingsPage } from "./pages/settings.js";
import { renderGuestPage } from "./pages/guest.js";

import {
  getSupabaseClient,
  getCurrentAuthState,
  fetchUserProfileSafe,
  setCachedSession,
  clearCachedSession
} from "./lib/supabase-client.js";

const headerRoot = document.getElementById("app-header");
const mainRoot = document.getElementById("app-main");
const sidebarRoot = document.getElementById("sidebar-root");
const searchModalRoot = document.getElementById("search-modal-root");
const authModalRoot = document.getElementById("auth-modal-root");

const CACHED_USER_KEY = "plamut_cached_user";

let initialized = false;
let authSubscription = null;
let routeCleanup = null;
let routeRenderToken = 0;
let authApplyToken = 0;

let lastHeaderSignature = "";
let lastSidebarSignature = "";
let lastSearchModalSignature = "";
let lastAuthModalSignature = "";
let lastRouteSignature = "";

function hasRequiredRoots() {
  return Boolean(headerRoot && mainRoot && sidebarRoot && searchModalRoot && authModalRoot);
}

function normalizeTheme(value = "") {
  return value === "light" || value === "dark" || value === "system" ? value : "dark";
}

function normalizeLanguage(value = "") {
  return value === "en" || value === "ru" ? value : "ru";
}

function isAuthTimeoutOrNetworkError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  return [
    "timeout",
    "превышено время ожидания",
    "failed to fetch",
    "network",
    "fetch",
    "load failed",
    "networkerror"
  ].some((chunk) => message.includes(chunk));
}

function renderFatalAppError(message) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#111318;color:#f3f5f8;font-family:system-ui,-apple-system,sans-serif;">
      <div style="width:min(100%,560px);background:#181b22;border:1px solid #343c49;border-radius:20px;padding:24px;">
        <div style="font-size:22px;font-weight:800;margin-bottom:10px;">Plamut</div>
        <div style="font-size:15px;line-height:1.5;color:#c3cad5;">
          ${String(message || "Application error")}
        </div>
      </div>
    </div>
  `;
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", normalizeTheme(state.theme));
  document.documentElement.lang = normalizeLanguage(state.language);
}

function readCachedUser() {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user) {
  try {
    if (!user?.id) {
      localStorage.removeItem(CACHED_USER_KEY);
      return;
    }

    localStorage.setItem(
      CACHED_USER_KEY,
      JSON.stringify({
        id: user.id,
        email: user.email || null,
        username: user.username || null,
        display_name: user.display_name || "User",
        avatar_url: user.avatar_url || null,
        preferred_theme: normalizeTheme(user.preferred_theme || state.theme),
        preferred_language: normalizeLanguage(user.preferred_language || state.language)
      })
    );
  } catch (error) {
    console.warn("Cached user save skipped:", error);
  }
}

function clearCachedUser() {
  try {
    localStorage.removeItem(CACHED_USER_KEY);
  } catch (error) {
    console.warn("Cached user clear skipped:", error);
  }
}

function buildUsername(user) {
  const source =
    user?.user_metadata?.username ||
    user?.user_metadata?.preferred_username ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "user";

  return (
    String(source)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "user"
  );
}

function buildDisplayName(user) {
  return (
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "User"
  );
}

function buildAvatarUrl(user) {
  return user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
}

function normalizeAuthUser(authUser, profile = null) {
  if (!authUser?.id) return null;

  return {
    id: authUser.id,
    email: authUser.email || null,
    username: profile?.username || buildUsername(authUser),
    display_name: profile?.display_name || buildDisplayName(authUser),
    avatar_url: profile?.avatar_url || buildAvatarUrl(authUser),
    preferred_theme: normalizeTheme(profile?.preferred_theme || state.theme),
    preferred_language: normalizeLanguage(profile?.preferred_language || state.language)
  };
}

function usersEqual(a = {}, b = {}) {
  return JSON.stringify({
    id: a?.id || null,
    email: a?.email || null,
    username: a?.username || null,
    display_name: a?.display_name || null,
    avatar_url: a?.avatar_url || null,
    preferred_theme: normalizeTheme(a?.preferred_theme || state.theme),
    preferred_language: normalizeLanguage(a?.preferred_language || state.language)
  }) === JSON.stringify({
    id: b?.id || null,
    email: b?.email || null,
    username: b?.username || null,
    display_name: b?.display_name || null,
    avatar_url: b?.avatar_url || null,
    preferred_theme: normalizeTheme(b?.preferred_theme || state.theme),
    preferred_language: normalizeLanguage(b?.preferred_language || state.language)
  });
}

function setUserIfChanged(user) {
  if (!user?.id) return;

  if (!usersEqual(state.user, user)) {
    setUser(user);
  }
}

function applyUserPreferences(user) {
  const nextTheme = normalizeTheme(user?.preferred_theme || state.theme);
  const nextLanguage = normalizeLanguage(user?.preferred_language || state.language);

  if (nextTheme !== state.theme) {
    setTheme(nextTheme);
  }

  if (nextLanguage !== state.language) {
    setLanguage(nextLanguage);
  }
}

function hardLogoutToGuest() {
  authApplyToken += 1;
  clearCachedSession();
  clearCachedUser();
  setAuthStatus("guest");
  logoutUser();
  closeAuthModal();
}

async function applyAuthenticatedUser(authUser) {
  if (!authUser?.id) return;

  const token = authApplyToken + 1;
  authApplyToken = token;

  const profile = await fetchUserProfileSafe(authUser.id).catch((error) => {
    console.warn("Profile load skipped:", error);
    return null;
  });

  if (token !== authApplyToken) return;

  const normalizedUser = normalizeAuthUser(authUser, profile);

  if (!normalizedUser?.id) return;

  setUserIfChanged(normalizedUser);
  setAuthStatus("authenticated");
  writeCachedUser(normalizedUser);
  applyUserPreferences(normalizedUser);
}

async function hydrateAuthState() {
  const authState = await getCurrentAuthState();

  if (authState?.session?.user?.id) {
    setCachedSession(authState.session);
    await applyAuthenticatedUser(authState.session.user);
    return;
  }

  if (authState?.status === "guest") {
    hardLogoutToGuest();
    return;
  }

  if (authState?.status === "error") {
    if (state.user?.id && isAuthTimeoutOrNetworkError(authState.error)) {
      setAuthStatus("authenticated");
      return;
    }

    hardLogoutToGuest();
    return;
  }

  if (state.user?.id) {
    setAuthStatus("authenticated");
    return;
  }

  setAuthStatus("guest");
}

function bindAuthListener() {
  try {
    const supabase = getSupabaseClient();

    if (authSubscription?.unsubscribe) {
      authSubscription.unsubscribe();
      authSubscription = null;
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        hardLogoutToGuest();
        return;
      }

      if (session?.user?.id) {
        setCachedSession(session);

        applyAuthenticatedUser(session.user).catch((error) => {
          console.warn("Auth state apply skipped:", error);
        });

        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED" ||
          event === "INITIAL_SESSION"
        ) {
          closeAuthModal();
        }

        return;
      }

      if (event === "INITIAL_SESSION" && !session?.user?.id && !state.user?.id) {
        setAuthStatus("guest");
      }
    });

    authSubscription = data?.subscription || null;
  } catch (error) {
    console.warn("Auth listener skipped:", error);
  }
}

function getHeaderSignature() {
  return JSON.stringify({
    userId: state.user?.id || null,
    displayName: state.user?.display_name || "",
    username: state.user?.username || "",
    avatarUrl: state.user?.avatar_url || "",
    language: state.language
  });
}

function getSidebarSignature() {
  return JSON.stringify({
    sidebarOpen: state.sidebarOpen,
    userId: state.user?.id || null,
    displayName: state.user?.display_name || "",
    username: state.user?.username || "",
    avatarUrl: state.user?.avatar_url || "",
    language: state.language,
    theme: state.theme
  });
}

function getSearchModalSignature() {
  return JSON.stringify({
    searchModalOpen: state.searchModalOpen,
    searchQuery: state.searchQuery || "",
    searchContextCategory: state.searchContextCategory || "",
    language: state.language
  });
}

function getAuthModalSignature() {
  return JSON.stringify({
    authModalOpen: state.authModalOpen,
    authMode: state.authMode,
    language: state.language
  });
}

function getRouteAuthBucket() {
  if (state.user?.id) return "authenticated";
  if (state.authStatus === "restoring") return "restoring";
  return "guest";
}

function getRouteSignature() {
  return JSON.stringify({
    route: state.route,
    routeParams: state.routeParams,
    authBucket: getRouteAuthBucket(),
    language: state.language,
    theme: state.theme
  });
}

function cleanupCurrentRoute() {
  if (typeof routeCleanup !== "function") {
    routeCleanup = null;
    return;
  }

  try {
    routeCleanup();
  } catch (error) {
    console.warn("Route cleanup skipped:", error);
  }

  routeCleanup = null;
}

async function resolveRouteRenderer(route, params) {
  switch (route) {
    case ROUTES.HOME:
      return renderHomePage(mainRoot);

    case ROUTES.CATEGORIES:
      return renderCategoriesPage(mainRoot);

    case ROUTES.CATEGORY_LIBRARY:
      return renderCategoryPage(mainRoot, params);

    case ROUTES.SEARCH:
      return renderSearchPage(mainRoot, params);

    case ROUTES.CARD:
      return renderCardPage(mainRoot, params);

    case ROUTES.UNIVERSES:
      return renderUniversesPage(mainRoot);

    case ROUTES.UNIVERSE_DETAILS:
      return renderUniversePage(mainRoot, params);

    case ROUTES.SETTINGS:
      return renderSettingsPage(mainRoot);

    case ROUTES.GUEST:
      return renderGuestPage(mainRoot, params);

    default:
      return renderHomePage(mainRoot);
  }
}

function renderBootShell() {
  mainRoot.innerHTML = `
    <section style="padding:16px;border:1px solid var(--border);border-radius:18px;background:var(--surface);color:var(--text-soft);">
      ${state.language === "en" ? "Loading…" : "Загрузка…"}
    </section>
  `;
}

function renderRouteSafely() {
  if (state.authStatus === "restoring" && !state.user?.id) {
    cleanupCurrentRoute();
    renderBootShell();
    return;
  }

  const token = routeRenderToken + 1;
  routeRenderToken = token;

  cleanupCurrentRoute();

  Promise.resolve(resolveRouteRenderer(state.route, state.routeParams || {}))
    .then((cleanup) => {
      if (token !== routeRenderToken) {
        if (typeof cleanup === "function") {
          cleanup();
        }
        return;
      }

      routeCleanup = typeof cleanup === "function" ? cleanup : null;
    })
    .catch((error) => {
      if (token !== routeRenderToken) return;

      console.warn("Route render error:", error);

      mainRoot.innerHTML = `
        <div style="padding:24px;border:1px solid var(--border);border-radius:18px;background:var(--surface);color:var(--text-soft);">
          ${state.language === "en" ? "Could not open this page. Go back home." : "Не удалось открыть страницу. Вернись на главную."}
        </div>
      `;
    });
}

function renderApp() {
  if (!hasRequiredRoots()) {
    renderFatalAppError("Не найдены обязательные root-контейнеры приложения.");
    return;
  }

  try {
    applyTheme();

    const headerSignature = getHeaderSignature();
    if (headerSignature !== lastHeaderSignature) {
      renderHeader(headerRoot);
      lastHeaderSignature = headerSignature;
    }

    const sidebarSignature = getSidebarSignature();
    if (sidebarSignature !== lastSidebarSignature) {
      renderSidebar(sidebarRoot);
      lastSidebarSignature = sidebarSignature;
    }

    const searchModalSignature = getSearchModalSignature();
    if (searchModalSignature !== lastSearchModalSignature) {
      renderSearchModal(searchModalRoot, {
        category: state.searchContextCategory || null
      });
      lastSearchModalSignature = searchModalSignature;
    }

    const authModalSignature = getAuthModalSignature();
    if (authModalSignature !== lastAuthModalSignature) {
      renderAuthModal(authModalRoot);
      lastAuthModalSignature = authModalSignature;
    }

    const routeSignature = getRouteSignature();
    if (routeSignature !== lastRouteSignature) {
      lastRouteSignature = routeSignature;
      renderRouteSafely();
    }
  } catch (error) {
    console.warn("App render error:", error);
    renderFatalAppError("Ошибка запуска интерфейса. Проверь console.");
  }
}

function restoreCachedUserBeforeNetwork() {
  const cachedUser = readCachedUser();

  if (cachedUser?.id) {
    setUserIfChanged(cachedUser);
    setAuthStatus("authenticated");
    return true;
  }

  setAuthStatus("restoring");
  return false;
}

async function init() {
  if (initialized) return;
  initialized = true;

  if (!hasRequiredRoots()) {
    renderFatalAppError("Структура index.html не содержит обязательные контейнеры приложения.");
    return;
  }

  initState();
  subscribe(renderApp);

  restoreCachedUserBeforeNetwork();
  renderApp();
  bindAuthListener();

  try {
    initRouter();
  } catch (error) {
    console.warn("Router init error:", error);
  }

  hydrateAuthState().catch((error) => {
    console.warn("Deferred auth hydration skipped:", error);

    if (state.user?.id && isAuthTimeoutOrNetworkError(error)) {
      setAuthStatus("authenticated");
      return;
    }

    hardLogoutToGuest();
  });
}

init();
