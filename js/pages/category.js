import { STATUS_LABELS, getCategoryLabel } from "../config.js";
import { navigate } from "../router.js";
import {
  openAuthModal,
  openSearchModal,
  state,
  setTemporaryCardItem
} from "../state.js";
import { clampText, escapeHtml, safeArray } from "../utils.js";
import { getSupabaseClient } from "../lib/supabase-client.js";
import {
  loadUserLibrary,
  updateCachedLibraryItem,
  removeCachedLibraryItem
} from "../services/library-cache.js";

const USER_MEDIA_UPDATE_SELECT = `
  id,
  user_id,
  entity_id,
  category,
  status,
  folder_name,
  created_at,
  updated_at,
  media_entities (
    id,
    canonical_key,
    category,
    title_primary,
    title_ru,
    title_en,
    original_title,
    year,
    cover_url,
    universe_key
  )
`;

async function updateUserMedia(userMediaId, payload) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_media")
    .update(payload)
    .eq("id", userMediaId)
    .select(USER_MEDIA_UPDATE_SELECT)
    .single();

  if (error) throw error;
  return data;
}

async function removeFromLibrary(userMediaId) {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("user_media")
    .delete()
    .eq("id", userMediaId);

  if (error) throw error;
  return true;
}

function resolveTitle(entity = {}) {
  return (
    entity.title_primary ||
    entity.title_ru ||
    entity.title_en ||
    entity.original_title ||
    "Без названия"
  );
}

function resolveSubtitle(entity = {}) {
  const title = resolveTitle(entity);
  const original = entity.original_title || "";

  return original && original !== title ? original : "";
}

function getCover(entity = {}) {
  const cover = entity.cover_url || "";
  if (!cover || cover === "undefined" || cover === "null") return "";
  return cover;
}

function uniqueFolders(items = []) {
  return [
    ...new Set(
      safeArray(items)
        .map((item) => item.folder_name || "")
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ru"))
    )
  ];
}

function sortItems(items = [], sort = "recent") {
  const result = [...safeArray(items)];

  if (sort === "title") {
    return result.sort((a, b) =>
      resolveTitle(a.media_entities).localeCompare(resolveTitle(b.media_entities), "ru")
    );
  }

  if (sort === "year") {
    return result.sort((a, b) => {
      const ay = Number(a.media_entities?.year || 0);
      const by = Number(b.media_entities?.year || 0);
      return by - ay;
    });
  }

  return result.sort((a, b) => {
    const ad = new Date(a.created_at || 0).getTime();
    const bd = new Date(b.created_at || 0).getTime();
    return bd - ad;
  });
}

function filterItems(items = [], activeFolder = "all") {
  if (activeFolder === "all") return items;
  return safeArray(items).filter((item) => (item.folder_name || "") === activeFolder);
}

function renderCover(entity = {}) {
  const title = resolveTitle(entity);
  const cover = getCover(entity);

  if (cover) {
    return `
      <img
        src="${escapeHtml(cover)}"
        alt="${escapeHtml(title)}"
        loading="lazy"
        onerror="this.style.display='none';this.parentElement.classList.add('is-empty-cover');"
      />
    `;
  }

  return `<div class="library-card__cover-fallback">?</div>`;
}

function renderFolderTabs(folders = [], activeFolder = "all") {
  const all = `
    <button class="folder-chip ${activeFolder === "all" ? "active" : ""}" type="button" data-folder="all">
      Все
    </button>
  `;

  const rest = folders
    .map(
      (folder) => `
        <button class="folder-chip ${activeFolder === folder ? "active" : ""}" type="button" data-folder="${escapeHtml(folder)}">
          ${escapeHtml(folder)}
        </button>
      `
    )
    .join("");

  return all + rest;
}

function renderLibraryCard(item) {
  const entity = item.media_entities || {};
  const title = resolveTitle(entity);
  const subtitle = resolveSubtitle(entity);
  const status = STATUS_LABELS[item.status] || item.status || "Planned";
  const folderName = item.folder_name || "";
  const canonicalKey = entity.canonical_key || "";
  const entityCategory = entity.category || item.category || "";

  return `
    <article
      class="library-card library-card--${escapeHtml(entityCategory)}"
      data-user-media-id="${item.id}"
      data-action="open-card"
      data-key="${escapeHtml(canonicalKey)}"
      data-category="${escapeHtml(entityCategory)}"
    >
      <div class="library-card__cover">
        ${renderCover(entity)}
      </div>

      <div class="library-card__body">
        <div class="library-card__top">
          <div class="library-card__badges">
            <span class="library-badge">${escapeHtml(status)}</span>
            ${folderName ? `<span class="library-badge folder">${escapeHtml(folderName)}</span>` : ""}
          </div>

          <div class="library-card__menu-wrap">
            <button
              class="library-card__menu-btn"
              type="button"
              aria-label="Открыть меню"
              data-action="toggle-menu"
              data-user-media-id="${item.id}"
            >
              ⋯
            </button>

            <div class="library-card__menu" data-menu="${item.id}">
              <button type="button" data-action="set-status" data-value="planned" data-user-media-id="${item.id}">Planned</button>
              <button type="button" data-action="set-status" data-value="in_progress" data-user-media-id="${item.id}">In progress</button>
              <button type="button" data-action="set-status" data-value="done" data-user-media-id="${item.id}">Done</button>
              <button type="button" data-action="set-status" data-value="dropped" data-user-media-id="${item.id}">Dropped</button>
              <button type="button" data-action="set-folder" data-user-media-id="${item.id}">Папка</button>
              <button type="button" class="danger" data-action="remove" data-user-media-id="${item.id}">Удалить</button>
            </div>
          </div>
        </div>

        <div class="library-card__title">${escapeHtml(clampText(title, 80))}</div>

        ${
          subtitle
            ? `<div class="library-card__subtitle">${escapeHtml(clampText(subtitle, 90))}</div>`
            : ""
        }

        <div class="library-card__meta">
          ${entity.year ? `<span>${escapeHtml(String(entity.year))}</span>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderEmptyState(categoryTitle) {
  return `
    <div class="empty-state">
      <div class="empty-state__title">Здесь пока ничего нет</div>
      <div class="empty-state__text">
        Добавь первый элемент в раздел ${escapeHtml(categoryTitle)}.
      </div>
    </div>
  `;
}

function renderErrorState() {
  return `
    <div class="empty-state">
      <div class="empty-state__title">Ошибка загрузки</div>
      <div class="empty-state__text">Не удалось загрузить библиотеку.</div>
    </div>
  `;
}

function closeAllMenus(root) {
  root.querySelectorAll(".library-card__menu.is-open").forEach((menu) => {
    menu.classList.remove("is-open");
  });
}

function renderGuestState(root, title) {
  root.innerHTML = `
    <section class="category-guest">
      <div class="category-guest__title">${escapeHtml(title)}</div>
      <div class="category-guest__card">
        <div class="category-guest__text">
          Чтобы увидеть свою библиотеку и управлять статусами, нужно войти в аккаунт.
        </div>
        <button class="category-guest__button" type="button" data-action="login">
          Войти
        </button>
      </div>
    </section>
  `;

  root.querySelector('[data-action="login"]')?.addEventListener("click", () => {
    openAuthModal("login");
  });
}

function renderStyles() {
  return `
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
        flex-wrap: wrap;
      }

      .page-title {
        font-size: 28px;
        font-weight: 800;
        color: var(--text);
      }

      .page-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .sort-select {
        min-height: 44px;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        padding: 0 12px;
      }

      .add-btn {
        padding: 11px 16px;
        border-radius: 999px;
        background: var(--accent);
        color: #fff;
        font-weight: 700;
      }

      .folder-row {
        display: flex;
        gap: 10px;
        overflow-x: auto;
        padding-bottom: 4px;
      }

      .folder-chip {
        white-space: nowrap;
        padding: 9px 13px;
        border-radius: 999px;
        background: var(--surface);
        border: 1px solid var(--border-soft);
        color: var(--text-soft);
      }

      .folder-chip.active {
        background: var(--accent-soft);
        color: var(--text);
        border-color: transparent;
      }

      .library-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
        gap: 18px;
        align-items: start;
      }

      .library-card {
        position: relative;
        display: flex;
        flex-direction: column;
        overflow: visible;
        cursor: pointer;
        background: var(--bg-elevated);
        border: 1px solid var(--border-soft);
        border-radius: 22px;
        padding: 10px;
        transition: transform .18s ease, border-color .18s ease, background .18s ease;
      }

      .library-card:hover {
        transform: translateY(-2px);
        border-color: var(--border);
      }

      .library-card__cover {
        width: 100%;
        aspect-ratio: 2 / 3;
        border-radius: 16px;
        overflow: hidden;
        background: var(--surface);
        border: 1px solid var(--border-soft);
      }

      .library-card__cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .library-card--books .library-card__cover img,
      .library-card--manga .library-card__cover img {
        object-fit: contain;
        background: var(--bg-soft);
      }

      .library-card__cover.is-empty-cover {
        display: grid;
        place-items: center;
      }

      .library-card__cover.is-empty-cover::after {
        content: "?";
        color: var(--text-soft);
        font-weight: 800;
      }

      .library-card__cover-fallback {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        color: var(--text-soft);
      }

      .library-card__body {
        display: flex;
        flex-direction: column;
        gap: 7px;
        padding: 12px 4px 4px;
      }

      .library-card__top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .library-card__badges {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .library-badge {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--accent-soft);
        font-size: 12px;
        color: var(--text);
      }

      .library-badge.folder {
        background: var(--bg-soft);
      }

      .library-card__title {
        font-size: 15px;
        font-weight: 750;
        line-height: 1.35;
        color: var(--text);
      }

      .library-card__subtitle,
      .library-card__meta {
        font-size: 13px;
        color: var(--text-soft);
        line-height: 1.4;
      }

      .library-card__menu-wrap {
        position: relative;
        flex-shrink: 0;
      }

      .library-card__menu-btn {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: var(--surface-strong);
        color: var(--text);
        font-size: 20px;
        line-height: 1;
      }

      .library-card__menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        z-index: 100;
        width: 190px;
        padding: 6px;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: var(--bg-elevated);
        box-shadow: var(--shadow);
        display: none;
        flex-direction: column;
        gap: 4px;
      }

      .library-card__menu.is-open {
        display: flex;
      }

      .library-card__menu button {
        text-align: left;
        background: transparent;
        color: var(--text);
        padding: 10px 12px;
        border-radius: 10px;
      }

      .library-card__menu button:hover {
        background: var(--bg-soft);
      }

      .library-card__menu button.danger {
        color: var(--danger);
      }

      .empty-state {
        padding: 40px 20px;
        text-align: center;
        color: var(--text-soft);
        border: 1px solid var(--border-soft);
        border-radius: 18px;
        background: var(--surface);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .empty-state__title {
        color: var(--text);
        font-size: 18px;
        font-weight: 700;
      }

      .category-guest {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .category-guest__title {
        font-size: 28px;
        font-weight: 800;
        color: var(--text);
      }

      .category-guest__card {
        border: 1px solid var(--border-soft);
        background: var(--surface);
        border-radius: 20px;
        padding: 20px;
      }

      .category-guest__text {
        color: var(--text-soft);
        line-height: 1.6;
        margin-bottom: 14px;
      }

      .category-guest__button {
        padding: 10px 16px;
        border-radius: 999px;
        background: var(--accent);
        color: #fff;
        font-weight: 700;
      }

      @media (max-width: 640px) {
        .library-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .page-header {
          align-items: stretch;
        }

        .page-actions {
          width: 100%;
        }

        .sort-select,
        .add-btn {
          flex: 1;
        }

        .library-card {
          border-radius: 18px;
          padding: 8px;
        }
      }
    </style>
  `;
}

export async function renderCategoryPage(root, params = {}) {
  const category = params.category || "unknown";
  const title = getCategoryLabel(state.language, category);
  const userId = state.user?.id;

  if (!userId) {
    renderGuestState(root, title);
    return;
  }

  let items = [];
  let activeFolder = "all";
  let activeSort = "recent";
  let isDestroyed = false;

  root.innerHTML = `
    ${renderStyles()}

    <section class="page">
      <div class="page-header">
        <div class="page-title">${escapeHtml(title)}</div>

        <div class="page-actions">
          <select class="sort-select" data-sort>
            <option value="recent">Сначала новые</option>
            <option value="title">По названию</option>
            <option value="year">По году</option>
          </select>
          <button class="add-btn" data-action="add">+ Добавить</button>
        </div>
      </div>

      <div class="folder-row" data-folders></div>

      <div data-content>
        <div class="empty-state">
          <div class="empty-state__title">Загрузка…</div>
        </div>
      </div>
    </section>
  `;

  const foldersRoot = root.querySelector("[data-folders]");
  const contentRoot = root.querySelector("[data-content]");
  const sortSelect = root.querySelector("[data-sort]");

  function findItemById(userMediaId) {
    return items.find((item) => Number(item.id) === Number(userMediaId)) || null;
  }

  function renderList() {
    if (isDestroyed || !foldersRoot || !contentRoot) return;

    const folders = uniqueFolders(items);
    const visibleItems = sortItems(filterItems(items, activeFolder), activeSort);

    foldersRoot.innerHTML = renderFolderTabs(folders, activeFolder);

    contentRoot.innerHTML = visibleItems.length
      ? `
        <div class="library-grid">
          ${visibleItems.map(renderLibraryCard).join("")}
        </div>
      `
      : renderEmptyState(title);

    foldersRoot.querySelectorAll("[data-folder]").forEach((button) => {
      button.addEventListener("click", () => {
        activeFolder = button.dataset.folder || "all";
        renderList();
      });
    });

    contentRoot.querySelectorAll(".library-card").forEach((card) => {
      card.addEventListener("click", () => {
        const key = card.dataset.key || "";
        const itemCategory = card.dataset.category || category;
        const userMediaId = Number(card.dataset.userMediaId);
        const item = findItemById(userMediaId);

        if (!key) return;

        if (item?.media_entities) {
          setTemporaryCardItem(item.media_entities);
        }

        navigate("/card", {
          key,
          category: itemCategory
        });
      });
    });

    contentRoot.querySelectorAll('[data-action="toggle-menu"]').forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const userMediaId = button.dataset.userMediaId;
        const menu = contentRoot.querySelector(`[data-menu="${userMediaId}"]`);
        const isOpen = menu?.classList.contains("is-open");

        closeAllMenus(contentRoot);

        if (menu && !isOpen) {
          menu.classList.add("is-open");
        }
      });
    });

    contentRoot.querySelectorAll('[data-action="set-status"]').forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const userMediaId = Number(button.dataset.userMediaId);
        const newStatus = button.dataset.value;

        if (!userMediaId || !newStatus) return;

        try {
          button.disabled = true;

          const updated = await updateUserMedia(userMediaId, {
            status: newStatus
          });

          items = items.map((item) =>
            Number(item.id) === userMediaId ? updated : item
          );

          updateCachedLibraryItem(userId, updated, {
            category: updated.category || category
          });

          renderList();
        } catch (error) {
          console.error("Update status error:", error);
          button.disabled = false;
        }
      });
    });

    contentRoot.querySelectorAll('[data-action="set-folder"]').forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const userMediaId = Number(button.dataset.userMediaId);
        if (!userMediaId) return;

        const current = findItemById(userMediaId);
        const currentFolder = current?.folder_name || "";

        const folderName = window.prompt(
          "Название папки. Оставь пустым, чтобы убрать папку.",
          currentFolder
        );

        if (folderName === null) return;

        const cleanFolder = String(folderName || "").trim();

        try {
          button.disabled = true;

          const updated = await updateUserMedia(userMediaId, {
            folder_name: cleanFolder || null
          });

          items = items.map((item) =>
            Number(item.id) === userMediaId ? updated : item
          );

          updateCachedLibraryItem(userId, updated, {
            category: updated.category || category
          });

          if (activeFolder !== "all" && activeFolder !== cleanFolder) {
            activeFolder = "all";
          }

          renderList();
        } catch (error) {
          console.error("Update folder error:", error);
          button.disabled = false;
        }
      });
    });

    contentRoot.querySelectorAll('[data-action="remove"]').forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const userMediaId = Number(button.dataset.userMediaId);
        if (!userMediaId) return;

        try {
          button.disabled = true;

          await removeFromLibrary(userMediaId);

          items = items.filter((item) => Number(item.id) !== userMediaId);

          removeCachedLibraryItem(userId, userMediaId, {
            category
          });

          renderList();
        } catch (error) {
          console.error("Remove from library error:", error);
          button.disabled = false;
        }
      });
    });
  }

  root.querySelector('[data-action="add"]')?.addEventListener("click", () => {
    openSearchModal("");
  });

  sortSelect?.addEventListener("change", () => {
    activeSort = sortSelect.value || "recent";
    renderList();
  });

  root.addEventListener("click", (event) => {
    if (!event.target.closest(".library-card__menu-wrap")) {
      closeAllMenus(root);
    }
  });

  try {
    items = await loadUserLibrary(userId, {
      category,
      mode: "list",
      allowStale: true,
      backgroundRefresh: false
    });

    if (isDestroyed) return;

    renderList();
  } catch (error) {
    console.error("Category library load error:", error);

    if (contentRoot) {
      contentRoot.innerHTML = renderErrorState();
    }
  }

  return () => {
    isDestroyed = true;
  };
}
