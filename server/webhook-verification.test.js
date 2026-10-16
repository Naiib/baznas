import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  verifyWebhookSignature,
  normalizeWebhookPayload,
  resolveWebhookSecret,
} from './webhook-verification.js';

test('verifyWebhookSignature: verifies valid HMAC-SHA256 signature', () => {
  const secret = 'super-secret-key-123';
  const body = JSON.stringify({ order_id: 'ORDER-001', amount: 100000 });
  const validSig = crypto.createHmac('sha256', secret).update(body).digest('hex');

  const isValid = verifyWebhookSignature({
    provider: 'midtrans',
    rawBody: body,
    signature: validSig,
    secret,
  });

  assert.equal(isValid, true);
});

test('verifyWebhookSignature: supports raw Buffer bytes', () => {
  const secret = 'super-secret-key-123';
  const rawBuf = Buffer.from(JSON.stringify({ order_id: 'ORDER-BUF', amount: 200000 }));
  const validSig = crypto.createHmac('sha256', secret).update(rawBuf).digest('hex');

  const isValid = verifyWebhookSignature({
    provider: 'bsi',
    rawBody: rawBuf,
    signature: validSig,
    secret,
  });

  assert.equal(isValid, true);
});

test('verifyWebhookSignature: rejects parsed objects or missing rawBody', () => {
  const secret = 'super-secret-key-123';
  const parsedObject = { order_id: 'ORDER-OBJ', amount: 300000 };

  assert.throws(
    () => verifyWebhookSignature({
      provider: 'bsi',
      rawBody: parsedObject,
      signature: 'some-sig',
      secret,
    }),
    /raw HTTP request bytes/i
  );

  assert.throws(
    () => verifyWebhookSignature({
      provider: 'bsi',
      rawBody: null,
      signature: 'some-sig',
      secret,
    }),
    /raw HTTP request bytes/i
  );
});

test('resolveWebhookSecret: rejects missing secret', () => {
  const prevEnv = process.env.WEBHOOK_SECRET;
  const prevBsi = process.env.WEBHOOK_SECRET_BSI;
  delete process.env.WEBHOOK_SECRET;
  delete process.env.WEBHOOK_SECRET_BSI;

  try {
    assert.throws(
      () => resolveWebhookSecret('bsi'),
      /Webhook secret for provider 'bsi' is not configured/i
    );
  } finally {
    if (prevEnv) process.env.WEBHOOK_SECRET = prevEnv;
    if (prevBsi) process.env.WEBHOOK_SECRET_BSI = prevBsi;
  }
});

test('resolveWebhookSecret: rejects repository default secret in production', () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevEnv = process.env.WEBHOOK_SECRET;
  process.env.NODE_ENV = 'production';
  process.env.WEBHOOK_SECRET = 'baznas-penerimaan-webhook-secret-2026';

  try {
    assert.throws(
      () => resolveWebhookSecret('bsi'),
      /forbidden.*default.*in production/i
    );
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevEnv) process.env.WEBHOOK_SECRET = prevEnv;
    else delete process.env.WEBHOOK_SECRET;
  }
});

test('verifyWebhookSignature: supports sha256= prefix and headers fallback', () => {
  const secret = 'super-secret-key-123';
  const body = JSON.stringify({ order_id: 'ORDER-002', amount: 50000 });
  const validSig = crypto.createHmac('sha256', secret).update(body).digest('hex');

  const isValid = verifyWebhookSignature({
    provider: 'portal_publik',
    rawBody: body,
    headers: { 'x-signature': `sha256=${validSig}` },
    secret,
  });

  assert.equal(isValid, true);
});

test('verifyWebhookSignature: rejects tampered body or invalid signature', () => {
  const secret = 'super-secret-key-123';
  const body = JSON.stringify({ order_id: 'ORDER-003', amount: 100000 });
  const badSig = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const isValid = verifyWebhookSignature({
    provider: 'bsi',
    rawBody: body,
    signature: badSig,
    secret,
  });

  assert.equal(isValid, false);
});

test('normalizeWebhookPayload: normalizes valid gateway payload', () => {
  const payload = {
    order_id: 'BSI-2026-9999',
    gross_amount: 500000,
    status: 'paid',
    donor_name: 'Dr. Fauzan, M.Ag',
    donor_phone: '081299998888',
    donor_email: 'fauzan@example.com',
    program_type: 'zakat_profesi',
    payment_type: 'bank_transfer',
    bank: 'Bank Syariah Indonesia',
  };

  const normalized = normalizeWebhookPayload({
    provider: 'bsi',
    payload,
  });

  assert.equal(normalized.provider_name, 'bsi');
  assert.equal(normalized.provider_ref, 'BSI-2026-9999');
  assert.equal(normalized.amount, 500000);
  assert.equal(normalized.muzakki_name, 'Dr. Fauzan, M.Ag');
  assert.equal(normalized.muzakki_phone, '081299998888');
  assert.equal(normalized.fund_type, 'zakat_profesi');
  assert.equal(normalized.channel, 'bank_transfer');
  assert.equal(normalized.channel_category, 'digital');
  assert.equal(normalized.status, 'Menunggu Validasi');
});

test('normalizeWebhookPayload: rejects missing reference or non-positive amount', () => {
  assert.throws(
    () => normalizeWebhookPayload({ provider: 'qris', payload: { status: 'success', amount: 10000 } }),
    /tidak memiliki referensi provider/
  );

  assert.throws(
    () => normalizeWebhookPayload({ provider: 'qris', payload: { status: 'success', order_id: 'Q-01', amount: 0 } }),
    /Nominal transaksi tidak valid/
  );
});

test('normalizeWebhookPayload: respects explicit timestamp precedence', () => {
  const paymentTime = '2026-09-01T10:00:00.000Z';
  const settlementTime = '2026-09-01T11:00:00.000Z';
  const transactionTime = '2026-09-01T12:00:00.000Z';
  const createdAt = '2026-09-01T13:00:00.000Z';

  // payment_time takes precedence over all
  const n1 = normalizeWebhookPayload({
    provider: 'bsi',
    payload: {
      order_id: 'TS-01',
      status: 'paid',
      amount: 10000,
      payment_time: paymentTime,
      settlement_time: settlementTime,
      transaction_time: transactionTime,
      created_at: createdAt,
    },
  });
  assert.equal(n1.transaction_date, new Date(paymentTime).toISOString());

  // settlement_time takes precedence over transaction_time and created_at
  const n2 = normalizeWebhookPayload({
    provider: 'bsi',
    payload: {
      order_id: 'TS-02',
      status: 'paid',
      amount: 10000,
      settlement_time: settlementTime,
      transaction_time: transactionTime,
      created_at: createdAt,
    },
  });
  assert.equal(n2.transaction_date, new Date(settlementTime).toISOString());

  // transaction_time takes precedence over created_at
  const n3 = normalizeWebhookPayload({
    provider: 'bsi',
    payload: {
      order_id: 'TS-03',
      status: 'paid',
      amount: 10000,
      transaction_time: transactionTime,
      created_at: createdAt,
    },
  });
  assert.equal(n3.transaction_date, new Date(transactionTime).toISOString());
});
