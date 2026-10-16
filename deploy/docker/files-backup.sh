#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR="${1:-/opt/web_baznas/backups}"
mkdir -p "${BACKUP_DIR}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ARCHIVE_FILE="${BACKUP_DIR}/baznas_files_${TIMESTAMP}.tar.gz"

SOURCE_UPLOADS="${UPLOADS_DIR:-/home/xruncy/repo/uploads}"
if [[ ! -d "${SOURCE_UPLOADS}" ]]; then
  SOURCE_UPLOADS="./uploads"
fi

echo "=== Archiving persistent files from ${SOURCE_UPLOADS} ==="
tar -czf "${ARCHIVE_FILE}" -C "$(dirname "${SOURCE_UPLOADS}")" "$(basename "${SOURCE_UPLOADS}")"
chmod 600 "${ARCHIVE_FILE}"
sha256sum "${ARCHIVE_FILE}" > "${ARCHIVE_FILE}.sha256"

echo "✓ Persistent files archived: ${ARCHIVE_FILE}"
echo "✓ SHA-256: $(cat "${ARCHIVE_FILE}.sha256")"
