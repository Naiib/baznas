import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JWT_SECRET = 'task-11-provider-secrets-test-xyz';
const tmpExportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'penerimaan-provider-secrets-test-'));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;
process.env.PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.PENERIMAAN_EXPORT_DIR = tmpExportDir;

const { default: app } = await import('./index.js');
const { getDb, initDb } = await import('./db.js');
const {
  listPenerimaanProviderConfigs,
  updatePenerimaanProviderConfig,
  createPenerimaanFundCategory,
  listPenerimaanFundCategories,
  updatePenerimaanFundCategory,
  createPenerimaanChannel,
  createPenerimaanAccount,
  createPenerimaanExportJob,
  getPenerimaanExportJob,
  markPenerimaanExportJobProcessing,
  completePenerimaanExportJob,
  failPenerimaanExportJob,
} = await import('./repository.js');
const {
  getProviderSecretEncryptionKey,
  encryptProviderSecret,
  decryptProviderSecret,
  resolveConfiguredProviderSecret,
  migrateLegacyPlaintextSecrets,
  assertNoPlaintextProviderSecrets,
  SUPPORTED_PROVIDERS,
  KNOWN_INSECURE_KEYS,
} = await import('./penerimaan-provider-secrets.js');
const { normalizeWebhookPayload } = await import('./webhook-verification.js');
const { runProviderSecretsMigration } = await import('../scripts/migrate-penerimaan-provider-secrets.js');

let server;
let baseUrl;

before(async () => {
  await initDb();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  try {
    const db = await getDb();
    await db.run("UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = NULL WHERE provider_name = 'portal'");
  } catch {}
  try {
    fs.rmSync(tmpExportDir, { recursive: true, force: true });
  } catch {}
  if (server) {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

function tokenFor({ id = 1, role = 'admin', level = 'admin', name = 'Super Admin' } = {}) {
  return jwt.sign({ id, name, role, level }, JWT_SECRET, { expiresIn: '15m' });
}

async function request(route, { token, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${route}`, { ...options, headers });
}

test('Provider Configs: listing masks secret_key and displays is_secret_set', async () => {
  const db = await getDb();
  const adminActor = { id: 1, name: 'Super Admin', role: 'admin' };

  // Set a secret on portal provider
  await db.run(
    "UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = 'super-secret-key-123' WHERE provider_name = 'portal'"
  );

  const configs = await listPenerimaanProviderConfigs(db);
  const portal = configs.find((p) => p.provider_name === 'portal');
  assert.ok(portal);
  assert.equal(portal.is_secret_set, true);
  assert.equal(portal.secret_masked, '••••••••', 'Masked secret should be present in secret_masked');
  assert.equal(portal.secret_key, undefined, 'Raw or masked secret_key property must NOT exist');

  // Verify API endpoint also has no secret_key and provides secret_masked
  const res = await request('/api/penerimaan/master-data/providers', {
    token: tokenFor(),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  const apiPortal = body.data.find((p) => p.provider_name === 'portal');
  assert.equal(apiPortal.is_secret_set, true);
  assert.equal(apiPortal.secret_masked, '••••••••');
  assert.equal(apiPortal.secret_key, undefined, 'API response must never include secret_key property');
});

test('Provider Configs: write-only secret rotation preserves existing secret when left blank and strips secret from audit trail', async () => {
  const db = await getDb();
  const adminActor = { id: 1, name: 'Super Admin', role: 'admin' };

  const portalRow = await db.get("SELECT id FROM penerimaan_provider_configs WHERE provider_name = 'portal'");

  // 1. Update display_name with empty secret_key -> secret_key remains unchanged
  await updatePenerimaanProviderConfig(
    portalRow.id,
    { display_name: 'Portal Publik Kota Tangerang', secret_key: '' },
    adminActor,
    db
  );

  let rawPortal = await db.get('SELECT webhook_secret_encrypted, display_name FROM penerimaan_provider_configs WHERE id = $1', [
    portalRow.id,
  ]);
  assert.equal(rawPortal.display_name, 'Portal Publik Kota Tangerang');
  assert.equal(rawPortal.webhook_secret_encrypted, 'super-secret-key-123', 'Blank secret preserves existing secret');

  // 2. Rotate secret with new value
  await updatePenerimaanProviderConfig(
    portalRow.id,
    { secret_key: 'rotated-new-secret-456' },
    adminActor,
    db
  );

  rawPortal = await db.get('SELECT webhook_secret_encrypted FROM penerimaan_provider_configs WHERE id = $1', [portalRow.id]);
  assert.notEqual(rawPortal.webhook_secret_encrypted, 'rotated-new-secret-456', 'Ciphertext must differ from plaintext');
  assert.ok(rawPortal.webhook_secret_encrypted.startsWith('v1:'), 'Ciphertext must be versioned envelope');
  assert.equal(decryptProviderSecret(rawPortal.webhook_secret_encrypted), 'rotated-new-secret-456');

  // 3. Verify audit event NEVER logs raw secret
  const audit = await db.get(
    "SELECT * FROM penerimaan_audit_events WHERE entity_id = $1 ORDER BY id DESC LIMIT 1",
    [`provider_config:${portalRow.id}`]
  );
  assert.ok(audit, 'Audit event must exist for provider config update');
  const auditText = JSON.stringify(audit);
  assert.equal(auditText.includes('rotated-new-secret-456'), false, 'Audit event must never contain raw secret');
  assert.equal(auditText.includes('super-secret-key-123'), false, 'Audit event must never contain old secret');
});

test('Master Data Fund Categories: CRUD lifecycle and audit trail', async () => {
  const db = await getDb();
  const adminActor = { id: 1, name: 'Super Admin', role: 'admin' };

  // 1. Create fund category
  const code = `fund_cat_test_${Date.now()}`;
  const created = await createPenerimaanFundCategory(
    { code, name: 'Kategori Dana Uji', description: 'Deskripsi Uji' },
    adminActor,
    db
  );
  assert.equal(created.code, code);
  assert.equal(created.name, 'Kategori Dana Uji');

  // 2. Update fund category
  const updated = await updatePenerimaanFundCategory(
    created.id,
    { name: 'Kategori Dana Uji Diperbarui' },
    adminActor,
    db
  );
  assert.equal(updated.name, 'Kategori Dana Uji Diperbarui');

  // 3. Verify in list
  const list = await listPenerimaanFundCategories(db);
  const found = list.find((c) => c.id === created.id);
  assert.ok(found);
  assert.equal(found.name, 'Kategori Dana Uji Diperbarui');

  // 4. Verify audit event
  const audit = await db.get(
    "SELECT * FROM penerimaan_audit_events WHERE entity_id = $1 ORDER BY id DESC LIMIT 1",
    [`fund_category:${created.id}`]
  );
  assert.ok(audit);
  assert.equal(audit.entity_type, 'penerimaan_settings');
});

test('Export Job Lifecycle: queued -> processing -> completed / failed endpoints', async () => {
  const db = await getDb();
  const adminToken = tokenFor();

  // 1. Generate export job
  const genRes = await request('/api/penerimaan/laporan/generate', {
    method: 'POST',
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'xlsx', period: '30d' }),
  });
  assert.ok([200, 202].includes(genRes.status));
  const genBody = await genRes.json();
  assert.equal(genBody.success, true);
  const jobUuid = genBody.data.id;
  assert.equal(genBody.data.status, 'queued');

  // 2. Query job status via jobs API
  const jobRes1 = await request(`/api/penerimaan/laporan/jobs/${jobUuid}`, {
    token: adminToken,
  });
  assert.equal(jobRes1.status, 200);
  const jobBody1 = await jobRes1.json();
  assert.ok(['queued', 'processing', 'completed'].includes(jobBody1.data.status));

  // Wait for background job to finish processing
  let completed = false;
  for (let i = 0; i < 40; i++) {
    const statusRes = await request(`/api/penerimaan/laporan/jobs/${jobUuid}`, { token: adminToken });
    const statusBody = await statusRes.json();
    if (statusBody.data?.status === 'completed') {
      completed = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(completed, 'Export job must complete');

  // 3. Export with job ID executes generation and transitions to completed
  const expRes = await request(`/api/penerimaan/laporan/export/${jobUuid}?format=xlsx`, {
    token: adminToken,
  });
  assert.equal(expRes.status, 200);
  assert.equal(expRes.headers.get('x-job-id'), jobUuid);

  // 4. Query job status after export -> must be completed
  const jobRes2 = await request(`/api/penerimaan/laporan/jobs/${jobUuid}`, {
    token: adminToken,
  });
  assert.equal(jobRes2.status, 200);
  const jobBody2 = await jobRes2.json();
  assert.equal(jobBody2.data.status, 'completed');
  assert.ok(jobBody2.data.file_size > 0);
});

test('Provider Runtime: rejects unknown provider with exact matching (no fuzzy startsWith/includes)', async () => {
  const db = await getDb();
  await assert.rejects(
    async () => resolveConfiguredProviderSecret('unknown_provider', db),
    /not recognized or supported/i
  );
  await assert.rejects(
    async () => resolveConfiguredProviderSecret('portal_extra', db),
    /not recognized or supported/i
  );
  await assert.rejects(
    async () => resolveConfiguredProviderSecret('bsi_fake', db),
    /not recognized or supported/i
  );
});

test('Provider Runtime: rejects inactive provider before signature verification', async () => {
  const db = await getDb();
  await db.run("UPDATE penerimaan_provider_configs SET is_active = 0 WHERE provider_name = 'bsi'");
  try {
    await assert.rejects(
      async () => resolveConfiguredProviderSecret('bsi', db),
      (err) => {
        assert.ok(/inactive/i.test(err.message));
        assert.equal(err.status, 403);
        return true;
      }
    );

    // Webhook HTTP endpoint also rejects with 403
    const res = await request('/api/penerimaan/webhook/bsi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': 'dummy' },
      body: JSON.stringify({ test: 123 }),
    });
    assert.equal(res.status, 403);
  } finally {
    await db.run("UPDATE penerimaan_provider_configs SET is_active = 1 WHERE provider_name = 'bsi'");
  }
});

test('Provider Runtime: missing encryption key outside tests fails closed', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalKey = process.env.PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY;
    assert.throws(
      () => getProviderSecretEncryptionKey(),
      /PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY is required/i
    );
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalKey !== undefined) {
      process.env.PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY;
    }
  }
});

test('Provider Runtime: database-secret precedence over environment variable', async () => {
  const db = await getDb();
  const originalEnvSec = process.env.WEBHOOK_SECRET_QRIS_NATIONAL;
  try {
    process.env.WEBHOOK_SECRET_QRIS_NATIONAL = 'env-legacy-secret-123';
    const dbSecretEncrypted = encryptProviderSecret('db-authoritative-secret-456');
    await db.run(
      "UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = $1 WHERE provider_name = 'qris_national'",
      [dbSecretEncrypted]
    );

    const resolved = await resolveConfiguredProviderSecret('qris_national', db);
    assert.equal(resolved, 'db-authoritative-secret-456', 'Database secret must take precedence over env variable');
  } finally {
    process.env.WEBHOOK_SECRET_QRIS_NATIONAL = originalEnvSec;
    await db.run(
      "UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = NULL WHERE provider_name = 'qris_national'"
    );
  }
});

test('Provider Runtime: rejects malformed or tampered envelope', async () => {
  const db = await getDb();
  await db.run(
    "UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = 'v1:invalid:tampered:envelope' WHERE provider_name = 'generic'"
  );
  try {
    await assert.rejects(
      async () => resolveConfiguredProviderSecret('generic', db),
      /tamper|failed|invalid/i
    );
  } finally {
    await db.run(
      "UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = NULL WHERE provider_name = 'generic'"
    );
  }
});

test('Provider Migration: migrates legacy plaintext into versioned encrypted envelope', async () => {
  const db = await getDb();
  const legacySecret = 'raw-legacy-plaintext-key-789';
  await db.run(
    "UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = $1 WHERE provider_name = 'bni_syariah'",
    [legacySecret]
  );
  try {
    const count = await migrateLegacyPlaintextSecrets(db);
    assert.ok(count >= 1);

    const row = await db.get("SELECT webhook_secret_encrypted FROM penerimaan_provider_configs WHERE provider_name = 'bni_syariah'");
    assert.ok(row.webhook_secret_encrypted.startsWith('v1:'), 'Secret must now be versioned envelope');
    assert.equal(decryptProviderSecret(row.webhook_secret_encrypted), legacySecret);
  } finally {
    await db.run(
      "UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = NULL WHERE provider_name = 'bni_syariah'"
    );
  }
});

test('Task 5: invalid encryption key throws validation error', () => {
  const originalKey = process.env.PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY;
  try {
    process.env.PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY = 'too-short-key';
    assert.throws(
      () => getProviderSecretEncryptionKey(),
      /valid 32-byte key/i
    );
  } finally {
    process.env.PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY = originalKey;
  }
});

test('Task 5: known sample or insecure key is rejected outside test environment', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalKey = process.env.PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY;
  try {
    process.env.NODE_ENV = 'production';
    for (const sampleKey of KNOWN_INSECURE_KEYS) {
      process.env.PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY = sampleKey;
      assert.throws(
        () => getProviderSecretEncryptionKey(),
        /kunci contoh|tidak aman/i
      );
    }
  } finally {
    process.env.NODE_ENV = originalEnv;
    process.env.PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY = originalKey;
  }
});

test('Task 5: migration dry-run reports plaintext counts without writing changes', async () => {
  const db = await getDb();
  const testPlaintext = 'dry-run-test-secret-111';
  await db.run(
    "UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = $1 WHERE provider_name = 'bni_syariah'",
    [testPlaintext]
  );
  try {
    // 1. Dry run via function
    const dryRunCount = await migrateLegacyPlaintextSecrets({ dryRun: true }, db);
    assert.ok(dryRunCount >= 1, 'Dry-run must report at least 1 plaintext secret');

    // Verify row remains unencrypted plaintext
    let row = await db.get("SELECT webhook_secret_encrypted FROM penerimaan_provider_configs WHERE provider_name = 'bni_syariah'");
    assert.equal(row.webhook_secret_encrypted, testPlaintext, 'Dry run must NOT encrypt or modify the row');

    // 2. Dry run via script module
    const scriptResult = await runProviderSecretsMigration({ dryRun: true, dbOverride: db });
    assert.equal(scriptResult.dryRun, true);
    assert.ok(scriptResult.totalFound >= 1);
    assert.equal(scriptResult.migratedCount, 0);

    row = await db.get("SELECT webhook_secret_encrypted FROM penerimaan_provider_configs WHERE provider_name = 'bni_syariah'");
    assert.equal(row.webhook_secret_encrypted, testPlaintext, 'Dry run via runner must NOT modify database');
  } finally {
    await db.run(
      "UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = NULL WHERE provider_name = 'bni_syariah'"
    );
  }
});

test('Task 5: migration second-run idempotence and rollback on failure', async () => {
  const db = await getDb();
  const testSecret = 'idempotent-secret-222';
  await db.run(
    "UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = $1 WHERE provider_name = 'bni_syariah'",
    [testSecret]
  );
  try {
    // 1. First run: successfully migrates
    const firstResult = await runProviderSecretsMigration({ dryRun: false, dbOverride: db });
    assert.ok(firstResult.migratedCount >= 1);

    const rowAfterFirst = await db.get("SELECT webhook_secret_encrypted FROM penerimaan_provider_configs WHERE provider_name = 'bni_syariah'");
    assert.ok(rowAfterFirst.webhook_secret_encrypted.startsWith('v1:'));
    assert.equal(decryptProviderSecret(rowAfterFirst.webhook_secret_encrypted), testSecret);

    // 2. Second run: idempotent, returns 0 and does not re-encrypt
    const secondResult = await runProviderSecretsMigration({ dryRun: false, dbOverride: db });
    assert.equal(secondResult.migratedCount, 0);

    const rowAfterSecond = await db.get("SELECT webhook_secret_encrypted FROM penerimaan_provider_configs WHERE provider_name = 'bni_syariah'");
    assert.equal(rowAfterSecond.webhook_secret_encrypted, rowAfterFirst.webhook_secret_encrypted, 'Second run must be idempotent');

    // 3. Rollback on failure: simulate failing database update
    await db.run(
      "UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = 'plain-before-fail' WHERE provider_name = 'bni_syariah'"
    );

    const failingDb = {
      ...db,
      all: (...args) => db.all(...args),
      run: (query, ...params) => {
        if (typeof query === 'string' && query.includes('UPDATE penerimaan_provider_configs')) {
          throw new Error('Forced database mutation failure');
        }
        return db.run(query, ...params);
      },
    };

    await assert.rejects(
      async () => migrateLegacyPlaintextSecrets({ dryRun: false }, failingDb),
      /Forced database mutation failure/
    );

    // Verify row was NOT partially modified or corrupted
    const rowAfterFail = await db.get("SELECT webhook_secret_encrypted FROM penerimaan_provider_configs WHERE provider_name = 'bni_syariah'");
    assert.equal(rowAfterFail.webhook_secret_encrypted, 'plain-before-fail');
  } finally {
    await db.run(
      "UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = NULL WHERE provider_name = 'bni_syariah'"
    );
  }
});

test('Task 5: startup preflight assertNoPlaintextProviderSecrets fails closed when plaintext remains', async () => {
  const db = await getDb();
  await db.run(
    "UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = 'raw-legacy-secret' WHERE provider_name = 'bni_syariah'"
  );
  try {
    await assert.rejects(
      async () => assertNoPlaintextProviderSecrets(db),
      (err) => {
        assert.equal(err.code, 'PLAINTEXT_PROVIDER_SECRETS_REMAIN');
        assert.ok(err.message.includes('node scripts/migrate-penerimaan-provider-secrets.js'));
        return true;
      }
    );

    // After migration, preflight succeeds without error
    await migrateLegacyPlaintextSecrets(db);
    await assertNoPlaintextProviderSecrets(db); // Must not throw
  } finally {
    await db.run(
      "UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = NULL WHERE provider_name = 'bni_syariah'"
    );
  }
});

test('Task 5: normalizeWebhookPayload rejects near-match status and unrecognized provider', () => {
  // Near-match statuses must be rejected with 422
  for (const nearStatus of ['successful', 'success_pending', 'partially_paid', 'unpaid', 'berhasil_pending']) {
    assert.throws(
      () => normalizeWebhookPayload({
        provider: 'bsi',
        payload: { provider_ref: 'REF-1', status: nearStatus, amount: 100000 },
      }),
      (err) => {
        assert.equal(err.status, 422);
        assert.equal(err.code, 'NON_SUCCESS_PAYMENT');
        return true;
      }
    );
  }

  // Near-match or unrecognized provider names must be rejected with 400
  for (const invalidProvider of ['bsi_extra', 'portal_fake', 'unknown_gateway', 'qris_evil']) {
    assert.throws(
      () => normalizeWebhookPayload({
        provider: invalidProvider,
        payload: { provider_ref: 'REF-1', status: 'success', amount: 100000 },
      }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'UNSUPPORTED_PROVIDER');
        return true;
      }
    );
  }
});

