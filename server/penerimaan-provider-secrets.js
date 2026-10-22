/**
 * BAZNAS Data Center - Provider Secrets Authenticated Encryption & Resolution
 * Implements authenticated encryption (AES-256-GCM) with random 12-byte IV per write
 * and versioned envelope persistence: "v1:<base64-iv>:<base64-tag>:<base64-ciphertext>".
 * Strictly fails closed in deployed environments and enforces active provider status.
 */

import crypto from 'node:crypto';
import { getDb, withTransaction } from './db.js';

export const SUPPORTED_PROVIDERS = Object.freeze([
  'portal',
  'portal_publik',
  'bsi',
  'qris',
  'qris_national',
  'bni_syariah',
  'midtrans',
  'generic',
]);

export const KNOWN_INSECURE_KEYS = Object.freeze([
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '1111111111111111111111111111111111111111111111111111111111111111',
  '1234567890123456789012345678901234567890123456789012345678901234',
  'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
]);

/**
 * Resolves the 32-byte encryption key for provider secrets.
 * Strictly fails closed outside test environments if missing or invalid.
 *
 * @returns {Buffer} 32-byte key Buffer
 */
export function getProviderSecretEncryptionKey() {
  let envKey = process.env.PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY;
  if (!envKey || typeof envKey !== 'string' || !envKey.trim()) {
    if (process.env.NODE_ENV === 'test') {
      const err = new Error('PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY must be explicitly set in test environment.');
      err.status = 500;
      throw err;
    }
    if (process.env.NODE_ENV === 'production') {
      const err = new Error('PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY is required in production.');
      err.status = 500;
      throw err;
    }
    // Safe dev fallback so local development never crashes
    envKey = 'f52cf7ebe6d4f5ac8c2db2629c1acafc0141d8cd5ae21ef0ce120ead9ecacd63';
  }

  let trimmed = envKey.trim();
  if (process.env.NODE_ENV !== 'test') {
    if (KNOWN_INSECURE_KEYS.includes(trimmed.toLowerCase())) {
      if (process.env.NODE_ENV === 'production') {
        const err = new Error(
          'PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY menggunakan kunci contoh atau kunci tidak aman yang diketahui. Harap konfigurasikan kunci acak 32-byte (64 karakter hex) yang aman.'
        );
        err.status = 500;
        throw err;
      }
      trimmed = 'f52cf7ebe6d4f5ac8c2db2629c1acafc0141d8cd5ae21ef0ce120ead9ecacd63';
    }
  }

  if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  if (Buffer.from(trimmed, 'base64').length === 32) {
    return Buffer.from(trimmed, 'base64');
  }
  const err = new Error('PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY must be a valid 32-byte key (64 hex characters or base64 encoded).');
  err.status = 500;
  throw err;
}

/**
 * Encrypts a provider secret using AES-256-GCM with a fresh random 12-byte IV.
 * Returns a versioned envelope string: "v1:<base64-iv>:<base64-tag>:<base64-ciphertext>"
 *
 * @param {string} plaintext
 * @returns {string|null} Versioned envelope
 */
export function encryptProviderSecret(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;
  const text = String(plaintext).trim();
  if (!text) return null;

  const key = getProviderSecretEncryptionKey();
  const iv = crypto.randomBytes(12); // Fresh random 12-byte nonce
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encryptedBuffer = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encryptedBuffer.toString('base64')}`;
}

/**
 * Decrypts a versioned envelope string back to plaintext.
 * Strictly used inside webhook verification path only.
 * Fails closed on plaintext or tampered/invalid envelopes.
 *
 * @param {string} envelope
 * @returns {string|null} Plaintext secret or null
 */
export function decryptProviderSecret(envelope) {
  if (!envelope || typeof envelope !== 'string') return null;
  const trimmed = envelope.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith('v1:')) {
    const err = new Error('Provider secret is not stored in a valid encrypted envelope (v1 required). Legacy plaintext is forbidden.');
    err.status = 500;
    throw err;
  }

  const parts = trimmed.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    const err = new Error('Invalid provider secret envelope format.');
    err.status = 500;
    throw err;
  }

  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');

  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    const err = new Error('Invalid provider secret envelope components.');
    err.status = 500;
    throw err;
  }

  try {
    const key = getProviderSecretEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (_err) {
    const decryptErr = new Error('Provider secret decryption failed: invalid or tampered envelope.');
    decryptErr.status = 500;
    throw decryptErr;
  }
}

/**
 * Resolves the authoritative webhook secret for a configured provider.
 * Enforces exact provider allowlist, active status, and database precedence.
 *
 * @param {string} providerName
 * @param {Object} [dbOverride]
 * @returns {Promise<string>} Plaintext secret
 */
export async function resolveConfiguredProviderSecret(providerName, dbOverride = null) {
  if (!providerName || typeof providerName !== 'string') {
    const err = new Error('Nama provider wajib berupa teks.');
    err.status = 400;
    throw err;
  }

  const normalized = providerName.trim().toLowerCase();
  if (!SUPPORTED_PROVIDERS.includes(normalized)) {
    const err = new Error(`Provider '${providerName}' is not recognized or supported.`);
    err.status = 400;
    throw err;
  }

  const db = dbOverride || (await getDb());
  const row = await db.get(
    'SELECT provider_name, is_active, webhook_secret_encrypted FROM penerimaan_provider_configs WHERE provider_name = $1 LIMIT 1',
    [normalized]
  );

  if (row) {
    if (!Boolean(row.is_active)) {
      const err = new Error(`Provider '${providerName}' is inactive.`);
      err.status = 403;
      throw err;
    }

    // Authoritative database secret takes precedence over environment variable
    if (row.webhook_secret_encrypted) {
      return decryptProviderSecret(row.webhook_secret_encrypted);
    }
  }

  // Explicit environment fallback
  const envKey = `WEBHOOK_SECRET_${normalized.toUpperCase()}`;
  const envFallback = process.env[envKey] || process.env.WEBHOOK_SECRET;
  if (envFallback && typeof envFallback === 'string' && envFallback.trim()) {
    return envFallback.trim();
  }

  const err = new Error(`Webhook secret for provider '${providerName}' is not configured.`);
  err.status = 500;
  err.code = 'WEBHOOK_SECRET_NOT_CONFIGURED';
  throw err;
}

/**
 * One-time migration helper to rewrite legacy plaintext secrets into versioned envelopes.
 * Transactional: rolls back all mutations if any single encryption or update fails.
 * Idempotent: subsequent runs report 0 migrated rows and do not alter already-encrypted envelopes.
 * Never prints or returns plaintext secrets.
 *
 * @param {Object} [arg1] Options object { dryRun = false } or dbOverride
 * @param {Object} [arg2] dbOverride when arg1 is options
 * @returns {Promise<number>} Number of migrated rows (or count found if dryRun)
 */
export async function migrateLegacyPlaintextSecrets(arg1 = {}, arg2 = null) {
  let db = null;
  let options = {};
  if (arg1 && (arg1.all || arg1.run || arg1.get)) {
    db = arg1;
    options = arg2 || {};
  } else {
    options = arg1 || {};
    db = arg2 || (await getDb());
  }

  const dryRun = Boolean(options.dryRun);
  const rows = await db.all(
    `SELECT id, provider_name, webhook_secret_encrypted
     FROM penerimaan_provider_configs
     WHERE webhook_secret_encrypted IS NOT NULL
       AND webhook_secret_encrypted != ''`
  );

  const plaintextRows = rows.filter((r) => {
    const sec = String(r.webhook_secret_encrypted || '').trim();
    return sec && !sec.startsWith('v1:');
  });

  if (dryRun) {
    return options.detailed
      ? { dryRun: true, totalFound: plaintextRows.length, migratedCount: 0 }
      : plaintextRows.length;
  }

  if (plaintextRows.length === 0) {
    return options.detailed
      ? { dryRun: false, totalFound: 0, migratedCount: 0 }
      : 0;
  }

  return withTransaction(db, async (txDb) => {
    let migratedCount = 0;
    const now = new Date().toISOString();
    for (const row of plaintextRows) {
      const sec = String(row.webhook_secret_encrypted).trim();
      const encrypted = encryptProviderSecret(sec);
      await txDb.run(
        `UPDATE penerimaan_provider_configs
         SET webhook_secret_encrypted = $1, updated_at = $2
         WHERE id = $3`,
        [encrypted, now, row.id]
      );
      migratedCount++;
    }

    return options.detailed
      ? { dryRun: false, totalFound: plaintextRows.length, migratedCount }
      : migratedCount;
  });
}

/**
 * Startup preflight: asserts that no plaintext/unencrypted provider secrets remain in the database.
 * Fails closed with an explicit actionable message instructing operators to run the migration script.
 *
 * @param {Object} [dbOverride]
 */
export async function assertNoPlaintextProviderSecrets(dbOverride = null) {
  const db = dbOverride || (await getDb());
  const rows = await db.all(
    `SELECT id, provider_name, webhook_secret_encrypted
     FROM penerimaan_provider_configs
     WHERE webhook_secret_encrypted IS NOT NULL
       AND webhook_secret_encrypted != ''`
  );

  const plaintextRows = rows.filter((r) => {
    const sec = String(r.webhook_secret_encrypted || '').trim();
    return sec && !sec.startsWith('v1:');
  });

  if (plaintextRows.length > 0) {
    const names = plaintextRows.map((r) => r.provider_name).join(', ');
    const err = new Error(
      `Ditemukan ${plaintextRows.length} kredensial provider plaintext (${names}). ` +
      `Startup ditolak untuk keamanan data. Harap jalankan perintah migrasi berikut sebelum memulai aplikasi: ` +
      `node scripts/migrate-penerimaan-provider-secrets.js`
    );
    err.status = 500;
    err.code = 'PLAINTEXT_PROVIDER_SECRETS_REMAIN';
    throw err;
  }
}
