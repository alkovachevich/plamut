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

function renderGuestState(root) {
  root.innerHTML = `
    <style>
      .settings-guest {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 24px 0;
      }

      .settings-guest__title {
        font-size: 28px;
        font-weight: 800;
        color: var(--text);
      }

      .settings-guest__card {
        border: 1px solid var(--border-soft);
        background: var(--surface);
        border-radius: 20px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .settings-guest__text {
        color: var(--text-soft);
        line-height: 1.6;
      }

      .settings-guest__button {
        width: fit-content;
        padding: 10px 16px;
        border-radius: 999px;
        background: var(--accent);
        color: #fff;
        font-weight: 700;
      }
    </style>

    <section class="settings-guest">
      <div class="settings-guest__title">Настройки</div>
      <div class="settings-guest__card">
        <div class="settings-guest__text">
          Чтобы управлять профилем, паролем и аватаром, нужно войти в аккаунт.
        </div>
        <button class="settings-guest__button" type="button" data-action="login">
          Войти
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

function renderSectionContent(section, localState) {
  const displayName = localState.profile.display_name || "";
  const username = localState.profile.username || "";
  const avatarUrl = localState.profile.avatar_url || "";
  const theme = localState.profile.preferred_theme || state.theme || "dark";
  const language = localState.profile.preferred_language || state.language || "ru";
  const previewAvatar = localState.avatarPreviewUrl || avatarUrl || "";

  switch (section) {
    case "appearance":
      return `
        <div class="settings-panel-card">
          <div class="settings-panel-title">Внешний вид</div>

          <div class="settings-setting-block">
            <div class="settings-setting-title">Тема</div>
            <div class="settings-chip-row">
              <button class="settings-chip ${theme === "light" ? "is-active" : ""}" data-theme="light">
                Светлая
              </button>
              <button class="settings-chip ${theme === "dark" ? "is-active" : ""}" data-theme="dark">
                Тёмная
              </button>
            </div>
          </div>

          <div class="settings-setting-block">
            <div class="settings-setting-title">Язык</div>
            <div class="settings-chip-row">
              <button class="settings-chip ${language === "ru" ? "is-active" : ""}" data-language="ru">
                Русский
              </button>
              <button class="settings-chip ${language === "en" ? "is-active" : ""}" data-language="en">
                English
              </button>
            </div>
          </div>

          <div class="settings-inline-actions">
            <button class="settings-primary-button" type="button" data-action="save-appearance">
              Сохранить
            </button>
          </div>

          <div class="settings-status" data-settings-status></div>
        </div>
      `;

    case "avatar":
      return `
        <div class="settings-panel-card">
          <div class="settings-panel-title">Аватар</div>

          <div class="settings-avatar-block">
            <div class="settings-avatar-preview">
              ${renderAvatar(previewAvatar, displayName || username || "User")}
            </div>

            <div class="settings-avatar-controls">
              <input class="settings-file-input" type="file" accept="image/*" data-avatar-file />
              <button class="settings-primary-button" type="button" data-action="save-avatar">
                Загрузить аватар
              </button>
            </div>
          </div>

          <div class="settings-status" data-settings-status></div>
        </div>
      `;

    case "profile":
      return `
        <div class="settings-panel-card">
          <div class="settings-panel-title">Профиль</div>

          <div class="settings-form-grid">
            <label class="settings-label">
              <span>Display name</span>
              <input class="settings-input" data-profile-display-name type="text" value="${escapeHtml(displayName)}" placeholder="Введите имя" />
            </label>

            <label class="settings-label">
              <span>Username</span>
              <input class="settings-input" data-profile-username type="text" value="${escapeHtml(username)}" placeholder="Введите username" />
            </label>
          </div>

          <div class="settings-inline-actions">
            <button class="settings-primary-button" type="button" data-action="save-profile">
              Сохранить профиль
            </button>
          </div>

          <div class="settings-status" data-settings-status></div>
        </div>
      `;

    case "password":
      return `
        <div class="settings-panel-card">
          <div class="settings-panel-title">Пароль</div>

          <div class="settings-form-grid">
            <label class="settings-label">
              <span>Новый пароль</span>
              <input class="settings-input" data-password-new type="password" placeholder="••••••••" />
            </label>

            <label class="settings-label">
              <span>Подтвердить пароль</span>
              <input class="settings-input" data-password-confirm type="password" placeholder="••••••••" />
            </label>
          </div>

          <div class="settings-inline-actions">
            <button class="settings-primary-button" type="button" data-action="save-password">
              Сменить пароль
            </button>
          </div>

          <div class="settings-status" data-settings-status></div>
        </div>
      `;

    default:
      return `
        <div class="settings-panel-card">
          <div class="settings-panel-title">Настройки</div>
          <div class="settings-panel-text">
            Выбери раздел слева, чтобы изменить параметры профиля.
          </div>
        </div>
      `;
  }
}

function setStatus(contentRoot, message, type = "info") {
  const node = contentRoot.querySelector("[data-settings-status]");
  if (!node) return;

  node.textContent = message || "";
  node.dataset.type = type;
}

export function renderSettingsPage(root) {
  const userId = state.user?.id;

  if (!userId) {
    renderGuestState(root);
    return;
  }

  const initialSection = state.routeParams?.section || "appearance";

  const localState = {
    activeSection: initialSection,
    profile: {
      id: userId,
      username: state.user.username || "",
      display_name: state.user.display_name || "",
      avatar_url: state.user.avatar_url || "",
      preferred_language: state.language || "ru",
      preferred_theme: state.theme || "dark"
    },
    avatarFile: null,
    avatarPreviewUrl: ""
  };

  root.innerHTML = `
    <style>
      .settings-page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .settings-title {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.03em;
      }

      .settings-layout {
        display: grid;
        grid-template-columns: 1fr;
        gap: 16px;
      }

      .settings-sidebar {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        border-radius: 22px;
        border: 1px solid var(--border);
        background: var(--bg-elevated);
        box-shadow: var(--shadow);
      }

      .settings-nav-button {
        min-height: 48px;
        padding: 0 14px;
        border-radius: 14px;
        text-align: left;
        font-weight: 700;
        color: var(--text-soft);
      }

      .settings-nav-button.is-active {
        background: var(--accent-soft);
        color: var(--text);
      }

      .settings-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .settings-panel-card {
        padding: 20px;
        border-radius: 22px;
        border: 1px solid var(--border);
        background: var(--bg-elevated);
        box-shadow: var(--shadow);
      }

      .settings-panel-title {
        font-size: 20px;
        font-weight: 800;
        margin-bottom: 10px;
      }

      .settings-panel-text {
        color: var(--text-soft);
        line-height: 1.6;
      }

      .settings-form-grid {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .settings-label {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-weight: 600;
      }

      .settings-label span {
        color: var(--text-soft);
        font-size: 14px;
      }

      .settings-input,
      .settings-textarea,
      .settings-file-input {
        width: 100%;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        border-radius: 14px;
        padding: 12px 14px;
        outline: none;
      }

      .settings-setting-block + .settings-setting-block {
        margin-top: 18px;
      }

      .settings-setting-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--text-soft);
        margin-bottom: 10px;
      }

      .settings-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .settings-chip {
        min-height: 40px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: var(--surface);
        font-weight: 700;
        color: var(--text-soft);
      }

      .settings-chip.is-active {
        background: var(--accent);
        border-color: var(--accent);
        color: #fff;
      }

      .settings-inline-actions {
        margin-top: 18px;
        display: flex;
        gap: 10px;
      }

      .settings-primary-button {
        min-height: 46px;
        padding: 0 16px;
        border-radius: 14px;
        background: linear-gradient(135deg, var(--accent), var(--accent-strong));
        color: #fff;
        font-weight: 700;
        box-shadow: var(--shadow);
      }

      .settings-avatar-block {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .settings-avatar-preview {
        width: 112px;
        height: 112px;
        border-radius: 999px;
        overflow: hidden;
        border: 1px solid var(--border);
        background: var(--surface);
      }

      .settings-avatar-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .settings-avatar__fallback {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        font-size: 28px;
        font-weight: 800;
        color: var(--text-soft);
      }

      .settings-avatar-controls {
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: 420px;
      }

      .settings-status {
        margin-top: 14px;
        min-height: 20px;
        font-size: 14px;
        line-height: 1.5;
        color: var(--text-soft);
      }

      .settings-status[data-type="success"] {
        color: var(--success);
      }

      .settings-status[data-type="error"] {
        color: var(--danger);
      }

      @media (min-width: 900px) {
        .settings-layout {
          grid-template-columns: 280px minmax(0, 1fr);
          align-items: start;
        }

        .settings-sidebar {
          position: sticky;
          top: 88px;
        }
      }
    </style>

    <section class="settings-page">
      <div class="settings-title">Настройки</div>

      <div class="settings-layout">
        <aside class="settings-sidebar">
          <button class="settings-nav-button" data-section="appearance">Внешний вид</button>
          <button class="settings-nav-button" data-section="avatar">Аватар</button>
          <button class="settings-nav-button" data-section="profile">Профиль</button>
          <button class="settings-nav-button" data-section="password">Пароль</button>
        </aside>

        <div class="settings-content" data-settings-content></div>
      </div>
    </section>
  `;

  const contentRoot = root.querySelector("[data-settings-content]");
  const navButtons = [...root.querySelectorAll("[data-section]")];

  function bindAppearanceEvents() {
    contentRoot.querySelectorAll("[data-theme]").forEach((button) => {
      button.addEventListener("click", () => {
        localState.profile.preferred_theme = button.dataset.theme || "dark";
        renderSection();
      });
    });

    contentRoot.querySelectorAll("[data-language]").forEach((button) => {
      button.addEventListener("click", () => {
        localState.profile.preferred_language = button.dataset.language || "ru";
        renderSection();
      });
    });

    contentRoot.querySelector('[data-action="save-appearance"]')?.addEventListener("click", async () => {
      try {
        const saved = await upsertUserProfile({
          id: userId,
          preferred_theme: localState.profile.preferred_theme,
          preferred_language: localState.profile.preferred_language
        });

        setTheme(saved.preferred_theme || localState.profile.preferred_theme);
        setLanguage(saved.preferred_language || localState.profile.preferred_language);

        setStatus(contentRoot, "Настройки внешнего вида сохранены", "success");
      } catch (error) {
        console.error("Save appearance error:", error);
        setStatus(contentRoot, error.message || "Не удалось сохранить настройки", "error");
      }
    });
  }

  function bindAvatarEvents() {
    contentRoot.querySelector("[data-avatar-file]")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0] || null;
      localState.avatarFile = file;

      if (file) {
        localState.avatarPreviewUrl = URL.createObjectURL(file);
      } else {
        localState.avatarPreviewUrl = "";
      }

      renderSection();
    });

    contentRoot.querySelector('[data-action="save-avatar"]')?.addEventListener("click", async () => {
      if (!localState.avatarFile) {
        setStatus(contentRoot, "Сначала выбери изображение", "error");
        return;
      }

      try {
        const avatarUrl = await uploadAvatarImage(userId, localState.avatarFile);

        const saved = await upsertUserProfile({
          id: userId,
          avatar_url: avatarUrl
        });

        localState.profile.avatar_url = saved.avatar_url || avatarUrl;
        localState.avatarFile = null;
        localState.avatarPreviewUrl = "";

        setUser({
          ...state.user,
          avatar_url: localState.profile.avatar_url
        });

        renderSection();
        setStatus(contentRoot, "Аватар сохранён", "success");
      } catch (error) {
        console.error("Upload avatar error:", error);
        setStatus(contentRoot, error.message || "Не удалось загрузить аватар", "error");
      }
    });
  }

  function bindProfileEvents() {
    contentRoot.querySelector('[data-action="save-profile"]')?.addEventListener("click", async () => {
      const displayNameInput = contentRoot.querySelector("[data-profile-display-name]");
      const usernameInput = contentRoot.querySelector("[data-profile-username]");

      const displayName = (displayNameInput?.value || "").trim();
      const username = (usernameInput?.value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 32);

      if (!displayName) {
        setStatus(contentRoot, "Display name не должен быть пустым", "error");
        return;
      }

      if (!username) {
        setStatus(contentRoot, "Username не должен быть пустым", "error");
        return;
      }

      try {
        const saved = await upsertUserProfile({
          id: userId,
          display_name: displayName,
          username
        });

        localState.profile.display_name = saved.display_name || displayName;
        localState.profile.username = saved.username || username;

        setUser({
          ...state.user,
          display_name: localState.profile.display_name,
          username: localState.profile.username
        });

        setStatus(contentRoot, "Профиль сохранён", "success");
      } catch (error) {
        console.error("Save profile error:", error);
        setStatus(contentRoot, error.message || "Не удалось сохранить профиль", "error");
      }
    });
  }

  function bindPasswordEvents() {
    contentRoot.querySelector('[data-action="save-password"]')?.addEventListener("click", async () => {
      const newPassword = contentRoot.querySelector("[data-password-new]")?.value || "";
      const confirmPassword = contentRoot.querySelector("[data-password-confirm]")?.value || "";

      if (!newPassword || !confirmPassword) {
        setStatus(contentRoot, "Заполни оба поля пароля", "error");
        return;
      }

      if (newPassword !== confirmPassword) {
        setStatus(contentRoot, "Пароли не совпадают", "error");
        return;
      }

      try {
        await updateUserPassword(newPassword);
        contentRoot.querySelector("[data-password-new]").value = "";
        contentRoot.querySelector("[data-password-confirm]").value = "";
        setStatus(contentRoot, "Пароль успешно изменён", "success");
      } catch (error) {
        console.error("Change password error:", error);
        setStatus(contentRoot, error.message || "Не удалось изменить пароль", "error");
      }
    });
  }

  function bindSectionEvents() {
    switch (localState.activeSection) {
      case "appearance":
        bindAppearanceEvents();
        break;
      case "avatar":
        bindAvatarEvents();
        break;
      case "profile":
        bindProfileEvents();
        break;
      case "password":
        bindPasswordEvents();
        break;
      default:
        break;
    }
  }

  function renderSection() {
    navButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.section === localState.activeSection);
    });

    contentRoot.innerHTML = renderSectionContent(localState.activeSection, localState);
    bindSectionEvents();
  }

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      localState.activeSection = button.dataset.section || "appearance";
      renderSection();
    });
  });

  renderSection();
}
