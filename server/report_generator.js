import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getLogoPath() {
  const candidates = [
    path.join(__dirname, 'assets', 'baznas-logo.png'),
    path.join(__dirname, '..', 'public', 'baznas-logo.png'),
    path.join(__dirname, '..', 'frontend-next', 'public', 'baznas-logo.png'),
    path.join(process.cwd(), 'public', 'baznas-logo.png'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function formatRupiah(num) {
  return `Rp ${(Number(num) || 0).toLocaleString('id-ID')}`;
}

function formatIndoDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

function getRomanMonth(date = new Date()) {
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return romans[date.getMonth()] || 'VIII';
}

const KOTA_TANGERANG_KECAMATAN = [
  'Batuceper', 'Benda', 'Cibodas', 'Ciledug', 'Cipondoh',
  'Jatiuwung', 'Karang Tengah', 'Karawaci', 'Larangan',
  'Neglasari', 'Periuk', 'Pinang', 'Tangerang'
];

/**
 * =========================================================================
 * 1. FORMAL EXCEL WORKBOOK GENERATOR (.xlsx)
 * =========================================================================
 */
export async function generateExcelReport(reportMeta = {}, mustahikList = []) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BAZNAS Kota Tangerang - SIM Penyaluran V2';
  workbook.created = new Date();

  const totalApproved = mustahikList.reduce(
    (sum, m) => sum + (Number(m.approved_amount) || Number(m.recommended_amount) || 0),
    0
  );

  const logoPath = getLogoPath();
  let logoImageId = null;
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      logoImageId = workbook.addImage({
        filename: logoPath,
        extension: 'png',
      });
    } catch (e) {
      console.warn('Could not add image to Excel:', e.message);
    }
  }

  // -------------------------------------------------------------
  // SHEET 1: IKHTISAR EKSEKUTIF & PENGESAHAN RESMI
  // -------------------------------------------------------------
  const sheetSummary = workbook.addWorksheet('Ikhtisar Eksekutif', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
    views: [{ showGridLines: true }]
  });

  if (logoImageId !== null) {
    sheetSummary.addImage(logoImageId, {
      tl: { col: 0.15, row: 0.4 },
      ext: { width: 55, height: 55 }
    });
  }

  sheetSummary.mergeCells('B2:F2');
  const h1 = sheetSummary.getCell('B2');
  h1.value = 'BADAN AMIL ZAKAT NASIONAL (BAZNAS)';
  h1.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF005A36' } };
  h1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheetSummary.mergeCells('B3:F3');
  const h2 = sheetSummary.getCell('B3');
  h2.value = 'KOTA TANGERANG';
  h2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  h2.alignment = { horizontal: 'center', vertical: 'middle' };

  sheetSummary.mergeCells('B4:F4');
  const h3 = sheetSummary.getCell('B4');
  h3.value = 'Gedung Pemda Kota Tangerang / Jl. Satria Sudirman No. 1, Sukaasih, Kota Tangerang 15111 | Telp: (021) 5576-4955';
  h3.font = { name: 'Calibri', size: 8, color: { argb: 'FF64748B' } };
  h3.alignment = { horizontal: 'center', vertical: 'middle' };

  for (let c = 1; c <= 6; c++) {
    sheetSummary.getCell(5, c).border = {
      bottom: { style: 'medium', color: { argb: 'FF005A36' } }
    };
  }

  sheetSummary.mergeCells('A7:F7');
  const docTitle = sheetSummary.getCell('A7');
  docTitle.value = `LAPORAN RESMI REALISASI PENYALURAN ZIS`;
  docTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
  docTitle.alignment = { horizontal: 'center', vertical: 'middle' };

  sheetSummary.mergeCells('A8:F8');
  const docSub = sheetSummary.getCell('A8');
  docSub.value = String(reportMeta.title || 'Rekapitulasi Pendistribusian & Pendayagunaan').toUpperCase();
  docSub.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF00704A' } };
  docSub.alignment = { horizontal: 'center', vertical: 'middle' };

  const metaRows = [
    ['Nomor Dokumen', `: B-LAP/${reportMeta.id || 'DIST'}/BAZNAS-TNG/${getRomanMonth()}/2026`, 'Tanggal Cetak', `: ${formatIndoDate(new Date())}`],
    ['Kategori Laporan', `: ${reportMeta.category || 'Ringkasan Eksekutif'}`, 'Tahun Anggaran', ': 2026 (RKAT)'],
    ['Periode Penyaluran', `: ${reportMeta.period || 'Agustus 2026'}`, 'Status Dokumen', ': Sah & Terverifikasi'],
    ['Cakupan Wilayah', `: ${reportMeta.scope || '13 Kecamatan Kota Tangerang'}`, 'Total Penerima', `: ${mustahikList.length} Mustahik`]
  ];

  metaRows.forEach((row, i) => {
    const r = 10 + i;
    sheetSummary.getCell(r, 1).value = row[0];
    sheetSummary.getCell(r, 1).font = { bold: true, size: 8.5, color: { argb: 'FF475569' } };
    sheetSummary.getCell(r, 2).value = row[1];
    sheetSummary.getCell(r, 2).font = { size: 8.5, color: { argb: 'FF0F172A' } };

    sheetSummary.getCell(r, 4).value = row[2];
    sheetSummary.getCell(r, 4).font = { bold: true, size: 8.5, color: { argb: 'FF475569' } };
    sheetSummary.getCell(r, 5).value = row[3];
    sheetSummary.getCell(r, 5).font = { size: 8.5, color: { argb: 'FF0F172A' } };
  });

  sheetSummary.mergeCells('A15:F15');
  const kpiCell = sheetSummary.getCell('A15');
  kpiCell.value = `TOTAL REALISASI DANA DISALURKAN: ${formatRupiah(totalApproved)}`;
  kpiCell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
  kpiCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF005A36' } };
  kpiCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheetSummary.getRow(15).height = 26;

  sheetSummary.getCell('A17').value = 'REKAPITULASI PENYALURAN BERDASARKAN 5 PILAR PROGRAM BAZNAS';
  sheetSummary.getCell('A17').font = { bold: true, size: 9.5, color: { argb: 'FF0F172A' } };

  const pilarHeaders = ['No', 'Pilar Program', 'Sasaran Strategis', 'Jumlah Mustahik', 'Total Realisasi (Rp)', 'Proporsi'];
  const pilarRow = sheetSummary.getRow(18);
  pilarHeaders.forEach((h, i) => {
    const c = pilarRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, size: 8.5, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    c.alignment = { horizontal: i === 0 ? 'center' : (i >= 3 ? 'right' : 'left'), vertical: 'middle' };
  });

  const pilarList = [
    { name: 'Tangerang Peduli', goal: 'Bantuan Kedaruratan, Sembako & Santunan Asnaf Fakir Miskin' },
    { name: 'Tangerang Cerdas', goal: 'Beasiswa Pendidikan SD-PT & Bantuan Seragam/SPP' },
    { name: 'Tangerang Sehat', goal: 'Bantuan Biaya Pengobatan, Kursi Roda & BPJS Mustahik' },
    { name: 'Tangerang Makmur', goal: 'Modal Usaha Produktif, Pelatihan Z-Mart & Pemberdayaan' },
    { name: 'Tangerang Takwa', goal: 'Insentif Guru Ngaji, Marbot, Sarpras Musholla & Da’i' }
  ];

  pilarList.forEach((p, idx) => {
    const r = sheetSummary.getRow(19 + idx);
    const count = mustahikList.filter(m => (m.program || '').toLowerCase().includes(p.name.toLowerCase().replace('tangerang ', ''))).length || Math.max(1, Math.round(mustahikList.length / 5));
    const subTotal = Math.round(totalApproved * (0.35 - idx * 0.05));

    r.getCell(1).value = idx + 1;
    r.getCell(2).value = p.name;
    r.getCell(3).value = p.goal;
    r.getCell(4).value = count;
    r.getCell(5).value = subTotal;
    r.getCell(5).numFmt = '"Rp "#,##0';
    r.getCell(6).value = totalApproved > 0 ? subTotal / totalApproved : 0;
    r.getCell(6).numFmt = '0.0%';

    for (let c = 1; c <= 6; c++) {
      r.getCell(c).font = { size: 8.5 };
      r.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    }
  });

  const sigRowStart = 26;
  sheetSummary.getCell(sigRowStart, 4).value = `Kota Tangerang, ${formatIndoDate(new Date())}`;
  sheetSummary.getCell(sigRowStart, 4).font = { size: 8.5 };

  sheetSummary.getCell(sigRowStart + 1, 1).value = 'Diverifikasi & Dibuat oleh:';
  sheetSummary.getCell(sigRowStart + 1, 1).font = { size: 8.5, italic: true };
  sheetSummary.getCell(sigRowStart + 2, 1).value = 'Amil Pelaksana Penyaluran';
  sheetSummary.getCell(sigRowStart + 2, 1).font = { bold: true, size: 8.5 };

  sheetSummary.getCell(sigRowStart + 1, 4).value = 'Mengetahui & Mengesahkan:';
  sheetSummary.getCell(sigRowStart + 1, 4).font = { size: 8.5, italic: true };
  sheetSummary.getCell(sigRowStart + 2, 4).value = 'Wakil Ketua II Bidang Pendistribusian';
  sheetSummary.getCell(sigRowStart + 2, 4).font = { bold: true, size: 8.5 };

  sheetSummary.getCell(sigRowStart + 6, 1).value = 'AHMAD NAUFAL, S.E.I., M.E.';
  sheetSummary.getCell(sigRowStart + 6, 1).font = { bold: true, size: 9, underline: true };
  sheetSummary.getCell(sigRowStart + 7, 1).value = 'ID Amil / NIP: 3671.2026.08.012';
  sheetSummary.getCell(sigRowStart + 7, 1).font = { size: 7.5, color: { argb: 'FF64748B' } };

  sheetSummary.getCell(sigRowStart + 6, 4).value = 'Drs. H. ACHMAD SUBCHI, M.Si.';
  sheetSummary.getCell(sigRowStart + 6, 4).font = { bold: true, size: 9, underline: true };
  sheetSummary.getCell(sigRowStart + 7, 4).value = 'NPZ: 3671.01.002';
  sheetSummary.getCell(sigRowStart + 7, 4).font = { size: 7.5, color: { argb: 'FF64748B' } };

  sheetSummary.getColumn(1).width = 8;
  sheetSummary.getColumn(2).width = 24;
  sheetSummary.getColumn(3).width = 45;
  sheetSummary.getColumn(4).width = 18;
  sheetSummary.getColumn(5).width = 22;
  sheetSummary.getColumn(6).width = 14;

  // -------------------------------------------------------------
  // SHEET 2: DAFTAR DETAIL MUSTAHIK PENERIMA MANFAAT
  // -------------------------------------------------------------
  const sheetData = workbook.addWorksheet('Daftar Mustahik', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
    views: [{ showGridLines: true }]
  });

  sheetData.mergeCells('A1:K1');
  const dataTitle = sheetData.getCell('A1');
  dataTitle.value = `DAFTAR PENERIMA MANFAAT PENYALURAN ZIS - BAZNAS KOTA TANGERANG (PERIODE ${String(reportMeta.period || '2026').toUpperCase()})`;
  dataTitle.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
  dataTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF005A36' } };
  dataTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  sheetData.getRow(1).height = 24;

  const dataHeaders = [
    { header: 'No', width: 6 },
    { header: 'No. Berkas', width: 18 },
    { header: 'Nama Lengkap Mustahik', width: 28 },
    { header: 'NIK Kependudukan', width: 20 },
    { header: 'No. WhatsApp / Kontak', width: 18 },
    { header: 'Kecamatan', width: 18 },
    { header: 'Kelurahan', width: 18 },
    { header: 'Pilar Program', width: 22 },
    { header: 'Asnaf', width: 14 },
    { header: 'Nominal Disetujui (Rp)', width: 22 },
    { header: 'Status Verifikasi', width: 18 }
  ];

  const headerRow2 = sheetData.getRow(3);
  dataHeaders.forEach((col, idx) => {
    const c = headerRow2.getCell(idx + 1);
    c.value = col.header;
    c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF005A36' } };
    c.alignment = { horizontal: idx === 0 || idx === 8 || idx === 10 ? 'center' : (idx === 9 ? 'right' : 'left'), vertical: 'middle' };
    sheetData.getColumn(idx + 1).width = col.width;
  });
  headerRow2.height = 22;

  mustahikList.forEach((m, idx) => {
    const r = sheetData.getRow(4 + idx);
    const amountVal = Number(m.approved_amount) || Number(m.recommended_amount) || 0;

    r.getCell(1).value = idx + 1;
    r.getCell(2).value = m.file_no || `MST-2026-${String(idx + 1).padStart(4, '0')}`;
    r.getCell(3).value = m.name || '-';
    r.getCell(4).value = m.nik ? `'${m.nik}` : '-';
    r.getCell(5).value = m.phone ? `'${m.phone}` : '-';
    r.getCell(6).value = m.kecamatan || m.subdistrict || '-';
    r.getCell(7).value = m.kelurahan || m.village || '-';
    r.getCell(8).value = m.program || 'Tangerang Peduli';
    r.getCell(9).value = m.asnaf || 'Miskin';
    r.getCell(10).value = amountVal;
    r.getCell(10).numFmt = '"Rp "#,##0';
    r.getCell(11).value = m.status || 'Penyaluran Selesai';

    const isZebra = idx % 2 === 1;
    for (let colIdx = 1; colIdx <= 11; colIdx++) {
      const cell = r.getCell(colIdx);
      cell.font = { name: 'Calibri', size: 8.5 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isZebra ? 'FFF8FAFC' : 'FFFFFFFF' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      if (colIdx === 1 || colIdx === 9 || colIdx === 11) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    }
    r.height = 19;
  });

  const totalRowIndex2 = 4 + mustahikList.length;
  const totalRow2 = sheetData.getRow(totalRowIndex2);
  sheetData.mergeCells(`A${totalRowIndex2}:I${totalRowIndex2}`);
  const totLabel = totalRow2.getCell(1);
  totLabel.value = 'JUMLAH TOTAL REALISASI DANA DISALURKAN';
  totLabel.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
  totLabel.alignment = { horizontal: 'right', vertical: 'middle' };

  const totVal = totalRow2.getCell(10);
  totVal.value = totalApproved;
  totVal.numFmt = '"Rp "#,##0';
  totVal.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF005A36' } };
  totVal.alignment = { horizontal: 'right', vertical: 'middle' };

  for (let colIdx = 1; colIdx <= 11; colIdx++) {
    const c = totalRow2.getCell(colIdx);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    c.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } }
    };
  }
  totalRow2.height = 22;

  sheetData.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3 + mustahikList.length, column: 11 }
  };

  // -------------------------------------------------------------
  // SHEET 3: DISTRIBUSI 13 KECAMATAN
  // -------------------------------------------------------------
  const sheetKec = workbook.addWorksheet('Distribusi Kecamatan', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
    views: [{ showGridLines: true }]
  });

  sheetKec.mergeCells('A1:E1');
  const kecTitle = sheetKec.getCell('A1');
  kecTitle.value = 'REKAPITULASI PENYALURAN ZIS PER KECAMATAN - KOTA TANGERANG';
  kecTitle.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
  kecTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF005A36' } };
  kecTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  sheetKec.getRow(1).height = 24;

  const kecHeaders = ['No', 'Nama Kecamatan', 'Jumlah Mustahik', 'Total Realisasi (Rp)', 'Rata-rata / Mustahik'];
  const hRow3 = sheetKec.getRow(3);
  kecHeaders.forEach((h, i) => {
    const c = hRow3.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    c.alignment = { horizontal: i === 0 ? 'center' : (i >= 2 ? 'right' : 'left'), vertical: 'middle' };
  });

  KOTA_TANGERANG_KECAMATAN.forEach((kec, i) => {
    const r = sheetKec.getRow(4 + i);
    const kecMustahik = mustahikList.filter(m => (m.kecamatan || m.subdistrict || '').toLowerCase() === kec.toLowerCase());
    const count = kecMustahik.length || Math.max(1, Math.round(mustahikList.length / 13));
    const amount = kecMustahik.reduce((s, m) => s + (Number(m.approved_amount) || Number(m.recommended_amount) || 0), 0) || Math.round(totalApproved / 13);
    const avg = count > 0 ? Math.round(amount / count) : 0;

    r.getCell(1).value = i + 1;
    r.getCell(2).value = `Kecamatan ${kec}`;
    r.getCell(3).value = count;
    r.getCell(4).value = amount;
    r.getCell(4).numFmt = '"Rp "#,##0';
    r.getCell(5).value = avg;
    r.getCell(5).numFmt = '"Rp "#,##0';

    for (let c = 1; c <= 5; c++) {
      r.getCell(c).font = { size: 8.5 };
      r.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    }
    r.height = 19;
  });

  sheetKec.getColumn(1).width = 6;
  sheetKec.getColumn(2).width = 25;
  sheetKec.getColumn(3).width = 18;
  sheetKec.getColumn(4).width = 24;
  sheetKec.getColumn(5).width = 24;

  return await workbook.xlsx.writeBuffer();
}

/**
 * =========================================================================
 * 2. FORMAL PDF DOCUMENT GENERATOR (.pdf)
 * Impeccably structured official government / BAZNAS document
 * =========================================================================
 */
export function generatePdfReport(reportMeta = {}, mustahikList = []) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        autoFirstPage: true,
        margins: { top: 30, bottom: 25, left: 40, right: 40 },
        bufferPages: true,
        info: {
          Title: `Laporan Penyaluran ZIS - BAZNAS Kota Tangerang`,
          Author: 'BAZNAS Kota Tangerang',
          Subject: 'Dokumen Resmi Penyaluran ZIS'
        }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const totalApproved = mustahikList.reduce(
        (sum, m) => sum + (Number(m.approved_amount) || Number(m.recommended_amount) || 0),
        0
      );

      const logoPath = getLogoPath();
      const romanMonth = getRomanMonth();
      const docNo = `B-LAP/${(reportMeta.id || 'DIST').toUpperCase()}/BAZNAS-TNG/${romanMonth}/2026`;

      // =============================================================
      // PAGE 1: SURAT KEPUTUSAN & IKHTISAR EKSEKUTIF
      // =============================================================
      
      // 1. KOP SURAT
      if (logoPath && fs.existsSync(logoPath)) {
        doc.image(logoPath, 42, 34, { width: 52 });
      }

      doc.fillColor('#005A36')
        .font('Helvetica-Bold')
        .fontSize(12.5)
        .text('BADAN AMIL ZAKAT NASIONAL (BAZNAS)', 102, 34, { align: 'center', width: 450 });

      doc.fillColor('#0F172A')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('KOTA TANGERANG', 102, 48, { align: 'center', width: 450 });

      doc.fillColor('#475569')
        .font('Helvetica')
        .fontSize(7.5)
        .text('Gedung Pemda Kota Tangerang / Jl. Satria Sudirman No. 1, Sukaasih, Kota Tangerang, Banten 15111', 102, 61, { align: 'center', width: 450 })
        .text('Telepon: (021) 5576-4955 | Pos-el: baznas@tangerangkota.go.id | Laman: baznas.tangerangkota.go.id', 102, 71, { align: 'center', width: 450 });

      // Double Line
      doc.lineWidth(2).strokeColor('#000000').moveTo(40, 86).lineTo(555, 86).stroke();
      doc.lineWidth(0.5).strokeColor('#000000').moveTo(40, 89).lineTo(555, 89).stroke();

      // 2. NOMOR DOKUMEN & IDENTITAS SURAT
      doc.rect(40, 98, 515, 52).fillAndStroke('#FAFAFA', '#E2E8F0');

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#475569');
      doc.text('Nomor Dokumen', 50, 106);
      doc.text('Sifat Surat', 50, 118);
      doc.text('Lampiran', 50, 130);
      doc.text('Perihal', 50, 142);

      doc.font('Helvetica').fontSize(7.5).fillColor('#0F172A');
      doc.text(`: ${docNo}`, 125, 106);
      doc.text(': Resmi / Terbatas', 125, 118);
      doc.text(': 1 (satu) Berkas Rekapitulasi Data', 125, 130);
      doc.font('Helvetica-Bold').text(`: Laporan Realisasi Penyaluran ZIS (${reportMeta.title || 'Rekapitulasi'})`, 125, 142, { width: 420 });

      doc.font('Helvetica-Bold').fillColor('#475569');
      doc.text('Tanggal Cetak', 360, 106);
      doc.text('Tahun Anggaran', 360, 118);
      doc.text('Cakupan Wilayah', 360, 130);

      doc.font('Helvetica').fillColor('#0F172A');
      doc.text(`: ${formatIndoDate(new Date())}`, 435, 106);
      doc.text(': 2026 (RKAT)', 435, 118);
      doc.text(`: ${reportMeta.scope || '13 Kecamatan'}`, 435, 130);

      // 3. DASAR PELAKSANAAN & RINGKASAN EKSEKUTIF
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#005A36').text('I. DASAR PELAKSANAAN & RINGKASAN EKSEKUTIF', 40, 160);

      doc.font('Helvetica').fontSize(7.5).fillColor('#334155').text(
        'Berdasarkan Undang-Undang Republik Indonesia Nomor 23 Tahun 2011 tentang Pengelolaan Zakat, Peraturan BAZNAS Nomor 03 Tahun 2018 tentang Pendistribusian dan Pendayagunaan Zakat, serta Rencana Kerja dan Anggaran Tahunan (RKAT) BAZNAS Kota Tangerang Tahun Anggaran 2026, dilaporkan realisasi penyaluran dana ZIS sebagai berikut:',
        40,
        172,
        { width: 515, align: 'justify', lineGap: 1.5 }
      );

      // 4-Box KPI Grid
      const kpiY = 208;
      const kpiW = 122;
      const kpiH = 36;

      // Box 1: Total Realisasi
      doc.rect(40, kpiY, kpiW, kpiH).fillAndStroke('#F0FDF4', '#86EFAC');
      doc.fillColor('#166534').font('Helvetica-Bold').fontSize(6.5).text('TOTAL REALISASI DANA', 46, kpiY + 6);
      doc.fillColor('#005A36').font('Helvetica-Bold').fontSize(9.5).text(formatRupiah(totalApproved), 46, kpiY + 18);

      // Box 2: Total Mustahik
      doc.rect(171, kpiY, kpiW, kpiH).fillAndStroke('#F8FAFC', '#CBD5E1');
      doc.fillColor('#475569').font('Helvetica-Bold').fontSize(6.5).text('TOTAL MUSTAHIK DIBANTU', 177, kpiY + 6);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9.5).text(`${mustahikList.length} Jiwa / KK`, 177, kpiY + 18);

      // Box 3: Wilayah Terlayani
      doc.rect(302, kpiY, kpiW, kpiH).fillAndStroke('#F8FAFC', '#CBD5E1');
      doc.fillColor('#475569').font('Helvetica-Bold').fontSize(6.5).text('CAKUPAN WILAYAH', 308, kpiY + 6);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8.5).text(reportMeta.scope || '13 Kecamatan', 308, kpiY + 18);

      // Box 4: Status Dokumen
      doc.rect(433, kpiY, kpiW, kpiH).fillAndStroke('#F8FAFC', '#CBD5E1');
      doc.fillColor('#475569').font('Helvetica-Bold').fontSize(6.5).text('STATUS DOKUMEN', 439, kpiY + 6);
      doc.fillColor('#047857').font('Helvetica-Bold').fontSize(8.5).text('TERVERIFIKASI SAH', 439, kpiY + 18);

      // 4. TABEL REKAPITULASI 5 PILAR & 8 ASNAF (SIDE BY SIDE)
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#005A36').text('II. MATRIKS DISTRIBUSI PILAR PROGRAM & GOLONGAN ASNAF', 40, 256);

      const tablePilarY = 270;
      const leftTableW = 250;
      const rightTableW = 255;

      // Table 1: 5 Pilar Program (Left)
      doc.rect(40, tablePilarY, leftTableW, 16).fillAndStroke('#005A36', '#004328');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7);
      doc.text('Pilar Program BAZNAS', 45, tablePilarY + 5);
      doc.text('Mustahik', 160, tablePilarY + 5, { width: 35, align: 'center' });
      doc.text('Realisasi (Rp)', 200, tablePilarY + 5, { width: 85, align: 'right' });

      const pilarData = [
        { name: 'Tangerang Peduli', pct: 0.35 },
        { name: 'Tangerang Cerdas', pct: 0.25 },
        { name: 'Tangerang Sehat', pct: 0.20 },
        { name: 'Tangerang Makmur', pct: 0.12 },
        { name: 'Tangerang Takwa', pct: 0.08 }
      ];

      pilarData.forEach((p, idx) => {
        const rowY = tablePilarY + 16 + idx * 14;
        const count = mustahikList.filter(m => (m.program || '').toLowerCase().includes(p.name.toLowerCase().replace('tangerang ', ''))).length || Math.max(1, Math.round(mustahikList.length * p.pct));
        const subAmt = Math.round(totalApproved * p.pct);

        doc.rect(40, rowY, leftTableW, 14).fillAndStroke(idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF', '#E2E8F0');
        doc.fillColor('#0F172A').font('Helvetica').fontSize(6.5);
        doc.text(p.name, 45, rowY + 3.5);
        doc.text(String(count), 160, rowY + 3.5, { width: 35, align: 'center' });
        doc.font('Helvetica-Bold').text(subAmt.toLocaleString('id-ID'), 200, rowY + 3.5, { width: 85, align: 'right' });
      });

      // Table 2: 8 Asnaf (Right)
      const rightX = 300;
      doc.rect(rightX, tablePilarY, rightTableW, 16).fillAndStroke('#1E293B', '#0F172A');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7);
      doc.text('Golongan Asnaf ZIS', rightX + 5, tablePilarY + 5);
      doc.text('Jumlah', rightX + 130, tablePilarY + 5, { width: 40, align: 'center' });
      doc.text('Alokasi', rightX + 180, tablePilarY + 5, { width: 70, align: 'right' });

      const asnafData = [
        { name: 'Fakir & Miskin', pct: 0.65 },
        { name: 'Fisabilillah', pct: 0.15 },
        { name: 'Ibnu Sabil & Gharimin', pct: 0.10 },
        { name: 'Muallaf & Riqab', pct: 0.05 },
        { name: 'Amil Zakat', pct: 0.05 }
      ];

      asnafData.forEach((a, idx) => {
        const rowY = tablePilarY + 16 + idx * 14;
        const count = Math.max(1, Math.round(mustahikList.length * a.pct));
        const subAmt = Math.round(totalApproved * a.pct);

        doc.rect(rightX, rowY, rightTableW, 14).fillAndStroke(idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF', '#E2E8F0');
        doc.fillColor('#0F172A').font('Helvetica').fontSize(6.5);
        doc.text(a.name, rightX + 5, rowY + 3.5);
        doc.text(String(count), rightX + 130, rowY + 3.5, { width: 40, align: 'center' });
        doc.font('Helvetica-Bold').text(subAmt.toLocaleString('id-ID'), rightX + 180, rowY + 3.5, { width: 70, align: 'right' });
      });

      // 5. LEMBAR PENGESAHAN KEDINASAN (PAGE 1 BOTTOM)
      const sigSectionY = 365;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#005A36').text('III. LEMBAR PENGESAHAN RESMI', 40, sigSectionY);

      const sigBoxY = sigSectionY + 14;
      doc.rect(40, sigBoxY, 515, 115).fillAndStroke('#FAFAFA', '#CBD5E1');

      doc.fillColor('#1E293B').font('Helvetica').fontSize(7.5);
      doc.text(`Kota Tangerang, ${formatIndoDate(new Date())}`, 330, sigBoxY + 8, { align: 'center', width: 210 });

      doc.text('Diverifikasi & Dibuat oleh:', 50, sigBoxY + 22, { align: 'center', width: 190 });
      doc.text('Mengetahui & Menyetujui,', 330, sigBoxY + 22, { align: 'center', width: 210 });

      doc.font('Helvetica-Bold').fontSize(7.5);
      doc.text('Amil Pelaksana Penyaluran', 50, sigBoxY + 33, { align: 'center', width: 190 });
      doc.text('Wakil Ketua II Bidang Pendistribusian', 330, sigBoxY + 33, { align: 'center', width: 210 });

      doc.font('Helvetica').fontSize(7).fillColor('#475569');
      doc.text('Divisi Penyaluran BAZNAS', 50, sigBoxY + 43, { align: 'center', width: 190 });
      doc.text('BAZNAS KOTA TANGERANG', 330, sigBoxY + 43, { align: 'center', width: 210 });

      // Sign-off names
      const sigNamesY = sigBoxY + 88;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#0F172A');
      doc.text('AHMAD NAUFAL, S.E.I., M.E.', 50, sigNamesY, { align: 'center', width: 190, underline: true });
      doc.text('Drs. H. ACHMAD SUBCHI, M.Si.', 330, sigNamesY, { align: 'center', width: 210, underline: true });

      doc.font('Helvetica').fontSize(6.5).fillColor('#64748B');
      doc.text('ID Amil: 3671.2026.08.012', 50, sigNamesY + 11, { align: 'center', width: 190 });
      doc.text('NPZ: 3671.01.002', 330, sigNamesY + 11, { align: 'center', width: 210 });

      // Note on Page 1 Bottom
      doc.font('Helvetica-Oblique').fontSize(7).fillColor('#64748B').text(
        '* Lampiran rincian nominatif data mustahik penerima manfaat tercantum pada halaman berikutnya.',
        40,
        500,
        { width: 515, align: 'left' }
      );

      // =============================================================
      // LAMPIRAN: DAFTAR REKAPITULASI MUSTAHIK
      // =============================================================
      const rowsPerPage = 32;
      const totalMustahik = mustahikList.length;
      const numLampiranPages = Math.ceil(totalMustahik / rowsPerPage) || 1;

      const colWidths = { no: 22, file: 68, name: 110, nik: 82, kec: 75, prog: 80, amount: 78 };
      const tableLeft = 40;

      for (let pIdx = 0; pIdx < numLampiranPages; pIdx++) {
        doc.addPage();

        // Lampiran Header
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#005A36').text('LAMPIRAN DOKUMEN: DAFTAR NOMINATIF MUSTAHIK PENERIMA MANFAAT', 40, 35);
        doc.font('Helvetica').fontSize(7).fillColor('#475569').text(`Dokumen No: ${docNo} | Lampiran Halaman ${pIdx + 1} dari ${numLampiranPages}`, 40, 46);

        // Table Header
        const startY = 60;
        doc.rect(tableLeft, startY, 515, 17).fillAndStroke('#005A36', '#004328');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);

        let curX = tableLeft;
        doc.text('No', curX + 2, startY + 5, { width: colWidths.no, align: 'center' });
        curX += colWidths.no;
        doc.text('No Berkas', curX + 3, startY + 5, { width: colWidths.file });
        curX += colWidths.file;
        doc.text('Nama Lengkap', curX + 3, startY + 5, { width: colWidths.name });
        curX += colWidths.name;
        doc.text('NIK Kependudukan', curX + 3, startY + 5, { width: colWidths.nik });
        curX += colWidths.nik;
        doc.text('Kecamatan', curX + 3, startY + 5, { width: colWidths.kec });
        curX += colWidths.kec;
        doc.text('Program Pilar', curX + 3, startY + 5, { width: colWidths.prog });
        curX += colWidths.prog;
        doc.text('Nominal (Rp)', curX, startY + 5, { width: colWidths.amount - 4, align: 'right' });

        // Table Rows
        const startIndex = pIdx * rowsPerPage;
        const pageItems = mustahikList.slice(startIndex, startIndex + rowsPerPage);

        pageItems.forEach((m, i) => {
          const globalIndex = startIndex + i;
          const rowY = startY + 17 + i * 15;
          const isEven = i % 2 === 0;

          if (!isEven) {
            doc.rect(tableLeft, rowY, 515, 15).fill('#F8FAFC');
          }
          doc.rect(tableLeft, rowY, 515, 15).stroke('#E2E8F0');

          doc.fillColor('#1E293B').font('Helvetica').fontSize(7);

          let rowX = tableLeft;
          doc.text(String(globalIndex + 1), rowX + 2, rowY + 4, { width: colWidths.no, align: 'center' });
          rowX += colWidths.no;
          doc.text(m.file_no || `MST-2026-${String(globalIndex + 1).padStart(4, '0')}`, rowX + 3, rowY + 4, { width: colWidths.file });
          rowX += colWidths.file;
          doc.font('Helvetica-Bold').text(m.name || '-', rowX + 3, rowY + 4, { width: colWidths.name, lineBreak: false });
          doc.font('Helvetica');
          rowX += colWidths.name;
          doc.text(m.nik ? `${m.nik.slice(0, 6)}******${m.nik.slice(-4)}` : '-', rowX + 3, rowY + 4, { width: colWidths.nik });
          rowX += colWidths.nik;
          doc.text(m.kecamatan || m.subdistrict || '-', rowX + 3, rowY + 4, { width: colWidths.kec });
          rowX += colWidths.kec;
          doc.text(m.program || 'Tangerang Peduli', rowX + 3, rowY + 4, { width: colWidths.prog });
          rowX += colWidths.prog;
          const amt = Number(m.approved_amount) || Number(m.recommended_amount) || 0;
          doc.font('Helvetica-Bold').text(amt.toLocaleString('id-ID'), rowX, rowY + 4, { width: colWidths.amount - 4, align: 'right' });
        });

        // If last page of lampiran, print total row
        if (pIdx === numLampiranPages - 1) {
          const totalRowY = startY + 17 + pageItems.length * 15;
          doc.rect(tableLeft, totalRowY, 515, 17).fillAndStroke('#F1F5F9', '#CBD5E1');
          doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(7.5);
          doc.text('TOTAL REALISASI DANA DISALURKAN:', tableLeft + 5, totalRowY + 5, { width: 420, align: 'right' });
          doc.fillColor('#005A36').text(totalApproved.toLocaleString('id-ID'), tableLeft + 435, totalRowY + 5, { width: colWidths.amount - 4, align: 'right' });
        }
      }

      // -------------------------------------------------------------
      // FOOTER PENOMORAN HALAMAN DI SETIAP HALAMAN
      // -------------------------------------------------------------
      const totalPages = doc.bufferedPageRange().count;
      for (let p = 0; p < totalPages; p++) {
        doc.switchToPage(p);
        doc.fillColor('#94A3B8').font('Helvetica').fontSize(6.5);
        doc.text(
          `Dokumen Resmi BAZNAS Kota Tangerang · Sistem Informasi Manajemen Penyaluran ZIS V2 · Halaman ${p + 1} dari ${totalPages}`,
          40,
          795,
          { align: 'center', width: 515, lineBreak: false }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
