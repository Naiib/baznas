#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR="${1:-/opt/web_baznas/backups}"
RETENTION_DAYS="${2:-7}"

echo "=== Cleaning backups older than ${RETENTION_DAYS} days in ${BACKUP_DIR} ==="

if [[ ! -d "${BACKUP_DIR}" ]]; then
  echo "Backup directory ${BACKUP_DIR} does not exist; skipping."
  exit 0
fi

# Find and delete files older than RETENTION_DAYS
find "${BACKUP_DIR}" -type f \( -name "*.dump*" -o -name "*.tar.gz*" \) -mtime "+${RETENTION_DAYS}" -print -delete

echo "✓ Backup retention policy enforced."
