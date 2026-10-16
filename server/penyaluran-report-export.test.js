import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import zlib from 'node:zlib';
import ExcelJS from 'exceljs';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'task-5-report-export-secret';

const { getDb, initDb } = await import('./db.js');
const { exportLaporanData, generateLaporan } = await import('./repository.js');
const { default: app } = await import('./index.js');

const REPORT_ID = 'task5-report-definition';
const CREATED_REPORT_ID = 'task5-created-invalid-definition';
let server;
let baseUrl;

before(async () => {
  await initDb();
  const db = await getDb();
  await db.run('DELETE FROM reports WHERE id = $1', [REPORT_ID]);
  await db.run('DELETE FROM reports WHERE id = $1', [CREATED_REPORT_ID]);
  await db.run("DELETE FROM mustahik WHERE file_no LIKE 'TASK5-%'");
  await db.run(
    `INSERT INTO reports (
       id, category, period, title, description, scope, status, file_url, updated_at, metrics_json
     ) VALUES ($1, 'Per Program', 'Agustus 2026', 'Task 5 export', 'test', 'Kecamatan Cipondoh', 'Siap diekspor', '/export', '2026-08-31', $2)`,
    [REPORT_ID, JSON.stringify({
      definition: {
        filters: { program: 'Task 5 Program', kecamatan: 'Cipondoh' },
        period: { start_date: '2026-08-01', end_date: '2026-08-31' },
        visibility: 'shared',
      },
    })]
  );

  const rows = [
    ['TASK5-IN', '2026-08-10', 'Inside', 'Cipondoh', 'Task 5 Program'],
    ['TASK5-DATE', '2026-09-01', 'Outside period', 'Cipondoh', 'Task 5 Program'],
    ['TASK5-SCOPE', '2026-08-11', 'Outside scope', 'Benda', 'Task 5 Program'],
    ['TASK5-FILTER', '2026-08-12', 'Outside filter', 'Cipondoh', 'Task 5 Other Program'],
    ['TASK5-FORMULA', '2026-08-13', '=2+2', 'Cipondoh', 'Task 5 Program'],
  ];
  for (const [fileNo, receivedDate, name, kecamatan, program] of rows) {
    await db.run(
      `INSERT INTO mustahik (file_no, received_date, name, kecamatan, kelurahan, program, asnaf, status)
       VALUES ($1, $2, $3, $4, 'Test', $5, 'Fakir Miskin', 'Disalurkan')`,
      [fileNo, receivedDate, name, kecamatan, program]
    );
  }
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  const db = await getDb();
  await db.run('DELETE FROM reports WHERE id = $1', [REPORT_ID]);
  await db.run('DELETE FROM reports WHERE id = $1', [CREATED_REPORT_ID]);
  await db.run("DELETE FROM mustahik WHERE file_no LIKE 'TASK5-%'");
  if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test('report definition constrains JSON and CSV exports to period, filters, and scope', async () => {
  const db = await getDb();
  const actor = { id: 77, role: 'penyaluran', division: 'Divisi Penyaluran', level: 'staff' };

  const json = await exportLaporanData(REPORT_ID, 'json', { db, actor });
  assert.deepEqual(json.data.map((row) => row.name), ['Inside', '=2+2']);
  assert.equal(json.total_records, 2);

  const csv = await exportLaporanData(REPORT_ID, 'csv', { db, actor });
  assert.match(csv, /Inside/);
  assert.match(csv, /"'=2\+2"/);
  assert.doesNotMatch(csv, /Outside period|Outside scope|Outside filter/);
});

test('normalized admin claims bypass report access and actor-scope narrowing', async () => {
  await setDefinition({
    filters: { program: 'Task 5 Program', kecamatan: 'Cipondoh' },
    period: { start_date: '2026-08-01', end_date: '2026-08-31' },
    visibility: 'private',
    owner_id: 88,
    roles: ['admin'],
  });
  const db = await getDb();
  const result = await exportLaporanData(REPORT_ID, 'json', {
    db,
    actor: {
      id: 77,
      role: ' penyaluran ',
      level: ' ADMIN ',
      scope: { kecamatan: ['Benda'] },
    },
  });

  assert.deepEqual(result.data.map((row) => row.name), ['Inside', '=2+2']);
  await restoreBaseDefinition();
});

test('normalized actor roles satisfy report role allowlists', async () => {
  await setDefinition({
    filters: { program: 'Task 5 Program', kecamatan: 'Cipondoh' },
    period: { start_date: '2026-08-01', end_date: '2026-08-31' },
    visibility: 'shared',
    roles: ['penyaluran'],
  });
  const db = await getDb();
  const result = await exportLaporanData(REPORT_ID, 'json', {
    db,
    actor: { id: 77, role: ' PENYALURAN ', level: ' staff ' },
  });

  assert.deepEqual(result.data.map((row) => row.name), ['Inside', '=2+2']);
  await restoreBaseDefinition();
});

test('unknown reports and invalid filter fields are rejected as client errors', async () => {
  const db = await getDb();
  await assert.rejects(
    exportLaporanData('task5-unknown-report', 'json', { db, actor: { id: 77, role: 'penyaluran' } }),
    (error) => error.status === 404
  );
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', {
      db,
      actor: { id: 77, role: 'penyaluran' },
      filters: { not_allowed: 'x' },
    }),
    (error) => error.status === 400
  );

  await db.run('UPDATE reports SET metrics_json = $2 WHERE id = $1', [REPORT_ID, JSON.stringify({
    definition: {
      filters: { program: 'Task 5 Program', kecamatan: 'Cipondoh' },
      period: { start_date: '2026-08-01', end_date: '2026-08-31' },
      visibility: 'private',
      owner_id: 88,
    },
  })]);
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' } }),
    (error) => error.status === 403
  );
  await db.run('UPDATE reports SET metrics_json = $2 WHERE id = $1', [REPORT_ID, JSON.stringify({
    definition: {
      filters: { program: 'Task 5 Program', kecamatan: 'Cipondoh' },
      period: { start_date: '2026-08-01', end_date: '2026-08-31' },
      visibility: 'shared',
    },
  })]);
});

test('HTTP export route passes the actor and definition filters through to JSON and CSV', async () => {
  const token = jwt.sign({ id: 77, role: 'penyaluran', level: 'staff' }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const headers = { Authorization: `Bearer ${token}` };
  const jsonResponse = await fetch(`${baseUrl}/api/penyaluran/laporan/export/${REPORT_ID}?format=json`, { headers });
  assert.equal(jsonResponse.status, 200);
  const json = await jsonResponse.json();
  assert.deepEqual(json.data.map((row) => row.name), ['Inside', '=2+2']);
  const csvResponse = await fetch(`${baseUrl}/api/penyaluran/laporan/export/${REPORT_ID}?format=csv`, { headers });
  assert.equal(csvResponse.status, 200);
  assert.match(csvResponse.headers.get('content-disposition'), /task5-report-definition\.csv/);
  assert.match(await csvResponse.text(), /"'=2\+2"/);
  const xlsxResponse = await fetch(`${baseUrl}/api/penyaluran/laporan/export/${REPORT_ID}?format=xlsx`, { headers });
  assert.equal(xlsxResponse.status, 200);
  assert.match(xlsxResponse.headers.get('content-type'), /spreadsheetml/);
  assert.ok((await xlsxResponse.arrayBuffer()).byteLength > 100);
  const pdfResponse = await fetch(`${baseUrl}/api/penyaluran/laporan/export/${REPORT_ID}?format=pdf`, { headers });
  assert.equal(pdfResponse.status, 200);
  assert.equal(pdfResponse.headers.get('content-type'), 'application/pdf');
  assert.ok((await pdfResponse.arrayBuffer()).byteLength > 100);
});

async function setDefinition(definition) {
  const db = await getDb();
  await db.run('UPDATE reports SET metrics_json = $2 WHERE id = $1', [REPORT_ID, JSON.stringify({ definition })]);
}

async function setMetrics(metrics) {
  const db = await getDb();
  await db.run('UPDATE reports SET metrics_json = $2 WHERE id = $1', [REPORT_ID, JSON.stringify(metrics)]);
}

beforeEach(async () => {
  await restoreBaseDefinition();
});

async function restoreBaseDefinition() {
  await setDefinition({
    filters: { program: 'Task 5 Program', kecamatan: 'Cipondoh' },
    period: { start_date: '2026-08-01', end_date: '2026-08-31' },
    visibility: 'shared',
  });
}

test('persisted and create-time date fields are strictly allowlisted before SQL construction', async () => {
  await setDefinition({
    filters: { program: 'Task 5 Program' },
    period: { start_date: '2026-08-01', end_date: '2026-08-31' },
    date_field: "received_date); DROP TABLE reports; --",
    visibility: 'shared',
  });
  const db = await getDb();
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' } }),
    (error) => error.status === 422
  );
  await assert.rejects(
    generateLaporan({
      id: CREATED_REPORT_ID,
      period: 'Agustus 2026',
      definition: { date_field: 'updated_at OR 1=1' },
    }),
    (error) => error.status === 400 || error.status === 422
  );
  const token = jwt.sign({ id: 77, role: 'penyaluran', level: 'staff' }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const response = await fetch(`${baseUrl}/api/penyaluran/laporan/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: CREATED_REPORT_ID, definition: { date_field: 'updated_at OR 1=1' } }),
  });
  assert.equal(response.status, 422);
  await restoreBaseDefinition();
});

test('persisted periods are immutable and request periods cannot widen them', async () => {
  const db = await getDb();
  await setDefinition({
    filters: { program: 'Task 5 Program', start_date: '2026-09-01', end_date: '2026-09-30' },
    period: { start_date: '2026-08-01', end_date: '2026-08-31' },
    visibility: 'shared',
  });
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' } }),
    (error) => error.status === 422
  );
  await restoreBaseDefinition();
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' }, filters: { period: '2026-09' } }),
    (error) => error.status === 400
  );
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' }, filters: { start_date: '2026-07-01', end_date: '2026-08-31' } }),
    (error) => error.status === 400
  );
  const result = await exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' }, filters: { start_date: '2026-08-10', end_date: '2026-08-10' } });
  assert.deepEqual(result.data.map((row) => row.name), ['Inside']);
});

test('mixed legacy and nested access metadata never broadens report visibility or roles', async () => {
  const db = await getDb();
  await setMetrics({
    visibility: 'private',
    owner_id: 88,
    allowed_roles: ['admin'],
    definition: {
      filters: { program: 'Task 5 Program' },
      period: { start_date: '2026-08-01', end_date: '2026-08-31' },
      visibility: 'shared',
    },
  });
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' } }),
    (error) => error.status === 400 || error.status === 422 || error.status === 403
  );

  await setMetrics({
    visibility: 'shared',
    allowed_roles: ['admin'],
    definition: {
      filters: { program: 'Task 5 Program' },
      period: { start_date: '2026-08-01', end_date: '2026-08-31' },
      visibility: 'shared',
    },
  });
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' } }),
    (error) => error.status === 403
  );
  await restoreBaseDefinition();
});

test('mixed legacy and nested filters or scope fail closed for non-admin exports', async () => {
  const db = await getDb();
  await setMetrics({
    filters: { program: 'Task 5 Program' },
    scope: { kecamatan: 'Cipondoh' },
    definition: {
      filters: { program: 'Task 5 Other Program' },
      scope: { kecamatan: 'Benda' },
      period: { start_date: '2026-08-01', end_date: '2026-08-31' },
      visibility: 'shared',
    },
  });
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' } }),
    (error) => error.status === 400 || error.status === 422 || error.status === 403
  );
  await restoreBaseDefinition();
});

test('invalid visibility, owner, and roles fail closed', async () => {
  const db = await getDb();
  const malformedDefinitions = [
    { filters: { program: 'Task 5 Program' }, visibility: 'mystery' },
    { filters: { program: 'Task 5 Program' }, visibility: 'private' },
    { filters: { program: 'Task 5 Program' }, visibility: 'owner', owner_id: 'not-an-id' },
    { filters: { program: 'Task 5 Program' }, visibility: 'shared', roles: 'penyaluran' },
    { filters: { program: 'Task 5 Program' }, visibility: 'shared', roles: null },
    { filters: { program: 'Task 5 Program' }, visibility: 'shared', roles: [77, ''] },
  ];
  for (const definition of malformedDefinitions) {
    await setDefinition({ ...definition, period: { start_date: '2026-08-01', end_date: '2026-08-31' } });
    await assert.rejects(
      exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' } }),
      (error) => error.status === 422 || error.status === 403
    );
  }
  await restoreBaseDefinition();
});

test('HTTP rejects malformed nested filters and unsupported formats', async () => {
  const token = jwt.sign({ id: 77, role: 'penyaluran', level: 'staff' }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const headers = { Authorization: `Bearer ${token}` };
  const malformed = await fetch(`${baseUrl}/api/penyaluran/laporan/export/${REPORT_ID}?format=json&filters=%7Bbad`, { headers });
  assert.equal(malformed.status, 400);
  const unsupported = await fetch(`${baseUrl}/api/penyaluran/laporan/export/${REPORT_ID}?format=xml`, { headers });
  assert.equal(unsupported.status, 400);
  const repeated = await fetch(`${baseUrl}/api/penyaluran/laporan/export/${REPORT_ID}?format=xml&format=csv`, { headers });
  assert.equal(repeated.status, 400);
});

test('periods validate real calendar dates and offsets stay bounded', async () => {
  const db = await getDb();
  await setDefinition({
    filters: { program: 'Task 5 Program' },
    period: { start_date: '2026-02-30', end_date: '2026-03-01' },
    visibility: 'shared',
  });
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' } }),
    (error) => error.status === 400 || error.status === 422
  );
  await restoreBaseDefinition();
  await setDefinition({
    filters: { program: 'Task 5 Program' },
    period: 'Q1 0000',
    visibility: 'shared',
  });
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' } }),
    (error) => error.status === 400 || error.status === 422
  );
  await restoreBaseDefinition();
  await setDefinition({
    filters: { program: 'Task 5 Program' },
    period: { start_date: '2028-02-29', end_date: '2028-02-29' },
    visibility: 'shared',
  });
  const leapDay = await exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' } });
  assert.deepEqual(leapDay.definition.period, { start_date: '2028-02-29', end_date: '2028-02-29' });
  await setDefinition({
    filters: { program: 'Task 5 Program' },
    period: { start_date: '2026-08-01T00:00:00+07:00', end_date: '2026-08-31' },
    visibility: 'shared',
  });
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' } }),
    (error) => error.status === 400 || error.status === 422
  );
  await restoreBaseDefinition();
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' }, filters: { offset: 100001 } }),
    (error) => error.status === 400
  );
});

test('array filters, actor scope, and pagination remain deterministic', async () => {
  const db = await getDb();
  await setDefinition({
    filters: { program: [] },
    period: { start_date: '2026-08-01', end_date: '2026-08-31' },
    visibility: 'shared',
  });
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' } }),
    (error) => error.status === 400 || error.status === 422
  );
  await restoreBaseDefinition();
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran' }, filters: { status: [] } }),
    (error) => error.status === 400 || error.status === 422
  );
  await setDefinition({
    filters: { program: 'Task 5 Program', kecamatan: ['Cipondoh', 'Benda'] },
    period: { start_date: '2026-08-01', end_date: '2026-08-31' },
    visibility: 'shared',
  });
  const scoped = await exportLaporanData(REPORT_ID, 'json', {
    db,
    actor: { id: 77, role: 'penyaluran', scope: { kecamatan: ['Cipondoh'] } },
  });
  assert.deepEqual(scoped.data.map((row) => row.name), ['Inside', '=2+2']);
  await restoreBaseDefinition();
  const result = await exportLaporanData(REPORT_ID, 'json', {
    db,
    actor: { id: 77, role: 'penyaluran', scope: { kecamatan: ['Cipondoh'] } },
    filters: { program: ['Task 5 Program'], limit: 1, offset: 1 },
  });
  assert.deepEqual(result.data.map((row) => row.name), ['=2+2']);
  await assert.rejects(
    exportLaporanData(REPORT_ID, 'json', { db, actor: { id: 77, role: 'penyaluran', scope: { kecamatan: ['Benda'] } } }),
    (error) => error.status === 403
  );
});

test('CSV neutralizes formula prefixes, whitespace, and multiline cells', async () => {
  const db = await getDb();
  const edgeRows = [
    ['TASK5-PLUS', '+plus'], ['TASK5-MINUS', '-minus'], ['TASK5-AT', '@at'],
    ['TASK5-SPACE', ' leading'], ['TASK5-WS-FORMULA', ' =2+2'], ['TASK5-MULTI', 'line\nbreak'],
  ];
  for (const [fileNo, name] of edgeRows) {
    await db.run(
      `INSERT INTO mustahik (file_no, received_date, name, kecamatan, kelurahan, program, asnaf, status)
       VALUES ($1, '2026-08-14', $2, 'Cipondoh', 'Test', 'Task 5 Program', 'Fakir Miskin', 'Disalurkan')`,
      [fileNo, name]
    );
  }
  const csv = await exportLaporanData(REPORT_ID, 'csv', { db, actor: { id: 77, role: 'penyaluran' } });
  assert.match(csv, /"'\+plus"/);
  assert.match(csv, /"'-minus"/);
  assert.match(csv, /"'@at"/);
  assert.match(csv, /" leading"/);
  assert.match(csv, /"' =2\+2"/);
  assert.match(csv, /"line\nbreak"/);
  await db.run("DELETE FROM mustahik WHERE file_no LIKE 'TASK5-%'");
  const baseRows = [
    ['TASK5-IN', '2026-08-10', 'Inside', 'Cipondoh', 'Task 5 Program'],
    ['TASK5-DATE', '2026-09-01', 'Outside period', 'Cipondoh', 'Task 5 Program'],
    ['TASK5-SCOPE', '2026-08-11', 'Outside scope', 'Benda', 'Task 5 Program'],
    ['TASK5-FILTER', '2026-08-12', 'Outside filter', 'Cipondoh', 'Task 5 Other Program'],
    ['TASK5-FORMULA', '2026-08-13', '=2+2', 'Cipondoh', 'Task 5 Program'],
  ];
  for (const [fileNo, receivedDate, name, kecamatan, program] of baseRows) {
    await db.run(
      `INSERT INTO mustahik (file_no, received_date, name, kecamatan, kelurahan, program, asnaf, status)
       VALUES ($1, $2, $3, $4, 'Test', $5, 'Fakir Miskin', 'Disalurkan')`,
      [fileNo, receivedDate, name, kecamatan, program]
    );
  }
});

function decodePdfText(buffer) {
  const binary = buffer.toString('binary');
  let decoded = '';
  for (const match of binary.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      const stream = zlib.inflateSync(Buffer.from(match[1], 'binary')).toString('latin1');
      decoded += stream.replace(/<([0-9a-f]+)>/gi, (_all, hex) => Buffer.from(hex, 'hex').toString('latin1'));
    } catch {
      // Non-text streams are not relevant to the parity assertion.
    }
  }
  return decoded;
}

test('XLSX and PDF contain exactly the same filtered rows as the resolver', async () => {
  const token = jwt.sign({ id: 77, role: 'penyaluran', level: 'staff' }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const headers = { Authorization: `Bearer ${token}` };
  const xlsxResponse = await fetch(`${baseUrl}/api/penyaluran/laporan/export/${REPORT_ID}?format=xlsx`, { headers });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await xlsxResponse.arrayBuffer()));
  const detailValues = workbook.getWorksheet('Daftar Mustahik').getSheetValues().flat().filter(Boolean).map(String);
  assert.ok(detailValues.includes('Inside'));
  assert.ok(detailValues.includes("'=2+2"));
  assert.ok(!detailValues.some((value) => /Outside (period|scope|filter)/.test(value)));

  const pdfResponse = await fetch(`${baseUrl}/api/penyaluran/laporan/export/${REPORT_ID}?format=pdf`, { headers });
  const pdfText = decodePdfText(Buffer.from(await pdfResponse.arrayBuffer()));
  assert.match(pdfText, /Inside/);
  assert.doesNotMatch(pdfText, /Outside (period|scope|filter)/);
});
