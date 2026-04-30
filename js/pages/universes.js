import { navigate } from "../router.js";
import { state, openAuthModal } from "../state.js";
import { escapeHtml } from "../utils.js";
import { getUserUniversesFromDb } from "../services/universe-db.js";

function renderProgressCircle(progress = 0) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(progress || 0) * 100)));

  return `
    <div class="progress-circle" aria-label="Прогресс ${percent}%">
      <div class="progress-circle__value">${percent}%</div>
    </div>
  `;
}

function renderCover(universe = {}) {
  const title = universe.title || "Universe";

  if (universe.cover_url) {
    return `
      <img
        src="${escapeHtml(universe.cover_url)}"
        alt="${escapeHtml(title)}"
        loading="lazy"
        onerror="this.style.display='none';this.parentElement.classList.add('is-empty');"
      />
    `;
  }

  return `<div class="universe-cover__fallback">U</div>`;
}

function renderUniverseCard(universe = {}) {
  const key = universe.universe_key || "";
  const title = universe.title || "Без названия";
  const total = Number(universe.total || universe.items?.length || 0);
  const done = Number(universe.done || 0);
  const inLibrary = Number(universe.in_library_count ?? done);
  const notAdded = Number(universe.not_added_count ?? Math.max(0, total - inLibrary));
  const source = universe.source || "";
  const relationsCount = Number(universe.relations_count || 0);

  return `
    <button
      class="universe-card"
      type="button"
      data-universe-key="${escapeHtml(key)}"
      ${key ? "" : "disabled"}
    >
      <div class="universe-cover">
        ${renderCover(universe)}
      </div>

      <div class="universe-content">
        <div class="universe-main">
          <div class="universe-title">${escapeHtml(title)}</div>
          <div class="universe-meta">
            ${escapeHtml(String(total))} элементов · ${escapeHtml(String(relationsCount))} связей
          </div>
          <div class="universe-meta">
            В библиотеке ${escapeHtml(String(inLibrary))} · не добавлено ${escapeHtml(String(notAdded))}
          </div>
          ${
            source
              ? `<div class="universe-source">${escapeHtml(source === "manual" ? "БД" : source)}</div>`
              : ""
          }
        </div>

        <div class="universe-progress">
          ${renderProgressCircle(universe.progress)}
        </div>
      </div>
    </button>
  `;
}

function renderStyles() {
  return `
    <style>
      .universes-page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .universes-header {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .universes-title {
        font-size: 28px;
        line-height: 1.15;
        font-weight: 850;
        color: var(--text);
        letter-spacing: -0.02em;
      }

      .universes-subtitle {
        max-width: 680px;
        color: var(--text-soft);
        font-size: 15px;
        line-height: 1.5;
      }

      .universes-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 14px;
      }

      .universe-card {
        width: 100%;
        display: grid;
        grid-template-columns: 92px 1fr;
        gap: 14px;
        align-items: stretch;
        padding: 10px;
        border-radius: 22px;
        border: 1px solid var(--border-soft);
        background: var(--bg-elevated);
        color: var(--text);
        text-align: left;
        transition:
          transform 0.18s ease,
          border-color 0.18s ease,
          background 0.18s ease;
      }

      .universe-card:hover {
        transform: translateY(-2px);
        border-color: var(--border);
        background: var(--surface);
      }

      .universe-card:disabled {
        cursor: default;
        opacity: 0.65;
      }

      .universe-cover {
        width: 92px;
        height: 132px;
        overflow: hidden;
        border-radius: 16px;
        border: 1px solid var(--border-soft);
        background: var(--surface);
      }

      .universe-cover img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }

      .universe-cover.is-empty {
        display: grid;
        place-items: center;
      }

      .universe-cover.is-empty::after,
      .universe-cover__fallback {
        content: "U";
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: var(--text-soft);
        font-size: 24px;
        font-weight: 850;
      }

      .universe-content {
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .universe-main {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .universe-title {
        color: var(--text);
        font-size: 18px;
        font-weight: 800;
        line-height: 1.25;
        word-break: break-word;
      }

      .universe-meta,
      .universe-source {
        color: var(--text-soft);
        font-size: 13px;
        line-height: 1.4;
      }

      .universe-source {
        font-size: 12px;
      }

      .universe-progress {
        flex-shrink: 0;
      }

      .progress-circle {
        width: 54px;
        height: 54px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        border: 3px solid var(--accent);
        background: var(--accent-soft);
      }

      .progress-circle__value {
        color: var(--text);
        font-size: 12px;
        font-weight: 850;
      }

      .universes-empty {
        padding: 28px;
        border-radius: 20px;
        border: 1px solid var(--border-soft);
        background: var(--surface);
        display: flex;
        flex-direction: column;
        gap: 10px;
        color: var(--text-soft);
      }

      .universes-empty__title {
        color: var(--text);
        font-size: 18px;
        font-weight: 850;
      }

      .universes-empty__text {
        color: var(--text-soft);
        font-size: 14px;
        line-height: 1.5;
      }

      .universes-empty__actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 4px;
      }

      .universes-btn {
        width: fit-content;
        min-height: 42px;
        padding: 10px 16px;
        border-radius: 999px;
        background: var(--accent);
        color: #fff;
        font-weight: 750;
      }

      .universes-btn.secondary {
        background: var(--bg-soft);
        color: var(--text);
        border: 1px solid var(--border-soft);
      }

      @media (min-width: 768px) {
        .universes-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 520px) {
        .universes-page {
          gap: 16px;
        }

        .universes-title {
          font-size: 24px;
        }

        .universe-card {
          grid-template-columns: 78px 1fr;
          gap: 12px;
          border-radius: 18px;
          padding: 8px;
        }

        .universe-cover {
          width: 78px;
          height: 112px;
          border-radius: 14px;
        }

        .universe-title {
          font-size: 16px;
        }

        .progress-circle {
          width: 46px;
          height: 46px;
        }

        .progress-circle__value {
          font-size: 11px;
        }
      }
    </style>
  `;
}

function renderGuest(root) {
  root.innerHTML = `
    ${renderStyles()}

    <section class="universes-page">
      <div class="universes-header">
        <div class="universes-title">Вселенные</div>
        <div class="universes-subtitle">
          Связанные книги, фильмы, сериалы, аниме и манга строятся на основе базы Plamut.
        </div>
      </div>

      <div class="universes-empty">
        <div class="universes-empty__title">Нужно войти</div>
        <div class="universes-empty__text">
          Войди в аккаунт, чтобы Plamut смог показать вселенные.
        </div>
        <div class="universes-empty__actions">
          <button class="universes-btn" type="button" data-action="login">Войти</button>
        </div>
      </div>
    </section>
  `;

  root.querySelector('[data-action="login"]')?.addEventListener("click", () => {
    openAuthModal("login");
  });
}

function renderLoading(root) {
  root.innerHTML = `
    ${renderStyles()}

    <section class="universes-page">
      <div class="universes-header">
        <div class="universes-title">Вселенные</div>
        <div class="universes-subtitle">
          Читаем готовые вселенные из базы данных.
        </div>
      </div>

      <div class="universes-empty">
        <div class="universes-empty__title">Загружаем вселенные…</div>
        <div class="universes-empty__text">
          Используем новую БД без OpenAI-построения.
        </div>
      </div>
    </section>
  `;
}

function renderEmpty(root) {
  root.innerHTML = `
    ${renderStyles()}

    <section class="universes-page">
      <div class="universes-header">
        <div class="universes-title">Вселенные</div>
        <div class="universes-subtitle">
          Пока нет сохранённых вселенных в новой базе.
        </div>
      </div>

      <div class="universes-empty">
        <div class="universes-empty__title">Пока нет вселенных</div>
        <div class="universes-empty__text">
          Добавь первую эталонную вселенную в таблицу universes.
        </div>
        <div class="universes-empty__actions">
          <button class="universes-btn secondary" type="button" data-action="categories">
            Открыть категории
          </button>
        </div>
      </div>
    </section>
  `;

  root.querySelector('[data-action="categories"]')?.addEventListener("click", () => {
    navigate("/categories");
  });
}

function renderError(root) {
  root.innerHTML = `
    ${renderStyles()}

    <section class="universes-page">
      <div class="universes-header">
        <div class="universes-title">Вселенные</div>
      </div>

      <div class="universes-empty">
        <div class="universes-empty__title">Ошибка загрузки</div>
        <div class="universes-empty__text">
          Не удалось загрузить вселенные из новой БД.
        </div>
        <div class="universes-empty__actions">
          <button class="universes-btn secondary" type="button" data-action="categories">
            Открыть категории
          </button>
        </div>
      </div>
    </section>
  `;

  root.querySelector('[data-action="categories"]')?.addEventListener("click", () => {
    navigate("/categories");
  });
}

function bindUniverseCards(root) {
  root.querySelectorAll("[data-universe-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.universeKey || "";
      if (!key) return;

      navigate("/universe", {
        id: key
      });
    });
  });
}

export async function renderUniversesPage(root) {
  const userId = state.user?.id;

  if (!userId) {
    renderGuest(root);
    return;
  }

  renderLoading(root);

  try {
    const universes = await getUserUniversesFromDb();

    if (!universes.length) {
      renderEmpty(root);
      return;
    }

    root.innerHTML = `
      ${renderStyles()}

      <section class="universes-page">
        <div class="universes-header">
          <div class="universes-title">Вселенные</div>
          <div class="universes-subtitle">
            Найдено ${escapeHtml(String(universes.length))} готовых вселенных в БД.
          </div>
        </div>

        <div class="universes-grid">
          ${universes.map(renderUniverseCard).join("")}
        </div>
      </section>
    `;

    bindUniverseCards(root);
  } catch (error) {
    console.warn("Universes load error:", error);
    renderError(root);
  }
}
