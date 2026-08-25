#!/usr/bin/env bash
set -euo pipefail

supabase_cli="${SUPABASE_BIN:-supabase}"
baseline_version="20260823180919"
database_container="supabase_db_skillward-local"

run_sql() {
  local sql_file="$1"
  docker exec -i "$database_container" psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 < "$sql_file"
}

echo "Resetting the isolated local database to baseline ${baseline_version}."
"$supabase_cli" db reset --local --version "$baseline_version" --no-seed
run_sql scripts/phase9-production-shaped-fixture.sql
run_sql scripts/phase9-record-migration-counts.sql

echo "Applying every post-baseline migration in timestamp order."
"$supabase_cli" migration up --local
run_sql scripts/phase9-verify-migrated-state.sql

echo "Phase 9 production-shaped migration compatibility passed."
