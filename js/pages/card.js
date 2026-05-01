import { escapeHtml, clampText, safeArray } from "../utils.js";
import { getCategoryLabel, STATUS_LABELS } from "../config.js";
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
  removeCachedLibraryItem
} from "../services/library-cache.js";

const CARD_TIMEOUT_MS = 8000;
const MUTATION_TIMEOUT_MS = 8000;

const USER_MEDIA_SELECT = `
  id,
  user_id,
  entity_id,
  category,
  status,
  folder_name,
  created_at,
  updated_at
`;

const USER_MEDIA_WITH_ENTITY_LIGHT_SELECT = `
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

function clean(value = "") {
  return String(value || "").trim();
}

function normalizeKey(value = "") {
  return clean(value).toLowerCase();
}

function isFallbackEntity(entity = {}) {
  return Boolean(entity?.__fallback);
}

function isPersistableEntity(entity = {}) {
  return Boolean(entity?.canonical_key && !isFallbackEntity(entity));
}

function resolveTitle(entity = {}) {
  const lang = state.language === "en" ? "en" : "ru";

  if ((entity.category || "") === "books") {
    if (lang === "en") {
      return (
        entity.title_en ||
        entity.title_primary ||
        entity.title_ru ||
        entity.original_title ||
        entity.title ||
        "Без названия"
      );
    }

    return (
      entity.title_ru ||
      entity.title_primary ||
      entity.title_en ||
      entity.original_title ||
      entity.title ||
      "Без названия"
    );
  }

  return (
    entity.title_primary ||
    entity.title_ru ||
    entity.title_en ||
    entity.original_title ||
    entity.title ||
    "Без названия"
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
  const cover = entity.cover_url || "";
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
    title_primary: "Карточка временно недоступна",
    title_ru: "",
    title_en: "",
    original_title: key,
    year: null,
    cover_url: "",
    description_ru:
      "Не удалось быстро загрузить данные из базы. Если карточка была открыта из библиотеки, данные появятся после фоновой загрузки.",
    description_en: "",
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
  if (cachedEntity?.canonical_key && !cachedEntity.__fallback) {
    return normalizeStoredEntity(cachedEntity);
  }

  const temp = normalizeStoredEntity(getTemporaryCardItem());
  if (temp?.canonical_key && (!key || normalizeKey(temp.canonical_key) === key)) {
    return temp;
  }

  const stored = normalizeStoredEntity(getStoredCardItemByKey(key));
  if (stored?.canonical_key) {
    return stored;
  }

  return null;
}

async function loadEntityFromDb(key) {
  if (!key) return null;

  return withTimeout(
    getEntityByCanonicalKey(key),
    "Загрузка карточки",
    CARD_TIMEOUT_MS
  );
}

async function loadUserMedia(userId, entityId) {
  if (!userId || !entityId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("user_media")
      .select(USER_MEDIA_SELECT)
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
      .select(USER_MEDIA_WITH_ENTITY_LIGHT_SELECT)
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

function renderStatusBadge(userMedia) {
  if (!userMedia?.status) return "";
  const label = STATUS_LABELS[userMedia.status] || userMedia.status;
  return `<span class="card-badge" data-user-status>${escapeHtml(label)}</span>`;
}

function renderFolderBadge(userMedia) {
  if (!userMedia?.folder_name) return "";
  return `<span class="card-badge folder" data-user-folder>${escapeHtml(userMedia.folder_name)}</span>`;
}

function renderRelatedFallbackFromMeta(entity = {}) {
  const relations = entity?.meta?.wikidata_relations || {};

  const lines = [
    { key: "series", label: "Серия" },
    { key: "previous", label: "Предыдущая часть" },
    { key: "next", label: "Следующая часть" },
    { key: "adaptations", label: "Экранизации" }
  ]
    .map(({ key, label }) => {
      const values = safeArray(relations?.[key]).filter(Boolean);
      if (!values.length) return "";
      return `<div class="related-card__meta"><b>${escapeHtml(label)}:</b> ${escapeHtml(values.slice(0, 4).join(", "))}</div>`;
    })
    .filter(Boolean);

  return lines.join("");
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
            ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async">`
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
        universe_title: link.universe_title || "Вселенная",
        continuities: new Map()
      });
    }

    const universe = grouped.get(universeKey);

    if (!universe.continuities.has(continuityKey)) {
      universe.continuities.set(continuityKey, {
        continuity_key: continuityKey,
        continuity_title: link.continuity_title || "Линия",
        continuity_type: link.continuity_type || "",
        branches: new Map()
      });
    }

    const continuity = universe.continuities.get(continuityKey);

    if (!continuity.branches.has(branchKey)) {
      continuity.branches.set(branchKey, {
        branch_key: branchKey,
        branch_title: link.branch_title || "Ветка",
        branch_type: link.branch_type || "",
        links: []
      });
    }

    continuity.branches.get(branchKey).links.push(link);
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
      <div class="card-section__title">Вселенные</div>
      <div class="universe-links">
        ${grouped.map((universe) => `
          <button class="universe-link" type="button" data-universe-key="${escapeHtml(universe.universe_key)}">
            <div class="universe-link__title">${escapeHtml(universe.universe_title)}</div>
            ${universe.continuities.map((continuity) => `
              <div class="universe-link__continuity">
                ${escapeHtml(continuity.continuity_title)}
              </div>
              <div class="universe-link__branches">
                ${continuity.branches.map((branch) => `
                  <span>${escapeHtml(branch.branch_title)}</span>
                `).join("")}
              </div>
            `).join("")}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderStyles() {
  return `
    <style>
      .card-page { display:flex; flex-direction:column; gap:18px; }
      .card-shell { position:relative; display:grid; grid-template-columns:132px 1fr; gap:16px; padding:16px; border-radius:22px; border:1px solid var(--border-soft); background:var(--bg-elevated); }
      .card-cover { width:132px; aspect-ratio:2/3; overflow:hidden; border-radius:16px; border:1px solid var(--border-soft); background:var(--surface); }
      .card-cover img { width:100%; height:100%; object-fit:cover; }
      .card-cover.is-empty { display:grid; place-items:center; }
      .card-cover__fallback { width:100%; height:100%; display:grid; place-items:center; color:var(--text-soft); font-size:28px; font-weight:800; }

      .card-main { min-width:0; display:flex; flex-direction:column; gap:12px; padding-right:44px; }
      .card-title { font-size:24px; line-height:1.15; font-weight:850; color:var(--text); }
      .card-subtitle { color:var(--text-soft); font-size:14px; line-height:1.4; }
      .card-badges { display:flex; gap:8px; flex-wrap:wrap; }
      .card-badge { display:inline-flex; align-items:center; min-height:26px; padding:5px 9px; border-radius:999px; background:var(--accent-soft); color:var(--text); font-size:12px; }
      .card-badge.folder { background:var(--bg-soft); }

      .card-menu-wrap { position:absolute; top:14px; right:14px; z-index:10; }
      .card-menu-btn { width:38px; height:38px; display:grid; place-items:center; border-radius:999px; border:1px solid var(--border); background:var(--surface-strong); color:var(--text); font-size:22px; line-height:1; }
      .card-menu { position:absolute; top:calc(100% + 8px); right:0; width:220px; display:none; flex-direction:column; gap:4px; padding:6px; border-radius:16px; border:1px solid var(--border); background:var(--bg-elevated); box-shadow:var(--shadow); }
      .card-menu.is-open { display:flex; }
      .card-menu button { text-align:left; background:transparent; color:var(--text); padding:10px 12px; border-radius:11px; font-size:14px; }
      .card-menu button:hover { background:var(--bg-soft); }
      .card-menu button.danger { color:var(--danger); }
      .card-menu button:disabled { opacity:.55; cursor:default; }

      .card-status { min-height:20px; font-size:13px; color:var(--text-soft); }
      .card-section { padding:16px; border-radius:18px; border:1px solid var(--border-soft); background:var(--surface); }
      .card-section[hidden] { display:none; }
      .card-section__title { font-size:17px; font-weight:850; color:var(--text); margin-bottom:10px; }
      .card-description { color:var(--text-soft); font-size:15px; line-height:1.55; white-space:pre-line; }

      .universe-links { display:grid; gap:10px; }
      .universe-link { width:100%; display:flex; flex-direction:column; gap:7px; padding:12px; border-radius:15px; border:1px solid var(--border-soft); background:var(--bg-elevated); color:var(--text); text-align:left; }
      .universe-link__title { font-weight:850; line-height:1.25; }
      .universe-link__continuity { color:var(--text-soft); font-size:13px; }
      .universe-link__branches { display:flex; flex-wrap:wrap; gap:6px; }
      .universe-link__branches span { font-size:12px; color:var(--text-soft); background:var(--bg-soft); padding:4px 8px; border-radius:999px; }

      .related-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:12px; }
      .related-card { display:grid; grid-template-columns:54px 1fr; gap:10px; align-items:center; padding:8px; border-radius:14px; border:1px solid var(--border-soft); background:var(--bg-elevated); color:var(--text); text-align:left; }
      .related-card__cover { width:54px; height:76px; border-radius:10px; overflow:hidden; background:var(--surface); }
      .related-card__cover img { width:100%; height:100%; object-fit:cover; }
      .related-card__fallback { width:100%; height:100%; display:grid; place-items:center; color:var(--text-soft); }
      .related-card__body { min-width:0; }
      .related-card__title { font-size:14px; font-weight:750; line-height:1.3; }
      .related-card__meta { margin-top:4px; font-size:12px; color:var(--text-soft); }

      .card-empty { padding:20px; border-radius:18px; background:var(--surface); border:1px solid var(--border-soft); color:var(--text-soft); }

      .card-dialog-backdrop { position:fixed; inset:0; z-index:120; display:grid; place-items:center; padding:18px; background:rgba(5,10,20,.58); }
      .card-dialog { width:min(420px, 100%); border-radius:20px; border:1px solid var(--border); background:var(--bg-elevated); box-shadow:var(--shadow); padding:16px; display:flex; flex-direction:column; gap:12px; }
      .card-dialog__title { font-size:18px; font-weight:850; color:var(--text); }
      .card-dialog__text { color:var(--text-soft); font-size:14px; line-height:1.45; }
      .card-dialog__input { min-height:46px; border-radius:14px; border:1px solid var(--border); background:var(--surface); color:var(--text); padding:0 12px; outline:none; }
      .card-dialog__actions { display:flex; justify-content:flex-end; gap:8px; }
      .card-dialog__btn { min-height:40px; padding:0 13px; border-radius:999px; border:1px solid var(--border); background:var(--surface-strong); color:var(--text); font-weight:750; }
      .card-dialog__btn.primary { background:var(--accent); color:#fff; border-color:transparent; }
      .card-dialog__btn.danger { background:var(--danger); color:#fff; border-color:transparent; }

      @media (max-width:640px) {
        .card-shell { grid-template-columns:104px 1fr; gap:12px; padding:12px; border-radius:18px; }
        .card-cover { width:104px; border-radius:14px; }
        .card-main { padding-right:38px; }
        .card-title { font-size:20px; }
        .related-grid { grid-template-columns:1fr; }
      }
    </style>
  `;
}

function renderLoading(root) {
  root.innerHTML = `
    ${renderStyles()}
    <div class="card-empty">Загрузка карточки…</div>
  `;
}

function renderNotFound(root) {
  root.innerHTML = `
    ${renderStyles()}
    <div class="card-empty">Карточка не найдена.</div>
  `;
}

function renderMenu(userMedia) {
  if (userMedia?.id) {
    return `
      <div class="card-menu-wrap">
        <button class="card-menu-btn" type="button" data-action="toggle-menu" aria-label="Меню карточки">⋯</button>
        <div class="card-menu" data-card-menu>
          <button type="button" data-action="set-status" data-value="planned">Planned</button>
          <button type="button" data-action="set-status" data-value="in_progress">In progress</button>
          <button type="button" data-action="set-status" data-value="done">Done</button>
          <button type="button" data-action="set-status" data-value="dropped">Dropped</button>
          <button type="button" data-action="set-folder">Папка</button>
          <button type="button" class="danger" data-action="remove">Удалить из библиотеки</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="card-menu-wrap">
      <button class="card-menu-btn" type="button" data-action="toggle-menu" aria-label="Меню карточки">⋯</button>
      <div class="card-menu" data-card-menu>
        <button type="button" data-action="add">Добавить в библиотеку</button>
      </div>
    </div>
  `;
}

function renderCard(root, { entity, userMedia, relatedItems = [], universeLinks = [] }) {
  const title = resolveTitle(entity);
  const description = resolveDescription(entity);
  const categoryLabel = getCategoryLabel(state.language, entity.category || "");
  const originalTitle =
    entity.original_title && entity.original_title !== title
      ? entity.original_title
      : "";

  const relatedFallbackHtml = !relatedItems.length ? renderRelatedFallbackFromMeta(entity) : "";
  const hasRelatedContent = relatedItems.length || relatedFallbackHtml;

  root.innerHTML = `
    ${renderStyles()}

    <section class="card-page">
      <div class="card-shell">
        ${renderMenu(userMedia)}

        <div class="card-cover">
          ${renderCover(entity)}
        </div>

        <div class="card-main">
          <div>
            <div class="card-title">${escapeHtml(title)}</div>
            ${originalTitle ? `<div class="card-subtitle">${escapeHtml(originalTitle)}</div>` : ""}
          </div>

          <div class="card-badges" data-card-badges>
            ${categoryLabel ? `<span class="card-badge">${escapeHtml(categoryLabel)}</span>` : ""}
            ${entity.year ? `<span class="card-badge">${escapeHtml(String(entity.year))}</span>` : ""}
            ${renderStatusBadge(userMedia)}
            ${renderFolderBadge(userMedia)}
          </div>

          <div class="card-status" data-status></div>
        </div>
      </div>

      <div class="card-section">
        <div class="card-section__title">Описание</div>
        <div class="card-description" data-card-description>
          ${description ? escapeHtml(description) : "Описание отсутствует"}
        </div>
      </div>

      <div data-universe-root>
        ${renderUniverseLinks(universeLinks)}
      </div>

      <div class="card-section" data-related-section ${hasRelatedContent ? "" : "hidden"}>
        <div class="card-section__title">Связанные</div>
        <div class="related-grid" data-related-grid>
          ${relatedItems.length ? relatedItems.map(renderRelatedItem).join("") : relatedFallbackHtml}
        </div>
      </div>
    </section>
  `;
}

function updateUserMediaUI(root, userMedia) {
  const badgesRoot = root.querySelector("[data-card-badges]");

  if (!badgesRoot) return;

  badgesRoot.querySelector("[data-user-status]")?.remove();
  badgesRoot.querySelector("[data-user-folder]")?.remove();

  if (!userMedia?.id) return;

  badgesRoot.insertAdjacentHTML("beforeend", renderStatusBadge(userMedia));

  if (userMedia.folder_name) {
    badgesRoot.insertAdjacentHTML("beforeend", renderFolderBadge(userMedia));
  }
}

function updateDescriptionUI(root, entity) {
  const descriptionNode = root.querySelector("[data-card-description]");
  if (!descriptionNode) return;

  const description = resolveDescription(entity);
  descriptionNode.textContent = description || "Описание отсутствует";
}

function setStatus(root, message = "") {
  const statusNode = root.querySelector("[data-status]");
  if (statusNode) statusNode.textContent = message;
}

function closeMenu(root) {
  root.querySelector("[data-card-menu]")?.classList.remove("is-open");
}

function openFolderDialog(currentFolder = "") {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "card-dialog-backdrop";

    backdrop.innerHTML = `
      <div class="card-dialog" role="dialog" aria-modal="true">
        <div class="card-dialog__title">Папка</div>
        <div class="card-dialog__text">Введи название папки. Оставь пустым, чтобы убрать папку.</div>
        <input class="card-dialog__input" data-folder-input value="${escapeHtml(currentFolder)}" placeholder="Например: Любимое" />
        <div class="card-dialog__actions">
          <button class="card-dialog__btn" type="button" data-dialog-cancel>Отмена</button>
          <button class="card-dialog__btn primary" type="button" data-dialog-save>Сохранить</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const input = backdrop.querySelector("[data-folder-input]");

    const cleanup = (value) => {
      backdrop.remove();
      resolve(value);
    };

    backdrop.querySelector("[data-dialog-cancel]")?.addEventListener("click", () => cleanup(null));
    backdrop.querySelector("[data-dialog-save]")?.addEventListener("click", () => cleanup(input.value || ""));

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) cleanup(null);
    });

    input?.focus();
    input?.select();
  });
}

function openConfirmDialog({ title = "Подтверждение", text = "", danger = false } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "card-dialog-backdrop";

    backdrop.innerHTML = `
      <div class="card-dialog" role="dialog" aria-modal="true">
        <div class="card-dialog__title">${escapeHtml(title)}</div>
        ${text ? `<div class="card-dialog__text">${escapeHtml(text)}</div>` : ""}
        <div class="card-dialog__actions">
          <button class="card-dialog__btn" type="button" data-dialog-cancel>Отмена</button>
          <button class="card-dialog__btn ${danger ? "danger" : "primary"}" type="button" data-dialog-confirm>Да</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const cleanup = (value) => {
      backdrop.remove();
      resolve(value);
    };

    backdrop.querySelector("[data-dialog-cancel]")?.addEventListener("click", () => cleanup(false));
    backdrop.querySelector("[data-dialog-confirm]")?.addEventListener("click", () => cleanup(true));

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) cleanup(false);
    });
  });
}

function renderRelated(root, relatedItems = [], entity = {}) {
  const section = root.querySelector("[data-related-section]");
  const grid = root.querySelector("[data-related-grid]");

  if (!section || !grid) return;

  if (!relatedItems.length) {
    const fallbackHtml = renderRelatedFallbackFromMeta(entity);

    if (!fallbackHtml) {
      section.hidden = true;
      grid.innerHTML = "";
      return;
    }

    section.hidden = false;
    grid.innerHTML = fallbackHtml;
    return;
  }

  section.hidden = false;
  grid.innerHTML = relatedItems.map(renderRelatedItem).join("");
}

function renderUniverse(root, universeLinks = []) {
  const universeRoot = root.querySelector("[data-universe-root]");
  if (!universeRoot) return;
  universeRoot.innerHTML = renderUniverseLinks(universeLinks);
}

function bindCardEvents(root, getContext, setContext) {
  root.addEventListener("click", async (event) => {
    const relatedButton = event.target.closest("[data-related]");
    if (relatedButton) {
      const key = relatedButton.dataset.related || "";
      if (key) navigate("/card", { key });
      return;
    }

    const universeButton = event.target.closest("[data-universe-key]");
    if (universeButton) {
      const key = universeButton.dataset.universeKey || "";
      if (key) navigate("/universe", { id: key });
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      if (!event.target.closest(".card-menu-wrap")) closeMenu(root);
      return;
    }

    const action = actionButton.dataset.action || "";
    const context = getContext();
    let { entity, userMedia } = context;

    if (action === "toggle-menu") {
      const menu = root.querySelector("[data-card-menu]");
      menu?.classList.toggle("is-open");
      return;
    }

    if (action === "add") {
      closeMenu(root);

      if (!state.user?.id) {
        openAuthModal("login");
        return;
      }

      if (!isPersistableEntity(entity)) {
        setStatus(root, "Карточка ещё не загружена. Попробуй через несколько секунд.");
        return;
      }

      try {
        actionButton.disabled = true;
        setStatus(root, "Добавляем в библиотеку…");

        const result = await addToUserLibrary({
          userId: state.user.id,
          entity,
          status: "planned"
        });

        userMedia = result.userMedia || null;
        entity = result.entity || entity;

        setContext({ entity, userMedia });
        renderCard(root, { entity, userMedia });
        bindCardEvents(root, getContext, setContext);

        setStatus(root, result.alreadyExists ? "Уже есть в библиотеке." : "Добавлено в библиотеку.");
      } catch (error) {
        console.warn("CARD: add failed", error);
        setStatus(root, "Не удалось добавить карточку.");
        actionButton.disabled = false;
      }

      return;
    }

    if (action === "set-status") {
      closeMenu(root);

      if (!userMedia?.id) return;

      const nextStatus = actionButton.dataset.value || "";
      if (!nextStatus) return;

      try {
        actionButton.disabled = true;
        setStatus(root, "Обновляем статус…");

        const updated = await updateUserMedia(userMedia.id, {
          status: nextStatus
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

          const cachedEntry = {
            ...updated,
            media_entities: updated.media_entities || entity
          };

          updateCachedLibraryItem(state.user?.id, cachedEntry, {
            category: updated.category || entity.category
          });

          setContext({ entity, userMedia });
          updateUserMediaUI(root, userMedia);
          setStatus(root, "Статус обновлён.");
        }
      } catch (error) {
        console.warn("CARD: status update failed", error);
        setStatus(root, "Не удалось обновить статус.");
      } finally {
        actionButton.disabled = false;
      }

      return;
    }

    if (action === "set-folder") {
      closeMenu(root);

      if (!userMedia?.id) return;

      const folderName = await openFolderDialog(userMedia.folder_name || "");
      if (folderName === null) return;

      const cleanFolder = clean(folderName);

      try {
        actionButton.disabled = true;
        setStatus(root, "Обновляем папку…");

        const updated = await updateUserMedia(userMedia.id, {
          folder_name: cleanFolder || null
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

          const cachedEntry = {
            ...updated,
            media_entities: updated.media_entities || entity
          };

          updateCachedLibraryItem(state.user?.id, cachedEntry, {
            category: updated.category || entity.category
          });

          setContext({ entity, userMedia });
          updateUserMediaUI(root, userMedia);
          setStatus(root, "Папка обновлена.");
        }
      } catch (error) {
        console.warn("CARD: folder update failed", error);
        setStatus(root, "Не удалось обновить папку.");
      } finally {
        actionButton.disabled = false;
      }

      return;
    }

    if (action === "remove") {
      closeMenu(root);

      if (!userMedia?.id) return;

      const confirmed = await openConfirmDialog({
        title: "Удалить из библиотеки?",
        text: "Карточка исчезнет из твоей библиотеки, но сама сущность останется в базе.",
        danger: true
      });

      if (!confirmed) return;

      try {
        actionButton.disabled = true;
        setStatus(root, "Удаляем из библиотеки…");

        await deleteUserMedia(userMedia.id);

        removeCachedLibraryItem(state.user?.id, userMedia.id, {
          category: userMedia.category || entity.category
        });

        userMedia = null;
        setContext({ entity, userMedia });

        renderCard(root, { entity, userMedia });
        bindCardEvents(root, getContext, setContext);

        setStatus(root, "Удалено из библиотеки.");
      } catch (error) {
        console.warn("CARD: remove failed", error);
        setStatus(root, "Не удалось удалить карточку.");
        actionButton.disabled = false;
      }
    }
  });
}

async function hydrateUserMediaState(root, userId, entity, setContext) {
  if (!userId || !entity?.id) return null;

  const cached = getCachedUserMedia(userId, entity);

  if (cached?.id) {
    updateUserMediaUI(root, cached);
    setContext({ userMedia: cached });
    return cached;
  }

  try {
    const loaded = await loadUserMedia(userId, entity.id);

    if (loaded?.id) {
      updateCachedLibraryItem(userId, {
        ...loaded,
        media_entities: entity
      }, {
        category: loaded.category || entity.category
      });

      updateUserMediaUI(root, loaded);
      setContext({ userMedia: loaded });
    }

    return loaded || null;
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();

    if (message.includes("превышено время ожидания")) {
      console.info("CARD: user media load timeout, using fallback state");
    } else {
      console.warn("CARD: user media load skipped", error);
    }

    return null;
  }
}

async function hydrateUniverseLinks(root, entity) {
  if (!entity?.id) return [];

  try {
    const universeLinks = await getEntityUniverseLinksFromDb({
      entityId: entity.id
    });

    renderUniverse(root, universeLinks);
    return universeLinks;
  } catch (error) {
    console.warn("CARD: universe links skipped", error);
    return [];
  }
}

async function hydrateRelatedItems(root, entity) {
  if (!entity?.id) return [];

  try {
    const relatedItems = await getRelatedItemsForEntityFromDb({
      entityId: entity.id
    });

    renderRelated(root, relatedItems, entity);
    return relatedItems;
  } catch (error) {
    console.warn("CARD: related items skipped", error);
    renderRelated(root, [], entity);
    return [];
  }
}

export async function renderCardPage(root, params = {}) {
  const key = normalizeKey(params.key || params.id || "");
  const userId = state.user?.id || "";
  let isDestroyed = false;

  let entity = loadFastEntity(params) || buildFallbackEntity(params);
  let userMedia = getCachedUserMedia(userId, entity);

  function getContext() {
    return { entity, userMedia };
  }

  function setContext(next = {}) {
    if (next.entity) entity = next.entity;
    if ("userMedia" in next) userMedia = next.userMedia;
  }

  if (!key && !entity) {
    renderNotFound(root);
    return () => {
      isDestroyed = true;
    };
  }

  if (entity) {
    renderCard(root, {
      entity,
      userMedia,
      relatedItems: [],
      universeLinks: []
    });

    bindCardEvents(root, getContext, setContext);

    if (isFallbackEntity(entity)) {
      setStatus(root, "Пробуем загрузить карточку из базы…");
    }
  } else {
    renderLoading(root);
  }

  Promise.resolve()
    .then(async () => {
      const dbEntity = await loadEntityFromDb(key || entity?.canonical_key);

      if (isDestroyed || !dbEntity?.canonical_key) return;

      entity = normalizeStoredEntity(dbEntity) || dbEntity;
      setTemporaryCardItem(entity);

      const cachedMedia = getCachedUserMedia(userId, entity);
      if (cachedMedia?.id) {
        userMedia = cachedMedia;
      }

      renderCard(root, {
        entity,
        userMedia,
        relatedItems: [],
        universeLinks: []
      });

      bindCardEvents(root, getContext, setContext);
      updateDescriptionUI(root, entity);
      setStatus(root, "");

      hydrateUserMediaState(root, userId, entity, setContext);
      hydrateRelatedItems(root, entity);
      hydrateUniverseLinks(root, entity);
    })
    .catch((error) => {
      if (isDestroyed) return;

      const message = String(error?.message || "").toLowerCase();

      if (message.includes("превышено время ожидания")) {
        console.info("CARD: full entity timeout, keeping fast card");
        setStatus(root, isFallbackEntity(entity) ? "База отвечает медленно. Показан временный вариант." : "");
        return;
      }

      console.warn("CARD: full entity load skipped", error);

      if (!entity || isFallbackEntity(entity)) {
        renderNotFound(root);
      }
    });

  if (entity?.id && !isFallbackEntity(entity)) {
    hydrateUserMediaState(root, userId, entity, setContext);
    hydrateRelatedItems(root, entity);
    hydrateUniverseLinks(root, entity);
  }

  return () => {
    isDestroyed = true;
  };
}
