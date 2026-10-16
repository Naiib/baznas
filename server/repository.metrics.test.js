import test from 'node:test';
import assert from 'node:assert/strict';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { newDb, DataType } from 'pg-mem';
import * as repository from './repository.js';

const NOW = new Date('2026-09-06T12:00:00Z');

// Never call getDb/initDb: both can open persisted databases and initDb seeds data.
async function fixture(t, engine = 'sqlite') {
  let db;
  if (engine === 'postgres') {
    const memory = newDb();
    // pg-mem lacks PostgreSQL's native substr; keep the SQL aggregation real.
    memory.public.registerFunction({ name: 'substr', args: [DataType.text, DataType.integer, DataType.integer], returns: DataType.text,
      implementation: (value, start, length) => value.slice(start - 1, start - 1 + length) });
    memory.public.registerFunction({ name: 'nullif', args: [DataType.text, DataType.text], returns: DataType.text,
      implementation: (value, other) => value === other ? null : value });
    const { Pool } = memory.adapters.createPg();
    const pool = new Pool();
    db = {
      isPg: true,
      get: async (sql, args = []) => (await pool.query(sql, args)).rows[0],
      all: async (sql, args = []) => (await pool.query(sql, args)).rows,
      run: (sql, args = []) => pool.query(sql, args),
      exec: sql => pool.query(sql),
    };
    t.after(() => pool.end());
  } else {
    const memory = await open({ filename: ':memory:', driver: sqlite3.Database });
    const adapt = sql => sql.replace(/\$\d+/g, '?').replace(/ILIKE/gi, 'LIKE');
    db = {
      isPg: false,
      get: (sql, args = []) => memory.get(adapt(sql), args),
      all: (sql, args = []) => memory.all(adapt(sql), args),
      run: (sql, args = []) => memory.run(adapt(sql), args),
      exec: sql => memory.exec(sql),
    };
    t.after(() => memory.close());
  }
  await db.exec(`
    CREATE TABLE mustahik (
      id INTEGER PRIMARY KEY, name TEXT, file_no TEXT, nik TEXT, kecamatan TEXT,
      status TEXT, recommended_amount NUMERIC, approved_amount NUMERIC,
      beneficiary_count INTEGER, desil_score INTEGER, asnaf TEXT, program TEXT,
      disbursement_date TEXT, received_date TEXT, created_at TEXT
    );
    CREATE TABLE activity_logs (id INTEGER PRIMARY KEY, mustahik_id INTEGER, created_at TEXT);
    CREATE TABLE reports (
      id TEXT PRIMARY KEY, category TEXT, period TEXT, title TEXT, description TEXT,
      scope TEXT, status TEXT, metrics_json TEXT, updated_at TEXT
    );
  `);
  let nextId = 1;
  const insertMustahik = async (overrides = {}) => {
    const row = {
      id: nextId++, status: 'Penyaluran Selesai', approved_amount: 1_000_000,
      beneficiary_count: 2, asnaf: 'Fakir', program: 'Tangerang Cerdas',
      disbursement_date: '2026-09-06', received_date: '2025-01-01', created_at: '2025-01-01',
      ...overrides,
    };
    await db.run(`INSERT INTO mustahik (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(row));
  };
  const insertReport = async (id, period, category = 'Ringkasan', status = 'Siap diekspor', updatedAt = '2026-09-06') => {
    await db.run('INSERT INTO reports (id, period, category, status, title, metrics_json, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, period, category, status, id, '{"totalRealisasi":999999999}', updatedAt]);
  };
  return { db, insertMustahik, insertReport };
}

for (const engine of ['sqlite', 'postgres']) {
  test(`${engine}: empty kecamatan aggregate has no fabricated operational values`, async t => {
    const { db } = await fixture(t, engine);
    const result = await repository.getPenyaluranByKecamatan(db);

    assert.deepEqual(result, []);
  });

  test(`${engine}: zero-valued kecamatan rows retain zero values and no synthetic labels`, async t => {
    const { db, insertMustahik } = await fixture(t, engine);
    await insertMustahik({
      kecamatan: 'Cipondoh',
      approved_amount: 0,
      recommended_amount: 0,
      beneficiary_count: 0,
      desil_score: 1,
      program: null,
      asnaf: null,
    });

    const result = await repository.getPenyaluranByKecamatan(db);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'cipondoh');
    assert.equal(result[0].name, 'Cipondoh');
    assert.equal(result[0].totalMustahik, 1);
    assert.equal(result[0].totalDisalurkan, 0);
    assert.equal(result[0].desil1Count, 1);
    assert.equal(result[0].topProgram, undefined);
    assert.equal(result[0].dominantAsnaf, undefined);
    assert.equal(result[0].urgencyLevel, 'Rendah');
    assert.equal(result[0].pilarBreakdown, undefined);
    assert.ok(result[0].coordinates);
    assert.ok(result[0].kelurahanList);
  });

  test(`${engine}: kecamatan aggregates include only realized rows with disbursement evidence`, async t => {
    const { db, insertMustahik } = await fixture(t, engine);
    await insertMustahik({
      kecamatan: 'Cipondoh', status: 'Penyaluran Selesai', disbursement_date: '2026-09-06',
      approved_amount: 10_000_000, beneficiary_count: 2, desil_score: 1,
      program: 'Real Program', asnaf: 'Real Asnaf',
    });
    await insertMustahik({
      kecamatan: 'Cipondoh', status: 'Diajukan', disbursement_date: '2026-09-06',
      approved_amount: 20_000_000, beneficiary_count: 5, desil_score: 1,
      program: 'Pending Program', asnaf: 'Fakir',
    });
    await insertMustahik({
      kecamatan: 'Cipondoh', status: 'Ditolak', disbursement_date: '2026-09-06',
      approved_amount: 30_000_000, beneficiary_count: 7, desil_score: 1,
      program: 'Rejected Program', asnaf: 'Miskin',
    });
    await insertMustahik({
      kecamatan: 'Cipondoh', status: 'Disetujui', disbursement_date: null,
      approved_amount: 40_000_000, beneficiary_count: 11, desil_score: 1,
      program: 'Undisbursed Program', asnaf: 'Fisabilillah',
    });

    const result = await repository.getPenyaluranByKecamatan(db);
    assert.deepEqual(result.map(({ totalMustahik, totalDisalurkan, desil1Count, topProgram, dominantAsnaf }) => ({
      totalMustahik, totalDisalurkan, desil1Count, topProgram, dominantAsnaf,
    })), [{
      totalMustahik: 1,
      totalDisalurkan: 10_000_000,
      desil1Count: 1,
      topProgram: 'Real Program',
      dominantAsnaf: 'Real Asnaf',
    }]);
  });

  test(`${engine}: empty overview has zero totals and no fabricated chart rows`, async t => {
    const { db } = await fixture(t, engine);
    const result = await repository.getPenyaluranOverview('30d', db, NOW);
    assert.equal(result.dataStatus, 'empty');
    assert.equal(result.metrics.totalPenyaluran, 0);
    assert.equal(result.metrics.totalJiwa, 0);
    assert.equal(result.metrics.targetRkat, 0);
    assert.equal(result.metrics.penyaluranBulanIni, 0);
    assert.deepEqual(result.monthlyTrend, []);
    assert.deepEqual(result.asnafBreakdown, []);
    assert.deepEqual(result.programImpact, []);
    assert.equal(result.actionRail.slaCounts.lewatSla, 0);
    assert.equal(result.actionRail.slaCounts.dokumenKurang, 0);
  });

  test(`${engine}: realized aggregates share approval, disbursement date and period boundaries`, async t => {
    const { db, insertMustahik } = await fixture(t, engine);
    await insertMustahik();
    await insertMustahik({ disbursement_date: '2026-08-30', approved_amount: 2_000_000, beneficiary_count: 3, program: 'Custom Program', asnaf: null });
    await insertMustahik({ disbursement_date: '2026-08-29', approved_amount: 4_000_000 });
    await insertMustahik({ disbursement_date: '2025-09-05', approved_amount: 5_000_000 });
    await insertMustahik({ disbursement_date: '2026-09-07', approved_amount: 8_000_000 });
    await insertMustahik({ disbursement_date: null, approved_amount: 9_000_000 });
    await insertMustahik({ disbursement_date: '', approved_amount: 9_000_000 });
    await insertMustahik({ status: 'Ditolak', approved_amount: 10_000_000 });
    await insertMustahik({ status: 'Diajukan', approved_amount: 11_000_000 });
    const result = await repository.getPenyaluranOverview('7d', db, NOW);
    assert.equal(result.dataStatus, 'ready');
    assert.equal(result.period, '7d');
    assert.equal(result.metrics.totalPenyaluran, 3_000_000);
    assert.equal(result.metrics.totalMustahik, 2);
    assert.equal(result.metrics.totalJiwa, 5);
    assert.equal(result.metrics.penyaluranBulanIni, 1_000_000);
    assert.deepEqual(result.monthlyTrend.map(r => [r.month, r.realisasi, r.mustahik]), [
      ['2026-08', 0.002, 1], ['2026-09', 0.001, 1],
    ]);
    assert.equal(result.asnafBreakdown.reduce((sum, r) => sum + r.amount, 0), 3_000_000);
    assert.equal(result.programImpact.reduce((sum, r) => sum + r.realizedAmount, 0), 3_000_000);
    assert.equal(result.programImpact.reduce((sum, r) => sum + r.beneficiariesCount, 0), 5);
    assert.equal((await repository.getPenyaluranOverview('30d', db, NOW)).metrics.totalPenyaluran, 7_000_000);
    assert.equal((await repository.getPenyaluranOverview('1y', db, NOW)).metrics.totalPenyaluran, 7_000_000);
  });

  test(`${engine}: approved zero disbursement stays zero and retains ready provenance`, async t => {
    const { db, insertMustahik } = await fixture(t, engine);
    await insertMustahik({ approved_amount: 0, beneficiary_count: 0 });
    const result = await repository.getPenyaluranOverview('7d', db, NOW);
    assert.equal(result.dataStatus, 'ready');
    assert.equal(result.metrics.totalPenyaluran, 0);
    assert.equal(result.metrics.totalJiwa, 0);
    assert.equal(result.programImpact[0].realizedAmount, 0);
  });

  test(`${engine}: persisted funding stage aliases count only with a disbursement date`, async t => {
    const { db, insertMustahik } = await fixture(t, engine);
    for (const status of ['Pengajuan Dana (FPD)', 'Pengajuan Dana (PPD)', 'Disetujui', 'Selesai']) {
      await insertMustahik({ status });
      await insertMustahik({ status, disbursement_date: null });
    }
    const result = await repository.getPenyaluranOverview('7d', db, NOW);
    assert.equal(result.metrics.totalPenyaluran, 4_000_000);
    assert.equal(result.metrics.totalMustahik, 4);
  });

  test(`${engine}: empty reports have empty provenance and database-only KPIs`, async t => {
    const { db } = await fixture(t, engine);
    const result = await repository.getLaporanList({}, db, NOW);
    assert.equal(result.dataStatus, 'empty');
    assert.deepEqual(result.reports, []);
    assert.deepEqual(result.programAllocation, []);
    assert.deepEqual(result.asnafDistribution, []);
    assert.ok(result.kpis.every(k => k.rawValue === 0));
  });

  test(`${engine}: report month filters exclude other periods and reconcile financial distributions`, async t => {
    const { db, insertMustahik, insertReport } = await fixture(t, engine);
    await insertMustahik({ disbursement_date: '2026-08-31' });
    await insertMustahik({ disbursement_date: '2026-08-01', approved_amount: 2_000_000, program: 'Custom Program', asnaf: 'Miskin', beneficiary_count: 3 });
    await insertMustahik({ disbursement_date: '2026-09-01', approved_amount: 5_000_000 });
    await insertMustahik({ disbursement_date: '2026-08-15', status: 'Ditolak' });
    await insertReport('aug-summary', 'Agustus 2026');
    await insertReport('aug-program', '2026-08', 'Program & Pilar', 'Arsip');
    await insertReport('sep-summary', 'September 2026');
    for (const period of ['2026-08', 'Agustus 2026']) {
      const result = await repository.getLaporanList({ period }, db, NOW);
      assert.equal(result.dataStatus, 'ready');
      assert.equal(result.count, 2);
      assert.equal(result.kpis.find(k => k.key === 'totalRealisasi').rawValue, 3_000_000);
      assert.equal(result.kpis.find(k => k.key === 'totalMustahik').rawValue, 2);
      assert.equal(result.kpis.find(k => k.key === 'laporanSiapEkspor').rawValue, 1);
      assert.equal(result.programAllocation.reduce((sum, r) => sum + r.amount, 0), 3_000_000);
      assert.equal(result.asnafDistribution.reduce((sum, r) => sum + r.count, 0), 5);
      assert.equal(result.categoryCounts.Ringkasan, 1);
    }
    const filtered = await repository.getLaporanList({ period: '2026-08', category: 'per program', search: 'aug-program' }, db, NOW);
    assert.equal(filtered.count, 1);
    assert.equal(filtered.reports[0].category, 'Per Program');
    assert.equal(filtered.kpis.find(k => k.key === 'totalRealisasi').rawValue, 3_000_000);
    const empty = await repository.getLaporanList({ period: '2024-01' }, db, NOW);
    assert.equal(empty.dataStatus, 'empty');
    assert.equal(empty.count, 0);
    assert.deepEqual(empty.programAllocation, []);
  });

  test(`${engine}: rolling report periods normalize Indonesian dates and reject invalid dates`, async t => {
    const { db, insertReport } = await fixture(t, engine);
    for (const [id, date] of [
      ['local-inside', '25 Agu 2026'], ['local-start', '7 Agustus 2026'],
      ['local-end', '6 Sep 2026'], ['local-old', '6 Agu 2026'],
      ['local-future', '7 September 2026'], ['local-invalid', '31 Aguu 2026'],
      ['local-overflow', '32 Agu 2026'], ['missing-date', null],
    ]) await insertReport(id, 'Agustus 2026', 'Ringkasan', 'Siap diekspor', date);
    const result = await repository.getLaporanList({ period: '30d' }, db, NOW);
    assert.deepEqual(result.reports.map(r => r.id).sort(), ['local-end', 'local-inside', 'local-start']);
    assert.equal(result.categoryCounts.Ringkasan, 3);
    assert.equal(result.kpis.find(k => k.key === 'totalLaporan').rawValue, 3);
    assert.equal(result.kpis.find(k => k.key === 'laporanSiapEkspor').rawValue, 3);
  });

  test(`${engine}: rolling report periods include the entire UTC end day for ISO timestamps`, async t => {
    const { db, insertReport } = await fixture(t, engine);
    for (const [id, date] of [
      ['iso-start', '2026-08-30'], ['iso-end', '2026-09-06T23:59:59.999Z'],
      ['iso-space', '2026-09-06 23:59:59'], ['iso-offset-inside', '2026-09-07T00:30:00+07:00'],
      ['iso-old', '2026-08-29T23:59:59.999Z'], ['iso-future', '2026-09-07T00:00:00Z'],
      ['iso-offset-future', '2026-09-06T23:00:00-03:00'], ['iso-invalid', '2026-08-32'],
    ]) await insertReport(id, 'September 2026', 'Ringkasan', 'Siap diekspor', date);
    const result = await repository.getLaporanList({ period: '7d' }, db, NOW);
    assert.deepEqual(result.reports.map(r => r.id).sort(), ['iso-end', 'iso-offset-inside', 'iso-space', 'iso-start']);
    assert.equal(result.count, 4);
    assert.equal(result.categoryCounts.Ringkasan, 4);
  });
}

test('period starts use UTC days and invalid periods are rejected before opening a database', async () => {
  assert.equal(repository.getPeriodStart('7d', NOW), '2026-08-30');
  assert.equal(repository.getPeriodStart('30d', NOW), '2026-08-07');
  assert.equal(repository.getPeriodStart('1y', NOW), '2025-09-06');
  assert.throws(() => repository.getPeriodStart('all', NOW), /Periode tidak valid/);
  await assert.rejects(repository.getPenyaluranOverview('invalid'), /Periode tidak valid/);
  await assert.rejects(repository.getLaporanList({ period: '2026-13' }), /Periode tidak valid/);
});
