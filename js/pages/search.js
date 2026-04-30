// js/pages/search.js

import {
  runGlobalSearch,
  runCategorySearch,
  addSearchResultDirectlyToLibrary
} from "../services/search-service.js";
import { SEARCH_LIMITS, getCategoryLabel } from "../config.js";
import { navigate } from "../router.js";
import {
  state,
  openAuthModal,
  setTemporaryCardItem
} from "../state.js";
import { debounce, escapeHtml, clampText, safeArray } from "../utils.js";

let activeSearchPageRequestId = 0;

const SEARCH_CATEGORIES = ["", "books", "movies", "series", "anime", "manga"];

function getOrderedCategories(category = "") {
  if (category) return [category];
  return ["books", "movies", "series", "anime", "manga"];
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

  return `<div class="result-cover-fallback">?</div>`;
}

function renderBookExtraMeta(item = {}) {
  if (item.category !== "books") return "";

  const authors = getBookAuthors(item);
  const seriesName = getBookSeriesName(item);

  return `
    ${
      authors.length
        ? `<div class="result-subtitle">Автор: ${escapeHtml(authors.join(", "))}</div>`
        : ""
    }

    ${
      seriesName
        ? `<span class="badge">Часть серии: ${escapeHtml(seriesName)}</span>`
        : ""
    }
  `;
}

function renderCard(item) {
  return `
    <div class="result-card">
      <button
        class="result-card__main"
        type="button"
        data-key="${escapeHtml(item.canonical_key)}"
        data-category="${escapeHtml(item.category)}"
      >
        <div class="result-cover">
          ${renderCover(item)}
        </div>

        <div class="result-meta">
          <div class="result-top">
            <div class="result-title">
              ${escapeHtml(clampText(item.title || "", 90))}
            </div>

            ${
              item.year
                ? `<span class="result-year">${escapeHtml(String(item.year))}</span>`
                : ""
            }
          </div>

          ${
            item.original_title && item.original_title !== item.title
              ? `<div class="result-subtitle">${escapeHtml(clampText(item.original_title, 100))}</div>`
              : ""
          }

          ${renderBookExtraMeta(item)}

          <div class="result-footer">
            <span class="badge">${escapeHtml(getCategoryLabel(state.language, item.category))}</span>
          </div>
        </div>
      </button>

      <button class="result-add-btn" type="button" data-add-key="${escapeHtml(item.canonical_key)}">
        Добавить
      </button>
    </div>
  `;
}

function groupBooksBySeries(items = []) {
  const grouped = new Map();
  const singles = [];

  safeArray(items).forEach((item) => {
    const seriesName = getBookSeriesName(item);

    if (!seriesName) {
      singles.push(item);
      return;
    }

    if (!grouped.has(seriesName)) grouped.set(seriesName, []);
    grouped.get(seriesName).push(item);
  });

  return {
    series: Array.from(grouped.entries()).map(([seriesName, books]) => ({
      seriesName,
      books
    })),
    singles
  };
}

function renderBooksGroup(items = []) {
  const { series, singles } = groupBooksBySeries(items);

  return `
    ${series.map((entry) => `
      <section class="books-series-block">
        <div class="books-series-block__top">
          <div class="books-series-block__title">${escapeHtml(entry.seriesName)}</div>
          <div class="books-series-block__actions">
            <span class="badge">${escapeHtml(String(entry.books.length))}</span>
            <button
              class="result-add-btn is-series"
              type="button"
              data-add-series="${escapeHtml(entry.seriesName)}"
            >
              Добавить серию
            </button>
          </div>
        </div>
        <div class="books-series-block__list">
          ${entry.books.map(renderCard).join("")}
        </div>
      </section>
    `).join("")}

    ${singles.map(renderCard).join("")}
  `;
}

function renderEmpty(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function flattenGroupedResults(grouped = {}, category = "") {
  const categories = getOrderedCategories(category);
  const items = [];

  categories.forEach((key) => {
    (grouped?.[key] || []).forEach((item) => {
      items.push(item);
    });
  });

  return items;
}

function renderGroupedResults(grouped = {}, category = "") {
  const categories = getOrderedCategories(category)
    .filter((key) => grouped?.[key]?.length);

  if (!categories.length) {
    return renderEmpty("Ничего не найдено");
  }

  return categories
    .map((key) => `
      <section class="search-group">
        <div class="search-group__title">
          ${escapeHtml(getCategoryLabel(state.language, key))}
        </div>

        <div class="results-grid">
          ${key === "books" ? renderBooksGroup(grouped[key]) : grouped[key].map(renderCard).join("")}
        </div>
      </section>
    `)
    .join("");
}

function attachCardHandlers(root, items = []) {
  const byKey = new Map(items.map((item) => [item.canonical_key, item]));
  const booksBySeries = new Map();

  safeArray(items)
    .filter((item) => item.category === "books")
    .forEach((item) => {
      const series = getBookSeriesName(item);
      if (!series) return;

      if (!booksBySeries.has(series)) booksBySeries.set(series, []);
      booksBySeries.get(series).push(item);
    });

  root.querySelectorAll("[data-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.key || "";
      const category = button.dataset.category || "";
      const payload = byKey.get(key) || null;

      if (payload) {
        setTemporaryCardItem(payload);
      }

      navigate("/card", {
        key,
        category,
        mode: "temp"
      });
    });
  });

  root.querySelectorAll("[data-add-key]").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.dataset.addKey || "";
      const item = byKey.get(key);

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
        console.warn("Direct add from search page error:", error);
        button.disabled = false;
        button.textContent = "Ошибка";
      }
    });
  });

  root.querySelectorAll("[data-add-series]").forEach((button) => {
    button.addEventListener("click", async () => {
      const seriesName = button.dataset.addSeries || "";
      const seriesItems = booksBySeries.get(seriesName) || [];

      if (!seriesItems.length) return;

      const userId = state.user?.id;

      if (!userId) {
        openAuthModal("login");
        return;
      }

      try {
        button.disabled = true;
        button.textContent = "Добавляем…";

        await Promise.allSettled(
          seriesItems.map((item) =>
            addSearchResultDirectlyToLibrary({ userId, item })
          )
        );

        button.textContent = "Серия добавлена";
      } catch (error) {
        console.warn("Direct add series from search page error:", error);
        button.disabled = false;
        button.textContent = "Ошибка";
      }
    });
  });
}

async function performSearch(resultsRoot, query, category = "") {
  if (!resultsRoot) return;

  const cleanQuery = String(query || "").trim();
  const selectedCategory = String(category || "").trim();

  activeSearchPageRequestId += 1;
  const requestId = activeSearchPageRequestId;

  resultsRoot.dataset.requestId = String(requestId);

  if (cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    resultsRoot.innerHTML = renderEmpty("Введите больше символов");
    return;
  }

  resultsRoot.innerHTML = renderEmpty("Ищем…");

  try {
    const grouped = selectedCategory
      ? { [selectedCategory]: await runCategorySearch(cleanQuery, selectedCategory) }
      : await runGlobalSearch(cleanQuery);

    if (
      resultsRoot.dataset.requestId !== String(requestId) ||
      requestId !== activeSearchPageRequestId
    ) {
      return;
    }

    const flat = flattenGroupedResults(grouped, selectedCategory);

    if (!flat.length) {
      resultsRoot.innerHTML = renderEmpty("Ничего не найдено");
      return;
    }

    resultsRoot.innerHTML = renderGroupedResults(grouped, selectedCategory);
    attachCardHandlers(resultsRoot, flat);
  } catch (error) {
    console.warn("Search page error:", error);

    if (
      resultsRoot.dataset.requestId !== String(requestId) ||
      requestId !== activeSearchPageRequestId
    ) {
      return;
    }

    resultsRoot.innerHTML = renderEmpty("Ошибка поиска");
  }
}

function buildCategoryOptions(selectedCategory = "") {
  return SEARCH_CATEGORIES.map((category) => {
    const label = category ? getCategoryLabel(state.language, category) : "Все";

    return `
      <option value="${escapeHtml(category)}" ${category === selectedCategory ? "selected" : ""}>
        ${escapeHtml(label)}
      </option>
    `;
  }).join("");
}

export function renderSearchPage(root, params = {}) {
  const initialQuery = params.q || state.searchQuery || "";
  let searchCategory = String(params.category || "").trim();

  root.innerHTML = `
    <style>
      .page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .search-header {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .search-title {
        font-size: 28px;
        font-weight: 800;
        color: var(--text);
      }

      .search-controls {
        display: grid;
        grid-template-columns: minmax(120px, 190px) 1fr;
        gap: 10px;
      }

      .search-input,
      .search-category-select {
        width: 100%;
        min-height: 54px;
        border-radius: 16px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        padding: 0 16px;
        outline: none;
      }

      .search-results {
        display: flex;
        flex-direction: column;
        gap: 22px;
      }

      .search-group {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .search-group__title {
        font-size: 14px;
        font-weight: 800;
        color: var(--text-soft);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .results-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }

      .result-card {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        padding: 10px;
        border-radius: 16px;
        background: var(--surface);
        border: 1px solid var(--border);
      }

      .books-series-block {
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 12px;
        background: color-mix(in srgb, var(--surface) 86%, var(--accent-soft));
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .books-series-block__top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }

      .books-series-block__title {
        font-weight: 800;
      }

      .books-series-block__actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .books-series-block__list {
        display: grid;
        gap: 10px;
      }

      .result-card__main {
        display: grid;
        grid-template-columns: 84px 1fr;
        gap: 12px;
        text-align: left;
        color: var(--text);
        background: transparent;
      }

      .result-add-btn {
        min-width: 108px;
        min-height: 42px;
        border-radius: 12px;
        background: var(--accent);
        color: #fff;
        font-weight: 700;
        align-self: center;
        padding: 0 12px;
      }

      .result-add-btn:disabled {
        opacity: 0.7;
        cursor: default;
      }

      .result-cover {
        width: 84px;
        height: 118px;
        border-radius: 12px;
        overflow: hidden;
        background: var(--bg-soft);
      }

      .result-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .result-cover.is-empty {
        display: grid;
        place-items: center;
      }

      .result-cover-fallback {
        display: grid;
        place-items: center;
        height: 100%;
        color: var(--text-soft);
      }

      .result-meta {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        justify-content: center;
      }

      .result-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
      }

      .result-title {
        font-weight: 700;
        line-height: 1.35;
        color: var(--text);
      }

      .result-year {
        flex-shrink: 0;
        color: var(--text-soft);
        font-size: 13px;
      }

      .result-subtitle {
        font-size: 13px;
        color: var(--text-soft);
        line-height: 1.4;
      }

      .result-footer {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 2px;
        font-size: 12px;
        color: var(--text-soft);
      }

      .badge {
        width: fit-content;
        background: var(--accent-soft);
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 12px;
        color: var(--text-soft);
      }

      .empty {
        text-align: center;
        padding: 30px;
        color: var(--text-soft);
        border: 1px solid var(--border);
        border-radius: 18px;
        background: var(--surface);
      }

      @media (max-width: 640px) {
        .search-controls {
          grid-template-columns: 1fr;
        }

        .result-card {
          grid-template-columns: 1fr;
        }

        .result-add-btn {
          width: 100%;
        }
      }
    </style>

    <section class="page">
      <div class="search-header">
        <div class="search-title">
          Поиск${searchCategory ? `: ${escapeHtml(getCategoryLabel(state.language, searchCategory))}` : ""}
        </div>

        <div class="search-controls">
          <select class="search-category-select" data-search-category>
            ${buildCategoryOptions(searchCategory)}
          </select>

          <input
            class="search-input"
            data-search-input
            type="text"
            value="${escapeHtml(initialQuery)}"
            placeholder="Поиск книг, фильмов, аниме, манги..."
            autocomplete="off"
            spellcheck="false"
          />
        </div>
      </div>

      <div class="search-results" data-results>
        ${renderEmpty("Введите запрос...")}
      </div>
    </section>
  `;

  const input = root.querySelector("[data-search-input]");
  const categorySelect = root.querySelector("[data-search-category]");
  const resultsRoot = root.querySelector("[data-results]");
  const title = root.querySelector(".search-title");

  const runCurrentSearch = () => {
    const value = input?.value || "";
    performSearch(resultsRoot, value, searchCategory);
  };

  const debouncedSearch = debounce(() => {
    runCurrentSearch();
  }, SEARCH_LIMITS.DEBOUNCE_MS);

  input?.addEventListener("input", () => {
    debouncedSearch();
  });

  categorySelect?.addEventListener("change", () => {
    searchCategory = String(categorySelect.value || "").trim();

    if (title) {
      title.innerHTML = `Поиск${searchCategory ? `: ${escapeHtml(getCategoryLabel(state.language, searchCategory))}` : ""}`;
    }

    const value = input?.value || "";

    if (value.trim().length >= SEARCH_LIMITS.MIN_QUERY_LENGTH) {
      runCurrentSearch();
    } else if (resultsRoot) {
      resultsRoot.innerHTML = renderEmpty("Введите запрос...");
    }
  });

  if (initialQuery && initialQuery.trim().length >= SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    runCurrentSearch();
  }
}
