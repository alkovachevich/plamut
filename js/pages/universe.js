import { navigate } from "../router.js";
import { state, openAuthModal } from "../state.js";
import { escapeHtml, clampText, safeArray } from "../utils.js";
import { getCategoryLabel } from "../config.js";
import { getUniverseDetailsFromDb } from "../services/universe-db.js";

function resolveTitle(entity = {}) {
  return (
    entity.title_primary ||
    entity.title_ru ||
    entity.title_en ||
    entity.original_title ||
    "Без названия"
  );
}

function getCover(entity = {}) {
  const cover = entity.cover_url || "";
  if (!cover || cover === "undefined" || cover === "null") return "";
  return cover;
}

function getUniverseKey(params = {}) {
  return params.id || params.key || params.universeKey || "";
}

function sortLinks(items = [], mode = "release") {
  return [...safeArray(items)].sort((a, b) => {
    const aOrder =
      mode === "story"
        ? a.story_order ?? a.release_order ?? a.branch_order ?? 9999
        : mode === "branch"
          ? a.branch_order ?? a.story_order ?? a.release_order ?? 9999
          : a.release_order ?? a.story_order ?? a.branch_order ?? 9999;

    const bOrder =
      mode === "story"
        ? b.story_order ?? b.release_order ?? b.branch_order ?? 9999
        : mode === "branch"
          ? b.branch_order ?? b.story_order ?? b.release_order ?? 9999
          : b.release_order ?? b.story_order ?? b.branch_order ?? 9999;

    if (Number(aOrder) !== Number(bOrder)) return Number(aOrder) - Number(bOrder);

    const ay = Number(a.media_entities?.year || 0);
    const by = Number(b.media_entities?.year || 0);
    if (ay && by && ay !== by) return ay - by;

    return resolveTitle(a.media_entities).localeCompare(resolveTitle(b.media_entities), "ru");
  });
}

function groupLinks(links = [], view = "branch") {
  const map = new Map();
  const list = safeArray(links);

  if (view === "release" || view === "story") {
    return [
      {
        title: view === "story" ? "Хронология событий" : "Порядок выхода",
        items: sortLinks(list, view)
      }
    ];
  }

  list.forEach((link) => {
    let key = "Общее";

    if (view === "branch") key = link.branch_title || "Без ветки";
    if (view === "continuity") key = link.continuity_title || "Без линии";

    if (!map.has(key)) map.set(key, []);
    map.get(key).push(link);
  });

  return Array.from(map.entries()).map(([title, items]) => ({
    title,
    items: sortLinks(items, view === "branch" ? "branch" : "release")
  }));
}

function renderCover(entity = {}) {
  const cover = getCover(entity);
  const title = resolveTitle(entity);

  if (cover) {
    return `
      <img
        src="${escapeHtml(cover)}"
        alt="${escapeHtml(title)}"
        loading="lazy"
        onerror="this.style.display='none';this.parentElement.classList.add('is-empty');"
      />
    `;
  }

  return `<div class="item-cover-fallback">?</div>`;
}

function renderItem(link, index) {
  const entity = link.media_entities || {};
  const title = resolveTitle(entity);

  return `
    <button
      class="timeline-item"
      type="button"
      data-key="${escapeHtml(entity.canonical_key || "")}"
      data-category="${escapeHtml(entity.category || "")}"
    >
      <div class="timeline-index">${escapeHtml(String(index + 1))}</div>

      <div class="item-cover">
        ${renderCover(entity)}
      </div>

      <div class="item-meta">
        <div class="item-title">${escapeHtml(clampText(title, 90))}</div>

        ${
          entity.original_title && entity.original_title !== title
            ? `<div class="item-subtitle">${escapeHtml(clampText(entity.original_title, 90))}</div>`
            : ""
        }

        <div class="item-badges">
          <span>${escapeHtml(getCategoryLabel(state.language, entity.category || ""))}</span>
          ${entity.year ? `<span>${escapeHtml(String(entity.year))}</span>` : ""}
          ${link.branch_title ? `<span>${escapeHtml(link.branch_title)}</span>` : ""}
          ${link.continuity_title ? `<span>${escapeHtml(link.continuity_title)}</span>` : ""}
        </div>
      </div>
    </button>
  `;
}

function renderGroups(groups = []) {
  return safeArray(groups)
    .map(
      (group) => `
        <section class="universe-group">
          <div class="section-title">${escapeHtml(group.title)}</div>
          <div class="timeline">
            ${safeArray(group.items).map((item, index) => renderItem(item, index)).join("")}
          </div>
        </section>
      `
    )
    .join("");
}

function renderStyles() {
  return `
    <style>
      .page {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding-bottom: 32px;
      }

      .hero {
        border-radius: 24px;
        border: 1px solid var(--border-soft);
        background: var(--bg-elevated);
        padding: 18px;
        display: grid;
        grid-template-columns: 96px 1fr;
        gap: 16px;
        align-items: center;
      }

      .hero-cover {
        width: 96px;
        height: 138px;
        border-radius: 18px;
        overflow: hidden;
        background: var(--surface);
        border: 1px solid var(--border-soft);
      }

      .hero-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .hero-cover-fallback {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: var(--text-soft);
        font-size: 28px;
        font-weight: 850;
      }

      .hero-meta {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .title {
        font-size: 28px;
        font-weight: 900;
        line-height: 1.15;
        color: var(--text);
        letter-spacing: -0.02em;
      }

      .description {
        color: var(--text-soft);
        font-size: 15px;
        line-height: 1.5;
        max-width: 760px;
      }

      .stats {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .stat {
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--text);
        font-size: 12px;
        font-weight: 700;
      }

      .view-switch {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        background: var(--bg-soft);
        padding: 5px;
        border-radius: 18px;
        border: 1px solid var(--border-soft);
        width: fit-content;
      }

      .view-btn {
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 13px;
        color: var(--text-soft);
        background: transparent;
      }

      .view-btn.is-active {
        background: var(--surface);
        color: var(--text);
        box-shadow: 0 1px 0 rgba(255,255,255,.04) inset;
      }

      .universe-group {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .section-title {
        font-size: 18px;
        font-weight: 850;
        color: var(--text);
      }

      .timeline {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 12px;
      }

      .timeline-item {
        min-width: 0;
        display: grid;
        grid-template-columns: 32px 74px 1fr;
        gap: 10px;
        align-items: center;
        padding: 10px;
        border-radius: 18px;
        border: 1px solid var(--border-soft);
        background: var(--surface);
        color: var(--text);
        text-align: left;
        overflow: hidden;
      }

      .timeline-index {
        width: 32px;
        height: 32px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: var(--accent-soft);
        color: var(--text);
        font-size: 13px;
        font-weight: 850;
      }

      .item-cover {
        width: 74px;
        height: 106px;
        border-radius: 14px;
        overflow: hidden;
        background: var(--bg-soft);
        border: 1px solid var(--border-soft);
        flex-shrink: 0;
      }

      .item-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .item-cover.is-empty {
        display: grid;
        place-items: center;
      }

      .item-cover-fallback {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: var(--text-soft);
        font-weight: 850;
      }

      .item-meta {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .item-title {
        font-size: 14px;
        font-weight: 850;
        line-height: 1.3;
        color: var(--text);
      }

      .item-subtitle {
        color: var(--text-soft);
        font-size: 12px;
        line-height: 1.35;
      }

      .item-badges {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .item-badges span {
        font-size: 11px;
        color: var(--text-soft);
        background: var(--bg-soft);
        padding: 4px 7px;
        border-radius: 999px;
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
        font-weight: 850;
      }

      .login-btn {
        width: fit-content;
        padding: 10px 16px;
        border-radius: 999px;
        background: var(--accent);
        color: #fff;
        font-weight: 750;
      }

      @media (max-width: 720px) {
        .hero {
          grid-template-columns: 82px 1fr;
          align-items: flex-start;
          padding: 14px;
          border-radius: 20px;
        }

        .hero-cover {
          width: 82px;
          height: 118px;
          border-radius: 15px;
        }

        .title {
          font-size: 23px;
        }

        .view-switch {
          width: 100%;
        }

        .timeline {
          grid-template-columns: 1fr;
        }

        .timeline-item {
          grid-template-columns: 28px 62px 1fr;
        }

        .timeline-index {
          width: 28px;
          height: 28px;
          font-size: 12px;
        }

        .item-cover {
          width: 62px;
          height: 90px;
        }
      }
    </style>
  `;
}

function renderGuest(root) {
  root.innerHTML = `
    ${renderStyles()}

    <section class="page">
      <div class="empty-state">
        <div class="empty-title">Нужно войти</div>
        <div>Вселенные доступны после входа в аккаунт.</div>
        <button class="login-btn" type="button" data-action="login">Войти</button>
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

    <section class="page">
      <div class="empty-state">
        <div class="empty-title">Загружаем вселенную…</div>
      </div>
    </section>
  `;
}

function renderNotFound(root, text = "Вселенная не найдена") {
  root.innerHTML = `
    ${renderStyles()}

    <section class="page">
      <div class="empty-state">
        <div class="empty-title">${escapeHtml(text)}</div>
        <div>Эта вселенная пока не найдена в базе Plamut.</div>
      </div>
    </section>
  `;
}

function renderError(root) {
  root.innerHTML = `
    ${renderStyles()}

    <section class="page">
      <div class="empty-state">
        <div class="empty-title">Ошибка загрузки</div>
        <div>Не удалось открыть вселенную.</div>
      </div>
    </section>
  `;
}

function bindItems(root) {
  root.querySelectorAll("[data-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.key || "";
      const category = button.dataset.category || "";

      if (!key) return;

      navigate("/card", {
        key,
        category
      });
    });
  });
}

function renderPage(root, { universe, links, view }) {
  const groups = groupLinks(links, view);
  const cover =
    universe.cover_url ||
    safeArray(links).find((link) => link.media_entities?.cover_url)?.media_entities?.cover_url ||
    "";

  const entityCount = new Set(
    safeArray(links)
      .map((link) => Number(link.entity_id || link.media_entities?.id || 0))
      .filter(Boolean)
  ).size;

  const branchCount = new Set(
    safeArray(links)
      .map((link) => link.branch_key)
      .filter(Boolean)
  ).size;

  const continuityCount = new Set(
    safeArray(links)
      .map((link) => link.continuity_key)
      .filter(Boolean)
  ).size;

  root.innerHTML = `
    ${renderStyles()}

    <section class="page">
      <div class="hero">
        <div class="hero-cover">
          ${
            cover
              ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(universe.title || "Universe")}" loading="lazy" />`
              : `<div class="hero-cover-fallback">U</div>`
          }
        </div>

        <div class="hero-meta">
          <div class="title">${escapeHtml(universe.title || universe.universe_key || "Вселенная")}</div>

          ${
            universe.description
              ? `<div class="description">${escapeHtml(clampText(universe.description, 240))}</div>`
              : `<div class="description">Связанная структура произведений из базы Plamut.</div>`
          }

          <div class="stats">
            <span class="stat">${escapeHtml(String(entityCount))} элементов</span>
            <span class="stat">${escapeHtml(String(branchCount))} веток</span>
            <span class="stat">${escapeHtml(String(continuityCount))} линий</span>
          </div>
        </div>
      </div>

      <div class="view-switch">
        <button class="view-btn ${view === "branch" ? "is-active" : ""}" data-view="branch" type="button">Ветки</button>
        <button class="view-btn ${view === "continuity" ? "is-active" : ""}" data-view="continuity" type="button">Линии</button>
        <button class="view-btn ${view === "release" ? "is-active" : ""}" data-view="release" type="button">Выход</button>
        <button class="view-btn ${view === "story" ? "is-active" : ""}" data-view="story" type="button">Сюжет</button>
      </div>

      <div data-groups-root>
        ${renderGroups(groups)}
      </div>
    </section>
  `;

  bindItems(root);
}

export async function renderUniversePage(root, params = {}) {
  const userId = state.user?.id;
  const universeKey = getUniverseKey(params);

  if (!userId) {
    renderGuest(root);
    return;
  }

  if (!universeKey) {
    renderNotFound(root, "Нет ключа вселенной");
    return;
  }

  renderLoading(root);

  try {
    const { universe, links } = await getUniverseDetailsFromDb({
      universeKey
    });

    if (!universe) {
      renderNotFound(root);
      return;
    }

    let view = "branch";

    const rerender = () => {
      renderPage(root, {
        universe,
        links,
        view
      });

      root.querySelectorAll("[data-view]").forEach((button) => {
        button.addEventListener("click", () => {
          view = button.dataset.view || "branch";
          rerender();
        });
      });
    };

    rerender();
  } catch (error) {
    console.warn("Universe details error:", error);
    renderError(root);
  }
}
