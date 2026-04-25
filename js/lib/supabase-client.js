import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

let client = null;

const DEFAULT_TIMEOUT_MS = 30000;

function createClient() {
  if (!window.supabase) {
    throw new Error("Supabase SDK не загружен");
  }

  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  });
}

export function getSupabaseClient() {
  if (!client) {
    client = createClient();
  }

  return client;
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

export async function getCurrentSession() {
  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    "Получение session",
    30000
  );

  if (error) {
    throw error;
  }

  return data?.session || null;
}

export async function getCurrentUser() {
  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase.auth.getUser(),
    "Получение пользователя",
    30000
  );

  if (error) {
    throw error;
  }

  return data?.user || null;
}

export async function signInWithEmail(email, password) {
  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase.auth.signInWithPassword({ email, password }),
    "Вход",
    30000
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function signUpWithEmail(email, password) {
  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase.auth.signUp({ email, password }),
    "Регистрация",
    30000
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function signOut() {
  const supabase = getSupabaseClient();

  const { error } = await withTimeout(
    supabase.auth.signOut(),
    "Выход",
    30000
  );

  if (error) {
    throw error;
  }

  return true;
}

export async function fetchUserProfile(userId) {
  if (!userId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle(),
    "Загрузка профиля",
    30000
  );

  if (error) {
    throw error;
  }

  return data || null;
}

export async function upsertUserProfile(profile) {
  if (!profile?.id) {
    throw new Error("upsertUserProfile: profile.id is required");
  }

  const supabase = getSupabaseClient();

  const payload = {
    id: profile.id,
    username: profile.username ?? undefined,
    display_name: profile.display_name ?? undefined,
    avatar_url: profile.avatar_url ?? undefined,
    preferred_language: profile.preferred_language ?? undefined,
    preferred_theme: profile.preferred_theme ?? undefined
  };

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  const { data, error } = await withTimeout(
    supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single(),
    "Сохранение профиля",
    30000
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function updateUserPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error("Пароль должен содержать минимум 6 символов");
  }

  const supabase = getSupabaseClient();

  const { data, error } = await withTimeout(
    supabase.auth.updateUser({ password: newPassword }),
    "Смена пароля",
    30000
  );

  if (error) {
    throw error;
  }

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
  if (!userId) {
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
  const path = `${userId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await withTimeout(
    supabase.storage
      .from("avatars")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false
      }),
    "Загрузка аватара",
    45000
  );

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const publicUrl = data?.publicUrl || "";

  if (!publicUrl) {
    throw new Error("Не удалось получить ссылку аватара");
  }

  return publicUrl;
}
