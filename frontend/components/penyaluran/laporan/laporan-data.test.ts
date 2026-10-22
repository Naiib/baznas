import { describe, expect, it } from 'vitest';

import {
  ASNAF_DISTRIBUTION,
  PROGRAM_ALLOCATION,
  REPORT_CATEGORIES,
  REPORT_KPIS,
  REPORT_READINESS,
  REPORT_RECORDS,
} from './laporan-data';

describe('laporan report library demo data', () => {
  it('provides five monthly report records for the active library', () => {
    expect(REPORT_RECORDS).toHaveLength(5);
    expect(REPORT_RECORDS.every((report) => report.period === 'Agustus 2026')).toBe(true);
  });

  it('provides four summary KPIs for the active month', () => {
    expect(REPORT_KPIS).toHaveLength(4);
    expect(REPORT_KPIS.map((kpi) => kpi.label)).toEqual([
      'Dana tersalurkan',
      'Mustahik terbantu',
      'Program aktif',
      'Kecamatan terjangkau',
    ]);
  });

  it('covers every report category with an active-month report', () => {
    expect(REPORT_CATEGORIES).toHaveLength(5);
    expect(REPORT_CATEGORIES.map((category) => category.name)).toEqual([
      'Ringkasan',
      'Per Program',
      'Per Asnaf',
      'Per Kecamatan',
      'Audit & LPJ',
    ]);

    expect(new Set(REPORT_RECORDS.map((report) => report.category))).toEqual(
      new Set(REPORT_CATEGORIES.map((category) => category.name)),
    );
  });

  it('provides coherent program and asnaf insight distributions', () => {
    expect(PROGRAM_ALLOCATION).toHaveLength(5);
    expect(PROGRAM_ALLOCATION.reduce((total, item) => total + item.percentage, 0)).toBeCloseTo(100, 4);

    expect(ASNAF_DISTRIBUTION.length).toBeGreaterThan(0);
    expect(ASNAF_DISTRIBUTION.every((item) => item.percentage > 0 && item.value.length > 0)).toBe(true);
  });

  it('provides four report readiness checks', () => {
    expect(REPORT_READINESS).toHaveLength(4);
    expect(REPORT_READINESS.map((item) => item.status)).toContain('Perlu ditinjau');
  });
});
