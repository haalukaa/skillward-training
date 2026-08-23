import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.SKILLWARD_PRODUCTION_URL || "https://skillwardtraining.com";
const expectedAssetVersion = "20260824-canvas-production-1";
const artifactsDirectory = "artifacts";

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForRelease() {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const response = await fetch(`${baseUrl}/app/?release-check=${Date.now()}`, { redirect: "follow" });
    const html = await response.text();
    if (response.ok && html.includes(expectedAssetVersion) && html.includes("demo-data.js")) return;
    if (attempt < 20) await delay(15_000);
  }
  throw new Error(`Production did not serve ${expectedAssetVersion} within five minutes.`);
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth + 1,
    `${label} overflows horizontally: ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px`
  );
}

async function switchWorkspace(page, sector, role) {
  await page.getByRole("button", { name: /Open profile menu/ }).click();
  await page.getByRole("menuitem", { name: /Workspace/ }).click();
  await page.locator("#demoWorkspaceSector").selectOption(sector);
  await page.locator("#demoWorkspaceRole").selectOption(role);
  await page.getByRole("button", { name: "Open workspace", exact: true }).click();
  await page.waitForFunction(() => document.title.startsWith("Home |"));
}

async function enterManagementDemo(page) {
  await page.goto(`${baseUrl}/demo/`, { waitUntil: "load" });
  for (const sector of ["Hospital", "Aged Care", "Disability Support"]) {
    const button = page.getByRole("button", { name: new RegExp(sector) });
    await button.waitFor({ state: "visible" });
    assert.equal(await button.isEnabled(), true, `${sector} must be selectable`);
  }
  await page.getByRole("button", { name: /Disability Support/ }).click();
  await page.getByRole("button", { name: /Explore Demo Mode/ }).click();
  await page.getByPlaceholder("e.g. Alex Smith").fill("Production QA");
  await page.locator("#roleInput").selectOption("management");
  await page.getByRole("button", { name: /Continue in Demo Mode/ }).click();
  await page.waitForFunction(() => document.title === "Home | Pathways Community Support | SkillWard");
}

async function verifyDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 936 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));

  await enterManagementDemo(page);
  const destinations = [];
  for (const [view, title] of [
    ["home", "Home"],
    ["training", "Training"],
    ["staff", "Staff"],
    ["reports", "Reports"]
  ]) {
    await page.locator(`.side-nav .workspace-nav-item[data-nav="${view}"]`).click();
    destinations.push(await page.locator("main h2").first().innerText());
    assert.equal(await page.title(), `${title} | Pathways Community Support | SkillWard`);
  }
  assert.equal(new Set(destinations).size, 4, "Management destinations must render different views");
  await assertNoHorizontalOverflow(page, "desktop Management reports");
  assert.deepEqual(errors, [], `Desktop console errors: ${errors.join(" | ")}`);
  await context.close();
}

async function verifyMobile(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));

  await page.goto(`${baseUrl}/demo/`, { waitUntil: "load" });
  await assertNoHorizontalOverflow(page, "mobile sector selection");
  await page.screenshot({ path: `${artifactsDirectory}/skillward-live-sectors-mobile.png`, fullPage: true });

  await enterManagementDemo(page);
  assert.equal(await page.locator(".bottom-nav").isVisible(), true, "Mobile navigation must be visible");
  assert.equal(await page.locator(".side-nav").isVisible(), false, "Desktop sidebar must be hidden on mobile");
  await assertNoHorizontalOverflow(page, "mobile Management home");

  const destinations = [];
  for (const [view, title] of [
    ["home", "Home"],
    ["training", "Training"],
    ["staff", "Staff"],
    ["reports", "Reports"]
  ]) {
    await page.locator(`.bottom-nav .workspace-nav-item[data-nav="${view}"]`).click();
    destinations.push(await page.locator("main h2").first().innerText());
    assert.equal(await page.title(), `${title} | Pathways Community Support | SkillWard`);
    await assertNoHorizontalOverflow(page, `mobile Management ${title}`);
  }
  assert.equal(new Set(destinations).size, 4, "Mobile Management destinations must differ");

  await page.getByRole("button", { name: /Open profile menu/ }).click();
  for (const option of ["Profile", "Workspace", "Sign Out"]) {
    assert.equal(await page.getByRole("menuitem", { name: new RegExp(option) }).isVisible(), true);
  }
  await page.screenshot({ path: `${artifactsDirectory}/skillward-live-management-profile-mobile.png` });
  await page.getByRole("button", { name: /Open profile menu/ }).click();

  await switchWorkspace(page, "disability", "support-worker");
  await page.locator('.bottom-nav .workspace-nav-item[data-nav="training"]').click();
  await page.getByRole("button", { name: "Complete required learning", exact: true }).click();
  await page.getByRole("button", { name: "Complete knowledge check", exact: true }).click();

  await switchWorkspace(page, "disability", "disability-trainer");
  await page.locator('.bottom-nav .workspace-nav-item[data-nav="training"]').click();
  await page.getByPlaceholder("Record specific, observable workplace evidence").fill(
    "Safely demonstrated person-centred communication and incident escalation in the sample scenario."
  );
  await page.getByRole("button", { name: "Record observation and recommend", exact: true }).click();

  await switchWorkspace(page, "disability", "management");
  await page.locator('.bottom-nav .workspace-nav-item[data-nav="training"]').click();
  await page.getByRole("button", { name: "Approve competency", exact: true }).click();
  await page.getByRole("button", { name: "Schedule 12-month renewal", exact: true }).click();
  const lifecycle = await page.locator(".demo-workflow-card").innerText();
  assert.match(lifecycle, /Cycle complete/);
  for (const stage of ["Learn", "Validate", "Observe", "Approve", "Renew"]) assert.match(lifecycle, new RegExp(stage));
  await assertNoHorizontalOverflow(page, "mobile completed lifecycle");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${artifactsDirectory}/skillward-live-lifecycle-complete-mobile.png`, fullPage: true });

  assert.deepEqual(errors, [], `Mobile console errors: ${errors.join(" | ")}`);
  await context.close();
}

await mkdir(artifactsDirectory, { recursive: true });
await waitForRelease();
const browser = await chromium.launch({ headless: true });
try {
  await verifyDesktop(browser);
  await verifyMobile(browser);
  console.log(JSON.stringify({
    production: baseUrl,
    release: expectedAssetVersion,
    desktop: "passed",
    mobile390x844: "passed",
    lifecycle: "Learn → Validate → Observe → Approve → Renew passed"
  }, null, 2));
} finally {
  await browser.close();
}
