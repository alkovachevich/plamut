import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config.js";


export const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
