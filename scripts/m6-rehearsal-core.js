import crypto from 'node:crypto';

export const SYNTHETIC_CONTAINER_NAME = 'baznas-m1-synthetic-pg16-20260926';
export const SYNTHETIC_IMAGE = 'postgres:16-alpine';
export const SYNTHETIC_PORT = 55439;

export const legacyPreservationTables = Object.freeze([
  'mustahik', 'applications', 'assessments', 'mpzis', 'ppd', 'documents',
  'approval_decisions', 'activity_logs', 'wa_logs', 'ppd_payments',
  'recipient_confirmations',
]);

export function assertSyntheticTarget(target) {
  const valid = target?.allowFlag === '1'
    && target.host === '127.0.0.1'
    && Number(target.port) === SYNTHETIC_PORT
    && target.containerName === SYNTHETIC_CONTAINER_NAME
    && target.image === SYNTHETIC_IMAGE
    && target.running === true
    && String(target.publishedPort) === String(SYNTHETIC_PORT)
    && /^16\d+$/.test(String(target.serverVersionNum));

  if (!valid) {
    throw new Error('M6 rehearsal requires explicit opt-in and the verified synthetic PostgreSQL 16 container on 127.0.0.1:55439');
  }
  return true;
}

export function createRehearsalDatabaseNames(token) {
  if (typeof token !== 'string' || !/^\d{8}_[a-f0-9]{8}$/.test(token)) {
    throw new Error('M6 rehearsal token must contain a date and eight lowercase hex characters');
  }
  const prefix = `m6_rehearsal_${token}`;
  return Object.freeze({
    source: `${prefix}_source`,
    restored: `${prefix}_restored`,
  });
}


export function quotePgIdentifier(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error('Invalid PostgreSQL identifier');
  }
  return '"' + value.replaceAll('"', '""') + '"';
}

export function buildLegacyHashQuery(table, columns) {
  if (!legacyPreservationTables.includes(table)) {
    throw new Error('Table is not in preservation manifest: ' + table);
  }
  if (!Array.isArray(columns) || columns.length === 0 || !columns.includes('id')) {
    throw new Error('Legacy hash columns must be a non-empty manifest containing id');
  }
  return 'SELECT ' + columns.map(quotePgIdentifier).join(', ')
    + ' FROM ' + quotePgIdentifier(table) + ' ORDER BY ' + quotePgIdentifier('id');
}

export function hashLegacyRows(rows) {
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
