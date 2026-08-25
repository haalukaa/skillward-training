import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const release="20260825-phase9-launch-hardening-1";

test("Phase 9 release marker is consistent across every browser entry asset",async()=>{
  for(const file of ["index.html","app/index.html","src/public-pages.mjs","service-worker.js","pwa-controller.js","scripts/production-smoke.mjs"]){
    const source=await readFile(file,"utf8");
    assert.match(source,new RegExp(release));
    assert.doesNotMatch(source,/20260825-phase8-mobile-pwa-1/);
  }
});

test("Phase 9 migration compatibility runs from the shared-domain baseline without production credentials",async()=>{
  const harness=await readFile("scripts/verify-migration-compatibility.sh","utf8");
  const fixture=await readFile("scripts/phase9-production-shaped-fixture.sql","utf8");
  assert.match(harness,/20260823180919/);
  assert.match(harness,/db reset --local/);
  assert.match(harness,/migration up --local/);
  assert.doesNotMatch(harness,/--linked|db push|supabase\.co/);
  assert.match(fixture,/Fictional, local-only/);
  assert.doesNotMatch(fixture,/skillwardtraining\.com/);
});

test("Phase 9 keeps the existing ordered migration chain schema-free",async()=>{
  const migrations=(await readdir("supabase/migrations")).filter(name=>name.endsWith(".sql")).sort();
  assert.equal(migrations.length,18);
  assert.equal(migrations.at(-1),"20260825080000_phase_7_fk_index_hardening.sql");
});

test("protected database CI executes upgrade, clean reset, lint and pgTAP",async()=>{
  const workflow=await readFile(".github/workflows/supabase-database.yml","utf8");
  for(const command of ["verify-migration-compatibility.sh","supabase db reset","supabase db lint","supabase test db"]){
    assert.match(workflow,new RegExp(command.replaceAll(" ","\\s+")));
  }
});
