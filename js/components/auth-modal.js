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
  fetchUserProfile,
  upsertUserProfile
} from "../lib/supabase-client.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderError(message = "") {
  return message ? `<div class="auth-error">${escapeHtml(message)}</div>` : "";
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

function buildUsername(user) {
  const source = user?.email?.split("@")[0] || "user";

  return (
    String(source)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "user"
  );
}

function buildDisplayName(user) {
  return user?.email?.split("@")[0] || "User";
}

async function syncProfileWithoutBlocking(user) {
  if (!user?.id) return;

  try {
    const existing = await fetchUserProfile(user.id);

    const payload = {
      id: user.id,
      username: existing?.username || buildUsername(user),
      display_name: existing?.display_name || buildDisplayName(user),
      avatar_url: existing?.avatar_url || null
    };

    const profile = await upsertUserProfile(payload);

    setUser({
      id: user.id,
      email: user.email || null,
      username: profile?.username || payload.username,
      display_name: profile?.display_name || payload.display_name,
      avatar_url: profile?.avatar_url || null
    });
  } catch (error) {
    console.error("Profile sync error:", error);
  }
}

function applyAuthUserImmediately(user) {
  if (!user?.id) return;

  setUser({
    id: user.id,
    email: user.email || null,
    username: buildUsername(user),
    display_name: buildDisplayName(user),
    avatar_url: null
  });

  syncProfileWithoutBlocking(user);
}

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
    </style>

    <div class="auth-overlay ${isOpen ? "is-open" : ""}">
      <div class="auth-panel">
        <button class="auth-close" data-close type="button">✕</button>

        <div class="auth-title">${getTitle(mode)}</div>

        <form class="auth-form">
          <input class="auth-input" name="email" type="email" placeholder="Email" required />
          <input class="auth-input" name="password" type="password" placeholder="Пароль" required />

          <div data-message></div>

          <button class="auth-button" type="submit">
            ${getSubmitLabel(mode)}
          </button>
        </form>

        <div class="auth-switch" data-switch>
          ${getSwitchLabel(mode)}
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

    messageBox.innerHTML = "";

    if (!email || !password) {
      messageBox.innerHTML = renderError("Заполни email и пароль.");
      return;
    }

    try {
      submitButton.disabled = true;
      submitButton.textContent = mode === "login" ? "Входим..." : "Создаём...";

      const result =
        mode === "login"
          ? await signInWithEmail(email, password)
          : await signUpWithEmail(email, password);

      const user = result?.user || result?.session?.user || null;

      if (!user?.id) {
        throw new Error(
          mode === "login"
            ? "Не удалось войти."
            : "Аккаунт создан. Проверь email, если включено подтверждение почты."
        );
      }

      applyAuthUserImmediately(user);
      closeAuthModal();
      navigate("/");
    } catch (error) {
      console.error("Auth submit error:", error);
      messageBox.innerHTML = renderError(error.message || "Ошибка авторизации");
      submitButton.disabled = false;
      submitButton.textContent = getSubmitLabel(mode);
    }
  });
}
