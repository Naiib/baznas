#!/usr/bin/env bash
set -Eeuo pipefail

MODE="${1:-internal}" # internal or public
TARGET_HOST="${2:-127.0.0.1}"

echo "=== Running Smoke Checks (Mode: ${MODE}, Target: ${TARGET_HOST}) ==="

if [[ "${MODE}" == "internal" ]]; then
  # 1. Backend health
  echo "Checking backend health via docker exec..."
  docker compose -f compose.production.yml exec -T backend wget -qO- http://127.0.0.1:3001/api/health | grep -q '"status":"ready"'
  echo "✓ Backend is healthy and connected to PostgreSQL"

  # 2. Frontend response
  echo "Checking frontend /login..."
  docker compose -f compose.production.yml exec -T frontend wget -qO- http://127.0.0.1:3002/login | grep -q -i '<!DOCTYPE html>'
  echo "✓ Frontend login page renders"

  # 3. Proxy /up
  echo "Checking Caddy proxy /up..."
  docker compose -f compose.production.yml exec -T proxy wget -qO- http://127.0.0.1:80/up | grep -q 'OK'
  echo "✓ Caddy proxy is up"

elif [[ "${MODE}" == "public" ]]; then
  BASE_URL="https://${TARGET_HOST}"
  echo "Checking public HTTPS endpoints at ${BASE_URL}..."

  # 1. Login 200
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/login")
  if [[ "${HTTP_CODE}" != "200" ]]; then
    echo "FATAL: ${BASE_URL}/login returned HTTP ${HTTP_CODE} (expected 200)"
    exit 1
  fi
  echo "✓ Public /login returned 200 OK"

  # 2. API Health
  HEALTH=$(curl -s "${BASE_URL}/api/health")
  if ! echo "${HEALTH}" | grep -q '"status":"ready"'; then
    echo "FATAL: Public /api/health returned unexpected payload: ${HEALTH}"
    exit 1
  fi
  echo "✓ Public /api/health reports ready and PostgreSQL-backed"

  # 3. Unauthenticated export rejection
  EXPORT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/penerimaan/laporan/export")
  if [[ "${EXPORT_CODE}" != "401" && "${EXPORT_CODE}" != "403" ]]; then
    echo "FATAL: Unauthenticated export should return 401/403, got ${EXPORT_CODE}"
    exit 1
  fi
  echo "✓ Unauthenticated export is safely rejected with HTTP ${EXPORT_CODE}"

  # 4. Unsigned webhook rejection
  WEBHOOK_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/penerimaan/webhook/bsi" -H "Content-Type: application/json" -d '{"event":"test"}')
  if [[ "${WEBHOOK_CODE}" != "401" && "${WEBHOOK_CODE}" != "403" && "${WEBHOOK_CODE}" != "400" ]]; then
    echo "FATAL: Unsigned webhook should return 400/401/403, got ${WEBHOOK_CODE}"
    exit 1
  fi
  echo "✓ Unsigned webhook is safely rejected with HTTP ${WEBHOOK_CODE}"
fi

echo "=== All Smoke Checks Passed ==="
