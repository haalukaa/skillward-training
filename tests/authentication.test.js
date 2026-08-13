const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = file => fs.readFileSync(file, "utf8");
const app = read("app.js"), auth = read("src/auth-service.js"), database = read("src/database-service.js");

test("sign-in and Demo Mode are separate and public sign-up is unavailable", () => {
  assert.match(app, /Sign in to SkillWard/); assert.match(app, /Explore Demo/);
  assert.match(app, /never sent to Supabase/);
  assert.doesNotMatch(app + auth, /signUp\s*\(/);
  assert.match(app, /await authService\?\.signOut\(\); authenticatedContext=null/);
});

test("premium authentication states are accessible and safely navigable", () => {
  for (const text of ["Get Started", "Welcome back", "Explore SkillWard", "← Back", "← Back to Sign In", "Show password", "aria-live", "autocomplete=\"current-password\""]) assert.match(app, new RegExp(text));
  assert.doesNotMatch(app, /class="typing-cursor"/);
  assert.match(app, /document\.getElementById\("passwordInput"\)\.value=""/);
  assert.match(app, /button\.disabled=true/);
});

test("authentication card remains visible independent of configuration and restoration", () => {
  assert.match(app, /class="card login-card auth-card" id="workspaceCard"/);
  assert.match(app, /renderLogin\("Checking for an existing session…"\);[\s\S]*await authService\.restore\(\)/);
  assert.match(app, /CONFIGURATION_MISSING/);
  assert.match(app, /history\.replaceState\(\{ signedOut: true \}[\s\S]*renderLogin\(\)/);
  const styles = read("styles.css");
  assert.match(styles, /\.auth-card\s*\{[\s\S]*transform: none;[\s\S]*pointer-events: auto;/);
  assert.match(styles, /@media \(max-width: 800px\)/);
  assert.match(styles, /@media \(max-width: 560px\)/);
});

test("entry, sign-in, demo, recovery and password update share the authentication card", () => {
  assert.match(app, /authenticationLayout\(`/);
  for (const id of ["entryOptions", "signInForm", "demoForm", "resetForm", "updatePasswordForm"]) assert.match(app, new RegExp(`id="${id}"`));
  assert.match(app, /backChoices/);
  assert.match(app, /id="backToSignIn"/);
  assert.match(app, /id="passwordBack"/);
});

test("authentication controls and laptop layout are compact and consistent", () => {
  const styles = read("styles.css");
  for (const id of ["emailInput", "passwordInput", "nameInput", "resetEmail", "newPassword", "confirmPassword"]) {
    assert.match(app, new RegExp(`class="auth-control" id="${id}"`));
  }
  assert.match(styles, /\.auth-control, \.password-field[\s\S]*width: 100%;[\s\S]*max-width: none;/);
  assert.match(styles, /\.auth-control \{[\s\S]*height: 46px;[\s\S]*border: 1px solid/);
  assert.match(styles, /\.signed-out-shell \.page[\s\S]*padding-top: 0;[\s\S]*padding-bottom: 0;/);
  assert.match(styles, /@media \(min-width: 801px\) and \(max-height: 780px\)/);
  assert.doesNotMatch(app.match(/function renderLogin[\s\S]*?function renderAuthenticatedWorkspace/)[0], /get-started-logo|logo-shield/);
  assert.doesNotMatch(app, /INVALID_CREDENTIALS[^\n]*authError/);
});

test("authenticated REST-style context loads its permitted profile, membership and routing data", async () => {
  for (const table of ["user_profiles", "hospital_memberships", "department_memberships", "departments", "trainer_assignments", "training_assignments"]) assert.match(database, new RegExp(`"${table}"`));
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

test("role routing covers Management, learners, managers and trainers", () => {
  for (const role of ["Hospital Administrator", "Department Manager", "PCA", "Cleaner", "PCA Trainer", "Cleaner Trainer"]) assert.match(auth + app, new RegExp(role));
  assert.match(app, /departments\.length>1/); assert.match(app, /No assigned department/);
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
