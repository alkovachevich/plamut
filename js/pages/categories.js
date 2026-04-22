import { CATEGORIES, CATEGORY_ICONS, ROUTES } from "../config.js";
import { navigate } from "../router.js";
import { openSearchModal } from "../state.js";

function renderCategoryIcon(categoryKey) {
  return CATEGORY_ICONS[categoryKey] || "•";
}

export function renderCategoriesPage(root) {
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
        letter-spacing: -0.03em;
      }

      .page-add-button {
        min-height: 46px;
        padding: 0 16px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        background: linear-gradient(135deg, var(--accent), var(--accent-strong));
        color: #fff;
        font-weight: 700;
        box-shadow: var(--shadow);
      }

      .page-add-button__plus {
        font-size: 20px;
        line-height: 1;
      }

      .categories-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .category-card {
        min-height: 132px;
        padding: 18px;
        border-radius: 22px;
        border: 1px solid var(--border);
        background: linear-gradient(
          180deg,
          var(--bg-elevated),
          color-mix(in srgb, var(--bg-elevated) 92%, black)
        );
        box-shadow: var(--shadow);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        text-align: left;
      }

      .category-card__icon {
        width: 56px;
        height: 56px;
        border-radius: 18px;
        display: grid;
        place-items: center;
        font-size: 26px;
        background: var(--accent-soft);
      }

      .category-card__title {
        font-size: 18px;
        font-weight: 800;
        line-height: 1.2;
      }

      .category-card__text {
        margin-top: 6px;
        color: var(--text-soft);
        font-size: 14px;
        line-height: 1.45;
      }

      @media (min-width: 768px) {
        .categories-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
    </style>

    <section class="page">
      <div class="page-header">
        <div class="page-title">Категории</div>

        <button class="page-add-button" type="button" data-action="add">
          <span class="page-add-button__plus">+</span>
          <span>Добавить</span>
        </button>
      </div>

      <section class="categories-grid">
        ${CATEGORIES.map((category) => `
          <button
            class="category-card"
            type="button"
            data-category="${category.key}"
            aria-label="Открыть ${category.title}"
          >
            <div class="category-card__icon">${renderCategoryIcon(category.key)}</div>

            <div>
              <div class="category-card__title">${category.title}</div>
              <div class="category-card__text">${category.description}</div>
            </div>
          </button>
        `).join("")}
      </section>
    </section>
  `;

  root.querySelector('[data-action="add"]')?.addEventListener("click", () => {
    openSearchModal("");
  });

  root.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.category;
      navigate(ROUTES.CATEGORY_LIBRARY, { category });
    });
  });
}
