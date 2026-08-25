import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/20260825150000_advanced_owner_control_plane.sql", "utf8");
const edge = await readFile("supabase/functions/owner-control-api/index.ts", "utf8");
const html = await readFile("control/index.html", "utf8");
const css = await readFile("control/control.css", "utf8");
const browser = await readFile("control/control.js", "utf8");
const build = await readFile("scripts/build.mjs", "utf8");

test("control-plane records live in a non-exposed forced-RLS schema", () => {
  assert.match(migration, /create schema if not exists private/);
  assert.match(migration, /revoke all on schema private from public, anon, authenticated/);
  assert.match(migration, /grant usage on schema private to authenticated, service_role/);
  assert.match(migration, /alter table private\.%I force row level security/);
  assert.match(migration, /revoke all on table private\.%I from public,anon,authenticated/);
  assert.doesNotMatch(migration, /grant (select|insert|update|delete|all).*authenticated/i);
});

test("all seven platform roles have explicit least-privilege permissions", () => {
  for (const role of ["Owner", "Security Administrator", "Operations Administrator", "Customer Support", "Finance", "Content Administrator", "Auditor / Read-only"]) assert.match(migration, new RegExp(`'${role.replace("/", "\\/")}'`));
  assert.doesNotMatch(migration, /user_metadata/);
  assert.match(migration, /private\.platform_role_permissions/);
  assert.match(migration, /mfa_required boolean not null default true check \(mfa_required\)/);
});

test("Edge boundary verifies origin, identity, AAL2, rate limit and service-only RPCs", () => {
  for (const value of ["control.skillwardtraining.com", "auth.getUser", "verifiedMfa", 'claims.aal !== "aal2"', "CONTROL_PLANE_RATE_LIMIT_SALT", "owner_control_consume_rate_limit", "owner_control_authorize", "owner_control_snapshot", "owner_control_action"]) assert.match(edge, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(edge, /serviceKey.*response|console\.log|SUPABASE_SERVICE_ROLE_KEY.*window/i);
  assert.match(migration, /revoke all on function public\.owner_control_(authorize|snapshot|action).*from public,anon,authenticated/g);
});

test("sessions expire, revoke, and protect the last active Owner", () => {
  assert.match(migration, /last_seen_at<now\(\)-interval '20 minutes'/);
  assert.match(migration, /expires_at<=now\(\)/);
  assert.match(migration, /revoked_at is not null/);
  assert.match(migration, /LAST_OWNER_PROTECTED/);
  assert.match(migration, /action_name='deactivate_admin'[\s\S]*update private\.owner_control_sessions set revoked_at=now\(\)/);
});

test("high-risk operations require recent authentication, reason, confirmation and immutable audit", () => {
  assert.match(migration, /recent_auth_at<now\(\)-interval '10 minutes'/);
  assert.match(migration, /length\(why\)<12/);
  assert.match(migration, /CONTROL_CONFIRMATION_REQUIRED/);
  assert.match(migration, /create trigger control_audit_immutable before update or delete/);
  for (const action of ["transition_organization", "start_support_mode", "record_export", "revoke_session", "change_admin_role", "govern_template", "set_feature_flag", "start_offboarding"]) assert.match(migration, new RegExp(`'${action}'`));
});

test("organisation lifecycle, plans, billing, onboarding, support and recovery are substantive", () => {
  for (const term of ["prospect", "setup", "pilot", "active", "grace_period", "suspended", "archived", "offboarded", "Enterprise", "billing_status", "organization_onboarding_items", "support_mode_page_events", "customer_offboarding_cases", "recovery_register"]) assert.match(migration, new RegExp(term));
  assert.match(migration, /No immediate irreversible deletion|no destructive browser restore/i.test(html) ? /./ : /must-not-match/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.organizations|truncate\s+table|drop\s+table/i);
});

test("private entrance is noindex, absent from sitemap and denied on the public hostname", () => {
  assert.match(html, /noindex,nofollow,noarchive,nosnippet/);
  assert.match(browser, /allowedHosts/);
  assert.match(browser, /control\.skillwardtraining\.com/);
  assert.match(build, /Disallow: \/control\//);
  assert.doesNotMatch(build, /publicUrls[^\n]*control/);
});

test("interface covers every owner-control area and exact phone containment", () => {
  for (const section of ["command", "organisations", "plans", "commercial", "onboarding", "support", "health", "security", "templates", "releases", "recovery", "offboarding", "incidents", "analytics"]) assert.match(html, new RegExp(`section-${section}`));
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /overflow-x:hidden/);
  assert.match(html, /skip-link/);
  assert.match(html, /aria-live="polite"/);
});

test("Support Mode is explicit, read-only by default, time-limited and page-audited", () => {
  assert.match(migration, /access_mode text not null default 'read_only'/);
  assert.match(migration, /expires_at<=starts_at\+interval '4 hours'/);
  assert.match(browser, /support-banner/);
  assert.match(browser, /record_support_page/);
  assert.match(migration, /authorize_support_write/);
});
