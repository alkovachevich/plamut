import { escapeHtml } from "../utils.js";
import { getCategoryLabel } from "../config.js";
import {
  state,
  openAuthModal,
  getTemporaryCardItem,
  clearTemporaryCardItem
} from "../state.js";

import {
  getEntityByCanonicalKey,
  addToUserLibrary,
  isAlreadyInUserLibrary
} from "../services/entity-db.js";

function resolveDescription(entity) {
  return (
    entity?.description_ru ||
    entity?.description_en ||
    entity?.description ||
    ""
  );
}

function resolveTitle(entity) {
  return (
    entity?.title_primary ||
    entity?.title ||
    entity?.original_title ||
    ""
  );
}

async function loadEntity(params = {}) {
  const { key, category } = params || {};

  if (key) {
    try {
      const fromDb = await getEntityByCanonicalKey(key);
      if (fromDb) {
        clearTemporaryCardItem();
        return fromDb;
      }
    } catch (error) {
      console.warn("DB card load skipped:", error);
    }
  }

  const temp = getTemporaryCardItem();

  if (temp?.canonical_key && (!key || temp.canonical_key === key)) {
    return {
      ...temp,
      category: temp.category || category
    };
  }

  return null;
}

export async function renderCardPage(root, params = {}) {
  root.innerHTML = `
    <div style="padding:20px;color:var(--text-soft);">Загрузка...</div>
  `;

  let entity = null;

  try {
    entity = await loadEntity(params);
  } catch (error) {
    console.error("Card load error:", error);
  }

  if (!entity) {
    root.innerHTML = `<div style="padding:20px;color:var(--text-soft);">Не найдено</div>`;
    return;
  }

  const userId = state.user?.id;
  let alreadyAdded = false;

  try {
    if (userId && entity.id) {
      alreadyAdded = await isAlreadyInUserLibrary(userId, entity.id);
    }
  } catch (e) {
    console.warn("Library check error:", e);
  }

  const title = resolveTitle(entity);
  const description = resolveDescription(entity);

  root.innerHTML = `
    <style>
      .page {
        display: flex;
        flex-direction: column;
        gap: 22px;
      }

      .card-shell {
        background: var(--bg-elevated);
        border: 1px solid var(--border-soft);
        border-radius: 24px;
        padding: 18px;
      }

      .card-header {
        display: flex;
        gap: 18px;
        align-items: flex-start;
      }

      .cover {
        width: 124px;
        min-width: 124px;
        height: 180px;
        border-radius: 18px;
        background: var(--bg-soft);
        overflow: hidden;
        border: 1px solid var(--border);
      }

      .cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .cover-fallback {
        display: grid;
        place-items: center;
        height: 100%;
        color: var(--text-soft);
        font-size: 24px;
        font-weight: 700;
      }

      .meta {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
      }

      .title {
        font-size: 24px;
        font-weight: 800;
        line-height: 1.22;
        color: var(--text);
      }

      .subtitle {
        font-size: 14px;
        color: var(--text-soft);
        line-height: 1.45;
      }

      .badges {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .badge {
        display: inline-block;
        padding: 7px 11px;
        border-radius: 999px;
        background: var(--accent-soft);
        font-size: 12px;
        color: var(--text);
      }

      .actions {
        display: flex;
        gap: 10px;
        margin-top: 8px;
        flex-wrap: wrap;
      }

      .btn {
        padding: 11px 16px;
        border-radius: 14px;
        background: var(--surface);
        border: 1px solid var(--border);
        font-weight: 700;
        color: var(--text);
      }

      .btn.primary {
        background: var(--accent);
        color: #fff;
        border-color: transparent;
      }

      .btn.disabled {
        opacity: 0.65;
        pointer-events: none;
      }

      .description-block {
        background: var(--surface);
        border: 1px solid var(--border-soft);
        border-radius: 18px;
        padding: 16px;
      }

      .description-title {
        font-size: 14px;
        font-weight: 800;
        color: var(--text);
        margin-bottom: 10px;
      }

      .description {
        line-height: 1.75;
        color: var(--text-soft);
        white-space: pre-wrap;
      }

      .empty-description {
        color: var(--text-soft);
      }
    </style>

    <section class="page">
      <div class="card-shell">
        <div class="card-header">
          <div class="cover">
            ${
              entity.cover_url
                ? `<img src="${escapeHtml(entity.cover_url)}" alt="${escapeHtml(title)}" />`
                : `<div class="cover-fallback">?</div>`
            }
          </div>

          <div class="meta">
            <div class="title">${escapeHtml(title)}</div>

            ${
              entity.original_title && entity.original_title !== title
                ? `<div class="subtitle">${escapeHtml(entity.original_title)}</div>`
                : ""
            }

            <div class="badges">
              <div class="badge">
                ${escapeHtml(getCategoryLabel(state.language, entity.category))}
              </div>

              ${
                entity.year
                  ? `<div class="badge">${escapeHtml(String(entity.year))}</div>`
                  : ""
              }
            </div>

            <div class="actions">
              <button
                class="btn primary ${alreadyAdded ? "disabled" : ""}"
                data-action="add"
                type="button"
              >
                ${alreadyAdded ? "Уже в библиотеке" : "Добавить"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="description-block">
        <div class="description-title">Описание</div>
        <div class="${description ? "description" : "empty-description"}">
          ${description ? escapeHtml(description) : "Описание пока отсутствует."}
        </div>
      </div>
    </section>
  `;

  const addBtn = root.querySelector('[data-action="add"]');

  addBtn?.addEventListener("click", async () => {
    const currentUserId = state.user?.id;

    if (!currentUserId) {
      openAuthModal("login");
      return;
    }

    try {
      addBtn.classList.add("disabled");
      addBtn.textContent = "Добавление...";

      const result = await addToUserLibrary({
        userId: currentUserId,
        entity
      });

      if (result?.entity?.canonical_key) {
        clearTemporaryCardItem();
      }

      if (result?.alreadyExists) {
        addBtn.textContent = "Уже в библиотеке";
      } else {
        addBtn.textContent = "Добавлено";
      }
    } catch (error) {
      console.error("Add to library error:", error);
      addBtn.classList.remove("disabled");
      addBtn.textContent = "Ошибка";
    }
  });
}
