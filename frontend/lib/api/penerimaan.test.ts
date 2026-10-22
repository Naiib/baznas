import { describe, it, expect, beforeEach, vi } from 'vitest';
import { penerimaanApi } from './penerimaan';
import { ApiError } from './client';

describe('penerimaanApi client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // 1. Dashboard & Overview
  it('requests dashboard overview with period and filters', async () => {
    const mockOverview = {
      success: true,
      data: {
        period: '30d',
        metrics: {
          total_collected: '150000000',
          total_transactions: 120,
          pending_validation_count: 5,
          pending_approval_count: 2,
          unreconciled_count: 8,
          average_amount: '1250000',
          target_attainment_pct: 85,
          exception_count: 1,
        },
        trend: [{ date: '2026-09-01', amount: '5000000', count: 4 }],
        fund_type_breakdown: [{ fund_type: 'zakat_maal', name: 'Zakat Maal', amount: '90000000', percentage: 60 }],
        channel_breakdown: [{ channel: 'qris', name: 'QRIS', amount: '45000000', percentage: 30 }],
        action_queue: [{ id: 1, title: 'Validasi Masuk', type: 'validation', count: 5, link: '/penerimaan/transaksi?status=Masuk' }],
        recent_activity: [],
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockOverview,
    });

    const res = await penerimaanApi.getOverview('30d', { channel: 'qris', fund_type: 'zakat_maal' });
    expect(res).toEqual(mockOverview);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/overview?period=30d&channel=qris&fund_type=zakat_maal'),
      expect.anything()
    );
  });

  // 2. Transactions & Cursor Pagination
  it('requests transactions with cursor pagination and multi-field filters', async () => {
    const mockList = {
      success: true,
      data: {
        items: [{ id: 1, transaction_number: 'TRX-001', amount: '1000000', status: 'Masuk' }],
        next_cursor: 'cursor-token-123',
        has_more: true,
        total_count: 45,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockList,
    });

    const res = await penerimaanApi.getTransactions({
      cursor: 'cur-prev',
      limit: 25,
      search: 'Ahmad',
      status: 'Masuk',
      channel: 'transfer_bank',
      fund_type: 'zakat_maal',
      is_flagged: true,
      needs_action: true,
      min_amount: 500_000,
      max_amount: 5_000_000,
    });

    expect(res).toEqual(mockList);
    const calledUrl = (global.fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain('/api/penerimaan/transaksi?');
    expect(calledUrl).toContain('cursor=cur-prev');
    expect(calledUrl).toContain('limit=25');
    expect(calledUrl).toContain('search=Ahmad');
    expect(calledUrl).toContain('status=Masuk');
    expect(calledUrl).toContain('channel=transfer_bank');
    expect(calledUrl).toContain('fund_type=zakat_maal');
    expect(calledUrl).toContain('is_flagged=true');
    expect(calledUrl).toContain('needs_action=true');
    expect(calledUrl).toContain('min_amount=500000');
    expect(calledUrl).toContain('max_amount=5000000');
  });

  it('requests transaction detail by ID', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: { id: 101, transaction_number: 'TRX-101', timeline: [], approvals: [] } }),
    });

    await penerimaanApi.getTransactionById(101);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/transaksi/101'),
      expect.anything()
    );
  });

  it('creates manual transaction with JSON payload', async () => {
    const payload = {
      channel: 'tunai' as const,
      fund_type: 'infak' as const,
      amount: 250_000,
      muzakki_name: 'Haji Sulaiman',
      notes: 'Setoran tunai kantor',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: { id: 55, ...payload, status: 'Menunggu Validasi' } }),
    });

    await penerimaanApi.createManualTransaction(payload);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/transaksi/manual'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      })
    );
  });

  it('uploads evidence as FormData', async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['test-evidence'], { type: 'image/png' }), 'receipt.png');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: { file_url: '/uploads/receipt.png', file_name: 'receipt.png' } }),
    });

    await penerimaanApi.uploadEvidence(formData);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/transaksi/bukti'),
      expect.objectContaining({
        method: 'POST',
        body: formData,
      })
    );
  });

  it('performs bulk validation of transactions', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: true,
        data: { validated_count: 2, failed_count: 0, results: [{ id: 1, success: true }, { id: 2, success: true }] },
      }),
    });

    await penerimaanApi.bulkValidateTransactions([1, 2], 'Batch validasi pagi');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/transaksi/bulk-validate'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ transaction_ids: [1, 2], notes: 'Batch validasi pagi' }),
      })
    );
  });

  // 3. Workflow Actions
  it('calls validateTransaction endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: { id: 201, status: 'Menunggu Rekonsiliasi' } }),
    });

    await penerimaanApi.validateTransaction(201, { notes: 'Validasi staff selesai', expected_version: 1 });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/transaksi/201/validate'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ notes: 'Validasi staff selesai', expected_version: 1 }),
      })
    );
  });

  it('calls approveTransaction endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: { id: 202, status: 'Menunggu Rekonsiliasi' } }),
    });

    await penerimaanApi.approveTransaction(202, { notes: 'Disetujui Kepala Bagian' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/transaksi/202/approve'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ notes: 'Disetujui Kepala Bagian' }),
      })
    );
  });

  it('calls rejectTransaction with reason', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: { id: 203, status: 'Ditolak' } }),
    });

    await penerimaanApi.rejectTransaction(203, { reason: 'Bukti transfer buram/palsu', expected_version: 2 });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/transaksi/203/reject'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Bukti transfer buram/palsu', expected_version: 2 }),
      })
    );
  });

  it('calls requestClarification and resolveClarification endpoints', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: { id: 204 } }),
    });

    await penerimaanApi.requestClarification(204, { notes: 'Mohon konfirmasi nama pengirim' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/transaksi/204/request-clarification'),
      expect.objectContaining({ method: 'POST' })
    );

    await penerimaanApi.resolveClarification(204, { notes: 'Nama pengirim terkonfirmasi via WhatsApp' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/transaksi/204/resolve-clarification'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('calls reverseTransaction endpoint with required reason', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: { id: 205, status: 'Dibatalkan' } }),
    });

    await penerimaanApi.reverseTransaction(205, { reason: 'Koreksi posting salah rekening', expected_version: 3 });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/transaksi/205/reverse'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Koreksi posting salah rekening', expected_version: 3 }),
      })
    );
  });

  // 4. Muzakki Endpoints
  it('manages Muzakki: list, get, create, update, suggestions, and merge', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: [] }),
    });

    // List with cursor
    await penerimaanApi.getMuzakkiList({ cursor: 'muz-cur-1', limit: 20, search: 'Budi' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/muzakki?cursor=muz-cur-1&limit=20&search=Budi'),
      expect.anything()
    );

    // Detail
    await penerimaanApi.getMuzakkiById(42);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/muzakki/42'),
      expect.anything()
    );

    // Create
    await penerimaanApi.createMuzakki({ name: 'PT Berkah Utama', type: 'lembaga' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/muzakki'),
      expect.objectContaining({ method: 'POST' })
    );

    // Update
    await penerimaanApi.updateMuzakki(42, { phone: '08123456789' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/muzakki/42'),
      expect.objectContaining({ method: 'PUT' })
    );

    // Duplicates
    await penerimaanApi.getDuplicateMuzakkiSuggestions();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/muzakki/duplicates'),
      expect.anything()
    );

    // Merge
    await penerimaanApi.mergeMuzakki(10, [11, 12]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/muzakki/merge'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ primary_id: 10, duplicate_ids: [11, 12] }),
      })
    );
  });

  // 5. Reconciliation Endpoints
  it('manages reconciliation batches, matching, import, and close', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: {} }),
    });

    // List batches
    await penerimaanApi.getReconciliationBatches({ channel: 'qris', status: 'matched' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/rekonsiliasi/batches?channel=qris&status=matched'),
      expect.anything()
    );

    // Get batch
    await penerimaanApi.getReconciliationBatchById(7);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/rekonsiliasi/batches/7'),
      expect.anything()
    );

    // Create batch
    await penerimaanApi.createReconciliationBatch({
      channel: 'transfer_bank',
      account_name: 'BSI Zakat',
      account_number: '1234567890',
      period_start: '2026-09-01',
      period_end: '2026-09-07',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/rekonsiliasi/batches'),
      expect.objectContaining({ method: 'POST' })
    );

    // Import statement
    const statementFormData = new FormData();
    statementFormData.append('file', new Blob(['bank statement'], { type: 'text/csv' }), 'rekening_koran.csv');
    await penerimaanApi.importBankStatements(7, statementFormData);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/rekonsiliasi/batches/7/import'),
      expect.objectContaining({ method: 'POST' })
    );

    // Match
    await penerimaanApi.matchTransaction(7, { statement_line_id: 301, transaction_id: 201 });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/rekonsiliasi/batches/7/match'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ statement_line_id: 301, transaction_id: 201 }),
      })
    );

    // Unmatch
    await penerimaanApi.unmatchTransaction(7, 999);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/rekonsiliasi/batches/7/unmatch/999'),
      expect.objectContaining({ method: 'POST' })
    );

    // Close batch
    await penerimaanApi.closeReconciliationBatch(7, { notes: 'Batch klop tanpa selisih' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/rekonsiliasi/batches/7/close'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ notes: 'Batch klop tanpa selisih' }),
      })
    );
  });

  it('keeps auto-match money values as canonical strings', async () => {
    const autoMatchResponse = {
      success: true,
      data: { matched_count: 1, matched_amount: '9007199254740995', discrepancy_amount: '7', new_matches: 1, status: 'matched' },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => autoMatchResponse,
    });
    const response = await penerimaanApi.autoMatchBatch(7);
    expect(response.data?.matched_amount).toBe('9007199254740995');
    expect(response.data?.discrepancy_amount).toBe('7');
  });

  // 6. Reports & Export Blob Handling
  it('requests report preview and report generation', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: { reports: [], kpis: {} } }),
    });

    await penerimaanApi.getReports({ period: 'monthly', channel: 'transfer_bank' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/laporan?period=monthly&channel=transfer_bank'),
      expect.anything()
    );

    await penerimaanApi.generateReport({ category: 'channel', period: '2026-09', format: 'xlsx' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/laporan/generate'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('builds export URL with query parameters', () => {
    const url = penerimaanApi.getExportUrl('rep-001', 'xlsx', { title: 'Laporan Penerimaan', period: '2026-09' });
    expect(url).toContain('/api/penerimaan/laporan/export/rep-001?');
    expect(url).toContain('format=xlsx');
    expect(url).toContain('title=Laporan+Penerimaan');
    expect(url).toContain('period=2026-09');
  });

  it('downloads report export Blob with auth token and error mapping', async () => {
    localStorage.setItem('baznas_auth_token', 'test-token-jwt');
    const mockBlob = new Blob(['excel data binary'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => mockBlob,
    });

    const blob = await penerimaanApi.exportReport('rep-001', 'xlsx');
    expect(blob).toEqual(mockBlob);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/laporan/export/rep-001?format=xlsx'),
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );

    const headers = (global.fetch as any).mock.calls[0][1].headers;
    expect(headers.get('Authorization')).toBe('Bearer test-token-jwt');
  });

  it('throws ApiError on failed report export download', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: false, message: 'Wewenang tidak mencukupi untuk mengunduh laporan audit.' }),
    });

    await expect(penerimaanApi.exportReport('rep-audit', 'pdf')).rejects.toThrow(ApiError);
  });

  // 7. Channels, Accounts, and Settings
  it('manages channel config, accounts, and operational settings', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: [] }),
    });

    await penerimaanApi.getChannels();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/master-data/channels'),
      expect.anything()
    );

    await penerimaanApi.updateChannelConfig('qris', { is_active: false });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/master-data/channels/qris'),
      expect.objectContaining({ method: 'PUT' })
    );

    await penerimaanApi.getAccounts();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/master-data/accounts'),
      expect.anything()
    );

    await penerimaanApi.getSettings();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/pengaturan'),
      expect.anything()
    );

    await penerimaanApi.updateSettings({ approval_threshold: '20000000' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/pengaturan'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ approval_threshold: '20000000' }),
      })
    );

    // Master data: create channel & account
    await penerimaanApi.createChannel({ code: 'portal_web', name: 'Portal Web', category: 'digital' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/master-data/channels'),
      expect.objectContaining({ method: 'POST' })
    );

    await penerimaanApi.createAccount({ bank_name: 'BSI', account_number: '123' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/master-data/accounts'),
      expect.objectContaining({ method: 'POST' })
    );

    await penerimaanApi.updateAccount(1, { bank_name: 'BSI Update' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/master-data/accounts/1'),
      expect.objectContaining({ method: 'PUT' })
    );

    // Master data: fund categories
    await penerimaanApi.getFundCategories();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/master-data/fund-categories'),
      expect.anything()
    );

    await penerimaanApi.createFundCategory({ code: 'zakat_fitrah', name: 'Zakat Fitrah' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/master-data/fund-categories'),
      expect.objectContaining({ method: 'POST' })
    );

    await penerimaanApi.updateFundCategory(2, { name: 'Zakat Fitrah 1447H' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/master-data/fund-categories/2'),
      expect.objectContaining({ method: 'PUT' })
    );

    // Master data: providers
    await penerimaanApi.getProviderConfigs();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/master-data/providers'),
      expect.anything()
    );

    await penerimaanApi.updateProviderConfig(3, { secret_key: 'new-key' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/master-data/providers/3'),
      expect.objectContaining({ method: 'PUT' })
    );

    // Export Job status
    await penerimaanApi.getExportJob('job-uuid-123');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/laporan/jobs/job-uuid-123'),
      expect.anything()
    );
  });

  // 8. Audit Logs
  it('requests audit logs with cursor pagination and entity filters', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: { items: [], next_cursor: null, has_more: false } }),
    });

    await penerimaanApi.getAuditLogs({ cursor: 'aud-cur-9', limit: 50, entity_type: 'transaction', entity_id: 101 });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/audit?cursor=aud-cur-9&limit=50&entity_type=transaction&entity_id=101'),
      expect.anything()
    );
  });

  // 9. Ingestion & Import Jobs
  it('initiates transaction import job and checks status', async () => {
    const importFormData = new FormData();
    importFormData.append('file', new Blob(['col1,col2\nval1,val2'], { type: 'text/csv' }), 'transaksi.csv');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: { job_id: 'job-777', total_rows: 100 } }),
    });

    await penerimaanApi.importTransactions(importFormData);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/transaksi/import'),
      expect.objectContaining({ method: 'POST' })
    );

    await penerimaanApi.getImportJobStatus('job-777');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/penerimaan/transaksi/import/job-777'),
      expect.anything()
    );
  });

  // 10. Error handling & Auth token propagation
  it('propagates Bearer token from session to requests', async () => {
    localStorage.setItem('baznas_auth_token', 'jwt-token-active');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: {} }),
    });

    await penerimaanApi.getTransactionById(99);
    const headers = (global.fetch as any).mock.calls[0][1].headers;
    expect(headers.get('Authorization')).toBe('Bearer jwt-token-active');
  });

  it('throws ApiError with normalized message on API error response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: false, message: 'Nominal transaksi harus lebih besar dari 0' }),
    });

    await expect(
      penerimaanApi.createManualTransaction({ channel: 'tunai', fund_type: 'infak', amount: 0, muzakki_name: 'Test' })
    ).rejects.toThrow(ApiError);
  });
});
