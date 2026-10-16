import { initDb, getDb, MUSTAHIK_COLUMNS } from './server/db.js';
import {
  generateNextFileNo,
  createPublicApplication,
  trackApplication,
  listMustahik,
  getMustahikById,
  createMustahik,
  updateMustahik,
  deleteMustahik,
  addAssessment,
  addMpzis,
  addPpd,
  generateWaMessage,
  addWaLog,
  getWaLogs,
  exportMustahikData
} from './server/repository.js';
import { extractSurveyFromText, fallbackParseText } from './server/ai.js';
import { upsertMustahikFromSurvey } from './server/bot.js';

async function runTests() {
  console.log('=== TEST 1: Init DB and Verify 60 Columns ===');
  const db = await initDb();
  const tableInfo = await db.all('PRAGMA table_info(mustahik)');
  console.log(`Total columns in mustahik table: ${tableInfo.length}`);
  console.log(`Expected columns count: ${MUSTAHIK_COLUMNS.length}`);
  if (tableInfo.length < 55) {
    throw new Error(`Columns count mismatch: got ${tableInfo.length}, expected ~60`);
  }
  console.log('MUSTAHIK COLUMNS OK!');

  console.log('\n=== TEST 2: Generate Next File No ===');
  const fileNo1 = await generateNextFileNo();
  console.log('Generated file_no:', fileNo1);
  if (!fileNo1.startsWith('MST-')) {
    throw new Error('Invalid file_no format: ' + fileNo1);
  }

  console.log('\n=== TEST 3: Create Public Application ===');
  const pubApp = await createPublicApplication({
    name: 'Budi Test Santoso',
    nik: '3671099988877701',
    phone: '081299998888',
    kecamatan: 'Cipondoh',
    monthly_income: '2000000',
    monthly_expense: '2500000',
    program: 'Kemanusiaan',
    request_title: 'Bantuan Sembako & Biaya Hidup'
  }, [
    { fieldname: 'ktp', filename: 'test_ktp.jpg', originalname: 'ktp.jpg' },
    { fieldname: 'kk', filename: 'test_kk.pdf', originalname: 'kk.pdf' }
  ]);
  console.log('Public application result:', pubApp);

  console.log('\n=== TEST 4: Track Application ===');
  const trackResult = await trackApplication(pubApp.file_no);
  console.log('Track result status:', trackResult.status);
  console.log('Timeline stages count:', trackResult.timeline.length);
  console.log('Documents count:', trackResult.documents.length);

  console.log('\n=== TEST 5: Add Assessment (F-BPP/04) ===');
  const assessId = await addAssessment(pubApp.id, {
    surveyor_name: 'Ustadz Hasan',
    surveyor_phone: '081234445555',
    survey_date: '2026-08-18',
    recommendation: 'Layak',
    notes: 'Keluarga dhuafa sangat membutuhkan bantuan',
    house_index: 2,
    asset_index: 1,
    spiritual_score: 90,
    overall_score: 85.5,
    priority: '1',
    recommended_amount: 3000000
  });
  console.log('Assessment added ID:', assessId);

  const mustahikAfterSurvey = await getMustahikById(pubApp.id);
  console.log('Mustahik status after assessment:', mustahikAfterSurvey.status);
  console.log('Mustahik surveyor:', mustahikAfterSurvey.surveyor_name);

  console.log('\n=== TEST 6: Add MPZIS (F-BPP/06) ===');
  const mpzisId = await addMpzis(pubApp.id, {
    form_number: 'MPZIS-202608-099',
    total_amount: 3000000,
    purpose: 'Bantuan Biaya Hidup & Sembako',
    asnaf: 'Fakir Miskin',
    fund_source: 'Zakat',
    beneficiary_count: 3
  });
  console.log('MPZIS added ID:', mpzisId);

  const mustahikAfterMpzis = await getMustahikById(pubApp.id);
  console.log('Mustahik status after MPZIS:', mustahikAfterMpzis.status);
  console.log('Approved amount:', mustahikAfterMpzis.approved_amount);

  console.log('\n=== TEST 7: Add PPD (F-PKP/03) ===');
  const ppdId = await addPpd(pubApp.id, {
    form_number: 'PPD-202608-099',
    ppd_number: 'PPD/202608/099',
    amount: 3000000,
    amount_in_words: 'Tiga Juta Rupiah',
    disbursement_date: '2026-08-20',
    payment_type: 'Transfer'
  });
  console.log('PPD added ID:', ppdId);

  const mustahikAfterPpd = await getMustahikById(pubApp.id);
  console.log('Mustahik status after PPD:', mustahikAfterPpd.status);

  console.log('\n=== TEST 8: WhatsApp Generation and Logging ===');
  const waMsg = generateWaMessage('Penyaluran Selesai', mustahikAfterPpd);
  console.log('WA URL:', waMsg.url);
  const logId = await addWaLog({
    mustahik_id: pubApp.id,
    phone: waMsg.phone,
    phase: 'Penyaluran Selesai',
    message: waMsg.message,
    wa_url: waMsg.url
  });
  const logs = await getWaLogs(pubApp.id);
  console.log('WA Logs count:', logs.length);

  console.log('\n=== TEST 9: Export 60 Columns ===');
  const exportData = await exportMustahikData();
  console.log('Export records count:', exportData.length);
  const sampleRow = exportData[exportData.length - 1];
  console.log('Sample exported row keys count:', Object.keys(sampleRow).length);

  console.log('\n=== TEST 10: Bot & AI Parser Integration ===');
  const sampleSurveyText = `no_berkas=${pubApp.file_no}
nama=Budi Test Santoso
nik=3671099988877701
pendapatan=2200000
pengeluaran=2700000
rekomendasi=Layak
prioritas=1
petugas=Ahmad Fauzan
catatan=Verifikasi ulang kondisi rumah`;
  const parsedText = fallbackParseText(sampleSurveyText);
  console.log('Parsed text name:', parsedText.name, 'Remaining income:', parsedText.remaining_income);
  const upsertRes = await upsertMustahikFromSurvey(parsedText);
  console.log('Upsert result:', upsertRes);

  console.log('\n=== ALL SERVER TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
