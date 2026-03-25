export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function normalizeSpaces(text){
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function normalizeComparisonText(text){
  return normalizeSpaces(text)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLanguageCode(value){
  const code = String(value || "").trim().toLowerCase();
  if(code.startsWith("ru")) return "ru";
  if(code.startsWith("en")) return "en";
  return "";
}

export function isValidIsbn10(value){
  if(!/^\d{9}[\dX]$/.test(value)) return false;
  const sum = value.split("").reduce((acc, char, index) => {
    const digit = char === "X" ? 10 : Number(char);
    return acc + digit * (10 - index);
  }, 0);
  return sum % 11 === 0;
}

export function isValidIsbn13(value){
  if(!/^\d{13}$/.test(value)) return false;
  const sum = value
    .slice(0, 12)
    .split("")
    .reduce((acc, char, index) => acc + Number(char) * (index % 2 === 0 ? 1 : 3), 0);
  const checksum = (10 - (sum % 10)) % 10;
  return checksum === Number(value[12]);
}

export function detectISBN(value){
  const candidate = String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
  if(candidate.length === 10 && isValidIsbn10(candidate)) return candidate;
  if(candidate.length === 13 && isValidIsbn13(candidate)) return candidate;
  return "";
}

export function setValueIfPresent(id, value){
  const element = document.getElementById(id);
  if(element){
    element.value = value;
  }
}

export function setCheckedIfPresent(id, value){
  const element = document.getElementById(id);
  if(element){
    element.checked = Boolean(value);
  }
}

export function setTextIfPresent(id, value){
  const element = document.getElementById(id);
  if(element){
    element.textContent = value;
  }
}
