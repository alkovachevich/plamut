import { navigate } from "../router.js";
import {
  state,
  closeSidebar,
  setTheme,
  setLanguage,
  setUser,
  openAuthModal
} from "../state.js";
import { escapeHtml, getInitials } from "../utils.js";
import { ROUTES, normalizeLanguage, normalizeTheme } from "../config.js";
import {
  signOut,
  upsertUserProfile
} from "../lib/supabase-client.js";

const I18N = {
  ru: {
    guest: "Гость",
    saveLibraryHint: "Войди, чтобы сохранить библиотеку",
    language: "Язык",
    theme: "Тема",
    settings: "Настройки",
    logout: "Выйти",
    loggingOut: "Выход…",
    login: "Войти",
    register: "Регистрация",
    dark: "Темная",
    light: "Светлая",
    system: "Как в системе"
  },
  en: {
    guest: "Guest",
    saveLibraryHint: "Sign in to save your library",
    language: "Language",
    theme: "Theme",
    settings: "Settings",
    logout: "Sign out",
    loggingOut: "Signing out…",
    login: "Sign in",
    register: "Create account",
    dark: "Dark",
    light: "Light",
    system: "System"
  }
};

function t(key) {
  const language = state.language === "en" ? "en" : "ru";
  return I18N[language][key] || I18N.ru[key] || key;
}

function renderAvatar(user) {
  const name = user?.display_name || user?.username || t("guest");

  if (user?.avatar_url) {
    return `
      <img
        src="${escapeHtml(user.avatar_url)}"
        alt="${escapeHtml(name)}"
        width="58"
        height="58"
      />
    `;
  }

  return `<div class="avatar-fallback">${escapeHtml(getInitials(name))}</div>`;
}

function isLoggedIn(user) {
  return Boolean(user?.id);
}

async function savePreference(patch = {}) {
  if (!state.user?.id) return null;

  const saved = await upsertUserProfile({
    id: state.user.id,
    ...patch
  });

  if (saved) {
    setUser({
      ...state.user,
      preferred_theme: saved.preferred_theme || state.user.preferred_theme,
      preferred_language: saved.preferred_language || state.user.preferred_language
    });
  }

  return saved || null;
}

export function renderSidebar(root) {
  const user = state.user || {};
  const loggedIn = isLoggedIn(user);
  const isOpen = state.sidebarOpen;
  const currentTheme = normalizeTheme(state.theme);
  const currentLanguage = normalizeLanguage(state.language);

  root.innerHTML = `
    <style>
      .sidebar-overlay {
        position: fixed;
        inset: 0;
        background: rgba(5, 10, 20, 0.52);
        z-index: 90;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }

      .sidebar-overlay.is-open {
        opacity: 1;
        pointer-events: auto;
      }

      .sidebar-panel {
        position: absolute;
        top: 0;
        right: 0;
        width: min(88vw, 360px);
        height: 100%;
        background: var(--bg-elevated);
        border-left: 1px solid var(--border);
        box-shadow: var(--shadow);
        padding: 18px;
        transform: translateX(100%);
        transition: transform 0.22s ease;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .sidebar-overlay.is-open .sidebar-panel {
        transform: translateX(0);
      }

      .sidebar-profile {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px;
        border-radius: 18px;
        background: var(--surface);
        border: 1px solid var(--border-soft);
      }

      .sidebar-avatar {
        width: 58px;
        height: 58px;
        border-radius: 999px;
        overflow: hidden;
        border: 1px solid var(--border);
        flex-shrink: 0;
        background: var(--surface-strong);
      }

      .sidebar-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .avatar-fallback {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, var(--accent), var(--accent-strong));
        color: #fff;
        font-weight: 700;
      }

      .sidebar-profile__name {
        font-size: 18px;
        font-weight: 700;
        line-height: 1.25;
        color: var(--text);
      }

      .sidebar-profile__sub {
        color: var(--text-soft);
        font-size: 14px;
        line-height: 1.35;
        margin-top: 3px;
      }

      .setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px;
        border-radius: 16px;
        background: var(--surface);
        border: 1px solid var(--border-soft);
        gap: 12px;
        color: var(--text);
      }

      .segmented {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .segmented button {
        padding: 7px 12px;
        border-radius: 999px;
        background: var(--bg-soft);
        color: var(--text-soft);
        border: 1px solid transparent;
      }

      .segmented button:disabled {
        opacity: 0.6;
        cursor: default;
      }

      .segmented .active {
        background: var(--accent-soft);
        color: var(--text);
        border-color: rgba(255, 255, 255, 0.04);
      }

      .sidebar-actions {
        margin-top: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .btn {
        padding: 13px 14px;
        border-radius: 14px;
        font-weight: 700;
        color: var(--text);
      }

      .btn:disabled {
        opacity: 0.7;
        cursor: default;
      }

      .btn.secondary {
        background: var(--surface);
        border: 1px solid var(--border);
      }

      .btn.primary {
        background: var(--accent);
        color: #fff;
      }

      .btn.danger {
        background: rgba(255, 124, 139, 0.14);
        color: var(--danger);
        border: 1px solid rgba(255, 124, 139, 0.18);
      }
    </style>

    <div class="sidebar-overlay ${isOpen ? "is-open" : ""}">
      <div class="sidebar-panel">
        <div class="sidebar-profile">
          <div class="sidebar-avatar">
            ${renderAvatar(user)}
          </div>

          <div>
            <div class="sidebar-profile__name">
              ${escapeHtml(user.display_name || t("guest"))}
            </div>
            <div class="sidebar-profile__sub">
              ${
                loggedIn
                  ? `@${escapeHtml(user.username || "user")}`
                  : escapeHtml(t("saveLibraryHint"))
              }
            </div>
          </div>
        </div>

        <div class="setting-row">
          <span>${escapeHtml(t("language"))}</span>
          <div class="segmented">
            <button type="button" data-lang="ru" class="${currentLanguage === "ru" ? "active" : ""}">RU</button>
            <button type="button" data-lang="en" class="${currentLanguage === "en" ? "active" : ""}">EN</button>
          </div>
        </div>

        <div class="setting-row">
          <span>${escapeHtml(t("theme"))}</span>
          <div class="segmented">
            <button type="button" data-theme="dark" class="${currentTheme === "dark" ? "active" : ""}">${escapeHtml(t("dark"))}</button>
            <button type="button" data-theme="light" class="${currentTheme === "light" ? "active" : ""}">${escapeHtml(t("light"))}</button>
            <button type="button" data-theme="system" class="${currentTheme === "system" ? "active" : ""}">${escapeHtml(t("system"))}</button>
          </div>
        </div>

        <div class="sidebar-actions">
          ${
            loggedIn
              ? `
                <button class="btn secondary" type="button" data-action="settings">
                  ${escapeHtml(t("settings"))}
                </button>

                <button class="btn danger" type="button" data-action="logout">
                  ${escapeHtml(t("logout"))}
                </button>
              `
              : `
                <button class="btn primary" type="button" data-action="login">
                  ${escapeHtml(t("login"))}
                </button>

                <button class="btn secondary" type="button" data-action="register">
                  ${escapeHtml(t("register"))}
                </button>
              `
          }
        </div>
      </div>
    </div>
  `;

  const overlay = root.querySelector(".sidebar-overlay");

  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeSidebar();
    }
  });

  root.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", async () => {
      const language = normalizeLanguage(button.dataset.lang || "ru");

      try {
        button.disabled = true;
        setLanguage(language);
        await savePreference({ preferred_language: language });
      } catch (error) {
        console.warn("Sidebar language save error:", error);
      } finally {
        button.disabled = false;
      }
    });
  });

  root.querySelectorAll("[data-theme]").forEach((button) => {
    button.addEventListener("click", async () => {
      const theme = normalizeTheme(button.dataset.theme || "dark");

      try {
        button.disabled = true;
        setTheme(theme);
        await savePreference({ preferred_theme: theme });
      } catch (error) {
        console.warn("Sidebar theme save error:", error);
      } finally {
        button.disabled = false;
      }
    });
  });

  root.querySelector('[data-action="settings"]')?.addEventListener("click", () => {
    closeSidebar();
    navigate(ROUTES.SETTINGS);
  });

  root.querySelector('[data-action="login"]')?.addEventListener("click", () => {
    closeSidebar();
    openAuthModal("login");
  });

  root.querySelector('[data-action="register"]')?.addEventListener("click", () => {
    closeSidebar();
    openAuthModal("register");
  });

  root.querySelector('[data-action="logout"]')?.addEventListener("click", async () => {
    const logoutButton = root.querySelector('[data-action="logout"]');

    try {
      if (logoutButton) {
        logoutButton.disabled = true;
        logoutButton.textContent = t("loggingOut");
      }

      await signOut();
      closeSidebar();
      navigate(ROUTES.HOME);
    } catch (error) {
      console.warn("Logout error:", error);

      if (logoutButton) {
        logoutButton.disabled = false;
        logoutButton.textContent = t("logout");
      }
    }
  });
}
