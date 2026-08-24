import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { FIXTURES, LOCAL_PASSWORD, UPDATED_PASSWORD } from "./fixtures.mjs";

const mailpitUrl = process.env.MAILPIT_URL || "http://127.0.0.1:54324";
const screenshotRoot = "artifacts/phase1-local";
const diagnostics = new WeakMap();

function localProject(testInfo) {
  if (!FIXTURES[testInfo.project.name]) throw new Error(`Unknown project ${testInfo.project.name}`);
  return FIXTURES[testInfo.project.name];
}

function isSkillWardRequest(url) {
  const parsed = new URL(url);
  return parsed.origin === "http://127.0.0.1:4173"
    || parsed.origin === "http://localhost:4173"
    || parsed.origin === "http://127.0.0.1:54321";
}

test.beforeEach(async ({ page }, testInfo) => {
  const errors = [];
  diagnostics.set(page, errors);
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("requestfailed", request => {
    if (isSkillWardRequest(request.url())) errors.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`);
  });
  page.on("response", response => {
    if (isSkillWardRequest(response.url()) && response.status() >= 400) {
      errors.push(`response: ${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  if (testInfo.project.name === "mobile") {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
  }
});

test.afterEach(async ({ page }) => {
  const errors = diagnostics.get(page) || [];
  expect(errors, errors.join("\n")).toEqual([]);
});

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  expect(metrics.viewport).toBe(390);
  expect(metrics.document).toBeLessThanOrEqual(390);
  expect(metrics.body).toBeLessThanOrEqual(390);
}

async function capture(page, testInfo, name) {
  await mkdir(screenshotRoot, { recursive: true });
  if (testInfo.project.name === "mobile") await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: `${screenshotRoot}/${testInfo.project.name}-${name}.png`,
    fullPage: true
  });
}

async function openLogin(page) {
  await page.goto("/app/");
  await expect(page.getByRole("heading", { name: "Sign in to your SkillWard workspace" })).toBeVisible();
  await expect(page).toHaveTitle("Sign In | SkillWard");
}

async function signIn(page, account, password = LOCAL_PASSWORD) {
  await openLogin(page);
  await page.locator("#emailInput").fill(account.email);
  await page.locator("#passwordInput").fill(password);
  await page.getByRole("button", { name: /^Sign In/ }).click();
}

async function expectHeading(page, name) {
  try {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      headings: [...document.querySelectorAll("h1, h2, h3")].map(item => item.textContent.trim()).filter(Boolean),
      alerts: [...document.querySelectorAll('[role="alert"], [role="status"]')].map(item => ({
        text: item.textContent.trim(), diagnosticCode: item.dataset.diagnosticCode || null
      })).filter(item => item.text || item.diagnosticCode)
    }));
    throw new Error(`${error.message}\nSafe fictional-page diagnostic: ${JSON.stringify(diagnostic)}`);
  }
}

async function profileAction(page, action) {
  await page.locator("#profileButton").click();
  await page.locator(`[data-profile-action="${action}"]`).click();
}

async function waitForLocalLogout(page, action) {
  const responsePromise = page.waitForResponse(response => response.url().includes("/auth/v1/logout") && response.request().method() === "POST");
  await action();
  const response = await responsePromise;
  await response.finished();
}

async function signOut(page) {
  await waitForLocalLogout(page, () => profileAction(page, "signout"));
  await expect(page.getByRole("heading", { name: "Sign in to your SkillWard workspace" })).toBeVisible();
}

function recipientMatches(message, email) {
  return JSON.stringify(message.To || message.to || "").toLowerCase().includes(email.toLowerCase());
}

async function latestMail(email) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${mailpitUrl}/api/v1/messages`);
    if (!response.ok) throw new Error(`Mailpit messages returned ${response.status}`);
    const payload = await response.json();
    const messages = payload.messages || payload.Messages || [];
    const message = messages.find(item => recipientMatches(item, email));
    if (message) {
      const id = message.ID || message.Id || message.id;
      const detail = await fetch(`${mailpitUrl}/api/v1/message/${encodeURIComponent(id)}`);
      if (!detail.ok) throw new Error(`Mailpit message returned ${detail.status}`);
      return detail.json();
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`No local Mailpit message arrived for ${email}`);
}

function emailActionLink(message) {
  const content = `${message.HTML || message.Html || ""}\n${message.Text || message.text || ""}`
    .replaceAll("&amp;", "&")
    .replaceAll("&#x3D;", "=")
    .replaceAll("=3D", "=");
  const urls = content.match(/https?:\/\/[^\s"'<>]+/g) || [];
  const selected = urls.find(url => url.includes("/auth/v1/verify"))
    || urls.find(url => /token|confirmation/i.test(url));
  if (!selected) throw new Error("Mailpit message did not contain an Auth action link.");
  return selected.replace(/[).,]+$/, "");
}

test("valid login routes single memberships and enforces role navigation", async ({ page }, testInfo) => {
  const accounts = localProject(testInfo);

  await signIn(page, accounts.management);
  await expectHeading(page, "SkillWard Demo Organisation");
  for (const name of ["Home", "Pathways", "People", "Competency", "Reports", "Admin"]) {
    await expect(page.locator(`button[aria-label="${name}"]:visible`).first()).toBeVisible();
  }
  await expect(page.getByText("Choose where you are working")).toHaveCount(0);
  await capture(page, testInfo, "management-dashboard");
  await signOut(page);

  await signIn(page, accounts.worker);
  await expectHeading(page, "PCA Training Workspace");
  await expect(page.getByRole("button", { name: "People" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Admin" })).toHaveCount(0);
  await capture(page, testInfo, "worker-dashboard");
  await signOut(page);

  await signIn(page, accounts.trainer);
  await expectHeading(page, "PCA Trainer Workspace");
  await expect(page.getByText("ASSIGNED TRAINEES")).toBeVisible();
  await expect(page.getByRole("button", { name: "People" })).toHaveCount(0);
  await capture(page, testInfo, "trainer-dashboard");
});

test("multiple workspaces, profile, switching and sign-out are functional", async ({ page }, testInfo) => {
  const account = localProject(testInfo).multiple;
  await signIn(page, account);
  await expect(page.getByRole("heading", { name: "Choose where you are working" })).toBeVisible();
  await expect(page.getByText("SkillWard Demo Organisation")).toBeVisible();
  await expect(page.getByText("Development Tenant Beta")).toBeVisible();
  await capture(page, testInfo, "workspace-chooser");

  await page.locator('[data-entry-organization="a0000000-0000-0000-0000-000000000001"]').click();
  await expectHeading(page, "PCA Training Workspace");
  await expect(page.locator("#organizationWorkspace")).toHaveValue("a0000000-0000-0000-0000-000000000001");
  await profileAction(page, "profile");
  await expect(page.getByRole("heading", { name: account.fullName })).toBeVisible();
  await expect(page.getByText("Secure organisation account")).toBeVisible();
  await capture(page, testInfo, "profile");
  await page.locator("#closeProfileDialog").click();

  await profileAction(page, "workspace");
  await expect(page.getByRole("heading", { name: "Your authorised workspaces" })).toBeVisible();
  await page.locator('[data-organization="b0000000-0000-0000-0000-000000000001"]').click();
  await expect(page.locator("#organizationWorkspace")).toHaveValue("b0000000-0000-0000-0000-000000000001");
  await capture(page, testInfo, "switched-workspace");
  await signOut(page);
  await expect(page).toHaveTitle("Sign In | SkillWard");
});

test("suspended and unauthorised users are blocked", async ({ page }, testInfo) => {
  const accounts = localProject(testInfo);
  await signIn(page, accounts.suspended);
  await expect(page.getByRole("heading", { name: "Account suspended" })).toBeVisible();
  await capture(page, testInfo, "suspended-block");
  await waitForLocalLogout(page, () => page.locator("#accessStateSignIn").click());

  await page.locator("#emailInput").fill(accounts.unauthorized.email);
  await page.locator("#passwordInput").fill(LOCAL_PASSWORD);
  await waitForLocalLogout(page, () => page.getByRole("button", { name: /^Sign In/ }).click());
  await expect(page.locator("#authError")).toContainText("not configured for SkillWard");
  await capture(page, testInfo, "unauthorized-block");
});

test("invitation email and one-time account acceptance work through Mailpit", async ({ page }, testInfo) => {
  const accounts = localProject(testInfo);
  const invitation = accounts.invitation;
  await signIn(page, accounts.management);
  await page.locator('button[aria-label="People"]:visible').first().click();
  const form = page.locator("#organizationInviteForm");
  await form.getByLabel("Full name").fill(invitation.fullName);
  await form.getByLabel("Employee ID").fill(invitation.employeeId);
  await form.getByLabel("Email").fill(invitation.email);
  await form.getByLabel("Role").selectOption({ label: invitation.role });
  await form.locator('select[name="facilityId"]').selectOption({ index: 1 });
  await form.locator('select[name="departmentId"]').selectOption({ index: 1 });
  await form.getByRole("button", { name: "Send secure invitation" }).click();
  await expect(page.getByText(invitation.email)).toBeVisible();

  const message = await latestMail(invitation.email);
  await page.goto(emailActionLink(message));
  await expect(page.getByRole("heading", { name: "Create your SkillWard account" })).toBeVisible();
  await page.locator("#invitationFullName").fill(invitation.fullName);
  await page.locator("#invitationPassword").fill(UPDATED_PASSWORD);
  await page.locator("#invitationPasswordConfirm").fill(UPDATED_PASSWORD);
  await page.getByRole("button", { name: "Create account and continue" }).click();
  await expectHeading(page, "PCA Training Workspace");
  await expect(page.locator("#profileButton")).toHaveAttribute("aria-label", new RegExp(invitation.fullName));
  await capture(page, testInfo, "invitation-accepted");
});

test("password recovery email, link, reset route and new login work", async ({ page }, testInfo) => {
  const account = localProject(testInfo).recovery;
  await openLogin(page);
  await page.locator("#forgotPassword").click();
  await page.locator("#resetEmail").fill(account.email);
  await page.getByRole("button", { name: "Send recovery link" }).click();
  await expect(page.locator("#resetStatus")).toContainText("recovery link has been sent");

  const message = await latestMail(account.email);
  await page.goto(emailActionLink(message));
  await expect(page.getByRole("heading", { name: "Create new password" })).toBeVisible();
  await capture(page, testInfo, "recovery-route");
  await page.locator("#newPassword").fill(UPDATED_PASSWORD);
  await page.locator("#confirmPassword").fill(UPDATED_PASSWORD);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Password updated successfully")).toBeVisible();
  await page.locator("#emailInput").fill(account.email);
  await page.locator("#passwordInput").fill(UPDATED_PASSWORD);
  await page.getByRole("button", { name: /^Sign In/ }).click();
  await expectHeading(page, "PCA Training Workspace");
  await capture(page, testInfo, "recovery-login");
});

test("configured idle session expiry returns to a safe access state", async ({ page }, testInfo) => {
  await page.clock.install();
  await signIn(page, localProject(testInfo).session);
  await expect(page.getByRole("heading", { name: "Department Management Workspace" })).toBeVisible();
  await waitForLocalLogout(page, () => page.clock.fastForward(301_000));
  await expect(page.getByRole("heading", { name: "Session expired" })).toBeVisible();
  await capture(page, testInfo, "session-expired");
});

test("Guided Demo is functional and isolated from authenticated services", async ({ page }, testInfo) => {
  const supabaseRequests = [];
  page.on("request", request => {
    if (request.url().startsWith("http://127.0.0.1:54321/")) supabaseRequests.push(request.url());
  });
  await page.goto("/demo/");
  await expect(page).toHaveURL(/\/app\/\?demo=1$/);
  await expect(page.getByRole("heading", { name: "Choose a care environment" })).toBeVisible();
  for (const sector of ["Hospital", "Aged Care", "Disability Support"]) {
    await expect(page.getByRole("button", { name: new RegExp(sector) })).toBeVisible();
  }
  await page.getByRole("button", { name: /Hospital/ }).click();
  await page.locator("#nameInput").fill(`${testInfo.project.name} Demo User`);
  await page.locator("#roleInput").selectOption("management");
  await page.getByRole("button", { name: "Open Guided Demo" }).click();
  await expect(page.getByText("GUIDED DEMO · SAMPLE DATA").first()).toBeVisible();
  await expect(page.locator(".demo-context").getByText("Perth Metro Hospital Network")).toBeVisible();
  await capture(page, testInfo, "guided-demo");
  expect(supabaseRequests, "Guided Demo must not call local Auth, REST, RPC or Functions").toEqual([]);
});
