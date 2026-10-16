import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { extractSurveyFromText, extractSurveyFromImage, normalizeStatus } from './ai.js';
import {
  getMustahikByFileNo,
  createMustahik,
  updateMustahik,
  addAssessment,
  addMpzis,
  addPpd,
  submitMustahikDecision,
  getStatusByFileNo,
  generateNextFileNo,
  getDb,
} from './repository.js';
import { isP0CutoverActive } from './penyaluran-p0/legacy-reconciliation.js';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const uploadDir = process.env.UPLOAD_DIR || './uploads';

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

let bot = null;

export function assertTelegramWriteAllowed(action, options = {}) {
  const cutoverOptions = {
    cutoverAt: options.cutoverAt ?? process.env.PENYALURAN_P0_CUTOVER_AT,
    now: options.now ?? new Date(),
  };
  if (isP0CutoverActive(cutoverOptions)) {
    const error = new Error('Layanan bot Telegram untuk input data legacy telah dinonaktifkan setelah cutover Penyaluran P0.');
    error.code = 'LEGACY_WORKFLOW_DISABLED';
    error.status = 410;
    throw error;
  }
  return true;
}

export function workflowExpectationFor(mustahik = {}) {
  return {
    expected_status: mustahik.status,
    expected_version: Number(mustahik.workflow_version || 0),
  };
}

if (token && token !== 'YOUR_BOT_TOKEN_HERE') {
  try {
    bot = new TelegramBot(token, { polling: true });

    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      bot.sendMessage(
        chatId,
        `<b>Selamat datang di BAZNAS AI Agent Data Center V2!</b>\n\n` +
          `Perintah yang tersedia:\n` +
          `• <code>/survey</code> - input hasil survey teks / form F-BPP/04\n` +
          `• Kirim foto form F-BPP/04 dengan caption <code>/survey no_berkas=MST-YYYYMM-XXXX</code>\n` +
          `• <code>/mpzis</code> - input data persetujuan MPZIS (F-BPP/06)\n` +
          `• <code>/ppd</code> - input pengajuan dana PPD (F-PKP/03)\n` +
          `• <code>/status &lt;no_berkas/NIK&gt;</code> - cek status pengajuan\n` +
          `• <code>/help</code> - panduan format data`,
        { parse_mode: 'HTML' }
      );
    });

    bot.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      bot.sendMessage(
        chatId,
        `<b>Format Input BAZNAS AI Agent V2:</b>\n\n` +
          `<b>1. Input Survey (F-BPP/04):</b>\n` +
          `<code>/survey\nno_berkas=MST-202608-0001\nnama=Ahmad Fauzi\nnik=3671012345670002\nkecamatan=Karawaci\npendapatan=2500000\npengeluaran=3000000\nrekomendasi=Layak\nprioritas=1\npetugas=Budi Santoso</code>\n\n` +
          `<b>2. Input MPZIS (F-BPP/06):</b>\n` +
          `<code>/mpzis no_berkas=MST-202608-0001 nominal=5000000 tujuan=Bantuan Modal Usaha asnaf=Miskin sumber_dana=Zakat</code>\n\n` +
          `<b>3. Input PPD (F-PKP/03):</b>\n` +
          `<code>/ppd no_berkas=MST-202608-0001 nominal=5000000 rekening=1234567890 bank=BSI atas_nama=Ahmad Fauzi</code>\n\n` +
          `<b>4. Cek Status Pengajuan:</b>\n` +
          `<code>/status MST-202608-0001</code>`,
        { parse_mode: 'HTML' }
      );
    });

    bot.onText(/\/survey(?:\s([\s\S]*))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      try {
        assertTelegramWriteAllowed('survey');
      } catch (err) {
        bot.sendMessage(
          chatId,
          'Layanan bot Telegram untuk input data legacy telah dinonaktifkan setelah cutover Penyaluran P0.',
          { reply_to_message_id: msg.message_id }
        );
        return;
      }
      const text = match[1] || '';

      if (!text.trim()) {
        bot.sendMessage(
          chatId,
          `Silakan kirim data survey dengan format:\n\n` +
            `<code>/survey\nno_berkas=MST-YYYYMM-XXXX (opsional)\nnama=Nama Mustahik\nnik=3671...\nkecamatan=...\npendapatan=...\npengeluaran=...\nrekomendasi=Layak/Tidak/Dipertimbangkan\npetugas=Nama Petugas</code>`,
          { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
        return;
      }

      await handleSurveyText(chatId, text, msg.message_id);
    });

    bot.onText(/\/mpzis(?:\s([\s\S]*))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      try {
        assertTelegramWriteAllowed('mpzis');
      } catch (err) {
        bot.sendMessage(
          chatId,
          'Layanan bot Telegram untuk input data legacy telah dinonaktifkan setelah cutover Penyaluran P0.',
          { reply_to_message_id: msg.message_id }
        );
        return;
      }
      const text = match[1] || '';

      if (!text.trim()) {
        bot.sendMessage(
          chatId,
          `Format: <code>/mpzis no_berkas=MST-YYYYMM-XXXX nominal=5000000 tujuan=... asnaf=... sumber_dana=Zakat</code>`,
          { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
        return;
      }

      await handleMpzisText(chatId, text, msg.message_id);
    });

    bot.onText(/\/ppd(?:\s([\s\S]*))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      try {
        assertTelegramWriteAllowed('ppd');
      } catch (err) {
        bot.sendMessage(
          chatId,
          'Layanan bot Telegram untuk input data legacy telah dinonaktifkan setelah cutover Penyaluran P0.',
          { reply_to_message_id: msg.message_id }
        );
        return;
      }
      const text = match[1] || '';

      if (!text.trim()) {
        bot.sendMessage(
          chatId,
          `Format: <code>/ppd no_berkas=MST-YYYYMM-XXXX nominal=5000000 tujuan=... rekening=... bank=... atas_nama=...</code>`,
          { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
        return;
      }

      await handlePpdText(chatId, text, msg.message_id);
    });

    bot.onText(/\/status\s+(.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const query = match[1].trim();

      try {
        const db = await getDb();
        const data = await db.get(
          'SELECT id, file_no, name, status, program, request_title, approved_amount FROM mustahik WHERE file_no ILIKE $1 OR nik ILIKE $2 OR phone ILIKE $3',
          [query, query, query]
        );

        if (!data) {
          bot.sendMessage(
            chatId,
            `Nomor berkas / NIK <code>${escapeHtml(query)}</code> tidak ditemukan dalam database BAZNAS.`,
            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
          );
          return;
        }

        bot.sendMessage(
          chatId,
          `<b>Status Pengajuan BAZNAS</b>\n\n` +
            `📋 No Berkas: <code>${escapeHtml(data.file_no)}</code>\n` +
            `👤 Nama: <b>${escapeHtml(data.name)}</b>\n` +
            `🏷️ Program: ${escapeHtml(data.program || '-')}\n` +
            `📝 Uraian: ${escapeHtml(data.request_title || '-')}\n` +
            `📊 Status Saat Ini: <b>${escapeHtml(data.status)}</b>` +
            (data.approved_amount ? `\n💰 Nominal: <b>${formatRupiah(data.approved_amount)}</b>` : ''),
          { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
      } catch (err) {
        console.error('Bot status error:', err);
        bot.sendMessage(chatId, 'Terjadi kesalahan saat memeriksa status pengajuan.', { reply_to_message_id: msg.message_id });
      }
    });

    bot.on('photo', async (msg) => {
      const chatId = msg.chat.id;
      try {
        assertTelegramWriteAllowed('survey');
      } catch (err) {
        bot.sendMessage(
          chatId,
          'Layanan bot Telegram untuk input data legacy telah dinonaktifkan setelah cutover Penyaluran P0.',
          { reply_to_message_id: msg.message_id }
        );
        return;
      }
      const caption = msg.caption || '';

      if (!caption.startsWith('/survey')) {
        bot.sendMessage(
          chatId,
          'Kirim foto formulir F-BPP/04 dengan caption <code>/survey no_berkas=MST-YYYYMM-XXXX</code> untuk memproses otomatis menggunakan AI Vision.',
          { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
        return;
      }

      try {
        const match = caption.match(/no_berkas\s*=\s*([^\s]+)/i);
        const fileNo = match ? match[1].trim() : null;

        bot.sendMessage(chatId, 'Sedang memproses foto formulir survey dengan AI Vision...', { reply_to_message_id: msg.message_id });

        const photo = msg.photo[msg.photo.length - 1];
        const fileLink = await bot.getFileLink(photo.file_id);
        const response = await fetch(fileLink);
        const buffer = Buffer.from(await response.arrayBuffer());
        const filename = `survey_${Date.now()}_${photo.file_id}.jpg`;
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, buffer);

        const extracted = await extractSurveyFromImage(filePath);

        if (!extracted || !extracted.name) {
          bot.sendMessage(
            chatId,
            'Maaf, tidak dapat membaca data dari foto secara jelas. Pastikan foto tegak dan cukup cahaya, atau gunakan input teks `/survey`.',
            { reply_to_message_id: msg.message_id }
          );
          return;
        }

        if (fileNo) extracted.file_no = fileNo;

        const mustahikInfo = await upsertMustahikFromSurvey(extracted);
        await addAssessment(mustahikInfo.id, {
          ...extracted,
          photos: [filename],
          survey_method: 'On Location',
          ...workflowExpectationFor(mustahikInfo),
        });

        bot.sendMessage(
          chatId,
          `<b>Foto Form F-BPP/04 Berhasil Diproses!</b>\n\n` +
            `📋 No Berkas: <code>${escapeHtml(mustahikInfo.file_no)}</code>\n` +
            `👤 Nama: <b>${escapeHtml(extracted.name)}</b>\n` +
            `📍 Kecamatan: ${escapeHtml(extracted.kecamatan || '-')}\n` +
            `🏷️ Program: ${escapeHtml(extracted.program || '-')}\n` +
            `📋 Rekomendasi: <b>${escapeHtml(extracted.recommendation || 'Layak')}</b>\n` +
            `⭐ Prioritas: <b>${escapeHtml(extracted.priority || '1')}</b>\n\n` +
            `Data penilaian survey lapangan telah tersimpan di BAZNAS Data Center.`,
          { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
      } catch (err) {
        console.error('Photo processing error:', err);
        bot.sendMessage(chatId, 'Terjadi kesalahan saat memproses foto: ' + escapeHtml(err.message), {
          reply_to_message_id: msg.message_id,
        });
      }
    });

  } catch (initErr) {
    console.warn('Telegram bot initialization skipped / warning:', initErr.message);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function handleSurveyText(chatId, text, messageId) {
  assertTelegramWriteAllowed('survey');
  try {
    if (bot) bot.sendMessage(chatId, 'Sedang menganalisis dan mengekstrak data survey...', { reply_to_message_id: messageId });

    const extracted = await extractSurveyFromText(text);

    if (!extracted.name) {
      if (bot) {
        bot.sendMessage(
          chatId,
          'Tidak dapat menemukan nama mustahik. Pastikan format mengandung `nama=...` atau `pemohon=...`.',
          { reply_to_message_id: messageId }
        );
      }
      return;
    }

    const mustahikInfo = await upsertMustahikFromSurvey(extracted);
    await addAssessment(mustahikInfo.id, {
      ...extracted,
      survey_method: 'On Location',
      ...workflowExpectationFor(mustahikInfo),
    });

    if (bot) {
      bot.sendMessage(
        chatId,
        `<b>Data Assessment Survey (F-BPP/04) Berhasil Disimpan!</b>\n\n` +
          `📋 No Berkas: <code>${escapeHtml(mustahikInfo.file_no)}</code>\n` +
          `👤 Nama: <b>${escapeHtml(extracted.name)}</b>\n` +
          `📍 Kecamatan: ${escapeHtml(extracted.kecamatan || '-')}\n` +
          `🏷️ Program: ${escapeHtml(extracted.program || '-')}\n` +
          `💵 Pendapatan: ${formatRupiah(extracted.monthly_income)}\n` +
          `💸 Pengeluaran: ${formatRupiah(extracted.monthly_expense)}\n` +
          `⚖️ Sisa Pendapatan: ${formatRupiah(extracted.remaining_income)}\n` +
          `📋 Rekomendasi: <b>${escapeHtml(extracted.recommendation || 'Layak')}</b>\n` +
          `⭐ Prioritas: <b>${escapeHtml(extracted.priority || '1')}</b>\n` +
          `📊 Status: <b>Survey</b>`,
        { parse_mode: 'HTML', reply_to_message_id: messageId }
      );
    }
  } catch (err) {
    console.error('Survey text error:', err);
    if (bot) bot.sendMessage(chatId, 'Terjadi kesalahan: ' + escapeHtml(err.message), { reply_to_message_id: messageId });
  }
}

export async function handleMpzisText(chatId, text, messageId) {
  assertTelegramWriteAllowed('mpzis');
  try {
    const parsed = fallbackParseLines(text);
    const fileNo = parsed.no_berkas || parsed.file_no;
    const mustahik = fileNo ? await getMustahikByFileNo(fileNo) : null;

    if (!mustahik) {
      if (bot) {
        bot.sendMessage(
          chatId,
          `Nomor berkas <code>${escapeHtml(fileNo || '-')}</code> tidak ditemukan dalam database.`,
          { parse_mode: 'HTML', reply_to_message_id: messageId }
        );
      }
      return;
    }

    const nominal = parseFloat((parsed.nominal || parsed.total_amount || '0').replace(/[^0-9]/g, '')) || 0;

    await addMpzis({
      mustahik_id: mustahik.id,
      ...workflowExpectationFor(mustahik),
      form_number: parsed.form_number || '',
      mpzis_date: parsed.tanggal || new Date().toISOString().split('T')[0],
      program_classification: parsed.klasifikasi || mustahik.program,
      purpose: parsed.tujuan || parsed.purpose || mustahik.request_title,
      asnaf: parsed.asnaf || mustahik.asnaf,
      fund_source: parsed.sumber_dana || mustahik.fund_source || 'Zakat',
      recipient_name: parsed.penerima || mustahik.name,
      recipient_type: parsed.tipe_penerima || mustahik.applicant_status || 'Perorangan',
      beneficiary_count: parseInt((parsed.jumlah_penerima || '1').replace(/[^0-9]/g, ''), 10) || mustahik.beneficiary_count || 1,
      total_amount: nominal,
      proposed_by: parsed.diajukan_oleh || 'Staff BPP',
      examined_by: parsed.diperiksa_oleh || 'Kabid Pendistribusian',
      ashnaf_verifier: parsed.verifikator || 'Tim Verifikasi',
      responsible: parsed.penanggungjawab || 'Waka II',
      approved_by: parsed.disetujui_oleh || 'Ketua BAZNAS',
    });

    if (bot) {
      bot.sendMessage(
        chatId,
        `<b>Data Persetujuan MPZIS (F-BPP/06) Berhasil Disimpan!</b>\n\n` +
          `📋 No Berkas: <code>${escapeHtml(mustahik.file_no)}</code>\n` +
          `👤 Penerima: <b>${escapeHtml(mustahik.name)}</b>\n` +
          `💰 Nominal Disetujui: <b>${formatRupiah(nominal)}</b>\n` +
          `📝 Tujuan: ${escapeHtml(parsed.tujuan || mustahik.request_title || '-')}\n` +
          `📊 Status: <b>Persetujuan MPZIS</b>`,
        { parse_mode: 'HTML', reply_to_message_id: messageId }
      );
    }
  } catch (err) {
    console.error('MPZIS error:', err);
    if (bot) bot.sendMessage(chatId, 'Terjadi kesalahan: ' + escapeHtml(err.message), { reply_to_message_id: messageId });
  }
}

export async function handlePpdText(chatId, text, messageId) {
  assertTelegramWriteAllowed('ppd');
  try {
    const parsed = fallbackParseLines(text);
    const fileNo = parsed.no_berkas || parsed.file_no;
    const mustahik = fileNo ? await getMustahikByFileNo(fileNo) : null;

    if (!mustahik) {
      if (bot) {
        bot.sendMessage(
          chatId,
          `Nomor berkas <code>${escapeHtml(fileNo || '-')}</code> tidak ditemukan dalam database.`,
          { parse_mode: 'HTML', reply_to_message_id: messageId }
        );
      }
      return;
    }

    const nominal = parseFloat((parsed.nominal || parsed.jumlah_dana || '0').replace(/[^0-9]/g, '')) || 0;

    await addPpd({
      mustahik_id: mustahik.id,
      ...workflowExpectationFor(mustahik),
      form_number: parsed.form_number || '',
      ppd_number: parsed.no_ppd || parsed.ppd_number || '',
      transaction_number: parsed.no_transaksi || '',
      requester_name: parsed.pemohon || 'Staff Pendistribusian',
      requester_role: parsed.jabatan || 'Pelaksana BPP',
      requester_department: parsed.bidang || 'Bidang Pendistribusian & Pendayagunaan',
      amount: nominal,
      amount_in_words: parsed.terbilang || '',
      purpose: parsed.tujuan || parsed.purpose || mustahik.request_title,
      fund_source: parsed.sumber_dana ? [parsed.sumber_dana] : [mustahik.fund_source || 'Zakat'],
      bank_account_info: `${parsed.rekening || mustahik.bank_account || ''} ${parsed.bank || mustahik.bank_name || ''} a.n ${parsed.atas_nama || mustahik.bank_account_name || mustahik.name}`.trim(),
      payment_type: parsed.jenis_pembayaran || 'Transfer',
      disbursement_date: parsed.tanggal_cair || parsed.disbursement_date || null
    });

    if (bot) {
      bot.sendMessage(
        chatId,
        `<b>Data Formulir Pengajuan Dana (FPD/PPD) Berhasil Disimpan!</b>\n\n` +
          `📋 No Berkas: <code>${escapeHtml(mustahik.file_no)}</code>\n` +
          `👤 Penerima: <b>${escapeHtml(mustahik.name)}</b>\n` +
          `💰 Jumlah Dana: <b>${formatRupiah(nominal)}</b>\n` +
          `💳 Rekening: ${escapeHtml(parsed.rekening || mustahik.bank_account || '-')}\n` +
          `📊 Status: <b>Pengajuan Dana (FPD)</b>`,
        { parse_mode: 'HTML', reply_to_message_id: messageId }
      );
    }
  } catch (err) {
    console.error('PPD error:', err);
    if (bot) bot.sendMessage(chatId, 'Terjadi kesalahan: ' + escapeHtml(err.message), { reply_to_message_id: messageId });
  }
}

export async function upsertMustahikFromSurvey(data) {
  assertTelegramWriteAllowed('survey');
  let mustahik = null;
  if (data.file_no) {
    mustahik = await getMustahikByFileNo(data.file_no);
  }

  if (!mustahik && data.nik) {
    const db = await getDb();
    mustahik = await db.get('SELECT * FROM mustahik WHERE nik = $1', [data.nik]);
  }

  const status = normalizeStatus(data.status) || 'Survey';
  const monthlyInc = data.monthly_income !== null && data.monthly_income !== undefined ? parseFloat(data.monthly_income) : 0;
  const monthlyExp = data.monthly_expense !== null && data.monthly_expense !== undefined ? parseFloat(data.monthly_expense) : 0;
  const remInc = data.remaining_income !== null && data.remaining_income !== undefined ? parseFloat(data.remaining_income) : (monthlyInc - monthlyExp);

  const payload = {
    file_no: data.file_no || (mustahik ? mustahik.file_no : await generateNextFileNo()),
    received_date: data.received_date || new Date().toISOString().split('T')[0],
    name: data.name,
    applicant_status: data.applicant_status || 'Perorangan',
    beneficiary_name: data.beneficiary_name || data.name,
    nik: data.nik || '',
    kk_number: data.kk_number || '',
    phone: data.phone || '',
    marital_status: data.marital_status || '',
    pob: data.pob || '',
    dob: data.dob || '',
    occupation: data.occupation || '',
    work_place: data.work_place || '',
    education_level: data.education_level || '',
    address: data.address || '',
    rt_rw: data.rt_rw || '',
    kelurahan: data.kelurahan || '',
    kecamatan: data.kecamatan || '',
    kabupaten_kota: data.kabupaten_kota || 'Kota Tangerang',
    province: data.province || 'Banten',
    survey_date: data.survey_date || new Date().toISOString().split('T')[0],
    surveyor_name: data.surveyor_name || '',
    surveyor_phone: data.surveyor_phone || '',
    house_ownership: data.house_ownership || 'Sendiri',
    family_dependents: data.family_dependents !== null && data.family_dependents !== undefined ? parseInt(data.family_dependents, 10) : 0,
    monthly_income: monthlyInc,
    monthly_expense: monthlyExp,
    remaining_income: remInc,
    survey_recommendation: data.recommendation || 'Layak',
    survey_notes: data.notes || '',
    priority: data.priority ? String(data.priority) : '1',
    recommended_amount: data.recommended_amount !== null && data.recommended_amount !== undefined ? parseFloat(data.recommended_amount) : 0,
    asnaf: data.asnaf || 'Fakir Miskin',
    fund_source: data.fund_source || 'Zakat',
    program: data.program || 'Kemanusiaan',
    request_title: data.request_title || 'Permohonan Bantuan BAZNAS',
    status,
    house_index: data.house_index !== null && data.house_index !== undefined ? parseInt(data.house_index, 10) : null,
    asset_index: data.asset_index !== null && data.asset_index !== undefined ? parseInt(data.asset_index, 10) : null,
    income_index: data.income_index !== null && data.income_index !== undefined ? parseInt(data.income_index, 10) : null,
    spiritual_score: data.spiritual_score !== null && data.spiritual_score !== undefined ? parseInt(data.spiritual_score, 10) : null,
    overall_score: data.overall_score !== null && data.overall_score !== undefined ? parseFloat(data.overall_score) : null,
    desil_score: data.desil_score !== null && data.desil_score !== undefined ? parseInt(data.desil_score, 10) : null,
  };

  const isNew = !mustahik;
  if (mustahik) {
    const updatePayload = { ...payload };
    delete updatePayload.status;
    await updateMustahik(mustahik.id, updatePayload);
  } else {
    payload.status = 'Diajukan';
    const newId = await createMustahik(payload);
    mustahik = { id: newId, file_no: payload.file_no, status: 'Diajukan', workflow_version: 0 };
  }

  const current = await getDb().then((db) => db.get('SELECT * FROM mustahik WHERE id = $1', [mustahik.id]));
  if (normalizeStatus(current.status) === 'Diajukan') {
    await submitMustahikDecision(
      current.id,
      {
        action: 'approve',
        target_status: 'Verifikasi Administrasi',
        notes: 'Verifikasi administrasi dilakukan melalui input survey Telegram.',
        expected_status: current.status,
        expected_version: Number(current.workflow_version || 0),
      },
      { name: 'Telegram Bot', role: 'system', level: 'system', division: 'Penyaluran' },
    );
  }

  const latest = await getDb().then((db) => db.get('SELECT * FROM mustahik WHERE id = $1', [mustahik.id]));
  return {
    id: latest.id,
    file_no: latest.file_no,
    is_new: isNew,
    status: latest.status,
    workflow_version: Number(latest.workflow_version || 0),
  };
}

function fallbackParseLines(text) {
  const result = {};
  const lines = text.split('\n');
  for (const line of lines) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

function formatRupiah(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return 'Rp -';
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

export default bot;
