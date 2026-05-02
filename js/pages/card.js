import { escapeHtml, clampText, safeArray } from "../utils.js";
import { getCategoryLabel, STATUS_LABELS } from "../config.js";
import { navigate } from "../router.js";
import {
  state,
  openAuthModal,
  getTemporaryCardItem,
  getStoredCardItemByKey
} from "../state.js";

import {
  getEntityByCanonicalKey,
  addToUserLibrary,
  getEntityCompleteness
} from "../services/entity-db.js";

import {
  getRelatedItemsForEntityFromDb,
  getEntityUniverseLinksFromDb
} from "../services/universe-db.js";

import {
  getSupabaseClient,
  withTimeout
} from "../lib/supabase-client.js";

import {
  getCachedLibraryItem,
  updateCachedLibraryItem,
  removeCachedLibraryItem,
  loadUserLibrary
} from "../services/library-cache.js";

const CARD_TIMEOUT_MS = 9000;
const MUTATION_TIMEOUT_MS = 9000;
const EMPTY_FOLDERS_KEY = "plamut_empty_folders_by_category_v1";

const USER_MEDIA_WITH_ENTITY_SELECT = `
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
    relations_status,
    manual_locked,
    manual_verified
  )
`;

const I18N = {
  ru: {
    loadingCard: "Загрузка карточки…",
    cardNotFound: "Карточка не найдена.",
    unavailableTitle: "Карточка временно недоступна",
    unavailableDescription: "Не удалось быстро загрузить данные из базы.",
    actions: "Действия",
    addToLibrary: "Добавить в библиотеку",
    adding: "Добавляем…",
    alreadyInLibrary: "Уже есть в библиотеке",
    cardPreparing: "Карточка подготавливается",
    cardPreparingText: "Эту preview-карточку пока нельзя сохранить: не хватает данных.",
    missingFields: "Не хватает",
    cardNotReady: "Карточка пока не готова к сохранению.",
    status: "Статус",
    folder: "Папка",
    createFolder: "Создать папку",
    newFolderName: "Название новой папки",
    removeFolder: "Убрать из папки",
    deleteFromLibrary: "Удалить из библиотеки",
    confirmDeleteText: "Карточка будет удалена из твоей библиотеки.",
    description: "Описание",
    noDescription: "Описание пока уточняется",
    related: "Связанные",
    universes: "Вселенные",
    universe: "Вселенная",
    continuity: "Линия",
    branch: "Ветка",
    planned: "Запланировано",
    in_progress: "В процессе",
    done: "Завершено",
    dropped: "Брошено",
    saved: "Сохранено",
    deleted: "Удалено из библиотеки",
    folderUpdated: "Папка обновлена",
    statusUpdated: "Статус обновлён",
    signIn: "Войти",
    preview: "Preview",
    fromDb: "Из базы",
    category: "Категория",
    year: "Год",
    originalTitle: "Оригинальное название"
  },
  en: {
    loadingCard: "Loading card…",
    cardNotFound: "Card not found.",
    unavailableTitle: "Card is temporarily unavailable",
    unavailableDescription: "Could not quickly load data from the database.",
    actions: "Actions",
    addToLibrary: "Add to library",
    adding: "Adding…",
    alreadyInLibrary: "Already in library",
    cardPreparing: "Card is being prepared",
    cardPreparingText: "This preview card cannot be saved yet: it needs more data.",
    missingFields: "Missing",
    cardNotReady: "The card is not ready to save yet.",
    status: "Status",
    folder: "Folder",
    createFolder: "Create folder",
    newFolderName: "New folder name",
    removeFolder: "Remove from folder",
    deleteFromLibrary: "Delete from library",
    confirmDeleteText: "This card will be removed from your library.",
    description: "Description",
    noDescription: "Description is being updated",
    related: "Related",
    universes: "Universes",
    universe: "Universe",
    continuity: "Continuity",
    branch: "Branch",
    planned: "Planned",
    in_progress: "In progress",
    done: "Done",
    dropped: "Dropped",
    saved: "Saved",
    deleted: "Removed from library",
    folderUpdated: "Folder updated",
    statusUpdated: "Status updated",
    signIn: "Sign in",
    preview: "Preview",
    fromDb: "From database",
    category: "Category",
    year: "Year",
    originalTitle: "Original title"
  }
};

function t(key) {
  const language = state.language === "en" ? "en" : "ru";
  return I18N[language][key] || I18N.ru[key] || key;
}

function clean(value = "") {
  return String(value || "").trim();
}

function normalizeKey(value = "") {
  return clean(value).toLowerCase();
}

function normalizeFolderName(value = "") {
  return clean(value).replace(/\s+/g, " ").slice(0, 48);
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
  const cleanCategory = clean(category);
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

function isTempMode(params = {}) {
  return clean(params.mode) === "temp";
}

function isFallbackEntity(entity = {}) {
  return Boolean(entity?.__fallback);
}

function isPreviewEntity(entity = {}) {
  return Boolean(entity?.__mode === "temp" || entity?.meta?.search_preview || entity?.__source === "search");
}

function normalizeEntityForView(item = {}) {
  if (!item || typeof item !== "object") return null;

  return {
    ...item,
    canonical_key: clean(item.canonical_key),
    category: clean(item.category),
    primary_source: clean(item.primary_source || item.source || ""),
    title_primary: clean(item.title_primary || item.title || item.title_ru || item.title_en || item.original_title || ""),
    title_ru: clean(item.title_ru),
    title_en: clean(item.title_en),
    original_title: clean(item.original_title || item.title_en || item.title || ""),
    year: item.year || null,
    cover_url: clean(item.cover_url),
    description_ru: clean(item.description_ru || item.description || ""),
    description_en: clean(item.description_en || ""),
    external_ids: item.external_ids && typeof item.external_ids === "object" ? item.external_ids : {},
    meta: item.meta && typeof item.meta === "object" ? item.meta : {},
    universe_key: clean(item.universe_key),
    relations_built_at: item.relations_built_at || null,
    relations_status: clean(item.relations_status || "")
  };
}

function resolveTitle(entity = {}) {
  const lang = state.language === "en" ? "en" : "ru";

  if (lang === "en") {
    return (
      clean(entity.display_title) ||
      clean(entity.title_en) ||
      clean(entity.title_primary) ||
      clean(entity.title_ru) ||
      clean(entity.original_title) ||
      clean(entity.title) ||
      t("unavailableTitle")
    );
  }

  return (
    clean(entity.display_title) ||
    clean(entity.title_ru) ||
    clean(entity.title_primary) ||
    clean(entity.title_en) ||
    clean(entity.original_title) ||
    clean(entity.title) ||
    t("unavailableTitle")
  );
}

function resolveDescription(entity = {}) {
  const lang = state.language === "en" ? "en" : "ru";

  if (lang === "en") {
    return clean(entity.description_en || entity.description_ru || entity.description || "");
  }

  return clean(entity.description_ru || entity.description_en || entity.description || "");
}

function getCover(entity = {}) {
  const cover = clean(entity.cover_url);
  if (!cover || cover === "undefined" || cover === "null" || cover.includes("/placeholder")) return "";
  return cover;
}

function getStatusLabel(status = "") {
  const key = clean(status);
  return t(key) || STATUS_LABELS[key] || key || t("planned");
}

function getCompleteness(entity = {}) {
  try {
    return getEntityCompleteness(entity);
  } catch {
    return {
      complete: false,
      missing: ["unknown"],
      entity
    };
  }
}

function isEntityReadyToSave(entity = {}) {
  return Boolean(getCompleteness(entity).complete);
}

function getMissingText(entity = {}) {
  const missing = safeArray(getCompleteness(entity).missing).filter(Boolean);
  return missing.length ? `${t("missingFields")}: ${missing.join(", ")}` : t("cardNotReady");
}

function getCachedEntityByKey(userId, key) {
  if (!userId || !key) return null;

  const cached =
    getCachedLibraryItem(userId, key, { mode: "full", allowExpired: true }) ||
    getCachedLibraryItem(userId, key, { mode: "list", allowExpired: true });

  return normalizeEntityForView(cached?.media_entities || null);
}

function getCachedUserMedia(userId, entity = {}) {
  if (!userId || !entity?.canonical_key) return null;

  const cached =
    getCachedLibraryItem(userId, entity.canonical_key, { mode: "full", allowExpired: true }) ||
    getCachedLibraryItem(userId, entity.canonical_key, { mode: "list", allowExpired: true });

  if (!cached?.id) return null;

  return {
    id: cached.id,
    user_id: cached.user_id,
    entity_id: cached.entity_id,
    category: cached.category,
    status: cached.status,
    folder_name: cached.folder_name,
    created_at: cached.created_at,
    updated_at: cached.updated_at
  };
}

function buildFallbackEntity(params = {}) {
  const key = normalizeKey(params.key || "");
  const category = clean(params.category || "");

  if (!key) return null;

  return {
    id: null,
    canonical_key: key,
    category,
    title_primary: t("unavailableTitle"),
    title_ru: "",
    title_en: "",
    original_title: key,
    year: null,
    cover_url: "",
    description_ru: t("unavailableDescription"),
    description_en: t("unavailableDescription"),
    external_ids: {},
    meta: {},
    relations_status: "unknown",
    __fallback: true
  };
}

function loadFastEntity(params = {}) {
  const key = normalizeKey(params.key || "");
  const userId = state.user?.id || "";

  const cachedEntity = getCachedEntityByKey(userId, key);
  const temp = normalizeEntityForView(getTemporaryCardItem());
  const stored = normalizeEntityForView(getStoredCardItemByKey(key));

  if (isTempMode(params)) {
    const tempMatch = [temp, stored].find((item) =>
      item?.canonical_key && (!key || normalizeKey(item.canonical_key) === key)
    );

    return tempMatch || cachedEntity || null;
  }

  const candidates = [cachedEntity, stored, temp].filter(Boolean);
  const matching = candidates.find((item) =>
    item?.canonical_key && (!key || normalizeKey(item.canonical_key) === key)
  );

  return matching || null;
}

async function loadEntityFromDb(key) {
  if (!key) return null;

  const entityFromService = await withTimeout(
    getEntityByCanonicalKey(key),
    "Загрузка карточки",
    CARD_TIMEOUT_MS
  ).catch(() => null);

  return normalizeEntityForView(entityFromService);
}

async function loadUserMedia(userId, entityId) {
  if (!userId || !entityId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("user_media")
      .select(USER_MEDIA_WITH_ENTITY_SELECT)
      .eq("user_id", userId)
      .eq("entity_id", entityId)
      .maybeSingle(),
    "Загрузка статуса карточки",
    CARD_TIMEOUT_MS
  );

  if (error) throw error;

  return data || null;
}

async function updateUserMedia(userMediaId, payload) {
  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("user_media")
      .update(payload)
      .eq("id", userMediaId)
      .select(USER_MEDIA_WITH_ENTITY_SELECT)
      .maybeSingle(),
    "Обновление карточки",
    MUTATION_TIMEOUT_MS
  );

  if (error) throw error;
  return data || null;
}

async function deleteUserMedia(userMediaId) {
  const supabase = getSupabaseClient();

  const { error } = await withTimeout(
    supabase
      .from("user_media")
      .delete()
      .eq("id", userMediaId),
    "Удаление карточки",
    MUTATION_TIMEOUT_MS
  );

  if (error) throw error;

  return true;
}

async function loadCategoryFolders(userId, category = "") {
  const cleanCategory = clean(category);
  if (!userId || !cleanCategory) return getEmptyFolders(cleanCategory);

  const libraryItems = await loadUserLibrary(userId, {
    mode: "list",
    category: cleanCategory,
    allowStale: true,
    backgroundRefresh: false
  }).catch(() => []);

  const fromItems = safeArray(libraryItems)
    .map((item) => item.folder_name || "")
    .map(normalizeFolderName)
    .filter(Boolean);

  return [...new Set([...fromItems, ...getEmptyFolders(cleanCategory)])]
    .sort((a, b) => a.localeCompare(b, state.language === "en" ? "en" : "ru"));
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
        onerror="this.style.display='none';this.parentElement.classList.add('is-empty');"
      />
    `;
  }

  return `<div class="card-cover__fallback">?</div>`;
}

function renderRelatedItem(item = {}) {
  const entity = item.media_entities || item;
  const title = resolveTitle(entity);
  const key = entity.canonical_key || "";
  const cover = getCover(entity);

  return `
    <button class="related-card" type="button" data-related="${escapeHtml(key)}">
      <div class="related-card__cover">
        ${
          cover
            ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" onerror="this.style.display='none';this.parentElement.classList.add('is-empty');">`
            : `<div class="related-card__fallback">?</div>`
        }
      </div>
      <div class="related-card__body">
        <div class="related-card__title">${escapeHtml(clampText(title, 70))}</div>
        <div class="related-card__meta">
          ${escapeHtml(getCategoryLabel(state.language, entity.category || ""))}
          ${entity.year ? ` · ${escapeHtml(String(entity.year))}` : ""}
        </div>
      </div>
    </button>
  `;
}

function groupUniverseLinks(links = []) {
  const grouped = new Map();

  safeArray(links).forEach((link) => {
    const universeKey = link.universe_key || "unknown";
    const continuityKey = link.continuity_key || "unknown";
    const branchKey = link.branch_key || "unknown";

    if (!grouped.has(universeKey)) {
      grouped.set(universeKey, {
        universe_key: universeKey,
        universe_title: link.universe_title || t("universe"),
        continuities: new Map()
      });
    }

    const universe = grouped.get(universeKey);

    if (!universe.continuities.has(continuityKey)) {
      universe.continuities.set(continuityKey, {
        continuity_key: continuityKey,
        continuity_title: link.continuity_title || t("continuity"),
        branches: new Map()
      });
    }

    const continuity = universe.continuities.get(continuityKey);

    if (!continuity.branches.has(branchKey)) {
      continuity.branches.set(branchKey, {
        branch_key: branchKey,
        branch_title: link.branch_title || t("branch")
      });
    }
  });

  return Array.from(grouped.values()).map((universe) => ({
    ...universe,
    continuities: Array.from(universe.continuities.values()).map((continuity) => ({
      ...continuity,
      branches: Array.from(continuity.branches.values())
    }))
  }));
}

function renderUniverseLinks(links = []) {
  if (!links.length) return "";

  const grouped = groupUniverseLinks(links);

  return `
    <div class="card-section" data-universe-links-section>
      <div class="card-section__title">${escapeHtml(t("universes"))}</div>
      <div class="universe-links">
        ${grouped.map((universe) => `
          <button class="universe-link" type="button" data-universe-key="${escapeHtml(universe.universe_key)}">
            <div class="universe-link__title">${escapeHtml(universe.universe_title)}</div>
            ${universe.continuities.map((continuity) => `
              <div class="universe-link__continuity">${escapeHtml(continuity.continuity_title)}</div>
              <div class="universe-link__branches">
                ${continuity.branches.map((branch) => `<span>${escapeHtml(branch.branch_title)}</span>`).join("")}
              </div>
            `).join("")}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderActionModal({ userMedia = null, folders = [], canAdd = true } = {}) {
  const currentStatus = userMedia?.status || "";
  const currentFolder = userMedia?.folder_name || "";

  if (!userMedia?.id) {
    return `
      <div class="card-action-backdrop" data-action="close-action-modal">
        <div class="card-action-modal" role="dialog" aria-modal="true">
          <div class="card-action-modal__header">
            <div class="card-action-modal__title">${escapeHtml(t("actions"))}</div>
            <button class="card-action-modal__close" type="button" data-action="close-action-modal">×</button>
          </div>

          <section class="card-action-modal__group">
            <button
              class="card-action-modal__primary ${canAdd ? "" : "is-muted"}"
              type="button"
              data-action="modal-add"
            >
              ${escapeHtml(canAdd ? t("addToLibrary") : t("cardPreparing"))}
            </button>
          </section>
        </div>
      </div>
    `;
  }

  const statusButtons = ["planned", "in_progress", "done", "dropped"]
    .map((status) => `
      <button
        class="card-action-modal__option ${currentStatus === status ? "active" : ""}"
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
        class="card-action-modal__option ${currentFolder === folder ? "active" : ""}"
        type="button"
        data-action="modal-set-folder"
        data-value="${escapeHtml(folder)}"
      >
        ${escapeHtml(folder)}
      </button>
    `)
    .join("");

  return `
    <div class="card-action-backdrop" data-action="close-action-modal">
      <div class="card-action-modal" role="dialog" aria-modal="true">
        <div class="card-action-modal__header">
          <div class="card-action-modal__title">${escapeHtml(t("actions"))}</div>
          <button class="card-action-modal__close" type="button" data-action="close-action-modal">×</button>
        </div>

        <section class="card-action-modal__group">
          <div class="card-action-modal__group-title">${escapeHtml(t("status"))}</div>
          <div class="card-action-modal__options">${statusButtons}</div>
        </section>

        <section class="card-action-modal__group">
          <div class="card-action-modal__group-title">${escapeHtml(t("folder"))}</div>
          <div class="card-action-modal__options">
            ${folderButtons}
            ${currentFolder ? `
              <button class="card-action-modal__option muted" type="button" data-action="modal-remove-folder">
                ${escapeHtml(t("removeFolder"))}
              </button>
            ` : ""}
          </div>

          <form class="card-action-modal__folder-form" data-action="modal-create-folder">
            <input
              class="card-action-modal__input"
              type="text"
              maxlength="48"
              placeholder="${escapeHtml(t("newFolderName"))}"
              data-folder-input
            />
            <button class="card-action-modal__small-btn" type="submit">
              ${escapeHtml(t("createFolder"))}
            </button>
          </form>
        </section>

        <section class="card-action-modal__group danger">
          <button class="card-action-modal__delete" type="button" data-action="modal-delete">
            ${escapeHtml(t("deleteFromLibrary"))}
          </button>
        </section>
      </div>
    </div>
  `;
}

function renderStyles() {
  return `
    <style>
      .card-page{display:flex;flex-direction:column;gap:18px}
      .card-shell{position:relative;display:grid;grid-template-columns:132px 1fr;gap:16px;padding:16px;border-radius:22px;border:1px solid var(--border-soft);background:var(--bg-elevated)}
      .card-shell.is-preview{border-color:color-mix(in srgb,var(--accent) 42%,var(--border-soft))}
      .card-cover{width:132px;aspect-ratio:2/3;overflow:hidden;border-radius:16px;border:1px solid var(--border-soft);background:var(--surface)}
      .card-cover img{width:100%;height:100%;object-fit:cover}
      .card-cover.is-empty{display:grid;place-items:center}
      .card-cover.is-empty::after{content:"?";color:var(--text-soft);font-weight:850;font-size:28px}
      .card-cover__fallback{width:100%;height:100%;display:grid;place-items:center;color:var(--text-soft);font-size:28px;font-weight:850}
      .card-main{min-width:0;display:flex;flex-direction:column;gap:12px;padding-right:44px}
      .card-title{font-size:24px;line-height:1.15;font-weight:850;color:var(--text)}
      .card-subtitle{color:var(--text-soft);font-size:14px;line-height:1.4}
      .card-badges{display:flex;gap:8px;flex-wrap:wrap}
      .card-badge{display:inline-flex;align-items:center;min-height:26px;padding:5px 9px;border-radius:999px;background:var(--accent-soft);color:var(--text);font-size:12px}
      .card-badge.folder{background:var(--bg-soft)}
      .card-badge.muted{background:var(--surface);color:var(--text-soft);border:1px solid var(--border-soft)}
      .card-badge.warning{background:color-mix(in srgb,var(--danger) 12%,var(--surface));color:var(--danger)}
      .card-menu-wrap{position:absolute;top:14px;right:14px;z-index:10}
      .card-menu-btn{width:38px;height:38px;display:grid;place-items:center;border-radius:999px;border:1px solid var(--border);background:var(--surface-strong);color:var(--text);font-size:22px;line-height:1}
      .card-status{min-height:20px;font-size:13px;color:var(--text-soft)}
      .card-section{padding:16px;border-radius:18px;border:1px solid var(--border-soft);background:var(--surface)}
      .card-section__title{font-size:17px;font-weight:850;color:var(--text);margin-bottom:10px}
      .card-description{color:var(--text-soft);font-size:15px;line-height:1.55;white-space:pre-line}
      .card-preparing{display:flex;flex-direction:column;gap:7px;padding:13px;border-radius:16px;border:1px solid color-mix(in srgb,var(--danger) 28%,var(--border-soft));background:color-mix(in srgb,var(--danger) 7%,var(--surface));color:var(--text-soft);font-size:14px;line-height:1.45}
      .card-preparing__title{color:var(--text);font-weight:850}
      .related-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
      .related-card{display:grid;grid-template-columns:54px 1fr;gap:10px;align-items:center;padding:8px;border-radius:14px;border:1px solid var(--border-soft);background:var(--bg-elevated);color:var(--text);text-align:left}
      .related-card__cover{width:54px;height:76px;border-radius:10px;overflow:hidden;background:var(--surface);border:1px solid var(--border-soft)}
      .related-card__cover img{width:100%;height:100%;object-fit:cover}
      .related-card__fallback{width:100%;height:100%;display:grid;place-items:center;color:var(--text-soft)}
      .related-card__title{font-size:14px;font-weight:800;line-height:1.25}
      .related-card__meta{font-size:12px;color:var(--text-soft);margin-top:5px}
      .universe-links{display:grid;gap:10px}
      .universe-link{width:100%;display:flex;flex-direction:column;gap:7px;padding:12px;border-radius:15px;border:1px solid var(--border-soft);background:var(--bg-elevated);color:var(--text);text-align:left}
      .universe-link__title{font-weight:850;line-height:1.25}
      .universe-link__continuity{color:var(--text-soft);font-size:13px}
      .universe-link__branches{display:flex;flex-wrap:wrap;gap:6px}
      .universe-link__branches span{font-size:12px;color:var(--text-soft);background:var(--bg-soft);padding:4px 8px;border-radius:999px}
      .card-action-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.48)}
      .card-action-modal{width:min(100%,440px);max-height:min(86vh,720px);overflow:auto;border-radius:24px;border:1px solid var(--border);background:var(--bg-elevated);box-shadow:var(--shadow);padding:18px;color:var(--text)}
      .card-action-modal__header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}
      .card-action-modal__title{font-size:18px;font-weight:850}
      .card-action-modal__close{width:34px;height:34px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:22px;line-height:1}
      .card-action-modal__group{display:flex;flex-direction:column;gap:10px;padding:14px 0;border-top:1px solid var(--border-soft)}
      .card-action-modal__group-title{font-size:13px;font-weight:850;color:var(--text-soft);text-transform:uppercase;letter-spacing:.04em}
      .card-action-modal__options{display:flex;flex-wrap:wrap;gap:8px}
      .card-action-modal__option{padding:10px 12px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-weight:650}
      .card-action-modal__option.active{background:var(--accent);border-color:transparent;color:#fff}
      .card-action-modal__option.muted{color:var(--text-soft)}
      .card-action-modal__folder-form{display:flex;gap:8px}
      .card-action-modal__input{flex:1;min-width:0;min-height:42px;border-radius:14px;border:1px solid var(--border);background:var(--surface);color:var(--text);padding:0 12px}
      .card-action-modal__small-btn,.card-action-modal__primary{min-height:42px;border-radius:14px;background:var(--accent-soft);color:var(--text);padding:0 12px;font-weight:750}
      .card-action-modal__primary{width:100%;background:var(--accent);color:#fff}
      .card-action-modal__primary.is-muted{background:var(--accent-soft);color:var(--text-soft)}
      .card-action-modal__delete{width:100%;min-height:44px;border-radius:14px;background:transparent;color:var(--danger);border:1px solid color-mix(in srgb,var(--danger) 45%,transparent);font-weight:800}
      .empty-card{padding:24px;border-radius:18px;border:1px solid var(--border-soft);background:var(--surface);color:var(--text-soft)}
      @media(max-width:640px){
        .card-shell{grid-template-columns:96px 1fr;gap:12px;padding:12px;border-radius:18px}
        .card-cover{width:96px;border-radius:13px}
        .card-title{font-size:20px}
        .card-main{padding-right:38px}
        .related-grid{grid-template-columns:1fr}
        .card-action-modal__folder-form{flex-direction:column}
      }
    </style>
  `;
}

function renderLoading(root) {
  root.innerHTML = `
    ${renderStyles()}
    <div class="empty-card">${escapeHtml(t("loadingCard"))}</div>
  `;
}

function renderNotFound(root) {
  root.innerHTML = `
    ${renderStyles()}
    <div class="empty-card">${escapeHtml(t("cardNotFound"))}</div>
  `;
}

function renderPreparing(entity = {}) {
  if (isEntityReadyToSave(entity)) return "";

  return `
    <div class="card-preparing">
      <div class="card-preparing__title">${escapeHtml(t("cardPreparing"))}</div>
      <div>${escapeHtml(t("cardPreparingText"))}</div>
      <div>${escapeHtml(getMissingText(entity))}</div>
    </div>
  `;
}

function renderPage(root, viewState) {
  const {
    entity,
    userMedia,
    folders,
    relatedItems,
    universeLinks,
    actionModalOpen,
    statusText,
    preview
  } = viewState;

  const title = resolveTitle(entity);
  const description = resolveDescription(entity);
  const originalTitle = clean(entity.original_title);
  const canAdd = isEntityReadyToSave(entity) && !isFallbackEntity(entity);
  const categoryLabel = getCategoryLabel(state.language, entity.category || "");

  root.innerHTML = `
    ${renderStyles()}

    <section class="card-page">
      <article class="card-shell ${preview ? "is-preview" : ""}">
        <div class="card-cover">
          ${renderCover(entity)}
        </div>

        <div class="card-main">
          <div class="card-title">${escapeHtml(title)}</div>

          ${
            originalTitle && originalTitle !== title
              ? `<div class="card-subtitle">${escapeHtml(originalTitle)}</div>`
              : ""
          }

          <div class="card-badges">
            ${categoryLabel ? `<span class="card-badge">${escapeHtml(categoryLabel)}</span>` : ""}
            ${entity.year ? `<span class="card-badge muted">${escapeHtml(String(entity.year))}</span>` : ""}
            ${userMedia?.status ? `<span class="card-badge">${escapeHtml(getStatusLabel(userMedia.status))}</span>` : ""}
            ${userMedia?.folder_name ? `<span class="card-badge folder">${escapeHtml(userMedia.folder_name)}</span>` : ""}
            ${preview ? `<span class="card-badge warning">${escapeHtml(t("preview"))}</span>` : ""}
          </div>

          ${renderPreparing(entity)}

          <div class="card-status" data-card-status>${escapeHtml(statusText || "")}</div>
        </div>

        <div class="card-menu-wrap">
          <button class="card-menu-btn" type="button" data-action="open-action-modal" aria-label="${escapeHtml(t("actions"))}">⋯</button>
        </div>
      </article>

      <section class="card-section">
        <div class="card-section__title">${escapeHtml(t("description"))}</div>
        <div class="card-description">
          ${escapeHtml(description || t("noDescription"))}
        </div>
      </section>

      ${renderUniverseLinks(universeLinks)}

      ${
        relatedItems.length
          ? `
            <section class="card-section">
              <div class="card-section__title">${escapeHtml(t("related"))}</div>
              <div class="related-grid">
                ${relatedItems.map(renderRelatedItem).join("")}
              </div>
            </section>
          `
          : ""
      }

      ${actionModalOpen ? renderActionModal({ userMedia, folders, canAdd }) : ""}
    </section>
  `;
}

function bindRelated(root) {
  root.querySelectorAll("[data-related]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.related || "";
      if (!key) return;

      navigate("/card", {
        key
      });
    });
  });

  root.querySelectorAll("[data-universe-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const universeKey = button.dataset.universeKey || "";
      if (!universeKey) return;

      navigate("/universe", {
        key: universeKey
      });
    });
  });
}

function setStatus(root, message = "") {
  const target = root.querySelector("[data-card-status]");
  if (target) target.textContent = message;
}

export async function renderCardPage(root, params = {}) {
  const key = normalizeKey(params.key || "");
  const userId = state.user?.id || "";
  const previewMode = isTempMode(params);

  if (!key) {
    renderNotFound(root);
    return;
  }

  let entity =
    loadFastEntity(params) ||
    buildFallbackEntity(params);

  if (!entity) {
    renderNotFound(root);
    return;
  }

  let userMedia = null;
  let folders = [];
  let relatedItems = [];
  let universeLinks = [];
  let actionModalOpen = false;
  let statusText = "";
  let destroyed = false;

  const getPreviewFlag = () => previewMode || isPreviewEntity(entity) || !entity.id;

  const rerender = () => {
    if (destroyed) return;

    renderPage(root, {
      entity,
      userMedia,
      folders,
      relatedItems,
      universeLinks,
      actionModalOpen,
      statusText,
      preview: getPreviewFlag()
    });

    bind();
  };

  const refreshFolders = async () => {
    folders = await loadCategoryFolders(userId, entity.category).catch(() => getEmptyFolders(entity.category));
  };

  const refreshUserMedia = async () => {
    if (!userId || !entity?.id) {
      userMedia = null;
      return;
    }

    userMedia =
      getCachedUserMedia(userId, entity) ||
      await loadUserMedia(userId, entity.id).catch(() => null);
  };

  const refreshRelations = async () => {
    if (!entity?.id) {
      relatedItems = [];
      universeLinks = [];
      return;
    }

    const [related, links] = await Promise.allSettled([
      getRelatedItemsForEntityFromDb({ entityId: entity.id }),
      getEntityUniverseLinksFromDb({ entityId: entity.id })
    ]);

    relatedItems = related.status === "fulfilled" ? safeArray(related.value) : [];
    universeLinks = links.status === "fulfilled" ? safeArray(links.value) : [];
  };

  const handleAdd = async () => {
    if (!userId) {
      openAuthModal("login");
      return;
    }

    if (!isEntityReadyToSave(entity)) {
      statusText = getMissingText(entity);
      actionModalOpen = false;
      rerender();
      return;
    }

    try {
      statusText = t("adding");
      actionModalOpen = false;
      rerender();

      const result = await addToUserLibrary({
        userId,
        entity
      });

      const addedUserMedia =
        result?.userMedia ||
        result?.item ||
        result?.data ||
        result ||
        null;

      if (addedUserMedia?.media_entities) {
        entity = normalizeEntityForView(addedUserMedia.media_entities) || entity;
      } else if (addedUserMedia?.entity_id && !entity.id) {
        entity = normalizeEntityForView(await loadEntityFromDb(entity.canonical_key)) || entity;
      } else if (!entity.id) {
        entity = normalizeEntityForView(await loadEntityFromDb(entity.canonical_key)) || entity;
      }

      await refreshUserMedia();
      await refreshFolders();
      await refreshRelations();

      statusText = result?.alreadyExists ? t("alreadyInLibrary") : t("saved");
      rerender();
    } catch (error) {
      console.warn("Add card error:", error);
      statusText = error?.message || t("cardNotReady");
      rerender();
    }
  };

  const handleStatusUpdate = async (status) => {
    if (!userMedia?.id) return;

    try {
      const updated = await updateUserMedia(userMedia.id, { status });
      userMedia = updated || { ...userMedia, status };

      if (updated?.media_entities) {
        entity = normalizeEntityForView(updated.media_entities) || entity;
      }

      updateCachedLibraryItem(userId, {
        ...updated,
        media_entities: entity
      });

      actionModalOpen = false;
      statusText = t("statusUpdated");
      rerender();
    } catch (error) {
      console.warn("Status update error:", error);
      statusText = t("cardNotReady");
      rerender();
    }
  };

  const handleFolderUpdate = async (folderName) => {
    if (!userMedia?.id) return;

    const normalizedFolder = normalizeFolderName(folderName);

    try {
      const updated = await updateUserMedia(userMedia.id, {
        folder_name: normalizedFolder || null
      });

      userMedia = updated || { ...userMedia, folder_name: normalizedFolder };

      if (updated?.media_entities) {
        entity = normalizeEntityForView(updated.media_entities) || entity;
      }

      if (normalizedFolder) {
        folders = addEmptyFolder(entity.category, normalizedFolder);
      }

      updateCachedLibraryItem(userId, {
        ...updated,
        media_entities: entity
      });

      actionModalOpen = false;
      statusText = t("folderUpdated");
      rerender();
    } catch (error) {
      console.warn("Folder update error:", error);
      statusText = t("cardNotReady");
      rerender();
    }
  };

  const handleDelete = async () => {
    if (!userMedia?.id) return;

    const confirmed = window.confirm(t("confirmDeleteText"));
    if (!confirmed) return;

    try {
      await deleteUserMedia(userMedia.id);

      removeCachedLibraryItem(userId, entity.canonical_key);

      userMedia = null;
      actionModalOpen = false;
      statusText = t("deleted");
      rerender();
    } catch (error) {
      console.warn("Delete card error:", error);
      statusText = t("cardNotReady");
      rerender();
    }
  };

  const bind = () => {
    bindRelated(root);

    root.querySelector("[data-action='open-action-modal']")?.addEventListener("click", () => {
      actionModalOpen = true;
      rerender();
    });

    root.querySelectorAll("[data-action='close-action-modal']").forEach((button) => {
      button.addEventListener("click", (event) => {
        if (event.target !== button && button.classList.contains("card-action-backdrop")) return;
        actionModalOpen = false;
        rerender();
      });
    });

    root.querySelector("[data-action='modal-add']")?.addEventListener("click", () => {
      handleAdd();
    });

    root.querySelectorAll("[data-action='modal-set-status']").forEach((button) => {
      button.addEventListener("click", () => {
        handleStatusUpdate(button.dataset.value || "planned");
      });
    });

    root.querySelectorAll("[data-action='modal-set-folder']").forEach((button) => {
      button.addEventListener("click", () => {
        handleFolderUpdate(button.dataset.value || "");
      });
    });

    root.querySelector("[data-action='modal-remove-folder']")?.addEventListener("click", () => {
      handleFolderUpdate("");
    });

    root.querySelector("[data-action='modal-delete']")?.addEventListener("click", () => {
      handleDelete();
    });

    root.querySelector("[data-action='modal-create-folder']")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = root.querySelector("[data-folder-input]");
      handleFolderUpdate(input?.value || "");
    });
  };

  renderLoading(root);
  rerender();

  if (!previewMode && !isFallbackEntity(entity)) {
    const loaded = await loadEntityFromDb(key).catch(() => null);

    if (loaded?.canonical_key) {
      entity = loaded;
      rerender();
    }
  }

  await Promise.allSettled([
    refreshFolders(),
    refreshUserMedia(),
    refreshRelations()
  ]);

  rerender();

  return () => {
    destroyed = true;
  };
}
