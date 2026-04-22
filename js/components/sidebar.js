import { navigate } from "../router.js";
import {
  persistLanguage,
  persistTheme,
  setState,
  state
} from "../state.js";
import { escapeHtml, getInitials } from "../utils.js";
import { ROUTES } from "../config.js";


export function renderSidebar(root) {
  const userName = state.user.display_name || state.user.username || "Гость";
  const avatarHtml = state.user.avatar_url
    ? `<img src="${escapeHtml(state.user.avatar_url)}" alt="${escapeHtml(userName)}" />`
    : `<div class="avatar-fallback">${escapeHtml(getInitials(userName))}</div>`;


  root.innerHTML = `
    <div class="sidebar-overlay ${state.sidebarOpen ? "is-open" : ""}">
      <aside class="sidebar-panel" aria-label="Профиль">
        <div class="sidebar-profile">
          <div class="sidebar-avatar">
            ${avatarHtml}
          </div>
          <div class="sidebar-profile__meta">
            <div class="sidebar-profile__name">${escapeHtml(userName)}</div>
            <div class="sidebar-profile__sub">@${escapeHtml(state.user.username || "guest")}</div>
          </div>
        </div>


        <div class="sidebar-quick-settings">
          <div class="setting-row">
            <div class="setting-row__label">Язык</div>
            <div class="segmented" data-setting="language">
              <button type="button" data-value="ru" class="${state.language === "ru" ? "is-active" : ""}">RU</button>
              <button type="button" data-value="en" class="${state.language === "en" ? "is-active" : ""}">EN</button>
            </div>
          </div>


          <div class="setting-row">
            <div class="setting-row__label">Тема</div>
            <div class="segmented" data-setting="theme">
              <button type="button" data-value="light" class="${state.theme === "light" ? "is-active" : ""}">Light</button>
              <button type="button" data-value="dark" class="${state.theme === "dark" ? "is-active" : ""}">Dark</button>
            </div>
          </div>
        </div>


        <div class="sidebar-actions">
          <button class="secondary-button" type="button" data-action="settings">
            Все настройки
          </button>
          <button class="danger-button" type="button" data-action="logout">
            Выйти
          </button>
        </div>
      </aside>
    </div>
  `;


  const overlay = root.querySelector(".sidebar-overlay");
  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) {
      setState({ sidebarOpen: false });
    }
  });


  root.querySelectorAll('[data-setting="language"] button').forEach((button) => {
    button.addEventListener("click", () => {
      persistLanguage(button.dataset.value);
    });
  });


  root.querySelectorAll('[data-setting="theme"] button').forEach((button) => {
    button.addEventListener("click", () => {
      persistTheme(button.dataset.value);
    });
  });


  root.querySelector('[data-action="settings"]')?.addEventListener("click", () => {
    setState({ sidebarOpen: false });
    navigate(ROUTES.SETTINGS);
  });


  root.querySelector('[data-action="logout"]')?.addEventListener("click", () => {
    setState({
      sidebarOpen: false,
      user: {
        id: null,
        username: null,
        display_name: "Гость",
        avatar_url: null
      }
    });
  });
}
