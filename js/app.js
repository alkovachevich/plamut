import { ROUTES } from "./config.js";
import { initRouter } from "./router.js";
import { state, subscribe } from "./state.js";

import { renderHeader } from "./components/header.js";
import { renderSidebar } from "./components/sidebar.js";
import { renderSearchModal } from "./components/search-modal.js";

import { renderHomePage } from "./pages/home.js";
import { renderCategoriesPage } from "./pages/categories.js";
import { renderCategoryPage } from "./pages/category.js";
import { renderSearchPage } from "./pages/search.js";
import { renderCardPage } from "./pages/card.js";
import { renderUniversesPage } from "./pages/universes.js";
import { renderUniversePage } from "./pages/universe.js";
import { renderSettingsPage } from "./pages/settings.js";
import { renderGuestPage } from "./pages/guest.js";

const headerRoot = document.getElementById("app-header");
const mainRoot = document.getElementById("app-main");
const sidebarRoot = document.getElementById("sidebar-root");
const searchModalRoot = document.getElementById("search-modal-root");

/* =========================
   THEME
========================= */

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
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
      renderGuestPage(mainRoot);
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
  applyTheme();

  renderHeader(headerRoot);
  renderSidebar(sidebarRoot);
  renderSearchModal(searchModalRoot);

  renderRoute();
}

/* =========================
   INIT
========================= */

function init() {
  initRouter();
  subscribe(renderApp);
  renderApp();
}

init();
