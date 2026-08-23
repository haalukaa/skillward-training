const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = file => fs.readFileSync(file, "utf8");
const home = read("index.html");
const appIndex = read("app/index.html");
const app = read("app.js");
const marketing = read("marketing.js");
const build = read("scripts/build.mjs");
const migration = read("supabase/migrations/202608230002_demo_requests.sql");
const requestDemo = read("supabase/functions/request-demo/index.ts");

test("the public homepage leads with the approved healthcare competency position", () => {
  assert.match(home, /Training completed isn’t the same as/);
  assert.match(home, /Learn → Validate → Observe → Approve → Renew/);
  assert.match(home, /Purpose-built for healthcare workflows/);
  assert.match(home, /No patient information required/);
  assert.match(home, /Become a Pilot Partner/);
  assert.doesNotMatch(home, /auth-bundle\.js|data\.js|management-data\.js/);
});

test("public, operational and demo entry points are deliberately separated", () => {
  assert.match(home, /href="\/app\/">Sign In/);
  assert.match(appIndex, /auth-bundle\.js/);
  assert.match(appIndex, /name="robots" content="noindex,nofollow"/);
  assert.match(app, /new URLSearchParams\(location\.search\)\.get\("demo"\) === "1"/);
  assert.match(build, /dist\/demo\/index\.html/);
  assert.match(build, /\/app\/\?demo=1/);
});

test("all required marketing and legal destinations are generated as real routes", async () => {
  const { pages } = await import(`../src/public-pages.mjs?test=${Date.now()}`);
  const paths = new Set(pages.map(page => page.path));
  for (const path of [
    "why-skillward/index.html", "platform/index.html", "solutions/hospitals/index.html",
    "solutions/aged-care/index.html", "solutions/disability-support/index.html",
    "customers/index.html", "resources/index.html", "security/index.html",
    "book-demo/index.html", "contact/index.html", "legal/privacy/index.html",
    "legal/terms/index.html", "legal/accessibility/index.html", "404.html"
  ]) assert.ok(paths.has(path), `missing generated route: ${path}`);
  for (const capability of ["learning", "knowledge-checks", "practical-assessment", "trainer-recommendations", "management-approval", "renewal", "pathway-builder", "multi-organisation", "assignments", "reporting"]) {
    assert.ok(paths.has(`platform/${capability}/index.html`), `missing capability route: ${capability}`);
  }
});

test("future and regulated claims are labelled honestly", async () => {
  const { pages } = await import(`../src/public-pages.mjs?claims=${Date.now()}`);
  const all = home + pages.map(page => page.html).join("\n");
  assert.match(all, /IN DEVELOPMENT/);
  assert.match(all, /We make no claim of external certification/);
  assert.match(all, /not claiming ISO 27001, SOC 2, HIPAA certification/);
  assert.match(all, /No invented customer logos or endorsements/);
  assert.match(all, /formal legal review/);
  assert.match(app, /data-planned-content="true"/);
  assert.doesNotMatch(all, /trusted by \d+|\d+% improvement|ISO 27001 certified/i);
});

test("demo enquiries use validated server-side storage rather than mailto", async () => {
  const { pages } = await import(`../src/public-pages.mjs?form=${Date.now()}`);
  const demoPage = pages.find(page => page.path === "book-demo/index.html").html;
  for (const field of ["workEmail", "fullName", "organizationName", "organizationType", "jobRole", "staffRange", "primaryInterest", "privacyConsent"]) assert.match(demoPage, new RegExp(`name="${field}"`));
  assert.match(marketing, /functions\/v1\/request-demo/);
  assert.match(marketing, /formStartedAt/);
  assert.doesNotMatch(demoPage + marketing, /mailto:/);
  assert.match(requestDemo, /content-type/);
  assert.match(requestDemo, /DEMO_REQUEST_RATE_LIMIT_SALT/);
  assert.match(requestDemo, /consume_demo_request_rate_limit/);
  assert.match(requestDemo, /Number\(requestCount\) > 5/);
  assert.match(requestDemo, /privacyConsent/);
});

test("demo lead tables deny direct public access and restrict review to SkillWard administrators", () => {
  assert.match(migration, /alter table public\.demo_requests enable row level security/);
  assert.match(migration, /revoke all on table public\.demo_requests from anon, authenticated/);
  assert.match(migration, /grant select, update on table public\.demo_requests to authenticated/);
  assert.match(migration, /private\.is_skillward_administrator\(\)/);
  assert.match(migration, /grant all on table public\.demo_requests, public\.demo_request_rate_limits to service_role/);
});

test("build output includes discoverability, legal routing and an intentional 404", () => {
  assert.match(build, /robots\.txt/);
  assert.match(build, /sitemap\.xml/);
  assert.match(build, /_redirects/);
  assert.match(build, /\/legal\.html \/legal\/privacy\/ 301/);
  assert.match(build, /\/\* \/404\.html 404/);
});
