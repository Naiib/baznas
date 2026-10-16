#!/usr/bin/env bash
set -Eeuo pipefail

# Rollback procedure executed AFTER destination writes have occurred
echo "=== EXECUTING POST-WRITE REVERSE ROLLBACK ==="

echo "Step 1: Freeze destination writes immediately"
docker compose -f compose.production.yml stop backend frontend

echo "Step 2: Dump latest database and persistent files from Hostinger"
BACKUP_DIR="/opt/web_baznas/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REVERSE_DUMP="${BACKUP_DIR}/reverse_sync_${TIMESTAMP}.dump"
docker compose -f compose.production.yml exec -T postgres pg_dump -U baznas_user -d baznas_db -Fc --no-owner --no-acl > "${REVERSE_DUMP}"
sha256sum "${REVERSE_DUMP}" > "${REVERSE_DUMP}.sha256"

echo "Step 3: Transfer reverse dump to old VPS and restore"
echo "Target dump ready at: ${REVERSE_DUMP}"
echo "Step 4: Once restored and parity confirmed on old VPS, revert DNS A records to 103.189.235.61"
