import { setState, state } from "./state.js";
import { ROUTES } from "./config.js";


const validRoutes = new Set(Object.values(ROUTES));


export function initRouter() {
  window.addEventListener("popstate", syncRouteFromLocation);
  syncRouteFromLocation();
}


export function navigate(path) {
  const nextPath = validRoutes.has(path) ? path : ROUTES.HOME;
  if (window.location.pathname !== nextPath) {
    history.pushState({}, "", nextPath);
  }
  setState({ route: nextPath });
}


function syncRouteFromLocation() {
  const path = validRoutes.has(window.location.pathname)
    ? window.location.pathname
    : ROUTES.HOME;


  if (window.location.pathname !== path) {
    history.replaceState({}, "", path);
  }


  if (state.route !== path) {
    setState({ route: path });
  }
}
