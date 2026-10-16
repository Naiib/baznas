import { getClientToken } from '../auth/session';
import type {
  ApiEnvelope,
  CurrentUser,
  Mustahik,
  PenyaluranByKecamatan,
  PenyaluranOverviewResponse,
  PilarProgramData,
  PilarInitiative,
  MustahikStageCounts,
  MustahikDecisionPayload,
  ReportListResponse,
  ReportItem,
  ActivityLogItem,
  PublicApplicationResult,
  PublicTrackingResult,
  SuratPermohonanPayload,
  PenyaluranTransaction,
  MasterDataRecord,
  OperationalUser,
  P0IntakePayload,
  P0IntakeResponse,
  P0CaseWorkspace,
  AssessmentDraft,
  AssessmentCaseResponse,
  MpzisDraft,
  MpzisCaseResponse,
  MpzisStepKey,
  PpdDraft,
  PpdCaseResponse,
  RabLine,
  PaymentRecordResponse,
  RecipientConfirmationPayload,
  RecipientConfirmationResponse,
  P0CommandMeta,
  ArchiveCasePayload,
  ArchiveCaseResponse,
  RestoreCaseResponse,
} from './types';
import { penerimaanApi } from './penerimaan';
export { penerimaanApi };

// In browser, if NEXT_PUBLIC_API_BASE_URL is set, use it; otherwise use same origin (relative /api)
// In browser, ALWAYS use relative path '' so Nginx proxies /api to port 3001
// On server SSR, use internal port 3001
export const getApiBase = () => {
  if (typeof window !== 'undefined') {
    // On localhost in browser, default to backend port 3001 if no custom env is set
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
    }
    return '';
  }
  return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3001';
};

export class ApiError extends Error {
  status: number;
  data?: unknown;
  code?: string;
  field_errors?: Record<string, string>;

  constructor(
    message: string,
    status: number,
    data?: unknown,
    code?: string,
    field_errors?: Record<string, string>
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;

    const payloadObj =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined;

    this.code =
      code || (typeof payloadObj?.code === 'string' ? payloadObj.code : undefined);

    this.field_errors =
      field_errors ||
      (payloadObj?.field_errors && typeof payloadObj.field_errors === 'object'
        ? (payloadObj.field_errors as Record<string, string>)
        : undefined);
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiEnvelope<T>> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBase();
  const url = `${base}${normalizedPath}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach token if present in browser
  const token = getClientToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorMsg =
      payload?.message || payload?.error || `HTTP ${response.status}: Request failed`;
    throw new ApiError(
      errorMsg,
      response.status,
      payload,
      payload?.code,
      payload?.field_errors
    );
  }

  return payload as ApiEnvelope<T>;
}

/** Fetch a protected binary resource with the same bearer session as API calls. */
export async function fetchAuthenticatedBlob(path: string): Promise<Blob> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${getApiBase()}${normalizedPath}`, {
    headers: getClientToken() ? { Authorization: `Bearer ${getClientToken()}` } : undefined,
  });
  if (!response.ok) {
    const payload = response.headers.get('content-type')?.includes('application/json')
      ? await response.json().catch(() => null)
      : null;
    const errorMsg =
      payload?.message || payload?.error || `HTTP ${response.status}: Berkas tidak dapat dibuka`;
    throw new ApiError(
      errorMsg,
      response.status,
      payload,
      payload?.code,
      payload?.field_errors
    );
  }
  return response.blob();
}

function buildCommandHeaders(meta?: P0CommandMeta): HeadersInit {
  const headers: Record<string, string> = {};
  if (meta?.idempotency_key) {
    headers['Idempotency-Key'] = meta.idempotency_key;
  }
  if (meta?.correlation_id) {
    headers['X-Correlation-Id'] = meta.correlation_id;
  }
  return headers;
}

const ALLOWED_INTAKE_FIELDS = new Set([
  'name',
  'beneficiary_name',
  'applicant_status',
  'nik',
  'kk_number',
  'phone',
  'marital_status',
  'pob',
  'dob',
  'occupation',
  'work_place',
  'education_level',
  'address',
  'rt_rw',
  'kelurahan',
  'kecamatan',
  'kabupaten_kota',
  'province',
  'house_ownership',
  'family_dependents',
  'monthly_income',
  'monthly_expense',
  'program',
  'request_title',
  'asnaf',
  'fund_source',
  'distribution_purpose',
  'parent_occupation',
  'beneficiary_count',
  'payment_method',
  'bank_name',
  'bank_account_name',
]);

const ALLOWED_ASSESSMENT_FIELDS = new Set([
  'husband_in_household',
  'husband_name',
  'wife_in_household',
  'wife_name',
  'child_count',
  'house_ownership',
  'home_address',
  'address_matches_ktp',
  'monthly_rent_amount',
  'husband_occupation',
  'husband_monthly_income',
  'wife_occupation',
  'wife_monthly_income',
  'child_occupation',
  'child_monthly_support',
  'assistance_request',
  'applied_to_baznas_before',
  'previous_application_year',
  'note',
]);

const ALLOWED_MPZIS_FIELDS = new Set([
  'form_number',
  'mpzis_date',
  'program_classification',
  'purpose',
  'asnaf',
  'fund_source',
  'recipient_name',
  'recipient_type',
  'beneficiary_count',
  'total_amount',
  'address_snapshot',
  'marital_status_snapshot',
  'recipient_section_confirmed',
  'fund_source_confirmed',
  'note',
]);

const ALLOWED_PPD_FIELDS = new Set([
  'form_number',
  'ppd_number',
  'transaction_number',
  'purpose',
  'fund_source',
  'fund_source_confirmed',
  'payment_type',
  'payment_type_confirmed',
  'payment_type_other',
  'bank_name',
  'bank_account_name',
  'bank_account_number',
  'account_number',
  'rab_lines',
  'attachments',
  'note',
]);

function sanitizeAssessmentDraft(draft?: Partial<AssessmentDraft>): Record<string, unknown> {
  if (!draft) return {};
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (ALLOWED_ASSESSMENT_FIELDS.has(key) && value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function sanitizeMpzisDraft(draft?: Partial<MpzisDraft>): Record<string, unknown> {
  if (!draft) return {};
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (ALLOWED_MPZIS_FIELDS.has(key) && value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function sanitizePpdDraft(draft?: Partial<PpdDraft>): Record<string, unknown> {
  if (!draft) return {};
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (key === 'rab_lines') continue;
    if (ALLOWED_PPD_FIELDS.has(key) && value !== undefined) {
      cleaned[key] = value;
    }
  }
  if (Array.isArray(draft.rab_lines)) {
    cleaned.rab_lines = draft.rab_lines.map((line: RabLine) => ({
      line_no: line.line_no,
      register_number: line.register_number,
      description: line.description || line.deskripsi || '',
      amount: line.amount !== undefined ? line.amount : ((line.harga_satuan ?? 0) * (line.jumlah ?? 1)),
    }));
  }
  return cleaned;
}

// Typed API services
export const api = {
  // Auth
  async getMe(): Promise<{ success: boolean; user: CurrentUser }> {
    const res = await apiFetch<CurrentUser | { user?: CurrentUser }>('/api/auth/me');
    const payload = res.data;
    const nestedUser = payload && typeof payload === 'object' && 'user' in payload ? payload.user : undefined;
    const topLevelUser = (res as unknown as { user?: CurrentUser }).user;
    const user = nestedUser || topLevelUser || payload;
    return { success: res.success, user: user as CurrentUser };
  },

  async login(credentials: { email?: string; username?: string; password?: string }) {
    const res = await apiFetch<{ token: string; user: CurrentUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    const raw = res as unknown as { token?: string; user?: CurrentUser; data?: { token: string; user: CurrentUser } };
    const token = res.data?.token || raw.token;
    const user = res.data?.user || raw.user;
    return {
      ...res,
      token,
      user,
      data: token && user ? { token, user } : res.data,
    };
  },

  async logout(): Promise<ApiEnvelope<{ success: boolean }>> {
    return apiFetch<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
  },

  async getUsers(): Promise<ApiEnvelope<OperationalUser[]>> {
    return apiFetch<OperationalUser[]>('/api/auth/users');
  },

  async updateUserAccess(id: string | number, data: Pick<OperationalUser, 'level'>): Promise<ApiEnvelope<OperationalUser>> {
    return apiFetch<OperationalUser>(`/api/auth/users/${encodeURIComponent(String(id))}/access`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // 1. Penyaluran Overview & Dashboard
  async getPenyaluranOverview(period: string = '30d'): Promise<ApiEnvelope<PenyaluranOverviewResponse>> {
    return apiFetch<PenyaluranOverviewResponse>(`/api/penyaluran/overview?period=${encodeURIComponent(period)}`);
  },

  // 2. Penyaluran By Kecamatan (Geospatial)
  async getPenyaluranByKecamatan(): Promise<ApiEnvelope<PenyaluranByKecamatan[]>> {
    return apiFetch<PenyaluranByKecamatan[]>('/api/penyaluran/by-kecamatan');
  },

  // 3. 5 Pilar Programs & Initiatives
  async getPilarPrograms(): Promise<ApiEnvelope<PilarProgramData[]>> {
    return apiFetch<PilarProgramData[]>('/api/penyaluran/program');
  },

  async createPilarInitiative(data: Partial<PilarInitiative>): Promise<ApiEnvelope<{ id: number }>> {
    return apiFetch<{ id: number }>('/api/penyaluran/program/initiatives', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updatePilarInitiative(id: number | string, data: Partial<PilarInitiative>): Promise<ApiEnvelope<{ success: boolean }>> {
    return apiFetch<{ success: boolean }>(`/api/penyaluran/program/initiatives/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deletePilarInitiative(id: number | string): Promise<ApiEnvelope<{ success: boolean }>> {
    return apiFetch<{ success: boolean }>(`/api/penyaluran/program/initiatives/${id}`, {
      method: 'DELETE',
    });
  },

  // 4. Mustahik Directory & Workflow
  async getMustahikList(params?: Record<string, string>): Promise<ApiEnvelope<Mustahik[]>> {
    const search = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiFetch<Mustahik[]>(`/api/mustahik${search}`);
  },

  async getMustahikStageCounts(): Promise<ApiEnvelope<MustahikStageCounts>> {
    return apiFetch<MustahikStageCounts>('/api/mustahik/stages/count');
  },

  async getMustahikById(id: string | number): Promise<ApiEnvelope<Mustahik>> {
    return apiFetch<Mustahik>(`/api/mustahik/${id}`);
  },

  async createMustahik(data: Partial<Mustahik>): Promise<ApiEnvelope<{ id: number }>> {
    return apiFetch<{ id: number }>('/api/mustahik', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateMustahik(id: string | number, data: Partial<Mustahik>): Promise<ApiEnvelope<Mustahik>> {
    return apiFetch<Mustahik>(`/api/mustahik/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteMustahik(id: string | number): Promise<ApiEnvelope<{ id: string | number }>> {
    return apiFetch<{ id: string | number }>(`/api/mustahik/${id}`, {
      method: 'DELETE',
    });
  },

  async submitMustahikDecision(id: string | number, payload: MustahikDecisionPayload): Promise<ApiEnvelope<{ old_status: string; new_status: string; message: string }>> {
    return apiFetch<{ old_status: string; new_status: string; message: string }>(`/api/mustahik/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getApprovalDecisions(mustahikId: string | number): Promise<ApiEnvelope<import('./types').ApprovalDecision[]>> {
    return apiFetch<import('./types').ApprovalDecision[]>(`/api/mustahik/${mustahikId}/approvals`);
  },

  async getApprovalAudit(params?: Record<string, string>): Promise<ApiEnvelope<import('./types').ApprovalDecision[]>> {
    const search = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiFetch<import('./types').ApprovalDecision[]>(`/api/penyaluran/audit-decisions${search}`);
  },

  async importMustahikBatch(items: Partial<Mustahik>[]): Promise<ApiEnvelope<{ count: number }>> {
    return apiFetch<{ count: number }>('/api/mustahik/import', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  // 5. Public mustahik portal (no amil session required)
  async submitPublicApplication(payload: FormData): Promise<ApiEnvelope<PublicApplicationResult>> {
    return apiFetch<PublicApplicationResult>('/api/public/pengajuan', {
      method: 'POST',
      body: payload,
    });
  },

  async downloadSuratPermohonan(payload: SuratPermohonanPayload): Promise<Blob> {
    const response = await fetch(`${getApiBase()}/api/public/surat-permohonan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(getClientToken() ? { Authorization: `Bearer ${getClientToken()}` } : {}) },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const message = await response.text().catch(() => 'Gagal mengunduh surat permohonan.');
      throw new Error(message || 'Gagal mengunduh surat permohonan.');
    }
    return response.blob();
  },

  async trackPublicApplication(query: string): Promise<ApiEnvelope<PublicTrackingResult>> {
    return apiFetch<PublicTrackingResult>(`/api/public/lacak/${encodeURIComponent(query)}`);
  },

  async getPenyaluranTransactions(params?: Record<string, string>): Promise<ApiEnvelope<PenyaluranTransaction[]>> {
    const search = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiFetch<PenyaluranTransaction[]>(`/api/penyaluran/transaksi${search}`);
  },

  async getMasterData(params?: Record<string, string>): Promise<ApiEnvelope<MasterDataRecord[]>> {
    const search = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiFetch<MasterDataRecord[]>(`/api/penyaluran/master-data${search}`);
  },

  async getPublicMasterData(category: string): Promise<ApiEnvelope<MasterDataRecord[]>> {
    return apiFetch<MasterDataRecord[]>(`/api/public/master-data?category=${encodeURIComponent(category)}`);
  },

  async createMasterData(record: Omit<MasterDataRecord, 'id' | 'updated_at'>): Promise<ApiEnvelope<{ id: number | string }>> {
    return apiFetch<{ id: number | string }>('/api/penyaluran/master-data', { method: 'POST', body: JSON.stringify(record) });
  },

  async updateMasterData(id: number | string, record: Partial<MasterDataRecord>): Promise<ApiEnvelope<{ id: number | string }>> {
    return apiFetch<{ id: number | string }>(`/api/penyaluran/master-data/${id}`, { method: 'PUT', body: JSON.stringify(record) });
  },

  // 6. Laporan Penyaluran & Exports
  async getLaporanList(params?: Record<string, string>): Promise<ReportListResponse> {
    const search = params ? `?${new URLSearchParams(params).toString()}` : '';
    const res = await apiFetch<unknown>(`/api/penyaluran/laporan${search}`);
    return res as unknown as ReportListResponse;
  },

  async generateLaporan(data: Partial<ReportItem>): Promise<ApiEnvelope<{ id: string }>> {
    return apiFetch<{ id: string }>('/api/penyaluran/laporan/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async exportLaporan(
    reportId: string,
    format: 'xlsx' | 'pdf',
    meta?: { title?: string; category?: string; period?: string; scope?: string }
  ): Promise<Blob> {
    const headers = new Headers();
    const token = getClientToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(api.getExportUrl(reportId, format, meta), { headers });
    if (!response.ok) {
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json().catch(() => null)
        : null;
      throw new ApiError(payload?.message || payload?.error || 'Gagal mengunduh laporan.', response.status, payload);
    }
    return response.blob();
  },

  getExportUrl(
    reportId: string,
    format: 'xlsx' | 'pdf' | 'csv' | 'json' = 'xlsx',
    meta?: { title?: string; category?: string; period?: string; scope?: string }
  ): string {
    const base = getApiBase();
    const params = new URLSearchParams({ format });
    if (meta?.title) params.set('title', meta.title);
    if (meta?.category) params.set('category', meta.category);
    if (meta?.period) params.set('period', meta.period);
    if (meta?.scope) params.set('scope', meta.scope);
    return `${base}/api/penyaluran/laporan/export/${encodeURIComponent(reportId)}?${params.toString()}`;
  },

  // 6. Activity Logs
  async getActivityLogs(mustahikId?: string | number, limit?: number): Promise<ApiEnvelope<ActivityLogItem[]>> {
    const params = new URLSearchParams();
    if (mustahikId) params.set('mustahik_id', String(mustahikId));
    if (limit) params.set('limit', String(limit));
    const search = params.toString() ? `?${params.toString()}` : '';
    return apiFetch<ActivityLogItem[]>(`/api/activity-logs${search}`);
  },

  // ==========================================
  // P0 Workflow Methods (Milestone 4 - Task 14)
  // ==========================================

  // 1. Intake
  async createP0MustahikIntake(
    payload: P0IntakePayload,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<P0IntakeResponse>> {
    const headers = buildCommandHeaders(meta);
    const cleanPayload: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(payload as unknown as Record<string, unknown>)) {
      if (ALLOWED_INTAKE_FIELDS.has(key) && val !== undefined) {
        cleanPayload[key] = val;
      }
    }
    return apiFetch<P0IntakeResponse>('/api/penyaluran/mustahik', {
      method: 'POST',
      headers,
      body: JSON.stringify(cleanPayload),
    });
  },

  // 2. Canonical Case Workspace
  async getP0CaseWorkspace(mustahikId: string | number): Promise<P0CaseWorkspace> {
    const res = await apiFetch<P0CaseWorkspace>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/workspace`
    );
    return res as unknown as P0CaseWorkspace;
  },

  // 3. Assessment (5 methods)
  async getAssessment(mustahikId: string | number): Promise<ApiEnvelope<AssessmentCaseResponse>> {
    return apiFetch<AssessmentCaseResponse>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/assessment`
    );
  },

  async createAssessmentDraft(
    mustahikId: string | number,
    draft?: Partial<AssessmentDraft>,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<AssessmentDraft>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...sanitizeAssessmentDraft(draft), ...meta };
    return apiFetch<AssessmentDraft>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/assessment/drafts`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  async saveAssessmentDraft(
    mustahikId: string | number,
    assessmentId: string | number,
    draft: Partial<AssessmentDraft>,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<AssessmentDraft>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...sanitizeAssessmentDraft(draft), ...meta };
    return apiFetch<AssessmentDraft>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/assessment/${encodeURIComponent(String(assessmentId))}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  async submitAssessment(
    mustahikId: string | number,
    assessmentId: string | number,
    draft?: Partial<AssessmentDraft>,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<AssessmentDraft>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...sanitizeAssessmentDraft(draft), ...meta };
    return apiFetch<AssessmentDraft>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/assessment/${encodeURIComponent(String(assessmentId))}/submit`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  async reviewAssessment(
    mustahikId: string | number,
    assessmentId: string | number,
    payload: { action: 'accept' | 'return'; note?: string },
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<AssessmentDraft>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...payload, ...meta };
    return apiFetch<AssessmentDraft>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/assessment/${encodeURIComponent(String(assessmentId))}/review`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  // 4. MPZIS (5 methods)
  async getMpzis(mustahikId: string | number): Promise<ApiEnvelope<MpzisCaseResponse>> {
    return apiFetch<MpzisCaseResponse>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/mpzis`
    );
  },

  async createMpzisDraft(
    mustahikId: string | number,
    draft?: Partial<MpzisDraft>,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<MpzisDraft>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...sanitizeMpzisDraft(draft), ...meta };
    return apiFetch<MpzisDraft>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/mpzis/drafts`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  async saveMpzisDraft(
    mustahikId: string | number,
    mpzisId: string | number,
    draft: Partial<MpzisDraft>,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<MpzisDraft>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...sanitizeMpzisDraft(draft), ...meta };
    return apiFetch<MpzisDraft>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/mpzis/${encodeURIComponent(String(mpzisId))}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  async submitMpzis(
    mustahikId: string | number,
    mpzisId: string | number,
    draft?: Partial<MpzisDraft>,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<MpzisDraft>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...sanitizeMpzisDraft(draft), ...meta };
    return apiFetch<MpzisDraft>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/mpzis/${encodeURIComponent(String(mpzisId))}/submit`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  async decideMpzisStep(
    mustahikId: string | number,
    mpzisId: string | number,
    step: MpzisStepKey,
    payload: { action: 'approve' | 'return'; note?: string; recovery?: boolean; override_reason?: string },
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<MpzisDraft>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...payload, ...meta };
    return apiFetch<MpzisDraft>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/mpzis/${encodeURIComponent(String(mpzisId))}/approvals/${encodeURIComponent(step)}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  // 5. PPD & Finance (8 methods)
  async getPpd(mustahikId: string | number): Promise<ApiEnvelope<PpdCaseResponse>> {
    return apiFetch<PpdCaseResponse>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/ppd`
    );
  },

  async createPpdDraft(
    mustahikId: string | number,
    draft?: Partial<PpdDraft>,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<PpdDraft>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...sanitizePpdDraft(draft), ...meta };
    return apiFetch<PpdDraft>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/ppd/drafts`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  async savePpdDraft(
    mustahikId: string | number,
    ppdId: string | number,
    draft: Partial<PpdDraft>,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<PpdDraft>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...sanitizePpdDraft(draft), ...meta };
    return apiFetch<PpdDraft>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/ppd/${encodeURIComponent(String(ppdId))}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  async submitPpd(
    mustahikId: string | number,
    ppdId: string | number,
    draft?: Partial<PpdDraft>,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<PpdDraft>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...sanitizePpdDraft(draft), ...meta };
    return apiFetch<PpdDraft>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/ppd/${encodeURIComponent(String(ppdId))}/submit`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  async financeCheckPpd(
    mustahikId: string | number,
    ppdId: string | number,
    payload?: { note?: string },
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<PpdDraft>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...payload, ...meta };
    return apiFetch<PpdDraft>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/ppd/${encodeURIComponent(String(ppdId))}/finance-check`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  async financeApprovePpd(
    mustahikId: string | number,
    ppdId: string | number,
    payload?: { note?: string },
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<PpdDraft>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...payload, ...meta };
    return apiFetch<PpdDraft>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/ppd/${encodeURIComponent(String(ppdId))}/finance-approve`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  async recordPaymentProof(
    mustahikId: string | number,
    ppdId: string | number,
    formData: FormData,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<PaymentRecordResponse>> {
    const headers = buildCommandHeaders(meta);
    return apiFetch<PaymentRecordResponse>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/ppd/${encodeURIComponent(String(ppdId))}/payment`,
      {
        method: 'POST',
        headers,
        body: formData,
      }
    );
  },

  async verifyPayment(
    mustahikId: string | number,
    ppdId: string | number,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<PaymentRecordResponse>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...meta };
    return apiFetch<PaymentRecordResponse>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/ppd/${encodeURIComponent(String(ppdId))}/payment/verify`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  // 6. Completion & Artifacts (4 methods)
  async recordRecipientConfirmation(
    mustahikId: string | number,
    ppdId: string | number,
    data: FormData | RecipientConfirmationPayload,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<RecipientConfirmationResponse>> {
    const headers = buildCommandHeaders(meta);
    let body: FormData | string;

    if (data instanceof FormData) {
      body = data;
    } else if (data.evidence_file) {
      const fd = new FormData();
      fd.append('method', data.method);
      fd.append('recipient_name_snapshot', data.recipient_name_snapshot);
      fd.append('confirmed_at', data.confirmed_at);
      fd.append('note', data.note || '');
      fd.append('evidence', data.evidence_file);
      if (meta?.expected_snapshot_hash) fd.append('expected_snapshot_hash', meta.expected_snapshot_hash);
      if (meta?.expected_revision) fd.append('expected_revision', String(meta.expected_revision));
      body = fd;
    } else {
      body = JSON.stringify({ ...data, ...meta });
    }

    return apiFetch<RecipientConfirmationResponse>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/ppd/${encodeURIComponent(String(ppdId))}/recipient-confirmation`,
      {
        method: 'POST',
        headers,
        body,
      }
    );
  },

  async completePpd(
    mustahikId: string | number,
    ppdId: string | number,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<PpdDraft & { completion_hash?: string; correlation_id?: string }>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...meta };
    return apiFetch<PpdDraft & { completion_hash?: string; correlation_id?: string }>(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/ppd/${encodeURIComponent(String(ppdId))}/complete`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  async downloadArtifact(
    mustahikId: string | number,
    fileId: string | number,
    disposition?: 'inline' | 'attachment'
  ): Promise<Blob> {
    const query = disposition ? `?disposition=${encodeURIComponent(disposition)}` : '';
    return fetchAuthenticatedBlob(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/artifacts/${encodeURIComponent(String(fileId))}${query}`
    );
  },

  async downloadCaseDocument(downloadUrl: string): Promise<Blob> {
    return fetchAuthenticatedBlob(downloadUrl);
  },

  async downloadReceipt(
    mustahikId: string | number,
    ppdId: string | number
  ): Promise<Blob> {
    return fetchAuthenticatedBlob(
      `/api/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/ppd/${encodeURIComponent(String(ppdId))}/receipt`
    );
  },

  // 7. Case Retention & Archival (2 methods)
  async archiveMustahik(
    mustahikId: string | number,
    payload: ArchiveCasePayload,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<ArchiveCaseResponse>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...payload, ...meta };
    return apiFetch<ArchiveCaseResponse>(
      `/api/mustahik/${encodeURIComponent(String(mustahikId))}/archive`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  async restoreMustahik(
    mustahikId: string | number,
    payload: ArchiveCasePayload,
    meta?: P0CommandMeta
  ): Promise<ApiEnvelope<RestoreCaseResponse>> {
    const headers = buildCommandHeaders(meta);
    const body = { ...payload, ...meta };
    return apiFetch<RestoreCaseResponse>(
      `/api/mustahik/${encodeURIComponent(String(mustahikId))}/restore`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  // 8. Legacy Reconciliation (Admin only)
  async startLegacyReconciliation(
    mustahikId: string | number,
    payload: { note?: string } = {},
    meta?: P0CommandMeta
  ): Promise<any> {
    const headers = buildCommandHeaders(meta);
    const body = { ...payload, ...meta };
    return apiFetch(
      `/api/admin/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/reconcile/start`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  async completeLegacyReconciliation(
    mustahikId: string | number,
    payload: { note?: string; reason?: string } = {},
    meta?: P0CommandMeta
  ): Promise<any> {
    const headers = buildCommandHeaders(meta);
    const body = { ...payload, ...meta };
    return apiFetch(
      `/api/admin/penyaluran/mustahik/${encodeURIComponent(String(mustahikId))}/reconcile/complete`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }
    );
  },

  // Divisi Penerimaan API
  penerimaan: penerimaanApi,
};
