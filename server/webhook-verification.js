/**
 * BAZNAS Data Center - Webhook Verification & Normalization
 * Supports signed webhook verification (HMAC-SHA256) and payload normalization
 * for payment gateways (BSI, QRIS, Midtrans, Portal Publik, etc.).
 */

import crypto from 'node:crypto';
import { SUPPORTED_PROVIDERS } from './penerimaan-provider-secrets.js';

export const FORBIDDEN_DEFAULT_WEBHOOK_SECRET = 'baznas-penerimaan-webhook-secret-2026';

/**
 * Resolves and validates webhook secret for a given provider.
 * Strictly forbids empty secrets and default repository fallback in production.
 *
 * @param {string} provider
 * @param {string} [explicitSecret]
 * @returns {string}
 */
export function resolveWebhookSecret(provider = 'generic', explicitSecret = null) {
  if (explicitSecret && typeof explicitSecret === 'string' && explicitSecret.trim()) {
    return explicitSecret.trim();
  }

  const provKey = String(provider || 'generic').toUpperCase();
  const configuredSecret =
    process.env[`WEBHOOK_SECRET_${provKey}`] ||
    process.env.WEBHOOK_SECRET ||
    '';

  const trimmed = String(configuredSecret).trim();

  if (process.env.NODE_ENV === 'production') {
    if (!trimmed || trimmed === FORBIDDEN_DEFAULT_WEBHOOK_SECRET) {
      const err = new Error(
        `Webhook secret for provider '${provider}' is not configured or uses forbidden default in production.`
      );
      err.status = 500;
      throw err;
    }
    return trimmed;
  }

  if (!trimmed) {
    const err = new Error(`Webhook secret for provider '${provider}' is not configured.`);
    err.status = 500;
    throw err;
  }

  return trimmed;
}

/**
 * Verifies HMAC-SHA256 signature for incoming webhooks.
 * Uses timingSafeEqual to guard against timing attacks.
 * Strictly requires raw HTTP request bytes (Buffer or string).
 *
 * @param {Object} options
 * @param {string} options.provider - Provider name (e.g. 'bsi', 'qris', 'midtrans', 'portal_publik')
 * @param {string|Buffer} options.rawBody - Raw request body bytes (Buffer or string)
 * @param {string} [options.signature] - Explicit signature if provided in query or body
 * @param {Object} [options.headers={}] - Request headers
 * @param {string} [options.secret] - Optional secret override
 * @returns {boolean}
 */
export function verifyWebhookSignature({
  provider = 'generic',
  rawBody,
  signature = '',
  headers = {},
  secret,
}) {
  if (!rawBody || (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string')) {
    const err = new Error('Webhook signature verification requires raw HTTP request bytes (Buffer or string), not parsed objects.');
    err.status = 400;
    throw err;
  }

  const effectiveSecret = resolveWebhookSecret(provider, secret);

  // Extract signature from headers if not explicitly passed
  let sigToVerify = signature;
  if (!sigToVerify) {
    sigToVerify =
      headers['x-signature'] ||
      headers['x-webhook-signature'] ||
      headers['x-hub-signature-256'] ||
      headers['signature'] ||
      '';
  }

  if (!sigToVerify || typeof sigToVerify !== 'string') {
    return false;
  }

  // Strip prefix like 'sha256=' if present
  if (sigToVerify.startsWith('sha256=')) {
    sigToVerify = sigToVerify.slice(7);
  }

  const computedSig = crypto
    .createHmac('sha256', effectiveSecret)
    .update(rawBody)
    .digest('hex');

  const computedBuf = Buffer.from(computedSig, 'utf8');
  const providedBuf = Buffer.from(sigToVerify, 'utf8');

  if (computedBuf.length !== providedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuf, providedBuf);
}

const CANONICAL_FUND_TYPES = Object.freeze([
  'zakat_maal',
  'zakat_profesi',
  'zakat_fitrah',
  'infak',
  'sedekah',
  'fidyah',
  'dskl',
]);

export const SUCCESS_WEBHOOK_STATUSES = Object.freeze([
  'settlement',
  'capture',
  'success',
  'paid',
  'completed',
]);

/**
 * Parses monetary input as canonical non-negative integer string.
 * Strictly rejects decimals, signs, scientific notation, NaN, infinity, and unsafe numbers.
 *
 * @param {string|number|bigint} rawAmount
 * @param {string} [fieldName='Nominal transaksi']
 * @param {boolean} [allowZero=false]
 * @returns {string}
 */
export function parseCanonicalIntegerMoney(rawAmount, fieldName = 'Nominal transaksi', allowZero = false) {
  if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
    const err = new Error(`${fieldName} tidak valid atau kosong.`);
    err.status = 400;
    throw err;
  }

  let str = '';
  if (typeof rawAmount === 'bigint') {
    if (rawAmount < 0n) {
      const err = new Error(`${fieldName} tidak boleh negatif: ${rawAmount}`);
      err.status = 400;
      throw err;
    }
    str = rawAmount.toString();
  } else if (typeof rawAmount === 'number') {
    if (!Number.isFinite(rawAmount) || isNaN(rawAmount)) {
      const err = new Error(`${fieldName} tidak valid: ${rawAmount}`);
      err.status = 400;
      throw err;
    }
    if (rawAmount < 0) {
      const err = new Error(`${fieldName} tidak boleh negatif: ${rawAmount}`);
      err.status = 400;
      throw err;
    }
    if (!Number.isInteger(rawAmount)) {
      const err = new Error(`${fieldName} tidak boleh mengandung desimal: ${rawAmount}`);
      err.status = 400;
      throw err;
    }
    if (!Number.isSafeInteger(rawAmount)) {
      const err = new Error(`${fieldName} melebihi batas aman Number JS, gunakan string untuk nilai besar: ${rawAmount}`);
      err.status = 400;
      throw err;
    }
    str = String(rawAmount);
  } else if (typeof rawAmount === 'string') {
    str = rawAmount.trim();
    if (!str) {
      const err = new Error(`${fieldName} tidak boleh kosong.`);
      err.status = 400;
      throw err;
    }
    if (!/^\d+$/.test(str)) {
      const err = new Error(`${fieldName} tidak valid: ${rawAmount}`);
      err.status = 400;
      throw err;
    }
    if (str.length > 1 && str.startsWith('0')) {
      str = str.replace(/^0+/, '') || '0';
    }
  } else {
    const err = new Error(`${fieldName} tipe data tidak didukung.`);
    err.status = 400;
    throw err;
  }

  const MAX_POSTGRES_BIGINT = 9223372036854775807n;
  const valBigInt = BigInt(str);
  if (valBigInt > MAX_POSTGRES_BIGINT) {
    const err = new Error(`${fieldName} melebihi rentang database yang didukung.`);
    err.status = 400;
    throw err;
  }

  if (!allowZero && valBigInt <= 0n) {
    const err = new Error(`${fieldName} tidak valid: ${rawAmount}`);
    err.status = 400;
    throw err;
  }

  return str;
}

const PROVIDER_STATUS_VALIDATORS = {
  bsi: (_payload, status) => ['paid', 'success', '00', 'settlement', 'berhasil'].includes(status),
  bni_syariah: (_payload, status) => ['paid', 'success', '00', 'settlement', 'berhasil'].includes(status),
  midtrans: (payload, status) => {
    if (status === 'settlement') return true;
    if (status === 'capture') {
      const fraud = String(payload.fraud_status || '').trim().toLowerCase();
      return fraud === 'accept';
    }
    return false;
  },
  qris: (_payload, status) => ['success', 'paid', 'settlement', 'completed'].includes(status),
  qris_national: (_payload, status) => ['success', 'paid', 'settlement', 'completed'].includes(status),
  portal: (_payload, status) => ['success', 'paid', 'settlement', 'completed'].includes(status),
  portal_publik: (_payload, status) => ['success', 'paid', 'settlement', 'completed'].includes(status),
  generic: (_payload, status) => ['success', 'paid', 'settlement', 'completed'].includes(status),
};

/**
 * Normalizes diverse payment gateway webhooks into canonical Penerimaan format.
 *
 * @param {Object} options
 * @param {string} options.provider
 * @param {Object} options.payload
 * @returns {Object} Normalized transaction payload
 */
export function normalizeWebhookPayload({ provider = 'generic', payload = {} }) {
  if (!payload || typeof payload !== 'object') {
    const err = new Error('Payload webhook tidak valid atau kosong.');
    err.status = 400;
    throw err;
  }

  // Check explicit payment status (REQUIRED, non-empty, provider-aware)
  const rawStatus = (
    payload.status ??
    payload.transaction_status ??
    payload.payment_status ??
    payload.result
  );

  if (rawStatus === undefined || rawStatus === null || String(rawStatus).trim() === '') {
    const err = new Error('Status pembayaran wajib diisi dan tidak boleh kosong.');
    err.status = 400;
    err.code = 'MISSING_PAYMENT_STATUS';
    throw err;
  }

  const cleanStatus = String(rawStatus).trim().toLowerCase();
  const provKey = String(provider || 'generic').trim().toLowerCase();

  if (!SUPPORTED_PROVIDERS.includes(provKey)) {
    const err = new Error(`Provider '${provider}' is not recognized or supported.`);
    err.status = 400;
    err.code = 'UNSUPPORTED_PROVIDER';
    throw err;
  }

  const validator = Object.prototype.hasOwnProperty.call(PROVIDER_STATUS_VALIDATORS, provKey)
    ? PROVIDER_STATUS_VALIDATORS[provKey]
    : null;

  const isSuccess = validator
    ? validator(payload, cleanStatus)
    : ['success', 'paid', 'settlement', 'completed'].includes(cleanStatus);

  if (!isSuccess) {
    const err = new Error(`Status pembayaran "${cleanStatus}" bukan status final sukses untuk provider "${provider}"; transaksi penerimaan tidak dibuat.`);
    err.status = 422;
    err.code = 'NON_SUCCESS_PAYMENT';
    err.raw_status = cleanStatus;
    throw err;
  }

  // 1. Provider Reference
  const providerRef = String(
    payload.provider_ref ||
    payload.reference ||
    payload.order_id ||
    payload.transaction_id ||
    payload.trx_id ||
    payload.ref_no ||
    ''
  ).trim();

  if (!providerRef) {
    const err = new Error('Payload webhook tidak memiliki referensi provider (order_id/reference).');
    err.status = 400;
    throw err;
  }

  // 2. Exact Money (Amount & Fees)
  const rawAmount = payload.amount ?? payload.gross_amount ?? payload.total_amount ?? payload.nominal;
  const amountStr = parseCanonicalIntegerMoney(rawAmount, 'Nominal transaksi', false);

  const rawFee = payload.fee ?? payload.fee_amount ?? payload.admin_fee ?? 0;
  const feeStr = parseCanonicalIntegerMoney(rawFee, 'Biaya transaksi', true);

  const amountBig = BigInt(amountStr);
  const feeBig = BigInt(feeStr);
  if (feeBig > amountBig) {
    const err = new Error(`Biaya transaksi (${feeStr}) tidak boleh melebihi nominal transaksi (${amountStr}).`);
    err.status = 400;
    throw err;
  }
  const netAmountBig = amountBig - feeBig;
  const netAmountStr = netAmountBig.toString();

  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  const amountVal = amountBig <= maxSafe ? Number(amountBig) : amountStr;
  const feeVal = feeBig <= maxSafe ? Number(feeBig) : feeStr;
  const netVal = netAmountBig <= maxSafe ? Number(netAmountBig) : netAmountStr;

  // 3. Muzakki information
  const muzakkiName = String(
    payload.muzakki_name ||
    payload.donor_name ||
    payload.customer_name ||
    payload.name ||
    'Hamba Allah'
  ).trim();

  const muzakkiPhone = payload.muzakki_phone || payload.donor_phone || payload.customer_phone || payload.phone || null;
  const muzakkiEmail = payload.muzakki_email || payload.donor_email || payload.customer_email || payload.email || null;

  // 4. Channel & Category
  let channel = String(payload.channel || '').trim().toLowerCase();
  if (!channel) {
    const prov = String(provider).toLowerCase();
    if (prov.includes('qris')) channel = 'qris';
    else if (prov.includes('bsi') || prov.includes('bank')) channel = 'bank_transfer';
    else if (prov.includes('portal')) channel = 'portal_publik';
    else channel = 'bank_transfer';
  }

  const channelCategory = channel === 'counter_kasir' || channel === 'jemput_zakat' ? 'manual' : 'digital';

  // 5. Fund type
  let fundType = String(payload.fund_type || payload.program_type || 'zakat_maal').trim().toLowerCase();
  if (!CANONICAL_FUND_TYPES.includes(fundType)) {
    if (fundType.includes('profesi')) fundType = 'zakat_profesi';
    else if (fundType.includes('fitrah')) fundType = 'zakat_fitrah';
    else if (fundType.includes('infak') || fundType.includes('infaq')) fundType = 'infak';
    else if (fundType.includes('sedekah')) fundType = 'sedekah';
    else if (fundType.includes('fidyah')) fundType = 'fidyah';
    else if (fundType.includes('dskl')) fundType = 'dskl';
    else fundType = 'zakat_maal';
  }

  // 6. Payment method, bank details, transaction date
  const paymentMethod = String(
    payload.payment_method ||
    payload.payment_type ||
    payload.bank ||
    channel
  ).trim();

  const bankName = payload.bank_name || payload.bank || null;
  const bankAccountNumber = payload.bank_account_number || payload.va_number || null;

  // Explicit timestamp precedence: payment_time -> settlement_time -> transaction_time -> transaction_date -> paid_at -> created_at
  let transactionDate = new Date();
  const rawDate =
    payload.payment_time ||
    payload.settlement_time ||
    payload.transaction_time ||
    payload.transaction_date ||
    payload.paid_at ||
    payload.created_at ||
    null;

  if (rawDate) {
    const parsedDate = new Date(rawDate);
    if (!isNaN(parsedDate.getTime())) {
      transactionDate = parsedDate;
    }
  }

  const idempotencyKey = String(
    payload.idempotency_key ||
    `${provider}:${providerRef}`
  ).trim();

  return {
    provider_name: provider,
    provider_ref: providerRef,
    idempotency_key: idempotencyKey,
    channel,
    channel_category: channelCategory,
    muzakki_name: muzakkiName,
    muzakki_phone: muzakkiPhone,
    muzakki_email: muzakkiEmail,
    fund_type: fundType,
    amount: amountVal,
    fee_amount: feeVal,
    net_amount: netVal,
    payment_method: paymentMethod,
    bank_name: bankName,
    bank_account_number: bankAccountNumber,
    transaction_date: transactionDate.toISOString(),
    status: 'Menunggu Validasi',
    is_manual: false,
    raw_payload: payload,
  };
}
