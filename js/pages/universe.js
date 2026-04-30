import { navigate } from "../router.js";
import { state, openAuthModal } from "../state.js";
import { escapeHtml, clampText, safeArray } from "../utils.js";
import { getCategoryLabel, STATUS_LABELS } from "../config.js";
import { getUniverseDetailsFromDb } from "../services/universe-db.js";

function resolveTitle(entity = {}) {
  return (
    entity.title_primary ||
    entity.title_ru ||
    entity.title_en ||
    entity.original_title ||
    "Без названия"
  );
}

function getCover(entity = {}) {
  const cover = entity.cover_url || "";
  if (!cover || cover === "undefined" || cover === "null") return "";
  return cover;
}

function sortLinks(items = [], mode = "release") {
  return [...safeArray(items)].sort((a, b) => {
    const aOrder =
      mode === "story"
        ? a.story_order ?? a.release_order ?? a.branch_order ?? 9999
        : mode === "branch"
        ? a.branch_order ?? a.story_order ?? a.release_order ?? 9999
        : a.release_order ?? a.story_order ?? a.branch_order ?? 9999;

    const bOrder =
      mode === "story"
        ? b.story_order ?? b.release_order ?? b.branch_order ?? 9999
        : mode === "branch"
        ? b.branch_order ?? b.story_order ?? b.release_order ?? 9999
        : b.release_order ?? b.story_order ?? b.branch_order ?? 9999;

    if (aOrder !== bOrder) return aOrder - bOrder;

    return resolveTitle(a.media_entities).localeCompare(
      resolveTitle(b.media_entities),
      "ru"
    );
  });
}

function groupLinks(links = [], view = "branch") {
  const map = new Map();

  links.forEach((link) => {
    let key = "Общее";

    if (view === "branch") key = link.branch_title || "Без ветки";
    if (view === "continuity") key = link.continuity_title || "Без линии";
    if (view === "arc") key = link.metadata_json?.arc || "Без саги";

    if (!map.has(key)) map.set(key, []);
    map.get(key).push(link);
  });

  return Array.from(map.entries()).map(([title, items]) => ({
    title,
    items: sortLinks(items, view === "story" ? "story" : "release")
  }));
}

function renderItem(link, index) {
  const entity = link.media_entities;
  const title = resolveTitle(entity);

  return `
    <button class="timeline-item" data-key="${escapeHtml(entity.canonical_key)}">
      <div class="timeline-index">${index + 1}</div>

      <div class="item-cover">
        ${
          getCover(entity)
            ? `<img src="${escapeHtml(getCover(entity))}" />`
            : `<div class="item-cover-fallback">?</div>`
        }
      </div>

      <div class="item-meta">
        <div class="item-title">${escapeHtml(clampText(title, 80))}</div>

        <div class="item-badges">
          <span>${escapeHtml(getCategoryLabel(state.language, entity.category))}</span>
          ${entity.year ? `<span>${entity.year}</span>` : ""}
          ${link.branch_title ? `<span>${escapeHtml(link.branch_title)}</span>` : ""}
          ${link.continuity_title ? `<span>${escapeHtml(link.continuity_title)}</span>` : ""}
        </div>
      </div>
    </button>
  `;
}

function renderGroups(groups) {
  return groups
    .map(
      (g) => `
        <div class="section-title">${escapeHtml(g.title)}</div>
        <div class="timeline">
          ${g.items.map((item, i) => renderItem(item, i)).join("")}
        </div>
      `
    )
    .join("");
}

function bind(root) {
  root.querySelectorAll("[data-key]").forEach((el) => {
    el.addEventListener("click", () => {
      navigate("/card", { key: el.dataset.key });
    });
  });
}

export async function renderUniversePage(root, params = {}) {
  if (!state.user?.id) {
    root.innerHTML = `<div>Войди в аккаунт</div>`;
    openAuthModal("login");
    return;
  }

  const universeKey = params.id;

  const { universe, links } = await getUniverseDetailsFromDb({
    universeKey
  });

  if (!universe) {
    root.innerHTML = `<div>Не найдено</div>`;
    return;
  }

  let view = "branch";

  function render() {
    const groups = groupLinks(links, view);

    root.innerHTML = `
      <div class="page">
        <h1>${escapeHtml(universe.title)}</h1>

        <div class="view-switch">
          <button data-v="branch">Ветки</button>
          <button data-v="continuity">Линии</button>
          <button data-v="release">Выход</button>
          <button data-v="story">Сюжет</button>
        </div>

        <div id="groups">
          ${renderGroups(groups)}
        </div>
      </div>
    `;

    root.querySelectorAll("[data-v]").forEach((btn) => {
      btn.onclick = () => {
        view = btn.dataset.v;
        render();
      };
    });

    bind(root);
  }

  render();
}
