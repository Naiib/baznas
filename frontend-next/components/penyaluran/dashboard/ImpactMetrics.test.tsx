import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getDashboardData } from './dashboard-data';
import { ImpactMetrics } from './ImpactMetrics';

describe('ImpactMetrics', () => {
  it('shows the V1 realization KPI and its target progress', () => {
    render(<ImpactMetrics data={getDashboardData('30d')} />);

    expect(screen.getByText(/Realisasi ZIS/)).toBeInTheDocument();
    expect(screen.getByText('Capaian target RKAT')).toBeInTheDocument();
    expect(screen.getByText('83%')).toBeInTheDocument();
  });
});
