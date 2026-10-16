import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import {
  archiveCase,
  restoreCase,
  recoverArtifactStep,
} from './penyaluran-p0/legacy-reconciliation.js';
import { createSnapshot } from './penyaluran-p0/canonical-snapshot.js';
import { createP0TestDatabase } from './penyaluran-p0-test-helpers.js';
import { requireProductionSecret } from './access-policy.js';
import app from './index.js';

process.env.NODE_ENV = 'test';

const JWT_SECRET = requireProductionSecret();
const adminToken = jwt.sign(
  { id: 1, email: 'admin@baznas.go.id', role: 'admin', level: 'admin', division: 'IT' },
  JWT_SECRET,
);
const staffToken = jwt.sign(
  { id: 2, email: 'staff@baznas.go.id', role: 'penyaluran', level: 'staff', division: 'Penyaluran' },
  JWT_SECRET,
);

const caseRow = async (db, id) => db.get('SELECT * FROM mustahik WHERE id = $1', [id]);
const count = async (db, table, filter = '') => {
  const where = filter ? ` WHERE ${filter}` : '';
  return Number((await db.get(`SELECT COUNT(*) as count FROM ${table}${where}`)).count);
};

function buildNaturalText(length) {
  const phrase = 'Pengarsipan data mustahik resmi oleh admin BAZNAS. ';
  let result = '';
  while (result.length + phrase.length <= length) {
    result += phrase;
  }
  if (result.length < length) {
    const filler = 'Proses verifikasi dokumen telah selesai dan sah secara menyeluruh.';
    const needed = length - result.length;
    result += filler.slice(0, needed - 1) + '.';
  }
  assert.equal(result.length, length, `Generated text must have exact length ${length}`);
  return result;
}

let keyCounter = 1;
function archMeta(overrides = {}) {
  return {
    expected_status: 'draft',
    expected_version: 0,
    idempotency_key: `adv-arch-key-${keyCounter++}`,
    ...overrides,
  };
}
function restMeta(overrides = {}) {
  return {
    expected_status: 'draft',
    expected_version: 1,
    idempotency_key: `adv-rest-key-${keyCounter++}`,
    ...overrides,
  };
}

function startServer(expressApp) {
  return new Promise((resolve) => {
    const s = expressApp.listen(0, '127.0.0.1', () => resolve(s));
  });
}

async function makeRequest(baseUrl, method, routePath, { token, body, headers = {} } = {}) {
  const reqHeaders = { ...headers };
  if (token) reqHeaders.authorization = `Bearer ${token}`;
  const init = { method, headers: reqHeaders };
  if (body !== undefined) {
    reqHeaders['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${routePath}`, init);
  let json = null;
  const text = await response.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: response.status, body: json, headers: response.headers };
}

// =========================================================================
// CHALLENGE SUITE 1: REASON BOUNDARY CONDITIONS & EDGE CASES
// =========================================================================

test('REASON BOUNDARY: 19 characters rejects with 422 VALIDATION_FAILED (Archive & Restore)', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };
  const reason19 = 'Alasan arsip valid.'; // length 19
  assert.equal(reason19.length, 19);

  // 1. Archive with 19 chars -> throws 422
  await assert.rejects(
    () => archiveCase(adminCtx, 1, archMeta({ reason: reason19 })),
    (err) => {
      assert.equal(err.status, 422, 'Status must be 422');
      assert.equal(err.code, 'VALIDATION_FAILED', 'Code must be VALIDATION_FAILED');
      assert.deepEqual(err.field_errors, { reason: 'LENGTH_RANGE' });
      return true;
    },
  );

  // Check with 'note' field as well
  await assert.rejects(
    () => archiveCase(adminCtx, 1, archMeta({ note: reason19 })),
    (err) => err.status === 422 && err.code === 'VALIDATION_FAILED',
  );

  // Setup archived case for restore test
  await archiveCase(adminCtx, 1, archMeta({ reason: 'Alasan pengarsipan yang valid lebih dari 20 karakter.' }));
  assert.notEqual((await caseRow(db, 1)).archived_at, null);

  // 2. Restore with 19 chars -> throws 422
  await assert.rejects(
    () => restoreCase(adminCtx, 1, restMeta({ reason: reason19 })),
    (err) => {
      assert.equal(err.status, 422, 'Status must be 422');
      assert.equal(err.code, 'VALIDATION_FAILED', 'Code must be VALIDATION_FAILED');
      assert.deepEqual(err.field_errors, { reason: 'LENGTH_RANGE' });
      return true;
    },
  );

  await db.close();
});
// EOF
test('REASON BOUNDARY: 20 characters succeeds (Archive & Restore)', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };
  const reason20 = 'Alasan arsip valid!!'; // length 20
  assert.equal(reason20.length, 20);

  // 1. Archive succeeds
  const archResult = await archiveCase(adminCtx, 1, archMeta({ reason: reason20 }));
  assert.equal(archResult.success, true);
  assert.equal(archResult.data.archived, true);
  assert.equal((await caseRow(db, 1)).archive_reason, reason20);

  // 2. Restore succeeds
  const restore20 = 'Alasan restore sah!!'; // length 20
  assert.equal(restore20.length, 20);
  const restResult = await restoreCase(adminCtx, 1, restMeta({ reason: restore20 }));
  assert.equal(restResult.success, true);
  assert.equal(restResult.data.archived, false);
  assert.equal((await caseRow(db, 1)).archived_at, null);

  await db.close();
});
test('REASON BOUNDARY: 1000 characters succeeds (Archive & Restore)', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };
  const reason1000 = buildNaturalText(1000);
  assert.equal(reason1000.length, 1000);

  // 1. Archive with 1000 chars succeeds
  const archResult = await archiveCase(adminCtx, 1, archMeta({ reason: reason1000 }));
  assert.equal(archResult.success, true);
  assert.equal(archResult.data.archived, true);
  assert.equal((await caseRow(db, 1)).archive_reason, reason1000);

  // 2. Restore with 1000 chars succeeds
  const restore1000 = buildNaturalText(1000);
  assert.equal(restore1000.length, 1000);
  const restResult = await restoreCase(adminCtx, 1, restMeta({ reason: restore1000 }));
  assert.equal(restResult.success, true);
  assert.equal(restResult.data.archived, false);

  await db.close();
});

test('REASON BOUNDARY: 1001 characters rejects with 422 VALIDATION_FAILED (Archive & Restore)', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };
  const reason1001 = buildNaturalText(1000) + '!';
  assert.equal(reason1001.length, 1001);

  // 1. Archive with 1001 chars rejects
  await assert.rejects(
    () => archiveCase(adminCtx, 1, archMeta({ reason: reason1001 })),
    (err) => {
      assert.equal(err.status, 422);
      assert.equal(err.code, 'VALIDATION_FAILED');
      assert.deepEqual(err.field_errors, { reason: 'LENGTH_RANGE' });
      return true;
    },
  );

  // Setup archived case for restore test
  await archiveCase(adminCtx, 1, archMeta({ reason: 'Alasan arsip valid memenuhi syarat panjang.' }));

  // 2. Restore with 1001 chars rejects
  await assert.rejects(
    () => restoreCase(adminCtx, 1, restMeta({ reason: reason1001 })),
    (err) => {
      assert.equal(err.status, 422);
      assert.equal(err.code, 'VALIDATION_FAILED');
      assert.deepEqual(err.field_errors, { reason: 'LENGTH_RANGE' });
      return true;
    },
  );

  await db.close();
});

test('REASON BOUNDARY: Empty string and whitespace-only string reject with 422 (Archive & Restore)', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };

  const emptyValues = ['', '   ', '\t\n\r  \t', '               '];

  for (const emptyVal of emptyValues) {
    // Archive rejects empty / whitespace
    await assert.rejects(
      () => archiveCase(adminCtx, 1, archMeta({ reason: emptyVal })),
      (err) => err.status === 422 && err.code === 'VALIDATION_FAILED',
      `Archive must reject "${emptyVal}"`,
    );
  }

  // Also when reason/note omitted completely
  await assert.rejects(
    () => archiveCase(adminCtx, 1, archMeta({})),
    (err) => err.status === 422 && err.code === 'VALIDATION_FAILED',
  );

  // Setup archived case for restore test
  await archiveCase(adminCtx, 1, archMeta({ reason: 'Alasan arsip valid sebelum pengujian restore.' }));

  for (const emptyVal of emptyValues) {
    // Restore rejects empty / whitespace
    await assert.rejects(
      () => restoreCase(adminCtx, 1, restMeta({ reason: emptyVal })),
      (err) => err.status === 422 && err.code === 'VALIDATION_FAILED',
      `Restore must reject "${emptyVal}"`,
    );
  }

  await db.close();
});

test('REASON BOUNDARY: Padding and trimmed length edge cases', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };

  // Case A: raw length 25 (3 spaces + 19 chars + 3 spaces), trimmed length 19 -> MUST REJECT
  const padded19 = '   ' + 'Alasan arsip valid.' + '   ';
  assert.equal(padded19.length, 25);
  assert.equal(padded19.trim().length, 19);
  await assert.rejects(
    () => archiveCase(adminCtx, 1, archMeta({ reason: padded19 })),
    (err) => err.status === 422 && err.code === 'VALIDATION_FAILED',
  );

  // Case B: raw length 26 (3 spaces + 20 chars + 3 spaces), trimmed length 20 -> MUST SUCCEED
  const padded20 = '   ' + 'Alasan arsip valid!!' + '   ';
  assert.equal(padded20.length, 26);
  assert.equal(padded20.trim().length, 20);
  const archResult = await archiveCase(adminCtx, 1, archMeta({ reason: padded20 }));
  assert.equal(archResult.success, true);
  // Stored reason must be the trimmed version
  assert.equal((await caseRow(db, 1)).archive_reason, 'Alasan arsip valid!!');

  // Case C: raw length 1006, trimmed 1000 -> MUST SUCCEED
  const padded1000 = '   ' + buildNaturalText(1000) + '   ';
  const restResult = await restoreCase(adminCtx, 1, restMeta({ reason: padded1000 }));
  assert.equal(restResult.success, true);

  // Case D: raw length 1007, trimmed 1001 -> MUST REJECT
  const padded1001 = '   ' + buildNaturalText(1000) + '!' + '   ';
  await assert.rejects(
    () => archiveCase(adminCtx, 1, archMeta({ reason: padded1001 })),
    (err) => err.status === 422 && err.code === 'VALIDATION_FAILED',
  );

  await db.close();
});

test('HTTP LAYER: Reason boundary checks via Express POST endpoints', async () => {
  const db = await createP0TestDatabase();
  app.locals.db = db;
  const server = await startServer(app);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. 19 chars -> 422
    const res19 = await makeRequest(baseUrl, 'POST', '/api/mustahik/1/archive', {
      token: adminToken,
      body: archMeta({ reason: 'Alasan arsip valid.' }),
    });
    assert.equal(res19.status, 422);
    assert.equal(res19.body.code, 'VALIDATION_FAILED');
    assert.deepEqual(res19.body.field_errors, { reason: 'LENGTH_RANGE' });

    // 2. Whitespace only -> 422
    const resWs = await makeRequest(baseUrl, 'POST', '/api/mustahik/1/archive', {
      token: adminToken,
      body: archMeta({ reason: '                ' }),
    });
    assert.equal(resWs.status, 422);
    assert.equal(resWs.body.code, 'VALIDATION_FAILED');

    // 3. 1001 chars -> 422
    const res1001 = await makeRequest(baseUrl, 'POST', '/api/mustahik/1/archive', {
      token: adminToken,
      body: archMeta({ reason: buildNaturalText(1000) + '!' }),
    });
    assert.equal(res1001.status, 422);
    assert.equal(res1001.body.code, 'VALIDATION_FAILED');

    // 4. 20 chars -> 200
    const res20 = await makeRequest(baseUrl, 'POST', '/api/mustahik/1/archive', {
      token: adminToken,
      body: archMeta({ reason: 'Alasan arsip valid!!' }),
    });
    assert.equal(res20.status, 200);
    assert.equal(res20.body.success, true);
    assert.equal(res20.body.data.archived, true);

    // 5. Restore with 19 chars -> 422
    const resRest19 = await makeRequest(baseUrl, 'POST', '/api/mustahik/1/restore', {
      token: adminToken,
      body: restMeta({ reason: 'Alasan pulih valid.' }),
    });
    assert.equal(resRest19.status, 422);
    assert.equal(resRest19.body.code, 'VALIDATION_FAILED');

    // 6. Restore with 20 chars -> 200
    const resRest20 = await makeRequest(baseUrl, 'POST', '/api/mustahik/1/restore', {
      token: adminToken,
      body: restMeta({ reason: 'Alasan pulih valid!!' }),
    });
    assert.equal(resRest20.status, 200);
    assert.equal(resRest20.body.success, true);
    assert.equal(resRest20.body.data.archived, false);
  } finally {
    server.close();
    await db.close();
  }
});

// =========================================================================
// CHALLENGE SUITE 2: IDEMPOTENCY REPLAY VS PAYLOAD TAMPERING
// =========================================================================

test('IDEMPOTENCY: Identical payload returns replayed=true without side effects', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };
  const idempotencyKey = 'archive-key-replay-challenge-1';
  const validReason = 'Pengarsipan resmi karena pembatalan pengajuan oleh pemohon.';

  // First call: executes archive
  const first = await archiveCase(adminCtx, 1, archMeta({
    reason: validReason,
    idempotency_key: idempotencyKey,
  }));
  assert.equal(first.success, true);
  assert.equal(first.replayed, false);
  assert.equal(first.data.archived, true);
  assert.equal(first.data.workflow_version, 1);

  const actCount1 = await count(db, 'activity_logs', 'mustahik_id = 1');
  const appCount1 = await count(db, 'artifact_approvals', 'mustahik_id = 1');
  assert.equal(actCount1, 1);
  assert.equal(appCount1, 1);

  // Second call: exact same key and reason -> MUST return replayed=true
  const second = await archiveCase(adminCtx, 1, archMeta({
    reason: validReason,
    idempotency_key: idempotencyKey,
  }));
  assert.equal(second.success, true);
  assert.equal(second.replayed, true);
  assert.equal(second.data.archived, true);
  assert.equal(second.data.workflow_version, 1);

  // Verify zero additional side effects
  const actCount2 = await count(db, 'activity_logs', 'mustahik_id = 1');
  const appCount2 = await count(db, 'artifact_approvals', 'mustahik_id = 1');
  const versionAfter = (await caseRow(db, 1)).workflow_version;
  assert.equal(actCount2, actCount1, 'Activity logs must not duplicate');
  assert.equal(appCount2, appCount1, 'Artifact approvals must not duplicate');
  assert.equal(versionAfter, 1, 'Workflow version must not increment on replay');

  await db.close();
});

test('IDEMPOTENCY: Tampered payload with same key throws 409 IDEMPOTENCY_KEY_REUSED (Archive)', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };
  const idempotencyKey = 'archive-key-tamper-challenge-1';
  const reasonOriginal = 'Alasan pengarsipan asli sebelum dimodifikasi pihak luar.';
  const reasonTampered = 'Alasan pengarsipan PALSU hasil manipulasi parameter payload.';

  // 1. Initial reservation & completion
  const originalResult = await archiveCase(adminCtx, 1, archMeta({
    reason: reasonOriginal,
    idempotency_key: idempotencyKey,
  }));
  assert.equal(originalResult.replayed, false);

  // 2. Tampered reason with same key -> MUST throw 409 IDEMPOTENCY_KEY_REUSED
  await assert.rejects(
    () => archiveCase(adminCtx, 1, archMeta({
      reason: reasonTampered,
      idempotency_key: idempotencyKey,
    })),
    (err) => {
      assert.equal(err.status, 409, 'Status must be 409');
      assert.equal(err.code, 'IDEMPOTENCY_KEY_REUSED', 'Code must be IDEMPOTENCY_KEY_REUSED');
      return true;
    },
  );

  // 3. Tampered case ID with same key and original reason -> MUST throw 409 IDEMPOTENCY_KEY_REUSED
  // Insert case 2
  await db.run('INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (2, $1, $2, 0)', ['draft', 'p0']);
  await assert.rejects(
    () => archiveCase(adminCtx, 2, archMeta({
      reason: reasonOriginal,
      idempotency_key: idempotencyKey,
    })),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'IDEMPOTENCY_KEY_REUSED');
      return true;
    },
  );

  // Verify database: case 1 retains original reason, case 2 remains unarchived
  assert.equal((await caseRow(db, 1)).archive_reason, reasonOriginal);
  assert.equal((await caseRow(db, 2)).archived_at, null);

  await db.close();
});

test('IDEMPOTENCY: Replay vs tampering on Restore', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };

  // Archive case 1 first
  await archiveCase(adminCtx, 1, archMeta({ reason: 'Arsip awal sebelum pengujian restore idempotency.' }));
  assert.notEqual((await caseRow(db, 1)).archived_at, null);

  const restoreKey = 'restore-key-challenge-1';
  const originalRestoreReason = 'Pemulihan data mustahik setelah dokumen terverifikasi absah.';
  const tamperedRestoreReason = 'Pemulihan data dengan alasan yang berbeda untuk tampering.';

  // 1. First restore call
  const firstRestore = await restoreCase(adminCtx, 1, restMeta({
    reason: originalRestoreReason,
    idempotency_key: restoreKey,
  }));
  assert.equal(firstRestore.success, true);
  assert.equal(firstRestore.replayed, false);
  assert.equal(firstRestore.data.archived, false);
  assert.equal(firstRestore.data.workflow_version, 2);

  // 2. Replay with identical key & reason -> returns replayed=true
  const replayedRestore = await restoreCase(adminCtx, 1, restMeta({
    reason: originalRestoreReason,
    idempotency_key: restoreKey,
  }));
  assert.equal(replayedRestore.success, true);
  assert.equal(replayedRestore.replayed, true);
  assert.equal(replayedRestore.data.workflow_version, 2);

  // 3. Tampered restore reason with same key -> 409 IDEMPOTENCY_KEY_REUSED
  await assert.rejects(
    () => restoreCase(adminCtx, 1, restMeta({
      reason: tamperedRestoreReason,
      idempotency_key: restoreKey,
    })),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'IDEMPOTENCY_KEY_REUSED');
      return true;
    },
  );

  await db.close();
});

test('IDEMPOTENCY: Cross-action reuse (Archive key reused on Restore) rejects with 409', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };

  const sharedKey = 'cross-action-idempotency-key-1';
  const sameReason = 'Alasan yang sama persis untuk arsip maupun pemulihan kasus.';

  // 1. Archive case using sharedKey
  await archiveCase(adminCtx, 1, archMeta({
    reason: sameReason,
    idempotency_key: sharedKey,
  }));

  // 2. Now attempt restoreCase using the EXACT SAME key and reason
  // Because action ('restore' vs 'archive') is part of the request hash,
  // this must be detected as payload tampering and reject with 409 IDEMPOTENCY_KEY_REUSED!
  await assert.rejects(
    () => restoreCase(adminCtx, 1, restMeta({
      reason: sameReason,
      idempotency_key: sharedKey,
    })),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'IDEMPOTENCY_KEY_REUSED');
      return true;
    },
  );

  await db.close();
});

test('HTTP LAYER: Idempotency replay and tampering via Express headers', async () => {
  const db = await createP0TestDatabase();
  app.locals.db = db;
  const server = await startServer(app);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const httpKey = 'http-idempotency-key-test-99';
  const bodyOriginal = archMeta({ reason: 'Alasan arsip asli melalui HTTP request header.', idempotency_key: httpKey });
  const bodyTampered = archMeta({ reason: 'Alasan arsip kedua yang diubah secara tidak sah.', idempotency_key: httpKey });

  try {
    // 1. First HTTP request with Idempotency-Key
    const res1 = await makeRequest(baseUrl, 'POST', '/api/admin/penyaluran/mustahik/1/archive', {
      token: adminToken,
      headers: { 'Idempotency-Key': httpKey },
      body: bodyOriginal,
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.body.replayed, false);
    assert.equal(res1.body.data.archived, true);

    // 2. Replayed HTTP request with identical key and payload
    const res2 = await makeRequest(baseUrl, 'POST', '/api/admin/penyaluran/mustahik/1/archive', {
      token: adminToken,
      headers: { 'Idempotency-Key': httpKey },
      body: bodyOriginal,
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.body.replayed, true);
    assert.equal(res2.body.data.archived, true);

    // 3. Tampered HTTP request with same Idempotency-Key but different reason
    const res3 = await makeRequest(baseUrl, 'POST', '/api/admin/penyaluran/mustahik/1/archive', {
      token: adminToken,
      headers: { 'Idempotency-Key': httpKey },
      body: bodyTampered,
    });
    assert.equal(res3.status, 409);
    assert.equal(res3.body.code, 'IDEMPOTENCY_KEY_REUSED');
  } finally {
    server.close();
    await db.close();
  }
});

// =========================================================================
// CHALLENGE SUITE 3: STATE TRANSITION CONFLICTS
// =========================================================================

test('STATE TRANSITION: Archiving an already archived case throws 409 WRONG_STATE', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };

  // 1. First archive succeeds
  await archiveCase(adminCtx, 1, archMeta({
    reason: 'Pengarsipan pertama kasus mustahik oleh admin IT.',
    idempotency_key: 'archive-state-step-1',
  }));
  const rowAfterFirst = await caseRow(db, 1);
  assert.notEqual(rowAfterFirst.archived_at, null);
  assert.equal(rowAfterFirst.workflow_version, 1);

  // 2. Second archive with a new idempotency key -> MUST throw 409 WRONG_STATE
  await assert.rejects(
    () => archiveCase(adminCtx, 1, archMeta({
      reason: 'Percobaan pengarsipan ulang kasus yang sudah diarsipkan.',
      expected_version: 1,
      idempotency_key: 'archive-state-step-2',
    })),
    (err) => {
      assert.equal(err.status, 409, 'Status must be 409');
      assert.equal(err.code, 'WRONG_STATE', 'Code must be WRONG_STATE');
      assert.match(err.message, /sudah diarsipkan/i);
      return true;
    },
  );

  // 3. Third archive with different key -> MUST also throw 409 WRONG_STATE
  await assert.rejects(
    () => archiveCase(adminCtx, 1, archMeta({
      reason: 'Percobaan pengarsipan ketiga tanpa idempotency key lama.',
      expected_version: 1,
    })),
    (err) => err.status === 409 && err.code === 'WRONG_STATE',
  );

  // Verify workflow_version did not change
  assert.equal((await caseRow(db, 1)).workflow_version, 1);

  await db.close();
});

test('STATE TRANSITION: Restoring an active case throws 409 WRONG_STATE', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };

  // Case 1 is initially active (archived_at is null)
  const initialRow = await caseRow(db, 1);
  assert.equal(initialRow.archived_at, null);

  // 1. Restoring active case with idempotency key -> MUST throw 409 WRONG_STATE
  await assert.rejects(
    () => restoreCase(adminCtx, 1, restMeta({
      reason: 'Mencoba memulihkan mustahik yang sedang berstatus aktif.',
      expected_version: 0,
      idempotency_key: 'restore-active-key-1',
    })),
    (err) => {
      assert.equal(err.status, 409, 'Status must be 409');
      assert.equal(err.code, 'WRONG_STATE', 'Code must be WRONG_STATE');
      assert.match(err.message, /tidak dalam status arsip/i);
      return true;
    },
  );

  // 2. Restoring active case without idempotency key -> MUST throw 409 WRONG_STATE
  await assert.rejects(
    () => restoreCase(adminCtx, 1, restMeta({
      reason: 'Mencoba memulihkan mustahik aktif tanpa idempotency key lama.',
      expected_version: 0,
    })),
    (err) => err.status === 409 && err.code === 'WRONG_STATE',
  );

  // 3. Double restore scenario:
  // Archive case first, restore it once, then try to restore it a second time
  await archiveCase(adminCtx, 1, archMeta({
    reason: 'Pengarsipan resmi sebelum pengujian double restore.',
  }));
  assert.notEqual((await caseRow(db, 1)).archived_at, null);

  // First restore succeeds
  await restoreCase(adminCtx, 1, restMeta({
    reason: 'Pemulihan pertama yang berhasil dan mengembalikan status aktif.',
    expected_version: 1,
    idempotency_key: 'double-restore-step-1',
  }));
  assert.equal((await caseRow(db, 1)).archived_at, null);

  // Second restore with NEW key -> MUST throw 409 WRONG_STATE
  await assert.rejects(
    () => restoreCase(adminCtx, 1, restMeta({
      reason: 'Pemulihan kedua kali yang harus ditolak karena sudah aktif.',
      expected_version: 2,
      idempotency_key: 'double-restore-step-2',
    })),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'WRONG_STATE');
      return true;
    },
  );

  await db.close();
});

test('STATE TRANSITION: Stale optimistic version guard (expected_version mismatch)', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };

  // Current version is 0. Passing expected_version = 1 must throw 409 STALE_STATE
  await assert.rejects(
    () => archiveCase(adminCtx, 1, archMeta({
      reason: 'Alasan arsip dengan versi workflow yang salah.',
      expected_version: 1,
    })),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'STALE_STATE');
      return true;
    },
  );

  // Archive with matching expected_version = 0 succeeds
  await archiveCase(adminCtx, 1, archMeta({
    reason: 'Alasan arsip dengan versi workflow yang sesuai.',
    expected_version: 0,
  }));
  assert.equal((await caseRow(db, 1)).workflow_version, 1);

  // Restore with stale expected_version = 0 must throw 409 STALE_STATE
  await assert.rejects(
    () => restoreCase(adminCtx, 1, restMeta({
      reason: 'Alasan restore dengan versi workflow usang.',
      expected_version: 0,
    })),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'STALE_STATE');
      return true;
    },
  );

  // Restore with matching expected_version = 1 succeeds
  await restoreCase(adminCtx, 1, restMeta({
    reason: 'Alasan restore dengan versi workflow yang valid.',
    expected_version: 1,
  }));
  assert.equal((await caseRow(db, 1)).workflow_version, 2);

  await db.close();
});

test('STATE TRANSITION: Non-existent case throws 404 CASE_NOT_FOUND', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };

  await assert.rejects(
    () => archiveCase(adminCtx, 999999, archMeta({ reason: 'Arsip kasus nomor 999999 yang tidak ada.' })),
    (err) => {
      assert.equal(err.status, 404);
      assert.equal(err.code, 'CASE_NOT_FOUND');
      return true;
    },
  );

  await assert.rejects(
    () => restoreCase(adminCtx, 999999, restMeta({ reason: 'Restore kasus nomor 999999 yang tidak ada.' })),
    (err) => {
      assert.equal(err.status, 404);
      assert.equal(err.code, 'CASE_NOT_FOUND');
      return true;
    },
  );

  await db.close();
});

test('HTTP LAYER: State transition conflict responses (409 WRONG_STATE and 404)', async () => {
  const db = await createP0TestDatabase();
  app.locals.db = db;
  const server = await startServer(app);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Restoring active case returns 409 WRONG_STATE
    const restActiveRes = await makeRequest(baseUrl, 'POST', '/api/admin/penyaluran/mustahik/1/restore', {
      token: adminToken,
      body: restMeta({ reason: 'Mencoba restore kasus aktif melalui HTTP.', expected_version: 0 }),
    });
    assert.equal(restActiveRes.status, 409);
    assert.equal(restActiveRes.body.code, 'WRONG_STATE');

    // 2. Archive once succeeds
    const archRes = await makeRequest(baseUrl, 'POST', '/api/admin/penyaluran/mustahik/1/archive', {
      token: adminToken,
      body: archMeta({ reason: 'Pengarsipan pertama melalui HTTP yang sah.' }),
    });
    assert.equal(archRes.status, 200);

    // 3. Archiving already archived case returns 409 WRONG_STATE
    const reArchRes = await makeRequest(baseUrl, 'POST', '/api/admin/penyaluran/mustahik/1/archive', {
      token: adminToken,
      body: archMeta({ reason: 'Mencoba arsip ulang kasus yang sudah diarsipkan.', expected_version: 1 }),
    });
    assert.equal(reArchRes.status, 409);
    assert.equal(reArchRes.body.code, 'WRONG_STATE');

    // 4. Archive non-existent case returns 404 CASE_NOT_FOUND
    const nonExistentRes = await makeRequest(baseUrl, 'POST', '/api/admin/penyaluran/mustahik/88888/archive', {
      token: adminToken,
      body: archMeta({ reason: 'Pengarsipan kasus yang sama sekali tidak ada.' }),
    });
    assert.equal(nonExistentRes.status, 404);
    assert.equal(nonExistentRes.body.code, 'CASE_NOT_FOUND');
  } finally {
    server.close();
    await db.close();
  }
});
// =========================================================================
// CHALLENGE SUITE 4: RECOVERY OVERRIDE PROVENANCE AND ACTOR SEPARATION
// =========================================================================

test('RECOVERY OVERRIDE: rejects invalid artifact types, scope mismatches, and tampered hashes', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };

  const recoveryMpzis = createSnapshot('mpzis', {
    schema_version: 1,
    artifact_type: 'mpzis',
    id: 501,
    revision: 1,
    mustahik_id: 50,
    application_id: null,
    template_code: 'MPZIS_P0',
    template_version: '1',
    source: 'p0',
  });
  const sampleHash = recoveryMpzis.hash;
  assert.equal(typeof sampleHash, 'string');
  // Setup users in test DB
  await db.run("INSERT INTO users (id, name, email, role, level, division, is_active) VALUES (20, 'Staff Penyaluran', 'staff20@baznas.go.id', 'penyaluran', 'staff', 'Penyaluran', TRUE)");
  await db.run("INSERT INTO users (id, name, email, role, level, division, is_active) VALUES (21, 'Staff Inactive', 'inactive@baznas.go.id', 'penyaluran', 'staff', 'Penyaluran', FALSE)");
  await db.run("INSERT INTO users (id, name, email, role, level, division, is_active) VALUES (22, 'MPZIS Creator', 'creator22@baznas.go.id', 'penyaluran', 'staff', 'Penyaluran', TRUE)");
  await db.run("INSERT INTO users (id, name, email, role, level, division, is_active) VALUES (23, 'MPZIS Submitter', 'submitter23@baznas.go.id', 'penyaluran', 'staff', 'Penyaluran', TRUE)");
  await db.exec('ALTER TABLE mpzis ADD COLUMN created_by_id INTEGER; ALTER TABLE mpzis ADD COLUMN submitted_by_id INTEGER');

  // Setup valid P0 MPZIS artifact
  await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (50, 'Persetujuan MPZIS', 'p0', 1)");
  await db.run(
    "INSERT INTO mpzis (id, mustahik_id, revision, status, source, snapshot_json, snapshot_hash, created_by_id, submitted_by_id) VALUES (501, 50, 1, 'submitted', 'p0', $1, $2, 22, 23)",
    [JSON.stringify(recoveryMpzis.json), sampleHash],
  );

  const baseParams = { artifactType: 'mpzis', artifactId: 501, revision: 1, step: 'proposed' };
  const basePayload = {
    mustahik_id: 50,
    assumed_actor_id: 20,
    expected_snapshot_hash: sampleHash,
    idempotency_key: 'recov-valid-key-1',
    reason: 'Override persetujuan tahap proposed yang sah oleh admin.',
  };

  // 1. Unknown artifact type
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, { ...baseParams, artifactType: 'unknown' }, basePayload),
    (err) => err.status === 400,
  );

  // 2. artifactType='case'
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, { ...baseParams, artifactType: 'case' }, basePayload),
    (err) => err.status === 400,
  );

  // 3. Legacy source artifact
  await db.run(
    "INSERT INTO mpzis (id, mustahik_id, revision, status, source, snapshot_hash) VALUES (502, 50, 1, 'submitted', 'legacy', $1)",
    [sampleHash],
  );
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, { ...baseParams, artifactId: 502 }, basePayload),
    (err) => err.status === 409 && err.code === 'LEGACY_ARTIFACT_IMMUTABLE',
  );

  // 4. Wrong mustahik scope (payload mustahik_id 999 vs artifact mustahik_id 50)
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, baseParams, { ...basePayload, mustahik_id: 999 }),
    (err) => err.status === 409 && err.code === 'ARTIFACT_SCOPE_MISMATCH',
  );

  // 5. Wrong revision
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, { ...baseParams, revision: 2 }, basePayload),
    (err) => err.status === 409 && err.code === 'STALE_ARTIFACT',
  );

  // 6. Missing / malformed / mismatched expected hash
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, baseParams, { ...basePayload, expected_snapshot_hash: undefined }),
    (err) => err.status === 400,
  );
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, baseParams, { ...basePayload, expected_snapshot_hash: 'not-a-hash' }),
    (err) => err.status === 400,
  );
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, baseParams, { ...basePayload, expected_snapshot_hash: 'c'.repeat(64) }),
    (err) => err.status === 409 && err.code === 'STALE_ARTIFACT',
  );

  // 7. Invalid step for state / type
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, { ...baseParams, step: 'invalid_step_xyz' }, basePayload),
    (err) => err.status === 400,
  );

  // 8. Missing or inactive assumed actor
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, baseParams, { ...basePayload, assumed_actor_id: undefined }),
    (err) => err.status === 400,
  );
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, baseParams, { ...basePayload, assumed_actor_id: 9999 }),
    (err) => err.status === 404,
  );
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, baseParams, { ...basePayload, assumed_actor_id: 21 }),
    (err) => err.status === 403 && err.code === 'ACTOR_INACTIVE',
  );

  // 9. Assumed actor equal to admin actor (id 1)
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, baseParams, { ...basePayload, assumed_actor_id: 1 }),
    (err) => err.status === 403 && err.code === 'ACTOR_SEPARATION',
  );

  // 10. Missing reason (< 20 chars) or missing idempotency_key
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, baseParams, { ...basePayload, reason: 'Pendek' }),
    (err) => err.status === 422,
  );
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, baseParams, { ...basePayload, idempotency_key: undefined }),
    (err) => err.status === 400,
  );

  // Recovery cannot verify a bare hash when the canonical snapshot is absent.
  await db.run("UPDATE mpzis SET snapshot_json=NULL WHERE id=501");
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, baseParams, { ...basePayload, idempotency_key: 'recov-missing-snapshot' }),
    (err) => err.status === 409 && err.code === 'ARTIFACT_HASH_TAMPERED',
  );
  await db.run("UPDATE mpzis SET snapshot_json=$1 WHERE id=501", [JSON.stringify(recoveryMpzis.json)]);
  // 11. Valid recovery override succeeds.
  const successRes = await recoverArtifactStep(adminCtx, baseParams, basePayload);
  assert.equal(successRes.success, true);
  assert.equal(successRes.data.is_admin_override, true);
  assert.equal(successRes.data.snapshot_hash, sampleHash);
  assert.equal(successRes.data.actor_id, 20);

  // Idempotent replay
  const replayRes = await recoverArtifactStep(adminCtx, baseParams, basePayload);
  assert.equal(replayRes.replayed, true);

  // Idempotency tampering
  await assert.rejects(
    () => recoverArtifactStep(adminCtx, baseParams, { ...basePayload, reason: 'Alasan berbeda dengan kunci idempotensi sama.' }),
    (err) => err.status === 409,
  );

  await db.close();
});
