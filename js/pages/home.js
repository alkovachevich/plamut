import { navigate } from "../router.js";
import { ROUTES } from "../config.js";
import { openSearchModal } from "../state.js";

export function renderHomePage(root) {
  root.innerHTML = `
    <style>
      .page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .page-section {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .placeholder-card {
        border-radius: 28px;
        padding: 28px 20px;
        border: 1px solid var(--border);
        background: var(--bg-elevated);
        box-shadow: var(--shadow);
      }

      .home-title-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
      }

      .brand-title {
        font-size: 32px;
        font-weight: 800;
        letter-spacing: -0.03em;
        line-height: 1;
      }

      .brand-share {
        margin-top: 8px;
        color: var(--text-soft);
        font-size: 14px;
        font-weight: 500;
        padding: 0;
      }

      .inline-add-button {
        width: 52px;
        height: 52px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        box-shadow: var(--shadow);
        font-size: 30px;
        font-weight: 500;
        flex-shrink: 0;
      }

      .action-card-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 14px;
      }

      .action-card {
        min-height: 116px;
        border-radius: 22px;
        border: 1px solid var(--border);
        background: linear-gradient(
          180deg,
          var(--bg-elevated),
          color-mix(in srgb, var(--bg-elevated) 92%, black)
        );
        box-shadow: var(--shadow);
        padding: 18px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        text-align: left;
      }

      .action-card__icon {
        width: 48px;
        height: 48px;
        border-radius: 16px;
        background: var(--accent-soft);
        display: grid;
        place-items: center;
        font-size: 22px;
      }

      .action-card__title {
        font-size: 18px;
        font-weight: 700;
      }

      .action-card__text {
        color: var(--text-soft);
        font-size: 14px;
      }

      @media (min-width: 768px) {
        .home-title-row {
          justify-content: flex-start;
        }

        .action-card-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
    </style>

    <section class="page">
      <section class="page-section placeholder-card">
        <div class="home-title-row">
          <div>
            <div class="brand-title">Plamut</div>
            <button class="brand-share" type="button" data-action="share">
              Поделиться библиотекой
            </button>
          </div>

          <button
            class="inline-add-button"
            type="button"
            aria-label="Добавить"
            data-action="add"
          >
            +
          </button>
        </div>
      </section>

      <section class="page-section action-card-grid">
        <button class="action-card" type="button" data-route="categories">
          <div class="action-card__icon">📚</div>
          <div>
            <div class="action-card__title">Библиотека</div>
            <div class="action-card__text">Категории и коллекции</div>
          </div>
        </button>

        <button class="action-card" type="button" data-route="settings" data-section="nfc">
          <div class="action-card__icon">📡</div>
          <div>
            <div class="action-card__title">NFC</div>
            <div class="action-card__text">Скоро появится</div>
          </div>
        </button>

        <button class="action-card" type="button" data-route="universes">
          <div class="action-card__icon">🌌</div>
          <div>
            <div class="action-card__title">Вселенные</div>
            <div class="action-card__text">Открыть карту и связи</div>
          </div>
        </button>
      </section>
    </section>
  `;

  root.querySelector('[data-action="add"]')?.addEventListener("click", () => {
    openSearchModal("");
  });

  root.querySelector('[data-action="share"]')?.addEventListener("click", () => {
    navigate(ROUTES.GUEST);
  });

  root.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      const routeName = button.dataset.route;
      const section = button.dataset.section;

      switch (routeName) {
        case "categories":
          navigate(ROUTES.CATEGORIES);
          break;
        case "settings":
          navigate(ROUTES.SETTINGS, section ? { section } : {});
          break;
        case "universes":
          navigate(ROUTES.UNIVERSES);
          break;
        default:
          navigate(ROUTES.HOME);
          break;
      }
    });
  });
}
