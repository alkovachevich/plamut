import { escapeHtml } from "../utils.js";
import { navigate } from "../router.js";
import { state, openAuthModal } from "../state.js";

import { getEntityByCanonicalKey } from "../services/entity-db.js";

import {
  createUniverseBuildJob,
  pollUniverseBuildJob,
  renderUniverseJobProgress,
  isUniverseJobFinished
} from "../services/universe-build-jobs.js";

import { buildUniverseForJob } from "../services/universe-service.js";

function resolveTitle(entity = {}) {
  return (
    entity.title_primary ||
    entity.title_ru ||
    entity.title_en ||
    "Без названия"
  );
}

function render(root, entity, statusText = "") {
  root.innerHTML = `
    <div class="card">
      <h2>${escapeHtml(resolveTitle(entity))}</h2>

      <button data-action="build">
        Построить вселенную
      </button>

      <div class="status">
        ${escapeHtml(statusText)}
      </div>
    </div>
  `;
}

export async function renderCardPage(root, params = {}) {
  const entity = await getEntityByCanonicalKey(params.key);

  if (!entity) {
    root.innerHTML = "Карточка не найдена";
    return;
  }

  let currentJob = null;
  let polling = null;

  function updateStatus(text) {
    const node = root.querySelector(".status");
    if (node) node.textContent = text;
  }

  async function startPolling(job) {
    if (!job?.id) return;

    polling = setInterval(async () => {
      const updated = await pollUniverseBuildJob(job.id);

      if (!updated) return;

      updateStatus(renderUniverseJobProgress(updated));

      if (isUniverseJobFinished(updated)) {
        clearInterval(polling);

        if (updated.status === "ready" && updated.universe_key) {
          navigate("/universe", { id: updated.universe_key });
        }
      }
    }, 1500);
  }

  render(root, entity);

  root.querySelector('[data-action="build"]')?.addEventListener("click", async () => {
    if (!state.user?.id) {
      openAuthModal("login");
      return;
    }

    try {
      updateStatus("Создаём задачу...");

      const { job } = await createUniverseBuildJob({
        userId: state.user.id,
        entityId: entity.id,
        canonicalKey: entity.canonical_key
      });

      currentJob = job;

      updateStatus(renderUniverseJobProgress(job));

      // 🔥 запускаем билд асинхронно
      buildUniverseForJob(job, entity);

      startPolling(job);

    } catch (error) {
      console.error(error);
      updateStatus("Ошибка запуска");
    }
  });
}
