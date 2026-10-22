import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { getP0CaseWorkspace } from './penyaluran-p0/case-read-model.js';

const { Pool } = pg;

function requireM3TestDatabaseUrl() {
  const dbUrl = process.env.M3_TEST_DATABASE_URL;
  if (!dbUrl) return null;
  const parsed = new URL(dbUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || parsed.hostname !== '127.0.0.1' || parsed.port !== '55439' || !/^baznas_m3_[a-z0-9_]+_test$/i.test(databaseName)) {
    throw new Error('M3_TEST_DATABASE_URL_MUST_TARGET_LOOPBACK_55439_BAZNAS_M3_TEST');
  }
  return dbUrl;
}

test('live PostgreSQL 16: getP0CaseWorkspace returns server-truth read model and enforces safety contracts', { skip: !process.env.M3_TEST_DATABASE_URL }, async () => {
  const dbUrl = requireM3TestDatabaseUrl();
  const pool = new Pool({ connectionString: dbUrl });

  try {
    const client = await pool.connect();
    try {
      // 0. Ensure test users exist for foreign-key validation
      await client.query(`
        INSERT INTO users (id, name, email, password_hash, role, division, level, is_active)
        VALUES 
          (100, 'Staff Penyaluran PG16', 'staff100@test.local', 'hash', 'penyaluran', 'penyaluran', 'staff', true),
          (200, 'Assigned Surveyor', 'surveyor200@test.local', 'hash', 'surveyor', 'survey', 'staff', true)
        ON CONFLICT (id) DO UPDATE SET
          role = EXCLUDED.role,
          division = EXCLUDED.division,
          level = EXCLUDED.level
      `);

      // 1. Setup a test mustahik case in the live PostgreSQL 16 database
      const insertRes = await client.query(`
        INSERT INTO mustahik (
          name, nik, phone, status, workflow_mode, workflow_version
        ) VALUES (
          'Mustahik Workspace PG16', '3201123456780001', '081234567890', 'Diajukan', 'p0', 1
        ) RETURNING id
      `);
      const caseId = insertRes.rows[0].id;

      // 2. Fetch workspace with an authorized staff actor (penyaluran)
      const actor = {
        id: 100,
        name: 'Staff Penyaluran PG16',
        role: 'penyaluran',
        division: 'penyaluran',
        level: 'staff',
      };

      const workspace = await getP0CaseWorkspace({ actor, db: pool }, caseId);

      // Verify server-truth structure
      assert.equal(workspace.success, true);
      assert.equal(workspace.case.id, caseId);
      assert.equal(workspace.case.status, 'Diajukan');
      assert.equal(workspace.case.workflow_mode, 'p0');
      assert.equal(workspace.case.workflow_version, 1);
      assert.equal(workspace.case.is_legacy, false);
      assert.equal(workspace.case.is_reconciliation, false);

      // Verify privacy masking
      assert.equal(workspace.mustahik.name, 'Mustahik Workspace PG16');
      assert.match(workspace.mustahik.nik_masked, /^3201\*{12}$/);
      assert.equal(workspace.mustahik.phone_masked, '0812****7890');

      // Verify no fake slop fields exist in payload
      const json = JSON.stringify(workspace);
      for (const forbidden of ['overall_score', 'completeness', 'missingDocument', 'sla']) {
        assert.equal(json.includes(forbidden), false, `Payload must not include fake field: ${forbidden}`);
      }

      // Verify alternate signature: getP0CaseWorkspace(caseId, actor, db)
      const workspaceAlt = await getP0CaseWorkspace(caseId, actor, pool);
      assert.equal(workspaceAlt.case.id, caseId);

      // 3. Verify case scope restriction when assignments exist
      // Insert an assignment for user 200 (not user 100)
      await client.query(`
        INSERT INTO mustahik_case_assignments (
          mustahik_id, user_id, assignment_role, assigned_by_id
        ) VALUES ($1, 200, 'surveyor', 1)
      `, [caseId]);

      // Actor 100 is not assigned -> should be rejected with 403 PERMISSION_DENIED
      await assert.rejects(
        async () => {
          await getP0CaseWorkspace({ actor, db: pool }, caseId);
        },
        (err) => {
          assert.equal(err.code, 'PERMISSION_DENIED');
          assert.equal(err.status, 403);
          return true;
        }
      );

      // Assigned actor 200 -> allowed
      const assignedActor = {
        id: 200,
        name: 'Assigned Surveyor',
        role: 'surveyor',
        division: 'survey',
        level: 'staff',
      };
      const assignedWorkspace = await getP0CaseWorkspace({ actor: assignedActor, db: pool }, caseId);
      assert.equal(assignedWorkspace.case.id, caseId);

      // Admin actor bypasses assignments for audit
      const adminActor = {
        id: 1,
        name: 'Admin BAZNAS',
        role: 'admin',
        division: 'pimpinan',
        level: 'admin',
      };
      const adminWorkspace = await getP0CaseWorkspace({ actor: adminActor, db: pool }, caseId);
      assert.equal(adminWorkspace.case.id, caseId);
      assert.equal(adminWorkspace.permissions.can_archive, true);

      // 4. Verify legacy reconciliation case behavior
      const reconInsert = await client.query(`
        INSERT INTO mustahik (
          name, status, workflow_mode, workflow_version
        ) VALUES (
          'Recon Case PG16', 'Survey', 'legacy_reconciliation', 1
        ) RETURNING id
      `);
      const reconId = reconInsert.rows[0].id;
      const reconWorkspace = await getP0CaseWorkspace({ actor: adminActor, db: pool }, reconId);
      assert.equal(reconWorkspace.case.is_reconciliation, true);
      assert.equal(reconWorkspace.case.reconciliation_banner, true);
      assert.equal(reconWorkspace.permissions.can_assess, false, 'Routine assess blocked in reconciliation mode');

      // Cleanup test cases
      await client.query('DELETE FROM mustahik_case_assignments WHERE mustahik_id = $1', [caseId]);
      await client.query('DELETE FROM mustahik WHERE id IN ($1, $2)', [caseId, reconId]);
      await client.query('DELETE FROM users WHERE id IN (100, 200)');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
});

test('live PostgreSQL 16: missing schema returns 503 SCHEMA_NOT_READY fail-closed', async () => {
  // Query against a fake db client that throws relation does not exist
  const fakeDb = {
    async query() {
      const err = new Error('relation "mustahik" does not exist');
      throw err;
    },
  };
  const actor = { id: 1, role: 'admin', division: 'pimpinan', level: 'admin' };
  await assert.rejects(
    async () => {
      await getP0CaseWorkspace({ actor, db: fakeDb }, 1);
    },
    (err) => {
      assert.equal(err.code, 'SCHEMA_NOT_READY');
      assert.equal(err.status, 503);
      return true;
    }
  );
});
