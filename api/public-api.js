import { supabaseClient } from "./supabase-client.js";

export function getPublicProfileByToken(token){
  return supabaseClient.rpc("get_public_profile_by_token", { share_token: token });
}

export function ensureProfileShareToken(){
  return supabaseClient.rpc("ensure_profile_share_token");
}

export function regenerateProfileShareToken(){
  return supabaseClient.rpc("regenerate_profile_share_token");
}


export function insertSavedLibrary(payload){
  return supabaseClient.from("saved_libraries").insert(payload);
}
