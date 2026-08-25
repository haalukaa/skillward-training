const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = file => fs.readFileSync(file, "utf8");
const manifest = JSON.parse(read("manifest.webmanifest"));
const worker = read("service-worker.js");
const controller = read("pwa-controller.js");
const offline = read("offline.html");
const app = read("app.js");
const appIndex = read("app/index.html");
const build = read("scripts/build.mjs");
const styles = read("styles.css");

test("Phase 8 is an installable standalone SkillWard PWA", () => {
  assert.equal(manifest.id, "/app/");
  assert.equal(manifest.start_url, "/app/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.prefer_related_applications, false);
  assert.ok(manifest.icons.some(icon => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some(icon => icon.sizes === "512x512" && icon.purpose.includes("maskable")));
  assert.deepEqual(manifest.shortcuts.map(shortcut => shortcut.url), ["/app/?view=work", "/app/?view=training", "/demo/"]);
  assert.match(appIndex, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(appIndex, /apple-mobile-web-app-capable/);
  assert.match(appIndex, /mobile-web-app-capable/);
});

test("offline behavior exposes only a non-sensitive reconnect shell", () => {
  for (const asset of ["/offline.html", "/manifest.webmanifest", "/skillward-app-icon.svg", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png"]) assert.match(worker, new RegExp(asset.replaceAll("/", "\\/")));
  assert.doesNotMatch(worker, /runtime-config|auth-bundle|app\.js|data\.js|management-data|\/rest\/v1|\/auth\/v1|competency/i);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /fetch\(request, \{ cache:"no-store" \}\)/);
  assert.match(offline, /deliberately does not store organisation, competency or evidence records/);
  assert.match(offline, /Reconnect to SkillWard/);
});

test("updates, installation and future push subscriptions require explicit user action", () => {
  assert.match(controller, /beforeinstallprompt/);
  assert.match(controller, /SKILLWARD_UPDATE_READY/);
  assert.match(controller, /SKILLWARD_SKIP_WAITING/);
  assert.match(controller, /On iPhone or iPad, open Share and choose Add to Home Screen/);
  assert.match(controller, /pushReadiness\(\)/);
  assert.match(controller, /PUSH_CONFIGURATION_REQUIRED/);
  const subscribe = controller.slice(controller.indexOf("async subscribeToPush"));
  assert.match(subscribe, /Notification\.requestPermission\(\)/);
  assert.doesNotMatch(controller.slice(0, controller.indexOf("async subscribeToPush")), /Notification\.requestPermission\(\)/);
});

test("authenticated browser persistence contains selectors, never organisation records", () => {
  const save = app.slice(app.indexOf("function saveState"), app.indexOf("function getModuleState"));
  assert.match(save, /activeOrganizationId/);
  assert.match(save, /activeWorkspaceView/);
  assert.match(save, /demoSession \? state : safeWorkspaceState/);
  for (const sensitive of ["phase6Filters", "phase7OrganizationId", "selectedLearningPathwayId", "selectedLearningVersionId", "traineeRecords", "managementData"]) assert.doesNotMatch(save, new RegExp(sensitive));
  assert.match(app, /"work", "security"/);
});

test("build and responsive presentation include every Phase 8 asset", () => {
  for (const file of ["manifest.webmanifest", "service-worker.js", "pwa-controller.js", "offline.html", "icon-192.png", "icon-512.png"]) assert.match(build, new RegExp(file.replace(".", "\\.")));
  assert.match(styles, /min-height:48px/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /@media\(display-mode:standalone\)/);
});
