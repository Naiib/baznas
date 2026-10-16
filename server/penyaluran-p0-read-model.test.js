import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerPenyaluranP0Routes } from './penyaluran-p0/routes.js';
import { createP0TestDatabase } from './penyaluran-p0-test-helpers.js';

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
    'CREATE TABLE IF NOT EXISTS documents (id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL, doc_type TEXT, filename TEXT NOT NULL, original_name TEXT, file_url TEXT NOT NULL, uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)',
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

async function setupTestApp(db) {
  const app = express();
  app.use(express.json());

  registerPenyaluranP0Routes(app, {
    db,
    isEnabled: () => true,
    authenticateToken: (req, res, next) => {
      if (req.headers['x-unauthenticated'] === 'true' || !req.headers.authorization) {
        return res.status(401).json({
          success: false,
          code: 'AUTH_REQUIRED',
          message: 'Akses ditolak: Token otentikasi tidak ditemukan.',
        });
      }

      const idHeader = req.headers['x-actor-id'];
      const parsedId = Number(idHeader);
      req.user = {
        id: idHeader !== undefined ? (Number.isSafeInteger(parsedId) ? parsedId : idHeader) : 101,
        name: req.headers['x-actor-name'] || 'Budi Penyaluran',
        role: req.headers['x-actor-role'] || 'penyaluran',
        level: req.headers['x-actor-level'] || 'staff',
        division: req.headers['x-actor-division'] || 'Divisi Penyaluran',
      };
      next();
    },
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

const DEFAULT_AUTH = {
  Authorization: 'Bearer test-token',
  'X-Actor-Id': '101',
  'X-Actor-Role': 'penyaluran',
  'X-Actor-Level': 'staff',
  'X-Actor-Division': 'Divisi Penyaluran',
};

test('1. workspace route requires authentication and returns 401 for unauthenticated request', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: { 'X-Unauthenticated': 'true' },
    });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.code, 'AUTH_REQUIRED');
  } finally {
    await close();
    await db.close();
  }
});

test('2. workspace route rejects malformed or negative :id with 400 FIELD_INVALID', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupTestApp(db);
  try {
    for (const badId of ['abc', '-5', '0', '1.5']) {
      const response = await fetch(`${baseUrl}/api/penyaluran/mustahik/${badId}/workspace`, {
        method: 'GET',
        headers: DEFAULT_AUTH,
      });
      assert.equal(response.status, 400, `Expected 400 for id ${badId}`);
      const body = await response.json();
      assert.equal(body.success, false);
      assert.equal(body.code, 'FIELD_INVALID');
      assert.ok(body.field_errors?.mustahik_id);
    }
  } finally {
    await close();
    await db.close();
  }
});

test('3. workspace route returns 404 CASE_NOT_FOUND when mustahik does not exist', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(`${baseUrl}/api/penyaluran/mustahik/999999/workspace`, {
      method: 'GET',
      headers: DEFAULT_AUTH,
    });
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.code, 'CASE_NOT_FOUND');
  } finally {
    await close();
    await db.close();
  }
});

test('4. workspace route returns 403 PERMISSION_DENIED when actor role is outside permitted divisions', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'X-Actor-Id': '401',
        'X-Actor-Role': 'penerimaan',
        'X-Actor-Level': 'staff',
        'X-Actor-Division': 'Penerimaan',
      },
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.code, 'PERMISSION_DENIED');
  } finally {
    await close();
    await db.close();
  }
});

test('5. workspace payload strictly conforms to PROJECT.md § 2 schema', async () => {
  const db = await createTestDb();
  await db.run(`
    UPDATE mustahik SET
      file_no = 'MST-202609-0001',
      name = 'Ahmad Subagyo',
      nik = '3201012345670001',
      phone = '081234567890',
      applicant_status = 'Perorangan',
      asnaf = 'Fakir Miskin',
      program = 'Kemanusiaan',
      status = 'Diajukan',
      workflow_version = 1
    WHERE id = 1
  `);

  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: DEFAULT_AUTH,
    });
    assert.equal(response.status, 200);
    const body = await response.json();

    // Required top-level keys
    for (const key of ['case', 'mustahik', 'assessment', 'mpzis_approvals', 'ppd', 'disbursement', 'completion', 'permissions', 'timeline']) {
      assert.ok(Object.prototype.hasOwnProperty.call(body, key), `Missing top-level key: ${key}`);
    }

    // Case metadata
    assert.equal(body.case.id, 1);
    assert.equal(body.case.nomor_registrasi, 'MST-202609-0001');
    assert.equal(body.case.p0_version, 1);
    assert.ok(body.case.created_at);
    assert.ok(body.case.updated_at);

    // Mustahik profile
    assert.equal(body.mustahik.nama, 'Ahmad Subagyo');
    assert.equal(body.mustahik.nik_masked, '3201************');
    assert.equal(body.mustahik.phone_masked, '0812****7890');

    // MPZIS 5-stage stepper
    assert.equal(body.mpzis_approvals.length, 5);
    body.mpzis_approvals.forEach((stg, i) => {
      assert.equal(stg.stage, i + 1);
      assert.ok(stg.role);
      assert.ok(stg.step_key);
    });

    // PPD & RAB lines structure
    assert.ok(Array.isArray(body.ppd.rab_lines));
    assert.ok(body.ppd.total_rab === null || typeof body.ppd.total_rab === 'number');

    // Permissions structure
    for (const permKey of ['can_assess', 'can_approve_mpzis', 'allowed_mpzis_roles', 'can_submit_ppd', 'can_disburse', 'can_archive', 'can_restore']) {
      assert.ok(Object.prototype.hasOwnProperty.call(body.permissions, permKey), `Missing permission key: ${permKey}`);
    }
  } finally {
    await close();
    await db.close();
  }
});

test('6. workspace payload strictly forbids overall_score, score, sla, completeness, and plaintext secrets', async () => {
  const db = await createTestDb();
  await db.run(`
    UPDATE mustahik SET
      file_no = 'MST-202609-0001',
      name = 'Ahmad Subagyo',
      nik = '3201012345670001',
      phone = '081234567890'
    WHERE id = 1
  `);
  await db.run(`
    INSERT INTO ppd (id, mustahik_id, revision, status, source, amount, bank_name, bank_account_last4, bank_account_ciphertext)
    VALUES (1, 1, 1, 'draft', 'p0', 1000000, 'Bank Syariah', '5678', 'ENCRYPTED_BANK_ACCOUNT_SECRET_CIPHERTEXT')
  `);

  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: DEFAULT_AUTH,
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    const rawJson = JSON.stringify(body);

    // Anti-slop invariants: forbidden keys/strings
    assert.equal(rawJson.includes('overall_score'), false, 'overall_score must be omitted');
    assert.equal(rawJson.includes('score'), false, 'score must be omitted');
    assert.equal(rawJson.includes('sla'), false, 'sla must be omitted');
    assert.equal(rawJson.includes('completeness'), false, 'completeness must be omitted');

    // Plaintext secrets forbidden
    assert.equal(rawJson.includes('3201012345670001'), false, 'Unmasked NIK must never leak');
    assert.equal(rawJson.includes('ENCRYPTED_BANK_ACCOUNT_SECRET_CIPHERTEXT'), false, 'Bank ciphertext must never leak');

    // Masked versions are present
    assert.equal(rawJson.includes('3201************'), true, 'Masked NIK must be present');
    assert.equal(rawJson.includes('************5678'), true, 'Masked bank account must be present');
  } finally {
    await close();
    await db.close();
  }
});

test('7. missing source fields are returned as null, never fabricated defaults', async () => {
  const db = await createTestDb();
  const partialSnapshot = {
    husband_in_household: true,
    husband_name: 'Ahmad Subagyo',
    assistance_request: 'Bantuan modal',
  };
  await db.run(`
    INSERT INTO assessments (id, mustahik_id, revision, status, source, snapshot_json, snapshot_hash)
    VALUES (1, 1, 1, 'draft', 'p0', $1, '1234567890123456789012345678901234567890123456789012345678901234')
  `, [JSON.stringify(partialSnapshot)]);

  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: DEFAULT_AUTH,
    });
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.ok(body.assessment);
    const fields = body.assessment.fields;
    assert.equal(fields.husband_in_household, true);
    assert.equal(fields.husband_name, 'Ahmad Subagyo');
    assert.equal(fields.assistance_request, 'Bantuan modal');

    // Unrecorded fields MUST be null, never 0, empty string, or false
    assert.equal(fields.wife_in_household, null);
    assert.equal(fields.wife_name, null);
    assert.equal(fields.child_count, null);
    assert.equal(fields.house_ownership, null);
    assert.equal(fields.home_address, null);
    assert.equal(fields.address_matches_ktp, null);
    assert.equal(fields.monthly_rent_amount, null);
    assert.equal(fields.husband_occupation, null);
    assert.equal(fields.husband_monthly_income, null);
    assert.equal(fields.wife_occupation, null);
    assert.equal(fields.wife_monthly_income, null);
    assert.equal(fields.child_occupation, null);
    assert.equal(fields.child_monthly_support, null);
    assert.equal(fields.applied_to_baznas_before, null);
    assert.equal(fields.previous_application_year, null);
  } finally {
    await close();
    await db.close();
  }
});

test('8. newly created intake case returns pending assessment and empty artifacts', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: DEFAULT_AUTH,
    });
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.assessment.status, 'PENDING');
    assert.equal(body.assessment.fields, null);
    assert.equal(body.mpzis, null);
    assert.equal(body.mpzis_approvals.length, 5);
    body.mpzis_approvals.forEach((stg) => {
      assert.equal(stg.status, 'PENDING');
      assert.equal(stg.user_id, null);
      assert.equal(stg.timestamp, null);
    });
    assert.equal(body.ppd.total_rab, null);
    assert.equal(body.ppd.rab_lines.length, 0);
    assert.equal(body.disbursement.status, 'pending');
    assert.equal(body.completion.status, 'pending');
    assert.equal(body.case_progress.current_stage, 'intake');
  } finally {
    await close();
    await db.close();
  }
});

test('9. partially approved MPZIS case reflects accurate sequential stages and remaining blockers', async () => {
  const db = await createTestDb();
  await db.run("UPDATE mustahik SET status = 'Persetujuan MPZIS' WHERE id = 1");
  await db.run(`
    INSERT INTO assessments (id, mustahik_id, revision, status, source, snapshot_hash)
    VALUES (1, 1, 1, 'accepted', 'p0', '1111111111111111111111111111111111111111111111111111111111111111')
  `);
  await db.run(`
    INSERT INTO mpzis (id, mustahik_id, revision, status, source, total_amount, created_by_id, submitted_by_id, snapshot_hash)
    VALUES (1, 1, 1, 'examined', 'p0', 3000000, 10, 11, '2222222222222222222222222222222222222222222222222222222222222222')
  `);
  await db.run(`
    INSERT INTO artifact_approvals (mustahik_id, artifact_type, artifact_id, artifact_revision, approval_step, action, actor_id, actor_name, actor_role, actor_level, actor_division, snapshot_hash)
    VALUES (1, 'mpzis', 1, 1, 'proposed', 'approve', 12, 'Staff Diajukan', 'penyaluran', 'staff', 'Penyaluran', '2222222222222222222222222222222222222222222222222222222222222222')
  `);
  await db.run(`
    INSERT INTO artifact_approvals (mustahik_id, artifact_type, artifact_id, artifact_revision, approval_step, action, actor_id, actor_name, actor_role, actor_level, actor_division, snapshot_hash)
    VALUES (1, 'mpzis', 1, 1, 'examined', 'approve', 13, 'Staff Diperiksa', 'penyaluran', 'staff', 'Penyaluran', '2222222222222222222222222222222222222222222222222222222222222222')
  `);

  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: DEFAULT_AUTH,
    });
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.mpzis_approvals[0].stage, 1);
    assert.equal(body.mpzis_approvals[0].status, 'APPROVED');
    assert.equal(body.mpzis_approvals[0].user_id, 12);
    assert.equal(body.mpzis_approvals[0].user_nama, 'Staff Diajukan');

    assert.equal(body.mpzis_approvals[1].stage, 2);
    assert.equal(body.mpzis_approvals[1].status, 'APPROVED');
    assert.equal(body.mpzis_approvals[1].user_id, 13);
    assert.equal(body.mpzis_approvals[1].user_nama, 'Staff Diperiksa');

    // Stage 3 to 5 are pending
    assert.equal(body.mpzis_approvals[2].status, 'PENDING');
    assert.equal(body.mpzis_approvals[3].status, 'PENDING');
    assert.equal(body.mpzis_approvals[4].status, 'PENDING');
  } finally {
    await close();
    await db.close();
  }
});

test('10. fully completed case presents full chain evidence and receipt hashes', async () => {
  const db = await createTestDb();
  await db.run("UPDATE mustahik SET status = 'Penyaluran Selesai' WHERE id = 1");
  const payloadHash = '3333333333333333333333333333333333333333333333333333333333333333';
  const fileHash = '4444444444444444444444444444444444444444444444444444444444444444';
  await db.run(`
    INSERT INTO ppd (id, mustahik_id, revision, status, source, amount, receipt_status, receipt_payload_sha256, receipt_file_sha256)
    VALUES (1, 1, 1, 'completed', 'p0', 2500000, 'ready', $1, $2)
  `, [payloadHash, fileHash]);
  await db.run(`
    INSERT INTO ppd_payments (id, ppd_id, transaction_number, paid_amount, paid_at, proof_file_id, verification_status)
    VALUES (1, 1, 'TRX-001', 2500000, CURRENT_TIMESTAMP, 50, 'verified')
  `);
  await db.run(`
    INSERT INTO recipient_confirmations (id, ppd_id, method, recipient_name_snapshot, confirmed_at)
    VALUES (1, 1, 'Tatap Muka', 'Ahmad Subagyo', CURRENT_TIMESTAMP)
  `);

  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: DEFAULT_AUTH,
    });
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.disbursement.status, 'verified');
    assert.equal(body.disbursement.proof_url, '/api/penyaluran/mustahik/1/artifacts/50');
    assert.equal(body.disbursement.paid_amount, 2500000);

    assert.equal(body.completion.status, 'completed');
    assert.equal(body.completion.receipt_status, 'ready');
    assert.equal(body.completion.payload_sha256, payloadHash);
    assert.equal(body.completion.file_sha256, fileHash);
    assert.equal(body.completion.receipt_url, '/api/penyaluran/mustahik/1/ppd/1/receipt');
    assert.equal(body.completion.recipient_name, 'Ahmad Subagyo');
  } finally {
    await close();
    await db.close();
  }
});

test('11. archived case locks all mutation permissions and reflects archival reason in timeline', async () => {
  const db = await createTestDb();
  await db.run(`
    UPDATE mustahik SET
      archived_at = CURRENT_TIMESTAMP,
      archived_by_id = 1,
      archive_reason = 'Duplikasi berkas fisik'
    WHERE id = 1
  `);
  await db.run(`
    INSERT INTO activity_logs (mustahik_id, actor_id, actor_name, actor_role, actor_level, actor_division, action_type, title, description)
    VALUES (1, 1, 'Super Admin', 'admin', 'admin', 'TI', 'case_archived', 'Kasus Diarsipkan', 'Duplikasi berkas fisik')
  `);

  const { baseUrl, close } = await setupTestApp(db);
  try {
    // 1. As Penyaluran staff
    const staffResponse = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: DEFAULT_AUTH,
    });
    assert.equal(staffResponse.status, 200);
    const staffBody = await staffResponse.json();

    assert.equal(staffBody.case.status, 'ARCHIVED');
    assert.equal(staffBody.case.archive_reason, 'Duplikasi berkas fisik');
    assert.equal(staffBody.permissions.can_assess, false);
    assert.equal(staffBody.permissions.can_approve_mpzis, false);
    assert.equal(staffBody.permissions.can_submit_ppd, false);
    assert.equal(staffBody.permissions.can_disburse, false);
    assert.equal(staffBody.permissions.can_archive, false);
    assert.equal(staffBody.permissions.can_restore, false);

    // Timeline reflects archival
    assert.ok(staffBody.timeline.some((t) => t.action === 'case_archived'));

    // 2. As Admin
    const adminResponse = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'X-Actor-Id': '1',
        'X-Actor-Role': 'admin',
        'X-Actor-Level': 'admin',
        'X-Actor-Division': 'TI',
      },
    });
    assert.equal(adminResponse.status, 200);
    const adminBody = await adminResponse.json();
    assert.equal(adminBody.permissions.can_archive, false);
    assert.equal(adminBody.permissions.can_restore, true);
  } finally {
    await close();
    await db.close();
  }
});

test('12. legacy case is served gracefully with projected fields and legacy banner', async () => {
  const db = await createTestDb();
  await db.run("UPDATE mustahik SET workflow_mode = 'legacy', status = 'Diajukan' WHERE id = 1");

  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: DEFAULT_AUTH,
    });
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.case.workflow_mode, 'legacy');
    assert.equal(body.case.is_legacy, true);
    assert.equal(body.case.legacy_banner, true);
    // Mutation permissions blocked for legacy
    assert.equal(body.permissions.can_assess, false);
    assert.equal(body.permissions.can_approve_mpzis, false);
    assert.equal(body.permissions.can_submit_ppd, false);
    assert.equal(body.permissions.can_disburse, false);
  } finally {
    await close();
    await db.close();
  }
});

test('12b. legacy_reconciliation case is served with reconciliation banner and routine mutations blocked', async () => {
  const db = await createTestDb();
  await db.run("UPDATE mustahik SET workflow_mode = 'legacy_reconciliation', status = 'Survey' WHERE id = 1");

  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: DEFAULT_AUTH,
    });
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.case.workflow_mode, 'legacy_reconciliation');
    assert.equal(body.case.is_legacy, false);
    assert.equal(body.case.is_reconciliation, true);
    assert.equal(body.case.legacy_banner, false);
    assert.equal(body.case.reconciliation_banner, true);
    // Routine mutation permissions blocked during reconciliation
    assert.equal(body.permissions.can_assess, false);
    assert.equal(body.permissions.can_approve_mpzis, false);
    assert.equal(body.permissions.can_submit_ppd, false);
    assert.equal(body.permissions.can_disburse, false);
  } finally {
    await close();
    await db.close();
  }
});

test('13. permissions reflect actor role and division accurately', async () => {
  const db = await createTestDb();
  await db.run("UPDATE mustahik SET status = 'Survey' WHERE id = 1");

  const { baseUrl, close } = await setupTestApp(db);
  try {
    // Penyaluran staff can assess
    const staffRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'X-Actor-Id': '101',
        'X-Actor-Role': 'penyaluran',
        'X-Actor-Level': 'staff',
        'X-Actor-Division': 'Penyaluran',
      },
    });
    const staffBody = await staffRes.json();
    assert.equal(staffBody.permissions.can_assess, true);
    assert.equal(staffBody.permissions.can_disburse, false);

    // Surveyor can assess
    const surveyorRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'X-Actor-Id': '301',
        'X-Actor-Role': 'surveyor',
        'X-Actor-Level': 'staff',
        'X-Actor-Division': 'Survey',
      },
    });
    const surveyorBody = await surveyorRes.json();
    assert.equal(surveyorBody.permissions.can_assess, true);
    assert.equal(surveyorBody.permissions.can_approve_mpzis, false);

    // Penyaluran leader cannot assess
    const leaderRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'X-Actor-Id': '102',
        'X-Actor-Role': 'penyaluran',
        'X-Actor-Level': 'leader',
        'X-Actor-Division': 'Penyaluran',
      },
    });
    const leaderBody = await leaderRes.json();
    assert.equal(leaderBody.permissions.can_assess, false);

    // Keuangan staff cannot assess
    const finRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'X-Actor-Id': '201',
        'X-Actor-Role': 'keuangan',
        'X-Actor-Level': 'staff',
        'X-Actor-Division': 'Keuangan',
      },
    });
    const finBody = await finRes.json();
    assert.equal(finBody.permissions.can_assess, false);
  } finally {
    await close();
    await db.close();
  }
});

test('14. actor segregation prevents prior approvers or creator from approving MPZIS', async () => {
  const db = await createTestDb();
  await db.run("UPDATE mustahik SET status = 'Persetujuan MPZIS' WHERE id = 1");
  await db.run(`
    INSERT INTO mpzis (id, mustahik_id, revision, status, source, total_amount, created_by_id, submitted_by_id)
    VALUES (1, 1, 1, 'submitted', 'p0', 1000000, 101, 102)
  `);

  const { baseUrl, close } = await setupTestApp(db);
  try {
    // 1. Creator (101) cannot approve
    const creatorRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'X-Actor-Id': '101',
        'X-Actor-Role': 'penyaluran',
        'X-Actor-Level': 'staff',
        'X-Actor-Division': 'Penyaluran',
      },
    });
    const creatorBody = await creatorRes.json();
    assert.equal(creatorBody.permissions.can_approve_mpzis, false);
    assert.deepEqual(creatorBody.permissions.allowed_mpzis_roles, []);

    // 2. Submitter (102) cannot approve
    const subRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'X-Actor-Id': '102',
        'X-Actor-Role': 'penyaluran',
        'X-Actor-Level': 'staff',
        'X-Actor-Division': 'Penyaluran',
      },
    });
    const subBody = await subRes.json();
    assert.equal(subBody.permissions.can_approve_mpzis, false);
    assert.deepEqual(subBody.permissions.allowed_mpzis_roles, []);

    // 3. Fresh staff (103) CAN approve stage 1
    const freshRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'X-Actor-Id': '103',
        'X-Actor-Role': 'penyaluran',
        'X-Actor-Level': 'staff',
        'X-Actor-Division': 'Penyaluran',
      },
    });
    const freshBody = await freshRes.json();
    assert.equal(freshBody.permissions.can_approve_mpzis, true);
    assert.ok(freshBody.permissions.allowed_mpzis_roles.includes('Diajukan'));

    // Now 103 approves stage 1
    await db.run(`
      INSERT INTO artifact_approvals (mustahik_id, artifact_type, artifact_id, artifact_revision, approval_step, action, actor_id, actor_name, actor_role, actor_level, actor_division, snapshot_hash)
      VALUES (1, 'mpzis', 1, 1, 'proposed', 'approve', 103, 'Staff 103', 'penyaluran', 'staff', 'Penyaluran', '3333333333333333333333333333333333333333333333333333333333333333')
    `);
    await db.run("UPDATE mpzis SET status = 'proposed' WHERE id = 1");

    // 4. Actor 103 CANNOT approve stage 2 (no reuse across stages)
    const reuseRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'X-Actor-Id': '103',
        'X-Actor-Role': 'penyaluran',
        'X-Actor-Level': 'staff',
        'X-Actor-Division': 'Penyaluran',
      },
    });
    const reuseBody = await reuseRes.json();
    assert.equal(reuseBody.permissions.can_approve_mpzis, false);
    assert.deepEqual(reuseBody.permissions.allowed_mpzis_roles, []);

    // 5. Another fresh staff (104) CAN approve stage 2
    const fresh2Res = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'X-Actor-Id': '104',
        'X-Actor-Role': 'penyaluran',
        'X-Actor-Level': 'staff',
        'X-Actor-Division': 'Penyaluran',
      },
    });
    const fresh2Body = await fresh2Res.json();
    assert.equal(fresh2Body.permissions.can_approve_mpzis, true);
  } finally {
    await close();
    await db.close();
  }
});

test('15. database failure returns sanitized HTTP 500 without leaking SQL or credentials', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupTestApp(db);
  try {
    db.failOn(/SELECT/i);
    const response = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      method: 'GET',
      headers: DEFAULT_AUTH,
    });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.deepEqual(body, {
      success: false,
      code: 'P0_INTERNAL_ERROR',
      message: 'Terjadi kesalahan sistem.',
    });
    db.clearFailure();
  } finally {
    await close();
    await db.close();
  }
});

test('16. legacy completion status is not presented as evidence-backed P0 completion', async () => {
  const db = await createTestDb();
  await db.run("UPDATE mustahik SET workflow_mode = 'legacy', status = 'Penyaluran Selesai' WHERE id = 1");
  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(baseUrl + '/api/penyaluran/mustahik/1/workspace', { method: 'GET', headers: DEFAULT_AUTH });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.notEqual(body.completion.status, 'completed');
    assert.notEqual(body.case_progress.current_stage, 'completed');
  } finally {
    await close();
    await db.close();
  }
});

test('17. real uploaded-file events appear in history with persisted actor and timestamp', async () => {
  const db = await createTestDb();
  const createdAt = '2026-09-26T12:00:00.000Z';
  await db.run('INSERT INTO artifact_files (id,mustahik_id,artifact_type,artifact_id,artifact_revision,kind,stored_name,original_name,mime_type,byte_size,sha256,uploaded_by_id,created_at) VALUES (77,1,NULL,9,1,NULL,\'randomized.pdf\',\'supporting.pdf\',\'application/pdf\',128,\'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\',1,$1)', [createdAt]);
  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(baseUrl + '/api/penyaluran/mustahik/1/workspace', { method: 'GET', headers: DEFAULT_AUTH });
    assert.equal(response.status, 200);
    const body = await response.json();
    const event = body.history.find((entry) => entry.id === 'file-77');
    const document = body.documents.find((entry) => entry.id === 77);
    assert.equal(document.artifact_type, null);
    assert.equal(document.kind, null);
    assert.ok(event, 'uploaded file must be represented in the chronological history');
    assert.equal(event.type, 'file');
    assert.equal(event.action, 'file_uploaded');
    assert.equal(event.actor, 'Admin Pusat');
    assert.equal(event.timestamp, new Date(createdAt).toISOString());
  } finally {
    await close();
    await db.close();
  }
});

test('18. absent PPD amount remains null in the case projection', async () => {
  const db = await createTestDb();
  await db.run("INSERT INTO ppd (id, mustahik_id, revision, status, source, amount) VALUES (1, 1, 1, 'draft', 'p0', NULL)");
  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(baseUrl + '/api/penyaluran/mustahik/1/workspace', { method: 'GET', headers: DEFAULT_AUTH });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ppd.total_rab, null);
    assert.equal(body.ppd.amount, null);
  } finally {
    await close();
    await db.close();
  }
});

test('19. missing required columns fail closed as SCHEMA_NOT_READY', async () => {
  const actor = { id: 1, role: 'admin', level: 'admin' };
  const db = {
    async query(sql) {
      if (/FROM mustahik WHERE id/.test(sql)) return { rows: [{ id: 42, status: 'Diajukan', workflow_mode: 'p0', workflow_version: 1 }] };
      if (/FROM assessments/.test(sql)) {
        const error = new Error('column "source" does not exist');
        error.code = '42703';
        throw error;
      }
      return { rows: [] };
    },
  };
  const { getP0CaseWorkspace } = await import('./penyaluran-p0/case-read-model.js');
  await assert.rejects(() => getP0CaseWorkspace({ actor, db }, 42), (error) => error.code === 'SCHEMA_NOT_READY' && error.status === 503);
});

test('20. payment history actor is resolved from persisted recorder identity', async () => {
  const db = await createTestDb();
  await db.run("INSERT INTO ppd (id, mustahik_id, revision, status, source, amount) VALUES (1, 1, 1, 'payment_recorded', 'p0', 100)");
  await db.run("INSERT INTO ppd_payments (id, ppd_id, transaction_number, paid_amount, paid_at, recorded_by_id, verification_status) VALUES (1, 1, 'TRX-1', 100, '2026-09-26T11:00:00Z', 1, 'recorded')");
  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(baseUrl + '/api/penyaluran/mustahik/1/workspace', { method: 'GET', headers: DEFAULT_AUTH });
    assert.equal(response.status, 200);
    const body = await response.json();
    const event = body.history.find((entry) => entry.id === 'payment-1');
    assert.equal(event.actor, 'Admin Pusat');
  } finally {
    await close();
    await db.close();
  }
});
test('17a. workspace documents include public intake uploads with a case-scoped download URL', async () => {
  const db = await createTestDb();
  await db.run(
    'INSERT INTO documents (id,mustahik_id,doc_type,filename,original_name,file_url,uploaded_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [31, 1, 'ktp', 'public-upload-uuid.pdf', 'KTP Pemohon.pdf', '/uploads/public-upload-uuid.pdf', '2026-09-26T11:00:00.000Z'],
  );
  const { baseUrl, close } = await setupTestApp(db);
  try {
    const response = await fetch(baseUrl + '/api/penyaluran/mustahik/1/workspace', { method: 'GET', headers: DEFAULT_AUTH });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.documents.length, 1, 'the public intake document must appear in the case Documents tab');
    assert.deepEqual(body.documents[0], {
      id: 'intake-31',
      artifact_type: null,
      kind: 'ktp',
      filename: 'KTP Pemohon.pdf',
      original_name: 'KTP Pemohon.pdf',
      mime_type: null,
      byte_size: null,
      sha256: null,
      created_at: '2026-09-26T11:00:00.000Z',
      download_url: '/api/penyaluran/mustahik/1/documents/31',
    });
  } finally {
    await close();
    await db.close();
  }
});
