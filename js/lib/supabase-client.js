import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

let client = null;
let sessionPromise = null;
let cachedSession = null;

const DEFAULT_TIMEOUT_MS = 15000;
const AUTH_TIMEOUT_MS = 12000;
const SESSION_TIMEOUT_MS = 15000;
const PROFILE_TIMEOUT_MS = 20000;
const STORAGE_TIMEOUT_MS = 60000;
const SESSION_RESTORE_GRACE_MS = 12000;
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

let profilePromiseByUserId = new Map();
let profileCacheByUserId = new Map();
let sessionRestoreStartedAt = 0;
let authStatePromise = null;

const AUTH_STATUSES = {
  RESTORING: "restoring",
  AUTHENTICATED: "authenticated",
  GUEST: "guest",
  ERROR: "error"
};

function createClient() {
  if (!window.supabase) {
    throw new Error("Supabase SDK не загружен");
  }

  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: window.localStorage,
      storageKey: "plamut-auth-token",
      flowType: "pkce"
    },
    global: {
      headers: {
        "X-Client-Info": "plamut-web"
      }
    }
  });
}

export function getSupabaseClient() {
  if (!client) {
    client = createClient();
  }

  return client;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function cleanPayload(payload = {}) {
  const result = {};

  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) {
      result[key] = value;
    }
  });

  return result;
}

function getCachedProfile(userId = "") {
  const key = cleanText(userId);
  if (!key) return null;

  const row = profileCacheByUserId.get(key);
  if (!row) return null;

  if (Date.now() - Number(row.ts || 0) > PROFILE_CACHE_TTL_MS) {
    profileCacheByUserId.delete(key);
    return null;
  }

  return row.profile || null;
}

function setCachedProfile(userId = "", profile = null) {
  const key = cleanText(userId);
  if (!key) return;

  if (!profile) {
    profileCacheByUserId.delete(key);
    return;
  }

  profileCacheByUserId.set(key, {
    profile,
    ts: Date.now()
  });
}

export function setCachedSession(session) {
  cachedSession = session || null;
}

export function clearCachedSession() {
  cachedSession = null;
  sessionPromise = null;
  authStatePromise = null;
  profilePromiseByUserId = new Map();
  profileCacheByUserId = new Map();
}

function isTimeoutError(error) {
  return /превышено время ожидания/i.test(String(error?.message || ""));
}

export function withTimeout(promise, label = "Запрос", timeoutMs = DEFAULT_TIMEOUT_MS) {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label}: превышено время ожидания`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

export async function withRetry(factory, label = "Запрос", options = {}) {
  const retries = Number.isFinite(Number(options.retries)) ? Number(options.retries) : 1;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : DEFAULT_TIMEOUT_MS;
  const delayMs = Number.isFinite(Number(options.delayMs)) ? Number(options.delayMs) : 700;

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await withTimeout(factory(), label, timeoutMs);
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await sleep(delayMs * (attempt + 1));
      }
    }
  }

  throw lastError;
}

export async function getCurrentSession() {
  const authState = await getCurrentAuthState();
  return authState?.session || null;
}

export async function getCurrentAuthState() {
  if (cachedSession?.user?.id) {
    return {
      status: AUTH_STATUSES.AUTHENTICATED,
      session: cachedSession,
      error: null
    };
  }

  if (authStatePromise) {
    return authStatePromise;
  }

  if (sessionPromise) {
    const pendingSession = await sessionPromise;
    return {
      status: pendingSession?.user?.id ? AUTH_STATUSES.AUTHENTICATED : AUTH_STATUSES.RESTORING,
      session: pendingSession || null,
      error: null
    };
  }

  authStatePromise = (async () => {
    const authStateStartedAt = Date.now();
    sessionPromise = (async () => {
      sessionRestoreStartedAt = Date.now();
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          "Получение сессии",
          SESSION_TIMEOUT_MS
        );

        if (error) {
          console.warn("getCurrentSession: auth.getSession returned error", error);
          return cachedSession || null;
        }

        cachedSession = data?.session || null;
        return cachedSession;
      } catch (error) {
        const restoreInProgress = Date.now() - sessionRestoreStartedAt < SESSION_RESTORE_GRACE_MS;
        if (restoreInProgress && isTimeoutError(error)) {
          console.info("getCurrentSession pending: auth state is still restoring");
          return cachedSession || null;
        }

        throw error;
      } finally {
        sessionRestoreStartedAt = 0;
        sessionPromise = null;
      }
    })();

    try {
      const session = await sessionPromise;
      if (session?.user?.id) {
        return {
          status: AUTH_STATUSES.AUTHENTICATED,
          session,
          error: null
        };
      }

      return {
        status: AUTH_STATUSES.GUEST,
        session: null,
        error: null
      };
    } catch (error) {
      const restoreInProgress = Date.now() - authStateStartedAt < SESSION_RESTORE_GRACE_MS;
      if (restoreInProgress && isTimeoutError(error)) {
        console.info("getCurrentSession pending: auth state is still restoring");
        return {
          status: AUTH_STATUSES.RESTORING,
          session: cachedSession || null,
          error
        };
      }

      console.warn("getCurrentSession skipped:", error);
      return {
        status: cachedSession?.user?.id ? AUTH_STATUSES.AUTHENTICATED : AUTH_STATUSES.ERROR,
        session: cachedSession || null,
        error
      };
    } finally {
      sessionRestoreStartedAt = 0;
      authStatePromise = null;
    }
  })();

  return authStatePromise;
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user || null;
}

export async function signInWithEmail(email, password) {
  const supabase = getSupabaseClient();

  const { data, error } = await withRetry(
    () => supabase.auth.signInWithPassword({ email, password }),
    "Вход",
    {
      retries: 1,
      timeoutMs: AUTH_TIMEOUT_MS,
      delayMs: 700
    }
  );

  if (error) throw error;

  cachedSession = data?.session || null;

  return data;
}

export async function signUpWithEmail(email, password) {
  const supabase = getSupabaseClient();

  const { data, error } = await withRetry(
    () => supabase.auth.signUp({ email, password }),
    "Регистрация",
    {
      retries: 1,
      timeoutMs: AUTH_TIMEOUT_MS,
      delayMs: 700
    }
  );

  if (error) throw error;

  cachedSession = data?.session || null;

  return data;
}

export async function signOut() {
  const supabase = getSupabaseClient();

  const { error } = await withRetry(
    () => supabase.auth.signOut(),
    "Выход",
    {
      retries: 1,
      timeoutMs: AUTH_TIMEOUT_MS,
      delayMs: 700
    }
  );

  if (error) throw error;

  clearCachedSession();

  return true;
}

export async function fetchUserProfile(userId) {
  const cleanUserId = cleanText(userId);
  if (!cleanUserId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withRetry(
    () =>
      supabase
        .from("profiles")
        .select("*")
        .eq("id", cleanUserId)
        .maybeSingle(),
    "Загрузка профиля",
    {
      retries: 1,
      timeoutMs: PROFILE_TIMEOUT_MS,
      delayMs: 700
    }
  );

  if (error) throw error;

  return data || null;
}

export async function fetchUserProfileSafe(userId) {
  const result = await fetchUserProfileResultSafe(userId);
  return result?.profile || null;
}

export async function fetchUserProfileResultSafe(userId) {
  const cleanUserId = cleanText(userId);
  if (!cleanUserId) return { status: "empty", profile: null, error: null };

  const cachedProfile = getCachedProfile(cleanUserId);
  if (cachedProfile?.id) {
    return {
      status: "found",
      profile: cachedProfile,
      error: null,
      cached: true
    };
  }

  if (profilePromiseByUserId.has(cleanUserId)) {
    return profilePromiseByUserId.get(cleanUserId);
  }

  const profilePromise = (async () => {
    try {
      const profile = await fetchUserProfile(cleanUserId);
      if (profile?.id) {
        setCachedProfile(cleanUserId, profile);
      }

      return {
        status: profile?.id ? "found" : "not_found",
        profile: profile || null,
        error: null
      };
    } catch (error) {
      if (isTimeoutError(error)) {
        console.info("fetchUserProfileSafe: timeout, using fallback profile");
      } else {
        console.warn("fetchUserProfileSafe skipped:", error);
      }
      return {
        status: isTimeoutError(error) ? "timeout" : "error",
        profile: null,
        error
      };
    } finally {
      profilePromiseByUserId.delete(cleanUserId);
    }
  })();

  profilePromiseByUserId.set(cleanUserId, profilePromise);

  try {
    return await profilePromise;
  } catch (error) {
    console.warn("fetchUserProfileSafe skipped:", error);
    return null;
  }
}

export async function upsertUserProfile(profile) {
  if (!profile?.id) {
    throw new Error("upsertUserProfile: profile.id is required");
  }

  const supabase = getSupabaseClient();

  const payload = cleanPayload({
    id: profile.id,
    username: profile.username !== undefined ? cleanText(profile.username) : undefined,
    display_name: profile.display_name !== undefined ? cleanText(profile.display_name) : undefined,
    avatar_url: profile.avatar_url !== undefined ? cleanText(profile.avatar_url) : undefined,
    preferred_language:
      profile.preferred_language !== undefined
        ? cleanText(profile.preferred_language)
        : undefined,
    preferred_theme:
      profile.preferred_theme !== undefined
        ? cleanText(profile.preferred_theme)
        : undefined
  });

  const { data, error } = await withRetry(
    () =>
      supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .single(),
    "Сохранение профиля",
    {
      retries: 1,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      delayMs: 700
    }
  );

  if (error) throw error;

  if (!data) {
    throw new Error("Профиль не был сохранён");
  }

  return data;
}

export async function upsertUserProfileSafe(profile) {
  try {
    return await upsertUserProfile(profile);
  } catch (error) {
    console.warn("upsertUserProfileSafe skipped:", error);
    return null;
  }
}

export async function updateUserPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error("Пароль должен содержать минимум 6 символов");
  }

  const supabase = getSupabaseClient();

  const { data, error } = await withRetry(
    () => supabase.auth.updateUser({ password: newPassword }),
    "Смена пароля",
    {
      retries: 1,
      timeoutMs: AUTH_TIMEOUT_MS,
      delayMs: 700
    }
  );

  if (error) throw error;

  return data;
}

function sanitizeFilename(filename = "avatar") {
  return String(filename)
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function uploadAvatarImage(userId, file) {
  const cleanUserId = cleanText(userId);

  if (!cleanUserId) {
    throw new Error("Не найден пользователь");
  }

  if (!file) {
    throw new Error("Файл не выбран");
  }

  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Нужно выбрать изображение");
  }

  const supabase = getSupabaseClient();
  const extension = (file.name.split(".").pop() || "png").toLowerCase();
  const safeName = sanitizeFilename(file.name || `avatar.${extension}`);
  const path = `${cleanUserId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await withRetry(
    () =>
      supabase.storage
        .from("avatars")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false
        }),
    "Загрузка аватара",
    {
      retries: 1,
      timeoutMs: STORAGE_TIMEOUT_MS,
      delayMs: 1000
    }
  );

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const publicUrl = data?.publicUrl || "";

  if (!publicUrl) {
    throw new Error("Не удалось получить ссылку аватара");
  }

  return publicUrl;
}
