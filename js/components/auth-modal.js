import {
  state,
  closeAuthModal,
  setAuthMode
} from "../state.js";

import {
  signIn,
  signUp
} from "../lib/supabase-client.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const I18N = {
  ru: {
    loginTitle: "Вход",
    registerTitle: "Регистрация",
    email: "Email",
    password: "Пароль",
    loginSubmit: "Войти",
    registerSubmit: "Создать аккаунт",
    loggingIn: "Входим…",
    registering: "Создаём…",
    switchToRegister: "Нет аккаунта? Зарегистрироваться",
    switchToLogin: "Уже есть аккаунт? Войти",
    emptyFields: "Заполни email и пароль.",
    registerNote: "Аккаунт создан. Проверь email, если включено подтверждение почты.",
    loginFailed: "Не удалось войти.",
    authError: "Ошибка авторизации",
    close: "Закрыть"
  },
  en: {
    loginTitle: "Sign in",
    registerTitle: "Create account",
    email: "Email",
    password: "Password",
    loginSubmit: "Sign in",
    registerSubmit: "Create account",
    loggingIn: "Signing in…",
    registering: "Creating…",
    switchToRegister: "No account? Create one",
    switchToLogin: "Already have an account? Sign in",
    emptyFields: "Enter email and password.",
    registerNote: "Account created. Check your email if confirmation is enabled.",
    loginFailed: "Could not sign in.",
    authError: "Authentication error",
    close: "Close"
  }
};

function t(key) {
  const language = state.language === "en" ? "en" : "ru";
  return I18N[language][key] || I18N.ru[key] || key;
}

function renderError(message = "") {
  return message ? `<div class="auth-error">${escapeHtml(message)}</div>` : "";
}

function renderNote(message = "") {
  return message ? `<div class="auth-note">${escapeHtml(message)}</div>` : "";
}

function getSubmitLabel(mode) {
  return mode === "login" ? t("loginSubmit") : t("registerSubmit");
}

function getLoadingLabel(mode) {
  return mode === "login" ? t("loggingIn") : t("registering");
}

function getTitle(mode) {
  return mode === "login" ? t("loginTitle") : t("registerTitle");
}

function getSwitchLabel(mode) {
  return mode === "login" ? t("switchToRegister") : t("switchToLogin");
}

function normalizeAuthError(error) {
  const message = String(error?.message || "").trim();

  if (!message) return t("authError");

  if (message.toLowerCase().includes("invalid login credentials")) {
    return state.language === "en"
      ? "Invalid email or password."
      : "Неверный email или пароль.";
  }

  if (message.toLowerCase().includes("email not confirmed")) {
    return state.language === "en"
      ? "Email is not confirmed."
      : "Email не подтверждён.";
  }

  return message;
}

export function renderAuthModal(root) {
  const isOpen = state.authModalOpen;
  const mode = state.authMode === "register" ? "register" : "login";

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

      .auth-note {
        color: var(--text-soft);
        font-size: 13px;
        line-height: 1.5;
      }

      .auth-close {
        position: absolute;
        right: 12px;
        top: 12px;
        background: transparent;
        font-size: 18px;
        color: var(--text);
      }
    </style>

    <div class="auth-overlay ${isOpen ? "is-open" : ""}">
      <div class="auth-panel">
        <button class="auth-close" data-close type="button" aria-label="${escapeHtml(t("close"))}">✕</button>

        <div class="auth-title">${escapeHtml(getTitle(mode))}</div>

        <form class="auth-form">
          <input class="auth-input" name="email" type="email" placeholder="${escapeHtml(t("email"))}" autocomplete="email" required />
          <input class="auth-input" name="password" type="password" placeholder="${escapeHtml(t("password"))}" autocomplete="${mode === "login" ? "current-password" : "new-password"}" required />

          <div data-message></div>

          <button class="auth-button" type="submit">
            ${escapeHtml(getSubmitLabel(mode))}
          </button>
        </form>

        <div class="auth-switch" data-switch>
          ${escapeHtml(getSwitchLabel(mode))}
        </div>
      </div>
    </div>
  `;

  const overlay = root.querySelector(".auth-overlay");
  const form = root.querySelector(".auth-form");
  const messageBox = root.querySelector("[data-message]");
  const submitButton = root.querySelector(".auth-button");

  root.querySelector("[data-close]")?.addEventListener("click", closeAuthModal);

  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeAuthModal();
    }
  });

  root.querySelector("[data-switch]")?.addEventListener("click", () => {
    setAuthMode(mode === "login" ? "register" : "login");
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = form.querySelector('input[name="email"]')?.value?.trim() || "";
    const password = form.querySelector('input[name="password"]')?.value || "";

    if (messageBox) {
      messageBox.innerHTML = "";
    }

    if (!email || !password) {
      if (messageBox) {
        messageBox.innerHTML = renderError(t("emptyFields"));
      }
      return;
    }

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = getLoadingLabel(mode);
      }

      const result =
        mode === "login"
          ? await signIn(email, password)
          : await signUp(email, password);

      const user = result?.user || result?.session?.user || null;

      if (!user?.id) {
        if (mode === "register") {
          if (messageBox) {
            messageBox.innerHTML = renderNote(t("registerNote"));
          }

          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = getSubmitLabel(mode);
          }

          return;
        }

        throw new Error(t("loginFailed"));
      }

      closeAuthModal();
    } catch (error) {
      console.warn("Auth submit error:", error);

      if (messageBox) {
        messageBox.innerHTML = renderError(normalizeAuthError(error));
      }

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = getSubmitLabel(mode);
      }
    }
  });
}
