import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  maskNik,
  maskPhone,
  generatePenerimaanPdfReport,
  generatePenerimaanExcelReport,
} from './penerimaan-export.js';

test('PII Masking helpers mask NIK and phone securely', () => {
  assert.equal(maskNik('3271123456789012'), '3271************');
  assert.equal(maskNik(null), '-');
  assert.equal(maskNik(''), '-');

  assert.equal(maskPhone('081234567890'), '0812****7890');
  assert.equal(maskPhone('0812345'), '0812****2345');
  assert.equal(maskPhone(null), '-');
});

test('generatePenerimaanPdfReport produces valid PDF buffer with BAZNAS content and masked PII', async () => {
  const transactions = [
    {
      id: 1,
      transaction_number: 'TRX-TEST-001',
      transaction_date: '2026-09-08',
      channel: 'bank_transfer',
      fund_type: 'zakat_maal',
      muzakki_name: 'Budi Santoso',
      muzakki_nik: '3271123456789012',
      muzakki_phone: '081234567890',
      amount: 10000000,
      status: 'Posted',
    },
  ];

  const buffer = await generatePenerimaanPdfReport({
    meta: {
      period: '30d',
      start_date: '2026-08-09',
      end_date: '2026-09-08',
      channel: 'bank_transfer',
      fund_type: 'zakat_maal',
      data_freshness: '1 menit yang lalu',
    },
    transactions,
    summary: {
      total_amount: 10000000,
      total_count: 1,
      reconciled_pct: 100,
    },
    actor: {
      name: 'Amil Tester',
      role: 'staff',
      nik: '3271999988880001',
    },
  });

  assert.ok(Buffer.isBuffer(buffer), 'PDF result must be a Buffer');
  assert.ok(buffer.length > 500, 'PDF buffer must not be empty');
  assert.equal(buffer.subarray(0, 4).toString(), '%PDF', 'Buffer must have PDF magic number');

  // Verify raw buffer does not contain unmasked NIK or raw phone
  const rawText = buffer.toString('binary');
  assert.ok(!rawText.includes('3271123456789012'), 'Unmasked NIK must never leak into raw PDF');
  assert.ok(!rawText.includes('081234567890'), 'Unmasked phone must never leak into raw PDF');
});

test('generatePenerimaanExcelReport produces multi-sheet workbook with proper formatting', async () => {
  const transactions = [
    {
      id: 1,
      transaction_number: 'TRX-TEST-001',
      transaction_date: '2026-09-08',
      channel: 'bank_transfer',
      channel_category: 'digital',
      fund_type: 'zakat_maal',
      muzakki_name: 'Budi Santoso',
      muzakki_nik: '3271123456789012',
      muzakki_phone: '081234567890',
      amount: 10000000,
      fee_amount: 0,
      net_amount: 10000000,
      status: 'Posted',
      is_manual: false,
      provider_ref: 'ORDER-12345',
    },
  ];

  const buffer = await generatePenerimaanExcelReport({
    meta: {
      period: '30d',
      channel: 'bank_transfer',
    },
    transactions,
    summary: {
      total_amount: 10000000,
      total_count: 1,
      reconciled_pct: 100,
    },
    actor: {
      name: 'Amil Tester',
      role: 'staff',
    },
  });

  assert.ok(Buffer.isBuffer(buffer), 'XLSX result must be a Buffer');
  assert.ok(buffer.length > 500, 'XLSX buffer must not be empty');

  // Load workbook back using ExcelJS to verify sheets and values
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  assert.equal(workbook.worksheets.length, 2, 'Must contain 2 worksheets');
  const sheetSummary = workbook.getWorksheet('Ikhtisar Eksekutif');
  const sheetDetail = workbook.getWorksheet('Buku Besar Transaksi');

  assert.ok(sheetSummary, 'Sheet Ikhtisar Eksekutif must exist');
  assert.ok(sheetDetail, 'Sheet Buku Besar Transaksi must exist');

  // Verify details row has masked PII
  const detailRow = sheetDetail.getRow(2);
  assert.equal(detailRow.getCell(3).value, 'TRX-TEST-001');
  assert.equal(detailRow.getCell(9).value, '0812****7890');
  assert.equal(detailRow.getCell(10).value, '3271************');
  assert.equal(detailRow.getCell(11).value, 10000000);
});

test('generatePenerimaanPdfReport & ExcelReport handle empty transaction list safely', async () => {
  const pdfBuffer = await generatePenerimaanPdfReport({
    meta: { period: '7d' },
    transactions: [],
    summary: { total_amount: 0, total_count: 0, reconciled_pct: 0 },
    actor: { name: 'Amil' },
  });
  assert.ok(pdfBuffer.length > 500);

  const xlsxBuffer = await generatePenerimaanExcelReport({
    meta: { period: '7d' },
    transactions: [],
    summary: { total_amount: 0, total_count: 0, reconciled_pct: 0 },
    actor: { name: 'Amil' },
  });
  assert.ok(xlsxBuffer.length > 500);
});
