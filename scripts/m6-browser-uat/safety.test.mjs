import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUatConfig } from './safety.mjs';
import { correlateFailedRequest, enqueueRequestDiagnostic, flushRequestDiagnostics, isSpeculativeRscAbort, isSupersededRscNavigationAbort, normalizedRequestPath } from './request-diagnostics.mjs';

const validEnv = {
  M6_UAT_BASE_URL: 'http://127.0.0.1:3002/',
  M6_UAT_STAFF_USERNAME: 'm6-uat-staff-synthetic',
  M6_UAT_STAFF_PASSWORD: 'staff-secret',
  M6_UAT_FINANCE_USERNAME: 'm6-uat-finance-synthetic',
  M6_UAT_FINANCE_PASSWORD: 'finance-secret',
  M6_UAT_APPLICANT_NAME: 'M6 UAT Synthetic Applicant',
  M6_UAT_APPLICANT_NIK: '9900000000000001',
  M6_UAT_APPLICANT_KK: '9900000000000002',
  M6_UAT_APPLICANT_PHONE: '00000000000',
  M6_UAT_STAFF_CASE_NAME: 'M6 UAT Completed Case',
  M6_UAT_PPD_REVIEW_CASE_NAME: 'M6 UAT PPD Review Case',
  M6_UAT_DOCUMENT_NAME: 'M6-UAT-identity.pdf',
};

test('fails closed when required staging values are absent', () => {
  assert.throws(() => resolveUatConfig({}), /M6_UAT_BASE_URL/);
});

test('request diagnostics normalize dynamic path segments without query or values', () => {
  assert.equal(normalizedRequestPath('/penyaluran/mustahik/123?nik=secret'), '/penyaluran/mustahik/[id]');
});

test('asynchronous failed-request diagnostics flush into browser problems before assertion', async () => {
  const pending = new Set();
  const problems = [];
  enqueueRequestDiagnostic(pending, async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return 'GET http://staging.test/api/[id] resource=fetch error=net::ERR_FAILED';
  }, problems);
  assert.equal(problems.length, 0);
  await flushRequestDiagnostics(pending);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /network request failed/);
});

test('deferred request diagnostics correlate against navigation state at flush time', async () => {
  const pending = new Set();
  const problems = [];
  const state = { route: '/login' };
  enqueueRequestDiagnostic(pending, async () => `route=${state.route}`, problems);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(problems.length, 0);
  state.route = '/penyaluran/mustahik';
  await flushRequestDiagnostics(pending);
  assert.deepEqual(problems, ['browser network request failed: route=/penyaluran/mustahik']);
});

test('RSC abort correlation distinguishes a superseded route from an important request failure', () => {
  const makeRequest = () => ({
    url: () => 'http://caddy/penyaluran/123?secret=value',
    method: () => 'GET',
    resourceType: () => 'fetch',
    failure: () => ({ errorText: 'net::ERR_ABORTED' }),
  });
  const superseded = correlateFailedRequest({
    request: makeRequest(),
    requestInfo: { routePath: '/penyaluran/[id]', at: 10, headers: { rsc: '1', 'next-router-prefetch': '1' }, frameSequence: 2 },
    routePath: '/penyaluran/mustahik',
    events: [{ type: 'response', routePath: '/penyaluran/mustahik', path: '/penyaluran/mustahik', resource: 'fetch', status: 200, at: 15 }],
    elapsedMs: 25,
  });
  assert.match(superseded, /route-changed=true/);
  assert.match(superseded, /replacement-response=true/);
  assert.doesNotMatch(superseded, /secret|123/);

  const important = correlateFailedRequest({
    request: makeRequest(),
    requestInfo: { routePath: '/penyaluran/[id]', at: 10, headers: { rsc: '1' }, frameSequence: 2 },
    routePath: '/penyaluran/[id]',
    events: [],
    elapsedMs: 25,
  });
  assert.match(important, /route-changed=false/);
  assert.match(important, /replacement-response=false/);
});

test('only same-origin page-level speculative RSC GET abort signatures qualify for suppression', () => {
  const eligible = { method: 'GET', pathname: '/penyaluran/mustahik', resourceType: 'fetch', errorCode: 'net::ERR_ABORTED', headers: { rsc: '1', 'next-router-prefetch': '1' } };
  assert.equal(isSpeculativeRscAbort(eligible), true);
  for (const change of [
    { headers: { rsc: '1' } },
    { method: 'POST' },
    { pathname: '/api/penyaluran/mustahik/123' },
    { resourceType: 'document' },
    { errorCode: 'net::ERR_FAILED' },
    { errorCode: 'HTTP_500' },
  ]) {
    assert.equal(isSpeculativeRscAbort({ ...eligible, ...change }), false);
  }
});

test('suppresses only RSC GET aborts superseded by successful route navigation', () => {
  const request = {
    method: 'GET', pathname: '/penyaluran', resourceType: 'fetch', errorCode: 'net::ERR_ABORTED',
    headers: { rsc: '1' },
    requestInfo: { routePath: '/login', at: 10, frameSequence: 1 },
    events: [
      { type: 'frame', routePath: '/penyaluran/mustahik', at: 15, sequence: 2 },
      { type: 'response', routePath: '/penyaluran/mustahik', path: '/penyaluran/mustahik', status: 200, at: 20 },
    ],
  };
  assert.equal(isSupersededRscNavigationAbort(request), true);
  for (const change of [
    { errorCode: 'net::ERR_FAILED' },
    { method: 'POST' },
    { pathname: '/api/auth/me' },
    { events: request.events.slice(0, 1) },
    { events: [{ ...request.events[0], routePath: '/login' }, request.events[1]] },
    { events: [request.events[0], { ...request.events[1], status: 503 }] },
    { requestInfo: { ...request.requestInfo, frameSequence: 2 } },
  ]) {
    assert.equal(isSupersededRscNavigationAbort({ ...request, ...change }), false);
  }
});

test('accepts a loopback tunnel origin and keeps secrets only in returned config', () => {
  const config = resolveUatConfig(validEnv);
  assert.equal(config.baseUrl.origin, 'http://127.0.0.1:3002');
  assert.equal(config.staff.username, validEnv.M6_UAT_STAFF_USERNAME);
  assert.equal(config.staff.password, validEnv.M6_UAT_STAFF_PASSWORD);
  assert.equal(config.finance.username, validEnv.M6_UAT_FINANCE_USERNAME);
  assert.equal(config.applicant.nik, validEnv.M6_UAT_APPLICANT_NIK);
});

test('rejects the Docker staging alias unless the isolated runner marker is set', () => {
  assert.throws(
    () => resolveUatConfig({ ...validEnv, M6_UAT_BASE_URL: 'http://caddy:80' }),
    /loopback|staging/i,
  );
});

test('accepts only the caddy HTTP origin when the isolated Docker marker is set', () => {
  const config = resolveUatConfig({
    ...validEnv,
    M6_UAT_BASE_URL: 'http://caddy:80',
    M6_UAT_DOCKER_STAGING: '1',
  });
  assert.equal(config.baseUrl.origin, 'http://caddy');
  for (const origin of ['http://caddy:8080', 'https://caddy', 'http://other:80']) {
    assert.throws(
      () => resolveUatConfig({ ...validEnv, M6_UAT_BASE_URL: origin, M6_UAT_DOCKER_STAGING: '1' }),
      /loopback|staging/i,
    );
  }
});

test('rejects a remote origin unless it is a named staging host and explicitly allowlisted', () => {
  assert.throws(
    () => resolveUatConfig({ ...validEnv, M6_UAT_BASE_URL: 'https://example.com' }),
    /loopback|staging/i,
  );
  assert.throws(
    () => resolveUatConfig({ ...validEnv, M6_UAT_BASE_URL: 'https://staging.example.com' }),
    /explicitly listed/i,
  );
});

test('accepts an explicitly allowlisted HTTPS staging origin', () => {
  const config = resolveUatConfig({
    ...validEnv,
    M6_UAT_BASE_URL: 'https://staging.example.test',
    M6_UAT_ALLOWED_ORIGINS: 'https://staging.example.test,https://api.staging.example.test',
  });
  assert.equal(config.baseUrl.origin, 'https://staging.example.test');
  assert.deepEqual(config.allowedOrigins, new Set([
    'https://staging.example.test',
    'https://api.staging.example.test',
  ]));
});

test('refuses production-looking hosts even when explicitly allowlisted', () => {
  assert.throws(
    () => resolveUatConfig({
      ...validEnv,
      M6_UAT_BASE_URL: 'https://baznas.example.test',
      M6_UAT_ALLOWED_ORIGINS: 'https://baznas.example.test',
    }),
    /staging/i,
  );
});

test('rejects non-synthetic applicant identifiers before opening a browser', () => {
  assert.throws(
    () => resolveUatConfig({ ...validEnv, M6_UAT_APPLICANT_NIK: '3275061234567890' }),
    /synthetic/i,
  );
});
