export function createPreferencesRuntime(deps){
  const {
    state,
    t,
    normalizeLanguageCode,
    setAuthorizedButtons,
    updatePrimaryActionVisibility,
    closePreferencesPanel,
    closeProfileMenu,
    closeShareMenu,
    closeDetailsMenu,
    closeShareSheet,
    closeFolderManagerSheet,
    closeItemActionsSheet,
    setAvatarPreview,
    applyTranslations,
    rerenderCurrentScreen
  } = deps;

  const systemThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");

  function getSystemBrowserLanguage(){
    const list = Array.isArray(navigator.languages) ? navigator.languages : [];
    return normalizeLanguageCode(list[0] || navigator.language || "");
  }

  function resolveThemeMode(mode = state.currentThemeMode){
    if(mode === "system"){
      return systemThemeMedia.matches ? "dark" : "light";
    }
    return mode === "light" ? "light" : "dark";
  }

  function updatePreferenceControls(){
    const languageTitle = document.getElementById("preferences-language-title");
    const themeTitle = document.getElementById("preferences-theme-title");
    const profileBtn = document.getElementById("profile-btn");

    if(languageTitle) languageTitle.textContent = t().topbar.language;
    if(themeTitle) themeTitle.textContent = t().topbar.theme;

    [["lang-option-ru", "ru"], ["lang-option-en", "en"]].forEach(([id, value]) => {
      const button = document.getElementById(id);
      if(!button) return;
      const isActive = state.currentLanguage === value;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    [
      ["theme-option-light", "light", t().topbar.themeLight],
      ["theme-option-dark", "dark", t().topbar.themeDark],
      ["theme-option-system", "system", t().topbar.themeSystem]
    ].forEach(([id, value, label]) => {
      const button = document.getElementById(id);
      if(!button) return;
      const isActive = state.currentThemeMode === value;
      button.textContent = label;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if(profileBtn){
      profileBtn.title = t().topbar.profile;
      profileBtn.setAttribute("aria-label", t().topbar.profile);
    }
  }

  function applyThemeMode(){
    const resolvedTheme = resolveThemeMode();
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    updatePreferenceControls();
  }

  function setThemeMode(mode){
    state.currentThemeMode = ["light", "dark", "system"].includes(mode) ? mode : "system";
    localStorage.setItem("plamut_theme_mode", state.currentThemeMode);
    applyThemeMode();
  }

  function setLanguage(lang){
    state.currentLanguage = lang;
    localStorage.setItem("plamut_language", lang);
    document.documentElement.lang = lang;
    applyTranslations();
    updatePreferenceControls();
    rerenderCurrentScreen();
    closePreferencesPanel();
  }

  function toggleProfileMenu(force){
    const menu = document.getElementById("profile-menu");
    const button = document.getElementById("profile-btn");
    if(!menu || !button) return;

    const shouldOpen = typeof force === "boolean" ? force : menu.classList.contains("hidden");
    closeShareMenu();
    menu.classList.toggle("hidden", !shouldOpen);
    button.setAttribute("aria-expanded", String(shouldOpen));
  }

  function toggleShareMenu(force){
    const menu = document.getElementById("share-library-menu");
    const button = document.getElementById("share-library-btn");
    if(!menu || !button) return;

    const shouldOpen = typeof force === "boolean" ? force : menu.classList.contains("hidden");
    closeProfileMenu();
    menu.classList.toggle("hidden", !shouldOpen);
    button.setAttribute("aria-expanded", String(shouldOpen));
  }

  function syncHeaderProfileIdentity(displayName = "", username = ""){
    const profile = state.currentProfileData || {};
    const resolvedName = (displayName || profile.display_name || profile.public_card_title || profile.username || "Plamut").trim();
    const resolvedUsername = (username || profile.username || "").trim();

    const nameNode = document.getElementById("header-popover-name");
    const handleNode = document.getElementById("header-popover-handle");

    if(nameNode){
      nameNode.textContent = resolvedName || "Plamut";
    }

    if(handleNode){
      handleNode.textContent = resolvedUsername ? `@${resolvedUsername}` : t().brand.subtitle;
    }
  }

  function resetProfileView(){
    state.currentProfileData = null;
    setAvatarPreview("", "", "");
  }

  function setAuthorizedUi(isAuthorized){
    const loginBtn = document.getElementById("login-top-btn");
    const profileWrap = document.getElementById("header-profile-menu-wrap");

    if(loginBtn){
      loginBtn.classList.toggle("hidden", isAuthorized);
    }

    if(profileWrap){
      profileWrap.classList.toggle("hidden", !isAuthorized);
    }

    if(!isAuthorized){
      resetProfileView();
      closePreferencesPanel();
    }

    setAuthorizedButtons?.(isAuthorized);
    updatePrimaryActionVisibility();
  }

  function updateHeaderCompactState(){
    document.body.classList.toggle("header-compact", window.scrollY > 8);
  }

  function bindThemeListeners(){
    systemThemeMedia.addEventListener("change", () => {
      if(state.currentThemeMode === "system"){
        applyThemeMode();
      }
    });
  }

  function bindHeaderListeners(){
    window.addEventListener("scroll", updateHeaderCompactState, { passive: true });

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

    document.addEventListener("keydown", (event) => {
      if(event.key === "Escape"){
        closePreferencesPanel();
        closeShareSheet();
        closeFolderManagerSheet();
        closeItemActionsSheet();
      }
    });
  }

  function initPreferencesRuntime(){
    applyThemeMode();
    updatePreferenceControls();
    updateHeaderCompactState();
    bindThemeListeners();
    bindHeaderListeners();
  }

  return {
    getSystemBrowserLanguage,
    resolveThemeMode,
    updatePreferenceControls,
    applyThemeMode,
    setThemeMode,
    setLanguage,
    toggleProfileMenu,
    toggleShareMenu,
    syncHeaderProfileIdentity,
    setAuthorizedUi,
    updateHeaderCompactState,
    initPreferencesRuntime
  };
}
