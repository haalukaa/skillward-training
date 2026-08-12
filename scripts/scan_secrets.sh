#!/usr/bin/env bash
set -euo pipefail

# Scan tracked content only, avoiding Git metadata and generated local services.
# The expressions detect populated Supabase variables, JWT-like tokens, database
# URLs, and common private-key headers without printing a discovered value.
patterns=(
  'SUPABASE_(URL|ANON_KEY)[[:space:]]*=[[:space:]]*[^[:space:]#]+'
  'SUPABASE_(SERVICE_ROLE_KEY|DB_PASSWORD)[[:space:]]*='
  'postgres(ql)?://[^[:space:]]+'
  'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'
  'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY'
)

for pattern in "${patterns[@]}"; do
  if git grep -IEl "$pattern" -- ':!scripts/scan_secrets.sh' >/dev/null; then
    echo "Potential committed secret detected; refusing to continue." >&2
    exit 1
  fi
done

echo "Tracked-file secret scan passed."
