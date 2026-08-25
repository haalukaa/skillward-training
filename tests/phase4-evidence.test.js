const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const app = fs.readFileSync("app.js", "utf8");
const database = fs.readFileSync("src/database-service.js", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260825010000_phase_4_practical_evidence.sql", "utf8");

test("Phase 4 provides configurable criterion-level practical assessment", () => {
  for (const label of ["PRACTICAL COMPETENCY BUILDER","Safety critical","Comments required","Evidence required","Worker acknowledgement","CRITERION-LEVEL ASSESSMENT"]) assert.match(app,new RegExp(label,"i"));
  for (const table of ["competency_rubrics","competency_rubric_sections","competency_rubric_criteria","competency_assessments","competency_criterion_results"]) assert.match(migration,new RegExp(`create table public\\.${table}`));
});

test("trainer workflow blocks incomplete and unsafe submissions", () => {
  assert.match(migration,/Every criterion requires a rating/);
  assert.match(migration,/personally observed/i);
  assert.match(migration,/safety_critical and x\.rating<>'Competent'/);
  assert.match(migration,/A development plan is required/);
  for (const rpc of ["start_competency_assessment","save_competency_criterion","submit_competency_assessment"]) assert.match(database,new RegExp(rpc));
});

test("worker acknowledgement and immutable management history are protected", () => {
  assert.match(app,/Your comment does not change the assessor decision/);
  assert.match(migration,/competency_worker_acknowledgements/);
  assert.match(migration,/competency_management_reviews/);
  assert.match(migration,/rubric_version integer not null, pathway_version_id uuid not null/);
  assert.match(migration,/ordinary users have no delete policy/);
});

test("evidence remains private, tenant-scoped and retention controlled", () => {
  assert.match(migration,/competency-evidence bucket/);
  assert.match(migration,/retention_until date/);
  assert.match(migration,/revoke all on table[\s\S]+from anon/);
  assert.doesNotMatch(migration,/grant (insert|update|delete)[\s\S]+competency_evidence_files[\s\S]+to authenticated/i);
  assert.match(migration,/can_read_competency_evidence/);
  assert.match(migration,/can_write_competency_evidence/);
});

test("Phase 4 stacks on tablet and phone widths", () => {
  assert.match(styles,/@media\(max-width:900px\)\{\.phase4-builder\{grid-template-columns:1fr/);
  assert.match(styles,/@media\(max-width:560px\)[\s\S]+\.phase4-assessment \.btn/);
});
