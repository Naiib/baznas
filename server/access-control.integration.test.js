import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'task-2-integration-test-secret';
const uploadDir = mkdtempSync(path.join(tmpdir(), 'baznas-access-control-'));
const originalDatabaseUrl = process.env.DATABASE_URL;

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;
process.env.TELEGRAM_BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
process.env.UPLOAD_DIR = uploadDir;
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';

const { default: app, buildCorsOptions, memoryCache } = await import('./index.js');
const { initDb } = await import('./db.js');

let server;
let baseUrl;

before(async () => {
  await initDb();
  app.locals.dataAccessRepository.trackApplication = async (query) => query === 'MST-202609-0001' ? {
    mustahik: {
      id: 81,
      name: 'Siti Aminah',
      file_no: 'MST-202609-0001',
      kecamatan: 'Karawaci',
      program: 'Tangerang Cerdas',
      status: 'Survey',
      received_date: '2026-09-01',
      nik: '3671000000000001',
      phone: '081200000001',
      address: 'Synthetic private address 99',
      bank_account: '0011223344',
    },
    status: 'Survey',
    is_rejected: false,
    rejection_reason: 'Synthetic private rejection reason',
    timeline: [{ phase: 1, name: 'Synthetic staff full name', description: 'Synthetic private timeline detail', status: 'completed' }],
    applications: [{ id: 91 }],
    assessments: [{ id: 92, narrative_family: 'private' }],
    mpzis: [{ id: 93 }],
    ppd: [{ id: 94, bank_account_info: 'private' }],
    documents: [{ id: 95, file_url: '/uploads/private.pdf' }],
    wa_logs: [{ id: 96, message: 'private' }],
  } : null;
  app.locals.dataAccessRepository.createPublicApplication = async (_body, files) => ({
    id: 901,
    file_no: 'MST-TEST-0901',
    uploaded_files: files.length,
  });
  app.locals.dataAccessRepository.exportLaporanData = async (id, format) => ({
    report_id: id,
    format,
    total_records: 0,
    data: [],
  });
  app.locals.dataAccessRepository.appendActivityLog = async () => ({ id: 1 });
  app.locals.dataAccessRepository.updateUserAccess = async (id, access) => ({
    id,
    name: 'Kepala Bagian Penyaluran',
    role: 'penyaluran',
    division: 'Penyaluran',
    level: access.level,
    is_active: true,
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  rmSync(uploadDir, { recursive: true, force: true });
  if (originalDatabaseUrl !== undefined) {
    process.env.DATABASE_URL = originalDatabaseUrl;
  } else {
    delete process.env.DATABASE_URL;
  }
});

function tokenFor(role) {
  return jwt.sign({ id: `user-${role}`, name: `User ${role}`, role }, JWT_SECRET, { expiresIn: '5m' });
}

async function request(route, { token, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${route}`, { ...options, headers });
}

test('rejects an anonymous Mustahik PII export', async () => {
  const response = await request('/api/mustahik/export/data');
  assert.equal(response.status, 401);
});

test('does not serve a cached protected response before authentication', async () => {
  const route = '/api/mustahik?probe=cache-isolation';
  memoryCache.set(`req:${route}`, { success: true, data: [{ nik: 'PII-MUST-NOT-LEAK' }] }, 60);

  const response = await request(route);
  assert.equal(response.status, 401);
  assert.equal((await response.text()).includes('PII-MUST-NOT-LEAK'), false);
});

test('rejects surveyor access to a PPD mutation', async () => {
  const response = await request('/api/mustahik/1/ppd', {
    method: 'POST',
    token: tokenFor('surveyor'),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved_amount: 1_500_000 }),
  });
  assert.equal(response.status, 403);
});

test('allows an administrator to read cache diagnostics', async () => {
  const response = await request('/api/cache/stats', { token: tokenFor('admin') });
  assert.equal(response.status, 200);
});

test('allows only an administrator to promote a Penyaluran leader', async () => {
  const denied = await request('/api/auth/users/leader-1/access', {
    method: 'PATCH',
    token: tokenFor('penyaluran'),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level: 'leader' }),
  });
  assert.equal(denied.status, 403);

  const permitted = await request('/api/auth/users/leader-1/access', {
    method: 'PATCH',
    token: tokenFor('admin'),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level: 'leader' }),
  });
  assert.equal(permitted.status, 200);
  assert.deepEqual((await permitted.json()).data, {
    id: 'leader-1',
    name: 'Kepala Bagian Penyaluran',
    role: 'penyaluran',
    division: 'Penyaluran',
    level: 'leader',
    is_active: true,
  });
});

test('keeps health public without exposing cache diagnostics', async () => {
  const response = await request('/api/health');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(Object.hasOwn(body, 'cache_stats'), false);
});

test('keeps public tracking reachable without a session', async () => {
  const response = await request('/api/public/lacak/MST-202609-0001');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(JSON.stringify(body).includes('Siti Aminah'), false);
  assert.equal(JSON.stringify(body).includes('3671000000000001'), false);
  assert.equal(JSON.stringify(body).includes('081200000001'), false);
  assert.equal(JSON.stringify(body).includes('Synthetic private address 99'), false);
  assert.equal(JSON.stringify(body).includes('Synthetic private rejection reason'), false);
  assert.equal(JSON.stringify(body).includes('Synthetic staff full name'), false);
  assert.equal(JSON.stringify(body).includes('Synthetic private timeline detail'), false);
  assert.equal(JSON.stringify(body).includes('Karawaci'), false);
  assert.deepEqual(body, {
    success: true,
    data: {
      mustahik: {
        file_no: 'MST-202609-0001',
      },
      status: 'Survey',
      is_rejected: false,
      timeline: [{ phase: 1, status: 'completed' }],
    },
  });
});

test('mustahik cache entries are isolated by authenticated role', async () => {
  const repository = app.locals.dataAccessRepository;
  const original = repository.listMustahik;
  repository.listMustahik = async (filters) => [{ scope: filters.ppd_only ? 'ppd' : 'all' }];
  try {
    const route = '/api/mustahik?shared-cache-scope=1';
    const finance = await (await request(route, { token: tokenFor('keuangan') })).json();
    const staff = await (await request(route, { token: tokenFor('penyaluran') })).json();
    assert.equal(finance.data[0].scope, 'ppd');
    assert.equal(staff.data[0].scope, 'all');
  } finally {
    repository.listMustahik = original;
  }
});

test('invalidateCache clears user-scoped and role-scoped cache keys', async () => {
  const { memoryCache, invalidateCache } = await import('./index.js');
  const key = 'req:user-123:keuangan:/api/mustahik?test=1';
  memoryCache.set(key, { data: 'stale' }, 60);
  assert.equal(memoryCache.get(key) !== null, true);
  invalidateCache(['req:/api/mustahik*']);
  assert.equal(memoryCache.get(key), null);
});

test('mustahik list applies Finance PPD scope in the repository query', async () => {
  const repository = app.locals.dataAccessRepository;
  const original = repository.listMustahik;
  let receivedFilters;
  repository.listMustahik = async (filters) => {
    receivedFilters = filters;
    return [];
  };
  try {
    assert.equal((await request('/api/mustahik?scope-list-test=1', { token: tokenFor('keuangan') })).status, 200);
    assert.equal(receivedFilters.ppd_only, true);
    assert.equal((await request('/api/mustahik?scope-list-penyaluran=1', { token: tokenFor('penyaluran') })).status, 200);
    assert.equal(receivedFilters.ppd_only, false);
    assert.equal((await request('/api/mustahik?scope-list-anon=1')).status, 401);
    assert.equal((await request('/api/mustahik?scope-list-role=1', { token: tokenFor('penerimaan') })).status, 403);
  } finally {
    repository.listMustahik = original;
  }
});

test('mustahik detail applies PPD scope and hides out-of-scope existence', async () => {
  const repository = app.locals.dataAccessRepository;
  const original = repository.getMustahikById;
  const optionsSeen = [];
  repository.getMustahikById = async (id, options) => {
    optionsSeen.push({ id, options });
    return options.ppdOnly ? null : { id: Number(id), name: 'Synthetic permitted fixture' };
  };
  try {
    const denied = await request('/api/mustahik/90210', { token: tokenFor('keuangan') });
    assert.equal(denied.status, 404);
    assert.equal((await denied.text()).includes('90210'), false);
    assert.equal(optionsSeen[0].options.ppdOnly, true);
    const anonymous = await request('/api/mustahik/90210');
    assert.equal(anonymous.status, 401);
    const forbidden = await request('/api/mustahik/90210', { token: tokenFor('penerimaan') });
    assert.equal(forbidden.status, 403);
    const permitted = await request('/api/mustahik/1', { token: tokenFor('penyaluran') });
    assert.equal(permitted.status, 200);
    assert.equal(optionsSeen.at(-1).options.ppdOnly, false);
  } finally {
    repository.getMustahikById = original;
  }
});

test('mustahik list and detail errors do not expose repository details', async () => {
  const repository = app.locals.dataAccessRepository;
  const originalList = repository.listMustahik;
  const originalDetail = repository.getMustahikById;
  repository.listMustahik = async () => { throw new Error('private record marker'); };
  repository.getMustahikById = async () => { throw new Error('private record marker'); };
  try {
    for (const route of ['/api/mustahik?error-sanitize=list', '/api/mustahik/41']) {
      const response = await request(route, { token: tokenFor('keuangan') });
      assert.equal(response.status, 500);
      const body = await response.text();
      assert.equal(body.includes('private record marker'), false);
      assert.match(body, /Data mustahik tidak dapat dimuat/);
    }
  } finally {
    repository.listMustahik = originalList;
    repository.getMustahikById = originalDetail;
  }
});

test('rejects an underspecified public tracking query before repository access', async () => {
  const response = await request('/api/public/lacak/1');
  assert.equal(response.status, 422);
});

test('does not echo a missing tracking identifier in the response', async () => {
  const query = '3671000000000099';
  const response = await request(`/api/public/lacak/${query}`);
  assert.equal(response.status, 404);
  assert.equal((await response.text()).includes(query), false);
});

test('redacts internal errors from public tracking responses', async () => {
  const repository = app.locals.dataAccessRepository;
  const original = repository.trackApplication;
  repository.trackApplication = async () => { throw new Error('sensitive database password'); };
  try {
    const response = await request('/api/public/lacak/MST-202609-0001');
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.message, 'Terjadi kesalahan sistem.');
    assert.equal(JSON.stringify(body).includes('sensitive database password'), false);
  } finally {
    repository.trackApplication = original;
  }
});

test('public tracking sanitizes caller correlation ID to prevent PII injection', async () => {
  const repository = app.locals.dataAccessRepository;
  const original = repository.trackApplication;
  repository.trackApplication = async () => { throw new Error('boom'); };
  try {
    const maliciousHeader = 'malicious-pii-phone-08123456789';
    const response = await request('/api/public/lacak/MST-202609-0001', {
      headers: { 'x-correlation-id': maliciousHeader },
    });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.notEqual(body.correlation_id, maliciousHeader);
    assert.notEqual(response.headers.get('x-correlation-id'), maliciousHeader);
    assert.match(body.correlation_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  } finally {
    repository.trackApplication = original;
  }
});

test('keeps a valid public application submission available without a session', async () => {
  const form = new FormData();
  form.set('name', 'Budi Santoso');
  form.set('ktp', new Blob(['%PDF-1.7\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF\n'], { type: 'application/pdf' }), 'identity.pdf');

  const response = await request('/api/public/pengajuan', { method: 'POST', body: form });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.data.file_no, 'MST-TEST-0901');
  assert.equal(body.data.uploaded_files, 1);
});

test('rejects unsupported upload MIME types on the public application route', async () => {
  const form = new FormData();
  form.set('attachment', new Blob(['plain text'], { type: 'text/plain' }), 'evidence.txt');

  const response = await request('/api/public/pengajuan', { method: 'POST', body: form });
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    success: false,
    message: 'Jenis file tidak didukung untuk berkas "evidence.txt". Gunakan PDF, JPEG, atau PNG.',
  });
});

test('rejects an allowed MIME type when its filename extension does not match', async () => {
  const form = new FormData();
  form.set('attachment', new Blob(['not really a pdf'], { type: 'application/pdf' }), 'evidence.exe');

  const response = await request('/api/public/pengajuan', { method: 'POST', body: form });
  assert.equal(response.status, 422);
});

test('stores an allowed upload under a server-generated basename', async () => {
  const form = new FormData();
  form.set('file', new Blob(['%PDF-1.7'], { type: 'application/pdf' }), '../identity.pdf');

  const response = await request('/api/upload', {
    method: 'POST',
    token: tokenFor('surveyor'),
    body: form,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.data.filename, /^[0-9a-f-]+\.pdf$/);
  assert.equal(body.data.filename.includes('..'), false);
  assert.equal(body.data.filename.includes('/'), false);
  assert.equal(body.data.filename.includes('\\'), false);
});

test('maps an upload larger than 10 MB to a concise 413 response', async () => {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array((10 * 1024 * 1024) + 1)], { type: 'application/pdf' }), 'oversize.pdf');

  const response = await request('/api/upload', {
    method: 'POST',
    token: tokenFor('admin'),
    body: form,
  });
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    success: false,
    message: 'Ukuran file melebihi batas 10 MB.',
  });
});

test('maps a disallowed browser origin to a concise 403 response', async () => {
  const response = await request('/api/health', {
    headers: { Origin: 'https://unexpected.example' },
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    success: false,
    message: 'Origin tidak diizinkan',
  });
});

test('production CORS rejects browser origins when FRONTEND_URL is absent', async () => {
  const options = buildCorsOptions({ nodeEnv: 'production', frontendUrl: '' });
  const error = await new Promise((resolve) => {
    options.origin('https://unexpected.example', (originError) => resolve(originError));
  });
  assert.equal(error?.code, 'CORS_ORIGIN_DENIED');
});

test('production CORS accepts each configured origin without a wildcard', async () => {
  const options = buildCorsOptions({
    nodeEnv: 'production',
    frontendUrl: 'https://portal.example, https://admin.example',
  });

  for (const origin of ['https://portal.example', 'https://admin.example']) {
    const allowed = await new Promise((resolve, reject) => {
      options.origin(origin, (error, result) => error ? reject(error) : resolve(result));
    });
    assert.equal(allowed, true);
  }
  assert.equal(options.credentials, true);
});

test('denies a report export without a Bearer token and permits an Amil token', async () => {
  assert.equal((await request('/api/penyaluran/laporan/export/lap-1?format=json')).status, 401);
  assert.equal((await request('/api/penyaluran/laporan/export/lap-1?format=json', { token: tokenFor('penyaluran') })).status, 200);
});

test('denies report export to surveyors whose catalog access is read-only', async () => {
  assert.equal((await request('/api/penyaluran/laporan/export/lap-1?format=json', { token: tokenFor('surveyor') })).status, 403);
});

test('allows administrators to read penyaluran master data', async () => {
  const response = await request('/api/penyaluran/master-data?category=program', { token: tokenFor('admin') });
  assert.equal(response.status, 200);
});

test('returns 401 when the authentication token is invalid or expired', async () => {
  const response = await request('/api/cache/stats', { token: 'invalid.jwt.token' });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.message.includes('login kembali'), true);
});

test('P0 endpoints reject unauthorized roles fail-closed', async () => {
  // Unauthenticated requests receive 401 or 503 (when flag-gated)
  const unauthIntake = await request('/api/penyaluran/mustahik', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test' }),
  });
  assert.ok([401, 503].includes(unauthIntake.status));

  const unauthWorkspace = await request('/api/penyaluran/mustahik/1/workspace');
  assert.equal(unauthWorkspace.status, 401);

  // Authenticated unauthorized roles receive 403 on role-restricted actions
  // When P0 is disabled (or enabled), finance check must reject non-keuangan roles (e.g. surveyor)
  const surveyorFinCheck = await request('/api/penyaluran/mustahik/1/ppd/1/finance-check', {
    method: 'POST',
    token: tokenFor('surveyor'),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: 'Unauthorized attempt' }),
  });
  // Surveyor is rejected (403 forbidden or 503 if p0 flag closed, but never allowed)
  assert.ok([403, 503].includes(surveyorFinCheck.status));

  // Penyaluran staff cannot perform finance approve
  const staffFinApprove = await request('/api/penyaluran/mustahik/1/ppd/1/finance-approve', {
    method: 'POST',
    token: tokenFor('penyaluran'),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: 'Unauthorized attempt' }),
  });
  assert.ok([403, 503].includes(staffFinApprove.status));
});
