export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  count?: number;
}

export interface CurrentUser {
  id: string | number;
  name: string;
  email: string;
  role: 'admin' | 'penyaluran' | 'surveyor' | 'penerimaan' | 'keuangan' | 'sdm';
  division?: string;
  level?: 'staff' | 'leader' | 'admin';
  avatar?: string;
}

export interface OperationalUser extends CurrentUser {
  is_active: boolean;
  last_login?: string | null;
  created_at?: string;
}

export interface AssessmentRecord {
  id?: number | string;
  surveyor_name?: string;
  surveyor_phone?: string;
  survey_date?: string;
  survey_method?: string;
  house_index?: string | number;
  asset_index?: string | number;
  income_index?: string | number;
  spiritual_score?: number | string;
  overall_score?: number | string;
  priority?: string;
  recommendation?: string;
  narrative_conclusion?: string;
  notes?: string;
}

export interface Mustahik {
  id: number | string;
  file_no?: string;
  name: string;
  beneficiary_name?: string;
  nik: string;
  kk_number?: string;
  phone?: string;
  address?: string;
  subdistrict?: string;
  village?: string;
  kecamatan?: string;
  kelurahan?: string;
  rt_rw?: string;
  housing_status?: string;
  marital_status?: string;
  gender?: string;
  dob?: string;
  pob?: string;
  job?: string;
  occupation?: string;
  family_dependents?: number;
  monthly_income?: number;
  monthly_expense?: number;
  remaining_income?: number;
  asnaf?: string;
  program?: string;
  sub_program?: string;
  assistance_type?: string;
  recommended_amount?: number;
  approved_amount?: number;
  received_date?: string;
  survey_date?: string;
  surveyor_name?: string;
  survey_recommendation?: string;
  status:
    | 'Diajukan'
    | 'Verifikasi Administrasi'
    | 'Survey'
    | 'Persetujuan MPZIS'
    | 'Pengajuan Dana (FPD)'
    | 'Pengajuan Dana (PPD)'
    | 'Penyaluran Selesai'
    | 'Ditolak'
    | string;
  priority?: string;
  bank_name?: string;
  bank_account?: string;
  bank_account_name?: string;
  rejection_reason?: string;
  assessments?: AssessmentRecord[];
  created_at?: string;
  updated_at?: string;
  workflow_version?: number;
}

export interface PenyaluranByKecamatan {
  id: string;
  name: string;
  totalMustahik: number;
  totalDisalurkan: number;
  desil1Count: number;
  topProgram?: string;
  dominantAsnaf?: string;
  urgencyLevel?: 'Tinggi' | 'Sedang' | 'Rendah';
  coordinates?: { lat: number; lng: number };
  pilarBreakdown?: {
    pendidikan: number;
    kesehatan: number;
    kemanusiaan: number;
    ekonomi: number;
    dakwah: number;
  };
  kelurahanList?: string[];
  demo?: boolean;
}

export interface PenyaluranOverviewMetrics {
  totalPenyaluran: number;
  penyaluranBulanIni: number;
  totalMustahik: number;
  totalJiwa?: number;
  efektivitasPenyaluran: number;
  targetRkat: number;
  balance: number;
  growthRate?: number;
  slaComplianceRate?: number;
}

export interface AsnafBreakdownItem {
  name: string;
  count: number;
  amount: number;
  percentage: number;
  color: string;
}

export interface ProgramImpactItem {
  id: string;
  name: string;
  category: string;
  target: number;
  realizedAmount: number;
  beneficiariesCount: number;
  percentage: number;
  color: string;
  desc: string;
}

export interface MonthlyTrendItem {
  month: string;
  realisasi: number;
  target: number;
  mustahik: number;
}

export interface PenyaluranOverviewResponse {
  period: string;
  metrics: PenyaluranOverviewMetrics;
  monthlyTrend: MonthlyTrendItem[];
  asnafBreakdown: AsnafBreakdownItem[];
  programImpact: ProgramImpactItem[];
  actionRail: {
    slaCounts: {
      perluTindakan: number;
      lewatSla: number;
      dokumenKurang: number;
    };
    queueItems: Mustahik[];
    recentActivities: ActivityLogItem[];
  };
}

export interface PilarInitiative {
  id?: number | string;
  code: string;
  name: string;
  pic: string;
  status: string;
  nextMilestone?: string;
  next_milestone?: string;
  mustahik?: string;
  realized?: string;
  pct?: number;
  pilar_id?: string;
  pilarId?: string;
  mustahik_target?: number;
  mustahikTarget?: number;
  mustahik_count?: number;
  budget_amount?: number;
  budgetAmount?: number;
  realized_amount?: number;
  realizedAmount?: number;
}

export interface PilarProgramData {
  id: string;
  pilarNum: string;
  name: string;
  category: string;
  amount: string;
  rawAmount: number;
  rawBudget: number;
  percentage: number;
  beneficiaries: string;
  color: string;
  impactDesc: string;
  metrics: {
    primaryLabel: string;
    primaryValue: string;
    primaryGrowth: string;
    successLabel: string;
    successValue: string;
    successRate: string;
    avgLabel: string;
    avgValue: string;
    progLabel: string;
    progValue: string;
    districtLabel: string;
    districtValue: string;
    newLabel: string;
    newValue: string;
  };
  monthlyBars: Array<{ m: string; realisasi: number; target: number; active: boolean }>;
  asnafBreakdown: Array<{ name: string; count: string; pct: string; color: string }>;
  topKecamatan: Array<{ rank: number; name: string; count: string; pct: string }>;
  subPrograms: PilarInitiative[];
}

export interface MustahikStageCounts {
  all: number;
  diajukan: number;
  verifikasi: number;
  survey: number;
  mpzis: number;
  ppd: number;
  selesai: number;
  ditolak: number;
}

export interface MustahikDecisionPayload {
  action: 'approve' | 'reject';
  target_status?: string;
  notes?: string;
  reason?: string;
  surveyor_name?: string;
  approved_amount?: number;
  expected_status: string;
  expected_version: number;
  overall_score?: number;
  actor_name?: string;
}

export interface PublicApplicationResult {
  id: number | string;
  file_no: string;
  received_date?: string;
  name?: string;
  program?: string;
  status?: Mustahik['status'];
}

export interface SuratPermohonanPayload {
  applicant_status: 'Perorangan' | 'Lembaga';
  name: string;
  nik?: string;
  kk_number?: string;
  phone?: string;
  address: string;
  rt_rw?: string;
  kelurahan?: string;
  kecamatan?: string;
  program?: string;
  request_title: string;
  proposed_amount?: string | number;
  notes?: string;
  pic_name?: string;
  pic_nik?: string;
  pic_phone?: string;
}

export interface PublicTrackingTimelineItem {
  phase: number;
  name?: string;
  description?: string;
  date?: string | null;
  status: 'completed' | 'active' | 'pending' | 'rejected';
}

export interface PublicTrackingResult {
  mustahik: Partial<Pick<Mustahik, 'name' | 'kecamatan' | 'program' | 'asnaf' | 'status' | 'received_date'>> & Pick<Mustahik, 'file_no'>;
  timeline?: PublicTrackingTimelineItem[];
  status?: Mustahik['status'];
  is_rejected?: boolean;
  rejection_reason?: string;
}

export interface PenyaluranTransaction {
  id: number | string;
  mustahik_id: number | string;
  transaction_number?: string;
  ppd_number?: string;
  form_number?: string;
  amount: number;
  purpose?: string;
  payment_type?: string;
  disbursement_date?: string;
  created_at?: string;
  file_no?: string;
  recipient_name: string;
  program?: string;
  asnaf?: string;
  kecamatan?: string;
  status: Mustahik['status'];
}

export interface MasterDataRecord {
  id: number | string;
  category: string;
  record_key: string;
  label: string;
  description?: string;
  is_active: boolean;
  sort_order: number;
  updated_at?: string;
}

export interface ActivityLogItem {
  id: number;
  mustahik_id: number;
  actor_name: string;
  action_type: string;
  title: string;
  description: string;
  old_status?: string;
  new_status?: string;
  created_at: string;
}

export interface ApprovalDecision {
  id: number | string;
  mustahik_id: number | string;
  stage: string;
  action: 'approve' | 'reject' | 'return' | 'hold';
  previous_status: string;
  next_status: string;
  note: string;
  approved_amount?: number | null;
  actor_id?: number | string | null;
  actor_name: string;
  actor_role: string;
  file_no?: string;
  mustahik_name?: string;
  created_at: string;
}

export interface ReportItem {
  id: string;
  category: string;
  period: string;
  title: string;
  description: string;
  scope: string;
  status: 'Siap diekspor' | 'Perlu pembaruan' | 'Arsip';
  file_url: string;
  updated_at: string;
  metrics?: Record<string, unknown>;
}

export interface ReportKpi {
  label: string;
  value: string;
  detail: string;
  trend: string;
}

export interface ReportDistributionItem {
  label: string;
  value: string;
  percentage: number;
  tone: 'emerald' | 'sky' | 'amber' | 'violet' | 'rose';
}

export interface ReportListResponse {
  success: boolean;
  reports: ReportItem[];
  kpis: ReportKpi[];
  programAllocation: ReportDistributionItem[];
  asnafDistribution: ReportDistributionItem[];
  count: number;
  dataStatus?: 'ready' | 'empty' | 'demo';
}

// ==========================================
// Divisi Penerimaan Domain Types
// ==========================================

export type PenerimaanStatus =
  | 'Masuk'
  | 'Menunggu Validasi'
  | 'Terverifikasi'
  | 'Menunggu Approval'
  | 'Menunggu Rekonsiliasi'
  | 'Terekonsiliasi'
  | 'Posted'
  | 'Ditolak'
  | 'Duplikat'
  | 'Data Tidak Lengkap'
  | 'Perlu Klarifikasi'
  | 'Dispute'
  | 'Dibatalkan';

export type PenerimaanChannel =
  | 'portal'
  | 'transfer_bank'
  | 'bank_transfer'
  | 'qris'
  | 'tunai'
  | 'counter_kasir'
  | 'virtual_account'
  | 'payment_gateway'
  | 'jemput_zakat';

export type PenerimaanChannelCategory = 'digital' | 'manual' | 'cash_batch';

export type PenerimaanFundType =
  | 'zakat_maal'
  | 'zakat_fitrah'
  | 'zakat_penghasilan'
  | 'infak'
  | 'infak_terikat'
  | 'sedekah'
  | 'fidyah'
  | 'dskh'
  | 'csr'
  | 'lainnya';

export type PenerimaanAction =
  | 'validate'
  | 'approve'
  | 'reject'
  | 'mark_duplicate'
  | 'mark_incomplete'
  | 'request_clarification'
  | 'resolve_clarification'
  | 'reconcile'
  | 'post'
  | 'dispute'
  | 'resolve_dispute'
  | 'cancel'
  | 'reverse';

export interface Muzakki {
  id: number | string;
  npwz?: string | null;
  name: string;
  type: 'individu' | 'lembaga' | 'anonim';
  identity_type?: 'ktp' | 'sim' | 'paspor' | 'npwp' | 'nib' | 'lainnya' | string;
  identity_number?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  total_donations_count?: number;
  total_donations_amount?: string;
  last_donation_date?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PenerimaanTransaction {
  id: number | string;
  transaction_number: string;
  receipt_number?: string | null;
  channel: PenerimaanChannel;
  channel_category: PenerimaanChannelCategory;
  provider_name?: string | null;
  provider_ref?: string | null;
  account_id?: number | string | null;
  reconciliation_batch_id?: number | string | null;
  muzakki_id?: number | string | null;
  muzakki_name: string;
  muzakki_phone?: string | null;
  muzakki_email?: string | null;
  fund_type: PenerimaanFundType;
  program_id?: number | string | null;
  program_name?: string | null;
  sub_program?: string | null;
  amount: string;
  fee_amount?: string;
  net_amount?: string;
  status: PenerimaanStatus;
  payment_method?: string | null;
  evidence_url?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  is_manual: boolean;
  is_duplicate: boolean;
  is_incomplete: boolean;
  is_flagged: boolean;
  risk_flags?: string[];
  rejection_reason?: string | null;
  clarification_notes?: string | null;
  created_by_id?: number | string | null;
  created_by_name?: string | null;
  validated_by_id?: number | string | null;
  validated_by_name?: string | null;
  validated_at?: string | null;
  approved_by_id?: number | string | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  reconciled_at?: string | null;
  posted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReconciliationBatch {
  id: number | string;
  batch_number: string;
  channel: PenerimaanChannel;
  account_name: string;
  account_number: string;
  period_start: string;
  period_end: string;
  total_expected_count: number;
  total_expected_amount: string;
  total_matched_count: number;
  total_matched_amount: string;
  discrepancy_amount: string;
  status: 'draft' | 'in_progress' | 'matched' | 'discrepancy' | 'closed';
  notes?: string | null;
  closed_by_id?: number | string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRecord {
  id: number | string;
  transaction_id: number | string;
  actor_id: number | string;
  actor_name: string;
  actor_role: string;
  action: 'approve' | 'reject' | 'request_clarification' | 'reopen' | 'reverse';
  from_status: PenerimaanStatus;
  to_status: PenerimaanStatus;
  notes?: string | null;
  created_at: string;
}

export interface PenerimaanTransitionResult {
  allowed: boolean;
  nextStatus?: PenerimaanStatus;
  reason?: string;
}

export interface CursorPaginatedParams {
  cursor?: string;
  limit?: number;
}

export interface CursorPaginatedResponse<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
  total_count?: number;
}

export interface PenerimaanOverviewMetrics {
  total_collected: string;
  total_transactions: number;
  validated_transaction_count?: number;
  active_muzakki_count?: number;
  pending_validation_count: number;
  pending_approval_count: number;
  unreconciled_count: number;
  average_amount: string;
  target_attainment_pct: number;
  exception_count: number;
}

export interface PenerimaanTrendItem {
  date: string;
  amount: string;
  count: number;
}

export interface PenerimaanFundTypeBreakdown {
  fund_type: PenerimaanFundType;
  name: string;
  amount: string;
  percentage: number;
}

export interface PenerimaanChannelBreakdown {
  channel: PenerimaanChannel;
  name: string;
  amount: string;
  percentage: number;
}

export interface PenerimaanActionQueueItem {
  id: string | number;
  title: string;
  type: 'validation' | 'approval' | 'reconciliation' | 'clarification' | 'dispute' | string;
  count: number;
  link: string;
}

export interface PenerimaanActivityItem {
  id: string | number;
  transaction_id?: string | number | null;
  transaction_number?: string | null;
  actor_name: string;
  action: string;
  description: string;
  amount: string;
  timestamp: string;
  status?: PenerimaanStatus;
}

export interface PenerimaanOverviewResponse {
  period: string;
  metrics: PenerimaanOverviewMetrics;
  trend: PenerimaanTrendItem[];
  fund_type_breakdown: PenerimaanFundTypeBreakdown[];
  channel_breakdown: PenerimaanChannelBreakdown[];
  action_queue: PenerimaanActionQueueItem[];
  recent_activity: PenerimaanActivityItem[];
}

export interface PenerimaanTransactionQueryParams extends CursorPaginatedParams {
  search?: string;
  status?: PenerimaanStatus;
  channel?: PenerimaanChannel;
  fund_type?: PenerimaanFundType;
  start_date?: string;
  end_date?: string;
  is_flagged?: boolean;
  needs_action?: boolean;
  min_amount?: number;
  max_amount?: number;
  order_by?: string;
  order_dir?: 'asc' | 'desc';
}

export interface CreateManualTransactionPayload {
  channel: PenerimaanChannel;
  fund_type: PenerimaanFundType;
  amount: number;
  muzakki_id?: number | string | null;
  muzakki_name: string;
  muzakki_phone?: string | null;
  muzakki_email?: string | null;
  payment_method?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  evidence_url?: string | null;
  program_id?: number | string | null;
  program_name?: string | null;
  sub_program?: string | null;
  notes?: string | null;
}

export interface PenerimaanTransactionTimelineItem {
  status: PenerimaanStatus;
  timestamp: string;
  actor_name?: string;
  notes?: string | null;
}

export interface PenerimaanTransactionDetail extends PenerimaanTransaction {
  timeline: PenerimaanTransactionTimelineItem[];
  approvals: ApprovalRecord[];
}

export interface BulkValidationResult {
  validated_count: number;
  failed_count: number;
  results: Array<{
    id: string | number;
    success: boolean;
    reason?: string;
    new_status?: PenerimaanStatus;
  }>;
}

export interface MuzakkiQueryParams extends CursorPaginatedParams {
  search?: string;
  type?: 'individu' | 'lembaga' | 'anonim';
  city?: string;
}

export interface MuzakkiDetail extends Muzakki {
  preferred_channel?: string | null;
  recent_transactions: PenerimaanTransaction[];
  donation_summary: {
    total_amount: string;
    total_count: number;
    avg_amount: string;
    first_donation?: string | null;
    last_donation?: string | null;
    preferred_channel?: string | null;
  };
}

export interface DuplicateMuzakkiSuggestion {
  primary: Muzakki;
  duplicates: Muzakki[];
  confidence: number;
  match_reason: string;
}

export interface ReconciliationQueryParams extends CursorPaginatedParams {
  channel?: PenerimaanChannel;
  status?: 'draft' | 'in_progress' | 'matched' | 'discrepancy' | 'closed';
  start_date?: string;
  end_date?: string;
}

export interface CreateBatchPayload {
  channel: PenerimaanChannel;
  account_name: string;
  account_number: string;
  period_start: string;
  period_end: string;
  notes?: string | null;
}

export interface ReconciliationStatementLine {
  id: number | string;
  batch_id: number | string;
  line_number?: number;
  transaction_date: string;
  description: string;
  amount: string;
  reference_number?: string | null;
  matched_transaction_id?: number | string | null;
  status: 'unmatched' | 'matched' | 'variance';
}

export interface ReconciliationBatchDetail extends ReconciliationBatch {
  statement_lines: ReconciliationStatementLine[];
  unmatched_transactions: PenerimaanTransaction[];
}

export interface ImportStatementsResult {
  imported_count: number;
  matched_count: number;
  unmatched_count: number;
  batch_id: number | string;
}

export interface PenerimaanReportQueryParams {
  category?: string;
  period?: string;
  channel?: PenerimaanChannel | string;
  fund_type?: PenerimaanFundType | string;
  start_date?: string;
  end_date?: string;
  account_id?: number | string;
  muzakki_id?: number | string;
  search?: string;
  program_id?: number | string;
  program_search?: string;
  mode?: 'manual' | 'digital' | string;
  is_manual?: boolean | number | string;
  is_flagged?: boolean | number | string;
  view?: 'normal' | 'exceptions' | 'reconciliation' | 'audit' | string;
  reconciliation_status?: 'pending' | 'reconciled' | 'posted' | string;
  sort_by?: string;
  sort_dir?: 'ASC' | 'DESC' | string;
  limit?: number;
  offset?: number;
  page?: number;
  format?: 'xlsx' | 'pdf' | 'csv' | string;
}

export interface PenerimaanReportItem {
  id: string;
  category: string;
  period: string;
  title: string;
  description: string;
  scope: string;
  status: 'Siap diekspor' | 'Perlu pembaruan' | 'Arsip';
  file_url?: string;
  updated_at: string;
  total_rows?: number;
  total_amount?: string;
  data_freshness?: string;
}

export interface PenerimaanAuditReportRow {
  audit_event_id: number | string;
  id: number | string;
  entity_type: string;
  entity_id?: number | string | null;
  action: string;
  actor_id?: number | string | null;
  actor_name: string;
  actor_role?: string | null;
  changes?: string | Record<string, unknown> | null;
  metadata?: string | Record<string, unknown> | null;
  created_at: string;
}

export interface PenerimaanReportSummary {
  meta?: {
    period?: string;
    start_date?: string;
    end_date?: string;
    channel?: string | null;
    fund_type?: string | null;
    data_freshness?: string;
    applied_filters?: Record<string, any>;
  };
  applied_filters?: Record<string, any>;
  reports: PenerimaanReportItem[];
  kpis: {
    total_revenue?: string;
    total_transactions?: number;
    reconciled_pct?: number;
    total_count?: number;
    total_amount?: string;
    total_fee?: string;
    total_net?: string;
    average_amount?: string;
    by_status?: Record<string, number>;
    by_channel?: Record<string, number>;
    by_fund_type?: Record<string, string>;
  };
  preview_transactions?: Array<PenerimaanTransaction | PenerimaanAuditReportRow>;
}

export interface GenerateReportPayload {
  category?: string;
  period?: string;
  format?: 'xlsx' | 'pdf' | 'csv';
  title?: string;
  start_date?: string;
  end_date?: string;
  channel?: PenerimaanChannel | string;
  fund_type?: PenerimaanFundType | string;
  account_id?: number | string;
  filters?: Record<string, unknown>;
}

export interface PenerimaanFundCategoryConfig {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PenerimaanProviderConfig {
  id: number;
  provider_name: string;
  display_name: string;
  is_active: boolean;
  has_secret?: boolean;
  is_secret_set?: boolean;
  secret_key?: string | null;
  secret_masked?: string | null;
  secret_updated_at?: string | null;
  settings?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface PenerimaanExportJobStatus {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  format: 'xlsx' | 'pdf' | 'csv' | string;
  file_name?: string | null;
  file_size?: number;
  download_url?: string;
  error_message?: string | null;
  created_at?: string;
  completed_at?: string | null;
}

export interface PenerimaanChannelConfig {
  id: number | string;
  code: PenerimaanChannel | string;
  name: string;
  category: PenerimaanChannelCategory;
  provider_name?: string | null;
  is_active: boolean;
  settlement_type?: 'realtime' | 'batch_d1' | 'manual';
  updated_at?: string;
}

export interface PenerimaanAccount {
  id: number | string;
  channel_id?: number | string | null;
  channel_code?: string | null;
  bank_name: string;
  account_number: string;
  account_holder?: string;
  account_name?: string;
  channel?: PenerimaanChannel;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PenerimaanSettings {
  approval_threshold: string;
  auto_reconcile_tolerance: string;
  require_evidence_manual: boolean;
  updated_at?: string;
  updated_by?: string;
}

export interface PenerimaanAuditQueryParams extends CursorPaginatedParams {
  entity_type?: string;
  entity_id?: string | number;
  actor_id?: string | number;
  action?: string;
  start_date?: string;
  end_date?: string;
}

export interface PenerimaanAuditLogItem {
  id: number | string;
  entity_type: string;
  entity_id: number | string;
  action: string;
  actor_id?: number | string | null;
  actor_name: string;
  actor_role: string;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  notes?: string | null;
  created_at: string;
}

export interface ImportTransactionsResult {
  job_id: string;
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  errors?: Array<{ row: number; reason: string }>;
}

export interface ImportJobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_rows: number;
  processed_rows: number;
  success_rows: number;
  failed_rows: number;
  errors?: Array<{ row: number; reason: string }>;
  created_at: string;
  completed_at?: string | null;
}

export interface ApiError {
  message: string;
  status: number;
  data?: unknown;
  code?: string;
  field_errors?: Record<string, string>;
}

export * from './penyaluran-p0-types';
