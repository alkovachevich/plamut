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
  if (!message) return "";
  return `<div class="auth-error">${escapeHtml(message)}</div>`;
}

function renderNote(message = "") {
  if (!message) return "";
  return `<div class="auth-note">${escapeHtml(message)}</div>`;
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
  const source =
    user?.user_metadata?.username ||
    user?.user_metadata?.preferred_username ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "user";

  return (
    String(source)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "user"
  );
}

function buildDisplayName(user, profile = null) {
  return (
    profile?.display_name ||
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "User"
  );
}

function buildAvatarUrl(user, profile = null) {
  return (
    profile?.avatar_url ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    null
  );
}

async function ensureProfile(user) {
  if (!user?.id) return null;

  const existing = await fetchUserProfile(user.id);

  const payload = {
    id: user.id,
    username: existing?.username || buildUsername(user),
    display_name: existing?.display_name || buildDisplayName(user, existing),
    avatar_url: existing?.avatar_url || buildAvatarUrl(user, existing)
  };

  return await upsertUserProfile(payload);
}

async function applyUserToStateFromAuth() {
  const authUser = await getCurrentUser();

  if (!authUser?.id) {
    return null;
  }

  let profile = null;

  try {
    profile = await ensureProfile(authUser);
  } catch (error) {
    console.error("Profile upsert error:", error);
  }

  setUser({
    id: authUser.id,
    email: authUser.email || null,
    username: profile?.username || buildUsername(authUser),
    display_name: profile?.display_name || buildDisplayName(authUser, profile),
    avatar_url: profile?.avatar_url || buildAvatarUrl(authUser, profile)
  });

  return {
    authUser,
    profile
  };
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
        <button class="auth-close" data-close type="button">✕</button>

        <div class="auth-title">
          ${getTitle(mode)}
        </div>

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

    messageBox.innerHTML = "";

    if (!email || !password) {
      messageBox.innerHTML = renderError("Заполни email и пароль.");
      return;
    }

    try {
      submitButton.disabled = true;
      submitButton.textContent = mode === "login" ? "Входим..." : "Создаём...";

      if (mode === "login") {
        await signInWithEmail(email, password);

        const result = await applyUserToStateFromAuth();
        if (!result?.authUser?.id) {
          throw new Error("Не удалось получить пользователя после входа.");
        }

        closeAuthModal();
        navigate("/");
        return;
      }

      const signUpResult = await signUpWithEmail(email, password);
      const authUser = signUpResult?.user || null;
      const hasSession = Boolean(signUpResult?.session);

      if (authUser?.id && hasSession) {
        await applyUserToStateFromAuth();
        closeAuthModal();
        navigate("/");
        return;
      }

      if (authUser?.id && !hasSession) {
        messageBox.innerHTML = renderNote(
          "Аккаунт создан. Проверь почту и подтверди email, если письмо было отправлено."
        );
        submitButton.disabled = false;
        submitButton.textContent = getSubmitLabel(mode);
        return;
      }

      throw new Error("Не удалось завершить регистрацию.");
    } catch (error) {
      messageBox.innerHTML = renderError(error.message || "Ошибка авторизации");
      submitButton.disabled = false;
      submitButton.textContent = getSubmitLabel(mode);
    }
  });
}
