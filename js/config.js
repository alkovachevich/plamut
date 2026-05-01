export const APP_NAME = "Plamut";

export const SUPABASE_URL = "https://rqtqimjenotjspqumeni.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_LOzTBbVK8tg6kDOrO8AcrQ_j52hzXTf";
export const TMDB_API_KEY = "fc8eab333882a74fe8c8a633e4676d98";

export const API_ENDPOINTS = {
  ANILIST: "https://graphql.anilist.co",
  JIKAN: "https://api.jikan.moe/v4"
};

export const ROUTES = {
  HOME: "/",
  CATEGORIES: "/categories",
  CATEGORY_LIBRARY: "/category",
  SEARCH: "/search",
  CARD: "/card",
  UNIVERSES: "/universes",
  UNIVERSE_DETAILS: "/universe",
  SETTINGS: "/settings",
  GUEST: "/welcome"
};

export const DEFAULT_THEME = "dark";
export const DEFAULT_LANGUAGE = "ru";

export const THEMES = ["light", "dark", "system"];
export const LANGUAGES = ["ru", "en"];

export function normalizeTheme(value = "") {
  return THEMES.includes(value) ? value : DEFAULT_THEME;
}

export function normalizeLanguage(value = "") {
  return LANGUAGES.includes(value) ? value : DEFAULT_LANGUAGE;
}

export function resolveSystemTheme() {
  try {
    return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
  } catch {
    return DEFAULT_THEME;
  }
}

export function resolveAppliedTheme(value = DEFAULT_THEME) {
  const normalized = normalizeTheme(value);
  return normalized === "system" ? resolveSystemTheme() : normalized;
}

export const SEARCH_LIMITS = {
  MODAL_RESULTS: 15,
  PAGE_RESULTS: 50,
  CATEGORY_RESULTS: 30,
  MIN_QUERY_LENGTH: 2,
  DEBOUNCE_MS: 320
};

export const CATEGORY_LABELS = {
  books: "Books",
  movies: "Movies",
  series: "Series",
  anime: "Anime",
  manga: "Manga"
};

export const CATEGORY_LABELS_I18N = {
  ru: {
    books: "Книги",
    movies: "Фильмы",
    series: "Сериалы",
    anime: "Аниме",
    manga: "Манга"
  },
  en: {
    books: "Books",
    movies: "Movies",
    series: "Series",
    anime: "Anime",
    manga: "Manga"
  }
};

export function getCategoryLabel(language = DEFAULT_LANGUAGE, category = "") {
  const normalizedLanguage = normalizeLanguage(language);
  return (
    CATEGORY_LABELS_I18N?.[normalizedLanguage]?.[category] ||
    CATEGORY_LABELS_I18N?.en?.[category] ||
    category
  );
}

export const CATEGORY_ICONS = {
  books: "📚",
  movies: "🎬",
  series: "📺",
  anime: "🌸",
  manga: "📖"
};

export const CATEGORIES = [
  {
    key: "books",
    title: "Books",
    description: "Книги и циклы"
  },
  {
    key: "movies",
    title: "Movies",
    description: "Фильмы и франшизы"
  },
  {
    key: "series",
    title: "Series",
    description: "Сериалы и сезоны"
  },
  {
    key: "anime",
    title: "Anime",
    description: "Аниме-сериалы и фильмы"
  },
  {
    key: "manga",
    title: "Manga",
    description: "Манга и тома"
  }
];

export const STATUS_LABELS = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  dropped: "Dropped"
};

export const LOCAL_STORAGE_KEYS = {
  THEME: "plamut_theme",
  LANGUAGE: "plamut_language"
};

export const DEFAULT_USER = {
  id: null,
  username: null,
  display_name: "Гость",
  avatar_url: null
};
