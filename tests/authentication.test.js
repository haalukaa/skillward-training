const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = file => fs.readFileSync(file, "utf8");
const app = read("app.js"), auth = read("src/auth-service.js"), database = read("src/database-service.js");
const recoverySource = read("src/recovery-service.js");

async function loadRecoveryModule() {
  return import(`data:text/javascript;base64,${Buffer.from(recoverySource).toString("base64")}#${Math.random()}`);
}

test("sign-in and Demo Mode are separate and public sign-up is unavailable", () => {
  assert.match(app, /Sign in to SkillWard/); assert.match(app, /Explore Demo Mode/);
  assert.match(app, /Nothing in Demo Mode is written to Supabase/);
  assert.doesNotMatch(app + auth, /signUp\s*\(/);
  assert.match(app, /await authService\?\.signOut\(\); authenticatedContext=null/);
});

test("authenticated REST-style context loads its permitted profile, membership and routing data", async () => {
  for (const table of ["user_profiles", "hospital_memberships", "department_memberships", "departments", "trainer_assignments", "training_assignments", "module_progress", "competency_records", "notifications"]) assert.match(database, new RegExp(`"${table}"`));
  assert.match(auth, /context\.membership\.role/); assert.match(auth, /departmentDetails/);
  assert.doesNotMatch(auth, /localStorage/);
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(database).toString("base64")}`;
  const { SkillWardDatabaseService } = await import(moduleUrl);
  const user = { id: "admin-user" };
  const rows = {
    user_profiles: { user_id: user.id, full_name: "Development Administrator", account_status: "Active" },
    hospital_memberships: { user_id: user.id, role: "Hospital Administrator", account_status: "Active" },
    department_memberships: [],
  };
  const client = {
    from(table) {
      const result = () => ({ data: rows[table] ?? [], error: null });
      const query = {
        select() { return query; }, eq() { return query; }, in() { return query; },
        maybeSingle() { return Promise.resolve(result()); },
        then(resolve) { return Promise.resolve(result()).then(resolve); },
      };
      return query;
    },
  };

  const context = await new SkillWardDatabaseService(client).loadSessionContext(user);
  assert.equal(context.profile.user_id, user.id);
  assert.equal(context.membership.user_id, user.id);
  assert.equal(context.membership.role, "Hospital Administrator");
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
  assert.ok(app.indexOf("await authService.establishRecovery(recovery)") < app.indexOf("history.replaceState"), "callback is exchanged before browser history is cleaned");
  assert.match(app, /Password updated successfully\. Sign in with your new password/);
});

test("role routing covers Management, learners, managers and trainers", () => {
  for (const role of ["Hospital Administrator", "Department Manager", "PCA", "Cleaner", "PCA Trainer", "Cleaner Trainer"]) assert.match(auth + app, new RegExp(role));
  assert.match(app, /departments\.length>1/); assert.match(app, /No assigned department/);
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

test("invitation UI uses a protected-service boundary rather than Admin Auth", () => {
  const invitation = read("src/invitation-service.js");
  assert.match(app, /InvitationService/); assert.match(invitation, /protected Management service/);
  assert.doesNotMatch(app + invitation, /auth\.admin|inviteUserByEmail/);
});
