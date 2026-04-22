import { CATEGORY_LABELS } from "../config.js";
import { navigate } from "../router.js";
import { setState, state } from "../state.js";
import { escapeHtml } from "../utils.js";
import { runGlobalSearch } from "../services/search-service.js";

let debounceTimer = null;
let requestCounter = 0;

function getCategoryOrder() {
  return ["books", "movies", "series", "anime", "manga"];
}

function getTotalCount(groupedResults) {
  return Object.values(groupedResults).reduce((sum, items) => sum + items.length, 0);
}

function renderEmptyState(query) {
  if (!query || query.trim().length < 2) {
    return 
      <div class="search-modal__empty">
        Начни вводить название, чтобы добавить что-то в библиотеку.
      </div>
    ;
  }

  return 
    <div class="search-modal__empty">
      Ничего не найдено. Можно будет добавить вручную на следующем шаге.
    </div>
  ;
}

function renderResultCard(item, compact = true) {
  const yearText = item.year ? <span class="search-result__year">${escapeHtml(String(item.year))}</span> : "";
  const categoryBadge = compact
    ? ""
    : <span class="search-result__badge">${escapeHtml(item.category_label || item.category)}</span>;

  return 
    <button class="search-result-card" type="button" data-add-key="${escapeHtml(item.canonical_key)}">
      <div class="search-result-card__cover">
        ${
          item.cover_url
            ? <img src="${escapeHtml(item.cover_url)}" alt="${escapeHtml(item.title)}" loading="lazy" />
            : <div class="search-result-card__cover-fallback">?</div>
        }

        <div class="search-result-card__overlay">
          <span class="search-result-card__overlay-button">Добавить</span>
        </div>
      </div>

      <div class="search-result-card__meta">
        <div class="search-result-card__title-row">
          <div class="search-result-card__title">${escapeHtml(item.title)}</div>
          ${yearText}
        </div>

        ${categoryBadge}
      </div>
    </button>
  ;
}

function renderGroupedResults(groupedResults) {
  const order = getCategoryOrder();
  const sections = order
    .filter((category) => (groupedResults[category] || []).length > 0)
    .map((category) => {
      const items = groupedResults[category];
      return 
        <section class="search-modal__group">
          <div class="search-modal__group-title">${escapeHtml(CATEGORY_LABELS[category])}</div>
          <div class="search-modal__group-list">
            ${items.map((item) => renderResultCard(item, true)).join("")}
          </div>
        </section>
      ;
    })
    .join("");

  return sections || "";
}

function attachAddHandlers(root) {
  root.querySelectorAll("[data-add-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.addKey;
      console.log("ADD ENTITY:", key);
      alert(Добавление будет подключено следующим шагом.\n\n${key});
    });
  });
}

async function performSearch(root, query) {
  const resultRoot = root.querySelector("[data-search-results]");
  const currentRequestId = ++requestCounter;

  if (!resultRoot) return;

  resultRoot.innerHTML = <div class="search-modal__loading">Ищем…</div>;

  try {
    const groupedResults = await runGlobalSearch(query);

    if (currentRequestId !== requestCounter) return;

    const totalCount = getTotalCount(groupedResults);

    if (!totalCount) {
      resultRoot.innerHTML = renderEmptyState(query);
      return;
    }

    resultRoot.innerHTML = 
      ${renderGroupedResults(groupedResults)}

      <div class="search-modal__footer">
        <button class="secondary-button" type="button" data-action="show-all">
          Показать все
        </button>
      </div>
    ;

    attachAddHandlers(resultRoot);

    resultRoot.querySelector('[data-action="show-all"]')?.addEventListener("click", () => {
sessionStorage.setItem("plamut_search_query", query);
      setState({ searchModalOpen: false });
      navigate("/placeholder");
      sessionStorage.setItem("plamut_placeholder_title", "Все результаты поиска");
      sessionStorage.setItem(
        "plamut_placeholder_text",
        "На следующем шаге подключим отдельную страницу поиска со всеми результатами, бейджами категорий и статусом «уже добавлено»."
      );
    });
  } catch (error) {
    console.error(error);
    resultRoot.innerHTML = 
      <div class="search-modal__empty">
        Не удалось выполнить поиск. Попробуй ещё раз.
      </div>
    ;
  }
}

export function renderSearchModal(root) {
  const isOpen = Boolean(state.searchModalOpen);

  root.innerHTML = 
    <div class="search-modal-overlay ${isOpen ? "is-open" : ""}">
      <div class="search-modal-panel" role="dialog" aria-modal="true" aria-label="Поиск">
        <div class="search-modal__header">
          <div class="search-modal__title">Добавить</div>
          <button class="icon-button" type="button" data-action="close" aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div class="search-modal__searchbox">
          <input
            class="search-modal__input"
            type="text"
            value="${escapeHtml(state.searchQuery || "")}"
            placeholder="Искать книги, фильмы, аниме, мангу…"
            autocomplete="off"
            spellcheck="false"
          />
        </div>

        <div class="search-modal__results" data-search-results>
          ${renderEmptyState(state.searchQuery || "")}
        </div>
      </div>
    </div>
  ;

  const overlay = root.querySelector(".search-modal-overlay");
  const input = root.querySelector(".search-modal__input");
  const closeButton = root.querySelector('[data-action="close"]');

  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) {
      setState({ searchModalOpen: false });
    }
  });

  closeButton?.addEventListener("click", () => {
    setState({ searchModalOpen: false });
  });

  if (input) {
    if (isOpen) {
      setTimeout(() => input.focus(), 0);
    }

    input.addEventListener("input", () => {
      const value = input.value;
      setState({ searchQuery: value });

      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        performSearch(root, value);
      }, 320);
    });

    if ((state.searchQuery || "").trim().length >= 2 && isOpen) {
      performSearch(root, state.searchQuery);
    }
  }
}
