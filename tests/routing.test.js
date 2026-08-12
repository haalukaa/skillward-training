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

test("PCA, Cleaner and Management retain department selection", () => {
  for (const role of ["pca", "cleaner", "management"]) assert.match(session(role).html, /Choose your department/);
});

test("trainer roles route to role-specific, assigned-department dashboards", () => {
  const pca = session("pca-trainer").html;
  assert.match(pca, /PCA Trainer Dashboard/); assert.match(pca, /Operating Theatre &amp; Recovery/); assert.match(pca, /Day Surgery/); assert.doesNotMatch(pca, /Gastro/); assert.doesNotMatch(pca, /Cleaner trainees/);
  const cleaner = session("cleaner-trainer").html;
  assert.match(cleaner, /Cleaner Trainer Dashboard/); assert.match(cleaner, /Gastro/); assert.doesNotMatch(cleaner, /Day Surgery/); assert.doesNotMatch(cleaner, /PCA trainees/);
});

test("an unassigned trainer URL department is replaced with an assigned department", () => {
  const result = session("pca-trainer", "emergency-department");
  assert.equal(result.saved().selectedDepartment, "operating-theatre");
  assert.doesNotMatch(result.html, /Emergency Department Training Hub/);
});

test("management dashboard stays department scoped and provides trainer assignments and final approval", () => {
  const html = session("management", "day-surgery").html;
  for (const text of ["Day Surgery", "Department assignments", "PCA Trainer", "Cleaner Trainer", "Sign-off recommendations", "Approve", "Request reassessment", "Management feedback", "Training content coming soon"]) assert.match(html, new RegExp(text));
  assert.match(html, /Hospital-wide workspace|Emergency Department/); assert.doesNotMatch(html, /open-module|Complete sign-off/);
});

test("known Department Manager direct navigation is safely restricted", () => {
  const result = session("management", "gastro", "Priya Nair");
  assert.equal(result.saved().selectedDepartment, "operating-theatre");
  assert.doesNotMatch(result.html, /option value="gastro"/);
  assert.match(result.html, /Assigned departments only/);
});

test("management directory exposes filters, bulk confirmation, profiles and read-only audit", () => {
  const html = session("management", "operating-theatre").html;
  for (const text of ["STAFF DIRECTORY", "Name, employee ID or email", "All roles", "All departments", "All account statuses", "All employment statuses", "All competencies", "Bulk action", "Audit history", "Read only", "Demonstration mode"]) assert.match(html, new RegExp(text));
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
  assert.match(session("learner", "operating-theatre").html, /MY LEARNING/);
  assert.match(session("trainer").html, /PCA Trainer Dashboard/);
});

test("landing content and mobile full-name field remain present", () => {
  const html = session(null).html;
  assert.match(html, /Build Your Confidence/); assert.match(html, /Before Your First Shift/); assert.match(html, /hero-motion/); assert.match(html, /Get Started/); assert.match(html, /login-flip/); assert.match(html, /id="nameInput" type="text"/);
});

test("authenticated navigation retains desktop and mobile destinations", () => {
  const html = session("management", "operating-theatre").html;
  assert.equal((html.match(/class="side-nav"/g) || []).length, 1); assert.equal((html.match(/class="bottom-nav"/g) || []).length, 1);
  for (const label of ["Home", "Training", "Staff", "Reports"]) assert.match(html, new RegExp(`>${label}<`));
});
