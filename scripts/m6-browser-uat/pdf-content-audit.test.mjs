import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('audit receipt PDF text content and integrity locally', () => {
  assert.ok(process.env.M6_UAT_RECEIPT_PDF_PATH, 'Set M6_UAT_RECEIPT_PDF_PATH to a synthetic staging receipt PDF.');
  const buf = readFileSync(process.env.M6_UAT_RECEIPT_PDF_PATH);
  assert.equal(buf.subarray(0, 5).toString('ascii'), '%PDF-');

  const text = buf.toString('latin1');
  const hexRegex = /<([0-9a-fA-F]+)>/g;
  let m;
  let decodedParts = [];
  while ((m = hexRegex.exec(text)) !== null) {
    decodedParts.push(Buffer.from(m[1], 'hex').toString('utf8'));
  }
  const fullText = decodedParts.join(' ');
  // Normalize kerning spaces (e.g. "P en y alur an" -> "Penyaluran")
  const normalized = fullText.replace(/\s+/g, ' ');

  // 1. Verify Header & Authority Markers
  assert.match(normalized, /BAZNAS/);
  assert.match(normalized, /Bukti Digital/);
  assert.match(normalized, /Receipt ID:\s*RCP-PPD-1-1/);
  assert.match(normalized, /MST\s*-202609-0002/);

  // 2. Verify Masking & Security (No sensitive leaks)
  assert.match(normalized, /3671\*{8}0001/);
  assert.match(normalized, /\*{8}2211/);
  assert.doesNotMatch(normalized, /3671\d{12}/); // No unmasked 16-digit NIK

  // 3. Verify Workflow, MPZIS, & Financial Data
  assert.match(normalized, /MPZIS F-BPP\/06/);
  assert.match(normalized, /PPD F-PKP\/03/);
  assert.match(normalized, /2500000\.00/);
  assert.match(normalized, /Dua J\s*ut\s*a Lima Ratus Rib\s*u Rupiah/i);

  // 4. Verify Approval Trail
  assert.match(normalized, /Finance actors/);
  assert.match(normalized, /Divisi K\s*euangan/);
  assert.match(normalized, /completion_hash/);
});
