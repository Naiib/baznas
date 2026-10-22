import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, apiFetch, ApiError } from './client';

describe('apiFetch client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('normalizes path and sends json headers', async () => {
    const mockResponse = { success: true, data: { count: 10 } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockResponse,
    });

    const res = await apiFetch('/api/test');
    expect(res).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('throws ApiError with normalized message on non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: false, message: 'Resource not found' }),
    });

    await expect(apiFetch('/api/notfound')).rejects.toThrow(ApiError);
  });

  it('submits a public application as multipart form data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: { id: 44, file_no: 'MST-202609-0044' } }),
    });

    const payload = new FormData();
    payload.append('name', 'Siti Aminah');
    await api.submitPublicApplication(payload);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/public/pengajuan'),
      expect.objectContaining({ method: 'POST', body: payload })
    );
  });

  it('downloads a public application letter as a PDF blob', async () => {
    const pdf = new Blob(['pdf'], { type: 'application/pdf' });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => pdf });

    const payload = { applicant_status: 'Perorangan' as const, name: 'Siti Aminah', address: 'Jl. Melati', request_title: 'Biaya sekolah' };
    await expect(api.downloadSuratPermohonan(payload)).resolves.toBe(pdf);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/public/surat-permohonan'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) })
    );
  });

  it('encodes a public tracking query in the request URL', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: { mustahik: { name: 'Siti Aminah' } } }),
    });

    await api.trackPublicApplication('MST 2026/1');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/public/lacak/MST%202026%2F1'),
      expect.anything()
    );
  });

  it('requests the transaction journal with supplied filters', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: [] }),
    });

    await api.getPenyaluranTransactions({ status: 'Penyaluran Selesai' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penyaluran/transaksi?status=Penyaluran+Selesai'),
      expect.anything()
    );
  });

  it('uses the master-data endpoint for operational configuration', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: [] }),
    });

    await api.getMasterData({ category: 'program' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penyaluran/master-data?category=program'),
      expect.anything()
    );
  });

  it('requests active master options for the public application form', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: [] }),
    });

    await api.getPublicMasterData('program');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/public/master-data?category=program'),
      expect.anything()
    );
  });

  it('requests immutable approval history for one mustahik', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: [] }),
    });

    await api.getApprovalDecisions(12);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/mustahik/12/approvals'),
      expect.anything()
    );
  });

  it('normalizes the top-level auth me response into the user object', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        user: { id: 7, name: 'Admin', email: 'admin@example.test', role: 'admin', level: 'ADMIN' },
      }),
    });

    await expect(api.getMe()).resolves.toEqual({
      success: true,
      user: { id: 7, name: 'Admin', email: 'admin@example.test', role: 'admin', level: 'ADMIN' },
    });
  });
});
