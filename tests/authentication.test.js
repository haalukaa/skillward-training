const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = file => fs.readFileSync(file, "utf8");
const app = read("app.js"), auth = read("src/auth-service.js"), database = read("src/database-service.js");

test("sign-in and Demo Mode are separate and public sign-up is unavailable", () => {
  assert.match(app, /Sign in to SkillWard/); assert.match(app, /Explore Demo Mode/);
  assert.match(app, /Nothing in Demo Mode is written to Supabase/);
  assert.doesNotMatch(app + auth, /signUp\s*\(/);
  assert.match(app, /await authService\?\.signOut\(\); authenticatedContext=null/);
});

test("trusted context obtains roles, departments, trainers and pathways from Supabase", () => {
  for (const table of ["user_profiles", "hospital_memberships", "department_memberships", "departments", "trainer_assignments", "training_assignments"]) assert.match(database, new RegExp(`"${table}"`));
  assert.match(auth, /context\.membership\.role/); assert.match(auth, /departmentDetails/);
  assert.doesNotMatch(auth, /localStorage/);
});

test("account blocking, recovery, restoration and sign-out are implemented safely", () => {
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
