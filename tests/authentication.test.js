const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = file => fs.readFileSync(file, "utf8");
const app = read("app.js"), auth = read("src/auth-service.js"), database = read("src/database-service.js");
const recoverySource = read("src/recovery-service.js");
const invitationSource = read("src/invitation-service.js");
const invitationFunction = read("supabase/functions/invite-organization-member/index.ts");
const supabaseClient = read("src/supabase-client.js");
const authMigration = read("supabase/migrations/20260823210000_authentication_entry_rebuild.sql");
const index = read("index.html");
const appIndex = read("app/index.html");

async function loadRecoveryModule() {
  return import(`data:text/javascript;base64,${Buffer.from(recoverySource).toString("base64")}#${Math.random()}`);
}

async function loadInvitationModule() {
  return import(`data:text/javascript;base64,${Buffer.from(invitationSource).toString("base64")}#${Math.random()}`);
}

test("sign-in and Demo Mode are separate and public sign-up is unavailable", () => {
  assert.match(app, /auth-entry-v2/); assert.match(app, /href="\/demo\/"/);
  assert.match(app, /renderGuidedDemoEntry/); assert.match(app, /never writes to authenticated organisation tables/);
  assert.doesNotMatch(app + auth, /signUp\s*\(/);
  assert.match(app, /async function signOutCurrentUser\(\)/);
  assert.match(app, /await authService\?\.signOut\(\)/);
});

test("sessionless Demo entry and unprovisioned users do not emit authenticated audit requests", () => {
  assert.match(app, /signOut\("local", false\); authenticatedContext = null/);
  assert.match(app, /signOut\("local", caught\.message !== "MISSING_PROFILE"\)/);
  assert.match(auth, /async signOut\(scope = "local", recordAudit = true\)/);
  assert.match(auth, /if \(recordAudit\)/);
});

test("authenticated REST-style context loads its permitted profile, membership and routing data", async () => {
  for (const table of ["user_profiles", "organizations", "organization_memberships", "facilities", "facility_assignments", "department_assignments", "departments", "trainer_assignments", "training_assignments", "module_progress", "competency_records", "notifications"]) assert.match(database, new RegExp(`"${table}"`));
  assert.match(auth, /context\.membership\.role/); assert.match(auth, /departmentDetails/);
  assert.doesNotMatch(auth, /localStorage/);
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(database).toString("base64")}`;
  const { SkillWardDatabaseService } = await import(moduleUrl);
  const user = { id: "admin-user" };
  const rows = {
    user_profiles: { user_id: user.id, full_name: "Development Administrator", account_status: "Active", active_organization_id: "org-a" },
    skillward_administrators: null,
    organization_memberships: [{ user_id: user.id, organization_id: "org-a", role: "Organisation Administrator", membership_status: "Active", organizations: { id: "org-a", name: "Development Organisation" } }],
    facilities: [], facility_assignments: [], department_assignments: [], departments: [], notifications: [], organization_staff_profiles: []
  };
  const client = {
    from(table) {
      const result = () => ({ data: rows[table] ?? [], error: null });
      const query = {
        select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; }, gt() { return query; },
        maybeSingle() { return Promise.resolve(result()); }, single() { return Promise.resolve(result()); },
        then(resolve) { return Promise.resolve(result()).then(resolve); },
      };
      return query;
    },
  };

  const context = await new SkillWardDatabaseService(client).loadSessionContext(user);
  assert.equal(context.profile.user_id, user.id);
  assert.equal(context.membership.user_id, user.id);
  assert.equal(context.membership.role, "Organisation Administrator");
  assert.equal(context.organization.id, "org-a");
  assert.equal(context.memberships.length, 1);
});

test("organisation staff embeds the staff user relationship without manager ambiguity", () => {
  assert.match(database, /user_profiles!organization_staff_profiles_user_id_fkey\(\*\)/);
  assert.doesNotMatch(database, /organization_staff_profiles[^\n]+"\*, user_profiles\(\*\)"/);
  assert.match(appIndex, /auth-bundle\.js\?v=20260825-phase7-security-ops-1/);
});

test("training assignment embeds use the tenant-safe pathway relationship", () => {
  assert.match(database, /training_pathways!assignments_pathway_org_fk\(\*\)/);
  assert.doesNotMatch(database, /training_assignments[^\n]+training_pathways\(\*\)/);
});

test("local browser logout isolation is explicit, loopback-only and independently probed", () => {
  assert.match(supabaseClient, /config\.localBrowserSessionOnly === true/);
  assert.match(supabaseClient, /\["localhost", "127\.0\.0\.1", "::1"\]/);
  assert.match(supabaseClient, /requestUrl\.pathname === "\/auth\/v1\/logout"/);
  assert.match(read("scripts/verify-local-auth-logout.mjs"), /Verified real local Auth logout endpoint/);
  assert.match(read(".github\/workflows\/phase1-local-browser-verification.yml"), /SKILLWARD_LOCAL_BROWSER_SESSION_ONLY: "true"/);
});

test("account blocking, recovery, restoration and safe diagnostics are implemented", () => {
  assert.match(database, /error\?\.code === "42501"/);
  assert.match(database, /CONTEXT_TABLE_PERMISSION/);
  assert.equal(
    app.match(/CONTEXT_TABLE_PERMISSION: "([^"]+)"/)[1],
    app.match(/CONTEXT_READ_FAILED: "([^"]+)"/)[1]
  );
  assert.doesNotMatch(database, /console\.(?:warn|error)\([^)]*error/);
  for (const text of ["ACCOUNT_SUSPENDED", "ACCOUNT_ARCHIVED", "ACCOUNT_INVITED", "MISSING_PROFILE", "MISSING_MEMBERSHIP", "resetPasswordForEmail", "updateUser", "getUser", "onAuthStateChange", "signOut"]) assert.match(app + auth, new RegExp(text));
  assert.match(app, /If an eligible account exists/); assert.match(app, /button\.disabled=true/);
});

test("recovery callbacks parse PKCE codes and legacy recovery hashes", async () => {
  const { parseRecoveryCallback } = await loadRecoveryModule();
  const pkce = parseRecoveryCallback("https://example.test/?recovery=1&code=pkce-code");
  assert.equal(pkce.requested, true); assert.equal(pkce.code, "pkce-code"); assert.equal(pkce.legacy, false);
  const legacy = parseRecoveryCallback("https://example.test/#access_token=access&refresh_token=refresh&type=recovery");
  assert.equal(legacy.requested, true); assert.equal(legacy.legacy, true);
  assert.equal(legacy.accessToken, "access"); assert.equal(legacy.refreshToken, "refresh");
});

test("PASSWORD_RECOVERY and PKCE exchange establish the recovery session", async () => {
  const { establishRecoverySession } = await loadRecoveryModule();
  const session = { user: { id: "user-id" } }; let exchanged; let unsubscribed = false;
  const client = { auth: {
    onAuthStateChange(callback) { callback("PASSWORD_RECOVERY", session); return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
    async exchangeCodeForSession(code) { exchanged = code; return { data: { session }, error: null }; }
  } };
  assert.equal(await establishRecoverySession(client, { requested: true, code: "one-time-code", legacy: false }), session);
  assert.equal(exchanged, "one-time-code"); assert.equal(unsubscribed, true);
});

test("legacy recovery establishes a session and invalid or expired links remain neutral", async () => {
  const { establishRecoverySession } = await loadRecoveryModule(); let supplied;
  const client = { auth: {
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    async setSession(tokens) { supplied = tokens; return { data: { session: { user: { id: "user-id" } } }, error: null }; }
  } };
  await establishRecoverySession(client, { requested: true, legacy: true, accessToken: "a", refreshToken: "r" });
  assert.deepEqual(supplied, { access_token: "a", refresh_token: "r" });
  await assert.rejects(establishRecoverySession(client, { requested: true }), { message: "RECOVERY_INVALID" });
  assert.match(app, /invalid, expired or has already been used/); assert.match(app, /Request another recovery email/);
  assert.doesNotMatch(app, /console\.(?:log|warn|error)/);
});

test("recovery form validates matching strong passwords and updates only through the recovery session", () => {
  assert.match(app, /Create new password/); assert.match(app, /Confirm new password/); assert.match(app, /password-toggle/);
  assert.match(app, /password!==confirmation/); assert.match(app, /password\.length<12/); assert.match(app, /await authService\.updatePassword\(password\)/);
  const recoveryHandler = app.slice(app.indexOf("async function processRecoveryCallback"), app.indexOf("function renderRecoveryInvalid"));
  assert.ok(recoveryHandler.indexOf("await authService.establishRecovery(recovery)") < recoveryHandler.indexOf("history.replaceState"), "callback is exchanged before browser history is cleaned");
  assert.match(app, /Password updated successfully\. Sign in with your new password/);
});

test("recovery links preserve the active deployment path without hardcoding GitHub Pages", () => {
  assert.match(app, /const recoveryUrl = new URL\("\/app\/", location\.origin\)/);
  assert.match(app, /recoveryUrl\.searchParams\.set\("recovery", "1"\)/);
  assert.match(app, /resetPassword[^\n]+recoveryUrl\.toString\(\)/);
  assert.doesNotMatch(app, /location\.origin\}\/skillward-training\/\?recovery=1/);
});

test("production recovers legacy cached callback paths before relative assets load", () => {
  assert.match(index, /location\.pathname\.startsWith\("\/skillward-training\/"\)/);
  assert.match(index, /location\.replace\(`\/app\/\$\{location\.search\}\$\{location\.hash\}`\)/);
  assert.match(appIndex, /\.\.\/app\.js\?v=20260825-phase7-security-ops-1/);
  assert.ok(index.indexOf("location.replace") < index.indexOf("marketing.css"), "legacy callback redirects before public assets load");
});

test("role routing covers Management, learners, managers and trainers", () => {
  for (const role of ["SkillWard Super Administrator", "Organisation Administrator", "Facility Administrator", "Department Manager", "Content Administrator/Educator", "PCA", "Cleaner", "Support Worker", "PCA Trainer", "Cleaner Trainer"]) assert.match(auth + app, new RegExp(role));
  assert.match(app, /departments\.length>1/); assert.match(app, /No assigned department/);
});

test("multi-organisation workspace switching never derives authorization from browser state", () => {
  for (const text of ["organizationWorkspace", "switchOrganization", "organization_id", "Each workspace has separate facilities, departments and records"]) assert.match(app + auth + database, new RegExp(text));
  assert.doesNotMatch(auth, /user_metadata|raw_user_meta_data|localStorage/);
  assert.match(database, /memberships\.find\(item => item\.organization_id === requestedOrganizationId\)/);
});

test("platform administrators can explicitly switch out of an organisation workspace", () => {
  assert.match(auth, /PLATFORM_WORKSPACE_ID = "__skillward_platform__"/);
  assert.match(auth, /organizationId === PLATFORM_WORKSPACE_ID/);
  assert.match(auth, /memberships: \[\]/);
  assert.match(auth, /\.\.\.context,\s+memberships: currentMemberships,/);
  assert.match(auth, /destination: organizationId === PLATFORM_WORKSPACE_ID \? "platform" : "organization"/);
  assert.match(app, /SkillWardServices\?\.PLATFORM_WORKSPACE_ID/);
  assert.match(app, /authService\.switchOrganization\(event\.target\.value\)/);
  assert.doesNotMatch(app, /event\.target\.value \? await authService\.switchOrganization/);
});

test("database context selects only an active requested membership", async () => {
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(database).toString("base64")}#workspace`;
  const { SkillWardDatabaseService } = await import(moduleUrl);
  const user = { id: "multi-user" };
  const rows = {
    user_profiles: { user_id:user.id, full_name:"Multi Member", account_status:"Active", active_organization_id:"org-a" },
    skillward_administrators: null,
    organization_memberships: [
      { user_id:user.id, organization_id:"org-a", role:"PCA", membership_status:"Active", organizations:{ id:"org-a", name:"Organisation A" } },
      { user_id:user.id, organization_id:"org-b", role:"Cleaner", membership_status:"Active", organizations:{ id:"org-b", name:"Organisation B" } }
    ],
    facility_assignments: [], department_assignments: [], facilities: [], departments: [], training_assignments: [], competency_records: [], notifications: []
  };
  const client = { from(table) { const query = { select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; }, gt() { return query; }, maybeSingle() { return Promise.resolve({ data: rows[table] ?? null, error:null }); }, then(resolve) { return Promise.resolve({ data: rows[table] ?? [], error:null }).then(resolve); } }; return query; } };
  const context = await new SkillWardDatabaseService(client).loadSessionContext(user, "org-b");
  assert.equal(context.organization.id, "org-b");
  assert.equal(context.membership.role, "Cleaner");
  assert.equal(context.memberships.length, 2);
});

test("organisation and platform setup writes remain behind the RLS database boundary", () => {
  for (const action of ["createOrganization", "archiveOrganization", "updateOrganizationBranding", "createFacility", "createDepartment", "inviteOrganizationMember", "authorizeSupportAccess", "activateSupportSession"]) assert.match(app + database, new RegExp(action));
  assert.doesNotMatch(app + database, /service_role|auth\.admin/);
});

test("authenticated learner workspace renders database assignments without Demo Mode records", () => {
  for (const text of ["Assigned pathways", "Unread notifications", "Competency records", "training_pathways", "progress_percentage", "authenticatedDepartment"]) assert.match(app + database, new RegExp(text));
  assert.match(app, /c\.trainingAssignments\.filter/);
  assert.match(app, /c\.moduleProgress\.filter/);
});

test("authenticated trainer workspace uses assigned database trainees and protected writes", () => {
  for (const text of ["traineeProfiles", "practicalObservations", "signoffRecommendations", "recordPracticalObservation", "submitSignoffRecommendation", "Assigned trainees", "Record observation", "Send to Management"]) assert.match(app + database, new RegExp(text));
  assert.match(database, /trainerAssignments\.find/);
  assert.match(database, /TRAINER_ACTION_INVALID/);
  assert.match(read("supabase/migrations/202608140001_trainer_workspace_access.sql"), /trainer_user_id = auth\.uid\(\)/);
});

test("Pages workflow uses repository path, validates only public config and gates deploy", () => {
  const workflow = read(".github/workflows/pages.yml"), runtime = read("runtime-config.js");
  assert.match(workflow, /branches: \[main\]/); assert.match(workflow, /needs: test/);
  assert.match(workflow, /Required SUPABASE_URL is missing/); assert.match(workflow, /Required SUPABASE_ANON_KEY is missing/);
  assert.match(read("docs/authentication.md"), /https:\/\/haalukaa\.github\.io\/skillward-training\/\?recovery=1/);
  assert.doesNotMatch(runtime + read("src/supabase-client.js"), /service.role|service_role|postgres(?:ql)?:\/\//i);
});

test("local Supabase workflows suppress generated keys and redact failure output", () => {
  const workflows = [
    read(".github/workflows/phase1-local-browser-verification.yml"),
    read(".github/workflows/supabase-database.yml")
  ];
  for (const workflow of workflows) {
    assert.doesNotMatch(workflow, /run:\s*supabase start/);
    assert.match(workflow, /supabase start > "\$startup_log" 2>&1/);
    assert.match(workflow, /REDACTED_LOCAL_KEY/);
    assert.match(workflow, /REDACTED_JWT/);
  }
});

test("invitation UI uses a protected Edge Function boundary rather than browser Admin Auth", () => {
  assert.match(app + database, /invite-organization-member/);
  assert.match(invitationFunction, /callerClient\.auth\.getUser/);
  assert.match(invitationFunction, /serviceClient\.auth\.admin\.inviteUserByEmail/);
  assert.doesNotMatch(app + invitationSource + database, /auth\.admin|inviteUserByEmail/);
});

test("invitation delivery uses the canonical production origin for CORS and email redirects", () => {
  const configuredOrigins = invitationFunction.match(/Deno\.env\.get\("PUBLIC_SITE_[A-Z]+"\)/g) || [];
  assert.deepEqual([...new Set(configuredOrigins)], ['Deno.env.get("PUBLIC_SITE_ORIGIN")']);
  assert.match(invitationFunction, /url\.pathname = "\/app\/"/);
  assert.match(invitationFunction, /url\.search = "\?invitation=1"/);
});

test("invitation service has explicit minimum setup grants", () => {
  for (const table of ["user_profiles", "organization_staff_profiles", "organization_memberships", "facility_assignments", "department_assignments"]) {
    assert.match(authMigration, new RegExp(`public\\.${table}`));
  }
  assert.match(authMigration, /grant select, update on table public\.organization_invitations to service_role/);
  assert.match(authMigration, /grant select on table public\.departments to service_role/);
  assert.match(authMigration, /grant insert on table public\.audit_logs to service_role/);
});

test("invitation callbacks support PKCE, legacy links and neutral invalid states", async () => {
  const { parseInvitationCallback, establishInvitationSession } = await loadInvitationModule();
  const pkce = parseInvitationCallback("https://example.test/app/?invitation=1&code=one-time");
  assert.equal(pkce.requested, true); assert.equal(pkce.code, "one-time");
  const legacy = parseInvitationCallback("https://example.test/app/?invitation=1#access_token=a&refresh_token=r&type=invite");
  assert.equal(legacy.legacy, true);
  const existing = parseInvitationCallback("https://example.test/app/?invitation=1#access_token=a&refresh_token=r&type=magiclink");
  assert.equal(existing.requested, true); assert.equal(existing.legacy, true);
  const client = { auth: { async exchangeCodeForSession(code) { return { data:{ session:{ user:{ id:code } } }, error:null }; } } };
  assert.equal((await establishInvitationSession(client, pkce)).user.id, "one-time");
  await assert.rejects(establishInvitationSession(client, { requested:true, errorCode:"otp_expired" }), { message:"INVITATION_INVALID" });
});

test("automatic entry resolution excludes expired memberships and requires a chooser for multiple organisations", () => {
  assert.match(auth, /membership_expires_at/);
  assert.match(auth, /entryState: "workspace-choice"/);
  assert.match(auth, /entryState: "invitation"/);
  assert.match(auth, /setupInvitation\.invitation_state !== "Accepted"/);
  assert.match(auth, /currentMemberships\.length > 1/);
  assert.doesNotMatch(auth, /user_metadata|raw_user_meta_data/);
});

test("authentication migration forces RLS and exposes only controlled RPCs", () => {
  for (const table of ["skillward_feature_flags", "organization_auth_settings", "authentication_audit_events"]) {
    assert.match(authMigration, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.match(authMigration, /alter table private\.legacy_content_mappings force row level security/);
  assert.match(authMigration, /membership_expires_at > now\(\)/);
  assert.match(authMigration, /revoke all on function public\.complete_organization_invitation/);
  assert.match(authMigration, /grant execute on function public\.complete_organization_invitation[^;]+to authenticated/);
});
