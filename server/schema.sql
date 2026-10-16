-- ====================================================================
-- BAZNAS Data Center V2 - PostgreSQL DDL Schema
-- ====================================================================

-- 1. Table: mustahik (Master Data 60 Columns)
CREATE TABLE IF NOT EXISTS mustahik (
    id SERIAL PRIMARY KEY,
    file_no VARCHAR(50) UNIQUE,
    received_date VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    applicant_status VARCHAR(50) DEFAULT 'Perorangan',
    beneficiary_name VARCHAR(255),
    nik VARCHAR(50),
    kk_number VARCHAR(50),
    phone VARCHAR(50),
    marital_status VARCHAR(50),
    pob VARCHAR(100),
    dob VARCHAR(50),
    occupation VARCHAR(100),
    work_place VARCHAR(150),
    education_level VARCHAR(50),
    address TEXT,
    rt_rw VARCHAR(50),
    kelurahan VARCHAR(100),
    kecamatan VARCHAR(100),
    kabupaten_kota VARCHAR(100) DEFAULT 'Kota Tangerang',
    province VARCHAR(100) DEFAULT 'Banten',
    survey_date VARCHAR(50),
    surveyor_name VARCHAR(150),
    surveyor_phone VARCHAR(50),
    house_ownership VARCHAR(50),
    family_dependents INTEGER DEFAULT 0,
    monthly_income NUMERIC(15, 2) DEFAULT 0,
    monthly_expense NUMERIC(15, 2) DEFAULT 0,
    remaining_income NUMERIC(15, 2) DEFAULT 0,
    survey_recommendation TEXT,
    survey_notes TEXT,
    application_count INTEGER DEFAULT 1,
    beneficiary_count INTEGER DEFAULT 1,
    priority VARCHAR(50),
    recommended_amount NUMERIC(15, 2) DEFAULT 0,
    approved_amount NUMERIC(15, 2) DEFAULT 0,
    mpzis_date VARCHAR(50),
    ppd_number VARCHAR(100),
    disbursement_date VARCHAR(50),
    payment_method VARCHAR(50),
    bank_account VARCHAR(100),
    bank_name VARCHAR(100),
    bank_account_name VARCHAR(150),
    asnaf VARCHAR(100) DEFAULT 'Fakir Miskin',
    fund_source VARCHAR(100) DEFAULT 'Zakat',
    distribution_purpose TEXT,
    parent_occupation VARCHAR(100),
    desil_score INTEGER,
    program VARCHAR(100),
    request_title TEXT,
    status VARCHAR(100) DEFAULT 'Diajukan',
    rejection_reason TEXT,
    house_index INTEGER,
    asset_index INTEGER,
    income_index INTEGER,
    spiritual_score INTEGER,
    overall_score NUMERIC(5, 2),
    notes TEXT,
    workflow_version INTEGER NOT NULL DEFAULT 0,
    workflow_mode VARCHAR(30) NOT NULL DEFAULT 'legacy',
    created_by_id INTEGER,
    legacy_status_snapshot VARCHAR(100),
    p0_reconciled_at TIMESTAMPTZ,
    p0_reconciled_by INTEGER,
    archived_at TIMESTAMPTZ,
    archived_by_id INTEGER,
    archive_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Table: applications
CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    mustahik_id INTEGER NOT NULL REFERENCES mustahik(id) ON DELETE RESTRICT,
    application_number VARCHAR(100),
    program VARCHAR(100),
    request_title TEXT,
    status VARCHAR(100) DEFAULT 'Diajukan',
    notes TEXT,
    rejection_reason TEXT,
    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table: assessments (F-BPP/04)
CREATE TABLE IF NOT EXISTS assessments (
    id SERIAL PRIMARY KEY,
    mustahik_id INTEGER NOT NULL REFERENCES mustahik(id) ON DELETE RESTRICT,
    application_id INTEGER REFERENCES applications(id) ON DELETE RESTRICT,
    surveyor_name VARCHAR(150),
    surveyor_phone VARCHAR(50),
    survey_date VARCHAR(50),
    survey_method VARCHAR(100),
    narrative_family TEXT,
    narrative_income TEXT,
    narrative_request TEXT,
    narrative_conclusion TEXT,
    house_index INTEGER,
    asset_index INTEGER,
    income_index INTEGER,
    spiritual_score INTEGER,
    overall_score NUMERIC(5, 2),
    priority VARCHAR(50),
    recommendation TEXT,
    notes TEXT,
    photos JSONB DEFAULT '[]'::jsonb,
    template_code VARCHAR(100),
    template_version VARCHAR(30),
    revision INTEGER,
    supersedes_id INTEGER,
    status VARCHAR(40),
    source VARCHAR(30),
    created_by_id INTEGER,
    updated_by_id INTEGER,
    submitted_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    husband_in_household BOOLEAN,
    husband_name VARCHAR(255),
    wife_in_household BOOLEAN,
    wife_name VARCHAR(255),
    child_count INTEGER,
    house_ownership VARCHAR(100),
    home_address TEXT,
    address_matches_ktp BOOLEAN,
    monthly_rent_amount NUMERIC(15,2),
    husband_occupation VARCHAR(255),
    husband_monthly_income NUMERIC(15,2),
    wife_occupation VARCHAR(255),
    wife_monthly_income NUMERIC(15,2),
    child_occupation VARCHAR(255),
    child_monthly_support NUMERIC(15,2),
    assistance_request TEXT,
    applied_to_baznas_before BOOLEAN,
    previous_application_year INTEGER,
    snapshot_json JSONB,
    snapshot_hash CHAR(64),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Table: mpzis (F-BPP/06)
CREATE TABLE IF NOT EXISTS mpzis (
    id SERIAL PRIMARY KEY,
    mustahik_id INTEGER NOT NULL REFERENCES mustahik(id) ON DELETE RESTRICT,
    application_id INTEGER REFERENCES applications(id) ON DELETE RESTRICT,
    form_number VARCHAR(100),
    mpzis_date VARCHAR(50),
    program_classification VARCHAR(150),
    purpose TEXT,
    asnaf VARCHAR(100),
    fund_source VARCHAR(100) DEFAULT 'Zakat',
    recipient_name VARCHAR(255),
    recipient_type VARCHAR(100) DEFAULT 'Individu',
    beneficiary_count INTEGER DEFAULT 1,
    approved_amount NUMERIC(15, 2) DEFAULT 0,
    total_amount NUMERIC(15, 2) DEFAULT 0,
    proposed_by VARCHAR(150),
    examined_by VARCHAR(150),
    ashnaf_verifier VARCHAR(150),
    responsible VARCHAR(150),
    approved_by VARCHAR(150),
    template_code VARCHAR(100),
    template_version VARCHAR(30),
    source VARCHAR(30),
    revision INTEGER,
    supersedes_id INTEGER,
    status VARCHAR(40),
    created_by_id INTEGER,
    submitted_by_id INTEGER,
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    address_snapshot JSONB,
    marital_status_snapshot VARCHAR(100),
    snapshot_json JSONB,
    snapshot_hash CHAR(64),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Table: ppd (F-PKP/03)
CREATE TABLE IF NOT EXISTS ppd (
    id SERIAL PRIMARY KEY,
    mustahik_id INTEGER NOT NULL REFERENCES mustahik(id) ON DELETE RESTRICT,
    application_id INTEGER REFERENCES applications(id) ON DELETE RESTRICT,
    form_number VARCHAR(100),
    ppd_number VARCHAR(100),
    transaction_number VARCHAR(100),
    requester_name VARCHAR(150),
    requester_role VARCHAR(100),
    requester_department VARCHAR(100),
    amount NUMERIC(15, 2) DEFAULT 0,
    amount_in_words TEXT,
    purpose TEXT,
    fund_source VARCHAR(100) DEFAULT 'Zakat',
    bank_account_info TEXT,
    payment_type VARCHAR(50) DEFAULT 'Pembayaran',
    disbursement_date VARCHAR(50),
    template_code VARCHAR(100),
    template_version VARCHAR(30),
    source VARCHAR(30),
    revision INTEGER,
    supersedes_id INTEGER,
    mpzis_id INTEGER,
    status VARCHAR(40),
    created_by_id INTEGER,
    submitted_at TIMESTAMPTZ,
    finance_checked_at TIMESTAMPTZ,
    finance_approved_at TIMESTAMPTZ,
    bank_name VARCHAR(100),
    bank_account_ciphertext TEXT,
    bank_account_last4 CHAR(4),
    bank_account_name VARCHAR(255),
    payment_type_other VARCHAR(150),
    receipt_status VARCHAR(20),
    receipt_error TEXT,
    receipt_lease_token VARCHAR(100),
    receipt_lease_started_at TIMESTAMPTZ,
    receipt_lease_expires_at TIMESTAMPTZ,
    receipt_payload_sha256 CHAR(64),
    receipt_file_id INTEGER,
    receipt_file_sha256 CHAR(64),
    receipt_created_at TIMESTAMPTZ,
    snapshot_json JSONB,
    snapshot_hash CHAR(64),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ppd_receipt_status_check CHECK (
        receipt_status IS NULL
        OR receipt_status IN ('pending', 'processing', 'ready', 'failed')
    )
);

-- 6. Table: documents
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    mustahik_id INTEGER NOT NULL REFERENCES mustahik(id) ON DELETE RESTRICT,
    doc_type VARCHAR(100),
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    file_url TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Table: wa_logs
CREATE TABLE IF NOT EXISTS wa_logs (
    id SERIAL PRIMARY KEY,
    mustahik_id INTEGER NOT NULL REFERENCES mustahik(id) ON DELETE RESTRICT,
    phone VARCHAR(50),
    phase VARCHAR(100),
    message TEXT,
    wa_url TEXT,
    status VARCHAR(50) DEFAULT 'sent',
    sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Table: bot_sessions
CREATE TABLE IF NOT EXISTS bot_sessions (
    chat_id BIGINT PRIMARY KEY,
    state VARCHAR(50) DEFAULT 'idle',
    temp_data JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. Table: users (Multi-Role Authentication & Access Control)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'penyaluran', -- 'admin', 'penyaluran', 'penerimaan', 'surveyor'
    division VARCHAR(100) DEFAULT 'Divisi Penyaluran',
    level VARCHAR(20) NOT NULL DEFAULT 'staff', -- 'staff' | 'leader' | 'admin'
    avatar VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. Table: master_data (configurable choices for operational workflows)
CREATE TABLE IF NOT EXISTS master_data (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    record_key VARCHAR(100) NOT NULL,
    label VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, record_key)
);

-- 11. Table: approval_decisions (append-only decision audit trail)
CREATE TABLE IF NOT EXISTS approval_decisions (
    id SERIAL PRIMARY KEY,
    mustahik_id INTEGER NOT NULL REFERENCES mustahik(id) ON DELETE RESTRICT,
    stage VARCHAR(100) NOT NULL,
    action VARCHAR(30) NOT NULL,
    previous_status VARCHAR(100) NOT NULL,
    next_status VARCHAR(100) NOT NULL,
    note TEXT NOT NULL,
    approved_amount NUMERIC,
    actor_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    actor_name VARCHAR(255) NOT NULL,
    actor_role VARCHAR(100) NOT NULL,
    actor_level VARCHAR(30),
    actor_division VARCHAR(100),
    prepared_by_id INTEGER,
    correlation_id UUID,
    artifact_type VARCHAR(40),
    artifact_id INTEGER,
    artifact_revision INTEGER,
    snapshot_hash CHAR(64),
    evidence_grade VARCHAR(30) NOT NULL DEFAULT 'legacy_unbound',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- Performance Indexes for Ultra-Fast Query Throughput
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_mustahik_file_no ON mustahik(file_no);
CREATE INDEX IF NOT EXISTS idx_mustahik_nik ON mustahik(nik);
CREATE INDEX IF NOT EXISTS idx_mustahik_phone ON mustahik(phone);
CREATE INDEX IF NOT EXISTS idx_mustahik_status ON mustahik(status);
CREATE INDEX IF NOT EXISTS idx_mustahik_program ON mustahik(program);
CREATE INDEX IF NOT EXISTS idx_mustahik_received_date ON mustahik(received_date);
CREATE INDEX IF NOT EXISTS idx_mustahik_kecamatan ON mustahik(kecamatan);
CREATE INDEX IF NOT EXISTS idx_mustahik_created_at ON mustahik(created_at);
CREATE INDEX IF NOT EXISTS idx_mustahik_asnaf ON mustahik(asnaf);
CREATE INDEX IF NOT EXISTS idx_mustahik_status_program ON mustahik(status, program);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE INDEX IF NOT EXISTS idx_applications_mustahik_id ON applications(mustahik_id);
CREATE INDEX IF NOT EXISTS idx_assessments_mustahik_id ON assessments(mustahik_id);
CREATE INDEX IF NOT EXISTS idx_mpzis_mustahik_id ON mpzis(mustahik_id);
CREATE INDEX IF NOT EXISTS idx_ppd_mustahik_id ON ppd(mustahik_id);
CREATE INDEX IF NOT EXISTS idx_documents_mustahik_id ON documents(mustahik_id);
CREATE INDEX IF NOT EXISTS idx_wa_logs_mustahik_id ON wa_logs(mustahik_id);
CREATE INDEX IF NOT EXISTS idx_master_data_category ON master_data(category);
CREATE INDEX IF NOT EXISTS idx_approval_decisions_mustahik ON approval_decisions(mustahik_id, created_at DESC);

-- Legacy operational tables required by the PostgreSQL P0 bootstrap.
CREATE TABLE IF NOT EXISTS program_initiatives (
    id SERIAL PRIMARY KEY,
    pilar_id VARCHAR(50) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    pic VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Aktif',
    next_milestone VARCHAR(255),
    mustahik_target INTEGER DEFAULT 0,
    mustahik_count INTEGER DEFAULT 0,
    budget_amount NUMERIC DEFAULT 0,
    realized_amount NUMERIC DEFAULT 0,
    percentage NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(100) PRIMARY KEY,
    category VARCHAR(100) NOT NULL,
    period VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    scope VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Siap diekspor',
    file_url TEXT,
    metrics_json TEXT,
    updated_at VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE RESTRICT,
    actor_name VARCHAR(255),
    action_type VARCHAR(100),
    title VARCHAR(255),
    description TEXT,
    old_status VARCHAR(100),
    new_status VARCHAR(100),
    actor_id INTEGER,
    actor_role VARCHAR(100),
    actor_level VARCHAR(30),
    actor_division VARCHAR(100),
    correlation_id UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    jti VARCHAR(100) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- Mustahik P0 authoritative fresh-state table contract
--
-- Fresh PostgreSQL receives these table shells from schema.sql. The
-- versioned migration owns legacy backfill, checks, restrictive FKs,
-- indexes, append-only triggers, and the schema_migrations ledger.

CREATE TABLE IF NOT EXISTS artifact_approvals (
  id SERIAL PRIMARY KEY,
  mustahik_id INTEGER NOT NULL,
  artifact_type VARCHAR(40) NOT NULL,
  artifact_id INTEGER NOT NULL,
  artifact_revision INTEGER NOT NULL,
  approval_step VARCHAR(60),
  action VARCHAR(30) NOT NULL,
  snapshot_hash CHAR(64) NOT NULL,
  note TEXT,
  correlation_id UUID,
  actor_id INTEGER,
  actor_name VARCHAR(255) NOT NULL,
  actor_role VARCHAR(100) NOT NULL,
  actor_level VARCHAR(30) NOT NULL,
  actor_division VARCHAR(100) NOT NULL,
  is_admin_override BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason TEXT,
  completion_hash CHAR(64),
  completion_snapshot_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS artifact_files (
  id SERIAL PRIMARY KEY,
  mustahik_id INTEGER NOT NULL,
  artifact_type VARCHAR(40) NOT NULL,
  artifact_id INTEGER NOT NULL,
  artifact_revision INTEGER NOT NULL,
  kind VARCHAR(40) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 CHAR(64) NOT NULL,
  uploaded_by_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_receipt_artifact
  ON artifact_files(artifact_type, artifact_id, artifact_revision, kind)
  WHERE kind = 'system_receipt_pdf';

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_receipt_generated_event
  ON artifact_approvals(artifact_type, artifact_id, artifact_revision, approval_step)
  WHERE action = 'receipt_generated' AND approval_step = 'receipt_generated';

CREATE TABLE IF NOT EXISTS artifact_access_events (
  id SERIAL PRIMARY KEY,
  file_id INTEGER NOT NULL,
  mustahik_id INTEGER NOT NULL,
  artifact_type VARCHAR(40) NOT NULL,
  artifact_id INTEGER NOT NULL,
  artifact_revision INTEGER NOT NULL,
  actor_id INTEGER,
  actor_name VARCHAR(255) NOT NULL,
  actor_role VARCHAR(100) NOT NULL,
  actor_level VARCHAR(30) NOT NULL,
  actor_division VARCHAR(100) NOT NULL,
  action VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  correlation_id UUID
);

CREATE TABLE IF NOT EXISTS ppd_rab_lines (
  id SERIAL PRIMARY KEY,
  ppd_id INTEGER NOT NULL,
  line_no INTEGER NOT NULL,
  register_number VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  CONSTRAINT ppd_rab_line_no_check CHECK (line_no BETWEEN 1 AND 3),
  CONSTRAINT ppd_rab_amount_check CHECK (amount > 0),
  CONSTRAINT ppd_rab_unique_line UNIQUE (ppd_id, line_no)
);

CREATE TABLE IF NOT EXISTS ppd_payments (
  id SERIAL PRIMARY KEY,
  ppd_id INTEGER NOT NULL,
  transaction_number VARCHAR(100) NOT NULL,
  paid_amount NUMERIC(15,2) NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL,
  proof_file_id INTEGER,
  recorded_by_id INTEGER,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  verified_by_id INTEGER,
  verified_at TIMESTAMPTZ,
  snapshot_json JSONB NOT NULL,
  snapshot_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ppd_payment_amount_check CHECK (paid_amount > 0),
  CONSTRAINT ppd_payment_status_check CHECK (verification_status IN ('pending', 'verified'))
);

CREATE TABLE IF NOT EXISTS recipient_confirmations (
  id SERIAL PRIMARY KEY,
  ppd_id INTEGER NOT NULL,
  method VARCHAR(30) NOT NULL,
  recipient_name_snapshot VARCHAR(255) NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL,
  note TEXT NOT NULL,
  evidence_file_id INTEGER,
  recorded_by_id INTEGER,
  snapshot_json JSONB NOT NULL,
  snapshot_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS p0_idempotency_keys (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER NOT NULL,
  idempotency_key VARCHAR(150) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT p0_idempotency_actor_key UNIQUE (actor_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS mustahik_case_assignments (
  id SERIAL PRIMARY KEY,
  mustahik_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  assignment_role VARCHAR(40) NOT NULL,
  assigned_by_id INTEGER,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ
);
-- Divisi Penerimaan - PostgreSQL DDL Schema
-- ====================================================================

-- 12. Table: penerimaan_channels
CREATE TABLE IF NOT EXISTS penerimaan_channels (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(30) NOT NULL DEFAULT 'digital',
    provider VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 13. Table: penerimaan_accounts
CREATE TABLE IF NOT EXISTS penerimaan_accounts (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES penerimaan_channels(id) ON DELETE SET NULL,
    bank_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(100) NOT NULL,
    account_holder VARCHAR(150) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_penerimaan_account UNIQUE (bank_name, account_number)
);

-- 14. Table: muzakki
CREATE TABLE IF NOT EXISTS muzakki (
    id SERIAL PRIMARY KEY,
    npwz VARCHAR(50) UNIQUE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(30) NOT NULL DEFAULT 'individu',
    identity_type VARCHAR(30),
    identity_number VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(150),
    address TEXT,
    city VARCHAR(100) DEFAULT 'Kota Tangerang',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 15. Table: penerimaan_reconciliation_batches
CREATE TABLE IF NOT EXISTS penerimaan_reconciliation_batches (
    id SERIAL PRIMARY KEY,
    batch_number VARCHAR(100) UNIQUE NOT NULL,
    channel VARCHAR(50) NOT NULL,
    account_id INTEGER REFERENCES penerimaan_accounts(id) ON DELETE SET NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    total_expected_count INTEGER DEFAULT 0,
    total_expected_amount BIGINT DEFAULT 0,
    total_matched_count INTEGER DEFAULT 0,
    total_matched_amount BIGINT DEFAULT 0,
    discrepancy_amount BIGINT DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    notes TEXT,
    closed_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 16. Table: penerimaan_statement_lines
CREATE TABLE IF NOT EXISTS penerimaan_statement_lines (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER NOT NULL REFERENCES penerimaan_reconciliation_batches(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    transaction_date TIMESTAMPTZ NOT NULL,
    reference_number VARCHAR(150),
    description TEXT,
    amount BIGINT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'unmatched',
    matched_transaction_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_statement_batch_line UNIQUE (batch_id, line_number)
);

-- 17. Table: penerimaan_transactions
CREATE TABLE IF NOT EXISTS penerimaan_transactions (
    id SERIAL PRIMARY KEY,
    transaction_number VARCHAR(100) UNIQUE NOT NULL,
    receipt_number VARCHAR(100) UNIQUE,
    channel_id INTEGER REFERENCES penerimaan_channels(id) ON DELETE SET NULL,
    channel VARCHAR(50) NOT NULL,
    channel_category VARCHAR(30) NOT NULL DEFAULT 'digital',
    provider_name VARCHAR(100),
    provider_ref VARCHAR(150),
    account_id INTEGER REFERENCES penerimaan_accounts(id) ON DELETE SET NULL,
    reconciliation_batch_id INTEGER REFERENCES penerimaan_reconciliation_batches(id) ON DELETE SET NULL,
    muzakki_id INTEGER REFERENCES muzakki(id) ON DELETE SET NULL,
    muzakki_name VARCHAR(255) NOT NULL,
    muzakki_phone VARCHAR(50),
    muzakki_email VARCHAR(150),
    fund_type VARCHAR(50) NOT NULL DEFAULT 'zakat_maal',
    program_id INTEGER,
    program_name VARCHAR(150),
    sub_program VARCHAR(150),
    amount BIGINT NOT NULL,
    fee_amount BIGINT DEFAULT 0,
    net_amount BIGINT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Menunggu Validasi',
    payment_method VARCHAR(100),
    evidence_url TEXT,
    bank_name VARCHAR(100),
    bank_account_number VARCHAR(100),
    is_manual BOOLEAN DEFAULT FALSE,
    is_duplicate BOOLEAN DEFAULT FALSE,
    is_incomplete BOOLEAN DEFAULT FALSE,
    is_flagged BOOLEAN DEFAULT FALSE,
    risk_flags JSONB DEFAULT '[]'::jsonb,
    rejection_reason TEXT,
    clarification_notes TEXT,
    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(255),
    validated_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    validated_by_name VARCHAR(255),
    validated_at TIMESTAMPTZ,
    approved_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_by_name VARCHAR(255),
    approved_at TIMESTAMPTZ,
    reconciled_at TIMESTAMPTZ,
    posted_at TIMESTAMPTZ,
    transaction_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    workflow_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_penerimaan_tx_amount CHECK (amount > 0),
    CONSTRAINT chk_penerimaan_tx_fee_amount CHECK (fee_amount >= 0),
    CONSTRAINT chk_penerimaan_tx_net_amount CHECK (net_amount >= 0)
);

-- 18. Table: penerimaan_matches
CREATE TABLE IF NOT EXISTS penerimaan_matches (
    id SERIAL PRIMARY KEY,
    statement_line_id INTEGER NOT NULL REFERENCES penerimaan_statement_lines(id) ON DELETE CASCADE,
    transaction_id INTEGER NOT NULL REFERENCES penerimaan_transactions(id) ON DELETE CASCADE,
    match_type VARCHAR(30) NOT NULL DEFAULT 'auto',
    confidence_score NUMERIC(5, 2) DEFAULT 100.00,
    matched_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    matched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_matches_line_tx UNIQUE (statement_line_id, transaction_id)
);

-- 19. Table: penerimaan_approvals
CREATE TABLE IF NOT EXISTS penerimaan_approvals (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES penerimaan_transactions(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(255) NOT NULL,
    actor_role VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    from_status VARCHAR(50) NOT NULL,
    to_status VARCHAR(50) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 20. Table: penerimaan_receipts
CREATE TABLE IF NOT EXISTS penerimaan_receipts (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES penerimaan_transactions(id) ON DELETE CASCADE,
    receipt_number VARCHAR(100) UNIQUE NOT NULL,
    recipient_name VARCHAR(255) NOT NULL,
    amount BIGINT NOT NULL,
    fund_type VARCHAR(50) NOT NULL,
    issued_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    issued_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 21. Table: penerimaan_raw_events
CREATE TABLE IF NOT EXISTS penerimaan_raw_events (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(150) UNIQUE NOT NULL,
    event_type VARCHAR(100),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    headers JSONB DEFAULT '{}'::jsonb,
    signature VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    processing_error TEXT,
    received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ
);

-- 22. Table: penerimaan_import_jobs
CREATE TABLE IF NOT EXISTS penerimaan_import_jobs (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    batch_id INTEGER REFERENCES penerimaan_reconciliation_batches(id) ON DELETE SET NULL,
    total_rows INTEGER DEFAULT 0,
    processed_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    errors_json JSONB DEFAULT '[]'::jsonb,
    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

-- 23. Table: penerimaan_audit_events
CREATE TABLE IF NOT EXISTS penerimaan_audit_events (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(255) NOT NULL,
    actor_role VARCHAR(100) NOT NULL,
    changes JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 24. Table: penerimaan_settings
CREATE TABLE IF NOT EXISTS penerimaan_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    description TEXT,
    updated_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 25. Table: penerimaan_export_jobs
CREATE TABLE IF NOT EXISTS penerimaan_export_jobs (
    id SERIAL PRIMARY KEY,
    job_uuid VARCHAR(100) UNIQUE NOT NULL,
    job_type VARCHAR(50) NOT NULL DEFAULT 'penerimaan_report',
    format VARCHAR(20) NOT NULL,
    filters_json JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    file_name VARCHAR(255),
    file_size INTEGER DEFAULT 0,
    artifact_path TEXT,
    error_message TEXT,
    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(255),
    processing_started_at TIMESTAMPTZ,
    attempt_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

-- 26. Table: penerimaan_fund_categories
CREATE TABLE IF NOT EXISTS penerimaan_fund_categories (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 27. Table: penerimaan_provider_configs
CREATE TABLE IF NOT EXISTS penerimaan_provider_configs (
    id SERIAL PRIMARY KEY,
    provider_name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    webhook_secret_encrypted TEXT,
    secret_updated_at TIMESTAMPTZ,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- Performance Indexes & Idempotency Constraints for Penerimaan
-- ====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_provider_channel_ref
    ON penerimaan_transactions(provider_name, channel, provider_ref)
    WHERE provider_ref IS NOT NULL AND provider_ref <> '';

CREATE INDEX IF NOT EXISTS idx_penerimaan_tx_status ON penerimaan_transactions(status);
CREATE INDEX IF NOT EXISTS idx_penerimaan_tx_date ON penerimaan_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_penerimaan_tx_channel ON penerimaan_transactions(channel);
CREATE INDEX IF NOT EXISTS idx_penerimaan_tx_muzakki ON penerimaan_transactions(muzakki_id);
CREATE INDEX IF NOT EXISTS idx_penerimaan_tx_batch ON penerimaan_transactions(reconciliation_batch_id);
CREATE INDEX IF NOT EXISTS idx_penerimaan_tx_approval_queue ON penerimaan_transactions(status, created_at)
    WHERE status = 'Menunggu Approval';
CREATE INDEX IF NOT EXISTS idx_penerimaan_tx_muzakki_name ON penerimaan_transactions(muzakki_name);
CREATE INDEX IF NOT EXISTS idx_penerimaan_tx_created_at ON penerimaan_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_penerimaan_muzakki_npwz ON muzakki(npwz);
CREATE INDEX IF NOT EXISTS idx_penerimaan_muzakki_phone ON muzakki(phone);
CREATE INDEX IF NOT EXISTS idx_penerimaan_muzakki_nik ON muzakki(identity_number);

CREATE INDEX IF NOT EXISTS idx_penerimaan_batch_status ON penerimaan_reconciliation_batches(status);
CREATE INDEX IF NOT EXISTS idx_penerimaan_batch_channel ON penerimaan_reconciliation_batches(channel);

CREATE INDEX IF NOT EXISTS idx_penerimaan_statement_lines_batch ON penerimaan_statement_lines(batch_id);
CREATE INDEX IF NOT EXISTS idx_penerimaan_statement_lines_status ON penerimaan_statement_lines(status);

CREATE INDEX IF NOT EXISTS idx_penerimaan_matches_tx ON penerimaan_matches(transaction_id);
CREATE INDEX IF NOT EXISTS idx_penerimaan_approvals_tx ON penerimaan_approvals(transaction_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_penerimaan_receipts_tx ON penerimaan_receipts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_penerimaan_receipts_num ON penerimaan_receipts(receipt_number);
CREATE INDEX IF NOT EXISTS idx_penerimaan_raw_events_key ON penerimaan_raw_events(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_penerimaan_raw_events_status ON penerimaan_raw_events(status);
CREATE INDEX IF NOT EXISTS idx_penerimaan_audit_entity ON penerimaan_audit_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_penerimaan_export_jobs_uuid ON penerimaan_export_jobs(job_uuid);
CREATE INDEX IF NOT EXISTS idx_penerimaan_export_jobs_status ON penerimaan_export_jobs(status);
