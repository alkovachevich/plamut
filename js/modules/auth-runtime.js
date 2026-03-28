export function createAuthRuntime(deps){
  const {
    state,
    t,
    supabaseClient,
    syncCurrentUserCache,
    setAuthorizedButtons,
    ensureCurrentProfileData,
    refreshAccountCollectionsUI,
    clearRouteState,
    showAuthorizedUI,
    hideAllScreens,
    closePreferencesPanel,
    closeProfileModal,
    closeShareModal,
    restoreRouteState,
    updatePrimaryActionVisibility
  } = deps;

  async function register(){
    const email = document.getElementById("login-email")?.value?.trim() || "";
    const password = document.getElementById("login-password")?.value || "";

    if(!email || !password){
      alert(t().auth.fillAllFields);
      return false;
    }

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password
    });

    if(error){
      console.error("Register error:", error);
      alert(error.message || t().auth.registerError);
      return false;
    }

    if(data?.user){
      syncCurrentUserCache(data.user);
    }

    alert(t().auth.registerSuccess);
    return true;
  }

  async function login(){
    const email = document.getElementById("login-email")?.value?.trim() || "";
    const password = document.getElementById("login-password")?.value || "";

    if(!email || !password){
      alert(t().auth.fillAllFields);
      return false;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if(error){
      console.error("Login error:", error);
      alert(error.message || t().auth.loginError);
      return false;
    }

    if(data?.user){
      syncCurrentUserCache(data.user);
    }

    await showAuthorizedUI({ restoreRoute: true });
    return true;
  }

  async function logout(){
    const { error } = await supabaseClient.auth.signOut();

    if(error){
      console.error("Logout error:", error);
      alert(error.message || t().profile.logoutError);
      return false;
    }

    syncCurrentUserCache(null);
    state.currentProfileData = null;
    state.currentOpenItemId = null;
    state.currentCategory = "";
    state.isPublicView = false;

    closePreferencesPanel();
    closeProfileModal?.();
    closeShareModal?.();

    hideAllScreens();
    document.getElementById("auth-screen")?.classList.remove("hidden");

    setAuthorizedButtons(false);
    clearRouteState();
    updatePrimaryActionVisibility();

    return true;
  }

  async function checkAuth(){
    const { data, error } = await supabaseClient.auth.getSession();

    if(error){
      console.error("Check auth error:", error);
    }

    const session = data?.session || null;
    const user = session?.user || null;

    syncCurrentUserCache(user);

    if(user){
      setAuthorizedButtons(true);
      await ensureCurrentProfileData();
      refreshAccountCollectionsUI?.();

      const restored = await restoreRouteState({ isAuthenticated: true });
      if(!restored){
        await showAuthorizedUI({ restoreRoute: false });
      } else {
        updatePrimaryActionVisibility();
      }

      return true;
    }

    setAuthorizedButtons(false);
    hideAllScreens();
    document.getElementById("auth-screen")?.classList.remove("hidden");
    updatePrimaryActionVisibility();
    return false;
  }

  return {
    register,
    login,
    logout,
    checkAuth
  };
}
