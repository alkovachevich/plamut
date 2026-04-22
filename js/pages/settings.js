import { state, setTheme, setLanguage } from "../state.js";
import { escapeHtml } from "../utils.js";

function renderSectionContent(section) {
  switch (section) {
    case "avatar":
      return `
        <div class="settings-panel-card">
          <div class="settings-panel-title">Аватар</div>
          <div class="settings-panel-text">
            Здесь будет загрузка и изменение аватара пользователя.
          </div>
        </div>
      `;

    case "profile":
      return `
        <div class="settings-panel-card">
          <div class="settings-panel-title">Имя пользователя</div>
          <div class="settings-form-grid">
            <label class="settings-label">
              <span>Display name</span>
              <input class="settings-input" type="text" value="${escapeHtml(state.user.display_name || "")}" placeholder="Введите имя" />
            </label>

            <label class="settings-label">
              <span>Username</span>
              <input class="settings-input" type="text" value="${escapeHtml(state.user.username || "")}" placeholder="Введите username" />
            </label>
          </div>
        </div>
      `;

    case "password":
      return `
        <div class="settings-panel-card">
          <div class="settings-panel-title">Пароль</div>
          <div class="settings-form-grid">
            <label class="settings-label">
              <span>Новый пароль</span>
              <input class="settings-input" type="password" placeholder="••••••••" />
            </label>

            <label class="settings-label">
              <span>Подтвердить пароль</span>
              <input class="settings-input" type="password" placeholder="••••••••" />
            </label>
          </div>
        </div>
      `;

    case "appearance":
      return `
        <div class="settings-panel-card">
          <div class="settings-panel-title">Внешний вид</div>

          <div class="settings-setting-block">
            <div class="settings-setting-title">Тема</div>
            <div class="settings-chip-row">
              <button class="settings-chip ${state.theme === "light" ? "is-active" : ""}" data-theme="light">
                Светлая
              </button>
              <button class="settings-chip ${state.theme === "dark" ? "is-active" : ""}" data-theme="dark">
                Тёмная
              </button>
            </div>
          </div>

          <div class="settings-setting-block">
            <div class="settings-setting-title">Язык</div>
            <div class="settings-chip-row">
              <button class="settings-chip ${state.language === "ru" ? "is-active" : ""}" data-language="ru">
                Русский
              </button>
              <button class="settings-chip ${state.language === "en" ? "is-active" : ""}" data-language="en">
                English
              </button>
            </div>
          </div>

          <div class="settings-setting-block">
            <div class="settings-setting-title">Цветовая схема</div>
            <div class="settings-panel-text">
              Пока используется базовая фирменная схема Plamut.
            </div>
          </div>
        </div>
      `;

    case "public":
      return `
        <div class="settings-panel-card">
          <div class="settings-panel-title">Публичная карточка</div>

          <div class="settings-form-grid">
            <label class="settings-label">
              <span>Заголовок карточки</span>
              <input class="settings-input" type="text" placeholder="Моя библиотека" />
            </label>

            <label class="settings-label">
              <span>Описание</span>
              <textarea class="settings-textarea" placeholder="Короткое описание профиля"></textarea>
            </label>
          </div>

          <div class="settings-inline-actions">
            <button class="settings-primary-button" type="button">
              Предпросмотр
            </button>
          </div>
        </div>
      `;

    case "nfc":
      return `
        <div class="settings-panel-card">
          <div class="settings-panel-title">NFC</div>
          <div class="settings-panel-text">
            Скоро появится.
          </div>
        </div>
      `;

    default:
      return `
        <div class="settings-panel-card">
          <div class="settings-panel-title">Настройки</div>
          <div class="settings-panel-text">
            Выбери раздел слева, чтобы изменить параметры профиля.
          </div>
        </div>
      `;
  }
}

export function renderSettingsPage(root) {
  const initialSection = state.routeParams?.section || "appearance";

  root.innerHTML = `
    <style>
      .settings-page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .settings-title {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.03em;
      }

      .settings-layout {
        display: grid;
        grid-template-columns: 1fr;
        gap: 16px;
      }

      .settings-sidebar {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        border-radius: 22px;
        border: 1px solid var(--border);
        background: var(--bg-elevated);
        box-shadow: var(--shadow);
      }

      .settings-nav-button {
        min-height: 48px;
        padding: 0 14px;
        border-radius: 14px;
        text-align: left;
        font-weight: 700;
        color: var(--text-soft);
      }

      .settings-nav-button.is-active {
        background: var(--accent-soft);
        color: var(--text);
      }

      .settings-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .settings-panel-card {
        padding: 20px;
        border-radius: 22px;
        border: 1px solid var(--border);
        background: var(--bg-elevated);
        box-shadow: var(--shadow);
      }

      .settings-panel-title {
        font-size: 20px;
        font-weight: 800;
        margin-bottom: 10px;
      }

      .settings-panel-text {
        color: var(--text-soft);
        line-height: 1.6;
      }

      .settings-form-grid {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .settings-label {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-weight: 600;
      }

      .settings-label span {
        color: var(--text-soft);
        font-size: 14px;
      }

      .settings-input,
      .settings-textarea {
        width: 100%;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        border-radius: 14px;
        padding: 12px 14px;
        outline: none;
      }

      .settings-textarea {
        min-height: 120px;
        resize: vertical;
      }

      .settings-setting-block + .settings-setting-block {
        margin-top: 18px;
      }

      .settings-setting-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--text-soft);
        margin-bottom: 10px;
      }

      .settings-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .settings-chip {
        min-height: 40px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: var(--surface);
        font-weight: 700;
        color: var(--text-soft);
      }

      .settings-chip.is-active {
        background: var(--accent);
        border-color: var(--accent);
        color: #fff;
      }

      .settings-inline-actions {
        margin-top: 18px;
        display: flex;
        gap: 10px;
      }

      .settings-primary-button {
        min-height: 46px;
        padding: 0 16px;
        border-radius: 14px;
        background: linear-gradient(135deg, var(--accent), var(--accent-strong));
        color: #fff;
        font-weight: 700;
        box-shadow: var(--shadow);
      }

      @media (min-width: 900px) {
        .settings-layout {
          grid-template-columns: 280px minmax(0, 1fr);
          align-items: start;
        }

        .settings-sidebar {
          position: sticky;
          top: 88px;
        }
      }
    </style>

    <section class="settings-page">
      <div class="settings-title">Настройки</div>

      <div class="settings-layout">
        <aside class="settings-sidebar">
          <button class="settings-nav-button" data-section="appearance">Внешний вид</button>
          <button class="settings-nav-button" data-section="avatar">Аватар</button>
          <button class="settings-nav-button" data-section="profile">Имя пользователя</button>
          <button class="settings-nav-button" data-section="password">Пароль</button>
          <button class="settings-nav-button" data-section="public">Публичная карточка</button>
          <button class="settings-nav-button" data-section="nfc">NFC</button>
        </aside>

        <div class="settings-content" data-settings-content>
          ${renderSectionContent(initialSection)}
        </div>
      </div>
    </section>
  `;

  const contentRoot = root.querySelector("[data-settings-content]");
  const navButtons = [...root.querySelectorAll("[data-section]")];

  function setActive(section) {
    navButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.section === section);
    });

    if (contentRoot) {
      contentRoot.innerHTML = renderSectionContent(section);

      contentRoot.querySelectorAll("[data-theme]").forEach((button) => {
        button.addEventListener("click", () => {
          setTheme(button.dataset.theme);
        });
      });

      contentRoot.querySelectorAll("[data-language]").forEach((button) => {
        button.addEventListener("click", () => {
          setLanguage(button.dataset.language);
        });
      });
    }
  }

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActive(button.dataset.section);
    });
  });

  setActive(initialSection);
}
