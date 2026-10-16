# Penyaluran operational hardening — design

**Date:** 2026-09-07  
**Scope:** Divisi Penyaluran only

## Objective

Make the Penyaluran workspace safe for day-to-day team use. The workflow must
separate execution from approval, use production data honestly, and retain a
complete audit trail for every material decision.

## Roles

| Role | Purpose | May do |
| --- | --- | --- |
| Staff Penyaluran | Operational executor | Intake, administrative verification, update data, record recommendations, submit a decision for approval |
| Kepala Bagian Penyaluran | Division leader / approver | Review the submitted recommendation, approve or reject material decisions, view division queue and audit trail |
| Admin Sistem | Platform administration, outside daily Penyaluran approval | Manage accounts and operational configuration; not used as a shortcut for normal approval |

Current users will gain a `division` and `level` model. The compatibility role
field remains temporarily while permission checks are centralised in one
resolver. This avoids a risky all-at-once migration for existing accounts.

## Workflow

```text
Pengajuan
  -> Verifikasi Administrasi (Staff Penyaluran)
  -> Survey (recorded by authorised field staff)
  -> Rekomendasi Staff Penyaluran
  -> Persetujuan Kepala Bagian Penyaluran
  -> Pengajuan Dana (PPD)
  -> Penyaluran Selesai
```

The sensitive approval gate is separated from preparation: the same actor may
not prepare and approve the same recommendation. A rejected decision returns
to the appropriate prior step with a mandatory reason.

## Data integrity and audit

- Every transition records actor, role, division, prior status, new status,
  note, timestamp, and an immutable correlation id.
- Status changes use an expected-current-status/version check. A stale update
  returns HTTP `409` rather than overwriting another operator's work.
- The status change, approval record, and activity log run atomically where
  supported by the database adapter.
- The detail screen shows a readable audit timeline and explicitly labels who
  prepared versus who approved a decision.

## Production truthfulness

- Production login never pre-fills credentials and never creates a demo token.
- Production pages never silently replace failed API data with demo data.
  They show an actionable unavailable/error state instead.
- Demo data remains possible only behind an explicit non-production demo flag.
- The health endpoint verifies the live database before reporting healthy.

## Security and operational safeguards

- Add endpoint-specific rate limits for login, public application, tracking,
  and uploads.
- Move to short-lived server-managed sessions and implement logout/revocation;
  do not rely on a permanent browser token.
- Scope exports to the user's authorised division and selected report filters;
  prevent broad `SELECT *` exports of mustahik data.
- Keep production fail-closed if PostgreSQL is unavailable. No SQLite/demo
  fallback in production.
- Identify and disable or reset any retained default operational accounts as a
  deliberate administrator action, rather than deleting unknown accounts.

## Delivery and verification

1. Add role/permission and workflow integrity tests before each backend change.
2. Update the Penyaluran frontend for role-specific queues, decision states,
   audit history, and honest API error states.
3. Restore full frontend test coverage in CI after fixing the existing
   Mustahik workspace test mismatch.
4. Add a database-aware health check and production runbook for user creation,
   account reset, backup/restore testing, and incident handling.
5. Validate locally, commit, push, and deploy only through the hardened VPS
   release workflow.

## Non-goals for this increment

- Building workflows for other divisions.
- Automatically deleting existing production accounts.
- Adding financial division approval; the Kepala Bagian Penyaluran is the
  temporary final approver until other division workflows are introduced.
