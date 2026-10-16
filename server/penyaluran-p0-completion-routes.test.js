import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { registerPenyaluranP0Routes } from './penyaluran-p0/routes.js';
import { createP0TestDatabase } from './penyaluran-p0-test-helpers.js';

test('payment route serializes denied recorder as 403 without invoking persistence', async () => {
  const db = await createP0TestDatabase();
  const app = express(); app.use(express.json());
  registerPenyaluranP0Routes(app, { db, isEnabled: () => true, authenticateToken: (req, _res, next) => { req.user = { id: 10, name: 'Surveyor', role: 'surveyor', level: 'staff', division: 'Survey' }; next(); } });
  const server = await new Promise((resolve) => { const value = app.listen(0, () => resolve(value)); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/penyaluran/mustahik/1/ppd/1/payment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paid_amount: '1.00' }), signal: AbortSignal.timeout(2000) });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'DIVISION_REQUIRED');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }
});

test('Task 10 routes dispatch multipart payment/confirmation and JSON verify/complete with normalized metadata', async () => {
  const db = await createP0TestDatabase();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-route-'));
  const calls = {};
  const services = {
    recordPayment: async (context, ppdId, body, meta) => { calls.payment = { context, ppdId, body, meta }; return { success: true, route: 'payment' }; },
    verifyPayment: async (context, ppdId, body, meta) => { calls.verify = { context, ppdId, body, meta }; return { success: true, route: 'verify' }; },
    recordRecipientConfirmation: async (context, ppdId, body, meta) => { calls.confirm = { context, ppdId, body, meta }; return { success: true, route: 'confirmation' }; },
    completeDistribution: async (context, ppdId, body, meta) => { calls.complete = { context, ppdId, body, meta }; return { success: true, route: 'complete' }; },
  };
  const app = express(); app.use(express.json());
  registerPenyaluranP0Routes(app, { db, artifactRoot: root, services, isEnabled: () => true, authenticateToken: (req, _res, next) => { req.user = { id: 20, name: 'Keuangan', role: 'keuangan', level: 'staff', division: 'Divisi Keuangan' }; next(); } });
  const server = await new Promise((resolve) => { const value = app.listen(0, () => resolve(value)); });
  const base = `http://127.0.0.1:${server.address().port}/api/penyaluran/mustahik/1/ppd/1`;
  try {
    const paymentForm = new FormData();
    paymentForm.set('transaction_number', 'TX-1'); paymentForm.set('paid_amount', '100.10'); paymentForm.set('paid_at', new Date().toISOString()); paymentForm.set('application_id', '17');
    paymentForm.set('proof', new Blob([Buffer.from('%PDF-1.4\n%%EOF', 'ascii')], { type: 'application/pdf' }), 'proof.pdf');
    const paymentResponse = await fetch(`${base}/payment`, { method: 'POST', headers: { 'Idempotency-Key': 'route-payment' }, body: paymentForm, signal: AbortSignal.timeout(2000) });
    assert.equal(paymentResponse.status, 201);
    const verifyResponse = await fetch(`${base}/payment/verify`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'route-verify' }, body: JSON.stringify({ application_id: '17' }), signal: AbortSignal.timeout(2000) });
    assert.equal(verifyResponse.status, 200);
    const confirmationForm = new FormData();
    confirmationForm.set('method', 'Tatap Muka'); confirmationForm.set('recipient_name_snapshot', 'Siti'); confirmationForm.set('confirmed_at', new Date().toISOString()); confirmationForm.set('note', 'Penerima telah menerima bantuan sesuai PPD.'); confirmationForm.set('application_id', '17');
    const confirmationResponse = await fetch(`${base}/recipient-confirmation`, { method: 'POST', headers: { 'Idempotency-Key': 'route-confirm' }, body: confirmationForm, signal: AbortSignal.timeout(2000) });
    assert.equal(confirmationResponse.status, 201);
    const completeResponse = await fetch(`${base}/complete`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'route-complete' }, body: JSON.stringify({ application_id: '17' }), signal: AbortSignal.timeout(2000) });
    assert.equal(completeResponse.status, 200);
    assert.ok(Buffer.isBuffer(calls.payment.body.file.buffer));
    assert.equal(calls.payment.meta.application_id, 17);
    assert.equal(calls.verify.meta.application_id, 17);
    assert.equal(calls.confirm.meta.application_id, 17);
    assert.equal(calls.complete.meta.application_id, 17);
    assert.equal(calls.payment.ppdId, 1); assert.equal(calls.verify.ppdId, 1); assert.equal(calls.confirm.ppdId, 1); assert.equal(calls.complete.ppdId, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
    await db.close();
  }
});
