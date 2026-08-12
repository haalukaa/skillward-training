/** Future Supabase browser adapter. The demonstration application does not import this file. */
(function (global) {
  function createSupabaseAdapter(options = {}) {
    const { url, anonKey, createClient } = options;
    if (!url || !anonKey || typeof createClient !== "function") {
      return { configured: false, client: null };
    }
    // The anonymous key identifies the project; authorization remains enforced by RLS.
    return { configured: true, client: createClient(url, anonKey) };
  }
  global.SkillWardSupabase = { createSupabaseAdapter };
})(typeof window === "undefined" ? globalThis : window);

