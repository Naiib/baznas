#!/usr/bin/env bash
set -Eeuo pipefail

# Rollback procedure executed BEFORE any destination write occurs
echo "=== EXECUTING PRE-WRITE ROLLBACK ==="

echo "Step 1: Stop and disable web_baznas containers on Hostinger"
docker compose -f compose.production.yml stop || true

echo "Step 2: DNS Rollback Notice"
echo "Point A records for muhammadrofiq.my.id and portal.muhammadrofiq.my.id back to old VPS: 103.189.235.61"

echo "Step 3: Ensure PM2 services are running on old VPS"
echo "On old VPS (103.189.235.61), verify: pm2 restart baznas-backend baznas-frontend-next"

echo "=== Pre-Write Rollback Sequence Prepared ==="
