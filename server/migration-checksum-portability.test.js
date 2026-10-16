import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { P0_KNOWN_MIGRATIONS } from './penyaluran-p0/migration-runner.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = path.join(repositoryRoot, 'server', 'migrations');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function git(repository, args, options = {}) {
  return execFileSync('git', ['-C', repository, ...args], options);
}

function archiveMigrationHashes(archive) {
  const hashes = new Map();
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/s, '').trim();
    const size = Number.parseInt(sizeText, 8);
    assert.ok(Number.isFinite(size), `Invalid tar entry size for ${name}`);
    const contentStart = offset + 512;
    const filename = path.posix.basename(name);
    if (/^\d{8}_\d{3}.*\.sql$/i.test(filename)) {
      hashes.set(filename, sha256(archive.subarray(contentStart, contentStart + size)));
    }
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  return hashes;
}

function checksumResultsForConfig(autocrlf) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'p0-migration-checksum-'));
  const source = path.join(tempRoot, 'source');
  const checkout = path.join(tempRoot, 'checkout');
  const migrationRelativePaths = [];
  mkdirSync(source, { recursive: true });

  try {
    const migrationFiles = readdirSync(migrationsDirectory);
    for (const migration of P0_KNOWN_MIGRATIONS) {
      const filename = migrationFiles.find((name) => name.startsWith(`${migration.version}_`) && name.endsWith('.sql'));
      assert.ok(filename, `Missing migration source for ${migration.version}`);
      const relativePath = path.posix.join('server', 'migrations', filename);
      const target = path.join(source, relativePath);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(path.join(migrationsDirectory, filename), target);
      migrationRelativePaths.push({ filename, relativePath, checksum: migration.checksum });
    }

    const attributesPath = path.join(repositoryRoot, '.gitattributes');
    if (existsSync(attributesPath)) copyFileSync(attributesPath, path.join(source, '.gitattributes'));

    git(source, ['init', '--quiet']);
    git(source, ['config', 'core.autocrlf', autocrlf]);
    git(source, ['config', 'user.name', 'Migration Checksum Test']);
    git(source, ['config', 'user.email', 'migration-checksum-test@example.invalid']);
    git(source, ['add', '--all']);

    const staged = new Map();
    for (const { filename, relativePath } of migrationRelativePaths) {
      staged.set(filename, sha256(git(source, ['show', `:${relativePath}`])));
    }

    git(source, ['commit', '--quiet', '-m', 'checksum portability fixture']);
    const archive = git(source, ['archive', '--format=tar', 'HEAD']);
    const archived = archiveMigrationHashes(archive);

    execFileSync('git', ['-c', `core.autocrlf=${autocrlf}`, 'clone', '--quiet', source, checkout]);
    const checkedOut = new Map();
    for (const { filename, relativePath } of migrationRelativePaths) {
      checkedOut.set(filename, sha256(readFileSync(path.join(checkout, relativePath))));
    }

    return migrationRelativePaths.map(({ filename, checksum }) => ({
      autocrlf,
      filename,
      expected: checksum,
      staged: staged.get(filename),
      archived: archived.get(filename),
      checkedOut: checkedOut.get(filename),
    }));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

test('pinned P0 migration bytes survive Git archives and checkouts under both autocrlf settings', () => {
  const results = ['true', 'false'].flatMap(checksumResultsForConfig);
  const failures = results.filter(({ expected, staged, archived, checkedOut }) => (
    expected !== staged || expected !== archived || expected !== checkedOut
  ));

  assert.deepEqual(failures, [], JSON.stringify(results, null, 2));
});
