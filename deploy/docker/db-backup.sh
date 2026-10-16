#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR="${1:-/opt/web_baznas/backups}"
mkdir -p "${BACKUP_DIR}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DUMP_FILE="${BACKUP_DIR}/baznas_db_${TIMESTAMP}.dump"
DB_NAME="${DB_NAME:-baznas_db}"
DB_USER="${DB_USER:-baznas_user}"

echo "=== Creating PostgreSQL custom-format dump to ${DUMP_FILE} ==="

if [[ -f "/home/xruncy/repo/.env" ]]; then
  # Running on old host (system postgres)
  sudo -u postgres pg_dump -Fc --no-owner --no-acl "${DB_NAME}" > "${DUMP_FILE}"
else
  # Running in Docker environment
  docker compose -f compose.production.yml exec -T postgres pg_dump -U "${DB_USER}" -d "${DB_NAME}" -Fc --no-owner --no-acl > "${DUMP_FILE}"
fi

chmod 600 "${DUMP_FILE}"
sha256sum "${DUMP_FILE}" > "${DUMP_FILE}.sha256"

# Verify dump with pg_restore -l
if command -v pg_restore >/dev/null 2>&1; then
  pg_restore -l "${DUMP_FILE}" >/dev/null
  echo "✓ Dump verified with pg_restore --list"
fi

echo "✓ Backup created successfully: ${DUMP_FILE}"
echo "✓ SHA-256: $(cat "${DUMP_FILE}.sha256")"
