import { describe, expect, it } from 'vitest';
import { getDashboardData, adaptBackendOverviewToDashboardData } from './dashboard-data';

describe('getDashboardData', () => {
  it('returns a distinct operational summary for each selectable period', () => {
    const sevenDays = getDashboardData('7d');
    const thirtyDays = getDashboardData('30d');
    const oneYear = getDashboardData('1y');

    expect(sevenDays.summary.totalDisbursed).not.toBe(thirtyDays.summary.totalDisbursed);
    expect(thirtyDays.summary.totalDisbursed).not.toBe(oneYear.summary.totalDisbursed);
    expect(sevenDays.periodLabel).toBe('7 Hari');
    expect(oneYear.periodLabel).toBe('1 Tahun');
  });

  it('keeps asnaf composition complete and internally consistent', () => {
    const data = getDashboardData('30d');
    const composition = data.asnaf.reduce((total, item) => total + item.percentage, 0);

    expect(data.asnaf).toHaveLength(8);
    expect(composition).toBe(100);
    expect(data.asnaf.every((item) => item.amount > 0 && item.beneficiaries > 0)).toBe(true);
  });

  it('does not substitute demo totals when the overview is empty', () => {
    const dashboard = adaptBackendOverviewToDashboardData({ dataStatus: 'empty', metrics: { totalPenyaluran: 0 } }, '30d');
    expect(dashboard.summary.totalPenyaluran).toBe(0);
    expect(dashboard.dataStatus).toBe('empty');
  });
});
