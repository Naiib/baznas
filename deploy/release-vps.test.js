import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const scriptPath = new URL('./release-vps.sh', import.meta.url);
const workflowPath = new URL('../.github/workflows/deploy.yml', import.meta.url);
const scriptFsPath = fileURLToPath(scriptPath);
const bashScriptPath = process.platform === 'win32'
  ? `/${scriptFsPath[0].toLowerCase()}${scriptFsPath.slice(2).replaceAll('\\', '/')}`
  : scriptFsPath;
const bashPath = process.platform === 'win32'
  ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'].find((candidate) => fs.existsSync(candidate))
  : 'bash';

test('VPS release script builds deterministic dependencies and verifies both services', () => {
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /require_release_preflight/);
  assert.match(script, /TARGET_SHA=.*full-commit-sha/);
  assert.match(script, /TARGET_SHA="\$\{TARGET_SHA,,\}"/);
  assert.match(script, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(script, /DATABASE_URL/);
  assert.match(script, /JWT_SECRET/);
  assert.match(script, /FRONTEND_URL/);
  assert.match(script, /PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY/);
  assert.doesNotMatch(script, /set -x|printenv/);
  assert.match(script, /missing required variable names/);
  assert.match(script, /git fetch .*origin main/);
  assert.match(script, /git reset --hard "\$TARGET_SHA"/);
  assert.match(script, /npm ci/);
  assert.match(script, /npm run build/);
  assert.match(script, /frontend-next[\s\S]*npm ci/);
  assert.match(script, /npm run build/);
  assert.match(script, /pm2 restart baznas-frontend-next/);
  assert.match(script, /NODE_ENV=production pm2 restart baznas-backend/);
  assert.match(script, /NODE_ENV=production pm2 start npm/);
  assert.match(script, /127\.0\.0\.1:3001\/api\/health/);
  assert.match(script, /database_engine.*postgresql/);
  assert.match(script, /127\.0\.0\.1:3002\/penerimaan/);
  assert.match(script, /https:\/\/\$\{host\}\/login/);
  assert.match(script, /https:\/\/\$\{host\}\/penyaluran/);
  assert.match(script, /--resolve/);
  assert.match(script, /webhook/);
  assert.match(script, /laporan\/export/);
  assert.match(script, /wait_for_webhook_smoke/);
  assert.match(script, /wait_for_http_status 401 .*laporan\/export/);
  assert.match(script, /git reset --hard "\$PREVIOUS_SHA"/);
});

test('Webhook smoke accepts configured rejection or only the safe unconfigured response', () => {
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /wait_for_webhook_smoke\(\)/);
  assert.match(script, /\[\[ "\$status" == "401" \]\]/);
  assert.match(script, /\[\[ "\$status" == "500" \]\]/);
  assert.match(script, /Terjadi kesalahan sistem\./);
  assert.match(script, /correlation_id/);
  assert.match(script, /WEBHOOK_SMOKE_CORRELATION_ID/);
  assert.match(script, /success.*false/);
  assert.doesNotMatch(script, /wait_for_http_status 401 .*webhook.* POST/);

  const webhookSmoke = script.match(/wait_for_webhook_smoke\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(webhookSmoke, /mktemp/);
  assert.match(webhookSmoke, /rm -f/);
  assert.match(webhookSmoke, /sleep 2/);
  assert.match(webhookSmoke, /curl/);
  assert.match(webhookSmoke, /exit 1/);
});

test('Webhook smoke checker behaviorally accepts only safe rejection responses', () => {
  assert.ok(bashPath, 'a Bash runtime is required to execute the release smoke checker');
  const cases = [
    { name: 'configured 401', status: '401', body: '{"success":false}', expected: 0 },
    {
      name: 'unconfigured generic 500',
      status: '500',
      body: '{"success":false,"message":"Terjadi kesalahan sistem.","correlation_id":"release-smoke-webhook"}',
      expected: 0,
    },
    { name: 'successful 200', status: '200', body: '{"success":true}', expected: 1 },
    { name: 'detailed 500', status: '500', body: '{"success":false,"message":"PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY is required"}', expected: 1 },
    { name: 'malformed 500', status: '500', body: '{"success":false,"message":"Terjadi kesalahan sistem."}', expected: 1 },
    { name: 'unexpected 422', status: '422', body: '{"success":false}', expected: 1 },
    { name: 'connection failure', status: '', body: '', curlFailure: true, expected: 1 },
  ];

  for (const smokeCase of cases) {
    const result = spawnSync(bashPath, ['-c', [
      'source "$RELEASE_SCRIPT_PATH" dummy',
      'sleep() { :; }',
      'curl() {',
      '  local out=""',
      '  while (($#)); do',
      '    if [[ "$1" == "-o" ]]; then out="$2"; shift 2; else shift; fi',
      '  done',
      '  if [[ "${MOCK_CURL_FAILURE:-0}" == "1" ]]; then return 7; fi',
      '  printf "%s" "$MOCK_BODY" > "$out"',
      '  printf "%s" "$MOCK_STATUS"',
      '}',
      'wait_for_webhook_smoke http://127.0.0.1:3001/api/penerimaan/webhook/portal',
    ].join('\n')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        RELEASE_SCRIPT_PATH: bashScriptPath,
        MOCK_STATUS: smokeCase.status,
        MOCK_BODY: smokeCase.body,
        MOCK_CURL_FAILURE: smokeCase.curlFailure ? '1' : '0',
      },
    });
    assert.equal(result.status, smokeCase.expected, `${smokeCase.name}: ${result.stderr}`);
  }
});

test('GitHub workflow is manual, approval-gated, and blocks deploy on the full backend suite', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.doesNotMatch(workflow, /push:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /confirm_deploy/);
  assert.match(workflow, /node --test(?: --test-concurrency=1)? server\/\*\.test\.js/);
  assert.match(workflow, /node --test --test-concurrency=1 server\/\*\.test\.js/);
  assert.match(workflow, /needs:\s*validate/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /github\.event_name.*workflow_dispatch/);
  assert.doesNotMatch(workflow, /appleboy\/scp-action/);
  assert.doesNotMatch(workflow, /npm install --omit=dev/);
  assert.match(workflow, /uses: actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /uses: actions\/setup-node@[0-9a-f]{40}/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /release-vps\.sh/);
  assert.match(workflow, /TARGET_SHA/);
  assert.doesNotMatch(workflow, /secrets\.[A-Z_]+[^\n]*\$\{\{/);
});
