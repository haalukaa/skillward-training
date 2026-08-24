const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const app = fs.readFileSync("app.js", "utf8");
const database = fs.readFileSync("src/database-service.js", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260824143000_phase_2_content_authoring.sql", "utf8");

test("Phase 2 exposes complete organisation pathway authoring", () => {
  for (const label of ["NEW PATHWAY", "ADD MODULE", "Item type", "Lesson text", "Secure resource URL", "Quiz question", "Submit for review", "Create new version"]) {
    assert.match(app, new RegExp(label, "i"));
  }
  for (const type of ["Page", "Video", "File", "Downloadable Resource", "External Link", "Quiz"]) assert.match(app, new RegExp(`option>${type}`));
  assert.match(app, /one per line/);
  assert.match(app, /correctOption/);
});

test("authoring data remains tenant scoped and is loaded by version", () => {
  for (const table of ["learning_pathways", "learning_pathway_versions", "learning_modules", "learning_module_items"]) assert.ok(database.includes(`optionalQuery("${table}"`));
  assert.match(database, /eq\("organization_id", organizationId\)/);
  assert.match(database, /in\("pathway_id", learningPathwayIds\)/);
  assert.match(database, /in\("pathway_version_id", learningVersionIds\)/);
});

test("browser authoring uses protected RPC boundaries for lifecycle and cloning", () => {
  for (const rpc of ["create_learning_pathway_draft", "add_learning_module", "add_learning_module_item", "create_learning_pathway_version", "transition_learning_pathway_version"]) assert.match(database, new RegExp(rpc));
  assert.match(app, /Published content is immutable/);
  assert.match(app, /Publish this version\?/);
});

test("database validates rich content and prevents self-publication", () => {
  assert.match(migration, /Resources require a secure HTTPS URL/);
  assert.match(migration, /Every quiz question requires a prompt/);
  assert.match(migration, /Draft' then/);
  assert.match(migration, /In Review/);
  assert.match(migration, /Approved/);
  assert.match(migration, /Published/);
  assert.match(migration, /has_access_role\(version\.organization_id, array\['organization_admin'\]/);
});

test("Phase 2 functions are explicit authenticated-only grants", () => {
  assert.match(migration, /revoke all on function public\.create_learning_pathway_draft[\s\S]+from public, anon/);
  assert.match(migration, /grant execute on function public\.create_learning_pathway_draft[\s\S]+to authenticated, service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]+to anon/);
});

test("pathway builder stacks cleanly on mobile", () => {
  assert.match(styles, /\.pathway-authoring-layout \{ display: grid/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]+\.pathway-authoring-layout \{ grid-template-columns: 1fr/);
  assert.match(styles, /@media \(max-width: 560px\)[\s\S]+\.authoring-actions \.btn \{ width: 100%/);
});
