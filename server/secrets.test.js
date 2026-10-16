import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getSecret, bootstrapSecrets } from './secrets.js';

test('secrets helper: reads from env or file', async (t) => {
  await t.test('getSecret reads from direct environment variable', () => {
    process.env.TEST_SECRET_KEY = 'direct-secret-val';
    delete process.env.TEST_SECRET_KEY_FILE;
    assert.equal(getSecret('TEST_SECRET_KEY'), 'direct-secret-val');
    delete process.env.TEST_SECRET_KEY;
  });

  await t.test('getSecret reads from *_FILE and strips whitespace', () => {
    const tmpFile = path.join(os.tmpdir(), 'secret_test_file.txt');
    fs.writeFileSync(tmpFile, '  file-secret-val\n\r');

    process.env.TEST_FILE_SECRET_FILE = tmpFile;
    assert.equal(getSecret('TEST_FILE_SECRET'), 'file-secret-val');

    fs.unlinkSync(tmpFile);
    delete process.env.TEST_FILE_SECRET_FILE;
  });

  await t.test('bootstrapSecrets sets process.env from *_FILE', () => {
    const tmpFile = path.join(os.tmpdir(), 'jwt_secret_test.txt');
    fs.writeFileSync(tmpFile, 'super_jwt_from_file_123');

    process.env.JWT_SECRET_FILE = tmpFile;
    bootstrapSecrets();

    assert.equal(process.env.JWT_SECRET, 'super_jwt_from_file_123');

    fs.unlinkSync(tmpFile);
    delete process.env.JWT_SECRET_FILE;
    delete process.env.JWT_SECRET;
  });
});
