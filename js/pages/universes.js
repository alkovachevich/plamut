import { navigate } from "../router.js";
import { state, openAuthModal } from "../state.js";
import { escapeHtml } from "../utils.js";
import { getUserUniverses } from "../services/universe-service.js";

function renderProgressCircle(progress = 0) {
  const percent = Math.round(Number(progress || 0) * 100);

  return `
    <div class="progress-circle">
      <div class="progress-inner">${percent}%</div>
    </div>
  `;
}

function renderCover(universe = {}) {
  if (universe.cover_url) {
    return `
      <img
        src="${escapeHtml(universe.cover_url)}"
        alt="${escapeHtml(universe.title || "")}"
        loading="lazy"
      />
    `;
  }

  return `<div class="universe-cover-fallback">U</div>`;
}

function renderCard(universe) {
  return `
    <button
      class="universe-card"
      type="button"
      data-key="${escapeHtml(universe.universe_key)}"
    >
      <div class="universe-cover">
        ${renderCover(universe)}
      </div>

      <div class="universe-content">
        <div class="universe-info">
          <div class="universe-title">${escapeHtml(universe.title)}</div>
          <div class="universe-meta">
            ${escapeHtml(String(universe.total || 0))} элементов · готово ${escapeHtml(String(universe.done || 0))}
          </div>
        </div>

        <div class="universe-progress">
          ${renderProgressCircle(universe.progress)}
        </div>
      </div>
    </button>
  `;
}

function renderGuest(root) {
  root.innerHTML = `
    <section class="page">
      <div class="title">Вселенные</div>

      <div class="empty-state">
        <div class="empty-title">Нужно войти</div>
        <div class="empty-text">Вселенные строятся на основе твоей сохранённой библиотеки.</div>
        <button class="login-btn" type="button" data-action="login">Войти</button>
      </div>
    </section>
  `;

  root.querySelector('[data-action="login"]')?.addEventListener("click", () => {
    openAuthModal("login");
  });
}

export async function renderUniversesPage(root) {
  const userId = state.user?.id;

  root.innerHTML = `
    <style>
      .page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .title {
        font-size: 28px;
        font-weight: 800;
        color: var(--text);
      }

      .subtitle {
        color: var(--text-soft);
        line-height: 1.5;
      }

      .grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 14px;
      }

      .universe-card {
        display: grid;
        grid-template-columns: 92px 1fr;
        gap: 14px;
        border-radius: 22px;
        overflow: hidden;
        border: 1px solid var(--border-soft);
        background: var(--bg-elevated);
        text-align: left;
        padding: 10px;
        color: var(--text);
        transition: transform .18s ease, border-color .18s ease;
      }

      .universe-card:hover {
        transform: translateY(-2px);
        border-color: var(--border);
      }

      .universe-cover {
        width: 92px;
        height: 132px;
        border-radius: 16px;
        overflow: hidden;
        background: var(--surface);
        border: 1px solid var(--border-soft);
      }

      .universe-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .universe-cover-fallback {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: var(--text-soft);
        font-weight: 800;
      }

      .universe-content {
        min-width: 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
      }

      .universe-info {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .universe-title {
        font-size: 18px;
        font-weight: 800;
        line-height: 1.25;
      }

      .universe-meta {
        font-size: 13px;
        color: var(--text-soft);
      }

      .progress-circle {
        width: 54px;
        height: 54px;
        border-radius: 999px;
        border: 3px solid var(--accent);
        display: grid;
        place-items: center;
        font-size: 12px;
        font-weight: 800;
        color: var(--text);
        flex-shrink: 0;
      }

      .empty-state {
        padding: 28px;
        border-radius: 20px;
        border: 1px solid var(--border-soft);
        background: var(--surface);
        display: flex;
        flex-direction: column;
        gap: 10px;
        color: var(--text-soft);
      }

      .empty-title {
        color: var(--text);
        font-size: 18px;
        font-weight: 800;
      }

      .login-btn {
        width: fit-content;
        padding: 10px 16px;
        border-radius: 999px;
        background: var(--accent);
        color: #fff;
        font-weight: 700;
      }

      @media (min-width: 768px) {
        .grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 520px) {
        .universe-card {
          grid-template-columns: 78px 1fr;
        }

        .universe-cover {
          width: 78px;
          height: 112px;
        }

        .progress-circle {
          width: 46px;
          height: 46px;
          font-size: 11px;
        }
      }
    </style>

    <section class="page">
      <div>
        <div class="title">Вселенные</div>
        <div class="subtitle">
          Связанные книги, фильмы, сериалы, аниме и манга из твоей библиотеки.
        </div>
      </div>

      <div class="empty-state">
        <div class="empty-title">Загружаем вселенные…</div>
      </div>
    </section>
  `;

  if (!userId) {
    renderGuest(root);
    return;
  }

  try {
    const universes = await getUserUniverses(userId);

    const container = root.querySelector(".page");

    if (!universes.length) {
      container.innerHTML = `
        <div>
          <div class="title">Вселенные</div>
          <div class="subtitle">
            Добавь несколько связанных произведений, например книгу и фильм одной серии.
          </div>
        </div>

        <div class="empty-state">
          <div class="empty-title">Пока нет вселенных</div>
          <div class="empty-text">
            Вселенные появятся, когда в библиотеке будут произведения с общим миром или серией.
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div>
        <div class="title">Вселенные</div>
        <div class="subtitle">
          Найдено ${escapeHtml(String(universes.length))} связанных групп.
        </div>
      </div>

      <div class="grid">
        ${universes.map(renderCard).join("")}
      </div>
    `;

    root.querySelectorAll("[data-key]").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigate("/universe", { id: btn.dataset.key });
      });
    });
  } catch (error) {
    console.error("Universes load error:", error);

    root.querySelector(".page").innerHTML = `
      <div>
        <div class="title">Вселенные</div>
      </div>

      <div class="empty-state">
        <div class="empty-title">Ошибка загрузки</div>
        <div class="empty-text">Не удалось загрузить вселенные.</div>
      </div>
    `;
  }
}
