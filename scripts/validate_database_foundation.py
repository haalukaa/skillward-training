#!/usr/bin/env python3
"""Fail-fast static checks for the local Supabase database foundation."""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"

TABLES = (
    "hospitals", "departments", "user_profiles", "hospital_memberships",
    "department_memberships", "trainer_assignments", "trainer_capacity",
    "training_pathways", "training_modules", "lessons", "knowledge_questions",
    "knowledge_answer_options", "training_assignments", "module_progress",
    "knowledge_check_attempts", "practical_observations",
    "signoff_recommendations", "competency_records", "notifications",
    "staff_invitations", "transfer_history", "audit_logs",
    "organizations", "facilities", "organization_memberships",
    "organization_staff_profiles", "facility_assignments",
    "department_assignments", "organization_invitations",
    "skillward_administrators", "support_access_sessions",
)

files = sorted(MIGRATIONS.glob("*.sql"))
assert files, "No ordered SQL migrations were found"
assert [path.name for path in files] == sorted(path.name for path in files), (
    "Migration filenames are not lexically ordered"
)
sql = "\n".join(path.read_text(encoding="utf-8").lower() for path in files)

for table in TABLES:
    assert f"create table public.{table}" in sql, f"Missing table: {table}"
    assert f"'{table}'" in sql and "enable row level security" in sql, (
        f"Missing RLS registration: {table}"
    )

test_sql = (ROOT / "supabase" / "tests" / "database.test.sql").read_text(
    encoding="utf-8"
)
plan = re.search(r"select\s+plan\((\d+)\)", test_sql, re.IGNORECASE)
assert plan and int(plan.group(1)) == 39, "pgTAP plan must contain exactly 39 assertions"

phase_one_test_sql = (ROOT / "supabase" / "tests" / "multi_organization.test.sql").read_text(
    encoding="utf-8"
)
phase_one_plan = re.search(r"select\s+plan\((\d+)\)", phase_one_test_sql, re.IGNORECASE)
assert phase_one_plan and int(phase_one_plan.group(1)) == 40, (
    "Phase 1 pgTAP plan must contain exactly 40 assertions"
)

env_lines = (ROOT / ".env.example").read_text(encoding="utf-8").splitlines()
values = {
    key: value
    for line in env_lines
    if line and not line.startswith("#") and "=" in line
    for key, value in [line.split("=", 1)]
}
assert values == {"SUPABASE_URL": "", "SUPABASE_ANON_KEY": ""}, (
    ".env.example must contain only empty browser-safe Supabase variables"
)
assert "enable_signup = false" in (ROOT / "supabase" / "config.toml").read_text(
    encoding="utf-8"
), "Local open sign-up must remain disabled"

bootstrap_path = ROOT / "scripts" / "bootstrap-development-admin.sql"
bootstrap = bootstrap_path.read_text(encoding="utf-8")
bootstrap_lower = bootstrap.lower()
assert "begin;" in bootstrap_lower and "commit;" in bootstrap_lower
assert "from auth.users" in bootstrap_lower and "email_confirmed_at" in bootstrap_lower
assert "matched_auth_count <> 1" in bootstrap
assert "'organisation administrator'" in bootstrap_lower
assert "public.organization_memberships" in bootstrap_lower
assert "public.organization_staff_profiles" in bootstrap_lower
assert "active_organization_id" in bootstrap_lower
assert "count(*)" in bootstrap_lower and "<> 1" in bootstrap
for forbidden in (
    "disable row level security", "grant execute", "grant all", "service_role",
    "create function", "create or replace function",
):
    assert forbidden not in bootstrap_lower, f"Unsafe bootstrap SQL: {forbidden}"

# The bootstrap may be statically validated, but must never be loaded by a
# migration, seed, application startup, package script, or build script.
automatic_files = [ROOT / "supabase" / "seed.sql", ROOT / "package.json"]
automatic_files += sorted(MIGRATIONS.glob("*.sql"))
automatic_files += sorted((ROOT / "src").glob("*.js"))
automatic_files += [ROOT / "app.js", ROOT / "scripts" / "build.mjs"]
for path in automatic_files:
    assert bootstrap_path.name not in path.read_text(encoding="utf-8"), (
        f"Bootstrap must not be referenced by automatic execution path: {path}"
    )

platform_bootstrap = ROOT / "scripts" / "bootstrap-skillward-super-admin.sql"
platform_sql = platform_bootstrap.read_text(encoding="utf-8").lower()
assert "begin;" in platform_sql and "commit;" in platform_sql
assert "from auth.users" in platform_sql and "public.skillward_administrators" in platform_sql
for forbidden in ("disable row level security", "grant all", "service_role", "create function"):
    assert forbidden not in platform_sql, f"Unsafe platform bootstrap SQL: {forbidden}"
for path in automatic_files:
    assert platform_bootstrap.name not in path.read_text(encoding="utf-8"), (
        f"Platform bootstrap must not be automatically executed: {path}"
    )

print(f"Validated {len(files)} ordered migrations, {len(TABLES)} RLS tables, "
      "79 pgTAP assertions, and the manual bootstrap safety contract.")
