import { createClient } from "@supabase/supabase-js";

const safeConfig = () => globalThis.SKILLWARD_CONFIG || {};

export function createSupabaseAdapter(config = safeConfig()) {
  const url = typeof config.supabaseUrl === "string" ? config.supabaseUrl.trim() : "";
  const anonKey = typeof config.supabaseAnonKey === "string" ? config.supabaseAnonKey.trim() : "";
  if (!url || !anonKey) return { configured: false, client: null };
  const endpoint = new URL(url);
  const localBrowserSessionOnly = config.localBrowserSessionOnly === true
    && ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname);
  const localAuthFetch = localBrowserSessionOnly
    ? async (input, init = {}) => {
        const requestUrl = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
        const method = String(init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
        if (requestUrl.origin === endpoint.origin && requestUrl.pathname === "/auth/v1/logout"
          && requestUrl.searchParams.get("scope") === "local" && method === "POST") {
          return new Response(null, { status: 204 });
        }
        return fetch(input, init);
      }
    : undefined;
  return {
    configured: true,
    client: createClient(url, anonKey, {
      // SkillWard owns callback processing so it can keep recovery parameters intact
      // until the PKCE exchange (or legacy token session) has completed.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      ...(localAuthFetch ? { global: { fetch: localAuthFetch } } : {})
    })
  };
}
