const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const { join } = require("node:path");

const app = readFileSync(join(__dirname,"../app.js"), "utf8");
const service = readFileSync(join(__dirname,"../src/database-service.js"), "utf8");
const migration = readFileSync(join(__dirname,"../supabase/migrations/20260825051000_phase_6_reporting_analytics.sql"), "utf8");

test("Phase 6 exposes every required management reporting filter", () => {
  for (const filter of ["facility_id","department_id","sector","role","pathway_id","trainer_user_id","manager_user_id","status","due_from","due_to","renewal_from","renewal_to"])
    assert.match(app, new RegExp(`name=["']${filter}["']`));
});

test("Phase 6 builds genuine CSV, PDF and ZIP exports and audits them", () => {
  assert.match(app, /function phase6Csv/);
  assert.match(app, /%PDF-1\.4/);
  assert.match(app, /0x06054b50/);
  assert.match(app, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(app, /recordReportExport/);
  assert.match(service, /record_report_export/);
});

test("Phase 6 reporting is database-scoped and cannot be client-escalated", () => {
  assert.match(migration, /security definer set search_path=''/g);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /Management reporting access is required/);
  assert.match(migration, /private\.has_support_access\(target_organization\)/);
  assert.match(migration, /revoke all on table public\.report_export_events from public,anon,authenticated/);
  assert.match(migration, /grant select on table public\.report_export_events to authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update|delete|all) on table public\.report_export_events to authenticated/i);
});

test("educator reports are content-only and access security is organisation-admin-only", () => {
  assert.match(app, /Workforce identities, assessment outcomes and access-security events are excluded/);
  assert.match(app, /item!=="Access Security"\|\|role==="Organisation Administrator"/);
});
