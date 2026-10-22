import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportPDFModal } from './ExportPDFModal';

const { generateLaporan, exportLaporan } = vi.hoisted(() => ({
  generateLaporan: vi.fn(),
  exportLaporan: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({ api: { generateLaporan, exportLaporan } }));

describe('ExportPDFModal', () => {
  beforeEach(() => {
    generateLaporan.mockReset().mockResolvedValue({ success: true });
    exportLaporan.mockReset().mockResolvedValue(new Blob(['pdf']));
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:report'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('creates a persisted report before exporting the real PDF and reports success', async () => {
    const click = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
    render(<ExportPDFModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /unduh pdf/i }));

    await waitFor(() => expect(exportLaporan).toHaveBeenCalledTimes(1));
    const report = generateLaporan.mock.calls[0]![0];
    expect(report.id).toMatch(/^lap-ui-/);
    expect(exportLaporan.mock.calls[0]![0]).toBe(report.id);
    expect(exportLaporan.mock.calls[0]![1]).toBe('pdf');
    expect(click).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent(/berhasil disiapkan/i);
  });

  it('shows API failures and does not report a successful download', async () => {
    generateLaporan.mockRejectedValueOnce(new Error('Layanan laporan tidak tersedia.'));
    render(<ExportPDFModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /unduh pdf/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Layanan laporan tidak tersedia.');
    expect(exportLaporan).not.toHaveBeenCalled();
  });
});
