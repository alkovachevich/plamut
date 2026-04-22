import { escapeHtml } from "../utils.js";
import { CATEGORY_LABELS } from "../config.js";
import { state, openAuthModal } from "../state.js";

import {
  getEntityByCanonicalKey,
  saveEntityIfMissing,
  addToUserLibrary,
  isAlreadyInUserLibrary
} from "../services/entity-db.js";

/* =========================
   HELPERS
========================= */

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

function getPayloadFromState(params = {}) {
  const current = state.currentItem;

  if (!current?.canonical_key) {
    return null;
  }

  if (params?.key && current.canonical_key !== params.key) {
    return null;
  }

  return current;
}

/* =========================
   LOAD ENTITY
========================= */

async function loadEntity(params) {
  const { key, category } = params || {};
  const statePayload = getPayloadFromState(params);

  if (key) {
    const fromDb = await getEntityByCanonicalKey(key);
    if (fromDb) return fromDb;
  }

  if (statePayload?.canonical_key) {
    return await saveEntityIfMissing({
      ...statePayload,
      category: statePayload.category || category
    });
  }

  return null;
}

/* =========================
   RENDER
========================= */

export async function renderCardPage(root, params = {}) {
  root.innerHTML = `
    <div style="padding:20px;">Загрузка...</div>
  `;

  let entity = null;

  try {
    entity = await loadEntity(params);
  } catch (error) {
    console.error("Card load error:", error);
  }

  if (!entity) {
    root.innerHTML = `<div style="padding:20px;">Не найдено</div>`;
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
        gap: 20px;
      }

      .card-header {
        display: flex;
        gap: 16px;
        align-items: flex-start;
      }

      .cover {
        width: 120px;
        min-width: 120px;
        height: 170px;
        border-radius: 16px;
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
        gap: 8px;
        min-width: 0;
      }

      .title {
        font-size: 22px;
        font-weight: 800;
        line-height: 1.25;
      }

      .subtitle {
        font-size: 14px;
        color: var(--text-soft);
        line-height: 1.4;
      }

      .badges {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .badge {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        font-size: 12px;
      }

      .actions {
        display: flex;
        gap: 10px;
        margin-top: 10px;
        flex-wrap: wrap;
      }

      .btn {
        padding: 10px 14px;
        border-radius: 12px;
        background: var(--surface);
        border: 1px solid var(--border);
        font-weight: 600;
        color: var(--text);
      }

      .btn.primary {
        background: var(--accent);
        color: #fff;
        border-color: transparent;
      }

      .btn.disabled {
        opacity: 0.6;
        pointer-events: none;
      }

      .description {
        line-height: 1.7;
        color: var(--text-soft);
        white-space: pre-wrap;
      }

      .empty-description {
        color: var(--text-soft);
      }

      @media (max-width: 640px) {
        .card-header {
          flex-direction: column;
        }

        .cover {
          width: 140px;
          min-width: 140px;
          height: 200px;
        }
      }
    </style>

    <section class="page">
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
              ${escapeHtml(CATEGORY_LABELS[entity.category] || entity.category)}
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

      <div class="${description ? "description" : "empty-description"}">
        ${
          description
            ? escapeHtml(description)
            : "Описание пока отсутствует."
        }
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
