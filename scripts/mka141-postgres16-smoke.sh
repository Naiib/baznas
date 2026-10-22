#!/usr/bin/env bash
set -euo pipefail

tag="mka141-${MULTICA_TASK_ID:-local}-$$"
network="${tag}-net"
pg_name="${tag}-postgres16"
api_name="${tag}-backend"
pg_port="${MKA141_PG16_PORT:-55439}"
api_port="${MKA141_API_PORT:-55401}"
test_password='Mka141SyntheticOnly_2026'
backup_dir="$(mktemp -d "${TMPDIR:-/tmp}/mka141-pg16-backup.XXXXXX")"
backup_path="${backup_dir}/mustahik-legacy.json"

cleanup() {
  docker rm -f "$api_name" "$pg_name" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf -- "$backup_dir"
}
trap cleanup EXIT

docker network create --label "multica.task_id=${MULTICA_TASK_ID:-local}" --label multica.lifecycle=temporary-test "$network" >/dev/null
docker run -d --name "$pg_name" --network "$network" \
  --label "multica.task_id=${MULTICA_TASK_ID:-local}" --label multica.lifecycle=temporary-test \
  -e POSTGRES_USER=mka141 -e POSTGRES_PASSWORD="$test_password" \
  -e POSTGRES_DB=baznas_mka141_test -p "127.0.0.1:${pg_port}:5432" postgres:16-alpine >/dev/null
multica test-resource register --type docker_container --id "$pg_name" --name 'MKA-141 disposable PostgreSQL 16' --lifecycle temporary-test

for attempt in $(seq 1 40); do
  if docker exec "$pg_name" pg_isready -U mka141 -d baznas_mka141_test >/dev/null 2>&1; then break; fi
  if [ "$attempt" -eq 40 ]; then docker logs "$pg_name"; exit 1; fi
  sleep 1
done

docker run -d --name "$api_name" --network "$network" \
  --label "multica.task_id=${MULTICA_TASK_ID:-local}" --label multica.lifecycle=temporary-test \
  -e NODE_ENV=production -e PORT=3001 \
  -e DATABASE_URL="postgresql://mka141:${test_password}@${pg_name}:5432/baznas_mka141_test" \
  -e JWT_SECRET='MKA141 synthetic test secret only, not for deployment 2026-10-21' \
  -e PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY='9f8e7d6c5b4a392817161514131211109f8e7d6c5b4a39281716151413121110' \
  -p "127.0.0.1:${api_port}:3001" baznas-mka141-backend:test >/dev/null
multica test-resource register --type docker_container --id "$api_name" --name 'MKA-141 backend PostgreSQL 16 smoke test' --lifecycle temporary-test

for attempt in $(seq 1 40); do
  status="$(docker inspect -f '{{.State.Status}}' "$api_name")"
  if [ "$status" != 'running' ]; then docker logs "$api_name"; exit 1; fi
  if curl --fail --silent --show-error "http://127.0.0.1:${api_port}/api/health" >"${backup_dir}/health.json"; then break; fi
  if [ "$attempt" -eq 40 ]; then docker logs "$api_name"; exit 1; fi
  sleep 1
done

# Use only deterministic synthetic records in the disposable database.
docker exec "$pg_name" psql -v ON_ERROR_STOP=1 -U mka141 -d baznas_mka141_test -c \
  "INSERT INTO mustahik (file_no,name,nik,kk_number,phone,address,program,request_title,status,recommended_amount,survey_date,surveyor_name,family_dependents,monthly_income,survey_recommendation,asnaf,desil_score,ppd_number,disbursement_date,bank_account,bank_name,bank_account_name,approved_amount) VALUES ('MKA141-SYNTH-1','Synthetic MKA141 Recipient','3174010101010001','3174010101010002','081200001111','Synthetic Road','Kesehatan','Synthetic assistance','Diajukan',1250000,'2026-01-02','Synthetic Surveyor',2,500000,'Synthetic recommendation','Fakir',2,'MKA141-PPD-1','2026-01-30','123456789','Synthetic Bank','Synthetic Recipient',1250000);" >/dev/null

MKA141_TEST_DATABASE_URL="postgresql://mka141:${test_password}@127.0.0.1:${pg_port}/baznas_mka141_test" \
  npm run mustahik:normalize:test-db -- --backup-path "$backup_path"

docker exec "$pg_name" psql -v ON_ERROR_STOP=1 -U mka141 -d baznas_mka141_test -At -c \
  "SELECT 'profiles=' || (SELECT COUNT(*) FROM mustahik_profiles) || ', applications=' || (SELECT COUNT(*) FROM mustahik_applications) || ', surveys=' || (SELECT COUNT(*) FROM mustahik_surveys) || ', disbursements=' || (SELECT COUNT(*) FROM mustahik_disbursements) || ', legacy=' || (SELECT COUNT(*) FROM mustahik WHERE file_no='MKA141-SYNTH-1');"
printf 'postgres_container=%s status=%s version=' "$pg_name" "$(docker inspect -f '{{.State.Status}}' "$pg_name")"
docker exec "$pg_name" psql -U mka141 -d baznas_mka141_test -At -c 'SHOW server_version;'
printf 'backend_container=%s status=%s\n' "$api_name" "$(docker inspect -f '{{.State.Status}}' "$api_name")"
printf 'health_endpoint=http://127.0.0.1:%s/api/health response=' "$api_port"
cat "${backup_dir}/health.json"
