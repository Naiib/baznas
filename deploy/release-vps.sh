#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${BAZNAS_REPO_DIR:-/home/xruncy/repo}"
ENV_FILE="${BAZNAS_ENV_FILE:-$REPO_DIR/.env}"
TARGET_SHA="${1:?Usage: release-vps.sh <full-commit-sha>}"
TARGET_SHA="${TARGET_SHA,,}"
PREVIOUS_SHA=""
RELEASE_SUCCEEDED=0

has_configured_value() {
  local name="$1"
  local value="${!name:-}"
  if [[ -n "$value" ]]; then
    return 0
  fi

  # The application loads .env itself. Inspect only names and whether a value
  # is present; never print or export deployment secrets from this script.
  [[ -f "$ENV_FILE" ]] || return 1
  grep -Eq "^[[:space:]]*(export[[:space:]]+)?${name}[[:space:]]*=[[:space:]]*[^[:space:]#]" "$ENV_FILE"
}

is_production_environment() {
  if [[ "${NODE_ENV:-}" == "production" ]]; then
    return 0
  fi
  [[ -f "$ENV_FILE" ]] || return 1
  grep -Eq "^[[:space:]]*(export[[:space:]]+)?NODE_ENV[[:space:]]*=[[:space:]]*[\"']?production[\"']?[[:space:]]*(#.*)?$" "$ENV_FILE"
}

require_release_preflight() {
  local missing=()

  if ! is_production_environment; then
    echo "Release preflight failed: NODE_ENV=production is required." >&2
    return 1
  fi
  if ! has_configured_value DATABASE_URL; then
    missing+=(DATABASE_URL)
  fi
  if ! has_configured_value JWT_SECRET; then
    missing+=(JWT_SECRET)
  fi
  if ! has_configured_value FRONTEND_URL; then
    missing+=(FRONTEND_URL)
  fi
  if ! has_configured_value PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY; then
    missing+=(PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY)
  fi
  if (( ${#missing[@]} > 0 )); then
    echo "Release preflight failed; missing required variable names: ${missing[*]}" >&2
    return 1
  fi
}

restart_services() {
  if pm2 describe baznas-frontend-next >/dev/null 2>&1; then
    pm2 restart baznas-frontend-next --update-env
  else
    pm2 start frontend-next/ecosystem.config.cjs --update-env
  fi

  if pm2 describe baznas-backend >/dev/null 2>&1; then
    NODE_ENV=production pm2 restart baznas-backend --update-env
  else
    NODE_ENV=production pm2 start npm --name baznas-backend --update-env -- run server
  fi
}

wait_for_http() {
  local url="$1"
  shift
  local curl_args=( "$@" )
  local attempts=20
  while (( attempts > 0 )); do
    if curl -fsS --max-time 3 "${curl_args[@]}" "$url" >/dev/null; then
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 2
  done
  echo "Health check failed: $url" >&2
  return 1
}

wait_for_postgres_health() {
  local attempts=20
  local body=""
  while (( attempts > 0 )); do
    if body="$(curl -fsS --max-time 3 "http://127.0.0.1:3001/api/health")" \
      && [[ "$body" == *'"status":"ready"'* ]] \
      && [[ "$body" == *'"database_engine":"postgresql"'* ]]; then
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 2
  done
  echo "PostgreSQL readiness check failed." >&2
  return 1
}

wait_for_public_frontend() {
  local host="${BAZNAS_PUBLIC_HOST:-muhammadrofiq.my.id}"
  local frontend_args=(
    "--insecure"
    "--resolve" "${host}:443:127.0.0.1"
    "--header" "Host: ${host}"
  )
  wait_for_http "https://${host}/login" "${frontend_args[@]}"
  wait_for_http "https://${host}/penyaluran" "${frontend_args[@]}"
  wait_for_http "https://${host}/penerimaan" "${frontend_args[@]}"
}

wait_for_http_status() {
  local expected_status="$1"
  local url="$2"
  local method="${3:-GET}"
  local attempts=20
  local status=""
  local curl_args=( -sS -o /dev/null -w '%{http_code}' --max-time 3 -X "$method" )
  if [[ "$method" == "POST" ]]; then
    curl_args+=( -H 'Content-Type: application/json' --data '{"release_smoke":true}' )
  fi
  while (( attempts > 0 )); do
    if status="$(curl "${curl_args[@]}" "$url")" && [[ "$status" == "$expected_status" ]]; then
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 2
  done
  echo "Smoke check failed: $method $url (expected HTTP $expected_status)" >&2
  return 1
}

WEBHOOK_SMOKE_CORRELATION_ID="release-smoke-webhook"

is_safe_unconfigured_webhook_body() {
  local body_file="$1"
  local body=""
  body="$(< "$body_file")"
  [[ "$body" == "{\"success\":false,\"message\":\"Terjadi kesalahan sistem.\",\"correlation_id\":\"$WEBHOOK_SMOKE_CORRELATION_ID\"}" ]]
}

wait_for_webhook_smoke() {
  local url="$1"
  local attempts=20
  while (( attempts > 0 )); do
    if (
      body_file=""
      trap 'if [[ -n "${body_file:-}" ]]; then rm -f -- "$body_file"; fi' EXIT
      body_file="$(mktemp)" || {
        echo "Webhook smoke check could not create a temporary response file." >&2
        exit 1
      }
      status=""
      if ! status="$(curl -sS -o "$body_file" -w '%{http_code}' --max-time 3 -X POST \
        -H 'Content-Type: application/json' \
        -H "X-Correlation-ID: $WEBHOOK_SMOKE_CORRELATION_ID" \
        --data '{"release_smoke":true}' "$url")"; then
        status=""
      fi

      # A configured provider rejects the unsigned body with 401. When the
      # provider is intentionally unconfigured, only the generic correlated 500
      # response is acceptable; neither path records or processes an event.
      if [[ "$status" == "401" ]]; then
        exit 0
      fi
      if [[ "$status" == "500" ]] && is_safe_unconfigured_webhook_body "$body_file"; then
        exit 0
      fi
      exit 1
    ); then
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 2
  done
  echo "Webhook smoke check failed: unsigned body was not safely rejected." >&2
  return 1
}

run_smoke_checks() {
  wait_for_postgres_health
  wait_for_http "http://127.0.0.1:3002/penerimaan"
  wait_for_public_frontend
  # An unsigned body must be rejected before recording/processing any event.
  wait_for_webhook_smoke "http://127.0.0.1:3001/api/penerimaan/webhook/portal"
  # An unauthenticated export request must be rejected before creating a job.
  wait_for_http_status 401 "http://127.0.0.1:3001/api/penerimaan/laporan/export"
}

rollback() {
  local exit_code=$?
  trap - ERR
  if [[ "$RELEASE_SUCCEEDED" -eq 0 && -n "$PREVIOUS_SHA" ]]; then
    echo "Release failed; restoring $PREVIOUS_SHA" >&2
    set +e
    cd "$REPO_DIR"
    git reset --hard "$PREVIOUS_SHA"
    npm ci
    npm ci --prefix frontend
    npm run build
    restart_services
    pm2 save
  fi
  exit "$exit_code"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  if [[ ! "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Target release must be a full 40-character commit SHA." >&2
    exit 1
  fi
  require_release_preflight

  cd "$REPO_DIR"
  PREVIOUS_SHA="$(git rev-parse HEAD)"
  trap rollback ERR

  git fetch --no-tags origin main
  git cat-file -e "${TARGET_SHA}^{commit}"
  if [[ "$(git rev-parse origin/main)" != "$TARGET_SHA" ]]; then
    echo "Target rilis harus identik dengan commit terbaru origin/main." >&2
    exit 1
  fi
  git reset --hard "$TARGET_SHA"

  npm ci
  npm ci --prefix frontend
  npm run build

  restart_services
  run_smoke_checks
  pm2 save
  RELEASE_SUCCEEDED=1
  echo "Release complete: $TARGET_SHA"
fi
