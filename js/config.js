export const SUPABASE_URL = "https://rqtqimjenotjspqumeni.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_LOzTBbVK8tg6kDOrO8AcrQ_j52hzXTf";
export const GOOGLE_BOOKS_API_KEY = "AIzaSyAisvc1YIhHWofTe45-ESHF0JVp9t92Oys";
export const TMDB_API_KEY = "fc8eab333882a74fe8c8a633e4676d98";

export const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
