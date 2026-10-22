import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContractBoundaryNotice } from './ContractBoundaryNotice';

describe('ContractBoundaryNotice', () => {
  it('announces a specific blocked capability accessibly without implying persistence', () => {
    render(
      <ContractBoundaryNotice title="F-BPP/19 · verifikasi administrasi">
        Endpoint belum mendukung verifikasi.
      </ContractBoundaryNotice>
    );

    expect(screen.getByRole('status', { name: 'Status blocked: F-BPP/19 · verifikasi administrasi' })).toBeInTheDocument();
    expect(screen.getByText('Endpoint belum mendukung verifikasi.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /simpan|setujui|cetak/i })).not.toBeInTheDocument();
  });
});
