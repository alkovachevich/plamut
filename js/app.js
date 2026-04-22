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
let authSubscription = null;
let authHydrationPromise = null;

/* =========================
   ROOT CHECK
========================= */

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
  const safeMessage = String(message || "Application root error");

  document.body.innerHTML = `
    <div style="
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #0b0f14;
      color: #e8edf3;
      font-family: system-ui, -apple-system, sans-serif;
    ">
      <div style="
        width: min(100%, 560px);
        background: #11161d;
        border: 1px solid #232b36;
        border-radius: 20px;
        padding: 24px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      ">
        <div style="font-size: 22px; font-weight: 800; margin-bottom: 10px;">
          Plamut
        </div>
        <div style="font-size: 15px; line-height: 1.5; color: #9aa6b2;">
          ${safeMessage}
        </div>
      </div>
    </div>
  `;
}

/* =========================
   THEME
========================= */

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme || "dark");
}

/* =========================
   PROFILE HELPERS
========================= */

function buildUsername(user) {
  const source =
    user?.user_metadata?.username ||
    user?.user_metadata?.preferred_username ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "user";

  return String(source)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "user";
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

  const existingProfile = await fetchUserProfile(user.id);

  if (existingProfile) {
    const needsPatch =
      !existingProfile.username ||
      !existingProfile.display_name ||
      (buildAvatarUrl(user, existingProfile) && !existingProfile.avatar_url);

    if (!needsPatch) {
      return existingProfile;
    }

    try {
      return await upsertUserProfile({
        id: user.id,
        username: existingProfile.username || buildUsername(user),
        display_name: existingProfile.display_name || buildDisplayName(user, existingProfile),
        avatar_url: existingProfile.avatar_url || buildAvatarUrl(user, existingProfile)
      });
    } catch (error) {
      console.error("ensureUserProfile patch error:", error);
      return existingProfile;
    }
  }

  try {
    return await upsertUserProfile({
      id: user.id,
      username: buildUsername(user),
      display_name: buildDisplayName(user, null),
      avatar_url: buildAvatarUrl(user, null)
    });
  } catch (error) {
    console.error("ensureUserProfile create error:", error);
    return null;
  }
}

async function applyAuthenticatedUser(user) {
  if (!user?.id) {
    logoutUser();
    return;
  }

  const profile = await ensureUserProfile(user);

  setUser({
    id: user.id,
    email: user.email || null,
    username: profile?.username || buildUsername(user),
    display_name: profile?.display_name || buildDisplayName(user, profile),
    avatar_url: profile?.avatar_url || buildAvatarUrl(user, profile)
  });
}

/* =========================
   AUTH BOOTSTRAP
========================= */

async function hydrateAuthState() {
  if (authHydrationPromise) {
    return authHydrationPromise;
  }

  authHydrationPromise = (async () => {
    try {
      const session = await getCurrentSession();
      const user = session?.user || null;

      if (!user) {
        logoutUser();
        return;
      }

      await applyAuthenticatedUser(user);
    } catch (error) {
      console.error("Auth hydration error:", error);
      logoutUser();
    }
  })();

  try {
    await authHydrationPromise;
  } finally {
    authHydrationPromise = null;
  }
}

function bindAuthListener() {
  const supabase = getSupabaseClient();

  if (authSubscription?.unsubscribe) {
    authSubscription.unsubscribe();
    authSubscription = null;
  }

  const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
    try {
      if (event === "SIGNED_OUT" || !session?.user) {
        logoutUser();
        closeAuthModal();
        return;
      }

      await applyAuthenticatedUser(session.user);

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        closeAuthModal();
      }
    } catch (error) {
      console.error("Auth state change error:", error);
    }
  });

  authSubscription = data?.subscription || null;
}

/* =========================
   ROUTING
========================= */

function renderRoute() {
  const route = state.route;
  const params = state.routeParams || {};

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
}

/* =========================
   MAIN RENDER
========================= */

function renderApp() {
  if (!hasRequiredRoots()) {
    renderFatalAppError("Не найдены обязательные root-контейнеры приложения.");
    return;
  }

  applyTheme();

  renderHeader(headerRoot);
  renderSidebar(sidebarRoot);
  renderSearchModal(searchModalRoot);
  renderAuthModal(authModalRoot);

  renderRoute();
}

/* =========================
   INIT
========================= */

async function init() {
  if (initialized) return;
  initialized = true;

  if (!hasRequiredRoots()) {
    renderFatalAppError("Структура index.html не содержит обязательные контейнеры приложения.");
    return;
  }

  subscribe(renderApp);
  bindAuthListener();
  initRouter();
  await hydrateAuthState();
  renderApp();
}

init();
