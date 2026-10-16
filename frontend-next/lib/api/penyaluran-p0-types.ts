/**
 * Canonical P0 Penyaluran Workflow Type Definitions
 * Source: BAZNAS Mustahik P0 Digitalization Architecture
 */

// ==========================================
// 1. ENUMS & LITERAL UNIONS
// ==========================================

export type HouseOwnership = 'Kontrak' | 'Milik Sendiri' | 'Orang Tua (Menumpang)';

export type FundSource = 'Zakat' | 'Infaq/Shodaqoh' | 'DSKL' | 'Hibah';

export type RecipientType = 'Individu' | 'Keluarga' | 'Kelompok / Yayasan';

export type PaymentType = 'Uang Muka' | 'Reimbursement' | 'Pembayaran' | 'Lain-lain';

export type ConfirmationMethod = 'Tatap Muka' | 'Telepon' | 'WhatsApp' | 'Tanda Terima';

export type MpzisStepKey =
  | 'proposed'
  | 'examined'
  | 'ashnaf_verified'
  | 'responsible_acknowledged'
  | 'approved';

export type AssessmentStatus =
  | 'draft'
  | 'submitted'
  | 'accepted'
  | 'returned'
  | 'superseded'
  | 'legacy_unverified';

export type MpzisStatus =
  | 'draft'
  | 'submitted'
  | 'proposed'
  | 'examined'
  | 'ashnaf_verified'
  | 'responsible_acknowledged'
  | 'approved'
  | 'returned'
  | 'superseded'
  | 'legacy_unverified';

export type PpdStatus =
  | 'draft'
  | 'submitted'
  | 'finance_checked'
  | 'finance_approved'
  | 'payment_recorded'
  | 'payment_verified'
  | 'recipient_confirmed'
  | 'completed'
  | 'returned'
  | 'superseded'
  | 'legacy_unverified';

export type WorkflowMode = 'p0' | 'legacy' | 'legacy_reconciliation';

export type ArtifactType =
  | 'assessment'
  | 'mpzis'
  | 'ppd'
  | 'payment'
  | 'recipient_confirmation'
  | 'case'
  | 'legacy_reconciliation';

export type ApprovalAction =
  | 'submit'
  | 'accept'
  | 'approve'
  | 'return'
  | 'record'
  | 'confirm'
  | 'complete'
  | 'archive'
  | 'restore';

export type ReceiptStatus = 'pending' | 'ready' | 'failed';

export type ArtifactFileKind =
  | 'supporting_document'
  | 'payment_proof'
  | 'recipient_confirmation'
  | 'system_receipt_pdf';

// ==========================================
// 2. COMMON COMMAND & ERROR TYPES
// ==========================================

export interface P0CommandMeta {
  idempotency_key?: string;
  correlation_id?: string;
  expected_status?: string;
  expected_version?: number;
  expected_revision?: number;
  expected_snapshot_hash?: string | null;
  application_id?: number | null;
  note?: string;
}

export type P0FieldErrors = Record<string, string>;

// ==========================================
// 3. P0 INTAKE TYPES
// ==========================================

export interface P0IntakePayload {
  name: string;
  beneficiary_name?: string;
  applicant_status?: string;
  nik?: string;
  kk_number?: string;
  phone?: string;
  marital_status?: string;
  pob?: string;
  dob?: string;
  occupation?: string;
  work_place?: string;
  education_level?: string;
  address?: string;
  rt_rw?: string;
  kelurahan?: string;
  kecamatan?: string;
  kabupaten_kota?: string;
  province?: string;
  house_ownership?: HouseOwnership;
  family_dependents?: number;
  monthly_income?: number;
  monthly_expense?: number;
  program?: string;
  request_title?: string;
  asnaf?: string;
  fund_source?: FundSource;
  distribution_purpose?: string;
  parent_occupation?: string;
  beneficiary_count?: number;
  payment_method?: string;
  bank_name?: string;
  bank_account_name?: string;
}

export interface P0IntakeResponse {
  id: number;
  file_no: string;
  received_date: string;
  name: string;
  program: string;
  request_title: string;
  application_id: number | null;
  status: string;
  workflow_mode: 'p0';
  workflow_version: number;
}

// ==========================================
// 4. ASSESSMENT TYPES (18 Source Fields)
// ==========================================

export interface AssessmentSourceFields {
  // Household (5)
  husband_in_household: boolean | null;
  husband_name: string | null;
  wife_in_household: boolean | null;
  wife_name: string | null;
  child_count: number | null;
  // Housing (4)
  house_ownership: HouseOwnership | null;
  home_address: string | null;
  address_matches_ktp: boolean | null;
  monthly_rent_amount: number | string | null;
  // Livelihood (6)
  husband_occupation: string | null;
  husband_monthly_income: number | string | null;
  wife_occupation: string | null;
  wife_monthly_income: number | string | null;
  child_occupation: string | null;
  child_monthly_support: number | string | null;
  // Request History (3)
  assistance_request: string | null;
  applied_to_baznas_before: boolean | null;
  previous_application_year: number | null;
}

export interface AssessmentDraft extends Partial<AssessmentSourceFields> {
  id?: number;
  mustahik_id?: number;
  application_id?: number | null;
  revision?: number;
  supersedes_id?: number | null;
  status?: AssessmentStatus;
  source?: 'p0';
  template_code?: 'ASSESSMENT_LANGSUNG_MUSTAHIK';
  template_version?: '2026-09-13';
  snapshot_json?: Record<string, unknown> | null;
  snapshot_hash?: string | null;
  source_fields?: AssessmentSourceFields;
  created_by_id?: number | null;
  updated_by_id?: number | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  note?: string;
}

export interface AssessmentCaseResponse {
  mustahik_id: number;
  application_id: number | null;
  status: string;
  workflow_mode: WorkflowMode;
  workflow_version: number;
  active: AssessmentDraft | null;
  assessment: AssessmentDraft | null;
  revision_history: Array<{
    id: number;
    revision: number;
    status: AssessmentStatus;
    supersedes_id: number | null;
    snapshot_hash: string | null;
  }>;
  history: unknown[];
}

// ==========================================
// 5. MPZIS TYPES (5-Step Approvals)
// ==========================================

export interface MpzisAddressSnapshot {
  address: string | null;
  rt_rw: string | null;
  kelurahan: string | null;
  kecamatan: string | null;
  kabupaten_kota: string | null;
  province: string | null;
}

export interface MpzisSourceFields {
  form_number: string | null;
  mpzis_date: string | null;
  program_classification: string | null;
  purpose: string | null;
  asnaf: string | null;
  fund_source: FundSource | null;
  recipient_name: string | null;
  recipient_type: RecipientType | null;
  beneficiary_count: number | null;
  total_amount: number | string | null;
  address_snapshot: MpzisAddressSnapshot | null;
  marital_status_snapshot: string | null;
  recipient_section_confirmed?: boolean | null;
  fund_source_confirmed?: boolean | null;
}

export interface MpzisApprovalStepItem {
  step: MpzisStepKey;
  approval: ArtifactApproval | null;
}

export interface MpzisDraft extends Partial<MpzisSourceFields> {
  id?: number;
  mustahik_id?: number;
  application_id?: number | null;
  revision?: number;
  supersedes_id?: number | null;
  status?: MpzisStatus;
  source?: 'p0';
  template_code?: 'F-BPP/06';
  template_version?: '2026-09-13';
  snapshot_json?: Record<string, unknown> | null;
  snapshot_hash?: string | null;
  source_fields?: MpzisSourceFields;
  approvals?: ArtifactApproval[];
  created_by_id?: number | null;
  submitted_by_id?: number | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  note?: string;
}

export interface MpzisCaseResponse {
  mustahik_id: number;
  application_id: number | null;
  status: string;
  workflow_mode: WorkflowMode;
  workflow_version: number;
  active: MpzisDraft | null;
  mpzis: MpzisDraft | null;
  approval_steps: MpzisApprovalStepItem[];
  revision_history: Array<{
    id: number;
    revision: number;
    status: MpzisStatus;
    supersedes_id: number | null;
    snapshot_hash: string | null;
  }>;
  history: unknown[];
}

// ==========================================
// 6. PPD & RAB TYPES
// ==========================================

export interface RabLine {
  id?: number;
  ppd_id?: number;
  line_no: number;
  register_number: string;
  deskripsi?: string;
  description: string;
  jumlah?: number;
  harga_satuan?: number;
  total?: number;
  amount: string | number;
}

export interface PpdAttachment {
  id?: number;
  file_id: number;
  kind: 'supporting_document';
  mime_type: string;
  byte_size: number;
  sha256: string;
}

export interface PpdSourceFields {
  form_number: string | null;
  ppd_number: string | null;
  transaction_number: string | null;
  purpose: string | null;
  fund_source: FundSource | null;
  fund_source_confirmed?: boolean | null;
  payment_type: PaymentType | null;
  payment_type_confirmed?: boolean | null;
  payment_type_other: string | null;
  bank_name: string | null;
  bank_account_last4?: string | null;
  bank_account_masked?: string | null;
  bank_account_name: string | null;
  requester_name?: string | null;
  requester_role?: string | null;
  requester_department?: string | null;
  amount?: string | number | null;
  amount_in_words?: string | null;
}

export interface PpdReceiptMetadata {
  status: ReceiptStatus | null;
  file_id: number | null;
  payload_sha256: string | null;
  receipt_payload_sha256?: string | null;
  file_sha256: string | null;
  created_at: string | null;
}

export interface PpdDraft extends Partial<PpdSourceFields> {
  id?: number;
  mustahik_id?: number;
  application_id?: number | null;
  revision?: number;
  supersedes_id?: number | null;
  status?: PpdStatus;
  source?: 'p0';
  template_code?: 'F-PKP/03';
  template_version?: '2026-09-13';
  mpzis_id?: number | null;
  snapshot_json?: Record<string, unknown> | null;
  snapshot_hash?: string | null;
  bank_account_number?: string;
  source_fields?: PpdSourceFields;
  rab_lines?: RabLine[];
  attachments?: PpdAttachment[];
  created_by_id?: number | null;
  submitted_at?: string | null;
  finance_checked_at?: string | null;
  finance_approved_at?: string | null;
  receipt?: PpdReceiptMetadata;
  note?: string;
}

export interface PpdCaseResponse {
  mustahik_id: number;
  application_id: number | null;
  status: string;
  workflow_mode: WorkflowMode;
  workflow_version: number;
  active: PpdDraft | null;
  ppd: PpdDraft | null;
  revision_history: Array<{
    id: number;
    revision: number;
    status: PpdStatus;
    supersedes_id: number | null;
    snapshot_hash: string | null;
  }>;
  history: unknown[];
}

// ==========================================
// 7. PAYMENT & CONFIRMATION TYPES
// ==========================================

export interface PaymentRecordResponse {
  id: number;
  ppd_id: number;
  transaction_number: string;
  paid_amount: string | number;
  paid_at: string;
  proof_file_id: number;
  recorded_by_id: number;
  verification_status: 'pending' | 'verified';
  verified_by_id?: number | null;
  verified_at?: string | null;
  snapshot_hash?: string | null;
}

export interface RecipientConfirmationPayload {
  method: ConfirmationMethod;
  recipient_name_snapshot: string;
  confirmed_at: string;
  note: string;
  evidence_file?: File | Blob;
}

export interface RecipientConfirmationResponse {
  id: number;
  ppd_id: number;
  method: ConfirmationMethod;
  recipient_name_snapshot: string;
  confirmed_at: string;
  note: string;
  evidence_file_id: number | null;
  recorded_by_id: number;
  snapshot_hash: string;
}

// ==========================================
// 8. APPROVAL & FILE TYPES
// ==========================================

export interface ArtifactApproval {
  id: number;
  mustahik_id?: number;
  artifact_type: ArtifactType;
  artifact_id: number;
  artifact_revision: number;
  approval_step: string;
  action: ApprovalAction;
  snapshot_hash?: string | null;
  note?: string | null;
  actor_id?: number | string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  actor_level?: string | null;
  actor_division?: string | null;
  created_at?: string | null;
  is_admin_override?: boolean;
  override_reason?: string | null;
  correlation_id?: string | null;
}

export interface ArtifactFile {
  id: number | string;
  mustahik_id?: number;
  artifact_type: string | null;
  artifact_id?: number;
  artifact_revision?: number;
  kind: ArtifactFileKind | string;
  filename?: string;
  stored_name?: string;
  original_name?: string;
  mime_type: string | null;
  byte_size: number | null;
  sha256: string | null;
  created_at: string | null;
  download_url?: string;
}

// ==========================================
// 9. CASE WORKSPACE MODEL (Canonical Server-Truth)
// ==========================================

export interface P0CaseHeader {
  id: number;
  nomor_registrasi: string;
  file_no: string;
  status: string;
  p0_version: number;
  workflow_version: number;
  workflow_mode: WorkflowMode;
  is_legacy: boolean;
  is_reconciliation?: boolean;
  legacy_banner: boolean;
  reconciliation_banner?: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by_id: number | null;
  archive_reason: string | null;
}

export interface P0MustahikProfile {
  id: number;
  nama: string;
  name: string;
  nik_masked: string | null;
  phone_masked: string | null;
  applicant_status: string;
  kategori: string | null;
  asnaf: string | null;
  program: string | null;
  address: string | null;
  rt_rw: string | null;
  kelurahan: string | null;
  kecamatan: string | null;
  kabupaten_kota: string | null;
  province: string | null;
}

export interface P0CaseProgress {
  current_stage:
    | 'intake'
    | 'assessment'
    | 'mpzis'
    | 'ppd'
    | 'payment'
    | 'confirmation'
    | 'completion'
    | 'completed'
    | 'archived';
  active_artifact: 'assessment' | 'mpzis' | 'ppd' | null;
  required_action: string | null;
  blocking_reasons: string[];
  is_terminal: boolean;
}

export interface P0AssessmentWorkspacePayload {
  id: number | null;
  revision: number | null;
  status: AssessmentStatus | 'PENDING';
  snapshot_hash: string | null;
  fields: AssessmentSourceFields | null;
}

export interface P0MpzisApprovalCard {
  stage: number;
  step_key: MpzisStepKey;
  role: string;
  user_id: number | string | null;
  user_nama: string | null;
  status: 'APPROVED' | 'PENDING';
  timestamp: string | null;
  snapshot_hash: string | null;
  note: string | null;
}

export interface P0MpzisWorkspacePayload {
  id: number;
  revision: number;
  status: MpzisStatus;
  form_number: string | null;
  total_amount: number | null;
  snapshot_hash: string | null;
  approvals: P0MpzisApprovalCard[];
}

export interface P0PpdRabLineWorkspace {
  id?: number;
  line_no: number;
  register_number: string | null;
  deskripsi: string;
  description: string;
  jumlah: number;
  harga_satuan: number;
  total: number;
  amount: number;
}

export interface P0PpdWorkspacePayload {
  id: number | null;
  revision: number | null;
  status: PpdStatus | null;
  form_number?: string | null;
  ppd_number?: string | null;
  transaction_number?: string | null;
  total_rab: number;
  amount: number;
  amount_in_words?: string | null;
  bank_name?: string | null;
  bank_account_masked?: string | null;
  bank_account_name?: string | null;
  snapshot_hash?: string | null;
  rab_lines: P0PpdRabLineWorkspace[];
}

export interface P0DisbursementWorkspacePayload {
  status: 'pending' | 'recorded' | 'verified';
  paid_amount: number | null;
  paid_at: string | null;
  transaction_number: string | null;
  proof_url: string | null;
  verification_status: string | null;
  verified_at: string | null;
}

export interface P0CompletionWorkspacePayload {
  status: 'pending' | 'confirmed' | 'completed';
  method: string | null;
  confirmed_at: string | null;
  recipient_name: string | null;
  receipt_status: ReceiptStatus | null;
  receipt_url: string | null;
  payload_sha256: string | null;
  file_sha256: string | null;
}

export interface P0CasePermissions {
  can_assess: boolean;
  can_approve_mpzis: boolean;
  allowed_mpzis_roles: string[];
  can_submit_ppd: boolean;
  can_disburse: boolean;
  can_archive: boolean;
  can_restore: boolean;
}

export interface P0TimelineEvent {
  id: number;
  type: 'approval' | 'activity' | 'decision';
  action: string;
  actor: string;
  note: string | null;
  timestamp: string | null;
}

export interface P0CaseWorkspace {
  success: boolean;
  case: P0CaseHeader;
  mustahik: P0MustahikProfile;
  case_progress: P0CaseProgress;
  assessment: P0AssessmentWorkspacePayload | null;
  mpzis_approvals: P0MpzisApprovalCard[];
  mpzis: P0MpzisWorkspacePayload | null;
  ppd: P0PpdWorkspacePayload;
  disbursement: P0DisbursementWorkspacePayload;
  completion: P0CompletionWorkspacePayload;
  permissions: P0CasePermissions;
  capabilities: Record<string, boolean>;
  timeline: P0TimelineEvent[];
  history: P0TimelineEvent[];
  documents: ArtifactFile[];
}

// ==========================================
// 10. ARCHIVE & RESTORE TYPES
// ==========================================

export interface ArchiveCasePayload {
  note: string;
  reason?: string;
  expected_status?: string;
  expected_version?: number;
}

export interface ArchiveCaseResponse {
  id: number;
  archived: true;
  archived_at: string;
  workflow_version: number;
}

export interface RestoreCaseResponse {
  id: number;
  archived: false;
  restored_at: string;
  workflow_version: number;
}
