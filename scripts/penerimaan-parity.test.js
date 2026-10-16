import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  normalizeTransaction,
  groupTransactions,
  compareParity,
} from './penerimaan-parity.js';

test('normalizeTransaction canonicalizes date, dimensions, status, and amount', () => {
  assert.deepEqual(normalizeTransaction({
    transaction_date: '2026-09-12T14:30:00+07:00',
    fund_type: ' ZAKAT_MAAL ',
    channel: ' Bank_Transfer ',
    status: ' Posted ',
    amount: '1250000',
  }), {
    transaction_date: '2026-09-12',
    fund_type: 'zakat_maal',
    channel: 'bank_transfer',
    status: 'Posted',
    amount: '1250000',
  });
});

test('normalizeTransaction preserves supplied business date and rejects rollover dates', () => {
  const row = { transaction_date: '2026-09-12T00:30:00+07:00', fund_type: 'infak', channel: 'qris', status: 'Posted', amount: 1 };
  assert.equal(normalizeTransaction(row).transaction_date, '2026-09-12');
  assert.equal(normalizeTransaction({ ...row, transaction_date: '2026-09-11T17:30:00Z' }).transaction_date, '2026-09-12');
  assert.throws(() => normalizeTransaction({ ...row, transaction_date: '2026-02-30' }), /valid calendar date/);
  assert.throws(() => normalizeTransaction({ ...row, transaction_date: '2026-09-12Tjunk' }), /valid ISO-8601 timestamp/);
  assert.throws(() => normalizeTransaction({ ...row, transaction_date: '2026-09-12 nonsense' }), /valid ISO-8601 timestamp/);
  assert.throws(() => normalizeTransaction({ ...row, transaction_date: '2026-09-12T25:00:00+07:00' }), /valid ISO-8601 timestamp/);
});

test('normalizeTransaction rejects missing dimensions, noncanonical status, zero, and decimals', () => {
  const row = { transaction_date: '2026-09-12', fund_type: 'infak', channel: 'qris', status: 'Posted', amount: 1 };
  for (const field of ['fund_type', 'channel']) assert.throws(() => normalizeTransaction({ ...row, [field]: '' }), new RegExp(`${field} is required`));
  assert.throws(() => normalizeTransaction({ ...row, status: 'approved' }), /status is not canonical/);
  assert.throws(() => normalizeTransaction({ ...row, amount: 0 }), /amount must be a positive integer/);
  assert.throws(() => normalizeTransaction({ ...row, amount: '1.5' }), /amount must be a positive integer/);
  assert.throws(() => normalizeTransaction({ ...row, transaction_date: '' }), /valid date/);
  assert.throws(() => normalizeTransaction({ ...row, transaction_date: 'not-a-date' }), /valid date/);
});

test('CLI rejects missing required arguments', () => {
  const result = spawnSync(process.execPath, ['scripts/penerimaan-parity.js'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage:/);
  const legacyResult = spawnSync(process.execPath, ['scripts/penerimaan-parity.js', '--migrated', 'x.json', '--legacy'], { encoding: 'utf8' });
  assert.notEqual(legacyResult.status, 0);
  assert.match(legacyResult.stderr, /Usage:/);
});

test('groupTransactions sums exact amounts by date, fund type, channel, and status', () => {
  const rows = groupTransactions([
    { transaction_date: '2026-09-12', fund_type: 'infak', channel: 'qris', status: 'Posted', amount: 100 },
    { transaction_date: '2026-09-12', fund_type: 'infak', channel: 'qris', status: 'Posted', amount: '25' },
  ]);
  assert.deepEqual(rows, [{
    transaction_date: '2026-09-12', fund_type: 'infak', channel: 'qris', status: 'Posted',
    transaction_count: 2, total_amount: '125',
  }]);
});

test('compareParity reports mismatches without fabricating a legacy total', () => {
  assert.deepEqual(compareParity([{ transaction_date: '2026-09-12', fund_type: 'infak', channel: 'qris', status: 'Posted', amount: 10 }], []), {
    result: 'mismatch',
    migrated: [{ transaction_date: '2026-09-12', fund_type: 'infak', channel: 'qris', status: 'Posted', transaction_count: 1, total_amount: '10' }],
    legacy: [],
    differences: [{ key: '2026-09-12|infak|qris|Posted', migrated: { transaction_date: '2026-09-12', fund_type: 'infak', channel: 'qris', status: 'Posted', transaction_count: 1, total_amount: '10' }, legacy: null }],
  });
});
