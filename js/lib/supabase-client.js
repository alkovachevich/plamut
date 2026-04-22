import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

let client = null;

/* =========================
   CLIENT
========================= */

function createClient() {
  if (!window.supabase) {
    throw new Error("Supabase SDK не загружен");
  }

  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

export function getSupabaseClient() {
  if (!client) {
    client = createClient();
  }
  return client;
}

/* =========================
   AUTH HELPERS
========================= */

export async function getCurrentSession() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Supabase getSession error:", error);
    return null;
  }

  return data?.session || null;
}

export async function getCurrentUser() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error("Supabase getUser error:", error);
    return null;
  }

  return data?.user || null;
}

export async function signInWithEmail(email, password) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signUpWithEmail(email, password) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signOut() {
  const supabase = getSupabaseClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }

  return true;
}

/* =========================
   PROFILE HELPERS
========================= */

export async function fetchUserProfile(userId) {
  if (!userId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("fetchUserProfile error:", error);
    return null;
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
    username: profile.username || null,
    display_name: profile.display_name || null,
    avatar_url: profile.avatar_url || null
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, {
      onConflict: "id"
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
