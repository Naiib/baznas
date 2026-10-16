# M1-M6 integration evidence
Date: 2026-09-27 UTC
Environment: isolated Hostinger development worktree and synthetic PostgreSQL 16 container.

## Merge
- Worktree: /home/multica-agent/workspaces/baznas-p0-part1/work-m1-m6
- Branch: codex/mustahik-p0-m1-m6-integrated
- M1-M4 source: ca9e9931e1e2aaddc92abcbfb3a38b25f228eae3
- M5-M6 source: bad9f9829565cdd77c7d969a4249059038447fbe
- Merge base: e8c53410e98c24da59a4e077d1226a38656fbaa8
- Merge commit: a4c0d24b5ae7af791ea82471bf3cbfddab77512f
- The non-fast-forward merge completed without conflicts; both source commits are ancestors.

## Verification
- Backend: npm test; 592 passed, 0 failed, 0 skipped. Used disposable P0 and M3 database URLs on PG16 and a future cutover timestamp scoped to the test process.
- PostgreSQL parity: node --test server/migration-parity.test.js; 11 passed, 0 failed, 0 skipped on baznas-m1-synthetic-pg16-20260926 (server_version_num 160015).
- Masked P0 API E2E: node --test server/penyaluran-p0-e2e.test.js; 2 passed, 0 failed, 0 skipped, including masked intake-to-receipt flow.
- M6 logical backup/restore: P0_M6_REHEARSAL_ALLOW_SYNTHETIC_PG16=1 node scripts/rehearse-m6-migration.js; custom pg_dump archive listed 12 TABLE DATA entries; pg_restore succeeded; all 11 legacy table row-count and SHA-256 comparisons matched before and after migration.
- M6 cleanup dropped its source and restored databases and removed the archive.
- The P0 and M3 disposable test databases were dropped after verification.
- Frontend: npm test; 43 files, 382 passed. npm run typecheck passed.
- Builds: root npm run build (Vite) passed; frontend-next npm run build (Next.js Webpack) passed.

## Findings and gates
- Incoming source has whitespace diagnostics from git diff --check: trailing spaces on lines 3-6 of docs/operations/mustahik-p0-verification.md and an extra blank line at EOF in server/access-control.integration.test.js.
- Final audit found work-m5 clean at 55431a8, advanced from the kickoff SHA bad9f98 by an OpenCode documentation commit in its reflog. This integration remains pinned to the requested bad9f98 source; work-m5 was not changed by this task.
- M6 synthetic dry-run reported orphans=1 in its legacy fixture; it preserved source data and migration/restore checks passed.
- Browser UAT and staging acceptance remain separate gates. No production database, deployment checkout, Compose project, domain, feature flag, main branch, remote Git ref, push, or deploy was changed.
