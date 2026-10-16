import { createHash } from 'node:crypto';

export function verifyM6ReceiptDownload({ httpStatus, bytes, record }) {
  if (httpStatus !== 200) {
    throw new Error('M6_UAT_RECEIPT_HTTP_STATUS_INVALID');
  }
  if (String(record?.receipt_status || '').toLowerCase() !== 'ready') {
    throw new Error('M6_UAT_RECEIPT_STATUS_NOT_READY');
  }
  if (!Buffer.isBuffer(bytes)) {
    throw new Error('M6_UAT_RECEIPT_INVALID_PDF');
  }

  const header = bytes.subarray(0, 8).toString('ascii');
  const tail = bytes.subarray(Math.max(0, bytes.length - 1024)).toString('latin1');
  if (!/^%PDF-\d\.\d/.test(header) || !/%%EOF\s*$/.test(tail)) {
    throw new Error('M6_UAT_RECEIPT_INVALID_PDF');
  }

  const receiptSha256 = createHash('sha256').update(bytes).digest('hex');
  const storedHash = String(record?.receipt_file_sha256 || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(storedHash) || receiptSha256 !== storedHash) {
    throw new Error('M6_UAT_RECEIPT_HASH_MISMATCH');
  }

  return {
    receiptSha256,
    receiptBytesLength: bytes.length,
    isPdfValid: true,
  };
}
