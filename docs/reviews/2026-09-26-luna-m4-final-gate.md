# Mustahik P0 M4 Final Gate - Tasks 14-18

Date: 2026-09-26
Workspace: `/home/multica-agent/workspaces/baznas-p0-part1/work-m4`
Branch: `codex/opencode-m4-tasks14-18`
Implementation commit: `7ef5777a37c3fe35dcaafce7441e032dd840dc07`
Starting SHA: `e8c53410e98c24da59a4e077d1226a38656fbaa8`

## Verdict

**GO for the M4 UI/client scope at this commit. Overall integrated P0 remains HOLD.** M1/M3 integration and the M2 public-intake bridge are upstream dependencies and are not accepted by this report. No production deployment, flag change, push, or merge was performed.

## Review and change

The final-gate audit found that the PPD UI received canonical server RAB rows containing `amount`, but hydrated the editable unit amount as zero when legacy `jumlah`/`harga_satuan` fields were absent. Editing another field and autosaving then sent a zero RAB amount. The UI now derives the editable price from the server amount and renders/saves the same total.

A regression test covers the server-shaped row, displayed total, and autosaving another PPD field. The test suite also restores real timers after each case so a failing fake-timer test cannot contaminate later async tests.

Admin finance and payment actions are explicitly denied in the UI before capability hints are considered; existing tests cover finance check/approval and payment record/verification. The reviewed suites also cover Assessment source-field behavior, five distinct MPZIS approvals, flag-off intake/errors, reconciliation actions, receipt states, and keyboard/form error states.

Changed implementation files:

- `frontend-next/components/penyaluran/mustahik/ppd/PpdForm.tsx`
- `frontend-next/components/penyaluran/mustahik/ppd/PpdWorkflow.test.tsx`

## Verification

| Command | Result |
| --- | --- |
| `npm --prefix frontend-next test` | PASS - 42 files, 374 tests, 0 failed, 0 skipped |
| `npm --prefix frontend-next run typecheck` | PASS - `tsc --noEmit`, no errors |
| `npm --prefix frontend-next run build` | FAIL - Next 16.3.2 Turbopack rejected the app's `node_modules` symlink because it resolves outside the project filesystem root |
| `npm --prefix frontend-next run build -- --webpack` | PASS - optimized build compiled; 14/14 static pages generated |
| Focused PPD workflow suite | PASS - 32/32 tests |
| P0 route/service contract suite (command below) | PASS - 56 tests, 0 failed, 0 skipped |
| `git diff --check` before commit | PASS |
| Final `git status --short --branch` | Clean at the implementation commit |

The backend command ran from the isolated checkout root with `DATABASE_URL=postgresql://test:test@127.0.0.1:1/baznas_p0_contract_test`. Service fixtures use pg-mem; route suites use local HTTP listeners and test-local temporary artifacts.

```sh
node --test \
  server/penyaluran-p0-assessment-routes.test.js \
  server/penyaluran-p0-mpzis-routes.test.js \
  server/penyaluran-p0-ppd-routes.test.js \
  server/penyaluran-p0-completion-routes.test.js \
  server/penyaluran-p0-artifact-routes.test.js \
  server/penyaluran-p0-assessment.test.js \
  server/penyaluran-p0-mpzis.test.js \
  server/penyaluran-p0-ppd.test.js \
  server/penyaluran-p0-receipt.test.js
```

The first backend invocation was launched outside the repository root: 55/56 passed and the receipt schema test could not resolve relative `server/schema.sql`. Rerunning the same suites from the checkout root passed 56/56.

## Remaining limits

- The default Turbopack build still cannot follow the workspace's external `node_modules` symlink; the webpack production build passes.
- Responsive and accessibility behavior was assessed through source review and component tests, not a live browser/device visual session.
- M4 results do not establish M1-M3 integration or the M2 public bridge, and do not authorize cutover. Keep the overall P0 verdict on HOLD until those dependencies are independently accepted.
