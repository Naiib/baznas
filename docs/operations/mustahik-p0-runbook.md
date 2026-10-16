# BAZNAS Mustahik P0 — Deployment Runbook & Operational Procedures

This operational runbook defines the exact sequence of deployment, verification, cutover, monitoring, and contingency rollback procedures for the BAZNAS Mustahik P0 Digitalization release.

> **CRITICAL PRODUCTION SAFETY NOTICE**:
> - Evidence tables (`schema_migrations`, `artifact_approvals`, `artifact_files`, `artifact_access_events`, `ppd_payments`, `recipient_confirmations`, `activity_logs`) and stored artifact files **MUST NEVER BE DOWN-MIGRATED, TRUNCATED, OR DELETED**.
> - In case of post-cutover failure, use **FIX-FORWARD**. Setting `PENYALURAN_P0_ENABLED=false` disables P0 mutation routes with HTTP 503; authenticated P0 workspace GETs remain available and evidence stays preserved.
> - No deployment, remote push, PM2 restart, or production database mutation may occur without explicit human stakeholder approval.

---

## 1. Pre-Deployment Readiness Gates

Before executing any deployment on the Hostinger VPS (`baznas.muhammadrofiq.my.id`), verify the following prerequisites:

### Gate 1.1: Environment Variable & Encryption Key Validation
Ensure the following environment variables are securely provisioned in `/opt/web_baznas/repo/.env`:
- `PENYALURAN_P0_ENABLED=false` (Initial deployment must have the flag disabled)
- `P0_FIELD_ENCRYPTION_KEY=<base64-encoded 32-byte key>` (Required for AES-256-GCM bank account encryption)
- `DATABASE_URL=postgresql://...` (Production PostgreSQL connection string)
- `JWT_SECRET=<strong-production-secret>` (Minimum 32 characters; default/dev secrets rejected)
- `NODE_ENV=production`

### Gate 1.2: Artifact Directory & Storage Permissions
The artifact storage root must be initialized with restricted permissions:
```bash
# On Hostinger VPS as operator
sudo mkdir -p /opt/web_baznas/storage/p0-artifacts
sudo chown -R baznas:baznas /opt/web_baznas/storage/p0-artifacts
sudo chmod 700 /opt/web_baznas/storage/p0-artifacts
```

### Gate 1.3: Active Role Account Inventory
Verify that all canonical roles required for P0 workflow segregation exist in the database:
- `amil` / `staff` (Intake and PPD creation)
- `surveyor` (Assessment field recording)
- `reviewer` (Assessment review)
- `mpzis_staff` / `amil_mpzis` (MPZIS preparation)
- `approver_1` through `approver_5` (Distinct MPZIS approval sequence)
- `keuangan_staff` (Finance check and payment recording)
- `keuangan_leader` (Finance approval)
- `payment_verifier` (Distinct payment verification)
- `recipient_confirmer` (Field recipient confirmation)
- `penyaluran_leader` (Final case completion)

```bash
# Query active accounts by division and role
psql "$DATABASE_URL" -c "SELECT division, role, COUNT(*) FROM users WHERE is_active=true GROUP BY division, role ORDER BY division, role;"
```

---

## 2. Pre-Migration Database Backup & Restore Verification

A physical and logical backup must be created and verified on the VPS prior to applying any migration.

### Step 2.1: Native PostgreSQL Logical Dump
```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/opt/web_baznas/backups/baznas_prod_${TIMESTAMP}.dump"
mkdir -p /opt/web_baznas/backups

# Custom format with compression and blob inclusion
docker exec web_baznas-postgres-1 pg_dump -U postgres -Fc -b -v -f "/var/lib/postgresql/data/backup_${TIMESTAMP}.dump" web_baznas
docker cp "web_baznas-postgres-1:/var/lib/postgresql/data/backup_${TIMESTAMP}.dump" "$BACKUP_FILE"

# Verify dump file integrity and table TOC
pg_restore -l "$BACKUP_FILE" | head -n 30
sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
```

### Step 2.2: Verify Logical Restore on Synthetic PostgreSQL 16
Run the rehearsal only against the named disposable synthetic container. It requires the explicit opt-in below, verifies the Docker container name/image/port and PostgreSQL 16 server version, creates unique m6_rehearsal_* databases, and drops only those databases and its generated dump file when finished. Never point this rehearsal at production or reuse a production connection string.

```bash
cd /home/multica-agent/workspaces/baznas-p0-part1/work-m1-m6
P0_M6_REHEARSAL_ALLOW_SYNTHETIC_PG16=1 node scripts/rehearse-m6-migration.js
```

The rehearsal uses pg_dump -Fc and pg_restore -l/pg_restore --exit-on-error to restore into a separate database. It hashes every source legacy table, compares independent source and restored connections, then checks those source columns again after migrations. The production backup from Step 2.1 is a separate artifact; do not restore it into the production container for this verification.

---

## 3. P0 Migration Execution Sequence

### Step 3.1: Read-Only Migration Dry-Run
Run the migration runner dry-run analysis against the live database with `P0_ALLOW_LIVE_MIGRATION_DRY_RUN=1`:
```bash
cd /opt/web_baznas/repo
P0_ALLOW_LIVE_MIGRATION_DRY_RUN=1 node server/penyaluran-p0/migration-runner.js --dry-run
```
Expected output:
```json
{
  "statuses": [...],
  "orphans": 0,
  "duplicate_identifiers": 0,
  "invalid_amounts": 0,
  "cascading_foreign_keys": 8,
  "in_flight_legacy_cases": 0
}
```
If `orphans > 0` or `invalid_amounts > 0`, **STOP**. Review legacy data anomalies before proceeding.
The dry-run excludes rows with a NULL foreign key because the schema permits global activity-log entries; it counts only non-NULL IDs with no matching Mustahik record. Do not whitelist or ignore a reported non-NULL orphan: the STOP gate remains mandatory until each anomaly is reconciled and a fresh dry-run is clean.

### Step 3.2: Run Pending Migrations
Execute the transactional migration runner:
```bash
npm run p0:migration:run
```
The runner will:
1. Acquire PostgreSQL advisory lock `0x50304D4947524154` (`P0MIGRAT`).
2. Verify `schema_migrations` table and checksum ledger.
3. Apply migration `20260913_001_mustahik_p0.sql` (`d414bc0e...`).
4. Apply migration `20260919_002_p0_receipt.sql` (`3db9f368...`).
5. Apply migration `20260919_003_p0_contract_parity.sql` (`0e00e692...`).
6. Release advisory lock and confirm applied versions.

### Step 3.3: Verify Migration Checksums in Database
```bash
psql "$DATABASE_URL" -c "SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version;"
```

---

## 4. Application Deployment (Flag-Gated OFF)

### Step 4.1: Pull Release Candidate SHA
```bash
git fetch origin
git checkout <RELEASE_CANDIDATE_SHA>
```

### Step 4.2: Build Next.js Production Assets
```bash
npm --prefix frontend-next ci
npm --prefix frontend-next run build
```

### Step 4.3: Restart Application Services with P0 Flag FALSE
```bash
pm2 reload baznas-backend --update-env
pm2 reload baznas-nextjs --update-env
```

### Step 4.4: Read-Only & Health Smoke Test
```bash
# Verify health endpoint returns 200 and confirms PostgreSQL engine
curl -s http://127.0.0.1:3001/health | jq .

# Verify legacy endpoints are responsive
curl -s -H "Authorization: Bearer $AMIL_TOKEN" http://127.0.0.1:3001/api/mustahik?limit=1 | jq .

# P0 workspace GET is read-only and not flag-gated (an existing authorized case should return 200)
curl -s -H "Authorization: Bearer $AMIL_TOKEN" http://127.0.0.1:3001/api/penyaluran/mustahik/1/workspace | jq .
```

---

## 5. Staging UAT & Cutover

### Step 5.1: Operator Staging / Smoke Test
1. Enable the flag only on the isolated staging backend and use masked/test accounts. It is a server-wide boolean; no per-IP allow-list or user-scoped canary is implemented.
2. Complete one full masked API case from intake to receipt retrieval.
3. Verify the downloaded receipt PDF bytes and cryptographic SHA-256 match.
4. Perform browser UAT separately; this API smoke test does not clear the browser gate.

### Step 5.2: Formal Cutover Timestamp & Flag Enablement
Upon stakeholder authorization:
1. Update `/opt/web_baznas/repo/.env`:
   ```env
   PENYALURAN_P0_ENABLED=true
   ```
2. Reload backend service:
   ```bash
   pm2 reload baznas-backend --update-env
   ```
3. Record exact cutover timestamp in operational logs:
   ```bash
   echo "BAZNAS P0 CUTOVER AT: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> /opt/web_baznas/logs/cutover.log
   ```

---

## 6. Post-Cutover Monitoring & Legacy Write Freeze Verification

1. **Verify Legacy Write Freeze**:
   - Ensure legacy `POST /api/mustahik` rejects control fields (`workflow_mode`, `archived_at`).
   - Monitor activity logs to confirm no new un-audited legacy mutations occur.
2. **Monitor Telemetry & Performance**:
   - Check error rates: `pm2 logs baznas-backend --lines 100`.
   - Monitor database locks and query latency.
   - Verify artifact access audit logs in `artifact_access_events`.
   - Ensure receipt generation queue has 0 failed jobs.

---

## 7. Rollback & Contingency Procedures

If unexpected critical issues occur post-cutover:

### Procedure A: Immediate Operational Safety Deactivation (Recommended)
1. Edit `.env` to set:
   ```env
   PENYALURAN_P0_ENABLED=false
   ```
2. Reload PM2:
   ```bash
   pm2 reload baznas-backend --update-env
   ```
3. The system returns immediately to legacy preservation mode:
   - New P0 intakes are rejected with `503 Service Unavailable`.
   - Existing P0 cases remain safely preserved as read-only.
   - Evidence records in `artifact_files`, `ppd_payments`, and `artifact_approvals` remain 100% intact.

### Procedure B: Fix-Forward Policy
- Schema migrations `001`, `002`, and `003` are strictly additive and backward-compatible.
- **Do not roll back schema migrations** or drop tables on live production.
- Prepare a targeted bugfix release candidate, verify on synthetic PostgreSQL 16, and deploy forward.
