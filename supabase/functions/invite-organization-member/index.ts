import { createClient } from "npm:@supabase/supabase-js@2.55.0";

const publicSiteOrigin = Deno.env.get("PUBLIC_SITE_ORIGIN") || "https://skillwardtraining.com";
const jsonHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": publicSiteOrigin, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
const response = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (request.method !== "POST") return response(405, { error: "METHOD_NOT_ALLOWED" });

  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authorization || !url || !anonKey || !serviceKey) return response(503, { error: "SERVICE_NOT_CONFIGURED" });

  let invitationId = "";
  try { invitationId = String((await request.json()).invitationId || ""); } catch { return response(400, { error: "INVALID_REQUEST" }); }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invitationId)) return response(400, { error: "INVALID_REQUEST" });

  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: callerResult, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerResult.user) return response(401, { error: "AUTHENTICATION_REQUIRED" });

  const { data: invitation, error: invitationError } = await callerClient
    .from("organization_invitations")
    .select("*")
    .eq("id", invitationId)
    .eq("invited_by", callerResult.user.id)
    .eq("status", "Invited")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (invitationError || !invitation) return response(403, { error: "INVITATION_NOT_AUTHORIZED" });

  const { data: callerMembership } = await callerClient.from("organization_memberships").select("role").eq("organization_id", invitation.organization_id).eq("user_id", callerResult.user.id).eq("membership_status", "Active").maybeSingle();
  const { data: platformAdministrator } = await callerClient.from("skillward_administrators").select("is_active").eq("user_id", callerResult.user.id).maybeSingle();
  const actorRole = callerMembership?.role || (platformAdministrator?.is_active ? "SkillWard Super Administrator" : "Unknown");

  const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let invitedUserId: string | null = null;
  let existingConfirmedUser = false;
  for (let page = 1; page <= 10 && !invitedUserId; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 100 });
    if (error) return response(502, { error: "INVITATION_DELIVERY_FAILED" });
    const existing = data.users.find(user => user.email?.toLowerCase() === invitation.email.toLowerCase());
    invitedUserId = existing?.id || null;
    existingConfirmedUser = Boolean(existing?.email_confirmed_at);
    if (data.users.length < 100) break;
  }

  if (!invitedUserId) {
    const redirectTo = Deno.env.get("PUBLIC_SITE_URL") || publicSiteOrigin;
    const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(invitation.email, { redirectTo });
    if (error || !data.user) return response(502, { error: "INVITATION_DELIVERY_FAILED" });
    invitedUserId = data.user.id;
  }

  const { data: existingProfile } = await serviceClient.from("user_profiles").select("user_id").eq("user_id", invitedUserId).maybeSingle();
  if (!existingProfile) {
    const { error } = await serviceClient.from("user_profiles").insert({ user_id: invitedUserId, full_name: invitation.full_name, employee_id: invitation.employee_id, email_display: invitation.email, account_status: "Invited", employment_status: "New Starter", active_organization_id: invitation.organization_id });
    if (error) return response(502, { error: "INVITATION_SETUP_FAILED" });
  }

  const { error: staffError } = await serviceClient.from("organization_staff_profiles").upsert({ organization_id: invitation.organization_id, user_id: invitedUserId, employee_id: invitation.employee_id, employment_status: "New Starter" }, { onConflict: "organization_id,user_id" });
  if (staffError) return response(502, { error: "INVITATION_SETUP_FAILED" });

  const { data: membership } = await serviceClient.from("organization_memberships").select("id").eq("organization_id", invitation.organization_id).eq("user_id", invitedUserId).in("membership_status", ["Invited","Active","Suspended"]).maybeSingle();
  const membershipStatus = existingConfirmedUser ? "Active" : "Invited";
  const membershipResult = membership
    ? await serviceClient.from("organization_memberships").update({ role: invitation.intended_role, membership_status: membershipStatus, joined_at: existingConfirmedUser ? new Date().toISOString() : null }).eq("id", membership.id).select("id").single()
    : await serviceClient.from("organization_memberships").insert({ organization_id: invitation.organization_id, user_id: invitedUserId, role: invitation.intended_role, membership_status: membershipStatus, joined_at: existingConfirmedUser ? new Date().toISOString() : null, created_by: callerResult.user.id }).select("id").single();
  if (membershipResult.error || !membershipResult.data) return response(502, { error: "INVITATION_SETUP_FAILED" });

  if (invitation.facility_id) {
    await serviceClient.from("facility_assignments").insert({ organization_id: invitation.organization_id, facility_id: invitation.facility_id, user_id: invitedUserId, role: invitation.intended_role, is_active: existingConfirmedUser, assigned_by: callerResult.user.id });
  }
  if (invitation.department_id) {
    const { data: department } = await serviceClient.from("departments").select("facility_id").eq("id", invitation.department_id).eq("organization_id", invitation.organization_id).single();
    if (!department) return response(502, { error: "INVITATION_SETUP_FAILED" });
    await serviceClient.from("department_assignments").insert({ organization_id: invitation.organization_id, facility_id: department.facility_id, department_id: invitation.department_id, user_id: invitedUserId, role: invitation.intended_role, is_active: existingConfirmedUser, assigned_by: callerResult.user.id });
  }

  await serviceClient.from("organization_invitations").update({ auth_invitation_reference: invitedUserId, status: existingConfirmedUser ? "Active" : "Invited", accepted_at: existingConfirmedUser ? new Date().toISOString() : null }).eq("id", invitation.id);
  await serviceClient.from("audit_logs").insert({ organization_id: invitation.organization_id, hospital_id: invitation.facility_id, department_id: invitation.department_id, actor_user_id: callerResult.user.id, actor_role_name: actorRole, action_type: "organization_invitation.delivered", affected_user_id: invitedUserId, record_type: "organization_membership", record_id: membershipResult.data.id, target_type: "organization_membership", target_id: membershipResult.data.id, previous_values: null, new_values: { role: invitation.intended_role, status: membershipStatus }, reason: "Authorised workforce invitation" });

  return response(200, { ok: true });
});
