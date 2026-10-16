import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLegacyPenerimaanPath } from '../src/legacyRoutePolicy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('legacy shell has no active Penerimaan routes or component imports', () => {
  const app = read('src/App.jsx');
  const navbar = read('src/components/Navbar.jsx');
  const quickMenu = read('src/components/QuickMenu.jsx');
  const header = read('src/components/Header.jsx');
  const deployScript = read('deploy.ps1');
  const nginx = read('frontend-next/deploy/nginx-muhammadrofiq-next.conf');

  assert.doesNotMatch(app, /PenerimaanDashboard|MuzakkiPage|LaporanPenerimaanPage/);
  assert.doesNotMatch(app, /['"]\/(muzakki|laporan-penerimaan|laporan_penerimaan)['"]/);
  assert.doesNotMatch(navbar, /page:\s*['"](penerimaan|muzakki|laporan_penerimaan)['"]/);
  assert.doesNotMatch(quickMenu, /page:\s*['"](penerimaan|muzakki)['"]/);
  assert.doesNotMatch(header, /['"](penerimaan|muzakki|laporan_penerimaan)['"]/);
  assert.doesNotMatch(navbar, /activeKeys:.*(penerimaan|muzakki|laporan_penerimaan)/);
  assert.match(app, /user\.role === 'penerimaan'[\s\S]{0,160}window\.location\.assign\('\/penerimaan'\)/);
  assert.match(nginx, /location \//);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3002/);
  assert.match(deployScript, /Retired: the Vite shell is not a deployable frontend/);
});

test('canonical Next.js navigation owns the Penerimaan destinations', () => {
  const nav = read('frontend-next/components/penerimaan/penerimaan-nav.ts');
  assert.match(nav, /href: '\/penerimaan'/);
  assert.match(nav, /href: '\/penerimaan\/muzakki'/);
  assert.match(nav, /href: '\/penerimaan\/laporan'/);
});

test('legacy deep links are retired without redirecting back into the Vite shell', () => {
  assert.equal(resolveLegacyPenerimaanPath('/penerimaan'), 'retired');
  assert.equal(resolveLegacyPenerimaanPath('/muzakki'), 'retired');
  assert.equal(resolveLegacyPenerimaanPath('/laporan-penerimaan'), 'retired');
  assert.equal(resolveLegacyPenerimaanPath('/laporan_penerimaan'), 'retired');
  assert.equal(resolveLegacyPenerimaanPath('/penyaluran'), null);
});
