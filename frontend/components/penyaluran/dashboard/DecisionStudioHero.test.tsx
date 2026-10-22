import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DecisionStudioHero } from './DecisionStudioHero';
import { getDashboardData } from './dashboard-data';

describe('DecisionStudioHero', () => {
  it('renders a compact operational hero without artificial full-height spacing', () => {
    render(<DecisionStudioHero data={getDashboardData('30d')} />);

    expect(screen.getByRole('heading', { name: 'Ruang kendali penyaluran' })).toBeInTheDocument();
    expect(screen.getByText('Capaian periode aktif')).toBeInTheDocument();
    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(screen.getByText('kecamatan terjangkau')).toBeInTheDocument();
    expect(screen.getByText('Prioritas hari ini')).toBeInTheDocument();
  });
});
