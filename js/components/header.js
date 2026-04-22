import { APP_NAME, ROUTES } from "../config.js";
import { navigate } from "../router.js";
import { setState, state } from "../state.js";
import { escapeHtml, getInitials } from "../utils.js";


export function renderHeader(root) {
  const userName = state.user.display_name || state.user.username || "Гость";
  const avatarHtml = state.user.avatar_url
    ? `<img src="${escapeHtml(state.user.avatar_url)}" alt="${escapeHtml(userName)}" />`
    : `<div class="avatar-fallback">${escapeHtml(getInitials(userName))}</div>`;


  root.innerHTML = `
    <div class="app-header__inner">
      <div class="brand-row">
        <button class="brand-title-button" type="button" aria-label="На главную">
          <div>
            <div class="brand-title">${APP_NAME}</div>
          </div>
        </button>
      </div>


      <button class="avatar-button" type="button" aria-label="Открыть профиль">
        ${avatarHtml}
      </button>
    </div>
  `;


  root.querySelector(".brand-title-button")?.addEventListener("click", () => {
    navigate(ROUTES.HOME);
  });


  root.querySelector(".avatar-button")?.addEventListener("click", () => {
    setState({ sidebarOpen: true });
  });
}
