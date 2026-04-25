import { STATUS_LABELS, getCategoryLabel } from "../config.js";
import { navigate } from "../router.js";
import { openAuthModal, openSearchModal, state } from "../state.js";
import { clampText, escapeHtml, safeArray } from "../utils.js";
import { getSupabaseClient } from "../lib/supabase-client.js";

async function fetchUserCategoryLibrary(userId, category) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_media")
    .select(`
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
        description_ru,
        description_en,
        external_ids
      )
    `)
    .eq("user_id", userId)
    .eq("category", category)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return Array.isArray(data) ? data.filter((item) => item?.media_entities) : [];
}

async function updateUserMedia(userMediaId, payload) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_media")
    .update(payload)
    .eq("id", userMediaId)
    .select()
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

function openLibraryCoverUrlFromId(coverId) {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : "";
}

function openLibraryCoverUrlFromIsbn(isbn) {
  return isbn ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg` : "";
}

function openLibraryCoverUrlFromOlid(olid) {
  return olid ? `https://covers.openlibrary.org/b/olid/${encodeURIComponent(olid)}-L.jpg` : "";
}

function normalizeOpenLibraryWorkKey(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (raw.startsWith("/works/")) {
    return raw.replace("/works/", "");
  }

  return raw;
}

async function fetchOpenLibraryWorkCover(workKey) {
  const normalizedWorkKey = normalizeOpenLibraryWorkKey(workKey);
  if (!normalizedWorkKey) return "";

  try {
    const response = await fetch(`https://openlibrary.org/works/${encodeURIComponent(normalizedWorkKey)}.json`, {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) return "";

    const payload = await response.json();
    const coverId = safeArray(payload?.covers).find(Boolean);

    return coverId ? openLibraryCoverUrlFromId(coverId) : "";
  } catch {
    return "";
  }
}

async function resolveBookCoverFromExternalIds(entity = {}) {
  if (entity.cover_url) return entity.cover_url;

  const externalIds = entity.external_ids || {};
  const isbn = safeArray(externalIds.isbn).find(Boolean);
  const editionKey = safeArray(externalIds.edition_key).find(Boolean);
  const ia = safeArray(externalIds.ia).find(Boolean);
  const work = externalIds.openlibrary_work || "";

  if (isbn) return openLibraryCoverUrlFromIsbn(isbn);
  if (editionKey) return openLibraryCoverUrlFromOlid(editionKey);
  if (ia) return openLibraryCoverUrlFromOlid(ia);
  if (work) return await fetchOpenLibraryWorkCover(work);

  const canonicalKey = entity.canonical_key || "";
  if (canonicalKey.startsWith("books:openlibrary:")) {
    const possibleWork = canonicalKey.replace("books:openlibrary:", "");
    return await fetchOpenLibraryWorkCover(possibleWork);
  }

  return "";
}

async function fixMissingBookCovers(items = []) {
  const supabase = getSupabaseClient();
  let changed = false;

  const nextItems = [...items];

  for (const item of nextItems) {
    const entity = item.media_entities || {};

    if (entity.category !== "books") continue;
    if (entity.cover_url) continue;

    const newCover = await resolveBookCoverFromExternalIds(entity);
    if (!newCover) continue;

    try {
      await supabase
        .from("media_entities")
        .update({ cover_url: newCover })
        .eq("id", entity.id);

      entity.cover_url = newCover;
      changed = true;
    } catch (error) {
      console.warn("Book cover restore skipped:", error);
    }
  }

  return {
    items: nextItems,
    changed
  };
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
  return entity.original_title || "";
}

function getCover(entity = {}) {
  const cover = entity.cover_url || "";
  if (!cover || cover === "undefined" || cover === "null") return "";
  return cover;
}

function uniqueFolders(items = []) {
  return [
    ...new Set(
      items
        .map((item) => item.folder_name || "")
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ru"))
    )
  ];
}

function sortItems(items = [], sort = "recent") {
  const result = [...items];

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
  return items.filter((item) => (item.folder_name || "") === activeFolder);
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
          subtitle && subtitle !== title
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
        gap: 0;
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
        cursor: pointer;
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

  function renderList() {
    const folders = uniqueFolders(items);
    const visibleItems = sortItems(filterItems(items, activeFolder), activeSort);

    foldersRoot.innerHTML = renderFolderTabs(folders, activeFolder);

    if (!visibleItems.length) {
      contentRoot.innerHTML = renderEmptyState(title);
    } else {
      contentRoot.innerHTML = `
        <div class="library-grid">
          ${visibleItems.map(renderLibraryCard).join("")}
        </div>
      `;
    }

    foldersRoot.querySelectorAll("[data-folder]").forEach((button) => {
      button.addEventListener("click", () => {
        activeFolder = button.dataset.folder || "all";
        renderList();
      });
    });

    contentRoot.querySelectorAll(".library-card").forEach((card) => {
      card.addEventListener("click", () => {
        const key = card.dataset.key || "";
        const buttonCategory = card.dataset.category || category;

        if (!key) return;

        navigate("/card", {
          key,
          category: buttonCategory
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
          await updateUserMedia(userMediaId, { status: newStatus });

          items = items.map((item) =>
            item.id === userMediaId ? { ...item, status: newStatus } : item
          );

          renderList();
        } catch (error) {
          console.error("Update status error:", error);
        }
      });
    });

    contentRoot.querySelectorAll('[data-action="set-folder"]').forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const userMediaId = Number(button.dataset.userMediaId);
        if (!userMediaId) return;

        const current = items.find((item) => item.id === userMediaId);
        const currentFolder = current?.folder_name || "";

        const folderName = window.prompt(
          "Название папки. Оставь пустым, чтобы убрать папку.",
          currentFolder
        );

        if (folderName === null) return;

        const cleanFolder = folderName.trim();

        try {
          await updateUserMedia(userMediaId, { folder_name: cleanFolder || null });

          items = items.map((item) =>
            item.id === userMediaId ? { ...item, folder_name: cleanFolder || null } : item
          );

          if (activeFolder !== "all" && activeFolder !== cleanFolder) {
            activeFolder = "all";
          }

          renderList();
        } catch (error) {
          console.error("Update folder error:", error);
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
          await removeFromLibrary(userMediaId);
          items = items.filter((item) => item.id !== userMediaId);
          renderList();
        } catch (error) {
          console.error("Remove from library error:", error);
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
    items = await fetchUserCategoryLibrary(userId, category);
    renderList();

    if (category === "books") {
      fixMissingBookCovers(items).then((result) => {
        if (result?.changed) {
          items = result.items;
          renderList();
        }
      });
    }
  } catch (error) {
    console.error("Category library load error:", error);
    contentRoot.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__title">Ошибка загрузки</div>
        <div class="empty-state__text">Не удалось загрузить библиотеку.</div>
      </div>
    `;
  }
}
