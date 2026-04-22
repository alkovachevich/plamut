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

/* =========================
   LOAD ENTITY
========================= */

async function loadEntity(params) {
  const { key, category, payload } = params || {};

  // 1. Пытаемся взять из БД
  if (key) {
    const fromDb = await getEntityByCanonicalKey(key);
    if (fromDb) return fromDb;
  }

  // 2. Если есть payload (из поиска) — сохраняем и возвращаем
  if (payload && payload.canonical_key) {
    return await saveEntityIfMissing({
      ...payload,
      category: payload.category || category
    });
  }

  // 3. fallback
  return null;
}

/* =========================
   RENDER
========================= */

export async function renderCardPage(root, params = {}) {
  root.innerHTML = `<div style="padding:20px;">Загрузка...</div>`;

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
      }

      .cover {
        width: 120px;
        height: 170px;
        border-radius: 16px;
        background: var(--bg-soft);
        overflow: hidden;
      }

      .cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .meta {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .title {
        font-size: 20px;
        font-weight: 800;
      }

      .subtitle {
        font-size: 14px;
        color: var(--text-soft);
      }

      .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        font-size: 12px;
      }

      .actions {
        display: flex;
        gap: 10px;
        margin-top: 10px;
      }

      .btn {
        padding: 10px 14px;
        border-radius: 12px;
        background: var(--surface);
        border: 1px solid var(--border);
        font-weight: 600;
      }

      .btn.primary {
        background: var(--accent);
        color: #fff;
      }

      .btn.disabled {
        opacity: 0.5;
        pointer-events: none;
      }

      .description {
        line-height: 1.6;
        color: var(--text-soft);
      }
    </style>

    <section class="page">
      <div class="card-header">
        <div class="cover">
          ${
            entity.cover_url
              ? `<img src="${escapeHtml(entity.cover_url)}" />`
              : `<div style="display:grid;place-items:center;height:100%;">?</div>`
          }
        </div>

        <div class="meta">
          <div class="title">${escapeHtml(title)}</div>

          ${
            entity.original_title
              ? `<div class="subtitle">${escapeHtml(entity.original_title)}</div>`
              : ""
          }

          <div class="badge">
            ${escapeHtml(CATEGORY_LABELS[entity.category] || entity.category)}
          </div>

          <div class="actions">
            <button class="btn primary ${
              alreadyAdded ? "disabled" : ""
            }" data-action="add">
              ${alreadyAdded ? "Уже в библиотеке" : "Добавить"}
            </button>
          </div>
        </div>
      </div>

      <div class="description">
        ${escapeHtml(description)}
      </div>
    </section>
  `;

  const addBtn = root.querySelector('[data-action="add"]');

  addBtn?.addEventListener("click", async () => {
    const userId = state.user?.id;

    if (!userId) {
      openAuthModal("login");
      return;
    }

    try {
      addBtn.classList.add("disabled");
      addBtn.textContent = "Добавление...";

      const result = await addToUserLibrary({
        userId,
        entity
      });

      if (result.alreadyExists) {
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
