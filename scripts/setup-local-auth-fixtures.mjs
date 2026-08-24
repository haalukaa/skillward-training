import { createClient } from "@supabase/supabase-js";
import { FIXTURES, LOCAL_IDS, LOCAL_PASSWORD } from "../tests/e2e/fixtures.mjs";

const url = process.env.SKILLWARD_LOCAL_API_ENDPOINT?.trim();
const serviceRoleKey = process.env.SKILLWARD_LOCAL_SETUP_KEY?.trim();
if (!url || !serviceRoleKey) throw new Error("Local Supabase setup credentials are required.");
const host = new URL(url).hostname;
if (!new Set(["127.0.0.1", "localhost", "::1"]).has(host)) {
  throw new Error("Refusing to create CI users outside loopback Supabase.");
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function requireResult(label, request) {
  const { data, error } = await request;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function createLoginUser(account) {
  const data = await requireResult(
    `create ${account.email}`,
    admin.auth.admin.createUser({
      email: account.email,
      password: LOCAL_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: account.fullName, fixture: "skillward-phase-1-ci" }
    })
  );
  if (!data.user?.id) throw new Error(`Auth did not return a user for ${account.email}.`);
  return data.user;
}

const created = {};
for (const [project, accounts] of Object.entries(FIXTURES)) {
  created[project] = {};
  for (const [kind, account] of Object.entries(accounts)) {
    if (kind === "invitation") continue;
    created[project][kind] = await createLoginUser(account);
  }
}

const profiles = [];
const memberships = [];
const staffProfiles = [];
const departmentAssignments = [];
for (const [project, accounts] of Object.entries(FIXTURES)) {
  for (const [kind, account] of Object.entries(accounts)) {
    if (kind === "invitation" || kind === "unauthorized") continue;
    const user = created[project][kind];
    const suspended = kind === "suspended";
    profiles.push({
      user_id: user.id,
      full_name: account.fullName,
      employee_id: account.employeeId,
      email_display: account.email,
      account_status: suspended ? "Suspended" : "Active",
      employment_status: "Active",
      active_hospital_id: LOCAL_IDS.alphaFacility,
      active_organization_id: LOCAL_IDS.alphaOrganization,
      onboarding_completed_at: new Date().toISOString()
    });
    memberships.push({
      organization_id: LOCAL_IDS.alphaOrganization,
      user_id: user.id,
      role: account.role,
      membership_status: suspended ? "Suspended" : "Active",
      joined_at: new Date().toISOString()
    });
    staffProfiles.push({
      organization_id: LOCAL_IDS.alphaOrganization,
      user_id: user.id,
      employee_id: account.employeeId,
      employment_status: "Active"
    });
    if (!["management"].includes(kind)) {
      departmentAssignments.push({
        organization_id: LOCAL_IDS.alphaOrganization,
        facility_id: LOCAL_IDS.alphaFacility,
        department_id: LOCAL_IDS.alphaDepartment,
        user_id: user.id,
        role: account.role,
        is_active: true
      });
    }
    if (kind === "multiple") {
      memberships.push({
        organization_id: LOCAL_IDS.betaOrganization,
        user_id: user.id,
        role: "Cleaner",
        membership_status: "Active",
        joined_at: new Date().toISOString()
      });
      staffProfiles.push({
        organization_id: LOCAL_IDS.betaOrganization,
        user_id: user.id,
        employee_id: `${account.employeeId}-B`,
        employment_status: "Active"
      });
      departmentAssignments.push({
        organization_id: LOCAL_IDS.betaOrganization,
        facility_id: LOCAL_IDS.betaFacility,
        department_id: LOCAL_IDS.betaDepartment,
        user_id: user.id,
        role: "Cleaner",
        is_active: true
      });
    }
  }
}

await requireResult("insert fictional profiles", admin.from("user_profiles").insert(profiles));
await requireResult("insert fictional memberships", admin.from("organization_memberships").insert(memberships));
await requireResult("insert fictional staff profiles", admin.from("organization_staff_profiles").insert(staffProfiles));
await requireResult("insert fictional department assignments", admin.from("department_assignments").insert(departmentAssignments));

const trainingAssignments = [];
const trainerAssignments = [];
for (const project of Object.keys(FIXTURES)) {
  const worker = created[project].worker;
  const recovery = created[project].recovery;
  const trainer = created[project].trainer;
  for (const learner of [worker, recovery]) {
    trainingAssignments.push({
      hospital_id: LOCAL_IDS.alphaFacility,
      organization_id: LOCAL_IDS.alphaOrganization,
      facility_id: LOCAL_IDS.alphaFacility,
      department_id: LOCAL_IDS.alphaDepartment,
      user_id: learner.id,
      pathway_id: LOCAL_IDS.alphaPathway,
      status: "In Progress",
      progress_percentage: 25
    });
  }
  trainerAssignments.push({
    hospital_id: LOCAL_IDS.alphaFacility,
    organization_id: LOCAL_IDS.alphaOrganization,
    facility_id: LOCAL_IDS.alphaFacility,
    department_id: LOCAL_IDS.alphaDepartment,
    trainer_user_id: trainer.id,
    trainee_user_id: worker.id,
    trainer_role: "PCA Trainer",
    trainee_role: "PCA",
    is_active: true
  });
}
await requireResult("insert fictional training assignments", admin.from("training_assignments").insert(trainingAssignments));
await requireResult("insert fictional trainer assignments", admin.from("trainer_assignments").insert(trainerAssignments));
await requireResult(
  "set CI idle timeout",
  admin.from("organization_auth_settings")
    .update({ idle_timeout_minutes: 5 })
    .eq("organization_id", LOCAL_IDS.alphaOrganization)
);

console.log(`Created ${Object.values(created).flatMap(Object.values).length} fictional login-capable local Auth users.`);
