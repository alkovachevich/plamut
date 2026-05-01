import { setRoute } from "./state.js";

function normalizePath(path = "/") {
  const clean = String(path || "/").trim();
  if (!clean.startsWith("/")) return `/${clean}`;
  return clean.replace(/\/+$/, "") || "/";
}

function parseQuery(search = "") {
  const params = new URLSearchParams(search || "");
  const result = {};

  for (const [key, value] of params.entries()) {
    result[key] = value;
  }

  return result;
}

function buildUrl(path = "/", params = {}) {
  const cleanPath = normalizePath(path);
  const query = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  const queryString = query.toString();
  return queryString ? `${cleanPath}?${queryString}` : cleanPath;
}

function syncRouteFromLocation() {
  const path = normalizePath(window.location.pathname);
  const params = parseQuery(window.location.search);

  setRoute(path, params);
}

export function initRouter() {
  window.removeEventListener("popstate", syncRouteFromLocation);
  window.addEventListener("popstate", syncRouteFromLocation);

  syncRouteFromLocation();
}

export function navigate(path = "/", params = {}, options = {}) {
  const url = buildUrl(path, params);
  const currentUrl = `${window.location.pathname}${window.location.search}`;

  if (url === currentUrl && !options.force) {
    syncRouteFromLocation();
    return;
  }

  if (options.replace) {
    window.history.replaceState({}, "", url);
  } else {
    window.history.pushState({}, "", url);
  }

  syncRouteFromLocation();
}

export function replace(path = "/", params = {}) {
  navigate(path, params, { replace: true });
}

export function getCurrentRoute() {
  return {
    path: normalizePath(window.location.pathname),
    params: parseQuery(window.location.search)
  };
}
