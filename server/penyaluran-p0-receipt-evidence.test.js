import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

const { verifyM6ReceiptDownload } = await import('./penyaluran-p0/receipt-evidence.js').catch(() => ({}));
const validBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'ascii');
const validHash = createHash('sha256').update(validBytes).digest('hex');

function validEvidence(overrides = {}) {
  return {
    httpStatus: 200,
    bytes: validBytes,
    record: { receipt_status: 'ready', receipt_file_sha256: validHash },
    ...overrides,
  };
}

function requireVerifier() {
  assert.equal(typeof verifyM6ReceiptDownload, 'function', 'the API receipt evidence verifier must be implemented');
}

test('M6 API receipt verifier accepts a ready PDF whose stored file hash matches', () => {
  requireVerifier();
  const result = verifyM6ReceiptDownload(validEvidence());
  assert.deepEqual(result, {
    receiptSha256: validHash,
    receiptBytesLength: validBytes.length,
    isPdfValid: true,
  });
});

test('M6 API receipt verifier rejects a failed HTTP status', () => {
  requireVerifier();
  assert.throws(() => verifyM6ReceiptDownload(validEvidence({ httpStatus: 503 })), /M6_UAT_RECEIPT_HTTP_STATUS/);
});

test('M6 API receipt verifier rejects a non-PDF response', () => {
  requireVerifier();
  assert.throws(() => verifyM6ReceiptDownload(validEvidence({ bytes: Buffer.from('not a PDF') })), /M6_UAT_RECEIPT_INVALID_PDF/);
});

test('M6 API receipt verifier rejects malformed PDF bytes', () => {
  requireVerifier();
  assert.throws(() => verifyM6ReceiptDownload(validEvidence({ bytes: Buffer.from('%PDF-1.4\nmissing EOF') })), /M6_UAT_RECEIPT_INVALID_PDF/);
});

test('M6 API receipt verifier rejects a receipt that is not ready', () => {
  requireVerifier();
  assert.throws(() => verifyM6ReceiptDownload(validEvidence({ record: { receipt_status: 'failed', receipt_file_sha256: validHash } })), /M6_UAT_RECEIPT_STATUS_NOT_READY/);
});

test('M6 API receipt verifier rejects a stored file hash mismatch', () => {
  requireVerifier();
  assert.throws(() => verifyM6ReceiptDownload(validEvidence({
    record: { receipt_status: 'ready', receipt_file_sha256: '0'.repeat(64) },
  })), /M6_UAT_RECEIPT_HASH_MISMATCH/);
});
