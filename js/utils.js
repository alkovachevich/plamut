export function qs(selector, root = document) {
  return root.querySelector(selector);
}


export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}


export function createElement(tag, className, html = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}


export function getInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "P";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
}


export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
