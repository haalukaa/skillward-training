import { test, expect } from "@playwright/test";

test("Phase 6 management reports load, contain at viewport and export real files", async ({ page }, testInfo) => {
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/app/");
  await page.evaluate(() => {
    const org="a0000000-0000-0000-0000-000000000001", worker="10000000-0000-0000-0000-000000000003";
    globalThis.__phase6Exports=[];
    authService={ database:{
      getReportingSnapshot: async () => ({ organization_id:org,generated_at:new Date().toISOString(),generated_by:"10000000-0000-0000-0000-000000000001",scope_role:"Organisation Administrator",filters:{},metrics:{active_users:1,matrix_rows:1,assigned:1,completed:0,first_attempt_pass_rate:100,expiry_risk:1},matrix:[{worker_user_id:worker,worker_name:"Fictional QA Worker",employee_id:"QA-001",worker_role:"PCA",facility_name:"SkillWard QA Facility",department_name:"Training Ward",pathway_title:"Phase 2 QA Pathway",version_number:1,report_status:"Pending approval",due_at:"2026-09-01T00:00:00Z",renewal_due_at:"2027-09-01T00:00:00Z",quiz_score:100,quiz_attempts:1,first_attempt_pass:true,practical_outcome:"Competent",progress_percent:100}],department_comparisons:[{department:"Training Ward",assigned:1,current:0,at_risk:0}],content_version_usage:[{pathway_title:"Phase 2 QA Pathway",version_number:1,lifecycle:"Published",assignments:1,completions:0}],audit_events:[{event_name:"assessment_submitted",record_type:"learning_assignment",record_id:"1",actor_user_id:worker,created_at:"2026-08-25T00:00:00Z",details:{qa:true}}],security_events:[{event_name:"SIGNED_IN",user_id:worker,created_at:"2026-08-25T00:00:00Z",metadata:{qa:true}}] }),
      recordReportExport: async (_org,input) => { globalThis.__phase6Exports.push(input); return "export-1"; }
    }};
    authenticatedContext={user:{id:"10000000-0000-0000-0000-000000000001"},appUser:{name:"Fictional Release QA",role:"organization-admin"},profile:{full_name:"Fictional Release QA"},platformAdministrator:null,membership:{organization_id:org,role:"Organisation Administrator"},memberships:[{organization_id:org,role:"Organisation Administrator",organizations:{name:"SkillWard Release QA"}}],organization:{id:org,name:"SkillWard Release QA",branding_settings:{}},facilities:[{id:"f0000000-0000-0000-0000-000000000001",name:"SkillWard QA Facility"}],departmentDetails:[{id:"d0000000-0000-0000-0000-000000000001",name:"Training Ward"}],trainingAssignments:[],learningPathways:[{id:"20000000-0000-0000-0000-000000000001",title:"Phase 2 QA Pathway"}],organizationStaff:[{user_id:worker,user_profiles:{full_name:"Fictional QA Worker"}}],organizationMemberships:[{user_id:worker,role:"PCA"}],reportExportEvents:[]};
    state.activeWorkspaceView="reports"; state.phase6Filters={}; state.phase6ReportKind="Competency Matrix"; phase6ReportingSnapshot=null; phase6ReportingError="";
    renderAuthenticatedWorkspace();
  });
  await expect(page.getByRole("heading",{name:"Workforce readiness"})).toBeVisible();
  await expect(page.getByText("Fictional QA Worker")).toBeVisible();
  await expect(page.locator('[name="facility_id"]')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);

  const csvPromise=page.waitForEvent("download"); await page.getByRole("button",{name:"CSV"}).click(); const csv=await csvPromise;
  expect(csv.suggestedFilename()).toMatch(/competency-matrix.*\.csv$/);
  await expect.poll(()=>page.evaluate(()=>globalThis.__phase6Exports.length)).toBe(1);
  const pdfPromise=page.waitForEvent("download"); await page.getByRole("button",{name:"PDF"}).click(); const pdf=await pdfPromise;
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  const zipPromise=page.waitForEvent("download"); await page.getByRole("button",{name:"Audit pack"}).click(); const zip=await zipPromise;
  expect(zip.suggestedFilename()).toMatch(/audit-pack.*\.zip$/);
  expect(errors).toEqual([]);
  await page.screenshot({path:testInfo.outputPath("phase6-reporting.png"),fullPage:true});
});
