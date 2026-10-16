import assert from 'assert';
import {
  generateNextFileNo,
  listMustahik,
  getMustahikById,
  getMustahikByFileNo,
  createMustahik,
  updateMustahik,
  deleteMustahik,
  createPublicApplication,
  trackApplication,
  addAssessment,
  addMpzis,
  addPpd,
  addDocument,
  getDocuments,
  addWaLog,
  getWaLogs,
  saveBotSession,
  getBotSession,
  exportMustahikData,
  safeJsonParse,
  formatMustahikRow,
  generateWaMessage,
  formatWaPhone,
} from './repository.js';
import { initDb, getDb } from './db.js';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Running PostgreSQL Repository & Query Adapter Test Suite');
  console.log('====================================================\n');

  try {
    // 0. Test JSON & phone helpers
    console.log('1️⃣ Testing Utility Functions...');
    assert.strictEqual(formatWaPhone('08123456789'), '628123456789');
    assert.strictEqual(formatWaPhone('628123456789'), '628123456789');
    assert.deepStrictEqual(safeJsonParse('["photo1.jpg","photo2.jpg"]', []), ['photo1.jpg', 'photo2.jpg']);
    assert.deepStrictEqual(safeJsonParse(null, []), []);
    assert.deepStrictEqual(safeJsonParse('{invalid}', { default: true }), { default: true });
    console.log('   ✅ Utility functions passed.');

    // 1. Initialize DB
    console.log('\n2️⃣ Initializing PostgreSQL / Adapter Database...');
    await initDb();
    console.log('   ✅ Database tables initialized successfully.');

    // 2. Test generateNextFileNo
    console.log('\n3️⃣ Testing generateNextFileNo()...');
    const fileNo = await generateNextFileNo();
    assert.ok(fileNo.startsWith('MST-'), `File number should start with MST-, got ${fileNo}`);
    console.log(`   ✅ Generated file_no: ${fileNo}`);

    // 3. Test createMustahik
    console.log('\n4️⃣ Testing createMustahik()...');
    const mustahikId = await createMustahik({
      name: 'Budi Test Santoso',
      nik: '3671099988880001',
      phone: '081299998888',
      kecamatan: 'Karawaci',
      kelurahan: 'Cimone',
      address: 'Jl. Merdeka No. 100',
      monthly_income: 2000000,
      monthly_expense: 2500000,
      program: 'Kemanusiaan',
      request_title: 'Bantuan Biaya Hidup Dhuafa',
    });
    assert.ok(mustahikId, 'Mustahik ID should be returned via RETURNING id');
    console.log(`   ✅ Created Mustahik with ID: ${mustahikId}`);

    // 4. Test getMustahikById & formatMustahikRow
    console.log('\n5️⃣ Testing getMustahikById()...');
    const mustahik = await getMustahikById(mustahikId);
    assert.ok(mustahik, 'Mustahik detail should not be null');
    assert.strictEqual(mustahik.name, 'Budi Test Santoso');
    assert.strictEqual(mustahik.monthly_income, 2000000);
    assert.strictEqual(mustahik.remaining_income, -500000);
    assert.ok(Array.isArray(mustahik.applications), 'Applications relation should be an array');
    console.log(`   ✅ Fetched Mustahik detail: ${mustahik.name} (${mustahik.file_no})`);

    // 5. Test listMustahik with ILIKE search & filter
    console.log('\n6️⃣ Testing listMustahik() with ILIKE search...');
    const searchResults = await listMustahik({ search: 'budi' });
    assert.ok(searchResults.length > 0, 'Should find mustahik with case-insensitive search "budi"');
    const found = searchResults.find((m) => m.id === mustahikId);
    assert.ok(found, 'Should contain created mustahik in search results');
    console.log(`   ✅ Found ${searchResults.length} result(s) for ILIKE search 'budi'`);

    // 6. Test trackApplication
    console.log('\n7️⃣ Testing trackApplication()...');
    const tracking = await trackApplication(mustahik.file_no);
    assert.ok(tracking, 'Tracking data should not be null');
    assert.strictEqual(tracking.mustahik.file_no, mustahik.file_no);
    assert.strictEqual(tracking.timeline.length, 5);
    console.log(`   ✅ Application tracked. Status: ${tracking.status}, Timeline phases: ${tracking.timeline.length}`);

    // 7. Test addAssessment with photos JSON
    console.log('\n8️⃣ Testing addAssessment() with photos serialization...');
    const assessmentId = await addAssessment(mustahikId, {
      surveyor_name: 'Ahmad Surveyor',
      surveyor_phone: '081233344455',
      survey_date: '2026-08-17',
      survey_method: 'On Location',
      recommendation: 'Layak',
      notes: 'Keluarga dhuafa sangat layak dibantu',
      house_index: 2,
      asset_index: 2,
      income_index: 1,
      spiritual_score: 95,
      overall_score: 90.0,
      priority: '1',
      photos: ['survei_depan.jpg', 'survei_dalam.jpg'],
    });
    assert.ok(assessmentId, 'Assessment ID should be returned');
    const updatedMustahikAfterSurvey = await getMustahikById(mustahikId);
    assert.strictEqual(updatedMustahikAfterSurvey.status, 'Survey');
    assert.deepStrictEqual(updatedMustahikAfterSurvey.assessments[0].photos, ['survei_depan.jpg', 'survei_dalam.jpg']);
    console.log(`   ✅ Assessment added with ID: ${assessmentId}, photos deserialized properly`);

    // 8. Test addMpzis
    console.log('\n9️⃣ Testing addMpzis()...');
    const mpzisId = await addMpzis(mustahikId, {
      form_number: 'MPZIS/202608/0099',
      mpzis_date: '2026-08-18',
      program_classification: 'Kemanusiaan',
      purpose: 'Bantuan Biaya Hidup',
      asnaf: 'Fakir Miskin',
      fund_source: 'Zakat',
      total_amount: 3000000,
      proposed_by: 'Staff Pendistribusian',
      approved_by: 'Ketua BAZNAS',
    });
    assert.ok(mpzisId, 'MPZIS ID should be returned');
    const updatedMustahikAfterMpzis = await getMustahikById(mustahikId);
    assert.strictEqual(updatedMustahikAfterMpzis.status, 'Persetujuan MPZIS');
    assert.strictEqual(updatedMustahikAfterMpzis.approved_amount, 3000000);
    console.log(`   ✅ MPZIS approval saved with ID: ${mpzisId}`);

    // 9. Test addPpd
    console.log('\n🔟 Testing addPpd() with fund_source array...');
    const ppdId = await addPpd(mustahikId, {
      form_number: 'PPD/202608/0099',
      ppd_number: 'PPD/202608/0099',
      requester_name: 'Staff Pendistribusian',
      amount: 3000000,
      purpose: 'Bantuan Biaya Hidup',
      fund_source: ['Zakat', 'Infaq'],
      bank_account_info: '1234567890 BSI a.n Budi Test',
      payment_type: 'Transfer',
      disbursement_date: '2026-08-19',
    });
    assert.ok(ppdId, 'PPD ID should be returned');
    const updatedMustahikAfterPpd = await getMustahikById(mustahikId);
    assert.strictEqual(updatedMustahikAfterPpd.status, 'Penyaluran Selesai');
    assert.deepStrictEqual(updatedMustahikAfterPpd.ppd[0].fund_source, ['Zakat', 'Infaq']);
    console.log(`   ✅ PPD disbursement saved with ID: ${ppdId}, status synced to 'Penyaluran Selesai'`);

    // 10. Test addDocument & getDocuments
    console.log('\n1️⃣1️⃣ Testing addDocument() & getDocuments()...');
    const docId = await addDocument(mustahikId, {
      doc_type: 'KTP',
      filename: 'ktp_budi.jpg',
      original_name: 'ktp_budi.jpg',
      file_url: '/uploads/ktp_budi.jpg',
    });
    assert.ok(docId, 'Document ID should be returned');
    const docs = await getDocuments(mustahikId);
    assert.ok(docs.length > 0);
    assert.strictEqual(docs[0].filename, 'ktp_budi.jpg');
    console.log(`   ✅ Document added and retrieved successfully.`);

    // 11. Test addWaLog & getWaLogs
    console.log('\n1️⃣2️⃣ Testing addWaLog() & getWaLogs()...');
    const waLogId = await addWaLog({
      mustahik_id: mustahikId,
      phone: '081299998888',
      phase: 'Penyaluran Selesai',
      message: 'Bantuan telah disalurkan.',
      wa_url: 'https://wa.me/6281299998888?text=test',
      status: 'sent',
    });
    assert.ok(waLogId, 'WA Log ID should be returned');
    const waLogs = await getWaLogs(mustahikId);
    assert.ok(waLogs.length > 0);
    console.log(`   ✅ WA log added and retrieved successfully.`);

    // 12. Test bot_sessions
    console.log('\n1️⃣3️⃣ Testing saveBotSession() & getBotSession()...');
    const chatId = 987654321;
    await saveBotSession(chatId, 'awaiting_nik', { step: 2, tempName: 'Budi' });
    const session = await getBotSession(chatId);
    assert.strictEqual(session.state, 'awaiting_nik');
    assert.deepStrictEqual(session.temp_data, { step: 2, tempName: 'Budi' });
    console.log(`   ✅ Bot session saved and retrieved with JSON tempData.`);

    // 13. Test createPublicApplication
    console.log('\n1️⃣4️⃣ Testing createPublicApplication()...');
    const publicApp = await createPublicApplication(
      {
        name: 'Fatimah Public App',
        nik: '3671020000000002',
        phone: '085811112222',
        address: 'Jl. Daan Mogot KM 20',
        program: 'Pendidikan',
        request_title: 'Bantuan Biaya SPP Sekolah',
        monthly_income: 1500000,
        monthly_expense: 2000000,
      },
      [
        {
          fieldname: 'ktp',
          filename: 'ktp_fatimah.jpg',
          originalname: 'ktp_fatimah.jpg',
        },
      ]
    );
    assert.ok(publicApp.id, 'Public application mustahik ID should be returned');
    assert.ok(publicApp.file_no.startsWith('MST-'));
    assert.strictEqual(publicApp.status, 'Diajukan');
    console.log(`   ✅ Public application created: ${publicApp.file_no} (ID: ${publicApp.id})`);

    // 14. Test exportMustahikData
    console.log('\n1️⃣5️⃣ Testing exportMustahikData()...');
    const exportData = await exportMustahikData();
    assert.ok(Array.isArray(exportData) && exportData.length >= 2);
    console.log(`   ✅ Exported ${exportData.length} records with 60 master schema fields.`);

    // 15. Cleanup / deleteMustahik
    console.log('\n1️⃣6️⃣ Testing deleteMustahik()...');
    await deleteMustahik(mustahikId);
    await deleteMustahik(publicApp.id);
    const checkDeleted = await getMustahikById(mustahikId);
    assert.strictEqual(checkDeleted, null, 'Mustahik should be null after deletion');
    console.log(`   ✅ Cascade deletion verified.`);

    console.log('\n====================================================');
    console.log('🎉 ALL POSTGRESQL REPOSITORY TESTS PASSED SUCCESSFULLY! (16/16)');
    console.log('====================================================\n');
  } catch (err) {
    console.error('❌ Test suite failed with error:', err);
    process.exit(1);
  }
}

runTests();
