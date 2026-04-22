/* =========================
   DOM HELPERS
========================= */

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function createElement(tag, className = "", html = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (html) el.innerHTML = html;
  return el;
}

/* =========================
   STRING / TEXT
========================= */

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeString(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactString(value = "") {
  return normalizeString(value).replace(/\s+/g, "");
}

export function getInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "P";

  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

/* =========================
   ARRAY / DATA
========================= */

export function uniqueArray(arr = []) {
  return [...new Set(arr.filter(Boolean))];
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function groupBy(array, keyGetter) {
  const map = new Map();

  array.forEach((item) => {
    const key = keyGetter(item);

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push(item);
  });

  return map;
}

/* =========================
   TIME / DATE
========================= */

export function nowISO() {
  return new Date().toISOString();
}

/* =========================
   DEBOUNCE
========================= */

export function debounce(fn, delay = 300) {
  let timer;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/* =========================
   UI HELPERS
========================= */

export function clampText(text = "", maxLength = 120) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "…";
}

export function isMobile() {
  return window.innerWidth < 768;
}
