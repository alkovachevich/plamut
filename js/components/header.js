import { APP_NAME } from "../config.js";
import { navigate } from "../router.js";
import { openSidebar, state } from "../state.js";
import { escapeHtml, getInitials } from "../utils.js";

const I18N = {
  ru: {
    guest: "Гость",
    subtitle: "Библиотека и вселенные",
    home: "На главную",
    openProfile: "Открыть профиль"
  },
  en: {
    guest: "Guest",
    subtitle: "Library & universes",
    home: "Home",
    openProfile: "Open profile"
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
        width="46"
        height="46"
      />
    `;
  }

  return `<div class="avatar-fallback">${escapeHtml(getInitials(name))}</div>`;
}

export function renderHeader(root) {
  const user = state.user || {
    display_name: t("guest"),
    username: "guest",
    avatar_url: null
  };

  root.innerHTML = `
    <style>
      .app-header__inner {
        width: min(100%, var(--content-max-width));
        height: var(--header-height);
        margin: 0 auto;
        padding: 0 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .brand-row {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }

      .brand-title-button {
        background: transparent;
        padding: 0;
        text-align: left;
        color: var(--text);
      }

      .brand-title {
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.03em;
        color: var(--text);
      }

      .brand-subtitle {
        font-size: 12px;
        color: var(--text-soft);
        margin-top: 2px;
      }

      .avatar-button {
        width: 46px;
        height: 46px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--surface-strong);
        border: 1px solid var(--border);
        box-shadow: var(--shadow);
        overflow: hidden;
        flex-shrink: 0;
      }

      .avatar-button img {
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
    </style>

    <div class="app-header__inner">
      <div class="brand-row">
        <button class="brand-title-button" type="button" aria-label="${escapeHtml(t("home"))}">
          <div class="brand-title">${escapeHtml(APP_NAME)}</div>
          <div class="brand-subtitle">${escapeHtml(t("subtitle"))}</div>
        </button>
      </div>

      <button class="avatar-button" type="button" aria-label="${escapeHtml(t("openProfile"))}">
        ${renderAvatar(user)}
      </button>
    </div>
  `;

  root.querySelector(".brand-title-button")?.addEventListener("click", () => {
    navigate("/");
  });

  root.querySelector(".avatar-button")?.addEventListener("click", () => {
    openSidebar();
  });
}
