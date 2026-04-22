import { ROUTES } from "./config.js";
import { setRoute, state } from "./state.js";

/* =========================
   HELPERS
========================= */

function parseQuery(search = "") {
  const params = {};
  const urlParams = new URLSearchParams(search);

  for (const [key, value] of urlParams.entries()) {
    params[key] = value;
  }

  return params;
}

function buildQuery(params = {}) {
  const urlParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      urlParams.set(key, value);
    }
  });

  const queryString = urlParams.toString();
  return queryString ? `?${queryString}` : "";
}

/* =========================
   ROUTE MATCHING
========================= */

function resolveRoute(pathname) {
  switch (pathname) {
    case ROUTES.HOME:
      return ROUTES.HOME;

    case ROUTES.CATEGORIES:
      return ROUTES.CATEGORIES;

    case ROUTES.CATEGORY_LIBRARY:
      return ROUTES.CATEGORY_LIBRARY;

    case ROUTES.SEARCH:
      return ROUTES.SEARCH;

    case ROUTES.CARD:
      return ROUTES.CARD;

    case ROUTES.UNIVERSES:
      return ROUTES.UNIVERSES;

    case ROUTES.UNIVERSE_DETAILS:
      return ROUTES.UNIVERSE_DETAILS;

    case ROUTES.SETTINGS:
      return ROUTES.SETTINGS;

    case ROUTES.GUEST:
      return ROUTES.GUEST;

    default:
      return ROUTES.HOME;
  }
}

/* =========================
   NAVIGATION
========================= */

export function navigate(route, params = {}) {
  const path = route;
  const query = buildQuery(params);

  const url = `${path}${query}`;

  if (window.location.pathname + window.location.search !== url) {
    history.pushState({}, "", url);
  }

  setRoute(route, params);
}

/* =========================
   INIT ROUTER
========================= */

export function initRouter() {
  window.addEventListener("popstate", syncRouteFromLocation);
  syncRouteFromLocation();
}

/* =========================
   SYNC
========================= */

function syncRouteFromLocation() {
  const { pathname, search } = window.location;

  const route = resolveRoute(pathname);
  const params = parseQuery(search);

  if (
    state.route !== route ||
    JSON.stringify(state.routeParams) !== JSON.stringify(params)
  ) {
    setRoute(route, params);
  }
}
