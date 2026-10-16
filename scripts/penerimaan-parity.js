#!/usr/bin/env node
import fs from 'node:fs';

import { CANONICAL_PENERIMAAN_STATUSES } from '../server/penerimaan-service.js';

const DIMENSIONS = ['transaction_date', 'fund_type', 'channel', 'status'];
const BUSINESS_TIME_ZONE = 'Asia/Jakarta';

function businessDateFromTimestamp(rawDate) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(rawDate));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function normalizeTransaction(row) {
  const rawDate = String(row.transaction_date ?? '').trim();
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);
  const timestampMatch = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/.exec(rawDate);
  const parsedDate = dateMatch || timestampMatch;
  if (!parsedDate) {
    if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) throw new TypeError('transaction_date must be a valid ISO-8601 timestamp');
    throw new TypeError('transaction_date must be a valid date');
  }
  const date = new Date(Date.UTC(Number(parsedDate[1]), Number(parsedDate[2]) - 1, Number(parsedDate[3])));
  if (date.getUTCFullYear() !== Number(parsedDate[1]) || date.getUTCMonth() !== Number(parsedDate[2]) - 1 || date.getUTCDate() !== Number(parsedDate[3])) {
    throw new TypeError('transaction_date must be a valid calendar date');
  }
  if (timestampMatch && Number.isNaN(new Date(rawDate).getTime())) throw new TypeError('transaction_date must be a valid ISO-8601 timestamp');
  const status = String(row.status ?? '').trim();
  if (!CANONICAL_PENERIMAAN_STATUSES.includes(status)) {
    throw new TypeError(`status is not canonical: ${status}`);
  }
  const amount = String(row.amount ?? '').trim();
  if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) throw new TypeError('amount must be a positive integer');
  for (const dimension of ['fund_type', 'channel']) {
    if (!String(row[dimension] ?? '').trim()) throw new TypeError(`${dimension} is required`);
  }
  return {
    transaction_date: timestampMatch ? businessDateFromTimestamp(rawDate) : date.toISOString().slice(0, 10),
    fund_type: String(row.fund_type ?? '').trim().toLowerCase(),
    channel: String(row.channel ?? '').trim().toLowerCase(),
    status,
    amount,
  };
}

function addAmounts(left, right) {
  return (BigInt(left) + BigInt(right)).toString();
}

export function groupTransactions(rows) {
  const groups = new Map();
  for (const input of rows) {
    const row = normalizeTransaction(input);
    const key = DIMENSIONS.map((dimension) => row[dimension]).join('|');
    const current = groups.get(key);
    groups.set(key, current
      ? { ...current, transaction_count: current.transaction_count + 1, total_amount: addAmounts(current.total_amount, row.amount) }
      : { ...DIMENSIONS.reduce((result, dimension) => ({ ...result, [dimension]: row[dimension] }), {}), transaction_count: 1, total_amount: row.amount });
  }
  return [...groups.values()].sort((a, b) => DIMENSIONS.map((dimension) => a[dimension].localeCompare(b[dimension])).find((value) => value !== 0) ?? 0);
}

export function compareParity(migratedRows, legacyRows) {
  const migrated = groupTransactions(migratedRows);
  const legacy = groupTransactions(legacyRows);
  const byKey = (row) => DIMENSIONS.map((dimension) => row[dimension]).join('|');
  const legacyByKey = new Map(legacy.map((row) => [byKey(row), row]));
  const migratedByKey = new Map(migrated.map((row) => [byKey(row), row]));
  const differences = [];
  for (const key of new Set([...migratedByKey.keys(), ...legacyByKey.keys()])) {
    const left = migratedByKey.get(key);
    const right = legacyByKey.get(key);
    if (!left || !right || left.transaction_count !== right.transaction_count || left.total_amount !== right.total_amount) {
      differences.push({ key, migrated: left ?? null, legacy: right ?? null });
    }
  }
  return { result: differences.length ? 'mismatch' : 'match', migrated, legacy, differences };
}

function readRows(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new TypeError(`${file} must contain a JSON array`);
  return parsed;
}

function main(argv) {
  const migratedIndex = argv.indexOf('--migrated');
  const legacyIndex = argv.indexOf('--legacy');
  if (migratedIndex < 0 || !argv[migratedIndex + 1] || (legacyIndex >= 0 && !argv[legacyIndex + 1])) {
    throw new Error('Usage: node scripts/penerimaan-parity.js --migrated migrated.json [--legacy legacy.json]');
  }
  const migrated = readRows(argv[migratedIndex + 1]);
  if (legacyIndex < 0) {
    return { result: 'not-applicable', reason: 'No authoritative legacy export supplied; legacy inventory identifies client-side mock-only data.', migrated: groupTransactions(migrated), legacy: null, differences: [] };
  }
  return compareParity(migrated, readRows(argv[legacyIndex + 1]));
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/scripts/penerimaan-parity.js')) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
