import { createClient } from "npm:@supabase/supabase-js@2.55.0";

const allowedOrigin = Deno.env.get("PUBLIC_SITE_ORIGIN") || "http://localhost:8080";
const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};
const response = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const serviceFailure = (stage: string, error: { code?: string } | null | undefined, publicCode: string) => {
  const safeStage = stage.replace(/[^A-Z0-9_]/gi, "");
  const safeCode = String(error?.code || "unknown").replace(/[^A-Z0-9_-]/gi, "");
  console.error(`SkillWard invitation service failure: ${safeStage}:${safeCode}`);
  return response(502, { error: publicCode });
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invitationRedirect(): string | undefined {
  const configured = Deno.env.get("PUBLIC_SITE_URL")?.trim();
  if (!configured) return undefined;
  const url = new URL(configured);
  url.pathname = "/app/";
  url.search = "?invitation=1";
  url.hash = "";
  return url.toString();
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (request.method !== "POST") return response(405, { error: "METHOD_NOT_ALLOWED" });

  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authorization || !url || !anonKey || !serviceKey) return response(503, { error: "SERVICE_NOT_CONFIGURED" });

  let invitationId = "";
  let action = "deliver";
  try {
    const payload = await request.json();
    invitationId = String(payload.invitationId || "");
    action = String(payload.action || "deliver");
  } catch {
    return response(400, { error: "INVALID_REQUEST" });
  }
  if (!uuidPattern.test(invitationId) || !["deliver", "resend", "revoke"].includes(action)) {
    return response(400, { error: "INVALID_REQUEST" });
  }

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false }
  });
  const { data: callerResult, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerResult.user) return response(401, { error: "AUTHENTICATION_REQUIRED" });

  const { data: invitation, error: invitationError } = await callerClient
    .from("organization_invitations").select("*").eq("id", invitationId).maybeSingle();
  if (invitationError || !invitation) return response(403, { error: "INVITATION_NOT_AUTHORIZED" });

  const { data: callerMembership } = await callerClient.from("organization_memberships")
    .select("role").eq("organization_id", invitation.organization_id)
    .eq("user_id", callerResult.user.id).eq("membership_status", "Active").maybeSingle();
  const { data: platformAdministrator } = await callerClient.from("skillward_administrators")
    .select("is_active").eq("user_id", callerResult.user.id).maybeSingle();
  const actorRole = callerMembership?.role || (platformAdministrator?.is_active ? "SkillWard Super Administrator" : null);
  const authorized = actorRole === "Organisation Administrator"
    || (actorRole === "SkillWard Super Administrator" && invitation.intended_role === "Organisation Administrator");
  if (!authorized) return response(403, { error: "INVITATION_NOT_AUTHORIZED" });

  const serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  if (action === "revoke") {
    if (["Accepted", "Revoked", "Expired"].includes(invitation.invitation_state)) {
      return response(409, { error: "INVITATION_NOT_REVOCABLE" });
    }
    const now = new Date().toISOString();
    const invitedUserId = invitation.auth_invitation_reference;
    if (invitedUserId) {
      await serviceClient.from("facility_assignments").update({ is_active: false, ended_at: now })
        .eq("organization_id", invitation.organization_id).eq("user_id", invitedUserId).eq("is_active", true);
      await serviceClient.from("department_assignments").update({ is_active: false, ended_at: now })
        .eq("organization_id", invitation.organization_id).eq("user_id", invitedUserId).eq("is_active", true);
      await serviceClient.from("organization_memberships")
        .update({ membership_status: "Archived", archived_at: now, updated_at: now })
        .eq("organization_id", invitation.organization_id).eq("user_id", invitedUserId).eq("membership_status", "Invited");
    }
    const { error } = await serviceClient.from("organization_invitations").update({
      status: "Archived", invitation_state: "Revoked", revoked_at: now,
      revoked_by: callerResult.user.id, failure_code: null
    }).eq("id", invitation.id);
    if (error) return response(502, { error: "INVITATION_REVOKE_FAILED" });
    await serviceClient.from("audit_logs").insert({
      organization_id: invitation.organization_id, hospital_id: invitation.facility_id,
      department_id: invitation.department_id, actor_user_id: callerResult.user.id,
      actor_role_name: actorRole, action_type: "organization_invitation.revoked",
      affected_user_id: invitedUserId || null, record_type: "organization_invitation",
      record_id: invitation.id, target_type: "organization_invitation", target_id: invitation.id,
      previous_values: { state: invitation.invitation_state }, new_values: { state: "Revoked" },
      reason: "Authorised administrator revoked the invitation"
    });
    return response(200, { ok: true, state: "Revoked" });
  }

  if (["Accepted", "Revoked"].includes(invitation.invitation_state)) {
    return response(409, { error: "INVITATION_NOT_DELIVERABLE" });
  }

  let invitedUserId: string | null = invitation.auth_invitation_reference || null;
  let existingConfirmedUser = false;
  if (invitedUserId) {
    const { data, error } = await serviceClient.auth.admin.getUserById(invitedUserId);
    if (error) return serviceFailure("AUTH_GET_USER", error, "INVITATION_DELIVERY_FAILED");
    existingConfirmedUser = Boolean(data.user?.email_confirmed_at);
  }
  if (!invitedUserId) {
    const { data: profiles, error } = await serviceClient.from("user_profiles")
      .select("user_id").ilike("email_display", invitation.email).limit(1);
    if (error) return serviceFailure("EXISTING_PROFILE_LOOKUP", error, "INVITATION_DELIVERY_FAILED");
    invitedUserId = profiles?.[0]?.user_id || null;
    if (invitedUserId) {
      const { data, error: userError } = await serviceClient.auth.admin.getUserById(invitedUserId);
      if (userError) return serviceFailure("AUTH_GET_PROFILE_USER", userError, "INVITATION_DELIVERY_FAILED");
      existingConfirmedUser = Boolean(data.user?.email_confirmed_at);
    }
  }

  const redirectTo = invitationRedirect();
  if (!invitedUserId) {
    const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(
      invitation.email,
      { redirectTo, data: { skillward_invitation_id: invitation.id } }
    );
    if (error || !data.user) {
      await serviceClient.from("organization_invitations")
        .update({ invitation_state: "Failed", failure_code: "AUTH_INVITE_FAILED" }).eq("id", invitation.id);
      return serviceFailure("AUTH_INVITE", error, "INVITATION_DELIVERY_FAILED");
    }
    invitedUserId = data.user.id;
  } else if (action === "resend" && !existingConfirmedUser) {
    const { error } = await serviceClient.auth.resend({
      type: "signup", email: invitation.email, options: { emailRedirectTo: redirectTo }
    });
    if (error) return serviceFailure("AUTH_RESEND", error, "INVITATION_DELIVERY_FAILED");
  } else if (existingConfirmedUser) {
    const { error } = await serviceClient.auth.signInWithOtp({
      email: invitation.email,
      options: { shouldCreateUser: false, emailRedirectTo: redirectTo }
    });
    if (error) return serviceFailure("AUTH_MAGIC_LINK", error, "INVITATION_DELIVERY_FAILED");
  }

  const { data: existingProfile } = await serviceClient.from("user_profiles")
    .select("user_id,onboarding_completed_at").eq("user_id", invitedUserId).maybeSingle();
  if (!existingProfile) {
    const { error } = await serviceClient.from("user_profiles").insert({
      user_id: invitedUserId, full_name: invitation.full_name,
      employee_id: invitation.employee_id, email_display: invitation.email,
      account_status: "Invited", employment_status: "New Starter",
      active_organization_id: invitation.organization_id, onboarding_completed_at: null
    });
    if (error) return serviceFailure("PROFILE_INSERT", error, "INVITATION_SETUP_FAILED");
  }

  const { error: staffError } = await serviceClient.from("organization_staff_profiles").upsert({
    organization_id: invitation.organization_id, user_id: invitedUserId,
    employee_id: invitation.employee_id, employment_status: "New Starter"
  }, { onConflict: "organization_id,user_id" });
  if (staffError) return serviceFailure("STAFF_UPSERT", staffError, "INVITATION_SETUP_FAILED");

  const { data: membership } = await serviceClient.from("organization_memberships")
    .select("id,membership_status").eq("organization_id", invitation.organization_id)
    .eq("user_id", invitedUserId).in("membership_status", ["Invited", "Active", "Suspended"]).maybeSingle();
  if (membership?.membership_status === "Active") return response(409, { error: "ALREADY_ACTIVE_MEMBER" });
  const membershipResult = membership
    ? await serviceClient.from("organization_memberships").update({
        role: invitation.intended_role, membership_status: "Invited",
        joined_at: null, archived_at: null, updated_at: new Date().toISOString()
      }).eq("id", membership.id).select("id").single()
    : await serviceClient.from("organization_memberships").insert({
        organization_id: invitation.organization_id, user_id: invitedUserId,
        role: invitation.intended_role, membership_status: "Invited", created_by: callerResult.user.id
      }).select("id").single();
  if (membershipResult.error || !membershipResult.data) return serviceFailure("MEMBERSHIP_WRITE", membershipResult.error, "INVITATION_SETUP_FAILED");

  if (invitation.facility_id) {
    const { data: assignment } = await serviceClient.from("facility_assignments").select("id")
      .eq("organization_id", invitation.organization_id).eq("facility_id", invitation.facility_id)
      .eq("user_id", invitedUserId).eq("role", invitation.intended_role).maybeSingle();
    if (assignment) {
      await serviceClient.from("facility_assignments").update({ is_active: false, ended_at: new Date().toISOString() }).eq("id", assignment.id);
    } else {
      await serviceClient.from("facility_assignments").insert({
        organization_id: invitation.organization_id, facility_id: invitation.facility_id,
        user_id: invitedUserId, role: invitation.intended_role, is_active: false,
        assigned_by: callerResult.user.id, ended_at: new Date().toISOString()
      });
    }
  }
  if (invitation.department_id) {
    const { data: department } = await serviceClient.from("departments").select("facility_id")
      .eq("id", invitation.department_id).eq("organization_id", invitation.organization_id).single();
    if (!department) return serviceFailure("DEPARTMENT_READ", null, "INVITATION_SETUP_FAILED");
    const { data: assignment } = await serviceClient.from("department_assignments").select("id")
      .eq("organization_id", invitation.organization_id).eq("department_id", invitation.department_id)
      .eq("user_id", invitedUserId).eq("role", invitation.intended_role).maybeSingle();
    if (assignment) {
      await serviceClient.from("department_assignments").update({ is_active: false, ended_at: new Date().toISOString() }).eq("id", assignment.id);
    } else {
      await serviceClient.from("department_assignments").insert({
        organization_id: invitation.organization_id, facility_id: department.facility_id,
        department_id: invitation.department_id, user_id: invitedUserId,
        role: invitation.intended_role, is_active: false,
        assigned_by: callerResult.user.id, ended_at: new Date().toISOString()
      });
    }
  }

  const now = new Date();
  const expiry = new Date(now.getTime() + 7 * 86400000).toISOString();
  const { error: updateError } = await serviceClient.from("organization_invitations").update({
    auth_invitation_reference: invitedUserId, status: "Invited",
    invitation_state: "Delivered", existing_account: existingConfirmedUser,
    last_sent_at: now.toISOString(), expires_at: expiry,
    resend_count: invitation.resend_count + (action === "resend" ? 1 : 0),
    accepted_at: null, revoked_at: null, revoked_by: null, failure_code: null
  }).eq("id", invitation.id);
  if (updateError) return serviceFailure("INVITATION_UPDATE", updateError, "INVITATION_SETUP_FAILED");

  await serviceClient.from("audit_logs").insert({
    organization_id: invitation.organization_id, hospital_id: invitation.facility_id,
    department_id: invitation.department_id, actor_user_id: callerResult.user.id,
    actor_role_name: actorRole,
    action_type: action === "resend" ? "organization_invitation.resent" : "organization_invitation.delivered",
    affected_user_id: invitedUserId, record_type: "organization_membership",
    record_id: membershipResult.data.id, target_type: "organization_invitation", target_id: invitation.id,
    previous_values: { state: invitation.invitation_state },
    new_values: { state: "Delivered", role: invitation.intended_role, existing_account: existingConfirmedUser },
    reason: "Authorised workforce invitation"
  });

  return response(200, {
    ok: true, state: "Delivered", existingAccount: existingConfirmedUser,
    delivery: existingConfirmedUser ? "One-time sign-in email requested for existing account" : "Supabase invitation email requested"
  });
});
