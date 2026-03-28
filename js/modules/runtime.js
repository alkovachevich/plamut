import {
  GOOGLE_BOOKS_API_KEY,
  TMDB_API_KEY,
  supabaseClient
} from "../api/supabase-client.js";

import { t } from "../i18n.js";
import { BASE_CATEGORIES, getCategoryLabel, getStatusLabel } from "../core/constants.js";
import { state } from "../core/state.js";

import {
  normalizeSearchQuery,
  hasCyrillic,
  hasLatin,
  itemMatchesQuery,
  searchMediaWithFallback
} from "./media-search.js";

import {
  normalizeAuthorName,
  normalizeTitleForMatch,
  areLikelySameBook,
  normalizeBookAuthorData,
  normalizeBookLanguageData
} from "./books.js";

import { ensureProfileShareToken, regenerateProfileShareToken } from "../api/public-api.js";

import {
  escapeHtml,
  normalizeSpaces,
  normalizeComparisonText,
  normalizeLanguageCode,
  detectISBN,
  setValueIfPresent,
  setCheckedIfPresent,
  setTextIfPresent
} from "../utils/index.js";

import { createAuthCore } from "./auth.js";
import { createProfileCore } from "./profile.js";
import { createStatusCore } from "./status.js";
import { createFoldersCore } from "./folders.js";
import { createDetailsCore } from "./details.js";
import { createRelationsCore } from "./relations.js";
import { createShareCore } from "./share.js";
import { createPublicViewCore } from "./public-view.js";

const systemThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
const ROUTE_STATE_STORAGE_KEY = "plamut_route_state";
const FOREGROUND_RESTORE_COOLDOWN_MS = 1200;
const BOOK_SEARCH_CACHE_TTL_MS = 120000;
const WIKIDATA_BOOK_RESOLVE_TTL_MS = 30 * 60 * 1000;

let relationsCore = null;
let shareCore = null;
let publicViewCore = null;
let routeRestoreInProgress = false;
let authBootstrapCompleted = false;
let currentUserPromise = null;
let currentUserCache = { user: null, fetchedAt: 0 };
let foregroundRestorePromise = null;
let lastForegroundRestoreAt = 0;
let librarySearchDebounceTimer = null;
let libraryDataLoadingPromise = null;

const libraryLoadedCategories = new Set();
const libraryCategoryLoadingPromises = new Map();
const bookSearchResponseCache = new Map();
const wikidataBookResolveCache = new Map();

function resolveThemeMode(mode = state.currentThemeMode){
  if(mode === "system"){
    return systemThemeMedia.matches ? "dark" : "light";
  }
  return mode === "light" ? "light" : "dark";
}

function applyThemeMode(){
  const resolvedTheme = resolveThemeMode();
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
  updatePreferenceControls();
}

function setThemeMode(mode){
  state.currentThemeMode = ["light", "dark", "system"].includes(mode) ? mode : "system";
  localStorage.setItem("plamut_theme_mode", state.currentThemeMode);
  applyThemeMode();
}

function getSystemBrowserLanguage(){
  const list = Array.isArray(navigator.languages) ? navigator.languages : [];
  return normalizeLanguageCode(list[0] || navigator.language || "");
}

function getProfileInitials(displayName = "", username = ""){
  const source = normalizeSpaces(displayName || username || "P");
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = parts.map((part) => part.charAt(0).toUpperCase()).join("");
  return initials || "P";
}

function translateStatus(status){
  return getStatusLabel(status, state.currentLanguage);
}

function translateCategory(category){
  return getCategoryLabel(category, state.currentLanguage);
}

function updatePreferenceControls(){
  const languageTitle = document.getElementById("preferences-language-title");
  const themeTitle = document.getElementById("preferences-theme-title");
  const profileBtn = document.getElementById("profile-btn");

  if(languageTitle) languageTitle.textContent = t().topbar.language;
  if(themeTitle) themeTitle.textContent = t().topbar.theme;

  [["lang-option-ru", "ru"], ["lang-option-en", "en"]].forEach(([id, value]) => {
    const button = document.getElementById(id);
    if(!button) return;
    const isActive = state.currentLanguage === value;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  [
    ["theme-option-light", "light", t().topbar.themeLight],
    ["theme-option-dark", "dark", t().topbar.themeDark],
    ["theme-option-system", "system", t().topbar.themeSystem]
  ].forEach(([id, value, label]) => {
    const button = document.getElementById(id);
    if(!button) return;
    const isActive = state.currentThemeMode === value;
    button.textContent = label;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  if(profileBtn){
    profileBtn.title = t().topbar.profile;
    profileBtn.setAttribute("aria-label", t().topbar.profile);
  }
}

function setLanguage(lang){
  state.currentLanguage = lang;
  localStorage.setItem("plamut_language", lang);
  document.documentElement.lang = lang;
  applyTranslations();
  updatePreferenceControls();
  rerenderCurrentScreen();
  closePreferencesPanel();
}

function isOwnerControlAllowed(){
  if(!state.isPublicView) return true;
  alert(t().share.ownerOnlyAction);
  return false;
}

function isShareEnabled(profile = {}){
  if(typeof profile.public_share_enabled === "boolean"){
    return profile.public_share_enabled;
  }
  if(typeof profile.is_public === "boolean"){
    return profile.is_public;
  }
  return true;
}

function getShareCardTitle(profile = {}){
  return normalizeSpaces(profile.public_card_title || profile.display_name || profile.username || "Plamut");
}

function getShareCardBio(profile = {}){
  return normalizeSpaces(profile.public_card_bio || "");
}

function getShareLibraryMode(profile = {}){
  const mode = String(profile.public_library_mode || "preview").toLowerCase();
  return mode === "full" ? "full" : "preview";
}

function generateToken(length = 24){
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function buildPublicShareUrl(token){
  return `${window.location.origin}/nfc/${encodeURIComponent(token || "")}`;
}

function isNfcRoute(){
  return window.location.pathname.startsWith("/nfc/");
}

function isPublicShareRoute(){
  return window.location.pathname.startsWith("/share/") || window.location.pathname.startsWith("/nfc/");
}

function supportsTable(error, tableName){
  return !error || !new RegExp(`relation .*${tableName}`, "i").test(String(error.message || ""));
}

function isNetworkError(error){
  const message = String(error?.message || error || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  return message.includes("failed to fetch")
    || message.includes("networkerror")
    || message.includes("network request failed")
    || message.includes("fetch")
    || details.includes("failed to fetch");
}

async function retryReadQuery(runQuery, attempts = 2, delayMs = 220){
  let lastError = null;
  for(let attempt = 0; attempt < attempts; attempt += 1){
    const result = await runQuery();
    if(!result?.error || !isNetworkError(result.error)){
      return result;
    }
    lastError = result.error;
    if(attempt < attempts - 1){
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { data: null, error: lastError };
}

function buildQrImageUrl(url){
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url || "")}`;
}

function browserSupportsWebNfc(){
  return typeof window.NDEFWriter !== "undefined" || typeof window.NDEFReader !== "undefined";
}

function isLikelyIphone(){
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua);
}

function populateShareQr(containerId, imageId, url){
  const box = document.getElementById(containerId);
  const img = document.getElementById(imageId);
  if(!box || !img || !url) return;
  img.src = buildQrImageUrl(url);
  img.alt = t().share.qrAlt;
}

function ensurePublicProfileCollectionsReset(){
  state.demoData.Books = [];
  state.demoData.Movies = [];
  state.demoData.Series = [];
  state.demoData.Anime = [];
  state.demoData.Manga = [];
  state.demoData.Blacklist = [];
}

function getItemStorageKey(itemOrParts = {}){
  const category = itemOrParts.category || state.currentCategory || "";
  const canonicalKey = itemOrParts.canonical_key || itemOrParts.canonicalKey || "";
  const workKey = itemOrParts.work_key || itemOrParts.workKey || "";
  const title = normalizeSpaces(itemOrParts.title || "").toLowerCase();
  return [category, canonicalKey || workKey || title].join(":");
}

async function getCurrentUser(options = {}){
  const now = Date.now();
  const useCache = !options.force && now - (currentUserCache.fetchedAt || 0) < 1200;
  if(useCache) return currentUserCache.user || null;
  if(currentUserPromise) return await currentUserPromise;

  currentUserPromise = (async () => {
    const { data, error } = await retryReadQuery(() => supabaseClient.auth.getUser(), 2, 180);
    if(error || !data?.user){
      currentUserCache = { user: null, fetchedAt: Date.now() };
      return null;
    }
    currentUserCache = { user: data.user, fetchedAt: Date.now() };
    return data.user;
  })();

  try {
    return await currentUserPromise;
  } finally {
    currentUserPromise = null;
  }
}

function syncCurrentUserCache(user = null){
  currentUserCache = { user: user || null, fetchedAt: Date.now() };
}

async function getCurrentUserId(){
  const user = await getCurrentUser();
  return user?.id || "guest";
}

async function getAccountStorageValue(suffix, fallback){
  const userId = await getCurrentUserId();
  try {
    const raw = localStorage.getItem(`plamut_${suffix}_${userId}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}

async function setAccountStorageValue(suffix, value){
  const userId = await getCurrentUserId();
  localStorage.setItem(`plamut_${suffix}_${userId}`, JSON.stringify(value));
}

async function getCustomStatuses(){
  return await getAccountStorageValue("custom_statuses", []);
}

async function setCustomStatuses(statuses){
  await setAccountStorageValue("custom_statuses", statuses);
}

async function getCustomFolders(){
  return await getAccountStorageValue("custom_folders", []);
}

async function setCustomFolders(folders){
  await setAccountStorageValue("custom_folders", folders);
}

async function getFolderAssignments(){
  return await getAccountStorageValue("folder_assignments", {});
}

async function setFolderAssignments(assignments){
  await setAccountStorageValue("folder_assignments", assignments);
}

async function getAvailableStatuses(){
  const customStatuses = await getCustomStatuses();
  const dynamicStatuses = Object.values(state.demoData)
    .flat()
    .map((item) => normalizeSpaces(item?.status || ""))
    .filter(Boolean);

  return Array.from(new Set(["Planned", "In progress", "Done", "Dropped", ...customStatuses, ...dynamicStatuses]));
}

async function getAvailableFolders(){
  const customFolders = await getCustomFolders();
  const dynamicFolders = Object.values(state.demoData)
    .flat()
    .map((item) => normalizeSpaces(item?.folder || ""))
    .filter(Boolean);

  return Array.from(new Set([...customFolders, ...dynamicFolders]));
}

function getItemById(category, id){
  return (state.demoData[category] || []).find((item) => item.id === id) || null;
}

function getItemFolder(item){
  return item?.folder || "";
}

function hideAllScreens(){
  document.getElementById("home-screen").classList.add("hidden");
  document.getElementById("library-screen")?.classList.add("hidden");
  document.getElementById("category-screen").classList.add("hidden");
  document.getElementById("details-screen").classList.add("hidden");
  document.getElementById("relations-screen")?.classList.add("hidden");
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("public-share-screen")?.classList.add("hidden");
  closeFolderModal();
}

function getVisibleScreenName(){
  if(!document.getElementById("details-screen")?.classList.contains("hidden")) return "details";
  if(!document.getElementById("category-screen")?.classList.contains("hidden")) return "category";
  if(!document.getElementById("library-screen")?.classList.contains("hidden")) return "library";
  if(!document.getElementById("public-share-screen")?.classList.contains("hidden")) return "public-share";
  if(!document.getElementById("auth-screen")?.classList.contains("hidden")) return "auth";
  return "home";
}

function getCurrentRouteSnapshot(){
  return {
    screen: getVisibleScreenName(),
    category: state.currentCategory || "",
    openItemId: Number.isFinite(Number(state.currentOpenItemId)) ? Number(state.currentOpenItemId) : null,
    isPublicShareRoute: Boolean(state.activeShareToken),
    shareToken: state.activeShareToken || "",
    sharePath: isNfcRoute() ? "nfc" : "share"
  };
}

function saveRouteState(routePatch = {}){
  if(routeRestoreInProgress) return;
  const payload = {
    ...getCurrentRouteSnapshot(),
    ...routePatch,
    updatedAt: Date.now()
  };
  try {
    sessionStorage.setItem(ROUTE_STATE_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error("Route state save error:", error);
  }
}

function readRouteState(){
  try {
    const raw = sessionStorage.getItem(ROUTE_STATE_STORAGE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    console.error("Route state read error:", error);
    return null;
  }
}

function clearRouteState(){
  try {
    sessionStorage.removeItem(ROUTE_STATE_STORAGE_KEY);
  } catch (error) {
    console.error("Route state clear error:", error);
  }
}

function setPublicRouteMode(active){
  document.body.classList.toggle("public-route-active", Boolean(active));
  const appShell = document.getElementById("app-shell");
  if(appShell){
    appShell.classList.toggle("public-route-shell", Boolean(active));
  }
}

function resetShelfSearchQuery(){
  state.currentShelfSearchQuery = "";
  syncShelfSearchInput();
}

function setShelfSearchQuery(value){
  state.currentShelfSearchQuery = normalizeSpaces(value);
  renderShelf();
}

function syncShelfSearchInput(){
  const input = document.getElementById("shelf-search-input");
  if(input) input.value = state.currentShelfSearchQuery;
}

function buildCanonicalKey(category, source, rawId, title){
  if(rawId) return `${category}:${source}:${rawId}`;
  return `${category}:${String(title || "").trim().toLowerCase()}`;
}

function looksLikeRussian(text){
  if(!text) return false;
  if(/[іїєґІЇЄҐ]/.test(text)) return false;
  const letters = text.match(/[A-Za-zА-Яа-яЁё]/g) || [];
  if(letters.length < 10) return false;
  const cyrillic = text.match(/[А-Яа-яЁё]/g) || [];
  return (cyrillic.length / letters.length) >= 0.6;
}

function looksLikeEnglish(text){
  if(!text) return false;
  const letters = text.match(/[A-Za-zА-Яа-яЁё]/g) || [];
  if(letters.length < 10) return false;
  const latin = text.match(/[A-Za-z]/g) || [];
  return (latin.length / letters.length) >= 0.6;
}

function getBookUiLanguage(){
  const appLanguage = normalizeLanguageCode(state.currentLanguage || "");
  const systemLanguage = normalizeLanguageCode(getSystemBrowserLanguage() || "");
  return appLanguage || systemLanguage || "ru";
}

function getBookDisplayTitle(item){
  if(!item) return "";
  const title = String(item.title || "").trim();
  const titleRu = String(item.title_ru || "").trim();
  const titleEn = String(item.title_en || "").trim();
  const titleOriginal = String(item.title_original || "").trim();
  const interfaceLanguage = getBookUiLanguage();

  if(interfaceLanguage === "ru"){
    if(titleRu) return titleRu;
    if(looksLikeRussian(title)) return title;
    if(looksLikeRussian(titleOriginal)) return titleOriginal;
    return title;
  }

  if(titleEn) return titleEn;
  if(looksLikeEnglish(title)) return title;
  if(looksLikeEnglish(titleOriginal)) return titleOriginal;
  return title;
}

function getBookSecondaryTitle(item){
  if(!item) return "";
  const interfaceLanguage = getBookUiLanguage();
  const primaryTitle = normalizeSpaces(getBookDisplayTitle(item));
  if(!primaryTitle) return "";

  const titleOriginal = normalizeSpaces(item.title_original || "");
  const titleRu = normalizeSpaces(item.title_ru || "");
  const titleEn = normalizeSpaces(item.title_en || "");

  const candidates = interfaceLanguage === "ru"
    ? [titleOriginal, titleEn]
    : [titleOriginal, titleRu];

  for(const candidate of candidates){
    if(!candidate) continue;
    if(normalizeComparisonText(candidate) === normalizeComparisonText(primaryTitle)) continue;
    return candidate;
  }

  return "";
}

function deriveBookTitleFields(baseTitle = "", titleRu = "", titleEn = "", titleOriginal = ""){
  const resolvedTitle = normalizeSpaces(baseTitle || "");
  const resolvedRu = normalizeSpaces(titleRu || "");
  const resolvedEn = normalizeSpaces(titleEn || "");
  const resolvedOriginal = normalizeSpaces(titleOriginal || resolvedTitle || "");

  return {
    title: resolvedTitle,
    title_ru: resolvedRu || (looksLikeRussian(resolvedTitle) ? resolvedTitle : ""),
    title_en: resolvedEn || (looksLikeEnglish(resolvedTitle) ? resolvedTitle : ""),
    title_original: resolvedOriginal || resolvedTitle
  };
}

function enrichBookTitleFieldsForSave(item = {}){
  const baseTitle = normalizeSpaces(item.title || "");
  const sourceTitleRu = normalizeSpaces(item.title_ru || "");
  const sourceTitleEn = normalizeSpaces(item.title_en || "");
  const sourceTitleOriginal = normalizeSpaces(item.title_original || baseTitle || "");

  let resolvedTitleRu = sourceTitleRu;
  if(!resolvedTitleRu){
    if(looksLikeRussian(baseTitle)){
      resolvedTitleRu = baseTitle;
    } else if(looksLikeRussian(sourceTitleOriginal)){
      resolvedTitleRu = sourceTitleOriginal;
    }
  }

  const resolvedTitleEn = sourceTitleEn || (looksLikeEnglish(baseTitle) ? baseTitle : "");
  const fields = deriveBookTitleFields(baseTitle, resolvedTitleRu, resolvedTitleEn, sourceTitleOriginal || baseTitle);

  return {
    ...item,
    title: fields.title || baseTitle,
    title_ru: fields.title_ru || "",
    title_en: fields.title_en || "",
    title_original: fields.title_original || sourceTitleOriginal || baseTitle
  };
}

function sanitizeGoogleBooksQueryPart(value, maxLen = 180){
  const clean = normalizeSpaces(String(value || "").replace(/[\n\r\t]+/g, " "));
  if(!clean) return "";
  const base = clean.split(/[|;]+/)[0].replace(/\s{2,}/g, " ").trim();
  if(base.length <= maxLen) return base;
  return base.slice(0, maxLen).replace(/[\s,.;:!?-]+$/g, "").trim();
}

function isApiErrorLikeText(text){
  const sample = normalizeSpaces(String(text || ""));
  if(!sample) return true;
  const normalized = sample.toLowerCase();
  if(normalized.length < 24) return false;
  return normalized.includes("query length limit exceeded")
    || /\bhttp\s*[45]\d\d\b/i.test(sample)
    || normalized.includes("bad request")
    || normalized.includes("internal server error")
    || normalized.includes("service unavailable")
    || normalized.includes("failed to fetch")
    || normalized.includes("network request failed")
    || normalized.includes("invalid api key")
    || normalized.includes("api error")
    || normalized.startsWith("error:")
    || normalized.startsWith("{");
}

function sanitizeBookDescriptionText(text){
  const clean = normalizeSpaces(text || "");
  if(!clean) return "";
  if(isApiErrorLikeText(clean)) return "";
  return clean;
}

async function normalizeDescriptionFields(description, { translateMissing = false } = {}){
  const clean = String(description || "");
  const isRu = looksLikeRussian(clean);
  const isEn = looksLikeEnglish(clean);

  let description_ru = isRu ? clean : "";
  let description_en = isEn ? clean : "";
  let description_original = isRu ? "" : clean;

  if(translateMissing && clean){
    if(isRu && !description_en){
      description_en = await translateTextToEnglish(clean);
      description_original = description_original || description_en || "";
    } else if(isEn && !description_ru){
      description_ru = await translateTextToRussian(clean);
    }
  }

  return {
    description: clean,
    description_ru: description_ru || "",
    description_original: description_original || description_en || "",
    description_en: description_en || description_original || ""
  };
}

function pickBestDescription(item, lang){
  if(!item) return "";
  const appLang = normalizeLanguageCode(lang);
  const systemLang = getSystemBrowserLanguage();
  const sequence = Array.from(new Set([appLang, systemLang, "en"].filter(Boolean)));

  for(const candidate of sequence){
    if(candidate === "ru" && item.description_ru) return item.description_ru;
    if(candidate === "en" && item.description_en) return item.description_en;
    if(candidate === "en" && item.description_original) return item.description_original;
  }

  if(appLang === "ru" || systemLang === "ru"){
    return item.description_ru || item.description_en || item.description_original || item.description || "";
  }

  return item.description || item.description_en || item.description_original || item.description_ru || "";
}

async function fetchJson(url, options = undefined){
  const response = await fetch(url, options);
  if(!response.ok) throw new Error("HTTP " + response.status);
  return await response.json();
}

async function translateText(text, fromLang, toLang){
  if(!text) return "";
  try {
    const url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text) +
      "&langpair=" +
      encodeURIComponent(fromLang + "|" + toLang);

    const data = await fetchJson(url);
    return (data?.responseData?.translatedText || "").trim();
  } catch (error) {
    console.error("Translation error:", error);
    return "";
  }
}

async function translateTextToRussian(text){
  if(hasCyrillic(text)) return text;
  return await translateText(text, "en", "ru");
}

async function translateTextToEnglish(text){
  if(hasLatin(text)) return text;
  return await translateText(text, "ru", "en");
}

async function buildSearchQueries(query){
  const meta = typeof query === "string" ? normalizeSearchQuery(query) : (query || normalizeSearchQuery(""));
  const clean = meta.text || normalizeSpaces(query);
  const list = [];
  const seen = new Set();

  function pushQuery(value){
    const normalized = normalizeSpaces(value);
    if(!normalized) return;
    const key = normalizeComparisonText(normalized);
    if(!key || seen.has(key)) return;
    seen.add(key);
    list.push(normalized);
  }

  if(meta.isbn){
    pushQuery(meta.isbn);
    return list;
  }

  pushQuery(clean);
  pushQuery(String(clean || "").trim());
  return list;
}

function getOpenLibraryCoverUrl(coverId){
  if(!coverId) return "";
  return "https://covers.openlibrary.org/b/id/" + coverId + "-L.jpg";
}

function buildBookCanonicalKey(source = "book", rawId = "", title = ""){
  return buildCanonicalKey("Books", source || "book", rawId || normalizeTitleForMatch(title), title || "Untitled");
}

function extractBestBookDescription(book = {}, preferredLang = state.currentLanguage){
  const description = sanitizeBookDescriptionText(book.description || "");
  const lang = normalizeLanguageCode(preferredLang || "");
  if(!description) return { description_ru: "", description_en: "", description_original: "" };
  if(lang === "ru" || looksLikeRussian(description)){
    return { description_ru: description, description_en: "", description_original: "" };
  }
  if(looksLikeEnglish(description)){
    return { description_ru: "", description_en: description, description_original: description };
  }
  return { description_ru: "", description_en: "", description_original: description };
}

function getBookSourcePriority(source, queryMeta = {}){
  const normalizedSource = String(source || "").toLowerCase();
  const isIsbnSearch = Boolean(queryMeta?.isbn);
  const isCyrillicQuery = Boolean(queryMeta?.hasCyrillic && !queryMeta?.isbn);
  if(normalizedSource === "fantlab") return isCyrillicQuery ? 24 : 6;
  if(normalizedSource === "openlibrary") return isIsbnSearch ? 24 : 20;
  if(normalizedSource === "google") return isIsbnSearch ? 16 : 14;
  return 0;
}

function buildBookIdentityKey(item = {}){
  if(item.isbn) return `isbn:${item.isbn}`;
  const titleKey = normalizeTitleForMatch(item.title || item.title_original || "");
  const authorKey = normalizeAuthorName(item.creator || "");
  const workKey = normalizeComparisonText(String(item.work_key || "").replace(/^.*:/, ""));
  if(workKey) return `work:${workKey}`;
  return `meta:${titleKey}::${authorKey}`;
}

function isBookResultUsable(item = {}){
  const title = normalizeSpaces(item.title || "");
  const creator = normalizeSpaces(item.creator || "");
  const hasCover = Boolean(item.cover);
  const hasDescription = Boolean(item.description_ru || item.description_original || item.description_en || item.description);
  return Boolean(title) && (hasCover || hasDescription || creator || item.isbn);
}

function buildBookResultScore(item = {}, queryMeta = {}){
  const queryKey = normalizeComparisonText(queryMeta?.text || "");
  const titleMain = normalizeComparisonText(item.title || "");
  const titleAlt = normalizeComparisonText([item.title_ru || "", item.title_en || "", item.title_original || ""].join(" "));
  const creatorKey = normalizeComparisonText(item.creator || "");
  const titlePool = [titleMain, titleAlt].filter(Boolean).join(" ");

  let score = getBookSourcePriority(item.source, queryMeta);

  if(queryMeta?.isbn && item?.isbn && item.isbn === queryMeta.isbn) score += 120;
  if(queryKey && titleMain === queryKey) score += 110;
  else if(queryKey && titleMain.startsWith(queryKey)) score += 70;
  else if(queryKey && titlePool.includes(queryKey)) score += 36;

  if(queryMeta?.hasCyrillic && String(item.source || "").toLowerCase() === "fantlab"){
    const cyrillicTitleProbe = [item.title || "", item.title_ru || "", item.title_original || ""].join(" ");
    if(hasCyrillic(cyrillicTitleProbe)) score += 18;
  }

  if(creatorKey) score += 4;
  if(item.cover) score += 3;
  if(item.description || item.description_ru || item.description_original || item.description_en) score += 2;
  if(item.isbn) score += 8;

  const titleProbe = normalizeComparisonText([item.title || "", item.title_original || "", item.title_en || "", item.title_ru || ""].join(" "));
  const softSecondaryPenaltyPatterns = [
    /collection/iu,
    /guide/iu,
    /encyclopedia/iu,
    /screenplay/iu,
    /unofficial/iu,
    /справочник/iu,
    /энциклопед/iu,
    /неофициальн/iu
  ];
  if(softSecondaryPenaltyPatterns.some((re) => re.test(titleProbe))){
    score -= 10;
  }

  if(!isBookResultUsable(item)) score -= 40;
  return score;
}

function shouldMergeBookCandidates(left = {}, right = {}){
  return areLikelySameBook(left, right);
}

function mergeBookResultPair(left = {}, right = {}, queryMeta = {}){
  const candidates = [left, right].filter(Boolean);
  const primary = candidates
    .slice()
    .sort((a, b) => buildBookResultScore(b, queryMeta) - buildBookResultScore(a, queryMeta))[0] || {};
  const secondary = primary === left ? right : left;

  const merged = {
    ...secondary,
    ...primary,
    title: primary.title || secondary?.title || "",
    creator: primary.creator || secondary?.creator || "",
    cover: primary.cover || secondary?.cover || "",
    isbn: primary.isbn || secondary?.isbn || "",
    description_ru: primary.description_ru || secondary?.description_ru || "",
    description_original: primary.description_original || secondary?.description_original || primary.description_en || secondary?.description_en || "",
    description_en: primary.description_en || secondary?.description_en || primary.description_original || secondary?.description_original || "",
    source_priority: Math.max(primary.source_priority || 0, secondary?.source_priority || 0)
  };

  merged.description = merged.description_ru || merged.description_original || merged.description_en || primary.description || secondary?.description || "";
  merged.canonical_key = merged.canonical_key || buildBookCanonicalKey(
    merged.source || "merged",
    merged.isbn || merged.work_key || buildBookIdentityKey(merged),
    merged.title
  );
  return merged;
}

function mergeBookResults(results = [], queryMeta = {}){
  const grouped = [];
  results.filter(Boolean).forEach((item) => {
    const index = grouped.findIndex((existing) =>
      shouldMergeBookCandidates(existing, item) || buildBookIdentityKey(existing) === buildBookIdentityKey(item)
    );
    if(index === -1){
      grouped.push(item);
      return;
    }
    grouped[index] = mergeBookResultPair(grouped[index], item, queryMeta);
  });
  return grouped;
}

function rankBookResults(results = [], queryMeta = {}){
  return results
    .filter((item) => isBookResultUsable(item))
    .sort((a, b) => buildBookResultScore(b, queryMeta) - buildBookResultScore(a, queryMeta));
}

function createBookResult({
  title = "",
  title_ru = "",
  title_en = "",
  title_original = "",
  creator = "",
  cover = "",
  isbn = "",
  description = "",
  description_ru = "",
  description_original = "",
  description_en = "",
  work_key = "",
  canonical_key = "",
  source = "",
  queryMeta = {}
} = {}){
  const safeTitle = normalizeSpaces(title);
  const safeCreator = normalizeSpaces(creator);
  const safeIsbn = detectISBN(isbn);
  const safeTitleRu = normalizeSpaces(title_ru);
  const safeTitleEn = normalizeSpaces(title_en);
  const safeTitleOriginal = normalizeSpaces(title_original);
  const original = normalizeSpaces(description_original || description_en || (description_ru ? "" : description));
  const russian = normalizeSpaces(description_ru || (looksLikeRussian(description) ? description : ""));
  const displayDescription = russian || original || normalizeSpaces(description);

  return {
    title: safeTitle,
    title_ru: safeTitleRu || "",
    title_en: safeTitleEn || "",
    title_original: safeTitleOriginal || "",
    category: "Books",
    creator: safeCreator,
    cover: cover || "",
    isbn: safeIsbn,
    description: displayDescription || "",
    description_ru: russian || "",
    description_original: original || "",
    description_en: description_en || original || "",
    work_key: work_key || "",
    source: source || "",
    source_priority: getBookSourcePriority(source, queryMeta),
    canonical_key: canonical_key || buildBookCanonicalKey(
      source || "book",
      safeIsbn || work_key || buildBookIdentityKey({ title: safeTitle, creator: safeCreator }),
      safeTitle
    )
  };
}

function mapGoogleBooksVolumeToBookResult(book, queryMeta = {}){
  const info = book?.volumeInfo || {};
  const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
  const isbn = detectISBN(
    identifiers.find((item) => /ISBN/i.test(item?.type || ""))?.identifier
    || identifiers[0]?.identifier
    || ""
  );
  const description = info.description || "";
  const language = String(info.language || "").toLowerCase();
  const titleFields = deriveBookTitleFields(info.title || "", "", info.title || "", info.title || "");

  return createBookResult({
    title: titleFields.title,
    title_ru: titleFields.title_ru,
    title_en: titleFields.title_en,
    title_original: titleFields.title_original,
    creator: Array.isArray(info.authors) ? info.authors.join(", ") : "",
    cover: info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "",
    isbn,
    description,
    description_ru: language.startsWith("ru") || looksLikeRussian(description) ? description : "",
    description_original: language.startsWith("ru") ? "" : description,
    description_en: language.startsWith("en") || looksLikeEnglish(description) ? description : "",
    work_key: book.id ? `google:${book.id}` : "",
    source: "google",
    queryMeta
  });
}

function normalizeOpenLibraryBook(book, queryMeta = {}){
  const isbn = detectISBN((Array.isArray(book.isbn) ? book.isbn[0] : book.isbn) || "");
  const titleFields = deriveBookTitleFields(book.title || "", "", "", book.title || "");
  const languages = normalizeBookLanguageData(book);
  const preferredLang = languages.includes("ru") ? "ru" : state.currentLanguage;
  const descriptions = extractBestBookDescription(book, preferredLang);
  const workKey = String(book.key || "").startsWith("/works/")
    ? String(book.key)
    : book?.edition_key?.[0]
      ? `/books/${book.edition_key[0]}`
      : "";

  return createBookResult({
    title: titleFields.title,
    title_ru: titleFields.title_ru,
    title_en: titleFields.title_en,
    title_original: titleFields.title_original,
    creator: normalizeBookAuthorData(book),
    cover: book.cover_i ? getOpenLibraryCoverUrl(book.cover_i) : "",
    isbn,
    description_ru: descriptions.description_ru,
    description_original: descriptions.description_original,
    description_en: descriptions.description_en,
    work_key: workKey,
    canonical_key: buildBookCanonicalKey(
      "openlibrary",
      workKey || isbn || `${normalizeTitleForMatch(titleFields.title)}:${normalizeAuthorName(normalizeBookAuthorData(book))}`,
      titleFields.title
    ),
    source: "openlibrary",
    queryMeta
  });
}

function dedupeSearchResults(items){
  const seen = new Set();
  return items.filter((item) => {
    const key = item.category === "Books"
      ? buildBookIdentityKey(item)
      : (
        item.canonical_key
        || item.work_key
        || [
          item.category,
          normalizeComparisonText(item.title || ""),
          normalizeComparisonText(item.title_original || item.original_title || ""),
          normalizeComparisonText(item.title_en || ""),
          normalizeComparisonText(item.title_ru || ""),
          normalizeComparisonText(item.creator || "")
        ].join(":")
      );

    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapUserMediaRowToSearchResult(row, category){
  const titleFields = deriveBookTitleFields(
    row.title || "",
    row.title_ru || "",
    row.title_en || "",
    row.title_original || row.original_title || row.title || ""
  );

  return {
    id: row.id,
    title: titleFields.title,
    category,
    creator: row.creator || "",
    cover: row.cover_url || "",
    description: row.description || "",
    description_ru: row.description_ru || "",
    description_original: row.description_original || row.description_en || "",
    description_en: row.description_en || "",
    work_key: row.work_key || "",
    canonical_key: row.canonical_key || "",
    title_ru: titleFields.title_ru,
    title_en: titleFields.title_en,
    title_original: titleFields.title_original
  };
}

async function searchLocalSupabaseCached(category, queryMeta, limit = 10){
  const localItems = (state.demoData[category] || []).filter((item) => itemMatchesQuery(item, queryMeta));
  const user = await getCurrentUser();
  if(!user) return dedupeSearchResults(localItems).slice(0, limit);

  const { data, error } = await supabaseClient
    .from("user_media")
    .select("id, title, title_ru, title_en, title_original, status, cover_url, description, description_ru, description_en, description_original, creator, work_key, canonical_key, category, folder_name")
    .eq("user_id", user.id)
    .eq("category", category)
    .order("id", { ascending: false })
    .limit(250);

  if(error){
    console.error("Supabase local search error:", error);
    return dedupeSearchResults(localItems).slice(0, limit);
  }

  const fromDb = (data || [])
    .map((row) => mapUserMediaRowToSearchResult(row, category))
    .filter((item) => itemMatchesQuery(item, queryMeta));

  return dedupeSearchResults([...localItems, ...fromDb]).slice(0, limit);
}

async function fetchOpenLibraryDescription(workKey, preferredLang = state.currentLanguage){
  if(!workKey) return { text: "", language: "" };
  const normalizedWorkKey = String(workKey || "").trim();
  if(!normalizedWorkKey.startsWith("/works/") && !/^OL\d+W$/i.test(normalizedWorkKey)){
    return { text: "", language: "" };
  }

  try {
    const cleanKey = normalizedWorkKey.startsWith("/works/") ? normalizedWorkKey : `/works/${normalizedWorkKey}`;
    const workUrl = "https://openlibrary.org" + cleanKey + ".json";
    const workData = await fetchJson(workUrl);

    function extractDescription(obj){
      if(!obj) return "";
      if(typeof obj.description === "string") return obj.description.trim();
      if(obj.description && typeof obj.description.value === "string") return obj.description.value.trim();
      return "";
    }

    function detectLang(text){
      if(looksLikeRussian(text)) return "ru";
      if(looksLikeEnglish(text)) return "en";
      return "";
    }

    const workDescription = extractDescription(workData);
    const workLang = detectLang(workDescription);
    const targetLangKey = preferredLang === "ru" ? "/languages/rus" : "/languages/eng";
    const editionsUrl = "https://openlibrary.org" + cleanKey + "/editions.json?limit=30";

    try {
      const editionsData = await fetchJson(editionsUrl);
      const entries = Array.isArray(editionsData.entries)
        ? editionsData.entries
        : Array.isArray(editionsData.docs)
          ? editionsData.docs
          : [];

      for(const edition of entries){
        const languages = Array.isArray(edition.languages) ? edition.languages : [];
        const hasTargetLanguage = languages.some((lang) => {
          if(!lang) return false;
          if(typeof lang === "string") return lang === targetLangKey;
          return lang.key === targetLangKey;
        });

        if(!hasTargetLanguage) continue;

        const editionDescription = extractDescription(edition);
        if(editionDescription){
          const lang = detectLang(editionDescription);
          return { text: editionDescription, language: lang };
        }

        const editionKey = edition.key || "";
        if(!editionKey) continue;

        try {
          const editionData = await fetchJson("https://openlibrary.org" + editionKey + ".json");
          const fullEditionDescription = extractDescription(editionData);
          if(fullEditionDescription){
            const lang = detectLang(fullEditionDescription);
            return { text: fullEditionDescription, language: lang };
          }
        } catch (e) {
          console.error("Edition description error:", e);
        }
      }
    } catch (e) {
      console.error("Open Library editions error:", e);
    }

    return { text: workDescription, language: workLang };
  } catch (error) {
    console.error("Open Library description error:", error);
    return { text: "", language: "" };
  }
}

async function fetchGoogleBooksDescription(title, author = "", preferredLang = state.currentLanguage){
  try {
    const targetLang = preferredLang === "ru" ? "ru" : "en";
    const safeTitle = sanitizeGoogleBooksQueryPart(title, 220);
    const safeAuthor = sanitizeGoogleBooksQueryPart(author, 120);
    const isbn = detectISBN(safeTitle);

    let query = "";
    if(isbn){
      query = `isbn:${isbn}`;
    } else {
      const queryParts = [];
      if(safeTitle) queryParts.push(`intitle:${safeTitle}`);
      if(safeAuthor) queryParts.push(`inauthor:${safeAuthor}`);
      query = queryParts.join(" ").trim();
    }

    if(!query) return { text: "", language: "", matchedLanguage: false };

    const QUERY_LIMIT = 460;
    if(query.length > QUERY_LIMIT){
      if(query.startsWith("intitle:")){
        query = `intitle:${sanitizeGoogleBooksQueryPart(safeTitle, 120)}`;
      }
      if(query.length > QUERY_LIMIT){
        return { text: "", language: "", matchedLanguage: false };
      }
    }

    function detectLang(text){
      if(looksLikeRussian(text)) return "ru";
      if(looksLikeEnglish(text)) return "en";
      return "";
    }

    async function tryRequest(url){
      let data;
      try {
        data = await fetchJson(url);
      } catch (requestError) {
        const message = String(requestError?.message || requestError || "");
        if(/query\s+length\s+limit\s+exceeded/i.test(message)){
          return { text: "", language: "", matchedLanguage: false };
        }
        throw requestError;
      }

      const items = Array.isArray(data?.items) ? data.items : [];

      for(const book of items){
        const info = book.volumeInfo || {};
        const description = sanitizeBookDescriptionText(info.description || "");
        if(!description) continue;
        const lang = detectLang(description);
        if(lang === targetLang){
          return { text: description, language: lang, matchedLanguage: true };
        }
      }

      for(const book of items){
        const info = book.volumeInfo || {};
        const description = sanitizeBookDescriptionText(info.description || "");
        if(description){
          const lang = detectLang(description);
          return { text: description, language: lang, matchedLanguage: false };
        }
      }

      return { text: "", language: "", matchedLanguage: false };
    }

    const strictUrl =
      "https://www.googleapis.com/books/v1/volumes?q=" +
      encodeURIComponent(query) +
      "&langRestrict=" + encodeURIComponent(targetLang) +
      "&maxResults=10" +
      "&key=" + encodeURIComponent(GOOGLE_BOOKS_API_KEY);

    let result = await tryRequest(strictUrl);
    if(result.text) return result;

    const fallbackUrl =
      "https://www.googleapis.com/books/v1/volumes?q=" +
      encodeURIComponent(query) +
      "&maxResults=10" +
      "&key=" + encodeURIComponent(GOOGLE_BOOKS_API_KEY);

    result = await tryRequest(fallbackUrl);
    return result;
  } catch (error) {
    console.error("Google Books description error:", error);
    return { text: "", language: "", matchedLanguage: false };
  }
}

async function searchFantLabProxy(queryMeta, limit = 10, queriesOverride = null){
  if(!queryMeta?.text || queryMeta?.isbn) return [];

  const queries = Array.isArray(queriesOverride) && queriesOverride.length
    ? queriesOverride
    : await buildSearchQueries(queryMeta);

  for(const query of queries){
    if(!query) continue;
    try {
      const url = "/api/books/fantlab?q=" + encodeURIComponent(query);
      const data = await fetchJson(url);
      const items = Array.isArray(data) ? data : [];
      const results = items
        .map((item) => createBookResult({
          title: item?.title || "",
          title_ru: item?.title_ru || "",
          title_en: item?.title_en || "",
          title_original: item?.title_original || item?.title || "",
          creator: item?.creator || "",
          cover: item?.cover || "",
          description: item?.description || "",
          description_ru: item?.description_ru || "",
          description_original: item?.description_original || item?.description_en || "",
          description_en: item?.description_en || "",
          work_key: item?.work_key || "",
          canonical_key: item?.canonical_key || "",
          source: "fantlab",
          queryMeta
        }))
        .filter((item) => item && item.title);

      if(results.length){
        return results.slice(0, limit);
      }
    } catch (error) {
      console.error("FantLab proxy search error:", error);
    }
  }

  return [];
}

async function searchGoogleBooks(queryMeta, limit = 10, queriesOverride = null){
  try {
    const queries = queryMeta.isbn
      ? [`isbn:${queryMeta.isbn}`]
      : (Array.isArray(queriesOverride) && queriesOverride.length ? queriesOverride : await buildSearchQueries(queryMeta));

    const results = [];
    for(const query of queries){
      const url =
        "https://www.googleapis.com/books/v1/volumes?q=" +
        encodeURIComponent(query) +
        "&maxResults=" + encodeURIComponent(limit) +
        "&printType=books" +
        "&key=" + encodeURIComponent(GOOGLE_BOOKS_API_KEY);

      const data = await fetchJson(url);
      const items = Array.isArray(data.items) ? data.items : [];
      results.push(...items.map((item) => mapGoogleBooksVolumeToBookResult(item, queryMeta)));
    }

    return results.slice(0, limit * Math.max(1, queries.length));
  } catch (error) {
    console.error("Google Books search error:", error);
    return [];
  }
}

async function searchOpenLibraryBooks(queryMeta, limit = 10, queriesOverride = null){
  try {
    const queries = queryMeta.isbn
      ? [queryMeta.isbn]
      : (Array.isArray(queriesOverride) && queriesOverride.length ? queriesOverride : await buildSearchQueries(queryMeta));

    const results = [];
    for(const query of queries){
      const url = queryMeta.isbn
        ? "https://openlibrary.org/search.json?isbn=" + encodeURIComponent(query) + "&limit=" + limit
        : "https://openlibrary.org/search.json?q=" + encodeURIComponent(query) + "&limit=" + limit;

      const data = await fetchJson(url);
      const docs = Array.isArray(data.docs) ? data.docs : [];
      results.push(...docs.map((item) => normalizeOpenLibraryBook(item, queryMeta)));
    }

    return dedupeSearchResults(results).slice(0, limit * Math.max(1, queries.length));
  } catch (error) {
    console.error("Open Library search error:", error);
    return [];
  }
}

function getBookSearchCacheKey(queryMeta = {}){
  return [
    state.currentLanguage || "",
    queryMeta.text || "",
    queryMeta.comparison || "",
    queryMeta.isbn || "",
    queryMeta.hasCyrillic ? "cy" : "",
    queryMeta.hasLatin ? "la" : ""
  ].join("|");
}

async function buildBookDescriptions(title, author, workKey, isbn = ""){
  const cacheKey = [normalizeComparisonText(title), normalizeComparisonText(author), String(workKey || "").trim(), detectISBN(isbn)].join("|");
  if(state.bookDescriptionCache.has(cacheKey)){
    return { ...state.bookDescriptionCache.get(cacheKey) };
  }

  let description = "";
  let description_ru = "";
  let description_original = "";
  let description_en = "";
  const normalizedIsbn = detectISBN(isbn);

  const olCurrent = await fetchOpenLibraryDescription(workKey, state.currentLanguage);
  if(olCurrent.text){
    const cleanCurrent = sanitizeBookDescriptionText(olCurrent.text);
    if(cleanCurrent){
      description = cleanCurrent;
      if(olCurrent.language === "ru") description_ru = cleanCurrent;
      if(olCurrent.language === "en"){
        description_original = cleanCurrent;
        description_en = cleanCurrent;
      }
    }
  }

  if(!description_ru){
    const olRu = await fetchOpenLibraryDescription(workKey, "ru");
    const cleanOlRu = sanitizeBookDescriptionText(olRu.text);
    if(cleanOlRu && looksLikeRussian(cleanOlRu)){
      description_ru = cleanOlRu;
      if(!description) description = cleanOlRu;
    }
  }

  if(!description_en){
    const olEn = await fetchOpenLibraryDescription(workKey, "en");
    const cleanOlEn = sanitizeBookDescriptionText(olEn.text);
    if(cleanOlEn && looksLikeEnglish(cleanOlEn)){
      description_original = description_original || cleanOlEn;
      description_en = cleanOlEn;
      if(!description) description = cleanOlEn;
    }
  }

  if(!description_ru){
    const googleRu = await fetchGoogleBooksDescription(normalizedIsbn || title, author, "ru");
    const cleanGoogleRu = sanitizeBookDescriptionText(googleRu.text);
    if(cleanGoogleRu && looksLikeRussian(cleanGoogleRu)){
      description_ru = cleanGoogleRu;
      if(!description) description = cleanGoogleRu;
    }
  }

  if(!description_en){
    const googleEn = await fetchGoogleBooksDescription(normalizedIsbn || title, author, "en");
    const cleanGoogleEn = sanitizeBookDescriptionText(googleEn.text);
    if(cleanGoogleEn && looksLikeEnglish(cleanGoogleEn)){
      description_original = description_original || cleanGoogleEn;
      description_en = cleanGoogleEn;
      if(!description) description = cleanGoogleEn;
    }
  }

  if(!description_ru && (description_original || description_en)){
    const translatedRu = await translateTextToRussian(description_original || description_en);
    const cleanTranslatedRu = sanitizeBookDescriptionText(translatedRu);
    if(cleanTranslatedRu){
      description_ru = cleanTranslatedRu;
      if(!description) description = cleanTranslatedRu;
    }
  }

  if(!description){
    description = description_ru || description_original || description_en || "";
  }

  const payload = {
    description: sanitizeBookDescriptionText(description) || "",
    description_ru: sanitizeBookDescriptionText(description_ru) || "",
    description_original: sanitizeBookDescriptionText(description_original || description_en) || "",
    description_en: sanitizeBookDescriptionText(description_en || description_original) || ""
  };

  state.bookDescriptionCache.set(cacheKey, payload);
  return { ...payload };
}

async function searchBooksApi(query, limit = 10){
  const queryMeta = normalizeSearchQuery(query);
  if(!queryMeta.text && !queryMeta.isbn) return [];

  const cacheKey = getBookSearchCacheKey(queryMeta);
  const cached = bookSearchResponseCache.get(cacheKey);
  if(cached && (Date.now() - cached.at) < BOOK_SEARCH_CACHE_TTL_MS){
    return cached.results.slice(0, limit);
  }

  try {
    const queries = queryMeta.isbn ? [queryMeta.isbn] : await buildSearchQueries(queryMeta);
    const fallbackQueries = queries.length > 1 ? queries : queries.slice(0, 1);
    let collected = [];
    const stageLimit = Math.max(limit, 8);

    async function runStage(searchFn, stageQueries){
      const results = await searchFn(queryMeta, stageLimit, stageQueries);
      if(results?.length){
        collected = mergeBookResults([...collected, ...results], queryMeta);
      }
      return rankBookResults(collected, queryMeta);
    }

    if(queryMeta.isbn){
      await runStage(searchOpenLibraryBooks, [queryMeta.isbn]);
      if(collected.length < Math.min(4, limit)){
        await runStage(searchGoogleBooks, [`isbn:${queryMeta.isbn}`]);
      }
    } else if(queryMeta.hasCyrillic){
      await runStage(searchFantLabProxy, fallbackQueries);
      if(collected.length < Math.min(5, limit)){
        await runStage(searchOpenLibraryBooks, fallbackQueries);
      }
      if(collected.length < Math.min(6, limit)){
        await runStage(searchGoogleBooks, fallbackQueries);
      }
    } else {
      await runStage(searchOpenLibraryBooks, fallbackQueries);
      if(collected.length < Math.min(5, limit)){
        await runStage(searchGoogleBooks, fallbackQueries);
      }
    }

    const ranked = rankBookResults(mergeBookResults(collected, queryMeta), queryMeta).slice(0, stageLimit);
    const finalResults = ranked.slice(0, limit);
    bookSearchResponseCache.set(cacheKey, { at: Date.now(), results: finalResults.slice() });
    return finalResults;
  } catch (e) {
    console.error("Books search error:", e);
    return [];
  }
}

async function searchTMDbApi(query, mediaType = "movie", limit = 10){
  try {
    const languagesToTry = state.currentLanguage === "ru" ? ["ru-RU", "en-US"] : ["en-US", "ru-RU"];
    let results = [];

    for(const language of languagesToTry){
      const url = "https://api.themoviedb.org/3/search/" + mediaType +
        "?api_key=" + encodeURIComponent(TMDB_API_KEY) +
        "&query=" + encodeURIComponent(query) +
        "&language=" + encodeURIComponent(language) +
        "&page=1";

      const data = await fetchJson(url);
      const items = Array.isArray(data.results) ? data.results : [];
      results = results.concat(items);
      if(results.length >= limit) break;
    }

    const deduped = [];
    const seen = new Set();

    for(const item of results){
      const key = String(item.id || "");
      if(!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if(deduped.length >= limit) break;
    }

    return deduped.map((item) => {
      const title = mediaType === "tv"
        ? (item.name || item.original_name || "Untitled")
        : (item.title || item.original_title || "Untitled");

      const overview = item.overview || "";
      const category = mediaType === "tv" ? "Series" : "Movies";
      const externalId = String(item.id || "");

      return {
        title,
        category,
        creator: "",
        cover: item.poster_path ? ("https://image.tmdb.org/t/p/w500" + item.poster_path) : "",
        description: overview,
        description_ru: looksLikeRussian(overview) ? overview : "",
        description_en: looksLikeEnglish(overview) ? overview : "",
        title_original: mediaType === "tv" ? (item.original_name || "") : (item.original_title || ""),
        title_en: mediaType === "tv" ? (item.name || "") : (item.title || ""),
        title_ru: "",
        work_key: `tmdb:${mediaType}:${externalId}`,
        canonical_key: buildCanonicalKey(category, "tmdb", `${mediaType}:${externalId}`, title)
      };
    });
  } catch (e) {
    console.error("TMDb search error:", e);
    return [];
  }
}

async function searchJikanApi(query, kind = "anime", limit = 10){
  try {
    const url = "https://api.jikan.moe/v4/" + kind + "?q=" + encodeURIComponent(query) + "&limit=" + limit;
    const data = await fetchJson(url);
    const results = Array.isArray(data.data) ? data.data : [];

    return results.map((item) => {
      const title = item.title || item.title_english || "Untitled";
      const creator =
        kind === "anime"
          ? ((item.studios || []).map((x) => x.name).join(", "))
          : ((item.authors || []).map((x) => x.name).join(", "));
      const synopsis = item.synopsis || "";
      const category = kind === "anime" ? "Anime" : "Manga";
      const externalId = String(item.mal_id || "");
      return {
        title,
        category,
        creator,
        cover: item.images?.jpg?.image_url || "",
        description: synopsis,
        description_ru: looksLikeRussian(synopsis) ? synopsis : "",
        description_en: looksLikeEnglish(synopsis) ? synopsis : "",
        title_original: item.title_japanese || "",
        title_en: item.title_english || "",
        title_ru: "",
        work_key: `jikan:${kind}:${externalId}`,
        canonical_key: buildCanonicalKey(category, "jikan", `${kind}:${externalId}`, title)
      };
    });
  } catch (e) {
    console.error("Jikan search error:", e);
    return [];
  }
}

async function searchAniListApi(query, kind = "ANIME", limit = 10){
  try {
    const body = {
      query: `
        query ($search: String, $type: MediaType) {
          Page(page: 1, perPage: ${limit}) {
            media(search: $search, type: $type) {
              id
              title {
                romaji
                english
                native
              }
              description(asHtml: false)
              coverImage {
                large
              }
              studios(isMain: true) {
                nodes {
                  name
                }
              }
            }
          }
        }
      `,
      variables: {
        search: query,
        type: kind
      }
    };

    const data = await fetchJson("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body)
    });

    const results = data?.data?.Page?.media || [];
    return results.map((item) => {
      const title = item.title?.english || item.title?.romaji || item.title?.native || "Untitled";
      const creator = (item.studios?.nodes || []).map((x) => x.name).join(", ");
      const description = String(item.description || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
      const category = kind === "ANIME" ? "Anime" : "Manga";
      return {
        title,
        category,
        creator,
        cover: item.coverImage?.large || "",
        description,
        description_ru: looksLikeRussian(description) ? description : "",
        description_en: looksLikeEnglish(description) ? description : "",
        title_original: item.title?.native || "",
        title_en: item.title?.english || "",
        title_ru: "",
        work_key: `anilist:${kind.toLowerCase()}:${item.id}`,
        canonical_key: buildCanonicalKey(category, "anilist", `${kind.toLowerCase()}:${item.id}`, title)
      };
    });
  } catch (e) {
    console.error("AniList search error:", e);
    return [];
  }
}

async function searchAnimeMangaApi(query, kind, limit = 10){
  return await searchMediaWithFallback(query, kind, limit, {
    searchJikanApi,
    searchAniListApi
  });
}

async function searchByCategory(category, query, limit = 10){
  const queryMeta = normalizeSearchQuery(query);
  if(!queryMeta.text && !queryMeta.isbn) return [];

  const cacheKey = [category, state.currentLanguage, queryMeta.comparison || queryMeta.isbn || ""].join("|");
  if(state.categorySearchCache.has(cacheKey)){
    return state.categorySearchCache.get(cacheKey).slice(0, limit);
  }
  if(state.categorySearchInFlight.has(cacheKey)){
    return (await state.categorySearchInFlight.get(cacheKey)).slice(0, limit);
  }

  const searchPromise = (async () => {
    const localResults = await searchLocalSupabaseCached(category, queryMeta, limit);

    if(category === "Books"){
      const externalResults = await searchBooksApi(query, limit);
      const combinedBooks = dedupeSearchResults([...externalResults, ...localResults]);
      const existingBooks = state.demoData.Books || [];

      const normalizedBooks = combinedBooks.map((book) => {
        const normalizedTitle = normalizeComparisonText(book.title || "");
        const normalizedCreator = normalizeComparisonText(book.creator || "");
        const alreadyAdded = existingBooks.some((existing) => {
          if(book.canonical_key && existing.canonical_key && book.canonical_key === existing.canonical_key) return true;
          if(book.work_key && existing.work_key && book.work_key === existing.work_key) return true;
          return normalizedTitle
            && normalizedTitle === normalizeComparisonText(existing.title || "")
            && normalizedCreator === normalizeComparisonText(existing.creator || "");
        });
        return { ...book, already_added: alreadyAdded };
      });

      return normalizedBooks.slice(0, limit);
    }

    if(localResults.length > 0){
      return dedupeSearchResults(localResults).slice(0, limit);
    }

    const searchQueries = await buildSearchQueries(queryMeta);
    let combined = [];

    for(const q of searchQueries){
      let results = [];
      if(category === "Movies") results = await searchTMDbApi(q, "movie", limit);
      if(category === "Series") results = await searchTMDbApi(q, "tv", limit);
      if(category === "Anime") results = await searchAnimeMangaApi(q, "anime", limit);
      if(category === "Manga") results = await searchAnimeMangaApi(q, "manga", limit);

      combined = dedupeSearchResults([...combined, ...results]);
      if(combined.length >= limit) break;
    }

    return dedupeSearchResults(combined).slice(0, limit);
  })();

  state.categorySearchInFlight.set(cacheKey, searchPromise);
  const resolved = await searchPromise;
  state.categorySearchInFlight.delete(cacheKey);
  state.categorySearchCache.set(cacheKey, resolved.slice(0, limit));
  return resolved.slice(0, limit);
}

function isDuplicateItem(category, title, workKey = ""){
  const items = state.demoData[category] || [];
  return items.some((item) => {
    if(workKey && item.work_key && item.work_key === workKey) return true;
    return (item.title || "").trim().toLowerCase() === title.trim().toLowerCase();
  });
}

async function existsInSupabase(category, title, workKey = "", canonicalKey = ""){
  const user = await getCurrentUser();
  if(!user) return false;

  let query = supabaseClient
    .from("user_media")
    .select("id, title, work_key, canonical_key")
    .eq("user_id", user.id)
    .eq("category", category)
    .limit(20);

  if(workKey){
    query = query.eq("work_key", workKey);
  } else if(canonicalKey){
    query = query.eq("canonical_key", canonicalKey);
  } else {
    query = query.ilike("title", title);
  }

  const { data, error } = await query;
  if(error){
    console.error("Supabase duplicate check error:", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function saveItemToSupabase(
  title,
  category,
  status,
  cover = "",
  description = "",
  creator = "",
  workKey = "",
  canonicalKey = "",
  description_ru = "",
  description_en = "",
  title_ru = "",
  title_en = "",
  title_original = "",
  description_original = "",
  folder_name = ""
){
  const user = await getCurrentUser();

  if(!user){
    alert(t().labels.mustBeLoggedIn);
    return false;
  }

  const titleFields = deriveBookTitleFields(title, title_ru, title_en, title_original || title);
  const finalCanonicalKey = canonicalKey || workKey || (titleFields.title || "").trim().toLowerCase();
  const autoLang = await normalizeDescriptionFields(description);
  const originalDescription = description_original || description_en || autoLang.description_original || "";

  const insertData = {
    user_id: user.id,
    title: titleFields.title,
    title_ru: titleFields.title_ru,
    title_en: titleFields.title_en,
    title_original: titleFields.title_original,
    category,
    status: status || "Planned",
    cover_url: cover,
    description: description || "",
    description_ru: description_ru || autoLang.description_ru || "",
    description_en: description_en || originalDescription || autoLang.description_en || "",
    description_original: originalDescription || "",
    creator: creator || "",
    work_key: workKey || "",
    canonical_key: finalCanonicalKey,
    folder_name: folder_name || ""
  };

  const { error } = await supabaseClient.from("user_media").insert([insertData]);

  if(error){
    console.error("Supabase insert error:", error);
    alert(t().labels.dbSaveError + ": " + error.message);
    return false;
  }

  return true;
}

function buildLocalShelfItem({
  title,
  title_ru = "",
  title_en = "",
  title_original = "",
  category,
  status = "Planned",
  cover = "",
  description = "",
  creator = "",
  work_key = "",
  canonical_key = "",
  folder = "",
  isbn = "",
  description_ru = "",
  description_en = "",
  description_original = ""
}){
  const titleFields = deriveBookTitleFields(title || "", title_ru || "", title_en || "", title_original || title || "");
  return {
    id: -Date.now() - Math.floor(Math.random() * 1000),
    title: titleFields.title,
    title_ru: titleFields.title_ru,
    title_en: titleFields.title_en,
    title_original: titleFields.title_original,
    category: category || "",
    status: status || "Planned",
    cover: cover || "",
    description: description || "",
    description_ru: description_ru || "",
    description_original: description_original || description_en || "",
    description_en: description_en || "",
    creator: creator || "",
    isbn: isbn || "",
    work_key: work_key || "",
    canonical_key: canonical_key || work_key || (titleFields.title || "").trim().toLowerCase(),
    folder: folder || ""
  };
}

function clearSearchCaches(){
  state.categorySearchCache.clear();
  state.categorySearchInFlight.clear();
}

function insertLocalShelfItem(category, item){
  if(!category || !item) return;

  if(!state.demoData[category]){
    state.demoData[category] = [];
  }

  const dedupeKey = item.canonical_key || item.work_key || normalizeSpaces(item.title || "").toLowerCase();
  const alreadyExists = state.demoData[category].some((row) => {
    const rowKey = row.canonical_key || row.work_key || normalizeSpaces(row.title || "").toLowerCase();
    return rowKey === dedupeKey;
  });

  if(!alreadyExists){
    state.demoData[category].unshift(item);
    clearRelationCache();
    clearSearchCaches();
  }
}

import {
  GOOGLE_BOOKS_API_KEY,
  TMDB_API_KEY,
  supabaseClient
} from "../api/supabase-client.js";

import { t } from "../i18n.js";
import { BASE_CATEGORIES, getCategoryLabel, getStatusLabel } from "../core/constants.js";
import { state } from "../core/state.js";

import {
  normalizeSearchQuery,
  hasCyrillic,
  hasLatin,
  itemMatchesQuery,
  searchMediaWithFallback
} from "./media-search.js";

import {
  normalizeAuthorName,
  normalizeTitleForMatch,
  areLikelySameBook,
  normalizeBookAuthorData,
  normalizeBookLanguageData
} from "./books.js";

import { ensureProfileShareToken, regenerateProfileShareToken } from "../api/public-api.js";

import {
  escapeHtml,
  normalizeSpaces,
  normalizeComparisonText,
  normalizeLanguageCode,
  detectISBN,
  setValueIfPresent,
  setCheckedIfPresent,
  setTextIfPresent
} from "../utils/index.js";

import { createAuthCore } from "./auth.js";
import { createProfileCore } from "./profile.js";
import { createStatusCore } from "./status.js";
import { createFoldersCore } from "./folders.js";
import { createDetailsCore } from "./details.js";
import { createRelationsCore } from "./relations.js";
import { createShareCore } from "./share.js";
import { createPublicViewCore } from "./public-view.js";

const systemThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
const ROUTE_STATE_STORAGE_KEY = "plamut_route_state";
const FOREGROUND_RESTORE_COOLDOWN_MS = 1200;
const BOOK_SEARCH_CACHE_TTL_MS = 120000;
const WIKIDATA_BOOK_RESOLVE_TTL_MS = 30 * 60 * 1000;

let relationsCore = null;
let shareCore = null;
let publicViewCore = null;
let routeRestoreInProgress = false;
let authBootstrapCompleted = false;
let currentUserPromise = null;
let currentUserCache = { user: null, fetchedAt: 0 };
let foregroundRestorePromise = null;
let lastForegroundRestoreAt = 0;
let librarySearchDebounceTimer = null;
let libraryDataLoadingPromise = null;

const libraryLoadedCategories = new Set();
const libraryCategoryLoadingPromises = new Map();
const bookSearchResponseCache = new Map();
const wikidataBookResolveCache = new Map();

function resolveThemeMode(mode = state.currentThemeMode){
  if(mode === "system"){
    return systemThemeMedia.matches ? "dark" : "light";
  }
  return mode === "light" ? "light" : "dark";
}

function applyThemeMode(){
  const resolvedTheme = resolveThemeMode();
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
  updatePreferenceControls();
}

function setThemeMode(mode){
  state.currentThemeMode = ["light", "dark", "system"].includes(mode) ? mode : "system";
  localStorage.setItem("plamut_theme_mode", state.currentThemeMode);
  applyThemeMode();
}

function getSystemBrowserLanguage(){
  const list = Array.isArray(navigator.languages) ? navigator.languages : [];
  return normalizeLanguageCode(list[0] || navigator.language || "");
}

function getProfileInitials(displayName = "", username = ""){
  const source = normalizeSpaces(displayName || username || "P");
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = parts.map((part) => part.charAt(0).toUpperCase()).join("");
  return initials || "P";
}

function translateStatus(status){
  return getStatusLabel(status, state.currentLanguage);
}

function translateCategory(category){
  return getCategoryLabel(category, state.currentLanguage);
}

function updatePreferenceControls(){
  const languageTitle = document.getElementById("preferences-language-title");
  const themeTitle = document.getElementById("preferences-theme-title");
  const profileBtn = document.getElementById("profile-btn");

  if(languageTitle) languageTitle.textContent = t().topbar.language;
  if(themeTitle) themeTitle.textContent = t().topbar.theme;

  [["lang-option-ru", "ru"], ["lang-option-en", "en"]].forEach(([id, value]) => {
    const button = document.getElementById(id);
    if(!button) return;
    const isActive = state.currentLanguage === value;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  [
    ["theme-option-light", "light", t().topbar.themeLight],
    ["theme-option-dark", "dark", t().topbar.themeDark],
    ["theme-option-system", "system", t().topbar.themeSystem]
  ].forEach(([id, value, label]) => {
    const button = document.getElementById(id);
    if(!button) return;
    const isActive = state.currentThemeMode === value;
    button.textContent = label;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  if(profileBtn){
    profileBtn.title = t().topbar.profile;
    profileBtn.setAttribute("aria-label", t().topbar.profile);
  }
}

function setLanguage(lang){
  state.currentLanguage = lang;
  localStorage.setItem("plamut_language", lang);
  document.documentElement.lang = lang;
  applyTranslations();
  updatePreferenceControls();
  rerenderCurrentScreen();
  closePreferencesPanel();
}

function isOwnerControlAllowed(){
  if(!state.isPublicView) return true;
  alert(t().share.ownerOnlyAction);
  return false;
}

function isShareEnabled(profile = {}){
  if(typeof profile.public_share_enabled === "boolean"){
    return profile.public_share_enabled;
  }
  if(typeof profile.is_public === "boolean"){
    return profile.is_public;
  }
  return true;
}

function getShareCardTitle(profile = {}){
  return normalizeSpaces(profile.public_card_title || profile.display_name || profile.username || "Plamut");
}

function getShareCardBio(profile = {}){
  return normalizeSpaces(profile.public_card_bio || "");
}

function getShareLibraryMode(profile = {}){
  const mode = String(profile.public_library_mode || "preview").toLowerCase();
  return mode === "full" ? "full" : "preview";
}

function generateToken(length = 24){
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function buildPublicShareUrl(token){
  return `${window.location.origin}/nfc/${encodeURIComponent(token || "")}`;
}

function isNfcRoute(){
  return window.location.pathname.startsWith("/nfc/");
}

function isPublicShareRoute(){
  return window.location.pathname.startsWith("/share/") || window.location.pathname.startsWith("/nfc/");
}

function supportsTable(error, tableName){
  return !error || !new RegExp(`relation .*${tableName}`, "i").test(String(error.message || ""));
}

function isNetworkError(error){
  const message = String(error?.message || error || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  return message.includes("failed to fetch")
    || message.includes("networkerror")
    || message.includes("network request failed")
    || message.includes("fetch")
    || details.includes("failed to fetch");
}

async function retryReadQuery(runQuery, attempts = 2, delayMs = 220){
  let lastError = null;
  for(let attempt = 0; attempt < attempts; attempt += 1){
    const result = await runQuery();
    if(!result?.error || !isNetworkError(result.error)){
      return result;
    }
    lastError = result.error;
    if(attempt < attempts - 1){
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { data: null, error: lastError };
}

function buildQrImageUrl(url){
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url || "")}`;
}

function browserSupportsWebNfc(){
  return typeof window.NDEFWriter !== "undefined" || typeof window.NDEFReader !== "undefined";
}

function isLikelyIphone(){
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua);
}

function populateShareQr(containerId, imageId, url){
  const box = document.getElementById(containerId);
  const img = document.getElementById(imageId);
  if(!box || !img || !url) return;
  img.src = buildQrImageUrl(url);
  img.alt = t().share.qrAlt;
}

function ensurePublicProfileCollectionsReset(){
  state.demoData.Books = [];
  state.demoData.Movies = [];
  state.demoData.Series = [];
  state.demoData.Anime = [];
  state.demoData.Manga = [];
  state.demoData.Blacklist = [];
}

function getItemStorageKey(itemOrParts = {}){
  const category = itemOrParts.category || state.currentCategory || "";
  const canonicalKey = itemOrParts.canonical_key || itemOrParts.canonicalKey || "";
  const workKey = itemOrParts.work_key || itemOrParts.workKey || "";
  const title = normalizeSpaces(itemOrParts.title || "").toLowerCase();
  return [category, canonicalKey || workKey || title].join(":");
}

async function getCurrentUser(options = {}){
  const now = Date.now();
  const useCache = !options.force && now - (currentUserCache.fetchedAt || 0) < 1200;
  if(useCache) return currentUserCache.user || null;
  if(currentUserPromise) return await currentUserPromise;

  currentUserPromise = (async () => {
    const { data, error } = await retryReadQuery(() => supabaseClient.auth.getUser(), 2, 180);
    if(error || !data?.user){
      currentUserCache = { user: null, fetchedAt: Date.now() };
      return null;
    }
    currentUserCache = { user: data.user, fetchedAt: Date.now() };
    return data.user;
  })();

  try {
    return await currentUserPromise;
  } finally {
    currentUserPromise = null;
  }
}

function syncCurrentUserCache(user = null){
  currentUserCache = { user: user || null, fetchedAt: Date.now() };
}

async function getCurrentUserId(){
  const user = await getCurrentUser();
  return user?.id || "guest";
}

async function getAccountStorageValue(suffix, fallback){
  const userId = await getCurrentUserId();
  try {
    const raw = localStorage.getItem(`plamut_${suffix}_${userId}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}

async function setAccountStorageValue(suffix, value){
  const userId = await getCurrentUserId();
  localStorage.setItem(`plamut_${suffix}_${userId}`, JSON.stringify(value));
}

async function getCustomStatuses(){
  return await getAccountStorageValue("custom_statuses", []);
}

async function setCustomStatuses(statuses){
  await setAccountStorageValue("custom_statuses", statuses);
}

async function getCustomFolders(){
  return await getAccountStorageValue("custom_folders", []);
}

async function setCustomFolders(folders){
  await setAccountStorageValue("custom_folders", folders);
}

async function getFolderAssignments(){
  return await getAccountStorageValue("folder_assignments", {});
}

async function setFolderAssignments(assignments){
  await setAccountStorageValue("folder_assignments", assignments);
}

async function getAvailableStatuses(){
  const customStatuses = await getCustomStatuses();
  const dynamicStatuses = Object.values(state.demoData)
    .flat()
    .map((item) => normalizeSpaces(item?.status || ""))
    .filter(Boolean);

  return Array.from(new Set(["Planned", "In progress", "Done", "Dropped", ...customStatuses, ...dynamicStatuses]));
}

async function getAvailableFolders(){
  const customFolders = await getCustomFolders();
  const dynamicFolders = Object.values(state.demoData)
    .flat()
    .map((item) => normalizeSpaces(item?.folder || ""))
    .filter(Boolean);

  return Array.from(new Set([...customFolders, ...dynamicFolders]));
}

function getItemById(category, id){
  return (state.demoData[category] || []).find((item) => item.id === id) || null;
}

function getItemFolder(item){
  return item?.folder || "";
}

function hideAllScreens(){
  document.getElementById("home-screen").classList.add("hidden");
  document.getElementById("library-screen")?.classList.add("hidden");
  document.getElementById("category-screen").classList.add("hidden");
  document.getElementById("details-screen").classList.add("hidden");
  document.getElementById("relations-screen")?.classList.add("hidden");
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("public-share-screen")?.classList.add("hidden");
  closeFolderModal();
}

function getVisibleScreenName(){
  if(!document.getElementById("details-screen")?.classList.contains("hidden")) return "details";
  if(!document.getElementById("category-screen")?.classList.contains("hidden")) return "category";
  if(!document.getElementById("library-screen")?.classList.contains("hidden")) return "library";
  if(!document.getElementById("public-share-screen")?.classList.contains("hidden")) return "public-share";
  if(!document.getElementById("auth-screen")?.classList.contains("hidden")) return "auth";
  return "home";
}

function getCurrentRouteSnapshot(){
  return {
    screen: getVisibleScreenName(),
    category: state.currentCategory || "",
    openItemId: Number.isFinite(Number(state.currentOpenItemId)) ? Number(state.currentOpenItemId) : null,
    isPublicShareRoute: Boolean(state.activeShareToken),
    shareToken: state.activeShareToken || "",
    sharePath: isNfcRoute() ? "nfc" : "share"
  };
}

function saveRouteState(routePatch = {}){
  if(routeRestoreInProgress) return;
  const payload = {
    ...getCurrentRouteSnapshot(),
    ...routePatch,
    updatedAt: Date.now()
  };
  try {
    sessionStorage.setItem(ROUTE_STATE_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error("Route state save error:", error);
  }
}

function readRouteState(){
  try {
    const raw = sessionStorage.getItem(ROUTE_STATE_STORAGE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    console.error("Route state read error:", error);
    return null;
  }
}

function clearRouteState(){
  try {
    sessionStorage.removeItem(ROUTE_STATE_STORAGE_KEY);
  } catch (error) {
    console.error("Route state clear error:", error);
  }
}

function setPublicRouteMode(active){
  document.body.classList.toggle("public-route-active", Boolean(active));
  const appShell = document.getElementById("app-shell");
  if(appShell){
    appShell.classList.toggle("public-route-shell", Boolean(active));
  }
}

function resetShelfSearchQuery(){
  state.currentShelfSearchQuery = "";
  syncShelfSearchInput();
}

function setShelfSearchQuery(value){
  state.currentShelfSearchQuery = normalizeSpaces(value);
  renderShelf();
}

function syncShelfSearchInput(){
  const input = document.getElementById("shelf-search-input");
  if(input) input.value = state.currentShelfSearchQuery;
}

function buildCanonicalKey(category, source, rawId, title){
  if(rawId) return `${category}:${source}:${rawId}`;
  return `${category}:${String(title || "").trim().toLowerCase()}`;
}

function looksLikeRussian(text){
  if(!text) return false;
  if(/[іїєґІЇЄҐ]/.test(text)) return false;
  const letters = text.match(/[A-Za-zА-Яа-яЁё]/g) || [];
  if(letters.length < 10) return false;
  const cyrillic = text.match(/[А-Яа-яЁё]/g) || [];
  return (cyrillic.length / letters.length) >= 0.6;
}

function looksLikeEnglish(text){
  if(!text) return false;
  const letters = text.match(/[A-Za-zА-Яа-яЁё]/g) || [];
  if(letters.length < 10) return false;
  const latin = text.match(/[A-Za-z]/g) || [];
  return (latin.length / letters.length) >= 0.6;
}

function getBookUiLanguage(){
  const appLanguage = normalizeLanguageCode(state.currentLanguage || "");
  const systemLanguage = normalizeLanguageCode(getSystemBrowserLanguage() || "");
  return appLanguage || systemLanguage || "ru";
}

function getBookDisplayTitle(item){
  if(!item) return "";
  const title = String(item.title || "").trim();
  const titleRu = String(item.title_ru || "").trim();
  const titleEn = String(item.title_en || "").trim();
  const titleOriginal = String(item.title_original || "").trim();
  const interfaceLanguage = getBookUiLanguage();

  if(interfaceLanguage === "ru"){
    if(titleRu) return titleRu;
    if(looksLikeRussian(title)) return title;
    if(looksLikeRussian(titleOriginal)) return titleOriginal;
    return title;
  }

  if(titleEn) return titleEn;
  if(looksLikeEnglish(title)) return title;
  if(looksLikeEnglish(titleOriginal)) return titleOriginal;
  return title;
}

function getBookSecondaryTitle(item){
  if(!item) return "";
  const interfaceLanguage = getBookUiLanguage();
  const primaryTitle = normalizeSpaces(getBookDisplayTitle(item));
  if(!primaryTitle) return "";

  const titleOriginal = normalizeSpaces(item.title_original || "");
  const titleRu = normalizeSpaces(item.title_ru || "");
  const titleEn = normalizeSpaces(item.title_en || "");

  const candidates = interfaceLanguage === "ru"
    ? [titleOriginal, titleEn]
    : [titleOriginal, titleRu];

  for(const candidate of candidates){
    if(!candidate) continue;
    if(normalizeComparisonText(candidate) === normalizeComparisonText(primaryTitle)) continue;
    return candidate;
  }

  return "";
}

function deriveBookTitleFields(baseTitle = "", titleRu = "", titleEn = "", titleOriginal = ""){
  const resolvedTitle = normalizeSpaces(baseTitle || "");
  const resolvedRu = normalizeSpaces(titleRu || "");
  const resolvedEn = normalizeSpaces(titleEn || "");
  const resolvedOriginal = normalizeSpaces(titleOriginal || resolvedTitle || "");

  return {
    title: resolvedTitle,
    title_ru: resolvedRu || (looksLikeRussian(resolvedTitle) ? resolvedTitle : ""),
    title_en: resolvedEn || (looksLikeEnglish(resolvedTitle) ? resolvedTitle : ""),
    title_original: resolvedOriginal || resolvedTitle
  };
}

function enrichBookTitleFieldsForSave(item = {}){
  const baseTitle = normalizeSpaces(item.title || "");
  const sourceTitleRu = normalizeSpaces(item.title_ru || "");
  const sourceTitleEn = normalizeSpaces(item.title_en || "");
  const sourceTitleOriginal = normalizeSpaces(item.title_original || baseTitle || "");

  let resolvedTitleRu = sourceTitleRu;
  if(!resolvedTitleRu){
    if(looksLikeRussian(baseTitle)){
      resolvedTitleRu = baseTitle;
    } else if(looksLikeRussian(sourceTitleOriginal)){
      resolvedTitleRu = sourceTitleOriginal;
    }
  }

  const resolvedTitleEn = sourceTitleEn || (looksLikeEnglish(baseTitle) ? baseTitle : "");
  const fields = deriveBookTitleFields(baseTitle, resolvedTitleRu, resolvedTitleEn, sourceTitleOriginal || baseTitle);

  return {
    ...item,
    title: fields.title || baseTitle,
    title_ru: fields.title_ru || "",
    title_en: fields.title_en || "",
    title_original: fields.title_original || sourceTitleOriginal || baseTitle
  };
}

function sanitizeGoogleBooksQueryPart(value, maxLen = 180){
  const clean = normalizeSpaces(String(value || "").replace(/[\n\r\t]+/g, " "));
  if(!clean) return "";
  const base = clean.split(/[|;]+/)[0].replace(/\s{2,}/g, " ").trim();
  if(base.length <= maxLen) return base;
  return base.slice(0, maxLen).replace(/[\s,.;:!?-]+$/g, "").trim();
}

function isApiErrorLikeText(text){
  const sample = normalizeSpaces(String(text || ""));
  if(!sample) return true;
  const normalized = sample.toLowerCase();
  if(normalized.length < 24) return false;
  return normalized.includes("query length limit exceeded")
    || /\bhttp\s*[45]\d\d\b/i.test(sample)
    || normalized.includes("bad request")
    || normalized.includes("internal server error")
    || normalized.includes("service unavailable")
    || normalized.includes("failed to fetch")
    || normalized.includes("network request failed")
    || normalized.includes("invalid api key")
    || normalized.includes("api error")
    || normalized.startsWith("error:")
    || normalized.startsWith("{");
}

function sanitizeBookDescriptionText(text){
  const clean = normalizeSpaces(text || "");
  if(!clean) return "";
  if(isApiErrorLikeText(clean)) return "";
  return clean;
}

async function normalizeDescriptionFields(description, { translateMissing = false } = {}){
  const clean = String(description || "");
  const isRu = looksLikeRussian(clean);
  const isEn = looksLikeEnglish(clean);

  let description_ru = isRu ? clean : "";
  let description_en = isEn ? clean : "";
  let description_original = isRu ? "" : clean;

  if(translateMissing && clean){
    if(isRu && !description_en){
      description_en = await translateTextToEnglish(clean);
      description_original = description_original || description_en || "";
    } else if(isEn && !description_ru){
      description_ru = await translateTextToRussian(clean);
    }
  }

  return {
    description: clean,
    description_ru: description_ru || "",
    description_original: description_original || description_en || "",
    description_en: description_en || description_original || ""
  };
}

function pickBestDescription(item, lang){
  if(!item) return "";
  const appLang = normalizeLanguageCode(lang);
  const systemLang = getSystemBrowserLanguage();
  const sequence = Array.from(new Set([appLang, systemLang, "en"].filter(Boolean)));

  for(const candidate of sequence){
    if(candidate === "ru" && item.description_ru) return item.description_ru;
    if(candidate === "en" && item.description_en) return item.description_en;
    if(candidate === "en" && item.description_original) return item.description_original;
  }

  if(appLang === "ru" || systemLang === "ru"){
    return item.description_ru || item.description_en || item.description_original || item.description || "";
  }

  return item.description || item.description_en || item.description_original || item.description_ru || "";
}

async function fetchJson(url, options = undefined){
  const response = await fetch(url, options);
  if(!response.ok) throw new Error("HTTP " + response.status);
  return await response.json();
}

async function translateText(text, fromLang, toLang){
  if(!text) return "";
  try {
    const url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text) +
      "&langpair=" +
      encodeURIComponent(fromLang + "|" + toLang);

    const data = await fetchJson(url);
    return (data?.responseData?.translatedText || "").trim();
  } catch (error) {
    console.error("Translation error:", error);
    return "";
  }
}

async function translateTextToRussian(text){
  if(hasCyrillic(text)) return text;
  return await translateText(text, "en", "ru");
}

async function translateTextToEnglish(text){
  if(hasLatin(text)) return text;
  return await translateText(text, "ru", "en");
}

async function buildSearchQueries(query){
  const meta = typeof query === "string" ? normalizeSearchQuery(query) : (query || normalizeSearchQuery(""));
  const clean = meta.text || normalizeSpaces(query);
  const list = [];
  const seen = new Set();

  function pushQuery(value){
    const normalized = normalizeSpaces(value);
    if(!normalized) return;
    const key = normalizeComparisonText(normalized);
    if(!key || seen.has(key)) return;
    seen.add(key);
    list.push(normalized);
  }

  if(meta.isbn){
    pushQuery(meta.isbn);
    return list;
  }

  pushQuery(clean);
  pushQuery(String(clean || "").trim());
  return list;
}

function getOpenLibraryCoverUrl(coverId){
  if(!coverId) return "";
  return "https://covers.openlibrary.org/b/id/" + coverId + "-L.jpg";
}

function buildBookCanonicalKey(source = "book", rawId = "", title = ""){
  return buildCanonicalKey("Books", source || "book", rawId || normalizeTitleForMatch(title), title || "Untitled");
}

function extractBestBookDescription(book = {}, preferredLang = state.currentLanguage){
  const description = sanitizeBookDescriptionText(book.description || "");
  const lang = normalizeLanguageCode(preferredLang || "");
  if(!description) return { description_ru: "", description_en: "", description_original: "" };
  if(lang === "ru" || looksLikeRussian(description)){
    return { description_ru: description, description_en: "", description_original: "" };
  }
  if(looksLikeEnglish(description)){
    return { description_ru: "", description_en: description, description_original: description };
  }
  return { description_ru: "", description_en: "", description_original: description };
}

function getBookSourcePriority(source, queryMeta = {}){
  const normalizedSource = String(source || "").toLowerCase();
  const isIsbnSearch = Boolean(queryMeta?.isbn);
  const isCyrillicQuery = Boolean(queryMeta?.hasCyrillic && !queryMeta?.isbn);
  if(normalizedSource === "fantlab") return isCyrillicQuery ? 24 : 6;
  if(normalizedSource === "openlibrary") return isIsbnSearch ? 24 : 20;
  if(normalizedSource === "google") return isIsbnSearch ? 16 : 14;
  return 0;
}

function buildBookIdentityKey(item = {}){
  if(item.isbn) return `isbn:${item.isbn}`;
  const titleKey = normalizeTitleForMatch(item.title || item.title_original || "");
  const authorKey = normalizeAuthorName(item.creator || "");
  const workKey = normalizeComparisonText(String(item.work_key || "").replace(/^.*:/, ""));
  if(workKey) return `work:${workKey}`;
  return `meta:${titleKey}::${authorKey}`;
}

function isBookResultUsable(item = {}){
  const title = normalizeSpaces(item.title || "");
  const creator = normalizeSpaces(item.creator || "");
  const hasCover = Boolean(item.cover);
  const hasDescription = Boolean(item.description_ru || item.description_original || item.description_en || item.description);
  return Boolean(title) && (hasCover || hasDescription || creator || item.isbn);
}

function buildBookResultScore(item = {}, queryMeta = {}){
  const queryKey = normalizeComparisonText(queryMeta?.text || "");
  const titleMain = normalizeComparisonText(item.title || "");
  const titleAlt = normalizeComparisonText([item.title_ru || "", item.title_en || "", item.title_original || ""].join(" "));
  const creatorKey = normalizeComparisonText(item.creator || "");
  const titlePool = [titleMain, titleAlt].filter(Boolean).join(" ");

  let score = getBookSourcePriority(item.source, queryMeta);

  if(queryMeta?.isbn && item?.isbn && item.isbn === queryMeta.isbn) score += 120;
  if(queryKey && titleMain === queryKey) score += 110;
  else if(queryKey && titleMain.startsWith(queryKey)) score += 70;
  else if(queryKey && titlePool.includes(queryKey)) score += 36;

  if(queryMeta?.hasCyrillic && String(item.source || "").toLowerCase() === "fantlab"){
    const cyrillicTitleProbe = [item.title || "", item.title_ru || "", item.title_original || ""].join(" ");
    if(hasCyrillic(cyrillicTitleProbe)) score += 18;
  }

  if(creatorKey) score += 4;
  if(item.cover) score += 3;
  if(item.description || item.description_ru || item.description_original || item.description_en) score += 2;
  if(item.isbn) score += 8;

  const titleProbe = normalizeComparisonText([item.title || "", item.title_original || "", item.title_en || "", item.title_ru || ""].join(" "));
  const softSecondaryPenaltyPatterns = [
    /collection/iu,
    /guide/iu,
    /encyclopedia/iu,
    /screenplay/iu,
    /unofficial/iu,
    /справочник/iu,
    /энциклопед/iu,
    /неофициальн/iu
  ];
  if(softSecondaryPenaltyPatterns.some((re) => re.test(titleProbe))){
    score -= 10;
  }

  if(!isBookResultUsable(item)) score -= 40;
  return score;
}

function shouldMergeBookCandidates(left = {}, right = {}){
  return areLikelySameBook(left, right);
}

function mergeBookResultPair(left = {}, right = {}, queryMeta = {}){
  const candidates = [left, right].filter(Boolean);
  const primary = candidates
    .slice()
    .sort((a, b) => buildBookResultScore(b, queryMeta) - buildBookResultScore(a, queryMeta))[0] || {};
  const secondary = primary === left ? right : left;

  const merged = {
    ...secondary,
    ...primary,
    title: primary.title || secondary?.title || "",
    creator: primary.creator || secondary?.creator || "",
    cover: primary.cover || secondary?.cover || "",
    isbn: primary.isbn || secondary?.isbn || "",
    description_ru: primary.description_ru || secondary?.description_ru || "",
    description_original: primary.description_original || secondary?.description_original || primary.description_en || secondary?.description_en || "",
    description_en: primary.description_en || secondary?.description_en || primary.description_original || secondary?.description_original || "",
    source_priority: Math.max(primary.source_priority || 0, secondary?.source_priority || 0)
  };

  merged.description = merged.description_ru || merged.description_original || merged.description_en || primary.description || secondary?.description || "";
  merged.canonical_key = merged.canonical_key || buildBookCanonicalKey(
    merged.source || "merged",
    merged.isbn || merged.work_key || buildBookIdentityKey(merged),
    merged.title
  );
  return merged;
}

function mergeBookResults(results = [], queryMeta = {}){
  const grouped = [];
  results.filter(Boolean).forEach((item) => {
    const index = grouped.findIndex((existing) =>
      shouldMergeBookCandidates(existing, item) || buildBookIdentityKey(existing) === buildBookIdentityKey(item)
    );
    if(index === -1){
      grouped.push(item);
      return;
    }
    grouped[index] = mergeBookResultPair(grouped[index], item, queryMeta);
  });
  return grouped;
}

function rankBookResults(results = [], queryMeta = {}){
  return results
    .filter((item) => isBookResultUsable(item))
    .sort((a, b) => buildBookResultScore(b, queryMeta) - buildBookResultScore(a, queryMeta));
}

function createBookResult({
  title = "",
  title_ru = "",
  title_en = "",
  title_original = "",
  creator = "",
  cover = "",
  isbn = "",
  description = "",
  description_ru = "",
  description_original = "",
  description_en = "",
  work_key = "",
  canonical_key = "",
  source = "",
  queryMeta = {}
} = {}){
  const safeTitle = normalizeSpaces(title);
  const safeCreator = normalizeSpaces(creator);
  const safeIsbn = detectISBN(isbn);
  const safeTitleRu = normalizeSpaces(title_ru);
  const safeTitleEn = normalizeSpaces(title_en);
  const safeTitleOriginal = normalizeSpaces(title_original);
  const original = normalizeSpaces(description_original || description_en || (description_ru ? "" : description));
  const russian = normalizeSpaces(description_ru || (looksLikeRussian(description) ? description : ""));
  const displayDescription = russian || original || normalizeSpaces(description);

  return {
    title: safeTitle,
    title_ru: safeTitleRu || "",
    title_en: safeTitleEn || "",
    title_original: safeTitleOriginal || "",
    category: "Books",
    creator: safeCreator,
    cover: cover || "",
    isbn: safeIsbn,
    description: displayDescription || "",
    description_ru: russian || "",
    description_original: original || "",
    description_en: description_en || original || "",
    work_key: work_key || "",
    source: source || "",
    source_priority: getBookSourcePriority(source, queryMeta),
    canonical_key: canonical_key || buildBookCanonicalKey(
      source || "book",
      safeIsbn || work_key || buildBookIdentityKey({ title: safeTitle, creator: safeCreator }),
      safeTitle
    )
  };
}

function mapGoogleBooksVolumeToBookResult(book, queryMeta = {}){
  const info = book?.volumeInfo || {};
  const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
  const isbn = detectISBN(
    identifiers.find((item) => /ISBN/i.test(item?.type || ""))?.identifier
    || identifiers[0]?.identifier
    || ""
  );
  const description = info.description || "";
  const language = String(info.language || "").toLowerCase();
  const titleFields = deriveBookTitleFields(info.title || "", "", info.title || "", info.title || "");

  return createBookResult({
    title: titleFields.title,
    title_ru: titleFields.title_ru,
    title_en: titleFields.title_en,
    title_original: titleFields.title_original,
    creator: Array.isArray(info.authors) ? info.authors.join(", ") : "",
    cover: info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "",
    isbn,
    description,
    description_ru: language.startsWith("ru") || looksLikeRussian(description) ? description : "",
    description_original: language.startsWith("ru") ? "" : description,
    description_en: language.startsWith("en") || looksLikeEnglish(description) ? description : "",
    work_key: book.id ? `google:${book.id}` : "",
    source: "google",
    queryMeta
  });
}

function normalizeOpenLibraryBook(book, queryMeta = {}){
  const isbn = detectISBN((Array.isArray(book.isbn) ? book.isbn[0] : book.isbn) || "");
  const titleFields = deriveBookTitleFields(book.title || "", "", "", book.title || "");
  const languages = normalizeBookLanguageData(book);
  const preferredLang = languages.includes("ru") ? "ru" : state.currentLanguage;
  const descriptions = extractBestBookDescription(book, preferredLang);
  const workKey = String(book.key || "").startsWith("/works/")
    ? String(book.key)
    : book?.edition_key?.[0]
      ? `/books/${book.edition_key[0]}`
      : "";

  return createBookResult({
    title: titleFields.title,
    title_ru: titleFields.title_ru,
    title_en: titleFields.title_en,
    title_original: titleFields.title_original,
    creator: normalizeBookAuthorData(book),
    cover: book.cover_i ? getOpenLibraryCoverUrl(book.cover_i) : "",
    isbn,
    description_ru: descriptions.description_ru,
    description_original: descriptions.description_original,
    description_en: descriptions.description_en,
    work_key: workKey,
    canonical_key: buildBookCanonicalKey(
      "openlibrary",
      workKey || isbn || `${normalizeTitleForMatch(titleFields.title)}:${normalizeAuthorName(normalizeBookAuthorData(book))}`,
      titleFields.title
    ),
    source: "openlibrary",
    queryMeta
  });
}

function dedupeSearchResults(items){
  const seen = new Set();
  return items.filter((item) => {
    const key = item.category === "Books"
      ? buildBookIdentityKey(item)
      : (
        item.canonical_key
        || item.work_key
        || [
          item.category,
          normalizeComparisonText(item.title || ""),
          normalizeComparisonText(item.title_original || item.original_title || ""),
          normalizeComparisonText(item.title_en || ""),
          normalizeComparisonText(item.title_ru || ""),
          normalizeComparisonText(item.creator || "")
        ].join(":")
      );

    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapUserMediaRowToSearchResult(row, category){
  const titleFields = deriveBookTitleFields(
    row.title || "",
    row.title_ru || "",
    row.title_en || "",
    row.title_original || row.original_title || row.title || ""
  );

  return {
    id: row.id,
    title: titleFields.title,
    category,
    creator: row.creator || "",
    cover: row.cover_url || "",
    description: row.description || "",
    description_ru: row.description_ru || "",
    description_original: row.description_original || row.description_en || "",
    description_en: row.description_en || "",
    work_key: row.work_key || "",
    canonical_key: row.canonical_key || "",
    title_ru: titleFields.title_ru,
    title_en: titleFields.title_en,
    title_original: titleFields.title_original
  };
}

async function searchLocalSupabaseCached(category, queryMeta, limit = 10){
  const localItems = (state.demoData[category] || []).filter((item) => itemMatchesQuery(item, queryMeta));
  const user = await getCurrentUser();
  if(!user) return dedupeSearchResults(localItems).slice(0, limit);

  const { data, error } = await supabaseClient
    .from("user_media")
    .select("id, title, title_ru, title_en, title_original, status, cover_url, description, description_ru, description_en, description_original, creator, work_key, canonical_key, category, folder_name")
    .eq("user_id", user.id)
    .eq("category", category)
    .order("id", { ascending: false })
    .limit(250);

  if(error){
    console.error("Supabase local search error:", error);
    return dedupeSearchResults(localItems).slice(0, limit);
  }

  const fromDb = (data || [])
    .map((row) => mapUserMediaRowToSearchResult(row, category))
    .filter((item) => itemMatchesQuery(item, queryMeta));

  return dedupeSearchResults([...localItems, ...fromDb]).slice(0, limit);
}

async function fetchOpenLibraryDescription(workKey, preferredLang = state.currentLanguage){
  if(!workKey) return { text: "", language: "" };
  const normalizedWorkKey = String(workKey || "").trim();
  if(!normalizedWorkKey.startsWith("/works/") && !/^OL\d+W$/i.test(normalizedWorkKey)){
    return { text: "", language: "" };
  }

  try {
    const cleanKey = normalizedWorkKey.startsWith("/works/") ? normalizedWorkKey : `/works/${normalizedWorkKey}`;
    const workUrl = "https://openlibrary.org" + cleanKey + ".json";
    const workData = await fetchJson(workUrl);

    function extractDescription(obj){
      if(!obj) return "";
      if(typeof obj.description === "string") return obj.description.trim();
      if(obj.description && typeof obj.description.value === "string") return obj.description.value.trim();
      return "";
    }

    function detectLang(text){
      if(looksLikeRussian(text)) return "ru";
      if(looksLikeEnglish(text)) return "en";
      return "";
    }

    const workDescription = extractDescription(workData);
    const workLang = detectLang(workDescription);
    const targetLangKey = preferredLang === "ru" ? "/languages/rus" : "/languages/eng";
    const editionsUrl = "https://openlibrary.org" + cleanKey + "/editions.json?limit=30";

    try {
      const editionsData = await fetchJson(editionsUrl);
      const entries = Array.isArray(editionsData.entries)
        ? editionsData.entries
        : Array.isArray(editionsData.docs)
          ? editionsData.docs
          : [];

      for(const edition of entries){
        const languages = Array.isArray(edition.languages) ? edition.languages : [];
        const hasTargetLanguage = languages.some((lang) => {
          if(!lang) return false;
          if(typeof lang === "string") return lang === targetLangKey;
          return lang.key === targetLangKey;
        });

        if(!hasTargetLanguage) continue;

        const editionDescription = extractDescription(edition);
        if(editionDescription){
          const lang = detectLang(editionDescription);
          return { text: editionDescription, language: lang };
        }

        const editionKey = edition.key || "";
        if(!editionKey) continue;

        try {
          const editionData = await fetchJson("https://openlibrary.org" + editionKey + ".json");
          const fullEditionDescription = extractDescription(editionData);
          if(fullEditionDescription){
            const lang = detectLang(fullEditionDescription);
            return { text: fullEditionDescription, language: lang };
          }
        } catch (e) {
          console.error("Edition description error:", e);
        }
      }
    } catch (e) {
      console.error("Open Library editions error:", e);
    }

    return { text: workDescription, language: workLang };
  } catch (error) {
    console.error("Open Library description error:", error);
    return { text: "", language: "" };
  }
}

async function fetchGoogleBooksDescription(title, author = "", preferredLang = state.currentLanguage){
  try {
    const targetLang = preferredLang === "ru" ? "ru" : "en";
    const safeTitle = sanitizeGoogleBooksQueryPart(title, 220);
    const safeAuthor = sanitizeGoogleBooksQueryPart(author, 120);
    const isbn = detectISBN(safeTitle);

    let query = "";
    if(isbn){
      query = `isbn:${isbn}`;
    } else {
      const queryParts = [];
      if(safeTitle) queryParts.push(`intitle:${safeTitle}`);
      if(safeAuthor) queryParts.push(`inauthor:${safeAuthor}`);
      query = queryParts.join(" ").trim();
    }

    if(!query) return { text: "", language: "", matchedLanguage: false };

    const QUERY_LIMIT = 460;
    if(query.length > QUERY_LIMIT){
      if(query.startsWith("intitle:")){
        query = `intitle:${sanitizeGoogleBooksQueryPart(safeTitle, 120)}`;
      }
      if(query.length > QUERY_LIMIT){
        return { text: "", language: "", matchedLanguage: false };
      }
    }

    function detectLang(text){
      if(looksLikeRussian(text)) return "ru";
      if(looksLikeEnglish(text)) return "en";
      return "";
    }

    async function tryRequest(url){
      let data;
      try {
        data = await fetchJson(url);
      } catch (requestError) {
        const message = String(requestError?.message || requestError || "");
        if(/query\s+length\s+limit\s+exceeded/i.test(message)){
          return { text: "", language: "", matchedLanguage: false };
        }
        throw requestError;
      }

      const items = Array.isArray(data?.items) ? data.items : [];

      for(const book of items){
        const info = book.volumeInfo || {};
        const description = sanitizeBookDescriptionText(info.description || "");
        if(!description) continue;
        const lang = detectLang(description);
        if(lang === targetLang){
          return { text: description, language: lang, matchedLanguage: true };
        }
      }

      for(const book of items){
        const info = book.volumeInfo || {};
        const description = sanitizeBookDescriptionText(info.description || "");
        if(description){
          const lang = detectLang(description);
          return { text: description, language: lang, matchedLanguage: false };
        }
      }

      return { text: "", language: "", matchedLanguage: false };
    }

    const strictUrl =
      "https://www.googleapis.com/books/v1/volumes?q=" +
      encodeURIComponent(query) +
      "&langRestrict=" + encodeURIComponent(targetLang) +
      "&maxResults=10" +
      "&key=" + encodeURIComponent(GOOGLE_BOOKS_API_KEY);

    let result = await tryRequest(strictUrl);
    if(result.text) return result;

    const fallbackUrl =
      "https://www.googleapis.com/books/v1/volumes?q=" +
      encodeURIComponent(query) +
      "&maxResults=10" +
      "&key=" + encodeURIComponent(GOOGLE_BOOKS_API_KEY);

    result = await tryRequest(fallbackUrl);
    return result;
  } catch (error) {
    console.error("Google Books description error:", error);
    return { text: "", language: "", matchedLanguage: false };
  }
}

async function searchFantLabProxy(queryMeta, limit = 10, queriesOverride = null){
  if(!queryMeta?.text || queryMeta?.isbn) return [];

  const queries = Array.isArray(queriesOverride) && queriesOverride.length
    ? queriesOverride
    : await buildSearchQueries(queryMeta);

  for(const query of queries){
    if(!query) continue;
    try {
      const url = "/api/books/fantlab?q=" + encodeURIComponent(query);
      const data = await fetchJson(url);
      const items = Array.isArray(data) ? data : [];
      const results = items
        .map((item) => createBookResult({
          title: item?.title || "",
          title_ru: item?.title_ru || "",
          title_en: item?.title_en || "",
          title_original: item?.title_original || item?.title || "",
          creator: item?.creator || "",
          cover: item?.cover || "",
          description: item?.description || "",
          description_ru: item?.description_ru || "",
          description_original: item?.description_original || item?.description_en || "",
          description_en: item?.description_en || "",
          work_key: item?.work_key || "",
          canonical_key: item?.canonical_key || "",
          source: "fantlab",
          queryMeta
        }))
        .filter((item) => item && item.title);

      if(results.length){
        return results.slice(0, limit);
      }
    } catch (error) {
      console.error("FantLab proxy search error:", error);
    }
  }

  return [];
}

async function searchGoogleBooks(queryMeta, limit = 10, queriesOverride = null){
  try {
    const queries = queryMeta.isbn
      ? [`isbn:${queryMeta.isbn}`]
      : (Array.isArray(queriesOverride) && queriesOverride.length ? queriesOverride : await buildSearchQueries(queryMeta));

    const results = [];
    for(const query of queries){
      const url =
        "https://www.googleapis.com/books/v1/volumes?q=" +
        encodeURIComponent(query) +
        "&maxResults=" + encodeURIComponent(limit) +
        "&printType=books" +
        "&key=" + encodeURIComponent(GOOGLE_BOOKS_API_KEY);

      const data = await fetchJson(url);
      const items = Array.isArray(data.items) ? data.items : [];
      results.push(...items.map((item) => mapGoogleBooksVolumeToBookResult(item, queryMeta)));
    }

    return results.slice(0, limit * Math.max(1, queries.length));
  } catch (error) {
    console.error("Google Books search error:", error);
    return [];
  }
}

async function searchOpenLibraryBooks(queryMeta, limit = 10, queriesOverride = null){
  try {
    const queries = queryMeta.isbn
      ? [queryMeta.isbn]
      : (Array.isArray(queriesOverride) && queriesOverride.length ? queriesOverride : await buildSearchQueries(queryMeta));

    const results = [];
    for(const query of queries){
      const url = queryMeta.isbn
        ? "https://openlibrary.org/search.json?isbn=" + encodeURIComponent(query) + "&limit=" + limit
        : "https://openlibrary.org/search.json?q=" + encodeURIComponent(query) + "&limit=" + limit;

      const data = await fetchJson(url);
      const docs = Array.isArray(data.docs) ? data.docs : [];
      results.push(...docs.map((item) => normalizeOpenLibraryBook(item, queryMeta)));
    }

    return dedupeSearchResults(results).slice(0, limit * Math.max(1, queries.length));
  } catch (error) {
    console.error("Open Library search error:", error);
    return [];
  }
}

function getBookSearchCacheKey(queryMeta = {}){
  return [
    state.currentLanguage || "",
    queryMeta.text || "",
    queryMeta.comparison || "",
    queryMeta.isbn || "",
    queryMeta.hasCyrillic ? "cy" : "",
    queryMeta.hasLatin ? "la" : ""
  ].join("|");
}

async function buildBookDescriptions(title, author, workKey, isbn = ""){
  const cacheKey = [normalizeComparisonText(title), normalizeComparisonText(author), String(workKey || "").trim(), detectISBN(isbn)].join("|");
  if(state.bookDescriptionCache.has(cacheKey)){
    return { ...state.bookDescriptionCache.get(cacheKey) };
  }

  let description = "";
  let description_ru = "";
  let description_original = "";
  let description_en = "";
  const normalizedIsbn = detectISBN(isbn);

  const olCurrent = await fetchOpenLibraryDescription(workKey, state.currentLanguage);
  if(olCurrent.text){
    const cleanCurrent = sanitizeBookDescriptionText(olCurrent.text);
    if(cleanCurrent){
      description = cleanCurrent;
      if(olCurrent.language === "ru") description_ru = cleanCurrent;
      if(olCurrent.language === "en"){
        description_original = cleanCurrent;
        description_en = cleanCurrent;
      }
    }
  }

  if(!description_ru){
    const olRu = await fetchOpenLibraryDescription(workKey, "ru");
    const cleanOlRu = sanitizeBookDescriptionText(olRu.text);
    if(cleanOlRu && looksLikeRussian(cleanOlRu)){
      description_ru = cleanOlRu;
      if(!description) description = cleanOlRu;
    }
  }

  if(!description_en){
    const olEn = await fetchOpenLibraryDescription(workKey, "en");
    const cleanOlEn = sanitizeBookDescriptionText(olEn.text);
    if(cleanOlEn && looksLikeEnglish(cleanOlEn)){
      description_original = description_original || cleanOlEn;
      description_en = cleanOlEn;
      if(!description) description = cleanOlEn;
    }
  }

  if(!description_ru){
    const googleRu = await fetchGoogleBooksDescription(normalizedIsbn || title, author, "ru");
    const cleanGoogleRu = sanitizeBookDescriptionText(googleRu.text);
    if(cleanGoogleRu && looksLikeRussian(cleanGoogleRu)){
      description_ru = cleanGoogleRu;
      if(!description) description = cleanGoogleRu;
    }
  }

  if(!description_en){
    const googleEn = await fetchGoogleBooksDescription(normalizedIsbn || title, author, "en");
    const cleanGoogleEn = sanitizeBookDescriptionText(googleEn.text);
    if(cleanGoogleEn && looksLikeEnglish(cleanGoogleEn)){
      description_original = description_original || cleanGoogleEn;
      description_en = cleanGoogleEn;
      if(!description) description = cleanGoogleEn;
    }
  }

  if(!description_ru && (description_original || description_en)){
    const translatedRu = await translateTextToRussian(description_original || description_en);
    const cleanTranslatedRu = sanitizeBookDescriptionText(translatedRu);
    if(cleanTranslatedRu){
      description_ru = cleanTranslatedRu;
      if(!description) description = cleanTranslatedRu;
    }
  }

  if(!description){
    description = description_ru || description_original || description_en || "";
  }

  const payload = {
    description: sanitizeBookDescriptionText(description) || "",
    description_ru: sanitizeBookDescriptionText(description_ru) || "",
    description_original: sanitizeBookDescriptionText(description_original || description_en) || "",
    description_en: sanitizeBookDescriptionText(description_en || description_original) || ""
  };

  state.bookDescriptionCache.set(cacheKey, payload);
  return { ...payload };
}

async function searchBooksApi(query, limit = 10){
  const queryMeta = normalizeSearchQuery(query);
  if(!queryMeta.text && !queryMeta.isbn) return [];

  const cacheKey = getBookSearchCacheKey(queryMeta);
  const cached = bookSearchResponseCache.get(cacheKey);
  if(cached && (Date.now() - cached.at) < BOOK_SEARCH_CACHE_TTL_MS){
    return cached.results.slice(0, limit);
  }

  try {
    const queries = queryMeta.isbn ? [queryMeta.isbn] : await buildSearchQueries(queryMeta);
    const fallbackQueries = queries.length > 1 ? queries : queries.slice(0, 1);
    let collected = [];
    const stageLimit = Math.max(limit, 8);

    async function runStage(searchFn, stageQueries){
      const results = await searchFn(queryMeta, stageLimit, stageQueries);
      if(results?.length){
        collected = mergeBookResults([...collected, ...results], queryMeta);
      }
      return rankBookResults(collected, queryMeta);
    }

    if(queryMeta.isbn){
      await runStage(searchOpenLibraryBooks, [queryMeta.isbn]);
      if(collected.length < Math.min(4, limit)){
        await runStage(searchGoogleBooks, [`isbn:${queryMeta.isbn}`]);
      }
    } else if(queryMeta.hasCyrillic){
      await runStage(searchFantLabProxy, fallbackQueries);
      if(collected.length < Math.min(5, limit)){
        await runStage(searchOpenLibraryBooks, fallbackQueries);
      }
      if(collected.length < Math.min(6, limit)){
        await runStage(searchGoogleBooks, fallbackQueries);
      }
    } else {
      await runStage(searchOpenLibraryBooks, fallbackQueries);
      if(collected.length < Math.min(5, limit)){
        await runStage(searchGoogleBooks, fallbackQueries);
      }
    }

    const ranked = rankBookResults(mergeBookResults(collected, queryMeta), queryMeta).slice(0, stageLimit);
    const finalResults = ranked.slice(0, limit);
    bookSearchResponseCache.set(cacheKey, { at: Date.now(), results: finalResults.slice() });
    return finalResults;
  } catch (e) {
    console.error("Books search error:", e);
    return [];
  }
}

async function searchTMDbApi(query, mediaType = "movie", limit = 10){
  try {
    const languagesToTry = state.currentLanguage === "ru" ? ["ru-RU", "en-US"] : ["en-US", "ru-RU"];
    let results = [];

    for(const language of languagesToTry){
      const url = "https://api.themoviedb.org/3/search/" + mediaType +
        "?api_key=" + encodeURIComponent(TMDB_API_KEY) +
        "&query=" + encodeURIComponent(query) +
        "&language=" + encodeURIComponent(language) +
        "&page=1";

      const data = await fetchJson(url);
      const items = Array.isArray(data.results) ? data.results : [];
      results = results.concat(items);
      if(results.length >= limit) break;
    }

    const deduped = [];
    const seen = new Set();

    for(const item of results){
      const key = String(item.id || "");
      if(!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if(deduped.length >= limit) break;
    }

    return deduped.map((item) => {
      const title = mediaType === "tv"
        ? (item.name || item.original_name || "Untitled")
        : (item.title || item.original_title || "Untitled");

      const overview = item.overview || "";
      const category = mediaType === "tv" ? "Series" : "Movies";
      const externalId = String(item.id || "");

      return {
        title,
        category,
        creator: "",
        cover: item.poster_path ? ("https://image.tmdb.org/t/p/w500" + item.poster_path) : "",
        description: overview,
        description_ru: looksLikeRussian(overview) ? overview : "",
        description_en: looksLikeEnglish(overview) ? overview : "",
        title_original: mediaType === "tv" ? (item.original_name || "") : (item.original_title || ""),
        title_en: mediaType === "tv" ? (item.name || "") : (item.title || ""),
        title_ru: "",
        work_key: `tmdb:${mediaType}:${externalId}`,
        canonical_key: buildCanonicalKey(category, "tmdb", `${mediaType}:${externalId}`, title)
      };
    });
  } catch (e) {
    console.error("TMDb search error:", e);
    return [];
  }
}

async function searchJikanApi(query, kind = "anime", limit = 10){
  try {
    const url = "https://api.jikan.moe/v4/" + kind + "?q=" + encodeURIComponent(query) + "&limit=" + limit;
    const data = await fetchJson(url);
    const results = Array.isArray(data.data) ? data.data : [];

    return results.map((item) => {
      const title = item.title || item.title_english || "Untitled";
      const creator =
        kind === "anime"
          ? ((item.studios || []).map((x) => x.name).join(", "))
          : ((item.authors || []).map((x) => x.name).join(", "));
      const synopsis = item.synopsis || "";
      const category = kind === "anime" ? "Anime" : "Manga";
      const externalId = String(item.mal_id || "");
      return {
        title,
        category,
        creator,
        cover: item.images?.jpg?.image_url || "",
        description: synopsis,
        description_ru: looksLikeRussian(synopsis) ? synopsis : "",
        description_en: looksLikeEnglish(synopsis) ? synopsis : "",
        title_original: item.title_japanese || "",
        title_en: item.title_english || "",
        title_ru: "",
        work_key: `jikan:${kind}:${externalId}`,
        canonical_key: buildCanonicalKey(category, "jikan", `${kind}:${externalId}`, title)
      };
    });
  } catch (e) {
    console.error("Jikan search error:", e);
    return [];
  }
}

async function searchAniListApi(query, kind = "ANIME", limit = 10){
  try {
    const body = {
      query: `
        query ($search: String, $type: MediaType) {
          Page(page: 1, perPage: ${limit}) {
            media(search: $search, type: $type) {
              id
              title {
                romaji
                english
                native
              }
              description(asHtml: false)
              coverImage {
                large
              }
              studios(isMain: true) {
                nodes {
                  name
                }
              }
            }
          }
        }
      `,
      variables: {
        search: query,
        type: kind
      }
    };

    const data = await fetchJson("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body)
    });

    const results = data?.data?.Page?.media || [];
    return results.map((item) => {
      const title = item.title?.english || item.title?.romaji || item.title?.native || "Untitled";
      const creator = (item.studios?.nodes || []).map((x) => x.name).join(", ");
      const description = String(item.description || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
      const category = kind === "ANIME" ? "Anime" : "Manga";
      return {
        title,
        category,
        creator,
        cover: item.coverImage?.large || "",
        description,
        description_ru: looksLikeRussian(description) ? description : "",
        description_en: looksLikeEnglish(description) ? description : "",
        title_original: item.title?.native || "",
        title_en: item.title?.english || "",
        title_ru: "",
        work_key: `anilist:${kind.toLowerCase()}:${item.id}`,
        canonical_key: buildCanonicalKey(category, "anilist", `${kind.toLowerCase()}:${item.id}`, title)
      };
    });
  } catch (e) {
    console.error("AniList search error:", e);
    return [];
  }
}

async function searchAnimeMangaApi(query, kind, limit = 10){
  return await searchMediaWithFallback(query, kind, limit, {
    searchJikanApi,
    searchAniListApi
  });
}

async function searchByCategory(category, query, limit = 10){
  const queryMeta = normalizeSearchQuery(query);
  if(!queryMeta.text && !queryMeta.isbn) return [];

  const cacheKey = [category, state.currentLanguage, queryMeta.comparison || queryMeta.isbn || ""].join("|");
  if(state.categorySearchCache.has(cacheKey)){
    return state.categorySearchCache.get(cacheKey).slice(0, limit);
  }
  if(state.categorySearchInFlight.has(cacheKey)){
    return (await state.categorySearchInFlight.get(cacheKey)).slice(0, limit);
  }

  const searchPromise = (async () => {
    const localResults = await searchLocalSupabaseCached(category, queryMeta, limit);

    if(category === "Books"){
      const externalResults = await searchBooksApi(query, limit);
      const combinedBooks = dedupeSearchResults([...externalResults, ...localResults]);
      const existingBooks = state.demoData.Books || [];

      const normalizedBooks = combinedBooks.map((book) => {
        const normalizedTitle = normalizeComparisonText(book.title || "");
        const normalizedCreator = normalizeComparisonText(book.creator || "");
        const alreadyAdded = existingBooks.some((existing) => {
          if(book.canonical_key && existing.canonical_key && book.canonical_key === existing.canonical_key) return true;
          if(book.work_key && existing.work_key && book.work_key === existing.work_key) return true;
          return normalizedTitle
            && normalizedTitle === normalizeComparisonText(existing.title || "")
            && normalizedCreator === normalizeComparisonText(existing.creator || "");
        });
        return { ...book, already_added: alreadyAdded };
      });

      return normalizedBooks.slice(0, limit);
    }

    if(localResults.length > 0){
      return dedupeSearchResults(localResults).slice(0, limit);
    }

    const searchQueries = await buildSearchQueries(queryMeta);
    let combined = [];

    for(const q of searchQueries){
      let results = [];
      if(category === "Movies") results = await searchTMDbApi(q, "movie", limit);
      if(category === "Series") results = await searchTMDbApi(q, "tv", limit);
      if(category === "Anime") results = await searchAnimeMangaApi(q, "anime", limit);
      if(category === "Manga") results = await searchAnimeMangaApi(q, "manga", limit);

      combined = dedupeSearchResults([...combined, ...results]);
      if(combined.length >= limit) break;
    }

    return dedupeSearchResults(combined).slice(0, limit);
  })();

  state.categorySearchInFlight.set(cacheKey, searchPromise);
  const resolved = await searchPromise;
  state.categorySearchInFlight.delete(cacheKey);
  state.categorySearchCache.set(cacheKey, resolved.slice(0, limit));
  return resolved.slice(0, limit);
}

function isDuplicateItem(category, title, workKey = ""){
  const items = state.demoData[category] || [];
  return items.some((item) => {
    if(workKey && item.work_key && item.work_key === workKey) return true;
    return (item.title || "").trim().toLowerCase() === title.trim().toLowerCase();
  });
}

async function existsInSupabase(category, title, workKey = "", canonicalKey = ""){
  const user = await getCurrentUser();
  if(!user) return false;

  let query = supabaseClient
    .from("user_media")
    .select("id, title, work_key, canonical_key")
    .eq("user_id", user.id)
    .eq("category", category)
    .limit(20);

  if(workKey){
    query = query.eq("work_key", workKey);
  } else if(canonicalKey){
    query = query.eq("canonical_key", canonicalKey);
  } else {
    query = query.ilike("title", title);
  }

  const { data, error } = await query;
  if(error){
    console.error("Supabase duplicate check error:", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function saveItemToSupabase(
  title,
  category,
  status,
  cover = "",
  description = "",
  creator = "",
  workKey = "",
  canonicalKey = "",
  description_ru = "",
  description_en = "",
  title_ru = "",
  title_en = "",
  title_original = "",
  description_original = "",
  folder_name = ""
){
  const user = await getCurrentUser();

  if(!user){
    alert(t().labels.mustBeLoggedIn);
    return false;
  }

  const titleFields = deriveBookTitleFields(title, title_ru, title_en, title_original || title);
  const finalCanonicalKey = canonicalKey || workKey || (titleFields.title || "").trim().toLowerCase();
  const autoLang = await normalizeDescriptionFields(description);
  const originalDescription = description_original || description_en || autoLang.description_original || "";

  const insertData = {
    user_id: user.id,
    title: titleFields.title,
    title_ru: titleFields.title_ru,
    title_en: titleFields.title_en,
    title_original: titleFields.title_original,
    category,
    status: status || "Planned",
    cover_url: cover,
    description: description || "",
    description_ru: description_ru || autoLang.description_ru || "",
    description_en: description_en || originalDescription || autoLang.description_en || "",
    description_original: originalDescription || "",
    creator: creator || "",
    work_key: workKey || "",
    canonical_key: finalCanonicalKey,
    folder_name: folder_name || ""
  };

  const { error } = await supabaseClient.from("user_media").insert([insertData]);

  if(error){
    console.error("Supabase insert error:", error);
    alert(t().labels.dbSaveError + ": " + error.message);
    return false;
  }

  return true;
}

function buildLocalShelfItem({
  title,
  title_ru = "",
  title_en = "",
  title_original = "",
  category,
  status = "Planned",
  cover = "",
  description = "",
  creator = "",
  work_key = "",
  canonical_key = "",
  folder = "",
  isbn = "",
  description_ru = "",
  description_en = "",
  description_original = ""
}){
  const titleFields = deriveBookTitleFields(title || "", title_ru || "", title_en || "", title_original || title || "");
  return {
    id: -Date.now() - Math.floor(Math.random() * 1000),
    title: titleFields.title,
    title_ru: titleFields.title_ru,
    title_en: titleFields.title_en,
    title_original: titleFields.title_original,
    category: category || "",
    status: status || "Planned",
    cover: cover || "",
    description: description || "",
    description_ru: description_ru || "",
    description_original: description_original || description_en || "",
    description_en: description_en || "",
    creator: creator || "",
    isbn: isbn || "",
    work_key: work_key || "",
    canonical_key: canonical_key || work_key || (titleFields.title || "").trim().toLowerCase(),
    folder: folder || ""
  };
}

function clearSearchCaches(){
  state.categorySearchCache.clear();
  state.categorySearchInFlight.clear();
}

function insertLocalShelfItem(category, item){
  if(!category || !item) return;

  if(!state.demoData[category]){
    state.demoData[category] = [];
  }

  const dedupeKey = item.canonical_key || item.work_key || normalizeSpaces(item.title || "").toLowerCase();
  const alreadyExists = state.demoData[category].some((row) => {
    const rowKey = row.canonical_key || row.work_key || normalizeSpaces(row.title || "").toLowerCase();
    return rowKey === dedupeKey;
  });

  if(!alreadyExists){
    state.demoData[category].unshift(item);
    clearRelationCache();
    clearSearchCaches();
  }
}
