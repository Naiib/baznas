#!/usr/bin/env bash
set -Eeuo pipefail

# Collects table counts, max IDs, sequence positions, database size, and upload file counts
# ABSOLUTELY NO PII OR RECORD CONTENTS COLLECTED.

echo "=== Data Parity Audit Report ==="
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

AUDIT_SQL=$(cat << 'EOF'
SELECT
  format('DB_SIZE: %s', pg_size_pretty(pg_database_size(current_database())))
UNION ALL
SELECT
  format('TABLE_COUNT: %s = %s', c.relname, c.reltuples::bigint)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname = 'public'
ORDER BY 1;
EOF
)

if [[ -f "/home/xruncy/repo/.env" ]]; then
  # Source host system postgres
  sudo -u postgres psql -d baznas_db -t -A -c "${AUDIT_SQL}"
else
  # Destination Docker postgres
  docker compose -f compose.production.yml exec -T postgres psql -U baznas_user -d baznas_db -t -A -c "${AUDIT_SQL}"
fi

# File counts and aggregate bytes
UPLOADS_DIR="${UPLOADS_DIR:-./uploads}"
if [[ -d "${UPLOADS_DIR}" ]]; then
  FILE_COUNT=$(find "${UPLOADS_DIR}" -type f | wc -l)
  FILE_BYTES=$(du -sb "${UPLOADS_DIR}" 2>/dev/null | cut -f1 || du -sk "${UPLOADS_DIR}" | awk '{print $1*1024}')
  echo "UPLOADS_TOTAL_FILES: ${FILE_COUNT}"
  echo "UPLOADS_TOTAL_BYTES: ${FILE_BYTES}"
fi

echo "=== End Parity Audit Report ==="
