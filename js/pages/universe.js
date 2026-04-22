import { navigate } from "../router.js";
import { escapeHtml } from "../utils.js";

/* =========================
   MOCK DATA (временно)
========================= */

const mockUniverse = {
  id: "u1",
  title: "Вселенная",
  description: "Связанная структура произведений в виде дерева.",
  nodes: [
    { id: "1", title: "Источник", x: 50, y: 50 },
    { id: "2", title: "Спинофф", x: 20, y: 80 },
    { id: "3", title: "Сиквел", x: 80, y: 80 }
  ],
  links: [
    { from: "1", to: "2" },
    { from: "1", to: "3" }
  ]
};

/* =========================
   HELPERS
========================= */

function renderNode(node) {
  return `
    <div
      class="node"
      style="left:${node.x}%; top:${node.y}%"
      data-id="${node.id}"
    >
      ${escapeHtml(node.title)}
    </div>
  `;
}

/* =========================
   PAGE
========================= */

export function renderUniversePage(root, params = {}) {
  const universe = mockUniverse;

  root.innerHTML = `
    <style>
      .page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .title {
        font-size: 24px;
        font-weight: 800;
      }

      .description {
        color: var(--text-soft);
      }

      .canvas {
        position: relative;
        height: 400px;
        border-radius: 20px;
        background: radial-gradient(circle, rgba(255,255,255,0.05), transparent);
        border: 1px solid var(--border);
      }

      .node {
        position: absolute;
        transform: translate(-50%, -50%);
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        font-size: 12px;
        cursor: pointer;
      }
    </style>

    <section class="page">
      <div class="title">${escapeHtml(universe.title)}</div>
      <div class="description">${escapeHtml(universe.description)}</div>

      <div class="canvas">
        ${universe.nodes.map(renderNode).join("")}
      </div>
    </section>
  `;

  root.querySelectorAll(".node").forEach((el) => {
    el.addEventListener("click", () => {
      navigate("/card", { key: el.dataset.id });
    });
  });
}
