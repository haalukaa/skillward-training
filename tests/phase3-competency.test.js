const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");
const app=fs.readFileSync("app.js","utf8"), db=fs.readFileSync("src/database-service.js","utf8"), css=fs.readFileSync("styles.css","utf8"), migration=fs.readFileSync("supabase/migrations/20260824160000_phase_3_assignments_competency.sql","utf8");

test("Phase 3 implements the complete competency journey",()=>{
  for(const label of ["ASSIGN PUBLISHED LEARNING","Submit knowledge check","Record observation","Send recommendation","Approve competency","Request reassessment"]) assert.match(app,new RegExp(label,"i"));
  for(const rpc of ["assign_published_pathway","complete_learning_item","record_competency_observation","submit_competency_recommendation","decide_competency"]) assert.match(db,new RegExp(rpc));
});

test("Phase 3 records tenant scoped evidence and immutable workflow events",()=>{
  for(const table of ["learning_assignments","learning_item_progress","competency_observations","competency_recommendations","competency_awards","competency_workflow_events"]) assert.match(migration,new RegExp(`create table public\\.${table}`));
  assert.match(migration,/force row level security/);
  assert.match(migration,/worker_user_id=\(select auth\.uid\(\)\)/);
  assert.match(migration,/trainer_user_id=\(select auth\.uid\(\)\)/);
  assert.match(migration,/private\.can_manage_assignment/);
});

test("workflow ordering is protected in PostgreSQL",()=>{
  assert.match(migration,/lifecycle='Published'/);
  assert.match(migration,/Only the assigned worker can complete learning/);
  assert.match(migration,/Observation is required before recommendation/);
  assert.match(migration,/a\.status<>'Sent to Management'/);
  assert.match(migration,/renewal_interval_days/);
});

test("Phase 3 RPCs are authenticated only",()=>{
  assert.match(migration,/revoke all on function public\.assign_published_pathway[\s\S]+from public,anon/);
  assert.match(migration,/grant execute on function public\.assign_published_pathway[\s\S]+to authenticated,service_role/);
  assert.doesNotMatch(migration,/grant execute[\s\S]+to anon/);
});

test("Phase 3 responsive layout stacks at phone width",()=>{
  assert.match(css,/\.phase3-layout\{display:grid/);
  assert.match(css,/@media\(max-width:900px\)\{\.phase3-layout/);
  assert.match(css,/@media\(max-width:560px\)[\s\S]+\.phase3-assignment \.btn/);
});
