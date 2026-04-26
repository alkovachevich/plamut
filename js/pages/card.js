import { escapeHtml, clampText } from "../utils.js";
import { getCategoryLabel, STATUS_LABELS } from "../config.js";
import { navigate } from "../router.js";
import {
  state,
  openAuthModal,
  getTemporaryCardItem,
  clearTemporaryCardItem
} from "../state.js";

import {
  getEntityByCanonicalKey,
  addToUserLibrary
} from "../services/entity-db.js";

import {
  buildUniverseForEntity,
  getRelatedItemsForEntity
} from "../services/universe-service.js";

import { getSupabaseClient, withRetry } from "../lib/supabase-client.js";
import { updateCachedLibraryItem } from "../services/library-cache.js";

function resolveTitle(entity = {}) {
  return (
    entity.title_primary ||
    entity.title_ru ||
    entity.title_en ||
    entity.original_title ||
    entity.title ||
    "Без названия"
  );
}

function resolveDescription(entity = {}) {
  return (
    entity.description_ru ||
    entity.description_en ||
    entity.description ||
    ""
  );
}

function getCover(entity = {}) {
  const cover = entity.cover_url || "";
  if (!cover || cover === "undefined" || cover === "null") return "";
  return cover;
}

async function loadEntity(params = {}) {
  const key = params.key || "";
  const temp = getTemporaryCardItem();

  if (temp?.canonical_key && (!key || temp.canonical_key === key)) {
    return temp;
  }

  if (key) {
    try {
      const fromDb = await withRetry(
        () => getEntityByCanonicalKey(key),
        "Загрузка карточки",
        { retries: 1 }
      );

      if (fromDb) {
        clearTemporaryCardItem();
        return fromDb;
      }
    } catch (error) {
      console.warn("DB card load skipped:", error);
    }
  }

  return temp || null;
}

async function loadUserMedia(userId, entityId) {
  if (!userId || !entityId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_media")
    .select("*")
    .eq("user_id", userId)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

function renderCover(entity = {}) {
  const title = resolveTitle(entity);
  const cover = getCover(entity);

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

  return `<div class="card-cover__fallback">?</div>`;
}

function renderStatusBadge(userMedia) {
  if (!userMedia?.status) return "";

  const label = STATUS_LABELS[userMedia.status] || userMedia.status;

  return `<span class="card-badge">${escapeHtml(label)}</span>`;
}

function renderFolderBadge(userMedia) {
  if (!userMedia?.folder_name) return "";

  return `<span class="card-badge folder">${escapeHtml(userMedia.folder_name)}</span>`;
}

function renderRelatedItem(item = {}) {
  const entity = item.media_entities || item;
  const title = resolveTitle(entity);
  const key = entity.canonical_key || "";
  const cover = getCover(entity);

  return `
    <button class="related-card" type="button" data-related="${escapeHtml(key)}">
      <div class="related-card__cover">
        ${
          cover
            ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(title)}" loading="lazy">`
            : `<div class="related-card__fallback">?</div>`
        }
      </div>
      <div class="related-card__body">
        <div class="related-card__title">${escapeHtml(clampText(title, 70))}</div>
        <div class="related-card__meta">
          ${escapeHtml(getCategoryLabel(state.language, entity.category || ""))}
          ${entity.year ? ` · ${escapeHtml(String(entity.year))}` : ""}
        </div>
      </div>
    </button>
  `;
}

function renderStyles() {
  return `
    <style>
      .card-page {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .card-shell {
        display: grid;
        grid-template-columns: 132px 1fr;
        gap: 16px;
        padding: 16px;
        border-radius: 22px;
        border: 1px solid var(--border-soft);
        background: var(--bg-elevated);
      }

      .card-cover {
        width: 132px;
        aspect-ratio: 2 / 3;
        overflow: hidden;
        border-radius: 16px;
        border: 1px solid var(--border-soft);
        background: var(--surface);
      }

      .card-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .card-cover.is-empty {
        display: grid;
        place-items: center;
      }

      .card-cover.is-empty::after,
      .card-cover__fallback {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: var(--text-soft);
        font-size: 28px;
        font-weight: 800;
      }

      .card-main {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .card-title {
        font-size: 24px;
        line-height: 1.15;
        font-weight: 850;
        color: var(--text);
      }

      .card-subtitle {
        color: var(--text-soft);
        font-size: 14px;
        line-height: 1.4;
      }

      .card-badges {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .card-badge {
        display: inline-flex;
        align-items: center;
        min-height: 26px;
        padding: 5px 9px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--text);
        font-size: 12px;
      }

      .card-badge.folder {
        background: var(--bg-soft);
      }

      .card-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .card-btn {
        min-height: 42px;
        padding: 10px 14px;
        border-radius: 999px;
        font-weight: 750;
        background: var(--bg-soft);
        color: var(--text);
        border: 1px solid var(--border-soft);
      }

      .card-btn.primary {
        background: var(--accent);
        color: #fff;
        border-color: transparent;
      }

      .card-btn:disabled {
        opacity: 0.55;
        cursor: default;
      }

      .card-status {
        min-height: 20px;
        font-size: 13px;
        color: var(--text-soft);
      }

      .card-section {
        padding: 16px;
        border-radius: 18px;
        border: 1px solid var(--border-soft);
        background: var(--surface);
      }

      .card-section__title {
        font-size: 17px;
        font-weight: 850;
        color: var(--text);
        margin-bottom: 10px;
      }

      .card-description {
        color: var(--text-soft);
        font-size: 15px;
        line-height: 1.55;
        white-space: pre-line;
      }

      .related-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
        gap: 12px;
      }

      .related-card {
        display: grid;
        grid-template-columns: 54px 1fr;
        gap: 10px;
        align-items: center;
        padding: 8px;
        border-radius: 14px;
        border: 1px solid var(--border-soft);
        background: var(--bg-elevated);
        color: var(--text);
        text-align: left;
      }

      .related-card__cover {
        width: 54px;
        height: 76px;
        border-radius: 10px;
        overflow: hidden;
        background: var(--surface);
      }

      .related-card__cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .related-card__fallback {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: var(--text-soft);
      }

      .related-card__body {
        min-width: 0;
      }

      .related-card__title {
        font-size: 14px;
        font-weight: 750;
        line-height: 1.3;
      }

      .related-card__meta {
        margin-top: 4px;
        font-size: 12px;
        color: var(--text-soft);
      }

      .card-empty {
        padding: 20px;
        border-radius: 18px;
        background: var(--surface);
        border: 1px solid var(--border-soft);
        color: var(--text-soft);
      }

      @media (max-width: 640px) {
        .card-shell {
          grid-template-columns: 104px 1fr;
          gap: 12px;
          padding: 12px;
          border-radius: 18px;
        }

        .card-cover {
          width: 104px;
          border-radius: 14px;
        }

        .card-title {
          font-size: 20px;
        }

        .card-actions {
          flex-direction: column;
        }

        .card-btn {
          width: 100%;
        }

        .related-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  `;
}

function renderNotFound(root) {
  root.innerHTML = `
    ${renderStyles()}
    <div class="card-empty">Карточка не найдена.</div>
  `;
}

function renderLoading(root) {
  root.innerHTML = `
    ${renderStyles()}
    <div class="card-empty">Загрузка карточки…</div>
  `;
}

function renderCard(root, { entity, userMedia, relatedItems }) {
  const title = resolveTitle(entity);
  const description = resolveDescription(entity);
  const categoryLabel = getCategoryLabel(state.language, entity.category || "");
  const originalTitle = entity.original_title && entity.original_title !== title
    ? entity.original_title
    : "";

  root.innerHTML = `
    ${renderStyles()}

    <section class="card-page">
      <div class="card-shell">
        <div class="card-cover">
          ${renderCover(entity)}
        </div>

        <div class="card-main">
          <div>
            <div class="card-title">${escapeHtml(title)}</div>
            ${
              originalTitle
                ? `<div class="card-subtitle">${escapeHtml(originalTitle)}</div>`
                : ""
            }
          </div>

          <div class="card-badges">
            <span class="card-badge">${escapeHtml(categoryLabel)}</span>
            ${entity.year ? `<span class="card-badge">${escapeHtml(String(entity.year))}</span>` : ""}
            ${renderStatusBadge(userMedia)}
            ${renderFolderBadge(userMedia)}
          </div>

          <div class="card-actions">
            <button class="card-btn primary" type="button" data-action="add">
              ${userMedia ? "В библиотеке" : "Добавить"}
            </button>

            <button class="card-btn" type="button" data-action="build">
              Построить вселенную
            </button>
          </div>

          <div class="card-status" data-status></div>
        </div>
      </div>

      <div class="card-section">
        <div class="card-section__title">Описание</div>
        <div class="card-description">
          ${description ? escapeHtml(description) : "Описание отсутствует"}
        </div>
      </div>

      <div class="card-section" data-related-section ${relatedItems.length ? "" : "hidden"}>
        <div class="card-section__title">Связанные</div>
        <div class="related-grid" data-related-grid>
          ${relatedItems.map(renderRelatedItem).join("")}
        </div>
      </div>
    </section>
  `;
}

function bindRelated(root) {
  root.querySelectorAll("[data-related]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.related || "";
      if (!key) return;

      navigate("/card", {
        key
      });
    });
  });
}

export async function renderCardPage(root, params = {}) {
  renderLoading(root);

  const entity = await loadEntity(params);

  if (!entity) {
    renderNotFound(root);
    return;
  }

  const userId = state.user?.id;
  let userMedia = null;
  let relatedItems = [];

  try {
    if (userId && entity.id) {
      userMedia = await loadUserMedia(userId, entity.id);

      if (userMedia?.id) {
        relatedItems = await getRelatedItemsForEntity({
          userId,
          entityId: entity.id
        }).catch(() => []);
      }
    }
  } catch (error) {
    console.warn("Card library state skipped:", error);
  }

  renderCard(root, {
    entity,
    userMedia,
    relatedItems
  });

  const statusNode = root.querySelector("[data-status]");
  const addButton = root.querySelector('[data-action="add"]');
  const buildButton = root.querySelector('[data-action="build"]');

  bindRelated(root);

  addButton?.addEventListener("click", async () => {
    if (!userId) {
      openAuthModal("login");
      return;
    }

    try {
      addButton.disabled = true;
      statusNode.textContent = "Добавляем…";

      const result = await addToUserLibrary({
        userId,
        entity
      });

      userMedia = result.userMedia || userMedia;

      updateCachedLibraryItem(userId, {
        ...userMedia,
        media_entities: result.entity || entity
      });

      statusNode.textContent = result.alreadyExists
        ? "Уже есть в библиотеке"
        : "Добавлено в библиотеку";

      addButton.textContent = "В библиотеке";
    } catch (error) {
      console.error("Add to library error:", error);
      statusNode.textContent = "Ошибка добавления";
      addButton.disabled = false;
    }
  });

  buildButton?.addEventListener("click", async () => {
    if (!userId) {
      openAuthModal("login");
      return;
    }

    if (!entity.id) {
      statusNode.textContent = "Сначала добавь карточку в библиотеку";
      return;
    }

    try {
      buildButton.disabled = true;
      statusNode.textContent = "Строим связи…";

      const result = await buildUniverseForEntity({
        userId,
        entityId: entity.id
      });

      if (result?.universe?.universe_key) {
        navigate("/universe", {
          id: result.universe.universe_key
        });
        return;
      }

      statusNode.textContent = "Связи построены";
      buildButton.disabled = false;
    } catch (error) {
      console.error("Build universe error:", error);
      statusNode.textContent = "Ошибка построения";
      buildButton.disabled = false;
    }
  });
}
