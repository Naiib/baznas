/**
 * BAZNAS Data Center - Penerimaan Report Query Contract & Filter Normalizer
 * Single source of truth for report filters, summary KPIs, preview data, and export jobs.
 */

/**
 * Normalizes raw HTTP / function arguments into a canonical report filter object.
 *
 * @param {Object} raw
 * @returns {Object} Canonical report filters
 */
export function normalizeReportFilters(raw = {}) {
  const f = raw || {};

  // 1. Period / Dates
  let period = f.period ? String(f.period).trim().toLowerCase() : undefined;
  let startDate = f.start_date ? String(f.start_date).trim() : undefined;
  let endDate = f.end_date ? String(f.end_date).trim() : undefined;
  const explicitStartDate = Boolean(startDate);
  const explicitEndDate = Boolean(endDate);

  if (!startDate && period && period !== 'custom') {
    const now = new Date();
    if (period === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    } else if (period === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    } else if (period === '1y') {
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }
  }

  const hasStart = Boolean(startDate);
  const hasEnd = Boolean(endDate);
  if (period === 'custom' && (!hasStart || !hasEnd)) {
    const err = new Error('Periode kustom harus memiliki tanggal mulai dan tanggal akhir.');
    err.status = 422;
    err.code = 'INVALID_PENERIMAAN_PERIOD';
    throw err;
  }
  const presetPeriod = ['7d', '30d', '1y'].includes(period);
  if (period === 'custom' || explicitStartDate || explicitEndDate) {
    const parseDateOnly = (value, label) => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
      const year = match ? Number(match[1]) : 0;
      const month = match ? Number(match[2]) : 0;
      const day = match ? Number(match[3]) : 0;
      const valid = Boolean(match) && year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 &&
        day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
      if (!valid) {
        const err = new Error(`Tanggal ${label} tidak valid. Gunakan format YYYY-MM-DD.`);
        err.status = 422;
        err.code = 'INVALID_PENERIMAAN_PERIOD';
        throw err;
      }
      return String(value);
    };
    if (period === 'custom' && (!hasStart || !hasEnd)) {
      const err = new Error('Rentang periode harus memiliki tanggal mulai dan tanggal akhir.');
      err.status = 422;
      err.code = 'INVALID_PENERIMAAN_PERIOD';
      throw err;
    }
    if (hasStart) startDate = parseDateOnly(startDate, 'mulai');
    if (hasEnd) endDate = parseDateOnly(endDate, 'akhir');
    if (hasStart && hasEnd && startDate > endDate) {
      const err = new Error('Tanggal mulai periode tidak boleh melewati tanggal akhir.');
      err.status = 422;
      err.code = 'INVALID_PENERIMAAN_PERIOD';
      throw err;
    }
  }

  // 2. Channel & Fund Type
  const channel = f.channel ? String(f.channel).trim().toLowerCase() : undefined;
  const fund_type = f.fund_type ? String(f.fund_type).trim().toLowerCase() : undefined;

  // 3. Exact account_id (matched to t.account_id)
  let account_id = undefined;
  if (f.account_id !== undefined && f.account_id !== null && f.account_id !== '') {
    const s = String(f.account_id).trim();
    if (!/^\d+$/.test(s)) {
      const err = new Error('Field "account_id" harus berupa integer positif.');
      err.status = 400;
      throw err;
    }
    const parsed = parseInt(s, 10);
    if (parsed <= 0) {
      const err = new Error('Field "account_id" harus lebih besar dari 0.');
      err.status = 400;
      throw err;
    }
    account_id = parsed;
  }

  // 4. Exact numeric program_id and distinct free-text program_search
  let program_id = undefined;
  if (f.program_id !== undefined && f.program_id !== null && f.program_id !== '') {
    const s = String(f.program_id).trim();
    if (!/^\d+$/.test(s)) {
      const err = new Error('Field "program_id" harus berupa integer positif.');
      err.status = 400;
      throw err;
    }
    const parsed = parseInt(s, 10);
    if (parsed <= 0) {
      const err = new Error('Field "program_id" harus lebih besar dari 0.');
      err.status = 400;
      throw err;
    }
    program_id = parsed;
  }
  const program_search = f.program_search ? String(f.program_search).trim() : undefined;

  // 5. Muzakki identifier
  let muzakki_id = undefined;
  if (f.muzakki_id !== undefined && f.muzakki_id !== null && f.muzakki_id !== '') {
    const s = String(f.muzakki_id).trim();
    if (!/^\d+$/.test(s)) {
      const err = new Error('Field "muzakki_id" harus berupa integer positif.');
      err.status = 400;
      throw err;
    }
    const parsed = parseInt(s, 10);
    if (parsed <= 0) {
      const err = new Error('Field "muzakki_id" harus lebih besar dari 0.');
      err.status = 400;
      throw err;
    }
    muzakki_id = parsed;
  }

  // 6. Source mode (manual / digital)
  let is_manual = undefined;
  if (f.mode !== undefined && f.mode !== null && f.mode !== '') {
    const m = String(f.mode).trim().toLowerCase();
    if (m === 'manual') {
      is_manual = 1;
    } else if (m === 'digital') {
      is_manual = 0;
    } else {
      const err = new Error('Field "mode" tidak valid. Gunakan "manual" atau "digital".');
      err.status = 400;
      throw err;
    }
  } else if (f.is_manual !== undefined && f.is_manual !== null && f.is_manual !== '') {
    if (typeof f.is_manual === 'boolean') {
      is_manual = f.is_manual ? 1 : 0;
    } else if (f.is_manual === 1 || f.is_manual === 0) {
      is_manual = f.is_manual;
    } else {
      const s = String(f.is_manual).trim().toLowerCase();
      if (s === 'true' || s === '1') is_manual = 1;
      else if (s === 'false' || s === '0') is_manual = 0;
      else {
        const err = new Error('Field "is_manual" harus berupa boolean atau 1/0.');
        err.status = 400;
        throw err;
      }
    }
  }

  // 7. Exception flag
  let is_flagged = undefined;
  if (f.is_flagged !== undefined && f.is_flagged !== null && f.is_flagged !== '') {
    if (typeof f.is_flagged === 'boolean') {
      is_flagged = f.is_flagged ? 1 : 0;
    } else if (f.is_flagged === 1 || f.is_flagged === 0) {
      is_flagged = f.is_flagged;
    } else {
      const s = String(f.is_flagged).trim().toLowerCase();
      if (s === 'true' || s === '1') is_flagged = 1;
      else if (s === 'false' || s === '0') is_flagged = 0;
      else {
        const err = new Error('Field "is_flagged" harus berupa boolean atau 1/0.');
        err.status = 400;
        throw err;
      }
    }
  }

  // 8. Reconciliation status
  let reconciliation_status = undefined;
  if (f.reconciliation_status !== undefined && f.reconciliation_status !== null && f.reconciliation_status !== '') {
    const r = String(f.reconciliation_status).trim().toLowerCase();
    if (!['pending', 'reconciled', 'posted'].includes(r)) {
      const err = new Error('Field "reconciliation_status" harus bernilai "pending", "reconciled", atau "posted".');
      err.status = 400;
      throw err;
    }
    reconciliation_status = r;
  }

  // 9. View (normal, exceptions, reconciliation, audit)
  let view = 'normal';
  if (f.view !== undefined && f.view !== null && f.view !== '') {
    const v = String(f.view).trim().toLowerCase();
    if (!['normal', 'exceptions', 'reconciliation', 'audit'].includes(v)) {
      const err = new Error('Field "view" harus bernilai "normal", "exceptions", "reconciliation", atau "audit".');
      err.status = 400;
      throw err;
    }
    view = v;
  }

  // 10. Free-text search
  const search = (f.search || f.muzakki_search) ? String(f.search || f.muzakki_search).trim() : undefined;

  // 11. Deterministic sort and pagination
  const limit = f.limit !== undefined && f.limit !== null ? Math.min(Math.max(1, parseInt(f.limit, 10) || 50), 1000) : 50;
  const offset = f.offset !== undefined && f.offset !== null ? Math.max(0, parseInt(f.offset, 10) || 0) : 0;

  const ALLOWED_SORT_COLUMNS = [
    'transaction_date',
    'amount',
    'created_at',
    'id',
    'status',
    'channel',
    'fund_type',
    'muzakki_name',
    'action',
    'entity_type',
    'actor_name',
  ];
  let sort_by = 'transaction_date';
  if (f.sort_by !== undefined && f.sort_by !== null && f.sort_by !== '') {
    const s = String(f.sort_by).trim().toLowerCase();
    if (!ALLOWED_SORT_COLUMNS.includes(s)) {
      const err = new Error(`Field "sort_by" tidak valid: "${f.sort_by}". Kolom yang diizinkan: ${ALLOWED_SORT_COLUMNS.join(', ')}.`);
      err.status = 400;
      throw err;
    }
    sort_by = s;
  }

  let sort_dir = 'DESC';
  if (f.sort_dir !== undefined && f.sort_dir !== null && f.sort_dir !== '') {
    const d = String(f.sort_dir).trim().toUpperCase();
    if (!['ASC', 'DESC'].includes(d)) {
      const err = new Error('Field "sort_dir" harus berupa "ASC" atau "DESC".');
      err.status = 400;
      throw err;
    }
    sort_dir = d;
  }

  return {
    period,
    start_date: startDate,
    end_date: endDate,
    channel,
    fund_type,
    account_id,
    program_id,
    program_search,
    muzakki_id,
    is_manual,
    is_flagged,
    reconciliation_status,
    view,
    search,
    limit,
    offset,
    sort_by,
    sort_dir,
  };
}

/**
 * Builds parameterized SQL conditions for report queries.
 *
 * @param {Object} rawFilters
 * @param {string} [tableAlias='']
 * @returns {{ whereSql: string, values: any[], filters: Object }}
 */
export function buildPenerimaanReportFilterQuery(rawFilters = {}, tableAlias = '') {
  const filters = normalizeReportFilters(rawFilters);
  const p = tableAlias ? `${tableAlias}.` : '';
  const conditions = [];
  const values = [];

  const add = (cond, val) => {
    values.push(val);
    conditions.push(cond.replace('?', `$${values.length}`));
  };

  // Base status exclusion unless audit view
  if (filters.view !== 'audit') {
    conditions.push(`${p}status NOT IN ('Dibatalkan', 'Ditolak', 'Reversed')`);
  }

  // View specific conditions
  if (filters.view === 'exceptions') {
    conditions.push(`(${p}is_flagged = 1 OR ${p}is_manual = 1 OR ${p}status IN ('Data Tidak Lengkap', 'Perlu Klarifikasi', 'Duplikat', 'Menunggu Approval'))`);
  } else if (filters.view === 'reconciliation') {
    conditions.push(`${p}status IN ('Menunggu Rekonsiliasi', 'Terekonsiliasi', 'Posted')`);
  }

  // Reconciliation status filter
  if (filters.reconciliation_status === 'pending') {
    conditions.push(`${p}status = 'Menunggu Rekonsiliasi'`);
  } else if (filters.reconciliation_status === 'reconciled') {
    conditions.push(`${p}status = 'Terekonsiliasi'`);
  } else if (filters.reconciliation_status === 'posted') {
    conditions.push(`${p}status = 'Posted'`);
  }

  if (filters.channel) add(`${p}channel = ?`, filters.channel);
  if (filters.fund_type) add(`${p}fund_type = ?`, filters.fund_type);

  // Exact account_id matched against t.account_id
  if (filters.account_id !== undefined && filters.account_id !== null) {
    add(`${p}account_id = ?`, filters.account_id);
  }

  // Exact numeric program_id
  if (filters.program_id !== undefined && filters.program_id !== null) {
    add(`${p}program_id = ?`, filters.program_id);
  }

  // Free-text program_search
  if (filters.program_search) {
    values.push(`%${filters.program_search}%`);
    conditions.push(`${p}program_name LIKE $${values.length}`);
  }

  if (filters.muzakki_id !== undefined && filters.muzakki_id !== null) {
    add(`${p}muzakki_id = ?`, filters.muzakki_id);
  }

  if (filters.is_manual !== undefined && filters.is_manual !== null) {
    add(`${p}is_manual = ?`, filters.is_manual);
  }

  if (filters.is_flagged !== undefined && filters.is_flagged !== null) {
    add(`${p}is_flagged = ?`, filters.is_flagged);
  }

  // Period / Date filters
  if (filters.start_date) {
    add(`${p}transaction_date >= ?`, `${String(filters.start_date).slice(0, 10)}T00:00:00.000Z`);
  }
  if (filters.end_date) {
    add(`${p}transaction_date <= ?`, `${String(filters.end_date).slice(0, 10)}T23:59:59.999Z`);
  }

  // Free-text search across muzakki_name, transaction_number, receipt_number
  if (filters.search) {
    const q = `%${filters.search}%`;
    values.push(q);
    const p1 = `$${values.length}`;
    values.push(q);
    const p2 = `$${values.length}`;
    values.push(q);
    const p3 = `$${values.length}`;
    conditions.push(`(${p}muzakki_name LIKE ${p1} OR ${p}transaction_number LIKE ${p2} OR ${p}receipt_number LIKE ${p3})`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereSql, values, filters };
}

/**
 * Builds parameterized SQL query for audit report view from penerimaan_audit_events.
 *
 * @param {Object} rawFilters
 * @returns {{ whereSql: string, values: any[], filters: Object }}
 */
export function buildAuditReportQuery(rawFilters = {}) {
  const filters = normalizeReportFilters(rawFilters);
  const conditions = [];
  const values = [];

  const add = (cond, val) => {
    values.push(val);
    conditions.push(cond.replace('?', `$${values.length}`));
  };

  if (filters.start_date) {
    add(`created_at >= ?`, `${String(filters.start_date).slice(0, 10)}T00:00:00.000Z`);
  }
  if (filters.end_date) {
    add(`created_at <= ?`, `${String(filters.end_date).slice(0, 10)}T23:59:59.999Z`);
  }

  if (filters.search) {
    const q = `%${filters.search}%`;
    values.push(q);
    const p1 = `$${values.length}`;
    values.push(q);
    const p2 = `$${values.length}`;
    values.push(q);
    const p3 = `$${values.length}`;
    values.push(q);
    const p4 = `$${values.length}`;
    conditions.push(`(entity_type LIKE ${p1} OR entity_id LIKE ${p2} OR action LIKE ${p3} OR actor_name LIKE ${p4})`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereSql, values, filters };
}
