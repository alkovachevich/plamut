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
  addToUserLibrary,
  isAlreadyInUserLibrary
} from "../services/entity-db.js";

import {
  buildUniverseForEntity,
  getRelatedItemsForEntity,
  deriveUniverseInfo
} from "../services/universe-service.js";

import { getSupabaseClient, withRetry } from "../lib/supabase-client.js";

function resolveDescription(entity) {
  return entity?.description_ru || entity?.description_en || entity?.description || "";
}

function resolveTitle(entity) {
  return entity?.title_primary || entity?.title || entity?.original_title || "Без названия";
}

/* 🔥 КЛЮЧЕВОЙ ФИКС — fallback без БД */
async function loadEntity(params = {}) {
  const { key } = params || {};
  const temp = getTemporaryCardItem();

  // 1. Сначала берем из памяти (самое быстрое)
  if (temp?.canonical_key && (!key || temp.canonical_key === key)) {
    return temp;
  }

  // 2. Пробуем БД (НО БЕЗ КРАША)
  if (key) {
    try {
      const fromDb = await withRetry(
        () => getEntityByCanonicalKey(key),
        "Загрузка карточки",
        { retries: 1 }
      );

      if (fromDb) {
        clearTemporaryCardItem();
        return fromDb;
      }
    } catch (e) {
      console.warn("DB card skipped:", e);
    }
  }

  // 3. Если вообще ничего нет
  return temp || null;
}

export async function renderCardPage(root, params = {}) {
  root.innerHTML = `<div style="padding:20px;color:var(--text-soft)">Загрузка...</div>`;

  const entity = await loadEntity(params);

  if (!entity) {
    root.innerHTML = `<div style="padding:20px;color:var(--text-soft)">Не найдено</div>`;
    return;
  }

  const userId = state.user?.id;

  let userMedia = null;
  let relatedItems = [];

  try {
    if (userId && entity.id) {
      const supabase = getSupabaseClient();

      const { data } = await supabase
        .from("user_media")
        .select("*")
        .eq("user_id", userId)
        .eq("entity_id", entity.id)
        .maybeSingle();

      userMedia = data;

      if (data?.id) {
        relatedItems = await getRelatedItemsForEntity({
          userId,
          entityId: entity.id
        }).catch(() => []);
      }
    }
  } catch {
    // 🔥 не ломаем UI
  }

  const title = resolveTitle(entity);
  const description = resolveDescription(entity);

  root.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:20px">

      <div style="
        display:flex;
        gap:16px;
        background:var(--bg-elevated);
        border-radius:20px;
        padding:16px;
      ">

        <div style="width:120px;height:180px;background:var(--bg-soft);border-radius:12px;overflow:hidden">
          ${
            entity.cover_url
              ? `<img src="${escapeHtml(entity.cover_url)}" style="width:100%;height:100%;object-fit:cover">`
              : `<div style="display:grid;place-items:center;height:100%">?</div>`
          }
        </div>

        <div style="flex:1">
          <div style="font-size:22px;font-weight:800">${escapeHtml(title)}</div>

          <div style="margin-top:8px;color:var(--text-soft)">
            ${escapeHtml(getCategoryLabel(state.language, entity.category))}
          </div>

          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
            ${
              userMedia?.status
                ? `<span>${STATUS_LABELS[userMedia.status]}</span>`
                : ""
            }
          </div>

          <div style="margin-top:16px;display:flex;gap:8px">

            <button data-add style="padding:10px 14px;background:var(--accent);color:#fff;border-radius:10px">
              Добавить
            </button>

            <button data-build style="padding:10px 14px;background:var(--bg-soft);border-radius:10px">
              Построить вселенную
            </button>

          </div>

          <div data-status style="margin-top:10px;font-size:13px;color:var(--text-soft)"></div>

        </div>
      </div>

      <div style="
        background:var(--surface);
        padding:16px;
        border-radius:16px;
      ">
        ${description ? escapeHtml(description) : "Описание отсутствует"}
      </div>

      ${
        relatedItems.length
          ? `
      <div>
        <div style="font-weight:800;margin-bottom:10px">Связанные</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
          ${relatedItems
            .map(
              (i) => `
            <button data-related="${i.media_entities.canonical_key}">
              ${escapeHtml(resolveTitle(i.media_entities))}
            </button>
          `
            )
            .join("")}
        </div>
      </div>`
          : ""
      }

    </div>
  `;

  const statusNode = root.querySelector("[data-status]");

  root.querySelector("[data-add]")?.addEventListener("click", async () => {
    if (!userId) {
      openAuthModal("login");
      return;
    }

    try {
      statusNode.textContent = "Добавляем...";

      await addToUserLibrary({
        userId,
        entity
      });

      statusNode.textContent = "Добавлено";
    } catch (e) {
      statusNode.textContent = "Ошибка";
    }
  });

  root.querySelector("[data-build]")?.addEventListener("click", async () => {
    if (!userId || !entity.id) {
      statusNode.textContent = "Нет данных для построения";
      return;
    }

    try {
      statusNode.textContent = "Строим...";

      const result = await buildUniverseForEntity({
        userId,
        entityId: entity.id
      });

      if (result?.universe?.universe_key) {
        navigate("/universe", { id: result.universe.universe_key });
      } else {
        statusNode.textContent = "Готово";
      }
    } catch (e) {
      console.error(e);
      statusNode.textContent = "Ошибка построения";
    }
  });

  root.querySelectorAll("[data-related]").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigate("/card", { key: btn.dataset.related });
    });
  });
}
