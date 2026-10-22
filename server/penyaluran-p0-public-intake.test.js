import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { newDb } from 'pg-mem';
import { createP0Mustahik, resolveP0PublicIntakeActor } from './penyaluran-p0/intake-service.js';
import app from './index.js';
import { MUSTAHIK_COLUMNS } from './db.js';
import { createPublicApplication } from './repository.js';

async function database() {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const Pool = memory.adapters.createPg().Pool;
  const pool = new Pool();
  const tableNames = ['mustahik','applications','documents','activity_logs','p0_idempotency_keys','wa_logs'];
  const originalConnect = pool.connect.bind(pool);
  pool.connect = async () => {
    const client = await originalConnect();
    const originalQuery = client.query.bind(client);
    let snapshot;
    client.query = async (text, params = []) => {
      const command = String(text).trim().toUpperCase();
      if (command === 'BEGIN') {
        snapshot = {};
        for (const table of tableNames) snapshot[table] = (await pool.query(`SELECT * FROM ${table}`)).rows;
      }
      const result = await originalQuery(text, params);
      if (command === 'ROLLBACK' && snapshot) {
        for (const table of [...tableNames].reverse()) {
          const ids = snapshot[table].map((row) => row.id);
          if (ids.length) await pool.query(`DELETE FROM ${table} WHERE id NOT IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`, ids);
          else await pool.query(`DELETE FROM ${table}`);
          for (const row of snapshot[table]) {
            const columns = Object.keys(row);
            const present = await pool.query(`SELECT id FROM ${table} WHERE id=$1`, [row.id]);
            if (!present.rows.length) await pool.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, columns.map((column) => row[column]));
          }
        }
        snapshot = null;
      }
      if (command === 'COMMIT') snapshot = null;
      return result;
    };
    return client;
  };
  const db = { isPg: true, pool, query: (q,p=[]) => pool.query(q,p), get: async (q,p=[]) => (await pool.query(q,p)).rows?.[0] || null, run: async (q,p=[]) => { const r=await pool.query(q,p); return { rowCount:r.rowCount, rows:r.rows||[], lastID:r.rows?.[0]?.id??null }; }, exec: (q) => pool.query(q) };
  await db.exec(`
    CREATE TABLE mustahik (${MUSTAHIK_COLUMNS.map((column) => `${column.name} ${column.type}`).join(',')});
    CREATE TABLE applications (id SERIAL PRIMARY KEY,mustahik_id INTEGER,application_number TEXT,program TEXT,request_title TEXT,status TEXT);
    CREATE TABLE documents (id SERIAL PRIMARY KEY,mustahik_id INTEGER NOT NULL,doc_type TEXT,filename TEXT NOT NULL,original_name TEXT,file_url TEXT NOT NULL,uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE activity_logs (id SERIAL PRIMARY KEY,mustahik_id INTEGER,actor_id INTEGER NOT NULL,actor_name TEXT NOT NULL,actor_role TEXT NOT NULL,actor_level TEXT NOT NULL,actor_division TEXT NOT NULL,action_type TEXT NOT NULL,title TEXT NOT NULL,description TEXT,old_status TEXT,new_status TEXT,correlation_id UUID);
    CREATE TABLE p0_idempotency_keys (id SERIAL PRIMARY KEY,actor_id INTEGER NOT NULL,idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,response_json JSONB NOT NULL,CONSTRAINT p0_idempotency_actor_key UNIQUE(actor_id,idempotency_key));
    CREATE TABLE users (id SERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT,role TEXT NOT NULL,level TEXT,division TEXT,is_active BOOLEAN DEFAULT TRUE);
    CREATE TABLE wa_logs (id SERIAL PRIMARY KEY,mustahik_id INTEGER,phone TEXT,phase TEXT,message TEXT,wa_url TEXT,status TEXT,sent_at TIMESTAMPTZ);
    INSERT INTO users(id,name,email,role,level,division,is_active) VALUES (99,'Portal Pengajuan Publik','public-intake@example.test','penyaluran','staff','Penyaluran',TRUE);
  `);
  return db;
}
const actor = { id: 7, name: 'Rina', role: 'penyaluran', level: 'staff', division: 'Penyaluran' };
const payload = () => ({ name: 'Siti Aminah', nik: '3273010101010001', phone: '081234567890', address: 'Jalan Mawar', program: 'Kemanusiaan', request_title: 'Bantuan usaha' });
const meta = (key) => ({ idempotency_key: key, correlation_id: '11111111-1111-4111-8111-111111111111' });
const pdf = (fieldname='ktp', originalname='ktp.pdf') => ({ fieldname, originalname, mimetype:'application/pdf', buffer:Buffer.from('%PDF-1.4\nP0 test document\n%%EOF\n') });
let requestNumber = 10;

test('public P0 intake persists safe uploads with one canonical case and replays idempotently', async (t) => {
  const db = await database(); const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(),'p0-public-'));
  t.after(async () => { await db.pool.end(); await fs.rm(uploadDir,{recursive:true,force:true}); });
  const request = { db, actor, uploadDir, files:[pdf('ktp','identity.pdf')] };
  const first = await createP0Mustahik(payload(),request,meta('public-file'));
  const replay = await createP0Mustahik(payload(),request,meta('public-file'));
  assert.equal(first.data.workflow_mode,'p0'); assert.equal(replay.replayed,true);
  assert.match(first.data.file_no,/^MST-\d{6}-\d{4}$/);
  const row = await db.get('SELECT filename,original_name,file_url,doc_type FROM documents WHERE mustahik_id=$1',[first.data.id]);
  assert.equal(row.original_name,'identity.pdf'); assert.equal(row.doc_type,'KTP'); assert.equal(row.file_url,`/uploads/${row.filename}`);
  assert.match(row.filename,/^[a-f0-9-]+\.pdf$/); assert.deepEqual(await fs.readdir(uploadDir),[row.filename]);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM applications')).count),1);
  assert.equal(Number((await db.get("SELECT COUNT(*) AS count FROM activity_logs WHERE action_type='p0_intake_created'")).count),1);
});

test('public P0 intake rejects unsafe bytes and removes files after transaction failure', async (t) => {
  const db = await database(); const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(),'p0-public-'));
  t.after(async () => { await db.pool.end(); await fs.rm(uploadDir,{recursive:true,force:true}); });
  await assert.rejects(createP0Mustahik(payload(),{db,actor,uploadDir,files:[{...pdf(),buffer:Buffer.from('<script>bad</script>')}]},meta('bad')),
    (e) => e.code==='INVALID_FILE_SIGNATURE' && e.status===422);
  await assert.rejects(createP0Mustahik(payload(),{db,actor,uploadDir,files:[pdf()],repository:{insertActivity:async()=>{throw new Error('audit failure');}}},meta('audit-fail')),/audit failure/);
  for (const table of ['mustahik','applications','documents','activity_logs','p0_idempotency_keys']) assert.equal(Number((await db.get(`SELECT COUNT(*) AS count FROM ${table}`)).count),0,table);
  assert.deepEqual(await fs.readdir(uploadDir),[]);
});

test('public P0 audit actor is resolved from the configured active service user only', async (t) => {
  const db=await database(); t.after(()=>db.pool.end());
  assert.deepEqual(await resolveP0PublicIntakeActor(db,'99'),{id:99,name:'Portal Pengajuan Publik',email:'public-intake@example.test',role:'penyaluran',level:'staff',division:'Penyaluran'});
  await assert.rejects(resolveP0PublicIntakeActor(db,''),(e)=>e.code==='P0_PUBLIC_ACTOR_INVALID'&&e.status===503);
});
test('public form remains active after cutover and creates a trackable P0 case without login', async (t) => {
  const db = await database();
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-public-route-'));
  const previous = {
    enabled: process.env.PENYALURAN_P0_ENABLED, cutover: process.env.PENYALURAN_P0_CUTOVER_AT, actorId: process.env.PENYALURAN_P0_PUBLIC_ACTOR_ID,
    db: app.locals.db, uploadDir: app.locals.publicP0UploadDir, create: app.locals.dataAccessRepository.createPublicApplication, track: app.locals.dataAccessRepository.trackApplication,
  };
  let legacyCalls = 0;
  process.env.PENYALURAN_P0_ENABLED = 'true';
  process.env.PENYALURAN_P0_CUTOVER_AT = '2026-09-01T00:00:00Z';
  process.env.PENYALURAN_P0_PUBLIC_ACTOR_ID = '99';
  app.locals.db = db;
  app.locals.publicP0UploadDir = uploadDir;
  app.locals.dataAccessRepository.createPublicApplication = async () => { legacyCalls += 1; throw new Error('legacy writer must not run'); };
  app.locals.dataAccessRepository.trackApplication = async (query) => {
    const mustahik = await db.get('SELECT * FROM mustahik WHERE LOWER(file_no)=LOWER($1)', [query]);
    return mustahik ? { mustahik, status: mustahik.status, timeline: [] } : null;
  };
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end(); await fs.rm(uploadDir, { recursive: true, force: true });
    if (previous.enabled === undefined) delete process.env.PENYALURAN_P0_ENABLED; else process.env.PENYALURAN_P0_ENABLED = previous.enabled;
    if (previous.cutover === undefined) delete process.env.PENYALURAN_P0_CUTOVER_AT; else process.env.PENYALURAN_P0_CUTOVER_AT = previous.cutover;
    if (previous.actorId === undefined) delete process.env.PENYALURAN_P0_PUBLIC_ACTOR_ID; else process.env.PENYALURAN_P0_PUBLIC_ACTOR_ID = previous.actorId;
    app.locals.db = previous.db; app.locals.publicP0UploadDir = previous.uploadDir;
    app.locals.dataAccessRepository.createPublicApplication = previous.create;
    app.locals.dataAccessRepository.trackApplication = previous.track;
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const form = () => {
    const body = new FormData();
    body.set('name', 'Siti Aminah'); body.set('nik', '3273010101010001'); body.set('phone', '081234567890');
    body.set('address', 'Jalan Mawar'); body.set('program', 'Kemanusiaan'); body.set('request_title', 'Bantuan usaha');
    body.set('file_no', 'CLIENT-FILE-NUMBER'); body.set('workflow_mode', 'legacy'); body.set('status', 'Ditolak'); body.set('actor_id', '1'); body.set('overall_score', '99');
    body.set('monthly_income', '0'); body.append('ktp', new Blob(['%PDF-1.4\npublic proof\n%%EOF\n'], { type: 'application/pdf' }), '../../identity.pdf');
    body.set('asnaf', 'Amil'); body.set('proposed_amount', '12345.5'); body.set('notes', 'Kondisi ekonomi sintetis');
    return body;
  };
  const submit = () => fetch(base + '/api/public/pengajuan', { method: 'POST', body: form() });
  const response = await submit();
  assert.equal(response.status, 201);
  const first = await response.json();
  assert.equal(first.data.workflow_mode, 'p0'); assert.equal(first.data.status, 'Diajukan');
  assert.match(first.data.file_no, /^MST-\d{6}-\d{4}$/); assert.notEqual(first.data.file_no, 'CLIENT-FILE-NUMBER');
  const replay = await submit(); assert.equal(replay.status, 200);
  assert.equal((await replay.json()).data.file_no, first.data.file_no);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM mustahik')).count), 1);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM documents')).count), 1);
  assert.equal(Number((await db.get("SELECT COUNT(*) AS count FROM activity_logs WHERE action_type='p0_intake_document_uploaded'")).count), 1);
  assert.equal(legacyCalls, 0);
  const persisted = await db.get('SELECT * FROM mustahik WHERE id=$1', [first.data.id]);
  assert.equal(persisted.asnaf, null);
  assert.equal(Number(persisted.recommended_amount), 12345.5);
  assert.equal(Number(persisted.approved_amount), 0);
  assert.equal(persisted.notes, 'Kondisi ekonomi sintetis');
  assert.equal(persisted.distribution_purpose, persisted.notes);
  const tracked = await fetch(base + '/api/public/lacak/' + encodeURIComponent(first.data.file_no));
  assert.equal(tracked.status, 200); assert.equal((await tracked.json()).data.mustahik.file_no, first.data.file_no);
});

async function publicServer(t, p0) {
  const db = await database();
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'public-revision-'));
  const prior = { db: app.locals.db, uploadDir: app.locals.publicP0UploadDir, create: app.locals.dataAccessRepository.createPublicApplication };
  const flags = ['PENYALURAN_P0_ENABLED', 'PENYALURAN_P0_CUTOVER_AT', 'PENYALURAN_P0_PUBLIC_ACTOR_ID'];
  const priorFlags = flags.map((flag) => process.env[flag]);
  process.env.PENYALURAN_P0_ENABLED = p0 ? 'true' : 'false';
  process.env.PENYALURAN_P0_CUTOVER_AT = p0 ? '2026-09-01T00:00:00Z' : '';
  process.env.PENYALURAN_P0_PUBLIC_ACTOR_ID = '99';
  app.locals.db = db;
  app.locals.publicP0UploadDir = uploadDir;
  app.locals.dataAccessRepository.createPublicApplication = (input, files) => createPublicApplication(input, files, db);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (!p0) {
      const legacyUploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
      const files = await db.pool.query('SELECT filename FROM documents');
      for (const row of files.rows) await fs.rm(path.join(legacyUploadDir, row.filename), { force: true });
    }
    await db.pool.end();
    await fs.rm(uploadDir, { recursive: true, force: true });
    app.locals.db = prior.db; app.locals.publicP0UploadDir = prior.uploadDir;
    app.locals.dataAccessRepository.createPublicApplication = prior.create;
    flags.forEach((flag, index) => { if (priorFlags[index] === undefined) delete process.env[flag]; else process.env[flag] = priorFlags[index]; });
  });
  const submit = (input = {}, attachments = []) => {
    const body = new FormData();
    for (const [key, value] of Object.entries({ name: 'Pemohon Sintetis', ...input })) body.set(key, String(value));
    for (const file of attachments) body.append(file.fieldname, new Blob([file.buffer], { type: file.mimetype }), file.originalname);
    requestNumber += 1;
    return fetch(`http://127.0.0.1:${server.address().port}/api/public/pengajuan`, { method: 'POST', headers: { 'X-Forwarded-For': `192.0.2.${requestNumber}` }, body });
  };
  return { db, uploadDir: p0 ? uploadDir : path.resolve(process.env.UPLOAD_DIR || './uploads'), submit };
}

function sizedPdf(size, name = 'dokumen.pdf') {
  const buffer = Buffer.alloc(size, 32);
  buffer.write('%PDF-1.4\n');
  buffer.write('\n%%EOF\n', size - 7);
  return { fieldname: 'surat_permohonan', originalname: name, mimetype: 'application/pdf', buffer };
}

for (const p0 of [false, true]) {
  test(`public ${p0 ? 'P0' : 'legacy'} persists institution/contact, proposal, description and NULL asnaf`, async (t) => {
    const { db, submit } = await publicServer(t, p0);
    const response = await submit({ applicant_status: 'Lembaga', name: 'Lembaga Sintetis', beneficiary_name: 'Lembaga Sintetis', pic_name: 'Kontak Sintetis', pic_phone: '081200000000', nik: '3273010101010001', notes: 'Ekonomi sintetis', proposed_amount: 500000, asnaf: 'Amil' });
    assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
    const result = await response.json();
    const row = await db.get('SELECT * FROM mustahik WHERE id=$1', [result.data.id]);
    assert.equal(row.name, 'Lembaga Sintetis'); assert.equal(row.beneficiary_name, 'Kontak Sintetis');
    assert.equal(row.phone, '081200000000'); assert.equal(row.nik, '3273010101010001');
    assert.equal(row.applicant_status, 'Lembaga'); assert.equal(row.asnaf, null);
    assert.equal(Number(row.recommended_amount), 500000); assert.equal(Number(row.approved_amount), 0);
    assert.equal(row.notes, 'Ekonomi sintetis'); assert.equal(row.distribution_purpose, row.notes);
    const withoutNik = await submit({ applicant_status: 'Lembaga', name: 'Lembaga tanpa NIK' });
    assert.equal(withoutNik.status, 201);
  });

  test(`public ${p0 ? 'P0' : 'legacy'} invalid input writes no records`, async (t) => {
    const { db, submit } = await publicServer(t, p0);
    for (const input of [{ applicant_status: 'Alien' }, { nik: '123' }, { proposed_amount: -1 }, { proposed_amount: 'Infinity' }, { notes: 'x'.repeat(4001) }]) {
      assert.equal((await submit(input)).status, 422);
    }
    assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM mustahik')).count), 0);
  });

  test(`public ${p0 ? 'P0' : 'legacy'} document failure rolls back DB, removes file and permits retry`, async (t) => {
    const { db, uploadDir, submit } = await publicServer(t, p0);
    const priorFiles = (await fs.readdir(uploadDir)).sort();
    const originalConnect = db.pool.connect.bind(db.pool);
    let failMetadata = true;
    db.pool.connect = async () => {
      const client = await originalConnect();
      const query = client.query.bind(client);
      client.query = (sql, values) => {
        if (failMetadata && String(sql).startsWith('INSERT INTO documents')) throw new Error('Synthetic metadata failure');
        return query(sql, values);
      };
      return client;
    };
    assert.equal((await submit({}, [sizedPdf(100)])).status, 500);
    assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM mustahik')).count), 0);
    assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM applications')).count), 0);
    assert.deepEqual((await fs.readdir(uploadDir)).sort(), priorFiles);
    failMetadata = false;
    assert.equal((await submit({}, [sizedPdf(100)])).status, 201);
  });

  test(`public ${p0 ? 'P0' : 'legacy'} upload boundary, multi-file, spoofing and cleanup`, async (t) => {
    const { db, uploadDir, submit } = await publicServer(t, p0);
    const limit = 5 * 1024 * 1024;
    const exact = await submit({}, [sizedPdf(limit)]);
    assert.equal(exact.status, 201, JSON.stringify(await exact.clone().json()));
    const exactId = (await exact.json()).data.id;
    const document = await db.get('SELECT * FROM documents WHERE mustahik_id=$1', [exactId]);
    assert.equal(document.doc_type, 'Surat Permohonan');
    assert.equal((await fs.stat(path.join(uploadDir, document.filename))).size, limit);
    const baselineFiles = (await fs.readdir(uploadDir)).sort();
    const overflow = await submit({}, [sizedPdf(100, 'first.pdf'), sizedPdf(limit + 1)]);
    assert.equal(overflow.status, 422); assert.match((await overflow.json()).message, /5 MiB/);
    assert.deepEqual((await fs.readdir(uploadDir)).sort(), baselineFiles);
    const multiple = await submit({ name: 'Pemohon Multi' }, [sizedPdf(3 * 1024 * 1024, 'one.pdf'), sizedPdf(3 * 1024 * 1024, 'two.pdf')]);
    assert.equal(multiple.status, 201, JSON.stringify(await multiple.clone().json()));
    const afterValid = (await fs.readdir(uploadDir)).sort();
    for (const file of [{ ...sizedPdf(100), originalname: 'fake.png', mimetype: 'image/png' }, { ...sizedPdf(100), buffer: Buffer.from('not a PDF') }, { ...sizedPdf(100), originalname: 'fake.exe' }]) {
      assert.equal((await submit({}, [file])).status, 422);
      assert.deepEqual((await fs.readdir(uploadDir)).sort(), afterValid);
    }
    const retry = await submit({ name: 'Pemohon Retry' }, [sizedPdf(100)]);
    assert.equal(retry.status, 201);
  });
}
