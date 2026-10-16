import { apiFetch, ApiError, getApiBase } from './client';
import { getClientToken } from '../auth/session';
import type {
  ApiEnvelope,
  CursorPaginatedResponse,
  PenerimaanOverviewResponse,
  PenerimaanTransaction,
  PenerimaanTransactionDetail,
  PenerimaanTransactionQueryParams,
  CreateManualTransactionPayload,
  BulkValidationResult,
  Muzakki,
  MuzakkiDetail,
  MuzakkiQueryParams,
  DuplicateMuzakkiSuggestion,
  ReconciliationBatch,
  ReconciliationBatchDetail,
  ReconciliationQueryParams,
  CreateBatchPayload,
  ImportStatementsResult,
  PenerimaanReportSummary,
  PenerimaanReportQueryParams,
  GenerateReportPayload,
  PenerimaanChannelConfig,
  PenerimaanAccount,
  PenerimaanSettings,
  PenerimaanAuditLogItem,
  PenerimaanAuditQueryParams,
  PenerimaanFundCategoryConfig,
  PenerimaanProviderConfig,
  PenerimaanExportJobStatus,
  ImportTransactionsResult,
  ImportJobStatus,
} from './types';

/**
 * Builds a valid query string from an object, omitting null, undefined, or empty values.
 */
function toQueryString(params?: Record<string, unknown>): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'boolean') {
      searchParams.set(key, value ? 'true' : 'false');
    } else {
      searchParams.set(key, String(value));
    }
  }

  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export const penerimaanApi = {
  // 1. Dashboard & Overview
  async getOverview(
    period: string = '30d',
    filters?: { channel?: string; fund_type?: string; start_date?: string; end_date?: string }
  ): Promise<ApiEnvelope<PenerimaanOverviewResponse>> {
    const qs = toQueryString({ period, ...filters });
    return apiFetch<PenerimaanOverviewResponse>(`/api/penerimaan/overview${qs}`);
  },

  // 2. Transactions & Workspace
  async getTransactions(
    params?: PenerimaanTransactionQueryParams
  ): Promise<ApiEnvelope<CursorPaginatedResponse<PenerimaanTransaction>>> {
    const qs = toQueryString(params as Record<string, unknown>);
    return apiFetch<CursorPaginatedResponse<PenerimaanTransaction>>(`/api/penerimaan/transaksi${qs}`);
  },

  async getTransactionById(
    id: string | number
  ): Promise<ApiEnvelope<PenerimaanTransactionDetail>> {
    return apiFetch<PenerimaanTransactionDetail>(`/api/penerimaan/transaksi/${encodeURIComponent(String(id))}`);
  },

  async downloadBszPdf(id: string | number): Promise<Blob> {
    const token = getClientToken();
    const headers: Record<string, string> = {
      Accept: 'application/pdf',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${getApiBase()}/api/penerimaan/transaksi/${encodeURIComponent(String(id))}/bsz-pdf`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorMsg = `HTTP ${response.status}: Gagal mengunduh Bukti Setor Zakat (BSZ) PDF.`;
      throw new ApiError(errorMsg, response.status);
    }

    return response.blob();
  },

  async createManualTransaction(
    payload: CreateManualTransactionPayload
  ): Promise<ApiEnvelope<PenerimaanTransaction>> {
    return apiFetch<PenerimaanTransaction>('/api/penerimaan/transaksi/manual', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async uploadEvidence(
    fileOrFormData: File | FormData
  ): Promise<ApiEnvelope<{ file_url: string; file_name?: string }>> {
    const body = fileOrFormData instanceof FormData ? fileOrFormData : (() => {
      const fd = new FormData();
      fd.append('file', fileOrFormData);
      return fd;
    })();

    return apiFetch<{ file_url: string; file_name?: string }>('/api/penerimaan/transaksi/bukti', {
      method: 'POST',
      body,
    });
  },

  async bulkValidateTransactions(
    transactionIds: (string | number)[],
    notes?: string
  ): Promise<ApiEnvelope<BulkValidationResult>> {
    return apiFetch<BulkValidationResult>('/api/penerimaan/transaksi/bulk-validate', {
      method: 'POST',
      body: JSON.stringify({ transaction_ids: transactionIds, notes }),
    });
  },

  // 3. Workflow Mutations
  async validateTransaction(
    id: string | number,
    payload?: { notes?: string; expected_version?: number }
  ): Promise<ApiEnvelope<PenerimaanTransaction>> {
    return apiFetch<PenerimaanTransaction>(`/api/penerimaan/transaksi/${encodeURIComponent(String(id))}/validate`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  async approveTransaction(
    id: string | number,
    payload?: { notes?: string; expected_version?: number }
  ): Promise<ApiEnvelope<PenerimaanTransaction>> {
    return apiFetch<PenerimaanTransaction>(`/api/penerimaan/transaksi/${encodeURIComponent(String(id))}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  async rejectTransaction(
    id: string | number,
    payload: { reason: string; expected_version?: number }
  ): Promise<ApiEnvelope<PenerimaanTransaction>> {
    return apiFetch<PenerimaanTransaction>(`/api/penerimaan/transaksi/${encodeURIComponent(String(id))}/reject`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async requestClarification(
    id: string | number,
    payload: { notes: string; expected_version?: number }
  ): Promise<ApiEnvelope<PenerimaanTransaction>> {
    return apiFetch<PenerimaanTransaction>(`/api/penerimaan/transaksi/${encodeURIComponent(String(id))}/request-clarification`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async resolveClarification(
    id: string | number,
    payload?: { notes?: string; expected_version?: number }
  ): Promise<ApiEnvelope<PenerimaanTransaction>> {
    return apiFetch<PenerimaanTransaction>(`/api/penerimaan/transaksi/${encodeURIComponent(String(id))}/resolve-clarification`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  async reverseTransaction(
    id: string | number,
    payload: { reason: string; expected_version?: number }
  ): Promise<ApiEnvelope<PenerimaanTransaction>> {
    return apiFetch<PenerimaanTransaction>(`/api/penerimaan/transaksi/${encodeURIComponent(String(id))}/reverse`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // 4. Muzakki Directory & Operations
  async getMuzakkiList(
    params?: MuzakkiQueryParams
  ): Promise<ApiEnvelope<CursorPaginatedResponse<Muzakki>>> {
    const qs = toQueryString(params as Record<string, unknown>);
    return apiFetch<CursorPaginatedResponse<Muzakki>>(`/api/penerimaan/muzakki${qs}`);
  },

  async getMuzakkiById(
    id: string | number
  ): Promise<ApiEnvelope<MuzakkiDetail>> {
    return apiFetch<MuzakkiDetail>(`/api/penerimaan/muzakki/${encodeURIComponent(String(id))}`);
  },

  async createMuzakki(
    data: Partial<Muzakki>
  ): Promise<ApiEnvelope<Muzakki>> {
    return apiFetch<Muzakki>('/api/penerimaan/muzakki', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateMuzakki(
    id: string | number,
    data: Partial<Muzakki>
  ): Promise<ApiEnvelope<Muzakki>> {
    return apiFetch<Muzakki>(`/api/penerimaan/muzakki/${encodeURIComponent(String(id))}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getDuplicateMuzakkiSuggestions(): Promise<ApiEnvelope<DuplicateMuzakkiSuggestion[]>> {
    return apiFetch<DuplicateMuzakkiSuggestion[]>('/api/penerimaan/muzakki/duplicates');
  },

  async mergeMuzakki(
    primaryId: string | number,
    duplicateIds: (string | number)[]
  ): Promise<ApiEnvelope<{ success: boolean; merged_id: string | number }>> {
    return apiFetch<{ success: boolean; merged_id: string | number }>('/api/penerimaan/muzakki/merge', {
      method: 'POST',
      body: JSON.stringify({ primary_id: primaryId, duplicate_ids: duplicateIds }),
    });
  },

  // 5. Reconciliation Batches & Matching
  async getReconciliationBatches(
    params?: ReconciliationQueryParams
  ): Promise<ApiEnvelope<CursorPaginatedResponse<ReconciliationBatch>>> {
    const qs = toQueryString(params as Record<string, unknown>);
    return apiFetch<CursorPaginatedResponse<ReconciliationBatch>>(`/api/penerimaan/rekonsiliasi/batches${qs}`);
  },

  async getReconciliationBatchById(
    id: string | number
  ): Promise<ApiEnvelope<ReconciliationBatchDetail>> {
    return apiFetch<ReconciliationBatchDetail>(`/api/penerimaan/rekonsiliasi/batches/${encodeURIComponent(String(id))}`);
  },

  async createReconciliationBatch(
    data: CreateBatchPayload
  ): Promise<ApiEnvelope<ReconciliationBatch>> {
    return apiFetch<ReconciliationBatch>('/api/penerimaan/rekonsiliasi/batches', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async importBankStatements(
    batchId: string | number,
    fileOrFormData: File | FormData
  ): Promise<ApiEnvelope<ImportStatementsResult>> {
    const body = fileOrFormData instanceof FormData ? fileOrFormData : (() => {
      const fd = new FormData();
      fd.append('file', fileOrFormData);
      return fd;
    })();

    return apiFetch<ImportStatementsResult>(`/api/penerimaan/rekonsiliasi/batches/${encodeURIComponent(String(batchId))}/import`, {
      method: 'POST',
      body,
    });
  },

  async autoMatchBatch(
    batchId: string | number
  ): Promise<ApiEnvelope<{ matched_count: number; matched_amount: string; discrepancy_amount: string; new_matches: number; status: string }>> {
    return apiFetch<{ matched_count: number; matched_amount: string; discrepancy_amount: string; new_matches: number; status: string }>(
      `/api/penerimaan/rekonsiliasi/batches/${encodeURIComponent(String(batchId))}/auto-match`,
      { method: 'POST' }
    );
  },

  async matchTransaction(
    batchId: string | number,
    payload: { statement_line_id: string | number; transaction_id: string | number; notes?: string }
  ): Promise<ApiEnvelope<{ success: boolean; match_id: string | number }>> {
    return apiFetch<{ success: boolean; match_id: string | number }>(
      `/api/penerimaan/rekonsiliasi/batches/${encodeURIComponent(String(batchId))}/match`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async unmatchTransaction(
    batchId: string | number,
    matchId: string | number
  ): Promise<ApiEnvelope<{ success: boolean }>> {
    return apiFetch<{ success: boolean }>(
      `/api/penerimaan/rekonsiliasi/batches/${encodeURIComponent(String(batchId))}/unmatch/${encodeURIComponent(String(matchId))}`,
      { method: 'POST' }
    );
  },

  async closeReconciliationBatch(
    id: string | number,
    payload?: { notes?: string }
  ): Promise<ApiEnvelope<ReconciliationBatch>> {
    return apiFetch<ReconciliationBatch>(`/api/penerimaan/rekonsiliasi/batches/${encodeURIComponent(String(id))}/close`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  // 6. Reports & Export Jobs
  async getReports(
    params?: PenerimaanReportQueryParams
  ): Promise<ApiEnvelope<PenerimaanReportSummary>> {
    const qs = toQueryString(params as Record<string, unknown>);
    return apiFetch<PenerimaanReportSummary>(`/api/penerimaan/laporan${qs}`);
  },

  async generateReport(
    payload: GenerateReportPayload
  ): Promise<ApiEnvelope<{ id: string; status: string; download_url?: string }>> {
    return apiFetch<{ id: string; status: string; download_url?: string }>('/api/penerimaan/laporan/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getExportUrl(
    reportId: string,
    format: 'xlsx' | 'pdf' | 'csv' = 'xlsx',
    meta?: Record<string, string>
  ): string {
    const base = getApiBase();
    const params = new URLSearchParams({ format, ...(meta || {}) });
    return `${base}/api/penerimaan/laporan/export/${encodeURIComponent(reportId)}?${params.toString()}`;
  },

  async exportReport(
    reportId: string,
    format: 'xlsx' | 'pdf' | 'csv' = 'xlsx',
    meta?: Record<string, string>
  ): Promise<Blob> {
    const headers = new Headers();
    const token = getClientToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const url = penerimaanApi.getExportUrl(reportId, format, meta);
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json().catch(() => null)
        : null;
      const errorMsg = payload?.message || payload?.error || `HTTP ${response.status}: Gagal mengunduh laporan penerimaan.`;
      throw new ApiError(errorMsg, response.status, payload);
    }

    return response.blob();
  },

  async downloadExportJob(jobId: string, format?: 'xlsx' | 'pdf' | 'csv'): Promise<Blob> {
    return this.exportReport(jobId, format || 'xlsx');
  },

  async getExportJob(
    jobId: string
  ): Promise<ApiEnvelope<PenerimaanExportJobStatus>> {
    return apiFetch<PenerimaanExportJobStatus>(`/api/penerimaan/laporan/jobs/${encodeURIComponent(jobId)}`);
  },

  // 7. Channels, Accounts, and Operational Settings
  async getChannels(): Promise<ApiEnvelope<PenerimaanChannelConfig[]>> {
    return apiFetch<PenerimaanChannelConfig[]>('/api/penerimaan/master-data/channels');
  },

  async createChannel(
    data: Partial<PenerimaanChannelConfig>
  ): Promise<ApiEnvelope<PenerimaanChannelConfig>> {
    return apiFetch<PenerimaanChannelConfig>('/api/penerimaan/master-data/channels', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateChannelConfig(
    id: string | number,
    data: Partial<PenerimaanChannelConfig>
  ): Promise<ApiEnvelope<PenerimaanChannelConfig>> {
    return apiFetch<PenerimaanChannelConfig>(`/api/penerimaan/master-data/channels/${encodeURIComponent(String(id))}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getAccounts(): Promise<ApiEnvelope<PenerimaanAccount[]>> {
    return apiFetch<PenerimaanAccount[]>('/api/penerimaan/master-data/accounts');
  },

  async createAccount(
    data: Partial<PenerimaanAccount>
  ): Promise<ApiEnvelope<PenerimaanAccount>> {
    return apiFetch<PenerimaanAccount>('/api/penerimaan/master-data/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAccount(
    id: string | number,
    data: Partial<PenerimaanAccount>
  ): Promise<ApiEnvelope<PenerimaanAccount>> {
    return apiFetch<PenerimaanAccount>(`/api/penerimaan/master-data/accounts/${encodeURIComponent(String(id))}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getFundCategories(): Promise<ApiEnvelope<PenerimaanFundCategoryConfig[]>> {
    return apiFetch<PenerimaanFundCategoryConfig[]>('/api/penerimaan/master-data/fund-categories');
  },

  async createFundCategory(
    data: Partial<PenerimaanFundCategoryConfig>
  ): Promise<ApiEnvelope<PenerimaanFundCategoryConfig>> {
    return apiFetch<PenerimaanFundCategoryConfig>('/api/penerimaan/master-data/fund-categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateFundCategory(
    id: string | number,
    data: Partial<PenerimaanFundCategoryConfig>
  ): Promise<ApiEnvelope<PenerimaanFundCategoryConfig>> {
    return apiFetch<PenerimaanFundCategoryConfig>(`/api/penerimaan/master-data/fund-categories/${encodeURIComponent(String(id))}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getProviderConfigs(): Promise<ApiEnvelope<PenerimaanProviderConfig[]>> {
    return apiFetch<PenerimaanProviderConfig[]>('/api/penerimaan/master-data/providers');
  },

  async updateProviderConfig(
    id: string | number,
    data: Partial<PenerimaanProviderConfig>
  ): Promise<ApiEnvelope<PenerimaanProviderConfig>> {
    return apiFetch<PenerimaanProviderConfig>(`/api/penerimaan/master-data/providers/${encodeURIComponent(String(id))}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getSettings(): Promise<ApiEnvelope<PenerimaanSettings>> {
    return apiFetch<PenerimaanSettings>('/api/penerimaan/pengaturan');
  },

  async updateSettings(
    settings: Partial<PenerimaanSettings>
  ): Promise<ApiEnvelope<PenerimaanSettings>> {
    return apiFetch<PenerimaanSettings>('/api/penerimaan/pengaturan', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  // 8. Audit Logs (Cursor-paginated)
  async getAuditLogs(
    params?: PenerimaanAuditQueryParams
  ): Promise<ApiEnvelope<CursorPaginatedResponse<PenerimaanAuditLogItem>>> {
    const qs = toQueryString(params as Record<string, unknown>);
    return apiFetch<CursorPaginatedResponse<PenerimaanAuditLogItem>>(`/api/penerimaan/audit${qs}`);
  },

  // 9. Webhook & Ingestion Jobs
  async importTransactions(
    formData: FormData
  ): Promise<ApiEnvelope<ImportTransactionsResult>> {
    return apiFetch<ImportTransactionsResult>('/api/penerimaan/transaksi/import', {
      method: 'POST',
      body: formData,
    });
  },

  async getImportJobStatus(
    jobId: string
  ): Promise<ApiEnvelope<ImportJobStatus>> {
    return apiFetch<ImportJobStatus>(`/api/penerimaan/transaksi/import/${encodeURIComponent(jobId)}`);
  },
};
