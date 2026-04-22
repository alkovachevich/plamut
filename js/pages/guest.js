import { openAuthModal } from "../state.js";

export function renderGuestPage(root) {
  root.innerHTML = `
    <style>
      .guest-page {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      .guest-hero {
        padding: 28px 22px;
        border-radius: 28px;
        border: 1px solid var(--border);
        background:
          radial-gradient(circle at top right, var(--accent-soft), transparent 34%),
          var(--bg-elevated);
        box-shadow: var(--shadow);
      }

      .guest-brand {
        font-size: 32px;
        font-weight: 800;
        letter-spacing: -0.03em;
        margin-bottom: 12px;
      }

      .guest-title {
        font-size: 24px;
        font-weight: 800;
        line-height: 1.2;
        margin-bottom: 10px;
      }

      .guest-text {
        color: var(--text-soft);
        line-height: 1.6;
        max-width: 720px;
      }

      .guest-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 14px;
      }

      .guest-card {
        padding: 18px;
        border-radius: 22px;
        border: 1px solid var(--border);
        background: var(--bg-elevated);
        box-shadow: var(--shadow);
      }

      .guest-card__title {
        font-size: 18px;
        font-weight: 800;
        margin-bottom: 10px;
      }

      .guest-card__text {
        color: var(--text-soft);
        line-height: 1.6;
      }

      .guest-features {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }

      .guest-feature {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        border-radius: 16px;
        background: var(--surface);
        border: 1px solid var(--border);
      }

      .guest-feature__icon {
        width: 42px;
        height: 42px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: var(--accent-soft);
        font-size: 20px;
        flex-shrink: 0;
      }

      .guest-feature__meta {
        min-width: 0;
      }

      .guest-feature__title {
        font-size: 15px;
        font-weight: 700;
      }

      .guest-feature__text {
        color: var(--text-soft);
        font-size: 13px;
        margin-top: 3px;
      }

      .guest-actions {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 18px;
      }

      .guest-button {
        min-height: 50px;
        padding: 0 18px;
        border-radius: 16px;
        font-weight: 800;
      }

      .guest-button--primary {
        background: linear-gradient(135deg, var(--accent), var(--accent-strong));
        color: #fff;
        box-shadow: var(--shadow);
      }

      .guest-button--secondary {
        background: var(--surface);
        border: 1px solid var(--border);
        color: var(--text);
      }

      .guest-preview {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        margin-top: 14px;
      }

      .guest-preview__item {
        aspect-ratio: 0.68 / 1;
        border-radius: 14px;
        border: 1px solid var(--border);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)),
          var(--bg-soft);
      }

      @media (min-width: 860px) {
        .guest-grid {
          grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
        }

        .guest-actions {
          flex-direction: row;
          flex-wrap: wrap;
        }

        .guest-button {
          min-width: 180px;
        }
      }
    </style>

    <section class="guest-page">
      <section class="guest-hero">
        <div class="guest-brand">Plamut</div>
        <div class="guest-title">Твоя библиотека книг, фильмов и сериалов</div>
        <div class="guest-text">
          Собирай любимые произведения в одном месте, отмечай прогресс и находи связи между тем, что тебе нравится.
        </div>

        <div class="guest-actions">
          <button class="guest-button guest-button--primary" type="button" data-action="login">
            Войти
          </button>
          <button class="guest-button guest-button--secondary" type="button" data-action="register">
            Зарегистрироваться
          </button>
        </div>
      </section>

      <section class="guest-grid">
        <div class="guest-card">
          <div class="guest-card__title">Что внутри</div>

          <div class="guest-features">
            <div class="guest-feature">
              <div class="guest-feature__icon">📚</div>
              <div class="guest-feature__meta">
                <div class="guest-feature__title">Книги</div>
                <div class="guest-feature__text">Сохраняй книги и следи за прочитанным.</div>
              </div>
            </div>

            <div class="guest-feature">
              <div class="guest-feature__icon">🎬</div>
              <div class="guest-feature__meta">
                <div class="guest-feature__title">Фильмы</div>
                <div class="guest-feature__text">Добавляй фильмы и строй собственную медиатеку.</div>
              </div>
            </div>

            <div class="guest-feature">
              <div class="guest-feature__icon">📺</div>
              <div class="guest-feature__meta">
                <div class="guest-feature__title">Сериалы</div>
                <div class="guest-feature__text">Отмечай прогресс и держи всё в одном месте.</div>
              </div>
            </div>
          </div>
        </div>

        <div class="guest-card">
          <div class="guest-card__title">Как это выглядит</div>
          <div class="guest-card__text">
            Минималистичная библиотека с категориями, карточками и единым поиском по нескольким источникам.
          </div>

          <div class="guest-preview">
            <div class="guest-preview__item"></div>
            <div class="guest-preview__item"></div>
            <div class="guest-preview__item"></div>
            <div class="guest-preview__item"></div>
          </div>
        </div>
      </section>
    </section>
  `;

  root.querySelector('[data-action="login"]')?.addEventListener("click", () => {
    openAuthModal("login");
  });

  root.querySelector('[data-action="register"]')?.addEventListener("click", () => {
    openAuthModal("register");
  });
}
