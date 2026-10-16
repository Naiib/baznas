/**
 * Divisi Penerimaan - PDF and Excel Export Service
 *
 * Generates official, filter-aware PDF reports (via PDFKit) and XLSX workbooks (via ExcelJS)
 * with strict PII masking (NIK, phone), metadata provenance, executive KPI summaries,
 * and cross-division isolation (strictly no Penyaluran/mustahik data).
 */

import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import crypto from 'crypto';

/**
 * Masks national identity number (NIK) for PII safety: keeps first 4 digits, masks next 12.
 * @param {string|null|undefined} nik
 * @returns {string}
 */
export function maskNik(nik) {
  if (!nik) return '-';
  const clean = String(nik).trim();
  if (clean.length < 6) return '****';
  return clean.slice(0, 4) + '*'.repeat(Math.max(4, clean.length - 4));
}

/**
 * Masks phone number: keeps first 4 and last 4 digits, masks intermediate digits.
 * @param {string|null|undefined} phone
 * @returns {string}
 */
export function maskPhone(phone) {
  if (!phone) return '-';
  const clean = String(phone).trim();
  if (clean.length <= 6) return '****';
  const prefix = clean.slice(0, 4);
  const suffix = clean.slice(-4);
  const stars = '*'.repeat(Math.max(4, clean.length - 8));
  return `${prefix}${stars}${suffix}`;
}

/**
 * Formats integer amount to Indonesian Rupiah currency string safely with BigInt.
 * @param {number|bigint|string} amount
 * @returns {string}
 */
export function formatRupiah(amount) {
  if (amount === null || amount === undefined || amount === '') return 'Rp 0';
  try {
    const bi = typeof amount === 'bigint' ? amount : BigInt(String(amount).replace(/[^0-9-]/g, '') || '0');
    const isNegative = bi < 0n;
    const absStr = (isNegative ? -bi : bi).toString();
    const formatted = absStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${isNegative ? '-Rp ' : 'Rp '}${formatted}`;
  } catch {
    const num = Number(amount || 0);
    return 'Rp ' + Math.round(num).toLocaleString('id-ID');
  }
}

function isAuditReport(meta = {}) {
  return String(meta.view || '').toLowerCase() === 'audit';
}

function stringifyAuditValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

async function generatePenerimaanAuditPdfReport({ meta = {}, transactions = [], actor = {} } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40, compress: false, info: {
        Title: 'Laporan Audit Trail Penerimaan - BAZNAS Kota Tangerang',
        Author: actor.name || 'Amil Penerimaan',
        Subject: 'Jejak audit aktivitas penerimaan ZIS',
      } });
      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
      doc.fontSize(16).font('Helvetica-Bold').text('BADAN AMIL ZAKAT NASIONAL (BAZNAS) KOTA TANGERANG', { align: 'center' });
      doc.fontSize(13).fillColor('#0f5132').text('LAPORAN AUDIT TRAIL PENERIMAAN', { align: 'left' });
      doc.fillColor('#000000').fontSize(8).font('Helvetica');
      doc.text(`ID Laporan (Job UUID) : ${meta.job_uuid || '-'}`);
      doc.text(`Periode Laporan       : ${meta.period || 'Semua Waktu'}`);
      doc.text(`Dibuat Oleh           : ${actor.name || 'Amil Penerimaan'}`);
      doc.moveDown(1);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f5132').text('REKAPITULASI AKTIVITAS AUDIT');
      doc.fillColor('#000000').fontSize(8).font('Helvetica');
      doc.text(`Total Aktivitas: ${transactions.length}`);
      doc.moveDown(0.5);
      const drawHeader = (y) => {
        doc.rect(40, y, 515, 18).fill('#e9ecef');
        doc.fillColor('#212529').fontSize(7.5).font('Helvetica-Bold');
        doc.text('ID', 45, y + 5);
        doc.text('Waktu', 80, y + 5);
        doc.text('Entitas', 160, y + 5);
        doc.text('Aksi', 235, y + 5);
        doc.text('Aktor', 315, y + 5);
        doc.text('Perubahan / Metadata', 390, y + 5);
      };
      let y = doc.y;
      drawHeader(y);
      y += 20;
      doc.font('Helvetica').fontSize(7).fillColor('#212529');
      for (const row of transactions) {
        if (y > 740) { doc.addPage(); y = 40; drawHeader(y); y += 20; }
        doc.text(String(row.audit_event_id ?? row.id ?? '-'), 45, y);
        doc.text(String(row.created_at || '-').slice(0, 19), 80, y);
        doc.text(`${row.entity_type || '-'}#${row.entity_id ?? '-'}`, 160, y);
        doc.text(String(row.action || '-').slice(0, 18), 235, y);
        doc.text(String(row.actor_name || '-').slice(0, 18), 315, y);
        doc.text(`${stringifyAuditValue(row.changes)} / ${stringifyAuditValue(row.metadata)}`.slice(0, 40), 390, y, { width: 160 });
        y += 14;
      }
      doc.end();
    } catch (err) { reject(err); }
  });
}

/**
 * Helper to ensure money value is safe for Excel cell storage without IEEE-754 precision loss.
 */
function safeExcelMoney(val) {
  if (val === null || val === undefined || val === '') return 0;
  const str = String(val).trim();
  try {
    const bi = BigInt(str.replace(/[^0-9-]/g, '') || '0');
    if (bi > BigInt(Number.MAX_SAFE_INTEGER) || bi < -BigInt(Number.MAX_SAFE_INTEGER)) {
      return bi.toString();
    }
    return Number(bi);
  } catch {
    return str;
  }
}

/**
 * Generates official Penerimaan PDF Report using PDFKit.
 *
 * @param {Object} options
 * @param {Object} options.meta - Report metadata (period, filters, job_uuid, data_freshness)
 * @param {Array} options.transactions - List of transactions matching filter
 * @param {Object} options.summary - Aggregate KPIs (total_amount, count, etc.)
 * @param {Object} options.actor - Current user generating report
 * @returns {Promise<Buffer>}
 */
export async function generatePenerimaanPdfReport({ meta = {}, transactions = [], summary = {}, actor = {} } = {}) {
  if (isAuditReport(meta)) return generatePenerimaanAuditPdfReport({ meta, transactions, actor });
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: 'Laporan Penerimaan ZIS - BAZNAS Kota Tangerang',
          Author: actor.name || 'Amil Penerimaan',
          Subject: 'Rekapitulasi Penerimaan Zakat, Infak, dan Sedekah',
        },
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const generatedAt = new Date().toISOString();
      const jobUuid = meta.job_uuid || crypto.randomUUID();

      // 1. Official Header / KOP BAZNAS Kota Tangerang
      doc.fontSize(16).font('Helvetica-Bold').text('BADAN AMIL ZAKAT NASIONAL (BAZNAS) KOTA TANGERANG', { align: 'center' });
      doc.fontSize(10).font('Helvetica').text('Sistem Informasi Manajemen Penerimaan ZIS Terpadu', { align: 'center' });
      doc.fontSize(8).font('Helvetica-Oblique').text('Jl. Nyimas Melati No. 21A, Sukarasa, Kec. Tangerang, Kota Tangerang, Banten 15117', { align: 'center' });
      doc.moveDown(0.5);

      // Line separator
      doc.lineWidth(1.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke('#0f5132');
      doc.moveDown(1);

      // 2. Report Title & Provenance Metadata
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#0f5132').text('LAPORAN PENERIMAAN ZAKAT, INFAK, DAN SEDEKAH', { align: 'left' });
      doc.fillColor('#000000');
      doc.fontSize(8).font('Helvetica');

      const metaY = doc.y;
      doc.text(`ID Laporan (Job UUID) : ${jobUuid}`, 40, metaY);
      doc.text(`Periode Laporan       : ${meta.period || 'Semua Waktu'} (${meta.start_date || 'Awal'} s.d. ${meta.end_date || 'Sekarang'})`, 40, metaY + 12);
      doc.text(`Kanal / Jenis Dana    : ${meta.channel || 'Semua Kanal'} / ${meta.fund_type || 'Semua Jenis'}`, 40, metaY + 24);
      doc.text(`Dibuat Oleh           : ${actor.name || 'Amil Penerimaan'} (${actor.role || 'Staff'})`, 330, metaY);
      doc.text(`Waktu Unduh           : ${generatedAt}`, 330, metaY + 12);
      doc.text(`Kesegaran Data        : ${meta.data_freshness || 'Belum ada data'}`, 330, metaY + 24);

      doc.y = metaY + 40;
      doc.moveDown(0.5);

      // 3. Executive KPI Summary Box
      let totalAmountBigInt = 0n;
      if (summary.total_amount !== undefined && summary.total_amount !== null) {
        try {
          totalAmountBigInt = BigInt(String(summary.total_amount).replace(/[^0-9-]/g, '') || '0');
        } catch {
          totalAmountBigInt = 0n;
        }
      } else if (summary.total_revenue !== undefined && summary.total_revenue !== null) {
        try {
          totalAmountBigInt = BigInt(String(summary.total_revenue).replace(/[^0-9-]/g, '') || '0');
        } catch {
          totalAmountBigInt = 0n;
        }
      } else {
        for (const t of transactions) {
          try {
            totalAmountBigInt += BigInt(String(t.amount || 0).replace(/[^0-9-]/g, '') || '0');
          } catch {}
        }
      }
      const totalCount = summary.total_count ?? summary.total_transactions ?? transactions.length;
      const avgAmountBigInt = totalCount > 0 ? totalAmountBigInt / BigInt(totalCount) : 0n;
      const recPct = summary.reconciled_pct !== undefined ? `${summary.reconciled_pct}%` : 'N/A';

      doc.rect(40, doc.y, 515, 45).fillAndStroke('#f8f9fa', '#dee2e6');
      doc.fillColor('#000000');
      const boxY = doc.y - 40;

      doc.fontSize(8).font('Helvetica-Bold').text('TOTAL PENERIMAAN', 50, boxY + 8);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f5132').text(formatRupiah(totalAmountBigInt), 50, boxY + 20);

      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000').text('TOTAL TRANSAKSI', 185, boxY + 8);
      doc.fontSize(11).font('Helvetica-Bold').text(`${totalCount} Trx`, 185, boxY + 20);

      doc.fontSize(8).font('Helvetica-Bold').text('RATA-RATA TRANSAKSI', 305, boxY + 8);
      doc.fontSize(11).font('Helvetica-Bold').text(formatRupiah(avgAmountBigInt), 305, boxY + 20);

      doc.fontSize(8).font('Helvetica-Bold').text('REKONSILIASI', 440, boxY + 8);
      doc.fontSize(11).font('Helvetica-Bold').text(recPct, 440, boxY + 20);

      doc.y = boxY + 55;
      doc.moveDown(0.5);

      // 4. Transaction Details Table Header
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f5132').text('Pratinjau Rincian Transaksi', 40, doc.y);
      doc.fillColor('#000000');
      doc.moveDown(0.3);

      const tableTop = doc.y;
      function drawTableHeader(y) {
        doc.rect(40, y, 515, 18).fill('#e9ecef');
        doc.fillColor('#212529').fontSize(7.5).font('Helvetica-Bold');
        doc.text('No.', 45, y + 5);
        doc.text('Tanggal', 65, y + 5);
        doc.text('No. Transaksi', 130, y + 5);
        doc.text('Kanal', 225, y + 5);
        doc.text('Jenis Dana', 285, y + 5);
        doc.text('Muzakki', 355, y + 5);
        doc.text('Nominal (Rp)', 445, y + 5, { width: 60, align: 'right' });
        doc.text('Status', 510, y + 5);
      }

      drawTableHeader(tableTop);
      let currentY = tableTop + 20;

      if (transactions.length === 0) {
        doc.fontSize(8).font('Helvetica-Oblique').fillColor('#6c757d');
        doc.text('Tidak ada transaksi yang tercatat untuk filter dan periode ini.', 45, currentY + 5);
        currentY += 25;
      } else {
        doc.fontSize(7).font('Helvetica');

        for (let i = 0; i < transactions.length; i++) {
          const t = transactions[i];
          if (currentY > 740) {
            doc.addPage();
            currentY = 40;
            drawTableHeader(currentY);
            currentY += 20;
          }

          if (i % 2 === 1) {
            doc.rect(40, currentY - 2, 515, 14).fill('#fbfbfb');
          }

          doc.fillColor('#212529');
          doc.text(String(i + 1), 45, currentY);
          const dateStr = (t.created_at || t.transaction_date || '').slice(0, 10);
          doc.text(dateStr, 65, currentY);
          doc.text(t.transaction_number || t.trx_id || '-', 130, currentY);
          doc.text(t.channel || '-', 225, currentY);
          doc.text(t.fund_type || '-', 285, currentY);
          doc.text((t.muzakki_name || 'Hamba Allah').slice(0, 20), 355, currentY);
          doc.text(formatRupiah(t.amount || 0).replace('Rp ', ''), 445, currentY, { width: 60, align: 'right' });
          doc.text(t.status || '-', 510, currentY);

          currentY += 14;
        }
      }

      // 5. Official Sign-off Block
      if (currentY > 690) {
        doc.addPage();
        currentY = 50;
      } else {
        currentY += 20;
      }

      const signY = currentY;
      doc.fontSize(8).font('Helvetica').fillColor('#000000');
      doc.text('Dicetak dan diverifikasi secara sistem oleh:', 350, signY);
      doc.text('Bagian Penerimaan & Pengumpulan ZIS', 350, signY + 12);
      doc.moveDown(3);
      doc.font('Helvetica-Bold').text(actor.name || 'Amil Penerimaan BAZNAS', 350, signY + 50);
      doc.font('Helvetica').text(`NIK/ID: ${maskNik(actor.nik || actor.id || '1001')}`, 350, signY + 62);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generates official Penerimaan XLSX Workbook using ExcelJS.
 *
 * @param {Object} options
 * @param {Object} options.meta - Report metadata (period, filters, job_uuid, data_freshness)
 * @param {Array} options.transactions - List of transactions matching filter
 * @param {Object} options.summary - Aggregate KPIs
 * @param {Object} options.actor - Current user generating report
 * @returns {Promise<Buffer>}
 */
export async function generatePenerimaanExcelReport({ meta = {}, transactions = [], summary = {}, actor = {} } = {}) {
  if (isAuditReport(meta)) return generatePenerimaanAuditExcelReport({ meta, transactions, actor });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = actor.name || 'Amil Penerimaan';
  workbook.created = new Date();

  let totalAmountBigInt = 0n;
  if (summary.total_amount !== undefined && summary.total_amount !== null) {
    try {
      totalAmountBigInt = BigInt(String(summary.total_amount).replace(/[^0-9-]/g, '') || '0');
    } catch {
      totalAmountBigInt = 0n;
    }
  } else {
    for (const t of transactions) {
      try {
        totalAmountBigInt += BigInt(String(t.amount || 0).replace(/[^0-9-]/g, '') || '0');
      } catch {
        // ignore
      }
    }
  }
  const totalAmountVal = totalAmountBigInt <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(totalAmountBigInt) : formatRupiah(totalAmountBigInt);
  const totalCount = summary.total_count ?? summary.total_transactions ?? transactions.length;
  const avgAmountBigInt = totalCount > 0 ? totalAmountBigInt / BigInt(totalCount) : 0n;
  const avgAmountVal = avgAmountBigInt <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(avgAmountBigInt) : formatRupiah(avgAmountBigInt);
  const jobUuid = meta.job_uuid || crypto.randomUUID();

  // ----------------------------------------------------
  // Sheet 1: Ikhtisar Eksekutif
  // ----------------------------------------------------
  const sheetSummary = workbook.addWorksheet('Ikhtisar Eksekutif', {
    views: [{ showGridLines: true }],
  });

  sheetSummary.columns = [
    { width: 25 },
    { width: 40 },
    { width: 20 },
    { width: 20 },
  ];

  sheetSummary.addRow(['BADAN AMIL ZAKAT NASIONAL (BAZNAS) KOTA TANGERANG']);
  sheetSummary.addRow(['LAPORAN EKSEKUTIF PENERIMAAN ZAKAT, INFAK, DAN SEDEKAH']);
  sheetSummary.addRow([]);

  // Metadata
  sheetSummary.addRow(['ID Laporan (Job UUID)', jobUuid]);
  sheetSummary.addRow(['Periode Laporan', meta.period || 'Semua Waktu']);
  sheetSummary.addRow(['Rentang Tanggal', `${meta.start_date || 'Awal'} s.d. ${meta.end_date || 'Sekarang'}`]);
  sheetSummary.addRow(['Kanal Filter', meta.channel || 'Semua Kanal']);
  sheetSummary.addRow(['Jenis Dana Filter', meta.fund_type || 'Semua Jenis']);
  sheetSummary.addRow(['Diekspor Oleh', `${actor.name || 'Amil'} (${actor.role || 'Staff'})`]);
  sheetSummary.addRow(['Waktu Ekspor', new Date().toISOString()]);
  sheetSummary.addRow(['Kesegaran Data', meta.data_freshness || 'Belum ada data']);
  sheetSummary.addRow([]);

  // KPIs
  sheetSummary.addRow(['RINGKASAN EKSEKUTIF', 'NILAI / JUMLAH']);
  sheetSummary.addRow(['Total Penerimaan ZIS', totalAmountVal]);
  sheetSummary.addRow(['Total Transaksi', totalCount]);
  sheetSummary.addRow(['Rata-rata Transaksi', avgAmountVal]);
  sheetSummary.addRow(['Tingkat Rekonsiliasi', summary.reconciled_pct ? `${summary.reconciled_pct}%` : 'N/A']);

  // Format currency row if numbers
  const totalRow = sheetSummary.getRow(14);
  if (typeof totalAmountVal === 'number') totalRow.getCell(2).numFmt = '"Rp "#,##0';
  const avgRow = sheetSummary.getRow(16);
  if (typeof avgAmountVal === 'number') avgRow.getCell(2).numFmt = '"Rp "#,##0';

  // ----------------------------------------------------
  // Sheet 2: Buku Besar Transaksi
  // ----------------------------------------------------
  const sheetDetail = workbook.addWorksheet('Buku Besar Transaksi', {
    views: [{ showGridLines: true }],
  });

  sheetDetail.columns = [
    { header: 'No.', key: 'no', width: 6 },
    { header: 'ID Transaksi', key: 'id', width: 12 },
    { header: 'No. Transaksi', key: 'transaction_number', width: 22 },
    { header: 'Tanggal', key: 'date', width: 18 },
    { header: 'Kanal', key: 'channel', width: 16 },
    { header: 'Kategori Kanal', key: 'channel_category', width: 16 },
    { header: 'Jenis Dana', key: 'fund_type', width: 18 },
    { header: 'Nama Muzakki', key: 'muzakki_name', width: 25 },
    { header: 'No. HP (Masked)', key: 'muzakki_phone', width: 18 },
    { header: 'NIK (Masked)', key: 'muzakki_nik', width: 20 },
    { header: 'Nominal (Gross)', key: 'amount', width: 18 },
    { header: 'Biaya Admin', key: 'fee_amount', width: 14 },
    { header: 'Nominal Bersih', key: 'net_amount', width: 18 },
    { header: 'Status Transaksi', key: 'status', width: 20 },
    { header: 'Tipe', key: 'is_manual', width: 12 },
    { header: 'Referensi Provider', key: 'provider_ref', width: 24 },
  ];

  // Header style
  const headerRow = sheetDetail.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F5132' },
  };

  transactions.forEach((tx, idx) => {
    const amtVal = safeExcelMoney(tx.amount);
    const feeVal = safeExcelMoney(tx.fee_amount);
    const netVal = safeExcelMoney(tx.net_amount ?? tx.amount);

    const row = sheetDetail.addRow({
      no: idx + 1,
      id: tx.id,
      transaction_number: tx.transaction_number || '-',
      date: tx.transaction_date || tx.created_at || '-',
      channel: tx.channel || '-',
      channel_category: tx.channel_category || '-',
      fund_type: tx.fund_type || '-',
      muzakki_name: tx.muzakki_name || 'Hamba Allah',
      muzakki_phone: maskPhone(tx.muzakki_phone),
      muzakki_nik: maskNik(tx.muzakki_nik),
      amount: amtVal,
      fee_amount: feeVal,
      net_amount: netVal,
      status: tx.status || '-',
      is_manual: tx.is_manual ? 'Manual' : 'Digital',
      provider_ref: tx.provider_ref || '-',
    });

    if (typeof amtVal === 'number') row.getCell('amount').numFmt = '"Rp "#,##0';
    if (typeof feeVal === 'number') row.getCell('fee_amount').numFmt = '"Rp "#,##0';
    if (typeof netVal === 'number') row.getCell('net_amount').numFmt = '"Rp "#,##0';
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function generatePenerimaanAuditExcelReport({ meta = {}, transactions = [], actor = {} } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = actor.name || 'Amil Penerimaan';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Audit Trail');
  sheet.columns = [
    { header: 'ID Audit', key: 'id', width: 12 },
    { header: 'Waktu', key: 'created_at', width: 24 },
    { header: 'Tipe Entitas', key: 'entity_type', width: 18 },
    { header: 'ID Entitas', key: 'entity_id', width: 14 },
    { header: 'Aksi', key: 'action', width: 24 },
    { header: 'Aktor', key: 'actor_name', width: 24 },
    { header: 'Peran Aktor', key: 'actor_role', width: 18 },
    { header: 'Perubahan', key: 'changes', width: 48 },
    { header: 'Metadata', key: 'metadata', width: 48 },
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F5132' } };
  transactions.forEach((row) => sheet.addRow({
    id: row.audit_event_id ?? row.id ?? '-',
    created_at: row.created_at || '-',
    entity_type: row.entity_type || '-',
    entity_id: row.entity_id ?? '-',
    action: row.action || '-',
    actor_name: row.actor_name || '-',
    actor_role: row.actor_role || '-',
    changes: stringifyAuditValue(row.changes),
    metadata: stringifyAuditValue(row.metadata),
  }));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
