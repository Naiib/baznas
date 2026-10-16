import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import app from './index.js';
import { formatRupiah, renderSuratPermohonanDoc, validateSuratPermohonanInput } from './public-surat-permohonan.js';

function textFromPdf(buffer) {
  const raw = buffer.toString('latin1');
  return [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((match) => {
    const content = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    return [...content.matchAll(/<([a-f0-9]+)>/gi)].map((hex) => Buffer.from(hex[1], 'hex').toString('latin1')).join('');
  }).join('');
}

async function pdfBuffer(data) {
  const doc = renderSuratPermohonanDoc(validateSuratPermohonanInput(data));
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = once(doc, 'end');
  doc.end();
  await finished;
  return Buffer.concat(chunks);
}

test('PDF validation rejects typed/oversized fields instead of coercing or truncating', () => {
  for (const input of [null, [], { name: 'Test', applicant_status: 'Alien' }, { name: 'Test', nik: 3273010101010001 }, { name: 'Test', proposed_amount: true }, { name: 'Test', proposed_amount: [] }, { name: 'Test', proposed_amount: -1 }, { name: 'Test', address: {} }, { name: 'Test', notes: 'x'.repeat(4001) }, { name: 'Test', request_title: 'x'.repeat(1001) }]) {
    assert.throws(() => validateSuratPermohonanInput(input), (error) => error.status === 422 && error.code === 'VALIDATION_FAILED');
  }
  assert.equal(formatRupiah(0), 'Rp 0');
  assert.equal(validateSuratPermohonanInput({ name: 'Test', proposed_amount: '123.5' }).proposed_amount, 123.5);
});

for (const applicantStatus of ['Perorangan', 'Lembaga']) {
  test(`A4 PDF ${applicantStatus} contains actual draft and long text without clipping`, async () => {
    const data = {
      applicant_status: applicantStatus, name: `Pemohon Sintetis ${applicantStatus}`,
      address: 'Alamat Sintetis '.repeat(50) + 'END-ADDRESS',
      request_title: 'Kebutuhan Sintetis '.repeat(40) + 'END-REQUEST',
      notes: 'Kondisi ekonomi sintetis. '.repeat(140) + 'END-ECONOMY',
      proposed_amount: 1234567,
      ...(applicantStatus === 'Lembaga' ? { pic_name: 'Kontak Sintetis', pic_phone: '081200000000', pic_nik: '3273010101010001' } : { nik: '3273010101010001', phone: '081200000000' }),
    };
    const bytes = await pdfBuffer(data);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.match(bytes.toString('latin1'), /%%EOF/);
    assert.match(bytes.toString('latin1'), /\/MediaBox \[0 0 595\.28 841\.89\]/);
    const text = textFromPdf(bytes);
    for (const marker of [data.name, 'END-ADDRESS', 'END-REQUEST', 'END-ECONOMY', 'Rp 1.234.567', 'DRAFT']) assert.ok(text.includes(marker), marker);
    if (applicantStatus === 'Lembaga') for (const marker of ['Kontak Sintetis', '081200000000', '3273010101010001']) assert.ok(text.includes(marker), marker);
    const pageCount = [...bytes.toString('latin1').matchAll(/\/Type \/Page\b/g)].length;
    assert.ok(pageCount >= 2 && pageCount <= 5, `page count: ${pageCount}`);
    assert.doesNotMatch(text, /Sitanala|5573|Materai|Sesuai Standar/);
    const edited = textFromPdf(await pdfBuffer({ ...data, name: 'EDITED-SYNTHETIC-NAME', proposed_amount: 42 }));
    assert.ok(edited.includes('EDITED-SYNTHETIC-NAME')); assert.ok(edited.includes('Rp 42')); assert.ok(!edited.includes(data.name));
    if (process.env.PUBLIC_PDF_EVIDENCE_DIR) {
      await fs.mkdir(process.env.PUBLIC_PDF_EVIDENCE_DIR, { recursive: true });
      await fs.writeFile(path.join(process.env.PUBLIC_PDF_EVIDENCE_DIR, `surat-${applicantStatus.toLowerCase()}-synthetic.pdf`), bytes);
    }
  });
}

test('HTTP PDF is stateless, validates input, limits body and applies private headers', async (t) => {
  const priorDb = app.locals.db;
  app.locals.db = { get() { throw new Error('PDF must never query DB'); } };
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { app.locals.db = priorDb; await new Promise((resolve) => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}/api/public/surat-permohonan`;
  const send = (input, ip = '198.51.100.20') => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify(input) });
  const response = await send({ name: 'Synthetic Name', id: 99999, applicant_status: 'Lembaga', pic_name: 'Synthetic Contact' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/pdf/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('content-disposition'), 'inline; filename="draft-surat-permohonan.pdf"');
  const text = textFromPdf(Buffer.from(await response.arrayBuffer()));
  assert.ok(text.includes('Synthetic Name')); assert.ok(text.includes('Synthetic Contact')); assert.ok(!text.includes('99999'));
  const invalid = await send({ name: 'Test', pic_nik: '123', applicant_status: 'Lembaga' });
  assert.equal(invalid.status, 422); assert.equal((await invalid.json()).field_errors.nik, 'FORMAT');
  assert.equal((await send({ name: 'Test', notes: 'x'.repeat(110000) })).status, 413);
  assert.equal((await fetch(url + '/99999')).status, 404);
  for (let requestIndex = 0; requestIndex < 30; requestIndex += 1) assert.equal((await send({ name: 'Rate Test' }, '198.51.100.21')).status, 200);
  assert.equal((await send({ name: 'Rate Test' }, '198.51.100.21')).status, 429);
});
