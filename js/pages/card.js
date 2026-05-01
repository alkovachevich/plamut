import { escapeHtml, clampText, safeArray } from "../utils.js";
import { getCategoryLabel, STATUS_LABELS, ROUTES } from "../config.js";
import { navigate } from "../router.js";
import {
  state,
  openAuthModal,
  getTemporaryCardItem,
  getStoredCardItemByKey,
  setTemporaryCardItem
} from "../state.js";

import {
  getEntityByCanonicalKey,
  addToUserLibrary
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

import {
  enrichMediaEntityInBackground,
  shouldEnrichEntity
} from "../services/metadata-enrichment.js";

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
    relations_status
  )
`;

const I18N = {
  ru: {
    loadingCard: "Загрузка карточки…",
    cardNotFound: "Карточка не найдена.",
    unavailableTitle: "Карточка временно недоступна",
    unavailableDescription: "Не удалось быстро загрузить данные из базы. Если карточка была открыта из библиотеки, данные появятся после фоновой загрузки.",
    actions: "Действия",
    addToLibrary: "Добавить в библиотеку",
    alreadyInLibrary: "Уже есть в библиотеке",
    cardNotReady: "Карточка ещё не загружена. Попробуй через несколько секунд.",
    status: "Статус",
    folder: "Папка",
    createFolder: "Создать папку",
    newFolderName: "Название новой папки",
    removeFolder: "Убрать из папки",
    deleteFromLibrary: "Удалить из библиотеки",
    confirmDeleteText: "Карточка будет удалена из твоей библиотеки.",
    description: "Описание",
    noDescription: "Описание пока уточняется",
    metadataUpdating: "Данные обновляются…",
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
    signIn: "Войти"
  },
  en: {
    loadingCard: "Loading card…",
    cardNotFound: "Card not found.",
    unavailableTitle: "Card is temporarily unavailable",
    unavailableDescription: "Could not quickly load data from the database. If this card was opened from your library, the data will appear after background loading.",
    actions: "Actions",
    addToLibrary: "Add to library",
    alreadyInLibrary: "Already in library",
    cardNotReady: "The card is not loaded yet. Try again in a few seconds.",
    status: "Status",
    folder: "Folder",
    createFolder: "Create folder",
    newFolderName: "New folder name",
    removeFolder: "Remove from folder",
    deleteFromLibrary: "Delete from library",
    confirmDeleteText: "This card will be removed from your library.",
    description: "Description",
    noDescription: "Description is being updated",
    metadataUpdating: "Updating metadata…",
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
    signIn: "Sign in"
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

function isFallbackEntity(entity = {}) {
  return Boolean(entity?.__fallback);
}

function isPersistableEntity(entity = {}) {
  return Boolean(entity?.canonical_key && !isFallbackEntity(entity));
}

function hasUsefulDescription(entity = {}) {
  return clean(entity.description_ru || entity.description_en || entity.description).length >= 40;
}

function hasUsefulCover(entity = {}) {
  const cover = clean(entity.cover_url);
  return Boolean(cover && cover !== "undefined" && cover !== "null" && !cover.includes("/placeholder"));
}

function isIncompleteEntity(entity = {}) {
  if (!entity?.canonical_key || isFallbackEntity(entity)) return true;
  return !hasUsefulCover(entity) || !hasUsefulDescription(entity);
}

function mergeEntityStable(current = {}, incoming = {}) {
  const left = current && typeof current === "object" ? current : {};
  const right = incoming && typeof incoming === "object" ? incoming : {};

  return {
    ...left,
    ...right,
    id: right.id || left.id || null,
    canonical_key: clean(right.canonical_key) || clean(left.canonical_key),
    category: clean(right.category) || clean(left.category),
    primary_source: clean(right.primary_source) || clean(left.primary_source),
    title_primary: clean(right.title_primary) || clean(left.title_primary),
    title_ru: clean(right.title_ru) || clean(left.title_ru),
    title_en: clean(right.title_en) || clean(left.title_en),
    original_title: clean(right.original_title) || clean(left.original_title),
    year: right.year || left.year || null,
    cover_url: clean(right.cover_url) || clean(left.cover_url),
    description_ru: clean(right.description_ru) || clean(left.description_ru) || clean(left.description),
    description_en: clean(right.description_en) || clean(left.description_en),
    external_ids: {
      ...(left.external_ids && typeof left.external_ids === "object" ? left.external_ids : {}),
      ...(right.external_ids && typeof right.external_ids === "object" ? right.external_ids : {})
    },
    meta: {
      ...(left.meta && typeof left.meta === "object" ? left.meta : {}),
      ...(right.meta && typeof right.meta === "object" ? right.meta : {})
    },
    universe_key: clean(right.universe_key) || clean(left.universe_key),
    relations_built_at: right.relations_built_at || left.relations_built_at || null,
    relations_status: clean(right.relations_status) || clean(left.relations_status)
  };
}

function resolveTitle(entity = {}) {
  const lang = state.language === "en" ? "en" : "ru";

  if ((entity.category || "") === "books") {
    return lang === "en"
      ? entity.title_en || entity.title_primary || entity.title_ru || entity.original_title || entity.title || t("unavailableTitle")
      : entity.title_ru || entity.title_primary || entity.title_en || entity.original_title || entity.title || t("unavailableTitle");
  }

  return (
    entity.title_primary ||
    entity.title_ru ||
    entity.title_en ||
    entity.original_title ||
    entity.title ||
    t("unavailableTitle")
  );
}

function resolveDescription(entity = {}) {
  const lang = state.language === "en" ? "en" : "ru";

  if ((entity.category || "") === "books") {
    return lang === "en"
      ? entity.description_en || entity.description_ru || entity.description || ""
      : entity.description_ru || entity.description_en || entity.description || "";
  }

  return entity.description_ru || entity.description_en || entity.description || "";
}

function getCover(entity = {}) {
  const cover = clean(entity.cover_url);
  if (!cover || cover === "undefined" || cover === "null") return "";
  return cover;
}

function normalizeStoredEntity(item = {}) {
  if (!item || typeof item !== "object" || !item.canonical_key || item.__fallback) {
    return null;
  }

  return {
    ...item,
    title_primary:
      item.title_primary ||
      item.title ||
      item.title_ru ||
      item.title_en ||
      item.original_title ||
      "",
    title_ru: item.title_ru || "",
    title_en: item.title_en || "",
    original_title: item.original_title || item.title || "",
    description_ru: item.description_ru || item.description || "",
    description_en: item.description_en || "",
    external_ids: item.external_ids || {},
    meta: item.meta || {}
  };
}

function getCachedEntityByKey(userId, key) {
  if (!userId || !key) return null;

  const cached =
    getCachedLibraryItem(userId, key, { mode: "full", allowExpired: true }) ||
    getCachedLibraryItem(userId, key, { mode: "list", allowExpired: true });

  return cached?.media_entities || null;
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

  const cachedEntity = normalizeStoredEntity(getCachedEntityByKey(userId, key));
  const temp = normalizeStoredEntity(getTemporaryCardItem());
  const stored = normalizeStoredEntity(getStoredCardItemByKey(key));

  const candidates = [cachedEntity, temp, stored].filter(Boolean);
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

  if (entityFromService && !isIncompleteEntity(entityFromService)) {
    return entityFromService;
  }

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("media_entities")
      .select("*")
      .eq("canonical_key", key)
      .maybeSingle(),
    "Полная загрузка карточки",
    CARD_TIMEOUT_MS
  );

  if (error) throw error;

  return data || entityFromService || null;
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

function getStatusLabel(status = "") {
  const key = clean(status);
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

function renderActionModal({ userMedia = null, folders = [] } = {}) {
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
            <button class="card-action-modal__primary" type="button" data-action="modal-add">
              ${escapeHtml(t("addToLibrary"))}
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
      .card-menu-wrap{position:absolute;top:14px;right:14px;z-index:10}
      .card-menu-btn{width:38px;height:38px;display:grid;place-items:center;border-radius:999px;border:1px solid var(--border);background:var(--surface-strong);color:var(--text);font-size:22px;line-height:1}
      .card-status{min-height:20px;font-size:13px;color:var(--text-soft)}
      .card-section{padding:16px;border-radius:18px;border:1px solid var(--border-soft);background:var(--surface)}
      .card-section__title{font-size:17px;font-weight:850;color:var(--text);margin-bottom:10px}
      .card-description{color:var(--text-soft);font-size:15px;line-height:1.55;white-space:pre-line}
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
      .card-action-modal__delete{width:100%;min-height:44px;border-radius:14px;background:transparent;color:var(--danger);border:1px solid color-mix(in srgb,var(--danger) 45%,transparent);font-weight:800}
      @media(max-width:640px){
        .card-shell{grid-template-columns:96px 1fr;padding:12px;border-radius:18px}
        .card-cover{width:96px;border-radius:13px}
        .card-title{font-size:20px}
        .card-main{padding-right:40px}
        .related-grid{grid-template-columns:1fr}
        .card-action-modal__folder-form{flex-direction:column}
      }
    </style>
  `;
}

function renderPage({ entity, userMedia = null, relatedItems = [], universeLinks = [], statusText = "" } = {}) {
  const title = resolveTitle(entity);
  const description = resolveDescription(entity);
  const categoryLabel = getCategoryLabel(state.language, entity.category || "");
  const originalTitle = entity.original_title && entity.original_title !== title ? entity.original_title : "";

  const statusBadge = userMedia?.status
    ? `<span class="card-badge" data-user-status>${escapeHtml(getStatusLabel(userMedia.status))}</span>`
    : "";

  const folderBadge = userMedia?.folder_name
    ? `<span class="card-badge folder" data-user-folder>${escapeHtml(userMedia.folder_name)}</span>`
    : "";

  const metadataBadge = isIncompleteEntity(entity)
    ? `<span class="card-badge muted">${escapeHtml(t("metadataUpdating"))}</span>`
    : "";

  return `
    ${renderStyles()}

    <section class="card-page">
      <article class="card-shell">
        <div class="card-cover">
          ${renderCover(entity)}
        </div>

        <div class="card-main">
          <div class="card-badges">
            <span class="card-badge muted">${escapeHtml(categoryLabel)}</span>
            ${entity.year ? `<span class="card-badge muted">${escapeHtml(String(entity.year))}</span>` : ""}
            ${statusBadge}
            ${folderBadge}
            ${metadataBadge}
          </div>

          <div>
            <div class="card-title">${escapeHtml(title)}</div>
            ${originalTitle ? `<div class="card-subtitle">${escapeHtml(originalTitle)}</div>` : ""}
          </div>

          <div class="card-status" data-card-status-text>${escapeHtml(statusText || "")}</div>
        </div>

        <div class="card-menu-wrap">
          <button class="card-menu-btn" type="button" data-action="open-action-modal">⋯</button>
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

      <div data-card-action-modal-root></div>
    </section>
  `;
}

export async function renderCardPage(root, params = {}) {
  const key = normalizeKey(params.key || "");
  const category = clean(params.category || "");
  const userId = state.user?.id || "";

  let isDestroyed = false;
  let entity = loadFastEntity(params) || buildFallbackEntity({ key, category });
  let userMedia = entity ? getCachedUserMedia(userId, entity) : null;
  let folders = [];
  let relatedItems = [];
  let universeLinks = [];
  let statusText = entity ? "" : t("loadingCard");

  function scheduleEnrichmentIfNeeded(currentEntity) {
    if (!currentEntity?.id || isFallbackEntity(currentEntity)) return;

    if (shouldEnrichEntity(currentEntity)) {
      enrichMediaEntityInBackground(currentEntity);
    }
  }

  function setStatusText(text = "") {
    statusText = text;
    const node = root.querySelector("[data-card-status-text]");
    if (node) node.textContent = text;
  }

  function rerender() {
    if (isDestroyed) return;

    root.innerHTML = renderPage({
      entity,
      userMedia,
      relatedItems,
      universeLinks,
      statusText
    });
  }

  function closeActionModal() {
    root.querySelector("[data-card-action-modal-root]")?.replaceChildren();
  }

  async function openActionModal() {
    if (!entity) return;

    folders = await loadCategoryFolders(userId, entity.category || category).catch(() => getEmptyFolders(entity.category || category));

    const modalRoot = root.querySelector("[data-card-action-modal-root]");
    if (!modalRoot) return;

    modalRoot.innerHTML = renderActionModal({
      userMedia,
      folders
    });
  }

  async function refreshUserMedia() {
    if (!userId || !entity?.id) {
      userMedia = null;
      return;
    }

    const row = await loadUserMedia(userId, entity.id).catch(() => null);

    if (row?.id) {
      userMedia = {
        id: row.id,
        user_id: row.user_id,
        entity_id: row.entity_id,
        category: row.category,
        status: row.status,
        folder_name: row.folder_name,
        created_at: row.created_at,
        updated_at: row.updated_at
      };

      if (row.media_entities) {
        entity = mergeEntityStable(entity, row.media_entities);
        updateCachedLibraryItem(userId, row, { category: row.category || entity.category });
      }
    } else {
      userMedia = null;
    }
  }

  async function refreshEntityFromDb() {
    if (!key) return;

    const freshEntity = await loadEntityFromDb(key).catch((error) => {
      console.warn("Card DB load skipped:", error);
      return null;
    });

    if (!freshEntity?.canonical_key) return;

    entity = mergeEntityStable(entity, freshEntity);
    setTemporaryCardItem(entity);
    scheduleEnrichmentIfNeeded(entity);

    await refreshUserMedia();
  }

  async function refreshRelated() {
    if (!entity?.id) return;

    const [nextRelatedItems, nextUniverseLinks] = await Promise.all([
      getRelatedItemsForEntityFromDb(entity.id).catch(() => []),
      getEntityUniverseLinksFromDb(entity.id).catch(() => [])
    ]);

    relatedItems = safeArray(nextRelatedItems);
    universeLinks = safeArray(nextUniverseLinks);
  }

  async function handleAddToLibrary() {
    if (!state.user?.id) {
      openAuthModal("login");
      return;
    }

    if (!isPersistableEntity(entity)) {
      setStatusText(t("cardNotReady"));
      return;
    }

    try {
      const result = await addToUserLibrary({
        userId: state.user.id,
        entity,
        status: "planned"
      });

      userMedia = result.userMedia || null;

      if (result.entity) {
        entity = mergeEntityStable(entity, result.entity);
      }

      if (result.userMedia) {
        updateCachedLibraryItem(state.user.id, result.userMedia, {
          category: result.userMedia.category || entity.category
        });
      }

      setStatusText(result.alreadyExists ? t("alreadyInLibrary") : t("saved"));
      closeActionModal();
      rerender();
    } catch (error) {
      console.warn("Add to library skipped:", error);
      setStatusText(String(error?.message || t("cardNotReady")));
    }
  }

  async function handleStatusChange(nextStatus) {
    if (!userMedia?.id) return;

    try {
      const updated = await updateUserMedia(userMedia.id, {
        status: clean(nextStatus) || "planned"
      });

      if (updated?.id) {
        userMedia = {
          id: updated.id,
          user_id: updated.user_id,
          entity_id: updated.entity_id,
          category: updated.category,
          status: updated.status,
          folder_name: updated.folder_name,
          created_at: updated.created_at,
          updated_at: updated.updated_at
        };

        if (updated.media_entities) {
          entity = mergeEntityStable(entity, updated.media_entities);
        }

        updateCachedLibraryItem(userId, updated, { category: updated.category || entity.category });
      }

      setStatusText(t("statusUpdated"));
      closeActionModal();
      rerender();
    } catch (error) {
      console.warn("Status update skipped:", error);
      setStatusText(String(error?.message || ""));
    }
  }

  async function handleFolderChange(nextFolder) {
    if (!userMedia?.id) return;

    const folderName = normalizeFolderName(nextFolder);

    try {
      if (folderName) {
        addEmptyFolder(entity.category || category, folderName);
      }

      const updated = await updateUserMedia(userMedia.id, {
        folder_name: folderName || null
      });

      if (updated?.id) {
        userMedia = {
          id: updated.id,
          user_id: updated.user_id,
          entity_id: updated.entity_id,
          category: updated.category,
          status: updated.status,
          folder_name: updated.folder_name,
          created_at: updated.created_at,
          updated_at: updated.updated_at
        };

        if (updated.media_entities) {
          entity = mergeEntityStable(entity, updated.media_entities);
        }

        updateCachedLibraryItem(userId, updated, { category: updated.category || entity.category });
      }

      setStatusText(t("folderUpdated"));
      closeActionModal();
      rerender();
    } catch (error) {
      console.warn("Folder update skipped:", error);
      setStatusText(String(error?.message || ""));
    }
  }

  async function handleDelete() {
    if (!userMedia?.id) return;
    if (!window.confirm(t("confirmDeleteText"))) return;

    try {
      const removedId = userMedia.id;
      const removedCategory = userMedia.category || entity.category || category;

      await deleteUserMedia(removedId);
      removeCachedLibraryItem(userId, removedId, { category: removedCategory });

      userMedia = null;
      setStatusText(t("deleted"));
      closeActionModal();
      rerender();
    } catch (error) {
      console.warn("Delete skipped:", error);
      setStatusText(String(error?.message || ""));
    }
  }

  function handleClick(event) {
    const actionTarget = event.target.closest("[data-action]");
    const relatedTarget = event.target.closest("[data-related]");
    const universeTarget = event.target.closest("[data-universe-key]");

    if (relatedTarget) {
      const relatedKey = relatedTarget.getAttribute("data-related") || "";
      if (relatedKey) {
        navigate(ROUTES.CARD, { key: relatedKey });
      }
      return;
    }

    if (universeTarget) {
      const universeKey = universeTarget.getAttribute("data-universe-key") || "";
      if (universeKey) {
        navigate(ROUTES.UNIVERSE_DETAILS, { key: universeKey });
      }
      return;
    }

    if (!actionTarget) return;

    const action = actionTarget.getAttribute("data-action");

    if (action === "open-action-modal") {
      openActionModal();
      return;
    }

    if (action === "close-action-modal") {
      if (event.target === actionTarget || actionTarget.classList.contains("card-action-modal__close")) {
        closeActionModal();
      }
      return;
    }

    if (action === "modal-add") {
      handleAddToLibrary();
      return;
    }

    if (action === "modal-set-status") {
      handleStatusChange(actionTarget.getAttribute("data-value"));
      return;
    }

    if (action === "modal-set-folder") {
      handleFolderChange(actionTarget.getAttribute("data-value"));
      return;
    }

    if (action === "modal-remove-folder") {
      handleFolderChange("");
      return;
    }

    if (action === "modal-delete") {
      handleDelete();
    }
  }

  function handleSubmit(event) {
    const form = event.target.closest('[data-action="modal-create-folder"]');
    if (!form) return;

    event.preventDefault();

    const input = form.querySelector("[data-folder-input]");
    const folderName = normalizeFolderName(input?.value || "");

    if (!folderName) return;

    addEmptyFolder(entity.category || category, folderName);
    handleFolderChange(folderName);
  }

  root.addEventListener("click", handleClick);
  root.addEventListener("submit", handleSubmit);

  if (!entity) {
    root.innerHTML = `
      ${renderStyles()}
      <section class="card-page">
        <div class="card-section">
          <div class="card-section__title">${escapeHtml(t("cardNotFound"))}</div>
        </div>
      </section>
    `;
  } else {
    rerender();
  }

  refreshEntityFromDb()
    .then(refreshRelated)
    .then(() => {
      if (!isDestroyed) rerender();
    })
    .catch((error) => {
      console.warn("Card refresh skipped:", error);

      if (!isDestroyed && entity) {
        scheduleEnrichmentIfNeeded(entity);
        rerender();
      }
    });

  return () => {
    isDestroyed = true;
    root.removeEventListener("click", handleClick);
    root.removeEventListener("submit", handleSubmit);
  };
}
