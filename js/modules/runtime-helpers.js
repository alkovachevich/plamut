export function createRuntimeHelpers(deps){
  const {
    state,
    t,
    normalizeSpaces,
    normalizeLanguageCode,
    setTextIfPresent,
    setCheckedIfPresent,
    setValueIfPresent
  } = deps;

  function getProfileInitials(displayName = "", username = ""){
    const source = normalizeSpaces(displayName || username || "P");
    const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
    const initials = parts.map((part) => part.charAt(0).toUpperCase()).join("");
    return initials || "P";
  }

  function translateStatus(status, getStatusLabel){
    return getStatusLabel(status, state.currentLanguage);
  }

  function translateCategory(category, getCategoryLabel){
    return getCategoryLabel(category, state.currentLanguage);
  }

  function generateToken(length = 24){
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }

  function buildPublicShareUrl(token){
    return `${window.location.origin}/nfc/${encodeURIComponent(token || "")}`;
  }

  function supportsTable(error, tableName){
    return !error || !new RegExp(`relation .*${tableName}`, "i").test(String(error.message || ""));
  }

  function isNetworkError(error){
    const message = String(error?.message || error || "").toLowerCase();
    const details = String(error?.details || "").toLowerCase();
    return message.includes("failed to fetch")
      || message.includes("networkerror")
      || message.includes("network request failed")
      || message.includes("fetch")
      || details.includes("failed to fetch");
  }

  async function retryReadQuery(runQuery, attempts = 2, delayMs = 220){
    let lastError = null;
    for(let attempt = 0; attempt < attempts; attempt += 1){
      const result = await runQuery();
      if(!result?.error || !isNetworkError(result.error)){
        return result;
      }
      lastError = result.error;
      if(attempt < attempts - 1){
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return { data: null, error: lastError };
  }

  function buildQrImageUrl(url){
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url || "")}`;
  }

  function browserSupportsWebNfc(){
    return typeof window.NDEFWriter !== "undefined" || typeof window.NDEFReader !== "undefined";
  }

  function isLikelyIphone(){
    const ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/i.test(ua);
  }

  function populateShareQr(containerId, imageId, url){
    const box = document.getElementById(containerId);
    const img = document.getElementById(imageId);
    if(!box || !img || !url) return;
    img.src = buildQrImageUrl(url);
    img.alt = t().share.qrAlt;
  }

  function ensurePublicProfileCollectionsReset(){
    state.demoData.Books = [];
    state.demoData.Movies = [];
    state.demoData.Series = [];
    state.demoData.Anime = [];
    state.demoData.Manga = [];
    state.demoData.Blacklist = [];
  }

  function getItemStorageKey(itemOrParts = {}){
    const category = itemOrParts.category || state.currentCategory || "";
    const canonicalKey = itemOrParts.canonical_key || itemOrParts.canonicalKey || "";
    const workKey = itemOrParts.work_key || itemOrParts.workKey || "";
    const title = normalizeSpaces(itemOrParts.title || "").toLowerCase();
    return [category, canonicalKey || workKey || title].join(":");
  }

  function getItemFolder(item){
    return item?.folder || "";
  }

  function getAnySheetOpen(){
    return ["share-sheet", "folder-manager-sheet", "item-actions-sheet", "folder-modal"].some(
      (id) => !document.getElementById(id)?.classList.contains("hidden")
    );
  }

  function setBodySheetLock(locked){
    document.body.classList.toggle("sheet-open", Boolean(locked));
  }

  function syncBodySheetLock(){
    setBodySheetLock(getAnySheetOpen());
  }

  function showRuntimeError(message){
    const banner = document.getElementById("runtime-error-banner");
    if(!banner) return;
    const details = String(message || "Unknown error");
    banner.textContent = `${t().labels.runtimeError} ${details}`;
    banner.classList.remove("hidden");
  }

  function setPublicRouteMode(active){
    document.body.classList.toggle("public-route-active", Boolean(active));
    const appShell = document.getElementById("app-shell");
    if(appShell){
      appShell.classList.toggle("public-route-shell", Boolean(active));
    }
  }

  function getSystemBrowserLanguage(){
    const list = Array.isArray(navigator.languages) ? navigator.languages : [];
    return normalizeLanguageCode(list[0] || navigator.language || "");
  }

  function syncPublicQrButtons(){
    const qrBox = document.getElementById("public-share-qr-box");
    const qrVisible = Boolean(qrBox && !qrBox.classList.contains("hidden"));
    const qrLabel = qrVisible ? t().share.hideQr : t().share.showQr;
    const publicQrBtn = document.getElementById("public-share-qr-btn");
    const ownerQrBtn = document.getElementById("owner-show-qr-btn");

    if(publicQrBtn){
      publicQrBtn.setAttribute("title", qrLabel);
      publicQrBtn.setAttribute("aria-label", qrLabel);
    }

    if(ownerQrBtn){
      ownerQrBtn.textContent = qrLabel;
    }
  }

  function applyBasicShareFields(profile = {}){
    const token = profile.nfc_token || profile.public_share_token || "";
    const url = token ? buildPublicShareUrl(token) : "";
    const enabled = Boolean(profile.public_share_enabled ?? profile.is_public ?? true);
    const title = profile.public_card_title || profile.display_name || profile.username || "";
    const bio = profile.public_card_bio || "";
    const mode = String(profile.public_library_mode || "preview").toLowerCase() === "full" ? "full" : "preview";

    setCheckedIfPresent("share-modal-public-enabled", enabled);
    setValueIfPresent("share-modal-card-title", title);
    setValueIfPresent("share-modal-card-bio", bio);
    setValueIfPresent("share-modal-library-mode", mode);
    setValueIfPresent("share-modal-link-input", url);

    setCheckedIfPresent("share-public-enabled-toggle", enabled);
    setValueIfPresent("share-card-title", title);
    setValueIfPresent("share-card-bio", bio);
    setValueIfPresent("share-library-mode", mode);
    setValueIfPresent("public-share-link-input", url);
    setValueIfPresent("owner-share-link-input", url);

    populateShareQr("share-modal-qr-box", "share-modal-qr-image", url);
    populateShareQr("share-library-menu-qr-box", "share-library-menu-qr-image", url);
    populateShareQr("public-share-qr-box", "public-share-qr-image", url);

    setTextIfPresent("share-sheet-qr-btn", t().share.showQr);
    setTextIfPresent("share-library-qr-action", t().share.showQr);
  }

  return {
    getProfileInitials,
    translateStatus,
    translateCategory,
    generateToken,
    buildPublicShareUrl,
    supportsTable,
    isNetworkError,
    retryReadQuery,
    buildQrImageUrl,
    browserSupportsWebNfc,
    isLikelyIphone,
    populateShareQr,
    ensurePublicProfileCollectionsReset,
    getItemStorageKey,
    getItemFolder,
    getAnySheetOpen,
    setBodySheetLock,
    syncBodySheetLock,
    showRuntimeError,
    setPublicRouteMode,
    getSystemBrowserLanguage,
    syncPublicQrButtons,
    applyBasicShareFields
  };
}
