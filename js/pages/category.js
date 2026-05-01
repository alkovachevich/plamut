import { STATUS_LABELS, getCategoryLabel, ROUTES } from "../config.js";
import { navigate } from "../router.js";
import {
  openAuthModal,
  openSearchModal,
  state,
  setTemporaryCardItem,
  setCurrentCategory,
  getCategoryViewState,
  setCategoryViewState
} from "../state.js";
import { clampText, escapeHtml, safeArray } from "../utils.js";
import { getSupabaseClient, withTimeout } from "../lib/supabase-client.js";
import {
  loadUserLibrary,
  refreshUserLibrary,
  updateCachedLibraryItem,
  removeCachedLibraryItem
} from "../services/library-cache.js";

const USER_MEDIA_UPDATE_TIMEOUT_MS = 9000;
const EMPTY_FOLDERS_KEY = "plamut_empty_folders_by_category_v1";

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
    primary_source,
    title_primary,
    title_ru,
    title_en,
    original_title,
    year,
    cover_url,
    description_ru,
    description_en,
    external_ids,
    meta,
    universe_key,
    relations_built_at,
    relations_status
  )
`;

const I18N = {
  ru: {
    all: "Все",
    add: "+ Добавить",
    folders: "Папки",
    createFolder: "Создать папку",
    newFolderName: "Название новой папки",
    removeFolder: "Убрать из папки",
    status: "Статус",
    folder: "Папка",
    delete: "Удалить",
    empty: "Здесь пока ничего нет",
    emptyText: "Добавь первый элемент в раздел",
    loading: "Загрузка…",
    errorTitle: "Ошибка загрузки",
    errorText: "Не удалось загрузить библиотеку. Если данные есть в кэше, они будут показаны автоматически.",
    guestText: "Чтобы увидеть свою библиотеку и управлять статусами, нужно войти в аккаунт.",
    login: "Войти",
    sortRecent: "Сначала новые",
    sortTitle: "По названию",
    sortYear: "По году",
    confirmDelete: "Удалить эту карточку из библиотеки?",
    planned: "Запланировано",
    in_progress: "В процессе",
    done: "Завершено",
    dropped: "Брошено"
  },
  en: {
    all: "All",
    add: "+ Add",
    folders: "Folders",
    createFolder: "Create folder",
    newFolderName: "New folder name",
    removeFolder: "Remove from folder",
    status: "Status",
    folder: "Folder",
    delete: "Delete",
    empty: "Nothing here yet",
    emptyText: "Add the first item to",
    loading: "Loading…",
    errorTitle: "Loading error",
    errorText: "Could not load the library. Cached data will be shown automatically if available.",
    guestText: "Sign in to view your library and manage statuses.",
    login: "Sign in",
    sortRecent: "Newest first",
    sortTitle: "By title",
    sortYear: "By year",
    confirmDelete: "Delete this item from your library?",
    planned: "Planned",
    in_progress: "In progress",
    done: "Done",
    dropped: "Dropped"
  }
};

function t(key) {
  const language = state.language === "en" ? "en" : "ru";
  return I18N[language][key] || I18N.ru[key] || key;
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function normalizeFolderName(value = "") {
  return cleanText(value).replace(/\s+/g, " ").slice(0, 48);
}

function readEmptyFolders() {
  try {
    const raw = localStorage.getItem(EMPTY_FOLDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeEmptyFolders(value) {
  try {
    localStorage.setItem(EMPTY_FOLDERS_KEY, JSON.stringify(value || {}));
  } catch (error) {
    console.warn("empty folders save skipped:", error);
  }
}

function getEmptyFolders(category = "") {
  const data = readEmptyFolders();
  return safeArray(data[category]).map(normalizeFolderName).filter(Boolean);
}

function addEmptyFolder(category = "", folderName = "") {
  const cleanCategory = cleanText(category);
  const cleanFolder = normalizeFolderName(folderName);

  if (!cleanCategory || !cleanFolder) return [];

  const data = readEmptyFolders();
  const current = new Set(safeArray(data[cleanCategory]).map(normalizeFolderName).filter(Boolean));
  current.add(cleanFolder);

  data[cleanCategory] = [...current].sort((a, b) =>
    a.localeCompare(b, state.language === "en" ? "en" : "ru")
  );

  writeEmptyFolders(data);
  return data[cleanCategory];
}

function removeEmptyFolderIfUnused(category = "", folderName = "", items = []) {
  const cleanCategory = cleanText(category);
  const cleanFolder = normalizeFolderName(folderName);

  if (!cleanCategory || !cleanFolder) return;

  const stillUsed = safeArray(items).some((item) => item.folder_name === cleanFolder);
  if (stillUsed) return;

  const data = readEmptyFolders();
  data[cleanCategory] = safeArray(data[cleanCategory]).filter((folder) => folder !== cleanFolder);
  writeEmptyFolders(data);
}

async function updateUserMedia(userMediaId, payload) {
  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("user_media")
      .update(payload)
      .eq("id", userMediaId)
      .select(USER_MEDIA_UPDATE_SELECT)
      .maybeSingle(),
    "Обновление элемента библиотеки",
    USER_MEDIA_UPDATE_TIMEOUT_MS
  );

  if (error) throw error;
  return data || null;
}

async function removeFromLibrary(userMediaId) {
  const supabase = getSupabaseClient();

  const { error } = await withTimeout(
    supabase
      .from("user_media")
      .delete()
      .eq("id", userMediaId),
    "Удаление из библиотеки",
    USER_MEDIA_UPDATE_TIMEOUT_MS
  );

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

function uniqueFolders(items = [], category = "") {
  const fromItems = safeArray(items)
    .map((item) => item.folder_name || "")
    .filter(Boolean);

  const emptyFolders = getEmptyFolders(category);

  return [...new Set([...fromItems, ...emptyFolders])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, state.language === "en" ? "en" : "ru"));
}

function sortItems(items = [], sort = "recent") {
  const result = [...safeArray(items)];

  if (sort === "title") {
    return result.sort((a, b) =>
      resolveTitle(a.media_entities).localeCompare(
        resolveTitle(b.media_entities),
        state.language === "en" ? "en" : "ru"
      )
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
  if (activeFolder === "all") return safeArray(items);
  return safeArray(items).filter((item) => (item.folder_name || "") === activeFolder);
}

function getStatusLabel(status = "") {
  const key = cleanText(status);
  return t(key) || STATUS_LABELS[key] || key || t("planned");
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
        decoding="async"
        onerror="this.style.display='none';this.parentElement.classList.add('is-empty-cover');"
      />
    `;
  }

  return `<div class="library-card__cover-fallback">?</div>`;
}

function renderFolderTabs(folders = [], activeFolder = "all") {
  const all = `
    <button class="folder-chip ${activeFolder === "all" ? "active" : ""}" type="button" data-folder="all">
      ${escapeHtml(t("all"))}
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
  const status = getStatusLabel(item.status);
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

        <button
          class="library-card__menu-btn"
          type="button"
          aria-label="Menu"
          data-action="open-item-menu"
          data-user-media-id="${item.id}"
        >
          ⋯
        </button>
      </div>

      <div class="library-card__body">
        <div class="library-card__badges">
          <span class="library-badge" data-card-status>${escapeHtml(status)}</span>
          ${folderName ? `<span class="library-badge folder" data-card-folder>${escapeHtml(folderName)}</span>` : ""}
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
      <div class="empty-state__title">${escapeHtml(t("empty"))}</div>
      <div class="empty-state__text">
        ${escapeHtml(t("emptyText"))} ${escapeHtml(categoryTitle)}.
      </div>
    </div>
  `;
}

function renderLoadingState() {
  return `
    <div class="empty-state">
      <div class="empty-state__title">${escapeHtml(t("loading"))}</div>
    </div>
  `;
}

function renderErrorState(hasItems = false) {
  if (hasItems) return "";

  return `
    <div class="empty-state">
      <div class="empty-state__title">${escapeHtml(t("errorTitle"))}</div>
      <div class="empty-state__text">${escapeHtml(t("errorText"))}</div>
    </div>
  `;
}

function renderGuestState(root, title) {
  root.innerHTML = `
    ${renderStyles()}
    <section class="category-guest">
      <div class="category-guest__title">${escapeHtml(title)}</div>
      <div class="category-guest__card">
        <div class="category-guest__text">
          ${escapeHtml(t("guestText"))}
        </div>
        <button class="category-guest__button" type="button" data-action="login">
          ${escapeHtml(t("login"))}
        </button>
      </div>
    </section>
  `;

  root.querySelector('[data-action="login"]')?.addEventListener("click", () => {
    openAuthModal("login");
  });
}

function renderActionModal({ item = null, folders = [], category = "" } = {}) {
  const currentStatus = item?.status || "";
  const currentFolder = item?.folder_name || "";

  const statusButtons = ["planned", "in_progress", "done", "dropped"]
    .map((status) => `
      <button
        class="action-modal__option ${currentStatus === status ? "active" : ""}"
        type="button"
        data-action="modal-set-status"
        data-value="${status}"
      >
        ${escapeHtml(t(status))}
      </button>
    `)
    .join("");

  const folderButtons = safeArray(folders)
    .map((folder) => `
      <button
        class="action-modal__option ${currentFolder === folder ? "active" : ""}"
        type="button"
        data-action="modal-set-folder"
        data-value="${escapeHtml(folder)}"
      >
        ${escapeHtml(folder)}
      </button>
    `)
    .join("");

  return `
    <div class="action-modal-backdrop" data-action="close-action-modal">
      <div class="action-modal" role="dialog" aria-modal="true" data-modal-card="${item?.id || ""}" data-modal-category="${escapeHtml(category)}">
        <div class="action-modal__header">
          <div class="action-modal__title">${escapeHtml(item ? resolveTitle(item.media_entities || {}) : t("folders"))}</div>
          <button class="action-modal__close" type="button" data-action="close-action-modal">×</button>
        </div>

        ${item ? `
          <section class="action-modal__group">
            <div class="action-modal__group-title">${escapeHtml(t("status"))}</div>
            <div class="action-modal__options">${statusButtons}</div>
          </section>
        ` : ""}

        <section class="action-modal__group">
          <div class="action-modal__group-title">${escapeHtml(t("folder"))}</div>
          <div class="action-modal__options">
            ${folderButtons || `<div class="action-modal__hint">${escapeHtml(t("folders"))}</div>`}
            ${item && currentFolder ? `
              <button class="action-modal__option muted" type="button" data-action="modal-remove-folder">
                ${escapeHtml(t("removeFolder"))}
              </button>
            ` : ""}
          </div>

          <form class="action-modal__folder-form" data-action="modal-create-folder">
            <input
              class="action-modal__input"
              type="text"
              maxlength="48"
              placeholder="${escapeHtml(t("newFolderName"))}"
              data-folder-input
            />
            <button class="action-modal__small-btn" type="submit">
              ${escapeHtml(t("createFolder"))}
            </button>
          </form>
        </section>

        ${item ? `
          <section class="action-modal__group danger">
            <button class="action-modal__delete" type="button" data-action="modal-delete">
              ${escapeHtml(t("delete"))}
            </button>
          </section>
        ` : ""}
      </div>
    </div>
  `;
}

function renderStyles() {
  return `
    <style>
      .page{display:flex;flex-direction:column;gap:20px}
      .page-header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
      .page-title{font-size:28px;font-weight:800;color:var(--text)}
      .page-actions{display:flex;align-items:center;gap:10px}
      .sort-select{min-height:44px;border-radius:14px;border:1px solid var(--border);background:var(--surface);color:var(--text);padding:0 12px}
      .add-btn,.folder-action-btn{padding:11px 16px;border-radius:999px;font-weight:700}
      .add-btn{background:var(--accent);color:#fff}
      .folder-action-btn{background:var(--surface);color:var(--text);border:1px solid var(--border)}
      .folder-row{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px}
      .folder-chip{white-space:nowrap;padding:9px 13px;border-radius:999px;background:var(--surface);border:1px solid var(--border-soft);color:var(--text-soft)}
      .folder-chip.active{background:var(--accent-soft);color:var(--text);border-color:transparent}
      .library-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:18px;align-items:start}
      .library-card{position:relative;display:flex;flex-direction:column;overflow:visible;cursor:pointer;background:var(--bg-elevated);border:1px solid var(--border-soft);border-radius:22px;padding:10px;transition:transform .18s ease,border-color .18s ease,background .18s ease,opacity .18s ease}
      .library-card:hover{transform:translateY(-2px);border-color:var(--border)}
      .library-card.is-busy{pointer-events:none;opacity:.72}
      .library-card__cover{position:relative;width:100%;aspect-ratio:2/3;border-radius:16px;overflow:hidden;background:var(--surface);border:1px solid var(--border-soft)}
      .library-card__cover img{width:100%;height:100%;object-fit:cover;display:block}
      .library-card--books .library-card__cover img,.library-card--manga .library-card__cover img{object-fit:contain;background:var(--bg-soft)}
      .library-card__cover.is-empty-cover{display:grid;place-items:center}
      .library-card__cover.is-empty-cover::after{content:"?";color:var(--text-soft);font-weight:800}
      .library-card__cover-fallback{width:100%;height:100%;display:grid;place-items:center;color:var(--text-soft)}
      .library-card__menu-btn{position:absolute;top:8px;right:8px;z-index:3;width:34px;height:34px;border-radius:999px;border:1px solid var(--border);background:color-mix(in srgb,var(--bg-elevated) 88%,transparent);color:var(--text);font-size:20px;line-height:1;box-shadow:var(--shadow)}
      .library-card__body{display:flex;flex-direction:column;gap:7px;padding:12px 4px 4px}
      .library-card__badges{display:flex;flex-wrap:wrap;gap:6px}
      .library-badge{display:inline-flex;align-items:center;min-height:24px;padding:4px 8px;border-radius:999px;background:var(--accent-soft);font-size:12px;color:var(--text)}
      .library-badge.folder{background:var(--bg-soft)}
      .library-card__title{font-size:15px;font-weight:750;line-height:1.35;color:var(--text)}
      .library-card__subtitle,.library-card__meta{font-size:13px;color:var(--text-soft);line-height:1.4}
      .empty-state{padding:40px 20px;text-align:center;color:var(--text-soft);border:1px solid var(--border-soft);border-radius:18px;background:var(--surface);display:flex;flex-direction:column;gap:8px}
      .empty-state__title{color:var(--text);font-size:18px;font-weight:700}
      .category-guest{display:flex;flex-direction:column;gap:16px}
      .category-guest__title{font-size:28px;font-weight:800;color:var(--text)}
      .category-guest__card{border:1px solid var(--border-soft);background:var(--surface);border-radius:20px;padding:20px}
      .category-guest__text{color:var(--text-soft);line-height:1.6;margin-bottom:14px}
      .category-guest__button{padding:10px 16px;border-radius:999px;background:var(--accent);color:#fff;font-weight:700}
      .action-modal-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.48)}
      .action-modal{width:min(100%,440px);max-height:min(86vh,720px);overflow:auto;border-radius:24px;border:1px solid var(--border);background:var(--bg-elevated);box-shadow:var(--shadow);padding:18px;color:var(--text)}
      .action-modal__header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}
      .action-modal__title{font-size:18px;font-weight:800;line-height:1.35}
      .action-modal__close{width:34px;height:34px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:22px;line-height:1}
      .action-modal__group{display:flex;flex-direction:column;gap:10px;padding:14px 0;border-top:1px solid var(--border-soft)}
      .action-modal__group-title{font-size:13px;font-weight:800;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em}
      .action-modal__options{display:flex;flex-wrap:wrap;gap:8px}
      .action-modal__option{padding:10px 12px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-weight:650}
      .action-modal__option.active{background:var(--accent);border-color:transparent;color:#fff}
      .action-modal__option.muted{color:var(--text-soft)}
      .action-modal__folder-form{display:flex;gap:8px}
      .action-modal__input{flex:1;min-width:0;min-height:42px;border-radius:14px;border:1px solid var(--border);background:var(--surface);color:var(--text);padding:0 12px}
      .action-modal__small-btn{min-height:42px;border-radius:14px;background:var(--accent-soft);color:var(--text);padding:0 12px;font-weight:750}
      .action-modal__delete{width:100%;min-height:44px;border-radius:14px;background:transparent;color:var(--danger);border:1px solid color-mix(in srgb,var(--danger) 45%,transparent);font-weight:800}
      .action-modal__hint{color:var(--text-soft);font-size:14px}
      @media (max-width:640px){
        .library-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        .page-header{align-items:stretch}
        .page-actions{width:100%;flex-wrap:wrap}
        .sort-select,.add-btn,.folder-action-btn{flex:1}
        .library-card{border-radius:18px;padding:8px}
        .action-modal{border-radius:22px;padding:16px}
        .action-modal__folder-form{flex-direction:column}
      }
    </style>
  `;
}

function sameItemList(a = [], b = []) {
  if (a.length !== b.length) return false;

  return a.every((item, index) => {
    const other = b[index];

    return JSON.stringify({
      id: item?.id || null,
      status: item?.status || "",
      folder_name: item?.folder_name || "",
      updated_at: item?.updated_at || "",
      entity_id: item?.entity_id || null,
      title: item?.media_entities?.title_primary || "",
      cover: item?.media_entities?.cover_url || "",
      description_ru: item?.media_entities?.description_ru || "",
      description_en: item?.media_entities?.description_en || "",
      year: item?.media_entities?.year || null
    }) === JSON.stringify({
      id: other?.id || null,
      status: other?.status || "",
      folder_name: other?.folder_name || "",
      updated_at: other?.updated_at || "",
      entity_id: other?.entity_id || null,
      title: other?.media_entities?.title_primary || "",
      cover: other?.media_entities?.cover_url || "",
      description_ru: other?.media_entities?.description_ru || "",
      description_en: other?.media_entities?.description_en || "",
      year: other?.media_entities?.year || null
    });
  });
}

export async function renderCategoryPage(root, params = {}) {
  const category = params.category || "unknown";
  const title = getCategoryLabel(state.language, category);
  const userId = state.user?.id;
  const authStatus = state.authStatus;

  setCurrentCategory(category);

  if (!userId && authStatus === "restoring") {
    root.innerHTML = `
      ${renderStyles()}
      <section class="page">
        <div class="page-header">
          <div class="page-title">${escapeHtml(title)}</div>
        </div>
        ${renderLoadingState()}
      </section>
    `;
    return () => {};
  }

  if (!userId) {
    renderGuestState(root, title);
    return () => {};
  }

  const savedViewState = getCategoryViewState(category) || {};

  let items = [];
  let activeFolder = savedViewState.folder || "all";
  let activeSort = savedViewState.sort || "recent";
  let isDestroyed = false;
  let isRefreshing = false;
  let lastListSignature = "";
  let activeModalItemId = null;

  root.innerHTML = `
    ${renderStyles()}

    <section class="page">
      <div class="page-header">
        <div class="page-title">${escapeHtml(title)}</div>

        <div class="page-actions">
          <select class="sort-select" data-sort>
            <option value="recent">${escapeHtml(t("sortRecent"))}</option>
            <option value="title">${escapeHtml(t("sortTitle"))}</option>
            <option value="year">${escapeHtml(t("sortYear"))}</option>
          </select>
          <button class="folder-action-btn" type="button" data-action="open-category-folder-menu">${escapeHtml(t("folders"))}</button>
          <button class="add-btn" type="button" data-action="add">${escapeHtml(t("add"))}</button>
        </div>
      </div>

      <div class="folder-row" data-folders></div>

      <div data-content>
        ${renderLoadingState()}
      </div>

      <div data-action-modal-root></div>
    </section>
  `;

  const sortSelect = root.querySelector("[data-sort]");
  const foldersRoot = root.querySelector("[data-folders]");
  const contentRoot = root.querySelector("[data-content]");
  const modalRoot = root.querySelector("[data-action-modal-root]");

  if (sortSelect) {
    sortSelect.value = activeSort;
  }

  function getCurrentFolders() {
    return uniqueFolders(items, category);
  }

  function getVisibleItems() {
    return sortItems(filterItems(items, activeFolder), activeSort);
  }

  function renderList({ force = false } = {}) {
    if (isDestroyed) return;

    const folders = getCurrentFolders();

    if (activeFolder !== "all" && !folders.includes(activeFolder)) {
      activeFolder = "all";
      setCategoryViewState(category, { folder: activeFolder });
    }

    foldersRoot.innerHTML = renderFolderTabs(folders, activeFolder);

    const visibleItems = getVisibleItems();
    const signature = JSON.stringify({
      activeFolder,
      activeSort,
      items: visibleItems.map((item) => ({
        id: item.id,
        status: item.status,
        folder_name: item.folder_name || "",
        updated_at: item.updated_at || "",
        title: item.media_entities?.title_primary || "",
        cover: item.media_entities?.cover_url || "",
        description_ru: item.media_entities?.description_ru || "",
        description_en: item.media_entities?.description_en || ""
      }))
    });

    if (!force && signature === lastListSignature) return;

    lastListSignature = signature;

    contentRoot.innerHTML = visibleItems.length
      ? `<div class="library-grid">${visibleItems.map(renderLibraryCard).join("")}</div>`
      : renderEmptyState(title);
  }

  function closeActionModal() {
    activeModalItemId = null;
    modalRoot.innerHTML = "";
  }

  function openItemModal(itemId) {
    const cleanId = Number(itemId || 0);
    const item = items.find((row) => Number(row.id) === cleanId);
    if (!item) return;

    activeModalItemId = cleanId;
    modalRoot.innerHTML = renderActionModal({
      item,
      folders: getCurrentFolders(),
      category
    });
  }

  function openCategoryFolderModal() {
    activeModalItemId = null;
    modalRoot.innerHTML = renderActionModal({
      item: null,
      folders: getCurrentFolders(),
      category
    });
  }

  function patchLocalItem(userMediaId, patch = {}) {
    const cleanId = Number(userMediaId || 0);

    items = items.map((item) => {
      if (Number(item.id) !== cleanId) return item;

      return {
        ...item,
        ...patch,
        media_entities: patch.media_entities || item.media_entities
      };
    });
  }

  async function setItemBusy(userMediaId, busy = true) {
    const card = root.querySelector(`[data-user-media-id="${CSS.escape(String(userMediaId))}"]`);
    if (!card) return;

    card.classList.toggle("is-busy", Boolean(busy));
  }

  async function handleStatusChange(userMediaId, nextStatus) {
    const cleanId = Number(userMediaId || 0);
    const cleanStatus = cleanText(nextStatus) || "planned";
    const previous = items.find((item) => Number(item.id) === cleanId);

    if (!cleanId || !previous) return;

    await setItemBusy(cleanId, true);

    try {
      const updated = await updateUserMedia(cleanId, {
        status: cleanStatus
      });

      const nextItem = updated || {
        ...previous,
        status: cleanStatus,
        updated_at: new Date().toISOString()
      };

      patchLocalItem(cleanId, nextItem);
      updateCachedLibraryItem(userId, nextItem, { category });

      renderList({ force: true });
      openItemModal(cleanId);
    } catch (error) {
      console.warn("Status update skipped:", error);
    } finally {
      await setItemBusy(cleanId, false);
    }
  }

  async function handleFolderChange(userMediaId, nextFolder) {
    const cleanId = Number(userMediaId || 0);
    const cleanFolder = normalizeFolderName(nextFolder);
    const previous = items.find((item) => Number(item.id) === cleanId);

    if (!cleanId || !previous) return;

    await setItemBusy(cleanId, true);

    try {
      if (cleanFolder) {
        addEmptyFolder(category, cleanFolder);
      }

      const updated = await updateUserMedia(cleanId, {
        folder_name: cleanFolder || null
      });

      const nextItem = updated || {
        ...previous,
        folder_name: cleanFolder || null,
        updated_at: new Date().toISOString()
      };

      patchLocalItem(cleanId, nextItem);
      updateCachedLibraryItem(userId, nextItem, { category });

      removeEmptyFolderIfUnused(category, previous.folder_name, items);

      renderList({ force: true });
      openItemModal(cleanId);
    } catch (error) {
      console.warn("Folder update skipped:", error);
    } finally {
      await setItemBusy(cleanId, false);
    }
  }

  async function handleDelete(userMediaId) {
    const cleanId = Number(userMediaId || 0);
    const previous = items.find((item) => Number(item.id) === cleanId);

    if (!cleanId || !previous) return;
    if (!window.confirm(t("confirmDelete"))) return;

    await setItemBusy(cleanId, true);

    try {
      await removeFromLibrary(cleanId);

      items = items.filter((item) => Number(item.id) !== cleanId);
      removeCachedLibraryItem(userId, cleanId, { category });
      removeEmptyFolderIfUnused(category, previous.folder_name, items);

      closeActionModal();
      renderList({ force: true });
    } catch (error) {
      console.warn("Delete skipped:", error);
    } finally {
      await setItemBusy(cleanId, false);
    }
  }

  async function loadInitialItems() {
    try {
      const loaded = await loadUserLibrary(userId, {
        mode: "list",
        category,
        allowStale: true,
        backgroundRefresh: true
      });

      if (isDestroyed) return;

      items = safeArray(loaded);
      renderList({ force: true });

      if (!isRefreshing) {
        isRefreshing = true;

        refreshUserLibrary(userId, {
          mode: "list",
          category,
          force: true
        })
          .then((freshItems) => {
            if (isDestroyed) return;

            const normalizedFreshItems = safeArray(freshItems);

            if (!sameItemList(items, normalizedFreshItems)) {
              items = normalizedFreshItems;
              renderList({ force: true });
            }
          })
          .catch((error) => {
            console.warn("Category refresh skipped:", error);

            if (!items.length) {
              contentRoot.innerHTML = renderErrorState(false);
            }
          })
          .finally(() => {
            isRefreshing = false;
          });
      }
    } catch (error) {
      console.warn("Category load skipped:", error);

      if (!isDestroyed) {
        contentRoot.innerHTML = renderErrorState(items.length > 0);
      }
    }
  }

  function handleRootClick(event) {
    const target = event.target;
    const actionTarget = target.closest("[data-action]");
    const folderTarget = target.closest("[data-folder]");

    if (folderTarget) {
      activeFolder = folderTarget.getAttribute("data-folder") || "all";
      setCategoryViewState(category, { folder: activeFolder });
      renderList({ force: true });
      return;
    }

    if (!actionTarget) return;

    const action = actionTarget.getAttribute("data-action");

    if (action === "add") {
      openSearchModal("", { category });
      return;
    }

    if (action === "open-category-folder-menu") {
      openCategoryFolderModal();
      return;
    }

    if (action === "open-item-menu") {
      event.preventDefault();
      event.stopPropagation();
      openItemModal(actionTarget.getAttribute("data-user-media-id"));
      return;
    }

    if (action === "open-card") {
      const key = actionTarget.getAttribute("data-key") || "";
      const cardCategory = actionTarget.getAttribute("data-category") || category;
      const userMediaId = Number(actionTarget.getAttribute("data-user-media-id") || 0);
      const item = items.find((row) => Number(row.id) === userMediaId);

      if (item?.media_entities) {
        setTemporaryCardItem(item.media_entities);
      }

      if (key) {
        navigate(ROUTES.CARD, {
          key,
          category: cardCategory
        });
      }

      return;
    }

    if (action === "close-action-modal") {
      if (event.target === actionTarget || actionTarget.classList.contains("action-modal__close")) {
        closeActionModal();
      }
      return;
    }

    const modal = target.closest(".action-modal");
    const modalCardId = Number(modal?.getAttribute("data-modal-card") || activeModalItemId || 0);

    if (action === "modal-set-status") {
      handleStatusChange(modalCardId, actionTarget.getAttribute("data-value"));
      return;
    }

    if (action === "modal-set-folder") {
      handleFolderChange(modalCardId, actionTarget.getAttribute("data-value"));
      return;
    }

    if (action === "modal-remove-folder") {
      handleFolderChange(modalCardId, "");
      return;
    }

    if (action === "modal-delete") {
      handleDelete(modalCardId);
    }
  }

  function handleRootSubmit(event) {
    const form = event.target.closest('[data-action="modal-create-folder"]');
    if (!form) return;

    event.preventDefault();

    const input = form.querySelector("[data-folder-input]");
    const folderName = normalizeFolderName(input?.value || "");
    if (!folderName) return;

    addEmptyFolder(category, folderName);

    if (activeModalItemId) {
      handleFolderChange(activeModalItemId, folderName);
      return;
    }

    if (input) input.value = "";
    openCategoryFolderModal();
    renderList({ force: true });
  }

  function handleSortChange(event) {
    if (event.target !== sortSelect) return;

    activeSort = sortSelect.value || "recent";
    setCategoryViewState(category, { sort: activeSort });
    renderList({ force: true });
  }

  root.addEventListener("click", handleRootClick);
  root.addEventListener("submit", handleRootSubmit);
  sortSelect?.addEventListener("change", handleSortChange);

  await loadInitialItems();

  return () => {
    isDestroyed = true;
    root.removeEventListener("click", handleRootClick);
    root.removeEventListener("submit", handleRootSubmit);
    sortSelect?.removeEventListener("change", handleSortChange);
  };
}
