import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const service=readFileSync(new URL("../src/database-service.js",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20260825070829_phase_7_security_operations.sql",import.meta.url),"utf8");

test("Phase 7 exposes a security operations workspace to the two governing admin roles",()=>{
  assert.match(app,/"SkillWard Super Administrator"[^\n]+"security"/);
  assert.match(app,/"Organisation Administrator"[^\n]+"security"/);
  assert.match(app,/Production assurance/);
  assert.match(app,/Provider-managed controls remain explicitly marked for external verification/);
});

test("Phase 7 writes sensitive operations only through guarded audited RPCs",()=>{
  for(const name of ["create_security_incident","start_access_review","record_access_review_decision","submit_data_lifecycle_request","save_organization_retention_policy","authorize_support_access_v2","activate_support_session_v2"]){
    assert.match(migration,new RegExp(`create function public\\.${name}`));
    assert.match(service,new RegExp(name));
  }
  assert.match(migration,/revoke insert,update,delete on table public\.support_access_sessions from authenticated/);
  assert.match(migration,/perform private\.phase7_audit/g);
});

test("Phase 7 keeps tenant tables forced-RLS and browser mutation-free",()=>{
  for(const table of ["security_incidents","access_review_campaigns","access_review_items","data_lifecycle_requests","organization_retention_policies"]){
    assert.match(migration,new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.match(migration,/grant select on table public\.security_incidents/);
  assert.doesNotMatch(migration,/grant (?:insert|update|delete) on table public\.security_incidents/);
});

test("Phase 7 access decisions are review records and do not silently change memberships",()=>{
  const decision=migration.slice(migration.indexOf("create function public.record_access_review_decision"),migration.indexOf("create function public.submit_data_lifecycle_request"));
  assert.doesNotMatch(decision,/update public\.organization_memberships/);
  assert.match(app,/Flag suspension/);
});
