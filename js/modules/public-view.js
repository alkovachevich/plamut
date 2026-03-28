import { insertSavedLibrary } from "../api/public-api.js";

export function createPublicViewCore(deps){
  const {
    state,
    t,
    getCurrentUser,
    showAuthScreen,
    saveLibraryFallback,
    updatePublicSaveButton,
    setPublicLibraryExpanded: setPublicLibraryExpandedState,
    renderShareState: renderShareStateDep,
    showPublicLibraryCategoryView: showPublicLibraryCategoryViewDep,
    hideAllScreens,
    saveRouteState,
    setPublicRouteMode,
    fetchPublicProfileByToken,
    isShareEnabled,
    renderPublicCard: renderPublicCardDep,
    fetchPublicShareLibraryItems,
    getSavedLibraryState,
    renderShareLibrary: renderShareLibraryDep,
    closePreferencesPanel,
    resetShelfSearchQuery,
    translateCategory,
    renderShelf,
    getDefaultPublicCategory,
    getShareCardTitle,
    getShareCardBio,
    getProfileInitials,
    buildPublicShareUrl,
    setTextIfPresent,
    setValueIfPresent,
    populateShareQr,
    renderPublicLibraryMeta,
    applyShareSettingsToOwnerPanels,
    applyPublicLibraryItems,
    applyTranslations,
    escapeHtml,
    translateStatus,
    openCardById,
    normalizeSpaces
  } = deps;

  async function saveCurrentLibraryToCollection(){
    const ownerProfileId = state.currentPublicProfile?.id || state.currentNfcContext?.ownerId || null;
    const token = state.currentNfcContext?.token || state.activeShareToken || state.currentPublicProfile?.public_share_token || "";
    const user = await getCurrentUser();

    if(!user){
      alert(t().share.loginToSave);
      showAuthScreen();
      return;
    }
    if(user.id === ownerProfileId){
      alert(t().share.ownLibrary);
      return;
    }
    if(!ownerProfileId){
      alert(t().share.unavailable);
      return;
    }

    const payload = {
      user_id: user.id,
      owner_profile_id: ownerProfileId,
      nfc_tag_id: state.currentNfcContext?.tagId || null,
      nfc_token: token || null
    };

    const { error } = await insertSavedLibrary(payload);
    if(error){
      if(/duplicate|unique/i.test(String(error.message || ""))){
        state.currentSavedLibraryState = { saved: true, source: "remote" };
        updatePublicSaveButton();
        alert(t().share.alreadySaved);
        return;
      }
      console.error("Saved library insert error:", error);
      const result = await saveLibraryFallback(ownerProfileId, token);
      updatePublicSaveButton();
      alert(result === "exists" ? t().share.alreadySaved : t().share.savedToMine);
      return;
    }

    state.currentSavedLibraryState = { saved: true, source: "remote" };
    updatePublicSaveButton();
    alert(t().share.savedToMine);
  }

  function exitPublicShareRoute(){
    window.location.href = window.location.origin + "/";
  }

  function showPublicLibraryCategoryView(profile = {}){
    state.isPublicView = true;
    state.currentPublicProfile = profile;
    state.currentPublicProfileName = profile.display_name || profile.username || getShareCardTitle(profile) || "Library";
    state.currentCategory = getDefaultPublicCategory();
    resetShelfSearchQuery();

    hideAllScreens();
    document.getElementById("category-screen").classList.remove("hidden");

    const addBtn = document.getElementById("add-new-btn");
    const addFolderBtn = document.getElementById("add-folder-btn");
    if(addBtn){ addBtn.classList.add("hidden"); addBtn.style.display = "none"; }
    if(addFolderBtn){ addFolderBtn.classList.add("hidden"); addFolderBtn.style.display = "none"; }

    const tabs = document.getElementById("public-category-tabs");
    if(tabs){ tabs.classList.remove("hidden"); tabs.style.display = "flex"; }

    document.getElementById("category-title").textContent = `${state.currentPublicProfileName} — ${translateCategory(state.currentCategory)}`;
    renderShelf();
    saveRouteState({
      screen: "category",
      category: state.currentCategory,
      openItemId: null,
      isPublicShareRoute: Boolean(state.activeShareToken),
      shareToken: state.activeShareToken || ""
    });
  }

  function renderPublicPreviewGrid(profile = {}){
    const container = document.getElementById("public-share-preview-grid");
    if(!container) return;

    const limit = deps.getShareLibraryMode(profile) === "full" ? 12 : 6;
    const items = deps.collectPublicPreviewItems(limit);
    if(items.length === 0){
      container.innerHTML = `<div class="small">${escapeHtml(t().share.noPreview)}</div>`;
      return;
    }

    container.innerHTML = "";
    items.forEach((item) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "media-card";
      card.addEventListener("click", () => {
        openPublicCategory(item.category, state.currentPublicProfileName);
        openCardById(item.id);
      });
      card.innerHTML = `
        <div class="media-card-top">
          <div class="media-cover">
            ${item.cover ? `<img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)}">` : `<span class="media-cover-fallback">${escapeHtml(t().labels.cover)}</span>`}
          </div>
        </div>
        <div class="media-info">
          <h3 class="media-title">${escapeHtml(item.title)}</h3>
          <div class="media-meta">${escapeHtml(translateCategory(item.category))}</div>
          <div class="media-status">${escapeHtml(translateStatus(item.status || t().labels.unknownStatus))}</div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function syncPublicQrButtons(){
    const qrBox = document.getElementById("public-share-qr-box");
    const qrVisible = Boolean(qrBox && !qrBox.classList.contains("hidden"));
    const qrLabel = qrVisible ? t().share.hideQr : t().share.showQr;
    const publicQrBtn = document.getElementById("public-share-qr-btn");
    const ownerQrBtn = document.getElementById("owner-show-qr-btn");
    if(publicQrBtn){ publicQrBtn.setAttribute("title", qrLabel); publicQrBtn.setAttribute("aria-label", qrLabel); }
    if(ownerQrBtn){ ownerQrBtn.textContent = qrLabel; }
  }

  function setPublicLibraryExpanded(expanded = false, options = {}){
    state.publicLibraryExpanded = Boolean(expanded);
    const section = document.getElementById("public-share-library-section");
    if(!section) return;

    const shouldShowSection = state.publicLibraryExpanded && state.currentPublicShareState !== "error";
    section.classList.toggle("hidden", !shouldShowSection);
    if(shouldShowSection && options.scroll !== false){
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function renderOwnerPanel(profile = {}){
    const ownerControls = document.getElementById("public-share-owner-controls");
    if(!ownerControls) return;
    const isOwner = Boolean(profile.isOwner);
    ownerControls.classList.toggle("hidden", !isOwner);
    if(isOwner) applyShareSettingsToOwnerPanels(profile);
  }

  function renderPublicCard(profile = {}){
    state.currentPublicProfile = profile;
    state.activeShareToken = profile.nfc_token || profile.public_share_token || state.activeShareToken;
    state.currentPublicProfileName = profile.display_name || profile.username || getShareCardTitle(profile) || "Library";

    document.getElementById("public-share-loading-card")?.classList.add("hidden");
    document.getElementById("public-share-main-card")?.classList.remove("hidden");
    document.getElementById("public-share-error-card")?.classList.add("hidden");

    setTextIfPresent("public-share-display-name", getShareCardTitle(profile) || "My Plamut");
    setTextIfPresent("public-share-username", profile.username ? `@${profile.username}` : "@plamut");
    setTextIfPresent("public-share-bio", getShareCardBio(profile) || t().share.libraryHint);
    setTextIfPresent("public-share-badge", profile.isOwner ? t().share.ownerBadge : t().share.guestBadge);

    const avatarImg = document.getElementById("public-share-avatar-img");
    const avatarFallback = document.getElementById("public-share-avatar-fallback");
    const hasAvatar = Boolean(profile.avatar_url);
    if(avatarImg){ avatarImg.src = hasAvatar ? profile.avatar_url : ""; avatarImg.classList.toggle("hidden", !hasAvatar); }
    if(avatarFallback){
      avatarFallback.textContent = getProfileInitials(profile.display_name || getShareCardTitle(profile), profile.username || "P");
      avatarFallback.classList.toggle("hidden", hasAvatar);
    }

    const link = buildPublicShareUrl(profile.nfc_token || profile.public_share_token || "");
    setValueIfPresent("public-share-link-input", link);
    setValueIfPresent("owner-share-link-input", link);
    populateShareQr("public-share-qr-box", "public-share-qr-image", link);

    const publicCopyBtn = document.getElementById("public-share-copy-btn");
    if(publicCopyBtn){
      publicCopyBtn.setAttribute("title", t().share.copyLink);
      publicCopyBtn.setAttribute("aria-label", t().share.copyLink);
    }

    renderPublicLibraryMeta();
    syncPublicQrButtons();
    updatePublicSaveButton();
    renderOwnerPanel(profile);
  }

  async function showPublicShareScreen(profile){
    state.isPublicView = true;
    renderPublicCard(profile);
    hideAllScreens();
    document.getElementById("public-share-screen").classList.remove("hidden");
    saveRouteState({ screen: "public-share", isPublicShareRoute: true, shareToken: state.activeShareToken || "" });
  }

  function renderShareState(viewState = "loading"){
    state.currentPublicShareState = viewState;
    const ownerControls = document.getElementById("public-share-owner-controls");
    document.getElementById("public-share-loading-card")?.classList.toggle("hidden", viewState !== "loading");
    document.getElementById("public-share-error-card")?.classList.toggle("hidden", viewState !== "error");
    document.getElementById("public-share-main-card")?.classList.toggle("hidden", viewState === "loading" || viewState === "error" || !state.currentPublicProfile);
    if(ownerControls && (viewState === "loading" || viewState === "error" || !state.currentPublicProfile)) ownerControls.classList.add("hidden");

    const showLibrarySection = state.publicLibraryExpanded && viewState !== "error";
    setPublicLibraryExpanded(showLibrarySection, { scroll: false });
    document.getElementById("public-share-loading")?.classList.toggle("hidden", !(showLibrarySection && viewState === "loading"));
    document.getElementById("public-share-empty")?.classList.toggle("hidden", !(showLibrarySection && viewState === "empty"));
    document.getElementById("public-share-preview-grid")?.classList.toggle("hidden", !(showLibrarySection && viewState === "ready"));
  }

  function buildShareMetaRow(label, value){
    if(!value) return "";
    return `<div class="share-item-meta-row"><div class="share-item-meta-label">${escapeHtml(label)}</div><div>${escapeHtml(value)}</div></div>`;
  }

  function openShareItemModal(item = {}){
    const modal = document.getElementById("share-item-modal");
    if(!modal) return;
    const coverBox = document.getElementById("share-item-modal-cover");
    const title = document.getElementById("share-item-modal-title");
    const original = document.getElementById("share-item-modal-original");
    const badges = document.getElementById("share-item-modal-badges");
    const meta = document.getElementById("share-item-modal-meta");
    const description = document.getElementById("share-item-modal-description");

    if(title) title.textContent = item.title || "";
    if(coverBox) coverBox.innerHTML = item.cover ? `<img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title || t().labels.cover)}">` : `<span class="media-cover-fallback">${escapeHtml(t().labels.cover)}</span>`;

    if(original){
      const originalTitle = item.original_title || item.originalTitle || "";
      original.textContent = originalTitle;
      original.classList.toggle("hidden", !originalTitle);
    }

    if(badges){
      badges.innerHTML = [
        item.category ? `<span class="badge">${escapeHtml(translateCategory(item.category))}</span>` : "",
        item.status ? `<span class="badge">${escapeHtml(translateStatus(item.status))}</span>` : ""
      ].filter(Boolean).join("");
    }

    if(meta){
      meta.innerHTML = [
        buildShareMetaRow(t().share.type, item.category ? translateCategory(item.category) : ""),
        buildShareMetaRow(t().labels.statusLabel, item.status ? translateStatus(item.status) : ""),
        buildShareMetaRow(t().labels.folder, item.folder || item.folder_name || ""),
        buildShareMetaRow(t().share.year, item.year || item.release_year || ""),
        buildShareMetaRow(t().share.rating, item.rating || item.score || ""),
        buildShareMetaRow(t().labels.creator, item.creator || "")
      ].join("");
    }

    if(description){
      const finalDescription = item.description || item.description_ru || item.description_original || item.description_en || "";
      description.textContent = finalDescription;
      description.classList.toggle("hidden", !finalDescription);
    }

    modal.classList.remove("hidden");
  }

  function renderShareItemCard(item = {}){
    const card = document.createElement("button");
    card.type = "button";
    card.className = "media-card";
    card.addEventListener("click", () => openShareItemModal(item));
    card.innerHTML = `
      <div class="media-card-top"><div class="media-cover">${item.cover ? `<img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title || t().labels.cover)}">` : `<span class="media-cover-fallback">${escapeHtml(t().labels.cover)}</span>`}</div></div>
      <div class="media-info"><h3 class="media-title">${escapeHtml(item.title || "")}</h3><div class="media-meta">${escapeHtml(item.category ? translateCategory(item.category) : "")}</div><div class="media-status">${escapeHtml(item.status ? translateStatus(item.status) : t().labels.unknownStatus)}</div></div>
    `;
    return card;
  }

  function renderShareLibrary(items = []){
    const grid = document.getElementById("public-share-preview-grid");
    if(!grid) return;

    state.currentPublicShareItems = Array.isArray(items) ? items.map((item) => ({ ...item, cover: item.cover || item.cover_url || "" })) : [];
    applyPublicLibraryItems(state.currentPublicShareItems);
    applyTranslations();
    renderPublicLibraryMeta();

    if(state.currentPublicShareItems.length === 0){
      grid.innerHTML = "";
      renderShareState("empty");
      return;
    }

    grid.innerHTML = "";
    state.currentPublicShareItems.forEach((item) => grid.appendChild(renderShareItemCard(item)));
    renderShareState("ready");
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
      state.currentPublicProfile = { ...profile, isOwner, public_share_token: token };
      renderPublicCard(state.currentPublicProfile);

      const items = await fetchPublicShareLibraryItems(profile.id);
      if(!isOwner){
        await getSavedLibraryState(profile.id, token);
        updatePublicSaveButton();
      }
      renderShareLibrary(items);
      saveRouteState({ screen: "public-share", isPublicShareRoute: true, shareToken: token || "", sharePath: "share", openItemId: null });
      return true;
    } catch (error) {
      console.error("Public share page init error:", error);
      state.currentPublicProfile = null;
      renderShareState("error");
      return true;
    }
  }

  function openSharedLibrary(){
    if(document.body.classList.contains("public-route-active")){
      if(state.currentPublicProfile && !state.currentPublicProfile.isOwner){
        showPublicLibraryCategoryView(state.currentPublicProfile);
        return;
      }
      setPublicLibraryExpanded(true);
      renderShareState(state.currentPublicShareItems.length ? "ready" : state.currentPublicShareState === "loading" ? "loading" : "empty");
      saveRouteState({ screen: "public-share", isPublicShareRoute: true, shareToken: state.activeShareToken || "" });
      return;
    }

    if(!state.currentPublicProfile) return;
    saveRouteState({ screen: "category", category: getDefaultPublicCategory(), isPublicShareRoute: true, shareToken: state.activeShareToken || "" });
    openPublicCategory(getDefaultPublicCategory(), state.currentPublicProfileName);
  }

  function openPublicCategory(name, profileName = "Library"){
    closePreferencesPanel();
    if(!state.isPublicView) return;

    state.currentCategory = name;
    state.currentOpenItemId = null;
    resetShelfSearchQuery();

    hideAllScreens();
    document.getElementById("category-screen").classList.remove("hidden");

    const addBtn = document.getElementById("add-new-btn");
    const addFolderBtn = document.getElementById("add-folder-btn");
    if(addBtn){ addBtn.classList.add("hidden"); addBtn.style.display = "none"; }
    if(addFolderBtn){ addFolderBtn.classList.add("hidden"); addFolderBtn.style.display = "none"; }

    const tabs = document.getElementById("public-category-tabs");
    if(tabs){ tabs.classList.remove("hidden"); tabs.style.display = "flex"; }

    document.getElementById("category-title").textContent = `${profileName} — ${translateCategory(name)}`;
    renderShelf();
    saveRouteState({ screen: "category", category: name, openItemId: null, isPublicShareRoute: Boolean(state.activeShareToken), shareToken: state.activeShareToken || "" });
  }

  return {
    saveCurrentLibraryToCollection,
    exitPublicShareRoute,
    showPublicLibraryCategoryView,
    renderPublicPreviewGrid,
    syncPublicQrButtons,
    setPublicLibraryExpanded,
    renderOwnerPanel,
    renderPublicCard,
    showPublicShareScreen,
    renderShareState,
    renderShareLibrary,
    loadPublicShareRoute,
    openSharedLibrary,
    openPublicCategory
  };
}
