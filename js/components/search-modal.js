import { SEARCH_LIMITS, getCategoryLabel } from "../config.js";
import { navigate } from "../router.js";
import {
  state,
  closeSearchModal,
  openAuthModal,
  setTemporaryCardItem
} from "../state.js";
import { debounce, escapeHtml } from "../utils.js";
import {
  runGlobalSearch,
  runCategorySearch,
  flattenResults,
  sortByScore,
  limitResults,
  addSearchResultDirectlyToLibrary
} from "../services/search-service.js";

let activeSearchRequestId = 0;

function getTotalCount(groupedResults) {
  if (!groupedResults) return 0;
  return Object.values(groupedResults).reduce((sum, items) => sum + (items?.length || 0), 0);
}

function renderEmpty(query) {
  if (!query || query.trim().length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    return `
      <div class="search-modal__empty">
        Начни вводить название, чтобы найти и добавить что-то в библиотеку.
      </div>
    `;
  }

  return `
    <div class="search-modal__empty">
      Ничего не найдено. Попробуй изменить запрос.
    </div>
  `;
}

function getBookAuthors(item = {}) {
  return (
    item?.meta?.author_names ||
    item?.meta?.authors ||
    item?.authors ||
    []
  ).filter(Boolean);
}

function getBookSeriesName(item = {}) {
  return (
    item?.meta?.series_name ||
    item?.meta?.series ||
    item?.series_name ||
    ""
  );
}

function renderCover(item) {
  if (item.category === "books") {
    return "";
  }

  if (item.cover_url) {
    return `
      <img
        src="${escapeHtml(item.cover_url)}"
        alt="${escapeHtml(item.title || "")}"
        loading="lazy"
        onerror="this.style.display='none';this.parentElement.classList.add('is-empty');"
      />
    `;
  }

  return `<div class="search-result-card__cover-fallback">?</div>`;
}

function renderBookExtraMeta(item) {
  if (item.category !== "books") return "";

  const authors = getBookAuthors(item);
  const seriesName = getBookSeriesName(item);

  return `
    ${
      authors.length
        ? `<div class="search-result-card__subtitle">Автор: ${escapeHtml(authors.join(", "))}</div>`
        : ""
    }

    ${
      seriesName
        ? `<div class="search-result-card__series">Часть серии: ${escapeHtml(seriesName)}</div>`
        : ""
    }
  `;
}

function renderResultCard(item) {
  const isBook = item.category === "books";

  const year = item.year
    ? `<span class="search-result-card__year">${escapeHtml(String(item.year))}</span>`
    : "";

  return `
    <div class="search-result-card ${isBook ? "is-book" : ""}">
      <button
        class="search-result-card__main"
        type="button"
        data-card-key="${escapeHtml(item.canonical_key)}"
        data-card-category="${escapeHtml(item.category)}"
      >
        ${
          isBook
            ? ""
            : `
              <div class="search-result-card__cover">
                ${renderCover(item)}
              </div>
            `
        }

        <div class="search-result-card__meta">
          <div class="search-result-card__top">
            <div class="search-result-card__title">
              ${escapeHtml(item.title || "")}
            </div>
            ${year}
          </div>

          ${
            item.original_title && item.original_title !== item.title
              ? `<div class="search-result-card__subtitle">${escapeHtml(item.original_title)}</div>`
              : ""
          }

          ${renderBookExtraMeta(item)}

          <div class="search-result-card__category">
            ${escapeHtml(getCategoryLabel(state.language, item.category))}
          </div>
        </div>
      </button>

      <button
        class="search-result-card__add"
        type="button"
        data-add-key="${escapeHtml(item.canonical_key)}"
      >
        Добавить
      </button>
    </div>
  `;
}

function renderGroups(groupedResults, forcedCategory = "") {
  const orderedCategories = ["books", "movies", "series", "anime", "manga"];

  return orderedCategories
    .filter((category) => {
      if (forcedCategory && category !== forcedCategory) return false;
      return groupedResults?.[category]?.length;
    })
    .map((category) => `
      <section class="search-modal__group">
        <div class="search-modal__group-title">
          ${escapeHtml(getCategoryLabel(state.language, category))}
        </div>

        <div class="search-modal__group-list">
          ${groupedResults[category].map(renderResultCard).join("")}
        </div>
      </section>
    `)
    .join("");
}

function buildItemsMap(groupedResults) {
  const flat = limitResults(
    sortByScore(flattenResults(groupedResults || {})),
    SEARCH_LIMITS.PAGE_RESULTS
  );

  return new Map(flat.map((item) => [item.canonical_key, item]));
}

function attachResultHandlers(root, groupedResults, currentQuery) {
  const itemsByKey = buildItemsMap(groupedResults);

  root.querySelectorAll("[data-card-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const canonicalKey = button.dataset.cardKey || "";
      const category = button.dataset.cardCategory || "";
      const item = itemsByKey.get(canonicalKey) || null;

      if (item) {
        setTemporaryCardItem(item);
      }

      closeSearchModal();

      navigate("/card", {
        key: canonicalKey,
        category,
        mode: "temp"
      });
    });
  });

  root.querySelectorAll("[data-add-key]").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.dataset.addKey || "";
      const item = itemsByKey.get(key);

      if (!item) return;

      const userId = state.user?.id;

      if (!userId) {
        openAuthModal("login");
        return;
      }

      try {
        button.disabled = true;
        button.textContent = "Добавляем…";

        const result = await addSearchResultDirectlyToLibrary({
          userId,
          item
        });

        button.textContent = result?.alreadyExists
          ? "Уже в библиотеке"
          : "Добавлено";
      } catch (error) {
        console.warn("Direct add error:", error);
        button.disabled = false;
        button.textContent = "Ошибка";
      }
    });
  });

  root.querySelector('[data-action="show-all"]')?.addEventListener("click", () => {
    closeSearchModal();

    const payload = { q: currentQuery || "" };

    if (state.searchContextCategory) {
      payload.category = state.searchContextCategory;
    }

    navigate("/search", payload);
  });
}

async function performSearch(root, query) {
  const resultsRoot = root.querySelector("[data-search-results]");
  if (!resultsRoot) return;

  const cleanQuery = String(query || "").trim();
  const contextCategory = String(state.searchContextCategory || "").trim();

  root.dataset.currentQuery = cleanQuery;

  activeSearchRequestId += 1;
  const requestId = activeSearchRequestId;
  root.dataset.requestId = String(requestId);

  if (!cleanQuery || cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    resultsRoot.innerHTML = renderEmpty(cleanQuery);
    return;
  }

  resultsRoot.innerHTML = `<div class="search-modal__loading">Ищем…</div>`;

  try {
    const groupedResults = contextCategory
      ? { [contextCategory]: await runCategorySearch(cleanQuery, contextCategory) }
      : await runGlobalSearch(cleanQuery);

    if (
      root.dataset.requestId !== String(requestId) ||
      requestId !== activeSearchRequestId
    ) {
      return;
    }

    const total = getTotalCount(groupedResults);

    if (!total) {
      resultsRoot.innerHTML = renderEmpty(cleanQuery);
      return;
    }

    resultsRoot.innerHTML = `
      ${renderGroups(groupedResults, contextCategory)}

      <div class="search-modal__footer">
        <button class="search-modal__show-all" type="button" data-action="show-all">
          Показать все
        </button>
      </div>
    `;

    attachResultHandlers(resultsRoot, groupedResults, cleanQuery);
  } catch (error) {
    console.warn("Search modal error:", error);

    if (
      root.dataset.requestId !== String(requestId) ||
      requestId !== activeSearchRequestId
    ) {
      return;
    }

    resultsRoot.innerHTML = `
      <div class="search-modal__empty">
        Не удалось выполнить поиск. Попробуй ещё раз.
      </div>
    `;
  }
}

const debouncedSearch = debounce(performSearch, SEARCH_LIMITS.DEBOUNCE_MS);

export function renderSearchModal(root, options = {}) {
  const isOpen = state.searchModalOpen;
  const initialQuery = state.searchQuery || "";
  const contextCategory = options.category || state.searchContextCategory || "";

  root.innerHTML = `
    <style>
      .search-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(5, 10, 20, 0.62);
        z-index: 95;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }

      .search-modal-overlay.is-open {
        opacity: 1;
        pointer-events: auto;
      }

      .search-modal-panel {
        position: absolute;
        left: 50%;
        top: 50%;
        width: min(94vw, 840px);
        max-height: min(84vh, 860px);
        transform: translate(-50%, -50%) scale(0.98);
        transition: transform 0.2s ease;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        box-shadow: var(--shadow);
        border-radius: 28px;
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        overflow: hidden;
      }

      .search-modal-overlay.is-open .search-modal-panel {
        transform: translate(-50%, -50%) scale(1);
      }

      .search-modal__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .search-modal__title {
        font-size: 22px;
        font-weight: 800;
        color: var(--text);
      }

      .search-modal__close {
        width: 42px;
        height: 42px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--surface-strong);
        border: 1px solid var(--border);
        color: var(--text);
      }

      .search-modal__searchbox {
        display: flex;
      }

      .search-modal__input {
        width: 100%;
        min-height: 54px;
        border-radius: 18px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        padding: 0 16px;
        outline: none;
      }

      .search-modal__input::placeholder {
        color: var(--text-muted);
      }

      .search-modal__results {
        min-height: 220px;
        max-height: min(60vh, 640px);
        overflow: auto;
        padding-right: 4px;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .search-modal__loading,
      .search-modal__empty {
        min-height: 200px;
        display: grid;
        place-items: center;
        color: var(--text-soft);
        text-align: center;
        padding: 18px;
        background: var(--surface);
        border: 1px solid var(--border-soft);
        border-radius: 18px;
      }

      .search-modal__group {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .search-modal__group-title {
        font-size: 14px;
        font-weight: 800;
        color: var(--text-soft);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .search-modal__group-list {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }

      .search-modal__footer {
        padding-top: 4px;
      }

      .search-modal__show-all {
        min-height: 46px;
        padding: 0 16px;
        border-radius: 14px;
        font-weight: 700;
        background: var(--surface-strong);
        border: 1px solid var(--border);
        color: var(--text);
      }

      .search-result-card {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        align-items: center;
        border-radius: 18px;
        border: 1px solid var(--border-soft);
        background: var(--surface);
        padding: 10px;
      }

      .search-result-card__main {
        display: grid;
        grid-template-columns: 74px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
        text-align: left;
        background: transparent;
        color: var(--text);
      }

      .search-result-card.is-book .search-result-card__main {
        grid-template-columns: minmax(0, 1fr);
      }

      .search-result-card__add {
        min-width: 98px;
        min-height: 40px;
        border-radius: 12px;
        background: var(--accent);
        color: #fff;
        font-weight: 700;
        padding: 0 12px;
      }

      .search-result-card__add:disabled {
        opacity: 0.7;
        cursor: default;
      }

      .search-result-card__cover {
        width: 74px;
        height: 104px;
        border-radius: 14px;
        overflow: hidden;
        background: var(--bg-soft);
        border: 1px solid var(--border);
      }

      .search-result-card__cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .search-result-card__cover.is-empty {
        display: grid;
        place-items: center;
      }

      .search-result-card__cover-fallback {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: var(--text-muted);
        font-weight: 700;
      }

      .search-result-card__meta {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .search-result-card__top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }

      .search-result-card__title {
        font-size: 15px;
        font-weight: 700;
        line-height: 1.35;
        color: var(--text);
      }

      .search-result-card__subtitle {
        font-size: 13px;
        color: var(--text-soft);
        line-height: 1.4;
      }

      .search-result-card__series {
        width: fit-content;
        font-size: 12px;
        color: var(--text-soft);
        background: var(--accent-soft);
        padding: 4px 8px;
        border-radius: 999px;
      }

      .search-result-card__category {
        font-size: 12px;
        color: var(--text-muted);
      }

      .search-result-card__year {
        color: var(--text-soft);
        font-size: 13px;
        flex-shrink: 0;
      }

      @media (max-width: 640px) {
        .search-modal-panel {
          width: 96vw;
          max-height: 88vh;
          border-radius: 22px;
          padding: 14px;
        }

        .search-result-card {
          grid-template-columns: 1fr;
        }

        .search-result-card__add {
          width: 100%;
        }
      }
    </style>

    <div class="search-modal-overlay ${isOpen ? "is-open" : ""}">
      <div class="search-modal-panel" role="dialog" aria-modal="true" aria-label="Поиск">
        <div class="search-modal__header">
          <div class="search-modal__title">Добавить</div>
          <button class="search-modal__close" type="button" data-action="close" aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div class="search-modal__searchbox">
          <input
            class="search-modal__input"
            type="text"
            value="${escapeHtml(initialQuery)}"
            placeholder="Искать книги, фильмы, аниме, мангу…"
            autocomplete="off"
            spellcheck="false"
          />
        </div>

        <div class="search-modal__results" data-search-results>
          ${renderEmpty(initialQuery)}
        </div>
      </div>
    </div>
  `;

  const overlay = root.querySelector(".search-modal-overlay");
  const input = root.querySelector(".search-modal__input");

  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeSearchModal();
    }
  });

  root.querySelector('[data-action="close"]')?.addEventListener("click", () => {
    closeSearchModal();
  });

  if (!isOpen || !input) {
    return;
  }

  setTimeout(() => input.focus(), 0);

  input.addEventListener("input", () => {
    const value = input.value || "";
    debouncedSearch(root, value);
  });

  if (initialQuery.trim().length >= SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    performSearch(root, initialQuery);
  }
}
