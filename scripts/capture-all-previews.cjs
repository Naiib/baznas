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

async function waitForHttp(url, timeoutMs = 45000) {
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

  try {
    initDisposableStagingDatabase();

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

    await waitForHttp(`http://127.0.0.1:${STAGING_BACKEND_PORT}/api/health`);
    console.log(`[SPAWN] Staging backend healthy.`);

    console.log(`\n[SPAWN] Starting Staging Frontend (Next.js Production) on port ${STAGING_FRONTEND_PORT}...`);
    frontendProc = spawn('npx', ['next', 'start', '-p', String(STAGING_FRONTEND_PORT), '-H', '127.0.0.1'], {
      cwd: path.resolve(process.cwd(), 'frontend'),
      env: {
        ...process.env,
        INTERNAL_API_URL: `http://127.0.0.1:${STAGING_BACKEND_PORT}`,
        PORT: String(STAGING_FRONTEND_PORT),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    frontendProc.stderr.on('data', (d) => {
      console.error(`[frontend stderr] ${d.toString().trim()}`);
    });
    frontendProc.stdout.on('data', (d) => {
      console.log(`[frontend stdout] ${d.toString().trim()}`);
    });

    await waitForHttp(BASE_URL, 45000);
    console.log(`[SPAWN] Staging frontend ready. Warming up routes...`);
    try {
      await fetch(`${BASE_URL}/`);
      await fetch(`${BASE_URL}/cek-pengajuan`);
      await fetch(`${BASE_URL}/pengajuan`);
      await fetch(`${BASE_URL}/login`);
    } catch (_) {}

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    // 1. Portal Publik - Desktop
    console.log('1. Capturing Portal Publik (Desktop 1440px)...');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-portal-publik-desktop.png'), fullPage: true });

    // 2. Portal Publik - Mobile
    console.log('2. Capturing Portal Publik (Mobile 390px)...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-portal-publik-mobile.png'), fullPage: true });

    // Reset to desktop 1280
    await page.setViewportSize({ width: 1280, height: 800 });

    // 3. Cek Status Pengajuan (with tracking query)
    console.log('3. Capturing Cek Status Pengajuan (/cek-pengajuan)...');
    await page.goto(`${BASE_URL}/cek-pengajuan`, { waitUntil: 'networkidle' });
    await page.fill('#tracking-query', 'MST-202608-0001');
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=MST-202608-0001', { timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-cek-status-pengajuan.png'), fullPage: true });

    // 4. Form Permohonan Bantuan
    console.log('4. Capturing Form Permohonan Bantuan (/pengajuan)...');
    await page.goto(`${BASE_URL}/pengajuan`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-form-permohonan-bantuan.png'), fullPage: true });

    // 5. Halaman Login
    console.log('5. Capturing Halaman Login (/login)...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-halaman-login-amil.png'), fullPage: true });

    // 6. Login as Penyaluran -> Penyaluran Dashboard
    console.log('6. Logging in as Penyaluran and capturing Dashboard (/penyaluran)...');
    await page.fill('#login-email', 'penyaluran@baznas.go.id');
    await page.fill('#login-password', 'penyaluran123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/penyaluran**', { timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-penyaluran-dashboard.png'), fullPage: true });

    // 7. Penyaluran Mustahik
    console.log('7. Capturing Penyaluran Mustahik (/penyaluran/mustahik)...');
    await page.goto(`${BASE_URL}/penyaluran/mustahik`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-penyaluran-mustahik-pipeline.png'), fullPage: true });

    // 8. Penyaluran Tugas / Survei
    console.log('8. Capturing Penyaluran Tugas (/penyaluran/tugas)...');
    await page.goto(`${BASE_URL}/penyaluran/tugas`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08-penyaluran-tugas-survei.png'), fullPage: true });

    // 9. Penyaluran Peta Sebaran
    console.log('9. Capturing Penyaluran Peta (/penyaluran/peta)...');
    await page.goto(`${BASE_URL}/penyaluran/peta`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09-penyaluran-peta-sebaran.png'), fullPage: true });

    // 10. Penyaluran Transaksi
    console.log('10. Capturing Penyaluran Transaksi (/penyaluran/transaksi)...');
    await page.goto(`${BASE_URL}/penyaluran/transaksi`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10-penyaluran-transaksi-realisasi.png'), fullPage: true });

    // 11. Penyaluran Laporan
    console.log('11. Capturing Penyaluran Laporan (/penyaluran/laporan)...');
    await page.goto(`${BASE_URL}/penyaluran/laporan`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11-penyaluran-laporan.png'), fullPage: true });

    // 12. Segregasi Akses: Penyaluran mencoba mengakses Penerimaan -> 403 Ditolak
    console.log('12. Capturing Segregasi Akses Ditolak (Penyaluran -> Penerimaan)...');
    await page.goto(`${BASE_URL}/penerimaan`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12-segregasi-akses-ditolak-403.png'), fullPage: true });

    // 13. Login as Penerimaan -> Penerimaan Dashboard
    console.log('13. Logging in as Penerimaan and capturing Dashboard (/penerimaan)...');
    await context.clearCookies();
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.waitForSelector('#login-email');
    await page.waitForTimeout(500);
    await page.fill('#login-email', 'penerimaan@baznas.go.id');
    await page.fill('#login-password', 'penerimaan123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/penerimaan**', { timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13-penerimaan-dashboard.png'), fullPage: true });

    // 14. Penerimaan Transaksi
    console.log('14. Capturing Penerimaan Transaksi (/penerimaan/transaksi)...');
    await page.goto(`${BASE_URL}/penerimaan/transaksi`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14-penerimaan-transaksi-donasi.png'), fullPage: true });

    // 15. Penerimaan Muzakki
    console.log('15. Capturing Penerimaan Muzakki (/penerimaan/muzakki)...');
    await page.goto(`${BASE_URL}/penerimaan/muzakki`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15-penerimaan-data-muzakki.png'), fullPage: true });

    // 16. Penerimaan Rekonsiliasi
    console.log('16. Capturing Penerimaan Rekonsiliasi (/penerimaan/rekonsiliasi)...');
    await page.goto(`${BASE_URL}/penerimaan/rekonsiliasi`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '16-penerimaan-rekonsiliasi.png'), fullPage: true });

    console.log('\n✅ ALL 16 SECTION PREVIEWS CAPTURED SUCCESSFULLY!');
  } finally {
    if (browser) await browser.close();
    if (frontendProc) {
      frontendProc.kill('SIGTERM');
    }
    if (backendProc) {
      backendProc.kill('SIGTERM');
    }
    try {
      execSync(`sudo docker exec web_baznas-postgres-1 psql -U baznas_user -d postgres -c "DROP DATABASE IF EXISTS ${STAGING_DB_NAME};"`);
      console.log(`[STAGING DB] Teardown complete.`);
    } catch (_) {}
  }
}

run().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Fatal error during preview capture:', err);
  process.exit(1);
});
