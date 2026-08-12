import { createSupabaseAdapter } from "./supabase-client.js";
import { SkillWardDatabaseService } from "./database-service.js";
import { InvitationService } from "./invitation-service.js";

const publicRole = { "Hospital Administrator":"management", "Department Manager":"management", PCA:"pca", Cleaner:"cleaner", "PCA Trainer":"pca-trainer", "Cleaner Trainer":"cleaner-trainer" };
export class AuthService {
  constructor(adapter = createSupabaseAdapter()) {
    this.adapter = adapter; this.client = adapter.client;
    this.database = this.client ? new SkillWardDatabaseService(this.client) : null;
  }
  async signIn(email, password) {
    if (!this.adapter.configured) throw new Error("CONFIGURATION_MISSING");
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new Error("INVALID_CREDENTIALS");
    return this.resolve(data.user);
  }
  async resolve(user) {
    const context = await this.database.loadSessionContext(user);
    const status = context.profile.account_status !== "Active" ? context.profile.account_status : context.membership.account_status;
    if (status !== "Active") throw new Error(`ACCOUNT_${String(status).toUpperCase()}`);
    const role = publicRole[context.membership.role];
    if (!role) throw new Error("ACCOUNT_CONFIGURATION");
    return { ...context, appUser: { name: context.profile.full_name, role }, departmentIds: context.departmentDetails.map(d => d.id) };
  }
  async restore() { if (!this.client) return null; const { data } = await this.client.auth.getUser(); return data.user ? this.resolve(data.user) : null; }
  onChange(callback) { return this.client?.auth.onAuthStateChange((event, session) => callback(event, session))?.data?.subscription; }
  async resetPassword(email, redirectTo) { if (!this.client) throw new Error("CONFIGURATION_MISSING"); await this.client.auth.resetPasswordForEmail(email, { redirectTo }); }
  async updatePassword(password) { const { error } = await this.client.auth.updateUser({ password }); if (error) throw new Error("RECOVERY_INVALID"); }
  async signOut() { if (this.client) await this.client.auth.signOut(); }
}

globalThis.SkillWardServices = { AuthService, InvitationService };
