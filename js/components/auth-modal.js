import {
  state,
  closeAuthModal,
  setAuthMode,
  setUser
} from "../state.js";

import { navigate } from "../router.js";

import {
  signInWithEmail,
  signUpWithEmail,
  getCurrentUser,
  fetchUserProfile
} from "../lib/supabase-client.js";

/* =========================
   HELPERS
========================= */

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderError(message = "") {
  if (!message) return "";
  return `<div class="auth-error">${escapeHtml(message)}</div>`;
}

/* =========================
   MAIN
========================= */

export function renderAuthModal(root) {
  const isOpen = state.authModalOpen;
  const mode = state.authMode;

  root.innerHTML = `
    <style>
      .auth-overlay {
        position: fixed;
        inset: 0;
        background: rgba(5, 10, 20, 0.6);
        z-index: 100;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }

      .auth-overlay.is-open {
        opacity: 1;
        pointer-events: auto;
      }

      .auth-panel {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%) scale(0.96);
        width: min(92vw, 420px);
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 22px;
        box-shadow: var(--shadow);
        transition: transform 0.2s ease;
      }

      .auth-overlay.is-open .auth-panel {
        transform: translate(-50%, -50%) scale(1);
      }

      .auth-title {
        font-size: 22px;
        font-weight: 800;
        margin-bottom: 12px;
      }

      .auth-form {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .auth-input {
        height: 48px;
        border-radius: 12px;
        border: 1px solid var(--border);
        padding: 0 12px;
        background: var(--surface);
        color: var(--text);
      }

      .auth-button {
        height: 48px;
        border-radius: 12px;
        background: var(--accent);
        color: #fff;
        font-weight: 700;
      }

      .auth-switch {
        margin-top: 10px;
        font-size: 14px;
        text-align: center;
        color: var(--text-soft);
        cursor: pointer;
      }

      .auth-error {
        color: var(--danger);
        font-size: 13px;
      }

      .auth-close {
        position: absolute;
        right: 12px;
        top: 12px;
        background: transparent;
        font-size: 18px;
      }
    </style>

    <div class="auth-overlay ${isOpen ? "is-open" : ""}">
      <div class="auth-panel">
        <button class="auth-close" data-close>✕</button>

        <div class="auth-title">
          ${mode === "login" ? "Вход" : "Регистрация"}
        </div>

        <form class="auth-form">
          <input class="auth-input" type="email" placeholder="Email" required />
          <input class="auth-input" type="password" placeholder="Пароль" required />

          <div data-error></div>

          <button class="auth-button" type="submit">
            ${mode === "login" ? "Войти" : "Создать аккаунт"}
          </button>
        </form>

        <div class="auth-switch" data-switch>
          ${
            mode === "login"
              ? "Нет аккаунта? Зарегистрироваться"
              : "Уже есть аккаунт? Войти"
          }
        </div>
      </div>
    </div>
  `;

  const overlay = root.querySelector(".auth-overlay");
  const form = root.querySelector(".auth-form");
  const errorBox = root.querySelector("[data-error]");

  root.querySelector("[data-close]")?.addEventListener("click", closeAuthModal);

  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) closeAuthModal();
  });

  root.querySelector("[data-switch]")?.addEventListener("click", () => {
    setAuthMode(mode === "login" ? "register" : "login");
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = form.querySelector('input[type="email"]').value.trim();
    const password = form.querySelector('input[type="password"]').value;

    errorBox.innerHTML = "";

    try {
      if (mode === "login") {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }

      const user = await getCurrentUser();

      let profile = null;
      if (user?.id) {
        profile = await fetchUserProfile(user.id);
      }

      setUser({
        id: user?.id,
        email: user?.email,
        display_name: profile?.display_name || "",
        username: profile?.username || "",
        avatar_url: profile?.avatar_url || ""
      });

      closeAuthModal();

      // 🔥 РЕДИРЕКТ НА ГЛАВНУЮ
      navigate("/");
    } catch (error) {
      errorBox.innerHTML = renderError(error.message || "Ошибка");
    }
  });
}
