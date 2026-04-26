import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

let client = null;
let sessionPromise = null;

const DEFAULT_TIMEOUT_MS = 45000;

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
      storageKey: "plamut-auth-token"
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
  const retries = options.retries ?? 1;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const delayMs = options.delayMs ?? 700;

  let lastError;

  for (let i = 0; i <= retries; i++) {
    try {
      return await withTimeout(factory(), label, timeoutMs);
    } catch (err) {
      lastError = err;
      if (i < retries) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

//
// 🔥 ГЛАВНЫЙ ФИКС
// без timeout → без зависаний auth
//
export async function getCurrentSession() {
  if (sessionPromise) return sessionPromise;

  const supabase = getSupabaseClient();

  sessionPromise = supabase.auth
    .getSession()
    .then(({ data, error }) => {
      if (error) throw error;
      return data?.session || null;
    })
    .catch((error) => {
      console.warn("getCurrentSession skipped:", error);
      return null;
    })
    .finally(() => {
      sessionPromise = null;
    });

  return sessionPromise;
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user || null;
}

export async function signInWithEmail(email, password) {
  const supabase = getSupabaseClient();

  const { data, error } = await withRetry(
    () => supabase.auth.signInWithPassword({ email, password }),
    "Вход"
  );

  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email, password) {
  const supabase = getSupabaseClient();

  const { data, error } = await withRetry(
    () => supabase.auth.signUp({ email, password }),
    "Регистрация"
  );

  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = getSupabaseClient();

  const { error } = await supabase.auth.signOut();
  if (error) throw error;

  return true;
}

export async function fetchUserProfile(userId) {
  if (!userId) return null;

  const session = await getCurrentSession();
  if (!session?.user?.id) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

export async function upsertUserProfile(profile) {
  if (!profile?.id) return null;

  const session = await getCurrentSession();
  if (!session?.user?.id) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .upsert(profile, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;

  return data;
}
