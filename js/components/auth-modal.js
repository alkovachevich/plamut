import {
  state,
  closeAuthModal,
  setAuthMode
} from "../state.js";

import {
  signInWithEmail,
  signUpWithEmail
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

function getSubmitLabel(mode) {
  return mode === "login" ? "Войти" : "Создать аккаунт";
}

function getTitle(mode) {
  return mode === "login" ? "Вход" : "Регистрация";
}

function getSwitchLabel(mode) {
  return mode === "login"
    ? "Нет аккаунта? Зарегистрироваться"
    : "Уже есть аккаунт? Войти";
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
        color: var(--text);
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
        outline: none;
      }

      .auth-button {
        height: 48px;
        border-radius: 12px;
        background: var(--accent);
        color: #fff;
        font-weight: 700;
        border: none;
      }

      .auth-button:disabled {
        opacity: 0.7;
        cursor: default;
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
        line-height: 1.45;
      }

      .auth-close {
        position: absolute;
        right: 12px;
        top: 12px;
        background: transparent;
        font-size: 18px;
        color: var(--text);
      }

      .auth-note {
        color: var(--text-soft);
        font-size: 13px;
        line-height: 1.5;
      }
    </style>

    <div class="auth-overlay ${isOpen ? "is-open" : ""}">
      <div class="auth-panel">
        <button class="auth-close" data-close type="button">✕</button>

        <div class="auth-title">
          ${getTitle(mode)}
        </div>

        <form class="auth-form">
          <input class="auth-input" name="email" type="email" placeholder="Email" required />
          <input class="auth-input" name="password" type="password" placeholder="Пароль" required />

          <div data-error></div>

          <button class="auth-button" type="submit">
            ${getSubmitLabel(mode)}
          </button>

          ${
            mode === "register"
              ? `<div class="auth-note">После регистрации может понадобиться подтверждение email, если это включено в Supabase.</div>`
              : ""
          }
        </form>

        <div class="auth-switch" data-switch>
          ${getSwitchLabel(mode)}
        </div>
      </div>
    </div>
  `;

  const overlay = root.querySelector(".auth-overlay");
  const form = root.querySelector(".auth-form");
  const errorBox = root.querySelector("[data-error]");
  const submitButton = root.querySelector(".auth-button");

  root.querySelector("[data-close]")?.addEventListener("click", closeAuthModal);

  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) closeAuthModal();
  });

  root.querySelector("[data-switch]")?.addEventListener("click", () => {
    setAuthMode(mode === "login" ? "register" : "login");
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const emailInput = form.querySelector('input[name="email"]');
    const passwordInput = form.querySelector('input[name="password"]');

    const email = emailInput?.value?.trim() || "";
    const password = passwordInput?.value || "";

    errorBox.innerHTML = "";

    if (!email || !password) {
      errorBox.innerHTML = renderError("Заполни email и пароль.");
      return;
    }

    try {
      submitButton.disabled = true;
      submitButton.textContent = mode === "login" ? "Входим..." : "Создаём...";

      if (mode === "login") {
        await signInWithEmail(email, password);
        closeAuthModal();
      } else {
        const result = await signUpWithEmail(email, password);
        const hasSession = Boolean(result?.session);

        if (hasSession) {
          closeAuthModal();
        } else {
          errorBox.innerHTML = `
            <div class="auth-note">
              Аккаунт создан. Проверь почту и подтверди email, если письмо было отправлено.
            </div>
          `;
          submitButton.disabled = false;
          submitButton.textContent = getSubmitLabel(mode);
        }
      }
    } catch (error) {
      errorBox.innerHTML = renderError(error.message || "Ошибка авторизации");
      submitButton.disabled = false;
      submitButton.textContent = getSubmitLabel(mode);
    }
  });
}
