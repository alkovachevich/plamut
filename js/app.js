import { ROUTES } from "./config.js";
import { initRouter } from "./router.js";
import { state, subscribe, setUser, logoutUser, closeAuthModal } from "./state.js";

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
  getCurrentSession,
  fetchUserProfile,
  upsertUserProfile
} from "./lib/supabase-client.js";

const headerRoot = document.getElementById("app-header");
const mainRoot = document.getElementById("app-main");
const sidebarRoot = document.getElementById("sidebar-root");
const searchModalRoot = document.getElementById("search-modal-root");
const authModalRoot = document.getElementById("auth-modal-root");

let initialized = false;
let authHydrated = false;
let authSubscription = null;

let lastHeaderSignature = null;
let lastSidebarSignature = null;
let lastSearchModalSignature = null;
let lastAuthModalSignature = null;
let lastRouteSignature = null;

function hasRequiredRoots() {
  return Boolean(
    headerRoot &&
      mainRoot &&
      sidebarRoot &&
      searchModalRoot &&
      authModalRoot
  );
}

function renderFatalAppError(message) {
  document.body.innerHTML = `
    <div style="
      min-height:100vh;
      display:grid;
      place-items:center;
      padding:24px;
      background:#111318;
      color:#f3f5f8;
      font-family:system-ui,-apple-system,sans-serif;
    ">
      <div style="
        width:min(100%,560px);
        background:#181b22;
        border:1px solid #343c49;
        border-radius:20px;
        padding:24px;
      ">
        <div style="font-size:22px;font-weight:800;margin-bottom:10px;">Plamut</div>
        <div style="font-size:15px;line-height:1.5;color:#c3cad5;">
          ${String(message || "Application error")}
        </div>
      </div>
    </div>
  `;
}

function renderAppLoading() {
  mainRoot.innerHTML = `
    <div style="
      padding:24px;
      color:var(--text-soft);
    ">
      Загрузка профиля...
    </div>
  `;
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme || "dark");
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

function buildDisplayName(user, profile = null) {
  return (
    profile?.display_name ||
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "User"
  );
}

function buildAvatarUrl(user, profile = null) {
  return (
    profile?.avatar_url ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    null
  );
}

async function ensureUserProfile(user) {
  if (!user?.id) return null;

  try {
    const existingProfile = await fetchUserProfile(user.id);

    const payload = {
      id: user.id,
      username: existingProfile?.username || buildUsername(user),
      display_name: existingProfile?.display_name || buildDisplayName(user, existingProfile),
      avatar_url: existingProfile?.avatar_url || buildAvatarUrl(user, existingProfile)
    };

    return await upsertUserProfile(payload);
  } catch (error) {
    console.error("ensureUserProfile error:", error);
    return null;
  }
}

async function applyAuthenticatedUser(user) {
  if (!user?.id) return;

  const profile = await ensureUserProfile(user);

  setUser({
    id: user.id,
    email: user.email || null,
    username: profile?.username || buildUsername(user),
    display_name: profile?.display_name || buildDisplayName(user, profile),
    avatar_url: profile?.avatar_url || buildAvatarUrl(user, profile)
  });
}

async function hydrateAuthStateSafely() {
  try {
    const session = await getCurrentSession();
    const user = session?.user || null;

    if (user?.id) {
      await applyAuthenticatedUser(user);
    } else {
      logoutUser();
    }
  } catch (error) {
    console.error("Auth hydration skipped:", error);
  } finally {
    authHydrated = true;
  }
}

function bindAuthListenerSafely() {
  try {
    const supabase = getSupabaseClient();

    if (authSubscription?.unsubscribe) {
      authSubscription.unsubscribe();
      authSubscription = null;
    }

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (event === "SIGNED_OUT") {
          logoutUser();
          closeAuthModal();
          renderApp();
          return;
        }

        if (!session?.user) {
          return;
        }

        await applyAuthenticatedUser(session.user);

        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED" ||
          event === "INITIAL_SESSION"
        ) {
          closeAuthModal();
        }

        renderApp();
      } catch (error) {
        console.error("Auth state change error:", error);
      }
    });

    authSubscription = data?.subscription || null;
  } catch (error) {
    console.error("Auth listener skipped:", error);
  }
}

function getHeaderSignature() {
  return JSON.stringify({
    userId: state.user?.id || null,
    displayName: state.user?.display_name || "",
    username: state.user?.username || "",
    avatarUrl: state.user?.avatar_url || "",
    authHydrated
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
    theme: state.theme,
    authHydrated
  });
}

function getSearchModalSignature() {
  return JSON.stringify({
    searchModalOpen: state.searchModalOpen,
    searchQuery: state.searchQuery || ""
  });
}

function getAuthModalSignature() {
  return JSON.stringify({
    authModalOpen: state.authModalOpen,
    authMode: state.authMode
  });
}

function getRouteSignature() {
  return JSON.stringify({
    route: state.route,
    routeParams: state.routeParams,
    userId: state.user?.id || null,
    language: state.language,
    theme: state.theme,
    authHydrated
  });
}

function renderRouteSafely() {
  if (!authHydrated) {
    renderAppLoading();
    return;
  }

  const route = state.route;
  const params = state.routeParams || {};

  try {
    switch (route) {
      case ROUTES.HOME:
        renderHomePage(mainRoot);
        break;
      case ROUTES.CATEGORIES:
        renderCategoriesPage(mainRoot);
        break;
      case ROUTES.CATEGORY_LIBRARY:
        renderCategoryPage(mainRoot, params);
        break;
      case ROUTES.SEARCH:
        renderSearchPage(mainRoot, params);
        break;
      case ROUTES.CARD:
        renderCardPage(mainRoot, params);
        break;
      case ROUTES.UNIVERSES:
        renderUniversesPage(mainRoot);
        break;
      case ROUTES.UNIVERSE_DETAILS:
        renderUniversePage(mainRoot, params);
        break;
      case ROUTES.SETTINGS:
        renderSettingsPage(mainRoot);
        break;
      case ROUTES.GUEST:
        renderGuestPage(mainRoot, params);
        break;
      default:
        renderHomePage(mainRoot);
        break;
    }
  } catch (error) {
    console.error("Route render error:", error);

    mainRoot.innerHTML = `
      <div style="
        padding:24px;
        border:1px solid var(--border);
        border-radius:18px;
        background:var(--surface);
        color:var(--text-soft);
      ">
        Не удалось открыть страницу. Вернись на главную.
      </div>
    `;
  }
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
      renderSearchModal(searchModalRoot);
      lastSearchModalSignature = searchModalSignature;
    }

    const authModalSignature = getAuthModalSignature();
    if (authModalSignature !== lastAuthModalSignature) {
      renderAuthModal(authModalRoot);
      lastAuthModalSignature = authModalSignature;
    }

    const routeSignature = getRouteSignature();
    if (routeSignature !== lastRouteSignature) {
      renderRouteSafely();
      lastRouteSignature = routeSignature;
    }
  } catch (error) {
    console.error("App render error:", error);
    renderFatalAppError("Ошибка запуска интерфейса. Проверь console.");
  }
}

async function init() {
  if (initialized) return;
  initialized = true;

  if (!hasRequiredRoots()) {
    renderFatalAppError("Структура index.html не содержит обязательные контейнеры приложения.");
    return;
  }

  subscribe(renderApp);

  bindAuthListenerSafely();

  try {
    initRouter();
  } catch (error) {
    console.error("Router init error:", error);
  }

  renderApp();

  await hydrateAuthStateSafely();

  renderApp();
}

init();
