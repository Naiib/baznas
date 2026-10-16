import test from 'node:test';
import assert from 'node:assert/strict';
import { appendActivityLog } from './repository.js';

test('appendActivityLog preserves actor id, name, role, action, and target', async () => {
  const records = [];
  const db = {
    async run(_statement, values) {
      records.push({
        mustahikId: values[0],
        actorName: values[1],
        action: values[2],
        title: values[3],
        description: values[4],
      });
      return { lastID: 37 };
    },
  };

  const id = await appendActivityLog({
    actor: { id: 'user-12', name: 'Siti Aminah', role: 'penyaluran' },
    action: 'REPORT_EXPORT',
    target: 'laporan:lap-2026-09',
    title: 'Ekspor laporan penyaluran',
    description: 'Format: pdf',
  }, db);

  assert.equal(id, 37);
  assert.deepEqual(records, [{
    mustahikId: null,
    actorName: 'Siti Aminah [penyaluran] (#user-12)',
    action: 'REPORT_EXPORT',
    title: 'Ekspor laporan penyaluran',
    description: 'Target: laporan:lap-2026-09. Format: pdf',
  }]);
});
