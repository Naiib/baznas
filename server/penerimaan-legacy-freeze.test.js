import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLegacyPenerimaanFrozen, getLegacyPenerimaanFreezeNotice, legacyPenerimaanReadOnlyGuard } from './legacy-freeze.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('legacy penerimaan inventory exists and documents all legacy artifacts', () => {
  const inventoryPath = path.join(rootDir, 'PENERIMAAN_LEGACY_INVENTORY.txt');
  assert.ok(fs.existsSync(inventoryPath), 'PENERIMAAN_LEGACY_INVENTORY.txt must exist');

  const content = fs.readFileSync(inventoryPath, 'utf8');

  // Verify routes documented
  assert.ok(content.includes('/penerimaan'), 'Must document /penerimaan route');
  assert.ok(content.includes('/muzakki'), 'Must document /muzakki route');
  assert.ok(content.includes('laporan_penerimaan'), 'Must document laporan_penerimaan');

  // Verify components documented
  assert.ok(content.includes('PenerimaanDashboard.jsx'), 'Must document PenerimaanDashboard.jsx');
  assert.ok(content.includes('MuzakkiPage.jsx'), 'Must document MuzakkiPage.jsx');
  assert.ok(content.includes('LaporanPenerimaanPage.jsx'), 'Must document LaporanPenerimaanPage.jsx');
  assert.ok(content.includes('penerimaanData.js'), 'Must document penerimaanData.js');

  // Verify endpoints, schema, seed data documented
  assert.ok(content.includes('ENDPOINT'), 'Must document endpoints section');
  assert.ok(content.includes('SCHEMA'), 'Must document schema section');
  assert.ok(content.includes('SEED'), 'Must document seed section');
  assert.ok(content.includes('penerimaan@baznas.go.id'), 'Must document seed user penerimaan@baznas.go.id');

  // Verify assets documented
  assert.ok(content.includes('ASSET'), 'Must document assets section');
  assert.ok(content.includes('baznas-logo.png'), 'Must document baznas-logo.png asset');

  // Verify freeze status documented
  assert.ok(content.includes('FREEZE') || content.includes('READ_ONLY'), 'Must document freeze/read-only status');
});

test('legacy penerimaan feature flag freezes legacy mutation by default', () => {
  assert.equal(isLegacyPenerimaanFrozen(), true, 'Legacy Penerimaan must be frozen (read-only) by default during migration');

  const notice = getLegacyPenerimaanFreezeNotice();
  assert.ok(typeof notice === 'string' && notice.length > 0, 'Freeze notice must be a descriptive string');
  assert.ok(notice.toLowerCase().includes('read-only') || notice.toLowerCase().includes('baca-saja') || notice.toLowerCase().includes('beku'), 'Notice must state read-only/frozen state');
});

test('legacy penerimaan read-only guard rejects mutation requests', () => {
  let statusCode = null;
  let jsonResponse = null;

  const req = { method: 'POST', path: '/api/legacy/penerimaan/transaksi' };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonResponse = payload;
      return this;
    }
  };

  let nextCalled = false;
  legacyPenerimaanReadOnlyGuard(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false, 'Next middleware must not be called when frozen');
  assert.equal(statusCode, 403, 'Must return HTTP 403 Forbidden');
  assert.equal(jsonResponse?.success, false);
  assert.equal(jsonResponse?.frozen, true);
  assert.ok(jsonResponse?.message?.includes('Baca-Saja'));
});
