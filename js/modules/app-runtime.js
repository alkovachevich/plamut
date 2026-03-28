export function createAppRuntime(deps){
  const {
    state,
    initPreferencesRuntime,
    initDomRuntime,
    initPublicSharePage,
    checkPublicRoute,
    checkAuth,
    setPublicRouteMode,
    updatePrimaryActionVisibility,
    supabaseClient,
    syncCurrentUserCache,
    setAuthorizedUi,
    ensureCurrentProfileData,
    safeLoadProfile,
    clearRouteState,
    hideAllScreens,
    closePreferencesPanel
  } = deps;

  let authBootstrapCompleted = false;

  function attachAuthStateListener(){
    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      if(!authBootstrapCompleted) return;

      syncCurrentUserCache(session?.user || null);

      const loginBtn = document.getElementById("login-top-btn");
      const profileBtn = document.getElementById("profile-btn");

      if(state.activeShareToken){
        setAuthorizedUi(Boolean(session?.user));
        if(session?.user){
          await ensureCurrentProfileData();
          await safeLoadProfile("authStateChange-public");
        }
        return;
      }

      if(session?.user){
        setAuthorizedUi(true);
        await ensureCurrentProfileData();
        await safeLoadProfile("authStateChange");
        updatePrimaryActionVisibility();
      } else {
        closePreferencesPanel();
        hideAllScreens();
        document.getElementById("auth-screen")?.classList.remove("hidden");
        setAuthorizedUi(false);
        clearRouteState();

        if(loginBtn) loginBtn.classList.remove("hidden");
        if(profileBtn) profileBtn.classList.add("hidden");
      }
    });
  }

  async function initApp(){
    setPublicRouteMode(false);
    attachAuthStateListener();

    const openedPublic = await checkPublicRoute();
    if(!openedPublic){
      await checkAuth();
    }

    authBootstrapCompleted = true;
  }

  async function init(){
    initPreferencesRuntime();
    initDomRuntime();

    if(window.location.pathname.startsWith("/share/") || window.location.pathname.startsWith("/nfc/")){
      await initPublicSharePage();
      updatePrimaryActionVisibility();
      return;
    }

    await initApp();
    updatePrimaryActionVisibility();
  }

  return {
    initApp,
    init
  };
}
