import { runGlobalSearch, flattenResults } from "../services/search-service.js";
import { CATEGORY_LABELS, SEARCH_LIMITS } from "../config.js";
import { navigate } from "../router.js";
import { setSearchQuery } from "../state.js";
import { debounce, escapeHtml } from "../utils.js";

function renderCover(item) {
  if (item.cover_url) {
    return `
      <img
        src="${escapeHtml(item.cover_url)}"
        alt="${escapeHtml(item.title || "")}"
        loading="lazy"
      />
    `;
  }

  return `<div class="result-cover-fallback">?</div>`;
}

function renderCard(item) {
  return `
    <button
      class="result-card"
      type="button"
      data-key="${escapeHtml(item.canonical_key)}"
      data-category="${escapeHtml(item.category)}"
    >
      <div class="result-cover">
        ${renderCover(item)}
      </div>

      <div class="result-meta">
        <div class="result-title">
          ${escapeHtml(item.title || "")}
        </div>

        ${
          item.original_title
            ? `<div class="result-subtitle">${escapeHtml(item.original_title)}</div>`
            : ""
        }

        <div class="result-footer">
          <span class="badge">${escapeHtml(CATEGORY_LABELS[item.category] || item.category)}</span>
          ${
            item.year
              ? `<span class="year">${escapeHtml(String(item.year))}</span>`
              : ""
          }
        </div>
      </div>
    </button>
  `;
}

export function renderSearchPage(root, params = {}) {
  const query = params.q || "";

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
        grid-template-columns: 80px 1fr;
        gap: 12px;
        padding: 10px;
        border-radius: 16px;
        background: var(--surface);
        border: 1px solid var(--border);
        text-align: left;
      }

      .result-cover {
        width: 80px;
        height: 110px;
        border-radius: 12px;
        overflow: hidden;
        background: var(--bg-soft);
      }

      .result-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .result-cover-fallback {
        display: grid;
        place-items: center;
        height: 100%;
      }

      .result-title {
        font-weight: 700;
      }

      .result-subtitle {
        font-size: 13px;
        color: var(--text-soft);
      }

      .result-footer {
        display: flex;
        gap: 10px;
        margin-top: 6px;
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
      }
    </style>

    <section class="page">
      <div class="search-header">
        <input
          class="search-input"
          type="text"
          value="${escapeHtml(query)}"
          placeholder="Поиск..."
        />
      </div>

      <div class="results-grid" data-results>
        <div class="empty">Введите запрос...</div>
      </div>
    </section>
  `;

  const input = root.querySelector(".search-input");
  const resultsRoot = root.querySelector("[data-results]");

  async function doSearch(value) {
    if (!value || value.length < SEARCH_LIMITS.MIN_QUERY_LENGTH) {
      resultsRoot.innerHTML = `<div class="empty">Введите больше символов</div>`;
      return;
    }

    resultsRoot.innerHTML = `<div class="empty">Ищем...</div>`;

    try {
      const grouped = await runGlobalSearch(value);
      const flat = flattenResults(grouped);

      if (!flat.length) {
        resultsRoot.innerHTML = `<div class="empty">Ничего не найдено</div>`;
        return;
      }

      resultsRoot.innerHTML = flat.map(renderCard).join("");

      resultsRoot.querySelectorAll("[data-key]").forEach((btn) => {
        btn.addEventListener("click", () => {
          navigate("/card", {
            key: btn.dataset.key,
            category: btn.dataset.category
          });
        });
      });
    } catch (e) {
      resultsRoot.innerHTML = `<div class="empty">Ошибка поиска</div>`;
    }
  }

  const debounced = debounce(doSearch, 300);

  input.addEventListener("input", () => {
    const value = input.value;
    setSearchQuery(value);
    debounced(value);
  });

  if (query) {
    doSearch(query);
  }
}
