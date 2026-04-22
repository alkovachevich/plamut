import { navigate } from "../router.js";
import { ROUTES } from "../config.js";


export function renderHomePage(root) {
  root.innerHTML = `
    <section class="page">
      <section class="page-section placeholder-card">
        <div class="home-title-row">
          <div>
            <div class="brand-title">Plamut</div>
            <button class="brand-share" type="button" data-action="share">
              Поделиться библиотекой
            </button>
          </div>


          <button class="inline-add-button" type="button" aria-label="Добавить" data-action="add">
            +
          </button>
        </div>
      </section>


      <section class="page-section action-card-grid">
        <button class="action-card" type="button" data-route="/categories">
          <div class="action-card__icon">📚</div>
          <div>
            <div class="action-card__title">Библиотека</div>
            <div class="action-card__text">Категории и коллекции</div>
          </div>
        </button>


        <button class="action-card" type="button" data-route="/placeholder" data-title="NFC">
          <div class="action-card__icon">📡</div>
          <div>
            <div class="action-card__title">NFC</div>
            <div class="action-card__text">Скоро появится</div>
          </div>
        </button>


        <button class="action-card" type="button" data-route="/placeholder" data-title="Tracker">
          <div class="action-card__icon">📊</div>
          <div>
            <div class="action-card__title">Трекер</div>
            <div class="action-card__text">Прогресс и статистика</div>
          </div>
        </button>
      </section>
    </section>
  `;


  root.querySelector('[data-action="add"]')?.addEventListener("click", () => {
    navigate(ROUTES.PLACEHOLDER);
    sessionStorage.setItem("plamut_placeholder_title", "Добавление и поиск");
    sessionStorage.setItem(
      "plamut_placeholder_text",
      "На следующем шаге подключим глобальный поиск, модальное окно добавления и выдачу по категориям."
    );
  });


  root.querySelector('[data-action="share"]')?.addEventListener("click", () => {
    navigate(ROUTES.PLACEHOLDER);
    sessionStorage.setItem("plamut_placeholder_title", "Поделиться библиотекой");
    sessionStorage.setItem(
      "plamut_placeholder_text",
      "Здесь будет публичная карточка, предпросмотр и быстрые действия для шаринга."
    );
  });


  root.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      const title = button.dataset.title || "";
      if (title) {
        sessionStorage.setItem("plamut_placeholder_title", title);
        sessionStorage.setItem(
          "plamut_placeholder_text",
          title === "NFC"
            ? "Внутри этого раздела пока будет только заглушка «Скоро появится»."
            : "На этом экране позже появится полноценная логика."
        );
      }
      navigate(button.dataset.route);
    });
  });
}
