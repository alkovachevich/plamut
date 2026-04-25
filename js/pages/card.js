import { escapeHtml } from "../utils.js";
import { getCategoryLabel, STATUS_LABELS } from "../config.js";
import {
  state,
  openAuthModal,
  getTemporaryCardItem,
  clearTemporaryCardItem
} from "../state.js";

import {
  getEntityByCanonicalKey,
  addToUserLibrary,
  isAlreadyInUserLibrary
} from "../services/entity-db.js";

import { getSupabaseClient } from "../lib/supabase-client.js";

function resolveDescription(entity) {
  return entity?.description_ru || entity?.description_en || entity?.description || "";
}

function resolveTitle(entity) {
  return entity?.title_primary || entity?.title || entity?.original_title || "Без названия";
}

function normalizeTempEntity(temp, params = {}) {
  if (!temp?.canonical_key) return null;

  return {
    ...temp,
    category: temp.category || params.category || "",
    title: temp.title || temp.title_primary || temp.original_title || "",
    title_primary: temp.title_primary || temp.title || temp.original_title || ""
  };
}

async function loadEntity(params = {}) {
  const { key } = params || {};
  const temp = normalizeTempEntity(getTemporaryCardItem(), params);

  if (temp?.canonical_key && (!key || temp.canonical_key === key)) {
    return {
      entity: temp,
      source: "temp"
    };
  }

  if (key) {
    try {
      const fromDb = await getEntityByCanonicalKey(key);
      if (fromDb) {
        clearTemporaryCardItem();
        return {
          entity: fromDb,
          source: "db"
        };
      }
    } catch (error) {
      console.warn("DB card load skipped:", error);
    }
  }

  return {
    entity: null,
    source: "none"
  };
}

async function getUserMediaByEntityId(userId, entityId) {
  if (!userId || !entityId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_media")
    .select("*")
    .eq("user_id", userId)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
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

function renderManageMenu(userMedia) {
  if (!userMedia?.id) return "";

  return `
    <div class="details-menu-wrap">
      <button class="details-menu-btn" type="button" data-action="toggle-details-menu" aria-label="Открыть меню">
        ⋯
      </button>

      <div class="details-menu" data-details-menu>
        <button type="button" data-action="set-status" data-value="planned">Planned</button>
        <button type="button" data-action="set-status" data-value="in_progress">In progress</button>
        <button type="button" data-action="set-status" data-value="done">Done</button>
        <button type="button" data-action="set-status" data-value="dropped">Dropped</button>
        <button type="button" data-action="set-folder">Папка</button>
        <button type="button" class="danger" data-action="remove">Удалить</button>
      </div>
    </div>
  `;
}

export async function renderCardPage(root, params = {}) {
  root.innerHTML = `<div style="padding:20px;color:var(--text-soft);">Загрузка...</div>`;

  const loaded = await loadEntity(params);
  const entity = loaded.entity;

  if (!entity) {
    root.innerHTML = `<div style="padding:20px;color:var(--text-soft);">Не найдено</div>`;
    return;
  }

  const userId = state.user?.id;
  let alreadyAdded = false;
  let userMedia = null;

  try {
    if (userId && entity.id) {
      alreadyAdded = await isAlreadyInUserLibrary(userId, entity.id);
      userMedia = await getUserMediaByEntityId(userId, entity.id);
    }
  } catch (error) {
    console.warn("Library check skipped:", error);
  }

  const title = resolveTitle(entity);
  const description = resolveDescription(entity);
  const currentStatus = userMedia?.status ? STATUS_LABELS[userMedia.status] || userMedia.status : "";
  const currentFolder = userMedia?.folder_name || "";

  root.innerHTML = `
    <style>
      .page {
        display: flex;
        flex-direction: column;
        gap: 22px;
      }

      .card-shell {
        position: relative;
        background: var(--bg-elevated);
        border: 1px solid var(--border-soft);
        border-radius: 24px;
        padding: 18px;
      }

      .card-header {
        display: flex;
        gap: 18px;
        align-items: flex-start;
      }

      .cover {
        width: 124px;
        min-width: 124px;
        aspect-ratio: 2 / 3;
        border-radius: 18px;
        background: var(--bg-soft);
        overflow: hidden;
        border: 1px solid var(--border);
      }

      .cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .cover-fallback {
        display: grid;
        place-items: center;
        height: 100%;
        color: var(--text-soft);
        font-size: 24px;
        font-weight: 700;
      }

      .meta {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
        padding-right: 48px;
      }

      .title {
        font-size: 24px;
        font-weight: 800;
        line-height: 1.22;
        color: var(--text);
      }

      .subtitle {
        font-size: 14px;
        color: var(--text-soft);
        line-height: 1.45;
      }

      .badges {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .badge {
        display: inline-block;
        padding: 7px 11px;
        border-radius: 999px;
        background: var(--accent-soft);
        font-size: 12px;
        color: var(--text);
      }

      .badge.folder {
        background: var(--bg-soft);
      }

      .actions {
        display: flex;
        gap: 10px;
        margin-top: 8px;
        flex-wrap: wrap;
      }

      .btn {
        padding: 11px 16px;
        border-radius: 14px;
        background: var(--surface);
        border: 1px solid var(--border);
        font-weight: 700;
        color: var(--text);
      }

      .btn.primary {
        background: var(--accent);
        color: #fff;
        border-color: transparent;
      }

      .btn.disabled {
        opacity: 0.65;
        pointer-events: none;
      }

      .description-block {
        background: var(--surface);
        border: 1px solid var(--border-soft);
        border-radius: 18px;
        padding: 16px;
      }

      .description-title {
        font-size: 14px;
        font-weight: 800;
        color: var(--text);
        margin-bottom: 10px;
      }

      .description {
        line-height: 1.75;
        color: var(--text-soft);
        white-space: pre-wrap;
      }

      .empty-description {
        color: var(--text-soft);
      }

      .card-status {
        min-height: 20px;
        color: var(--text-soft);
        font-size: 14px;
      }

      .card-status.error {
        color: var(--danger);
      }

      .card-status.success {
        color: var(--success);
      }

      .details-menu-wrap {
        position: absolute;
        top: 18px;
        right: 18px;
        z-index: 50;
      }

      .details-menu-btn {
        width: 38px;
        height: 38px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: var(--surface-strong);
        color: var(--text);
        font-size: 22px;
        line-height: 1;
      }

      .details-menu {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 60;
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

      .details-menu.is-open {
        display: flex;
      }

      .details-menu button {
        text-align: left;
        background: transparent;
        color: var(--text);
        padding: 10px 12px;
        border-radius: 10px;
      }

      .details-menu button:hover {
        background: var(--bg-soft);
      }

      .details-menu button.danger {
        color: var(--danger);
      }

      @media (max-width: 640px) {
        .card-header {
          flex-direction: column;
        }

        .cover {
          width: 100%;
          max-width: 180px;
        }

        .meta {
          padding-right: 0;
        }
      }
    </style>

    <section class="page">
      <div class="card-shell">
        ${renderManageMenu(userMedia)}

        <div class="card-header">
          <div class="cover">
            ${
              entity.cover_url
                ? `<img src="${escapeHtml(entity.cover_url)}" alt="${escapeHtml(title)}" />`
                : `<div class="cover-fallback">?</div>`
            }
          </div>

          <div class="meta">
            <div class="title">${escapeHtml(title)}</div>

            ${
              entity.original_title && entity.original_title !== title
                ? `<div class="subtitle">${escapeHtml(entity.original_title)}</div>`
                : ""
            }

            <div class="badges">
              <div class="badge">${escapeHtml(getCategoryLabel(state.language, entity.category))}</div>
              ${entity.year ? `<div class="badge">${escapeHtml(String(entity.year))}</div>` : ""}
              ${currentStatus ? `<div class="badge">${escapeHtml(currentStatus)}</div>` : ""}
              ${currentFolder ? `<div class="badge folder">${escapeHtml(currentFolder)}</div>` : ""}
            </div>

            <div class="actions">
              <button class="btn primary ${alreadyAdded ? "disabled" : ""}" data-action="add" type="button">
                ${alreadyAdded ? "Уже в библиотеке" : "Добавить"}
              </button>
            </div>

            <div class="card-status" data-status></div>
          </div>
        </div>
      </div>

      <div class="description-block">
        <div class="description-title">Описание</div>
        <div class="${description ? "description" : "empty-description"}">
          ${description ? escapeHtml(description) : "Описание пока отсутствует."}
        </div>
      </div>
    </section>
  `;

  const addBtn = root.querySelector('[data-action="add"]');
  const statusNode = root.querySelector("[data-status]");
  const menu = root.querySelector("[data-details-menu]");

  root.querySelector('[data-action="toggle-details-menu"]')?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    menu?.classList.toggle("is-open");
  });

  root.addEventListener("click", (event) => {
    if (!event.target.closest(".details-menu-wrap")) {
      menu?.classList.remove("is-open");
    }
  });

  root.querySelectorAll('[data-action="set-status"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!userMedia?.id) return;

      const newStatus = button.dataset.value;
      if (!newStatus) return;

      try {
        await updateUserMedia(userMedia.id, { status: newStatus });
        userMedia = { ...userMedia, status: newStatus };
        menu?.classList.remove("is-open");
        renderCardPage(root, params);
      } catch (error) {
        console.error("Update status error:", error);
        statusNode.className = "card-status error";
        statusNode.textContent = "Не удалось изменить статус";
      }
    });
  });

  root.querySelector('[data-action="set-folder"]')?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!userMedia?.id) return;

    const folderName = window.prompt(
      "Название папки. Оставь пустым, чтобы убрать папку.",
      userMedia.folder_name || ""
    );

    if (folderName === null) return;

    const cleanFolder = folderName.trim();

    try {
      await updateUserMedia(userMedia.id, { folder_name: cleanFolder || null });
      userMedia = { ...userMedia, folder_name: cleanFolder || null };
      menu?.classList.remove("is-open");
      renderCardPage(root, params);
    } catch (error) {
      console.error("Update folder error:", error);
      statusNode.className = "card-status error";
      statusNode.textContent = "Не удалось изменить папку";
    }
  });

  root.querySelector('[data-action="remove"]')?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!userMedia?.id) return;

    try {
      await removeFromLibrary(userMedia.id);
      userMedia = null;
      menu?.classList.remove("is-open");
      renderCardPage(root, params);
    } catch (error) {
      console.error("Remove from library error:", error);
      statusNode.className = "card-status error";
      statusNode.textContent = "Не удалось удалить";
    }
  });

  addBtn?.addEventListener("click", async () => {
    const currentUserId = state.user?.id;

    if (!currentUserId) {
      openAuthModal("login");
      return;
    }

    try {
      addBtn.classList.add("disabled");
      addBtn.textContent = "Добавление...";
      statusNode.textContent = "";

      const result = await addToUserLibrary({
        userId: currentUserId,
        entity
      });

      if (result?.entity?.canonical_key) {
        clearTemporaryCardItem();
      }

      if (result?.alreadyExists) {
        addBtn.textContent = "Уже в библиотеке";
      } else {
        addBtn.textContent = "Добавлено";
      }

      statusNode.className = "card-status success";
      statusNode.textContent = "Сохранено в библиотеку";

      renderCardPage(root, params);
    } catch (error) {
      console.error("Add to library error:", error);
      addBtn.classList.remove("disabled");
      addBtn.textContent = "Добавить";
      statusNode.className = "card-status error";
      statusNode.textContent = error.message || "Не удалось добавить";
    }
  });
}
