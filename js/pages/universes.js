import { navigate } from "../router.js";

/* =========================
   MOCK DATA (временно)
========================= */

const mockUniverses = [
  {
    id: "u1",
    title: "Вселенная A",
    progress: 0.35
  },
  {
    id: "u2",
    title: "Вселенная B",
    progress: 0.7
  },
  {
    id: "u3",
    title: "Вселенная C",
    progress: 0.15
  }
];

/* =========================
   HELPERS
========================= */

function renderProgressCircle(progress = 0) {
  const percent = Math.round(progress * 100);

  return `
    <div class="progress-circle">
      <div class="progress-inner">${percent}%</div>
    </div>
  `;
}

function renderCard(universe) {
  return `
    <button
      class="universe-card"
      type="button"
      data-id="${universe.id}"
    >
      <div class="universe-banner"></div>

      <div class="universe-content">
        <div class="universe-title">${universe.title}</div>

        <div class="universe-progress">
          ${renderProgressCircle(universe.progress)}
        </div>
      </div>
    </button>
  `;
}

/* =========================
   PAGE
========================= */

export function renderUniversesPage(root) {
  root.innerHTML = `
    <style>
      .page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .title {
        font-size: 26px;
        font-weight: 800;
      }

      .grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 14px;
      }

      .universe-card {
        border-radius: 20px;
        overflow: hidden;
        border: 1px solid var(--border);
        background: var(--bg-elevated);
        text-align: left;
      }

      .universe-banner {
        height: 80px;
        background: linear-gradient(135deg, var(--accent), transparent);
      }

      .universe-content {
        padding: 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .universe-title {
        font-weight: 700;
      }

      .progress-circle {
        width: 50px;
        height: 50px;
        border-radius: 999px;
        border: 3px solid var(--accent);
        display: grid;
        place-items: center;
        font-size: 12px;
        font-weight: 700;
      }

      @media (min-width: 768px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    </style>

    <section class="page">
      <div class="title">Вселенные</div>

      <div class="grid">
        ${mockUniverses.map(renderCard).join("")}
      </div>
    </section>
  `;

  root.querySelectorAll("[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigate("/universe", { id: btn.dataset.id });
    });
  });
}
