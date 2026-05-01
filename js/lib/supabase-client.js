// js/lib/supabase-client.js

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Supabase config missing");
}

let supabase = null;

// единый источник правды
let currentSession = null;
let currentUser = null;

// единый флаг инициализации
let isInitialized = false;
let initPromise = null;

// ===== INIT =====

function initClient() {
  if (supabase) return supabase;

  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });

  return supabase;
}

async function initAuth() {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const client = initClient();

    try {
      const { data, error } = await client.auth.getSession();

      if (error) {
        console.warn("getSession error:", error);
      }

      currentSession = data?.session || null;
      currentUser = currentSession?.user || null;

      // подписка на изменения
      client.auth.onAuthStateChange((event, session) => {
        currentSession = session || null;
        currentUser = session?.user || null;
      });

    } catch (e) {
      console.warn("initAuth failed:", e);
    }

    isInitialized = true;
  })();

  return initPromise;
}

// ===== PUBLIC API =====

export function getSupabaseClient() {
  return initClient();
}

export async function getCurrentSession() {
  await initAuth();
  return currentSession;
}

export async function getCurrentUser() {
  await initAuth();
  return currentUser;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("User not authenticated");
  return user;
}

// ===== AUTH ACTIONS =====

export async function signIn(email, password) {
  const client = getSupabaseClient();

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;

  currentSession = data.session;
  currentUser = data.user;

  return data;
}

export async function signUp(email, password) {
  const client = getSupabaseClient();

  const { data, error } = await client.auth.signUp({
    email,
    password
  });

  if (error) throw error;

  return data;
}

export async function signOut() {
  const client = getSupabaseClient();

  const { error } = await client.auth.signOut();

  if (error) throw error;

  currentSession = null;
  currentUser = null;
}

// ===== UTILS =====

// простой timeout без сложной логики
export async function withTimeout(promise, label = "request", ms = 10000) {
  let timeout;

  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label}: timeout`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeout);
  }
}
