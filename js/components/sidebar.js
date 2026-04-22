import { navigate } from "../router.js";
import {
  state,
  closeSidebar,
  setTheme,
  setLanguage,
  logoutUser
} from "../state.js";
import { escapeHtml, getInitials } from "../utils.js";
import { ROUTES } from "../config.js";

function renderAvatar(user) {
  const name = user?.display_name || user?.username || "Гость";

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

export function renderSidebar(root) {
  const user = state.user;
  const isOpen = state.sidebarOpen;

  root.innerHTML = `
    <style>
      .sidebar-overlay {
        position: fixed;
        inset: 0;
        background: rgba(5, 10, 20, 0.48);
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
      }

      .sidebar-avatar {
        width: 58px;
        height: 58px;
        border-radius: 999px;
        overflow: hidden;
        border: 1px solid var(--border);
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
      }

      .sidebar-profile__sub {
        color: var(--text-soft);
        font-size: 14px;
      }

      .setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px;
        border-radius: 14px;
        background: var(--surface);
        border: 1px solid var(--border);
      }

      .segmented {
        display: flex;
        gap: 6px;
      }

      .segmented button {
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--bg-soft);
      }

      .segmented .active {
        background: var(--accent);
        color: #fff;
      }

      .sidebar-actions {
        margin-top: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .btn {
        padding: 12px;
        border-radius: 12px;
        font-weight: 600;
      }

      .btn.secondary {
        background: var(--surface);
        border: 1px solid var(--border);
      }

      .btn.danger {
        background: rgba(255, 91, 110, 0.2);
        color: var(--danger);
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
              ${escapeHtml(user.display_name || "Гость")}
            </div>
            <div class="sidebar-profile__sub">
              @${escapeHtml(user.username || "guest")}
            </div>
          </div>
        </div>

        <div class="setting-row">
          <span>Язык</span>
          <div class="segmented">
            <button data-lang="ru" class="${state.language === "ru" ? "active" : ""}">RU</button>
            <button data-lang="en" class="${state.language === "en" ? "active" : ""}">EN</button>
          </div>
        </div>

        <div class="setting-row">
          <span>Тема</span>
          <div class="segmented">
            <button data-theme="dark" class="${state.theme === "dark" ? "active" : ""}">Dark</button>
            <button data-theme="light" class="${state.theme === "light" ? "active" : ""}">Light</button>
          </div>
        </div>

        <div class="sidebar-actions">
          <button class="btn secondary" data-action="settings">
            Настройки
          </button>

          <button class="btn danger" data-action="logout">
            Выйти
          </button>
        </div>

      </div>
    </div>
  `;

  const overlay = root.querySelector(".sidebar-overlay");

  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeSidebar();
    }
  });

  root.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLanguage(btn.dataset.lang);
    });
  });

  root.querySelectorAll("[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setTheme(btn.dataset.theme);
    });
  });

  root.querySelector('[data-action="settings"]')?.addEventListener("click", () => {
    closeSidebar();
    navigate(ROUTES.SETTINGS);
  });

  root.querySelector('[data-action="logout"]')?.addEventListener("click", () => {
    logoutUser();
    closeSidebar();
  });
}
