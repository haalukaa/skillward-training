const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const appSource = fs.readFileSync("app.js", "utf8");
const demoSource = fs.readFileSync("demo-data.js", "utf8");
const stylesSource = fs.readFileSync("styles.css", "utf8");

function loadDemoData() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(demoSource, context);
  return context.window.SKILLWARD_DEMO_SECTORS;
}

test("Guided Demo activates Hospital, Aged Care and Disability Support", () => {
  const sectors = loadDemoData();
  assert.deepEqual(Object.keys(sectors), ["hospital", "aged-care", "disability"]);
  for (const sector of Object.values(sectors)) {
    assert.ok(sector.organization);
    assert.ok(sector.facility);
    assert.ok(sector.departments.length >= 2);
    assert.ok(sector.roles.some(role => role.kind === "worker"));
    assert.ok(sector.roles.some(role => role.kind === "trainer"));
    assert.ok(sector.roles.some(role => role.kind === "management"));
    assert.ok(sector.pathway.modules.length >= 4);
    assert.ok(sector.people.length >= 4);
  }
  assert.doesNotMatch(appSource, /id="selectAgedCare"[^>]*disabled/);
  assert.doesNotMatch(appSource, /id="selectDisability"[^>]*disabled/);
});

test("Management navigation renders four separate functional views", () => {
  for (const label of ["MANAGEMENT HOME", "TRAINING", "STAFF", "REPORTS"]) assert.match(appSource, new RegExp(label));
  for (const action of ["approveDemoCompetency", "scheduleDemoRenewal", "demoStaffSearch", "assignDemoPathway"]) assert.match(appSource, new RegExp(action));
  assert.match(appSource, /state\.activeWorkspaceView = button\.dataset\.nav/);
  assert.match(appSource, /renderDemoWorkspace\(\)/);
});

test("profile control separates Profile, Workspace and Sign Out", () => {
  for (const action of ["profile", "workspace", "signout"]) assert.match(appSource, new RegExp(`data-profile-action="${action}"`));
  assert.match(appSource, /openProfileDialog/);
  assert.match(appSource, /signOutCurrentUser/);
  assert.doesNotMatch(appSource, /id="switchRoleBtn"/);
  assert.match(stylesSource, /\.profile-menu/);
  assert.match(stylesSource, /\.profile-dialog-backdrop/);
});

test("browser titles and complete competency lifecycle are implemented", () => {
  assert.match(appSource, /document\.title = user \?/);
  assert.match(appSource, /Sign In \| SkillWard/);
  for (const stage of ["Learn", "Validate", "Observe", "Approve", "Renew"]) assert.match(appSource, new RegExp(`\\["${stage}"`));
  for (const state of ["learnedModules", "validated", "observed", "approved", "renewalScheduled"]) assert.match(appSource, new RegExp(state));
});

test("Canvas demo layout includes responsive navigation and workflow", () => {
  assert.match(stylesSource, /grid-template-columns:\s*repeat\(var\(--nav-count\)/);
  assert.match(stylesSource, /\.demo-workflow-steps/);
  assert.match(stylesSource, /@media \(max-width: 900px\)[\s\S]*\.demo-workflow-steps\s*\{\s*grid-template-columns:\s*1fr/s);
  assert.match(stylesSource, /@media \(max-width: 560px\)[\s\S]*\.authenticated-shell \.profile-button/s);
});
