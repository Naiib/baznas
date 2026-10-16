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
        name: req.headers['x-actor-name'] || 'Petugas Test',
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

function authHeaders(actor) {
  return {
    Authorization: 'Bearer test-token',
    'X-Actor-Id': String(actor.id),
    'X-Actor-Name': actor.name || 'Petugas Test',
    'X-Actor-Role': actor.role,
    'X-Actor-Level': actor.level,
    'X-Actor-Division': actor.division,
  };
}

// ---------------------------------------------------------------------------
// Area 1: MPZIS 5-Stage Actor Reuse Attacks
// ---------------------------------------------------------------------------
test('CHALLENGE 1: Actor who approved MPZIS Stage 1 cannot approve Stages 2 through 5 (actor reuse prohibition)', async () => {
  const db = await createTestDb();
  await db.run("UPDATE mustahik SET status = 'Persetujuan MPZIS' WHERE id = 1");
  await db.run(`
    INSERT INTO mpzis (id, mustahik_id, revision, status, source, total_amount, created_by_id, submitted_by_id)
    VALUES (1, 1, 1, 'submitted', 'p0', 2500000, 101, 102)
  `);

  const { baseUrl, close } = await setupTestApp(db);
  try {
    const actorA = { id: 103, role: 'penyaluran', level: 'staff', division: 'Penyaluran' };
    const actorB = { id: 104, role: 'penyaluran', level: 'staff', division: 'Penyaluran' };
    const actorC = { id: 105, role: 'penyaluran', level: 'staff', division: 'Penyaluran' };
    const actorD = { id: 106, role: 'penyaluran', level: 'leader', division: 'Penyaluran' };
    const actorE = { id: 107, role: 'penyaluran', level: 'leader', division: 'Penyaluran' };

    // --- STAGE 1: submitted -> proposed ---
    // Actor A can approve Stage 1
    const resA1 = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(actorA) });
    const bodyA1 = await resA1.json();
    assert.equal(bodyA1.permissions.can_approve_mpzis, true, 'Fresh staff can approve Stage 1');
    assert.ok(bodyA1.permissions.allowed_mpzis_roles.includes('Diajukan'));

    // Actor A signs Stage 1
    await db.run(`
      INSERT INTO artifact_approvals (mustahik_id, artifact_type, artifact_id, artifact_revision, approval_step, action, actor_id, actor_name, actor_role, actor_level, actor_division, snapshot_hash)
      VALUES (1, 'mpzis', 1, 1, 'proposed', 'approve', 103, 'Actor A', 'penyaluran', 'staff', 'Penyaluran', '1111111111111111111111111111111111111111111111111111111111111111')
    `);
    await db.run("UPDATE mpzis SET status = 'proposed' WHERE id = 1");

    // --- STAGE 2: proposed -> examined ---
    // CHALLENGE: Actor A attempts to approve Stage 2 (REUSE ATTACK)
    const resA2 = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(actorA) });
    const bodyA2 = await resA2.json();
    assert.equal(bodyA2.permissions.can_approve_mpzis, false, 'Actor A MUST be blocked from approving Stage 2');
    assert.deepEqual(bodyA2.permissions.allowed_mpzis_roles, [], 'Actor A MUST have empty allowed_mpzis_roles for Stage 2');

    // Actor B signs Stage 2
    const resB2 = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(actorB) });
    const bodyB2 = await resB2.json();
    assert.equal(bodyB2.permissions.can_approve_mpzis, true, 'Actor B can approve Stage 2');

    await db.run(`
      INSERT INTO artifact_approvals (mustahik_id, artifact_type, artifact_id, artifact_revision, approval_step, action, actor_id, actor_name, actor_role, actor_level, actor_division, snapshot_hash)
      VALUES (1, 'mpzis', 1, 1, 'examined', 'approve', 104, 'Actor B', 'penyaluran', 'staff', 'Penyaluran', '2222222222222222222222222222222222222222222222222222222222222222')
    `);
    await db.run("UPDATE mpzis SET status = 'examined' WHERE id = 1");

    // --- STAGE 3: examined -> ashnaf_verified ---
    // CHALLENGE: Actor A attempts to approve Stage 3
    const resA3 = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(actorA) });
    const bodyA3 = await resA3.json();
    assert.equal(bodyA3.permissions.can_approve_mpzis, false, 'Actor A MUST be blocked from approving Stage 3');
    assert.deepEqual(bodyA3.permissions.allowed_mpzis_roles, [], 'Actor A MUST have empty allowed_mpzis_roles for Stage 3');

    // CHALLENGE: Actor B attempts to approve Stage 3
    const resB3 = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(actorB) });
    const bodyB3 = await resB3.json();
    assert.equal(bodyB3.permissions.can_approve_mpzis, false, 'Actor B MUST be blocked from approving Stage 3');
    assert.deepEqual(bodyB3.permissions.allowed_mpzis_roles, [], 'Actor B MUST have empty allowed_mpzis_roles for Stage 3');

    // Actor C signs Stage 3
    await db.run(`
      INSERT INTO artifact_approvals (mustahik_id, artifact_type, artifact_id, artifact_revision, approval_step, action, actor_id, actor_name, actor_role, actor_level, actor_division, snapshot_hash)
      VALUES (1, 'mpzis', 1, 1, 'ashnaf_verified', 'approve', 105, 'Actor C', 'penyaluran', 'staff', 'Penyaluran', '3333333333333333333333333333333333333333333333333333333333333333')
    `);
    await db.run("UPDATE mpzis SET status = 'ashnaf_verified' WHERE id = 1");

    // --- STAGE 4: ashnaf_verified -> responsible_acknowledged ---
    // CHALLENGE: Actor A changes role/level to Leader and attempts Stage 4
    const actorAPromoted = { id: 103, role: 'penyaluran', level: 'leader', division: 'Penyaluran' };
    const resA4 = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(actorAPromoted) });
    const bodyA4 = await resA4.json();
    assert.equal(bodyA4.permissions.can_approve_mpzis, false, 'Promoted Actor A MUST be blocked from approving Stage 4');
    assert.deepEqual(bodyA4.permissions.allowed_mpzis_roles, [], 'Promoted Actor A MUST have empty allowed_mpzis_roles for Stage 4');

    // Actor D (fresh Leader) signs Stage 4
    const resD4 = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(actorD) });
    const bodyD4 = await resD4.json();
    assert.equal(bodyD4.permissions.can_approve_mpzis, true, 'Fresh leader Actor D can approve Stage 4');

    await db.run(`
      INSERT INTO artifact_approvals (mustahik_id, artifact_type, artifact_id, artifact_revision, approval_step, action, actor_id, actor_name, actor_role, actor_level, actor_division, snapshot_hash)
      VALUES (1, 'mpzis', 1, 1, 'responsible_acknowledged', 'approve', 106, 'Actor D', 'penyaluran', 'leader', 'Penyaluran', '4444444444444444444444444444444444444444444444444444444444444444')
    `);
    await db.run("UPDATE mpzis SET status = 'responsible_acknowledged' WHERE id = 1");

    // --- STAGE 5: responsible_acknowledged -> approved ---
    // CHALLENGE: Actor A attempts Stage 5
    const resA5 = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(actorAPromoted) });
    const bodyA5 = await resA5.json();
    assert.equal(bodyA5.permissions.can_approve_mpzis, false, 'Actor A MUST be blocked from approving Stage 5');
    assert.deepEqual(bodyA5.permissions.allowed_mpzis_roles, [], 'Actor A MUST have empty allowed_mpzis_roles for Stage 5');

    // CHALLENGE: Actor D attempts Stage 5 (Leader reuse attack)
    const resD5 = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(actorD) });
    const bodyD5 = await resD5.json();
    assert.equal(bodyD5.permissions.can_approve_mpzis, false, 'Actor D MUST be blocked from approving Stage 5 (no leader reuse)');
    assert.deepEqual(bodyD5.permissions.allowed_mpzis_roles, [], 'Actor D MUST have empty allowed_mpzis_roles for Stage 5');

    // Actor E (fresh 2nd Leader) signs Stage 5
    const resE5 = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(actorE) });
    const bodyE5 = await resE5.json();
    assert.equal(bodyE5.permissions.can_approve_mpzis, true, 'Fresh leader Actor E can approve Stage 5');
    assert.ok(bodyE5.permissions.allowed_mpzis_roles.includes('Disetujui'));

    await db.run(`
      INSERT INTO artifact_approvals (mustahik_id, artifact_type, artifact_id, artifact_revision, approval_step, action, actor_id, actor_name, actor_role, actor_level, actor_division, snapshot_hash)
      VALUES (1, 'mpzis', 1, 1, 'approved', 'approve', 107, 'Actor E', 'penyaluran', 'leader', 'Penyaluran', '5555555555555555555555555555555555555555555555555555555555555555')
    `);
    await db.run("UPDATE mpzis SET status = 'approved' WHERE id = 1");

    // Once fully approved, NO actor can approve MPZIS
    const resFinal = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: authHeaders({ id: 108, role: 'penyaluran', level: 'leader', division: 'Penyaluran' }),
    });
    const bodyFinal = await resFinal.json();
    assert.equal(bodyFinal.permissions.can_approve_mpzis, false, 'No actor can approve once MPZIS is approved');
  } finally {
    await close();
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// Area 2: Creator & Submitter Exclusion Attacks
// ---------------------------------------------------------------------------
test('CHALLENGE 2: MPZIS creator and submitter cannot approve any of the 5 stages', async () => {
  const db = await createTestDb();
  await db.run("UPDATE mustahik SET status = 'Persetujuan MPZIS' WHERE id = 1");
  await db.run(`
    INSERT INTO mpzis (id, mustahik_id, revision, status, source, total_amount, created_by_id, submitted_by_id)
    VALUES (1, 1, 1, 'submitted', 'p0', 2000000, 101, 102)
  `);

  const { baseUrl, close } = await setupTestApp(db);
  try {
    const creatorStaff = { id: 101, role: 'penyaluran', level: 'staff', division: 'Penyaluran' };
    const creatorLeader = { id: 101, role: 'penyaluran', level: 'leader', division: 'Penyaluran' };
    const submitterStaff = { id: 102, role: 'penyaluran', level: 'staff', division: 'Penyaluran' };
    const submitterLeader = { id: 102, role: 'penyaluran', level: 'leader', division: 'Penyaluran' };

    const stages = ['submitted', 'proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged'];
    for (const stg of stages) {
      await db.run('UPDATE mpzis SET status = $1 WHERE id = 1', [stg]);

      // Creator check
      const cRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(creatorStaff) });
      const cBody = await cRes.json();
      assert.equal(cBody.permissions.can_approve_mpzis, false, `Creator staff blocked at stage ${stg}`);
      assert.deepEqual(cBody.permissions.allowed_mpzis_roles, [], `Creator staff empty roles at stage ${stg}`);

      const cLRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(creatorLeader) });
      const cLBody = await cLRes.json();
      assert.equal(cLBody.permissions.can_approve_mpzis, false, `Creator leader blocked at stage ${stg}`);
      assert.deepEqual(cLBody.permissions.allowed_mpzis_roles, [], `Creator leader empty roles at stage ${stg}`);

      // Submitter check
      const sRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(submitterStaff) });
      const sBody = await sRes.json();
      assert.equal(sBody.permissions.can_approve_mpzis, false, `Submitter staff blocked at stage ${stg}`);
      assert.deepEqual(sBody.permissions.allowed_mpzis_roles, [], `Submitter staff empty roles at stage ${stg}`);

      const sLRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(submitterLeader) });
      const sLBody = await sLRes.json();
      assert.equal(sLBody.permissions.can_approve_mpzis, false, `Submitter leader blocked at stage ${stg}`);
      assert.deepEqual(sLBody.permissions.allowed_mpzis_roles, [], `Submitter leader empty roles at stage ${stg}`);
    }
  } finally {
    await close();
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// Area 3: Finance Segregation Attacks
// ---------------------------------------------------------------------------
test('CHALLENGE 3: PPD creator receives can_disburse = false even when holding Keuangan role', async () => {
  const db = await createTestDb();
  await db.run("UPDATE mustahik SET status = 'Pengajuan Dana (FPD)' WHERE id = 1");
  await db.run(`
    INSERT INTO ppd (id, mustahik_id, revision, status, source, amount, created_by_id)
    VALUES (1, 1, 1, 'finance_approved', 'p0', 5000000, 201)
  `);

  const { baseUrl, close } = await setupTestApp(db);
  try {
    // 1. PPD creator (201) as Keuangan staff
    const creatorStaffRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: authHeaders({ id: 201, role: 'keuangan', level: 'staff', division: 'Keuangan' }),
    });
    const creatorStaffBody = await creatorStaffRes.json();
    assert.equal(creatorStaffBody.permissions.can_disburse, false, 'PPD Creator staff MUST receive can_disburse = false');

    // 2. PPD creator (201) as Keuangan leader
    const creatorLeaderRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: authHeaders({ id: 201, role: 'keuangan', level: 'leader', division: 'Keuangan' }),
    });
    const creatorLeaderBody = await creatorLeaderRes.json();
    assert.equal(creatorLeaderBody.permissions.can_disburse, false, 'PPD Creator leader MUST receive can_disburse = false');

    // 3. Distinct Keuangan staff (202) CAN disburse
    const disburseStaffRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: authHeaders({ id: 202, role: 'keuangan', level: 'staff', division: 'Keuangan' }),
    });
    const disburseStaffBody = await disburseStaffRes.json();
    assert.equal(disburseStaffBody.permissions.can_disburse, true, 'Distinct Keuangan staff can disburse');

    // 4. Distinct Keuangan leader (203) CAN disburse
    const disburseLeaderRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: authHeaders({ id: 203, role: 'keuangan', level: 'leader', division: 'Keuangan' }),
    });
    const disburseLeaderBody = await disburseLeaderRes.json();
    assert.equal(disburseLeaderBody.permissions.can_disburse, true, 'Distinct Keuangan leader can disburse');

    // 5. Non-Keuangan roles cannot disburse
    for (const [r, l, d] of [
      ['penyaluran', 'staff', 'Penyaluran'],
      ['penyaluran', 'leader', 'Penyaluran'],
      ['surveyor', 'staff', 'Survey'],
      ['admin', 'admin', 'TI'],
    ]) {
      const resp = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
        headers: authHeaders({ id: 999, role: r, level: l, division: d }),
      });
      const b = await resp.json();
      assert.equal(b.permissions.can_disburse, false, `${r} ${l} cannot disburse`);
    }

    // 6. Once payment is recorded, even independent Keuangan cannot disburse again
    await db.run(`
      INSERT INTO ppd_payments (id, ppd_id, transaction_number, paid_amount, paid_at, proof_file_id, verification_status)
      VALUES (1, 1, 'TRX-001', 5000000, CURRENT_TIMESTAMP, 10, 'pending')
    `);
    const paidRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: authHeaders({ id: 202, role: 'keuangan', level: 'staff', division: 'Keuangan' }),
    });
    const paidBody = await paidRes.json();
    assert.equal(paidBody.permissions.can_disburse, false, 'Cannot disburse again once payment is recorded');
  } finally {
    await close();
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// Area 4: Admin Routine Operation Prohibition & Lifecycle Guards
// ---------------------------------------------------------------------------
test('CHALLENGE 4: Admin role blocked from routine operations but holds archive/restore privileges', async () => {
  const db = await createTestDb();
  await db.run("UPDATE mustahik SET status = 'Pengajuan Dana (FPD)' WHERE id = 1");
  await db.run(`
    INSERT INTO mpzis (id, mustahik_id, revision, status, source, total_amount, created_by_id, submitted_by_id)
    VALUES (1, 1, 1, 'approved', 'p0', 3000000, 101, 102)
  `);
  await db.run(`
    INSERT INTO ppd (id, mustahik_id, revision, status, source, amount, created_by_id)
    VALUES (1, 1, 1, 'finance_approved', 'p0', 3000000, 201)
  `);

  const { baseUrl, close } = await setupTestApp(db);
  try {
    const adminActor = { id: 1, role: 'admin', level: 'admin', division: 'TI' };

    // 1. ACTIVE CASE: Admin cannot perform ANY routine operations, but CAN archive
    const activeRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(adminActor) });
    const activeBody = await activeRes.json();

    assert.equal(activeBody.permissions.can_assess, false, 'Admin CANNOT assess');
    assert.equal(activeBody.permissions.can_approve_mpzis, false, 'Admin CANNOT approve MPZIS');
    assert.deepEqual(activeBody.permissions.allowed_mpzis_roles, [], 'Admin has NO allowed_mpzis_roles');
    assert.equal(activeBody.permissions.can_submit_ppd, false, 'Admin CANNOT submit PPD');
    assert.equal(activeBody.permissions.can_disburse, false, 'Admin CANNOT disburse');
    assert.equal(activeBody.permissions.can_archive, true, 'Admin CAN archive active case');
    assert.equal(activeBody.permissions.can_restore, false, 'Admin CANNOT restore unarchived case');

    // Non-admin cannot archive active case
    const staffRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: authHeaders({ id: 101, role: 'penyaluran', level: 'staff', division: 'Penyaluran' }),
    });
    const staffBody = await staffRes.json();
    assert.equal(staffBody.permissions.can_archive, false, 'Staff CANNOT archive');
    assert.equal(staffBody.permissions.can_restore, false, 'Staff CANNOT restore');

    // 2. ARCHIVED CASE: Admin cannot perform routine ops, cannot archive, but CAN restore
    await db.run(`
      UPDATE mustahik SET
        archived_at = CURRENT_TIMESTAMP,
        archived_by_id = 1,
        archive_reason = 'Uji coba challenger'
      WHERE id = 1
    `);

    const archAdminRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(adminActor) });
    const archAdminBody = await archAdminRes.json();

    assert.equal(archAdminBody.case.status, 'ARCHIVED');
    assert.equal(archAdminBody.permissions.can_assess, false, 'Admin CANNOT assess on archived case');
    assert.equal(archAdminBody.permissions.can_approve_mpzis, false, 'Admin CANNOT approve MPZIS on archived case');
    assert.equal(archAdminBody.permissions.can_submit_ppd, false, 'Admin CANNOT submit PPD on archived case');
    assert.equal(archAdminBody.permissions.can_disburse, false, 'Admin CANNOT disburse on archived case');
    assert.equal(archAdminBody.permissions.can_archive, false, 'Admin CANNOT re-archive already archived case');
    assert.equal(archAdminBody.permissions.can_restore, true, 'Admin CAN restore archived case');

    // Non-admin on archived case: ALL permissions false
    const archStaffRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: authHeaders({ id: 101, role: 'penyaluran', level: 'staff', division: 'Penyaluran' }),
    });
    const archStaffBody = await archStaffRes.json();
    assert.equal(archStaffBody.permissions.can_assess, false);
    assert.equal(archStaffBody.permissions.can_approve_mpzis, false);
    assert.equal(archStaffBody.permissions.can_submit_ppd, false);
    assert.equal(archStaffBody.permissions.can_disburse, false);
    assert.equal(archStaffBody.permissions.can_archive, false);
    assert.equal(archStaffBody.permissions.can_restore, false);
  } finally {
    await close();
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// Area 5: State Transitions Across All 9 Canonical Statuses
// ---------------------------------------------------------------------------
test('CHALLENGE 5: Lifecycle permission toggling across all 9 canonical statuses', async () => {
  const db = await createTestDb();
  const { baseUrl, close } = await setupTestApp(db);

  try {
    const staffPenyaluran = { id: 101, role: 'penyaluran', level: 'staff', division: 'Penyaluran' };
    const leaderPenyaluran = { id: 102, role: 'penyaluran', level: 'leader', division: 'Penyaluran' };
    const surveyor = { id: 301, role: 'surveyor', level: 'staff', division: 'Survey' };
    const staffKeuangan = { id: 201, role: 'keuangan', level: 'staff', division: 'Keuangan' };
    const leaderKeuangan = { id: 202, role: 'keuangan', level: 'leader', division: 'Keuangan' };
    const admin = { id: 1, role: 'admin', level: 'admin', division: 'TI' };

    // 1. Status: Diajukan (DRAFT intake)
    await db.run("UPDATE mustahik SET status = 'Diajukan', archived_at = NULL WHERE id = 1");
    const dResStaff = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(staffPenyaluran) });
    const dBodyStaff = await dResStaff.json();
    assert.equal(dBodyStaff.permissions.can_assess, true, 'Staff Penyaluran can assess at Diajukan');
    assert.equal(dBodyStaff.permissions.can_approve_mpzis, false);
    assert.equal(dBodyStaff.permissions.can_submit_ppd, false);
    assert.equal(dBodyStaff.permissions.can_disburse, false);

    const dResSurv = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(surveyor) });
    const dBodySurv = await dResSurv.json();
    assert.equal(dBodySurv.permissions.can_assess, true, 'Surveyor can assess at Diajukan');

    const dResLead = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(leaderPenyaluran) });
    const dBodyLead = await dResLead.json();
    assert.equal(dBodyLead.permissions.can_assess, false, 'Leader Penyaluran CANNOT assess at Diajukan');

    // 2. Status: Verifikasi Administrasi (SUBMITTED)
    await db.run("UPDATE mustahik SET status = 'Verifikasi Administrasi' WHERE id = 1");
    const vRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(staffPenyaluran) });
    const vBody = await vRes.json();
    assert.equal(vBody.permissions.can_assess, false, 'can_assess false at Verifikasi Administrasi');
    assert.equal(vBody.permissions.can_approve_mpzis, false);
    assert.equal(vBody.permissions.can_submit_ppd, false);
    assert.equal(vBody.permissions.can_disburse, false);

    // 3. Status: Survey (ASSESSED)
    await db.run("UPDATE mustahik SET status = 'Survey' WHERE id = 1");
    const sRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(staffPenyaluran) });
    const sBody = await sRes.json();
    assert.equal(sBody.permissions.can_assess, true, 'Staff can assess at Survey');
    assert.equal(sBody.permissions.can_approve_mpzis, false);
    assert.equal(sBody.permissions.can_submit_ppd, false);
    assert.equal(sBody.permissions.can_disburse, false);

    // 4. Status: Persetujuan MPZIS (RECOMMENDED)
    await db.run("UPDATE mustahik SET status = 'Persetujuan MPZIS' WHERE id = 1");
    await db.run(`
      INSERT INTO mpzis (id, mustahik_id, revision, status, source, total_amount, created_by_id, submitted_by_id)
      VALUES (1, 1, 1, 'submitted', 'p0', 1000000, 991, 992)
    `);
    const mRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(staffPenyaluran) });
    const mBody = await mRes.json();
    assert.equal(mBody.permissions.can_assess, false, 'cannot assess at MPZIS');
    assert.equal(mBody.permissions.can_approve_mpzis, true, 'staff can approve MPZIS stage 1');
    assert.equal(mBody.permissions.can_submit_ppd, false);
    assert.equal(mBody.permissions.can_disburse, false);

    // 5. Status: Pengajuan Dana (FPD) (APPROVED)
    await db.run("UPDATE mustahik SET status = 'Pengajuan Dana (FPD)' WHERE id = 1");
    await db.run("UPDATE mpzis SET status = 'approved' WHERE id = 1");
    // Before PPD created: staff can submit PPD
    const fResStaff = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(staffPenyaluran) });
    const fBodyStaff = await fResStaff.json();
    assert.equal(fBodyStaff.permissions.can_assess, false);
    assert.equal(fBodyStaff.permissions.can_approve_mpzis, false);
    assert.equal(fBodyStaff.permissions.can_submit_ppd, true, 'Staff can submit PPD when approved MPZIS exists');
    assert.equal(fBodyStaff.permissions.can_disburse, false);

    // PPD created and finance_approved:
    await db.run(`
      INSERT INTO ppd (id, mustahik_id, revision, status, source, amount, created_by_id)
      VALUES (1, 1, 1, 'finance_approved', 'p0', 1000000, 101)
    `);
    // Staff Penyaluran cannot submit PPD anymore (it's already finance_approved)
    const fResStaffAfter = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(staffPenyaluran) });
    const fBodyStaffAfter = await fResStaffAfter.json();
    assert.equal(fBodyStaffAfter.permissions.can_submit_ppd, false, 'Cannot submit PPD when already finance_approved');

    // Keuangan staff can disburse
    const fResKeu = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(staffKeuangan) });
    const fBodyKeu = await fResKeu.json();
    assert.equal(fBodyKeu.permissions.can_disburse, true, 'Keuangan staff can disburse finance_approved PPD');

    // 6. Status: PAID (Payment recorded in FPD)
    await db.run(`
      INSERT INTO ppd_payments (id, ppd_id, transaction_number, paid_amount, paid_at, proof_file_id, verification_status)
      VALUES (1, 1, 'TRX-101', 1000000, CURRENT_TIMESTAMP, 5, 'verified')
    `);
    await db.run("UPDATE ppd SET status = 'payment_verified' WHERE id = 1");
    const pResKeu = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(staffKeuangan) });
    const pBodyKeu = await pResKeu.json();
    assert.equal(pBodyKeu.permissions.can_disburse, false, 'can_disburse false once payment verified');
    assert.equal(pBodyKeu.permissions.can_assess, false);
    assert.equal(pBodyKeu.permissions.can_approve_mpzis, false);
    assert.equal(pBodyKeu.permissions.can_submit_ppd, false);

    // 7. Status: Penyaluran Selesai (COMPLETED)
    await db.run("UPDATE mustahik SET status = 'Penyaluran Selesai' WHERE id = 1");
    await db.run("UPDATE ppd SET status = 'completed' WHERE id = 1");
    const cResStaff = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(staffPenyaluran) });
    const cBodyStaff = await cResStaff.json();
    assert.equal(cBodyStaff.permissions.can_assess, false, 'can_assess false at Penyaluran Selesai');
    assert.equal(cBodyStaff.permissions.can_approve_mpzis, false);
    assert.equal(cBodyStaff.permissions.can_submit_ppd, false);
    assert.equal(cBodyStaff.permissions.can_disburse, false);
    assert.equal(cBodyStaff.case_progress.is_terminal, true, 'Penyaluran Selesai is terminal');

    // 8. Status: Ditolak (REJECTED)
    await db.run("UPDATE mustahik SET status = 'Ditolak' WHERE id = 1");
    const rResStaff = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(staffPenyaluran) });
    const rBodyStaff = await rResStaff.json();
    assert.equal(rBodyStaff.permissions.can_assess, false, 'can_assess false at Ditolak');
    assert.equal(rBodyStaff.permissions.can_approve_mpzis, false);
    assert.equal(rBodyStaff.permissions.can_submit_ppd, false);
    assert.equal(rBodyStaff.permissions.can_disburse, false);
    assert.equal(rBodyStaff.case_progress.is_terminal, true, 'Ditolak is terminal');

    // 9. Status: ARCHIVED (archived_at is set)
    await db.run("UPDATE mustahik SET status = 'Survey', archived_at = CURRENT_TIMESTAMP, archive_reason = 'Archival test' WHERE id = 1");
    const aResStaff = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(staffPenyaluran) });
    const aBodyStaff = await aResStaff.json();
    assert.equal(aBodyStaff.case.status, 'ARCHIVED');
    assert.equal(aBodyStaff.permissions.can_assess, false, 'can_assess locked on ARCHIVED');
    assert.equal(aBodyStaff.permissions.can_approve_mpzis, false, 'can_approve_mpzis locked on ARCHIVED');
    assert.equal(aBodyStaff.permissions.can_submit_ppd, false, 'can_submit_ppd locked on ARCHIVED');
    assert.equal(aBodyStaff.permissions.can_disburse, false, 'can_disburse locked on ARCHIVED');
    assert.equal(aBodyStaff.permissions.can_archive, false, 'can_archive locked on ARCHIVED');
    assert.equal(aBodyStaff.permissions.can_restore, false, 'non-admin cannot restore ARCHIVED');
    assert.equal(aBodyStaff.case_progress.is_terminal, true, 'ARCHIVED is terminal');

    // Admin restore check on ARCHIVED
    const aResAdmin = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(admin) });
    const aBodyAdmin = await aResAdmin.json();
    assert.equal(aBodyAdmin.permissions.can_restore, true, 'Admin CAN restore ARCHIVED');
    assert.equal(aBodyAdmin.permissions.can_archive, false);
  } finally {
    await close();
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// Area 6: Role/Division Mismatch Fail-Closed
// ---------------------------------------------------------------------------
test('CHALLENGE 6: Role and division tampering fails closed with 403 PERMISSION_DENIED', async () => {
  const db = await createTestDb();
  await db.run("UPDATE mustahik SET status = 'Survey' WHERE id = 1");

  const { baseUrl, close } = await setupTestApp(db);
  try {
    // Penyaluran role but Keuangan division -> fails CASE_READ check with 403
    const spoof1 = { id: 701, role: 'penyaluran', level: 'staff', division: 'Keuangan' };
    const res1 = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(spoof1) });
    assert.equal(res1.status, 403, 'Spoofed penyaluran+keuangan gets 403 PERMISSION_DENIED');
    const b1 = await res1.json();
    assert.equal(b1.code, 'PERMISSION_DENIED');

    // Keuangan role but Penyaluran division -> fails CASE_READ check with 403
    const spoof2 = { id: 702, role: 'keuangan', level: 'staff', division: 'Penyaluran' };
    const res2 = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(spoof2) });
    assert.equal(res2.status, 403, 'Spoofed keuangan+penyaluran gets 403 PERMISSION_DENIED');
    const b2 = await res2.json();
    assert.equal(b2.code, 'PERMISSION_DENIED');

    // Random role -> fails CASE_READ check with 403
    const spoof3 = { id: 703, role: 'external', level: 'staff', division: 'Luar' };
    const res3 = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(spoof3) });
    assert.equal(res3.status, 403, 'External role gets 403 PERMISSION_DENIED on workspace read');
    const b3 = await res3.json();
    assert.equal(b3.code, 'PERMISSION_DENIED');
  } finally {
    await close();
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// Area 7: Legacy Case Absolute Mutation Freeze
// ---------------------------------------------------------------------------
test('CHALLENGE 7: Legacy case permanently freezes all mutations regardless of actor credentials', async () => {
  const db = await createTestDb();
  await db.run("UPDATE mustahik SET status = 'Survey', workflow_mode = 'legacy' WHERE id = 1");

  const { baseUrl, close } = await setupTestApp(db);
  try {
    const staff = { id: 101, role: 'penyaluran', level: 'staff', division: 'Penyaluran' };
    const res = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(staff) });
    const body = await res.json();

    assert.equal(body.case.workflow_mode, 'legacy');
    assert.equal(body.case.is_legacy, true);
    assert.equal(body.case.legacy_banner, true);
    assert.equal(body.permissions.can_assess, false, 'Legacy case CANNOT be assessed');
    assert.equal(body.permissions.can_approve_mpzis, false, 'Legacy case CANNOT have MPZIS approved');
    assert.equal(body.permissions.can_submit_ppd, false, 'Legacy case CANNOT have PPD submitted');
    assert.equal(body.permissions.can_disburse, false, 'Legacy case CANNOT be disbursed');
  } finally {
    await close();
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// Area 8: Assessment Status Toggle
// ---------------------------------------------------------------------------
test('CHALLENGE 8: Assessment status toggles can_assess correctly (accepted vs draft/returned)', async () => {
  const db = await createTestDb();
  await db.run("UPDATE mustahik SET status = 'Survey' WHERE id = 1");

  const { baseUrl, close } = await setupTestApp(db);
  try {
    const staff = { id: 101, role: 'penyaluran', level: 'staff', division: 'Penyaluran' };

    // 1. With draft assessment -> can_assess is true
    await db.run(`
      INSERT INTO assessments (id, mustahik_id, revision, status, source)
      VALUES (1, 1, 1, 'draft', 'p0')
    `);
    const resDraft = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(staff) });
    const bodyDraft = await resDraft.json();
    assert.equal(bodyDraft.permissions.can_assess, true, 'can_assess is true when activeAssessment is draft');

    // 2. With accepted assessment -> can_assess MUST BE false
    await db.run("UPDATE assessments SET status = 'accepted' WHERE id = 1");
    const resAcc = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(staff) });
    const bodyAcc = await resAcc.json();
    assert.equal(bodyAcc.permissions.can_assess, false, 'can_assess MUST BE false once assessment is accepted');

    // 3. With returned assessment -> can_assess is true again for re-assessment
    await db.run("UPDATE assessments SET status = 'returned' WHERE id = 1");
    const resRet = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, { headers: authHeaders(staff) });
    const bodyRet = await resRet.json();
    assert.equal(bodyRet.permissions.can_assess, true, 'can_assess is true when assessment is returned');
  } finally {
    await close();
    await db.close();
  }
});

// ---------------------------------------------------------------------------
// Area 9: Canonical ID Type Parity (String vs Number IDs)
// ---------------------------------------------------------------------------
test('CHALLENGE 9: Actor ID type coercion cannot bypass creator or approver segregation', async () => {
  const db = await createTestDb();
  await db.run("UPDATE mustahik SET status = 'Persetujuan MPZIS' WHERE id = 1");
  // Creator stored as integer 101 in DB
  await db.run(`
    INSERT INTO mpzis (id, mustahik_id, revision, status, source, total_amount, created_by_id, submitted_by_id)
    VALUES (1, 1, 1, 'submitted', 'p0', 1000000, 101, 102)
  `);

  const { baseUrl, close } = await setupTestApp(db);
  try {
    // 1. Actor passing ID as string "101" matches integer created_by_id 101
    const resStringId = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: {
        Authorization: 'Bearer test-token',
        'X-Actor-Id': '101',
        'X-Actor-Name': 'Creator String',
        'X-Actor-Role': 'penyaluran',
        'X-Actor-Level': 'staff',
        'X-Actor-Division': 'Penyaluran',
      },
    });
    const bodyStringId = await resStringId.json();
    assert.equal(bodyStringId.permissions.can_approve_mpzis, false, 'String actor ID "101" blocked as creator');

    // 2. Used approver with string vs integer ID
    await db.run(`
      INSERT INTO artifact_approvals (mustahik_id, artifact_type, artifact_id, artifact_revision, approval_step, action, actor_id, actor_name, actor_role, actor_level, actor_division, snapshot_hash)
      VALUES (1, 'mpzis', 1, 1, 'proposed', 'approve', 103, 'Actor 103', 'penyaluran', 'staff', 'Penyaluran', '1111111111111111111111111111111111111111111111111111111111111111')
    `);
    await db.run("UPDATE mpzis SET status = 'proposed' WHERE id = 1");

    const resUsedString = await fetch(`${baseUrl}/api/penyaluran/mustahik/1/workspace`, {
      headers: {
        Authorization: 'Bearer test-token',
        'X-Actor-Id': '103',
        'X-Actor-Name': 'Used Approver String',
        'X-Actor-Role': 'penyaluran',
        'X-Actor-Level': 'staff',
        'X-Actor-Division': 'Penyaluran',
      },
    });
    const bodyUsedString = await resUsedString.json();
    assert.equal(bodyUsedString.permissions.can_approve_mpzis, false, 'String actor ID "103" blocked as used approver');
    assert.deepEqual(bodyUsedString.permissions.allowed_mpzis_roles, []);
  } finally {
    await close();
    await db.close();
  }
});

