# M1-M4 public intake documents fix

Date: 2026-09-27
Branch: `codex/mustahik-p0-m1-m4-integrated`
Starting tip: `151f90b8fb56ef0ebd52a935276cb429ac7eb23f`

## Root cause

Public P0 intake persists validated uploads as rows in `documents` and stores each file under the uploads root. The canonical workspace read model queried only `artifact_files`, so the case Documents tab received no KTP row. The tab's existing download callback also hardcoded the artifact endpoint, which cannot resolve `documents` rows.

## Fix

The workspace projection now merges intake rows with artifact rows. Intake IDs are namespaced (`intake-<id>`) to avoid collisions, and their download URL is scoped to both case and document. The authenticated P0 route checks case-read authorization with active assignment, looks up the document by both IDs, resolves only a safe basename under the uploads root, verifies real-path containment, and returns a private attachment with `nosniff`. Existing artifact projections and downloads remain on their existing path. No legacy writes or production schema changes were added.

The frontend dispatches intake rows through the protected URL and keeps artifacts on the existing audited artifact endpoint. Intake metadata unavailable from the legacy `documents` schema (size, MIME, hash) remains null.

## RED / GREEN

RED command:

```text
PATH=/home/multica-agent/.local/bin:$PATH node --test server/penyaluran-p0-read-model.test.js
```

Before implementation, the new `17a` assertion failed as expected: `body.documents.length` was `0`, expected `1`; the other 21 tests passed.

GREEN backend command:

```text
PATH=/home/multica-agent/.local/bin:$PATH node --test server/penyaluran-p0-read-model.test.js server/penyaluran-p0-artifact-routes.test.js server/penyaluran-p0-artifact-files.test.js server/penyaluran-p0-public-intake.test.js server/penyaluran-p0-intake.test.js server/uploads.integration.test.js
```

Result: 68 tests passed, 0 failed. This includes assigned-case denial, case/document mismatch, traversal rejection, attachment headers, and preservation of the existing artifact behavior.

Frontend verification:

- `npm test -- components/penyaluran/mustahik/case/CaseWorkflowPanel.test.tsx`: 19 passed.
- `npm run typecheck`: passed.
- `npm run build`: Turbopack stopped before compilation because the preexisting `frontend-next/node_modules` symlink points outside Turbopack's project filesystem root.
- `npm run build -- --webpack`: passed; all Next routes compiled and rendered.
- `git diff --check`: passed.

Full backend P0 suite with its required ephemeral cutover setting: `PENYALURAN_P0_CUTOVER_AT=2026-09-27T00:00:00Z PATH=/home/multica-agent/.local/bin:$PATH node --test server/penyaluran-p0*.test.js`+�u���T 275 passed, 0 failed, 1 skipped. The six directly relevant P0/intake/upload suites above also passed 68/68.

## Changed files

- `server/penyaluran-p0/case-read-model.js`
- `server/penyaluran-p0/routes.js`
- `server/penyaluran-p0-read-model.test.js`
- `server/penyaluran-p0-artifact-routes.test.js`
- `server/penyaluran-p0-test-helpers.js`
- `frontend-next/components/penyaluran/mustahik/case/CaseWorkflowPanel.tsx`
- `frontend-next/components/penyaluran/mustahik/case/CaseWorkflowPanel.test.tsx`
- `frontend-next/lib/api/client.ts`
- `frontend-next/lib/api/penyaluran-p0-types.ts`

## Risks and limits

The route relies on the existing P0 case-read authorization helper and upload-root configuration. It does not create a new document-access audit table; downloads are protected and case-assignment scoped, but not added to the artifact access event log. Runtime behavior against a live database or stored public-intake file was not exercised because this task is limited to the isolated worktree.

## Follow-up review fix: missing stored file

A second review found that an intake document row whose stored file had disappeared returned 500 because `fs.realpath(uploadPath)` rejected before the `res.download` callback. The route now maps only `ENOENT` from resolving the individual upload path to the existing sanitized 404 response. Errors resolving the uploads root and all other I/O failures still use the generic 500 path.

RED: `PATH=/home/multica-agent/.local/bin:$PATH node --test server/penyaluran-p0-artifact-routes.test.js` - 3 passed, 1 failed; missing file returned 500 instead of 404.

GREEN: same focused command - 4 passed, 0 failed.

Full backend P0 suite: `PENYALURAN_P0_CUTOVER_AT=2026-09-27T00:00:00Z PATH=/home/multica-agent/.local/bin:$PATH node --test server/penyaluran-p0*.test.js` - 275 passed, 0 failed, 1 skipped.
