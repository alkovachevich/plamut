import { CATEGORY_LABELS } from "../config.js";
import { navigate } from "../router.js";
import { openSearchModal } from "../state.js";
import { escapeHtml } from "../utils.js";

export function renderCategoryPage(root, params = {}) {
  const category = params.category || "unknown";
  const title = CATEGORY_LABELS[category] || category;

  root.innerHTML = `
    <style>
      .page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .page-title {
        font-size: 28px;
        font-weight: 800;
      }

      .add-btn {
        padding: 10px 16px;
        border-radius: 999px;
        background: var(--accent);
        color: #fff;
        font-weight: 700;
      }

      .empty-state {
        padding: 40px 20px;
        text-align: center;
        color: var(--text-soft);
        border: 1px solid var(--border);
        border-radius: 18px;
        background: var(--surface);
      }
    </style>

    <section class="page">
      <div class="page-header">
        <div class="page-title">${escapeHtml(title)}</div>
        <button class="add-btn" data-action="add">+ Добавить</button>
      </div>

      <div class="empty-state">
        Здесь пока ничего нет 😟
      </div>
    </section>
  `;

  root.querySelector('[data-action="add"]')?.addEventListener("click", () => {
    openSearchModal("");
  });
}
