import { navigate } from "../router.js";
import { state, openAuthModal } from "../state.js";
import { escapeHtml, clampText, safeArray } from "../utils.js";
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

function getCover(entity = {}) {
  const cover = entity.cover_url || "";
  if (!cover || cover === "undefined" || cover === "null") return "";
  return cover;
}


const GROUP_TITLES = {
  direct_sequel: "Прямые продолжения",
  direct_prequel: "Прямые продолжения",
  book_series: "Серия книг",
  adaptation: "Экранизации",
  source_material: "Экранизации",
  spin_off: "Спинофы",
  same_universe: "Одна вселенная",
  release_order: "Порядок выхода",
  story_chronology: "Хронология событий",
  related_work: "Связанное",
  alternate_version: "Связанное",
  reboot: "Связанное",
  remake: "Связанное"
};

function groupItemsByRelations(items = [], relations = [], seedId = null) {
  const byId = new Map(safeArray(items).map((item) => [Number(item.media_entities?.id), item]));
  const grouped = new Map();

  safeArray(relations).forEach((rel) => {
    if (seedId && Number(rel.from_entity_id) !== Number(seedId)) return;
    const target = byId.get(Number(rel.to_entity_id));
    if (!target) return;

    const key = rel.relation_type || 'related_work';
    const title = GROUP_TITLES[key] || 'Связанное';

    if (!grouped.has(title)) grouped.set(title, []);
    grouped.get(title).push({ item: target, relation: rel });
  });

  if (!grouped.size) {
    grouped.set('Связанное', safeArray(items).map((item) => ({ item, relation: null })));
  }

  return Array.from(grouped.entries()).map(([title, entries]) => ({
    title,
    entries: entries.filter((entry, idx, arr) => idx === arr.findIndex((x) => x.item.media_entities?.id === entry.item.media_entities?.id))
  })).filter((group) => group.entries.length);
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

function findRelationForItem(targetEntityId, relations = []) {
  return safeArray(relations)
    .filter((rel) => Number(rel.to_entity_id) === Number(targetEntityId))
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0] || null;
}

function renderItem(item, index, relation = null, relations = []) {
  const entity = item.media_entities || {};
  const title = resolveTitle(entity);
  const status = STATUS_LABELS[item.status] || item.status || "Planned";
  const relationInfo = relation || findRelationForItem(entity.id, relations);
  const relationLabel = relationInfo ? getRelationLabel(relationInfo.relation_type) : "Участник";

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
          <span>${escapeHtml(getCategoryLabel(state.language, entity.category || ""))}</span>
          ${entity.year ? `<span>${escapeHtml(String(entity.year))}</span>` : ""}
          <span>${escapeHtml(status)}</span>
          <span>${escapeHtml(relationLabel)}</span>
        </div>
      </div>
    </button>
  `;
}

function renderStyles() {
  return `
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
  `;
}

function renderGuest(root) {
  root.innerHTML = `
    ${renderStyles()}

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
        <div class="empty-text">Добавь связанные произведения в библиотеку и построй вселенную из карточки.</div>
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
        <div class="empty-text">Не удалось открыть вселенную.</div>
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

export async function renderUniversePage(root, params = {}) {
  const userId = state.user?.id;
  const universeKey = params.id || params.key || "";

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
    const { universe, items, relations } = await getUniverseDetails({
      userId,
      universeKey
    });

    if (!universe || !items.length) {
      renderNotFound(root);
      return;
    }

    const cover =
      universe.cover_url ||
      items.find((item) => item.media_entities?.cover_url)?.media_entities?.cover_url ||
      "";

    const done = items.filter((item) => item.status === "done").length;

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
                ? `<div class="description">${escapeHtml(clampText(universe.description, 220))}</div>`
                : `<div class="description">Связанная структура произведений из твоей библиотеки.</div>`
            }

            <div class="stats">
              <span class="stat">${escapeHtml(String(items.length))} элементов</span>
              <span class="stat">готово ${escapeHtml(String(done))}</span>
              ${relations.length ? `<span class="stat">${escapeHtml(String(relations.length))} связей</span>` : ""}
              ${universe.source ? `<span class="stat">${escapeHtml(universe.source === "openai" ? "OpenAI + БД" : "БД")}</span>` : ""}
            </div>
          </div>
        </div>

        ${groupItemsByRelations(items, relations, Number(universe?.metadata_json?.seed_entity_id || 0) || items[0]?.media_entities?.id)
          .map((group) => `
            <div class="section-title">${escapeHtml(group.title)}</div>
            <div class="timeline">
              ${group.entries.map((entry, index) => renderItem(entry.item, index, entry.relation, relations)).join("")}
            </div>
          `)
          .join("")}
      </section>
    `;

    bindItems(root);
  } catch (error) {
    console.warn("Universe details error:", error);
    renderError(root);
  }
}
