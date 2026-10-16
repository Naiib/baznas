import crypto from 'crypto';
import ExcelJS from 'exceljs';
import {
  getDb,
  MUSTAHIK_COLUMNS,
  LEGACY_MUSTAHIK_WRITABLE_COLUMNS,
  P0_CONTROL_COLUMNS,
  withTransaction,
} from './db.js';
import { KECAMATAN_KELURAHAN_MAP, KECAMATAN_COORDINATES } from './seed_data.js';
import { canTransition } from './penyaluran-permissions.js';
import {
  assertExpectedWorkflowState,
  canonicalizePenyaluranStatus,
  createStaleDecisionError,
  resolvePenyaluranTransition,
} from './workflow-integrity.js';
import {
  validatePenerimaanTransition,
  PENERIMAAN_ACTIONS,
  requiresLeaderApproval,
  canReverseTransaction,
} from './penerimaan-service.js';
import { normalizeWebhookPayload, parseCanonicalIntegerMoney } from './webhook-verification.js';
import {
  canCloseReconciliationBatch,
  resolvePenerimaanAuthority,
} from './penerimaan-permissions.js';
import { normalizeAccessActor } from './access-policy.js';
import {
  normalizeReportFilters,
  buildPenerimaanReportFilterQuery,
  buildAuditReportQuery,
} from './penerimaan-report-query.js';
import {
  encryptProviderSecret,
  decryptProviderSecret,
} from './penerimaan-provider-secrets.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { P0Error } from './penyaluran-p0/errors.js';

export {
  getDb,
  MUSTAHIK_COLUMNS,
  LEGACY_MUSTAHIK_WRITABLE_COLUMNS,
  P0_CONTROL_COLUMNS,
  withTransaction,
} from './db.js';
// Canonical P0 intake is exposed here for repository consumers while its
// implementation remains isolated from legacy createMustahik().
export { createP0Mustahik } from './penyaluran-p0/intake-service.js';
export { getP0CaseWorkspace } from './penyaluran-p0/case-read-model.js';
export {
  normalizeReportFilters,
  buildPenerimaanReportFilterQuery,
  buildAuditReportQuery,
} from './penerimaan-report-query.js';
export {
  encryptProviderSecret,
  decryptProviderSecret,
  resolveConfiguredProviderSecret,
} from './penerimaan-provider-secrets.js';

export const RECONCILIATION_ELIGIBLE_STATUSES = Object.freeze(['Menunggu Rekonsiliasi']);

/**
 * Formats a database rupiah value at the API boundary without going through
 * IEEE-754 Number conversion. Rupiah responses are whole decimal integers.
 */
export function toCanonicalRupiahString(value) {
  if (value === null || value === undefined || value === '') return '0';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError('Nilai rupiah harus berupa bilangan bulat yang aman atau string desimal.');
    }
    return String(value);
  }
  const str = String(value).trim();
  if (!/^-?\d+(?:\.0+)?$/.test(str)) {
    throw new TypeError(`Nilai rupiah tidak valid: ${str}`);
  }
  return str.replace(/\.0+$/, '');
}

const batchLockStorage = new AsyncLocalStorage();
const batchOperationLocks = new Map();

/**
 * Serializes operations on the same reconciliation batch within the process.
 * In SQLite or single-process setups, this guarantees deterministic and atomic serialization
 * for auto-match, manual match, unmatch, and close batch.
 * Re-entrant safe via AsyncLocalStorage.
 */
export async function withBatchLock(batchId, fn, bypass = false) {
  if (bypass || !batchId) {
    return fn();
  }
  const key = String(batchId);
  const activeBatchLocks = batchLockStorage.getStore() || new Set();

  if (activeBatchLocks.has(key)) {
    return fn();
  }

  const prev = batchOperationLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const queuedPromise = prev.then(() => current).catch(() => current);
  batchOperationLocks.set(key, queuedPromise);
  await prev;

  const nextStore = new Set(activeBatchLocks);
  nextStore.add(key);

  return batchLockStorage.run(nextStore, async () => {
    try {
      return await fn();
    } finally {
      release();
      if (batchOperationLocks.get(key) === queuedPromise) {
        batchOperationLocks.delete(key);
      }
    }
  });
}

/**
 * Returns current count of queued batch locks for testing and memory leak verification.
 */
export function getBatchLockQueueSize() {
  return batchOperationLocks.size;
}

/**
 * Safely converts an amount (number, string, or numeric string) into integer cents using BigInt
 * to prevent floating point inaccuracies during reconciliation balance calculations.
 * Supports up to 2 decimal places (cents), or integers.
 * E.g. 500000 -> 50000000n, "1500000.50" -> 150000050n
 */
export function toIntegerCents(val) {
  if (val === null || val === undefined || val === '') return 0n;
  if (typeof val === 'bigint') return val * 100n;
  let str = String(val).trim();
  if (!str) return 0n;
  const isNegative = str.startsWith('-');
  if (isNegative) str = str.slice(1).trim();

  let wholeStr = '0';
  let fracStr = '00';

  if (str.includes(',') && str.includes('.')) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      // 1.000,50 -> dot is thousand, comma is decimal
      wholeStr = str.slice(0, lastComma).replace(/\D/g, '');
      fracStr = str.slice(lastComma + 1).replace(/\D/g, '').padEnd(2, '0').slice(0, 2);
    } else {
      // 1,000.50 -> comma is thousand, dot is decimal
      wholeStr = str.slice(0, lastDot).replace(/\D/g, '');
      fracStr = str.slice(lastDot + 1).replace(/\D/g, '').padEnd(2, '0').slice(0, 2);
    }
  } else if (str.includes(',')) {
    const parts = str.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      wholeStr = parts[0].replace(/\D/g, '');
      fracStr = parts[1].replace(/\D/g, '').padEnd(2, '0').slice(0, 2);
    } else {
      wholeStr = str.replace(/\D/g, '');
      fracStr = '00';
    }
  } else if ((str.match(/\./g) || []).length > 1) {
    wholeStr = str.replace(/\D/g, '');
    fracStr = '00';
  } else if (str.includes('.')) {
    const parts = str.split('.');
    wholeStr = parts[0].replace(/\D/g, '');
    fracStr = (parts[1] || '').replace(/\D/g, '').padEnd(2, '0').slice(0, 2);
  } else {
    wholeStr = str.replace(/\D/g, '');
    fracStr = '00';
  }

  const total = BigInt(wholeStr || '0') * 100n + BigInt(fracStr || '0');
  return isNegative ? -total : total;
}

/**
 * Converts BigInt cents back to an exact numeric representation.
 * Safe values remain numbers for backwards compatibility; values beyond JavaScript's
 * safe integer range are returned as decimal strings so no digits are rounded away.
 */
export function fromIntegerCents(cents) {
  const c = typeof cents === 'bigint' ? cents : BigInt(cents || 0);
  const isNegative = c < 0n;
  const abs = isNegative ? -c : c;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const sign = isNegative ? '-' : '';

  if (frac === 0n) {
    const signedWhole = isNegative ? -whole : whole;
    if (
      signedWhole <= BigInt(Number.MAX_SAFE_INTEGER) &&
      signedWhole >= BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      return Number(signedWhole);
    }
    return `${sign}${whole}`;
  }

  const exactDecimal = `${sign}${whole}.${String(frac).padStart(2, '0')}`;
  if (abs <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(exactDecimal);
  }
  return exactDecimal;
}

/**
 * Converts cents to a value that is safe to bind to BIGINT database columns.
 * Penerimaan amounts are denominated in whole rupiah, so fractional rupiah are rejected.
 */
function toDatabaseIntegerAmount(cents) {
  const c = typeof cents === 'bigint' ? cents : BigInt(cents || 0);
  if (c % 100n !== 0n) {
    const err = new Error('Nominal rekonsiliasi harus berupa bilangan bulat rupiah.');
    err.status = 400;
    throw err;
  }

  const whole = c / 100n;
  if (whole <= BigInt(Number.MAX_SAFE_INTEGER) && whole >= BigInt(Number.MIN_SAFE_INTEGER)) {
    return Number(whole);
  }
  return whole.toString();
}

/**
 * Recalculates batch matched totals and discrepancy using BigInt integer-safe arithmetic.
 * Ensures consistent and exact totals across auto-match, manual match, and unmatch.
 */
export async function recalculateBatchTotals(batchId, db) {
  const batch = await db.get('SELECT * FROM penerimaan_reconciliation_batches WHERE id = $1', [Number(batchId)]);
  if (!batch) return null;

  const matchedLines = await db.all(
    `SELECT amount FROM penerimaan_statement_lines
     WHERE batch_id = $1 AND status = 'matched'`,
    [batch.id]
  );

  const matchedCount = matchedLines.length;
  const matchedCents = matchedLines.reduce((acc, l) => acc + toIntegerCents(l.amount), 0n);
  const expectedCents = toIntegerCents(batch.total_expected_amount);
  const discrepancyCents = expectedCents - matchedCents;

  const matchedAmount = toDatabaseIntegerAmount(matchedCents);
  const discrepancy = toDatabaseIntegerAmount(discrepancyCents);

  const newStatus =
    batch.status === 'closed'
      ? 'closed'
      : matchedCount > 0 && matchedCount === Number(batch.total_expected_count) && discrepancyCents === 0n
      ? 'matched'
      : matchedCount > 0
      ? 'in_progress'
      : batch.status;

  await db.run(
    `UPDATE penerimaan_reconciliation_batches
     SET total_matched_count = $1, total_matched_amount = $2, discrepancy_amount = $3, status = $4, updated_at = CURRENT_TIMESTAMP
     WHERE id = $5`,
    [matchedCount, matchedAmount, discrepancy, newStatus, batch.id]
  );

  return {
    matched_count: matchedCount,
    matched_amount: toCanonicalRupiahString(matchedAmount),
    discrepancy_amount: toCanonicalRupiahString(discrepancy),
    status: newStatus,
  };
}

/**
 * Utility to safely parse JSON or return a fallback
 */
export function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Normalizes mustahik row data types for PostgreSQL numeric/integer output
 */
export function formatMustahikRow(r) {
  if (!r) return null;
  return {
    ...r,
    subdistrict: r.subdistrict || r.kecamatan || '',
    village: r.village || r.kelurahan || '',
    family_dependents: r.family_dependents !== null && r.family_dependents !== undefined ? parseInt(r.family_dependents, 10) : 0,
    monthly_income: r.monthly_income !== null && r.monthly_income !== undefined ? parseFloat(r.monthly_income) : 0,
    monthly_expense: r.monthly_expense !== null && r.monthly_expense !== undefined ? parseFloat(r.monthly_expense) : 0,
    remaining_income: r.remaining_income !== null && r.remaining_income !== undefined ? parseFloat(r.remaining_income) : 0,
    application_count: r.application_count !== null && r.application_count !== undefined ? parseInt(r.application_count, 10) : 1,
    beneficiary_count: r.beneficiary_count !== null && r.beneficiary_count !== undefined ? parseInt(r.beneficiary_count, 10) : 1,
    recommended_amount: r.recommended_amount !== null && r.recommended_amount !== undefined ? parseFloat(r.recommended_amount) : 0,
    approved_amount: r.approved_amount !== null && r.approved_amount !== undefined ? parseFloat(r.approved_amount) : 0,
    desil_score: r.desil_score !== null && r.desil_score !== undefined ? parseInt(r.desil_score, 10) : null,
    house_index: r.house_index !== null && r.house_index !== undefined ? parseInt(r.house_index, 10) : null,
    asset_index: r.asset_index !== null && r.asset_index !== undefined ? parseInt(r.asset_index, 10) : null,
    income_index: r.income_index !== null && r.income_index !== undefined ? parseInt(r.income_index, 10) : null,
    spiritual_score: r.spiritual_score !== null && r.spiritual_score !== undefined ? parseInt(r.spiritual_score, 10) : null,
    overall_score: r.overall_score !== null && r.overall_score !== undefined ? parseFloat(r.overall_score) : null
  };
}

/**
 * Format: MST-YYYYMM-XXXX (e.g. MST-202608-0001)
 */
export async function generateNextFileNo(date = new Date(), dbOverride = null) {
  const db = dbOverride || await getDb();
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const prefix = `MST-${year}${month}-`;

  const latest = await db.get(
    `SELECT file_no FROM mustahik WHERE file_no ILIKE $1 ORDER BY file_no DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let nextSeq = 1;
  if (latest && latest.file_no) {
    const parts = latest.file_no.split('-');
    if (parts.length >= 3) {
      const currentSeq = parseInt(parts[2], 10);
      if (!isNaN(currentSeq)) {
        nextSeq = currentSeq + 1;
      }
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * List all mustahik records with dynamic filtering and ILIKE search
 */
export async function listMustahik(filters = {}, dbOverride = null) {
  const db = dbOverride || await getDb();
  let query = 'SELECT * FROM mustahik';
  const conditions = [];
  const params = [];

  if (filters.ppd_only) {
    conditions.push(`EXISTS (SELECT 1 FROM applications ppd_application WHERE ppd_application.mustahik_id = mustahik.id AND ppd_application.status IN ('Pengajuan Dana (FPD)', 'Pengajuan Dana (PPD)'))`);
  }

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }

  if (filters.program) {
    params.push(filters.program);
    conditions.push(`program = $${params.length}`);
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    const p1 = `$${params.length + 1}`;
    const p2 = `$${params.length + 2}`;
    const p3 = `$${params.length + 3}`;
    const p4 = `$${params.length + 4}`;
    const p5 = `$${params.length + 5}`;
    conditions.push(`(name ILIKE ${p1} OR file_no ILIKE ${p2} OR nik ILIKE ${p3} OR phone ILIKE ${p4} OR kecamatan ILIKE ${p5})`);
    params.push(term, term, term, term, term);
  }

  if (!filters.include_archived && !filters.archived) {
    conditions.push('archived_at IS NULL');
  } else if (filters.archived && !filters.include_archived) {
    conditions.push('archived_at IS NOT NULL');
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';
  const rows = await db.all(query, params);
  return rows.map(formatMustahikRow);
}

/**
 * Get Mustahik detail along with all related applications, assessments, mpzis, ppd, documents, wa_logs
 */
export async function getMustahikById(id, options = {}) {
  const db = options.db || await getDb();
  const scope = options.ppdOnly
    ? ` AND EXISTS (SELECT 1 FROM applications ppd_application WHERE ppd_application.mustahik_id = mustahik.id AND ppd_application.status IN ('Pengajuan Dana (FPD)', 'Pengajuan Dana (PPD)'))`
    : '';
  const mustahik = await db.get(`SELECT * FROM mustahik WHERE id = $1${scope}`, [id]);
  if (!mustahik) return null;

  const applications = await db.all(`SELECT * FROM applications WHERE mustahik_id = $1${options.ppdOnly ? " AND status IN ('Pengajuan Dana (FPD)', 'Pengajuan Dana (PPD)')" : ''} ORDER BY applied_at DESC`, [id]);
  const assessments = options.ppdOnly ? [] : await db.all('SELECT * FROM assessments WHERE mustahik_id = $1 ORDER BY created_at DESC', [id]);
  const mpzis = options.ppdOnly ? [] : await db.all('SELECT * FROM mpzis WHERE mustahik_id = $1 OR application_id IN (SELECT id FROM applications WHERE mustahik_id = $2) ORDER BY created_at DESC', [id, id]);
  const ppd = await db.all(options.ppdOnly
    ? `SELECT * FROM ppd WHERE application_id IN (SELECT id FROM applications WHERE mustahik_id = $1 AND status IN ('Pengajuan Dana (FPD)', 'Pengajuan Dana (PPD)')) OR (mustahik_id = $1 AND application_id IS NULL) ORDER BY created_at DESC`
    : 'SELECT * FROM ppd WHERE mustahik_id = $1 OR application_id IN (SELECT id FROM applications WHERE mustahik_id = $2) ORDER BY created_at DESC', options.ppdOnly ? [id] : [id, id]);
  const documents = options.ppdOnly ? [] : await db.all('SELECT * FROM documents WHERE mustahik_id = $1 ORDER BY uploaded_at DESC', [id]);
  const waLogs = options.ppdOnly ? [] : await db.all('SELECT * FROM wa_logs WHERE mustahik_id = $1 ORDER BY sent_at DESC', [id]);

  const formattedAssessments = assessments.map(a => ({
    ...a,
    photos: safeJsonParse(a.photos, a.photos ? [a.photos] : [])
  }));

  const formattedPpd = ppd.map(p => ({
    ...p,
    fund_source: safeJsonParse(p.fund_source, p.fund_source)
  }));

  if (options.ppdOnly) return {
    ...formatMustahikRow(mustahik),
    applications,
    ppd: formattedPpd,
  };

  return {
    ...formatMustahikRow(mustahik),
    applications,
    assessments: formattedAssessments,
    mpzis,
    ppd: formattedPpd,
    documents,
    wa_logs: waLogs
  };
}

/**
 * Get Mustahik by unique file_no
 */
export async function getMustahikByFileNo(fileNo) {
  const db = await getDb();
  const row = await db.get('SELECT * FROM mustahik WHERE file_no = $1', [fileNo]);
  return row ? formatMustahikRow(row) : null;
}

/**
 * Create a new mustahik and initial application atomically using RETURNING id
 */
export async function createMustahik(data, creatorId = null, dbOverride = null) {
  const db = dbOverride || await getDb();

  const fileNo = data.file_no || await generateNextFileNo(undefined, db);
  const receivedDate = data.received_date || new Date().toISOString().split('T')[0];

  const monthlyIncome = parseFloat(data.monthly_income) || 0;
  const monthlyExpense = parseFloat(data.monthly_expense) || 0;
  const remainingIncome = data.remaining_income !== undefined
    ? parseFloat(data.remaining_income)
    : (monthlyIncome - monthlyExpense);

  const payload = {
    ...data,
    file_no: fileNo,
    received_date: receivedDate,
    applicant_status: data.applicant_status || 'Perorangan',
    beneficiary_name: data.beneficiary_name || data.name,
    monthly_income: monthlyIncome,
    monthly_expense: monthlyExpense,
    remaining_income: remainingIncome,
    status: data.status || 'Diajukan',
    application_count: data.application_count || 1,
    beneficiary_count: data.beneficiary_count || 1,
  };

  // Strictly allow-list legacy business columns; P0 control columns (workflow_mode,
  // workflow_version, archived_at, etc.) cannot be set by caller payload and are
  // populated by schema defaults ('legacy' and 0) on migrated tables.
  const allowedCols = LEGACY_MUSTAHIK_WRITABLE_COLUMNS;
  const cols = [];
  const placeholders = [];
  const values = [];

  for (const col of allowedCols) {
    if (payload[col] !== undefined) {
      cols.push(col);
      values.push(payload[col]);
      placeholders.push(`$${values.length}`);
    }
  }

  const query = `INSERT INTO mustahik (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`;
  const result = await db.run(query, values);
  const mustahikId = result.lastID;

  // Create initial application
  await db.run(
    `INSERT INTO applications (mustahik_id, application_number, program, request_title, status) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [mustahikId, fileNo, payload.program || '', payload.request_title || '', payload.status]
  );

  return mustahikId;
}

/**
 * Update Mustahik record
 */
export async function updateMustahik(id, data, dbOverride = null, expectedWorkflow = null) {
  const db = dbOverride || await getDb();

  if (data.status !== undefined) {
    if (!expectedWorkflow) {
      const error = new Error('Perubahan status wajib menggunakan keputusan workflow dengan status dan versi yang diharapkan.');
      error.code = 'INVALID_WORKFLOW_EXPECTATION';
      error.status = 422;
      throw error;
    }
    resolvePenyaluranTransition({
      currentStatus: expectedWorkflow.status,
      action: expectedWorkflow.action || (canonicalizePenyaluranStatus(data.status) === 'Ditolak' ? 'reject' : 'approve'),
      targetStatus: data.status,
    });
  }

  // Strictly allow-list legacy business columns; P0 control columns cannot be updated
  const allowedCols = LEGACY_MUSTAHIK_WRITABLE_COLUMNS;

  const updates = [];
  const values = [];

  // Compute remaining_income if income or expense is updated
  let newIncome = data.monthly_income;
  let newExpense = data.monthly_expense;
  if ((newIncome !== undefined || newExpense !== undefined) && data.remaining_income === undefined) {
    const current = await db.get('SELECT monthly_income, monthly_expense FROM mustahik WHERE id = $1', [id]);
    if (current) {
      const inc = newIncome !== undefined ? parseFloat(newIncome) : (parseFloat(current.monthly_income) || 0);
      const exp = newExpense !== undefined ? parseFloat(newExpense) : (parseFloat(current.monthly_expense) || 0);
      data.remaining_income = inc - exp;
    }
  }

  for (const col of allowedCols) {
    if (data[col] !== undefined) {
      values.push(data[col]);
      updates.push(`${col} = $${values.length}`);
    }
  }

  if (updates.length === 0) return false;

  updates.push('updated_at = CURRENT_TIMESTAMP');
  if (expectedWorkflow) {
    updates.push('workflow_version = workflow_version + 1');
  }
  values.push(id);
  const whereParamIdx = values.length;

  let where = `id = $${whereParamIdx}`;
  if (expectedWorkflow) {
    values.push(expectedWorkflow.status, expectedWorkflow.version);
    where += ` AND status = $${values.length - 1} AND workflow_version = $${values.length}`;
  }
  const result = await db.run(`UPDATE mustahik SET ${updates.join(', ')} WHERE ${where}`, values);
  if (expectedWorkflow && result.rowCount !== 1) {
    throw createStaleDecisionError();
  }

  // Sync status to latest application
  if (data.status) {
    const latestApp = await db.get('SELECT id FROM applications WHERE mustahik_id = $1 ORDER BY applied_at DESC LIMIT 1', [id]);
    if (latestApp) {
      await db.run('UPDATE applications SET status = $1 WHERE id = $2', [data.status, latestApp.id]);
    }
  }

  return true;
}

/**
 * Permanently delete mustahik and associated cascade records (DISABLED)
 */
export async function deleteMustahik(id) {
  throw new P0Error('HARD_DELETE_DISABLED', 'Penghapusan data mustahik secara permanen telah dinonaktifkan.', { status: 405 });
}

/**
 * Public application submission with file attachments and WA generation
 */
export async function createPublicApplication(data, files = [], dbOverride = null) {
  const today = new Date().toISOString().split('T')[0];

  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 255) {
    const error = new Error('Nama pemohon wajib diisi, maksimal 255 karakter.');
    Object.assign(error, { status: 422, code: 'INVALID_NAME' });
    throw error;
  }
  const applicantStatus = data.applicant_status === undefined || data.applicant_status === '' ? 'Perorangan' : data.applicant_status;
  if (!['Perorangan', 'Lembaga'].includes(applicantStatus)) {
    const error = new Error('Jenis pemohon harus Perorangan atau Lembaga.');
    error.status = 422;
    error.code = 'INVALID_APPLICANT_STATUS';
    throw error;
  }

  const nik = typeof data.nik === 'string' ? data.nik.trim() : '';
  if ((data.nik != null && typeof data.nik !== 'string') || (nik && !/^\d{16}$/.test(nik))) {
    const error = new Error('NIK harus terdiri dari 16 digit angka.');
    error.status = 422;
    error.code = 'INVALID_NIK';
    throw error;
  }

  let proposedAmount = 0;
  if (data.proposed_amount !== undefined && data.proposed_amount !== null && String(data.proposed_amount).trim() !== '') {
    proposedAmount = typeof data.proposed_amount === 'number' ? data.proposed_amount : typeof data.proposed_amount === 'string' ? Number(data.proposed_amount) : NaN;
    if (!Number.isFinite(proposedAmount) || proposedAmount < 0) {
      const error = new Error('Usulan anggaran harus berupa angka nonnegatif yang valid.');
      error.status = 422;
      error.code = 'INVALID_PROPOSED_AMOUNT';
      throw error;
    }
  } else if (data.recommended_amount !== undefined && data.recommended_amount !== null && String(data.recommended_amount).trim() !== '') {
    proposedAmount = typeof data.recommended_amount === 'number' ? data.recommended_amount : Number(data.recommended_amount);
    if (!Number.isFinite(proposedAmount) || proposedAmount < 0) {
      const error = new Error('Usulan anggaran harus berupa angka nonnegatif yang valid.');
      error.status = 422;
      error.code = 'INVALID_PROPOSED_AMOUNT';
      throw error;
    }
  }

  const monthlyIncome = parseFloat(data.monthly_income) || 0;
  const monthlyExpense = parseFloat(data.monthly_expense) || 0;
  const remainingIncome = monthlyIncome - monthlyExpense;

  const notes = data.notes ? String(data.notes).trim() : '';
  const distributionPurpose = data.distribution_purpose ? String(data.distribution_purpose).trim() : '';
  const fileNo = await generateNextFileNo(undefined, dbOverride);

  const mustahikData = {
    file_no: fileNo,
    received_date: data.received_date || today,
    name: data.name.trim(),
    applicant_status: applicantStatus,
    beneficiary_name: data.beneficiary_name || data.name,
    nik: nik,
    kk_number: data.kk_number || '',
    phone: data.phone || '',
    marital_status: data.marital_status || '',
    pob: data.pob || '',
    dob: data.dob || '',
    occupation: data.occupation || '',
    work_place: data.work_place || '',
    education_level: data.education_level || '',
    address: data.address || '',
    rt_rw: data.rt_rw || '',
    kelurahan: data.kelurahan || '',
    kecamatan: data.kecamatan || '',
    kabupaten_kota: data.kabupaten_kota || 'Kota Tangerang',
    province: data.province || 'Banten',
    house_ownership: data.house_ownership || 'Sendiri',
    family_dependents: parseInt(data.family_dependents, 10) || 0,
    monthly_income: monthlyIncome,
    monthly_expense: monthlyExpense,
    remaining_income: remainingIncome,
    application_count: 1,
    beneficiary_count: parseInt(data.beneficiary_count, 10) || 1,
    payment_method: data.payment_method || 'Transfer',
    bank_account: data.bank_account || '',
    bank_name: data.bank_name || '',
    bank_account_name: data.bank_account_name || data.name || '',
    asnaf: null,
    fund_source: data.fund_source || 'Zakat',
    recommended_amount: proposedAmount,
    approved_amount: 0,
    distribution_purpose: distributionPurpose || notes || data.request_title || '',
    parent_occupation: data.parent_occupation || '',
    desil_score: data.desil_score ? parseInt(data.desil_score, 10) : null,
    program: data.program || 'Kemanusiaan',
    request_title: data.request_title || 'Permohonan Bantuan',
    status: 'Diajukan',
    notes: notes || distributionPurpose || 'Pengajuan mandiri via portal publik BAZNAS'
  };

  return withTransaction(dbOverride || await getDb(), (transactionDb) => persistPublicApplication(mustahikData, files, transactionDb));
}

async function persistPublicApplication(mustahikData, files, transactionDb) {
  const mustahikId = await createMustahik(mustahikData, null, transactionDb);

  // Process uploaded files
  if (files) {
    const fileList = Array.isArray(files) ? files : Object.values(files).flat();
    for (const f of fileList) {
      if (f && f.filename) {
        let docType = f.fieldname || 'Dokumen Pendukung';
        if (docType === 'ktp') docType = 'KTP';
        else if (docType === 'kk') docType = 'Kartu Keluarga';
        else if (docType === 'sktm') docType = 'SKTM / Surat RT-RW';
        else if (docType === 'surat_kelurahan') docType = 'Surat Keterangan Kelurahan (Asli)';
        else if (docType === 'rekomendasi_upz' || docType === 'rekomendasi') docType = 'Rekomendasi UPZ / Masjid (Asli)';
        else if (docType === 'permohonan' || docType === 'bukti_kebutuhan') docType = 'Rincian Kebutuhan / Bukti Tagihan';
        else if (docType === 'surat_permohonan') docType = 'Surat Permohonan';
        else if (docType === 'proposal') docType = 'Proposal Permohonan';

        await addDocument(mustahikId, {
          doc_type: docType,
          filename: f.filename,
          original_name: f.originalname || f.filename,
          file_url: `/uploads/${f.filename}`
        }, transactionDb);
      }
    }
  }

  // Create initial WA notification log
  const waInfo = generateWaMessage('Diajukan', { ...mustahikData, id: mustahikId });
  if (waInfo && mustahikData.phone) {
    await addWaLog({
      mustahik_id: mustahikId,
      phone: mustahikData.phone,
      phase: 'Diajukan',
      message: waInfo.message,
      wa_url: waInfo.url,
      status: 'pending'
    }, transactionDb);
  }

  return {
    id: mustahikId,
    file_no: mustahikData.file_no,
    status: 'Diajukan',
    received_date: mustahikData.received_date,
    name: mustahikData.name,
    program: mustahikData.program,
    wa_url: waInfo?.url || null
  };
}

/**
 * Track status and full timeline by file_no, NIK, or phone using case-insensitive search
 */
export async function findTrackedMustahik(db, query) {
  const value = String(query || '').trim();
  if (!value) return null;
  return db.get(
    `SELECT * FROM mustahik
     WHERE LOWER(file_no) = LOWER($1) OR nik = $2 OR phone = $3 OR kk_number = $4
     ORDER BY id DESC
     LIMIT 1`,
    [value, value, value, value]
  );
}

export async function trackApplication(query) {
  const db = await getDb();
  if (!query) return null;

  const q = String(query).trim();
  const mustahik = await findTrackedMustahik(db, q);

  if (!mustahik) return null;

  const applications = await db.all('SELECT * FROM applications WHERE mustahik_id = $1 ORDER BY applied_at DESC', [mustahik.id]);
  const assessments = await db.all('SELECT * FROM assessments WHERE mustahik_id = $1 ORDER BY created_at DESC', [mustahik.id]);
  const mpzis = await db.all('SELECT * FROM mpzis WHERE mustahik_id = $1 OR application_id IN (SELECT id FROM applications WHERE mustahik_id = $2) ORDER BY created_at DESC', [mustahik.id, mustahik.id]);
  const ppd = await db.all('SELECT * FROM ppd WHERE mustahik_id = $1 OR application_id IN (SELECT id FROM applications WHERE mustahik_id = $2) ORDER BY created_at DESC', [mustahik.id, mustahik.id]);
  const documents = await db.all('SELECT * FROM documents WHERE mustahik_id = $1 ORDER BY uploaded_at DESC', [mustahik.id]);
  const waLogs = await db.all('SELECT * FROM wa_logs WHERE mustahik_id = $1 ORDER BY sent_at DESC', [mustahik.id]);

  const formattedAssessments = assessments.map(a => ({
    ...a,
    photos: safeJsonParse(a.photos, a.photos ? [a.photos] : [])
  }));

  const formattedPpd = ppd.map(p => ({
    ...p,
    fund_source: safeJsonParse(p.fund_source, p.fund_source)
  }));

  // Define 5-phase timeline
  const statusHierarchy = [
    'Diajukan',
    'Verifikasi Administrasi',
    'Survey',
    'Persetujuan MPZIS',
    'Pengajuan Dana (FPD)',
    'Penyaluran Selesai'
  ];

  const currentStatus = mustahik.status || 'Diajukan';
  const isRejected = currentStatus === 'Ditolak';
  const currentIndex = statusHierarchy.indexOf(currentStatus);

  const timeline = [
    {
      phase: 1,
      name: 'Pendaftaran & Berkas',
      description: 'Berkas permohonan telah diterima di sistem BAZNAS.',
      date: mustahik.received_date || mustahik.created_at,
      status: currentIndex >= 0 ? 'completed' : 'pending'
    },
    {
      phase: 2,
      name: 'Verifikasi Administrasi',
      description: 'Pemeriksaan kelengkapan berkas KTP, KK, dan surat permohonan.',
      date: currentIndex >= 1 ? (mustahik.updated_at || mustahik.created_at) : null,
      status: isRejected ? 'rejected' : (currentIndex >= 1 ? 'completed' : (currentIndex === 0 ? 'active' : 'pending'))
    },
    {
      phase: 3,
      name: 'Survey & Penilaian Lapangan',
      description: formattedAssessments[0]
        ? `Survey lapangan oleh ${formattedAssessments[0].surveyor_name || 'Petugas'} (${formattedAssessments[0].recommendation || 'Diproses'})`
        : 'Survey faktual ke kediaman mustahik (Form F-BPP/04).',
      date: mustahik.survey_date || formattedAssessments[0]?.survey_date || null,
      status: isRejected ? 'rejected' : (currentIndex >= 2 ? 'completed' : (currentIndex === 1 ? 'active' : 'pending'))
    },
    {
      phase: 4,
      name: 'Persetujuan MPZIS & Pengajuan Dana',
      description: mustahik.approved_amount
        ? `Disetujui MPZIS: Rp ${Number(mustahik.approved_amount).toLocaleString('id-ID')} (Form F-BPP/06 & F-PKP/03)`
        : 'Sidang pleno MPZIS dan penerbitan Form Pengajuan Dana.',
      date: mustahik.mpzis_date || mpzis[0]?.mpzis_date || null,
      status: isRejected ? 'rejected' : (currentIndex >= 4 ? 'completed' : (currentIndex === 3 ? 'active' : 'pending'))
    },
    {
      phase: 5,
      name: 'Penyaluran Dana',
      description: mustahik.disbursement_date
        ? `Dana telah disalurkan pada ${mustahik.disbursement_date} via ${mustahik.payment_method || 'Transfer'}.`
        : 'Pencairan dan serah terima dana bantuan ke mustahik.',
      date: mustahik.disbursement_date || formattedPpd[0]?.disbursement_date || null,
      status: isRejected ? 'rejected' : (currentIndex >= 5 ? 'completed' : (currentIndex === 4 ? 'active' : 'pending'))
    }
  ];

  return {
    mustahik: formatMustahikRow(mustahik),
    status: currentStatus,
    is_rejected: isRejected,
    rejection_reason: mustahik.rejection_reason || '',
    timeline,
    applications,
    assessments: formattedAssessments,
    mpzis,
    ppd: formattedPpd,
    documents,
    wa_logs: waLogs
  };
}

/**
 * Add Assessment (F-BPP/04) with RETURNING id and JSON-safe photo array serialization
 */
export async function addAssessment(mustahikId, data, actor = null, dbOverride = null) {
  const db = dbOverride || await getDb();
  return withTransaction(db, (transactionDb) => addAssessmentInTransaction(mustahikId, data, actor, transactionDb));
}

async function addAssessmentInTransaction(mustahikId, data, actor, db) {
  const mustahik = await db.get('SELECT * FROM mustahik WHERE id = $1', [mustahikId]);
  if (!mustahik) throw new Error('Mustahik tidak ditemukan');
  assertExpectedWorkflowState(mustahik, data);
  resolvePenyaluranTransition({ currentStatus: mustahik.status, action: 'approve', targetStatus: 'Survey' });

  const latestApp = await db.get('SELECT id FROM applications WHERE mustahik_id = $1 ORDER BY applied_at DESC LIMIT 1', [mustahikId]);
  const applicationId = latestApp?.id || data.application_id || null;

  let photosJson = null;
  if (data.photos !== undefined && data.photos !== null) {
    if (typeof data.photos === 'string') {
      photosJson = data.photos;
    } else if (Array.isArray(data.photos) || typeof data.photos === 'object') {
      photosJson = JSON.stringify(data.photos);
    }
  }

  const result = await db.run(
    `INSERT INTO assessments (
      mustahik_id, application_id, surveyor_name, surveyor_phone, survey_date, survey_method,
      narrative_family, narrative_income, narrative_request, narrative_conclusion,
      house_index, asset_index, income_index, spiritual_score, overall_score,
      priority, recommendation, notes, photos
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING id`,
    [
      mustahikId,
      applicationId,
      data.surveyor_name || null,
      data.surveyor_phone || null,
      data.survey_date || new Date().toISOString().split('T')[0],
      data.survey_method || 'On Location',
      data.narrative_family || null,
      data.narrative_income || null,
      data.narrative_request || null,
      data.narrative_conclusion || null,
      data.house_index !== undefined && data.house_index !== null ? parseInt(data.house_index, 10) : null,
      data.asset_index !== undefined && data.asset_index !== null ? parseInt(data.asset_index, 10) : null,
      data.income_index !== undefined && data.income_index !== null ? parseInt(data.income_index, 10) : null,
      data.spiritual_score !== undefined && data.spiritual_score !== null ? parseInt(data.spiritual_score, 10) : null,
      data.overall_score !== undefined && data.overall_score !== null ? parseFloat(data.overall_score) : null,
      data.priority ? String(data.priority) : null,
      data.recommendation || data.survey_recommendation || 'Layak',
      data.notes || data.survey_notes || null,
      photosJson
    ]
  );

  // Update mustahik with survey details and status = 'Survey'
  const monthlyInc = data.monthly_income !== undefined && data.monthly_income !== null ? parseFloat(data.monthly_income) : undefined;
  const monthlyExp = data.monthly_expense !== undefined && data.monthly_expense !== null ? parseFloat(data.monthly_expense) : undefined;
  const remInc = (monthlyInc !== undefined && monthlyExp !== undefined) ? (monthlyInc - monthlyExp) : undefined;

  const updateFields = {
    status: 'Survey',
    survey_date: data.survey_date || new Date().toISOString().split('T')[0],
    surveyor_name: data.surveyor_name,
    surveyor_phone: data.surveyor_phone,
    survey_recommendation: data.recommendation || data.survey_recommendation,
    survey_notes: data.notes || data.survey_notes,
    house_ownership: data.house_ownership,
    family_dependents: data.family_dependents !== undefined && data.family_dependents !== null ? parseInt(data.family_dependents, 10) : undefined,
    monthly_income: monthlyInc,
    monthly_expense: monthlyExp,
    remaining_income: remInc,
    house_index: data.house_index !== undefined && data.house_index !== null ? parseInt(data.house_index, 10) : undefined,
    asset_index: data.asset_index !== undefined && data.asset_index !== null ? parseInt(data.asset_index, 10) : undefined,
    income_index: data.income_index !== undefined && data.income_index !== null ? parseInt(data.income_index, 10) : undefined,
    spiritual_score: data.spiritual_score !== undefined && data.spiritual_score !== null ? parseInt(data.spiritual_score, 10) : undefined,
    overall_score: data.overall_score !== undefined && data.overall_score !== null ? parseFloat(data.overall_score) : undefined,
    priority: data.priority ? String(data.priority) : undefined,
    recommended_amount: data.recommended_amount !== undefined && data.recommended_amount !== null ? parseFloat(data.recommended_amount) : undefined,
    desil_score: data.desil_score !== undefined && data.desil_score !== null ? parseInt(data.desil_score, 10) : undefined
  };
  updateFields.workflow_version = Number(mustahik.workflow_version || 0) + 1;

  await updateMustahik(mustahikId, updateFields, db, {
    status: mustahik.status,
    version: Number(mustahik.workflow_version || 0),
    action: 'approve',
  });

  await appendMustahikWorkflowAudit(db, {
    mustahikId,
    previousStatus: mustahik.status,
    nextStatus: 'Survey',
    action: 'approve',
    note: String(data.notes || data.survey_notes || 'Hasil survey disimpan.').trim(),
    actor,
    approvedAmount: null,
  });

  return result.lastID;
}

/**
 * Add MPZIS approval (F-BPP/06) with RETURNING id
 */
export async function addMpzis(mustahikIdOrData, maybeData, actor = null, dbOverride = null) {
  const db = dbOverride || await getDb();
  return withTransaction(db, (transactionDb) => addMpzisInTransaction(mustahikIdOrData, maybeData, actor, transactionDb));
}

async function addMpzisInTransaction(mustahikIdOrData, maybeData, actor, db) {
  let mustahikId = typeof mustahikIdOrData === 'object' ? mustahikIdOrData.mustahik_id : mustahikIdOrData;
  let data = typeof mustahikIdOrData === 'object' ? mustahikIdOrData : maybeData;

  let applicationId = data.application_id;
  if (!applicationId && mustahikId) {
    const latestApp = await db.get('SELECT id FROM applications WHERE mustahik_id = $1 ORDER BY applied_at DESC LIMIT 1', [mustahikId]);
    applicationId = latestApp?.id || null;
  }

  if (!mustahikId && applicationId) {
    const app = await db.get('SELECT mustahik_id FROM applications WHERE id = $1', [applicationId]);
    mustahikId = app?.mustahik_id || null;
  }

  const mustahik = mustahikId ? await db.get('SELECT * FROM mustahik WHERE id = $1', [mustahikId]) : null;
  if (mustahikId && !mustahik) throw new Error('Mustahik tidak ditemukan');
  if (mustahik) {
    assertExpectedWorkflowState(mustahik, data);
    resolvePenyaluranTransition({ currentStatus: mustahik.status, action: 'approve', targetStatus: 'Persetujuan MPZIS' });
  }

  const result = await db.run(
    `INSERT INTO mpzis (
      mustahik_id, application_id, form_number, mpzis_date, program_classification, purpose,
      asnaf, fund_source, recipient_name, recipient_type, beneficiary_count, total_amount,
      proposed_by, examined_by, ashnaf_verifier, responsible, approved_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING id`,
    [
      mustahikId,
      applicationId,
      data.form_number || '',
      data.mpzis_date || new Date().toISOString().split('T')[0],
      data.program_classification || '',
      data.purpose || '',
      data.asnaf || 'Fakir Miskin',
      data.fund_source || 'Zakat',
      data.recipient_name || '',
      data.recipient_type || 'Individu',
      data.beneficiary_count ? parseInt(data.beneficiary_count, 10) : 1,
      data.total_amount ? parseFloat(data.total_amount) : 0,
      data.proposed_by || '',
      data.examined_by || '',
      data.ashnaf_verifier || '',
      data.responsible || '',
      data.approved_by || ''
    ]
  );

  // Update mustahik
  if (mustahikId) {
    await updateMustahik(mustahikId, {
      status: 'Persetujuan MPZIS',
      approved_amount: data.total_amount ? parseFloat(data.total_amount) : undefined,
      mpzis_date: data.mpzis_date || new Date().toISOString().split('T')[0],
      asnaf: data.asnaf,
      fund_source: data.fund_source,
      distribution_purpose: data.purpose,
      beneficiary_count: data.beneficiary_count ? parseInt(data.beneficiary_count, 10) : undefined,
      workflow_version: Number(mustahik.workflow_version || 0) + 1,
    }, db, {
      status: mustahik.status,
      version: Number(mustahik.workflow_version || 0),
      action: 'approve',
    });
    await appendMustahikWorkflowAudit(db, {
      mustahikId,
      previousStatus: mustahik.status,
      nextStatus: 'Persetujuan MPZIS',
      action: 'approve',
      note: String(data.notes || 'Persetujuan MPZIS disimpan.').trim(),
      actor,
      approvedAmount: data.total_amount || null,
    });
  }

  return result.lastID;
}

/**
 * Add PPD disbursement request (F-PKP/03) with RETURNING id and JSON-safe fund_source
 */
export async function addPpd(mustahikIdOrData, maybeData, actor = null, dbOverride = null) {
  const db = dbOverride || await getDb();
  return withTransaction(db, (transactionDb) => addPpdInTransaction(mustahikIdOrData, maybeData, actor, transactionDb));
}

async function addPpdInTransaction(mustahikIdOrData, maybeData, actor, db) {
  let mustahikId = typeof mustahikIdOrData === 'object' ? mustahikIdOrData.mustahik_id : mustahikIdOrData;
  let data = typeof mustahikIdOrData === 'object' ? mustahikIdOrData : maybeData;

  let applicationId = data.application_id;
  if (!applicationId && mustahikId) {
    const latestApp = await db.get('SELECT id FROM applications WHERE mustahik_id = $1 ORDER BY applied_at DESC LIMIT 1', [mustahikId]);
    applicationId = latestApp?.id || null;
  }

  if (!mustahikId && applicationId) {
    const app = await db.get('SELECT mustahik_id FROM applications WHERE id = $1', [applicationId]);
    mustahikId = app?.mustahik_id || null;
  }

  const mustahik = mustahikId ? await db.get('SELECT * FROM mustahik WHERE id = $1', [mustahikId]) : null;
  if (mustahikId && !mustahik) throw new Error('Mustahik tidak ditemukan');
  const nextStatus = data.disbursement_date ? 'Penyaluran Selesai' : 'Pengajuan Dana (FPD)';
  if (mustahik) {
    assertExpectedWorkflowState(mustahik, data);
    resolvePenyaluranTransition({ currentStatus: mustahik.status, action: 'approve', targetStatus: nextStatus });
  }

  const fundSourceVal = data.fund_source
    ? (Array.isArray(data.fund_source) ? JSON.stringify(data.fund_source) : String(data.fund_source))
    : 'Zakat';

  const result = await db.run(
    `INSERT INTO ppd (
      mustahik_id, application_id, form_number, ppd_number, transaction_number, requester_name,
      requester_role, requester_department, amount, amount_in_words, purpose, fund_source,
      bank_account_info, payment_type, disbursement_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING id`,
    [
      mustahikId,
      applicationId,
      data.form_number || '',
      data.ppd_number || data.form_number || '',
      data.transaction_number || '',
      data.requester_name || '',
      data.requester_role || '',
      data.requester_department || '',
      data.amount ? parseFloat(data.amount) : 0,
      data.amount_in_words || '',
      data.purpose || '',
      fundSourceVal,
      data.bank_account_info || '',
      data.payment_type || 'Transfer',
      data.disbursement_date || null
    ]
  );

  // Update status based on disbursement_date
  if (mustahikId) {
    await updateMustahik(mustahikId, {
      status: nextStatus,
      ppd_number: data.ppd_number || data.form_number,
      disbursement_date: data.disbursement_date || undefined,
      payment_method: data.payment_type || undefined,
      workflow_version: Number(mustahik.workflow_version || 0) + 1,
    }, db, {
      status: mustahik.status,
      version: Number(mustahik.workflow_version || 0),
      action: 'approve',
    });
    await appendMustahikWorkflowAudit(db, {
      mustahikId,
      previousStatus: mustahik.status,
      nextStatus,
      action: 'approve',
      note: String(data.notes || 'Pengajuan dana disimpan.').trim(),
      actor,
      approvedAmount: data.amount || null,
    });
  }

  return result.lastID;
}

/**
 * Add document attachment with RETURNING id
 */
export async function addDocument(mustahikId, docData, dbOverride = null) {
  const db = dbOverride || await getDb();
  const result = await db.run(
    `INSERT INTO documents (mustahik_id, doc_type, filename, original_name, file_url, uploaded_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     RETURNING id`,
    [mustahikId, docData.doc_type, docData.filename, docData.original_name, docData.file_url]
  );
  return result.lastID;
}

/**
 * Get documents for a mustahik
 */
export async function getDocuments(mustahikId) {
  const db = await getDb();
  return db.all('SELECT * FROM documents WHERE mustahik_id = $1 ORDER BY uploaded_at DESC', [mustahikId]);
}

/**
 * Resolve a stored upload to its owning operational scope.  Downloads must
 * use metadata rather than a role-only directory check so a user in one
 * division cannot fetch another division's evidence by guessing a filename.
 */
export async function findUploadMetadata(filename, dbOverride = null) {
  const db = dbOverride || await getDb();
  const fileUrl = `/uploads/${filename}`;

  const document = await db.get(
    `SELECT filename, original_name, file_url
       FROM documents
      WHERE filename = $1 OR file_url = $2
      LIMIT 1`,
    [filename, fileUrl]
  );
  const evidence = await db.get(
    `SELECT evidence_url
       FROM penerimaan_transactions
      WHERE evidence_url = $1
      LIMIT 1`,
    [fileUrl]
  );
  if (document && evidence) {
    return { ...document, evidence_url: evidence.evidence_url, scope: 'conflict' };
  }
  if (document) {
    return { ...document, scope: 'penyaluran' };
  }
  if (evidence) {
    return { filename, file_url: evidence.evidence_url, scope: 'penerimaan' };
  }

  return null;
}

/**
 * Add WhatsApp communication log with RETURNING id
 */
export async function addWaLog(logData, dbOverride = null) {
  const db = dbOverride || await getDb();
  const result = await db.run(
    `INSERT INTO wa_logs (mustahik_id, phone, phase, message, wa_url, status, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     RETURNING id`,
    [
      logData.mustahik_id,
      logData.phone,
      logData.phase,
      logData.message,
      logData.wa_url,
      logData.status || 'sent'
    ]
  );
  return result.lastID;
}

async function appendMustahikWorkflowAudit(db, {
  mustahikId,
  previousStatus,
  nextStatus,
  action,
  note,
  actor = null,
  approvedAmount = null,
}) {
  const actorName = actor?.name || 'Petugas Penyaluran';
  await db.run(
    `INSERT INTO approval_decisions (mustahik_id, stage, action, previous_status, next_status, note, approved_amount, actor_id, actor_name, actor_role, actor_level, actor_division, prepared_by_id, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      mustahikId, previousStatus, action, previousStatus, nextStatus, note || 'Keputusan workflow disimpan.', approvedAmount,
      actor?.id || null, actorName, actor?.role || 'penyaluran', actor?.level || 'staff', actor?.division || null,
      null, crypto.randomUUID(),
    ],
  );
  await db.run(
    `INSERT INTO activity_logs (mustahik_id, actor_name, action_type, title, description, old_status, new_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [mustahikId, actorName, action.toUpperCase(), `Tahap ${nextStatus}`, note || 'Keputusan workflow disimpan.', previousStatus, nextStatus],
  );
}

/**
 * Get WhatsApp logs for a mustahik
 */
export async function getWaLogs(mustahikId) {
  const db = await getDb();
  return db.all('SELECT * FROM wa_logs WHERE mustahik_id = $1 ORDER BY sent_at DESC', [mustahikId]);
}

/**
 * Bot session storage for stateful conversation tracking
 */
export async function getBotSession(chatId) {
  const db = await getDb();
  const row = await db.get('SELECT * FROM bot_sessions WHERE chat_id = $1', [chatId]);
  if (!row) return null;
  return {
    ...row,
    temp_data: safeJsonParse(row.temp_data, row.temp_data)
  };
}

export async function saveBotSession(chatId, state, tempData) {
  const db = await getDb();
  const serialized = typeof tempData === 'object' && tempData !== null ? JSON.stringify(tempData) : tempData;
  const result = await db.run(
    `INSERT INTO bot_sessions (chat_id, state, temp_data, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (chat_id) DO UPDATE SET
       state = EXCLUDED.state,
       temp_data = EXCLUDED.temp_data,
       updated_at = CURRENT_TIMESTAMP
     RETURNING chat_id`,
    [chatId, state || 'idle', serialized]
  );
  return result.lastID || chatId;
}

/**
 * Formats Indonesian phone numbers to 628... format for WhatsApp wa.me links
 */
export function formatWaPhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (!cleaned.startsWith('62') && cleaned.length > 5) {
    cleaned = '62' + cleaned;
  }
  return cleaned;
}

/**
 * Generates automated 5-phase WhatsApp notification template text
 */
export function generateWaMessage(phase, mustahik) {
  const nama = mustahik.name || 'Mustahik';
  const fileNo = mustahik.file_no || '-';
  const program = mustahik.program || 'Bantuan BAZNAS';
  const nominal = mustahik.approved_amount ? `Rp ${Number(mustahik.approved_amount).toLocaleString('id-ID')}` : 'Rp -';
  const date = mustahik.received_date || new Date().toISOString().split('T')[0];
  const disburseDate = mustahik.disbursement_date || new Date().toISOString().split('T')[0];
  const paymentMethod = mustahik.payment_method || 'Transfer';

  let message = '';

  switch (phase) {
    case 'Diajukan':
    case 'Fase 1':
      message = `Assalamu'alaikum Wr. Wb.\n\nBapak/Ibu *${nama}*,\n\nPengajuan permohonan bantuan BAZNAS Kota Tangerang telah kami terima:\n📋 No. Berkas: *${fileNo}*\n🏷️ Program: ${program}\n📅 Tanggal: ${date}\n\nBerkas Anda sedang dalam antrean verifikasi administrasi. Anda dapat mengecek status perkembangan berkas secara berkala melalui tautan tracking BAZNAS.\n\nTerima kasih.\n_BAZNAS Kota Tangerang - Melayani Ummat_`;
      break;

    case 'Verifikasi Administrasi':
    case 'Fase 2':
      message = `Assalamu'alaikum Wr. Wb.\n\nBapak/Ibu *${nama}*,\n\nKabar baik, berkas pengajuan No. *${fileNo}* telah *LOLOS Verifikasi Administrasi*. Tim Pendistribusian BAZNAS Kota Tangerang akan segera menjadwalkan tahap survey lapangan / verifikasi faktual.\n\nMohon pastikan nomor telepon ini tetap aktif.\n\nTerima kasih.\n_BAZNAS Kota Tangerang_`;
      break;

    case 'Survey':
    case 'Fase 3':
      message = `Assalamu'alaikum Wr. Wb.\n\nBapak/Ibu *${nama}*,\n\nProses survey lapangan dan penilaian kelayakan (Form F-BPP/04) untuk No. Berkas *${fileNo}* telah dilaksanakan oleh petugas BAZNAS (${mustahik.surveyor_name || 'Petugas Survey'}). Hasil survey saat ini sedang diajukan ke Sidang Pleno MPZIS untuk penetapan bantuan.\n\nTerima kasih atas kerja samanya.\n_BAZNAS Kota Tangerang_`;
      break;

    case 'Persetujuan MPZIS':
    case 'Pengajuan Dana (FPD)':
    case 'Fase 4':
      message = `Assalamu'alaikum Wr. Wb.\n\nAlhamdulillah! Pengajuan bantuan No. Berkas *${fileNo}* atas nama *${nama}* telah *DISETUJUI* dalam Sidang MPZIS BAZNAS Kota Tangerang.\n\n💰 Nominal Disetujui: *${nominal}*\n📝 Formulir PPD: Sedang proses penerbitan pencairan dana.\n\nTerima kasih.\n_BAZNAS Kota Tangerang_`;
      break;

    case 'Penyaluran Selesai':
    case 'Fase 5':
      message = `Assalamu'alaikum Wr. Wb.\n\nAlhamdulillah! Dana bantuan BAZNAS Kota Tangerang untuk No. Berkas *${fileNo}* atas nama *${nama}* sebesar *${nominal}* telah *SELESAI DISALURKAN* pada tanggal ${disburseDate} melalui metode *${paymentMethod}*.\n\nSemoga bantuan ini membawa keberkahan dan manfaat bagi keluarga Bapak/Ibu.\n\n_Wassalamu'alaikum Wr. Wb._\n_BAZNAS Kota Tangerang_`;
      break;

    case 'Ditolak':
      message = `Assalamu'alaikum Wr. Wb.\n\nBapak/Ibu *${nama}*,\n\nMohon maaf, berdasarkan hasil evaluasi tim BAZNAS Kota Tangerang, pengajuan permohonan No. Berkas *${fileNo}* saat ini belum dapat kami setujui dikarenakan: *${mustahik.rejection_reason || 'Belum memenuhi kriteria prioritas asnaf zakat'}*.\n\nTerima kasih atas pengertian Bapak/Ibu.\n_BAZNAS Kota Tangerang_`;
      break;

    default:
      message = `Assalamu'alaikum Wr. Wb. Bapak/Ibu *${nama}*, update status permohonan bantuan No. Berkas *${fileNo}* saat ini: *${mustahik.status}*. Terima kasih. - BAZNAS Kota Tangerang`;
      break;
  }

  const phone = formatWaPhone(mustahik.phone);
  const encoded = encodeURIComponent(message);
  const url = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;

  return {
    phone,
    phase,
    message,
    url
  };
}

/**
 * Export all 60 master columns
 */
export async function exportMustahikData() {
  const db = await getDb();
  const rows = await db.all('SELECT * FROM mustahik ORDER BY id ASC');
  return rows.map(formatMustahikRow);
}

export async function getStatusByFileNo(fileNo) {
  return trackApplication(fileNo);
}

/**
 * Fast aggregate statistics for Mustahik (KPI cards, charts, breakdowns)
 */
export async function getMustahikStats() {
  const db = await getDb();

  const summary = await db.get(`
    SELECT
      COUNT(*) as total_mustahik,
      COALESCE(SUM(approved_amount), 0) as total_approved_amount,
      COALESCE(SUM(recommended_amount), 0) as total_recommended_amount,
      COALESCE(SUM(beneficiary_count), 0) as total_beneficiaries,
      COALESCE(AVG(monthly_income), 0) as avg_income,
      COALESCE(AVG(monthly_expense), 0) as avg_expense
    FROM mustahik
    WHERE archived_at IS NULL
  `);

  const statusRows = await db.all(`
    SELECT status, COUNT(*) as count
    FROM mustahik
    WHERE status IS NOT NULL AND status != '' AND archived_at IS NULL
    GROUP BY status
    ORDER BY count DESC
  `);

  const programRows = await db.all(`
    SELECT program, COUNT(*) as count, COALESCE(SUM(approved_amount), 0) as total_amount
    FROM mustahik
    WHERE program IS NOT NULL AND program != ''
    GROUP BY program
    ORDER BY count DESC
  `);

  const asnafRows = await db.all(`
    SELECT asnaf, COUNT(*) as count
    FROM mustahik
    WHERE asnaf IS NOT NULL AND asnaf != ''
    GROUP BY asnaf
    ORDER BY count DESC
  `);

  const kecamatanRows = await db.all(`
    SELECT kecamatan, COUNT(*) as count
    FROM mustahik
    WHERE kecamatan IS NOT NULL AND kecamatan != ''
    GROUP BY kecamatan
    ORDER BY count DESC
    LIMIT 15
  `);

  return {
    summary: {
      total_mustahik: parseInt(summary?.total_mustahik || 0, 10),
      total_approved_amount: parseFloat(summary?.total_approved_amount || 0),
      total_recommended_amount: parseFloat(summary?.total_recommended_amount || 0),
      total_beneficiaries: parseInt(summary?.total_beneficiaries || 0, 10),
      avg_income: Math.round(parseFloat(summary?.avg_income || 0)),
      avg_expense: Math.round(parseFloat(summary?.avg_expense || 0))
    },
    by_status: statusRows.map(r => ({ status: r.status, count: parseInt(r.count, 10) })),
    by_program: programRows.map(r => ({ program: r.program, count: parseInt(r.count, 10), total_amount: parseFloat(r.total_amount) })),
    by_asnaf: asnafRows.map(r => ({ asnaf: r.asnaf, count: parseInt(r.count, 10) })),
    by_kecamatan: kecamatanRows.map(r => ({ kecamatan: r.kecamatan, count: parseInt(r.count, 10) })),
    generated_at: new Date().toISOString()
  };
}

/**
 * Enterprise aggregate data overview across all entities
 */
export async function getDataOverview() {
  const db = await getDb();

  const [
    mustahikCount,
    appsCount,
    assessmentsCount,
    mpzisCount,
    ppdCount,
    docsCount,
    waCount,
    sessionsCount,
    disbursedRow
  ] = await Promise.all([
    db.get('SELECT COUNT(*) as count FROM mustahik'),
    db.get('SELECT COUNT(*) as count FROM applications'),
    db.get('SELECT COUNT(*) as count FROM assessments'),
    db.get('SELECT COUNT(*) as count FROM mpzis'),
    db.get('SELECT COUNT(*) as count FROM ppd'),
    db.get('SELECT COUNT(*) as count FROM documents'),
    db.get('SELECT COUNT(*) as count FROM wa_logs'),
    db.get('SELECT COUNT(*) as count FROM bot_sessions'),
    db.get(`
      SELECT
        COALESCE(SUM(approved_amount), 0) as approved_total,
        COALESCE(SUM(CASE WHEN disbursement_date IS NOT NULL AND disbursement_date != '' THEN approved_amount ELSE 0 END), 0) as disbursed_total
      FROM mustahik
    `)
  ]);

  const approvedTotal = parseFloat(disbursedRow?.approved_total || 0);
  const disbursedTotal = parseFloat(disbursedRow?.disbursed_total || 0);

  return {
    counts: {
      mustahik: parseInt(mustahikCount?.count || 0, 10),
      applications: parseInt(appsCount?.count || 0, 10),
      assessments: parseInt(assessmentsCount?.count || 0, 10),
      mpzis: parseInt(mpzisCount?.count || 0, 10),
      ppd: parseInt(ppdCount?.count || 0, 10),
      documents: parseInt(docsCount?.count || 0, 10),
      wa_logs: parseInt(waCount?.count || 0, 10),
      bot_sessions: parseInt(sessionsCount?.count || 0, 10)
    },
    finances: {
      total_approved: approvedTotal,
      total_disbursed: disbursedTotal,
      pending_disbursement: Math.max(0, approvedTotal - disbursedTotal)
    },
    system_health: {
      status: 'healthy',
      engine: 'PostgreSQL Turbo Pool',
      cache_status: 'active'
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * ====================================================================
 * USER & AUTHENTICATION REPOSITORY
 * ====================================================================
 */

export async function findUserByEmail(email) {
  if (!email) return null;
  const db = await getDb();
  const user = await db.get(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE',
    [email.trim()]
  );
  return user || null;
}

export async function findUserById(id) {
  if (!id) return null;
  const db = await getDb();
  const user = await db.get(
    'SELECT id, name, email, role, division, level, avatar, is_active, last_login, created_at FROM users WHERE id = $1',
    [id]
  );
  return user || null;
}

export async function updateUserLastLogin(id) {
  if (!id) return;
  const db = await getDb();
  await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [id]);
}

export async function updateUserAccess(id, access = {}) {
  const db = await getDb();
  const allowedLevels = new Set(['staff', 'leader', 'admin']);
  const updates = [];
  const values = [];

  if (access.level !== undefined) {
    if (!allowedLevels.has(access.level)) {
      const error = new Error('Level akses tidak valid.');
      error.status = 422;
      throw error;
    }
    values.push(access.level);
    updates.push(`level = $${values.length}`);
  }

  if (access.division !== undefined) {
    const division = String(access.division || '').trim();
    if (!division) {
      const error = new Error('Divisi tidak boleh kosong.');
      error.status = 422;
      throw error;
    }
    values.push(division);
    updates.push(`division = $${values.length}`);
  }

  if (access.is_active !== undefined) {
    if (typeof access.is_active !== 'boolean') {
      const error = new Error('Status aktif harus bernilai boolean.');
      error.status = 422;
      throw error;
    }
    values.push(access.is_active);
    updates.push(`is_active = $${values.length}`);
  }

  if (updates.length === 0) {
    const error = new Error('Tidak ada perubahan akses yang dikirim.');
    error.status = 422;
    throw error;
  }

  values.push(id);
  const result = await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
  if (result.rowCount !== 1) return null;
  return findUserById(id);
}

export async function createAuthSession({ jti, userId, expiresAt }) {
  const db = await getDb();
  await db.run(
    `INSERT INTO auth_sessions (jti, user_id, expires_at) VALUES ($1, $2, $3)`,
    [jti, userId, expiresAt]
  );
}

export async function isAuthSessionActive(jti, userId) {
  const db = await getDb();
  const row = await db.get(
    `SELECT jti FROM auth_sessions WHERE jti = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
    [jti, userId]
  );
  return Boolean(row);
}

export async function revokeAuthSession(jti, userId) {
  const db = await getDb();
  await db.run(
    `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE jti = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [jti, userId]
  );
}

export async function listUsers() {
  const db = await getDb();
  const users = await db.all(
    'SELECT id, name, email, role, division, level, avatar, is_active, last_login, created_at FROM users ORDER BY id ASC'
  );
  return users || [];
}

export async function createUser(userData) {
  const db = await getDb();
  const res = await db.run(
    `INSERT INTO users (name, email, password_hash, role, division, level, avatar, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE) RETURNING id`,
    [
      userData.name,
      userData.email.toLowerCase().trim(),
      userData.password_hash,
      userData.role || 'penyaluran',
      userData.division || 'Divisi Penyaluran',
      userData.level || 'staff',
      userData.avatar || null
    ]
  );
  return res.lastID;
}

/**
 * ====================================================================
 * DOMAIN PENYALURAN REPOSITORY FUNCTIONS
 * ====================================================================
 */

/**
 * 1. Overview & Dashboard Penyaluran (Period-aware)
 */
export function getPeriodStart(period, now = new Date()) {
  const days = { '7d': 7, '30d': 30, '1y': 365 }[period];
  if (!days) throw new Error('Periode tidak valid');
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days);
  return start.toISOString().slice(0, 10);
}

const REPORT_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function normalizeReportDate(value) {
  const text = String(value || '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})?)?$/.exec(text);
  const local = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(text);
  if (!iso && !local) return null;
  const year = Number(iso ? iso[1] : local[3]);
  const month = iso ? Number(iso[2]) : REPORT_MONTHS.findIndex(name =>
    [name.toLowerCase(), name.slice(0, 3).toLowerCase()].includes(local[2].toLowerCase())) + 1;
  const day = Number(iso ? iso[3] : local[1]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Reject impossible calendar dates instead of allowing Date to roll them over.
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== date) return null;
  if (!iso?.[4]) return date;
  // Timezone-less stored timestamps use UTC, matching the rolling date range.
  const timestamp = new Date(`${date}T${iso[4]}${iso[5] || 'Z'}`);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString().slice(0, 10);
}

function getReportRange(period, now) {
  const end = now.toISOString().slice(0, 10);
  if (!period || ['all', 'semua'].includes(String(period).trim().toLowerCase())) {
    return { start: '0001-01-01', end, aliases: null };
  }
  if (['7d', '30d', '1y'].includes(period)) {
    return { start: getPeriodStart(period, now), end, aliases: null };
  }
  const value = String(period).trim();
  const iso = /^(\d{4})-(\d{2})$/.exec(value);
  const named = /^([A-Za-z]+) (\d{4})$/.exec(value);
  const year = iso ? Number(iso[1]) : named ? Number(named[2]) : 0;
  const month = iso ? Number(iso[2]) : named ? REPORT_MONTHS.findIndex(m => m.toLowerCase() === named[1].toLowerCase()) + 1 : 0;
  if (year < 1000 || month < 1 || month > 12) throw new Error('Periode tidak valid');
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start: `${prefix}-01`, end: monthEnd < end ? monthEnd : end, aliases: [prefix, `${REPORT_MONTHS[month - 1]} ${year}`] };
}

const REALIZED_STATUS_SQL = "'Disetujui', 'Pengajuan Dana (FPD)', 'Pengajuan Dana (PPD)', 'PPD', 'FPD', 'Penyaluran Selesai', 'Selesai'";

// Mustahik is the canonical realized ledger here. PPD mirrors the same payment;
// summing both would count one disbursement twice. Dates are stored as ISO text.
async function getRealizedAggregates(db, start, end) {
  const where = `status IN (${REALIZED_STATUS_SQL})
    AND disbursement_date >= $1 AND disbursement_date <= $2`;
  const params = [start, end];
  const totals = await db.get(`SELECT COUNT(*) AS count,
    COALESCE(SUM(approved_amount), 0) AS amount,
    COALESCE(SUM(beneficiary_count), 0) AS beneficiaries
    FROM mustahik WHERE ${where}`, params);
  const monthly = await db.all(`SELECT SUBSTR(disbursement_date, 1, 7) AS month,
    COUNT(*) AS count, COALESCE(SUM(approved_amount), 0) AS amount
    FROM mustahik WHERE ${where}
    GROUP BY SUBSTR(disbursement_date, 1, 7) ORDER BY month`, params);
  const groupBy = async column => db.all(`SELECT COALESCE(NULLIF(${column}, ''), 'Belum diklasifikasikan') AS name,
    COUNT(*) AS count, COALESCE(SUM(approved_amount), 0) AS amount,
    COALESCE(SUM(beneficiary_count), 0) AS beneficiaries
    FROM mustahik WHERE ${where}
    GROUP BY COALESCE(NULLIF(${column}, ''), 'Belum diklasifikasikan') ORDER BY name`, params);
  return {
    count: Number(totals.count), amount: Number(totals.amount), beneficiaries: Number(totals.beneficiaries),
    monthly, asnaf: await groupBy('asnaf'), programs: await groupBy('program'),
  };
}

export async function getPenyaluranOverview(period = '30d', dbOverride = null, now = new Date()) {
  const start = getPeriodStart(period, now);
  const end = now.toISOString().slice(0, 10);
  const db = dbOverride || await getDb();
  const realized = await getRealizedAggregates(db, start, end);
  const asnafColorMap = {
    Fakir: '#059669',
    Miskin: '#10b981',
    Fisabilillah: '#3b82f6',
    'Ibnu Sabil': '#8b5cf6',
    Gharimin: '#f59e0b',
    Muallaf: '#ec4899',
    Riqab: '#6366f1',
    Amil: '#14b8a6'
  };

  const asnafBreakdown = realized.asnaf.map(r => ({
    name: r.name,
    count: Number(r.count),
    amount: Number(r.amount),
    percentage: realized.count > 0 ? Math.round((Number(r.count) / realized.count) * 100) : 0,
    color: asnafColorMap[r.name] || '#10b981'
  }));
  const programImpact = realized.programs.map(r => ({
    id: r.name, name: r.name, category: r.name, target: 0, color: '#059669', desc: '',
    realizedAmount: Number(r.amount), beneficiariesCount: Number(r.beneficiaries), percentage: 0,
  }));

  // Action Rail / Queue alerts
  const stagesCount = await getMustahikStageCounts(db);
  const queueItems = await db.all(`
    SELECT id, name, file_no, nik, kecamatan, status, recommended_amount, asnaf, program, created_at
    FROM mustahik
    WHERE status IN ('Diajukan', 'Verifikasi Administrasi', 'Survey')
    ORDER BY created_at DESC
    LIMIT 6
  `);

  const recentLogs = await getActivityLogs(null, 8, db);

  return {
    dataStatus: realized.count > 0 ? 'ready' : 'empty',
    period,
    dateRange: { start, end },
    unavailableMetrics: ['targetRkat', 'efektivitasPenyaluran', 'balance', 'growthRate', 'slaComplianceRate', 'monthlyTrend.target', 'programImpact.target', 'programImpact.percentage', 'actionRail.slaCounts.lewatSla', 'actionRail.slaCounts.dokumenKurang'],
    metrics: {
      totalPenyaluran: realized.amount,
      penyaluranBulanIni: Number(realized.monthly.find(r => r.month === end.slice(0, 7))?.amount || 0),
      totalMustahik: realized.count,
      totalJiwa: realized.beneficiaries,
      efektivitasPenyaluran: 0,
      targetRkat: 0,
      balance: 0,
      growthRate: 0,
      slaComplianceRate: 0
    },
    monthlyTrend: realized.monthly.map(r => ({ month: r.month, realisasi: Number(r.amount) / 1_000_000_000, target: 0, mustahik: Number(r.count) })),
    asnafBreakdown,
    programImpact,
    actionRail: {
      slaCounts: {
        perluTindakan: stagesCount.diajukan + stagesCount.verifikasi,
        lewatSla: 0,
        dokumenKurang: 0
      },
      queueItems: queueItems.map(formatMustahikRow),
      recentActivities: recentLogs
    }
  };
}

/**
 * 2. Penyaluran Aggregates By 13 Kecamatan Kota Tangerang
 */
export async function getPenyaluranByKecamatan(dbOverride = null) {
  const db = dbOverride || await getDb();
  const kecKeys = Object.keys(KECAMATAN_KELURAHAN_MAP);
  const realizedWhere = `status IN (${REALIZED_STATUS_SQL})
    AND disbursement_date IS NOT NULL AND disbursement_date != ''`;

  const rows = await db.all(`
    SELECT
      kecamatan,
      COUNT(*) as total_mustahik,
      COALESCE(SUM(approved_amount), 0) as total_disalurkan,
      COUNT(CASE WHEN desil_score = 1 OR asnaf = 'Fakir' THEN 1 END) as desil1_count
    FROM mustahik
    WHERE ${realizedWhere} AND kecamatan IS NOT NULL AND kecamatan != ''
    GROUP BY kecamatan
  `);

  if (rows.length === 0) return [];

  const programRows = await db.all(`
    SELECT kecamatan, program, COUNT(*) AS count, COALESCE(SUM(approved_amount), 0) AS amount
    FROM mustahik
    WHERE ${realizedWhere} AND kecamatan IS NOT NULL AND kecamatan != '' AND program IS NOT NULL AND program != ''
    GROUP BY kecamatan, program
    ORDER BY kecamatan, count DESC, amount DESC, program
  `);
  const asnafRows = await db.all(`
    SELECT kecamatan, asnaf, COUNT(*) AS count, COALESCE(SUM(approved_amount), 0) AS amount
    FROM mustahik
    WHERE ${realizedWhere} AND kecamatan IS NOT NULL AND kecamatan != '' AND asnaf IS NOT NULL AND asnaf != ''
    GROUP BY kecamatan, asnaf
    ORDER BY kecamatan, count DESC, amount DESC, asnaf
  `);

  return kecKeys.flatMap(kecName => {
    const row = rows.find(r => r.kecamatan?.toLowerCase() === kecName.toLowerCase());
    if (!row) return [];

    const totalMustahik = parseInt(row.total_mustahik, 10) || 0;
    const totalDisalurkan = parseFloat(row.total_disalurkan) || 0;
    const desil1Count = parseInt(row.desil1_count, 10) || 0;
    const topProgram = programRows.find(r => r.kecamatan?.toLowerCase() === kecName.toLowerCase());
    const dominantAsnaf = asnafRows.find(r => r.kecamatan?.toLowerCase() === kecName.toLowerCase());

    const coords = KECAMATAN_COORDINATES[kecName] || { lat: -6.1783, lng: 106.6319 };
    const kelList = KECAMATAN_KELURAHAN_MAP[kecName] || [];

    const result = {
      id: kecName.toLowerCase().replace(/\s+/g, '-'),
      name: kecName,
      totalMustahik,
      totalDisalurkan,
      desil1Count,
      urgencyLevel: desil1Count > 6 ? 'Tinggi' : desil1Count > 3 ? 'Sedang' : 'Rendah',
      coordinates: coords,
      kelurahanList: kelList,
    };

    if (topProgram) result.topProgram = topProgram.program;
    if (dominantAsnaf) result.dominantAsnaf = dominantAsnaf.asnaf;
    return [result];
  });
}

/**
 * Read-only journal of disbursement requests and completed distribution.
 * Bank details are intentionally excluded from this operational list.
 */
export async function queryPenyaluranTransactions(db, filters = {}) {
  const conditions = [];
  const values = [];
  const journalDateOrder = db.isPg
    ? "COALESCE(NULLIF(p.disbursement_date, ''), CAST(p.created_at AS TEXT))"
    : "COALESCE(NULLIF(p.disbursement_date, ''), p.created_at)";
  const add = (condition, value) => {
    values.push(value);
    conditions.push(condition.replace('?', `$${values.length}`));
  };

  if (filters.status) add('m.status = ?', filters.status);
  if (filters.program) add('m.program = ?', filters.program);
  if (filters.kecamatan) add('m.kecamatan = ?', filters.kecamatan);
  if (filters.search) {
    const query = `%${String(filters.search).toLowerCase()}%`;
    values.push(query);
    const placeholder = `$${values.length}`;
    conditions.push(`(
      LOWER(COALESCE(p.transaction_number, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(p.ppd_number, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(m.name, '')) LIKE ${placeholder}
      OR LOWER(COALESCE(m.file_no, '')) LIKE ${placeholder}
    )`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db.all(
    `SELECT
      p.id,
      p.mustahik_id,
      p.transaction_number,
      p.ppd_number,
      p.form_number,
      p.amount,
      p.purpose,
      p.payment_type,
      p.disbursement_date,
      p.created_at,
      m.file_no,
      m.name AS recipient_name,
      m.program,
      m.asnaf,
      m.kecamatan,
      m.status
    FROM ppd p
    INNER JOIN mustahik m ON m.id = p.mustahik_id
    ${where}
    ORDER BY ${journalDateOrder} DESC, p.id DESC`,
    values
  );

  return rows.map((row) => ({
    ...row,
    amount: Number(row.amount || 0),
  }));
}

export async function listPenyaluranTransactions(filters = {}) {
  return queryPenyaluranTransactions(await getDb(), filters);
}

export async function listMasterData(category) {
  const db = await getDb();
  const params = [];
  const where = category ? 'WHERE category = $1' : '';
  if (category) params.push(category);
  return db.all(
    `SELECT id, category, record_key, label, description, is_active, sort_order, updated_at
     FROM master_data ${where}
     ORDER BY category ASC, sort_order ASC, label ASC`,
    params
  );
}

export async function createMasterData(record) {
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO master_data (category, record_key, label, description, is_active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [record.category, record.record_key, record.label, record.description || '', record.is_active !== false, Number(record.sort_order || 0)]
  );
  return result.lastID;
}

export async function updateMasterData(id, record) {
  const db = await getDb();
  const result = await db.run(
    `UPDATE master_data
     SET label = $1, description = $2, is_active = $3, sort_order = $4, updated_at = CURRENT_TIMESTAMP
     WHERE id = $5`,
    [record.label, record.description || '', record.is_active !== false, Number(record.sort_order || 0), id]
  );
  return result.rowCount > 0;
}

/**
 * 3. 5 Pilar Programs & Sub-Program Initiatives
 */
export async function getPilarPrograms() {
  const db = await getDb();
  const initiatives = await db.all('SELECT * FROM program_initiatives ORDER BY id ASC');

  const pilarDefinitions = [
    {
      id: 'cerdas',
      pilarNum: '1',
      name: 'Tangerang Cerdas',
      category: 'Pendidikan & Beasiswa',
      rawAmount: 8_620_000_000,
      rawBudget: 11_800_000_000,
      color: '#2563eb',
      impactDesc: 'Pendidikan merata, angka putus sekolah tertekan drastis, dan lahir sarjana mandiri.',
      metrics: {
        primaryLabel: 'Siswa / Mahasiswa Terbantu',
        primaryValue: '9.842',
        primaryGrowth: '+14,2%',
        successLabel: 'Lulusan Terfasilitasi',
        successValue: '8.660',
        successRate: '88%',
        avgLabel: 'Rata-rata Beasiswa',
        avgValue: 'Rp 875 rb',
        progLabel: 'Sub-Program Aktif',
        progValue: '5 Program',
        districtLabel: 'Kecamatan Terjangkau',
        districtValue: '13 / 13',
        newLabel: 'Penerima Beasiswa Baru',
        newValue: '2.410 Jiwa'
      },
      monthlyBars: [
        { m: 'Jan', realisasi: 45, target: 60, active: true },
        { m: 'Feb', realisasi: 58, target: 65, active: true },
        { m: 'Mar', realisasi: 72, target: 70, active: true },
        { m: 'Apr', realisasi: 85, target: 75, active: true },
        { m: 'Mei', realisasi: 94, target: 80, active: true },
        { m: 'Jun', realisasi: 90, target: 80, active: true },
        { m: 'Jul', realisasi: 82, target: 75, active: true },
        { m: 'Agu', realisasi: 88, target: 75, active: true }
      ],
      asnafBreakdown: [
        { name: 'Miskin', count: '5.420', pct: '55%', color: '#2563eb' },
        { name: 'Fakir', count: '2.840', pct: '29%', color: '#3b82f6' },
        { name: 'Fisabilillah', count: '1.182', pct: '12%', color: '#60a5fa' },
        { name: 'Ibnu Sabil', count: '400', pct: '4%', color: '#93c5fd' }
      ],
      topKecamatan: [
        { rank: 1, name: 'Cipondoh', count: '1.420', pct: '14,4%' },
        { rank: 2, name: 'Tangerang', count: '1.280', pct: '13,0%' },
        { rank: 3, name: 'Karawaci', count: '1.150', pct: '11,7%' },
        { rank: 4, name: 'Ciledug', count: '980', pct: '10,0%' },
        { rank: 5, name: 'Cibodas', count: '910', pct: '9,2%' }
      ]
    },
    {
      id: 'makmur',
      pilarNum: '2',
      name: 'Tangerang Makmur',
      category: 'Ekonomi & UMKM Mustahik',
      rawAmount: 6_480_000_000,
      rawBudget: 8_500_000_000,
      color: '#059669',
      impactDesc: 'Pemberdayaan ekonomi produktif mengubah mustahik menjadi muzakki mandiri.',
      metrics: {
        primaryLabel: 'Pelaku UMKM Mandiri',
        primaryValue: '6.120',
        primaryGrowth: '+18,5%',
        successLabel: 'Usaha Naik Kelas',
        successValue: '4.890',
        successRate: '80%',
        avgLabel: 'Rata-rata Bantuan Modal',
        avgValue: 'Rp 3,5 jt',
        progLabel: 'Sub-Program Aktif',
        progValue: '4 Program',
        districtLabel: 'Kecamatan Terjangkau',
        districtValue: '13 / 13',
        newLabel: 'Wirausaha Baru',
        newValue: '1.240 Jiwa'
      },
      monthlyBars: [
        { m: 'Jan', realisasi: 40, target: 55, active: true },
        { m: 'Feb', realisasi: 52, target: 60, active: true },
        { m: 'Mar', realisasi: 68, target: 65, active: true },
        { m: 'Apr', realisasi: 78, target: 70, active: true },
        { m: 'Mei', realisasi: 85, target: 75, active: true },
        { m: 'Jun', realisasi: 82, target: 75, active: true },
        { m: 'Jul', realisasi: 79, target: 70, active: true },
        { m: 'Agu', realisasi: 84, target: 70, active: true }
      ],
      asnafBreakdown: [
        { name: 'Miskin', count: '3.672', pct: '60%', color: '#059669' },
        { name: 'Fakir', count: '1.530', pct: '25%', color: '#10b981' },
        { name: 'Gharimin', count: '612', pct: '10%', color: '#34d399' },
        { name: 'Muallaf', count: '306', pct: '5%', color: '#6ee7b7' }
      ],
      topKecamatan: [
        { rank: 1, name: 'Karawaci', count: '890', pct: '14,5%' },
        { rank: 2, name: 'Ciledug', count: '810', pct: '13,2%' },
        { rank: 3, name: 'Cipondoh', count: '780', pct: '12,7%' },
        { rank: 4, name: 'Pinang', count: '640', pct: '10,5%' },
        { rank: 5, name: 'Batuceper', count: '590', pct: '9,6%' }
      ]
    },
    {
      id: 'sehat',
      pilarNum: '3',
      name: 'Tangerang Sehat',
      category: 'Kesehatan & Layanan Medis',
      rawAmount: 5_120_000_000,
      rawBudget: 6_200_000_000,
      color: '#dc2626',
      impactDesc: 'Akses kesehatan paripurna bagi dhuafa, layanan ambulans siaga 24 jam gratis.',
      metrics: {
        primaryLabel: 'Pasien Dhuafa Terlayani',
        primaryValue: '7.430',
        primaryGrowth: '+9,8%',
        successLabel: 'Layanan Ambulans Selesai',
        successValue: '1.850',
        successRate: '99%',
        avgLabel: 'Bantuan Medis per Jiwa',
        avgValue: 'Rp 1,8 jt',
        progLabel: 'Sub-Program Aktif',
        progValue: '4 Program',
        districtLabel: 'Kecamatan Terjangkau',
        districtValue: '13 / 13',
        newLabel: 'Balita Nutrisi Terbantu',
        newValue: '680 Anak'
      },
      monthlyBars: [
        { m: 'Jan', realisasi: 50, target: 50, active: true },
        { m: 'Feb', realisasi: 60, target: 55, active: true },
        { m: 'Mar', realisasi: 75, target: 60, active: true },
        { m: 'Apr', realisasi: 80, target: 65, active: true },
        { m: 'Mei', realisasi: 88, target: 70, active: true },
        { m: 'Jun', realisasi: 84, target: 70, active: true },
        { m: 'Jul', realisasi: 81, target: 65, active: true },
        { m: 'Agu', realisasi: 86, target: 65, active: true }
      ],
      asnafBreakdown: [
        { name: 'Fakir', count: '3.715', pct: '50%', color: '#dc2626' },
        { name: 'Miskin', count: '2.972', pct: '40%', color: '#ef4444' },
        { name: 'Ibnu Sabil', count: '445', pct: '6%', color: '#f87171' },
        { name: 'Gharimin', count: '298', pct: '4%', color: '#fca5a5' }
      ],
      topKecamatan: [
        { rank: 1, name: 'Tangerang', count: '1.120', pct: '15,1%' },
        { rank: 2, name: 'Jatiuwung', count: '980', pct: '13,2%' },
        { rank: 3, name: 'Neglasari', count: '890', pct: '12,0%' },
        { rank: 4, name: 'Periuk', count: '820', pct: '11,0%' },
        { rank: 5, name: 'Benda', count: '740', pct: '10,0%' }
      ]
    },
    {
      id: 'peduli',
      pilarNum: '4',
      name: 'Tangerang Peduli',
      category: 'Kemanusiaan & Advokasi',
      rawAmount: 6_240_000_000,
      rawBudget: 8_000_000_000,
      color: '#ea580c',
      impactDesc: 'Bantuan hunian layak, tanggap bencana kilat, dan santunan lansia sebatang kara.',
      metrics: {
        primaryLabel: 'Jiwa Terdampak Terbantu',
        primaryValue: '11.200',
        primaryGrowth: '+22,4%',
        successLabel: 'Unit RTLH Selesai Dibedah',
        successValue: '78 Unit',
        successRate: '92%',
        avgLabel: 'Bantuan per Keluarga',
        avgValue: 'Rp 2,5 jt',
        progLabel: 'Sub-Program Aktif',
        progValue: '4 Program',
        districtLabel: 'Kecamatan Terjangkau',
        districtValue: '13 / 13',
        newLabel: 'Lansia Penerima Santunan',
        newValue: '750 Jiwa'
      },
      monthlyBars: [
        { m: 'Jan', realisasi: 60, target: 50, active: true },
        { m: 'Feb', realisasi: 65, target: 55, active: true },
        { m: 'Mar', realisasi: 85, target: 65, active: true },
        { m: 'Apr', realisasi: 95, target: 70, active: true },
        { m: 'Mei', realisasi: 88, target: 75, active: true },
        { m: 'Jun', realisasi: 80, target: 70, active: true },
        { m: 'Jul', realisasi: 76, target: 65, active: true },
        { m: 'Agu', realisasi: 82, target: 65, active: true }
      ],
      asnafBreakdown: [
        { name: 'Fakir', count: '5.600', pct: '50%', color: '#ea580c' },
        { name: 'Miskin', count: '4.480', pct: '40%', color: '#f97316' },
        { name: 'Gharimin', count: '672', pct: '6%', color: '#fb923c' },
        { name: 'Ibnu Sabil', count: '448', pct: '4%', color: '#fdba74' }
      ],
      topKecamatan: [
        { rank: 1, name: 'Neglasari', count: '1.680', pct: '15,0%' },
        { rank: 2, name: 'Benda', count: '1.450', pct: '12,9%' },
        { rank: 3, name: 'Periuk', count: '1.340', pct: '12,0%' },
        { rank: 4, name: 'Cipondoh', count: '1.210', pct: '10,8%' },
        { rank: 5, name: 'Jatiuwung', count: '1.100', pct: '9,8%' }
      ]
    },
    {
      id: 'takwa',
      pilarNum: '5',
      name: 'Tangerang Takwa',
      category: 'Dakwah & Syiar Islam',
      rawAmount: 3_380_000_000,
      rawBudget: 4_500_000_000,
      color: '#7c3aed',
      impactDesc: 'Syiar dakwah berkemajuan, insentif marbot masjid & guru ngaji, bina muallaf.',
      metrics: {
        primaryLabel: 'Jamaah & Guru Ngaji Terbina',
        primaryValue: '3.858',
        primaryGrowth: '+8,6%',
        successLabel: 'Musholla Terbantu',
        successValue: '38 Unit',
        successRate: '95%',
        avgLabel: 'Insentif Bulanan',
        avgValue: 'Rp 650 rb',
        progLabel: 'Sub-Program Aktif',
        progValue: '4 Program',
        districtLabel: 'Kecamatan Terjangkau',
        districtValue: '13 / 13',
        newLabel: 'Muallaf Mandiri Terbina',
        newValue: '128 Jiwa'
      },
      monthlyBars: [
        { m: 'Jan', realisasi: 40, target: 45, active: true },
        { m: 'Feb', realisasi: 50, target: 50, active: true },
        { m: 'Mar', realisasi: 70, target: 60, active: true },
        { m: 'Apr', realisasi: 85, target: 65, active: true },
        { m: 'Mei', realisasi: 80, target: 65, active: true },
        { m: 'Jun', realisasi: 75, target: 60, active: true },
        { m: 'Jul', realisasi: 72, target: 60, active: true },
        { m: 'Agu', realisasi: 78, target: 60, active: true }
      ],
      asnafBreakdown: [
        { name: 'Fisabilillah', count: '2.508', pct: '65%', color: '#7c3aed' },
        { name: 'Muallaf', count: '772', pct: '20%', color: '#8b5cf6' },
        { name: 'Miskin', count: '386', pct: '10%', color: '#a78bfa' },
        { name: 'Fakir', count: '192', pct: '5%', color: '#c4b5fd' }
      ],
      topKecamatan: [
        { rank: 1, name: 'Tangerang', count: '680', pct: '17,6%' },
        { rank: 2, name: 'Cipondoh', count: '590', pct: '15,3%' },
        { rank: 3, name: 'Pinang', count: '510', pct: '13,2%' },
        { rank: 4, name: 'Karang Tengah', count: '460', pct: '11,9%' },
        { rank: 5, name: 'Larangan', count: '410', pct: '10,6%' }
      ]
    }
  ];

  return pilarDefinitions.map(p => {
    const pilarInits = initiatives
      .filter(init => init.pilar_id === p.id)
      .map(init => ({
        id: init.id,
        code: init.code,
        name: init.name,
        pic: init.pic || 'Koordinator Program',
        status: init.status || 'Aktif',
        nextMilestone: init.next_milestone || 'Monitoring & Evaluasi',
        mustahik: `${(init.mustahik_count || 0).toLocaleString('id-ID')} jiwa`,
        realized: `Rp ${((init.realized_amount || 0) / 1_000_000_000).toLocaleString('id-ID', { minimumFractionDigits: 2 })} M`,
        pct: parseFloat(init.percentage) || 0
      }));

    const amountFormatted = `Rp ${(p.rawAmount / 1_000_000_000).toLocaleString('id-ID', { minimumFractionDigits: 2 })} M`;
    const percentage = Math.round((p.rawAmount / p.rawBudget) * 100);

    return {
      ...p,
      amount: amountFormatted,
      percentage,
      beneficiaries: `${p.metrics.primaryValue} penerima manfaat`,
      subPrograms: pilarInits
    };
  });
}

/**
 * Add / Create Sub-Program Initiative
 */
export async function addPilarInitiative(data) {
  const db = await getDb();
  const budget = parseFloat(data.budget_amount) || 1000000000;
  const realized = parseFloat(data.realized_amount) || 0;
  const pct = budget > 0 ? Math.round((realized / budget) * 100) : 0;

  const res = await db.run(
    `INSERT INTO program_initiatives (
      pilar_id, code, name, pic, status, next_milestone,
      mustahik_target, mustahik_count, budget_amount, realized_amount, percentage
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [
      data.pilar_id || 'cerdas',
      data.code || 'PROG-01',
      data.name,
      data.pic || 'PIC BAZNAS',
      data.status || 'Aktif',
      data.next_milestone || 'Tahap Persiapan',
      parseInt(data.mustahik_target, 10) || 100,
      parseInt(data.mustahik_count, 10) || 0,
      budget,
      realized,
      pct
    ]
  );
  return res.lastID;
}

/**
 * Update Sub-Program Initiative
 */
export async function updatePilarInitiative(id, data) {
  const db = await getDb();
  const allowed = ['name', 'pic', 'status', 'next_milestone', 'mustahik_target', 'mustahik_count', 'budget_amount', 'realized_amount', 'percentage'];
  const updates = [];
  const values = [];

  for (const col of allowed) {
    if (data[col] !== undefined) {
      values.push(data[col]);
      updates.push(`${col} = $${values.length}`);
    }
  }

  if (updates.length === 0) return false;
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  await db.run(`UPDATE program_initiatives SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
  return true;
}

/**
 * Delete Sub-Program Initiative
 */
export async function deletePilarInitiative(id) {
  const db = await getDb();
  await db.run('DELETE FROM program_initiatives WHERE id = $1', [id]);
  return true;
}

/**
 * 4. Mustahik Stage Counts for Tab Rails
 */
export async function getMustahikStageCounts(dbOverride = null) {
  const db = dbOverride || await getDb();
  let rows;
  try {
    rows = await db.all(`
      SELECT status, COUNT(*) as count
      FROM mustahik
      WHERE archived_at IS NULL
      GROUP BY status
    `);
  } catch (err) {
    if (/archived_at/i.test(err.message)) {
      rows = await db.all(`
        SELECT status, COUNT(*) as count
        FROM mustahik
        GROUP BY status
      `);
    } else {
      throw err;
    }
  }

  const counts = {
    all: 0,
    diajukan: 0,
    verifikasi: 0,
    survey: 0,
    mpzis: 0,
    ppd: 0,
    selesai: 0,
    ditolak: 0
  };

  for (const r of rows) {
    const c = parseInt(r.count, 10) || 0;
    counts.all += c;
    const s = r.status || '';
    if (s === 'Diajukan') counts.diajukan += c;
    else if (s === 'Verifikasi Administrasi' || s === 'Verifikasi') counts.verifikasi += c;
    else if (s === 'Survey') counts.survey += c;
    else if (s === 'Persetujuan MPZIS' || s === 'MPZIS') counts.mpzis += c;
    else if (s.includes('Pengajuan Dana') || s.includes('PPD') || s.includes('FPD')) counts.ppd += c;
    else if (s === 'Penyaluran Selesai' || s === 'Selesai') counts.selesai += c;
    else if (s === 'Ditolak') counts.ditolak += c;
  }

  return counts;
}

/**
 * 5. Submit Mustahik Decision (Approve / Reject / Advance Workflow Stage)
 */
export async function submitMustahikDecision(id, data = {}, actor = null, dbOverride = null) {
  const db = dbOverride || await getDb();
  return withTransaction(db, (transactionDb) => submitMustahikDecisionInTransaction(id, data, actor, transactionDb));
}

async function submitMustahikDecisionInTransaction(id, data = {}, actor = null, db) {
  const mustahik = await db.get('SELECT * FROM mustahik WHERE id = $1', [id]);
  if (!mustahik) {
    throw new Error('Mustahik tidak ditemukan');
  }

  const currentStatus = mustahik.status || 'Diajukan';
  const canonicalCurrentStatus = canonicalizePenyaluranStatus(currentStatus);
  const action = data.action || (data.reject ? 'reject' : 'approve');
  const actorName = actor?.name || 'Petugas Penyaluran';
  const actorRole = actor?.role || 'penyaluran';
  const note = String(data.notes || data.reason || '').trim();
  if (!note) throw new Error('Catatan keputusan wajib diisi untuk kebutuhan audit.');
  assertExpectedWorkflowState(mustahik, data);
  const lastPreparation = canonicalCurrentStatus === 'Persetujuan MPZIS'
    ? await db.get(
      `SELECT actor_id FROM approval_decisions
       WHERE mustahik_id = $1 AND next_status = 'Persetujuan MPZIS'
       ORDER BY created_at DESC LIMIT 1`,
      [id]
    )
    : null;
  const authority = canTransition({
    currentStatus: canonicalCurrentStatus,
    action,
    actor,
    preparedById: lastPreparation?.actor_id,
  });
  if (!authority.allowed) throw new Error(authority.reason);
  const today = new Date().toISOString().split('T')[0];

  const nextStatus = resolvePenyaluranTransition({
    currentStatus: canonicalCurrentStatus,
    action,
    targetStatus: data.target_status,
  });
  let activityTitle = '';
  let activityDesc = '';

  if (action === 'reject') {
    activityTitle = 'Pengajuan Ditolak';
    activityDesc = note;

    await updateMustahik(id, {
      status: nextStatus,
      workflow_version: Number(mustahik.workflow_version || 0) + 1,
      rejection_reason: activityDesc,
      survey_recommendation: 'Tidak Layak'
    }, db, { status: currentStatus, version: Number(mustahik.workflow_version || 0) });
  } else {
    if (canonicalCurrentStatus === 'Persetujuan MPZIS' && action === 'approve' && Number(data.approved_amount) <= 0) {
      throw new Error('Nominal disetujui wajib diisi pada persetujuan MPZIS.');
    }

    activityTitle = `Tahap ${nextStatus}`;
    activityDesc = note;

    const updatePayload = {
      status: nextStatus,
      workflow_version: Number(mustahik.workflow_version || 0) + 1,
      notes: `${mustahik.notes ? mustahik.notes + ' | ' : ''}${note}`
    };

    if (nextStatus === 'Survey') {
      updatePayload.survey_date = today;
      updatePayload.surveyor_name = data.surveyor_name || 'Tim Asesmen BAZNAS';
      updatePayload.survey_recommendation = 'Layak';
      if (data.overall_score) updatePayload.overall_score = parseFloat(data.overall_score);
    } else if (nextStatus === 'Persetujuan MPZIS') {
      updatePayload.mpzis_date = today;
      updatePayload.approved_amount = data.approved_amount || mustahik.recommended_amount || 2000000;
    } else if (nextStatus === 'Pengajuan Dana (FPD)' || nextStatus === 'Pengajuan Dana (PPD)') {
      updatePayload.ppd_number = mustahik.ppd_number || `PPD/202608/${String(id).padStart(3, '0')}`;
    } else if (nextStatus === 'Penyaluran Selesai') {
      updatePayload.disbursement_date = today;
      updatePayload.ppd_number = mustahik.ppd_number || `PPD/202608/${String(id).padStart(3, '0')}`;
    }

    await updateMustahik(id, updatePayload, db, { status: currentStatus, version: Number(mustahik.workflow_version || 0) });
  }

  // Approval and activity audits are part of the same transaction as the status update.
  await db.run(
    `INSERT INTO approval_decisions (mustahik_id, stage, action, previous_status, next_status, note, approved_amount, actor_id, actor_name, actor_role, actor_level, actor_division, prepared_by_id, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id, currentStatus, action, currentStatus, nextStatus, note, data.approved_amount || null,
      actor?.id || null, actorName, actorRole, actor?.level || 'staff', actor?.division || null,
      lastPreparation?.actor_id || null, crypto.randomUUID(),
    ]
  );

  // Record in activity_logs
  await db.run(
    `INSERT INTO activity_logs (mustahik_id, actor_name, action_type, title, description, old_status, new_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, actorName, action.toUpperCase(), activityTitle, activityDesc, currentStatus, nextStatus]
  );

  // Send / Record WA Notification if phone exists
  if (mustahik.phone) {
    const waInfo = generateWaMessage(nextStatus, { ...mustahik, status: nextStatus });
    if (waInfo) {
      await addWaLog({
        mustahik_id: id,
        phone: mustahik.phone,
        phase: nextStatus,
        message: waInfo.message,
        wa_url: waInfo.url,
        status: 'sent'
      }, db);
    }
  }

  return {
    success: true,
    mustahik_id: id,
    old_status: currentStatus,
    new_status: nextStatus,
    message: `Keputusan berhasil disimpan. Status mustahik kini: ${nextStatus}.`
  };
}

export async function getApprovalDecisions(filters = {}) {
  const db = await getDb();
  const where = [];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
  if (filters.mustahik_id) add('ad.mustahik_id = ?', filters.mustahik_id);
  if (filters.action) add('ad.action = ?', filters.action);
  if (filters.stage) add('ad.stage = ?', filters.stage);
  if (filters.actor_id) add('ad.actor_id = ?', filters.actor_id);
  if (filters.from) add('ad.created_at >= ?', filters.from);
  if (filters.to) add('ad.created_at <= ?', `${filters.to} 23:59:59`);
  const rows = await db.all(
    `SELECT ad.*, m.file_no, m.name AS mustahik_name
     FROM approval_decisions ad
     JOIN mustahik m ON m.id = ad.mustahik_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ad.created_at DESC
     LIMIT 300`,
    params
  );
  return rows;
}

/**
 * 6. Batch Import Mustahik Data
 */
export async function importMustahikBatch(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, count: 0, message: 'Tidak ada data untuk diimpor' };
  }

  let imported = 0;
  for (const item of items) {
    try {
      await createMustahik(item);
      imported++;
    } catch (e) {
      console.warn('Batch import single row warning:', e.message);
    }
  }

  return {
    success: true,
    count: imported,
    message: `Berhasil mengimpor ${imported} data mustahik.`
  };
}

/**
 * 7. Activity Logs
 */
export async function appendActivityLog({
  mustahikId = null,
  actor,
  action,
  target,
  title,
  description = '',
}, dbOverride = null) {
  const db = dbOverride || await getDb();
  const actorName = actor?.name || actor?.email || 'Pengguna tidak dikenal';
  const actorRole = actor?.role || 'unknown';
  const actorId = actor?.id ?? 'unknown';
  const result = await db.run(
    `INSERT INTO activity_logs (mustahik_id, actor_name, action_type, title, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      mustahikId,
      `${actorName} [${actorRole}] (#${actorId})`,
      action,
      title,
      `Target: ${target}.${description ? ` ${description}` : ''}`,
    ]
  );
  return result.lastID;
}

export async function getActivityLogs(mustahikId = null, limit = 20, dbOverride = null) {
  const db = dbOverride || await getDb();
  let query = 'SELECT * FROM activity_logs';
  const params = [];

  if (mustahikId) {
    params.push(mustahikId);
    query += ` WHERE mustahik_id = $${params.length}`;
  }

  query += ' ORDER BY created_at DESC';
  if (limit) {
    params.push(limit);
    query += ` LIMIT $${params.length}`;
  }

  const rows = await db.all(query, params);
  return rows;
}

/**
 * 8. Laporan Penyaluran Catalog & Export
 */
export async function getLaporanList(filters = {}, dbOverride = null, now = new Date()) {
  const range = getReportRange(filters.period, now);
  const db = dbOverride || await getDb();
  let query = 'SELECT * FROM reports';
  const conditions = [];
  const params = [];

  // Normalize category aliases
  const categoryAliasMap = {
    'ringkasan': ['Ringkasan', 'summary'],
    'per program': ['Per Program', 'Program & Pilar', 'program'],
    'program & pilar': ['Per Program', 'Program & Pilar', 'program'],
    'per asnaf': ['Per Asnaf', 'Asnaf', 'asnaf'],
    'asnaf': ['Per Asnaf', 'Asnaf', 'asnaf'],
    'per kecamatan': ['Per Kecamatan', 'Kecamatan', 'kecamatan'],
    'kecamatan': ['Per Kecamatan', 'Kecamatan', 'kecamatan'],
    'audit & lpj': ['Audit & LPJ', 'Keuangan', 'audit', 'lpj'],
    'keuangan': ['Audit & LPJ', 'Keuangan', 'audit', 'lpj']
  };

  if (filters.category && filters.category !== 'Semua' && filters.category.toLowerCase() !== 'all') {
    const rawCat = filters.category.trim().toLowerCase();
    const allowed = categoryAliasMap[rawCat] || [filters.category];
    const catPlaceholders = allowed.map((_, i) => `$${params.length + i + 1}`).join(', ');
    conditions.push(`category IN (${catPlaceholders})`);
    params.push(...allowed);
  }

  // A catalogue's reporting month is distinct from its modification timestamp.
  if (range.aliases) {
    params.push(...range.aliases.map(p => p.toLowerCase()));
    conditions.push(`LOWER(period) IN ($${params.length - 1}, $${params.length})`);
  }

  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    const p1 = `$${params.length + 1}`;
    const p2 = `$${params.length + 2}`;
    const p3 = `$${params.length + 3}`;
    conditions.push(`(title ILIKE ${p1} OR description ILIKE ${p2} OR scope ILIKE ${p3})`);
    params.push(term, term, term);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY id DESC';
  let rows = await db.all(query, params);
  if (['7d', '30d', '1y'].includes(filters.period)) {
    // Legacy localized text and ISO timestamps cannot be compared lexically.
    // Normalize before filtering so the entire end calendar day is included.
    rows = rows.filter(row => {
      const updatedDate = normalizeReportDate(row.updated_at);
      return updatedDate !== null && updatedDate >= range.start && updatedDate <= range.end;
    });
  }

  // Normalize report category output
  const normalizeOutputCat = (c) => {
    const s = String(c || '').toLowerCase();
    if (s.includes('program') || s.includes('pilar')) return 'Per Program';
    if (s.includes('asnaf')) return 'Per Asnaf';
    if (s.includes('kecamatan') || s.includes('wilayah')) return 'Per Kecamatan';
    if (s.includes('audit') || s.includes('lpj') || s.includes('keuangan')) return 'Audit & LPJ';
    return 'Ringkasan';
  };

  const reports = rows.map(r => ({
    ...r,
    category: normalizeOutputCat(r.category),
    metrics: safeJsonParse(r.metrics_json, {})
  }));

  // Counts describe the same filtered catalogue as the returned reports.
  const categoryCounts = {
    'Ringkasan': 0,
    'Per Program': 0,
    'Per Asnaf': 0,
    'Per Kecamatan': 0,
    'Audit & LPJ': 0
  };
  for (const r of reports) {
    const norm = normalizeOutputCat(r.category);
    if (categoryCounts[norm] !== undefined) categoryCounts[norm]++;
    else categoryCounts['Ringkasan']++;
  }

  // Financial figures use the same realized date range as the overview. Report
  // snapshots can overlap; summing metrics_json would double-count payments.
  const realized = await getRealizedAggregates(db, range.start, range.end);
  const rupiah = amount => `Rp ${Number(amount).toLocaleString('id-ID')}`;
  const readyCount = reports.filter(r => r.status === 'Siap diekspor').length;
  const kpis = [
    { key: 'totalRealisasi', label: 'Total realisasi laporan', rawValue: realized.amount, value: rupiah(realized.amount), detail: 'Penyaluran disetujui dengan tanggal pencairan dalam periode', trend: '' },
    { key: 'totalMustahik', label: 'Mustahik tersalurkan', rawValue: realized.count, value: `${realized.count} mustahik`, detail: 'Catatan penyaluran dalam periode', trend: '' },
    { key: 'totalLaporan', label: 'Laporan tercatat', rawValue: reports.length, value: `${reports.length} dokumen`, detail: 'Sesuai filter katalog', trend: '' },
    { key: 'laporanSiapEkspor', label: 'Laporan siap ekspor', rawValue: readyCount, value: `${readyCount} dokumen`, detail: 'Status tersimpan: Siap diekspor', trend: '' }
  ];
  const programAllocation = realized.programs.map(r => ({
    label: r.name, amount: Number(r.amount), value: rupiah(r.amount),
    percentage: realized.amount > 0 ? Math.round(Number(r.amount) / realized.amount * 100) : 0,
    tone: 'emerald',
  }));
  const asnafDistribution = realized.asnaf.map(r => ({
    label: r.name, count: Number(r.beneficiaries), value: `${Number(r.beneficiaries).toLocaleString('id-ID')} jiwa`,
    percentage: realized.beneficiaries > 0 ? Math.round(Number(r.beneficiaries) / realized.beneficiaries * 100) : 0,
    tone: 'emerald',
  }));

  return {
    dataStatus: reports.length > 0 || realized.count > 0 ? 'ready' : 'empty',
    period: filters.period || 'all',
    dateRange: { start: range.start, end: range.end },
    reports,
    categoryCounts,
    kpis,
    programAllocation,
    asnafDistribution,
    count: reports.length
  };
}

/**
 * Generate a new Report record
 */
export async function generateLaporan(data) {
  const db = await getDb();
  const id = data.id || `lap-${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];

  let metricsJson = typeof data.metrics === 'object' ? JSON.stringify(data.metrics) : (data.metrics_json || '{}');
  if (data.definition || data.filters || data.visibility || data.owner_id || data.created_by_id || data.date_field) {
    const metrics = parseDefinitionJson(metricsJson);
    metrics.definition = {
      ...(metrics.definition || {}),
      ...(data.definition || {}),
      ...(data.filters ? { filters: data.filters } : {}),
      ...(data.visibility ? { visibility: data.visibility } : {}),
      ...(data.owner_id !== undefined ? { owner_id: data.owner_id } : {}),
      ...(data.created_by_id !== undefined ? { created_by_id: data.created_by_id } : {}),
      ...(data.date_field ? { date_field: data.date_field } : {}),
    };
    const normalizedDefinition = normalizeDefinitionSchema(metrics.definition);
    metrics.definition = {
      ...metrics.definition,
      ...normalizedDefinition,
    };
    metricsJson = JSON.stringify(metrics);
  }

  await db.run(
    `INSERT INTO reports (id, category, period, title, description, scope, status, file_url, updated_at, metrics_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       status = EXCLUDED.status,
       updated_at = EXCLUDED.updated_at,
       metrics_json = EXCLUDED.metrics_json`,
    [
      id,
      data.category || 'Ringkasan',
      data.period || 'Agustus 2026',
      data.title || 'Laporan Penyaluran Baru',
      data.description || 'Laporan ringkasan penyaluran hasil generate otomatis sistem.',
      data.scope || '13 Kecamatan Kota Tangerang',
      data.status || 'Siap diekspor',
      `/api/penyaluran/laporan/export/${id}`,
      data.updated_at || today,
      metricsJson
    ]
  );

  return { id, message: 'Laporan berhasil dibuat dan siap diunduh' };
}

// Explicit hard cap keeps synchronous exports bounded; callers can page with offset.
const PENYALURAN_EXPORT_MAX_ROWS = 500;
const PENYALURAN_EXPORT_MAX_OFFSET = 100000;
const EXPORT_DATE_FIELDS = Object.freeze(['received_date', 'disbursement_date']);
const EXPORT_VISIBILITIES = Object.freeze(['shared', 'private', 'owner', 'restricted']);
const EXPORT_ROLES = Object.freeze(['admin', 'penyaluran', 'surveyor']);
export const PENYALURAN_EXPORT_FILTER_FIELDS = Object.freeze([
  'period', 'start_date', 'end_date', 'from', 'to', 'program', 'kecamatan',
  'kelurahan', 'asnaf', 'status', 'fund_source', 'search', 'limit', 'offset',
  'sort', 'date_field'
]);

const EXPORT_QUERY_FIELDS = Object.freeze({
  program: 'program',
  kecamatan: 'kecamatan',
  kelurahan: 'kelurahan',
  asnaf: 'asnaf',
  status: 'status',
  fund_source: 'fund_source',
});

const INDONESIAN_MONTHS = Object.freeze({
  januari: 1, january: 1, februari: 2, february: 2, maret: 3, march: 3,
  april: 4, mei: 5, may: 5, juni: 6, june: 6, juli: 7, july: 7,
  agustus: 8, august: 8, september: 9, oktober: 10, october: 10,
  november: 11, desember: 12, december: 12,
});

function exportClientError(status, message, code = 'INVALID_REPORT_EXPORT') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function parseDefinitionJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('definition must be an object');
    }
    return parsed;
  } catch {
    throw exportClientError(422, 'Definisi laporan tersimpan tidak valid.', 'INVALID_REPORT_DEFINITION');
  }
}

function normalizePositiveInteger(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw exportClientError(422, `${label} wajib diisi.`, 'INVALID_REPORT_DEFINITION');
    return null;
  }
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > 2147483647) {
    throw exportClientError(422, `${label} tidak valid.`, 'INVALID_REPORT_DEFINITION');
  }
  return Number(value);
}

function normalizeDefinitionSchema(definition = {}) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw exportClientError(422, 'Definisi laporan harus berupa objek.', 'INVALID_REPORT_DEFINITION');
  }
  const visibility = definition.visibility === undefined ? 'shared' : String(definition.visibility).trim().toLowerCase();
  if (!EXPORT_VISIBILITIES.includes(visibility)) {
    throw exportClientError(422, 'Visibilitas laporan tidak valid.', 'INVALID_REPORT_DEFINITION');
  }
  const ownerId = normalizePositiveInteger(definition.owner_id ?? definition.created_by_id, 'Pemilik laporan', {
    required: ['private', 'owner', 'restricted'].includes(visibility),
  });
  if (['private', 'owner', 'restricted'].includes(visibility) && ownerId === null) {
    throw exportClientError(422, 'Laporan terbatas harus memiliki pemilik.', 'INVALID_REPORT_DEFINITION');
  }
  const hasRoles = Object.prototype.hasOwnProperty.call(definition, 'roles') || Object.prototype.hasOwnProperty.call(definition, 'allowed_roles');
  let roles = definition.roles ?? definition.allowed_roles ?? null;
  if (hasRoles) {
    if (!Array.isArray(roles) || roles.length === 0 || roles.some((role) => typeof role !== 'string')) {
      throw exportClientError(422, 'Daftar role laporan tidak valid.', 'INVALID_REPORT_DEFINITION');
    }
    roles = [...new Set(roles.map((role) => role.trim().toLowerCase()))];
    if (roles.some((role) => !EXPORT_ROLES.includes(role))) {
      throw exportClientError(422, 'Daftar role laporan tidak valid.', 'INVALID_REPORT_DEFINITION');
    }
  }
  const dateField = definition.date_field === undefined ? null : String(definition.date_field).trim();
  if (dateField !== null && !EXPORT_DATE_FIELDS.includes(dateField)) {
    throw exportClientError(422, 'Kolom tanggal laporan tidak diizinkan.', 'INVALID_REPORT_DEFINITION');
  }
  if (definition.filters !== undefined && (typeof definition.filters !== 'object' || Array.isArray(definition.filters) || definition.filters === null)) {
    throw exportClientError(422, 'Filter tersimpan harus berupa objek.', 'INVALID_REPORT_DEFINITION');
  }
  if (definition.filter !== undefined && (typeof definition.filter !== 'object' || Array.isArray(definition.filter) || definition.filter === null)) {
    throw exportClientError(422, 'Filter tersimpan harus berupa objek.', 'INVALID_REPORT_DEFINITION');
  }
  const actorScope = definition.actor_scope || definition.access_scope;
  if (actorScope !== undefined) {
    if (!actorScope || typeof actorScope !== 'object' || Array.isArray(actorScope)) {
      throw exportClientError(422, 'Cakupan aktor laporan tidak valid.', 'INVALID_REPORT_DEFINITION');
    }
    if (actorScope.division !== undefined && (typeof actorScope.division !== 'string' || !actorScope.division.trim())) {
      throw exportClientError(422, 'Divisi cakupan laporan tidak valid.', 'INVALID_REPORT_DEFINITION');
    }
    if (actorScope.user_ids !== undefined && (!Array.isArray(actorScope.user_ids) || actorScope.user_ids.some((id) => normalizePositiveInteger(id, 'ID pengguna') === null))) {
      throw exportClientError(422, 'Pengguna cakupan laporan tidak valid.', 'INVALID_REPORT_DEFINITION');
    }
  }
  return {
    ...definition,
    visibility,
    owner_id: ownerId,
    roles,
    date_field: dateField,
  };
}

function cleanFilterValue(value, field) {
  if (Array.isArray(value)) {
    if (value.length === 0) throw exportClientError(400, `Filter ${field} tidak boleh kosong.`);
    if (value.length > 100) throw exportClientError(400, `Filter ${field} terlalu panjang.`);
    return value.map((item) => cleanFilterValue(item, field));
  }
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw exportClientError(400, `Filter ${field} tidak valid.`);
  }
  const result = String(value).trim();
  if (result.length > 255) throw exportClientError(400, `Filter ${field} terlalu panjang.`);
  return result;
}

function parseExportFilters(raw = {}) {
  let input = raw || {};
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch {
      throw exportClientError(400, 'Parameter filters harus berupa JSON yang valid.');
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw exportClientError(400, 'Parameter filters harus berupa objek.');
  }
  const result = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = rawKey === 'dateFrom' ? 'start_date' : rawKey === 'dateTo' ? 'end_date' : rawKey;
    if (!PENYALURAN_EXPORT_FILTER_FIELDS.includes(key)) {
      throw exportClientError(400, `Filter laporan tidak diizinkan: ${rawKey}.`, 'INVALID_REPORT_FILTER');
    }
    const value = cleanFilterValue(rawValue, key);
    if (value !== undefined) result[key] = value;
  }
  if (result.from !== undefined && result.start_date === undefined) result.start_date = result.from;
  if (result.to !== undefined && result.end_date === undefined) result.end_date = result.to;
  delete result.from;
  delete result.to;
  if (result.limit !== undefined) {
    if (!/^\d+$/.test(String(result.limit))) throw exportClientError(400, 'Filter limit tidak valid.');
    result.limit = Math.min(Number(result.limit), PENYALURAN_EXPORT_MAX_ROWS);
  }
  if (result.offset !== undefined) {
    if (!/^\d+$/.test(String(result.offset))) throw exportClientError(400, 'Filter offset tidak valid.');
    result.offset = Number(result.offset);
    if (result.offset > PENYALURAN_EXPORT_MAX_OFFSET) throw exportClientError(400, 'Filter offset melebihi batas ekspor.');
  }
  if (result.sort !== undefined && !['id', 'received_date', 'name'].includes(result.sort)) {
    throw exportClientError(400, 'Urutan laporan tidak diizinkan.', 'INVALID_REPORT_FILTER');
  }
  if (result.date_field !== undefined && !['received_date', 'disbursement_date'].includes(result.date_field)) {
    throw exportClientError(400, 'Kolom tanggal laporan tidak diizinkan.', 'INVALID_REPORT_FILTER');
  }
  return result;
}

function parseDateOnly(value) {
  // Report ranges are calendar dates (YYYY-MM-DD); stored row timestamps are
  // compared by their leading calendar date without applying server timezone conversion.
  if (!value) return null;
  const text = String(value).trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match && isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) return `${match[1]}-${match[2]}-${match[3]}`;
  match = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(text);
  if (match && isValidCalendarDate(Number(match[3]), Number(match[2]), Number(match[1]))) return `${match[3]}-${match[2]}-${match[1]}`;
  return null;
}

function isValidCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= maxDay;
}

function monthRange(year, month) {
  if (!isValidCalendarDate(year, month, 1)) throw exportClientError(400, 'Periode laporan tidak valid.', 'INVALID_REPORT_PERIOD');
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start_date: start, end_date: `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}` };
}

function resolveExportPeriod(period, explicit = {}) {
  const start = explicit.start_date;
  const end = explicit.end_date;
  if (start || end) {
    const normalizedStart = parseDateOnly(start);
    const normalizedEnd = parseDateOnly(end);
    if (!start || !end || normalizedStart !== String(start) || normalizedEnd !== String(end) || normalizedStart > normalizedEnd) {
      throw exportClientError(400, 'Rentang periode laporan tidak valid.', 'INVALID_REPORT_PERIOD');
    }
    return { start_date: normalizedStart, end_date: normalizedEnd };
  }
  if (!period || String(period).toLowerCase() === 'all') return null;
  const text = String(period).trim();
  let match = /^(\d{4})-(\d{2})$/.exec(text);
  if (match) {
    const month = Number(match[2]);
    if (!isValidCalendarDate(Number(match[1]), month, 1)) throw exportClientError(400, 'Periode laporan tidak valid.', 'INVALID_REPORT_PERIOD');
    return monthRange(Number(match[1]), month);
  }
  match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) {
    if (!isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) throw exportClientError(400, 'Periode laporan tidak valid.', 'INVALID_REPORT_PERIOD');
    return { start_date: text, end_date: text };
  }
  match = /^(?:Q|Triwulan\s*)([1-4])\s*(\d{4})$/i.exec(text);
  if (match) {
    const startMonth = Number(match[1]) * 3 - 2;
    return { start_date: monthRange(Number(match[2]), startMonth).start_date, end_date: monthRange(Number(match[2]), startMonth + 2).end_date };
  }
  match = /^(?:Triwulan\s*)?(I{1,3}|IV)\s+(\d{4})$/i.exec(text);
  if (match) {
    const quarter = { I: 1, II: 2, III: 3, IV: 4 }[match[1].toUpperCase()];
    const startMonth = (quarter - 1) * 3 + 1;
    return { start_date: monthRange(Number(match[2]), startMonth).start_date, end_date: monthRange(Number(match[2]), startMonth + 2).end_date };
  }
  match = /^([A-Za-zÀ-ÿ]+)\s+(\d{4})$/i.exec(text);
  if (match && INDONESIAN_MONTHS[match[1].toLowerCase()]) return monthRange(Number(match[2]), INDONESIAN_MONTHS[match[1].toLowerCase()]);
  throw exportClientError(422, 'Periode laporan tersimpan tidak dapat dipahami.', 'INVALID_REPORT_PERIOD');
}

function mergeDefinitionFilters(stored, requested) {
  const merged = { ...stored };
  for (const [key, value] of Object.entries(requested)) {
    if (merged[key] !== undefined && String(merged[key]).toLowerCase() !== String(value).toLowerCase()) {
      throw exportClientError(400, `Filter ${key} berbeda dari definisi laporan.`, 'REPORT_FILTER_CONFLICT');
    }
    merged[key] = value;
  }
  return merged;
}

function hasOwnValue(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function getLegacyDefinition(parsed, row) {
  const legacy = {};
  const copyIfPresent = (targetKey, source, sourceKey = targetKey) => {
    if (hasOwnValue(source, sourceKey)) legacy[targetKey] = source[sourceKey];
  };
  copyIfPresent('visibility', parsed);
  copyIfPresent('owner_id', parsed, 'owner_id');
  if (!hasOwnValue(legacy, 'owner_id')) copyIfPresent('owner_id', parsed, 'created_by_id');
  copyIfPresent('roles', parsed, 'allowed_roles');
  if (!hasOwnValue(legacy, 'roles')) copyIfPresent('roles', parsed);
  copyIfPresent('date_field', parsed);
  copyIfPresent('filters', parsed);
  copyIfPresent('filter', parsed);
  copyIfPresent('actor_scope', parsed);
  if (!hasOwnValue(legacy, 'actor_scope')) copyIfPresent('actor_scope', parsed, 'access_scope');
  copyIfPresent('period', parsed);
  copyIfPresent('scope', parsed);
  if (!hasOwnValue(legacy, 'visibility')) copyIfPresent('visibility', row);
  if (!hasOwnValue(legacy, 'owner_id')) copyIfPresent('owner_id', row);
  if (!hasOwnValue(legacy, 'roles')) copyIfPresent('roles', row);
  if (!hasOwnValue(legacy, 'date_field')) copyIfPresent('date_field', row);
  if (!hasOwnValue(legacy, 'scope')) copyIfPresent('scope', row);
  return legacy;
}

function resolveStoredDefinition(row, parsed) {
  const nested = parsed.definition || parsed.report_definition;
  const legacy = getLegacyDefinition(parsed, row);
  if (!nested) return normalizeDefinitionSchema(legacy);

  const normalizedNested = normalizeDefinitionSchema(nested);
  const hasLegacy = Object.keys(legacy).length > 0;
  const normalizedLegacy = hasLegacy ? normalizeDefinitionSchema(legacy) : null;
  if (normalizedLegacy) {
    const mixedAccessKeys = [
      ['filters', 'filters'], ['filter', 'filters'],
      ['actor_scope', 'actor_scope'], ['access_scope', 'actor_scope'],
      ['scope', 'scope'],
    ];
    for (const [legacyKey] of mixedAccessKeys) {
      const nestedHas = hasOwnValue(nested, legacyKey) || (legacyKey === 'filters' && hasOwnValue(nested, 'filter')) || (legacyKey === 'actor_scope' && hasOwnValue(nested, 'access_scope'));
      if (hasOwnValue(legacy, legacyKey) && nestedHas) {
        throw exportClientError(422, 'Metadata akses laporan bertentangan.', 'INVALID_REPORT_DEFINITION');
      }
    }
    const nestedVisibilityPresent = hasOwnValue(nested, 'visibility');
    if (hasOwnValue(legacy, 'visibility') && nestedVisibilityPresent) {
      const legacyVisibility = normalizedLegacy.visibility;
      const nestedVisibility = normalizedNested.visibility;
      const nestedNarrowsShared = legacyVisibility === 'shared' && ['private', 'owner', 'restricted'].includes(nestedVisibility);
      if (legacyVisibility !== nestedVisibility && !nestedNarrowsShared) {
        throw exportClientError(422, 'Visibilitas definisi laporan bertentangan.', 'INVALID_REPORT_DEFINITION');
      }
    }
    const nestedOwnerPresent = hasOwnValue(nested, 'owner_id') || hasOwnValue(nested, 'created_by_id');
    if (hasOwnValue(legacy, 'owner_id') && nestedOwnerPresent && normalizedLegacy.owner_id !== normalizedNested.owner_id) {
      throw exportClientError(422, 'Pemilik definisi laporan bertentangan.', 'INVALID_REPORT_DEFINITION');
    }
    const nestedRolesPresent = hasOwnValue(nested, 'roles') || hasOwnValue(nested, 'allowed_roles');
    if (hasOwnValue(legacy, 'roles') && nestedRolesPresent && normalizedLegacy.roles && normalizedNested.roles) {
      const legacyRoles = new Set(normalizedLegacy.roles);
      if (normalizedNested.roles.some((role) => !legacyRoles.has(role))) {
        throw exportClientError(422, 'Role definisi laporan bertentangan.', 'INVALID_REPORT_DEFINITION');
      }
    }
    if (hasOwnValue(legacy, 'date_field') && hasOwnValue(nested, 'date_field') && normalizedLegacy.date_field !== normalizedNested.date_field) {
      throw exportClientError(422, 'Kolom tanggal definisi laporan bertentangan.', 'INVALID_REPORT_DEFINITION');
    }
  }
  return normalizeDefinitionSchema({ ...legacy, ...nested });
}

function inferDefinition(row, parsed) {
  const definition = resolveStoredDefinition(row, parsed);
  const storedFilters = parseExportFilters(definition.filters || definition.filter || {});
  const title = String(row.title || '');
  if (!storedFilters.program && /^Laporan Realisasi Program\s+(.+)$/i.test(title)) {
    storedFilters.program = title.replace(/^Laporan Realisasi Program\s+/i, '').trim();
  }
  const scope = definition.scope || parsed.scope || row.scope || null;
  if (scope && typeof scope === 'object' && !Array.isArray(scope)) {
    for (const field of ['program', 'kecamatan', 'kelurahan', 'asnaf', 'status', 'fund_source']) {
      if (scope[field] !== undefined && storedFilters[field] === undefined) storedFilters[field] = scope[field];
    }
  } else if (typeof scope === 'string') {
    const scopeMatch = /(?:^|[·,;])\s*(?:Kecamatan|Kec\.?)[\s:]+([^·,;]+)/i.exec(scope);
    if (scopeMatch && storedFilters.kecamatan === undefined && !/^\d+\s+Kecamatan/i.test(scopeMatch[1])) storedFilters.kecamatan = scopeMatch[1].trim();
  }
  return {
    ...row,
    definition,
    filters: storedFilters,
    period: definition.period || parsed.period || row.period,
    scope,
    visibility: definition.visibility,
    ownerId: definition.owner_id,
    roles: definition.roles,
  };
}

function isAdminActor(actor = {}) {
  return actor.role === 'admin' || actor.level === 'admin';
}

function assertReportAccess(report, actor = {}) {
  if (isAdminActor(actor)) return;
  if (Array.isArray(report.roles) && report.roles.length && !report.roles.includes(String(actor.role || '').toLowerCase())) {
    throw exportClientError(403, 'Anda tidak memiliki akses ke laporan ini.', 'REPORT_ACCESS_DENIED');
  }
  const visibility = String(report.visibility || 'shared').toLowerCase();
  if (['private', 'owner', 'restricted'].includes(visibility) && String(report.ownerId) !== String(actor.id)) {
    throw exportClientError(403, 'Anda tidak memiliki akses ke laporan ini.', 'REPORT_ACCESS_DENIED');
  }
  const definitionScope = report.definition?.actor_scope || report.definition?.access_scope;
  if (definitionScope && typeof definitionScope === 'object') {
    if (definitionScope.division && String(definitionScope.division).toLowerCase() !== String(actor.division || '').toLowerCase()) {
      throw exportClientError(403, 'Cakupan laporan tidak sesuai dengan divisi Anda.', 'REPORT_SCOPE_DENIED');
    }
    if (Array.isArray(definitionScope.user_ids) && !definitionScope.user_ids.map(String).includes(String(actor.id))) {
      throw exportClientError(403, 'Cakupan laporan tidak sesuai dengan pengguna Anda.', 'REPORT_SCOPE_DENIED');
    }
  }
  const actorScope = actor.scope && typeof actor.scope === 'object' ? actor.scope : {};
  for (const field of ['program', 'kecamatan', 'kelurahan', 'asnaf']) {
    const actorValues = actorScope[field] ?? actor[`${field}s`];
    const reportValue = report.filters?.[field];
    if (actorValues !== undefined && reportValue !== undefined) {
      const allowed = (Array.isArray(actorValues) ? actorValues : [actorValues]).map((value) => String(value).toLowerCase());
      const reportValues = Array.isArray(reportValue) ? reportValue : [reportValue];
      if (!reportValues.some((value) => allowed.includes(String(value).toLowerCase()))) {
        throw exportClientError(403, 'Cakupan laporan tidak sesuai dengan pengguna Anda.', 'REPORT_SCOPE_DENIED');
      }
    }
  }
}

function normalizeExportOptions(options = {}) {
  if (options && (typeof options.all === 'function' || typeof options.get === 'function' || typeof options.run === 'function')) {
    return { db: options };
  }
  return options || {};
}

export async function resolveLaporanExport(reportId, options = {}) {
  const normalizedOptions = normalizeExportOptions(options);
  const db = normalizedOptions.db || await getDb();
  const actor = {
    ...(normalizedOptions.actor || {}),
    ...normalizeAccessActor(normalizedOptions.actor || {}),
  };
  const row = await db.get('SELECT * FROM reports WHERE id = $1', [reportId]);
  if (!row) throw exportClientError(404, 'Laporan tidak ditemukan.', 'REPORT_NOT_FOUND');
  const parsed = parseDefinitionJson(row.metrics_json);
  const report = inferDefinition(row, parsed);
  assertReportAccess(report, actor);

  const requestedRaw = normalizedOptions.filters?.filters || normalizedOptions.filters || {};
  const requested = parseExportFilters(requestedRaw);
  const persistedFilters = { ...report.filters };
  const persistedPeriod = report.period && typeof report.period === 'object' ? report.period : {};
  const definitionRange = resolveExportPeriod(
    typeof report.period === 'string' ? report.period : null,
    persistedPeriod
  );
  const hasStoredFilterPeriod = ['period', 'start_date', 'end_date'].some((field) => persistedFilters[field] !== undefined);
  const storedFilterRange = hasStoredFilterPeriod
    ? resolveExportPeriod(persistedFilters.period, persistedFilters)
    : null;
  let persistedRange = definitionRange || storedFilterRange;
  if (definitionRange && storedFilterRange) {
    if (storedFilterRange.start_date < definitionRange.start_date || storedFilterRange.end_date > definitionRange.end_date) {
      throw exportClientError(422, 'Periode filter tersimpan melebihi definisi laporan.', 'INVALID_REPORT_DEFINITION');
    }
    persistedRange = {
      start_date: storedFilterRange.start_date > definitionRange.start_date ? storedFilterRange.start_date : definitionRange.start_date,
      end_date: storedFilterRange.end_date < definitionRange.end_date ? storedFilterRange.end_date : definitionRange.end_date,
    };
  }
  const requestedPeriod = requested.period || requested.start_date || requested.end_date
    ? resolveExportPeriod(requested.period, requested)
    : null;
  const requestedDateField = requested.date_field;
  const persistedDateField = report.definition?.date_field || 'received_date';
  if (requestedDateField !== undefined && requestedDateField !== persistedDateField) {
    throw exportClientError(400, 'Kolom tanggal berbeda dari definisi laporan.', 'REPORT_FILTER_CONFLICT');
  }
  delete persistedFilters.period;
  delete persistedFilters.start_date;
  delete persistedFilters.end_date;
  delete persistedFilters.date_field;
  delete requested.period;
  delete requested.start_date;
  delete requested.end_date;
  delete requested.date_field;
  if (persistedRange && requestedPeriod && (requestedPeriod.start_date < persistedRange.start_date || requestedPeriod.end_date > persistedRange.end_date)) {
    throw exportClientError(400, 'Periode permintaan melebihi definisi laporan.', 'REPORT_PERIOD_CONFLICT');
  }
  const filters = mergeDefinitionFilters(persistedFilters, requested);
  if (!isAdminActor(actor)) {
    const actorScope = actor.scope && typeof actor.scope === 'object' ? actor.scope : {};
    for (const field of ['program', 'kecamatan', 'kelurahan', 'asnaf']) {
      const actorValues = actorScope[field] ?? actor[`${field}s`];
      if (actorValues === undefined) continue;
      if (filters[field] === undefined) {
        filters[field] = actorValues;
        continue;
      }
      const allowed = (Array.isArray(actorValues) ? actorValues : [actorValues]).map((value) => String(value).toLowerCase());
      const existingValues = Array.isArray(filters[field]) ? filters[field] : [filters[field]];
      const narrowedValues = existingValues.filter((value) => allowed.includes(String(value).toLowerCase()));
      if (!narrowedValues.length) {
        throw exportClientError(403, 'Cakupan laporan tidak sesuai dengan pengguna Anda.', 'REPORT_SCOPE_DENIED');
      }
      filters[field] = Array.isArray(filters[field]) ? narrowedValues : narrowedValues[0];
    }
  }
  const period = requestedPeriod || persistedRange;

  const conditions = [];
  const params = [];
  for (const [field, column] of Object.entries(EXPORT_QUERY_FIELDS)) {
    if (filters[field] === undefined) continue;
    const values = Array.isArray(filters[field]) ? filters[field] : [filters[field]];
    const placeholders = values.map((value) => {
      params.push(value);
      return `$${params.length}`;
    });
    conditions.push(`LOWER(COALESCE(${column}, '')) IN (${placeholders.map((p) => `LOWER(${p})`).join(', ')})`);
  }
  if (filters.search !== undefined) {
    const search = `%${String(filters.search).toLowerCase()}%`;
    const fields = ['name', 'file_no', 'nik', 'program', 'kecamatan', 'kelurahan'];
    conditions.push(`(${fields.map((field) => { params.push(search); return `LOWER(COALESCE(${field}, '')) LIKE $${params.length}`; }).join(' OR ')})`);
  }
  const dateField = requestedDateField || report.definition?.date_field || 'received_date';
  if (period) {
    params.push(period.start_date);
    conditions.push(`SUBSTR(${dateField}, 1, 10) >= $${params.length}`);
    params.push(period.end_date);
    conditions.push(`SUBSTR(${dateField}, 1, 10) <= $${params.length}`);
  }
  const whereSql = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const sort = filters.sort || 'id';
  const limit = filters.limit ?? PENYALURAN_EXPORT_MAX_ROWS;
  const offset = filters.offset ?? 0;
  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;
  const rows = await db.all(`SELECT * FROM mustahik${whereSql} ORDER BY ${sort} ASC, id ASC LIMIT ${limitParam} OFFSET ${offsetParam}`, params);
  const normalizedRows = rows.filter((rowItem) => {
    if (!period) return true;
    const date = parseDateOnly(rowItem[dateField]);
    return date !== null && date >= period.start_date && date <= period.end_date;
  });
  return { report, rows: normalizedRows, period, filters, limit, offset };
}

export async function getLaporanExportData(reportId, options = {}) {
  return resolveLaporanExport(reportId, options);
}

function sanitizeCsvValue(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Export a persisted Penyaluran report definition as CSV or JSON. */
export async function exportLaporanData(reportId, format = 'csv', options = {}) {
  if (format && typeof format === 'object') {
    options = format;
    format = 'csv';
  }
  const result = await resolveLaporanExport(reportId, options);
  const mustahikList = result.rows;
  if (String(format).toLowerCase() === 'json') {
    return {
      report_id: reportId,
      generated_at: new Date().toISOString(),
      source: 'BAZNAS Kota Tangerang Data Center V2',
      definition: {
        period: result.period,
        filters: result.filters,
        scope: result.report.scope,
      },
      total_records: mustahikList.length,
      data: mustahikList.map(formatMustahikRow),
    };
  }
  if (String(format).toLowerCase() !== 'csv') throw exportClientError(400, 'Format ekspor tidak didukung.', 'INVALID_EXPORT_FORMAT');
  const headers = [
    'No', 'No Berkas', 'Nama Mustahik', 'NIK', 'Kecamatan', 'Kelurahan',
    'Program', 'Asnaf', 'Nominal Disetujui', 'Status', 'Tanggal Terima', 'Metode Pembayaran'
  ];
  const rows = mustahikList.map((m, idx) => [
    idx + 1,
    m.file_no,
    m.name,
    m.nik,
    m.kecamatan,
    m.kelurahan,
    m.program,
    m.asnaf,
    m.approved_amount || m.recommended_amount || 0,
    m.status,
    m.received_date,
    m.payment_method || 'Transfer',
  ]);
  return '\uFEFF' + [headers.map(sanitizeCsvValue).join(','), ...rows.map((row) => row.map(sanitizeCsvValue).join(','))].join('\r\n');
}

// ==========================================
// 10. DIVISI PENERIMAAN REPOSITORY
// ==========================================

const FUND_TYPE_LABELS = Object.freeze({
  zakat_maal: 'Zakat Maal',
  zakat_fitrah: 'Zakat Fitrah',
  zakat_profesi: 'Zakat Penghasilan / Profesi',
  infak: 'Infak Operasional & Umum',
  sedekah: 'Sedekah Terikat / Bebas',
  dskl: 'DSKL (Dana Sosial Keagamaan Lain)',
  fidyah: 'Fidyah & Kafarat',
  qurban: 'Program Qurban BAZNAS',
});

const CHANNEL_LABELS = Object.freeze({
  bank_transfer: 'Transfer Bank',
  qris: 'QRIS',
  counter_kasir: 'Counter Kasir',
  virtual_account: 'Virtual Account',
  payment_gateway: 'Payment Gateway',
  jemput_zakat: 'Layanan Jemput Zakat',
  kotak_amal: 'Kotak Amal Keliling',
});

/**
 * Penerimaan date filters are calendar dates, not JavaScript date prefixes.
 * Reject impossible dates and reversed ranges before they reach SQL.
 */
export function normalizePenerimaanDateRange({ start_date, end_date, period } = {}) {
  const hasStart = start_date !== undefined && start_date !== null && String(start_date).trim() !== '';
  const hasEnd = end_date !== undefined && end_date !== null && String(end_date).trim() !== '';
  if (period === 'custom' && (!hasStart || !hasEnd)) {
    const error = new Error('Periode kustom harus memiliki tanggal mulai dan tanggal akhir.');
    error.status = 422;
    error.code = 'INVALID_PENERIMAAN_PERIOD';
    throw error;
  }
  if (!hasStart && !hasEnd) return { start: null, end: null };
  if (hasStart !== hasEnd && period === 'custom') {
    const error = new Error('Periode kustom harus memiliki tanggal mulai dan tanggal akhir.');
    error.status = 422;
    error.code = 'INVALID_PENERIMAAN_PERIOD';
    throw error;
  }

  const parse = (value, label) => {
    const text = String(value).trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    const year = match ? Number(match[1]) : 0;
    const month = match ? Number(match[2]) : 0;
    const day = match ? Number(match[3]) : 0;
    const valid = Boolean(match) && year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 &&
      day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (!valid) {
      const error = new Error(`Tanggal ${label} tidak valid. Gunakan format YYYY-MM-DD.`);
      error.status = 422;
      error.code = 'INVALID_PENERIMAAN_PERIOD';
      throw error;
    }
    return text;
  };

  const start = hasStart ? parse(start_date, 'mulai') : null;
  const end = hasEnd ? parse(end_date, 'akhir') : null;
  if (start && end && start > end) {
    const error = new Error('Tanggal mulai periode tidak boleh melewati tanggal akhir.');
    error.status = 422;
    error.code = 'INVALID_PENERIMAAN_PERIOD';
    throw error;
  }
  return { start, end };
}

/**
 * Returns comprehensive overview data for Divisi Penerimaan dashboard.
 * Supports period filtering ('7d', '30d', '1y', 'custom'), channel, and fund_type filters.
 */
export async function getPenerimaanOverview(
  { period = '30d', channel, fund_type, start_date, end_date } = {},
  dbOverride = null,
  now = new Date()
) {
  const db = dbOverride || (await getDb());

  let start;
  let end;
  const nowIsoDate = now.toISOString().slice(0, 10);

  if (period === 'custom') {
    const range = normalizePenerimaanDateRange({ period, start_date, end_date });
    start = range.start;
    end = range.end;
  } else if (['7d', '30d', '1y'].includes(period)) {
    start = getPeriodStart(period, now);
    end = nowIsoDate;
  } else if (period === undefined || period === null || period === '') {
    start = getPeriodStart('30d', now);
    end = nowIsoDate;
  } else {
    const error = new Error('Periode penerimaan tidak valid.');
    error.status = 422;
    error.code = 'INVALID_PENERIMAAN_PERIOD';
    throw error;
  }

  const startIso = `${start}T00:00:00.000Z`;
  const endIso = `${end}T23:59:59.999Z`;

  const conditions = ['created_at >= $1', 'created_at <= $2'];
  const params = [startIso, endIso];

  if (channel) {
    params.push(channel);
    conditions.push(`channel = $${params.length}`);
  }

  if (fund_type) {
    params.push(fund_type);
    conditions.push(`fund_type = $${params.length}`);
  }

  const whereSql = conditions.join(' AND ');

  // 1. Core aggregate metrics
  const metricsRow = await db.get(
    `SELECT
       CAST(COALESCE(SUM(CASE WHEN status NOT IN ('Ditolak', 'Dibatalkan') THEN amount ELSE 0 END), 0) AS TEXT) AS total_collected,
       COUNT(*) AS total_transactions,
       COALESCE(SUM(CASE WHEN status IN ('Tervalidasi', 'Terverifikasi', 'Disetujui', 'Menunggu Rekonsiliasi', 'Terekonsiliasi', 'Posted') THEN 1 ELSE 0 END), 0) AS validated_transaction_count,
       COALESCE(SUM(CASE WHEN status IN ('Menunggu Validasi', 'Masuk') THEN 1 ELSE 0 END), 0) AS pending_validation_count,
       COALESCE(SUM(CASE WHEN status = 'Menunggu Approval' THEN 1 ELSE 0 END), 0) AS pending_approval_count,
       COALESCE(SUM(CASE WHEN status IN ('Tervalidasi', 'Terverifikasi', 'Disetujui') AND (reconciled_at IS NULL) THEN 1 ELSE 0 END), 0) AS unreconciled_count,
       COALESCE(SUM(CASE WHEN (is_flagged = TRUE OR is_duplicate = TRUE OR is_incomplete = TRUE OR status = 'Ditolak') THEN 1 ELSE 0 END), 0) AS exception_count
     FROM penerimaan_transactions
     WHERE ${whereSql}`,
    params
  );

  // 2. Active unique muzakki count in the period
  const muzakkiRow = await db.get(
    `SELECT COUNT(DISTINCT muzakki_name) AS active_muzakki_count
     FROM penerimaan_transactions
     WHERE ${whereSql} AND status NOT IN ('Ditolak', 'Dibatalkan')`,
    params
  );

  const totalCollected = BigInt(toCanonicalRupiahString(metricsRow?.total_collected));
  const totalTransactions = Number(metricsRow?.total_transactions || 0);
  const validatedCount = Number(metricsRow?.validated_transaction_count || 0);
  const activeMuzakkiCount = Number(muzakkiRow?.active_muzakki_count || 0);
  const pendingValidationCount = Number(metricsRow?.pending_validation_count || 0);
  const pendingApprovalCount = Number(metricsRow?.pending_approval_count || 0);
  const unreconciledCount = Number(metricsRow?.unreconciled_count || 0);
  const exceptionCount = Number(metricsRow?.exception_count || 0);

  const averageAmount = totalTransactions > 0
    ? ((totalCollected + BigInt(totalTransactions) / 2n) / BigInt(totalTransactions)).toString()
    : '0';

  // RKAT Monthly Target: Rp 500,000,000 normalized to period length
  const daySpan = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const targetRkat = Math.round((500_000_000 / 30) * daySpan);
  const targetAttainmentPct = targetRkat > 0
    ? Math.min(100, Number((totalCollected * 100n + BigInt(Math.floor(targetRkat / 2))) / BigInt(targetRkat)))
    : 0;

  const metrics = {
    total_collected: totalCollected.toString(),
    total_transactions: totalTransactions,
    validated_transaction_count: validatedCount,
    active_muzakki_count: activeMuzakkiCount,
    pending_validation_count: pendingValidationCount,
    pending_approval_count: pendingApprovalCount,
    unreconciled_count: unreconciledCount,
    average_amount: averageAmount,
    target_attainment_pct: targetAttainmentPct,
    exception_count: exceptionCount,
  };

  // 3. Fund Type Breakdown
  const fundRows = await db.all(
    `SELECT fund_type, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount_numeric,
            CAST(COALESCE(SUM(amount), 0) AS TEXT) AS amount
     FROM penerimaan_transactions
     WHERE ${whereSql} AND status NOT IN ('Ditolak', 'Dibatalkan')
     GROUP BY fund_type
     ORDER BY amount_numeric DESC`,
    params
  );

  const fundTypeBreakdown = fundRows.map((row) => {
    const amount = BigInt(toCanonicalRupiahString(row.amount));
    const count = Number(row.count || 0);
    const percentage = totalCollected > 0n
      ? Number((amount * 100n + totalCollected / 2n) / totalCollected)
      : 0;
    return {
      fund_type: row.fund_type,
      name: FUND_TYPE_LABELS[row.fund_type] || row.fund_type,
      amount: amount.toString(),
      count,
      percentage,
    };
  });

  // 4. Channel Breakdown
  const channelRows = await db.all(
    `SELECT channel, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount_numeric,
            CAST(COALESCE(SUM(amount), 0) AS TEXT) AS amount
     FROM penerimaan_transactions
     WHERE ${whereSql} AND status NOT IN ('Ditolak', 'Dibatalkan')
     GROUP BY channel
     ORDER BY amount_numeric DESC`,
    params
  );

  const channelBreakdown = channelRows.map((row) => {
    const amount = BigInt(toCanonicalRupiahString(row.amount));
    const count = Number(row.count || 0);
    const percentage = totalCollected > 0n
      ? Number((amount * 100n + totalCollected / 2n) / totalCollected)
      : 0;
    return {
      channel: row.channel,
      name: CHANNEL_LABELS[row.channel] || row.channel,
      amount: amount.toString(),
      count,
      percentage,
    };
  });

  // 5. Daily Trend Aggregation
  const trendRows = await db.all(
    `SELECT SUBSTR(CAST(created_at AS VARCHAR), 1, 10) AS date,
            COUNT(*) AS count,
            CAST(COALESCE(SUM(amount), 0) AS TEXT) AS amount
     FROM penerimaan_transactions
     WHERE ${whereSql} AND status NOT IN ('Ditolak', 'Dibatalkan')
     GROUP BY SUBSTR(CAST(created_at AS VARCHAR), 1, 10)
     ORDER BY date ASC`,
    params
  );

  const trend = trendRows.map((row) => ({
    date: row.date,
    amount: toCanonicalRupiahString(row.amount),
    count: Number(row.count || 0),
  }));

  // 6. Action Queue Items
  const actionQueue = [];
  if (pendingValidationCount > 0) {
    actionQueue.push({
      id: 'validasi-manual',
      title: 'Validasi Bukti Manual',
      type: 'validation',
      count: pendingValidationCount,
      link: '/penerimaan/transaksi?status=Menunggu%20Validasi',
      description: 'Transaksi memerlukan verifikasi bukti transfer kasir/bank.',
    });
  }
  if (pendingApprovalCount > 0) {
    actionQueue.push({
      id: 'approval-pimpinan',
      title: 'Persetujuan Tertunda',
      type: 'approval',
      count: pendingApprovalCount,
      link: '/penerimaan/transaksi?status=Menunggu%20Approval',
      description: 'Transaksi nominal tinggi/berisiko memerlukan persetujuan Kepala Bagian.',
    });
  }
  if (unreconciledCount > 0) {
    actionQueue.push({
      id: 'rekonsiliasi-bank',
      title: 'Rekonsiliasi Tertunda',
      type: 'reconciliation',
      count: unreconciledCount,
      link: '/penerimaan/rekonsiliasi',
      description: 'Transaksi tervalidasi yang belum dicocokkan dengan rekening koran.',
    });
  }

  // 7. Recent Activity (8 transactions)
  const recentRows = await db.all(
    `SELECT id, transaction_number, receipt_number, channel, fund_type,
            CAST(amount AS TEXT) AS amount, muzakki_name, status, is_flagged, created_at, created_by_name
     FROM penerimaan_transactions
     WHERE ${whereSql}
     ORDER BY created_at DESC
     LIMIT 8`,
    params
  );

  const recentActivity = recentRows.map((row) => ({
    id: row.id,
    transaction_id: row.id,
    transaction_number: row.transaction_number,
    actor_name: row.created_by_name || 'Amil Penerimaan',
    action: row.status,
    description: `${row.muzakki_name} - ${FUND_TYPE_LABELS[row.fund_type] || row.fund_type} (${CHANNEL_LABELS[row.channel] || row.channel})`,
    timestamp: row.created_at,
    status: row.status,
    amount: toCanonicalRupiahString(row.amount),
    is_flagged: Boolean(row.is_flagged),
    muzakki_name: row.muzakki_name,
    channel: row.channel,
    fund_type: row.fund_type,
  }));

  return {
    period,
    dateRange: { start, end },
    metrics,
    trend,
    fund_type_breakdown: fundTypeBreakdown,
    channel_breakdown: channelBreakdown,
    action_queue: actionQueue,
    recent_activity: recentActivity,
  };
}

/**
 * Seeds default channels, accounts, and demo transactions for Divisi Penerimaan.
 * Only executes in development/demo mode when channels are empty.
 */
export async function seedPenerimaanData(db) {
  try {
    // 1. Seed default channels
    const channels = [
      { code: 'portal_web', name: 'Portal Web BAZNAS', category: 'digital', provider: 'portal' },
      { code: 'portal_publik', name: 'Portal Publik', category: 'digital', provider: 'portal' },
      { code: 'portal', name: 'Portal Web', category: 'digital', provider: 'portal' },
      { code: 'bank_transfer', name: 'Transfer Bank', category: 'digital', provider: 'bsi' },
      { code: 'qris', name: 'QRIS BAZNAS Kota Tangerang', category: 'digital', provider: 'qris_national' },
      { code: 'counter_kasir', name: 'Counter Kasir Kantor BAZNAS', category: 'manual', provider: 'internal' },
      { code: 'tunai', name: 'Tunai Kasir Kantor', category: 'manual', provider: 'internal' },
      { code: 'virtual_account', name: 'Virtual Account', category: 'digital', provider: 'bni_syariah' },
      { code: 'jemput_zakat', name: 'Layanan Jemput Zakat', category: 'manual', provider: 'internal' },
    ];

    for (const c of channels) {
      const exists = await db.get('SELECT id FROM penerimaan_channels WHERE code = $1', [c.code]);
      if (!exists) {
        await db.run(
          `INSERT INTO penerimaan_channels (code, name, category, provider, is_active)
           VALUES ($1, $2, $3, $4, TRUE)`,
          [c.code, c.name, c.category, c.provider]
        );
      }
    }

    // 2. Seed default bank accounts
    const accCheck = await db.get('SELECT COUNT(*) as cnt FROM penerimaan_accounts');
    const accCnt = accCheck ? parseInt(accCheck.cnt || accCheck.count || 0, 10) : 0;
    if (accCnt === 0) {
      const accounts = [
        { channel_code: 'bank_transfer', bank_name: 'Bank Syariah Indonesia (BSI)', account_number: '7001122334', account_holder: 'BAZNAS Kota Tangerang - Zakat' },
        { channel_code: 'bank_transfer', bank_name: 'Bank Muamalat', account_number: '3010099881', account_holder: 'BAZNAS Kota Tangerang - Infak/Sedekah' },
        { channel_code: 'qris', bank_name: 'QRIS Bank BSI', account_number: '936001234567', account_holder: 'BAZNAS Kota Tangerang QRIS' },
      ];

      for (const a of accounts) {
        const channelRow = await db.get(`SELECT id FROM penerimaan_channels WHERE code = $1`, [a.channel_code]);
        const channelId = channelRow?.id || null;
        await db.run(
          `INSERT INTO penerimaan_accounts (channel_id, bank_name, account_number, account_holder, is_active)
           VALUES ($1, $2, $3, $4, TRUE)`,
          [channelId, a.bank_name, a.account_number, a.account_holder]
        );
      }
    }

    // 3. Seed demo transactions if empty
    const txCheck = await db.get('SELECT COUNT(*) as cnt FROM penerimaan_transactions');
    const txCnt = txCheck ? parseInt(txCheck.cnt || txCheck.count || 0, 10) : 0;
    if (txCnt === 0) {
      const now = new Date();
      const sampleTxs = [
        {
          transaction_number: 'TRX-202609-0001',
          receipt_number: 'BSZ-2026-0001',
          channel: 'bank_transfer',
          channel_category: 'digital',
          muzakki_name: 'H. Abdul Rahman, M.Si',
          fund_type: 'zakat_maal',
          amount: 5000000,
          net_amount: 5000000,
          status: 'Tervalidasi',
          created_by_name: 'Siti Rahmah, M.E',
          daysAgo: 1,
        },
        {
          transaction_number: 'TRX-202609-0002',
          receipt_number: 'BSZ-2026-0002',
          channel: 'qris',
          channel_category: 'digital',
          muzakki_name: 'PT Sinar Berkah Nusantara',
          fund_type: 'zakat_profesi',
          amount: 25000000,
          net_amount: 25000000,
          status: 'Menunggu Approval',
          is_flagged: true,
          created_by_name: 'Ahmad Naufal',
          daysAgo: 2,
        },
        {
          transaction_number: 'TRX-202609-0003',
          receipt_number: 'BSZ-2026-0003',
          channel: 'counter_kasir',
          channel_category: 'manual',
          muzakki_name: 'Hj. Fatimah Zahra',
          fund_type: 'infak',
          amount: 750000,
          net_amount: 750000,
          status: 'Menunggu Validasi',
          created_by_name: 'Staff Kasir BAZNAS',
          daysAgo: 0,
        },
        {
          transaction_number: 'TRX-202609-0004',
          receipt_number: 'BSZ-2026-0004',
          channel: 'bank_transfer',
          channel_category: 'digital',
          muzakki_name: 'Ir. Bambang Trihatmojo',
          fund_type: 'sedekah',
          amount: 1200000,
          net_amount: 1200000,
          status: 'Posted',
          created_by_name: 'Siti Rahmah, M.E',
          daysAgo: 3,
        },
        {
          transaction_number: 'TRX-202609-0005',
          receipt_number: 'BSZ-2026-0005',
          channel: 'jemput_zakat',
          channel_category: 'manual',
          muzakki_name: 'Dra. Sri Wahyuni',
          fund_type: 'zakat_maal',
          amount: 8500000,
          net_amount: 8500000,
          status: 'Tervalidasi',
          created_by_name: 'Petugas Jemput Zakat',
          daysAgo: 4,
        },
        {
          transaction_number: 'TRX-202609-0006',
          receipt_number: 'BSZ-2026-0006',
          channel: 'qris',
          channel_category: 'digital',
          muzakki_name: 'Ahmad Fauzi',
          fund_type: 'dskl',
          amount: 350000,
          net_amount: 350000,
          status: 'Posted',
          created_by_name: 'QRIS Gateway',
          daysAgo: 5,
        },
      ];

      for (const tx of sampleTxs) {
        const txDate = new Date(now.getTime() - tx.daysAgo * 86400000).toISOString();
        await db.run(
          `INSERT INTO penerimaan_transactions (
             transaction_number, receipt_number, channel, channel_category,
             muzakki_name, fund_type, amount, fee_amount, net_amount, status,
             is_flagged, created_by_name, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11, $12)`,
          [
            tx.transaction_number,
            tx.receipt_number,
            tx.channel,
            tx.channel_category,
            tx.muzakki_name,
            tx.fund_type,
            tx.amount,
            tx.net_amount,
            tx.status,
            Boolean(tx.is_flagged),
            tx.created_by_name,
            txDate,
          ]
        );
      }
    }

    console.log('Penerimaan channels, accounts, and demo data successfully seeded.');
  } catch (err) {
    console.warn('Penerimaan seeding notice (non-fatal):', err.message);
  }
}

export function formatPenerimaanTransactionRow(row) {
  if (!row) return null;
  let riskFlags = [];
  try {
    if (typeof row.risk_flags === 'string') {
      riskFlags = JSON.parse(row.risk_flags);
    } else if (Array.isArray(row.risk_flags)) {
      riskFlags = row.risk_flags;
    }
  } catch {}

  const rawAmt = row.amount_text !== undefined ? row.amount_text : row.amount;
  const rawFee = row.fee_amount_text !== undefined ? row.fee_amount_text : row.fee_amount;
  const rawNet = row.net_amount_text !== undefined ? row.net_amount_text : row.net_amount;

  const canonicalAmount = toCanonicalRupiahString(rawAmt);
  const canonicalFee = toCanonicalRupiahString(rawFee);
  const canonicalNet = toCanonicalRupiahString(rawNet);

  return {
    ...row,
    id: row.id,
    amount: canonicalAmount,
    fee_amount: canonicalFee,
    net_amount: canonicalNet,
    is_manual: Boolean(row.is_manual),
    is_duplicate: Boolean(row.is_duplicate),
    is_incomplete: Boolean(row.is_incomplete),
    is_flagged: Boolean(row.is_flagged),
    risk_flags: riskFlags,
    workflow_version: Number(row.workflow_version || 0),
  };
}

const PENERIMAAN_TRANSACTION_SAFE_FIELDS = Object.freeze([
  'id', 'transaction_number', 'receipt_number', 'channel', 'channel_category', 'provider_name',
  'provider_ref', 'account_id', 'reconciliation_batch_id', 'muzakki_id', 'muzakki_name', 'fund_type',
  'program_id', 'program_name', 'sub_program', 'amount', 'fee_amount', 'net_amount', 'status',
  'payment_method', 'is_manual', 'is_duplicate', 'is_incomplete', 'is_flagged', 'risk_flags',
  'rejection_reason', 'clarification_notes', 'created_by_id', 'created_by_name', 'validated_by_id',
  'validated_by_name', 'validated_at', 'approved_by_id', 'approved_by_name', 'approved_at',
  'reconciled_at', 'posted_at', 'transaction_date', 'workflow_version', 'created_at', 'updated_at',
 ]);

function pickPenerimaanTransactionFields(row, fields = PENERIMAAN_TRANSACTION_SAFE_FIELDS) {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(row, field)).map((field) => [field, row[field]]));
}

/** DTO used by list, dashboard and report previews. It deliberately excludes
 * donor contact details, bank account details, and evidence paths. */
export function formatPenerimaanTransactionListRow(row) {
  if (!row) return null;
  return pickPenerimaanTransactionFields(formatPenerimaanTransactionRow(row));
}

/**
 * Lists transactions for Divisi Penerimaan with cursor-based pagination and multiple filters.
 */
export async function listPenerimaanTransactions(filters = {}, dbOverride = null) {
  const db = dbOverride || (await getDb());
  const conditions = [];
  const values = [];

  const add = (condition, value) => {
    values.push(value);
    conditions.push(condition.replace('?', `$${values.length}`));
  };

  if (filters.status) {
    add('status = ?', filters.status);
  }

  if (filters.channel) {
    add('channel = ?', filters.channel);
  }

  if (filters.fund_type) {
    add('fund_type = ?', filters.fund_type);
  }

  if (filters.is_flagged !== undefined && filters.is_flagged !== null && filters.is_flagged !== '') {
    add('is_flagged = ?', String(filters.is_flagged) === 'true');
  }

  if (filters.needs_action) {
    conditions.push(`status IN ('Menunggu Validasi', 'Masuk', 'Menunggu Approval')`);
  }

  const dateRange = normalizePenerimaanDateRange(filters);
  if (dateRange.start) add('created_at >= ?', `${dateRange.start}T00:00:00.000Z`);
  if (dateRange.end) add('created_at <= ?', `${dateRange.end}T23:59:59.999Z`);

  if (filters.min_amount) {
    add('amount >= ?', Number(filters.min_amount));
  }

  if (filters.max_amount) {
    add('amount <= ?', Number(filters.max_amount));
  }

  if (filters.search) {
    const q = `%${String(filters.search).trim().toLowerCase()}%`;
    const searchCols = [
      'transaction_number',
      'receipt_number',
      'muzakki_name',
      'muzakki_phone',
      'provider_ref',
      'bank_account_number',
    ];
    const searchConditions = searchCols.map((col) => {
      values.push(q);
      return `LOWER(COALESCE(${col}, '')) LIKE $${values.length}`;
    });
    conditions.push(`(${searchConditions.join(' OR ')})`);
  }

  if (filters.cursor) {
    const cursorId = Number(filters.cursor);
    if (!Number.isNaN(cursorId) && cursorId > 0) {
      add('id < ?', cursorId);
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit || 20, 10)));

  // Total count for metadata
  const countRow = await db.get(`SELECT COUNT(*) as total FROM penerimaan_transactions ${where}`, values);
  const totalCount = Number(countRow?.total || 0);

  // Fetch limit + 1
  const fetchLimit = limit + 1;
  const rows = await db.all(
    `SELECT *,
            CAST(amount AS TEXT) as amount_text,
            CAST(fee_amount AS TEXT) as fee_amount_text,
            CAST(net_amount AS TEXT) as net_amount_text
     FROM penerimaan_transactions ${where} ORDER BY id DESC LIMIT ${fetchLimit}`,
    values
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length > 0 ? String(items[items.length - 1].id) : null;

  return {
    items: items.map(formatPenerimaanTransactionListRow),
    next_cursor: nextCursor,
    prev_cursor: null,
    has_more: hasMore,
    total_count: totalCount,
  };
}

/**
 * Retrieves a single Penerimaan transaction with full detail, approvals, and timeline.
 */
export async function getPenerimaanTransactionById(id, actor = {}, dbOverride = null) {
  // Preserve the historical (id, db) call contract for repository workflows.
  if (actor && typeof actor.get === 'function') {
    dbOverride = actor;
    actor = {};
  }
  const db = dbOverride || (await getDb());
  const row = await db.get(
    `SELECT *,
            CAST(amount AS TEXT) as amount_text,
            CAST(fee_amount AS TEXT) as fee_amount_text,
            CAST(net_amount AS TEXT) as net_amount_text
     FROM penerimaan_transactions WHERE id = $1 OR transaction_number = $1`,
    [id]
  );
  if (!row) return null;

  const formatted = formatPenerimaanTransactionRow(row);

  // Fetch approvals if table exists
  let approvals = [];
  try {
    approvals = await db.all(
      'SELECT * FROM penerimaan_approvals WHERE transaction_id = $1 ORDER BY created_at ASC',
      [formatted.id]
    );
  } catch {}

  // Generate canonical timeline
  const timeline = [
    {
      status: 'Masuk',
      timestamp: formatted.created_at,
      actor_name: formatted.created_by_name || 'System / Gateway',
      notes: 'Transaksi donasi berhasil dicatat ke sistem.',
    },
  ];

  if (formatted.validated_at) {
    timeline.push({
      status: 'Tervalidasi',
      timestamp: formatted.validated_at,
      actor_name: formatted.validated_by_name || 'Staff Penerimaan',
      notes: 'Verifikasi bukti transfer dan kesesuaian dana telah tuntas.',
    });
  }

  if (formatted.approved_at) {
    timeline.push({
      status: 'Disetujui',
      timestamp: formatted.approved_at,
      actor_name: formatted.approved_by_name || 'Kepala Bagian Penerimaan',
      notes: 'Persetujuan nominal tinggi / bendera risiko telah disahkan.',
    });
  }

  if (formatted.reconciled_at) {
    timeline.push({
      status: 'Rekonsiliasi Selesai',
      timestamp: formatted.reconciled_at,
      actor_name: 'Sistem Rekonsiliasi Bank',
      notes: 'Transaksi telah dicocokkan dengan mutasi rekening koran bank.',
    });
  }

  if (formatted.status === 'Posted') {
    timeline.push({
      status: 'Posted',
      timestamp: formatted.reconciled_at || formatted.validated_at || formatted.created_at,
      actor_name: 'Buku Besar BAZNAS',
      notes: 'Transaksi dibukukan secara permanen ke kas penerimaan.',
    });
  } else if (formatted.status === 'Ditolak') {
    timeline.push({
      status: 'Ditolak',
      timestamp: formatted.updated_at || formatted.created_at,
      actor_name: formatted.approved_by_name || formatted.validated_by_name || 'Amil Penerimaan',
      notes: formatted.rejection_reason || 'Transaksi ditolak karena tidak memenuhi ketentuan.',
    });
  }

  const detail = {
    ...formatted,
    approvals,
    timeline,
  };
  // No caller should receive raw storage fields unless it is an internal
  // workflow or an explicitly authorized Penerimaan actor.
  const role = String(actor?.role || '').trim().toLowerCase();
  const level = String(actor?.level || '').trim().toLowerCase();
  const division = String(actor?.division || '').trim().toLowerCase();
  const authorized = !actor || Object.keys(actor).length === 0 || role === 'admin' || level === 'admin' ||
    role === 'penerimaan' || division.includes('penerimaan') || division.includes('pengumpulan');
  if (authorized) return detail;
  return {
    ...pickPenerimaanTransactionFields(detail),
    approvals: detail.approvals,
    timeline: detail.timeline,
  };
}

/**
 * Bulk validates eligible Penerimaan transactions.
 * Transactions must be in 'Menunggu Validasi' or 'Masuk', have no risk flags, and be below threshold.
 */
export async function bulkValidatePenerimaanTransactions(
  { transaction_ids = [], actor = {}, notes = '' } = {},
  dbOverride = null
) {
  const db = dbOverride || (await getDb());
  if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
    return { validated_count: 0, failed_ids: [], message: 'Tidak ada transaksi yang dipilih' };
  }

  const settings = await getPenerimaanOperationalPolicy(db);
  let validatedCount = 0;
  const failedIds = [];

  for (const id of transaction_ids) {
    const row = await db.get(
      `SELECT t.*, CAST(t.amount AS TEXT) AS amount_text,
              CAST(t.fee_amount AS TEXT) AS fee_amount_text,
              CAST(t.net_amount AS TEXT) AS net_amount_text
       FROM penerimaan_transactions t WHERE t.id = $1`,
      [id]
    );
    if (!row) {
      failedIds.push({ id, reason: 'Transaksi tidak ditemukan' });
      continue;
    }

    const tx = formatPenerimaanTransactionRow(row);
    if (!['Menunggu Validasi', 'Masuk'].includes(tx.status)) {
      failedIds.push({ id, reason: `Status transaksi tidak valid untuk validasi: ${tx.status}` });
      continue;
    }

    if (requiresLeaderApproval(tx, settings)) {
      failedIds.push({
        id,
        reason: 'Transaksi memerlukan persetujuan Kepala Bagian (nominal >= threshold atau memiliki indikator risiko)',
      });
      continue;
    }

    const transition = validatePenerimaanTransition({
      currentStatus: tx.status,
      action: PENERIMAAN_ACTIONS.VALIDATE,
      actor,
      transaction: tx,
      settings,
    });

    if (!transition.allowed) {
      failedIds.push({ id, reason: transition.reason || 'Transisi ditolak oleh policy' });
      continue;
    }

    const nextStatus = transition.nextStatus || 'Menunggu Rekonsiliasi';
    const now = new Date().toISOString();

    await db.run(
      `UPDATE penerimaan_transactions
       SET status = $1, validated_by_id = $2, validated_by_name = $3, validated_at = $4, updated_at = $5
       WHERE id = $6`,
      [nextStatus, actor.id || null, actor.name || 'Staff Penerimaan', now, now, id]
    );

    validatedCount++;
  }

  return {
    validated_count: validatedCount,
    failed_count: failedIds.length,
    failed_ids: failedIds,
  };
}

/**
 * Appends an audit event to penerimaan_audit_events.
 */
export async function recordPenerimaanAuditEvent(
  db,
  { entity_type = 'transaction', entity_id, action, actor = {}, changes = {}, metadata = {} } = {}
) {
  if (actor?.__simulateAuditFailure) {
    throw new Error('Simulated audit failure during transaction');
  }
  const meta = { ...metadata };
  if (actor.correlation_id && !meta.correlation_id) {
    meta.correlation_id = actor.correlation_id;
  }
  if (actor.reason && !meta.reason) {
    meta.reason = actor.reason;
  }
  const changesJson = typeof changes === 'string' ? changes : JSON.stringify(changes);
  const metaJson = typeof meta === 'string' ? meta : JSON.stringify(meta);
  await db.run(
    `INSERT INTO penerimaan_audit_events (
      entity_type, entity_id, action, actor_id, actor_name, actor_role, changes, metadata, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
    [
      entity_type,
      String(entity_id),
      action,
      actor.id || null,
      actor.name || 'System',
      actor.role || actor.level || 'staff',
      changesJson,
      metaJson,
    ]
  );
}

/**
 * Appends an approval record to penerimaan_approvals.
 */
export async function recordPenerimaanApproval(
  db,
  { transaction_id, actor = {}, action, from_status, to_status, notes = '' } = {}
) {
  try {
    await db.run(
      `INSERT INTO penerimaan_approvals (
        transaction_id, actor_id, actor_name, actor_role, action, from_status, to_status, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
      [
        transaction_id,
        actor.id || null,
        actor.name || 'Amil',
        actor.role || actor.level || 'leader',
        action,
        from_status,
        to_status,
        notes || null,
      ]
    );
  } catch (err) {
    console.error('Failed to record penerimaan approval:', err.message);
  }
}

/**
 * Generates next sequential transaction number: TRX-YYYYMM-XXXX
 */
export async function generateNextPenerimaanTransactionNumber(date = new Date(), dbOverride = null) {
  const db = dbOverride || (await getDb());
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const prefix = `TRX-${year}${month}-`;

  const latest = await db.get(
    `SELECT transaction_number FROM penerimaan_transactions WHERE transaction_number LIKE $1 ORDER BY transaction_number DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let nextSeq = 1;
  if (latest && latest.transaction_number) {
    const parts = latest.transaction_number.split('-');
    if (parts.length >= 3) {
      const currentSeq = parseInt(parts[2], 10);
      if (!isNaN(currentSeq)) {
        nextSeq = currentSeq + 1;
      }
    }
  }

  let candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;
  let exists = await db.get(
    `SELECT 1 FROM penerimaan_transactions WHERE transaction_number = $1`,
    [candidate]
  );
  while (exists) {
    nextSeq += 1;
    candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;
    exists = await db.get(
      `SELECT 1 FROM penerimaan_transactions WHERE transaction_number = $1`,
      [candidate]
    );
  }

  return candidate;
}

/**
 * Generates next sequential receipt number (BSZ): BSZ-YYYY-XXXX
 */
export async function generateNextPenerimaanReceiptNumber(date = new Date(), dbOverride = null) {
  const db = dbOverride || (await getDb());
  const d = new Date(date);
  const year = d.getFullYear();
  const prefix = `BSZ-${year}-`;

  const latest = await db.get(
    `SELECT receipt_number FROM penerimaan_transactions WHERE receipt_number LIKE $1 ORDER BY receipt_number DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let nextSeq = 1;
  if (latest && latest.receipt_number) {
    const parts = latest.receipt_number.split('-');
    if (parts.length >= 3) {
      const currentSeq = parseInt(parts[2], 10);
      if (!isNaN(currentSeq)) {
        nextSeq = currentSeq + 1;
      }
    }
  }

  let candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;
  let exists = await db.get(
    `SELECT 1 FROM penerimaan_transactions WHERE receipt_number = $1`,
    [candidate]
  );
  while (exists) {
    nextSeq += 1;
    candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;
    exists = await db.get(
      `SELECT 1 FROM penerimaan_transactions WHERE receipt_number = $1`,
      [candidate]
    );
  }

  return candidate;
}

/**
 * Creates a manual Penerimaan transaction.
 */
export async function createManualPenerimaanTransaction(
  payload = {},
  actor = {},
  dbOverride = null
) {
  const db = dbOverride || (await getDb());

  // 1. Validation
  const amountStr = parseCanonicalIntegerMoney(payload.amount, 'Nominal transaksi', false);
  const amountBigInt = BigInt(amountStr);
  if (amountBigInt <= 0n) {
    const err = new Error('Nominal transaksi harus berupa bilangan bulat positif lebih besar dari 0.');
    err.status = 400;
    throw err;
  }

  if (!payload.channel) {
    const err = new Error('Kanal penerimaan wajib dipilih.');
    err.status = 400;
    throw err;
  }
  await assertActivePenerimaanChannel(payload.channel, db);

  if (!payload.fund_type) {
    const err = new Error('Jenis dana ZIS wajib dipilih.');
    err.status = 400;
    throw err;
  }

  const muzakkiName = String(payload.muzakki_name || '').trim();
  if (!muzakkiName) {
    const err = new Error('Nama muzakki / donatur wajib diisi.');
    err.status = 400;
    throw err;
  }

  // Check reference uniqueness if provided
  const providerRef = payload.provider_ref ? String(payload.provider_ref).trim() : null;
  if (providerRef) {
    const existingRef = await db.get(
      'SELECT id FROM penerimaan_transactions WHERE provider_ref = $1 AND channel = $2',
      [providerRef, payload.channel]
    );
    if (existingRef) {
      const err = new Error(`Nomor referensi "${providerRef}" sudah pernah dicatat untuk kanal ${payload.channel}.`);
      err.status = 409;
      throw err;
    }
  }

  const settings = await getPenerimaanOperationalPolicy(db);

  // 2. Generate transaction number & receipt number
  const transactionNumber = await generateNextPenerimaanTransactionNumber(new Date(), db);
  const receiptNumber = payload.receipt_number ? String(payload.receipt_number).trim() : await generateNextPenerimaanReceiptNumber(new Date(), db);

  // 3. Category & Risk flags
  let channelCategory = 'digital';
  if (['tunai'].includes(payload.channel)) {
    channelCategory = 'cash_batch';
  } else if (['jemput_zakat', 'counter_kasir'].includes(payload.channel)) {
    channelCategory = 'manual';
  }

  const riskFlags = [];
  const candidateTx = {
    amount: amountStr,
    channel: payload.channel,
    is_manual: false,
  };
  if (requiresLeaderApproval(candidateTx, settings)) {
    riskFlags.push('amount_exceeds_threshold');
  }
  if (payload.channel === 'tunai' && amountBigInt >= 5000000n) {
    riskFlags.push('high_cash_amount');
  }

  const isFlagged = riskFlags.length > 0;
  const status = 'Menunggu Validasi';
  const feeAmount = '0';
  const netAmount = amountStr;
  const now = new Date().toISOString();

  // 4. Insert transaction
  const insertSql = `
    INSERT INTO penerimaan_transactions (
      transaction_number, receipt_number, channel, channel_category, provider_name, provider_ref,
      muzakki_id, muzakki_name, muzakki_phone, muzakki_email, fund_type,
      program_id, program_name, sub_program, amount, fee_amount, net_amount,
      status, payment_method, evidence_url, bank_name, bank_account_number,
      is_manual, is_flagged, risk_flags, created_by_id, created_by_name,
      workflow_version, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16, $17,
      $18, $19, $20, $21, $22,
      $23, $24, $25, $26, $27,
      $28, $29, $30
    ) RETURNING id
  `;

  const insertParams = [
    transactionNumber,
    receiptNumber,
    payload.channel,
    channelCategory,
    payload.bank_name || payload.channel,
    providerRef,
    payload.muzakki_id || null,
    muzakkiName,
    payload.muzakki_phone || null,
    payload.muzakki_email || null,
    payload.fund_type,
    payload.program_id || null,
    payload.program_name || null,
    payload.sub_program || null,
    amountStr,
    feeAmount,
    netAmount,
    status,
    payload.payment_method || payload.channel,
    payload.evidence_url || null,
    payload.bank_name || null,
    payload.bank_account_number || null,
    true, // is_manual
    isFlagged ? 1 : 0,
    JSON.stringify(riskFlags),
    actor.id || null,
    actor.name || 'Amil Penerimaan',
    0, // workflow_version
    now,
    now,
  ];

  const res = await db.run(insertSql, insertParams);
  const newId = res.lastID || (await db.get('SELECT id FROM penerimaan_transactions WHERE transaction_number = $1', [transactionNumber]))?.id;

  // 5. Record Audit
  await recordPenerimaanAuditEvent(db, {
    entity_type: 'transaction',
    entity_id: newId,
    action: 'create_manual',
    actor,
    changes: { status, amount: amountStr, channel: payload.channel, fund_type: payload.fund_type },
    metadata: { notes: payload.notes || null },
  });

  return getPenerimaanTransactionById(newId, db);
}

/**
 * Validates a Penerimaan transaction by ID.
 */
export async function validatePenerimaanTransactionById(
  { id, actor = {}, notes = '', expected_version } = {},
  dbOverride = null
) {
  const db = dbOverride || (await getDb());
  const tx = await getPenerimaanTransactionById(id, db);
  if (!tx) {
    const err = new Error('Transaksi penerimaan tidak ditemukan.');
    err.status = 404;
    throw err;
  }

  // Optimistic concurrency check
  if (expected_version !== undefined && expected_version !== null && expected_version !== '') {
    if (Number(tx.workflow_version) !== Number(expected_version)) {
      const err = new Error('Transaksi telah diperbarui oleh pengguna lain. Silakan muat ulang data.');
      err.status = 409;
      err.code = 'STALE_VERSION';
      throw err;
    }
  }

  const settings = await getPenerimaanOperationalPolicy(db);

  // State machine transition validation
  const transition = validatePenerimaanTransition({
    currentStatus: tx.status,
    action: PENERIMAAN_ACTIONS.VALIDATE,
    actor,
    transaction: tx,
    settings,
  });

  if (!transition.allowed) {
    const err = new Error(transition.reason || 'Validasi transaksi ditolak.');
    err.status = 422;
    throw err;
  }

  const nextStatus = transition.nextStatus || 'Menunggu Rekonsiliasi';
  const now = new Date().toISOString();

  await db.run(
    `UPDATE penerimaan_transactions
     SET status = $1, validated_by_id = $2, validated_by_name = $3, validated_at = $4,
         workflow_version = workflow_version + 1, updated_at = $5
     WHERE id = $6`,
    [nextStatus, actor.id || null, actor.name || 'Staff Penerimaan', now, now, id]
  );

  // If requires leader approval, record an approval record entry indicating submitted for approval
  if (nextStatus === 'Menunggu Approval') {
    await recordPenerimaanApproval(db, {
      transaction_id: id,
      actor,
      action: 'submit_approval',
      from_status: tx.status,
      to_status: nextStatus,
      notes,
    });
  }

  // Record audit
  await recordPenerimaanAuditEvent(db, {
    entity_type: 'transaction',
    entity_id: id,
    action: 'validate',
    actor,
    changes: { from_status: tx.status, to_status: nextStatus },
    metadata: { notes },
  });

  return getPenerimaanTransactionById(id, db);
}

/**
 * Approves a transaction waiting for Leader approval.
 */
export async function approvePenerimaanTransactionById(
  { id, actor = {}, notes = '', expected_version } = {},
  dbOverride = null
) {
  const db = dbOverride || (await getDb());
  const tx = await getPenerimaanTransactionById(id, db);
  if (!tx) {
    const err = new Error('Transaksi penerimaan tidak ditemukan.');
    err.status = 404;
    throw err;
  }

  // Optimistic concurrency check
  if (expected_version !== undefined && expected_version !== null && expected_version !== '') {
    if (Number(tx.workflow_version) !== Number(expected_version)) {
      const err = new Error('Transaksi telah diperbarui oleh pengguna lain. Silakan muat ulang data.');
      err.status = 409;
      err.code = 'STALE_VERSION';
      throw err;
    }
  }

  // Self-approval check:
  const creatorId = tx.created_by_id ?? tx.createdBy;
  if (creatorId !== undefined && creatorId !== null && String(creatorId) === String(actor.id) && actor.role !== 'admin') {
    const err = new Error('Kepala Bagian tidak boleh menyetujui transaksi yang dibuat sendiri.');
    err.status = 403;
    throw err;
  }

  const settings = await getPenerimaanOperationalPolicy(db);

  // State machine transition validation
  const transition = validatePenerimaanTransition({
    currentStatus: tx.status,
    action: PENERIMAAN_ACTIONS.APPROVE,
    actor,
    transaction: tx,
    settings,
  });

  if (!transition.allowed) {
    const err = new Error(transition.reason || 'Persetujuan transaksi ditolak.');
    err.status = 422;
    throw err;
  }

  const nextStatus = transition.nextStatus || 'Menunggu Rekonsiliasi';
  const now = new Date().toISOString();

  await db.run(
    `UPDATE penerimaan_transactions
     SET status = $1, approved_by_id = $2, approved_by_name = $3, approved_at = $4,
         workflow_version = workflow_version + 1, updated_at = $5
     WHERE id = $6`,
    [nextStatus, actor.id || null, actor.name || 'Kepala Bagian Penerimaan', now, now, id]
  );

  await recordPenerimaanApproval(db, {
    transaction_id: id,
    actor,
    action: 'approve',
    from_status: tx.status,
    to_status: nextStatus,
    notes,
  });

  await recordPenerimaanAuditEvent(db, {
    entity_type: 'transaction',
    entity_id: id,
    action: 'approve',
    actor,
    changes: { from_status: tx.status, to_status: nextStatus },
    metadata: { notes },
  });

  return getPenerimaanTransactionById(id, db);
}

/**
 * Rejects a transaction.
 */
export async function rejectPenerimaanTransactionById(
  { id, actor = {}, reason = '', expected_version } = {},
  dbOverride = null
) {
  const db = dbOverride || (await getDb());
  const tx = await getPenerimaanTransactionById(id, db);
  if (!tx) {
    const err = new Error('Transaksi penerimaan tidak ditemukan.');
    err.status = 404;
    throw err;
  }

  if (!reason || !String(reason).trim()) {
    const err = new Error('Alasan penolakan transaksi wajib disertakan.');
    err.status = 400;
    throw err;
  }

  // Optimistic concurrency check
  if (expected_version !== undefined && expected_version !== null && expected_version !== '') {
    if (Number(tx.workflow_version) !== Number(expected_version)) {
      const err = new Error('Transaksi telah diperbarui oleh pengguna lain. Silakan muat ulang data.');
      err.status = 409;
      err.code = 'STALE_VERSION';
      throw err;
    }
  }

  // State machine transition validation
  const transition = validatePenerimaanTransition({
    currentStatus: tx.status,
    action: PENERIMAAN_ACTIONS.REJECT,
    actor,
    transaction: tx,
  });

  if (!transition.allowed) {
    const err = new Error(transition.reason || 'Penolakan transaksi tidak diizinkan.');
    err.status = 422;
    throw err;
  }

  const nextStatus = 'Ditolak';
  const now = new Date().toISOString();

  await db.run(
    `UPDATE penerimaan_transactions
     SET status = $1, rejection_reason = $2, workflow_version = workflow_version + 1, updated_at = $3
     WHERE id = $4`,
    [nextStatus, reason, now, id]
  );

  if (tx.status === 'Menunggu Approval') {
    await recordPenerimaanApproval(db, {
      transaction_id: id,
      actor,
      action: 'reject',
      from_status: tx.status,
      to_status: nextStatus,
      notes: reason,
    });
  }

  await recordPenerimaanAuditEvent(db, {
    entity_type: 'transaction',
    entity_id: id,
    action: 'reject',
    actor,
    changes: { from_status: tx.status, to_status: nextStatus },
    metadata: { reason },
  });

  return getPenerimaanTransactionById(id, db);
}

/**
 * Requests clarification for an incomplete or questionable transaction.
 */
export async function requestClarificationPenerimaanTransaction(
  { id, actor = {}, notes = '', expected_version } = {},
  dbOverride = null
) {
  const db = dbOverride || (await getDb());
  const tx = await getPenerimaanTransactionById(id, db);
  if (!tx) {
    const err = new Error('Transaksi penerimaan tidak ditemukan.');
    err.status = 404;
    throw err;
  }

  if (!notes || !String(notes).trim()) {
    const err = new Error('Catatan permintaan klarifikasi wajib disertakan.');
    err.status = 400;
    throw err;
  }

  if (expected_version !== undefined && expected_version !== null && expected_version !== '') {
    if (Number(tx.workflow_version) !== Number(expected_version)) {
      const err = new Error('Transaksi telah diperbarui oleh pengguna lain. Silakan muat ulang data.');
      err.status = 409;
      err.code = 'STALE_VERSION';
      throw err;
    }
  }

  const transition = validatePenerimaanTransition({
    currentStatus: tx.status,
    action: PENERIMAAN_ACTIONS.REQUEST_CLARIFICATION,
    actor,
    transaction: tx,
  });

  if (!transition.allowed) {
    const err = new Error(transition.reason || 'Permintaan klarifikasi tidak diizinkan.');
    err.status = 422;
    throw err;
  }

  const nextStatus = 'Perlu Klarifikasi';
  const now = new Date().toISOString();

  await db.run(
    `UPDATE penerimaan_transactions
     SET status = $1, clarification_notes = $2, workflow_version = workflow_version + 1, updated_at = $3
     WHERE id = $4`,
    [nextStatus, notes, now, id]
  );

  await recordPenerimaanAuditEvent(db, {
    entity_type: 'transaction',
    entity_id: id,
    action: 'request_clarification',
    actor,
    changes: { from_status: tx.status, to_status: nextStatus },
    metadata: { notes },
  });

  return getPenerimaanTransactionById(id, db);
}

/**
 * Resolves clarification and returns transaction to Menunggu Validasi.
 */
export async function resolveClarificationPenerimaanTransaction(
  { id, actor = {}, notes = '', expected_version } = {},
  dbOverride = null
) {
  const db = dbOverride || (await getDb());
  const tx = await getPenerimaanTransactionById(id, db);
  if (!tx) {
    const err = new Error('Transaksi penerimaan tidak ditemukan.');
    err.status = 404;
    throw err;
  }

  if (expected_version !== undefined && expected_version !== null && expected_version !== '') {
    if (Number(tx.workflow_version) !== Number(expected_version)) {
      const err = new Error('Transaksi telah diperbarui oleh pengguna lain. Silakan muat ulang data.');
      err.status = 409;
      err.code = 'STALE_VERSION';
      throw err;
    }
  }

  const transition = validatePenerimaanTransition({
    currentStatus: tx.status,
    action: PENERIMAAN_ACTIONS.RESOLVE_CLARIFICATION,
    actor,
    transaction: tx,
  });

  if (!transition.allowed) {
    const err = new Error(transition.reason || 'Penyelesaian klarifikasi tidak diizinkan.');
    err.status = 422;
    throw err;
  }

  const nextStatus = 'Menunggu Validasi';
  const now = new Date().toISOString();

  await db.run(
    `UPDATE penerimaan_transactions
     SET status = $1, clarification_notes = NULL, workflow_version = workflow_version + 1, updated_at = $2
     WHERE id = $3`,
    [nextStatus, now, id]
  );

  await recordPenerimaanAuditEvent(db, {
    entity_type: 'transaction',
    entity_id: id,
    action: 'resolve_clarification',
    actor,
    changes: { from_status: tx.status, to_status: nextStatus },
    metadata: { notes },
  });

  return getPenerimaanTransactionById(id, db);
}

/**
 * Reverses a Posted transaction.
 */
export async function reversePenerimaanTransactionById(
  { id, actor = {}, reason = '', expected_version } = {},
  dbOverride = null
) {
  const db = dbOverride || (await getDb());
  const tx = await getPenerimaanTransactionById(id, db);
  if (!tx) {
    const err = new Error('Transaksi penerimaan tidak ditemukan.');
    err.status = 404;
    throw err;
  }

  if (!reason || !String(reason).trim()) {
    const err = new Error('Alasan reversal / koreksi transaksi wajib disertakan.');
    err.status = 400;
    throw err;
  }

  if (expected_version !== undefined && expected_version !== null && expected_version !== '') {
    if (Number(tx.workflow_version) !== Number(expected_version)) {
      const err = new Error('Transaksi telah diperbarui oleh pengguna lain. Silakan muat ulang data.');
      err.status = 409;
      err.code = 'STALE_VERSION';
      throw err;
    }
  }

  const revCheck = canReverseTransaction({ actor, transaction: tx });
  if (!revCheck.allowed) {
    const err = new Error(revCheck.reason || 'Reversal transaksi tidak diizinkan.');
    err.status = tx.status !== 'Posted' ? 422 : 403;
    throw err;
  }

  const nextStatus = 'Dibatalkan';
  const now = new Date().toISOString();

  await db.run(
    `UPDATE penerimaan_transactions
     SET status = $1, rejection_reason = $2, workflow_version = workflow_version + 1, updated_at = $3
     WHERE id = $4`,
    [nextStatus, `[REVERSAL] ${reason}`, now, id]
  );

  await recordPenerimaanAuditEvent(db, {
    entity_type: 'transaction',
    entity_id: id,
    action: 'reverse',
    actor,
    changes: { from_status: tx.status, to_status: nextStatus },
    metadata: { reason },
  });

  return getPenerimaanTransactionById(id, db);
}

/**
 * Masks sensitive PII (phone, email, NIK/NPWP)
 */
export function maskSensitiveValue(value, type = 'phone') {
  if (!value) return null;
  const str = String(value).trim();
  if (type === 'phone') {
    if (str.length <= 4) return '****';
    return `${str.slice(0, 4)}****${str.slice(-3)}`;
  }
  if (type === 'email') {
    const atIdx = str.indexOf('@');
    if (atIdx <= 1) return '***@***.com';
    const namePart = str.slice(0, atIdx);
    const domainPart = str.slice(atIdx);
    return `${namePart[0]}***${namePart.slice(-1)}${domainPart}`;
  }
  if (type === 'identity') {
    if (str.length <= 6) return '******';
    return `${str.slice(0, 6)}******${str.slice(-2)}`;
  }
  return '******';
}

/**
 * Formats a raw row from `muzakki` table, applying PII masking if required.
 */
export function formatMuzakkiRow(row, actor = {}) {
  if (!row) return null;

  const isAnonymous = row.type === 'anonim' || ['hamba allah', 'anonim'].includes(String(row.name || '').toLowerCase().trim());
  const role = String(actor?.role || '').toLowerCase();
  const division = String(actor?.division || '').toLowerCase();
  const level = String(actor?.level || '').toLowerCase();
  const isPenerimaanOrAdmin =
    role === 'admin' ||
    level === 'admin' ||
    role === 'penerimaan' ||
    division.includes('penerimaan') ||
    division.includes('pengumpulan');

  // Anonymous profiles have masked PII regardless of staff role to preserve donor privacy, unless actor is admin
  const shouldMask = !isPenerimaanOrAdmin || (isAnonymous && role !== 'admin' && level !== 'admin');

  return {
    id: row.id,
    npwz: row.npwz || null,
    name: isAnonymous && shouldMask && (!row.name || ['hamba allah', 'anonim'].includes(row.name.toLowerCase().trim()))
      ? 'Hamba Allah'
      : row.name,
    type: row.type || (isAnonymous ? 'anonim' : 'individu'),
    identity_type: row.identity_type || null,
    identity_number: shouldMask && row.identity_number ? maskSensitiveValue(row.identity_number, 'identity') : row.identity_number || null,
    phone: shouldMask && row.phone ? maskSensitiveValue(row.phone, 'phone') : row.phone || null,
    email: shouldMask && row.email ? maskSensitiveValue(row.email, 'email') : row.email || null,
    address: shouldMask && isAnonymous ? null : row.address || null,
    city: row.city || 'Kota Tangerang',
    notes: isPenerimaanOrAdmin ? row.notes || null : null,
    total_donations_count: Number(row.total_donations_count || 0),
    total_donations_amount: toCanonicalRupiahString(row.total_donations_amount),
    last_donation_date: row.last_donation_date || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Generates next NPWZ: NPWZ-YYYY-XXXX
 */
export async function generateNextNpwz(date = new Date(), dbOverride = null) {
  const db = dbOverride || (await getDb());
  const year = new Date(date).getFullYear();
  const prefix = `NPWZ-${year}-`;

  const latest = await db.get(
    `SELECT npwz FROM muzakki WHERE npwz LIKE $1 ORDER BY npwz DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let nextSeq = 1;
  if (latest && latest.npwz) {
    const parts = latest.npwz.split('-');
    if (parts.length >= 3) {
      const currentSeq = parseInt(parts[2], 10);
      if (!isNaN(currentSeq)) {
        nextSeq = currentSeq + 1;
      }
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * List Muzakki with cursor pagination, aggregated stats, and PII masking.
 */
export async function listMuzakki(
  { search = '', type = '', city = '', cursor, limit = 20, actor = {} } = {},
  dbOverride = null
) {
  const db = dbOverride || (await getDb());
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const whereClauses = [];
  const params = [];
  let paramIdx = 1;

  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    whereClauses.push(`(
      LOWER(m.name) LIKE $${paramIdx++} OR
      LOWER(COALESCE(m.phone, '')) LIKE $${paramIdx++} OR
      LOWER(COALESCE(m.identity_number, '')) LIKE $${paramIdx++} OR
      LOWER(COALESCE(m.npwz, '')) LIKE $${paramIdx++}
    )`);
    params.push(term, term, term, term);
  }

  if (type && type.trim()) {
    whereClauses.push(`m.type = $${paramIdx++}`);
    params.push(type.trim());
  }

  if (city && city.trim()) {
    whereClauses.push(`m.city = $${paramIdx++}`);
    params.push(city.trim());
  }

  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const [curCreated, curId] = decoded.split('|');
      if (curCreated && curId) {
        whereClauses.push(`(m.created_at < $${paramIdx++} OR (m.created_at = $${paramIdx++} AND m.id < $${paramIdx++}))`);
        params.push(curCreated, curCreated, Number(curId));
      }
    } catch {
      // ignore bad cursor
    }
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Total count query
  const countParams = params.slice(0, cursor ? params.length - 3 : params.length);
  const countWhereClauses = whereClauses.filter((c) => !c.includes('m.created_at <'));
  const countWhereSql = countWhereClauses.length > 0 ? `WHERE ${countWhereClauses.join(' AND ')}` : '';
  const countRow = await db.get(`SELECT COUNT(*) as cnt FROM muzakki m ${countWhereSql}`, countParams);
  const totalCount = countRow ? parseInt(countRow.cnt || countRow.count || 0, 10) : 0;

  const querySql = `
    SELECT
      m.id, m.npwz, m.name, m.type, m.identity_type, m.identity_number,
      m.phone, m.email, m.address, m.city, m.notes, m.created_at, m.updated_at,
      CAST(COALESCE(stats.total_amount, 0) AS TEXT) AS total_donations_amount,
      COALESCE(stats.total_count, 0) AS total_donations_count,
      stats.last_donation_date
    FROM muzakki m
    LEFT JOIN (
      SELECT
        muzakki_id,
        SUM(amount) AS total_amount,
        COUNT(id) AS total_count,
        MAX(created_at) AS last_donation_date
      FROM penerimaan_transactions
      WHERE muzakki_id IS NOT NULL
      GROUP BY muzakki_id
    ) stats ON stats.muzakki_id = m.id
    ${whereSql}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT $${paramIdx}
  `;
  params.push(lim + 1);

  const rows = await db.all(querySql, params);
  const hasMore = rows.length > lim;
  const items = hasMore ? rows.slice(0, lim) : rows;

  let nextCursor = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = Buffer.from(`${last.created_at}|${last.id}`).toString('base64');
  }

  return {
    items: items.map((r) => formatMuzakkiRow(r, actor)),
    next_cursor: nextCursor,
    has_more: hasMore,
    total_count: totalCount,
  };
}

/**
 * Get detailed Muzakki profile including donation summary and recent transactions.
 */
export async function getMuzakkiById(id, actor = {}, dbOverride = null) {
  const db = dbOverride || (await getDb());
  const numId = Number(id);

  const querySql = `
    SELECT
      m.id, m.npwz, m.name, m.type, m.identity_type, m.identity_number,
      m.phone, m.email, m.address, m.city, m.notes, m.created_at, m.updated_at,
      CAST(COALESCE(stats.total_amount, 0) AS TEXT) AS total_donations_amount,
      COALESCE(stats.total_count, 0) AS total_donations_count,
      stats.last_donation_date
    FROM muzakki m
    LEFT JOIN (
      SELECT
        muzakki_id,
        SUM(amount) AS total_amount,
        COUNT(id) AS total_count,
        MAX(created_at) AS last_donation_date
      FROM penerimaan_transactions
      WHERE muzakki_id IS NOT NULL
      GROUP BY muzakki_id
    ) stats ON stats.muzakki_id = m.id
    WHERE m.id = $1
  `;

  const row = await db.get(querySql, [numId]);
  if (!row) return null;

  // Recent transactions
  const txRows = await db.all(
    `SELECT t.*, CAST(t.amount AS TEXT) AS amount_text,
            CAST(t.fee_amount AS TEXT) AS fee_amount_text,
            CAST(t.net_amount AS TEXT) AS net_amount_text
     FROM penerimaan_transactions t
     WHERE t.muzakki_id = $1 ORDER BY t.created_at DESC LIMIT 20`,
    [numId]
  );

  const firstTx = await db.get(
    `SELECT created_at FROM penerimaan_transactions WHERE muzakki_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [numId]
  );

  const prefChannelRow = await db.get(
    `SELECT channel, COUNT(*) as cnt FROM penerimaan_transactions WHERE muzakki_id = $1 GROUP BY channel ORDER BY cnt DESC LIMIT 1`,
    [numId]
  );
  const preferredChannel = prefChannelRow?.channel || (txRows[0]?.channel || null);

  const totalAmount = BigInt(toCanonicalRupiahString(row.total_donations_amount));
  const totalCount = Number(row.total_donations_count || 0);

  const formattedMuzakki = formatMuzakkiRow(row, actor);

  return {
    ...formattedMuzakki,
    preferred_channel: preferredChannel,
    recent_transactions: txRows.map(formatPenerimaanTransactionRow),
    donation_summary: {
      total_amount: totalAmount.toString(),
      total_count: totalCount,
      avg_amount: totalCount > 0
        ? ((totalAmount + BigInt(totalCount) / 2n) / BigInt(totalCount)).toString()
        : '0',
      first_donation: firstTx?.created_at || null,
      last_donation: row.last_donation_date || null,
      preferred_channel: preferredChannel,
    },
  };
}

/**
 * Creates a new Muzakki profile.
 */
export async function createMuzakki(payload = {}, actor = {}, dbOverride = null) {
  const db = dbOverride || (await getDb());
  const type = payload.type || 'individu';

  const name = String(payload.name || '').trim();
  if (!name && type !== 'anonim') {
    const err = new Error('Nama muzakki wajib diisi.');
    err.status = 400;
    throw err;
  }

  const npwz = payload.npwz ? String(payload.npwz).trim() : await generateNextNpwz(new Date(), db);
  const now = new Date().toISOString();

  const insertSql = `
    INSERT INTO muzakki (
      npwz, name, type, identity_type, identity_number, phone, email, address, city, notes, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id
  `;

  const params = [
    npwz,
    name || 'Hamba Allah',
    type,
    payload.identity_type || null,
    payload.identity_number || null,
    payload.phone || null,
    payload.email || null,
    payload.address || null,
    payload.city || 'Kota Tangerang',
    payload.notes || null,
    now,
    now,
  ];

  const result = await db.run(insertSql, params);
  const newId = result?.lastID || (await db.get('SELECT id FROM muzakki WHERE npwz = $1', [npwz]))?.id;

  await recordPenerimaanAuditEvent(db, {
    entity_type: 'muzakki',
    entity_id: newId,
    action: 'create',
    actor,
    changes: {
      npwz,
      name: name || 'Hamba Allah',
      type,
    },
    metadata: { notes: payload.notes || null },
  });

  return getMuzakkiById(newId, actor, db);
}

/**
 * Updates an existing Muzakki profile.
 */
export async function updateMuzakki(id, payload = {}, actor = {}, dbOverride = null) {
  const db = dbOverride || (await getDb());
  const numId = Number(id);

  const existing = await db.get('SELECT * FROM muzakki WHERE id = $1', [numId]);
  if (!existing) {
    const err = new Error('Data muzakki tidak ditemukan.');
    err.status = 404;
    throw err;
  }

  const name = payload.name !== undefined ? String(payload.name).trim() : existing.name;
  if (!name && (payload.type || existing.type) !== 'anonim') {
    const err = new Error('Nama muzakki tidak boleh kosong.');
    err.status = 400;
    throw err;
  }

  const now = new Date().toISOString();

  await db.run(
    `UPDATE muzakki
     SET name = $1, type = $2, identity_type = $3, identity_number = $4,
         phone = $5, email = $6, address = $7, city = $8, notes = $9, updated_at = $10
     WHERE id = $11`,
    [
      name,
      payload.type || existing.type,
      payload.identity_type !== undefined ? payload.identity_type : existing.identity_type,
      payload.identity_number !== undefined ? payload.identity_number : existing.identity_number,
      payload.phone !== undefined ? payload.phone : existing.phone,
      payload.email !== undefined ? payload.email : existing.email,
      payload.address !== undefined ? payload.address : existing.address,
      payload.city !== undefined ? payload.city : existing.city,
      payload.notes !== undefined ? payload.notes : existing.notes,
      now,
      numId,
    ]
  );

  await recordPenerimaanAuditEvent(db, {
    entity_type: 'muzakki',
    entity_id: numId,
    action: 'update',
    actor,
    changes: {
      old: { name: existing.name, phone: existing.phone, email: existing.email },
      new: { name, phone: payload.phone, email: payload.email },
    },
  });

  return getMuzakkiById(numId, actor, db);
}

/**
 * Finds potential duplicate muzakki suggestions.
 */
export async function getDuplicateMuzakkiSuggestions(actor = {}, dbOverride = null) {
  const db = dbOverride || (await getDb());

  const suggestions = [];
  const processedGroups = new Set();

  async function addGroup(rows, reason, confidence) {
    if (!rows || rows.length < 2) return;
    const ids = rows.map((r) => r.id).sort().join(',');
    if (processedGroups.has(ids)) return;
    processedGroups.add(ids);

    const sorted = [...rows].sort((a, b) => {
      const amountA = BigInt(toCanonicalRupiahString(a.total_donations_amount));
      const amountB = BigInt(toCanonicalRupiahString(b.total_donations_amount));
      if (amountB !== amountA) return amountB > amountA ? 1 : -1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const primary = formatMuzakkiRow(sorted[0], actor);
    const duplicates = sorted.slice(1).map((r) => formatMuzakkiRow(r, actor));

    suggestions.push({
      primary,
      duplicates,
      confidence,
      match_reason: reason,
    });
  }

  const statsSelect = `
    SELECT
      m.*,
      CAST(COALESCE(stats.total_amount, 0) AS TEXT) AS total_donations_amount,
      COALESCE(stats.total_count, 0) AS total_donations_count,
      stats.last_donation_date
    FROM muzakki m
    LEFT JOIN (
      SELECT
        muzakki_id,
        SUM(amount) AS total_amount,
        COUNT(id) AS total_count,
        MAX(created_at) AS last_donation_date
      FROM penerimaan_transactions
      WHERE muzakki_id IS NOT NULL
      GROUP BY muzakki_id
    ) stats ON stats.muzakki_id = m.id
  `;

  // 1. Match by phone
  const byPhone = await db.all(`
    SELECT phone, COUNT(*) as count
    FROM muzakki
    WHERE phone IS NOT NULL AND LENGTH(TRIM(phone)) >= 8
    GROUP BY phone
    HAVING COUNT(*) > 1
  `);

  for (const item of byPhone) {
    const rows = await db.all(`${statsSelect} WHERE m.phone = $1`, [item.phone]);
    await addGroup(rows, `Nomor telepon identik: ${item.phone}`, 90);
  }

  // 2. Match by email
  const byEmail = await db.all(`
    SELECT LOWER(TRIM(email)) as email, COUNT(*) as count
    FROM muzakki
    WHERE email IS NOT NULL AND LENGTH(TRIM(email)) >= 5
    GROUP BY LOWER(TRIM(email))
    HAVING COUNT(*) > 1
  `);

  for (const item of byEmail) {
    const rows = await db.all(`${statsSelect} WHERE LOWER(TRIM(m.email)) = $1`, [item.email]);
    await addGroup(rows, `Alamat email identik: ${item.email}`, 95);
  }

  // 3. Match by identity_number
  const byIdNum = await db.all(`
    SELECT identity_number, COUNT(*) as count
    FROM muzakki
    WHERE identity_number IS NOT NULL AND LENGTH(TRIM(identity_number)) >= 6
    GROUP BY identity_number
    HAVING COUNT(*) > 1
  `);

  for (const item of byIdNum) {
    const rows = await db.all(`${statsSelect} WHERE m.identity_number = $1`, [item.identity_number]);
    await addGroup(rows, `Nomor identitas (NIK/NPWP) identik: ${item.identity_number}`, 98);
  }

  // 4. Match by exact name
  const byName = await db.all(`
    SELECT LOWER(TRIM(name)) as name, COUNT(*) as count
    FROM muzakki
    WHERE name IS NOT NULL AND LOWER(TRIM(name)) NOT IN ('hamba allah', 'anonim', '')
    GROUP BY LOWER(TRIM(name))
    HAVING COUNT(*) > 1
  `);

  for (const item of byName) {
    const rows = await db.all(`${statsSelect} WHERE LOWER(TRIM(m.name)) = $1`, [item.name]);
    await addGroup(rows, `Nama muzakki identik: ${rows[0]?.name}`, 75);
  }

  return suggestions;
}

/**
 * Merges duplicate Muzakki records into a primary record.
 */
export async function mergeMuzakki({ primary_id, duplicate_ids = [], actor = {} } = {}, dbOverride = null) {
  const db = dbOverride || (await getDb());
  const primaryId = Number(primary_id);
  const dupIds = duplicate_ids.map(Number).filter((id) => !isNaN(id) && id !== primaryId);

  if (!primaryId) {
    const err = new Error('ID muzakki utama wajib dipilih.');
    err.status = 400;
    throw err;
  }

  if (!dupIds.length) {
    const err = new Error('Daftar ID muzakki duplikat yang akan digabungkan tidak boleh kosong.');
    err.status = 400;
    throw err;
  }

  const primary = await db.get('SELECT * FROM muzakki WHERE id = $1', [primaryId]);
  if (!primary) {
    const err = new Error('Muzakki utama tidak ditemukan.');
    err.status = 404;
    throw err;
  }

  // 1. Fetch duplicate details for audit preservation
  const duplicates = [];
  for (const dupId of dupIds) {
    const dup = await db.get('SELECT * FROM muzakki WHERE id = $1', [dupId]);
    if (dup) duplicates.push(dup);
  }

  // 2. Reassign transactions from duplicate_ids to primary_id
  for (const dupId of dupIds) {
    await db.run(
      'UPDATE penerimaan_transactions SET muzakki_id = $1, muzakki_name = $2 WHERE muzakki_id = $3',
      [primaryId, primary.name, dupId]
    );
  }

  // 3. Delete duplicate records
  for (const dupId of dupIds) {
    await db.run('DELETE FROM muzakki WHERE id = $1', [dupId]);
  }

  // 4. Record merge audit event
  await recordPenerimaanAuditEvent(db, {
    entity_type: 'muzakki',
    entity_id: primaryId,
    action: 'merge',
    actor,
    changes: {
      primary_id: primaryId,
      merged_duplicate_ids: dupIds,
      preserved_duplicates: duplicates,
    },
    metadata: {
      notes: `Penggabungan ${dupIds.length} profil duplikat ke dalam profil utama ID ${primaryId}`,
      reason: actor?.reason || 'Penggabungan profil duplikat',
      correlation_id: actor?.correlation_id || null,
    },
  });

  return {
    success: true,
    merged_id: primaryId,
    merged_count: dupIds.length,
  };
}

/**
 * List Penerimaan audit logs with cursor pagination.
 */
export async function listPenerimaanAuditLogs(
  { entity_type, entity_id, actor_id, action, cursor, limit = 20 } = {},
  dbOverride = null
) {
  const db = dbOverride || (await getDb());
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const whereClauses = [];
  const params = [];
  let paramIdx = 1;

  if (entity_type) {
    if (entity_type === 'penerimaan_settings' || entity_type === 'settings') {
      whereClauses.push(`(entity_type = 'penerimaan_settings' OR entity_type = 'settings')`);
    } else {
      whereClauses.push(`entity_type = $${paramIdx++}`);
      params.push(entity_type);
    }
  }

  if (entity_id !== undefined && entity_id !== null && entity_id !== '') {
    whereClauses.push(`entity_id = $${paramIdx++}`);
    params.push(String(entity_id));
  }

  if (actor_id !== undefined && actor_id !== null && actor_id !== '') {
    whereClauses.push(`actor_id = $${paramIdx++}`);
    params.push(Number(actor_id));
  }

  if (action) {
    whereClauses.push(`action = $${paramIdx++}`);
    params.push(action);
  }

  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const [curCreated, curId] = decoded.split('|');
      if (curCreated && curId) {
        whereClauses.push(`(created_at < $${paramIdx++} OR (created_at = $${paramIdx++} AND id < $${paramIdx++}))`);
        params.push(curCreated, curCreated, Number(curId));
      }
    } catch {
      // ignore bad cursor
    }
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const querySql = `
    SELECT *
    FROM penerimaan_audit_events
    ${whereSql}
    ORDER BY created_at DESC, id DESC
    LIMIT $${paramIdx}
  `;
  params.push(lim + 1);

  const rows = await db.all(querySql, params);
  const hasMore = rows.length > lim;
  const items = hasMore ? rows.slice(0, lim) : rows;

  let nextCursor = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = Buffer.from(`${last.created_at}|${last.id}`).toString('base64');
  }

  const formattedItems = items.map((r) => {
    const changes = safeJsonParse(r.changes, {});
    const meta = safeJsonParse(r.metadata, {});
    return {
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      action: r.action,
      actor_id: r.actor_id || null,
      actor_name: r.actor_name,
      actor_role: r.actor_role,
      old_values: changes?.old || (changes?.from_status ? { status: changes.from_status } : null),
      new_values: changes?.new || (changes?.to_status ? { status: changes.to_status } : changes || null),
      previous_status: changes?.from_status || changes?.old?.status || null,
      next_status: changes?.to_status || changes?.new?.status || null,
      reason: meta?.reason || meta?.notes || null,
      correlation_id: meta?.correlation_id || null,
      notes: meta?.notes || meta?.reason || null,
      created_at: r.created_at,
    };
  });

  return {
    items: formattedItems,
    next_cursor: nextCursor,
    has_more: hasMore,
  };
}

// ====================================================================
// TASK 10: INGESTION & RECONCILIATION REPOSITORY FUNCTIONS
// ====================================================================

/**
 * Finds existing Muzakki by phone, email, or exact name, or creates a new profile.
 */
export async function findOrCreateMuzakkiForTransaction(
  db,
  { name = 'Hamba Allah', phone = null, email = null, actor = {} } = {}
) {
  const cleanName = String(name || 'Hamba Allah').trim();
  const cleanPhone = phone ? String(phone).trim() : null;
  const cleanEmail = email ? String(email).trim().toLowerCase() : null;

  if (cleanPhone) {
    const byPhone = await db.get('SELECT id, name FROM muzakki WHERE phone = $1 LIMIT 1', [cleanPhone]);
    if (byPhone) return byPhone;
  }

  if (cleanEmail) {
    const byEmail = await db.get('SELECT id, name FROM muzakki WHERE LOWER(TRIM(email)) = $1 LIMIT 1', [cleanEmail]);
    if (byEmail) return byEmail;
  }

  if (cleanName && cleanName.toLowerCase() !== 'hamba allah') {
    const byName = await db.get('SELECT id, name FROM muzakki WHERE LOWER(TRIM(name)) = $1 LIMIT 1', [cleanName.toLowerCase()]);
    if (byName) return byName;
  }

  // Create new Muzakki with race-condition retry
  const isCompany =
    cleanName.toLowerCase().startsWith('pt ') ||
    cleanName.toLowerCase().startsWith('cv ') ||
    cleanName.toLowerCase().includes('yayasan');

  try {
    return await createMuzakki(
      {
        name: cleanName,
        phone: cleanPhone,
        email: cleanEmail,
        type: isCompany ? 'lembaga' : 'individu',
      },
      actor,
      db
    );
  } catch (err) {
    if (err.message && (err.message.includes('UNIQUE constraint') || err.code === '23505' || err.code === 'SQLITE_CONSTRAINT')) {
      if (cleanPhone) {
        const byPhone = await db.get('SELECT id, name FROM muzakki WHERE phone = $1 LIMIT 1', [cleanPhone]);
        if (byPhone) return byPhone;
      }
      if (cleanEmail) {
        const byEmail = await db.get('SELECT id, name FROM muzakki WHERE LOWER(TRIM(email)) = $1 LIMIT 1', [cleanEmail]);
        if (byEmail) return byEmail;
      }
      if (cleanName && cleanName.toLowerCase() !== 'hamba allah') {
        const byName = await db.get('SELECT id, name FROM muzakki WHERE LOWER(TRIM(name)) = $1 LIMIT 1', [cleanName.toLowerCase()]);
        if (byName) return byName;
      }
      return await createMuzakki(
        {
          name: cleanName,
          phone: cleanPhone,
          email: cleanEmail,
          type: isCompany ? 'lembaga' : 'individu',
        },
        actor,
        db
      );
    }
    throw err;
  }
}

/**
 * Records raw webhook event for provider/channel before processing.
 * Idempotency is enforced by unique idempotency_key.
 */
export async function recordRawWebhookEvent(eventData = {}, dbOverride = null) {
  const db = dbOverride || (await getDb());
  const {
    provider = 'generic',
    idempotency_key,
    payload = {},
    headers = {},
    signature = null,
    event_type = 'payment_notification',
  } = eventData;

  const key = String(idempotency_key || `${provider}:${Date.now()}`).trim();

  // 1. Check idempotency
  const existing = await db.get('SELECT * FROM penerimaan_raw_events WHERE idempotency_key = $1', [key]);
  if (existing) {
    return {
      duplicate: true,
      event: {
        ...existing,
        payload: safeJsonParse(existing.payload, {}),
        headers: safeJsonParse(existing.headers, {}),
      },
    };
  }

  // 2. Insert new pending raw event
  const payloadJson = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const headersJson = typeof headers === 'string' ? headers : JSON.stringify(headers);
  const now = new Date().toISOString();

  try {
    const insertSql = `
      INSERT INTO penerimaan_raw_events (
        provider, idempotency_key, event_type, payload, headers, signature, status, received_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
      RETURNING *
    `;

    const res = await db.run(insertSql, [
      provider,
      key,
      event_type,
      payloadJson,
      headersJson,
      signature,
      now,
    ]);

    const createdId =
      res.lastID ||
      (await db.get('SELECT id FROM penerimaan_raw_events WHERE idempotency_key = $1', [key]))?.id;

    const created = await db.get('SELECT * FROM penerimaan_raw_events WHERE id = $1', [createdId]);

    return {
      duplicate: false,
      event: {
        ...created,
        payload: safeJsonParse(created?.payload, {}),
        headers: safeJsonParse(created?.headers, {}),
      },
    };
  } catch (insertErr) {
    if (
      String(insertErr.message).includes('UNIQUE constraint') ||
      String(insertErr.code).includes('CONSTRAINT') ||
      insertErr.code === '23505'
    ) {
      const existingAfterRace = await db.get('SELECT * FROM penerimaan_raw_events WHERE idempotency_key = $1', [key]);
      if (existingAfterRace) {
        return {
          duplicate: true,
          event: {
            ...existingAfterRace,
            payload: safeJsonParse(existingAfterRace.payload, {}),
            headers: safeJsonParse(existingAfterRace.headers, {}),
          },
        };
      }
    }
    throw insertErr;
  }
}

/**
 * Normalizes and processes a raw webhook event into a canonical Penerimaan transaction.
 */
export async function processRawWebhookEvent(rawEventId, actor = {}, dbOverride = null) {
  const db = dbOverride || (await getDb());
  const rawEvent = await db.get('SELECT * FROM penerimaan_raw_events WHERE id = $1', [rawEventId]);
  if (!rawEvent) {
    const err = new Error(`Raw event webhook dengan ID ${rawEventId} tidak ditemukan.`);
    err.status = 404;
    throw err;
  }

  try {
    const payload = safeJsonParse(rawEvent.payload, {});
    const normalized = normalizeWebhookPayload({
      provider: rawEvent.provider,
      payload,
    });

    // 1. Check if transaction already exists for this provider reference and channel
    const existingTx = await db.get(
      'SELECT id, transaction_number, status FROM penerimaan_transactions WHERE provider_name = $1 AND channel = $2 AND provider_ref = $3',
      [normalized.provider_name, normalized.channel, normalized.provider_ref]
    );

    if (existingTx) {
      await db.run(
        `UPDATE penerimaan_raw_events
         SET status = 'processed', processed_at = CURRENT_TIMESTAMP, processing_error = NULL
         WHERE id = $1`,
        [rawEventId]
      );
      return {
        duplicate: true,
        transaction: existingTx,
      };
    }

    await assertActivePenerimaanChannel(normalized.channel, db);
    const settings = await getPenerimaanOperationalPolicy(db);

    // 2. Find or create Muzakki
    const muzakki = await findOrCreateMuzakkiForTransaction(db, {
      name: normalized.muzakki_name,
      phone: normalized.muzakki_phone,
      email: normalized.muzakki_email,
      actor,
    });

    // 3. Generate transaction and receipt numbers
    const transactionNumber = await generateNextPenerimaanTransactionNumber(new Date(), db);
    const receiptNumber = await generateNextPenerimaanReceiptNumber(new Date(), db);

    // 4. Determine risk flags
    const riskFlags = [];
    const amountStr = parseCanonicalIntegerMoney(normalized.amount, 'Nominal transaksi', false);
    const candidateTx = {
      amount: amountStr,
      channel: normalized.channel,
      is_manual: false,
    };
    if (requiresLeaderApproval(candidateTx, settings)) {
      riskFlags.push('amount_exceeds_threshold');
    }
    const isFlagged = riskFlags.length > 0;
    const now = new Date().toISOString();

    // 5. Insert transaction
    const insertSql = `
      INSERT INTO penerimaan_transactions (
        transaction_number, receipt_number, channel, channel_category, provider_name, provider_ref,
        muzakki_id, muzakki_name, muzakki_phone, muzakki_email, fund_type,
        amount, fee_amount, net_amount, status, payment_method, bank_name, bank_account_number,
        is_manual, is_flagged, risk_flags, created_by_name, transaction_date, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25
      ) RETURNING id
    `;

    const insertParams = [
      transactionNumber,
      receiptNumber,
      normalized.channel,
      normalized.channel_category,
      normalized.provider_name,
      normalized.provider_ref,
      muzakki?.id || null,
      normalized.muzakki_name,
      normalized.muzakki_phone,
      normalized.muzakki_email,
      normalized.fund_type,
      normalized.amount,
      normalized.fee_amount,
      normalized.net_amount,
      'Menunggu Validasi',
      normalized.payment_method,
      normalized.bank_name,
      normalized.bank_account_number,
      false, // is_manual
      isFlagged ? 1 : 0,
      JSON.stringify(riskFlags),
      `Webhook (${normalized.provider_name})`,
      normalized.transaction_date || now,
      now,
      now,
    ];

    let newTxId;
    try {
      const res = await db.run(insertSql, insertParams);
      newTxId =
        res.lastID ||
        (await db.get('SELECT id FROM penerimaan_transactions WHERE transaction_number = $1', [transactionNumber]))?.id;
    } catch (insertTxErr) {
      if (
        String(insertTxErr.message).includes('UNIQUE constraint') ||
        String(insertTxErr.code).includes('CONSTRAINT') ||
        insertTxErr.code === '23505'
      ) {
        const existingConcurrentTx = await db.get(
          'SELECT id, transaction_number, status, transaction_date FROM penerimaan_transactions WHERE provider_name = $1 AND channel = $2 AND provider_ref = $3',
          [normalized.provider_name, normalized.channel, normalized.provider_ref]
        );
        if (existingConcurrentTx) {
          await db.run(
            `UPDATE penerimaan_raw_events
             SET status = 'processed', processed_at = CURRENT_TIMESTAMP, processing_error = NULL
             WHERE id = $1`,
            [rawEventId]
          );
          return {
            duplicate: true,
            transaction: existingConcurrentTx,
          };
        }
      }
      throw insertTxErr;
    }

    // 6. Mark raw event processed
    await db.run(
      `UPDATE penerimaan_raw_events
       SET status = 'processed', processed_at = CURRENT_TIMESTAMP, processing_error = NULL
       WHERE id = $1`,
      [rawEventId]
    );

    // 7. Audit event
    await recordPenerimaanAuditEvent(db, {
      entity_type: 'transaction',
      entity_id: newTxId,
      action: 'webhook_ingestion',
      actor: { id: null, name: `Webhook:${normalized.provider_name}`, role: 'system' },
      changes: {
        to_status: 'Menunggu Validasi',
        amount: normalized.amount,
        channel: normalized.channel,
      },
      metadata: {
        provider_ref: normalized.provider_ref,
        idempotency_key: rawEvent.idempotency_key,
      },
    });

    const tx = await getPenerimaanTransactionById(newTxId, db);
    return {
      duplicate: false,
      transaction: tx,
    };
  } catch (err) {
    // Record processing error in raw event
    await db.run(
      `UPDATE penerimaan_raw_events
       SET status = 'failed', processing_error = $1
       WHERE id = $2`,
      [err.message, rawEventId]
    );
    throw err;
  }
}

/**
 * Lists raw webhook events with cursor pagination.
 */
export async function listRawWebhookEvents(
  { provider, status, cursor, limit = 20 } = {},
  dbOverride = null
) {
  const db = dbOverride || (await getDb());
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const whereClauses = [];
  const params = [];
  let pIdx = 1;

  if (provider) {
    whereClauses.push(`provider = $${pIdx++}`);
    params.push(provider);
  }

  if (status) {
    whereClauses.push(`status = $${pIdx++}`);
    params.push(status);
  }

  if (cursor) {
    whereClauses.push(`id < $${pIdx++}`);
    params.push(Number(cursor));
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const query = `
    SELECT * FROM penerimaan_raw_events
    ${whereSql}
    ORDER BY id DESC
    LIMIT $${pIdx}
  `;
  params.push(lim + 1);

  const rows = await db.all(query, params);
  const hasMore = rows.length > lim;
  const items = hasMore ? rows.slice(0, lim) : rows;
  const nextCursor = hasMore && items.length > 0 ? String(items[items.length - 1].id) : null;

  return {
    items: items.map((r) => ({
      ...r,
      payload: safeJsonParse(r.payload, {}),
      headers: safeJsonParse(r.headers, {}),
    })),
    next_cursor: nextCursor,
    has_more: hasMore,
  };
}

/**
 * Retries a failed raw webhook event.
 */
export async function retryRawWebhookEvent(id, actor = {}, dbOverride = null) {
  return processRawWebhookEvent(id, actor, dbOverride);
}

// ====================================================================
// CSV / XLSX PARSER UTILITY
// ====================================================================

/**
 * Parses rows from CSV text/buffer or XLSX workbook buffer.
 * Returns array of arrays (string values).
 */
export async function parseRowsFromFile(fileBuffer, filename = '') {
  if (!fileBuffer) return [];

  const lowerName = String(filename || '').toLowerCase();
  const isXlsx =
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    (Buffer.isBuffer(fileBuffer) && fileBuffer.length >= 4 && fileBuffer.slice(0, 4).toString('hex') === '504b0304');

  if (isXlsx) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];

    const rows = [];
    worksheet.eachRow((row) => {
      const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(
        vals.map((v) =>
          v !== null && v !== undefined
            ? (typeof v === 'object' && v.text ? v.text : String(v)).trim()
            : ''
        )
      );
    });
    return rows;
  }

  // CSV parsing
  const text = Buffer.isBuffer(fileBuffer) ? fileBuffer.toString('utf8') : String(fileBuffer);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  return lines.map((line) => {
    const delimiter = line.includes(';') ? ';' : ',';
    const row = [];
    let inQuotes = false;
    let cur = '';

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === delimiter && !inQuotes) {
        row.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    row.push(cur.trim());
    return row;
  });
}

// ====================================================================
// BULK TRANSACTION IMPORT JOBS
// ====================================================================

/**
 * Processes bulk transaction import file (CSV or XLSX) with row-level error reporting
 * and partial-import safety.
 */
export async function processTransactionImport(
  { filename = 'import.csv', channel = 'bank_transfer', fileBuffer, actor = {} } = {},
  dbOverride = null
) {
  const db = dbOverride || (await getDb());
  await assertActivePenerimaanChannel(channel, db);
  const settings = await getPenerimaanOperationalPolicy(db);
  const rows = await parseRowsFromFile(fileBuffer, filename);

  if (rows.length < 2) {
    const err = new Error('File import kosong atau tidak memiliki baris data.');
    err.status = 400;
    throw err;
  }

  // Header detection
  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const getColIndex = (...candidates) => {
    for (const c of candidates) {
      const idx = header.findIndex((h) => h.includes(c));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const nameIdx = getColIndex('nama', 'muzakki', 'donatur');
  const amountIdx = getColIndex('nominal', 'amount', 'jumlah', 'nilai');
  const fundIdx = getColIndex('jenis_dana', 'fund_type', 'program', 'alokasi');
  const phoneIdx = getColIndex('telepon', 'phone', 'hp', 'kontak');
  const emailIdx = getColIndex('email');
  const refIdx = getColIndex('referensi', 'reference', 'ref', 'bukti');
  const dateIdx = getColIndex('tanggal', 'date', 'waktu');

  if (nameIdx === -1 || amountIdx === -1) {
    const err = new Error('Format kolom tidak valid. Kolom nama dan nominal wajib tersedia.');
    err.status = 400;
    throw err;
  }

  const dataRows = rows.slice(1);
  const totalRows = dataRows.length;

  // Create job record
  const now = new Date().toISOString();
  const insertJobSql = `
    INSERT INTO penerimaan_import_jobs (
      filename, channel, total_rows, processed_rows, error_rows, status, errors_json, created_by_id, created_at
    ) VALUES ($1, $2, $3, 0, 0, 'processing', '[]'::jsonb, $4, $5)
    RETURNING id
  `;

  const jobRes = await db.run(insertJobSql, [
    filename,
    channel,
    totalRows,
    actor.id || null,
    now,
  ]);

  const jobId =
    jobRes.lastID ||
    (await db.get('SELECT id FROM penerimaan_import_jobs ORDER BY id DESC LIMIT 1'))?.id;

  let successCount = 0;
  const errors = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = i + 2; // 1-based, skipping header
    const r = dataRows[i];

    const rawName = r[nameIdx] ? String(r[nameIdx]).trim() : '';
    const rawAmount = r[amountIdx] ? String(r[amountIdx]).replace(/[^0-9]/g, '') : '';
    const parsedAmount = parseInt(rawAmount, 10);

    if (!rawName) {
      errors.push({ row: rowNum, reason: 'Nama muzakki/donatur tidak boleh kosong' });
      continue;
    }

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      errors.push({ row: rowNum, reason: `Nominal tidak valid: "${r[amountIdx] || ''}"` });
      continue;
    }

    const phone = phoneIdx !== -1 && r[phoneIdx] ? String(r[phoneIdx]).trim() : null;
    const email = emailIdx !== -1 && r[emailIdx] ? String(r[emailIdx]).trim() : null;
    const providerRef = refIdx !== -1 && r[refIdx] ? String(r[refIdx]).trim() : null;

    let fundType = fundIdx !== -1 && r[fundIdx] ? String(r[fundIdx]).trim().toLowerCase() : 'zakat_maal';
    if (!CANONICAL_FUND_TYPES.includes(fundType)) {
      if (fundType.includes('profesi')) fundType = 'zakat_profesi';
      else if (fundType.includes('fitrah')) fundType = 'zakat_fitrah';
      else if (fundType.includes('infak')) fundType = 'infak';
      else if (fundType.includes('sedekah')) fundType = 'sedekah';
      else fundType = 'zakat_maal';
    }

    let txDate = now;
    if (dateIdx !== -1 && r[dateIdx]) {
      const parsed = new Date(r[dateIdx]);
      if (!isNaN(parsed.getTime())) txDate = parsed.toISOString();
    }

    try {
      // Find or create muzakki
      const muzakki = await findOrCreateMuzakkiForTransaction(db, {
        name: rawName,
        phone,
        email,
        actor,
      });

      const txNum = await generateNextPenerimaanTransactionNumber(new Date(), db);
      const rcptNum = await generateNextPenerimaanReceiptNumber(new Date(), db);

      const riskFlags = [];
      const amtBigInt = BigInt(String(parsedAmount).split('.')[0] || '0');
      const threshBigInt = BigInt(String(settings.approval_threshold || '10000000').split('.')[0] || '10000000');
      if (amtBigInt >= threshBigInt) riskFlags.push('amount_exceeds_threshold');
      const isFlagged = riskFlags.length > 0;

      await db.run(
        `INSERT INTO penerimaan_transactions (
           transaction_number, receipt_number, channel, channel_category, provider_ref,
           muzakki_id, muzakki_name, muzakki_phone, muzakki_email, fund_type,
           amount, fee_amount, net_amount, status, is_manual, is_flagged, risk_flags,
           created_by_id, created_by_name, transaction_date, created_at, updated_at
         ) VALUES (
           $1, $2, $3, 'digital', $4,
           $5, $6, $7, $8, $9,
           $10, 0, $11, 'Menunggu Validasi', TRUE, $12, $13,
           $14, $15, $16, $17, $18
         )`,
        [
          txNum,
          rcptNum,
          channel,
          providerRef,
          muzakki?.id || null,
          rawName,
          phone,
          email,
          fundType,
          parsedAmount,
          parsedAmount,
          isFlagged ? 1 : 0,
          JSON.stringify(riskFlags),
          actor.id || null,
          actor.name || 'Import File',
          txDate,
          now,
          now,
        ]
      );

      successCount++;
    } catch (rowErr) {
      errors.push({ row: rowNum, reason: rowErr.message });
    }
  }

  const finalStatus = successCount > 0 ? 'completed' : 'failed';
  const completedAt = new Date().toISOString();

  await db.run(
    `UPDATE penerimaan_import_jobs
     SET status = $1, processed_rows = $2, error_rows = $3, errors_json = $4, completed_at = $5
     WHERE id = $6`,
    [finalStatus, successCount, errors.length, JSON.stringify(errors), completedAt, jobId]
  );

  return {
    job_id: String(jobId),
    total_rows: totalRows,
    success_rows: successCount,
    failed_rows: errors.length,
    errors,
  };
}

/**
 * Retrieves import job status by ID.
 */
export async function getImportJobById(id, dbOverride = null) {
  const db = dbOverride || (await getDb());
  const row = await db.get('SELECT * FROM penerimaan_import_jobs WHERE id = $1', [Number(id)]);
  if (!row) return null;

  return {
    job_id: String(row.id),
    status: row.status,
    filename: row.filename,
    channel: row.channel,
    total_rows: Number(row.total_rows || 0),
    processed_rows: Number(row.processed_rows || 0),
    success_rows: Number(row.processed_rows || 0),
    failed_rows: Number(row.error_rows || 0),
    errors: safeJsonParse(row.errors_json, []),
    created_at: row.created_at,
    completed_at: row.completed_at || null,
  };
}

// ====================================================================
// RECONCILIATION ENGINE & BATCH WORKSPACE
// ====================================================================

const CANONICAL_FUND_TYPES = Object.freeze([
  'zakat_maal',
  'zakat_profesi',
  'zakat_fitrah',
  'infak',
  'sedekah',
  'fidyah',
  'dskl',
]);

function assertBatchMutable(batch) {
  const status = String(batch?.status || '').trim().toLowerCase();
  if (status === 'closed' || status === 'finalized') {
    const err = new Error('Batch rekonsiliasi telah ditutup dan bersifat permanen.');
    err.status = 400;
    throw err;
  }
}

export function formatReconciliationBatchRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: row.id,
    total_expected_count: Number(row.total_expected_count || 0),
    total_expected_amount: toCanonicalRupiahString(row.total_expected_amount),
    total_matched_count: Number(row.total_matched_count || 0),
    total_matched_amount: toCanonicalRupiahString(row.total_matched_amount),
    discrepancy_amount: toCanonicalRupiahString(row.discrepancy_amount),
    account_name: row.account_name || row.bank_name || '',
    account_number: row.account_number || '',
  };
}

/**
 * Creates a new reconciliation batch.
 */
export async function createReconciliationBatch(payload = {}, actor = {}, dbOverride = null) {
  const db = dbOverride || (await getDb());
  const channel = String(payload.channel || '').trim().toLowerCase();
  if (!channel) {
    const err = new Error('Kanal rekonsiliasi wajib dipilih.');
    err.status = 400;
    throw err;
  }

  const periodStart = payload.period_start ? new Date(payload.period_start).toISOString() : new Date().toISOString();
  const periodEnd = payload.period_end ? new Date(payload.period_end).toISOString() : new Date().toISOString();

  // Generate unique batch number: REC-YYYYMMDD-XXXX
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const timeSuffix = Date.now().toString(36).toUpperCase();
  const batchNumber = payload.batch_number || `REC-${dateStr}-${timeSuffix}-${randomSuffix}`;

  // Account lookup if account_name/number supplied
  let accountId = payload.account_id ? Number(payload.account_id) : null;
  if (!accountId && payload.account_name) {
    const acc = await db.get(
      'SELECT id FROM penerimaan_accounts WHERE LOWER(bank_name) = $1 OR account_number = $2 LIMIT 1',
      [String(payload.account_name).toLowerCase(), String(payload.account_number || '')]
    );
    if (acc) accountId = acc.id;
  }

  // Handle cash / physical count notes
  let notes = payload.notes || '';
  if (payload.physical_cash_count !== undefined && payload.physical_cash_count !== null) {
    const physicalStr = `[Physical Cash Count: Rp ${Number(payload.physical_cash_count).toLocaleString('id-ID')}]`;
    notes = notes ? `${notes} ${physicalStr}` : physicalStr;
  }

  const now = new Date().toISOString();
  const insertSql = `
    INSERT INTO penerimaan_reconciliation_batches (
      batch_number, channel, account_id, period_start, period_end,
      total_expected_count, total_expected_amount, total_matched_count, total_matched_amount,
      discrepancy_amount, status, notes, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, 0, 0, 0, 0, 0, 'draft', $6, $7, $8)
    RETURNING id
  `;

  const res = await db.run(insertSql, [
    batchNumber,
    channel,
    accountId,
    periodStart,
    periodEnd,
    notes || null,
    now,
    now,
  ]);

  const newId =
    res.lastID ||
    (await db.get('SELECT id FROM penerimaan_reconciliation_batches WHERE batch_number = $1', [batchNumber]))?.id;

  await recordPenerimaanAuditEvent(db, {
    entity_type: 'reconciliation_batch',
    entity_id: newId,
    action: 'create_batch',
    actor,
    changes: {
      batch_number: batchNumber,
      channel,
      status: 'draft',
    },
    metadata: { notes },
  });

  return getReconciliationBatchById(newId, db);
}

/**
 * Lists reconciliation batches with cursor pagination and status/channel filters.
 */
export async function listReconciliationBatches(filters = {}, dbOverride = null) {
  const db = dbOverride || (await getDb());
  const conditions = [];
  const values = [];

  const add = (cond, val) => {
    values.push(val);
    conditions.push(cond.replace('?', `$${values.length}`));
  };

  if (filters.channel) add('b.channel = ?', filters.channel);
  if (filters.status) add('b.status = ?', filters.status);
  if (filters.start_date) add('b.period_start >= ?', `${String(filters.start_date).slice(0, 10)}T00:00:00.000Z`);
  if (filters.end_date) add('b.period_end <= ?', `${String(filters.end_date).slice(0, 10)}T23:59:59.999Z`);

  if (filters.cursor) {
    const cId = Number(filters.cursor);
    if (!isNaN(cId) && cId > 0) add('b.id < ?', cId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit || 20, 10)));

  const countRow = await db.get(`SELECT COUNT(*) as total FROM penerimaan_reconciliation_batches b ${where}`, values);
  const totalCount = Number(countRow?.total || 0);

  const fetchLimit = limit + 1;
  const rows = await db.all(
    `SELECT b.id, b.batch_number, b.channel, b.account_id, b.period_start, b.period_end,
            b.total_expected_count, CAST(b.total_expected_amount AS TEXT) AS total_expected_amount,
            b.total_matched_count, CAST(b.total_matched_amount AS TEXT) AS total_matched_amount,
            CAST(b.discrepancy_amount AS TEXT) AS discrepancy_amount,
            b.status, b.notes, b.closed_by_id, b.closed_at, b.created_at, b.updated_at,
            a.bank_name as account_name, a.account_number
     FROM penerimaan_reconciliation_batches b
     LEFT JOIN penerimaan_accounts a ON b.account_id = a.id
     ${where}
     ORDER BY b.id DESC
     LIMIT ${fetchLimit}`,
    values
  );

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length > 0 ? String(items[items.length - 1].id) : null;

  return {
    items: items.map(formatReconciliationBatchRow),
    next_cursor: nextCursor,
    has_more: hasMore,
    total_count: totalCount,
  };
}

/**
 * Retrieves a single reconciliation batch with statement lines and candidate transactions.
 */
export async function getReconciliationBatchById(id, dbOverride = null) {
  const db = dbOverride || (await getDb());
  const numId = Number(id);

  const row = await db.get(
    `SELECT b.id, b.batch_number, b.channel, b.account_id, b.period_start, b.period_end,
            b.total_expected_count, CAST(b.total_expected_amount AS TEXT) AS total_expected_amount,
            b.total_matched_count, CAST(b.total_matched_amount AS TEXT) AS total_matched_amount,
            CAST(b.discrepancy_amount AS TEXT) AS discrepancy_amount,
            b.status, b.notes, b.closed_by_id, b.closed_at, b.created_at, b.updated_at,
            a.bank_name as account_name, a.account_number
     FROM penerimaan_reconciliation_batches b
     LEFT JOIN penerimaan_accounts a ON b.account_id = a.id
     WHERE b.id = $1 OR b.batch_number = $2`,
    [numId || 0, String(id)]
  );

  if (!row) return null;
  const formatted = formatReconciliationBatchRow(row);

  // Statement lines
  const lines = await db.all(
    `SELECT id, batch_id, line_number, transaction_date, reference_number, description,
            CAST(amount AS TEXT) AS amount, status, matched_transaction_id, created_at
     FROM penerimaan_statement_lines
     WHERE batch_id = $1
     ORDER BY line_number ASC`,
    [formatted.id]
  );

  const formattedLines = lines.map((l) => ({
    id: l.id,
    batch_id: l.batch_id,
    line_number: l.line_number,
    transaction_date: l.transaction_date,
    reference_number: l.reference_number,
    description: l.description,
    amount: toCanonicalRupiahString(l.amount),
    status: l.status,
    matched_transaction_id: l.matched_transaction_id,
  }));

  // Candidate unmatched transactions within period or channel
  const unmatchedTxs = await db.all(
    `SELECT t.*, CAST(t.amount AS TEXT) AS amount_text,
            CAST(t.fee_amount AS TEXT) AS fee_amount_text,
            CAST(t.net_amount AS TEXT) AS net_amount_text
     FROM penerimaan_transactions t
     WHERE t.channel = $1
       AND t.reconciliation_batch_id IS NULL
       AND t.status IN ('Menunggu Rekonsiliasi', 'Terverifikasi', 'Tervalidasi', 'Menunggu Validasi')
     ORDER BY t.transaction_date DESC
     LIMIT 50`,
    [formatted.channel]
  );

  return {
    ...formatted,
    statement_lines: formattedLines,
    unmatched_transactions: unmatchedTxs.map(formatPenerimaanTransactionRow),
  };
}

/**
 * Imports statement lines into a reconciliation batch and runs auto-matching.
 */
export async function importStatementLines(
  { batchId, fileBuffer, filename = 'statement.csv', actor = {} } = {},
  dbOverride = null
) {
  const rows = await parseRowsFromFile(fileBuffer, filename);
  if (rows.length < 2) {
    const err = new Error('File mutasi bank kosong atau tidak memiliki baris data.');
    err.status = 400;
    throw err;
  }

  // Detect header
  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const getColIndex = (...candidates) => {
    for (const c of candidates) {
      const idx = header.findIndex((h) => h.includes(c));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const amountIdx = getColIndex('nominal', 'amount', 'jumlah', 'mutasi', 'kredit', 'cr');
  const refIdx = getColIndex('referensi', 'reference', 'ref', 'no_trx', 'keterangan_2');
  const descIdx = getColIndex('keterangan', 'description', 'uraian', 'narasi');
  const dateIdx = getColIndex('tanggal', 'date', 'waktu');

  if (amountIdx === -1) {
    const err = new Error('Kolom nominal / amount wajib tersedia dalam file rekening koran.');
    err.status = 400;
    throw err;
  }

  // Parse and normalize the file before acquiring the batch lock. Only database
  // mutations are serialized, keeping the critical section short.
  const importedRows = [];
  for (const r of rows.slice(1)) {
    const rawVal = r[amountIdx] !== undefined && r[amountIdx] !== null ? String(r[amountIdx]).trim() : '';
    const lineCents = toIntegerCents(rawVal);
    if (lineCents <= 0n) continue;

    const refNum = refIdx !== -1 && r[refIdx] ? String(r[refIdx]).trim() : null;
    const desc = descIdx !== -1 && r[descIdx] ? String(r[descIdx]).trim() : 'Mutasi Bank Masuk';

    let txDate = new Date().toISOString();
    if (dateIdx !== -1 && r[dateIdx]) {
      const p = new Date(r[dateIdx]);
      if (!isNaN(p.getTime())) txDate = p.toISOString();
    }

    importedRows.push({
      amount: toDatabaseIntegerAmount(lineCents),
      amountCents: lineCents,
      referenceNumber: refNum,
      description: desc,
      transactionDate: txDate,
    });
  }

  return withBatchLock(batchId, async () => {
    return withTransaction(dbOverride, async (db) => {
      // Re-read under the database row lock so import cannot race with close or
      // another import after the file was parsed.
      const batch = await db.get(
        'SELECT * FROM penerimaan_reconciliation_batches WHERE id = $1 FOR UPDATE',
        [Number(batchId)]
      );
      if (!batch) {
        const err = new Error('Batch rekonsiliasi tidak ditemukan.');
        err.status = 404;
        throw err;
      }
      assertBatchMutable(batch);

      let lineNumber = 1;
      const maxLine = await db.get(
        'SELECT MAX(line_number) as max_l FROM penerimaan_statement_lines WHERE batch_id = $1',
        [batch.id]
      );
      if (maxLine && maxLine.max_l) lineNumber = Number(maxLine.max_l) + 1;

      let expectedAmountSumCents = 0n;
      for (const row of importedRows) {
        await db.run(
          `INSERT INTO penerimaan_statement_lines (
             batch_id, line_number, transaction_date, reference_number, description, amount, status
           ) VALUES ($1, $2, $3, $4, $5, $6, 'unmatched')`,
          [
            batch.id,
            lineNumber++,
            row.transactionDate,
            row.referenceNumber,
            row.description,
            row.amount,
          ]
        );
        expectedAmountSumCents += row.amountCents;
      }

      const importedCount = importedRows.length;
      const newExpectedCount = Number(batch.total_expected_count || 0) + importedCount;
      const newExpectedCents = toIntegerCents(batch.total_expected_amount) + expectedAmountSumCents;
      const newExpectedAmount = toDatabaseIntegerAmount(newExpectedCents);

      await db.run(
        `UPDATE penerimaan_reconciliation_batches
         SET total_expected_count = $1, total_expected_amount = $2, status = 'in_progress', updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [newExpectedCount, newExpectedAmount, batch.id]
      );

      await recordPenerimaanAuditEvent(db, {
        entity_type: 'reconciliation_batch',
        entity_id: batch.id,
        action: 'import_statement_lines',
        actor,
        changes: {
          imported_count: importedCount,
          total_expected_count: newExpectedCount,
          total_expected_amount: fromIntegerCents(newExpectedCents),
        },
        metadata: { filename },
      });

      // withBatchLock and withTransaction are re-entrant, so auto-match stays in
      // this same serialized atomic operation.
      const matchResult = await autoMatchBatchStatements(batch.id, actor, db);

      return {
        imported_count: importedCount,
        matched_count: matchResult.matched_count,
        unmatched_count: Math.max(0, importedCount - matchResult.new_matches),
        batch_id: batch.id,
      };
    });
  }, Boolean(actor?.__bypassBatchLock));
}

/**
 * Executes auto-matching (exact + confidence proximity) for a reconciliation batch.
 */
export async function autoMatchBatchStatements(batchId, actor = {}, dbOverride = null) {
  return withBatchLock(batchId, async () => {
    return withTransaction(dbOverride, async (db) => {
      const batch = await db.get('SELECT * FROM penerimaan_reconciliation_batches WHERE id = $1 FOR UPDATE', [Number(batchId)]);
      if (!batch) {
        const err = new Error('Batch rekonsiliasi tidak ditemukan.');
        err.status = 404;
        throw err;
      }

      assertBatchMutable(batch);

      // 1. Fetch unmatched statement lines
      const unmatchedLines = await db.all(
        `SELECT * FROM penerimaan_statement_lines
         WHERE batch_id = $1 AND status = 'unmatched'
         ORDER BY line_number ASC`,
        [batch.id]
      );

      let newMatches = 0;

      for (const line of unmatchedLines) {
        const lineCents = toIntegerCents(line.amount);
        const lineRef = line.reference_number ? String(line.reference_number).trim() : null;

        // STEP A: Exact Match by reference number and amount
        let matchedTx = null;
        let confidence = 100.0;
        let matchType = 'auto';

        if (lineRef) {
          const candidates = await db.all(
            `SELECT id, amount, transaction_date, workflow_version, provider_ref, transaction_number, receipt_number
             FROM penerimaan_transactions
             WHERE reconciliation_batch_id IS NULL
               AND status = 'Menunggu Rekonsiliasi'
               AND channel = $1
               AND (
                 LOWER(provider_ref) = LOWER($2) OR
                 LOWER(transaction_number) = LOWER($2) OR
                 LOWER(receipt_number) = LOWER($2)
               )
             LIMIT 10`,
            [batch.channel, lineRef]
          );
          matchedTx = candidates.find((c) => toIntegerCents(c.amount) === lineCents) || null;
        }

        // STEP B: Confidence match if no exact match (amount + date proximity within 2 days, and no conflicting reference)
        if (!matchedTx) {
          const lineTime = new Date(line.transaction_date).getTime();
          const candidates = await db.all(
            `SELECT id, amount, transaction_date, provider_ref, transaction_number, receipt_number, workflow_version
             FROM penerimaan_transactions
             WHERE reconciliation_batch_id IS NULL
               AND status = 'Menunggu Rekonsiliasi'
               AND channel = $1
             LIMIT 50`,
            [batch.channel]
          );

          const validCandidates = candidates.filter((c) => {
            if (toIntegerCents(c.amount) !== lineCents) return false;
            const txTime = new Date(c.transaction_date).getTime();
            if (isNaN(lineTime) || isNaN(txTime)) return false;
            if (Math.abs(lineTime - txTime) > 2 * 86400000) return false;
            const txRef = (c.provider_ref || c.transaction_number || c.receipt_number || '').trim();
            if (lineRef && txRef && lineRef.toLowerCase() !== txRef.toLowerCase()) {
              return false;
            }
            return true;
          });

          if (validCandidates.length === 1) {
            matchedTx = validCandidates[0];
            confidence = 85.0;
            matchType = 'confidence';
          }
        }

        // Apply match conditionally
        if (matchedTx) {
          const lineUpdateRes = await db.run(
            `UPDATE penerimaan_statement_lines
             SET status = 'matched', matched_transaction_id = $1
             WHERE id = $2 AND batch_id = $3 AND status = 'unmatched'`,
            [matchedTx.id, line.id, batch.id]
          );
          if (Number(lineUpdateRes.rowCount) !== 1) {
            continue;
          }

          const txUpdateRes = await db.run(
            `UPDATE penerimaan_transactions
             SET reconciliation_batch_id = $1, status = 'Terekonsiliasi', reconciled_at = CURRENT_TIMESTAMP,
                 workflow_version = workflow_version + 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND status = 'Menunggu Rekonsiliasi'`,
            [batch.id, matchedTx.id]
          );
          if (Number(txUpdateRes.rowCount) !== 1) {
            await db.run(
              `UPDATE penerimaan_statement_lines SET status = 'unmatched', matched_transaction_id = NULL WHERE id = $1`,
              [line.id]
            );
            continue;
          }

          await db.run(
            `INSERT INTO penerimaan_matches (
               statement_line_id, transaction_id, match_type, confidence_score, matched_by_id, notes, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
            [
              line.id,
              matchedTx.id,
              matchType,
              confidence,
              actor.id || null,
              `Auto matched with ${confidence}% confidence`,
            ]
          );

          await recordPenerimaanAuditEvent(db, {
            entity_type: 'transaction',
            entity_id: matchedTx.id,
            action: 'auto_reconcile',
            actor,
            changes: {
              from_status: 'Menunggu Rekonsiliasi',
              to_status: 'Terekonsiliasi',
              reconciliation_batch_id: batch.id,
              statement_line_id: line.id,
              match_type: matchType,
              confidence_score: confidence,
            },
          });

          newMatches++;
        }
      }

      // Recalculate batch totals using integer-safe BigInt arithmetic
      const stats = await recalculateBatchTotals(batch.id, db);

      if (newMatches > 0) {
        await recordPenerimaanAuditEvent(db, {
          entity_type: 'reconciliation_batch',
          entity_id: batch.id,
          action: 'auto_match_batch',
          actor,
          changes: {
            new_matches: newMatches,
            total_matched_count: stats.matched_count,
            total_matched_amount: stats.matched_amount,
            discrepancy_amount: stats.discrepancy_amount,
            status: stats.status,
          },
        });
      }

      return {
        matched_count: stats.matched_count,
        matched_amount: stats.matched_amount,
        discrepancy_amount: stats.discrepancy_amount,
        new_matches: newMatches,
        status: stats.status,
      };
  });
  }, Boolean(actor?.__bypassBatchLock));
}

/**
 * Manually matches statement line(s) with transaction(s).
 * Supports 1-to-1 manual, 1-to-N split, and N-to-1 merge settlements.
 */
export async function matchStatementLine(
  {
    batchId,
    statementLineId,
    statement_line_id,
    statementLineIds,
    statement_line_ids,
    transactionId,
    transaction_id,
    transactionIds,
    transaction_ids,
    expectedVersion,
    expected_version,
    notes = '',
    reason = '',
    actor = {},
  } = {},
  dbOverride = null
) {
  // 1. Mandatory reason check
  const effectiveReason = String(reason || notes || actor?.reason || '').trim();
  if (!effectiveReason) {
    const err = new Error('Alasan rekonsiliasi wajib diisi.');
    err.status = 400;
    throw err;
  }

  return withBatchLock(batchId, async () => {
    return withTransaction(dbOverride, async (db) => {
      // 2. Batch check and mutability
      const batch = await db.get('SELECT * FROM penerimaan_reconciliation_batches WHERE id = $1 FOR UPDATE', [Number(batchId)]);
      if (!batch) {
        const err = new Error('Batch rekonsiliasi tidak ditemukan.');
        err.status = 404;
        throw err;
      }
      assertBatchMutable(batch);

      // 3. Normalize line IDs and transaction IDs
      const rawLineIds =
        statementLineIds ||
        statement_line_ids ||
        (statementLineId || statement_line_id ? [statementLineId || statement_line_id] : []);
      const rawTxIds =
        transactionIds ||
        transaction_ids ||
        (transactionId || transaction_id ? [transactionId || transaction_id] : []);

      const lineIds = Array.isArray(rawLineIds)
        ? rawLineIds.map(Number).filter(Boolean)
        : [Number(rawLineIds)].filter(Boolean);
      const txIds = Array.isArray(rawTxIds)
        ? rawTxIds.map(Number).filter(Boolean)
        : [Number(rawTxIds)].filter(Boolean);

      if (lineIds.length === 0 || txIds.length === 0) {
        const err = new Error('ID baris mutasi dan ID transaksi wajib disertakan.');
        err.status = 400;
        throw err;
      }

      // Check for duplicate statement_line_ids or transaction_ids
      const uniqueLineIds = new Set(lineIds);
      if (uniqueLineIds.size !== lineIds.length) {
        const err = new Error('Duplikasi ID baris mutasi tidak diizinkan dalam satu permintaan pencocokan.');
        err.status = 400;
        throw err;
      }

      const uniqueTxIds = new Set(txIds);
      if (uniqueTxIds.size !== txIds.length) {
        const err = new Error('Duplikasi ID transaksi tidak diizinkan dalam satu permintaan pencocokan.');
        err.status = 400;
        throw err;
      }

      // Determine match type
      let matchType = 'manual';
      if (lineIds.length === 1 && txIds.length > 1) {
        matchType = 'split';
      } else if (lineIds.length > 1 && txIds.length === 1) {
        matchType = 'merge';
      } else if (lineIds.length > 1 && txIds.length > 1) {
        // Fix 2: N-to-M is never permitted
        const err = new Error(
          `Pencocokan N-to-M tidak diizinkan. Gunakan 1-to-N (split), N-to-1 (merge), atau 1-to-1. ` +
          `Diterima: ${lineIds.length} baris mutasi dan ${txIds.length} transaksi.`
        );
        err.status = 400;
        throw err;
      }

      // 4. Fetch and validate Statement Lines
      const lines = [];
      for (const lineId of lineIds) {
        const line = await db.get(
          'SELECT * FROM penerimaan_statement_lines WHERE id = $1 AND batch_id = $2 FOR UPDATE',
          [lineId, batch.id]
        );
        if (!line) {
          const err = new Error(`Baris mutasi rekening koran (ID: ${lineId}) tidak ditemukan.`);
          err.status = 404;
          throw err;
        }
        if (line.status === 'matched' || line.matched_transaction_id) {
          const err = new Error(`Baris mutasi (ID: ${lineId}) sudah dicocokkan.`);
          err.status = 409;
          throw err;
        }
        const existingMatch = await db.get(
          'SELECT id FROM penerimaan_matches WHERE statement_line_id = $1 LIMIT 1',
          [lineId]
        );
        if (existingMatch) {
          const err = new Error(`Baris mutasi (ID: ${lineId}) sudah memiliki data rekonsiliasi.`);
          err.status = 409;
          throw err;
        }
        lines.push(line);
      }

      // 5. Fetch and validate Transactions
      const txs = [];
      const expVersion = expectedVersion !== undefined ? expectedVersion : expected_version;

      for (const txId of txIds) {
        const tx = await db.get('SELECT * FROM penerimaan_transactions WHERE id = $1 FOR UPDATE', [txId]);
        if (!tx) {
          const err = new Error(`Transaksi penerimaan (ID: ${txId}) tidak ditemukan.`);
          err.status = 404;
          throw err;
        }

        // Check if already matched (Conflict 409)
        if (tx.reconciliation_batch_id || tx.status === 'Terekonsiliasi') {
          const err = new Error(`Transaksi (ID: ${txId}) sudah dicocokkan dalam rekonsiliasi.`);
          err.status = 409;
          throw err;
        }

        const existingMatch = await db.get(
          'SELECT id FROM penerimaan_matches WHERE transaction_id = $1 LIMIT 1',
          [txId]
        );
        if (existingMatch) {
          const err = new Error(`Transaksi (ID: ${txId}) sudah memiliki data rekonsiliasi.`);
          err.status = 409;
          throw err;
        }

        // Optimistic concurrency check (Conflict 409)
        if (expVersion !== undefined && expVersion !== null) {
          if (Number(tx.workflow_version) !== Number(expVersion)) {
            const err = new Error(
              `Konflik versi transaksi: versi saat ini (${tx.workflow_version}) tidak cocok dengan expected_version (${expVersion}).`
            );
            err.status = 409;
            throw err;
          }
        }

        // Check status eligibility (Unprocessable Entity 422)
        if (!RECONCILIATION_ELIGIBLE_STATUSES.includes(tx.status)) {
          const err = new Error(
            `Status transaksi "${tx.status}" tidak eligible untuk rekonsiliasi. Transaksi harus berstatus "Menunggu Rekonsiliasi".`
          );
          err.status = 422;
          throw err;
        }

        // Check channel compatibility (Unprocessable Entity 422)
        if (tx.channel !== batch.channel) {
          const err = new Error(
            `Kanal transaksi (${tx.channel}) tidak sesuai dengan kanal batch (${batch.channel}).`
          );
          err.status = 422;
          throw err;
        }

        txs.push(tx);
      }

      // Fix 1 & 5: Validate total nominal balance using BigInt integer-safe arithmetic
      const totalLineCents = lines.reduce((s, l) => s + toIntegerCents(l.amount), 0n);
      const totalTxCents = txs.reduce((s, t) => s + toIntegerCents(t.amount), 0n);
      if (totalLineCents !== totalTxCents) {
        const displayLineAmount = Number(totalLineCents) / 100;
        const displayTxAmount = Number(totalTxCents) / 100;
        const err = new Error(
          `Nominal tidak seimbang: total baris mutasi (${displayLineAmount}) ` +
          `tidak sama dengan total transaksi (${displayTxAmount}). ` +
          `Pencocokan ${matchType} harus memiliki jumlah nominal yang identik.`
        );
        err.status = 400;
        throw err;
      }

      // 6. Update Statement Lines conditionally (WHERE id = ? AND batch_id = ? AND status = 'unmatched')
      for (const line of lines) {
        if (typeof actor?.__beforeStatementUpdateHook === 'function') {
          await actor.__beforeStatementUpdateHook({ line, db });
        }

        const primaryTxId = txIds.length === 1 ? txIds[0] : null;
        const lineUpdateRes = await db.run(
          `UPDATE penerimaan_statement_lines
           SET status = 'matched', matched_transaction_id = $1
           WHERE id = $2 AND batch_id = $3 AND status = 'unmatched'`,
          [primaryTxId, line.id, batch.id]
        );
        if (Number(lineUpdateRes.rowCount) !== 1) {
          const err = new Error(
            `Konflik pencocokan baris mutasi (ID: ${line.id}): baris mutasi sudah dicocokkan atau diubah oleh proses lain.`
          );
          err.status = 409;
          throw err;
        }
      }

      // Fix 4: Update Transactions using atomic WHERE-version concurrency control
      for (const tx of txs) {
        const txVersionToMatch = Number(tx.workflow_version);
        const updateRes = await db.run(
          `UPDATE penerimaan_transactions
           SET reconciliation_batch_id = $1, status = 'Terekonsiliasi', reconciled_at = CURRENT_TIMESTAMP,
               workflow_version = workflow_version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND workflow_version = $3 AND status = 'Menunggu Rekonsiliasi'`,
          [batch.id, tx.id, txVersionToMatch]
        );
        if (Number(updateRes.rowCount) !== 1) {
          const err = new Error(
            `Konflik pembaruan transaksi (ID: ${tx.id}): versi sudah berubah akibat operasi bersamaan.`
          );
          err.status = 409;
          throw err;
        }
      }

      // 8. Insert into penerimaan_matches
      const createdMatchIds = [];
      for (const line of lines) {
        for (const tx of txs) {
          const matchRes = await db.run(
            `INSERT INTO penerimaan_matches (
               statement_line_id, transaction_id, match_type, confidence_score, matched_by_id, notes, created_at
             ) VALUES ($1, $2, $3, 100.0, $4, $5, CURRENT_TIMESTAMP)
             RETURNING id`,
            [line.id, tx.id, matchType, actor.id || null, effectiveReason]
          );
          const matchId =
            matchRes.lastID ||
            (
              await db.get(
                'SELECT id FROM penerimaan_matches WHERE statement_line_id = $1 AND transaction_id = $2',
                [line.id, tx.id]
              )
            )?.id;
          if (matchId) createdMatchIds.push(matchId);
        }
      }

      // 9. Recalculate batch totals using integer-safe BigInt arithmetic
      await recalculateBatchTotals(batch.id, db);

      // 10. Audit events (Throws on failure or __simulateAuditFailure to rollback transaction)
      await recordPenerimaanAuditEvent(db, {
        entity_type: 'reconciliation_batch',
        entity_id: batch.id,
        action: 'manual_match',
        actor: { ...actor, reason: effectiveReason },
        changes: {
          statement_line_ids: lineIds,
          transaction_ids: txIds,
          match_type: matchType,
          notes: effectiveReason,
        },
        metadata: {
          match_ids: createdMatchIds,
          match_type: matchType,
          reason: effectiveReason,
        },
      });

      for (const tx of txs) {
        await recordPenerimaanAuditEvent(db, {
          entity_type: 'transaction',
          entity_id: tx.id,
          action: 'manual_reconcile',
          actor: { ...actor, reason: effectiveReason },
          changes: {
            from_status: tx.status,
            to_status: 'Terekonsiliasi',
            reconciliation_batch_id: batch.id,
            match_type: matchType,
          },
          metadata: { reason: effectiveReason },
        });
      }

      return {
        success: true,
        match_id: createdMatchIds[0] || null,
        match_ids: createdMatchIds,
        match_type: matchType,
      };
    });
  }, Boolean(actor?.__bypassBatchLock));
}

/**
 * Unmatches a statement line and reverts associated transaction(s).
 * Enforces group-level unmatch:
 * - split: deletes all matches with the same statement_line_id
 * - merge: deletes all matches with the same transaction_id
 * Ensures no partial or unbalanced relations remain.
 */
export async function unmatchStatementLine(
  { batchId, matchId, notes = '', reason = '', actor = {} } = {},
  dbOverride = null
) {
  const effectiveReason = String(reason || notes || actor?.reason || '').trim();
  if (!effectiveReason) {
    const err = new Error('Alasan pembatalan pencocokan (unmatch) wajib diisi.');
    err.status = 400;
    throw err;
  }

  return withBatchLock(batchId, async () => {
    return withTransaction(dbOverride, async (db) => {
      const batch = await db.get('SELECT * FROM penerimaan_reconciliation_batches WHERE id = $1 FOR UPDATE', [Number(batchId)]);
      if (!batch) {
        const err = new Error('Batch rekonsiliasi tidak ditemukan.');
        err.status = 404;
        throw err;
      }
      assertBatchMutable(batch);

      // Fix 3: Scope query strictly to batch_id AND match_id — forbid cross-batch unmatch
      const numParam = Number(matchId);
      const anchorMatch = await db.get(
        `SELECT pm.* FROM penerimaan_matches pm
         JOIN penerimaan_statement_lines psl ON psl.id = pm.statement_line_id
         WHERE pm.id = $1 AND psl.batch_id = $2 FOR UPDATE`,
        [numParam, batch.id]
      );

      if (!anchorMatch) {
        const err = new Error('Data rekonsiliasi (match) tidak ditemukan dalam batch ini.');
        err.status = 404;
        throw err;
      }

      // Fix 4: Group-level unmatch
      // - split: delete all matches with the same statement_line_id
      // - merge: delete all matches with the same transaction_id
      // - manual/other: delete all matches with the same statement_line_id or transaction_id
      let matches;
      if (anchorMatch.match_type === 'merge') {
        matches = await db.all(
          `SELECT pm.* FROM penerimaan_matches pm
           JOIN penerimaan_statement_lines psl ON psl.id = pm.statement_line_id
           WHERE pm.transaction_id = $1 AND psl.batch_id = $2`,
          [anchorMatch.transaction_id, batch.id]
        );
      } else if (anchorMatch.match_type === 'split') {
        matches = await db.all(
          `SELECT pm.* FROM penerimaan_matches pm
           JOIN penerimaan_statement_lines psl ON psl.id = pm.statement_line_id
           WHERE pm.statement_line_id = $1 AND psl.batch_id = $2`,
          [anchorMatch.statement_line_id, batch.id]
        );
      } else {
        matches = await db.all(
          `SELECT pm.* FROM penerimaan_matches pm
           JOIN penerimaan_statement_lines psl ON psl.id = pm.statement_line_id
           WHERE (pm.statement_line_id = $1 OR pm.transaction_id = $2) AND psl.batch_id = $3`,
          [anchorMatch.statement_line_id, anchorMatch.transaction_id, batch.id]
        );
      }

      const statementLineIds = [...new Set(matches.map((m) => m.statement_line_id))];
      const transactionIds = [...new Set(matches.map((m) => m.transaction_id))];

      // Delete match records
      for (const m of matches) {
        await db.run('DELETE FROM penerimaan_matches WHERE id = $1', [m.id]);
      }

      // Revert statement lines if no other matches remain
      for (const sId of statementLineIds) {
        const rem = await db.get('SELECT id FROM penerimaan_matches WHERE statement_line_id = $1 LIMIT 1', [sId]);
        if (!rem) {
          await db.run(
            `UPDATE penerimaan_statement_lines
             SET status = 'unmatched', matched_transaction_id = NULL
             WHERE id = $1`,
            [sId]
          );
        }
      }

      // Fix 4b: Revert transactions using conditional UPDATE to detect concurrent modification
      for (const tId of transactionIds) {
        const rem = await db.get('SELECT id FROM penerimaan_matches WHERE transaction_id = $1 LIMIT 1', [tId]);
        if (!rem) {
          const revertRes = await db.run(
            `UPDATE penerimaan_transactions
             SET reconciliation_batch_id = NULL, status = 'Menunggu Rekonsiliasi', reconciled_at = NULL,
                 workflow_version = workflow_version + 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND status = 'Terekonsiliasi'`,
            [tId]
          );
          if (Number(revertRes.rowCount) !== 1) {
            const err = new Error(
              `Konflik pembatalan transaksi (ID: ${tId}): status transaksi sudah berubah akibat operasi bersamaan.`
            );
            err.status = 409;
            throw err;
          }
        }
      }

      // Recalculate batch using integer-safe BigInt arithmetic
      await recalculateBatchTotals(batch.id, db);

      await recordPenerimaanAuditEvent(db, {
        entity_type: 'reconciliation_batch',
        entity_id: batch.id,
        action: 'unmatch',
        actor: { ...actor, reason: effectiveReason },
        changes: {
          statement_line_ids: statementLineIds,
          transaction_ids: transactionIds,
          deleted_match_count: matches.length,
        },
        metadata: { reason: effectiveReason },
      });

      for (const tId of transactionIds) {
        await recordPenerimaanAuditEvent(db, {
          entity_type: 'transaction',
          entity_id: tId,
          action: 'unmatch_transaction',
          actor: { ...actor, reason: effectiveReason },
          changes: {
            from_status: 'Terekonsiliasi',
            to_status: 'Menunggu Rekonsiliasi',
            reconciliation_batch_id: null,
          },
          metadata: { reason: effectiveReason },
        });
      }

      return { success: true };
    });
  }, Boolean(actor?.__bypassBatchLock));
}

/**
 * Closes a reconciliation batch permanently.
 * Only accessible to Leader and Admin (enforces canCloseReconciliationBatch).
 * Enforces variance reason when discrepancy != 0.
 */
export async function closeReconciliationBatch(
  { batchId, notes = '', reason = '', actor = {} } = {},
  dbOverride = null
) {
  return withBatchLock(batchId, async () => {
    return withTransaction(dbOverride, async (db) => {
      const batch = await db.get('SELECT * FROM penerimaan_reconciliation_batches WHERE id = $1 FOR UPDATE', [Number(batchId)]);
      if (!batch) {
        const err = new Error('Batch rekonsiliasi tidak ditemukan.');
        err.status = 404;
        throw err;
      }

      const check = canCloseReconciliationBatch({ actor, batch });
      if (!check.allowed) {
        const err = new Error(check.reason || 'Wewenang tidak mencukupi untuk menutup batch rekonsiliasi.');
        const authority = resolvePenerimaanAuthority(actor);
        err.status = authority.division !== 'penerimaan' || !authority.canCloseBatch ? 403 : 400;
        throw err;
      }

      const expectedCents = toIntegerCents(batch.total_expected_amount);
      const matchedCents = toIntegerCents(batch.total_matched_amount);
      const discrepancyCents = expectedCents - matchedCents;
      const discrepancy = toDatabaseIntegerAmount(discrepancyCents);
      const effectiveReason = String(reason || notes || actor?.reason || '').trim();

      if (discrepancyCents !== 0n && !effectiveReason) {
        const err = new Error('Alasan selisih (variance reason) wajib diisi saat menutup batch rekonsiliasi yang belum seimbang.');
        err.status = 400;
        throw err;
      }

      const now = new Date().toISOString();

      // Fix 6: Conditional UPDATE — only closes if not already closed (prevents concurrent close race)
      const closeRes = await db.run(
        `UPDATE penerimaan_reconciliation_batches
         SET status = 'closed', discrepancy_amount = $1, notes = COALESCE($2, notes), closed_by_id = $3, closed_at = $4, updated_at = $5
         WHERE id = $6 AND status != 'closed'`,
        [discrepancy, effectiveReason || null, actor.id || null, now, now, batch.id]
      );
      if (Number(closeRes.rowCount) !== 1) {
        const err = new Error('Batch rekonsiliasi sudah ditutup oleh operasi lain.');
        err.status = 409;
        throw err;
      }

      await recordPenerimaanAuditEvent(db, {
        entity_type: 'reconciliation_batch',
        entity_id: batch.id,
        action: 'close_batch',
        actor: { ...actor, reason: effectiveReason },
        changes: {
          from_status: batch.status,
          to_status: 'closed',
          discrepancy_amount: discrepancy,
        },
        metadata: {
          notes: effectiveReason || 'Penutupan batch rekonsiliasi',
          reason: effectiveReason || 'Batch closed and finalized',
          isAdminBypass: Boolean(check.isAdminBypass),
        },
      });

      return getReconciliationBatchById(batch.id, db);
    });
  }, Boolean(actor?.__bypassBatchLock));
}

// ====================================================================
// TASK 11: REPORTING, SETTINGS, AND CROSS-DIVISION INTEGRATION
// ====================================================================

/**
 * Generates reporting summary and executive KPIs for Penerimaan ZIS.
 */
export async function getPenerimaanReportSummary(arg1 = {}, arg2 = null) {
  let db = null;
  let rawFilters = {};
  if (arg1 && (typeof arg1.all === 'function' || typeof arg1.query === 'function' || typeof arg1.run === 'function')) {
    db = arg1;
    rawFilters = arg2 || {};
  } else {
    rawFilters = arg1 || {};
    db = arg2 || (await getDb());
  }

  const normalized = normalizeReportFilters(rawFilters);

  if (normalized.view === 'audit') {
    const { whereSql, values, filters } = buildAuditReportQuery(normalized);
    const countRow = await db.get(`SELECT COUNT(*) as total_count FROM penerimaan_audit_events ${whereSql}`, values);
    const freshnessRow = await db.get(`SELECT MAX(created_at) as max_created FROM penerimaan_audit_events ${whereSql}`, values);
    const totalCount = countRow ? Number(countRow.total_count || 0) : 0;
    const freshnessIso = freshnessRow?.max_created ? new Date(freshnessRow.max_created).toISOString() : null;

    const rawPreview = await getPenerimaanReportTransactions(filters, { limit: filters.limit, offset: filters.offset }, db);
    const previewTransactions = rawPreview.map((tx) => {
      const copy = { ...tx };
      delete copy.muzakki_phone;
      delete copy.muzakki_nik;
      delete copy.muzakki_email;
      return copy;
    });

    const periodLabel = filters.period === '7d' ? '7 Hari Terakhir' : filters.period === '1y' ? '1 Tahun Terakhir' : filters.period === 'custom' ? 'Kustom' : '30 Hari Terakhir';

    const kpis = {
      total_count: totalCount,
      total_transactions: totalCount,
      reconciled_pct: 0,
      by_status: {},
      by_channel: {},
      by_fund_type: {},
    };

    const reports = [
      {
        id: 'rep-audit-log',
        category: 'audit_trail',
        period: filters.period || '30d',
        title: `Laporan Audit Trail Penerimaan ${periodLabel}`,
        description: 'Rekapitulasi log aktivitas dan jejak audit penerimaan ZIS.',
        scope: filters.search ? `Cari: ${filters.search}` : 'Semua Aktivitas',
        status: 'Siap diekspor',
        total_rows: totalCount,
        data_freshness: freshnessIso,
        updated_at: freshnessIso,
      },
    ];

    return {
      reports,
      preview_transactions: previewTransactions,
      applied_filters: filters,
      meta: {
        period: filters.period,
        start_date: filters.start_date,
        end_date: filters.end_date,
        channel: filters.channel,
        fund_type: filters.fund_type,
        data_freshness: freshnessIso,
        applied_filters: filters,
      },
      kpis,
    };
  }

  const { whereSql, values, filters } = buildPenerimaanReportFilterQuery(rawFilters, '');

  const rows = await db.all(`SELECT CAST(amount AS TEXT) as amount, CAST(fee_amount AS TEXT) as fee_amount, CAST(net_amount AS TEXT) as net_amount, status FROM penerimaan_transactions ${whereSql}`, values);

  let totalCents = 0n;
  let totalFee = 0n;
  let totalNet = 0n;
  let reconciledCount = 0;
  for (const r of rows) {
    const c = BigInt(toCanonicalRupiahString(r.amount));
    totalCents += c;
    totalFee += BigInt(toCanonicalRupiahString(r.fee_amount));
    totalNet += BigInt(toCanonicalRupiahString(r.net_amount));
    if (r.status === 'Posted' || r.status === 'Terekonsiliasi') {
      reconciledCount++;
    }
  }

  const totalAmount = totalCents.toString();
  const totalCount = rows.length;
  const avgAmount = totalCount > 0
    ? (totalCents / BigInt(totalCount)).toString()
    : '0';
  const recPct = totalCount > 0 ? Math.round((reconciledCount / totalCount) * 1000) / 10 : 0;

  // Freshness derived from filtered stored records (MAX(updated_at)). If empty, return null.
  let freshnessIso = null;
  if (totalCount > 0) {
    try {
      const freshnessRow = await db.get(`SELECT MAX(updated_at) as max_updated FROM penerimaan_transactions ${whereSql}`, values);
      if (freshnessRow?.max_updated) {
        freshnessIso = new Date(freshnessRow.max_updated).toISOString();
      }
    } catch {
      freshnessIso = null;
    }
  }

  const periodLabel = filters.period === '7d' ? '7 Hari Terakhir' : filters.period === '1y' ? '1 Tahun Terakhir' : '30 Hari Terakhir';
  const reports = [
    {
      id: 'rep-general-zis',
      category: filters.category || 'penerimaan_zis',
      period: filters.period || '30d',
      title: `Laporan Penerimaan ZIS ${periodLabel}`,
      description: 'Rekapitulasi seluruh penerimaan Zakat, Infak, dan Sedekah terpadu.',
      scope: filters.channel ? `Kanal: ${filters.channel}` : 'Semua Kanal',
      status: 'Siap diekspor',
      total_rows: totalCount,
      total_amount: totalAmount,
      data_freshness: freshnessIso,
      updated_at: freshnessIso,
    },
  ];

  const rawPreview = await getPenerimaanReportTransactions(filters, { limit: filters.limit, offset: filters.offset }, db);
  const previewTransactions = rawPreview.map((tx) => {
    const copy = { ...tx };
    delete copy.muzakki_phone;
    delete copy.muzakki_nik;
    delete copy.muzakki_email;
    return copy;
  });

  return {
    reports,
    preview_transactions: previewTransactions,
    applied_filters: filters,
    meta: {
      data_freshness: freshnessIso,
      applied_filters: filters,
    },
    kpis: {
      total_amount: totalAmount,
      total_revenue: totalAmount,
      total_fee: totalFee.toString(),
      total_net: totalNet.toString(),
      total_count: totalCount,
      total_transactions: totalCount,
      reconciled_pct: recPct,
      average_amount: avgAmount,
    },
  };
}

/**
 * Retrieves transactions or audit records matching report filter for preview and export.
 */
export async function getPenerimaanReportTransactions(arg1 = {}, arg2 = {}, arg3 = null) {
  let db = null;
  let rawFilters = {};
  let options = {};
  if (arg1 && (typeof arg1.all === 'function' || typeof arg1.query === 'function' || typeof arg1.run === 'function')) {
    db = arg1;
    rawFilters = arg2 || {};
    options = arg3 || {};
  } else {
    rawFilters = arg1 || {};
    options = arg2 || {};
    db = arg3 || (await getDb());
  }

  const normalized = normalizeReportFilters(rawFilters);

  // If view is audit, query real audit events from penerimaan_audit_events
  if (normalized.view === 'audit') {
    const { whereSql, values, filters } = buildAuditReportQuery(normalized);
    let limitClause = '';
    const requestedLimit = options.limit === undefined ? filters.limit : options.limit;
    if (requestedLimit !== null) {
      const lim = Math.max(1, parseInt(requestedLimit || filters.limit, 10));
      const off = Math.max(0, parseInt(options.offset || filters.offset || 0, 10));
      values.push(lim);
      const limParam = `$${values.length}`;
      values.push(off);
      const offParam = `$${values.length}`;
      limitClause = `LIMIT ${limParam} OFFSET ${offParam}`;
    }

    const AUDIT_SORT_MAP = {
      created_at: 'created_at',
      transaction_date: 'created_at',
      id: 'id',
      action: 'action',
      entity_type: 'entity_type',
      actor_name: 'actor_name',
    };
    const auditSortCol = AUDIT_SORT_MAP[filters.sort_by] || 'created_at';
    const auditSortDir = filters.sort_dir === 'ASC' ? 'ASC' : 'DESC';

    const rows = await db.all(
      `SELECT id as audit_event_id, id, entity_type, entity_id, action, actor_id, actor_name, actor_role, changes, metadata, created_at, created_at as transaction_date
       FROM penerimaan_audit_events
       ${whereSql}
       ORDER BY ${auditSortCol} ${auditSortDir}, id DESC
       ${limitClause}`,
      values
    );

    return rows.map((r) => ({
      audit_event_id: r.audit_event_id,
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      action: r.action,
      actor_id: r.actor_id,
      actor_name: r.actor_name,
      actor_role: r.actor_role,
      changes: r.changes,
      metadata: r.metadata,
      created_at: r.created_at,
    }));
  }

  const { whereSql, values, filters } = buildPenerimaanReportFilterQuery(normalized, 't');

  let limitClause = '';
  const requestedLimit = options.limit === undefined ? filters.limit : options.limit;
  if (requestedLimit !== null) {
    const lim = Math.max(1, parseInt(requestedLimit || filters.limit, 10));
    const off = Math.max(0, parseInt(options.offset || filters.offset || 0, 10));
    values.push(lim);
    const limParam = `$${values.length}`;
    values.push(off);
    const offParam = `$${values.length}`;
    limitClause = `LIMIT ${limParam} OFFSET ${offParam}`;
  }

  const TX_SORT_MAP = {
    transaction_date: 't.transaction_date',
    amount: 't.amount',
    created_at: 't.created_at',
    id: 't.id',
    status: 't.status',
    channel: 't.channel',
    fund_type: 't.fund_type',
    muzakki_name: 't.muzakki_name',
  };
  const txSortCol = TX_SORT_MAP[filters.sort_by] || 't.transaction_date';
  const txSortDir = filters.sort_dir === 'ASC' ? 'ASC' : 'DESC';

  const rows = await db.all(
    `SELECT t.*,
            CAST(t.amount AS TEXT) as amount_text,
            CAST(t.fee_amount AS TEXT) as fee_amount_text,
            CAST(t.net_amount AS TEXT) as net_amount_text,
            m.identity_number as muzakki_nik, m.phone as muzakki_phone_master
     FROM penerimaan_transactions t
     LEFT JOIN muzakki m ON t.muzakki_id = m.id
     ${whereSql}
     ORDER BY ${txSortCol} ${txSortDir}, t.id DESC
     ${limitClause}`,
    values
  );

  return rows.map((r) => formatPenerimaanTransactionListRow(r));
}

/**
 * Creates export job record in penerimaan_export_jobs.
 */
export async function createPenerimaanExportJob(optsOrFormat = {}, filtersOrDb = {}, maybeActor = {}, dbOverride = null) {
  let jobType = 'penerimaan_report';
  let format = 'pdf';
  let filters = {};
  let actor = {};
  let fileName = null;
  let fileSize = 0;
  let db = null;

  if (typeof optsOrFormat === 'string') {
    format = optsOrFormat;
    filters = filtersOrDb && typeof filtersOrDb === 'object' && !filtersOrDb.run ? filtersOrDb : {};
    actor = maybeActor && typeof maybeActor === 'object' && !maybeActor.run ? maybeActor : {};
    db = dbOverride || (filtersOrDb && filtersOrDb.run ? filtersOrDb : (maybeActor && maybeActor.run ? maybeActor : null));
  } else {
    jobType = optsOrFormat?.jobType || 'penerimaan_report';
    format = optsOrFormat?.format || 'pdf';
    filters = optsOrFormat?.filters || {};
    actor = optsOrFormat?.actor || {};
    fileName = optsOrFormat?.fileName || null;
    fileSize = optsOrFormat?.fileSize || 0;
    db = filtersOrDb && filtersOrDb.run ? filtersOrDb : dbOverride;
  }

  const dbConn = db || (await getDb());
  const jobUuid = crypto.randomUUID();
  const now = new Date().toISOString();
  const name = fileName || `laporan-penerimaan-${Date.now()}.${format}`;
  const filtersJson = typeof filters === 'string' ? filters : JSON.stringify(filters || {});

  await dbConn.run(
    `INSERT INTO penerimaan_export_jobs (
       job_uuid, job_type, format, filters_json, status, file_name, file_size,
       created_by_id, created_by_name, created_at, completed_at
     ) VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7, $8, $9, NULL)`,
    [
      jobUuid,
      jobType,
      format,
      filtersJson,
      name,
      fileSize || 0,
      actor.id || null,
      actor.name || 'Amil Penerimaan',
      now,
    ]
  );

  return getPenerimaanExportJob(jobUuid, dbConn);
}

export async function markPenerimaanExportJobProcessing(jobUuid, actor = {}, dbOverride = null) {
  const db = dbOverride || (await getDb());
  const now = new Date().toISOString();
  const res = await db.run(
    `UPDATE penerimaan_export_jobs
     SET status = 'processing',
         processing_started_at = $1,
         attempt_count = COALESCE(attempt_count, 0) + 1,
         error_message = NULL
     WHERE job_uuid = $2 AND status = 'queued'`,
    [now, jobUuid]
  );
  const rowCount = res?.rowCount ?? res?.changes ?? 0;
  if (rowCount !== 1) {
    const err = new Error('Job ekspor sedang diproses atau tidak dalam status queued.');
    err.status = 409;
    err.code = 'EXPORT_JOB_CONFLICT';
    throw err;
  }
  return getPenerimaanExportJob(jobUuid, db);
}

export async function completePenerimaanExportJob(jobUuid, { fileName, fileSize, artifactPath, expectedProcessingStartedAt } = {}, dbOverride = null) {
  const db = dbOverride || (await getDb());
  const now = new Date().toISOString();
  let query = `UPDATE penerimaan_export_jobs
     SET status = 'completed',
         file_name = COALESCE($1, file_name),
         file_size = COALESCE($2, file_size),
         artifact_path = COALESCE($3, artifact_path),
         completed_at = $4,
         error_message = NULL
     WHERE job_uuid = $5 AND status = 'processing'`;
  const params = [fileName || null, fileSize || 0, artifactPath || null, now, jobUuid];

  if (expectedProcessingStartedAt) {
    query += ` AND (processing_started_at = $6 OR processing_started_at IS NULL)`;
    params.push(expectedProcessingStartedAt);
  }

  const res = await db.run(query, params);
  const rowCount = res?.rowCount ?? res?.changes ?? 0;
  if (rowCount !== 1) {
    const err = new Error('Job ekspor tidak dalam status processing atau kepemilikan proses telah kedaluwarsa.');
    err.status = 409;
    err.code = 'EXPORT_JOB_CONFLICT';
    throw err;
  }
  return getPenerimaanExportJob(jobUuid, db);
}

export async function failPenerimaanExportJob(jobUuid, errorMessage = 'Export failed', options = {}, dbOverride = null) {
  let actualDb = dbOverride;
  let expectedStartedAt = null;
  if (options && typeof options === 'object' && options.run) {
    actualDb = options;
  } else if (options && typeof options === 'object') {
    expectedStartedAt = options.expectedProcessingStartedAt || null;
  }
  const db = actualDb || (await getDb());
  const sanitized = String(errorMessage || 'Export failed')
    .replace(/(?:password|secret|token|key)=\S+/gi, '[REDACTED]')
    .replace(/\/[a-zA-Z0-9_\-\.\/]+/g, '[PATH]')
    .replace(/at\s+.*\(.*:\d+:\d+\)/g, '')
    .slice(0, 200)
    .trim() || 'Gagal menghasilkan dokumen ekspor.';

  let query = `UPDATE penerimaan_export_jobs
     SET status = 'failed', error_message = $1
     WHERE job_uuid = $2 AND status = 'processing'`;
  const params = [sanitized, jobUuid];

  if (expectedStartedAt) {
    query += ` AND (processing_started_at = $3 OR processing_started_at IS NULL)`;
    params.push(expectedStartedAt);
  }

  const res = await db.run(query, params);
  const rowCount = res?.rowCount ?? res?.changes ?? 0;
  if (rowCount !== 1) {
    const err = new Error('Job ekspor tidak dalam status processing atau gagal diubah ke failed.');
    err.status = 409;
    err.code = 'EXPORT_JOB_CONFLICT';
    throw err;
  }
  return getPenerimaanExportJob(jobUuid, db);
}

export async function getPendingPenerimaanExportJobs(dbOverride = null) {
  const db = dbOverride || (await getDb());
  return db.all(
    `SELECT * FROM penerimaan_export_jobs
     WHERE status IN ('queued', 'processing')
     ORDER BY id ASC`
  );
}

export async function reclaimStalePenerimaanExportJob(jobUuid, currentStartedAt, { maxAttempts = 3, errorMessage = 'Batas percobaan pembuatan dokumen ekspor telah tercapai.' } = {}, dbOverride = null) {
  const db = dbOverride || (await getDb());
  const job = await getPenerimaanExportJob(jobUuid, db);
  if (!job || job.status !== 'processing') return null;

  if (Number(job.attempt_count || 0) >= maxAttempts) {
    let query = `UPDATE penerimaan_export_jobs
       SET status = 'failed', error_message = $1
       WHERE job_uuid = $2 AND status = 'processing'`;
    const params = [errorMessage, jobUuid];
    if (currentStartedAt) {
      query += ` AND (processing_started_at = $3 OR processing_started_at IS NULL)`;
      params.push(currentStartedAt);
    }
    const res = await db.run(query, params);
    return (res?.rowCount ?? res?.changes ?? 0) === 1 ? 'failed' : null;
  }

  let query = `UPDATE penerimaan_export_jobs
     SET status = 'queued', error_message = 'Job dipulihkan setelah restart atau timeout'
     WHERE job_uuid = $1 AND status = 'processing'`;
  const params = [jobUuid];
  if (currentStartedAt) {
    query += ` AND (processing_started_at = $2 OR processing_started_at IS NULL)`;
    params.push(currentStartedAt);
  }
  const res = await db.run(query, params);
  return (res?.rowCount ?? res?.changes ?? 0) === 1 ? 'queued' : null;
}

/**
 * Retrieves an export job by ID or UUID.
 */
export async function getPenerimaanExportJob(jobId, dbOverride = null) {
  const db = dbOverride || (await getDb());
  const numId = Number(jobId);
  const row = await db.get(
    'SELECT * FROM penerimaan_export_jobs WHERE job_uuid = $1 OR id = $2',
    [String(jobId), numId || 0]
  );
  if (!row) return null;
  return {
    ...row,
    filters: safeJsonParse(row.filters_json, {}),
  };
}

/**
 * Retrieves current Penerimaan operational policy for validation/approval decisions.
 */
export async function getPenerimaanOperationalPolicy(dbOverride = null) {
  const db = dbOverride || (await getDb());
  const settings = await getPenerimaanSettings(db);
  const threshold = settings.approval_threshold !== undefined && settings.approval_threshold !== null
    ? String(settings.approval_threshold).trim()
    : '10000000';
  const tolerance = settings.auto_reconcile_tolerance !== undefined && settings.auto_reconcile_tolerance !== null
    ? String(settings.auto_reconcile_tolerance).trim()
    : '0';
  return {
    approval_threshold: threshold,
    auto_reconcile_tolerance: tolerance,
    require_evidence_manual: settings.require_evidence_manual !== false,
  };
}

/**
 * Asserts that a channel is registered and active. Throws 400 if inactive or missing.
 */
export async function assertActivePenerimaanChannel(first, second = null) {
  let channelCode, dbOverride;
  if (typeof first === 'string') {
    channelCode = first;
    dbOverride = second;
  } else {
    dbOverride = first;
    channelCode = second;
  }
  const db = dbOverride || (await getDb());
  if (!channelCode) {
    const err = new Error('Kode kanal pembayaran wajib diisi.');
    err.status = 400;
    throw err;
  }
  const row = await db.get(
    'SELECT * FROM penerimaan_channels WHERE code = $1 LIMIT 1',
    [String(channelCode).trim()]
  );
  if (!row) {
    const err = new Error(`Kanal pembayaran "${channelCode}" tidak ditemukan.`);
    err.status = 400;
    throw err;
  }
  if (!row.is_active) {
    const err = new Error(`Kanal pembayaran "${channelCode}" sedang nonaktif dan tidak dapat menerima transaksi.`);
    err.status = 400;
    throw err;
  }
  return {
    ...row,
    is_active: Boolean(row.is_active),
    provider_name: row.provider || null,
  };
}

/**
 * Retrieves current Penerimaan operational settings.
 */
export async function getPenerimaanSettings(dbOverride = null) {
  const db = dbOverride || (await getDb());
  const row = await db.get(
    "SELECT * FROM penerimaan_settings WHERE setting_key = 'operational_settings' LIMIT 1"
  );

  const defaults = {
    approval_threshold: '10000000',
    auto_reconcile_tolerance: '0',
    require_evidence_manual: true,
    updated_at: null,
    updated_by: null,
  };

  if (!row) return defaults;

  const parsed = safeJsonParse(row.setting_value, {});
  return {
    ...defaults,
    ...parsed,
    approval_threshold: parsed.approval_threshold !== undefined && parsed.approval_threshold !== null
      ? String(parsed.approval_threshold).trim()
      : defaults.approval_threshold,
    auto_reconcile_tolerance: parsed.auto_reconcile_tolerance !== undefined && parsed.auto_reconcile_tolerance !== null
      ? String(parsed.auto_reconcile_tolerance).trim()
      : defaults.auto_reconcile_tolerance,
    updated_at: row.updated_at,
    updated_by: parsed.updated_by || row.updated_by_name || defaults.updated_by,
  };
}

/**
 * Updates Penerimaan operational settings (Admin only).
 * Atomic: mutation and audit event wrapped in same transaction.
 */
export async function updatePenerimaanSettings(payload = {}, actor = {}, dbOverride = null) {
  const allowedKeys = ['approval_threshold', 'auto_reconcile_tolerance', 'require_evidence_manual', 'notes'];
  for (const k of Object.keys(payload)) {
    if (!allowedKeys.includes(k)) {
      const err = new Error(`Kunci pengaturan tidak dikenal: "${k}".`);
      err.status = 400;
      throw err;
    }
  }

  if (payload.approval_threshold !== undefined) {
    if (typeof payload.approval_threshold === 'boolean') {
      const err = new Error('Threshold approval kepala bagian harus berupa bilangan bulat positif.');
      err.status = 400;
      throw err;
    }
    const str = String(payload.approval_threshold).trim();
    if (!/^\d+$/.test(str)) {
      const err = new Error('Threshold approval kepala bagian harus berupa bilangan bulat positif lebih dari 0.');
      err.status = 400;
      throw err;
    }
    if (typeof payload.approval_threshold === 'number' && !Number.isSafeInteger(payload.approval_threshold)) {
      const err = new Error('Threshold approval melebihi batas safe integer.');
      err.status = 400;
      throw err;
    }
    const bi = BigInt(str);
    if (bi <= 0n) {
      const err = new Error('Threshold approval kepala bagian harus berupa bilangan bulat positif lebih dari 0.');
      err.status = 400;
      throw err;
    }
  }

  if (payload.auto_reconcile_tolerance !== undefined) {
    if (typeof payload.auto_reconcile_tolerance === 'boolean') {
      const err = new Error('Toleransi rekonsiliasi otomatis harus berupa bilangan bulat >= 0.');
      err.status = 400;
      throw err;
    }
    const str = String(payload.auto_reconcile_tolerance).trim();
    if (!/^\d+$/.test(str)) {
      const err = new Error('Toleransi rekonsiliasi otomatis harus berupa bilangan bulat >= 0.');
      err.status = 400;
      throw err;
    }
    if (typeof payload.auto_reconcile_tolerance === 'number' && !Number.isSafeInteger(payload.auto_reconcile_tolerance)) {
      const err = new Error('Toleransi rekonsiliasi otomatis melebihi batas safe integer.');
      err.status = 400;
      throw err;
    }
  }

  if (payload.require_evidence_manual !== undefined && typeof payload.require_evidence_manual !== 'boolean') {
    const err = new Error('Field require_evidence_manual harus bertipe boolean.');
    err.status = 400;
    throw err;
  }

  return withTransaction(dbOverride, async (db) => {
    const current = await getPenerimaanSettings(db);
    const updated = {
      ...current,
      ...payload,
      approval_threshold: payload.approval_threshold !== undefined ? String(payload.approval_threshold).trim() : current.approval_threshold,
      auto_reconcile_tolerance: payload.auto_reconcile_tolerance !== undefined ? String(payload.auto_reconcile_tolerance).trim() : current.auto_reconcile_tolerance,
      require_evidence_manual: payload.require_evidence_manual !== undefined ? Boolean(payload.require_evidence_manual) : current.require_evidence_manual,
      updated_at: new Date().toISOString(),
      updated_by: actor.name || 'Admin',
    };

    const valJson = JSON.stringify(updated);
    const now = new Date().toISOString();

    const existing = await db.get(
      "SELECT id FROM penerimaan_settings WHERE setting_key = 'operational_settings'"
    );

    if (existing) {
      await db.run(
        `UPDATE penerimaan_settings
         SET setting_value = $1, updated_by_id = $2, updated_at = $3
         WHERE setting_key = 'operational_settings'`,
        [valJson, actor.id || null, now]
      );
    } else {
      await db.run(
        `INSERT INTO penerimaan_settings (setting_key, setting_value, description, updated_by_id, updated_at)
         VALUES ('operational_settings', $1, 'Parameter operasional divisi Penerimaan', $2, $3)`,
        [valJson, actor.id || null, now]
      );
    }

    await recordPenerimaanAuditEvent(db, {
      entity_type: 'penerimaan_settings',
      entity_id: 'operational_settings',
      action: 'update_settings',
      actor,
      changes: {
        old_values: current,
        new_values: updated,
      },
      metadata: {
        reason: payload.notes || 'Pembaruan konfigurasi operasional Penerimaan',
      },
    });

    return updated;
  });
}

/**
 * Lists all Penerimaan channels.
 */
export async function listPenerimaanChannels(dbOverride = null) {
  const db = dbOverride || (await getDb());
  const rows = await db.all('SELECT * FROM penerimaan_channels ORDER BY id ASC');
  return rows.map((r) => ({
    ...r,
    provider_name: r.provider || null,
    is_active: Boolean(r.is_active),
  }));
}

/**
 * Creates a new Penerimaan channel.
 */
export async function createPenerimaanChannel(payload = {}, actor = {}, dbOverride = null) {
  const allowedKeys = ['code', 'name', 'category', 'provider', 'provider_name', 'is_active'];
  for (const k of Object.keys(payload)) {
    if (!allowedKeys.includes(k)) {
      const err = new Error(`Field tidak dikenal pada pembuatan kanal: "${k}".`);
      err.status = 400;
      throw err;
    }
  }

  if (payload.is_active !== undefined && typeof payload.is_active !== 'boolean') {
    const err = new Error('Field is_active harus bertipe boolean (true/false).');
    err.status = 400;
    throw err;
  }

  const code = String(payload.code || '').trim().toLowerCase();
  const name = String(payload.name || '').trim();
  const category = String(payload.category || 'digital').trim().toLowerCase();
  const provider = payload.provider || payload.provider_name || null;
  const isActive = payload.is_active !== undefined ? payload.is_active : true;

  if (!code || code.length < 2 || code.length > 50 || !/^[a-z0-9_-]+$/.test(code)) {
    const err = new Error('Kode kanal wajib diisi, berupa karakter alfanumerik (2-50 karakter).');
    err.status = 400;
    throw err;
  }

  if (!name || name.length < 2 || name.length > 100) {
    const err = new Error('Nama kanal wajib diisi (2-100 karakter).');
    err.status = 400;
    throw err;
  }

  if (category && !['digital', 'manual'].includes(category)) {
    const err = new Error('Kategori kanal harus "digital" atau "manual".');
    err.status = 400;
    throw err;
  }

  return withTransaction(dbOverride, async (db) => {
    const existing = await db.get('SELECT id FROM penerimaan_channels WHERE code = $1', [code]);
    if (existing) {
      const err = new Error(`Kanal dengan kode "${code}" sudah ada.`);
      err.status = 409;
      throw err;
    }

    const res = await db.run(
      `INSERT INTO penerimaan_channels (code, name, category, provider, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [code, name, category, provider, isActive ? 1 : 0]
    );

    const createdId = res.lastID || (await db.get('SELECT id FROM penerimaan_channels WHERE code = $1', [code]))?.id;
    const created = await db.get('SELECT * FROM penerimaan_channels WHERE id = $1', [createdId]);

    await recordPenerimaanAuditEvent(db, {
      entity_type: 'penerimaan_settings',
      entity_id: `channel:${createdId}`,
      action: 'create_channel',
      actor,
      changes: { new_values: created },
      metadata: { reason: `Pembuatan kanal baru ${code}` },
    });

    return {
      ...created,
      provider_name: created.provider || null,
      is_active: Boolean(created.is_active),
    };
  });
}

/**
 * Updates a Penerimaan channel configuration.
 * Guard: Prevents disabling a channel if unsettled transactions exist.
 */
export async function updatePenerimaanChannel(id, payload = {}, actor = {}, dbOverride = null) {
  const allowedKeys = ['name', 'category', 'provider', 'provider_name', 'is_active', 'code'];
  for (const k of Object.keys(payload)) {
    if (!allowedKeys.includes(k)) {
      const err = new Error(`Field tidak dikenal pada pembaruan kanal: "${k}".`);
      err.status = 400;
      throw err;
    }
  }

  if (payload.is_active !== undefined && typeof payload.is_active !== 'boolean') {
    const err = new Error('Field is_active harus bertipe boolean (true/false).');
    err.status = 400;
    throw err;
  }

  return withTransaction(dbOverride, async (db) => {
    const channel = await db.get('SELECT * FROM penerimaan_channels WHERE id = $1', [id]);
    if (!channel) {
      const err = new Error(`Kanal penerimaan dengan ID ${id} tidak ditemukan.`);
      err.status = 404;
      throw err;
    }

    // Code immutability
    if (payload.code !== undefined && String(payload.code).trim().toLowerCase() !== channel.code) {
      const err = new Error('Kode kanal bersifat immutable dan tidak dapat diubah.');
      err.status = 400;
      throw err;
    }

    if (payload.name !== undefined) {
      const n = String(payload.name).trim();
      if (n.length < 2 || n.length > 100) {
        const err = new Error('Nama kanal harus antara 2 dan 100 karakter.');
        err.status = 400;
        throw err;
      }
    }

    if (payload.category !== undefined) {
      const c = String(payload.category).trim().toLowerCase();
      if (!['digital', 'manual'].includes(c)) {
        const err = new Error('Kategori kanal harus "digital" atau "manual".');
        err.status = 400;
        throw err;
      }
    }

    // Check unsettled guard if attempting to deactivate
    const targetActive = payload.is_active !== undefined ? payload.is_active : Boolean(channel.is_active);
    if (!targetActive && Boolean(channel.is_active)) {
      const unsettled = await db.get(
        `SELECT COUNT(*) as cnt FROM penerimaan_transactions
         WHERE channel = $1 AND status NOT IN ('Posted', 'Ditolak', 'Dibatalkan', 'Reversed')`,
        [channel.code]
      );
      const count = Number(unsettled?.cnt || 0);
      if (count > 0) {
        const err = new Error(
          `Kanal ${channel.name} (${channel.code}) tidak dapat dinonaktifkan karena masih terdapat ${count} transaksi belum tuntas (unsettled; belum berstatus Posted/Ditolak/Dibatalkan).`
        );
        err.status = 400;
        throw err;
      }
    }

    const now = new Date().toISOString();
    const name = payload.name !== undefined ? payload.name : channel.name;
    const category = payload.category !== undefined ? payload.category : channel.category;
    const provider = payload.provider !== undefined ? payload.provider : (payload.provider_name !== undefined ? payload.provider_name : channel.provider);

    await db.run(
      `UPDATE penerimaan_channels
       SET name = $1, is_active = $2, category = $3, provider = $4, updated_at = $5
       WHERE id = $6`,
      [name, targetActive ? 1 : 0, category, provider || null, now, id]
    );

    const updated = await db.get('SELECT * FROM penerimaan_channels WHERE id = $1', [id]);

    await recordPenerimaanAuditEvent(db, {
      entity_type: 'penerimaan_settings',
      entity_id: `channel:${id}`,
      action: 'update_channel',
      actor,
      changes: {
        old_values: channel,
        new_values: updated,
      },
      metadata: {
        reason: `Pembaruan kanal ${channel.code}`,
      },
    });

    return {
      ...updated,
      provider_name: updated.provider || null,
      is_active: Boolean(updated.is_active),
    };
  });
}

/**
 * Lists all collector accounts.
 */
export async function listPenerimaanAccounts(dbOverride = null) {
  const db = dbOverride || (await getDb());
  const rows = await db.all('SELECT * FROM penerimaan_accounts ORDER BY id ASC');
  return rows.map((r) => ({
    ...r,
    account_name: r.account_holder || '',
    is_active: Boolean(r.is_active),
  }));
}

/**
 * Creates a collector account.
 */
export async function createPenerimaanAccount(payload = {}, actor = {}, dbOverride = null) {
  const allowedKeys = ['bank_name', 'account_number', 'account_holder', 'account_name', 'channel_id', 'is_active'];
  for (const k of Object.keys(payload)) {
    if (!allowedKeys.includes(k)) {
      const err = new Error(`Field tidak dikenal pada pembuatan rekening: "${k}".`);
      err.status = 400;
      throw err;
    }
  }

  if (payload.is_active !== undefined && typeof payload.is_active !== 'boolean') {
    const err = new Error('Field is_active harus bertipe boolean (true/false).');
    err.status = 400;
    throw err;
  }

  const bankName = String(payload.bank_name || '').trim();
  const accountNumber = String(payload.account_number || '').trim();
  const accountHolder = String(payload.account_holder || payload.account_name || '').trim();
  const channelId = payload.channel_id !== undefined && payload.channel_id !== null ? Number(payload.channel_id) : null;
  const isActive = payload.is_active !== undefined ? payload.is_active : true;

  if (!bankName || bankName.length < 2 || bankName.length > 100) {
    const err = new Error('Nama bank wajib diisi (2-100 karakter).');
    err.status = 400;
    throw err;
  }
  if (!accountNumber || accountNumber.length < 3 || accountNumber.length > 50 || !/^[0-9A-Za-z\-]+$/.test(accountNumber)) {
    const err = new Error('Nomor rekening wajib diisi (3-50 karakter alfanumerik).');
    err.status = 400;
    throw err;
  }
  if (!accountHolder || accountHolder.length < 2 || accountHolder.length > 150) {
    const err = new Error('Nama pemilik rekening wajib diisi (2-150 karakter).');
    err.status = 400;
    throw err;
  }

  return withTransaction(dbOverride, async (db) => {
    if (channelId !== null) {
      const ch = await db.get('SELECT id FROM penerimaan_channels WHERE id = $1', [channelId]);
      if (!ch) {
        const err = new Error(`Kanal penerimaan dengan ID ${channelId} tidak ditemukan.`);
        err.status = 400;
        throw err;
      }
    }

    const res = await db.run(
      `INSERT INTO penerimaan_accounts (channel_id, bank_name, account_number, account_holder, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [channelId, bankName, accountNumber, accountHolder, isActive ? 1 : 0]
    );

    const createdId = res.lastID || (await db.get('SELECT id FROM penerimaan_accounts WHERE account_number = $1', [accountNumber]))?.id;
    const created = await db.get('SELECT * FROM penerimaan_accounts WHERE id = $1', [createdId]);

    await recordPenerimaanAuditEvent(db, {
      entity_type: 'penerimaan_settings',
      entity_id: `account:${createdId}`,
      action: 'create_account',
      actor,
      changes: { new_values: created },
      metadata: { reason: `Pembuatan rekening baru ${accountNumber}` },
    });

    return {
      ...created,
      account_name: created.account_holder || '',
      is_active: Boolean(created.is_active),
    };
  });
}

/**
 * Updates a collector account.
 */
export async function updatePenerimaanAccount(id, payload = {}, actor = {}, dbOverride = null) {
  const allowedKeys = ['bank_name', 'account_number', 'account_holder', 'account_name', 'channel_id', 'is_active'];
  for (const k of Object.keys(payload)) {
    if (!allowedKeys.includes(k)) {
      const err = new Error(`Field tidak dikenal pada pembaruan rekening: "${k}".`);
      err.status = 400;
      throw err;
    }
  }

  if (payload.is_active !== undefined && typeof payload.is_active !== 'boolean') {
    const err = new Error('Field is_active harus bertipe boolean (true/false).');
    err.status = 400;
    throw err;
  }

  return withTransaction(dbOverride, async (db) => {
    const acc = await db.get('SELECT * FROM penerimaan_accounts WHERE id = $1', [id]);
    if (!acc) {
      const err = new Error(`Rekening dengan ID ${id} tidak ditemukan.`);
      err.status = 404;
      throw err;
    }

    if (payload.bank_name !== undefined) {
      const bn = String(payload.bank_name).trim();
      if (bn.length < 2 || bn.length > 100) {
        const err = new Error('Nama bank harus antara 2 dan 100 karakter.');
        err.status = 400;
        throw err;
      }
    }

    if (payload.account_number !== undefined) {
      const an = String(payload.account_number).trim();
      if (an.length < 3 || an.length > 50 || !/^[0-9A-Za-z\-]+$/.test(an)) {
        const err = new Error('Nomor rekening harus berupa alfanumerik (3-50 karakter).');
        err.status = 400;
        throw err;
      }
    }

    const channelId = payload.channel_id !== undefined ? (payload.channel_id ? Number(payload.channel_id) : null) : acc.channel_id;
    if (payload.channel_id !== undefined && payload.channel_id !== null) {
      const ch = await db.get('SELECT id FROM penerimaan_channels WHERE id = $1', [channelId]);
      if (!ch) {
        const err = new Error(`Kanal penerimaan dengan ID ${channelId} tidak ditemukan.`);
        err.status = 400;
        throw err;
      }
    }

    const targetActive = payload.is_active !== undefined ? payload.is_active : Boolean(acc.is_active);
    if (targetActive && channelId !== null) {
      const ch = await db.get('SELECT id FROM penerimaan_channels WHERE id = $1', [channelId]);
      if (!ch) {
        const err = new Error(`Kanal penerimaan dengan ID ${channelId} tidak ditemukan.`);
        err.status = 400;
        throw err;
      }
    }

    const bankName = payload.bank_name !== undefined ? payload.bank_name : acc.bank_name;
    const accountHolder = payload.account_holder !== undefined ? payload.account_holder : (payload.account_name !== undefined ? payload.account_name : acc.account_holder);
    const accountNumber = payload.account_number !== undefined ? payload.account_number : acc.account_number;
    const now = new Date().toISOString();

    await db.run(
      `UPDATE penerimaan_accounts
       SET bank_name = $1, account_holder = $2, account_number = $3, channel_id = $4, is_active = $5, updated_at = $6
       WHERE id = $7`,
      [bankName, accountHolder, accountNumber, channelId, targetActive ? 1 : 0, now, id]
    );

    const updated = await db.get('SELECT * FROM penerimaan_accounts WHERE id = $1', [id]);

    await recordPenerimaanAuditEvent(db, {
      entity_type: 'penerimaan_settings',
      entity_id: `account:${id}`,
      action: 'update_account',
      actor,
      changes: {
        old_values: acc,
        new_values: updated,
      },
      metadata: {
        reason: `Pembaruan rekening bank ${acc.account_number}`,
      },
    });

    return {
      ...updated,
      account_name: updated.account_holder || '',
      is_active: Boolean(updated.is_active),
    };
  });
}

/**
 * Lists all Penerimaan fund categories.
 */
export async function listPenerimaanFundCategories(dbOverride = null) {
  const db = dbOverride || (await getDb());
  const rows = await db.all('SELECT * FROM penerimaan_fund_categories ORDER BY id ASC');
  return rows.map((r) => ({
    ...r,
    is_active: Boolean(r.is_active),
  }));
}

/**
 * Creates a new fund category.
 */
export async function createPenerimaanFundCategory(payload = {}, actor = {}, dbOverride = null) {
  const allowedKeys = ['code', 'name', 'description', 'is_active'];
  for (const k of Object.keys(payload)) {
    if (!allowedKeys.includes(k)) {
      const err = new Error(`Field tidak dikenal pada pembuatan kategori dana: "${k}".`);
      err.status = 400;
      throw err;
    }
  }

  if (payload.is_active !== undefined && typeof payload.is_active !== 'boolean') {
    const err = new Error('Field is_active harus bertipe boolean (true/false).');
    err.status = 400;
    throw err;
  }

  const code = String(payload.code || '').trim().toLowerCase();
  const name = String(payload.name || '').trim();
  const description = payload.description ? String(payload.description).trim() : null;
  const isActive = payload.is_active !== undefined ? payload.is_active : true;

  if (!code || code.length < 2 || code.length > 50 || !/^[a-z0-9_-]+$/.test(code)) {
    const err = new Error('Kode kategori dana wajib diisi, berupa karakter alfanumerik (2-50 karakter).');
    err.status = 400;
    throw err;
  }

  if (!name || name.length < 2 || name.length > 100) {
    const err = new Error('Nama kategori dana wajib diisi (2-100 karakter).');
    err.status = 400;
    throw err;
  }

  return withTransaction(dbOverride, async (db) => {
    const existing = await db.get('SELECT id FROM penerimaan_fund_categories WHERE code = $1', [code]);
    if (existing) {
      const err = new Error(`Kategori dana dengan kode "${code}" sudah ada.`);
      err.status = 409;
      throw err;
    }

    const res = await db.run(
      `INSERT INTO penerimaan_fund_categories (code, name, description, is_active)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [code, name, description, isActive ? 1 : 0]
    );

    const createdId = res.lastID || (await db.get('SELECT id FROM penerimaan_fund_categories WHERE code = $1', [code]))?.id;
    const created = await db.get('SELECT * FROM penerimaan_fund_categories WHERE id = $1', [createdId]);

    await recordPenerimaanAuditEvent(db, {
      entity_type: 'penerimaan_settings',
      entity_id: `fund_category:${createdId}`,
      action: 'create_fund_category',
      actor,
      changes: { new_values: created },
      metadata: { reason: `Pembuatan kategori dana baru ${code}` },
    });

    return {
      ...created,
      is_active: Boolean(created.is_active),
    };
  });
}

/**
 * Updates a fund category.
 */
export async function updatePenerimaanFundCategory(id, payload = {}, actor = {}, dbOverride = null) {
  const allowedKeys = ['name', 'description', 'is_active', 'code'];
  for (const k of Object.keys(payload)) {
    if (!allowedKeys.includes(k)) {
      const err = new Error(`Field tidak dikenal pada pembaruan kategori dana: "${k}".`);
      err.status = 400;
      throw err;
    }
  }

  if (payload.is_active !== undefined && typeof payload.is_active !== 'boolean') {
    const err = new Error('Field is_active harus bertipe boolean (true/false).');
    err.status = 400;
    throw err;
  }

  return withTransaction(dbOverride, async (db) => {
    const cat = await db.get('SELECT * FROM penerimaan_fund_categories WHERE id = $1', [id]);
    if (!cat) {
      const err = new Error(`Kategori dana dengan ID ${id} tidak ditemukan.`);
      err.status = 404;
      throw err;
    }

    if (payload.code !== undefined && String(payload.code).trim().toLowerCase() !== cat.code) {
      const err = new Error('Kode kategori dana bersifat immutable dan tidak dapat diubah.');
      err.status = 400;
      throw err;
    }

    if (payload.name !== undefined) {
      const n = String(payload.name).trim();
      if (n.length < 2 || n.length > 100) {
        const err = new Error('Nama kategori dana harus antara 2 dan 100 karakter.');
        err.status = 400;
        throw err;
      }
    }

    const now = new Date().toISOString();
    const name = payload.name !== undefined ? String(payload.name).trim() : cat.name;
    const description = payload.description !== undefined ? String(payload.description).trim() : cat.description;
    const isActive = payload.is_active !== undefined ? payload.is_active : Boolean(cat.is_active);

    await db.run(
      `UPDATE penerimaan_fund_categories
       SET name = $1, description = $2, is_active = $3, updated_at = $4
       WHERE id = $5`,
      [name, description, isActive ? 1 : 0, now, id]
    );

    const updated = await db.get('SELECT * FROM penerimaan_fund_categories WHERE id = $1', [id]);

    await recordPenerimaanAuditEvent(db, {
      entity_type: 'penerimaan_settings',
      entity_id: `fund_category:${id}`,
      action: 'update_fund_category',
      actor,
      changes: { old_values: cat, new_values: updated },
      metadata: { reason: `Pembaruan kategori dana ${cat.code}` },
    });

    return {
      ...updated,
      is_active: Boolean(updated.is_active),
    };
  });
}

/**
 * Lists all provider configurations with write-only secrets masked.
 */
export async function listPenerimaanProviderConfigs(dbOverride = null) {
  const db = dbOverride || (await getDb());
  const rows = await db.all('SELECT * FROM penerimaan_provider_configs ORDER BY id ASC');
  return rows.map((r) => ({
    id: r.id,
    provider_name: r.provider_name,
    display_name: r.display_name,
    is_active: Boolean(r.is_active),
    has_secret: Boolean(r.webhook_secret_encrypted),
    is_secret_set: Boolean(r.webhook_secret_encrypted),
    secret_masked: r.webhook_secret_encrypted ? '••••••••' : null,
    secret_updated_at: r.secret_updated_at,
    settings: safeJsonParse(r.settings, {}),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

/**
 * Updates a provider configuration with write-only secret rotation.
 */
export async function updatePenerimaanProviderConfig(id, payload = {}, actor = {}, dbOverride = null) {
  const allowedKeys = ['display_name', 'is_active', 'webhook_secret', 'secret_key', 'settings', 'provider_name'];
  for (const k of Object.keys(payload)) {
    if (!allowedKeys.includes(k)) {
      const err = new Error(`Field tidak dikenal pada pembaruan provider: "${k}".`);
      err.status = 400;
      throw err;
    }
  }

  if (payload.is_active !== undefined && typeof payload.is_active !== 'boolean') {
    const err = new Error('Field is_active harus bertipe boolean (true/false).');
    err.status = 400;
    throw err;
  }

  return withTransaction(dbOverride, async (db) => {
    const config = await db.get('SELECT * FROM penerimaan_provider_configs WHERE id = $1', [id]);
    if (!config) {
      const err = new Error(`Konfigurasi provider dengan ID ${id} tidak ditemukan.`);
      err.status = 404;
      throw err;
    }

    if (payload.provider_name !== undefined && String(payload.provider_name).trim().toLowerCase() !== config.provider_name.toLowerCase()) {
      const err = new Error('Nama provider bersifat immutable dan tidak dapat diubah.');
      err.status = 400;
      throw err;
    }

    const now = new Date().toISOString();
    const displayName = payload.display_name !== undefined ? String(payload.display_name).trim() : config.display_name;
    const targetActive = payload.is_active !== undefined ? payload.is_active : Boolean(config.is_active);

    let secretEncrypted = config.webhook_secret_encrypted;
    let secretUpdatedAt = config.secret_updated_at;
    let secretRotated = false;

    const newSecret = payload.webhook_secret !== undefined ? payload.webhook_secret : payload.secret_key;
    if (newSecret && typeof newSecret === 'string' && newSecret.trim().length > 0) {
      secretEncrypted = encryptProviderSecret(newSecret.trim());
      secretUpdatedAt = now;
      secretRotated = true;
    }

    // Rule 6: Prevent activating invalid provider configurations (no secret configured)
    if (targetActive && !Boolean(config.is_active) && !secretEncrypted && !secretRotated) {
      const err = new Error('Provider tidak dapat diaktifkan tanpa konfigurasi webhook secret.');
      err.status = 400;
      throw err;
    }

    let settingsJson = config.settings;
    if (payload.settings !== undefined) {
      settingsJson = typeof payload.settings === 'string' ? payload.settings : JSON.stringify(payload.settings);
    }

    await db.run(
      `UPDATE penerimaan_provider_configs
       SET display_name = $1, is_active = $2, webhook_secret_encrypted = $3, secret_updated_at = $4, settings = $5, updated_at = $6
       WHERE id = $7`,
      [displayName, targetActive ? 1 : 0, secretEncrypted, secretUpdatedAt, settingsJson, now, id]
    );

    const updated = await db.get('SELECT * FROM penerimaan_provider_configs WHERE id = $1', [id]);

    await recordPenerimaanAuditEvent(db, {
      entity_type: 'penerimaan_settings',
      entity_id: `provider_config:${id}`,
      action: 'update_provider_config',
      actor,
      changes: {
        old_values: { display_name: config.display_name, is_active: config.is_active },
        new_values: { display_name: updated.display_name, is_active: updated.is_active, secret_rotated: secretRotated },
      },
      metadata: { reason: `Pembaruan konfigurasi provider ${config.provider_name}` },
    });

    return {
      id: updated.id,
      provider_name: updated.provider_name,
      display_name: updated.display_name,
      is_active: Boolean(updated.is_active),
      has_secret: Boolean(updated.webhook_secret_encrypted),
      secret_masked: updated.webhook_secret_encrypted ? '••••••••' : null,
      secret_updated_at: updated.secret_updated_at,
      settings: safeJsonParse(updated.settings, {}),
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    };
  });
}

/**
 * Aggregates verified, Posted Penerimaan funds for Penyaluran consumption.
 * STRICT ISOLATION: Queries ONLY transactions with status = 'Posted'.
 * Excludes Menunggu Validasi, Menunggu Approval, Menunggu Rekonsiliasi, Ditolak, Dibatalkan, Reversed.
 * Computes exact sums via BigInt cents arithmetic.
 */
export async function getPenerimaanAggregatesForPenyaluran(filters = {}, dbOverride = null) {
  const db = dbOverride || (await getDb());

  const conditions = ["status = 'Posted'"];
  const values = [];

  if (filters.channel) {
    values.push(filters.channel);
    conditions.push(`channel = $${values.length}`);
  }
  if (filters.fund_type) {
    values.push(filters.fund_type);
    conditions.push(`fund_type = $${values.length}`);
  }

  let startDate = filters.start_date;
  let endDate = filters.end_date;
  const now = new Date();
  if (filters.period === 'custom' || startDate || endDate) {
    const range = normalizePenerimaanDateRange({ period: filters.period, start_date: startDate, end_date: endDate });
    startDate = range.start;
    endDate = range.end;
  } else if (['7d', '30d', '1y'].includes(filters.period)) {
    startDate = getPeriodStart(filters.period, now);
    endDate = now.toISOString().slice(0, 10);
  } else if (filters.period) {
    const error = new Error('Periode penerimaan tidak valid.');
    error.status = 422;
    error.code = 'INVALID_PENERIMAAN_PERIOD';
    throw error;
  }

  if (startDate) {
    values.push(`${String(startDate).slice(0, 10)}T00:00:00.000Z`);
    conditions.push(`transaction_date >= $${values.length}`);
  }
  if (endDate) {
    values.push(`${String(endDate).slice(0, 10)}T23:59:59.999Z`);
    conditions.push(`transaction_date <= $${values.length}`);
  }

  const whereSql = `WHERE ${conditions.join(' AND ')}`;
  const rows = await db.all(
    `SELECT id, CAST(amount AS TEXT) AS amount, fund_type, transaction_date, channel FROM penerimaan_transactions ${whereSql}`,
    values
  );

  let totalCents = 0n;
  const fundMap = new Map();

  for (const tx of rows) {
    const cents = BigInt(toCanonicalRupiahString(tx.amount));
    totalCents += cents;
    const ft = tx.fund_type || 'zakat_maal';
    fundMap.set(ft, (fundMap.get(ft) || 0n) + cents);
  }

  const byFundType = {};
  for (const [ft, cents] of fundMap.entries()) {
    byFundType[ft] = cents.toString();
    if (ft === 'zakat_maal' || ft === 'zakat_fitrah' || ft === 'zakat_profesi') {
      const cur = BigInt(byFundType.zakat || '0');
      const sum = cur + cents;
      byFundType.zakat = sum.toString();
    }
  }

  const fundBreakdown = Array.from(fundMap.entries()).map(([fund_type, cents]) => ({
    fund_type,
    amount: cents.toString(),
    amount_cents: cents.toString(),
  }));

  const totalAmount = totalCents.toString();
  const currentTimestamp = new Date().toISOString();

  return {
    total_posted_amount: totalAmount,
    total_posted_amount_cents: totalCents.toString(),
    total_posted_count: rows.length,
    total_available_funds: totalAmount,
    total_available_funds_cents: totalCents.toString(),
    freshness_timestamp: currentTimestamp,
    provenance: 'penerimaan_transactions(status=Posted)',
    by_fund_type: byFundType,
    fund_breakdown: fundBreakdown,
    last_updated_at: currentTimestamp,
  };
}
