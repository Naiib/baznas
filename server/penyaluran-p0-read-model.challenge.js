import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { registerPenyaluranP0Routes } from './penyaluran-p0/routes.js';
import { createP0TestDatabase } from './penyaluran-p0-test-helpers.js';
import { requireProductionSecret } from './access-policy.js';

process.env.NODE_ENV = 'test';
const JWT_SECRET = requireProductionSecret();

async function ensureReadModelSchema(db) {
  const statements = [
    'ALTER TABLE mustahik ADD COLUMN file_no VARCHAR(50)',
    'ALTER TABLE mustahik ADD COLUMN name VARCHAR(255)',
    'ALTER TABLE mustahik ADD COLUMN nik VARCHAR(50)',
    'ALTER TABLE mustahik ADD COLUMN phone VARCHAR(50)',
    "ALTER TABLE mustahik ADD COLUMN applicant_status VARCHAR(50) DEFAULT 'Perorangan'",
    'ALTER TABLE mustahik ADD COLUMN asnaf VARCHAR(100)',
    'ALTER TABLE mustahik ADD COLUMN program VARCHAR(100)',
    'ALTER TABLE mustahik ADD COLUMN address TEXT',
    'ALTER TABLE mustahik ADD COLUMN rt_rw VARCHAR(50)',
    'ALTER TABLE mustahik ADD COLUMN kelurahan VARCHAR(100)',
    'ALTER TABLE mustahik ADD COLUMN kecamatan VARCHAR(100)',
    'ALTER TABLE mustahik ADD COLUMN kabupaten_kota VARCHAR(100)',
    'ALTER TABLE mustahik ADD COLUMN province VARCHAR(100)',
    'ALTER TABLE mpzis ADD COLUMN created_by_id INTEGER',
    'ALTER TABLE mpzis ADD COLUMN submitted_by_id INTEGER',
    'ALTER TABLE ppd ADD COLUMN form_number TEXT',
    'ALTER TABLE ppd ADD COLUMN ppd_number TEXT',
    'ALTER TABLE ppd ADD COLUMN bank_name TEXT',
    'ALTER TABLE ppd ADD COLUMN bank_account_name TEXT',
    'ALTER TABLE ppd ADD COLUMN bank_account_last4 TEXT',
    'ALTER TABLE ppd ADD COLUMN bank_account_ciphertext TEXT',
    'ALTER TABLE ppd ADD COLUMN amount_in_words TEXT',
    'ALTER TABLE ppd ADD COLUMN receipt_payload_sha256 CHAR(64)',
    'ALTER TABLE ppd ADD COLUMN receipt_file_sha256 CHAR(64)',
    'ALTER TABLE ppd ADD COLUMN receipt_file_id INTEGER',
    'CREATE TABLE IF NOT EXISTS applications (id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL, application_number VARCHAR(100), program VARCHAR(100), status VARCHAR(100))',
  ];
  for (const sql of statements) {
    try {
      await db.exec(sql);
    } catch {}
  }
}

async function createTestDb() {
  const db = await createP0TestDatabase();
  await ensureReadModelSchema(db);
  return db;
}

/**
 * Production-grade authenticating test harness verifying real JWT verification,
 * signature checks, and actor resolution.
 */
async function setupChallengeApp(db) {
  const app = express();
  app.use(express.json());

  const authenticatingMiddleware = (req, res, next) => {
    // Check Authorization header case-insensitively
    const rawHeader = req.headers.authorization || req.headers.AUTHORIZATION || req.headers.Authorization;
    if (!rawHeader) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'Akses ditolak: Token otentikasi tidak ditemukan.',
      });
    }

    const parts = String(rawHeader).trim().split(/\s+/);
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return res.status(401).json({
        success: false,
        code: 'AUTH_INVALID_SCHEME',
        message: 'Akses ditolak: Skema otentikasi wajib Bearer.',
      });
    }

    const token = parts[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      req.user = {
        id: decoded.id,
        name: decoded.name || 'Test User',
        role: decoded.role,
        level: decoded.level || 'staff',
        division: decoded.division || 'Divisi Penyaluran',
      };
      next();
    } catch (err) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_TOKEN_INVALID',
        message: 'Sesi berakhir atau token tidak valid. Silakan login kembali.',
        error: err.name,
      });
    }
  };

  registerPenyaluranP0Routes(app, {
    db,
    isEnabled: () => true,
    authenticateToken: authenticatingMiddleware,
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const close = async () => {
    await new Promise((resolve) => server.close(resolve));
  };

  return { baseUrl, close };
}

function signTestToken(payload, options = {}) {
  return jwt.sign(
    {
      id: 101,
      name: 'Petugas Penyaluran',
      role: 'penyaluran',
      level: 'staff',
      division: 'Divisi Penyaluran',
      ...payload,
    },
    JWT_SECRET,
    { expiresIn: '15m', ...options },
  );
}

// =========================================================================
// VECTOR 1: ROUTE PARAMETER BOUNDARY & ADVERSARIAL INJECTION TESTS
// =========================================================================

test('V1.1: Route parameter boundary - Negative IDs rejected with 400 FIELD_INVALID', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupChallengeApp(db);
  const token = signTestToken();

  try {
    const negativeIds = ['-1', '-2', '-100', '-999999', '-9007199254740991'];
    for (const badId of negativeIds) {
      const res = await fetch(`${baseUrl}/api/penyaluran/mustahik/${badId}/workspace`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 400, `Negative id ${badId} must return 400`);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.code, 'FIELD_INVALID');
      assert.equal(body.field_errors?.mustahik_id, 'INTEGER');
    }
  } finally {
    await close();
    await db.close();
  }
});

test('V1.2: Route parameter boundary - Zero and non-integer float IDs rejected with 400 FIELD_INVALID', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupChallengeApp(db);
  const token = signTestToken();

  try {
    const nonIntegers = ['0', '0.0', '1.5', '3.14159', '0.0001', '1.0000000000001', '1e-3'];
    for (const badId of nonIntegers) {
      const res = await fetch(`${baseUrl}/api/penyaluran/mustahik/${badId}/workspace`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 400, `Non-integer id ${badId} must return 400`);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.code, 'FIELD_INVALID');
      assert.equal(body.field_errors?.mustahik_id, 'INTEGER');
    }
  } finally {
    await close();
    await db.close();
  }
});

test('V1.3: Route parameter boundary - Extreme large numbers exceeding MAX_SAFE_INTEGER rejected with 400', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupChallengeApp(db);
  const token = signTestToken();

  try {
    const extremeNumbers = [
      '9007199254740992', // MAX_SAFE_INTEGER + 1
      '9007199254740993',
      '1e30',
      '1e100',
      '999999999999999999999999999999999999999999',
      'Infinity',
      '-Infinity',
      'NaN',
    ];
    for (const badId of extremeNumbers) {
      const res = await fetch(`${baseUrl}/api/penyaluran/mustahik/${badId}/workspace`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 400, `Extreme number ${badId} must return 400`);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.code, 'FIELD_INVALID');
    }
  } finally {
    await close();
    await db.close();
  }
});

test('V1.4: Route parameter boundary - SQL injection strings in :id rejected with 400 FIELD_INVALID', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupChallengeApp(db);
  const token = signTestToken();

  try {
    const sqlInjections = [
      "1; DROP TABLE mustahik--",
      "1' OR '1'='1",
      "1 UNION SELECT 1, 'admin', 'password'--",
      "1 AND SLEEP(5)",
      "' OR 1=1 --",
      "1' UNION SELECT pg_sleep(5)--",
      "1; SELECT 1;",
      "admin'--",
      "1' OR 'x'='x",
      "1/**/OR/**/1=1",
    ];

    for (const payload of sqlInjections) {
      const encodedId = encodeURIComponent(payload);
      const res = await fetch(`${baseUrl}/api/penyaluran/mustahik/${encodedId}/workspace`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 400, `SQL injection payload [${payload}] must return 400`);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.code, 'FIELD_INVALID');
    }

    // Verify DB table mustahik is completely intact
    const count = await db.get('SELECT COUNT(*) as cnt FROM mustahik');
    assert.ok(Number(count.cnt) >= 1, 'mustahik table must not be dropped or modified');
  } finally {
    await close();
    await db.close();
  }
});

test('V1.5: Route parameter boundary - Unicode numerals, emojis, and special chars rejected with 400', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupChallengeApp(db);
  const token = signTestToken();

  try {
    const unicodeStrings = [
      '١٢٣', // Arabic numerals
      '１２３', // Full-width digits
      '一二三', // Chinese numerals
      '⚡🔥💰', // Emojis
      '<script>alert(1)</script>', // XSS string
      'null',
      'undefined',
      'true',
      'false',
      '%20', // Whitespace
      '%0A%0D', // Newline
    ];

    for (const badId of unicodeStrings) {
      const res = await fetch(`${baseUrl}/api/penyaluran/mustahik/${encodeURIComponent(badId)}/workspace`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 400, `Unicode/malformed id [${badId}] must return 400`);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.code, 'FIELD_INVALID');
    }
  } finally {
    await close();
    await db.close();
  }
});

test('V1.6: Route parameter boundary - Non-existent valid safe integer returns 404 CASE_NOT_FOUND cleanly', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupChallengeApp(db);
  const token = signTestToken();

  try {
    // MAX_SAFE_INTEGER is a valid safe integer, passes routeId, executes query with $1 safely, returns 404
    const res = await fetch(`${baseUrl}/api/penyaluran/mustahik/9007199254740991/workspace`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, 'CASE_NOT_FOUND');
  } finally {
    await close();
    await db.close();
  }
});

// =========================================================================
// VECTOR 2: AUTHENTICATION TAMPERING & HEADER VARIATIONS
// =========================================================================

test('V2.1: Authentication tampering - Missing, empty, or wrong scheme headers rejected with 401', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupChallengeApp(db);

  try {
    const invalidHeaders = [
      {}, // Missing Authorization header
      { Authorization: '' }, // Empty header
      { Authorization: 'Bearer' }, // Missing token
      { Authorization: 'Bearer ' }, // Whitespace token
      { Authorization: 'Basic dXNlcjpwYXNz' }, // Wrong scheme Basic
      { Authorization: 'Token xyz123' }, // Wrong scheme Token
      { Authorization: 'Bearer not-a-jwt-string' }, // Corrupt string
      { Authorization: 'Bearer a.b.c' }, // Malformed JWT parts
    ];

    for (const headers of invalidHeaders) {
      const res = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers });
      assert.equal(res.status, 401, `Header ${JSON.stringify(headers)} must return 401`);
      const body = await res.json();
      assert.equal(body.success, false);
    }
  } finally {
    await close();
    await db.close();
  }
});

test('V2.2: Cryptographic tampering - Wrong secret, alg: none, and signature byte corruption rejected with 401', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupChallengeApp(db);

  try {
    // 1. Token signed with wrong secret
    const evilToken = jwt.sign(
      { id: 101, role: 'penyaluran', level: 'staff', division: 'Divisi Penyaluran' },
      'attacker-evil-secret-key-12345',
      { expiresIn: '15m' },
    );
    const resEvil = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: { Authorization: `Bearer ${evilToken}` },
    });
    assert.equal(resEvil.status, 401, 'Token signed with wrong secret must return 401');

    // 2. Token with algorithm none attack
    const headerBase64 = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payloadBase64 = Buffer.from(JSON.stringify({ id: 101, role: 'admin', level: 'admin', division: 'TI' })).toString('base64url');
    const algNoneToken = `${headerBase64}.${payloadBase64}.`;
    const resNone = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: { Authorization: `Bearer ${algNoneToken}` },
    });
    assert.equal(resNone.status, 401, 'Algorithm none token must return 401');

    // 3. Valid token with corrupted signature byte
    const validToken = signTestToken();
    const corruptedToken = validToken.slice(0, -2) + (validToken.endsWith('aa') ? 'bb' : 'aa');
    const resCorrupted = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: { Authorization: `Bearer ${corruptedToken}` },
    });
    assert.equal(resCorrupted.status, 401, 'Corrupted signature byte must return 401');
  } finally {
    await close();
    await db.close();
  }
});

test('V2.3: Expired token rejected with 401', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupChallengeApp(db);

  try {
    // Token expired 10 minutes ago
    const expiredToken = jwt.sign(
      { id: 101, role: 'penyaluran', level: 'staff', division: 'Divisi Penyaluran' },
      JWT_SECRET,
      { expiresIn: '-10m' },
    );
    const res = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(res.status, 401, 'Expired token must return 401');
    const body = await res.json();
    assert.equal(body.success, false);
  } finally {
    await close();
    await db.close();
  }
});

test('V2.4: Header casing variations (authorization, AUTHORIZATION, Authorization) succeed identically', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupChallengeApp(db);
  const token = signTestToken();

  try {
    const casingVariants = ['authorization', 'AUTHORIZATION', 'Authorization'];
    for (const headerName of casingVariants) {
      const res = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
        headers: { [headerName]: `Bearer ${token}` },
      });
      assert.equal(res.status, 200, `Header casing ${headerName} must succeed with 200`);
      const body = await res.json();
      assert.equal(body.success, true);
    }
  } finally {
    await close();
    await db.close();
  }
});

test('V2.5: Role forgery & unauthorized divisions rejected with 403 PERMISSION_DENIED', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupChallengeApp(db);

  try {
    const unauthorizedClaims = [
      { role: 'penerimaan', division: 'Penerimaan' },
      { role: 'muzaki', division: 'Publik' },
      { role: 'penyaluran', division: 'Penerimaan' }, // Division mismatch
      { role: 'keuangan', division: 'Divisi IT' }, // Division mismatch
      { role: 'guest', division: 'Publik' },
      { role: 'audit', division: 'Pengawasan Internal' },
      { role: 'unknown_role', division: 'Divisi Penyaluran' },
    ];

    for (const claims of unauthorizedClaims) {
      const token = signTestToken(claims);
      const res = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 403, `Claims ${JSON.stringify(claims)} must return 403`);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.code, 'PERMISSION_DENIED');
    }
  } finally {
    await close();
    await db.close();
  }
});

test('V2.5b: Official BAZNAS division nomenclature (Bidang Pendistribusian & Pendayagunaan) can access workspace', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupChallengeApp(db);

  try {
    const officialActors = [
      { id: 2, name: 'H. Rahmat Hidayat (Kabid Penyaluran)', role: 'penyaluran', level: 'leader', division: 'Bidang Pendistribusian & Pendayagunaan' },
      { id: 101, name: 'Staff Pendistribusian', role: 'penyaluran', level: 'staff', division: 'Bidang Pendistribusian & Pendayagunaan' },
    ];

    for (const actorClaims of officialActors) {
      const token = signTestToken(actorClaims);
      const res = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200, `Actor ${actorClaims.name} with division ${actorClaims.division} must return 200`);
      const body = await res.json();
      assert.equal(body.mustahik.id, 1);
      assert.ok(body.case_progress);
      assert.ok(body.permissions);
    }
  } finally {
    await close();
    await db.close();
  }
});

test('V2.6: Actor ID tampering in claims rejected with 401 ACTOR_REQUIRED', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupChallengeApp(db);

  try {
    const malformedActors = [
      { id: -1 }, // Negative ID
      { id: 0 }, // Zero ID
      { id: 'actor with spaces' }, // Non-canonical string ID
      { id: '123' }, // String of digits is non-canonical (must be number)
      { id: null }, // Null ID
      { id: undefined }, // Undefined ID
    ];

    for (const claims of malformedActors) {
      const token = signTestToken(claims);
      const res = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 401, `Actor claims ${JSON.stringify(claims)} must return 401`);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.code, 'ACTOR_REQUIRED');
    }
  } finally {
    await close();
    await db.close();
  }
});

// =========================================================================
// VECTOR 3: ANTI-SLOP CONTENT AUDIT & ZERO PRESENCE VERIFICATION
// =========================================================================

test('V3.1: Anti-slop content audit across all lifecycle states', async () => {
  const db = await createTestDb();

  // Populate rich lifecycle case
  await db.run(`
    UPDATE mustahik SET
      file_no = 'MST-2026-CHALLENGE',
      name = 'Mustahik Uji Khusus',
      nik = '3201019999990001',
      phone = '081299990001',
      applicant_status = 'Perorangan',
      asnaf = 'Fakir Miskin',
      program = 'Kemanusiaan',
      status = 'Penyaluran Selesai',
      workflow_version = 1,
      workflow_mode = 'p0'
    WHERE id = 1
  `);

  // Hostile assessment snapshot with slop keys injected into DB
  const hostileSnapshot = {
    husband_in_household: true,
    husband_name: 'Mustahik Uji Khusus',
    assistance_request: 'Modal Usaha Barokah',
    // Hostile slop fields attempting to leak through
    overall_score: 98.5,
    score: 95,
    sla: '3 Hari Kerja',
    completeness: '100%',
    raw_secret_key: 'HOSTILE_LEAK_SECRET_KEY_ALPHA',
  };
  await db.run(`
    INSERT INTO assessments (id, mustahik_id, revision, status, source, snapshot_json, snapshot_hash)
    VALUES (1, 1, 1, 'accepted', 'p0', $1, '1111111111111111111111111111111111111111111111111111111111111111')
  `, [JSON.stringify(hostileSnapshot)]);

  // MPZIS stage
  await db.run(`
    INSERT INTO mpzis (id, mustahik_id, revision, status, source, total_amount, created_by_id, submitted_by_id, snapshot_hash)
    VALUES (1, 1, 1, 'approved', 'p0', 5000000, 10, 11, '2222222222222222222222222222222222222222222222222222222222222222')
  `);
  for (let s = 1; s <= 5; s++) {
    const steps = ['proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged', 'approved'];
    await db.run(`
      INSERT INTO artifact_approvals (mustahik_id, artifact_type, artifact_id, artifact_revision, approval_step, action, actor_id, actor_name, actor_role, actor_level, actor_division, snapshot_hash)
      VALUES (1, 'mpzis', 1, 1, $1, 'approve', $2, $3, 'penyaluran', 'staff', 'Penyaluran', '2222222222222222222222222222222222222222222222222222222222222222')
    `, [steps[s - 1], 20 + s, `Pejabat Stage ${s}`]);
  }

  // PPD with bank ciphertext
  const payloadHash = '3333333333333333333333333333333333333333333333333333333333333333';
  const fileHash = '4444444444444444444444444444444444444444444444444444444444444444';
  await db.run(`
    INSERT INTO ppd (id, mustahik_id, revision, status, source, amount, bank_name, bank_account_last4, bank_account_ciphertext, receipt_status, receipt_payload_sha256, receipt_file_sha256)
    VALUES (1, 1, 1, 'completed', 'p0', 5000000, 'Bank Syariah Mandiri', '8888', 'SUPER_SECRET_AES256_CIPHERTEXT_BANK_ACCOUNT', 'ready', $1, $2)
  `, [payloadHash, fileHash]);

  await db.run(`
    INSERT INTO ppd_payments (id, ppd_id, transaction_number, paid_amount, paid_at, proof_file_id, verification_status)
    VALUES (1, 1, 'TRX-CHALLENGE-001', 5000000, CURRENT_TIMESTAMP, 50, 'verified')
  `);
  await db.run(`
    INSERT INTO recipient_confirmations (id, ppd_id, method, recipient_name_snapshot, confirmed_at)
    VALUES (1, 1, 'Tatap Muka', 'Mustahik Uji Khusus', CURRENT_TIMESTAMP)
  `);

  const { baseUrl, close } = await setupChallengeApp(db);
  const token = signTestToken();

  try {
    const res = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const rawJson = JSON.stringify(body);

    // 1. Verify STRICT 100% ABSENCE of slop keywords
    assert.equal(/\boverall_score\b/i.test(rawJson), false, 'overall_score MUST NOT appear anywhere in JSON');
    assert.equal(/\bscore\b/i.test(rawJson), false, 'score MUST NOT appear anywhere in JSON');
    assert.equal(/\bsla\b/i.test(rawJson), false, 'sla MUST NOT appear anywhere in JSON');
    assert.equal(/\bcompleteness\b/i.test(rawJson), false, 'completeness MUST NOT appear anywhere in JSON');
    assert.equal(rawJson.includes('HOSTILE_LEAK_SECRET_KEY_ALPHA'), false, 'Injected snapshot secrets MUST NOT leak');

    // 2. Verify STRICT 100% ABSENCE of raw secrets
    assert.equal(rawJson.includes('3201019999990001'), false, 'Unmasked NIK must never leak');
    assert.equal(rawJson.includes('081299990001'), false, 'Unmasked phone must never leak');
    assert.equal(rawJson.includes('SUPER_SECRET_AES256_CIPHERTEXT_BANK_ACCOUNT'), false, 'Bank ciphertext must never leak');

    // 3. Verify presence of canonical masked versions
    assert.equal(body.mustahik.nik_masked, '3201************');
    assert.equal(body.mustahik.phone_masked, '0812****0001');
    assert.equal(body.ppd.bank_account_masked, '************8888');

    // 4. Verify unrecorded assessment fields return strictly null
    const fields = body.assessment.fields;
    assert.equal(fields.husband_in_household, true);
    assert.equal(fields.husband_name, 'Mustahik Uji Khusus');
    assert.equal(fields.assistance_request, 'Modal Usaha Barokah');
    assert.equal(fields.wife_in_household, null);
    assert.equal(fields.wife_name, null);
    assert.equal(fields.child_count, null);
    assert.equal(fields.house_ownership, null);
    assert.equal(fields.home_address, null);
    assert.equal(fields.monthly_rent_amount, null);
    assert.equal(fields.husband_monthly_income, null);
    assert.equal(fields.wife_monthly_income, null);
    assert.equal(fields.child_monthly_support, null);
    assert.equal(fields.previous_application_year, null);

    // 5. Verify dual SHA-256 hashes are valid lowercase 64-hex strings
    assert.match(body.completion.payload_sha256, /^[a-f0-9]{64}$/);
    assert.match(body.completion.file_sha256, /^[a-f0-9]{64}$/);
    assert.equal(body.completion.payload_sha256, payloadHash);
    assert.equal(body.completion.file_sha256, fileHash);
  } finally {
    await close();
    await db.close();
  }
});

test('V1.7: Route parameter boundary - Empty parameter and double slash rejected', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupChallengeApp(db);
  const token = signTestToken();

  try {
    // 1. Double slash (empty parameter between slashes)
    const resSlash = await fetch(`${baseUrl}/api/penyaluran/mustahik//workspace`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Express returns 404 Cannot GET /api/penyaluran/mustahik//workspace
    assert.ok([400, 404].includes(resSlash.status), 'Empty route param must return 400 or 404');

    // 2. Encoded empty spaces / slashes
    const resSpace = await fetch(`${baseUrl}/api/penyaluran/mustahik/%20/workspace`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resSpace.status, 400);
    const body = await resSpace.json();
    assert.equal(body.code, 'FIELD_INVALID');
  } finally {
    await close();
    await db.close();
  }
});

test('V3.2: Anti-slop content audit on archived, legacy, and fresh intake cases', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupChallengeApp(db);
  const token = signTestToken();

  try {
    // 1. Fresh intake case
    const resIntake = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resIntake.status, 200);
    const jsonIntake = JSON.stringify(await resIntake.json());
    assert.equal(/\boverall_score\b/i.test(jsonIntake), false, 'Intake JSON must not have overall_score');
    assert.equal(/\bscore\b/i.test(jsonIntake), false, 'Intake JSON must not have score');
    assert.equal(/\bsla\b/i.test(jsonIntake), false, 'Intake JSON must not have sla');
    assert.equal(/\bcompleteness\b/i.test(jsonIntake), false, 'Intake JSON must not have completeness');

    // 2. Archived case with reason
    await db.run(`
      UPDATE mustahik SET
        archived_at = CURRENT_TIMESTAMP,
        archived_by_id = 1,
        archive_reason = 'Berkas mustahik dipindahkan ke arsip fisik.'
      WHERE id = 1
    `);
    const resArchived = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resArchived.status, 200);
    const bodyArchived = await resArchived.json();
    const jsonArchived = JSON.stringify(bodyArchived);
    assert.equal(bodyArchived.case.status, 'ARCHIVED');
    assert.equal(bodyArchived.case.archive_reason, 'Berkas mustahik dipindahkan ke arsip fisik.');
    assert.equal(/\boverall_score\b/i.test(jsonArchived), false, 'Archived JSON must not have overall_score');
    assert.equal(/\bscore\b/i.test(jsonArchived), false, 'Archived JSON must not have score');
    assert.equal(/\bsla\b/i.test(jsonArchived), false, 'Archived JSON must not have sla');
    assert.equal(/\bcompleteness\b/i.test(jsonArchived), false, 'Archived JSON must not have completeness');

    // 3. Legacy case
    await db.run("UPDATE mustahik SET workflow_mode = 'legacy', archived_at = NULL, archive_reason = NULL WHERE id = 1");
    const resLegacy = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resLegacy.status, 200);
    const bodyLegacy = await resLegacy.json();
    const jsonLegacy = JSON.stringify(bodyLegacy);
    assert.equal(bodyLegacy.case.is_legacy, true);
    assert.equal(bodyLegacy.case.legacy_banner, true);
    assert.equal(/\boverall_score\b/i.test(jsonLegacy), false, 'Legacy JSON must not have overall_score');
    assert.equal(/\bscore\b/i.test(jsonLegacy), false, 'Legacy JSON must not have score');
    assert.equal(/\bsla\b/i.test(jsonLegacy), false, 'Legacy JSON must not have sla');
    assert.equal(/\bcompleteness\b/i.test(jsonLegacy), false, 'Legacy JSON must not have completeness');
  } finally {
    await close();
    await db.close();
  }
});
