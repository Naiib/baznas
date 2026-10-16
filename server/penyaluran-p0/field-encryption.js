import crypto from 'node:crypto';
import { P0Error } from './errors.js';

const VERSION = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;

function decodeKey(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(text) || (text.includes('=') && !/=+$/.test(text)) || ((text.includes('+') || text.includes('/')) && (text.includes('-') || text.includes('_')))) return null;
  try {
    const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const key = Buffer.from(padded, 'base64');
    if (key.length !== KEY_BYTES) return null;
    const unpadded = text.replace(/=+$/, '');
    const standard = key.toString('base64').replace(/=+$/, '');
    const url = key.toString('base64url').replace(/=+$/, '');
    if (unpadded !== standard && unpadded !== url) return null;
    return key;
  } catch {
    return null;
  }
}

function getKey(options = {}) {
  const supplied = options.key ?? options.encryptionKey ?? process.env.P0_FIELD_ENCRYPTION_KEY ?? process.env.FIELD_ENCRYPTION_KEY;
  const key = Buffer.isBuffer(supplied)
    ? (supplied.length === KEY_BYTES ? Buffer.from(supplied) : null)
    : decodeKey(supplied);
  if (!key) throw new P0Error('FIELD_ENCRYPTION_UNAVAILABLE', 'Field encryption key is unavailable or invalid.', { status: 503 });
  return key;
}

function encode(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function decode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid base64url');
  return Buffer.from(value, 'base64url');
}

/** Encrypt a bank account with AES-256-GCM; the returned value contains no plaintext. */
export function encryptBankAccount(account, options = {}) {
  if (typeof account !== 'string' || !/^\d{4,64}$/.test(account.trim())) {
    throw new P0Error('FIELD_ENCRYPTION_INPUT_INVALID', 'Bank account must contain digits only.');
  }
  const key = getKey(options);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(account.trim(), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${encode(iv)}:${encode(tag)}:${encode(ciphertext)}`;
}

/** Decrypt a versioned AES-256-GCM field, failing closed on tampering. */
export function decryptBankAccount(stored, options = {}) {
  const key = getKey(options);
  if (typeof stored !== 'string') throw new P0Error('FIELD_ENCRYPTION_FAILED', 'Encrypted bank account is invalid.');
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new P0Error('FIELD_ENCRYPTION_FAILED', 'Encrypted bank account format is invalid.');
  }
  try {
    const iv = decode(parts[1]);
    const tag = decode(parts[2]);
    const ciphertext = decode(parts[3]);
    if (iv.length !== IV_BYTES || tag.length !== 16 || ciphertext.length === 0) throw new Error('invalid field lengths');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    if (!/^\d{4,64}$/.test(plaintext)) throw new Error('invalid plaintext');
    return plaintext;
  } catch (cause) {
    throw new P0Error('FIELD_ENCRYPTION_FAILED', 'Encrypted bank account could not be decrypted.', { status: 422, cause });
  }
}

/** Return a display-safe value with only the final four digits visible. */
export function maskBankAccount(value, options = {}) {
  if (typeof value !== 'string') return '';
  let account = value.trim();
  if (account.startsWith(`${VERSION}:`)) {
    if (options.key || options.encryptionKey) {
      try { account = decryptBankAccount(account, options); } catch { return '************'; }
    } else {
      return '************';
    }
  }
  if (!/^\d+$/.test(account)) return '************';
  if (account.length <= 4) return account;
  return `${'*'.repeat(Math.max(4, account.length - 4))}${account.slice(-4)}`;
}

export const FIELD_ENCRYPTION_VERSION = VERSION;
