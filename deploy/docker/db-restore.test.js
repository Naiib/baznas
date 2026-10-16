import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { tmpdir } from 'node:os';

const scriptPath = path.join(import.meta.dirname, 'db-restore.sh');

test('db-restore propagates pg_restore failures and declares post-restore verification', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'p0-db-restore-'));
  try {
    const dump = path.join(directory, 'sample.dump');
    const fakeDocker = path.join(directory, process.platform === 'win32' ? 'docker.cmd' : 'docker');
    writeFileSync(dump, 'not-a-real-dump');
    writeFileSync(fakeDocker, '#!/bin/sh\nexit "${FAKE_PG_RESTORE_EXIT:-0}"\n', { mode: 0o755 });
    const result = spawnSync('bash', [scriptPath, dump, '--confirm-restore'], {
      cwd: path.dirname(scriptPath),
      env: { ...process.env, PATH: `${directory}${path.delimiter}${process.env.PATH || ''}`, FAKE_PG_RESTORE_EXIT: '42' },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    const script = readFileSync(scriptPath, 'utf8');
    assert.doesNotMatch(script, /pg_restore[\s\S]*\|\|\s*true/);
    assert.match(script, /SELECT\s+1/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
