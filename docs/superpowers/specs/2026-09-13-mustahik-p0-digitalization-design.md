# Mustahik P0 Digitalization Design

**Status:** Approved design, ready for implementation planning

**Date:** 2026-09-13

**Scope:** End-to-end digitalization of household Assessment, F-BPP/06 MPZIS, F-PKP/03 PPD, finance control, completion evidence, and a traceable system receipt in the canonical Next.js Penyaluran workflow.

## 1. Objective

Replace the three manual forms and their hand-carried approval flow with one authoritative, auditable digital case flow. A case must be enterable, reviewable, approvable, payable, confirmable, and reproducible from persisted records without Excel, handwritten names, browser-only defaults, or synthetic UI truth.

P0 is complete only when a masked test case can travel from Assessment through completed distribution in `frontend-next`, all material decisions are tied to authenticated actors and immutable snapshots, and the generated system receipt can prove which records and approvals produced the completed case.

### Current baseline

The 2026-09-13 audit under `.superpowers/audits/2026-09-13-manual-template-digitization/` is the implementation baseline. It found that `frontend-next` has the canonical Mustahik queue but no dedicated Assessment, MPZIS, or PPD forms; existing backend tables store only subsets of the templates; the generic decision route can advance on synthetic or incomplete data; finance/payment gates are absent; and legacy print views contain hard-coded/fallback values. P0 replaces those unsafe write and output paths rather than layering new UI over them.

## 2. Approved decisions and non-negotiable constraints

The following decisions are approved and must be implemented without reinterpretation:

1. The audited two-block household PDF, `Assesnment Langsung Mustahik (1).pdf`, is the authoritative Assessment source for P0.
2. Its two identical blocks represent **one assessment rendered twice**, not two assessment records. No `copy_no` or second logical Assessment may be created from the repeated print block.
3. Assessment has **no score** until BAZNAS supplies an official formula. P0 does not calculate, accept, persist, display, sort, or decide from an Assessment score. Missing values read **“Belum dicatat”**, never a fabricated fallback.
4. Electronic approvals are recorded from the authenticated actor and include actor id, actor name, role, level, division, a server timestamp, and a canonical snapshot SHA-256 hash. P0 does not capture or render signature images.
5. The five MPZIS roles—`Diajukan`, `Diperiksa`, `Verifikator Ashnaf`, `Penanggungjawab Penyaluran`, and `Disetujui`—are distinct approval steps performed by five distinct authenticated user ids. Self-approval or reuse of one user in another MPZIS step is forbidden.
6. A PPD contains one to three non-empty RAB lines. More than three lines or an empty submitted RAB is rejected.
7. PPD requires a finance check and a separate finance approval. The finance checker and approver must be different authenticated users.
8. A case reaches `Penyaluran Selesai` only after the amount is valid, payment evidence is stored and verified, and recipient confirmation is recorded.
9. P0 generates an authoritative, traceable **Bukti Digital Penyaluran** PDF. Pixel-perfect reproduction of the native Assessment, F-BPP/06, and F-PKP/03 layouts is deferred to P1.
10. `frontend-next` is the canonical operational UI. The legacy Vite UI under `src/` is not extended and cannot be a production write path after P0 cutover.
11. A P0 case and its artifacts are never hard-deleted through an application route. Archival is a reversible, audited soft-delete; immutable approvals, files, snapshots, and provenance use restrictive or otherwise non-cascading foreign keys.

## 3. Scope boundaries

### In scope

- Complete source-field capture for the approved household Assessment.
- Structured MPZIS data and five-step electronic approval.
- Structured PPD data, up to three RAB lines, finance check, finance approval, payment evidence, and recipient confirmation.
- Immutable artifact revisions, canonical snapshots, hashes, and append-only artifact approval events.
- A single Next.js case experience that exposes only valid actions for the current actor and state.
- Compatibility treatment for existing legacy rows without falsely certifying them.
- Server-generated, persisted, hash-addressed Bukti Digital Penyaluran PDF.
- Authorization, validation, audit, security, accessibility, automated tests, rollout, and rollback.

### Out of scope

- A scoring formula, Had Kifayah calculation, weighted eligibility index, or automated eligibility recommendation.
- Signature images, biometric signatures, digital certificates, PKI, or third-party e-sign providers.
- Pixel-perfect exports of the three source templates.
- Changes to the Penerimaan workflow or unrelated dashboards.
- Extending, repairing, or adding features to the legacy Vite forms.
- Deleting or rewriting legacy records.

## 4. Architectural approach

P0 uses source-specific relational records for searchable operational data, append-only approval events for accountability, immutable canonical JSON snapshots for proof, and existing high-level Mustahik status for queue compatibility.

The browser owns draft interaction only. The server owns every transition, actor field, timestamp, calculated amount, canonical snapshot, hash, document hash, and status change. A submitted artifact is immutable. A correction creates a new revision linked to the prior revision; approvals never move from one revision to another.

High-level Mustahik status remains compatible with the current queue:

```text
Diajukan
  -> Verifikasi Administrasi
  -> Survey
  -> Persetujuan MPZIS
  -> Pengajuan Dana (FPD)
  -> Penyaluran Selesai
```

Detailed progress lives on the active Assessment, MPZIS, and PPD revision. This avoids proliferating public-facing Mustahik statuses while still making every gate explicit. The Next UI derives its stage guidance from the active artifact states returned by the server, not from list index, dates, or hard-coded assumptions.

Backend responsibilities are separated into focused modules under `server/penyaluran-p0/`: `assessment-service.js`, `mpzis-service.js`, `ppd-service.js`, `payment-service.js`, `completion-service.js`, `validation.js`, `permissions.js`, `canonical-snapshot.js`, `artifact-files.js`, and `receipt-renderer.js`. Routes only authenticate, parse transport input, call one service, and map typed service errors to HTTP. Services own transactions and state changes; validation and permission modules are pure and independently testable. PostgreSQL DDL in `server/schema.sql` and runtime initialization/migration behavior in `server/db.js` must describe the same P0 schema and constraints.

## 5. Data model

All new timestamps are `TIMESTAMPTZ` generated by PostgreSQL/server code. All monetary values are `NUMERIC(15,2)`, non-negative in drafts, and strictly positive where submission rules require it. New identifiers are integer primary keys unless the existing database adapter requires the current serial convention.

### 5.1 Case compatibility fields

Add to `mustahik`:

| Column | Type | Contract |
| --- | --- | --- |
| `workflow_mode` | `VARCHAR(30)` | `legacy`, `legacy_reconciliation`, or `p0`; existing rows backfill to `legacy`, cases created after cutover default to `p0`. |
| `workflow_version` | `INTEGER NOT NULL DEFAULT 0` | Existing optimistic concurrency field remains authoritative. |
| `legacy_status_snapshot` | `VARCHAR(100) NULL` | Exact pre-P0 queue status captured when reconciliation begins; never used as fabricated artifact evidence. |
| `p0_reconciled_at` | `TIMESTAMPTZ NULL` | Set only by the audited legacy reconciliation service. |
| `p0_reconciled_by` | FK `users(id)` nullable | Authenticated admin who established the migration baseline. |
| `archived_at` | `TIMESTAMPTZ NULL` | Soft-delete timestamp generated by the server. |
| `archived_by_id` | FK `users(id)` nullable | Authenticated admin who archived the case. |
| `archive_reason` | `TEXT NULL` | Required 20–1000 character reason when archived. |

Legacy denormalized fields such as `overall_score`, `approved_amount`, `mpzis_date`, `ppd_number`, and `disbursement_date` remain for read compatibility, but P0 writes them only as projections of authoritative artifact transactions. They are not accepted as independent sources from browser payloads.

### 5.2 Assessment revisions

Extend `assessments` additively. Existing scoring-oriented columns remain nullable for legacy read compatibility and are not exposed or written by P0 endpoints.

| Group | Columns |
| --- | --- |
| Identity and version | `template_code='ASSESSMENT_LANGSUNG_MUSTAHIK'`, `template_version='2026-09-13'`, `revision INTEGER`, `supersedes_id`, `status`, `created_by_id`, `updated_by_id`, `submitted_at`, `reviewed_at` |
| Household | `husband_in_household`, `husband_name`, `wife_in_household`, `wife_name`, `child_count` |
| Housing | `house_ownership`, `home_address`, `address_matches_ktp`, `monthly_rent_amount` |
| Livelihood | `husband_occupation`, `husband_monthly_income`, `wife_occupation`, `wife_monthly_income`, `child_occupation`, `child_monthly_support` |
| Request history | `assistance_request`, `applied_to_baznas_before`, `previous_application_year` |
| Provenance | `source='p0'`, `snapshot_json JSONB`, `snapshot_hash CHAR(64)` |

Assessment status is one of `draft`, `submitted`, `accepted`, `returned`, `superseded`, or `legacy_unverified`.

Constraints:

- Unique `(mustahik_id, application_id, revision)`; exactly one non-superseded active revision per application.
- `house_ownership` is `Kontrak`, `Milik Sendiri`, or `Orang Tua (Menumpang)`.
- `husband_in_household` and `wife_in_household` have no draft default and must be explicitly answered. When true, the corresponding name, occupation, and monthly income are required; when false, those three fields must be `NULL`.
- `child_count` is an integer from 0 through 30.
- When `child_count=0`, child occupation and support must be `NULL`. When it is greater than zero, child occupation is required and child support is required as a non-negative amount; `Tidak bekerja` is a valid explicit occupation answer.
- Every monetary field is greater than or equal to zero.
- `monthly_rent_amount` is required and greater than zero only when ownership is `Kontrak`; otherwise it must be `NULL`.
- `previous_application_year` is required only when `applied_to_baznas_before=true`, must be between 2000 and the server’s current calendar year, and must be `NULL` when false.
- `address_matches_ktp` and `applied_to_baznas_before` have no draft default and must be explicitly answered before submit.
- `overall_score`, `house_index`, `asset_index`, `income_index`, `spiritual_score`, `priority`, and any score-like request fields are rejected by P0 endpoints.
- The repeated lower PDF block is a rendering concern only. There is exactly one Assessment payload and one logical revision.

### 5.3 MPZIS revisions

Extend `mpzis` with `template_code='F-BPP/06'`, `template_version='2026-09-13'`, `source='p0'`, `revision`, `supersedes_id`, `status`, `created_by_id`, `submitted_by_id`, `submitted_at`, `approved_at`, `address_snapshot JSONB`, `marital_status_snapshot`, `snapshot_json JSONB`, and `snapshot_hash CHAR(64)`.

Existing `proposed_by`, `examined_by`, `ashnaf_verifier`, `responsible`, and `approved_by` text columns remain legacy-only. P0 never accepts these names from the client; the five displayed names are projections from `artifact_approvals`.

Draft creation and submit are preparation events, not any of the five approvals. `created_by_id` and `submitted_by_id` may be the same operator, but neither user id may occupy `proposed`, `examined`, `ashnaf_verified`, `responsible_acknowledged`, or `approved` for that MPZIS revision.

MPZIS status is one of:

```text
draft -> submitted -> proposed -> examined -> ashnaf_verified
      -> responsible_acknowledged -> approved
submitted/proposed/examined/ashnaf_verified/responsible_acknowledged -> returned
returned -> superseded by a new draft revision
```

Historical rows use the additional terminal status `legacy_unverified` and never enter the P0 approval chain.

Required structured fields before submit:

- `form_number`, `mpzis_date`, `program_classification`, `purpose`, `asnaf`;
- `fund_source`, `recipient_name`, `recipient_type`, `beneficiary_count`;
- a complete address snapshot (`address`, `rt_rw`, `kelurahan`, `kecamatan`, `kabupaten_kota`, `province`);
- `marital_status_snapshot`; and
- `total_amount > 0`.

`recipient_type` is `Individu`, `Keluarga`, or `Kelompok / Yayasan`. Default for a new draft is `Individu`, but the UI must require the operator to visit and confirm the recipient section before submit. `beneficiary_count` defaults to 1 and must be at least 1. `total_amount` becomes the authoritative approved amount only after the fifth approval.

`form_number` is required. Revisions share the same logical form number; `(form_number, revision)` is unique, and a partial unique index allows only one non-superseded active revision for that form number. Only the active approved revision can feed a PPD.

### 5.4 PPD revisions and RAB

Extend `ppd` with `template_code='F-PKP/03'`, `template_version='2026-09-13'`, `source='p0'`, `revision`, `supersedes_id`, `mpzis_id NOT NULL`, `status`, `created_by_id`, `submitted_at`, `finance_checked_at`, `finance_approved_at`, `bank_name`, `bank_account`, `bank_account_name`, `payment_type_other`, `snapshot_json JSONB`, and `snapshot_hash CHAR(64)`.

PPD status is one of:

```text
draft -> submitted -> finance_checked -> finance_approved
      -> payment_recorded -> payment_verified -> recipient_confirmed -> completed
submitted/finance_checked -> returned
returned -> superseded by a new draft revision
```

Historical rows use the additional terminal status `legacy_unverified` and cannot enter finance or completion states.

Create `ppd_rab_lines`:

| Column | Contract |
| --- | --- |
| `id`, `ppd_id` | Parent identity. |
| `line_no` | Integer 1, 2, or 3; unique within one PPD. |
| `register_number` | Required trimmed string. |
| `description` | Required trimmed string. |
| `amount` | `NUMERIC(15,2)`, greater than zero. |

A submitted PPD has one to three rows. `ppd.amount` is calculated by the server as `SUM(ppd_rab_lines.amount)` and is never trusted from the browser. It must be greater than zero and no greater than the approved MPZIS `total_amount`. `amount_in_words` is generated by the server from the calculated amount using Indonesian words and is never accepted from the browser.

`form_number`, `ppd_number`, and `transaction_number` are individually required. Corrections retain the same logical numbers; each number paired with `revision` is unique, and partial unique indexes allow only one non-superseded active revision for each number. PPD requester name, role, and department are copied from the authenticated creator, not provided by the browser.

Bank fields are an immutable PPD snapshot. The full account number is encrypted using the application’s production field-encryption key; UI responses and the receipt expose only the last four digits. A missing encryption key fails closed in production.

### 5.5 Source and payment enums with defaults

Exact labels follow the source forms:

```text
fund_source:
  Zakat
  Infaq/Shodaqoh
  DSKL
  Hibah

payment_type:
  Uang Muka
  Reimbursement
  Pembayaran
  Lain-lain
```

New MPZIS and PPD drafts default `fund_source` to `Zakat`. New PPD drafts default `payment_type` to `Pembayaran`. Defaults are draft conveniences, not evidence: both controls are visible and require explicit section confirmation before submission. `Lain-lain` requires `payment_type_other` with 3–150 trimmed characters; that field must be null for all other payment types.

The old values `Transfer`, `Transfer Bank (BSI)`, JSON-array strings, or arbitrary free text remain readable only on `legacy_unverified` rows and cannot be submitted through P0 APIs.

### 5.6 Approval events

Create append-only `artifact_approvals`:

| Column | Contract |
| --- | --- |
| Identity | `id`, `mustahik_id`, `artifact_type`, `artifact_id`, `artifact_revision`, `approval_step`, `action` |
| Bound evidence | `snapshot_hash CHAR(64)`, `note`, `correlation_id UUID` |
| Actor snapshot | `actor_id`, `actor_name`, `actor_role`, `actor_level`, `actor_division` |
| Recovery metadata | `is_admin_override BOOLEAN DEFAULT FALSE`, `override_reason` |
| Time | `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP` |

`artifact_type` is `assessment`, `mpzis`, `ppd`, `payment`, `recipient_confirmation`, or `legacy_reconciliation`. `action` is `submit`, `accept`, `approve`, `return`, `record`, `confirm`, or `complete` as permitted by the relevant state machine. There is no update/delete operational endpoint.

The server also writes a linked `approval_decisions` row and an `activity_logs` row in the same database transaction for queue and audit compatibility. Add `artifact_type`, `artifact_id`, `artifact_revision`, and `snapshot_hash` to `approval_decisions`.

For an MPZIS revision, uniqueness on `(artifact_type, artifact_id, artifact_revision, approval_step, action='approve')` and service validation ensure one accepted actor per step. Before each approval, the service rejects the creator, the submitter, and any actor id already used in any prior MPZIS approval step for that revision.

### 5.7 Payment, confirmation, and files

Create `artifact_files` for immutable evidence:

- `id`, `mustahik_id`, `artifact_type`, `artifact_id`, `artifact_revision`;
- `kind` (`supporting_document`, `payment_proof`, `recipient_confirmation`, `system_receipt_pdf`);
- `stored_name`, `original_name`, `mime_type`, `byte_size`, `sha256`;
- `uploaded_by_id`, `created_at`.

Create `ppd_payments` with one active record per approved PPD revision: `ppd_id`, `transaction_number`, `paid_amount`, `paid_at`, `proof_file_id`, `recorded_by_id`, `verification_status`, `verified_by_id`, `verified_at`, `snapshot_hash`, and `created_at`. `paid_amount` must equal the calculated PPD amount exactly. `verification_status` moves from `pending` to `verified` only after an authenticated finance actor other than the recorder confirms the amount, transaction reference, and proof file hash.

Create `recipient_confirmations` with one active confirmation per PPD revision: `ppd_id`, `method`, `recipient_name_snapshot`, `confirmed_at`, `note`, optional `evidence_file_id`, `recorded_by_id`, `snapshot_hash`, and `created_at`. `method` is `Tatap Muka`, `Telepon`, `WhatsApp`, or `Tanda Terima`. Confirmation note is required and contains 10–1000 trimmed characters.

### 5.8 Immutable retention and referential integrity

P0 provenance must survive account deactivation, case archival, and accidental delete attempts.

- Foreign keys from `applications`, `assessments`, `mpzis`, `ppd`, `documents`, `wa_logs`, `activity_logs`, `artifact_approvals`, `approval_decisions`, `artifact_files`, `ppd_rab_lines`, `ppd_payments`, `recipient_confirmations`, and `artifact_access_events` to their case or parent artifact use `ON DELETE RESTRICT` / `NO ACTION`, never `CASCADE` or `SET NULL`.
- Existing Mustahik foreign keys on all of those pre-P0 tables are migrated away from `ON DELETE CASCADE`. Legacy applications, documents, communications, and audit rows remain retained with the case.
- Actor foreign keys may use `ON DELETE SET NULL` only because immutable actor name, role, level, and division snapshots remain on every event. User deletion itself is replaced by account deactivation wherever an actor is referenced.
- Submitted artifact revisions, approvals, access events, payments, confirmations, and artifact-file metadata have no repository delete method and no `DELETE` API.
- Physical artifact files are never removed by case archival. A retention-policy purge is outside P0 and cannot be implemented as a cascade from Mustahik.
- The current permanent `DELETE /api/mustahik/:id` behavior is disabled after the migration for every case, not only newly created P0 cases. It returns `405 HARD_DELETE_DISABLED`. Admin uses audited archive/restore endpoints instead.

Archiving sets `archived_at`, `archived_by_id`, and `archive_reason`, increments `workflow_version`, and writes append-only approval/activity events in one transaction. Archived cases are excluded from normal queues but remain available to scoped audit reads and artifact downloads. Restore clears the archive projection while preserving both archive and restore events.

### 5.9 Artifact access events

Create append-only `artifact_access_events` with `id`, `file_id`, `mustahik_id`, `artifact_type`, `artifact_id`, `artifact_revision`, `actor_id`, immutable `actor_name`, `actor_role`, `actor_level`, `actor_division`, `action`, `created_at`, and `correlation_id UUID`.

`action` is `inline_view` or `download`. After authorization and successful secure file open—but before any bytes are sent—the server inserts exactly one access event for the response. If that insert fails, the server returns `503 ACCESS_AUDIT_UNAVAILABLE` and sends no artifact bytes. Each successful range or full response has its own correlation id and event. The receipt endpoint is subject to the same rule and records `action='download'` for every successful receipt response. Unauthorized attempts remain in the security log and never create a misleading successful-access event. There is no update/delete endpoint for access events.

## 6. Canonical snapshot and hashing contract

Every submit, approval, payment record, confirmation, and completion action binds to an immutable SHA-256 snapshot.

1. The server builds a plain JSON object with `schema_version`, `artifact_type`, primary id, revision, `mustahik_id`, `application_id`, source artifact ids, all persisted form fields, ordered RAB rows, and ordered attachment metadata including file SHA-256 values.
2. Actor fields, approval events, database timestamps, display-only labels, and mutable master records are excluded from the artifact snapshot. Snapshot references use copied values, not live joins.
3. Object keys are serialized in lexicographic order; arrays retain semantic order; numbers use their normalized decimal string without thousands separators; dates use ISO 8601; absent optional values serialize as `null`; Unicode strings are NFC-normalized.
4. The canonical UTF-8 bytes are hashed with SHA-256 and stored as lower-case 64-character hexadecimal.
5. The browser sends `expected_revision` and `expected_snapshot_hash` for every material action. The server recomputes the hash and rejects mismatches with `409 STALE_ARTIFACT`.
6. Draft saves may replace a draft snapshot. Submitted or approved snapshots never change. Corrections create a new revision and new hash.

`snapshot_json` and `snapshot_hash` are nullable only while a revision is `draft`, `returned`, `superseded`, or `legacy_unverified`; every submitted or later P0 state requires both.

The hashing implementation must be one shared server module and have fixture-based tests. The system does not claim qualified cryptographic signature status; the hash proves internal record integrity and approval binding.

## 7. Role and segregation matrix

Existing `role`, `division`, and `level` fields remain the authorization inputs. Add `keuangan` to the server’s role constants and permission registry so it matches the existing frontend user type.

| Action | Normal actor | Separation rule |
| --- | --- | --- |
| Create/update P0 intake | `penyaluran` staff | Creates `workflow_mode='p0'`; actor and version are recorded. |
| Advance `Diajukan` / `Verifikasi Administrasi` | `penyaluran` staff | Requires real persisted case/document data, a decision note, and current expected version; no synthetic completeness result. |
| Create/update Assessment draft | `surveyor` or `penyaluran` staff | Authenticated actor is recorded as creator/updater. |
| Submit Assessment | `surveyor` or `penyaluran` staff | Only active draft owner or another authorized operator with an audit note. |
| Accept/return Assessment | `penyaluran` staff or leader | Reviewer must differ from submitter. No score may be added. |
| Create/update/submit MPZIS draft | `penyaluran` staff | Submit is a preparation event. Creator and submitter are excluded from all five approval slots. |
| MPZIS `Diajukan` | `penyaluran` staff | True first approval by an actor distinct from creator and submitter. |
| MPZIS `Diperiksa` | `penyaluran` staff | Must differ from every prior MPZIS actor. |
| MPZIS `Verifikator Ashnaf` | `penyaluran` staff | Must differ from every prior MPZIS actor. |
| MPZIS `Penanggungjawab Penyaluran` | `penyaluran` leader | Must differ from every prior MPZIS actor. |
| MPZIS `Disetujui` | `penyaluran` leader | Must differ from all four prior MPZIS actors. |
| Create/update/submit PPD | `penyaluran` staff | Creator/requester comes from session. |
| Finance check | `keuangan` staff or leader | Must differ from PPD creator and finance approver. |
| Finance approval | `keuangan` leader | Must differ from PPD creator and checker. |
| Record payment evidence | `keuangan` staff or leader | Requires finance approval; actor may be the checker but not the PPD creator. |
| Verify payment evidence | `keuangan` staff or leader | Must differ from the payment recorder; may be the existing finance approver. |
| Confirm recipient | `penyaluran` staff or `surveyor` | Requires recorded payment. Actor is captured; no implicit confirmation. |
| Complete case | Server service after an authorized `penyaluran` leader request | Service revalidates every gate; requester cannot alter proof data. |
| Read case artifacts | `surveyor`, `penyaluran`, `keuangan` within assigned operational scope | Bank account and NIK remain masked unless the endpoint requires full data for the actor’s current task. |
| Cross-case audit | `admin` | Read-only normal operation. |

P0 deployment requires at least four active Penyaluran staff accounts—one creator/submitter plus three staff approvers—two active Penyaluran leader accounts, one active Keuangan staff account, and one active Keuangan leader account. If creator and submitter are different people, both remain excluded and an additional eligible staff account is required. A user can hold only one MPZIS approval step on a revision even when their account has multiple capabilities.

### Admin recovery override

`admin` is not a routine Assessment reviewer, MPZIS signer, PPD creator, finance checker, finance approver, payment recorder, recipient confirmer, or completion approver. Routine action buttons are hidden for admin.

An admin may use a separate recovery endpoint only when an operational account or migration state prevents progress. It requires:

- the exact target artifact, revision, and approval step;
- `override_reason` of 20–1000 trimmed characters;
- expected revision and snapshot hash;
- an active admin session; and
- a distinct actor id that is neither MPZIS creator nor submitter and is not already used in another MPZIS step or prohibited finance step.

The resulting event has `is_admin_override=true`, preserves the admin’s real identity, names the assumed step, and appears prominently in the audit and receipt. An override cannot bypass field validation, five-distinct-actor enforcement, finance separation, amount reconciliation, payment proof, recipient confirmation, or the canonical hash. It cannot edit or delete a prior event.

## 8. Workflow and transaction boundaries

### 8.1 Assessment

1. At Mustahik status `Survey`, an authorized operator creates or resumes the active Assessment draft.
2. Submit validates all conditional fields, snapshots the revision, records the authenticated submitter, and changes Assessment to `submitted`. Mustahik remains `Survey`.
3. A distinct Penyaluran reviewer accepts or returns the submitted revision.
4. Accept changes Assessment to `accepted` and atomically advances Mustahik from `Survey` to `Persetujuan MPZIS` with `workflow_version + 1`.
5. Return changes the revision to `returned`; the next edit creates revision `n+1` with `supersedes_id` and keeps the old revision immutable.

Acceptance means the source questions are complete and reviewed. It does not mean a score exists and does not independently determine eligibility.

### 8.2 MPZIS

1. Only an accepted Assessment revision can seed an MPZIS draft.
2. Submit freezes the form snapshot and writes a separate `submit` preparation event. Submit does not fill `Diajukan` or any other approval step.
3. The five-step chain starts with a true `Diajukan` approval. All five approvers bind the same hash, differ from the creator and submitter, and differ from each other.
4. Any return ends the chain for that revision and requires a new revision; old approvals remain visible but cannot be reused.
5. The fifth distinct approval changes MPZIS to `approved`, copies `total_amount` to the Mustahik compatibility projection, and atomically advances Mustahik from `Persetujuan MPZIS` to `Pengajuan Dana (FPD)`.

### 8.3 PPD and finance

1. Only the active approved MPZIS revision can seed a PPD draft.
2. PPD submit validates all fields, calculates RAB total and terbilang, binds the approved MPZIS hash, and freezes the snapshot.
3. A Keuangan checker checks the exact PPD hash. A different Keuangan leader approves the same hash.
4. A finance actor records a payment whose amount exactly equals PPD amount and uploads valid payment proof. The server creates the payment snapshot and changes PPD to `payment_recorded`.
5. A different finance actor explicitly verifies the recorded amount, transaction reference, and proof hash; PPD changes to `payment_verified`.
6. Penyaluran or Surveyor records recipient confirmation after verified payment. The server creates the confirmation snapshot and changes PPD to `recipient_confirmed`.
7. A Penyaluran leader requests completion. In one transaction, the server revalidates active approved MPZIS, approved PPD, amount equality, verified proof file, finance separation, recipient confirmation, and unchanged hashes; sets PPD `completed`; advances Mustahik to `Penyaluran Selesai`; writes approval/activity events; then queues receipt generation.
8. If receipt generation fails, the completed transaction remains valid but the case displays `Bukti digital gagal dibuat` and the idempotent receipt job retries. Completion cannot fabricate or silently omit the receipt.

Every state-changing service locks the Mustahik and active artifact rows, checks expected version/hash, writes the artifact/event/status projections atomically, and uses an idempotency key for retriable POST requests.

## 9. API contract

All endpoints require authentication. Error envelopes use `{ success:false, code, message, field_errors? }`. List/read responses never return unmasked bank account data by default.

### Assessment

| Method and path | Purpose |
| --- | --- |
| `GET /api/penyaluran/mustahik/:id/assessment` | Active revision plus revision summary. |
| `POST /api/penyaluran/mustahik/:id/assessment/drafts` | Create first or successor draft. |
| `PUT /api/penyaluran/mustahik/:id/assessment/:assessmentId` | Save active draft with `expected_revision`. |
| `POST /api/penyaluran/mustahik/:id/assessment/:assessmentId/submit` | Validate, snapshot, and submit. |
| `POST /api/penyaluran/mustahik/:id/assessment/:assessmentId/review` | Body action `accept` or `return`, note, expected revision/hash. |

### MPZIS

| Method and path | Purpose |
| --- | --- |
| `GET /api/penyaluran/mustahik/:id/mpzis` | Active revision, prior revisions, five approval steps. |
| `POST /api/penyaluran/mustahik/:id/mpzis/drafts` | Seed a draft from the accepted Assessment and Mustahik snapshots. |
| `PUT /api/penyaluran/mustahik/:id/mpzis/:mpzisId` | Save active draft. |
| `POST /api/penyaluran/mustahik/:id/mpzis/:mpzisId/submit` | Freeze submitted snapshot. |
| `POST /api/penyaluran/mustahik/:id/mpzis/:mpzisId/approvals/:step` | Approve or return the current required step. `step` is one of the five canonical step keys. |

Canonical MPZIS step keys are `proposed`, `examined`, `ashnaf_verified`, `responsible_acknowledged`, and `approved`.

### PPD, payment, and completion

| Method and path | Purpose |
| --- | --- |
| `GET /api/penyaluran/mustahik/:id/ppd` | Active revision, RAB, finance events, payment, confirmation, receipt metadata. |
| `POST /api/penyaluran/mustahik/:id/ppd/drafts` | Seed a PPD from the approved MPZIS snapshot. |
| `PUT /api/penyaluran/mustahik/:id/ppd/:ppdId` | Save fields and one-to-three RAB lines in one transaction. |
| `POST /api/penyaluran/mustahik/:id/ppd/:ppdId/submit` | Validate, calculate total/terbilang, freeze snapshot. |
| `POST /api/penyaluran/mustahik/:id/ppd/:ppdId/finance-check` | Check submitted PPD. |
| `POST /api/penyaluran/mustahik/:id/ppd/:ppdId/finance-approve` | Approve a checked PPD as a distinct finance actor. |
| `POST /api/penyaluran/mustahik/:id/ppd/:ppdId/payment-proof` | Multipart proof upload followed by payment record creation. |
| `POST /api/penyaluran/mustahik/:id/ppd/:ppdId/payment-verify` | Verify recorded payment amount, reference, and proof hash as a distinct finance actor. |
| `POST /api/penyaluran/mustahik/:id/ppd/:ppdId/recipient-confirmation` | Store explicit recipient confirmation. |
| `POST /api/penyaluran/mustahik/:id/ppd/:ppdId/complete` | Revalidate all gates and complete atomically. |
| `GET /api/penyaluran/mustahik/:id/ppd/:ppdId/receipt` | Audit access, then stream the persisted authoritative receipt with `Cache-Control: no-store`. |

All authenticated artifact-file reads use `GET /api/penyaluran/mustahik/:id/artifacts/:fileId?disposition=inline|attachment`; successful reads append the access event defined in Section 5.9 before streaming. The receipt route is not an exception: its successful response also appends a `download` event before streaming.

Admin case retention endpoints are `POST /api/admin/penyaluran/mustahik/:id/archive` and `POST /api/admin/penyaluran/mustahik/:id/restore`. Both require reason, expected status/version, and idempotency key. `DELETE /api/mustahik/:id` is permanently non-operational after the P0 migration and returns `405 HARD_DELETE_DISABLED`.

State-changing request bodies include `expected_status`, `expected_version`, `expected_revision`, `expected_snapshot_hash` after a submitted snapshot exists, `note`, and an `idempotency_key` UUID. The server ignores/rejects `actor_id`, `actor_name`, `actor_role`, actor timestamps, calculated totals, terbilang, and snapshot hashes supplied as claimed authoritative values.

Status codes are fixed:

- `400` malformed JSON/multipart or unsupported file bytes;
- `401` no valid session;
- `403` actor lacks the required role/level or violates separation;
- `404` case/artifact not found in actor scope;
- `409` stale version/hash, duplicate number/idempotency key, wrong step order, or concurrent write;
- `413` file exceeds the limit;
- `422` field/conditional/amount/state validation error;
- `201` draft/event/file created; `200` read/update/idempotent replay accepted.

### Legacy endpoint policy

The existing write endpoints `/api/mustahik/:id/assessment[s]`, `/api/mustahik/:id/mpzis`, `/api/mustahik/:id/ppd`, and the generic decision endpoint must not advance a `workflow_mode='p0'` case. After cutover, production returns `410 LEGACY_WORKFLOW_DISABLED` for legacy artifact writes and rejects generic decisions that would skip P0 gates. Read-only legacy detail remains available for historical cases.

## 10. Next.js product structure and experience

`MustahikWorkspace` remains the queue and case shell, but synthetic `completeness`, `score`, `sla`, document status, and static activity are removed. It reads a server-computed `case_progress` object and real artifact/activity records.

Implementation components are organized by responsibility:

```text
frontend-next/components/penyaluran/mustahik/
  MustahikWorkspace.tsx                 queue, selection, stage filters
  case/CaseWorkflowPanel.tsx            active stage orchestration
  case/CaseProgressSummary.tsx          server-truth gate summary
  shared/ArtifactStatusBanner.tsx
  shared/ApprovalTimeline.tsx
  shared/FieldErrorSummary.tsx
  shared/MoneyInput.tsx
  assessment/AssessmentForm.tsx
  assessment/AssessmentReviewPanel.tsx
  mpzis/MpzisForm.tsx
  mpzis/MpzisApprovalStepper.tsx
  ppd/PpdForm.tsx
  ppd/RabLineEditor.tsx
  ppd/FinanceApprovalPanel.tsx
  ppd/PaymentEvidencePanel.tsx
  ppd/RecipientConfirmationPanel.tsx
  ppd/SystemReceiptPanel.tsx
```

The selected case shows four tabs: `Ringkasan`, `Proses`, `Dokumen`, and `Riwayat`. `Proses` opens the exact artifact for the current stage. `Dokumen` uses actual backend records, and `Riwayat` combines artifact approvals, high-level decisions, activity logs, payment, confirmation, receipt creation, and admin recovery events in chronological order.

### Form behavior

- Drafts autosave only after local validation and visibly show `Menyimpan`, `Tersimpan`, or `Gagal disimpan`; autosave never submits or approves.
- Submit/approve/complete uses an explicit confirmation panel summarizing the irreversible effect and current hash prefix.
- Conditional fields appear immediately: rent amount for `Kontrak`, prior year for previous BAZNAS application, and details for `Lain-lain` payment.
- RAB always shows one row initially, allows rows 2 and 3, and prevents a fourth. Removing a row renumbers remaining lines 1–3 before save.
- The UI shows calculated RAB total, approved MPZIS ceiling, and remaining difference. It never lets a client calculation replace server validation.
- Five MPZIS steps display required role, authenticated actor, server time, status, and hash prefix. A used actor sees a clear segregation message rather than an enabled button.
- Keuangan users land directly on assigned finance checks/approvals; Penyaluran cannot impersonate Keuangan.
- Missing source values display `Belum dicatat`. No score card, percentage completeness, default signer, default date, fake document state, or guessed SLA is rendered.
- On `409`, the UI preserves unsaved input, disables further submission, and offers `Muat data terbaru` plus a field-by-field changed-data summary.

## 11. Validation rules

Validation is shared as server-owned pure functions and mirrored client-side for usability. Server results are authoritative.

- All human-entered strings are trimmed. Required names and descriptions reject whitespace-only values.
- NIK/account data are not copied into narrative fields or logs.
- Dates cannot be in the future except no future-dated fields are required by P0; `paid_at` and confirmation time are server-bounded to no later than five minutes after request receipt.
- Assessment conditional rules follow Section 5.2 exactly.
- MPZIS cannot submit without an accepted Assessment hash and all required source fields.
- MPZIS steps must occur in canonical order on the same unchanged hash with five unique approvers, none equal to the creator or submitter.
- PPD cannot submit without one-to-three valid RAB lines, a valid approved MPZIS hash, unique numbers, structured bank snapshot, explicit fund source/payment confirmation, and amount within the MPZIS ceiling.
- Finance approval cannot occur before finance check or by the checker.
- Payment cannot occur before finance approval; paid amount must equal PPD amount; proof must pass file policy.
- Payment verification cannot be performed by the recorder and cannot occur before a valid payment record exists.
- Recipient confirmation cannot occur before verified payment and is never inferred from WhatsApp, a timestamp, or status.
- Completion revalidates the entire chain from Assessment through confirmation in one locked transaction.

## 12. Error handling and accessibility

### Error handling

- Field errors return stable keys and are shown beside the field and in a focusable error summary.
- Server or network failure preserves the draft in component state; the user receives an actionable retry message. Production never substitutes demo data.
- Duplicate form/transaction numbers identify the conflicting field without revealing another case’s PII.
- File failures distinguish unsupported type, invalid magic bytes, size, and storage failure.
- Receipt generation is an observable idempotent job with `pending`, `ready`, or `failed` state and admin-visible failure detail stripped of PII.

### Accessibility

- Every input has a persistent visible label; related radio options use `fieldset` and `legend`.
- Required/conditional help and errors are connected with `aria-describedby`; invalid controls use `aria-invalid`.
- On failed submit, focus moves to the error summary, whose links focus the relevant control.
- Approval dialogs trap focus, close with Escape before irreversible submission, restore focus to the trigger, and never rely on color alone.
- Loading and successful draft saves use polite `role="status"`; validation/server failures use `role="alert"`.
- All actions work by keyboard, have visible focus, and maintain at least a 44-by-44 CSS-pixel target on touch layouts.
- Desktop, tablet, and mobile layouts preserve source-field order and never hide an approval status or error behind horizontal clipping.
- Money is announced with an accessible Indonesian text value while remaining visually formatted with tabular numerals.

## 13. Artifact and privacy security

- Allowed evidence types are PDF, JPEG, and PNG. Maximum size is 10 MiB per file and 30 MiB per case for P0 evidence.
- The server verifies file signatures/magic bytes, ignores the client filename for storage, generates a random stored name, and stores files outside the public web root.
- Each file receives a SHA-256 hash at ingestion. Submitted evidence is immutable; correction uploads a new file and retains the old revision.
- Downloads require an authenticated, scoped route; use `X-Content-Type-Options: nosniff`, safe `Content-Disposition`, and `Cache-Control: private, no-store`.
- Payment proof and confirmation evidence are visible only to scoped Penyaluran, Keuangan, and admin audit actors. Public tracking never exposes them.
- Full NIK and bank account values are absent from activity logs, application logs, error telemetry, receipt QR/text payloads, and default API responses.
- The receipt displays masked NIK/account, artifact ids, revision numbers, actor names/roles, server timestamps, and hash values. It does not embed payment-proof bytes or signature placeholders.
- Receipt access and generation create append-only audit events.

## 14. Bukti Digital Penyaluran PDF

The server generates the receipt with the existing PDFKit stack after successful completion and persists it in `artifact_files` as `system_receipt_pdf`. It is generated once per completed PPD revision; repeated requests return the same stored file and SHA-256.

The PDF contains:

1. BAZNAS identity, title `Bukti Digital Penyaluran`, receipt id, creation server time, and case/file number.
2. Masked recipient identity and location.
3. Assessment id/revision/status/hash and the complete source-field values, with the household block rendered twice to reflect the authoritative source layout while explicitly labeling both as copies of one digital record.
4. MPZIS form number, classification, purpose, asnaf, fund source, recipient type/count, amount, id/revision/hash, and all five distinct approvals with actor name/role/server time/hash prefix.
5. PPD numbers, requester identity, fund source, payment type, masked bank snapshot, one-to-three RAB rows, calculated total, terbilang, id/revision/hash, finance check and finance approval.
6. Payment transaction, amount, paid time, payment-proof file id/hash, recipient confirmation method/time/actor, and optional evidence file id/hash.
7. Completion actor/time, correlation id, receipt SHA-256, and a statement that approvals are authenticated system events without signature images.

No value may fall back to a hard-coded name, date, amount, bank, role, or signature. Receipt generation fails visibly if required persisted data are absent.

## 15. Compatibility and migration

Migration is additive and reversible at the application layer. The executable contract is:

1. Add `server/migrations/20260913_001_mustahik_p0.sql`. It runs in one PostgreSQL transaction under an advisory lock, creates `schema_migrations(version PRIMARY KEY, checksum, applied_at)`, adds all P0 columns/tables/indexes/checks, replaces the relevant cascading foreign keys with the restrictive rules in Section 5.8, performs deterministic legacy backfill, and records version `20260913_001` plus the migration-file SHA-256.
2. `server/db.js` runs unapplied `server/migrations/*.sql` in lexical order before accepting traffic. An applied version with a different checksum fails startup; a second run with the same checksum is a no-op. Production does not continue on a partially applied or failed migration.
3. `server/schema.sql` represents the identical final fresh-database schema. It is not a second ad-hoc migration path. Runtime P0 `ALTER TABLE` fragments outside the versioned migration runner are prohibited.
4. Back up PostgreSQL and prove restore before executing the migration. A read-only dry run reports status counts, orphaned rows, duplicate identifiers, invalid amounts, cascading FK names to replace, and in-flight reconciliation candidates.

Legacy rows map per table as follows:

| Table | Deterministic mapping |
| --- | --- |
| `mustahik` | Set missing `workflow_mode='legacy'`; preserve `status`, `workflow_version`, every business value, and timestamps byte-for-byte. Do not rewrite the queue status. Archive/reconciliation fields remain null. |
| `applications` | Preserve all values and links. They remain historical intake records and are not treated as artifact approval evidence. |
| `assessments` | Set `source='legacy'`, artifact `status='legacy_unverified'`, and revisions by `ROW_NUMBER()` ordered by `created_at,id` within `(mustahik_id, application_id)`. New source fields and snapshot/hash stay null; legacy score columns remain historical only. |
| `mpzis` | Set `source='legacy'`, artifact `status='legacy_unverified'`, and deterministic revision in the same order. Preserve all old role-name strings, but do not convert them into authenticated approvals. Snapshot/hash stay null. |
| `ppd` | Set `source='legacy'`, artifact `status='legacy_unverified'`, and deterministic revision. `mpzis_id` and new structured fields may remain null for legacy rows; existing amounts/numbers/text remain unchanged and cannot satisfy P0 finance gates. |
| `documents` | Retain as legacy case documents with restrictive Mustahik FK. Do not reinterpret a generic document as payment or confirmation proof. |
| `approval_decisions` | Preserve rows and actor text; set new artifact linkage/hash null and `evidence_grade='legacy_unbound'`. Do not manufacture artifact ids or hashes. |
| `activity_logs` and `wa_logs` | Preserve unchanged as operational history; neither is approval evidence. |
| New P0 tables | Start empty; no approval, file, access, payment, confirmation, or receipt event is synthesized. |

Completed and rejected legacy cases remain read-only and show `Legacy — belum memiliki bukti digital P0`; they receive no retroactive electronic approval or receipt. `Diajukan` and `Verifikasi Administrasi` cases can switch directly to `p0` because no P0 artifact is yet implied. Other in-flight cases enter `workflow_mode='legacy_reconciliation'`: `legacy_status_snapshot` receives the existing status while `mustahik.status` remains unchanged. Reconciliation rebuilds artifacts from the earliest missing Assessment onward, records original row ids and imported-value hash, and writes an admin `legacy_reconciliation` event with reason. Compatibility status transitions are suppressed during catch-up. When authoritative artifacts reach the gate represented by the unchanged queue status, the service atomically switches the mode to `p0`; reconciliation never approves content or waives required actors.

New cases after the recorded cutover timestamp use `workflow_mode='p0'`. Compatibility projections update only inside authoritative P0 transactions. Constraints that would reject historical values are conditional on `source='p0'` or submitted/later P0 states.

## 16. Test strategy

### Unit and contract tests

- Canonical JSON fixtures prove stable ordering, Unicode normalization, decimal/date encoding, and SHA-256 values.
- Assessment validation covers every source field, both conditional pairs, no-score rejection, and the single-record/two-print-copy contract.
- MPZIS tests cover exact enums, required snapshots, submit as a separate preparation event, creator/submitter exclusion, ordered five-step state machine, five unique approvers, role/level checks, return/new revision behavior, and admin override limits.
- PPD tests cover one, two, and three RAB lines; reject zero/four lines; total calculation; Indonesian terbilang; MPZIS ceiling; unique numbers; enums; `Lain-lain`; bank snapshot masking/encryption failure.
- Finance/payment tests cover checker/approver separation, exact payment amount, proof requirement, recorder/verifier separation, confirmation ordering, and full completion gate.
- Permission tests align frontend capability hints with server policy, including `keuangan`.

### Repository and API tests

- Each state change proves artifact/event/Mustahik projection atomicity and rollback on audit failure.
- Concurrent expected-version/hash tests return `409` and do not create duplicate approvals.
- Idempotency tests replay the same successful result and reject key reuse with a different payload.
- Negative route tests cover unauthenticated, wrong division, wrong level, self-approval, reused MPZIS actor, admin routine action, invalid admin recovery, and cross-case access.
- Upload tests cover magic-byte mismatch, executable/polyglot rejection, size limits, randomized storage name, immutable hashes, authorization, and no-store headers.
- Legacy endpoints reject P0 cases and cannot skip an artifact gate.
- Retention tests prove `DELETE /api/mustahik/:id` returns `405`, archive/restore is audited and reversible, archived rows leave every artifact/event/file accessible, and direct parent deletion is rejected by restrictive foreign keys.
- Access-event tests prove each authorized inline/full/range artifact response appends the exact case/file/artifact/revision/actor/action/time/correlation record before bytes, audit insertion failure returns `503` with zero bytes, and unauthorized requests create no successful-access event.

### Migration and schema parity tests

- `server/migration-parity.test.js` is an executable Node test included by `npm test`; it creates a fresh PostgreSQL database from `server/schema.sql` and upgrades a pre-P0 fixture with `20260913_001_mustahik_p0.sql`, then compares columns, types, nullability, defaults, checks, indexes, unique constraints, foreign keys, and `ON DELETE` rules.
- Upgrade fixtures cover empty, representative legacy, duplicate-number, orphan-detection, completed, rejected, and every in-flight queue status. Tests assert that `mustahik.status` and legacy values are unchanged and each table receives the exact mapping in Section 15.
- Migration-runner tests prove checksum enforcement, advisory-lock serialization, atomic rollback on failure, same-checksum idempotency, and startup refusal after a failed or altered migration.

### Next.js tests

- Typed client methods use exact paths and payload contracts.
- Component tests cover all Assessment fields and conditions, MPZIS step capabilities, PPD RAB editing, finance states, payment/confirmation states, retry/stale handling, missing-data wording, and real history loading.
- Accessibility tests cover labels, fieldsets, error summary focus, keyboard flow, dialogs, announcements, and disabled-action explanations.
- Regression tests prove no synthetic score/completeness/SLA/document state is rendered.

### Receipt and end-to-end tests

- PDF tests parse generated text and metadata from a masked fixture and prove every artifact id/revision/hash, five MPZIS actors, two finance actors, RAB lines, payment proof hash, and recipient confirmation are present.
- A generated receipt is stored once; repeated retrieval returns identical bytes and hash.
- The Assessment section renders the same logical data twice without creating a second Assessment row.
- The masked happy path completes entirely through Next and API without legacy Vite or Excel.
- Negative E2E paths prove completion is blocked separately by missing/invalid amount, missing proof, unapproved finance, missing recipient confirmation, stale hash, and duplicated MPZIS actor.

## 17. Acceptance gates

P0 cannot be called complete until all gates are green:

1. Every field from the authoritative household Assessment, F-BPP/06 data block, and F-PKP/03/RAB/payment block has a typed Next control, persisted field, server validation, read-back path, and test.
2. A saved draft reloads unchanged; a submitted revision cannot be edited; a correction creates a traceable successor.
3. Assessment exposes no score and all absent legacy values show `Belum dicatat`.
4. One logical Assessment is rendered twice in the receipt and stored once.
5. MPZIS submit is a separate preparation event; its creator and submitter occupy none of the five slots, and approval demonstrably uses five other, different user ids in order on one snapshot hash.
6. PPD has one-to-three non-empty RAB lines; the server total equals line sum and does not exceed approved MPZIS amount.
7. Keuangan checker and leader approver are different users; Penyaluran cannot perform either action.
8. Payment recorder and verifier are different authenticated finance users.
9. `Penyaluran Selesai` is impossible without matching payment amount, valid immutable verified proof, explicit recipient confirmation, and unchanged hashes.
10. Bukti Digital Penyaluran is server-generated from persisted data only, immutable, retrievable with authorization, and contains the required trace fields without fake signatures/defaults.
11. Legacy write routes cannot mutate P0 cases or advance status.
12. Backend test suite, frontend test suite, TypeScript check, Next production build, schema migration dry run, and masked end-to-end flow pass.
13. Security review has no Critical/Important issue; accessibility review has no blocker in the complete keyboard form flow.
14. No application route can hard-delete a Mustahik or cascade-delete provenance; archive/restore and every artifact access are append-only audited events.
15. Fresh-schema and migrated-schema introspection are identical, the version/checksum ledger is enforced, and every legacy table mapping preserves the original Mustahik queue status.

## 18. Rollout

1. Verify database backup/restore, active account counts for all required distinct roles, upload storage permissions, PDF output storage, and production encryption/hash configuration.
2. Deploy additive migration and backend services with `PENYALURAN_P0_ENABLED=false`; run migration report and read-only compatibility smoke tests.
3. Deploy Next components and typed client behind the same flag. Legacy cases remain readable.
4. Enable P0 for masked UAT cases only. Complete the full path with one Penyaluran creator/submitter, three other Penyaluran staff approvers, two Penyaluran leader approvers, Keuangan staff, Keuangan leader, and a recipient-confirmation actor.
5. Review the generated receipt, approval timeline, negative authorization logs, and reconciliation report. Resolve all P0 acceptance failures before cutover.
6. Record a production cutover timestamp, enable P0 for new cases, disable legacy artifact writes, and monitor errors, stale conflicts, upload failures, receipt jobs, and blocked completion attempts.
7. Reconcile in-flight legacy cases individually through the audited recovery flow. Never bulk-certify them.

## 19. Rollback

Rollback never deletes P0 tables, revisions, approvals, files, hashes, or receipts.

- If the Next UI is faulty, turn off new P0 intake, keep the backend and completed P0 records read-only, and redeploy the last healthy Next release. Do not reactivate legacy writes for P0 cases.
- If a backend transition is faulty, disable state-changing P0 endpoints while retaining reads/downloads, restore the last healthy backend release compatible with the additive schema, and reconcile only transactions proven incomplete by audit ids.
- If receipt generation is faulty, keep workflow writes only if completion invariants remain correct; mark receipt state failed and retry after the renderer fix. Never regenerate a different receipt over an existing ready receipt.
- If the database migration itself fails before writes, restore the verified backup. After any P0 write exists, fix forward with additive migrations rather than down-migrating evidence.

Rollback success means no approved event or evidence becomes mutable or disappears, no case silently falls back to legacy mutation, and operators receive an explicit read-only/temporarily unavailable state.

## 20. Design rationale

Keeping high-level queue statuses stable minimizes dashboard and public-tracking disruption, while source-specific revision states make the real approval gates enforceable. Relational fields support operational validation and reporting; canonical snapshots and append-only actor events prove exactly what each person approved. Additive migration preserves history without giving old incomplete rows false authority. A system-native receipt provides P0 accountability now, while exact native-template rendering can be added in P1 without changing the authoritative data or approvals.
