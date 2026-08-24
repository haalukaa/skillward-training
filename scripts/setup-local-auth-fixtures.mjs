import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { FIXTURES, LOCAL_IDS, LOCAL_PASSWORD } from "../tests/e2e/fixtures.mjs";

const url = process.env.SKILLWARD_LOCAL_API_ENDPOINT?.trim();
const serviceRoleKey = process.env.SKILLWARD_LOCAL_SETUP_KEY?.trim();
if (!url || !serviceRoleKey) throw new Error("Local Supabase setup credentials are required.");
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);
if (!loopbackHosts.has(new URL(url).hostname)) {
  throw new Error("Refusing to create CI users outside loopback Supabase.");
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function requireAuthResult(label, request) {
  const { data, error } = await request;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function createLoginUser(account) {
  const data = await requireAuthResult(
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

const trainingAssignments = [];
for (const project of Object.keys(FIXTURES)) {
  const worker = created[project].worker;
  const recovery = created[project].recovery;
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
}
function sqlValue(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insertRows(table, columns, rows) {
  const values = rows.map(row => `(${columns.map(column => sqlValue(row[column])).join(",")})`).join(",\n");
  return `insert into public.${table}(${columns.join(",")}) values\n${values};`;
}

const sql = [
  "begin;",
  insertRows("user_profiles", [
    "user_id", "full_name", "employee_id", "email_display", "account_status",
    "employment_status", "active_hospital_id", "active_organization_id", "onboarding_completed_at"
  ], profiles),
  insertRows("organization_memberships", [
    "organization_id", "user_id", "role", "membership_status", "joined_at"
  ], memberships),
  insertRows("organization_staff_profiles", [
    "organization_id", "user_id", "employee_id", "employment_status"
  ], staffProfiles),
  insertRows("department_assignments", [
    "organization_id", "facility_id", "department_id", "user_id", "role", "is_active"
  ], departmentAssignments),
  insertRows("training_assignments", [
    "hospital_id", "organization_id", "facility_id", "department_id", "user_id",
    "pathway_id", "status", "progress_percentage"
  ], trainingAssignments),
  `update public.organization_auth_settings set idle_timeout_minutes = 5 where organization_id = '${LOCAL_IDS.alphaOrganization}';`,
  "commit;"
].join("\n");

const childEnvironment = { ...process.env };
delete childEnvironment.SKILLWARD_LOCAL_SETUP_KEY;
const databaseSetup = spawnSync(
  "docker",
  ["exec", "-i", "supabase_db_skillward-local", "psql", "--username", "postgres",
    "--dbname", "postgres", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--quiet"],
  { input: sql, encoding: "utf8", env: childEnvironment }
);
if (databaseSetup.error || databaseSetup.status !== 0) {
  throw new Error(`Local database fixture setup failed: ${databaseSetup.stderr || databaseSetup.error?.message}`);
}

console.log(`Created ${Object.values(created).flatMap(Object.values).length} fictional login-capable local Auth users.`);
