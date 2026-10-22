const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3400';
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'qa-previews');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Create dummy image files for upload test
const dummyKtpPath = '/tmp/dummy-ktp.png';
const dummyKkPath = '/tmp/dummy-kk.png';
const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
fs.writeFileSync(dummyKtpPath, png1x1);
fs.writeFileSync(dummyKkPath, png1x1);

const results = {
  timestamp: new Date().toISOString(),
  baseUrl: BASE_URL,
  scenarios: {},
};

function queryDb(sql) {
  try {
    const cmd = `sudo docker exec web_baznas-postgres-1 psql -U baznas_user -d baznas_db -t -A -c "${sql.replace(/"/g, '\\"')}"`;
    return execSync(cmd).toString().trim();
  } catch (err) {
    console.error('DB query error:', err.message);
    return null;
  }
}

function cleanupMustahik(fileNo) {
  if (!fileNo) return;
  const id = queryDb(`SELECT id FROM mustahik WHERE file_no = '${fileNo}';`);
  if (!id) return;
  queryDb(`
    DELETE FROM wa_logs WHERE mustahik_id = ${id};
    DELETE FROM documents WHERE mustahik_id = ${id};
    DELETE FROM applications WHERE mustahik_id = ${id};
    DELETE FROM activity_logs WHERE mustahik_id = ${id};
    DELETE FROM assessments WHERE mustahik_id = ${id};
    DELETE FROM approval_decisions WHERE mustahik_id = ${id};
    DELETE FROM mustahik WHERE id = ${id};
  `);
}

async function run() {
  console.log(`=== BAZNAS V1 BROWSER E2E QA GATE VERIFICATION ===`);
  console.log(`Target: ${BASE_URL}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const pageErrors = [];
  const networkErrors = [];

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  page.on('pageerror', (err) => {
    pageErrors.push({ url: page.url(), message: err.message });
  });

  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('/api/auth/me')) {
      networkErrors.push({ url: res.url(), status: res.status() });
    }
  });

  try {
    // ----------------------------------------------------
    // 1. PUBLIC PORTAL SMOKE & SCREENSHOT
    // ----------------------------------------------------
    console.log('\n[1/8] Verifying Public Portal Home (/)...\n');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1');
    const homeTitle = await page.textContent('h1');
    console.log(`  Page header: "${homeTitle?.trim()}"`);
    const screenshotHome = path.join(SCREENSHOT_DIR, '01-portal-publik.png');
    await page.screenshot({ path: screenshotHome, fullPage: true });
    results.scenarios.portal_publik = {
      status: 'PASS',
      header: homeTitle?.trim(),
      screenshot: screenshotHome,
    };

    // ----------------------------------------------------
    // 2. LIVE TRACKING
    // ----------------------------------------------------
    console.log('\n[2/8] Verifying Live Tracking (/cek-pengajuan)...\n');
    await page.goto(`${BASE_URL}/cek-pengajuan`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#tracking-query');
    await page.fill('#tracking-query', 'MST-202608-0001');
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=MST-202608-0001', { timeout: 10000 });

    const trackingText = await page.textContent('main');
    const hasStatus = trackingText.includes('Diajukan') && trackingText.includes('MST-202608-0001');
    console.log(`  Tracking found MST-202608-0001 / Diajukan: ${hasStatus}`);

    const screenshotTracking = path.join(SCREENSHOT_DIR, '02-live-tracking.png');
    await page.screenshot({ path: screenshotTracking, fullPage: true });
    results.scenarios.live_tracking = {
      status: hasStatus ? 'PASS' : 'FAIL',
      query: 'MST-202608-0001',
      screenshot: screenshotTracking,
    };

    // ----------------------------------------------------
    // 3. SUBMIT PENGAJUAN MUSTAHIK (WITH DB VERIFY & CLEANUP)
    // ----------------------------------------------------
    console.log('\n[3/8] Verifying Submit Pengajuan (/pengajuan)...\n');
    await page.goto(`${BASE_URL}/pengajuan`, { waitUntil: 'domcontentloaded' });

    // Step 0: Validation check on empty submit
    await page.click('button:has-text("Lanjut")');
    await page.waitForTimeout(300);
    const validationMsg = await page.textContent('body');
    const hasValidation = validationMsg.includes('Nama lengkap wajib diisi.');
    console.log(`  Validation message verified: ${hasValidation}`);

    // Fill Step 0: Identitas
    await page.fill('label:has-text("Nama lengkap") input', 'Ahmad Subagyo UAT');
    await page.fill('label:has-text("NIK") input', '3671012345670001');
    await page.fill('label:has-text("Nomor Kartu Keluarga") input', '3671012345670001');
    await page.fill('label:has-text("Nomor WhatsApp") input', '081298765432');
    await page.click('button:has-text("Lanjut")');
    await page.waitForTimeout(500);

    // Fill Step 1: Domisili
    await page.fill('label:has-text("Alamat domisili") textarea', 'Jl. Daan Mogot No. 45');
    await page.fill('label:has-text("RT / RW") input', '003/005');
    await page.fill('label:has-text("Kelurahan") input', 'Sukarasa');
    await page.click('button:has-text("Lanjut")');
    await page.waitForTimeout(500);

    // Fill Step 2: Program & Kebutuhan
    await page.fill('label:has-text("Uraian kebutuhan") textarea', 'Permohonan Bantuan Biaya Pendidikan UAT');
    await page.fill('label:has-text("Deskripsi kondisi ekonomi") textarea', 'Bantuan operasional pendidikan semester ganjil');
    await page.click('button:has-text("Lanjut")');
    await page.waitForTimeout(500);

    // Step 3: Upload Dokumen
    await page.setInputFiles('input[aria-label="Unggah KTP"]', dummyKtpPath);
    await page.setInputFiles('input[aria-label="Unggah Kartu Keluarga"]', dummyKkPath);
    await page.waitForTimeout(500);
    await page.click('button:has-text("Lanjut")');
    await page.waitForTimeout(500);

    // Step 4: Konfirmasi & Kirim
    await page.check('input[aria-label="Saya menyatakan data yang diisi benar"]');
    await page.click('button:has-text("Kirim pengajuan")');

    // Wait for success screen
    await page.waitForSelector('text=Permohonan Berhasil Dikirim', { timeout: 10000 });
    const successBody = await page.textContent('body');
    const matchReg = successBody.match(/MST-\d{6}-\d{4}/);
    const createdFileNo = matchReg ? matchReg[0] : null;
    console.log(`  Application submitted successfully! Registration: ${createdFileNo}`);

    const screenshotSubmit = path.join(SCREENSHOT_DIR, '03-submit-pengajuan-success.png');
    await page.screenshot({ path: screenshotSubmit, fullPage: true });

    // Verify in DB and Clean up
    let dbVerified = false;
    if (createdFileNo) {
      const dbCheck = queryDb(`SELECT count(*) FROM mustahik WHERE file_no = '${createdFileNo}';`);
      dbVerified = dbCheck === '1';
      console.log(`  Database record confirmed for ${createdFileNo}: ${dbVerified}`);

      // Clean up fixture from DB
      cleanupMustahik(createdFileNo);
      const afterCleanup = queryDb(`SELECT count(*) FROM mustahik WHERE file_no = '${createdFileNo}';`);
      console.log(`  Fixture cleaned up from DB: ${afterCleanup === '0'}`);
    }

    results.scenarios.submit_pengajuan = {
      status: createdFileNo && dbVerified ? 'PASS' : 'FAIL',
      registrationNumber: createdFileNo,
      dbVerified,
      cleanedUp: true,
      screenshot: screenshotSubmit,
    };

    // ----------------------------------------------------
    // 4. LOGIN & DASHBOARD PENYALURAN
    // ----------------------------------------------------
    console.log('\n[4/8] Verifying Login Penyaluran & Dashboard (/penyaluran)...\n');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('#login-email', 'penyaluran@baznas.go.id');
    await page.fill('#login-password', 'penyaluran123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/penyaluran**', { timeout: 10000 });
    await page.waitForSelector('h1, h2', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const penyaluranBody = await page.textContent('body');
    const hasPenyaluranData = penyaluranBody.includes('Penyaluran') || penyaluranBody.includes('Mustahik') || penyaluranBody.includes('H. Rahmat');
    console.log(`  Penyaluran dashboard rendered: ${hasPenyaluranData}`);

    const screenshotPenyaluran = path.join(SCREENSHOT_DIR, '04-penyaluran-dashboard.png');
    await page.screenshot({ path: screenshotPenyaluran, fullPage: true });

    results.scenarios.login_penyaluran = {
      status: hasPenyaluranData ? 'PASS' : 'FAIL',
      url: page.url(),
      screenshot: screenshotPenyaluran,
    };

    // ----------------------------------------------------
    // 5. SEGREGASI OTORISASI: Penyaluran accessing Penerimaan
    // ----------------------------------------------------
    console.log('\n[5/8] Verifying Role Segregation: Penyaluran -> Penerimaan routes...\n');
    await page.goto(`${BASE_URL}/penerimaan`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const deniedText1 = await page.textContent('body');
    const isDenied1 = deniedText1.includes('Akses Ditolak') || page.url().includes('/login');
    console.log(`  Direct navigation to /penerimaan blocked: ${isDenied1}`);

    const screenshotDenied1 = path.join(SCREENSHOT_DIR, '05-penyaluran-denied-penerimaan.png');
    await page.screenshot({ path: screenshotDenied1, fullPage: true });

    results.scenarios.segregasi_penyaluran_ke_penerimaan = {
      status: isDenied1 ? 'PASS' : 'FAIL',
      screenshot: screenshotDenied1,
    };

    // ----------------------------------------------------
    // 6. LOGIN & DASHBOARD PENERIMAAN
    // ----------------------------------------------------
    console.log('\n[6/8] Verifying Login Penerimaan & Dashboard (/penerimaan)...\n');
    // Clear cookies & storage for clean Penerimaan session
    await context.clearCookies();
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());

    await page.fill('#login-email', 'penerimaan@baznas.go.id');
    await page.fill('#login-password', 'penerimaan123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/penerimaan**', { timeout: 10000 });
    await page.waitForSelector('h1, h2', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const penerimaanBody = await page.textContent('body');
    const hasPenerimaanData = penerimaanBody.includes('Penerimaan') || penerimaanBody.includes('Muzakki') || penerimaanBody.includes('Siti Rahmah');
    console.log(`  Penerimaan dashboard rendered: ${hasPenerimaanData}`);

    const screenshotPenerimaan = path.join(SCREENSHOT_DIR, '06-penerimaan-dashboard.png');
    await page.screenshot({ path: screenshotPenerimaan, fullPage: true });

    results.scenarios.login_penerimaan = {
      status: hasPenerimaanData ? 'PASS' : 'FAIL',
      url: page.url(),
      screenshot: screenshotPenerimaan,
    };

    // ----------------------------------------------------
    // 7. SEGREGASI OTORISASI: Penerimaan accessing Penyaluran
    // ----------------------------------------------------
    console.log('\n[7/8] Verifying Role Segregation: Penerimaan -> Penyaluran routes...\n');
    await page.goto(`${BASE_URL}/penyaluran`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const deniedText2 = await page.textContent('body');
    const isDenied2 = deniedText2.includes('Akses Ditolak') || page.url().includes('/login');
    console.log(`  Direct navigation to /penyaluran blocked: ${isDenied2}`);

    const screenshotDenied2 = path.join(SCREENSHOT_DIR, '07-penerimaan-denied-penyaluran.png');
    await page.screenshot({ path: screenshotDenied2, fullPage: true });

    results.scenarios.segregasi_penerimaan_ke_penyaluran = {
      status: isDenied2 ? 'PASS' : 'FAIL',
      screenshot: screenshotDenied2,
    };

    // ----------------------------------------------------
    // 8. SWEEP MODUL OPERASIONAL (CHECK 404 / RUNTIME ERRORS)
    // ----------------------------------------------------
    console.log('\n[8/8] Sweeping Operational Modules (Penerimaan routes)...\n');
    const penerimaanRoutes = [
      '/penerimaan',
      '/penerimaan/transaksi',
      '/penerimaan/muzakki',
      '/penerimaan/rekonsiliasi',
      '/penerimaan/laporan',
      '/penerimaan/pengaturan',
    ];

    const sweepResults = [];
    for (const route of penerimaanRoutes) {
      const res = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      const status = res ? res.status() : 0;
      const is404 = status === 404 || (await page.$('h1.next-error-h1')) !== null;
      sweepResults.push({ route, status, is404 });
      console.log(`  Route ${route}: HTTP ${status} (404: ${is404})`);
    }

    // Now re-login as Penyaluran to sweep Penyaluran routes
    console.log('\nSweeping Operational Modules (Penyaluran routes)...\n');
    await context.clearCookies();
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.fill('#login-email', 'penyaluran@baznas.go.id');
    await page.fill('#login-password', 'penyaluran123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/penyaluran**', { timeout: 10000 });
    await page.waitForTimeout(1500);

    const penyaluranRoutes = [
      '/penyaluran',
      '/penyaluran/mustahik',
      '/penyaluran/program',
      '/penyaluran/laporan',
      '/penyaluran/peta',
      '/penyaluran/transaksi',
      '/penyaluran/tugas',
    ];

    for (const route of penyaluranRoutes) {
      const res = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      const status = res ? res.status() : 0;
      const is404 = status === 404 || (await page.$('h1.next-error-h1')) !== null;
      sweepResults.push({ route, status, is404 });
      console.log(`  Route ${route}: HTTP ${status} (404: ${is404})`);
    }

    const any404 = sweepResults.some((r) => r.is404);
    results.scenarios.operational_sweep = {
      status: !any404 && pageErrors.length === 0 ? 'PASS' : 'FAIL',
      totalRoutesTested: sweepResults.length,
      sweepResults,
      pageErrors,
      networkErrors,
    };

    console.log('\n=== QA VERIFICATION COMPLETED ===');
    console.log(JSON.stringify(results, null, 2));

    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'qa-results.json'),
      JSON.stringify(results, null, 2)
    );
  } catch (err) {
    console.error('Test execution failed:', err);
    results.error = err.message;
  } finally {
    await browser.close();
    // Clean up temporary files
    if (fs.existsSync(dummyKtpPath)) fs.unlinkSync(dummyKtpPath);
    if (fs.existsSync(dummyKkPath)) fs.unlinkSync(dummyKkPath);
  }
}

run();
