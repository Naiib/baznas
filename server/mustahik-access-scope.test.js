import test from 'node:test';
import assert from 'node:assert/strict';
import { listMustahik, getMustahikById } from './repository.js';

const ppdStatuses = "'Pengajuan Dana (FPD)', 'Pengajuan Dana (PPD)'";

test('Finance list query constrains rows to the existing PPD workflow statuses', async () => {
  let query;
  const db = { all: async (value) => { query = value; return []; } };
  await listMustahik({ ppd_only: true }, db);
  assert.match(query, /EXISTS \(SELECT 1 FROM applications/);
  assert.match(query, new RegExp(`status IN \\(${ppdStatuses.replace(/[()]/g, '\\$&')}\\)`));
});

test('Finance detail scope and returned applications/PPD are restricted in repository queries', async () => {
  const queries = [];
  const db = {
    get: async (query) => {
      queries.push(query);
      return { id: 41, file_no: 'MST-SYNTHETIC', name: 'Synthetic Person', status: 'Pengajuan Dana (PPD)' };
    },
    all: async (query) => { queries.push(query); return []; },
  };
  const result = await getMustahikById(41, { ppdOnly: true, db });
  assert.match(queries[0], /EXISTS \(SELECT 1 FROM applications/);
  assert.match(queries[1], new RegExp(`status IN \\(${ppdStatuses.replace(/[()]/g, '\\$&')}\\)`));
  assert.match(queries[2], /application_id IS NULL/);
  assert.match(queries[2], new RegExp(`status IN \\(${ppdStatuses.replace(/[()]/g, '\\$&')}\\)`));
  assert.equal(queries.length, 3);
  assert.ok(result);
  assert.deepEqual(Object.keys(result).filter((key) => ['applications', 'ppd', 'assessments', 'mpzis', 'documents', 'wa_logs'].includes(key)).sort(), ['applications', 'ppd']);
});
