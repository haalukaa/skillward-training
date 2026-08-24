const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dataSource = fs.readFileSync(path.join(root, "data.js"), "utf8");
const managementDataSource = fs.readFileSync(path.join(root, "management-data.js"), "utf8");
const managementSource = fs.readFileSync(path.join(root, "management.js"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function session(role, selectedDepartment = null, name = "Test User", extra = {}) {
  const app = { innerHTML: "" };
  let saved = JSON.stringify({ currentUser: role ? { name, role } : null, selectedDepartment, ...extra });
  const elements = new Map();
  const dummy = () => ({ addEventListener() {}, classList: { add() {} }, setAttribute() {}, removeAttribute() {}, scrollIntoView() {}, value: "all", hidden: false });
  const context = { alert() {}, confirm() { return true; }, console, document: { getElementById(id) { if (id === "app") return app; if (!elements.has(id)) elements.set(id, dummy()); return elements.get(id); }, querySelectorAll() { return []; } }, localStorage: { getItem() { return saved; }, setItem(_key, value) { saved = value; } }, setTimeout, window: {} };
  vm.createContext(context);
  vm.runInContext(dataSource, context); vm.runInContext(managementDataSource, context); vm.runInContext(managementSource, context); Object.assign(context, context.window); vm.runInContext(appSource, context);
  return { html: app.innerHTML, context, saved: () => JSON.parse(saved) };
}

test("only PCA and Cleaner retain department selection", () => {
  for (const role of ["pca", "cleaner"]) assert.match(session(role).html, /Choose your department/);
  const management = session("management");
  assert.doesNotMatch(management.html, /Choose your department/);
  assert.match(management.html, /Management Dashboard/);
  assert.equal(management.saved().selectedDepartment, "operating-theatre");
});

test("trainer roles route to role-specific, assigned-department dashboards", () => {
  const pca = session("pca-trainer").html;
  assert.match(pca, /PCA Trainer Workspace/); assert.match(pca, /Operating Theatre &amp; Recovery/); assert.match(pca, /Day Surgery/); assert.doesNotMatch(pca, /Gastro/); assert.doesNotMatch(pca, /Cleaner trainees/);
  const cleaner = session("cleaner-trainer").html;
  assert.match(cleaner, /Cleaner Trainer Workspace/); assert.match(cleaner, /Gastro/); assert.doesNotMatch(cleaner, /Day Surgery/); assert.doesNotMatch(cleaner, /PCA trainees/);
});

test("an unassigned trainer URL department is replaced with an assigned department", () => {
  const result = session("pca-trainer", "emergency-department");
  assert.equal(result.saved().selectedDepartment, "operating-theatre");
  assert.doesNotMatch(result.html, /Emergency Department Training Hub/);
});

test("management dashboard stays department scoped and provides trainer assignments and final approval", () => {
  const html = session("management", "day-surgery").html;
  for (const text of ["Day Surgery", "Staff department assignments", "Trainer department assignments", "Staff-to-trainer assignments", "PCA Trainer", "Cleaner Trainer", "Sign-off recommendations", "Approve", "Request reassessment", "Management feedback", "Training content coming soon"]) assert.match(html, new RegExp(text));
  assert.match(html, /Hospital-wide workspace|Emergency Department/); assert.doesNotMatch(html, /open-module|Complete sign-off/);
});

test("known Department Manager direct navigation is safely restricted", () => {
  const result = session("management", "gastro", "Priya Nair");
  assert.equal(result.saved().selectedDepartment, "operating-theatre");
  assert.doesNotMatch(result.html, /option value="gastro"/);
  assert.match(result.html, /Department management workspace/);
});

test("management directory exposes filters, bulk confirmation, profiles and read-only audit", () => {
  const html = session("management", "operating-theatre").html;
  for (const text of ["STAFF DIRECTORY", "Name, employee ID or email", "All roles", "All departments", "All account statuses", "All employment statuses", "All competencies", "Bulk action", "Audit history", "Read only"]) assert.match(html, new RegExp(text));
  assert.doesNotMatch(html, /Demonstration mode/);
});

test("trainer workspace includes monitoring, filters, profiles and assessment-only controls", () => {
  const html = session("pca-trainer").html;
  for (const text of ["Pending reviews", "Overdue training", "Search trainees", "All progress", "All due dates", "All reviews", "All sign-offs", "Submit recommendation", "Training content coming soon"]) assert.match(appSource + html, new RegExp(text));
  assert.doesNotMatch(html, /Department assignments|Management settings.*button|Edit training/);
});

test("all six workflow statuses and audit fields are implemented", () => {
  const combined = dataSource + appSource;
  for (const status of ["Not Started", "In Progress", "Ready for Trainer Review", "Sent to Management", "Approved", "Reassessment Required"]) assert.match(combined, new RegExp(status));
  for (const field of ["actor", "role", "action", "at", "detail", "previousStatus", "newStatus"]) assert.match(combined, new RegExp(field));
});

test("legacy learner and trainer sessions remain compatible", () => {
  assert.match(session("learner", "operating-theatre").html, /PCA Training Hub/);
  assert.match(session("trainer").html, /PCA Trainer Workspace/);
});

test("real-user entry is direct while Guided Demo remains a separate route", () => {
  const html = session(null).html;
  assert.match(html, /Sign in to your SkillWard workspace/); assert.match(html, /id="emailInput"/); assert.match(html, /id="passwordInput"/); assert.match(html, /Forgot Password/); assert.match(html, /href="\/demo\/"/);
  assert.doesNotMatch(html, /Choose your sector|Enter your workspace|Get Started|id="roleInput"/);
});

test("authenticated navigation retains desktop and mobile destinations", () => {
  const html = session("management", "operating-theatre").html;
  assert.equal((html.match(/class="side-nav"/g) || []).length, 1); assert.equal((html.match(/class="bottom-nav"/g) || []).length, 1);
  for (const label of ["Home", "Training", "Staff", "Reports"]) assert.match(html, new RegExp(`>${label}<`));
});

test("management presentation has no fictional hospital, separates IDs, and exposes every filter", () => {
  const html = session("management", "operating-theatre", "Unusual Demo Name").html;
  assert.doesNotMatch(html, /St Catherine|Hospital name:/i);
  assert.doesNotMatch(html, /SkillWard Hospital Administration|Hospital Administrator/);
  assert.equal((html.match(/Management Dashboard/g) || []).length, 1);
  assert.equal((html.match(/Hospital-wide workspace/g) || []).length, 1);
  assert.match(html, /class="role-pill">Management/);
  assert.match(html, /Alex Morgan<\/strong><small>EMP-1001/);
  assert.doesNotMatch(html, /Alex MorganEMP-1001/);
  for (const text of ["Trainer", "Manager", "Training progress", "Overdue status", "Review and apply"]) assert.match(html, new RegExp(text));
  assert.match(html, /Open profile menu for Unusual Demo Name/);
});

test("role and department headers are contextual", () => {
  assert.match(session("pca", "operating-theatre").html, /Operating Theatre &amp; Recovery · PCA Training Hub/);
  assert.match(session("cleaner", "operating-theatre").html, /Operating Theatre &amp; Recovery · Cleaner Training Hub/);
  assert.match(session("management", "day-surgery", "Priya Nair").html, /Day Surgery · Department management workspace/);
  assert.match(session("cleaner-trainer", "gastro").html, /Gastro · Cleaner Trainer Workspace/);
});

test("temporary text logo badges are absent while accessible shield placeholders remain", () => {
  const html = session("management", "operating-theatre").html;
  assert.doesNotMatch(html, />SW<|logo-letters/);
  assert.match(html, /<title>SkillWard<\/title>/);
});

test("trainer workspace has phone-width containment and card-style trainee records", () => {
  assert.match(stylesSource, /overflow-x:\s*hidden/);
  assert.match(stylesSource, /\.authenticated-shell \.page[^}]*min-width:\s*0/);
  assert.match(stylesSource, /\.trainer-filters\+ \.table-wrap table/);
  for (const label of ["Trainee", "Progress", "Latest result", "Sign-off", "Due"]) assert.match(stylesSource, new RegExp(`content:'${label}'`));
});

test("Phase 1 administration retains protected setup actions and phone-width stacking", () => {
  for (const text of ["Platform Administration", "Organisation workspace", "Create organisation", "Add a care location", "Add a department", "Authorise a verified support request"]) assert.match(appSource, new RegExp(text));
  assert.match(stylesSource, /\.admin-setup-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(stylesSource, /@media \(max-width: 800px\)[\s\S]*?\.admin-setup-grid\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(stylesSource, /@media \(max-width: 600px\)[\s\S]*?\.setup-form\s*\{\s*padding:/);
});

test("authenticated organisation administration uses separated Canvas-style destinations", () => {
  for (const destination of ["Home", "Pathways", "People", "Competency", "Reports", "Admin"]) {
    assert.match(appSource, new RegExp(`\\[\"[^\"]+\", \"${destination}\"`));
  }
  for (const heading of ["Training pathways", "People and permissions", "Assessment and assurance", "Readiness and compliance", "Organisation settings"]) {
    assert.match(appSource, new RegExp(heading));
  }
  assert.match(appSource, /class="admin-stepper"/);
  assert.match(appSource, /organizationSetupStep:\s*"identity"/);
  assert.match(stylesSource, /\.database-workspace \.side-nav\s*\{[^}]*width:\s*204px/s);
  assert.match(stylesSource, /\.database-workspace \.bottom-nav\s*\{[^}]*repeat\(var\(--nav-count\)/s);
  assert.match(stylesSource, /\.focused-form input:not\(\[type="color"\]\)[^}]*font-size:\s*16px/s);
});

test("Canvas workspace assets use a production cache version", () => {
  const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const appIndexSource = fs.readFileSync(path.join(root, "app", "index.html"), "utf8");
  assert.match(indexSource, /marketing\.css\?v=20260824-canvas-production-1/);
  assert.match(indexSource, /marketing\.js\?v=20260824-canvas-production-1/);
  assert.match(appIndexSource, /\.\.\/styles\.css\?v=20260824-platform-switch-1/);
  assert.match(appIndexSource, /\.\.\/app\.js\?v=20260824-platform-switch-1/);
});
