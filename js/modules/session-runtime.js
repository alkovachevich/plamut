export function createSessionRuntime(deps){
  const {
    state,
    getCurrentUser,
    syncCurrentUserCache,
    hideAllScreens,
    updatePrimaryActionVisibility,
    showAuthorizedUI,
    setAuthorizedButtons,
    clearRouteState
  } = deps;

  const ROUTE_STATE_STORAGE_KEY = "plamut_route_state";
  const FOREGROUND_RESTORE_COOLDOWN_MS = 1200;

  let routeRestoreInProgress = false;
  let foregroundRestorePromise = null;
  let lastForegroundRestoreAt = 0;

  function getCurrentRouteSnapshot(getVisibleScreenName){
    return {
      screen: getVisibleScreenName(),
      category: state.currentCategory || "",
      openItemId: Number.isFinite(Number(state.currentOpenItemId)) ? Number(state.currentOpenItemId) : null,
      isPublicShareRoute: Boolean(state.activeShareToken),
      shareToken: state.activeShareToken || "",
      sharePath: window.location.pathname.startsWith("/nfc/") ? "nfc" : "share"
    };
  }

  function saveRouteState(routePatch = {}, getVisibleScreenName){
    if(routeRestoreInProgress) return;

    const payload = {
      ...getCurrentRouteSnapshot(getVisibleScreenName),
      ...routePatch,
      updatedAt: Date.now()
    };

    try {
      sessionStorage.setItem(ROUTE_STATE_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.error("Route state save error:", error);
    }
  }

  function readRouteState(){
    try {
      const raw = sessionStorage.getItem(ROUTE_STATE_STORAGE_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (error) {
      console.error("Route state read error:", error);
      return null;
    }
  }

  function clearSessionRouteState(){
    try {
      sessionStorage.removeItem(ROUTE_STATE_STORAGE_KEY);
    } catch (error) {
      console.error("Route state clear error:", error);
    }
  }

  async function restoreRouteState(options = {}, restoreHandler){
    const routeState = readRouteState();
    if(!routeState) return false;

    const isAuthenticated = Boolean(options.isAuthenticated);
    if(!isAuthenticated && !routeState.isPublicShareRoute){
      return false;
    }

    routeRestoreInProgress = true;
    try {
      if(typeof restoreHandler !== "function"){
        return false;
      }
      return await restoreHandler(routeState, options);
    } catch (error) {
      console.error("Route state restore error:", error);
      return false;
    } finally {
      routeRestoreInProgress = false;
    }
  }

  async function restoreRouteStateIfNeededOnForeground(restoreHandler){
    if(routeRestoreInProgress) return;
    if(foregroundRestorePromise) return await foregroundRestorePromise;
    if(Date.now() - lastForegroundRestoreAt < FOREGROUND_RESTORE_COOLDOWN_MS) return;

    foregroundRestorePromise = (async () => {
      const user = await getCurrentUser();
      if(!user) return;

      const routeState = readRouteState();
      if(!routeState) return;

      const currentHomeVisible = !document.getElementById("home-screen")?.classList.contains("hidden");
      const currentAuthVisible = !document.getElementById("auth-screen")?.classList.contains("hidden");

      const shouldRestore =
        routeState.isPublicShareRoute ||
        routeState.screen === "library" ||
        routeState.screen === "category" ||
        routeState.screen === "details";

      if(shouldRestore && (currentHomeVisible || currentAuthVisible)){
        await restoreRouteState({ isAuthenticated: true }, restoreHandler);
        lastForegroundRestoreAt = Date.now();
      }
    })();

    try {
      await foregroundRestorePromise;
    } finally {
      foregroundRestorePromise = null;
    }
  }

  async function showAuthScreen(){
    hideAllScreens();
    document.getElementById("auth-screen")?.classList.remove("hidden");
    setAuthorizedButtons(false);
    updatePrimaryActionVisibility();
    clearSessionRouteState();
  }

  async function showAuthorizedSession(options = {}){
    const shouldRestoreRoute = options.restoreRoute !== false;

    if(shouldRestoreRoute && typeof options.restoreHandler === "function"){
      const restored = await restoreRouteState({ isAuthenticated: true }, options.restoreHandler);
      if(restored){
        setAuthorizedButtons(true);
        updatePrimaryActionVisibility();
        return true;
      }
    }

    await showAuthorizedUI({ restoreRoute: false });
    setAuthorizedButtons(true);
    updatePrimaryActionVisibility();
    return true;
  }

  function bindVisibilityRestore(restoreHandler, getVisibleScreenName){
    document.addEventListener("visibilitychange", async () => {
      if(document.visibilityState === "hidden"){
        saveRouteState({}, getVisibleScreenName);
        return;
      }
      await restoreRouteStateIfNeededOnForeground(restoreHandler);
    });
  }

  function bindBeforeUnloadSave(getVisibleScreenName){
    window.addEventListener("beforeunload", () => {
      saveRouteState({}, getVisibleScreenName);
    });
  }

  function attachAuthStateListener(authBootstrapRef, onAuthorized){
    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      if(!authBootstrapRef.current) return;

      syncCurrentUserCache(session?.user || null);

      if(state.activeShareToken){
        setAuthorizedButtons(Boolean(session?.user));
        return;
      }

      if(session?.user){
        setAuthorizedButtons(true);
        if(typeof onAuthorized === "function"){
          await onAuthorized(session.user);
        }
        updatePrimaryActionVisibility();
      } else {
        hideAllScreens();
        document.getElementById("auth-screen")?.classList.remove("hidden");
        setAuthorizedButtons(false);
        clearRouteState?.();
        clearSessionRouteState();
        updatePrimaryActionVisibility();
      }
    });
  }

  return {
    saveRouteState,
    readRouteState,
    clearSessionRouteState,
    restoreRouteState,
    restoreRouteStateIfNeededOnForeground,
    showAuthScreen,
    showAuthorizedSession,
    bindVisibilityRestore,
    bindBeforeUnloadSave,
    attachAuthStateListener
  };
}
