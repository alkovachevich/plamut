import {
  runGlobalSearch,
  runCategorySearch,
  flattenResults,
  sortByScore,
  limitResults,
  addSearchResultDirectlyToLibrary
} from "../services/search-service.js";
import { SEARCH_LIMITS, getCategoryLabel } from "../config.js";
import { navigate } from "../router.js";
import {
  state,
  openAuthModal,
  setTemporaryCardItem
} from "../state.js";
import { debounce, escapeHtml, clampText } from "../utils.js";

let activeSearchPageRequestId = 0;

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
            item.original_title
              ? `<div class="result-subtitle">${escapeHtml(clampText(item.original_title, 100))}</div>`
              : ""
          }

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

function renderEmpty(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function attachCardHandlers(root, items = []) {
  const byKey = new Map(items.map((item) => [item.canonical_key, item]));

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
        console.error("Direct add from search page error:", error);
        button.disabled = false;
        button.textContent = "Ошибка";
      }
    });
  });
}

async function performSearch(resultsRoot, query, category = "") {
  if (!resultsRoot) return;

  const cleanQuery = String(query || "").trim();

  activeSearchPageRequestId += 1;
  const requestId = activeSearchPageRequestId;
  resultsRoot.dataset.requestId = String(requestId);

  if (cleanQuery.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    resultsRoot.innerHTML = renderEmpty("Введите больше символов");
    return;
  }

  resultsRoot.innerHTML = renderEmpty("Ищем…");

  try {
    const grouped = category
      ? { [category]: await runCategorySearch(cleanQuery, category) }
      : await runGlobalSearch(cleanQuery);

    if (
      resultsRoot.dataset.requestId !== String(requestId) ||
      requestId !== activeSearchPageRequestId
    ) {
      return;
    }

    const flat = limitResults(
      sortByScore(flattenResults(grouped)),
      SEARCH_LIMITS.PAGE_RESULTS
    );

    if (!flat.length) {
      resultsRoot.innerHTML = renderEmpty("Ничего не найдено");
      return;
    }

    resultsRoot.innerHTML = flat.map(renderCard).join("");
    attachCardHandlers(resultsRoot, flat);
  } catch (error) {
    console.error("Search page error:", error);

    if (
      resultsRoot.dataset.requestId !== String(requestId) ||
      requestId !== activeSearchPageRequestId
    ) {
      return;
    }

    resultsRoot.innerHTML = renderEmpty("Ошибка поиска");
  }
}

export function renderSearchPage(root, params = {}) {
  const initialQuery = params.q || state.searchQuery || "";
  const searchCategory = params.category || "";

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

      .search-input {
        width: 100%;
        min-height: 54px;
        border-radius: 16px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        padding: 0 16px;
        outline: none;
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
        gap: 10px;
        margin-top: 2px;
        font-size: 12px;
        color: var(--text-soft);
      }

      .badge {
        background: var(--accent-soft);
        padding: 4px 8px;
        border-radius: 999px;
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
        <div class="search-title">Поиск${searchCategory ? `: ${escapeHtml(getCategoryLabel(state.language, searchCategory))}` : ''}</div>

        <input
          class="search-input"
          type="text"
          value="${escapeHtml(initialQuery)}"
          placeholder="Поиск книг, фильмов, аниме, манги..."
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <div class="results-grid" data-results>
        ${renderEmpty("Введите запрос...")}
      </div>
    </section>
  `;

  const input = root.querySelector(".search-input");
  const resultsRoot = root.querySelector("[data-results]");

  const debouncedSearch = debounce((value) => {
    performSearch(resultsRoot, value, searchCategory);
  }, SEARCH_LIMITS.DEBOUNCE_MS);

  input?.addEventListener("input", () => {
    const value = input.value || "";
    debouncedSearch(value);
  });

  if (initialQuery && initialQuery.trim().length >= SEARCH_LIMITS.MIN_QUERY_LENGTH) {
    performSearch(resultsRoot, initialQuery, searchCategory);
  }
}
