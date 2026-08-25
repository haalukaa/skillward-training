import { test, expect } from "@playwright/test";

test("Phase 7 security operations load and create an audited incident at desktop and exact mobile width",async({page},testInfo)=>{
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/app/");
  await expect(page.getByRole("heading",{name:"Sign in to your SkillWard workspace"})).toBeVisible();
  await page.evaluate(()=>{
    const org="a0000000-0000-0000-0000-000000000001",admin="10000000-0000-0000-0000-000000000001",worker="10000000-0000-0000-0000-000000000003";
    globalThis.__phase7Incidents=[];
    const snapshot=()=>({organization_id:org,generated_at:new Date().toISOString(),metrics:{open_incidents:globalThis.__phase7Incidents.length,critical_incidents:0,open_access_reviews:1,pending_review_items:1,open_data_requests:0,active_support_sessions:0,active_members:2},incidents:globalThis.__phase7Incidents,access_reviews:[{id:"review-1",title:"Quarterly access review",status:"Open",due_at:"2026-09-30T23:59:59Z",created_at:new Date().toISOString()}],review_items:[{id:"item-1",campaign_id:"review-1",subject_user_id:worker,role_snapshot:"PCA",decision:"Pending",created_at:new Date().toISOString()}],data_requests:[],retention_policies:[{organization_id:org,audit_retention_days:2555,authentication_retention_days:365,evidence_retention_days:2555,export_metadata_retention_days:2555,legal_hold_enabled:true}],controls:[{name:"Forced row-level security",status:"Operating",owner:"Database"},{name:"Provider backup and recovery drill",status:"Verify externally",owner:"Operations"}]});
    authService={database:{getSecurityOperationsSnapshot:async()=>snapshot(),createSecurityIncident:async(_org,input)=>{globalThis.__phase7Incidents.push({id:"incident-1",organization_id:org,severity:input.severity,status:"Open",title:input.title,summary:input.summary,detected_at:new Date().toISOString()});return "incident-1";},startAccessReview:async()=>"review-2",submitDataLifecycleRequest:async()=>"request-1",saveRetentionPolicy:async()=>{},recordAccessReviewDecision:async()=>{},transitionSecurityIncident:async()=>{}}};
    authenticatedContext={user:{id:admin},appUser:{name:"Fictional Release QA",role:"organization-admin"},profile:{full_name:"Fictional Release QA"},membership:{organization_id:org,role:"Organisation Administrator"},memberships:[{organization_id:org,role:"Organisation Administrator",organizations:{name:"SkillWard Release QA"}}],organization:{id:org,name:"SkillWard Release QA",branding_settings:{}},departmentDetails:[],organizationMemberships:[{user_id:admin,role:"Organisation Administrator"},{user_id:worker,role:"PCA"}]};
    state.activeWorkspaceView="security";phase7SecuritySnapshot=null;phase7SecurityError="";renderAuthenticatedWorkspace();
  });
  await expect(page.getByRole("heading",{name:"Production assurance"})).toBeVisible();
  await expect(page.getByText("Provider backup and recovery drill")).toBeVisible();
  await page.locator('#phase7IncidentForm [name="severity"]').selectOption("High");
  await page.locator('#phase7IncidentForm [name="title"]').fill("Fictional QA incident");
  await page.locator('#phase7IncidentForm [name="summary"]').fill("Fictional evidence used to verify the incident response workflow.");
  await page.getByRole("button",{name:"Open incident"}).click();
  await expect(page.getByText("Fictional QA incident")).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({path:testInfo.outputPath("phase7-security-operations.png"),fullPage:true});
});
