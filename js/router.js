import { state, setRoute } from "./state.js";

const routes = new Map();
let rootNode = null;
let currentCleanup = null;

function normalizePath(path = "/") {
  if (!path.startsWith("/")) path = `/${path}`;
  return path.replace(/\/+$/, "") || "/";
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
  const url = new URL(window.location.origin + cleanPath);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.pathname + (url.search ? `?${url.searchParams.toString()}` : "");
}

function resolveRoute(pathname = "/", search = "") {
  const path = normalizePath(pathname);
  const params = parseQuery(search);

  if (routes.has(path)) {
    return {
      path,
      params,
      handler: routes.get(path)
    };
  }

  // fallback: try dynamic patterns like /card or /universe already mapped
  if (routes.has("*")) {
    return {
      path,
      params,
      handler: routes.get("*")
    };
  }

  return null;
}

async function render(pathname, search) {
  if (!rootNode) return;

  const resolved = resolveRoute(pathname, search);

  if (!resolved) {
    rootNode.innerHTML = `<div style="padding:24px;">404</div>`;
    return;
  }

  const { handler, params, path } = resolved;

  // cleanup previous page
  if (typeof currentCleanup === "function") {
    try {
      currentCleanup();
    } catch (e) {
      console.warn("route cleanup error:", e);
    }
    currentCleanup = null;
  }

  try {
    setRoute(path, params);

    const cleanup = await handler(rootNode, params);

    if (typeof cleanup === "function") {
      currentCleanup = cleanup;
    }
  } catch (error) {
    console.warn("route render error:", error);
    rootNode.innerHTML = `<div style="padding:24px;">Error</div>`;
  }
}

function onPopState() {
  render(window.location.pathname, window.location.search);
}

export function initRouter(root) {
  rootNode = root;

  window.addEventListener("popstate", onPopState);

  render(window.location.pathname, window.location.search);
}

export function registerRoute(path, handler) {
  routes.set(normalizePath(path), handler);
}

export function registerFallback(handler) {
  routes.set("*", handler);
}

export function navigate(path = "/", params = {}, options = {}) {
  const url = buildUrl(path, params);

  if (options.replace) {
    window.history.replaceState({}, "", url);
  } else {
    window.history.pushState({}, "", url);
  }

  render(window.location.pathname, window.location.search);
}

export function getCurrentRoute() {
  return {
    path: state.route,
    params: state.routeParams || {}
  };
}
