import {
  state,
  setTheme,
  setLanguage,
  setUser,
  openAuthModal
} from "../state.js";
import { escapeHtml } from "../utils.js";
import {
  upsertUserProfile,
  updateUserPassword,
  uploadAvatarImage
} from "../lib/supabase-client.js";
import {
  normalizeLanguage,
  normalizeTheme
} from "../config.js";

const SETTINGS_SECTIONS = ["appearance", "avatar", "profile", "password"];

const I18N = {
  ru: {
    settings: "Настройки",
    loginRequired: "Чтобы управлять профилем, нужно войти в аккаунт.",
    login: "Войти",
    appearance: "Внешний вид",
    avatar: "Аватар",
    profile: "Профиль",
    password: "Пароль",
    theme: "Тема",
    light: "Светлая",
    dark: "Тёмная",
    system: "Как в системе",
    language: "Язык",
    save: "Сохранить",
    saving: "Сохраняем…",
    saved: "Настройки сохранены",
    uploadAvatar: "Загрузить аватар",
    chooseImageFirst: "Сначала выбери изображение",
    uploadingAvatar: "Загружаем аватар…",
    avatarSaved: "Аватар сохранён",
    avatarFailed: "Не удалось загрузить аватар",
    displayName: "Display name",
    username: "Username",
    enterName: "Введите имя",
    enterUsername: "Введите username",
    saveProfile: "Сохранить профиль",
    savingProfile: "Сохраняем профиль…",
    profileSaved: "Профиль сохранён",
    displayNameEmpty: "Display name не должен быть пустым",
    usernameEmpty: "Username не должен быть пустым",
    newPassword: "Новый пароль",
    confirmPassword: "Подтвердить пароль",
    changePassword: "Сменить пароль",
    fillBothFields: "Заполни оба поля",
    passwordsMismatch: "Пароли не совпадают",
    changingPassword: "Меняем пароль…",
    passwordChanged: "Пароль изменён",
    saveFailed: "Не удалось сохранить настройки",
    profileFailed: "Не удалось сохранить профиль",
    passwordFailed: "Не удалось изменить пароль"
  },
  en: {
    settings: "Settings",
    loginRequired: "Sign in to manage your profile.",
    login: "Sign in",
    appearance: "Appearance",
    avatar: "Avatar",
    profile: "Profile",
    password: "Password",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    language: "Language",
    save: "Save",
    saving: "Saving…",
    saved: "Settings saved",
    uploadAvatar: "Upload avatar",
    chooseImageFirst: "Choose an image first",
    uploadingAvatar: "Uploading avatar…",
    avatarSaved: "Avatar saved",
    avatarFailed: "Could not upload avatar",
    displayName: "Display name",
    username: "Username",
    enterName: "Enter name",
    enterUsername: "Enter username",
    saveProfile: "Save profile",
    savingProfile: "Saving profile…",
    profileSaved: "Profile saved",
    displayNameEmpty: "Display name cannot be empty",
    usernameEmpty: "Username cannot be empty",
    newPassword: "New password",
    confirmPassword: "Confirm password",
    changePassword: "Change password",
    fillBothFields: "Fill both fields",
    passwordsMismatch: "Passwords do not match",
    changingPassword: "Changing password…",
    passwordChanged: "Password changed",
    saveFailed: "Could not save settings",
    profileFailed: "Could not save profile",
    passwordFailed: "Could not change password"
  }
};

function t(key) {
  const language = state.language === "en" ? "en" : "ru";
  return I18N[language][key] || I18N.ru[key] || key;
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function normalizeUsername(value = "") {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

function getInitialSection() {
  const section = state.routeParams?.section || "appearance";
  return SETTINGS_SECTIONS.includes(section) ? section : "appearance";
}

function renderGuestState(root) {
  root.innerHTML = `
    <section style="display:flex;flex-direction:column;gap:16px;padding:24px 0;">
      <div style="font-size:28px;font-weight:800;color:var(--text);">${escapeHtml(t("settings"))}</div>
      <div style="border:1px solid var(--border-soft);background:var(--surface);border-radius:20px;padding:20px;">
        <div style="color:var(--text-soft);line-height:1.6;margin-bottom:14px;">
          ${escapeHtml(t("loginRequired"))}
        </div>
        <button style="padding:10px 16px;border-radius:999px;background:var(--accent);color:#fff;font-weight:700;" data-action="login">
          ${escapeHtml(t("login"))}
        </button>
      </div>
    </section>
  `;

  root.querySelector('[data-action="login"]')?.addEventListener("click", () => {
    openAuthModal("login");
  });
}

function renderAvatar(url, name) {
  if (url) {
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" />`;
  }

  return `<div class="settings-avatar__fallback">?</div>`;
}

function renderStyles() {
  return `
    <style>
      .settings-page{display:flex;flex-direction:column;gap:20px}
      .settings-title{font-size:28px;font-weight:800;letter-spacing:-0.03em}
      .settings-layout{display:grid;grid-template-columns:1fr;gap:16px}
      .settings-sidebar{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:22px;border:1px solid var(--border);background:var(--bg-elevated);box-shadow:var(--shadow)}
      .settings-nav-button{min-height:48px;padding:0 14px;border-radius:14px;text-align:left;font-weight:700;color:var(--text-soft)}
      .settings-nav-button.is-active{background:var(--accent-soft);color:var(--text)}
      .settings-panel-card{padding:20px;border-radius:22px;border:1px solid var(--border);background:var(--bg-elevated);box-shadow:var(--shadow)}
      .settings-panel-title{font-size:20px;font-weight:800;margin-bottom:10px}
      .settings-form-grid{display:flex;flex-direction:column;gap:14px}
      .settings-label{display:flex;flex-direction:column;gap:8px;font-weight:600}
      .settings-label span{color:var(--text-soft);font-size:14px}
      .settings-input,.settings-file-input{width:100%;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:14px;padding:12px 14px;outline:none}
      .settings-setting-block+.settings-setting-block{margin-top:18px}
      .settings-setting-title{font-size:14px;font-weight:700;color:var(--text-soft);margin-bottom:10px}
      .settings-chip-row{display:flex;flex-wrap:wrap;gap:10px}
      .settings-chip{min-height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--border);background:var(--surface);font-weight:700;color:var(--text-soft)}
      .settings-chip.is-active{background:var(--accent);border-color:var(--accent);color:#fff}
      .settings-inline-actions{margin-top:18px;display:flex;gap:10px}
      .settings-primary-button{min-height:46px;padding:0 16px;border-radius:14px;background:linear-gradient(135deg,var(--accent),var(--accent-strong));color:#fff;font-weight:700;box-shadow:var(--shadow)}
      .settings-primary-button:disabled{opacity:.6;cursor:default}
      .settings-avatar-block{display:flex;flex-direction:column;gap:16px}
      .settings-avatar-preview{width:112px;height:112px;border-radius:999px;overflow:hidden;border:1px solid var(--border);background:var(--surface)}
      .settings-avatar-preview img{width:100%;height:100%;object-fit:cover}
      .settings-avatar__fallback{width:100%;height:100%;display:grid;place-items:center;font-size:28px;font-weight:800;color:var(--text-soft)}
      .settings-avatar-controls{display:flex;flex-direction:column;gap:12px;max-width:420px}
      .settings-status{margin-top:14px;min-height:20px;font-size:14px;line-height:1.5;color:var(--text-soft)}
      .settings-status[data-type="success"]{color:var(--success)}
      .settings-status[data-type="error"]{color:var(--danger)}
      @media(min-width:900px){
        .settings-layout{grid-template-columns:280px minmax(0,1fr);align-items:start}
        .settings-sidebar{position:sticky;top:88px}
      }
    </style>
  `;
}

function renderSectionContent(section, localState) {
  const displayName = localState.profile.display_name || "";
  const username = localState.profile.username || "";
  const avatarUrl = localState.profile.avatar_url || "";
  const theme = normalizeTheme(localState.profile.preferred_theme || state.theme);
  const language = normalizeLanguage(localState.profile.preferred_language || state.language);
  const previewAvatar = localState.avatarPreviewUrl || avatarUrl || "";

  if (section === "appearance") {
    return `
      <div class="settings-panel-card">
        <div class="settings-panel-title">${escapeHtml(t("appearance"))}</div>

        <div class="settings-setting-block">
          <div class="settings-setting-title">${escapeHtml(t("theme"))}</div>
          <div class="settings-chip-row">
            <button class="settings-chip ${theme === "light" ? "is-active" : ""}" type="button" data-theme="light">${escapeHtml(t("light"))}</button>
            <button class="settings-chip ${theme === "dark" ? "is-active" : ""}" type="button" data-theme="dark">${escapeHtml(t("dark"))}</button>
            <button class="settings-chip ${theme === "system" ? "is-active" : ""}" type="button" data-theme="system">${escapeHtml(t("system"))}</button>
          </div>
        </div>

        <div class="settings-setting-block">
          <div class="settings-setting-title">${escapeHtml(t("language"))}</div>
          <div class="settings-chip-row">
            <button class="settings-chip ${language === "ru" ? "is-active" : ""}" type="button" data-language="ru">Русский</button>
            <button class="settings-chip ${language === "en" ? "is-active" : ""}" type="button" data-language="en">English</button>
          </div>
        </div>

        <div class="settings-inline-actions">
          <button class="settings-primary-button" type="button" data-action="save-appearance">${escapeHtml(t("save"))}</button>
        </div>

        <div class="settings-status" data-settings-status></div>
      </div>
    `;
  }

  if (section === "avatar") {
    return `
      <div class="settings-panel-card">
        <div class="settings-panel-title">${escapeHtml(t("avatar"))}</div>

        <div class="settings-avatar-block">
          <div class="settings-avatar-preview">
            ${renderAvatar(previewAvatar, displayName || username || "User")}
          </div>

          <div class="settings-avatar-controls">
            <input class="settings-file-input" type="file" accept="image/*" data-avatar-file />
            <button class="settings-primary-button" type="button" data-action="save-avatar">${escapeHtml(t("uploadAvatar"))}</button>
          </div>
        </div>

        <div class="settings-status" data-settings-status></div>
      </div>
    `;
  }

  if (section === "profile") {
    return `
      <div class="settings-panel-card">
        <div class="settings-panel-title">${escapeHtml(t("profile"))}</div>

        <div class="settings-form-grid">
          <label class="settings-label">
            <span>${escapeHtml(t("displayName"))}</span>
            <input class="settings-input" data-profile-display-name type="text" value="${escapeHtml(displayName)}" placeholder="${escapeHtml(t("enterName"))}" />
          </label>

          <label class="settings-label">
            <span>${escapeHtml(t("username"))}</span>
            <input class="settings-input" data-profile-username type="text" value="${escapeHtml(username)}" placeholder="${escapeHtml(t("enterUsername"))}" />
          </label>
        </div>

        <div class="settings-inline-actions">
          <button class="settings-primary-button" type="button" data-action="save-profile">${escapeHtml(t("saveProfile"))}</button>
        </div>

        <div class="settings-status" data-settings-status></div>
      </div>
    `;
  }

  if (section === "password") {
    return `
      <div class="settings-panel-card">
        <div class="settings-panel-title">${escapeHtml(t("password"))}</div>

        <div class="settings-form-grid">
          <label class="settings-label">
            <span>${escapeHtml(t("newPassword"))}</span>
            <input class="settings-input" data-password-new type="password" placeholder="••••••••" />
          </label>

          <label class="settings-label">
            <span>${escapeHtml(t("confirmPassword"))}</span>
            <input class="settings-input" data-password-confirm type="password" placeholder="••••••••" />
          </label>
        </div>

        <div class="settings-inline-actions">
          <button class="settings-primary-button" type="button" data-action="save-password">${escapeHtml(t("changePassword"))}</button>
        </div>

        <div class="settings-status" data-settings-status></div>
      </div>
    `;
  }

  return "";
}

function setStatus(contentRoot, message, type = "info") {
  const node = contentRoot.querySelector("[data-settings-status]");
  if (!node) return;

  node.textContent = message || "";
  node.dataset.type = type;
}

function setLoading(button, loading) {
  if (!button) return;
  button.disabled = Boolean(loading);
}

function updateLocalUserProfile(patch = {}) {
  setUser({
    ...state.user,
    ...patch
  });
}

export function renderSettingsPage(root) {
  const userId = state.user?.id;

  if (!userId) {
    renderGuestState(root);
    return;
  }

  const localState = {
    activeSection: getInitialSection(),
    profile: {
      id: userId,
      username: state.user.username || "",
      display_name: state.user.display_name || "",
      avatar_url: state.user.avatar_url || "",
      preferred_language: normalizeLanguage(state.user.preferred_language || state.language || "ru"),
      preferred_theme: normalizeTheme(state.user.preferred_theme || state.theme || "dark")
    },
    avatarFile: null,
    avatarPreviewUrl: ""
  };

  root.innerHTML = `
    ${renderStyles()}

    <section class="settings-page">
      <div class="settings-title">${escapeHtml(t("settings"))}</div>

      <div class="settings-layout">
        <aside class="settings-sidebar">
          <button class="settings-nav-button" type="button" data-section="appearance">${escapeHtml(t("appearance"))}</button>
          <button class="settings-nav-button" type="button" data-section="avatar">${escapeHtml(t("avatar"))}</button>
          <button class="settings-nav-button" type="button" data-section="profile">${escapeHtml(t("profile"))}</button>
          <button class="settings-nav-button" type="button" data-section="password">${escapeHtml(t("password"))}</button>
        </aside>

        <div class="settings-content" data-settings-content></div>
      </div>
    </section>
  `;

  const contentRoot = root.querySelector("[data-settings-content]");
  const navButtons = [...root.querySelectorAll("[data-section]")];

  function renderSection() {
    navButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.section === localState.activeSection);
    });

    contentRoot.innerHTML = renderSectionContent(localState.activeSection, localState);
    bindSectionEvents();
  }

  function bindSectionEvents() {
    contentRoot.querySelectorAll("[data-theme]").forEach((button) => {
      button.addEventListener("click", () => {
        localState.profile.preferred_theme = normalizeTheme(button.dataset.theme);
        renderSection();
      });
    });

    contentRoot.querySelectorAll("[data-language]").forEach((button) => {
      button.addEventListener("click", () => {
        localState.profile.preferred_language = normalizeLanguage(button.dataset.language);
        renderSection();
      });
    });

    contentRoot.querySelector('[data-action="save-appearance"]')?.addEventListener("click", async (event) => {
      const button = event.currentTarget;

      try {
        setLoading(button, true);
        setStatus(contentRoot, t("saving"));

        const theme = normalizeTheme(localState.profile.preferred_theme);
        const language = normalizeLanguage(localState.profile.preferred_language);

        const saved = await upsertUserProfile({
          id: userId,
          preferred_theme: theme,
          preferred_language: language
        });

        const nextTheme = normalizeTheme(saved?.preferred_theme || theme);
        const nextLanguage = normalizeLanguage(saved?.preferred_language || language);

        localState.profile.preferred_theme = nextTheme;
        localState.profile.preferred_language = nextLanguage;

        setTheme(nextTheme);
        setLanguage(nextLanguage);

        updateLocalUserProfile({
          preferred_theme: nextTheme,
          preferred_language: nextLanguage
        });

        setStatus(contentRoot, t("saved"), "success");
      } catch (error) {
        setStatus(contentRoot, error.message || t("saveFailed"), "error");
      } finally {
        setLoading(button, false);
      }
    });

    contentRoot.querySelector("[data-avatar-file]")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0] || null;

      if (localState.avatarPreviewUrl) {
        URL.revokeObjectURL(localState.avatarPreviewUrl);
      }

      localState.avatarFile = file;
      localState.avatarPreviewUrl = file ? URL.createObjectURL(file) : "";

      renderSection();
    });

    contentRoot.querySelector('[data-action="save-avatar"]')?.addEventListener("click", async (event) => {
      const button = event.currentTarget;

      if (!localState.avatarFile) {
        setStatus(contentRoot, t("chooseImageFirst"), "error");
        return;
      }

      try {
        setLoading(button, true);
        setStatus(contentRoot, t("uploadingAvatar"));

        const avatarUrl = await uploadAvatarImage(userId, localState.avatarFile);
        const saved = await upsertUserProfile({
          id: userId,
          avatar_url: avatarUrl
        });

        localState.profile.avatar_url = saved?.avatar_url || avatarUrl;
        localState.avatarFile = null;

        if (localState.avatarPreviewUrl) {
          URL.revokeObjectURL(localState.avatarPreviewUrl);
          localState.avatarPreviewUrl = "";
        }

        updateLocalUserProfile({
          avatar_url: localState.profile.avatar_url
        });

        renderSection();
        setStatus(contentRoot, t("avatarSaved"), "success");
      } catch (error) {
        setStatus(contentRoot, error.message || t("avatarFailed"), "error");
      } finally {
        setLoading(button, false);
      }
    });

    contentRoot.querySelector('[data-action="save-profile"]')?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const displayName = cleanText(contentRoot.querySelector("[data-profile-display-name]")?.value || "");
      const username = normalizeUsername(contentRoot.querySelector("[data-profile-username]")?.value || "");

      if (!displayName) {
        setStatus(contentRoot, t("displayNameEmpty"), "error");
        return;
      }

      if (!username) {
        setStatus(contentRoot, t("usernameEmpty"), "error");
        return;
      }

      try {
        setLoading(button, true);
        setStatus(contentRoot, t("savingProfile"));

        const saved = await upsertUserProfile({
          id: userId,
          display_name: displayName,
          username
        });

        localState.profile.display_name = saved?.display_name || displayName;
        localState.profile.username = saved?.username || username;

        updateLocalUserProfile({
          display_name: localState.profile.display_name,
          username: localState.profile.username
        });

        setStatus(contentRoot, t("profileSaved"), "success");
      } catch (error) {
        setStatus(contentRoot, error.message || t("profileFailed"), "error");
      } finally {
        setLoading(button, false);
      }
    });

    contentRoot.querySelector('[data-action="save-password"]')?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const newPasswordInput = contentRoot.querySelector("[data-password-new]");
      const confirmPasswordInput = contentRoot.querySelector("[data-password-confirm]");
      const newPassword = newPasswordInput?.value || "";
      const confirmPassword = confirmPasswordInput?.value || "";

      if (!newPassword || !confirmPassword) {
        setStatus(contentRoot, t("fillBothFields"), "error");
        return;
      }

      if (newPassword !== confirmPassword) {
        setStatus(contentRoot, t("passwordsMismatch"), "error");
        return;
      }

      try {
        setLoading(button, true);
        setStatus(contentRoot, t("changingPassword"));

        await updateUserPassword(newPassword);

        if (newPasswordInput) newPasswordInput.value = "";
        if (confirmPasswordInput) confirmPasswordInput.value = "";

        setStatus(contentRoot, t("passwordChanged"), "success");
      } catch (error) {
        setStatus(contentRoot, error.message || t("passwordFailed"), "error");
      } finally {
        setLoading(button, false);
      }
    });
  }

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      localState.activeSection = button.dataset.section || "appearance";
      renderSection();
    });
  });

  renderSection();
}
