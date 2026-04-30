import { navigate } from "../router.js";
import { state, openAuthModal } from "../state.js";
import { escapeHtml, clampText, safeArray } from "../utils.js";
import { getCategoryLabel, STATUS_LABELS } from "../config.js";
import { getRelationLabel } from "../services/universe-service.js";
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

function sortEntries(entries = [], mode = "release") {
  return [...safeArray(entries)].sort((a, b) => {
    const ai = a.item || a;
    const bi = b.item || b;

    const aOrder = mode === "story"
      ? ai.story_order ?? ai.release_order ?? 9999
      : ai.release_order ?? ai.story_order ?? 9999;

    const bOrder = mode === "story"
      ? bi.story_order ?? bi.release_order ?? 9999
      : bi.release_order ?? bi.story_order ?? 9999;

    if (Number(aOrder) !== Number(bOrder)) return Number(aOrder) - Number(bOrder);

    const ay = Number(ai.media_entities?.year || 0);
    const by = Number(bi.media_entities?.year || 0);
    if (ay && by && ay !== by) return ay - by;

    return resolveTitle(ai.media_entities || {}).localeCompare(
      resolveTitle(bi.media_entities || {}),
      "ru"
    );
  });
}

function groupItems(items = [], relations = [], viewMode = "release") {
  const list = safeArray(items);

  if (viewMode === "arc") {
    const groups = new Map();

    list.forEach((item) => {
      const key = item.arc || "Без саги";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ item, relation: null });
    });

    return Array.from(groups.entries()).map(([title, entries]) => ({
      title,
      entries: sortEntries(entries, "release")
    }));
  }

  if (viewMode === "branch") {
    const groups = new Map();

    list.forEach((item) => {
      const key = item.phase || "Без ветки";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ item, relation: null });
    });

    return Array.from(groups.entries()).map(([title, entries]) => ({
      title,
      entries: sortEntries(entries, "story")
    }));
  }

  if (viewMode === "relation") {
    const byId = new Map(list.map((item) => [Number(item.media_entities?.id), item]));
    const groups = new Map();

    safeArray(relations).forEach((rel) => {
      const target = byId.get(Number(rel.to_entity_id));
      if (!target) return;

      const title = getRelationLabel(rel.relation_type || "related_work") || "Связанное";
      if (!groups.has(title)) groups.set(title, []);

      groups.get(title).push({
        item: target,
        relation: rel
      });
    });

    if (!groups.size) {
      groups.set("Связанное", list.map((item) => ({ item, relation: null })));
    }

    return Array.from(groups.entries()).map(([title, entries]) => ({
      title,
      entries: sortEntries(
        entries.filter(
          (entry, index, arr) =>
            index === arr.findIndex((x) => x.item.media_entities?.id === entry.item.media_entities?.id)
        ),
        "release"
      )
    }));
  }

  return [
    {
      title: viewMode === "story" ? "Хронология событий" : "Порядок выхода",
      entries: sortEntries(list.map((item) => ({ item, relation: null })), viewMode)
    }
  ];
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

function renderItem(entry, index) {
  const item = entry.item || entry;
  const relation = entry.relation || null;
  const entity = item.media_entities || {};
  const title = resolveTitle(entity);
  const status = STATUS_LABELS[item.status] || item.status || "";
  const relationLabel = relation ? getRelationLabel(relation.relation_type) : "";
  const storyNote = item.metadata_json?.story_note || "";

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
          ${status ? `<span>${escapeHtml(status)}</span>` : ""}
          ${item.arc ? `<span>${escapeHtml(item.arc)}</span>` : ""}
          ${item.phase ? `<span>${escapeHtml(item.phase)}</span>` : ""}
          ${relationLabel ? `<span>${escapeHtml(relationLabel)}</span>` : ""}
        </div>

        ${storyNote ? `<div class="item-note">${escapeHtml(storyNote)}</div>` : ""}
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

      .view-switch {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        background: var(--bg-soft);
        padding: 4px;
        border-radius: 18px;
        border: 1px solid var(--border-soft);
        width: fit-content;
      }

      .view-btn {
        border-radius: 999px;
        padding: 7px 11px;
        font-size: 12px;
        color: var(--text-soft);
      }

      .view-btn.is-active {
        background: var(--surface);
        color: var(--text);
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

      .item-subtitle,
      .item-note {
        color: var(--text-soft);
        font-size: 13px;
        line-height: 1.35;
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

        .view-switch {
          width: 100%;
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
        <div class="empty-text">Вселенные строятся на основе базы Plamut.</div>
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
        <div class="empty-text">Эта вселенная пока не найдена в новой базе Plamut.</div>
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

function renderGroups(items = [], relations = [], viewMode = "release") {
  return groupItems(items, relations, viewMode)
    .map(
      (group) => `
        <div class="section-title">${escapeHtml(group.title)}</div>
        <div class="timeline">
          ${group.entries.map((entry, index) => renderItem(entry, index)).join("")}
        </div>
      `
    )
    .join("");
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
    const { universe, items, relations } = await getUniverseDetailsFromDb({
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

    const storyCount = items.filter((item) => item.story_order !== null && item.story_order !== undefined).length;
    const branchCount = new Set(items.map((item) => item.phase).filter(Boolean)).size;
    const arcCount = new Set(items.map((item) => item.arc).filter(Boolean)).size;

    let viewMode = "arc";

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
                : `<div class="description">Связанная структура произведений из базы Plamut.</div>`
            }

            <div class="stats">
              <span class="stat">${escapeHtml(String(items.length))} элементов</span>
              <span class="stat">${escapeHtml(String(relations.length))} связей</span>
              <span class="stat">${escapeHtml(String(arcCount))} саг</span>
              <span class="stat">${escapeHtml(String(branchCount))} веток</span>
              <span class="stat">${escapeHtml(String(storyCount))} в хронологии</span>
            </div>
          </div>
        </div>

        <div class="view-switch">
          <button class="view-btn is-active" data-view="arc" type="button">По сагам</button>
          <button class="view-btn" data-view="branch" type="button">По веткам</button>
          <button class="view-btn" data-view="release" type="button">По выходу</button>
          <button class="view-btn" data-view="story" type="button">По событиям</button>
          <button class="view-btn" data-view="relation" type="button">По связям</button>
        </div>

        <div data-groups-root>
          ${renderGroups(items, relations, viewMode)}
        </div>
      </section>
    `;

    bindItems(root);

    root.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        viewMode = button.dataset.view || "arc";

        root.querySelectorAll("[data-view]").forEach((node) => {
          node.classList.toggle("is-active", node === button);
        });

        const groupsRoot = root.querySelector("[data-groups-root]");
        if (groupsRoot) {
          groupsRoot.innerHTML = renderGroups(items, relations, viewMode);
          bindItems(root);
        }
      });
    });
  } catch (error) {
    console.warn("Universe details error:", error);
    renderError(root);
  }
}
