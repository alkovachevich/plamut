import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

let client = null;
let sessionPromise = null;

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

export async function getCurrentSession() {
  if (sessionPromise) return sessionPromise;

  const supabase = getSupabaseClient();

  sessionPromise = supabase.auth
    .getSession()
    .then(({ data, error }) => {
      if (error) throw error;
      return data?.session || null;
    })
    .catch(() => null)
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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email, password) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
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

//
// 🔥 ВОТ ЭТО БЫЛО ПОТЕРЯНО → ВЕРНУЛИ
//
export async function updateUserPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error("Пароль минимум 6 символов");
  }

  const session = await getCurrentSession();
  if (!session?.user?.id) {
    throw new Error("Нужно войти в аккаунт");
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) throw error;

  return data;
}
