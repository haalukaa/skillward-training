import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

const controlApplication = await readFile(new URL("../../control/control.js", import.meta.url), "utf8");

const mockControlClient = `
Object.defineProperty(window,'SkillWardControl',{value:{
  session:async()=>({access_token:'fictional-local-token',user:{email:'owner@control-plane-qa.invalid'}}),
  assurance:async()=>({data:{currentLevel:'aal2',nextLevel:'aal2'},error:null}),
  factors:async()=>({data:{totp:[]},error:null}),
  signIn:async()=>({data:{},error:null}),signOut:async()=>({error:null}),
  verifyTotp:async()=>({data:{},error:null}),reauthenticate:async()=>({data:{},error:null}),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
  invoke:async body=>body.operation==='snapshot'?{error:null,data:{authorization:{role:'Owner',permissions:['dashboard.read','organizations.read','organizations.write','plans.read','billing.read','onboarding.read','support.read','support.enter','health.read','security.read','content.read','release.read','recovery.read','exports.read','analytics.read']},data:{metrics:{organizations:1,active_organizations:0,suspended_organizations:0,expiring_pilots:1,users:1,active_memberships:1,facilities:1,departments:1,assignments:3,competencies:2,overdue_renewals:1,open_support:0,failed_jobs:0,security_alerts:0,revenue_indicators:0},organizations:[{id:'a0000000-0000-4000-8000-000000000001',name:'SkillWard Control Plane QA — FICTIONAL',sector:'Hospital',status:'pilot',plan:'Pilot',pilot_expires_at:'2026-09-20T00:00:00Z'}],health:[{component:'Web application',summary:'Fictional QA health signal',severity:'Info',status:'operational',observed_at:'2026-08-25T00:00:00Z'}],recent_high_risk:[],plans:[{plan_key:'Pilot',support_level:'Standard',limits:{users:50,storage_gb:5},entitlements:{integrations:false}},{plan_key:'Enterprise',support_level:'Dedicated',limits:{users:-1,storage_gb:-1},entitlements:{integrations:true}}],onboarding:[{organization_id:'a0000000-0000-4000-8000-000000000001',total:15,complete:2,blocked:0}],releases:[{release_marker:'20260825-phase9-launch-hardening-1',commit_sha:'6f82f159ffb6fd41bf040124f2e593e927afeedd',release_ring:'general release',validation_status:'passed'}],incidents:[],recovery:null}}}:{error:null,data:{data:{ok:true,id:'f0000000-0000-4000-8000-000000000001'}}}
},writable:false,configurable:false});`;

new Function(mockControlClient);

test.beforeEach(async ({ page }) => {
  await page.route("**/control/control-bundle.js", route => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/control/control.js", route => route.fulfill({ status: 200, contentType: "application/javascript", body: `${mockControlClient}\n${controlApplication}` }));
});

test("private command centre is accessible, role-aware and free of browser failures", async ({ page }, testInfo) => {
  const consoleErrors = [], failedRequests = [], unexpectedResponses = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", request => failedRequests.push(`${request.method()} ${request.url()}`));
  page.on("response", response => { if (response.status() >= 400) unexpectedResponses.push(`${response.status()} ${response.url()}`); });
  await page.goto("/control/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Command centre" })).toBeVisible();
  await expect(page.getByText("SkillWard Control Plane QA — FICTIONAL")).toBeAttached();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex,nofollow/);
  await expect(page.getByRole("navigation", { name: "Control plane" })).toBeAttached();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  expect(await page.locator("body").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(consoleErrors).toEqual([]); expect(failedRequests).toEqual([]); expect(unexpectedResponses).toEqual([]);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: `artifacts/control-plane-${testInfo.project.name}-fictional.png`, fullPage: true });
});

test("organisation workflow exposes clear protected impact and confirmation", async ({ page }) => {
  await page.goto("/control/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Organisations" }).click();
  await expect(page.getByRole("heading", { name: "Organisation lifecycle" })).toBeVisible();
  await page.getByRole("button", { name: "Manage" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(/Suspension never deletes data/)).toBeVisible();
  await expect(page.getByLabel("Written reason")).toBeVisible();
  await expect(page.getByText("Type CONFIRM")).toBeVisible();
});

test("exact 390 by 844 layout has no horizontal overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "exact mobile-only assertion");
  await page.goto("/control/", { waitUntil: "networkidle" });
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
  expect(await page.evaluate(() => ({ page: document.documentElement.scrollWidth <= 390, body: document.body.scrollWidth <= 390 }))).toEqual({ page: true, body: true });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("button", { name: "Organisations" })).toBeVisible();
});
