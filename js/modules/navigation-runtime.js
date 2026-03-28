export function createNavigationRuntime(deps){
  const {
    state,
    BASE_CATEGORIES,
    normalizeSpaces,
    translateCategory,
    readRouteState,
    saveRouteState,
    clearRouteState,
    hideAllScreens,
    renderShelf,
    renderLibraryCategories,
    loadCategoryFromSupabase,
    openCardById,
    loadNfcRoute,
    loadPublicShareRoute,
    showPublicShareScreen,
    renderShareState,
    showPublicLibraryCategoryView,
    closePreferencesPanel,
    resetShelfSearchQuery,
    updatePrimaryActionVisibility,
    toggleCategoryFilters,
    toggleHomeAddPanel
  } = deps;

  function getVisibleScreenName(){
    if(!document.getElementById("details-screen")?.classList.contains("hidden")) return "details";
    if(!document.getElementById("category-screen")?.classList.contains("hidden")) return "category";
    if(!document.getElementById("library-screen")?.classList.contains("hidden")) return "library";
    if(!document.getElementById("public-share-screen")?.classList.contains("hidden")) return "public-share";
    if(!document.getElementById("auth-screen")?.classList.contains("hidden")) return "auth";
    return "home";
  }

  function setPublicRouteMode(active){
    document.body.classList.toggle("public-route-active", Boolean(active));
    const appShell = document.getElementById("app-shell");
    if(appShell){
      appShell.classList.toggle("public-route-shell", Boolean(active));
    }
  }

  function goHome(){
    closePreferencesPanel();
    resetShelfSearchQuery();
    toggleHomeAddPanel(false);

    if(state.activeShareToken && state.currentPublicProfile && !state.currentPublicProfile.isOwner){
      if(document.body.classList.contains("public-route-active")){
        showPublicShareScreen(state.currentPublicProfile);
        renderShareState(state.currentPublicShareItems.length ? "ready" : state.currentPublicShareState);
      } else {
        showPublicLibraryCategoryView(state.currentPublicProfile);
      }
      updatePrimaryActionVisibility();
      saveRouteState({ screen: "public-share" });
      return;
    }

    state.isPublicView = false;
    state.currentOpenItemId = null;
    hideAllScreens();
    document.getElementById("home-screen").classList.remove("hidden");
    toggleCategoryFilters(false);
    updatePrimaryActionVisibility();
    saveRouteState({
      screen: "home",
      category: "",
      openItemId: null,
      isPublicShareRoute: false,
      shareToken: ""
    });
  }

  async function openLibraryScreen(options = {}){
    closePreferencesPanel();
    toggleHomeAddPanel(false);
    state.isPublicView = false;
    state.currentOpenItemId = null;

    hideAllScreens();
    document.getElementById("library-screen")?.classList.remove("hidden");
    renderLibraryCategories();
    updatePrimaryActionVisibility();

    if(!options.skipRouteSave){
      saveRouteState({
        screen: "library",
        openItemId: null,
        isPublicShareRoute: false,
        shareToken: ""
      });
    }
  }

  function backToCategory(){
    closePreferencesPanel();
    state.currentOpenItemId = null;
    hideAllScreens();
    document.getElementById("category-screen").classList.remove("hidden");
    updatePrimaryActionVisibility();
    saveRouteState({
      screen: "category",
      category: state.currentCategory || "",
      openItemId: null,
      isPublicShareRoute: false,
      shareToken: ""
    });
  }

  async function openCategory(name, options = {}){
    closePreferencesPanel();
    state.isPublicView = false;
    state.currentCategory = name;
    state.currentOpenItemId = null;
    resetShelfSearchQuery();

    hideAllScreens();
    document.getElementById("category-screen").classList.remove("hidden");
    document.getElementById("category-title").textContent = translateCategory(name);
    document.getElementById("back-home-btn").onclick = () => openLibraryScreen();
    toggleCategoryFilters(false);

    const addFolderBtn = document.getElementById("add-folder-btn");
    if(addFolderBtn){
      addFolderBtn.classList.toggle("hidden", name === "Blacklist");
      addFolderBtn.style.display = name === "Blacklist" ? "none" : "";
    }

    const tabs = document.getElementById("public-category-tabs");
    if(tabs){
      tabs.classList.add("hidden");
      tabs.style.display = "none";
    }

    await loadCategoryFromSupabase(name);
    renderShelf();
    updatePrimaryActionVisibility();

    if(!options.skipRouteSave){
      saveRouteState({
        screen: "category",
        category: name,
        openItemId: null,
        isPublicShareRoute: false,
        shareToken: ""
      });
    }
  }

  async function restoreRouteState(options = {}){
    const routeState = readRouteState();
    if(!routeState) return false;

    const isAuthenticated = Boolean(options.isAuthenticated);
    if(!isAuthenticated && !routeState.isPublicShareRoute){
      return false;
    }

    try {
      if(routeState.isPublicShareRoute && routeState.shareToken){
        if(routeState.sharePath === "nfc"){
          return await loadNfcRoute(routeState.shareToken);
        }
        return await loadPublicShareRoute(routeState.shareToken);
      }

      if(!isAuthenticated){
        return false;
      }

      const hasCategory = BASE_CATEGORIES.includes(routeState.category);
      const screen = routeState.screen || "home";

      if(screen === "library"){
        await openLibraryScreen({ skipRouteSave: true });
        return true;
      }

      if((screen === "category" || screen === "details") && hasCategory){
        await openCategory(routeState.category, { skipRouteSave: true });

        if(screen === "details" && Number.isFinite(Number(routeState.openItemId))){
          const restoredItemId = Number(routeState.openItemId);
          const item = (state.demoData[routeState.category] || []).find((row) => row.id === restoredItemId);
          if(item){
            await openCardById(restoredItemId, { skipRouteSave: true });
          }
        }

        return true;
      }

      if(screen === "home"){
        closePreferencesPanel();
        state.isPublicView = false;
        state.currentOpenItemId = null;
        hideAllScreens();
        document.getElementById("home-screen").classList.remove("hidden");
        toggleCategoryFilters(false);
        updatePrimaryActionVisibility();
        return true;
      }

      if(!hasCategory){
        await openLibraryScreen({ skipRouteSave: true });
        return true;
      }

      return false;
    } catch (error) {
      console.error("Route state restore error:", error);
      return false;
    }
  }

  async function checkPublicRoute(){
    const path = window.location.pathname;

    if(path.startsWith("/nfc/")){
      const token = decodeURIComponent(path.replace("/nfc/", "").trim());
      if(token){
        return await loadNfcRoute(token);
      }
    }

    if(path.startsWith("/share/")){
      const token = decodeURIComponent(path.replace("/share/", "").trim());
      if(token){
        return await loadPublicShareRoute(token);
      }
    }

    state.activeShareToken = "";
    return false;
  }

  async function initPublicSharePage(){
    const token = decodeURIComponent(
      window.location.pathname.replace(/^\/(?:share|nfc)\//, "").trim()
    );

    if(!token) return false;
    return window.location.pathname.startsWith("/nfc/")
      ? await loadNfcRoute(token)
      : await loadPublicShareRoute(token);
  }

  function exitPublicShareRoute(){
    clearRouteState();
    window.location.href = window.location.origin + "/";
  }

  function openSharedLibrary(){
    if(document.body.classList.contains("public-route-active")){
      if(state.currentPublicProfile && !state.currentPublicProfile.isOwner){
        showPublicLibraryCategoryView(state.currentPublicProfile);
        return;
      }

      saveRouteState({
        screen: "public-share",
        isPublicShareRoute: true,
        shareToken: state.activeShareToken || ""
      });
      return;
    }

    if(!state.currentPublicProfile) return;

    saveRouteState({
      screen: "category",
      category: "Books",
      isPublicShareRoute: true,
      shareToken: state.activeShareToken || ""
    });
  }

  return {
    getVisibleScreenName,
    setPublicRouteMode,
    goHome,
    openLibraryScreen,
    backToCategory,
    openCategory,
    restoreRouteState,
    checkPublicRoute,
    initPublicSharePage,
    exitPublicShareRoute,
    openSharedLibrary
  };
}
