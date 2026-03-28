export function createPublicRouteRuntime(deps){
  const {
    state,
    hideAllScreens,
    getCurrentUser,
    fetchProfileByUserId,
    fetchNfcTagByToken,
    fetchPublicProfileByToken,
    fetchPublicShareLibraryItems,
    getSavedLibraryState,
    applyPublicLibraryItems,
    renderPublicCard,
    renderShareLibrary,
    renderShareState,
    ensureCurrentProfileData,
    showAuthorizedUI,
    isShareEnabled,
    saveRouteState,
    setPublicRouteMode
  } = deps;

  async function openOwnerLibraryFromNfc(profile = {}, token = ""){
    state.activeShareToken = "";
    state.currentNfcContext = {
      token: token || "",
      ownerId: profile.id || null,
      mode: "owner",
      tagId: profile.nfc_tag_id || null
    };
    state.currentPublicProfile = { ...profile, isOwner: true };
    state.currentProfileData = { ...(state.currentProfileData || {}), ...profile };
    state.isPublicView = false;
    window.history.replaceState({}, "", "/");
    await showAuthorizedUI({ restoreRoute: false });
  }

  async function loadNfcRoute(token){
    state.activeShareToken = token || "";
    state.currentPublicProfile = null;
    state.currentPublicShareItems = [];
    state.currentPublicShareState = "loading";
    state.publicLibraryExpanded = true;
    state.currentSavedLibraryState = { saved: false, source: "none" };

    setPublicRouteMode(true);
    hideAllScreens();
    document.getElementById("public-share-screen")?.classList.remove("hidden");
    renderShareState("loading");

    try {
      let tag = await fetchNfcTagByToken(token);
      let profile = null;

      if(!tag){
        profile = await fetchPublicProfileByToken(token);
        if(profile){
          tag = {
            id: null,
            user_id: profile.id,
            token,
            is_active: true
          };
        }
      }

      if(!tag){
        state.currentPublicProfile = null;
        renderShareState("error");
        return true;
      }

      const user = await getCurrentUser();
      profile = profile || await fetchProfileByUserId(tag.user_id);

      if(user && user.id === tag.user_id){
        const ownerProfile = {
          ...(profile || {}),
          id: tag.user_id,
          nfc_tag_id: tag.id,
          nfc_token: tag.token,
          public_share_token: profile?.public_share_token || ""
        };
        await openOwnerLibraryFromNfc(ownerProfile, tag.token);
        return true;
      }

      if(!profile || !isShareEnabled(profile)){
        state.currentPublicProfile = null;
        renderShareState("error");
        return true;
      }

      state.currentNfcContext = {
        token: tag.token,
        ownerId: tag.user_id,
        mode: "guest",
        tagId: tag.id
      };

      state.currentPublicProfile = {
        ...profile,
        isOwner: false,
        nfc_tag_id: tag.id,
        nfc_token: tag.token
      };

      const items = await fetchPublicShareLibraryItems(profile.id);
      applyPublicLibraryItems(items);
      await getSavedLibraryState(profile.id, tag.token);
      renderPublicCard(state.currentPublicProfile);
      renderShareLibrary(items);

      saveRouteState({
        screen: "public-share",
        isPublicShareRoute: true,
        shareToken: token || "",
        sharePath: "nfc",
        openItemId: null
      });

      return true;
    } catch (error) {
      console.error("NFC page init error:", error);
      state.currentPublicProfile = null;
      renderShareState("error");
      return true;
    }
  }

  async function loadPublicShareRoute(token){
    state.activeShareToken = token || "";
    state.currentNfcContext = null;
    state.currentPublicProfile = null;
    state.currentPublicShareItems = [];
    state.currentPublicShareState = "loading";
    state.publicLibraryExpanded = false;

    setPublicRouteMode(true);
    hideAllScreens();
    document.getElementById("public-share-screen")?.classList.remove("hidden");
    renderShareState("loading");

    try {
      const profile = await fetchPublicProfileByToken(token);

      if(!profile || !isShareEnabled(profile)){
        state.currentPublicProfile = null;
        renderShareState("error");
        return true;
      }

      const user = await getCurrentUser();
      const isOwner = Boolean(user && user.id === profile.id);

      state.currentPublicProfile = {
        ...profile,
        isOwner,
        public_share_token: token
      };

      renderPublicCard(state.currentPublicProfile);

      const items = await fetchPublicShareLibraryItems(profile.id);

      if(!isOwner){
        await getSavedLibraryState(profile.id, token);
      } else {
        await ensureCurrentProfileData();
      }

      renderShareLibrary(items);

      saveRouteState({
        screen: "public-share",
        isPublicShareRoute: true,
        shareToken: token || "",
        sharePath: "share",
        openItemId: null
      });

      return true;
    } catch (error) {
      console.error("Public share page init error:", error);
      state.currentPublicProfile = null;
      renderShareState("error");
      return true;
    }
  }

  async function initPublicSharePage(){
    const token = decodeURIComponent(window.location.pathname.replace(/^\/(?:share|nfc)\//, "").trim());
    if(!token) return false;
    return window.location.pathname.startsWith("/nfc/")
      ? await loadNfcRoute(token)
      : await loadPublicShareRoute(token);
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

  return {
    openOwnerLibraryFromNfc,
    loadNfcRoute,
    loadPublicShareRoute,
    initPublicSharePage,
    checkPublicRoute
  };
}
