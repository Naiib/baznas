import PDFDocument from 'pdfkit';

export function normalizePublicApplicant(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const result = { ...input };
  if (result.applicant_status === 'Lembaga') {
    result.name = input.institution_name || input.name;
    result.beneficiary_name = input.pic_name || input.representative_name || input.beneficiary_name;
    result.nik = input.pic_nik || input.nik;
    result.phone = input.pic_phone || input.phone;
    for (const field of ['beneficiary_name', 'nik', 'phone']) {
      if (result[field] === undefined) delete result[field];
    }
  }
  return result;
}

export function formatRupiah(amount) {
  return `Rp ${Number(amount).toLocaleString('id-ID')}`;
}

export function formatIndoDate(dateInput = new Date()) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(dateInput);
}

export function validateSuratPermohonanInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('Data surat permohonan harus berupa objek.');
    Object.assign(error, { status: 422, code: 'VALIDATION_FAILED', field_errors: { body: 'OBJECT_REQUIRED' } });
    throw error;
  }
  const source = normalizePublicApplicant(input);
  const fieldErrors = {};
  const text = (field, maximum, value = source[field]) => {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') {
      fieldErrors[field] = 'STRING_REQUIRED';
      return '';
    }
    const cleaned = value.trim();
    if (cleaned.length > maximum) fieldErrors[field] = 'MAX_LENGTH';
    if ([...cleaned].some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    })) fieldErrors[field] = 'INVALID_CHARACTERS';
    return cleaned;
  };
  const applicantStatus = text('applicant_status', 50) || 'Perorangan';
  if (!['Perorangan', 'Lembaga'].includes(applicantStatus)) fieldErrors.applicant_status = 'ENUM';
  const name = text('name', 255);
  if (!name) fieldErrors.name = 'REQUIRED';
  const nik = text('nik', 16);
  if (nik && !/^\d{16}$/.test(nik)) fieldErrors.nik = 'FORMAT';
  const rawAmount = source.proposed_amount;
  const amount = rawAmount === undefined || rawAmount === null || rawAmount === '' ? 0
    : typeof rawAmount === 'number' ? rawAmount
      : typeof rawAmount === 'string' && rawAmount.trim() ? Number(rawAmount) : NaN;
  if (!Number.isFinite(amount) || amount < 0) fieldErrors.proposed_amount = 'NON_NEGATIVE_NUMBER';
  const result = {
    applicant_status: applicantStatus, name, nik, proposed_amount: amount,
    representative_name: text('beneficiary_name', 255),
    position: text('position', 100, source.position || source.representative_role),
    kk_number: text('kk_number', 50), phone: text('phone', 50),
    address: text('address', 1000), rt_rw: text('rt_rw', 50),
    kelurahan: text('kelurahan', 100), kecamatan: text('kecamatan', 100),
    kabupaten_kota: text('kabupaten_kota', 100), province: text('province', 100),
    program: text('program', 100), request_title: text('request_title', 1000),
    economic_description: text('economic_description', 4000, source.economic_description || source.notes || source.distribution_purpose),
  };
  if (Object.keys(fieldErrors).length) {
    const error = new Error('Data formulir surat permohonan tidak valid.');
    Object.assign(error, { status: 422, code: 'VALIDATION_FAILED', field_errors: fieldErrors });
    throw error;
  }
  return result;
}

export function renderSuratPermohonanDoc(data) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const contentWidth = doc.page.width - 100;
  const paragraph = (value, options = {}) => doc.text(value, 50, doc.y, { width: contentWidth, ...options });
  const row = (label, value) => {
    doc.font('Helvetica-Bold').fontSize(10);
    paragraph(label);
    doc.font('Helvetica');
    paragraph(value || '-');
    doc.moveDown(0.35);
  };
  doc.font('Helvetica-Bold').fontSize(14);
  paragraph('SURAT PERMOHONAN BANTUAN', { align: 'center' });
  doc.font('Helvetica').fontSize(8);
  paragraph('DRAFT PEMOHON - BUKAN FORMAT RESMI / PERSETUJUAN BAZNAS', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10);
  paragraph('Kepada Yth. BAZNAS Kota Tangerang');
  paragraph('Dengan hormat, saya/kami mengajukan permohonan bantuan dengan data berikut:');
  doc.moveDown();
  row('Jenis Pemohon', data.applicant_status);
  row(data.applicant_status === 'Lembaga' ? 'Nama Lembaga' : 'Nama Lengkap', data.name);
  if (data.applicant_status === 'Lembaga') {
    row('Penanggung Jawab', data.representative_name);
    if (data.position) row('Jabatan / Posisi', data.position);
  }
  row(data.applicant_status === 'Lembaga' ? 'NIK Penanggung Jawab' : 'NIK', data.nik);
  if (data.applicant_status === 'Perorangan') row('Nomor Kartu Keluarga', data.kk_number);
  row('No. Telepon / WhatsApp', data.phone);
  row('Alamat', [data.address, data.rt_rw, data.kelurahan, data.kecamatan, data.kabupaten_kota, data.province].filter(Boolean).join(', '));
  row('Program Bantuan', data.program);
  row('Uraian Kebutuhan', data.request_title);
  row('Usulan Anggaran', formatRupiah(data.proposed_amount));
  row('Deskripsi Kondisi Ekonomi', data.economic_description);
  paragraph('Demikian permohonan ini saya/kami sampaikan sebagai bahan pertimbangan. Terima kasih atas perhatian Bapak/Ibu.');
  doc.moveDown();
  if (doc.y + 100 > doc.page.height - 50) doc.addPage();
  paragraph(`Tanggal: ${formatIndoDate()}`);
  paragraph('Pemohon / Penanggung Jawab,');
  doc.moveDown(3);
  paragraph(data.applicant_status === 'Lembaga' ? data.representative_name || data.name : data.name);
  const pages = doc.bufferedPageRange();
  for (let pageIndex = pages.start; pageIndex < pages.start + pages.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    doc.font('Helvetica').fontSize(8).text(`DRAFT | Halaman ${pageIndex + 1} dari ${pages.count}`, 50, doc.page.height - 35, { width: contentWidth, lineBreak: false, align: 'center' });
  }
  return doc;
}

export function streamSuratPermohonanPdf(data, res) {
  const doc = renderSuratPermohonanDoc(data);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="draft-surat-permohonan.pdf"');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  doc.on('error', () => res.destroy());
  doc.pipe(res);
  doc.end();
}
