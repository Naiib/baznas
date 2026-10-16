# M1 disposable rehearsal checkpoint — 2026-09-24

## Scope and source

- Worktree branch: `codex/mustahik-p0-m1-production-readiness`.
- Local HEAD matches the reported pushed SHA: `29a3642aeaf3671511e0844ef1ccf974d286e9ff`. Worktree was clean before this checkpoint; no commit was made.
- Approved backend archive source: `568f7ea5c0b6f9d7bd100cc9968d383881d9346a`; 113-entry archive manifest and extracted bytes verified.
- Archive SHA-256: `68770d1d8f3bc5bbd575eb43355b66d7d206b8a569092e61df95a01c469fdaa3`.
- VPS source staging: `/opt/web_baznas/releases/568f7ea5c0b6f9d7bd100cc9968d383881d9346a`.
- VPS read-only ops artifacts: `/opt/web_baznas/ops/m1-568f7ea`.
- Ops SHA-256 values: runbook `4eaa5ae6212173339a86f24ef673a4cfc639af4aa10e652b255f15ffc16554de`; remediation SQL `c9c21e9069f5859ab83d91eee4ef60c982d29be8e3c9bbc26254279e078a18f6`; verifier SQL `b6c7ae6f3cb46110fc0644180a6b9b9169eefa206d496b0290064477f9461288`.
- The three migration SHA-256 pins matched the runbook and were verified again inside the built image.

## Completed evidence

- Disposable PostgreSQL version: `16.15`.
- `node --test server/m1-production-remediation.test.js`, with `P0_TEST_DATABASE_URL` set: exit 0; 4 passed, 0 skipped.
- `node --test server/migration-parity.test.js`, against the same disposable PostgreSQL: exit 0; 11 passed, 0 skipped. This included the legacy `activity_logs.mustahik_id NOT NULL` upgrade and non-vacuous migration-runner rollback/replay cases.
- Unique image `web_baznas-m1-rehearsal:m1r-20260924t133543z-02cd9363` built from the approved archive. Image contained exactly the three pinned migrations; `M1_IMAGE_MIGRATIONS_VERIFIED` passed.
- Build output reported 4 npm audit advisories (3 moderate, 1 high); no dependency changes were made.

## Preserved temporary resources

- Run directory on tmpfs: `/tmp/m1r-20260924t133543z-02cd9363`.
- PostgreSQL container: `m1r-20260924t133543z-02cd9363-pg`; last confirmed healthy and serving PostgreSQL 16.15 during the completed tests.
- Internal Docker network: `m1r-20260924t133543z-02cd9363-net`.
- Named volume: `m1r-20260924t133543z-02cd9363-pgdata`, backed by `/tmp/m1r-20260924t133543z-02cd9363/pgdata` on tmpfs.
- The test runner shared the PostgreSQL container network namespace and used `127.0.0.1`; no external or production network was joined. No API listener was started.
- Preserve all these resources until the user directs continuation. The run directory contains a generated test-only credential; never print or copy its contents.

## Incomplete rehearsal steps

- The production-shaped one-shot `runPendingMigrations()` with flag false, exact ledger, and full `verifyP0Schema()` has not been run.
- Forced post-commit failure, two-step database rename rollback, aggregate baseline comparison, failed-database retention, and synthetic backend reconnect remain incomplete.
- Custom-format dump checksum/listing and restore into a fresh isolated database remain incomplete.
- No temporary resource cleanup has been done.

Production `baznas_db`, `p0_test_db`, the live backend, Compose, Caddy, DNS, and `PENYALURAN_P0_ENABLED` were not changed or used. Resume only the incomplete steps above in the same isolated rehearsal cluster. Before any cleanup, verify the exact rehearsal container label, network, volume device path, image tag, and resolved `/tmp` path; do not target any similarly named production or preexisting resource. Leave the `/opt/web_baznas` source and ops staging intact.

## Continuation checkpoint — 2026-09-25

- Read-only VPS inspection reconfirmed the labeled PostgreSQL 16.15 container `m1r-20260924t133543z-02cd9363-pg`, isolated network `m1r-20260924t133543z-02cd9363-net`, and named volume `m1r-20260924t133543z-02cd9363-pgdata`, mounted at Docker's volume path. The container was healthy. No temporary files or secret contents were read from the run directory.
- The unique synthetic target database is `m1r_prodshape_20260924t2225_l6`; prior inspection verified it is empty (zero public tables and no migration ledger). It has not been seeded.
- Seeding remains blocked because the earlier ephemeral parser was not saved. The known parser guard failure is a CRLF/LF mismatch when matching the pinned fixture source. On next continuation, design a persisted, reviewed synthetic fixture seed step from pinned source with CRLF-independent boundary parsing, verify the empty target database before running, and do not improvise in production. No migrations, forced-failure rollback, dump/restore, or cleanup were run in this continuation.
- The pinned source is the approved archive at commit `568f7ea5c0b6f9d7bd100cc9968d383881d9346a`; this checkpoint's previously noted backend archive and disposable cluster are the only intended rehearsal inputs. The main runbook is `20260923-m1-hostinger-release.md` (the `.md` name recorded in the earlier read attempt without `-release` does not exist).
- Review note: main runbook lines 89–91 use `createdb -d postgres`; flag this option for correction before relying on that command. No runbook source was edited here.
- No production database, `p0_test_db`, backend, Compose, Caddy, DNS, secrets, or feature flag was mutated. No commit or push was made.

## Pause addendum — 2026-09-25

- User ordered work stopped and progress recorded. Branch HEAD remains the previously pushed `29a3642`; the current local patch is uncommitted and unpushed.
- The patch corrects the runbook's `createdb` maintenance database option from `-d postgres` to `--maintenance-db=postgres` and adds synthetic legacy fixture seed instructions. It also adds `server/m1-legacy-fixture-seed.js` and `server/m1-legacy-fixture-seed.test.js`.
- The new seed-step TDD tests were reported passing (3/3). Existing migration-parity integration was not rerun against PostgreSQL after this patch.
- Initial review found an important unsafe URL pipe. Luna revised the step to use `--apply`, `assertDisposableTestDatabaseUrl`/`_test`, and the `postgres` scheme without placing the URL in argv. The scoped re-review was interrupted by the stop request, so that finding is not independently cleared.
- The synthetic PostgreSQL container, isolated network, named volume, and empty unique target database remain as recorded above. Their live status was not rechecked at pause.
- The rehearsal remains incomplete: no synthetic fixture seed is confirmed, and the one-shot migration rehearsal, forced-failure rollback, and dump/restore steps remain outstanding. No production mutations, commit, push, or cleanup were performed for this patch. Resume only in the disposable rehearsal environment and obtain independent review of the revised seed step.
