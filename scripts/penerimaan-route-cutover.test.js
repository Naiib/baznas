import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('legacy Vite shell and intermediate frontend-next directories are completely removed', () => {
  assert.equal(fs.existsSync(path.join(root, 'src')), false);
  assert.equal(fs.existsSync(path.join(root, 'frontend-next')), false);
  assert.equal(fs.existsSync(path.join(root, 'index.html')), false);
  assert.equal(fs.existsSync(path.join(root, 'vite.config.js')), false);
});

test('canonical Next.js navigation owns the Penerimaan destinations in frontend/', () => {
  const nav = read('frontend/components/penerimaan/penerimaan-nav.ts');
  assert.match(nav, /href: '\/penerimaan'/);
  assert.match(nav, /href: '\/penerimaan\/muzakki'/);
  assert.match(nav, /href: '\/penerimaan\/laporan'/);
});
