# Penerimaan cutover runbook

Status: Task 12, Task 1 evidence captured 2026-09-12

## Evidence and parity

The frozen legacy inventory was inspected together with `server/schema.sql` and the PostgreSQL-backed
repository. Legacy Penerimaan transactions are static client-side mock data in
`src/data/penerimaanData.js` and `src/data/dashboardData.js`; no legacy operational table, export, or
CRUD endpoint exists. Consequently, there is no authoritative legacy dataset and no defensible legacy
total to compare. The recorded result is `not-applicable`, not zero and not a fabricated match.

The migrated side can be exported read-only by an operator into a JSON array containing
`transaction_date`, `fund_type`, `channel`, `status`, and `amount`, then checked with:

```text
node scripts/penerimaan-parity.js --migrated migrated.json
node scripts/penerimaan-parity.js --migrated migrated.json --legacy legacy.json
```

For the migrated export, run this read-only PostgreSQL query from the release checkout. It emits exactly
the JSON shape consumed by the checker; `amount::text` preserves the integer money value without a
JavaScript numeric conversion. `((transaction_date AT TIME ZONE 'Asia/Jakarta')::date)` explicitly
derives the business date from a `TIMESTAMPTZ` under Asia/Jakarta, independent of the operator's
PostgreSQL session `TimeZone`. The checker uses the same policy by preserving date-only values or the date
component of fully valid ISO-8601 timestamps, and rejects malformed or calendar-rollover dates.

```text
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At -c "SELECT COALESCE(json_agg(json_build_object('transaction_date', ((transaction_date AT TIME ZONE 'Asia/Jakarta')::date), 'fund_type', fund_type, 'channel', channel, 'status', status, 'amount', amount::text) ORDER BY transaction_date, fund_type, channel, status), '[]'::json) FROM penerimaan_transactions;" > migrated.json
node scripts/penerimaan-parity.js --migrated migrated.json
```

The query performs no writes. A legacy file may be supplied only when an authoritative export exists;
the known legacy source is mock-only, so the documented result remains `not-applicable`.

The checker normalizes dates/dimensions, validates canonical statuses, sums integer amounts exactly, and
reports each group by date, fund type, channel, and status. It never creates legacy rows or totals.

## Rollback window

The read-only rollback snapshot is Git SHA `1136b3bc990f459d387ebb0df4c4472f73cac1e6`, the last known-good
Task 11 revision. Keep it available for one release window after cutover. If cutover health checks fail,
restore that exact SHA using the approved release procedure; do not reset shared history or delete data.

1. Stop the affected release and restore the application checkout to the snapshot SHA.
2. Rebuild both Node workspaces from the restored checkout:

```text
npm ci
npm run build
cd frontend-next
npm ci
npm run build
cd ..
```

3. Restart the managed processes with PM2 using the repository's ecosystem configuration (`pm2 restart
   ecosystem.config.cjs --update-env`, or the deployment-specific equivalent).
4. Verify `GET /api/health` reports healthy PostgreSQL-backed service, verify the frontend HTTP response,
   and run the authorized Penerimaan webhook/export smoke checks. Check the deployed Git SHA before
   reopening traffic.

This runbook contains no credentials or secret values. PostgreSQL connection and provider secret values
must remain in the deployment environment and must not be copied into evidence files.

## Release preflight and smoke checks

The GitHub workflow is manual-only (`workflow_dispatch`) and requires the `production` environment's
review approval plus an explicit `confirm_deploy=yes` input. Its `validate` job must pass the complete
`node --test server/*.test.js` backend suite, the frontend tests/typecheck/build, and the deployment
contract tests before the `deploy` job can start. A failed or hanging full backend suite therefore
blocks production deployment; it must not be waived implicitly.

Run `deploy/release-vps.sh <full-commit-sha>` only after the release commit has been reviewed. The
script fails closed before changing the checkout unless `NODE_ENV=production`, `DATABASE_URL`,
`JWT_SECRET`, `FRONTEND_URL`, and `PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY` are configured. It
reports missing variable names only; it never prints, exports, or records their values. The application
may load these names from the deployment environment or the VPS `.env` file.

The release is accepted only when both workspaces complete `npm ci` and their production builds, then
PM2 restarts both managed processes with `NODE_ENV=production` for the backend and all of these checks
pass: PostgreSQL-backed `GET /api/health` whose non-sensitive readiness contract includes
`database_engine=postgresql`, internal Next `GET /penerimaan`, the reverse-proxied HTTPS `GET
/penerimaan` via localhost with the configured Host/SNI, an unsigned `POST
/api/penerimaan/webhook/portal` returning `401` when the portal provider is configured,
or the exact safe generic correlated `500` response (`success:false`,
`message:"Terjadi kesalahan sistem."`, and `correlation_id`) when no portal provider
secret is configured, and unauthenticated `GET
/api/penerimaan/laporan/export` returning `401`. The webhook request contains a smoke-only body and
is rejected before recording an event; a non-generic 500, any other status, or a response exposing
configuration/internal details fails the release. The export request is rejected before creating a
job. These checks create no production rows or artifacts.

If any build, restart, or smoke check fails, the script resets the checkout to the captured previous
SHA, rebuilds both workspaces, restarts PM2, and saves the restored process list before returning the
original failure. Do not reopen traffic until the restored SHA and PostgreSQL-backed health check are
verified.

## Post-review production verification

After explicit review approval, an operator verifies the VPS checkout SHA equals the requested full SHA,
PM2 reports both `baznas-backend` and `baznas-frontend-next` online, and `GET /api/health` reports a
ready PostgreSQL database with `database_engine=postgresql`. The operator then verifies both the internal
Next response and the reverse-proxied public `/penerimaan` response, and repeats the safe webhook
rejection check above. An authorized Penerimaan operator may additionally create a report export job
and download it to a temporary location as the export smoke check; delete that temporary artifact after
inspection and do not include credentials or provider data in evidence.
