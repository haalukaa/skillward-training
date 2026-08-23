import { createSupabaseAdapter } from "./supabase-client.js";
import { SkillWardDatabaseService } from "./database-service.js";
import { InvitationService } from "./invitation-service.js";
import { establishRecoverySession } from "./recovery-service.js";

const publicRole = {
  "SkillWard Super Administrator": "platform-admin",
  "Organisation Administrator": "management",
  "Facility Administrator": "management",
  "Hospital Administrator": "management",
  "Department Manager": "management",
  "Content Administrator/Educator": "management",
  PCA: "pca", Cleaner: "cleaner", "Support Worker": "pca",
  "PCA Trainer": "pca-trainer", "Cleaner Trainer": "cleaner-trainer"
};

function isCurrentMembership(membership, now = Date.now()) {
  return membership.membership_status === "Active"
    && membership.organizations?.status !== "Archived"
    && (!membership.membership_expires_at || new Date(membership.membership_expires_at).getTime() > now);
}

export class AuthService {
  constructor(adapter = createSupabaseAdapter()) {
    this.adapter = adapter;
    this.client = adapter.client;
    this.database = this.client ? new SkillWardDatabaseService(this.client) : null;
    this.invitations = this.client ? new InvitationService(this.client) : null;
  }

  async signIn(email, password) {
    if (!this.adapter.configured) throw new Error("CONFIGURATION_MISSING");
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new Error("INVALID_CREDENTIALS");
    const result = await this.resolve(data.user);
    await this.database.recordAuthenticationEvent("signed_in", result.organization?.id || null, {
      entry_state: result.entryState || "workspace"
    });
    return result;
  }

  async resolve(user, organizationId = null) {
    const entry = await this.database.loadEntryContext(user);
    const profileStatus = entry.profile.account_status;
    const now = Date.now();
    const currentMemberships = entry.memberships.filter(membership => isCurrentMembership(membership, now));
    const validInvitations = entry.invitations.filter(invitation =>
      ["Pending", "Delivered", "Accepted"].includes(invitation.invitation_state)
      && new Date(invitation.expires_at).getTime() > now
    );
    const setupInvitation = validInvitations.find(invitation =>
      invitation.auth_invitation_reference === user.id || invitation.email?.toLowerCase() === user.email?.toLowerCase()
    );

    if (profileStatus === "Suspended") throw new Error("ACCOUNT_SUSPENDED");
    if (profileStatus === "Archived") throw new Error("ACCOUNT_ARCHIVED");
    if (profileStatus === "Invited" && !setupInvitation) throw new Error("INVITATION_EXPIRED");

    if (setupInvitation && (
      setupInvitation.invitation_state !== "Accepted"
      || !entry.profile.onboarding_completed_at
      || !currentMemberships.length
    )) {
      return {
        entryState: "invitation",
        ...entry,
        invitation: setupInvitation,
        memberships: currentMemberships
      };
    }

    if (!currentMemberships.length && !entry.platformAdministrator?.is_active) {
      const statuses = new Set(entry.memberships.map(membership => membership.membership_status));
      const expired = entry.memberships.some(membership =>
        membership.membership_status === "Active"
        && membership.membership_expires_at
        && new Date(membership.membership_expires_at).getTime() <= now
      );
      if (expired) throw new Error("MEMBERSHIP_EXPIRED");
      if (statuses.has("Suspended")) throw new Error("ACCOUNT_SUSPENDED");
      if (statuses.has("Archived")) throw new Error("ACCOUNT_ARCHIVED");
      if (statuses.has("Invited")) throw new Error("INVITATION_EXPIRED");
      throw new Error("MISSING_MEMBERSHIP");
    }

    if (!organizationId && currentMemberships.length > 1) {
      return { entryState: "workspace-choice", ...entry, memberships: currentMemberships };
    }
    if (organizationId && !currentMemberships.some(item => item.organization_id === organizationId)) {
      throw new Error("ACCESS_DENIED");
    }
    const selectedOrganizationId = organizationId || currentMemberships[0]?.organization_id || null;
    const context = await this.database.loadSessionContext(user, selectedOrganizationId, {
      ...entry,
      memberships: currentMemberships
    });
    const status = context.profile.account_status !== "Active"
      ? context.profile.account_status
      : (context.membership.membership_status || context.membership.account_status);
    if (status !== "Active") throw new Error(`ACCOUNT_${String(status).toUpperCase()}`);
    const role = publicRole[context.membership.role];
    if (!role) throw new Error("ACCOUNT_CONFIGURATION");
    return {
      ...context,
      appUser: { name: context.profile.full_name, role },
      departmentIds: context.departmentDetails.map(department => department.id)
    };
  }

  async restore(organizationId = null) {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) return null;
    return this.resolve(data.user, organizationId);
  }

  async switchOrganization(organizationId) {
    if (!this.client) throw new Error("CONFIGURATION_MISSING");
    const { data } = await this.client.auth.getUser();
    if (!data.user) throw new Error("INVALID_CREDENTIALS");
    const context = await this.resolve(data.user, organizationId);
    await this.database.recordAuthenticationEvent("workspace_changed", organizationId);
    return context;
  }

  onChange(callback) {
    return this.client?.auth.onAuthStateChange((event, session) => callback(event, session))?.data?.subscription;
  }

  async resetPassword(email, redirectTo) {
    if (!this.client) throw new Error("CONFIGURATION_MISSING");
    await this.client.auth.resetPasswordForEmail(email, { redirectTo });
  }

  async establishRecovery(callback) {
    if (!this.client) throw new Error("RECOVERY_INVALID");
    return establishRecoverySession(this.client, callback);
  }

  async establishInvitation(callback) {
    if (!this.invitations) throw new Error("INVITATION_INVALID");
    return this.invitations.establishSession(callback);
  }

  async completeInvitation(invitationId, fullName) {
    return this.database.completeInvitation(invitationId, fullName);
  }

  async recoverySession() {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getSession();
    return error ? null : data.session;
  }

  async updatePassword(password) {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw new Error("RECOVERY_INVALID");
    await this.database.recordAuthenticationEvent("password_changed");
  }

  async signOut(scope = "local") {
    if (!this.client) return;
    await this.database?.recordAuthenticationEvent(scope === "global" ? "signed_out_all" : "signed_out");
    await this.client.auth.signOut({ scope });
  }

  async signOutEverywhere() {
    return this.signOut("global");
  }
}

globalThis.SkillWardServices = { AuthService, InvitationService };
