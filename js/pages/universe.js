import { navigate } from "../router.js";
import { state, openAuthModal } from "../state.js";
import { escapeHtml, clampText } from "../utils.js";
import { getCategoryLabel, STATUS_LABELS } from "../config.js";
import { getUniverseDetails, getRelationLabel } from "../services/universe-service.js";

function resolveTitle(entity = {}) {
  return (
    entity.title_primary ||
    entity.title_ru ||
    entity.title_en ||
    entity.original_title ||
    "Без названия"
  );
}

function renderCover(entity = {}) {
  if (entity.cover_url) {
    return `
      <img
        src="${escapeHtml(entity.cover_url)}"
        alt="${escapeHtml(resolveTitle(entity))}"
        loading="lazy"
      />
    `;
  }

  return `<div class="item-cover-fallback">?</div>`;
}

function findRelationForItem(seedEntityId, targetEntityId, relations = []) {
  return relations.find((rel) => {
    const from = Number(rel.from_entity_id);
    const to = Number(rel.to_entity_id);

    if (from === Number(seedEntityId) && to === Number(targetEntityId)) return true;
    if (to === Number(seedEntityId) && from === Number(targetEntityId)) return true;

    return false;
  });
}

function renderItem(item, index, relations = []) {
  const entity = item.media_entities || {};
  const title = resolveTitle(entity);
  const status = STATUS_LABELS[item.status] || item.status || "Planned";
  const relation = findRelationForItem(null, entity.id, relations);
  const relationLabel = relation ? getRelationLabel(relation.relation_type) : "Участник";

  return `
    <button
      class="timeline-item"
      type="button"
      data-key="${escapeHtml(entity.canonical_key || "")}"
      data-category="${escapeHtml(entity.category || item.category || "")}"
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
          <span>${escapeHtml(getCategoryLabel(state.language, entity.category))}</span>
          ${entity.year ? `<span>${escapeHtml(String(entity.year))}</span>` : ""}
          <span>${escapeHtml(status)}</span>
          <span>${escapeHtml(relationLabel)}</span>
        </div>
      </div>
    </button>
  `;
}

function renderGuest(root) {
  root.innerHTML = `
    <style>
      .page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .title {
        font-size: 28px;
        font-weight: 900;
        line-height: 1.15;
        color: var(--text);
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
    </style>

    <section class="page">
      <div class="title">Вселенная</div>

      <div class="empty-state">
        <div class="empty-title">Нужно войти</div>
        <div class="empty-text">Вселенные строятся на основе твоей библиотеки.</div>
        <button class="login-btn" type="button" data-action="login">Войти</button>
      </div>
    </section>
  `;

  root.querySelector('[data-action="login"]')?.addEventListener("click", () => {
    openAuthModal("login");
  });
}

export async function renderUniversePage(root, params = {}) {
  const userId = state.user?.id;
  const universeKey = params.id || params.key || "";

  root.innerHTML = `
    <style>
      .page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .hero {
        border-radius: 24px;
        border: 1px solid var(--border-soft);
        background: var(--bg-elevated);
        padding: 18px;
        display: flex;
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
        flex-shrink: 0;
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
        font-weight: 800;
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
      }

      .description {
        color: var(--text-soft);
        line-height: 1.55;
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
      }

      .section-title {
        font-size: 18px;
        font-weight: 800;
        color: var(--text);
      }

      .timeline {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .timeline-item {
        display: grid;
        grid-template-columns: 34px 74px 1fr;
        gap: 12px;
        align-items: center;
        padding: 10px;
        border-radius: 18px;
        border: 1px solid var(--border-soft);
        background: var(--surface);
        color: var(--text);
        text-align: left;
      }

      .timeline-index {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: var(--accent-soft);
        color: var(--text);
        font-size: 13px;
        font-weight: 800;
      }

      .item-cover {
        width: 74px;
        height: 106px;
        border-radius: 14px;
        overflow: hidden;
        background: var(--bg-soft);
        border: 1px solid var(--border-soft);
      }

      .item-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .item-cover-fallback {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: var(--text-soft);
        font-weight: 800;
      }

      .item-meta {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .item-title {
        font-weight: 800;
        line-height: 1.3;
      }

      .item-subtitle {
        color: var(--text-soft);
        font-size: 13px;
      }

      .item-badges {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .item-badges span {
        font-size: 12px;
        color: var(--text-soft);
        background: var(--bg-soft);
        padding: 4px 8px;
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

      @media (max-width: 640px) {
        .hero {
          align-items: flex-start;
        }

        .hero-cover {
          width: 82px;
          height: 118px;
        }

        .timeline-item {
          grid-template-columns: 28px 62px 1fr;
          gap: 10px;
        }

        .timeline-index {
          width: 28px;
          height: 28px;
        }

        .item-cover {
          width: 62px;
          height: 90px;
        }
      }
    </style>

    <section class="page">
      <div class="empty-state">
        <div class="empty-title">Загружаем вселенную…</div>
      </div>
    </section>
  `;

  if (!userId) {
    renderGuest(root);
    return;
  }

  if (!universeKey) {
    root.querySelector(".page").innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Вселенная не найдена</div>
        <div class="empty-text">Нет ключа вселенной.</div>
      </div>
    `;
    return;
  }

  try {
    const { universe, items, relations } = await getUniverseDetails({
      userId,
      universeKey
    });

    if (!universe || !items.length) {
      root.querySelector(".page").innerHTML = `
        <div class="empty-state">
          <div class="empty-title">Вселенная не найдена</div>
          <div class="empty-text">Добавь связанные произведения в библиотеку и построй вселенную из карточки.</div>
        </div>
      `;
      return;
    }

    const cover = universe.cover_url || items.find((item) => item.media_entities?.cover_url)?.media_entities?.cover_url || "";
    const done = items.filter((item) => item.status === "done").length;

    root.querySelector(".page").innerHTML = `
      <div class="hero">
        <div class="hero-cover">
          ${
            cover
              ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(universe.title)}" loading="lazy" />`
              : `<div class="hero-cover-fallback">U</div>`
          }
        </div>

        <div class="hero-meta">
          <div class="title">${escapeHtml(universe.title)}</div>

          ${
            universe.description
              ? `<div class="description">${escapeHtml(clampText(universe.description, 220))}</div>`
              : `<div class="description">Связанная структура произведений из твоей библиотеки.</div>`
          }

          <div class="stats">
            <span class="stat">${escapeHtml(String(items.length))} элементов</span>
            <span class="stat">готово ${escapeHtml(String(done))}</span>
          </div>
        </div>
      </div>

      <div class="section-title">Порядок / состав</div>

      <div class="timeline">
        ${items.map((item, index) => renderItem(item, index, relations)).join("")}
      </div>
    `;

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
  } catch (error) {
    console.error("Universe details error:", error);

    root.querySelector(".page").innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Ошибка загрузки</div>
        <div class="empty-text">Не удалось открыть вселенную.</div>
      </div>
    `;
  }
}
