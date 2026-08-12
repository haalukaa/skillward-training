import { createClient } from "@supabase/supabase-js";

const safeConfig = () => globalThis.SKILLWARD_CONFIG || {};

export function createSupabaseAdapter(config = safeConfig()) {
  const url = typeof config.supabaseUrl === "string" ? config.supabaseUrl.trim() : "";
  const anonKey = typeof config.supabaseAnonKey === "string" ? config.supabaseAnonKey.trim() : "";
  if (!url || !anonKey) return { configured: false, client: null };
  return {
    configured: true,
    client: createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  };
}
