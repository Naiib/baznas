import { Ollama } from 'ollama';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'https://ollama.com';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'kimi-k2.6';

let ollamaClient = null;

export function getOllamaClient() {
  if (!ollamaClient) {
    const headers = OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : {};
    ollamaClient = new Ollama({ host: OLLAMA_HOST, headers });
  }
  return ollamaClient;
}

export async function extractSurveyFromText(text) {
  const client = getOllamaClient();
  const prompt = `Kamu adalah asisten AI untuk BAZNAS. Ekstrak data hasil survey mustahik (Form F-BPP/04) dari teks berikut dan kembalikan HANYA dalam format JSON valid tanpa penjelasan tambahan.

Teks input:
"""
${text}
"""

Schema JSON yang diinginkan:
{
  "file_no": "nomor berkas (contoh: MST-202608-0001)",
  "name": "nama mustahik / pemohon",
  "applicant_status": "Perorangan / Lembaga",
  "beneficiary_name": "nama penerima manfaat",
  "nik": "nomor NIK KTP (16 digit)",
  "kk_number": "nomor Kartu Keluarga",
  "phone": "nomor telepon/HP mustahik",
  "marital_status": "Kawin / Belum Kawin / Janda / Duda",
  "pob": "tempat lahir",
  "dob": "tanggal lahir (YYYY-MM-DD)",
  "occupation": "pekerjaan",
  "work_place": "tempat kerja",
  "education_level": "SD / SMP / SMA / D3 / S1",
  "address": "alamat lengkap",
  "rt_rw": "RT/RW",
  "kelurahan": "kelurahan/desa",
  "kecamatan": "kecamatan",
  "kabupaten_kota": "kabupaten/kota",
  "province": "provinsi",
  "house_ownership": "Menumpang / Kontrak / Keluarga / Sendiri",
  "family_dependents": 0,
  "monthly_income": 0,
  "monthly_expense": 0,
  "remaining_income": 0,
  "asnaf": "Fakir / Miskin / Amil / Mualaf / Riqab / Gharimin / Fisabilillah / Ibnu Sabil",
  "fund_source": "Zakat / Infak",
  "program": "Kemanusiaan / Pendidikan / Kesehatan / Ekonomi / Dakwah & Advokasi",
  "request_title": "uraian singkat permohonan bantuan",
  "surveyor_name": "nama petugas survey",
  "surveyor_phone": "nomor hp petugas survey",
  "survey_date": "YYYY-MM-DD",
  "recommendation": "Layak / Tidak / Dipertimbangkan",
  "priority": "1 / 2 / 3 / Tidak Layak",
  "recommended_amount": 0,
  "notes": "catatan hasil survey",
  "house_index": 0,
  "asset_index": 0,
  "income_index": 0,
  "spiritual_score": 0,
  "overall_score": 0,
  "desil_score": 1
}

Gunakan null atau string kosong untuk field yang tidak ditemukan. Pastikan JSON valid dan bisa diparse.`;

  try {
    const response = await client.chat({
      model: OLLAMA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { temperature: 0.1 },
    });

    const content = response.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response');
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return mergeWithFallback(parsed, text);
  } catch (err) {
    console.error('Ollama text extraction failed, fallback to manual parse:', err.message);
    return fallbackParseText(text);
  }
}

export async function extractSurveyFromImage(imagePath) {
  const client = getOllamaClient();
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const prompt = `Kamu adalah asisten AI untuk BAZNAS. Analisis gambar formulir hasil survey mustahik (F-BPP/04) dan ekstrak seluruh data. Kembalikan HANYA dalam format JSON valid tanpa teks lain.

Schema JSON:
{
  "file_no": "nomor berkas jika ada",
  "name": "nama mustahik / pemohon",
  "applicant_status": "Perorangan / Lembaga",
  "beneficiary_name": "nama penerima",
  "nik": "nomor KTP",
  "kk_number": "nomor KK",
  "phone": "nomor hp",
  "marital_status": "status pernikahan",
  "pob": "tempat lahir",
  "dob": "tanggal lahir",
  "occupation": "pekerjaan",
  "education_level": "pendidikan",
  "address": "alamat lengkap",
  "rt_rw": "RT/RW",
  "kelurahan": "kelurahan",
  "kecamatan": "kecamatan",
  "kabupaten_kota": "kabupaten/kota",
  "province": "provinsi",
  "house_ownership": "Menumpang / Kontrak / Keluarga / Sendiri",
  "family_dependents": 0,
  "monthly_income": 0,
  "monthly_expense": 0,
  "remaining_income": 0,
  "asnaf": "asnaf",
  "program": "program bantuan",
  "request_title": "uraian permohonan",
  "surveyor_name": "petugas survey",
  "surveyor_phone": "hp petugas",
  "survey_date": "YYYY-MM-DD",
  "recommendation": "Layak / Tidak / Dipertimbangkan",
  "priority": "1 / 2 / 3",
  "recommended_amount": 0,
  "notes": "catatan survey",
  "house_index": 0,
  "asset_index": 0,
  "income_index": 0,
  "spiritual_score": 0,
  "overall_score": 0,
  "desil_score": 1
}

Gunakan null atau string kosong untuk field yang tidak terbaca.`;

  try {
    const response = await client.chat({
      model: OLLAMA_MODEL,
      messages: [{ role: 'user', content: prompt, images: [base64Image] }],
      stream: false,
      options: { temperature: 0.1 },
    });

    const content = response.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM image response');
    }
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Ollama image extraction failed:', err.message);
    return null;
  }
}

export function fallbackParseText(text) {
  const result = {
    file_no: '',
    name: '',
    applicant_status: 'Perorangan',
    beneficiary_name: '',
    nik: '',
    kk_number: '',
    phone: '',
    marital_status: '',
    pob: '',
    dob: '',
    occupation: '',
    work_place: '',
    education_level: '',
    address: '',
    rt_rw: '',
    kelurahan: '',
    kecamatan: '',
    kabupaten_kota: 'Kota Tangerang',
    province: 'Banten',
    house_ownership: 'Sendiri',
    family_dependents: null,
    monthly_income: null,
    monthly_expense: null,
    remaining_income: null,
    asnaf: 'Fakir Miskin',
    fund_source: 'Zakat',
    program: 'Kemanusiaan',
    request_title: '',
    surveyor_name: '',
    surveyor_phone: '',
    survey_date: '',
    recommendation: 'Layak',
    priority: '',
    recommended_amount: null,
    notes: '',
    house_index: null,
    asset_index: null,
    income_index: null,
    spiritual_score: null,
    overall_score: null,
    desil_score: null,
    status: 'Survey',
  };

  const lines = text.split('\n');
  for (const line of lines) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase().replace(/\s+/g, '_');
    const value = line.slice(idx + 1).trim();

    switch (key) {
      case 'no_berkas':
      case 'file_no':
      case 'nomor_berkas':
        result.file_no = value;
        break;
      case 'nama':
      case 'name':
      case 'pemohon':
        result.name = value;
        if (!result.beneficiary_name) result.beneficiary_name = value;
        break;
      case 'penerima':
      case 'beneficiary_name':
        result.beneficiary_name = value;
        break;
      case 'status_pemohon':
      case 'applicant_status':
        result.applicant_status = value;
        break;
      case 'nik':
      case 'no_ktp':
        result.nik = value;
        break;
      case 'kk':
      case 'no_kk':
      case 'kk_number':
        result.kk_number = value;
        break;
      case 'hp':
      case 'phone':
      case 'no_hp':
      case 'telepon':
        result.phone = value;
        break;
      case 'status_nikah':
      case 'marital_status':
      case 'status_pernikahan':
        result.marital_status = value;
        break;
      case 'tempat_lahir':
      case 'pob':
        result.pob = value;
        break;
      case 'tanggal_lahir':
      case 'tgl_lahir':
      case 'dob':
        result.dob = value;
        break;
      case 'pekerjaan':
      case 'occupation':
        result.occupation = value;
        break;
      case 'tempat_kerja':
      case 'work_place':
        result.work_place = value;
        break;
      case 'pendidikan':
      case 'education_level':
        result.education_level = value;
        break;
      case 'alamat':
      case 'address':
        result.address = value;
        break;
      case 'rt_rw':
      case 'rt/rw':
        result.rt_rw = value;
        break;
      case 'kelurahan':
      case 'desa':
        result.kelurahan = value;
        break;
      case 'kecamatan':
        result.kecamatan = value;
        break;
      case 'kabupaten':
      case 'kota':
      case 'kabupaten_kota':
        result.kabupaten_kota = value;
        break;
      case 'provinsi':
      case 'province':
        result.province = value;
        break;
      case 'program':
      case 'jenis_bantuan':
      case 'bantuan':
        result.program = value;
        break;
      case 'uraian':
      case 'request_title':
      case 'pengajuan':
      case 'judul':
        result.request_title = value;
        break;
      case 'asnaf':
      case 'golongan':
        result.asnaf = value;
        break;
      case 'sumber_dana':
      case 'fund_source':
        result.fund_source = value;
        break;
      case 'pendapatan':
      case 'penghasilan':
      case 'monthly_income':
      case 'gaji':
        result.monthly_income = parseFloat(value.replace(/[^0-9]/g, '')) || null;
        break;
      case 'pengeluaran':
      case 'monthly_expense':
        result.monthly_expense = parseFloat(value.replace(/[^0-9]/g, '')) || null;
        break;
      case 'sisa_pendapatan':
      case 'remaining_income':
        result.remaining_income = parseFloat(value.replace(/[^0-9]/g, '')) || null;
        break;
      case 'tanggungan':
      case 'family_dependents':
      case 'jumlah_tanggungan':
        result.family_dependents = parseInt(value.replace(/[^0-9]/g, ''), 10) || null;
        break;
      case 'rumah':
      case 'house_ownership':
      case 'kepemilikan_rumah':
        result.house_ownership = value;
        break;
      case 'rekomendasi':
      case 'recommendation':
      case 'survey_recommendation':
        result.recommendation = value;
        break;
      case 'prioritas':
      case 'priority':
        result.priority = value;
        break;
      case 'nominal_rekomendasi':
      case 'recommended_amount':
        result.recommended_amount = parseFloat(value.replace(/[^0-9]/g, '')) || null;
        break;
      case 'surveyor':
      case 'petugas':
      case 'surveyor_name':
        result.surveyor_name = value;
        break;
      case 'hp_petugas':
      case 'surveyor_phone':
        result.surveyor_phone = value;
        break;
      case 'tanggal_survey':
      case 'tgl_survey':
      case 'survey_date':
        result.survey_date = value;
        break;
      case 'catatan':
      case 'notes':
      case 'survey_notes':
        result.notes = value;
        break;
      case 'desil':
      case 'desil_score':
        result.desil_score = parseInt(value.replace(/[^0-9]/g, ''), 10) || null;
        break;
      case 'skor_spiritual':
      case 'spiritual_score':
        result.spiritual_score = parseInt(value.replace(/[^0-9]/g, ''), 10) || null;
        break;
      case 'skor_total':
      case 'overall_score':
        result.overall_score = parseFloat(value.replace(/[^0-9.]/g, '')) || null;
        break;
      case 'status':
        result.status = normalizeStatus(value);
        break;
    }
  }

  if (result.monthly_income !== null && result.monthly_expense !== null && result.remaining_income === null) {
    result.remaining_income = result.monthly_income - result.monthly_expense;
  }

  return result;
}

function mergeWithFallback(llmResult, text) {
  const fallback = fallbackParseText(text);
  const combined = { ...fallback, ...llmResult };

  // Ensure calculations
  if (combined.monthly_income && combined.monthly_expense && !combined.remaining_income) {
    combined.remaining_income = combined.monthly_income - combined.monthly_expense;
  }

  return combined;
}

export function normalizeStatus(statusText) {
  const s = (statusText || '').toLowerCase();
  if (s.includes('tolak')) return 'Ditolak';
  if (s.includes('selesai') || s.includes('salur')) return 'Penyaluran Selesai';
  if (s.includes('fpd') || s.includes('ppd') || s.includes('dana') || s.includes('cair')) return 'Pengajuan Dana (FPD)';
  if (s.includes('mpzis') || s.includes('setuju') || s.includes('persetujuan')) return 'Persetujuan MPZIS';
  if (s.includes('survey')) return 'Survey';
  if (s.includes('verifikasi') || s.includes('administrasi')) return 'Verifikasi Administrasi';
  return 'Diajukan';
}
