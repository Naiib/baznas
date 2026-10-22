const { chromium } = require('/home/multica-agent/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const STAGING_DB_NAME = 'baznas_staging_qa_test';
const STAGING_BACKEND_PORT = 3099;
const STAGING_FRONTEND_PORT = 3400;
const BASE_URL = `http://127.0.0.1:${STAGING_FRONTEND_PORT}`;
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'qa-previews');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Temporary dummy image files for upload test
const dummyKtpPath = '/tmp/dummy-ktp-uat.png';
const dummyKkPath = '/tmp/dummy-kk-uat.png';
const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
fs.writeFileSync(dummyKtpPath, png1x1);
fs.writeFileSync(dummyKkPath, png1x1);

function execDb(sql) {
  const cmd = `sudo docker exec web_baznas-postgres-1 psql -U baznas_user -d ${STAGING_DB_NAME} -t -A -c "${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd).toString().trim();
}

function initDisposableStagingDatabase() {
  console.log(`[STAGING DB] Recreating disposable test database "${STAGING_DB_NAME}"...`);
  execSync(`sudo docker exec web_baznas-postgres-1 psql -U baznas_user -d postgres -c "DROP DATABASE IF EXISTS ${STAGING_DB_NAME};"`);
  execSync(`sudo docker exec web_baznas-postgres-1 psql -U baznas_user -d postgres -c "CREATE DATABASE ${STAGING_DB_NAME};"`);
  execSync(`sudo docker exec web_baznas-postgres-1 pg_dump -U baznas_user -d baznas_db | sudo docker exec -i web_baznas-postgres-1 psql -U baznas_user -d ${STAGING_DB_NAME} > /dev/null`);
  const verifyCount = execDb('SELECT count(*) FROM mustahik;');
  console.log(`[STAGING DB] Disposable database ready. Baseline mustahik count: ${verifyCount}`);
}

async function waitForHttp(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch (_) {
      // wait
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${url} after ${timeoutMs}ms`);
}

async function run() {
  let backendProc = null;
  let frontendProc = null;
  let browser = null;

  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      type: 'disposable_staging',
      database: STAGING_DB_NAME,
      backendUrl: `http://127.0.0.1:${STAGING_BACKEND_PORT}`,
      frontendUrl: BASE_URL,
    },
    scenarios: {},
    summary: {
      totalScenarios: 0,
      passedScenarios: 0,
      failedScenarios: 0,
      status: 'PENDING',
    },
  };

  function assert(condition, message) {
    if (!condition) {
      const err = new Error(`ASSERTION FAILED: ${message}`);
      console.error(`❌ ${err.message}`);
      throw err;
    }
    console.log(`  ✓ ${message}`);
  }

  try {
    // 1. Initialize isolated database
    initDisposableStagingDatabase();

    // 2. Start staging backend
    console.log(`\n[SPAWN] Starting Staging Backend on port ${STAGING_BACKEND_PORT}...`);
    backendProc = spawn('node', ['server/index.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(STAGING_BACKEND_PORT),
        NODE_ENV: 'production',
        DB_HOST: '172.19.0.2',
        DB_PORT: '5432',
        DB_NAME: STAGING_DB_NAME,
        DB_USER: 'baznas_user',
        DB_PASSWORD: 'f7I5uwaYqxczEy4jfulcMlSYqm49_K1l7CgAZknc7rw',
        JWT_SECRET: 'e295044494b75cbd76c18bd6fc880d7764c04cfde09a55590177dec838333056',
        PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY: '90ee1dd2fd2aede75b9807495d3a7ecb31c0b90b71bcb3a3b23d182781378937',
        FRONTEND_URL: `https://baznas.agentivesolution.id,http://localhost:${STAGING_FRONTEND_PORT},http://127.0.0.1:${STAGING_FRONTEND_PORT}`,
        UPLOAD_DIR: '/tmp/baznas-staging-uploads',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    backendProc.stderr.on('data', (d) => {
      const s = d.toString();
      if (!s.includes('injected env') && !s.includes('ExperimentalWarning')) {
        console.error(`[backend stderr] ${s.trim()}`);
      }
    });

    await waitForHttp(`http://127.0.0.1:${STAGING_BACKEND_PORT}/api/health`);
    console.log(`[SPAWN] Staging backend healthy.`);

    // 3. Start staging frontend
    console.log(`\n[SPAWN] Starting Staging Frontend (Next.js) on port ${STAGING_FRONTEND_PORT}...`);
    frontendProc = spawn('npx', ['next', 'dev', '--port', String(STAGING_FRONTEND_PORT), '--hostname', '127.0.0.1'], {
      cwd: path.resolve(process.cwd(), 'frontend'),
      env: {
        ...process.env,
        INTERNAL_API_URL: `http://127.0.0.1:${STAGING_BACKEND_PORT}`,
        PORT: String(STAGING_FRONTEND_PORT),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    frontendProc.stderr.on('data', (d) => {
      const s = d.toString();
      if (!s.includes('injected env') && !s.includes('ExperimentalWarning')) {
        console.error(`[frontend stderr] ${s.trim()}`);
      }
    });

    await waitForHttp(BASE_URL, 45000);
    console.log(`[SPAWN] Staging frontend ready. Warming up routes...`);
    try {
      await fetch(`${BASE_URL}/cek-pengajuan`);
      await fetch(`${BASE_URL}/pengajuan`);
      await fetch(`${BASE_URL}/login`);
      await fetch(`${BASE_URL}/api/health`);
    } catch (_) {}
    console.log(`[SPAWN] Warm up complete.`);

    // 4. Launch Playwright
    console.log(`\n[PLAYWRIGHT] Launching browser...`);
    browser = await chromium.launch({
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
      console.error(`[BROWSER PAGEERROR] ${err.message}`);
      pageErrors.push({ url: page.url(), message: err.message });
    });

    page.on('console', (msg) => {
      console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
    });

    page.on('request', (req) => {
      console.log(`[BROWSER REQ] ${req.method()} ${req.url()}`);
    });

    page.on('response', (res) => {
      console.log(`[BROWSER RES] ${res.status()} ${res.url()}`);
      // Capture 4xx and 5xx network responses (except intentional 401 unauthenticated check or negative tracking search)
      if (res.status() >= 400) {
        const u = res.url();
        const isExpected = u.includes('/api/auth/me') || u.includes('query=MST-000000-0000') || u.includes('/api/public/lacak/MST-000000-0000');
        if (!isExpected) {
          networkErrors.push({ url: u, status: res.status() });
        }
      }
    });

    // ====================================================
    // SCENARIO 1: PUBLIC PORTAL SMOKE & RESPONSIVENESS
    // ====================================================
    console.log('\n--- [1/8] Verifying Public Portal Home (/) ---');
    const homeRes = await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    assert(homeRes.status() === 200, 'Public portal / returned HTTP 200');
    await page.waitForSelector('h1');
    const homeTitle = await page.textContent('h1');
    assert(homeTitle.includes('Layanan Bantuan Mustahik'), 'H1 header contains expected BAZNAS portal title');

    // Test mobile responsiveness
    await page.setViewportSize({ width: 390, height: 844 });
    const isMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert(!isMobileOverflow, 'Mobile view (390px) renders without horizontal scroll overflow');

    // Return to desktop
    await page.setViewportSize({ width: 1280, height: 800 });
    const screenshotHome = path.join(SCREENSHOT_DIR, '01-portal-publik.png');
    await page.screenshot({ path: screenshotHome, fullPage: true });

    results.scenarios.portal_publik = {
      status: 'PASS',
      httpStatus: homeRes.status(),
      header: homeTitle.trim(),
      mobileOverflow: isMobileOverflow,
      screenshot: screenshotHome,
    };
    results.summary.passedScenarios++;

    // ====================================================
    // SCENARIO 2: LIVE TRACKING (POSITIVE & NEGATIVE)
    // ====================================================
    console.log('\n--- [2/8] Verifying Live Tracking (/cek-pengajuan) ---');
    const trackRes = await page.goto(`${BASE_URL}/cek-pengajuan`, { waitUntil: 'domcontentloaded' });
    assert(trackRes.status() === 200, '/cek-pengajuan returned HTTP 200');

    // Positive search
    await page.waitForSelector('#tracking-query');
    await page.fill('#tracking-query', 'MST-202608-0001');
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=MST-202608-0001', { timeout: 20000 });

    const trackBody = await page.textContent('main');
    assert(trackBody.includes('MST-202608-0001'), 'Tracking renders target registration number');
    assert(trackBody.includes('Diajukan'), 'Tracking renders current status "Diajukan"');

    // Negative search
    await page.fill('#tracking-query', 'MST-000000-0000');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    const negativeBody = await page.textContent('main');
    const hasNotFound = negativeBody.includes('tidak ditemukan') || negativeBody.includes('Belum ada riwayat');
    assert(hasNotFound, 'Negative query correctly displays not found message without crashing');

    // Return to positive result for evidence screenshot
    await page.fill('#tracking-query', 'MST-202608-0001');
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=MST-202608-0001', { timeout: 20000 });
    const screenshotTracking = path.join(SCREENSHOT_DIR, '02-live-tracking.png');
    await page.screenshot({ path: screenshotTracking, fullPage: true });

    results.scenarios.live_tracking = {
      status: 'PASS',
      httpStatus: trackRes.status(),
      positiveQuery: 'MST-202608-0001',
      negativeQueryHandled: hasNotFound,
      screenshot: screenshotTracking,
    };
    results.summary.passedScenarios++;

    // ====================================================
    // SCENARIO 3: SUBMIT PENGAJUAN (DB BASELINE, DELTA, CLEANUP ZERO)
    // ====================================================
    console.log('\n--- [3/8] Verifying Submit Pengajuan (/pengajuan) with Staging DB Isolation ---');
    // Capture baseline DB counts
    const dbBaselineMustahik = parseInt(execDb('SELECT count(*) FROM mustahik;'), 10);
    const dbBaselineApplications = parseInt(execDb('SELECT count(*) FROM applications;'), 10);
    const dbBaselineDocuments = parseInt(execDb('SELECT count(*) FROM documents;'), 10);
    console.log(`  Staging DB Baseline: mustahik=${dbBaselineMustahik}, applications=${dbBaselineApplications}, documents=${dbBaselineDocuments}`);

    const applyRes = await page.goto(`${BASE_URL}/pengajuan`, { waitUntil: 'domcontentloaded' });
    assert(applyRes.status() === 200, '/pengajuan returned HTTP 200');

    // Step 0 validation on empty submit
    await page.click('button:has-text("Lanjut")');
    await page.waitForTimeout(300);
    const validationText = await page.textContent('body');
    assert(validationText.includes('Nama lengkap wajib diisi.'), 'Form validation blocks empty submission on Step 0');

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
    await page.fill('label:has-text("Uraian kebutuhan") textarea', 'Permohonan Bantuan Biaya Pendidikan UAT Staging');
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
    await page.waitForSelector('text=Permohonan Berhasil Dikirim', { timeout: 15000 });
    const successBody = await page.textContent('body');
    const matchReg = successBody.match(/MST-\d{6}-\d{4}/);
    assert(matchReg !== null, `Registration number successfully created: ${matchReg ? matchReg[0] : 'NONE'}`);
    const createdFileNo = matchReg[0];

    const screenshotSubmit = path.join(SCREENSHOT_DIR, '03-submit-pengajuan-success.png');
    await page.screenshot({ path: screenshotSubmit, fullPage: true });

    // DB Delta Verification in disposable DB
    const dbCreatedRow = execDb(`SELECT id, name, nik, status FROM mustahik WHERE file_no = '${createdFileNo}';`);
    assert(dbCreatedRow.length > 0, `Database record created in staging DB for ${createdFileNo}`);
    const createdMustahikId = dbCreatedRow.split('|')[0];
    const createdAppsCount = parseInt(execDb(`SELECT count(*) FROM applications WHERE mustahik_id = ${createdMustahikId};`), 10);
    const createdDocsCount = parseInt(execDb(`SELECT count(*) FROM documents WHERE mustahik_id = ${createdMustahikId};`), 10);
    assert(createdAppsCount >= 1, `Application child record confirmed (count: ${createdAppsCount})`);
    assert(createdDocsCount >= 1, `Document attachments confirmed (count: ${createdDocsCount})`);

    // Clean up fixture from disposable staging DB
    console.log(`  Cleaning up staging fixture ID ${createdMustahikId} (${createdFileNo})...`);
    execDb(`
      DELETE FROM wa_logs WHERE mustahik_id = ${createdMustahikId};
      DELETE FROM documents WHERE mustahik_id = ${createdMustahikId};
      DELETE FROM applications WHERE mustahik_id = ${createdMustahikId};
      DELETE FROM activity_logs WHERE mustahik_id = ${createdMustahikId};
      DELETE FROM assessments WHERE mustahik_id = ${createdMustahikId};
      DELETE FROM approval_decisions WHERE mustahik_id = ${createdMustahikId};
      DELETE FROM mustahik WHERE id = ${createdMustahikId};
    `);

    // Post-cleanup strict assertion: ALL related tables MUST report exactly 0 records
    const postMustahik = execDb(`SELECT count(*) FROM mustahik WHERE file_no = '${createdFileNo}';`);
    const postApps = execDb(`SELECT count(*) FROM applications WHERE mustahik_id = ${createdMustahikId};`);
    const postDocs = execDb(`SELECT count(*) FROM documents WHERE mustahik_id = ${createdMustahikId};`);
    const postLogs = execDb(`SELECT count(*) FROM activity_logs WHERE mustahik_id = ${createdMustahikId};`);

    assert(postMustahik === '0', 'Post-cleanup mustahik record is strictly 0');
    assert(postApps === '0', 'Post-cleanup applications record is strictly 0');
    assert(postDocs === '0', 'Post-cleanup documents record is strictly 0');
    assert(postLogs === '0', 'Post-cleanup activity_logs record is strictly 0');

    results.scenarios.submit_pengajuan = {
      status: 'PASS',
      registrationNumber: createdFileNo,
      baselineCounts: { mustahik: dbBaselineMustahik, applications: dbBaselineApplications, documents: dbBaselineDocuments },
      createdRecord: { id: createdMustahikId, fileNo: createdFileNo },
      postCleanupVerification: {
        mustahik: postMustahik,
        applications: postApps,
        documents: postDocs,
        activityLogs: postLogs,
        allZero: postMustahik === '0' && postApps === '0' && postDocs === '0' && postLogs === '0',
      },
      screenshot: screenshotSubmit,
    };
    results.summary.passedScenarios++;

    // ====================================================
    // SCENARIO 4: UNAUTHENTICATED GUARD PROTECTION
    // ====================================================
    console.log('\n--- [4/8] Verifying Unauthenticated Guard Protection ---');
    await context.clearCookies();
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());

    // Anonymous to /penyaluran
    await page.goto(`${BASE_URL}/penyaluran`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const anonPenyaluranUrl = page.url();
    assert(anonPenyaluranUrl.includes('/login?next='), 'Unauthenticated /penyaluran redirects to /login?next=');
    const anonLoginBody = await page.textContent('body');
    assert(anonLoginBody.includes('SIM BAZNAS') && (await page.$('#login-email')) !== null, 'Unauthenticated /penyaluran displays login form only');

    // Anonymous to /penerimaan
    await page.goto(`${BASE_URL}/penerimaan`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const anonPenerimaanUrl = page.url();
    assert(anonPenerimaanUrl.includes('/login?next='), 'Unauthenticated /penerimaan redirects to /login?next=');
    assert((await page.$('#login-email')) !== null, 'Unauthenticated /penerimaan displays login form only');

    results.scenarios.unauthenticated_guards = {
      status: 'PASS',
      penyaluranRedirectUrl: anonPenyaluranUrl,
      penerimaanRedirectUrl: anonPenerimaanUrl,
    };
    results.summary.passedScenarios++;

    // ====================================================
    // SCENARIO 5: LOGIN & DASHBOARD PENYALURAN
    // ====================================================
    console.log('\n--- [5/8] Verifying Login Penyaluran & Dashboard (/penyaluran) ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-email');
    await page.waitForTimeout(1000);
    await page.fill('#login-email', 'penyaluran@baznas.go.id');
    await page.fill('#login-password', 'penyaluran123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/penyaluran**', { timeout: 15000 });
    assert(page.url() === `${BASE_URL}/penyaluran`, 'Final URL after Penyaluran login is strictly /penyaluran');
    await page.waitForSelector('h1, h2', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const penyaluranBody = await page.textContent('body');
    assert(penyaluranBody.includes('Penyaluran'), 'Dashboard contains "Penyaluran" portal header');
    assert(penyaluranBody.includes('Mustahik') || penyaluranBody.includes('Asnaf') || penyaluranBody.includes('RKAT'), 'Dashboard renders operational metrics (Mustahik / Asnaf / RKAT)');

    const screenshotPenyaluran = path.join(SCREENSHOT_DIR, '04-penyaluran-dashboard.png');
    await page.screenshot({ path: screenshotPenyaluran, fullPage: true });

    results.scenarios.login_penyaluran = {
      status: 'PASS',
      finalUrl: page.url(),
      account: 'penyaluran@baznas.go.id',
      screenshot: screenshotPenyaluran,
    };
    results.summary.passedScenarios++;

    // ====================================================
    // SCENARIO 6: ROLE SEGREGATION: Penyaluran -> Penerimaan
    // ====================================================
    console.log('\n--- [6/8] Verifying Cross-Role Segregation (Penyaluran accessing Penerimaan) ---');
    await page.goto(`${BASE_URL}/penerimaan`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const deniedUrl1 = page.url();
    assert(deniedUrl1 === `${BASE_URL}/penerimaan`, 'Cross-role attempt stays on target URL /penerimaan without silent drop to /login');
    const deniedText1 = await page.textContent('body');
    assert(deniedText1.includes('Akses Ditolak'), 'Guard renders "Akses Ditolak" heading');
    assert(deniedText1.includes('tidak memiliki izin'), 'Guard displays explicit lack of permission message');
    assert(!deniedText1.includes('Muzakki Terdaftar'), 'Penerimaan confidential metrics are NOT leaked');

    const screenshotDenied1 = path.join(SCREENSHOT_DIR, '05-penyaluran-denied-penerimaan.png');
    await page.screenshot({ path: screenshotDenied1, fullPage: true });

    results.scenarios.segregasi_penyaluran_ke_penerimaan = {
      status: 'PASS',
      attemptedUrl: deniedUrl1,
      renderedDeniedHeader: true,
      dataLeaked: false,
      screenshot: screenshotDenied1,
    };
    results.summary.passedScenarios++;

    // ====================================================
    // SCENARIO 7: LOGIN & DASHBOARD PENERIMAAN
    // ====================================================
    console.log('\n--- [7/8] Verifying Login Penerimaan & Dashboard (/penerimaan) ---');
    await context.clearCookies();
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.waitForSelector('#login-email');
    await page.waitForTimeout(1000);

    await page.fill('#login-email', 'penerimaan@baznas.go.id');
    await page.fill('#login-password', 'penerimaan123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/penerimaan**', { timeout: 15000 });
    assert(page.url() === `${BASE_URL}/penerimaan`, 'Final URL after Penerimaan login is strictly /penerimaan');
    await page.waitForSelector('h1, h2', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const penerimaanBody = await page.textContent('body');
    assert(penerimaanBody.includes('Penerimaan'), 'Dashboard contains "Penerimaan" portal header');
    assert(penerimaanBody.includes('Muzakki') || penerimaanBody.includes('Transaksi') || penerimaanBody.includes('ZIS'), 'Dashboard renders operational metrics (Muzakki / Transaksi / ZIS)');

    const screenshotPenerimaan = path.join(SCREENSHOT_DIR, '06-penerimaan-dashboard.png');
    await page.screenshot({ path: screenshotPenerimaan, fullPage: true });

    results.scenarios.login_penerimaan = {
      status: 'PASS',
      finalUrl: page.url(),
      account: 'penerimaan@baznas.go.id',
      screenshot: screenshotPenerimaan,
    };
    results.summary.passedScenarios++;

    // ====================================================
    // SCENARIO 8: ROLE SEGREGATION: Penerimaan -> Penyaluran
    // ====================================================
    console.log('\n--- [8/8] Verifying Cross-Role Segregation (Penerimaan accessing Penyaluran) ---');
    await page.goto(`${BASE_URL}/penyaluran`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const deniedUrl2 = page.url();
    assert(deniedUrl2 === `${BASE_URL}/penyaluran`, 'Cross-role attempt stays on target URL /penyaluran without silent drop to /login');
    const deniedText2 = await page.textContent('body');
    assert(deniedText2.includes('Akses Ditolak'), 'Guard renders "Akses Ditolak" heading');
    assert(deniedText2.includes('tidak memiliki izin'), 'Guard displays explicit lack of permission message');
    assert(!deniedText2.includes('Sebaran Mustahik'), 'Penyaluran confidential metrics are NOT leaked');

    const screenshotDenied2 = path.join(SCREENSHOT_DIR, '07-penerimaan-denied-penyaluran.png');
    await page.screenshot({ path: screenshotDenied2, fullPage: true });

    results.scenarios.segregasi_penerimaan_ke_penyaluran = {
      status: 'PASS',
      attemptedUrl: deniedUrl2,
      renderedDeniedHeader: true,
      dataLeaked: false,
      screenshot: screenshotDenied2,
    };
    results.summary.passedScenarios++;

    // ====================================================
    // SCENARIO 9: OPERATIONAL MODULE SWEEP (13 ROUTES)
    // ====================================================
    console.log('\n--- [SWEEP] Sweeping All 13 Operational Routes with Strict HTTP 200 & Runtime Checks ---');
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
      const isErrorPage = (await page.$('h1.next-error-h1')) !== null;
      assert(status === 200, `Penerimaan route ${route} returned strictly HTTP 200 (got ${status})`);
      assert(!isErrorPage, `Penerimaan route ${route} rendered without Next.js error page`);
      sweepResults.push({ route, status, isErrorPage });
    }

    // Login as Penyaluran to sweep Penyaluran routes
    await context.clearCookies();
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.waitForSelector('#login-email');
    await page.waitForTimeout(1000);
    await page.fill('#login-email', 'penyaluran@baznas.go.id');
    await page.fill('#login-password', 'penyaluran123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/penyaluran**', { timeout: 15000 });
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
      const isErrorPage = (await page.$('h1.next-error-h1')) !== null;
      assert(status === 200, `Penyaluran route ${route} returned strictly HTTP 200 (got ${status})`);
      assert(!isErrorPage, `Penyaluran route ${route} rendered without Next.js error page`);
      sweepResults.push({ route, status, isErrorPage });
    }

    assert(pageErrors.length === 0, `Zero page runtime errors detected (found ${pageErrors.length})`);
    assert(networkErrors.length === 0, `Zero unexpected network errors detected (found ${networkErrors.length})`);

    results.scenarios.operational_sweep = {
      status: 'PASS',
      totalRoutesTested: sweepResults.length,
      allHttp200: sweepResults.every((r) => r.status === 200),
      sweepResults,
      pageErrors,
      networkErrors,
    };
    results.summary.passedScenarios++;

    // Final summary
    results.summary.totalScenarios = Object.keys(results.scenarios).length;
    results.summary.status = 'PASS';

    console.log('\n========================================');
    console.log('✅ ALL QA GATE CRITERIA PASSED RIGOROUSLY!');
    console.log(`Total Scenarios: ${results.summary.passedScenarios}/${results.summary.totalScenarios} PASS`);
    console.log('========================================\n');

    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'qa-evidence.json'), JSON.stringify(results, null, 2));

    process.exitCode = 0;
  } catch (err) {
    console.error('\n❌ QA GATE VERIFICATION FAILED:', err);
    results.summary.status = 'FAIL';
    results.error = err.message;
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'qa-evidence.json'), JSON.stringify(results, null, 2));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (frontendProc) {
      frontendProc.kill('SIGTERM');
    }
    if (backendProc) {
      backendProc.kill('SIGTERM');
    }
    // Clean up temporary dummy upload files
    if (fs.existsSync(dummyKtpPath)) fs.unlinkSync(dummyKtpPath);
    if (fs.existsSync(dummyKkPath)) fs.unlinkSync(dummyKkPath);

    // Clean up disposable staging database
    try {
      console.log(`\n[TEARDOWN] Dropping disposable database ${STAGING_DB_NAME}...`);
      execSync(`sudo docker exec web_baznas-postgres-1 psql -U baznas_user -d postgres -c "DROP DATABASE IF EXISTS ${STAGING_DB_NAME};"`);
      console.log(`[TEARDOWN] Disposable database dropped cleanly.`);
    } catch (e) {
      console.error('[TEARDOWN] Failed to drop disposable database:', e.message);
    }

    try {
      execSync('fuser -k 3400/tcp 3099/tcp 2>/dev/null || true');
    } catch (_) {}

    process.exit(results.summary.status === 'PASS' ? 0 : 1);
  }
}

run();
