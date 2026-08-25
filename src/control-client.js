import { createClient } from "@supabase/supabase-js";

const config = window.SKILLWARD_CONFIG || {};
const client = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "skillward-owner-control" }
}) : null;

const requireClient = () => {
  if (!client) throw new Error("SERVICE_NOT_CONFIGURED");
  return client;
};

window.SkillWardControl = Object.freeze({
  async session() { return (await requireClient().auth.getSession()).data.session; },
  async signIn(email, password) { return requireClient().auth.signInWithPassword({ email, password }); },
  async signOut() { return requireClient().auth.signOut({ scope: "local" }); },
  async assurance() { return requireClient().auth.mfa.getAuthenticatorAssuranceLevel(); },
  async factors() { return requireClient().auth.mfa.listFactors(); },
  async enrollTotp() { return requireClient().auth.mfa.enroll({ factorType: "totp", friendlyName: "SkillWard Owner Control Plane" }); },
  async verifyTotp(factorId, code) {
    const challenge = await requireClient().auth.mfa.challenge({ factorId });
    if (challenge.error) return challenge;
    return requireClient().auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
  },
  async reauthenticate(email, password, code) {
    const signedIn = await requireClient().auth.signInWithPassword({ email, password });
    if (signedIn.error) return signedIn;
    const listed = await requireClient().auth.mfa.listFactors();
    const factor = listed.data?.totp?.find(item => item.status === "verified");
    if (!factor) return { error: new Error("STRONG_MFA_REQUIRED") };
    return this.verifyTotp(factor.id, code);
  },
  async invoke(body) {
    const session = await this.session();
    if (!session?.access_token) return { data: null, error: new Error("AUTHENTICATION_REQUIRED") };
    return requireClient().functions.invoke("owner-control-api", { body, headers: { Authorization: `Bearer ${session.access_token}` } });
  },
  onAuthStateChange(callback) { return requireClient().auth.onAuthStateChange(callback); }
});
