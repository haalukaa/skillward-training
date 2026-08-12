const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const dataSource = fs.readFileSync(path.join(projectRoot, "data.js"), "utf8");
const appSource = fs.readFileSync(path.join(projectRoot, "app.js"), "utf8");

function renderForRole(role) {
  const app = { innerHTML: "" };
  const savedState = JSON.stringify({ currentUser: { name: "Test User", role } });
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

test("PCA and Cleaner users are sent to department selection", () => {
  for (const role of ["pca", "cleaner"]) {
    assert.match(renderForRole(role), /Choose your department/);
  }
});

test("trainer and management users are sent directly to their dashboards", () => {
  assert.match(renderForRole("pca-trainer"), /Trainer Dashboard/);
  assert.match(renderForRole("cleaner-trainer"), /Cleaner Trainer Workspace/);
  assert.match(renderForRole("management"), /Workforce training at a glance/);
});

test("management receives a read-only, all-department reporting dashboard", () => {
  const html = renderForRole("management");
  assert.match(html, /Workforce training at a glance/);
  assert.match(html, /Read-only workforce reporting/);
  assert.match(html, /Operating Theatre &amp; Recovery/);
  assert.match(html, /Emergency Department/);
  assert.match(html, /Pending sign-offs/);
  assert.match(html, /Alerts requiring attention/);
  assert.doesNotMatch(html, /open-module|signoffBtn|Complete sign-off/);
});

test("legacy trainer sessions continue directly to the PCA trainer dashboard", () => {
  assert.match(renderForRole("trainer"), /Trainer Dashboard/);
});
