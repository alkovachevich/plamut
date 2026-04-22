import { escapeHtml } from "../utils.js";
import { navigate } from "../router.js";
import { CATEGORY_LABELS } from "../config.js";

/* =========================
   MOCK FETCH (пока без БД)
========================= */

function parseKey(key = "") {
  const parts = key.split(":");
  return {
    category: parts[0],
    source: parts[1],
    id: parts[2]
  };
}

async function fetchEntity(params) {
  const { key, category } = params;

  if (!key) return null;

  const parsed = parseKey(key);

  // Пока просто возвращаем минимальную структуру
  return {
    canonical_key: key,
    category: category || parsed.category,
    title: `Объект ${parsed.id}`,
    original_title: `Original ${parsed.id}`,
    year: 2020,
    cover_url: "",
    description: "Описание будет подтягиваться позже из API или базы данных."
  };
}

/* =========================
   RENDER
========================= */

export async function renderCardPage(root, params = {}) {
  root.innerHTML = `
    <div style="padding:20px;">Загрузка...</div>
  `;

  const entity = await fetchEntity(params);

  if (!entity) {
    root.innerHTML = `<div style="padding:20px;">Не найдено</div>`;
    return;
  }

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
          <div class="title">${escapeHtml(entity.title)}</div>

          ${
            entity.original_title
              ? `<div class="subtitle">${escapeHtml(entity.original_title)}</div>`
              : ""
          }

          <div class="badge">
            ${escapeHtml(CATEGORY_LABELS[entity.category] || entity.category)}
          </div>

          <div class="actions">
            <button class="btn" data-action="add">Добавить</button>
            <button class="btn" data-action="relations">Связи</button>
          </div>
        </div>
      </div>

      <div class="description">
        ${escapeHtml(entity.description)}
      </div>
    </section>
  `;

  root.querySelector('[data-action="add"]')?.addEventListener("click", () => {
    alert("Добавление в библиотеку подключим следующим шагом");
  });

  root.querySelector('[data-action="relations"]')?.addEventListener("click", () => {
    alert("Связи/вселенные подключим следующим шагом");
  });
}
