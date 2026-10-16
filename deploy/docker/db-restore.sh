#!/usr/bin/env bash
set -Eeuo pipefail

DUMP_FILE="${1:-}"
CONFIRM_FLAG="${2:-}"

if [[ -z "${DUMP_FILE}" || ! -f "${DUMP_FILE}" ]]; then
  echo "Usage: $0 <PATH_TO_DUMP_FILE> --confirm-restore"
  exit 1
fi

if [[ "${CONFIRM_FLAG}" != "--confirm-restore" ]]; then
  echo "FATAL: Explicit confirmation flag '--confirm-restore' required to prevent accidental restore."
  exit 1
fi

# Check SHA256 if checksum file exists
if [[ -f "${DUMP_FILE}.sha256" ]]; then
  echo "Verifying SHA-256 checksum..."
  (cd "$(dirname "${DUMP_FILE}")" && sha256sum -c "$(basename "${DUMP_FILE}").sha256")
  echo "✓ Checksum matches"
fi

DB_NAME="${DB_NAME:-baznas_db}"
DB_USER="${DB_USER:-baznas_user}"

echo "=== Restoring ${DUMP_FILE} into ${DB_NAME} ==="
docker compose -f compose.production.yml exec -T postgres pg_restore \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl < "${DUMP_FILE}"

echo "=== Verifying restored database connectivity ==="
docker compose -f compose.production.yml exec -T postgres psql \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -v ON_ERROR_STOP=1 \
  -Atqc 'SELECT 1' >/dev/null

echo "=== Database restore finished ==="
