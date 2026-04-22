import { escapeHtml } from "../utils.js";


export function renderPlaceholderPage(root) {
  const title = sessionStorage.getItem("plamut_placeholder_title") || "Скоро здесь будет новый экран";
  const text = sessionStorage.getItem("plamut_placeholder_text") || "Этот раздел подключим следующим шагом.";


  root.innerHTML = `
    <section class="page">
      <section class="page-section placeholder-card">
        <div class="placeholder-title">${escapeHtml(title)}</div>
        <div class="placeholder-text">${escapeHtml(text)}</div>
      </section>
    </section>
  `;
}
