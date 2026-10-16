#!/usr/bin/env bash
set -Eeuo pipefail

# Preflight check for Hostinger Docker host
echo "=== Starting Preflight Validation ==="

# 1. Check Docker and Docker Compose
command -v docker >/dev/null 2>&1 || { echo "FATAL: docker command not found"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "FATAL: docker compose not found"; exit 1; }
echo "✓ Docker and Docker Compose installed"

# 2. Check ports 80 and 443 are free or bound only to Caddy
for port in 80 443; do
  if ss -tulpn | grep -q ":${port} "; then
    PROC=$(ss -tulpn | grep ":${port} " || true)
    if ! echo "$PROC" | grep -q -E '(caddy|docker-proxy)'; then
      echo "FATAL: Port ${port} is occupied by non-Docker process: $PROC"
      exit 1
    fi
  fi
done
echo "✓ Ports 80 and 443 are available or managed by Docker"

# 3. Check 9router on port 32768 is untouched
if ! ss -tulpn | grep -q ":32768 "; then
  echo "WARNING: Port 32768 (9router) not detected listening; checking container status..."
fi
if docker ps --format '{{.Names}}' | grep -q "9router"; then
  echo "✓ 9router container is running and preserved"
fi

# 4. Check directory structure
ROOT_DIR="${TARGET_ROOT:-/opt/web_baznas}"
for dir in repo secrets backups incoming runbooks; do
  if [[ ! -d "${ROOT_DIR}/${dir}" ]]; then
    echo "Directory ${ROOT_DIR}/${dir} will be created by deployment scripts"
  fi
done

echo "=== Preflight Validation Passed ==="
