export function createShareCore(deps){
  const {
    state,
    t,
    normalizeSpaces,
    setTextIfPresent,
    setBodySheetLock,
    getCurrentUser,
    ensureCurrentProfileData,
    upsertCurrentProfilePatch,
    applyShareSettingsToOwnerPanels,
    renderPublicCard,
    regenerateCurrentUserNfcTag,
    regenerateProfileShareTokenRpc,
    populateShareQr,
    browserSupportsWebNfc,
    closeItemActionsSheet,
    closeFolderManagerSheet,
    buildPublicShareUrl
  } = deps;

  const SHARE_SHEET_IDS = ["share-sheet", "folder-manager-sheet", "item-actions-sheet", "folder-modal"];

  function isElementHidden(id){
    const element = document.getElementById(id);
    return !element || element.classList.contains("hidden");
  }

  function getAnySheetOpen(){
    return SHARE_SHEET_IDS.some((id) => !isElementHidden(id));
  }

  function syncBodySheetLock(){
    setBodySheetLock(getAnySheetOpen());
  }

  function getCurrentShareToken(){
    return state.currentProfileData?.nfc_token || state.currentProfileData?.public_share_token || "";
  }

  function getCurrentShareUrl(){
    const directValue =
      document.getElementById("share-modal-link-input")?.value
      || document.getElementById("public-share-link-input")?.value
      || document.getElementById("owner-share-link-input")?.value
      || "";

    if(directValue){
      return directValue;
    }

    const token = getCurrentShareToken();
    return token ? buildPublicShareUrl(token) : "";
  }

  function openShareModal(){
    const modal = document.getElementById("share-modal");
    if(modal) modal.classList.remove("hidden");
  }

  function closeShareModal(){
    const modal = document.getElementById("share-modal");
    if(modal) modal.classList.add("hidden");
  }

  async function copyTextValue(value){
    if(!value) return;
    try {
      await navigator.clipboard.writeText(value);
      alert(`${t().share.linkCopied}\n${value}`);
    } catch (_error) {
      prompt(t().share.linkCopied, value);
    }
  }

  async function copyPublicShareLinkFromModal(){
    await copyTextValue(document.getElementById("share-modal-link-input")?.value || "");
  }

  async function copyCurrentPublicShareLink(){
    await copyTextValue(getCurrentShareUrl());
  }

  function toggleShareModalQr(){
    const box = document.getElementById("share-modal-qr-box");
    const button = document.getElementById("share-modal-qr-btn");
    if(!box || !button) return;

    const shouldShow = box.classList.contains("hidden");
    box.classList.toggle("hidden", !shouldShow);
    button.textContent = shouldShow ? t().share.hideQr : t().share.showQr;
  }

  async function savePublicShareSettingsFromInputs(prefix = "share-modal"){
    const enabled =
      document.getElementById(`${prefix}-public-enabled`)?.checked
      ?? document.getElementById("share-public-enabled-toggle")?.checked
      ?? true;

    const title = normalizeSpaces(
      document.getElementById(`${prefix}-card-title`)?.value
      || document.getElementById("share-card-title")?.value
      || ""
    );

    const bio = normalizeSpaces(
      document.getElementById(`${prefix}-card-bio`)?.value
      || document.getElementById("share-card-bio")?.value
      || ""
    );

    const mode =
      document.getElementById(`${prefix}-library-mode`)?.value
      || document.getElementById("share-library-mode")?.value
      || "preview";

    const profile = await upsertCurrentProfilePatch({
      public_share_enabled: Boolean(enabled),
      is_public: Boolean(enabled),
      public_card_title: title || null,
      public_card_bio: bio || null,
      public_library_mode: mode,
      public_share_token: state.currentProfileData?.public_share_token || ""
    });

    if(!profile) return null;

    applyShareSettingsToOwnerPanels(profile);

    if(state.currentPublicProfile && state.currentPublicProfile.id === profile.id){
      state.currentPublicProfile = { ...state.currentPublicProfile, ...profile };
      renderPublicCard(state.currentPublicProfile);
    }

    alert(t().share.settingsSaved);
    return profile;
  }

  async function savePublicShareSettingsFromModal(){
    const profile = await savePublicShareSettingsFromInputs("share-modal");
    if(profile) closeShareModal();
  }

  async function savePublicShareSettings(){
    await savePublicShareSettingsFromInputs("share");
  }

  async function regeneratePublicShareToken(){
    try {
      let nfcTag = await regenerateCurrentUserNfcTag();

      if(!nfcTag){
        const token = await regenerateProfileShareTokenRpc();
        nfcTag = { id: null, token };
      }

      const refreshedProfile = await ensureCurrentProfileData();
      const profile = {
        ...(refreshedProfile || state.currentProfileData || {}),
        nfc_tag_id: nfcTag?.id || refreshedProfile?.nfc_tag_id || state.currentProfileData?.nfc_tag_id || null,
        nfc_token: nfcTag?.token || refreshedProfile?.nfc_token || state.currentProfileData?.nfc_token || ""
      };

      state.currentProfileData = profile;
      applyShareSettingsToOwnerPanels(profile);

      if(state.currentPublicProfile && state.currentPublicProfile.id === profile.id){
        state.currentPublicProfile = { ...state.currentPublicProfile, ...profile };
        renderPublicCard(state.currentPublicProfile);
      }

      alert(t().share.tokenRegenerated);
    } catch (error) {
      alert(error.message || String(error));
    }
  }

  async function regeneratePublicShareTokenFromModal(){
    await regeneratePublicShareToken();
  }

  async function writeUrlToNfc(url){
    if(!browserSupportsWebNfc()){
      alert(t().share.nfcNotSupported);
      return;
    }

    if(!url){
      alert(t().share.unavailable);
      return;
    }

    try {
      alert(t().share.nfcPrompt);

      if(typeof window.NDEFWriter !== "undefined"){
        const writer = new window.NDEFWriter();
        await writer.write({ records: [{ recordType: "url", data: url }] });
      } else {
        const writer = new window.NDEFReader();
        await writer.write({ records: [{ recordType: "url", data: url }] });
      }

      alert(t().share.nfcSuccess);
    } catch (error) {
      console.error("Web NFC write error:", error);
      alert(`${t().share.nfcError}: ${error.message || error}`);
    }
  }

  async function writePublicLinkToNfcFromModal(){
    await writeUrlToNfc(document.getElementById("share-modal-link-input")?.value || "");
  }

  async function writePublicLinkToNfc(){
    await writeUrlToNfc(document.getElementById("public-share-link-input")?.value || getCurrentShareUrl());
  }

  function openCurrentPublicCard(){
    const url = getCurrentShareUrl();
    if(!url) return;
    window.open(url, "_blank", "noopener");
  }

  function closeShareMenu(){
    const menu = document.getElementById("share-library-menu");
    const button = document.getElementById("share-library-btn");
    const qrBox = document.getElementById("share-library-menu-qr-box");

    if(menu) menu.classList.add("hidden");
    if(button) button.setAttribute("aria-expanded", "false");
    if(qrBox) qrBox.classList.add("hidden");

    setTextIfPresent("share-library-qr-action", t().share.showQr);
  }

  function openCurrentPublicCardFromMenu(){
    closeShareMenu();
    openCurrentPublicCard();
  }

  async function copyPublicShareLinkFromMenu(){
    await copyTextValue(getCurrentShareUrl());
    closeShareMenu();
  }

  function toggleShareMenuQr(){
    const box = document.getElementById("share-library-menu-qr-box");
    if(!box) return;

    const shouldShow = box.classList.contains("hidden");
    if(shouldShow){
      populateShareQr("share-library-menu-qr-box", "share-library-menu-qr-image", getCurrentShareUrl());
    }

    box.classList.toggle("hidden", !shouldShow);
    setTextIfPresent("share-library-qr-action", shouldShow ? t().share.hideQr : t().share.showQr);
  }

  function closeShareSheet(){
    const sheet = document.getElementById("share-sheet");
    const qrBox = document.getElementById("share-sheet-qr-box");

    if(sheet) sheet.classList.add("hidden");
    if(qrBox) qrBox.classList.add("hidden");

    setTextIfPresent("share-sheet-qr-btn", t().share.showQr);
    syncBodySheetLock();
  }

  function closeShareSheetOnBackdrop(event){
    if(event?.target?.id === "share-sheet" || event?.target?.classList?.contains("sheet-backdrop")){
      closeShareSheet();
    }
  }

  function openShareSheet(){
    const sheet = document.getElementById("share-sheet");
    if(!sheet) return;

    closeItemActionsSheet();
    closeFolderManagerSheet();
    sheet.classList.remove("hidden");
    syncBodySheetLock();
  }

  function toggleShareSheetQr(){
    const box = document.getElementById("share-sheet-qr-box");
    if(!box) return;

    const shouldShow = box.classList.contains("hidden");
    if(shouldShow){
      populateShareQr("share-sheet-qr-box", "share-sheet-qr-image", getCurrentShareUrl());
    }

    box.classList.toggle("hidden", !shouldShow);
    setTextIfPresent("share-sheet-qr-btn", shouldShow ? t().share.hideQr : t().share.showQr);
  }

  async function copyPublicShareLinkFromSheet(){
    await copyTextValue(getCurrentShareUrl());
    closeShareSheet();
  }

  function openCurrentPublicCardFromSheet(){
    closeShareSheet();
    openCurrentPublicCard();
  }

  async function shareLibrary(){
    const user = await getCurrentUser();
    if(!user){
      alert(t().labels.mustBeLoggedIn);
      return;
    }

    const profile = await ensureCurrentProfileData();
    if(!profile?.public_share_token && !profile?.nfc_token){
      alert(t().share.unavailable);
      return;
    }

    applyShareSettingsToOwnerPanels(state.currentProfileData || profile || {});
    openShareSheet();
  }

  return {
    openShareModal,
    closeShareModal,
    copyPublicShareLinkFromModal,
    copyCurrentPublicShareLink,
    toggleShareModalQr,
    savePublicShareSettingsFromInputs,
    savePublicShareSettingsFromModal,
    savePublicShareSettings,
    regeneratePublicShareToken,
    regeneratePublicShareTokenFromModal,
    writePublicLinkToNfcFromModal,
    writePublicLinkToNfc,
    openCurrentPublicCard,
    closeShareMenu,
    openCurrentPublicCardFromMenu,
    copyPublicShareLinkFromMenu,
    toggleShareMenuQr,
    closeShareSheet,
    closeShareSheetOnBackdrop,
    openShareSheet,
    toggleShareSheetQr,
    copyPublicShareLinkFromSheet,
    openCurrentPublicCardFromSheet,
    shareLibrary
  };
}
