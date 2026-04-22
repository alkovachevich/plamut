import { navigate } from "../router.js";
import { ROUTES } from "../config.js";


const categories = [
  { key: "books", title: "Books", icon: "📚" },
  { key: "movies", title: "Movies", icon: "🎬" },
  { key: "series", title: "Series", icon: "📺" },
  { key: "anime", title: "Anime", icon: "🌸" },
  { key: "manga", title: "Manga", icon: "📖" }
];


export function renderCategoriesPage(root) {
  root.innerHTML = `
    <section class="page">
      <section class="page-section">
        <div class="placeholder-title">Категории</div>
      </section>


      <section class="page-section action-card-grid">
        ${categories.map((category) => `
          <button class="action-card" type="button" data-category="${category.key}">
            <div class="action-card__icon">${category.icon}</div>
            <div>
              <div class="action-card__title">${category.title}</div>
              <div class="action-card__text">Открыть библиотеку категории</div>
            </div>
          </button>
        `).join("")}
      </section>


      <section class="page-section">
        <button class="primary-button" type="button" data-action="add-category">
          + Добавить
        </button>
      </section>
    </section>
  `;


  root.querySelector('[data-action="add-category"]')?.addEventListener("click", () => {
    navigate(ROUTES.PLACEHOLDER);
    sessionStorage.setItem("plamut_placeholder_title", "Поиск внутри категории");
    sessionStorage.setItem(
      "plamut_placeholder_text",
      "На следующем шаге подключим поиск по конкретной категории и библиотеку этой категории."
    );
  });


  root.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.category;
      navigate(ROUTES.PLACEHOLDER);
      sessionStorage.setItem("plamut_placeholder_title", `Категория: ${category}`);
      sessionStorage.setItem(
        "plamut_placeholder_text",
        "Здесь будет экран библиотеки категории: обложки, папки, сортировка и действия через меню."
      );
    });
  });
}
