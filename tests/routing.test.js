const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const dataSource = fs.readFileSync(path.join(projectRoot, "data.js"), "utf8");
const appSource = fs.readFileSync(path.join(projectRoot, "app.js"), "utf8");

function renderForRole(role, selectedDepartment = null) {
  const app = { innerHTML: "" };
  const savedState = JSON.stringify({ currentUser: { name: "Test User", role }, selectedDepartment });
  const context = {
    alert() {},
    console,
    document: {
      getElementById(id) {
        return id === "app" ? app : { addEventListener() {} };
      },
      querySelectorAll() {
        return [];
      }
    },
    localStorage: {
      getItem() {
        return savedState;
      },
      setItem() {}
    },
    setTimeout,
    window: {}
  };

  vm.createContext(context);
  vm.runInContext(dataSource, context);
  Object.assign(context, context.window);
  vm.runInContext(appSource, context);

  return app.innerHTML;
}

test("PCA, Cleaner and Management users are sent to department selection", () => {
  for (const role of ["pca", "cleaner", "management"]) {
    assert.match(renderForRole(role), /Choose your department/);
  }
});

test("both trainer roles continue directly to their dashboards", () => {
  assert.match(renderForRole("pca-trainer"), /Trainer Dashboard/);
  assert.match(renderForRole("cleaner-trainer"), /Cleaner Trainer Workspace/);
});

test("management receives a read-only dashboard for only the selected department", () => {
  const html = renderForRole("management", "day-surgery");
  assert.match(html, /Day Surgery/);
  assert.match(html, /View only/);
  assert.match(html, /Total PCA staff/);
  assert.match(html, /Total Cleaner staff/);
  assert.match(html, /PCA Trainers/);
  assert.match(html, /Cleaner Trainer/);
  assert.match(html, /Completed training/);
  assert.match(html, /TRAINING PROGRESS/);
  assert.match(html, /Overdue training/);
  assert.match(html, /Pending competency sign-offs/);
  assert.match(html, /Compliance alerts/);
  assert.match(html, /Individual staff records/);
  assert.match(html, /Switch Department/);
  assert.doesNotMatch(html, /Emergency Department/);
  assert.doesNotMatch(html, /open-module|signoffBtn|Complete sign-off/);
});

test("authenticated navigation has exactly four primary destinations", () => {
  const html = renderForRole("management", "operating-theatre");
  for (const label of ["Home", "Training", "Staff", "Reports"]) assert.match(html, new RegExp(`>${label}<`));
  assert.equal((html.match(/class="side-nav"/g) || []).length, 1);
  assert.equal((html.match(/class="bottom-nav"/g) || []).length, 1);
});

test("legacy trainer sessions continue directly to the PCA trainer dashboard", () => {
  assert.match(renderForRole("trainer"), /Trainer Dashboard/);
});
