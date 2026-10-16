#!/usr/bin/env bash
set -Eeuo pipefail

ARCHIVE_FILE="${1:-}"
TARGET_DIR="${2:-/opt/web_baznas/volumes/uploads}"
CONFIRM_FLAG="${3:-}"

if [[ -z "${ARCHIVE_FILE}" || ! -f "${ARCHIVE_FILE}" ]]; then
  echo "Usage: $0 <PATH_TO_ARCHIVE> <TARGET_DIR> --confirm-restore"
  exit 1
fi

if [[ "${CONFIRM_FLAG}" != "--confirm-restore" ]]; then
  echo "FATAL: Explicit confirmation flag '--confirm-restore' required."
  exit 1
fi

mkdir -p "${TARGET_DIR}"

echo "=== Extracting persistent files to ${TARGET_DIR} ==="
tar -xzf "${ARCHIVE_FILE}" -C "${TARGET_DIR}" --strip-components=1

echo "✓ Persistent files restored to ${TARGET_DIR}"
