import { escapeHtml, clampText } from "../utils.js";
import { getCategoryLabel, STATUS_LABELS } from "../config.js";
import { navigate } from "../router.js";
import {
  state,
  openAuthModal,
  getTemporaryCardItem,
  clearTemporaryCardItem
} from "../state.js";

import {
  getEntityByCanonicalKey,
  addToUserLibrary
} from "../services/entity-db.js";

import {
  getRelatedItemsForEntity,
  buildUniverseForJob
} from "../services/universe-service.js";

import {
  createUniverseBuildJob,
  getUniverseBuildJob,
  UNIVERSE_JOB_STATUS
} from "../services/universe-build-jobs.js";

import {
  getSupabaseClient,
  withRetry
} from "../lib/supabase-client.js";

import {
  getCachedLibraryItem,
  loadUserLibrary,
  updateCachedLibraryItem
} from "../services/library-cache.js";

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

function clean(value = "") {
  return String(value || "").trim();
}

function normalizeKey(value = "") {
  return clean(value).toLowerCase();
}

function resolveTitle(entity = {}) {
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
  return (
    entity.description_ru ||
    entity.description_en ||
    entity.description ||
    ""
  );
}

function getCover(entity = {}) {
  const cover = entity.cover_url || "";
  if (!cover || cover === "undefined" || cover === "null") return "";
  return cover;
}

function getCachedEntityByKey(userId, key) {
  if (!userId || !key) return null;

  const cached =
    getCachedLibraryItem(userId, key, { mode: "full" }) ||
    getCachedLibraryItem(userId, key, { mode: "list" });

  return cached?.media_entities || null;
}

function getCachedUserMedia(userId, entity = {}) {
  if (!userId || !entity?.canonical_key) return null;

  const cached =
    getCachedLibraryItem(userId, entity.canonical_key, { mode: "full" }) ||
    getCachedLibraryItem(userId, entity.canonical_key, { mode: "list" });

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

async function loadEntity(params = {}) {
  const key = normalizeKey(params.key || "");
  const userId = state.user?.id || "";

  const cachedEntity = getCachedEntityByKey(userId, key);

  if (cachedEntity?.canonical_key) {
    return cachedEntity;
  }

  const temp = getTemporaryCardItem();

  if (temp?.canonical_key && (!key || normalizeKey(temp.canonical_key) === key)) {
    return temp;
  }

  if (key) {
    try {
      const fromDb = await withRetry(
        () => getEntityByCanonicalKey(key),
        "Загрузка карточки",
        {
          retries: 1,
          timeoutMs: 9000,
          delayMs: 500
        }
      );

      if (fromDb) {
        clearTemporaryCardItem();
        return fromDb;
      }
    } catch (error) {
      console.warn("DB card load skipped:", error);
    }
  }

  return temp || null;
}

async function loadUserMedia(userId, entityId) {
  if (!userId || !entityId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("user_media")
    .select(USER_MEDIA_SELECT)
    .eq("user_id", userId)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
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
            ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(title)}" loading="lazy">`
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

function renderStyles() {
  return `
    <style>
      .card-page { display:flex; flex-direction:column; gap:18px; }
      .card-shell { display:grid; grid-template-columns:132px 1fr; gap:16px; padding:16px; border-radius:22px; border:1px solid var(--border-soft); background:var(--bg-elevated); }
      .card-cover { width:132px; aspect-ratio:2/3; overflow:hidden; border-radius:16px; border:1px solid var(--border-soft); background:var(--surface); }
      .card-cover img { width:100%; height:100%; object-fit:cover; }
      .card-cover.is-empty { display:grid; place-items:center; }
      .card-cover__fallback { width:100%; height:100%; display:grid; place-items:center; color:var(--text-soft); font-size:28px; font-weight:800; }
      .card-main { min-width:0; display:flex; flex-direction:column; gap:12px; }
      .card-title { font-size:24px; line-height:1.15; font-weight:850; color:var(--text); }
      .card-subtitle { color:var(--text-soft); font-size:14px; line-height:1.4; }
      .card-badges { display:flex; gap:8px; flex-wrap:wrap; }
      .card-badge { display:inline-flex; align-items:center; min-height:26px; padding:5px 9px; border-radius:999px; background:var(--accent-soft); color:var(--text); font-size:12px; }
      .card-badge.folder { background:var(--bg-soft); }
      .card-actions { display:flex; gap:10px; flex-wrap:wrap; }
      .card-btn { min-height:42px; padding:10px 14px; border-radius:999px; font-weight:750; background:var(--bg-soft); color:var(--text); border:1px solid var(--border-soft); }
      .card-btn.primary { background:var(--accent); color:#fff; border-color:transparent; }
      .card-btn:disabled { opacity:.55; cursor:default; }
      .card-status { min-height:20px; font-size:13px; color:var(--text-soft); }
      .build-progress { display:none; flex-direction:column; gap:8px; padding:12px; border-radius:14px; border:1px solid var(--border-soft); background:var(--surface); }
      .build-progress.is-visible { display:flex; }
      .build-progress__top { display:flex; justify-content:space-between; gap:12px; color:var(--text-soft); font-size:13px; }
      .build-progress__bar { width:100%; height:8px; overflow:hidden; border-radius:999px; background:var(--bg-soft); }
      .build-progress__fill { width:0%; height:100%; border-radius:inherit; background:var(--accent); transition:width .25s ease; }
      .card-section { padding:16px; border-radius:18px; border:1px solid var(--border-soft); background:var(--surface); }
      .card-section[hidden] { display:none; }
      .card-section__title { font-size:17px; font-weight:850; color:var(--text); margin-bottom:10px; }
      .card-description { color:var(--text-soft); font-size:15px; line-height:1.55; white-space:pre-line; }
      .related-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:12px; }
      .related-card { display:grid; grid-template-columns:54px 1fr; gap:10px; align-items:center; padding:8px; border-radius:14px; border:1px solid var(--border-soft); background:var(--bg-elevated); color:var(--text); text-align:left; }
      .related-card__cover { width:54px; height:76px; border-radius:10px; overflow:hidden; background:var(--surface); }
      .related-card__cover img { width:100%; height:100%; object-fit:cover; }
      .related-card__fallback { width:100%; height:100%; display:grid; place-items:center; color:var(--text-soft); }
      .related-card__body { min-width:0; }
      .related-card__title { font-size:14px; font-weight:750; line-height:1.3; }
      .related-card__meta { margin-top:4px; font-size:12px; color:var(--text-soft); }
      .card-empty { padding:20px; border-radius:18px; background:var(--surface); border:1px solid var(--border-soft); color:var(--text-soft); }

      @media (max-width:640px) {
        .card-shell { grid-template-columns:104px 1fr; gap:12px; padding:12px; border-radius:18px; }
        .card-cover { width:104px; border-radius:14px; }
        .card-title { font-size:20px; }
        .card-actions { flex-direction:column; }
        .card-btn { width:100%; }
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

function renderCard(root, { entity, userMedia, relatedItems = [] }) {
  const title = resolveTitle(entity);
  const description = resolveDescription(entity);
  const categoryLabel = getCategoryLabel(state.language, entity.category || "");
  const originalTitle =
    entity.original_title && entity.original_title !== title
      ? entity.original_title
      : "";

  root.innerHTML = `
    ${renderStyles()}

    <section class="card-page">
      <div class="card-shell">
        <div class="card-cover">
          ${renderCover(entity)}
        </div>

        <div class="card-main">
          <div>
            <div class="card-title">${escapeHtml(title)}</div>
            ${originalTitle ? `<div class="card-subtitle">${escapeHtml(originalTitle)}</div>` : ""}
          </div>

          <div class="card-badges" data-card-badges>
            <span class="card-badge">${escapeHtml(categoryLabel)}</span>
            ${entity.year ? `<span class="card-badge">${escapeHtml(String(entity.year))}</span>` : ""}
            ${renderStatusBadge(userMedia)}
            ${renderFolderBadge(userMedia)}
          </div>

          <div class="card-actions">
            <button class="card-btn primary" type="button" data-action="add">
              ${userMedia ? "В библиотеке" : "Добавить"}
            </button>

            <button class="card-btn" type="button" data-action="build">
              Построить вселенную
            </button>
          </div>

          <div class="card-status" data-status></div>

          <div class="build-progress" data-build-progress>
            <div class="build-progress__top">
              <span data-build-progress-label>Построение вселенной</span>
              <span data-build-progress-percent>0%</span>
            </div>
            <div class="build-progress__bar">
              <div class="build-progress__fill" data-build-progress-fill></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card-section">
        <div class="card-section__title">Описание</div>
        <div class="card-description">
          ${description ? escapeHtml(description) : "Описание отсутствует"}
        </div>
      </div>

      <div class="card-section" data-related-section ${relatedItems.length ? "" : "hidden"}>
        <div class="card-section__title">Связанные</div>
        <div class="related-grid" data-related-grid>
          ${relatedItems.map(renderRelatedItem).join("")}
        </div>
      </div>
    </section>
  `;
}

function updateUserMediaUI(root, userMedia) {
  const addButton = root.querySelector('[data-action="add"]');
  const badgesRoot = root.querySelector("[data-card-badges]");

  if (addButton && userMedia?.id) {
    addButton.textContent = "В библиотеке";
    addButton.disabled = true;
  }

  if (!badgesRoot || !userMedia?.id) return;

  badgesRoot.querySelector("[data-user-status]")?.remove();
  badgesRoot.querySelector("[data-user-folder]")?.remove();

  badgesRoot.insertAdjacentHTML("beforeend", renderStatusBadge(userMedia));

  if (userMedia.folder_name) {
    badgesRoot.insertAdjacentHTML("beforeend", renderFolderBadge(userMedia));
  }
}

function renderRelated(root, relatedItems = []) {
  const section = root.querySelector("[data-related-section]");
  const grid = root.querySelector("[data-related-grid]");

  if (!section || !grid) return;

  if (!relatedItems.length) {
    section.hidden = true;
    grid.innerHTML = "";
    return;
  }

  section.hidden = false;
  grid.innerHTML = relatedItems.map(renderRelatedItem).join("");
  bindRelated(root);
}

function bindRelated(root) {
  root.querySelectorAll("[data-related]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.related || "";
      if (!key) return;

      navigate("/card", { key });
    });
  });
}

function getProgressPercent(job = {}) {
  const current = Number(job.progress_current || 0);
  const total = Number(job.progress_total || 0);

  if (!total) return 0;

  return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}

function updateProgressUI(root, job = {}) {
  const progressRoot = root.querySelector("[data-build-progress]");
  const labelNode = root.querySelector("[data-build-progress-label]");
  const percentNode = root.querySelector("[data-build-progress-percent]");
  const fillNode = root.querySelector("[data-build-progress-fill]");
  const statusNode = root.querySelector("[data-status]");

  if (!progressRoot || !job) return;

  const percent = getProgressPercent(job);
  const label =
    job.status === UNIVERSE_JOB_STATUS.READY
      ? "Вселенная готова"
      : job.status === UNIVERSE_JOB_STATUS.FAILED
        ? job.error_message || "Ошибка построения"
        : job.progress_label || "Построение вселенной";

  progressRoot.classList.add("is-visible");

  if (labelNode) labelNode.textContent = label;
  if (percentNode) percentNode.textContent = `${percent}%`;
  if (fillNode) fillNode.style.width = `${percent}%`;
  if (statusNode) statusNode.textContent = label;
}

function isFinished(job = {}) {
  return [UNIVERSE_JOB_STATUS.READY, UNIVERSE_JOB_STATUS.FAILED].includes(job.status);
}

async function hydrateUserMediaState(root, userId, entity) {
  if (!userId || !entity?.id) return null;

  const cached = getCachedUserMedia(userId, entity);

  if (cached?.id) {
    updateUserMediaUI(root, cached);
    return cached;
  }

  try {
    const loaded = await loadUserMedia(userId, entity.id);

    if (loaded?.id) {
      updateCachedLibraryItem(userId, {
        ...loaded,
        media_entities: entity
      });

      updateUserMediaUI(root, loaded);
    }

    return loaded || null;
  } catch (error) {
    console.warn("Card user media load skipped:", error);
    return null;
  }
}

async function hydrateRelatedItems(root, userId, entity, userMedia) {
  if (!userId || !entity?.id || !userMedia?.id) return [];

  try {
    const relatedItems = await getRelatedItemsForEntity({
      userId,
      entityId: entity.id
    });

    renderRelated(root, relatedItems);
    return relatedItems;
  } catch (error) {
    console.warn("Card related items skipped:", error);
    return [];
  }
}

export async function renderCardPage(root, params = {}) {
  renderLoading(root);

  const entity = await loadEntity(params);

  if (!entity) {
    renderNotFound(root);
    return;
  }

  const userId = state.user?.id || "";
  let userMedia = getCachedUserMedia(userId, entity);
  let pollingTimer = null;
  let destroyed = false;

  renderCard(root, {
    entity,
    userMedia,
    relatedItems: []
  });

  const statusNode = root.querySelector("[data-status]");
  const addButton = root.querySelector('[data-action="add"]');
  const buildButton = root.querySelector('[data-action="build"]');

  bindRelated(root);

  if (userId) {
    loadUserLibrary(userId, {
      category: entity.category || "",
      mode: "list",
      allowStale: true,
      backgroundRefresh: false
    }).catch(() => []);

    hydrateUserMediaState(root, userId, entity).then((loadedUserMedia) => {
      if (destroyed) return;

      userMedia = loadedUserMedia || userMedia;

      if (userMedia?.id) {
        hydrateRelatedItems(root, userId, entity, userMedia);
      }
    });
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  function startPolling(job) {
    stopPolling();

    if (!job?.id) return;

    updateProgressUI(root, job);

    pollingTimer = setInterval(async () => {
      if (destroyed) {
        stopPolling();
        return;
      }

      const updated = await getUniverseBuildJob(job.id).catch(() => null);

      if (!updated) return;

      updateProgressUI(root, updated);

      if (isFinished(updated)) {
        stopPolling();

        if (updated.status === UNIVERSE_JOB_STATUS.READY && updated.universe_key) {
          navigate("/universe", {
            id: updated.universe_key
          });
        }

        if (updated.status === UNIVERSE_JOB_STATUS.FAILED && buildButton) {
          buildButton.disabled = false;
        }
      }
    }, 1500);
  }

  addButton?.addEventListener("click", async () => {
    if (!userId) {
      openAuthModal("login");
      return;
    }

    if (userMedia?.id) return;

    try {
      addButton.disabled = true;
      statusNode.textContent = "Добавляем…";

      const result = await addToUserLibrary({
        userId,
        entity
      });

      userMedia = result.userMedia || userMedia;

      updateCachedLibraryItem(userId, {
        ...userMedia,
        media_entities: result.entity || entity
      });

      updateUserMediaUI(root, userMedia);

      statusNode.textContent = result.alreadyExists
        ? "Уже есть в библиотеке"
        : "Добавлено в библиотеку";

      if (userMedia?.id) {
        hydrateRelatedItems(root, userId, result.entity || entity, userMedia);
      }
    } catch (error) {
      console.error("Add to library error:", error);
      statusNode.textContent = "Ошибка добавления";
      addButton.disabled = false;
    }
  });

  buildButton?.addEventListener("click", async () => {
    if (!userId) {
      openAuthModal("login");
      return;
    }

    try {
      buildButton.disabled = true;
      statusNode.textContent = "Создаём задачу построения…";

      let buildEntity = entity;

      if (!buildEntity.id || !userMedia?.id) {
        const added = await addToUserLibrary({
          userId,
          entity
        });

        userMedia = added.userMedia || userMedia;
        buildEntity = added.entity || entity;

        updateCachedLibraryItem(userId, {
          ...userMedia,
          media_entities: buildEntity
        });

        updateUserMediaUI(root, userMedia);
      }

      const job = await createUniverseBuildJob({
        userId,
        entityId: buildEntity.id,
        universeKey: buildEntity.universe_key || null
      });

      updateProgressUI(root, job);
      startPolling(job);

      buildUniverseForJob(job, buildEntity).then((result) => {
        if (destroyed || !result?.universe_key) return;

        navigate("/universe", {
          id: result.universe_key
        });
      }).catch((error) => {
        console.error("Universe background build failed:", error);
        if (statusNode) statusNode.textContent = "Ошибка построения вселенной";
        if (buildButton) buildButton.disabled = false;
      });
    } catch (error) {
      console.error("Build universe job error:", error);
      statusNode.textContent = "Ошибка запуска построения";
      buildButton.disabled = false;
    }
  });

  return () => {
    destroyed = true;
    stopPolling();
  };
}
