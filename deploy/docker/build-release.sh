#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_SHA="${1:-}"
if [[ -z "${TARGET_SHA}" ]]; then
  echo "Usage: $0 <EXPECTED_COMMIT_SHA>"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_DIR}"

CURRENT_SHA="$(git rev-parse HEAD)"
if [[ "${CURRENT_SHA}" != "${TARGET_SHA}"* ]]; then
  echo "FATAL: Current commit ${CURRENT_SHA} does not match expected target ${TARGET_SHA}"
  exit 1
fi

echo "=== Building Docker Compose Stack for ${CURRENT_SHA} ==="
docker compose -f compose.production.yml build --pull

echo "=== Recording Image Digests ==="
docker compose -f compose.production.yml images --format "table {{.Repository}}:{{.Tag}}\t{{.ID}}"

echo "=== Build and Release Complete ==="
