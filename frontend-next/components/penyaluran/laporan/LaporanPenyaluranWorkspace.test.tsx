import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LaporanPenyaluranWorkspace } from './LaporanPenyaluranWorkspace';

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock('@/components/auth/AuthProvider', () => ({ useAuth }));

describe('LaporanPenyaluranWorkspace', () => {
  let downloaded: { href: string; filename: string }[];
  let exportRequests: { url: string; authorization: string | null }[];
  let exportResponse: Response;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_DEMO_MODE = 'true';
    downloaded = [];
    exportRequests = [];
    localStorage.setItem('baznas_auth_token', 'test-session-token');
    useAuth.mockReturnValue({ user: { role: 'penyaluran', level: 'staff' } });
    exportResponse = new Response('report content', { headers: { 'content-type': 'application/pdf' } });
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes('/laporan/export/')) {
        exportRequests.push({ url, authorization: new Headers(options?.headers).get('Authorization') });
        return exportResponse;
      }
      return new Response(JSON.stringify({ reports: [] }), { headers: { 'content-type': 'application/json' } });
    }));
    vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.stubGlobal('URL', class extends URL {
      static override createObjectURL = vi.fn(() => 'blob:report-download');
      static override revokeObjectURL = vi.fn();
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded.push({ href: this.href, filename: this.download });
    });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the library before a balanced insight grid', () => {
    render(<LaporanPenyaluranWorkspace />);

    expect(screen.getByRole('heading', { name: 'Library laporan' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Alokasi 5 pilar' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Komposisi asnaf' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kesiapan laporan' })).toBeInTheDocument();
    expect(screen.getByLabelText('Insight laporan')).toBeInTheDocument();
  });

  it('shows the matching per asnaf report after its category is selected', () => {
    render(<LaporanPenyaluranWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: /^per asnaf/i }));

    expect(screen.getByRole('heading', { name: 'Distribusi Penyaluran per Asnaf' })).toBeInTheDocument();
    expect(screen.queryByText('Rekapitulasi Penyaluran ZIS')).not.toBeInTheDocument();
  });

  it('filters the archive with the report search field', () => {
    render(<LaporanPenyaluranWorkspace />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari arsip laporan' }), { target: { value: 'LPJ' } });

    expect(screen.getByRole('heading', { name: 'LPJ Penyaluran & Kelengkapan Dokumen' })).toBeInTheDocument();
    expect(screen.queryByText('Rekapitulasi Penyaluran ZIS')).not.toBeInTheDocument();
  });

  it.each([
    ['PDF', 'Cetak Dokumen PDF', 'pdf'],
    ['Excel', 'Unduh Dokumen Excel', 'xlsx'],
  ])('downloads %s with session authorization and a Blob URL', async (_label, button, extension) => {
    render(<LaporanPenyaluranWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: `${button}: Rekapitulasi Penyaluran ZIS` }));

    await waitFor(() => expect(downloaded).toHaveLength(1));
    expect(exportRequests).toEqual([{ url: expect.stringContaining(`format=${extension}`), authorization: 'Bearer test-session-token' }]);
    expect(exportRequests[0]?.url).not.toContain('test-session-token');
    expect(downloaded[0]).toEqual({ href: 'blob:report-download', filename: `Rekapitulasi Penyaluran ZIS.${extension}` });
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob;
    // jsdom's Blob implementation on Node 24 does not expose Blob#text().
    // The browser-visible contract is the generated downloadable Blob itself.
    expect(Object.prototype.toString.call(blob)).toBe('[object Blob]');
    expect(blob.size).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveTextContent('Memulai unduhan');
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:report-download'));
  });

  it.each([
    [401, /masuk kembali/i],
    [403, /tidak memiliki izin/i],
    [500, /coba lagi/i],
  ])('shows a usable error for HTTP %s without downloading an error document', async (status, message) => {
    exportResponse = new Response(JSON.stringify({ message: 'Request rejected' }), {
      status, headers: { 'content-type': 'application/json' },
    });
    render(<LaporanPenyaluranWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Cetak Dokumen PDF: Rekapitulasi Penyaluran ZIS' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(message));
    expect(downloaded).toHaveLength(0);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('shows a retry error for a network failure', async () => {
    render(<LaporanPenyaluranWorkspace />);
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.click(screen.getByRole('button', { name: 'Cetak Dokumen PDF: Rekapitulasi Penyaluran ZIS' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/coba lagi/i));
    expect(downloaded).toHaveLength(0);
  });

  it('hides report export controls from surveyors', () => {
    useAuth.mockReturnValue({ user: { role: 'surveyor', level: 'staff' } });
    render(<LaporanPenyaluranWorkspace />);

    expect(screen.queryByRole('button', { name: /Cetak Dokumen PDF: Rekapitulasi Penyaluran ZIS/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Unduh Dokumen Excel: Rekapitulasi Penyaluran ZIS/i })).not.toBeInTheDocument();
  });

  it('auto-dismisses and allows dismissing feedback toast actions', () => {
    vi.useFakeTimers();
    render(<LaporanPenyaluranWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: /^per asnaf/i }));
    expect(screen.getByRole('status')).toHaveTextContent('Menampilkan laporan kategori Per Asnaf');

    fireEvent.click(screen.getByRole('button', { name: 'Tutup notifikasi' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole('button', { name: /^per program/i }));
    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
