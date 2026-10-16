#!/usr/bin/env bash
set -euo pipefail

readonly image="mcr.microsoft.com/playwright:v1.63.0-noble"
readonly staging_url="http://caddy:80"

readonly env_file="/home/multica-agent/.local/state/baznas-m6-staging/secrets/m6-uat.env"

if [[ ! -f "$env_file" || ! -O "$env_file" || "$(stat -c %a "$env_file")" != "600" ]]; then
  printf '%s\n' 'Refusing to run: protected UAT environment file is missing or has unsafe ownership/mode.' >&2
  exit 2
fi

base_url="$(sed -n 's/^M6_UAT_BASE_URL=//p' "$env_file" | head -n 1)"
if [[ "$base_url" != "$staging_url" && "$base_url" != "$staging_url/" ]]; then
  printf '%s\n' 'Refusing to run: M6_UAT_BASE_URL must be the isolated staging network URL.' >&2
  exit 2
fi

if [[ ! -f package-lock.json || ! -x node_modules/.bin/playwright ]]; then
  printf '%s\n' 'Run npm ci from scripts/m6-browser-uat before starting the browser container.' >&2
  exit 2
fi

required=(
  M6_UAT_BASE_URL M6_UAT_STAFF_USERNAME M6_UAT_STAFF_PASSWORD
  M6_UAT_FINANCE_USERNAME M6_UAT_FINANCE_PASSWORD
  M6_UAT_APPLICANT_NAME M6_UAT_APPLICANT_NIK M6_UAT_APPLICANT_KK
  M6_UAT_APPLICANT_PHONE M6_UAT_STAFF_CASE_NAME
  M6_UAT_PPD_REVIEW_CASE_NAME M6_UAT_DOCUMENT_NAME
)
for name in "${required[@]}"; do
  if ! grep -q "^${name}=." "$env_file"; then
    printf 'Missing required browser input: %s\n' "$name" >&2
    exit 2
  fi
done

exec docker run --rm --network baznas_m6_staging_web \
  --volume "$PWD:/work" --workdir /work \
  --env-file "$env_file" \
  --env M6_UAT_DOCKER_STAGING=1 \
  "$image" npx playwright test "$@"
