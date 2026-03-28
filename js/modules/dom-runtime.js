export function createDomRuntime(deps){
  const {
    t,
    closeCardMenu,
    closePreferencesPanel,
    closeShareItemModal,
    closeFolderModal,
    toggleHomeAddPanel,
    closeProfileMenu,
    closeShareMenu,
    closeDetailsMenu,
    showRuntimeError,
    restoreRouteStateIfNeededOnForeground,
    saveRouteState,
    getVisibleScreenName,
    isMobileViewport,
    closeItemActionsSheet
  } = deps;

  function bindDocumentClickHandlers(){
    document.addEventListener("click", (event) => {
      const profileMenu = document.getElementById("profile-menu");
      const profileButton = document.getElementById("profile-btn");
      if(
        profileMenu &&
        !profileMenu.classList.contains("hidden") &&
        !profileMenu.contains(event.target) &&
        !profileButton?.contains(event.target)
      ){
        closeProfileMenu();
      }

      const shareMenu = document.getElementById("share-library-menu");
      const shareButton = document.getElementById("share-library-btn");
      if(
        shareMenu &&
        !shareMenu.classList.contains("hidden") &&
        !shareMenu.contains(event.target) &&
        !shareButton?.contains(event.target)
      ){
        closeShareMenu();
      }

      const detailsMenu = document.getElementById("details-menu");
      const detailsButton = document.getElementById("details-menu-btn");
      if(
        detailsMenu &&
        !detailsMenu.classList.contains("hidden") &&
        !detailsMenu.contains(event.target) &&
        !detailsButton?.contains(event.target)
      ){
        closeDetailsMenu();
      }
    });

    document.addEventListener("click", (event) => {
      if(!event.target.closest(".media-menu-wrap")){
        closeCardMenu();
      }
    });
  }

  function bindKeyboardHandlers(){
    document.addEventListener("keydown", (event) => {
      if(event.key === "Escape"){
        closeCardMenu();
        closePreferencesPanel();
        closeShareItemModal();
        closeFolderModal();
        toggleHomeAddPanel(false);
      }
    });
  }

  function bindWindowErrorHandlers(){
    window.addEventListener("error", (event) => {
      showRuntimeError(event?.message || "Unknown script error");
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event?.reason;
      showRuntimeError(reason?.message || reason || "Unhandled promise rejection");
    });
  }

  function bindVisibilityHandlers(){
    document.addEventListener("visibilitychange", async () => {
      if(document.visibilityState === "hidden"){
        saveRouteState({}, getVisibleScreenName);
        return;
      }
      await restoreRouteStateIfNeededOnForeground();
    });
  }

  function bindResizeHandlers(){
    window.addEventListener("resize", () => {
      if(!isMobileViewport()){
        closeItemActionsSheet();
      }
    });
  }

  function initDomRuntime(){
    bindDocumentClickHandlers();
    bindKeyboardHandlers();
    bindWindowErrorHandlers();
    bindVisibilityHandlers();
    bindResizeHandlers();
  }

  return {
    bindDocumentClickHandlers,
    bindKeyboardHandlers,
    bindWindowErrorHandlers,
    bindVisibilityHandlers,
    bindResizeHandlers,
    initDomRuntime
  };
}
