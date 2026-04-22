import { ROUTES } from "./config.js";
import { renderHeader } from "./components/header.js";
import { renderSidebar } from "./components/sidebar.js";
import { renderHomePage } from "./pages/home.js";
import { renderCategoriesPage } from "./pages/categories.js";
import { renderSettingsPage } from "./pages/settings.js";
import { renderPlaceholderPage } from "./pages/placeholder.js";
import { initRouter } from "./router.js";
import { state, subscribe } from "./state.js";


const headerRoot = document.getElementById("app-header");
const mainRoot = document.getElementById("app-main");
const sidebarRoot = document.getElementById("sidebar-root");


function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
}


function renderApp() {
  applyTheme();
  renderHeader(headerRoot);
  renderSidebar(sidebarRoot);


  switch (state.route) {
    case ROUTES.CATEGORIES:
      renderCategoriesPage(mainRoot);
      break;
    case ROUTES.SETTINGS:
      renderSettingsPage(mainRoot);
      break;
    case ROUTES.PLACEHOLDER:
      renderPlaceholderPage(mainRoot);
      break;
    case ROUTES.HOME:
    default:
      renderHomePage(mainRoot);
      break;
  }
}


subscribe(renderApp);
initRouter();
renderApp();
