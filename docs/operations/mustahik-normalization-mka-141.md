## MKA-141 backend normalization checkpoint

### Diagnosis on `origin/agent/mika/mka-136` (`6769147d23a76094aec902a54db08c0265135d89`)

- `server/schema.sql` and the SQLite bootstrap in `server/db.js` describe the legacy `mustahik` record as 60 domain fields, followed by P0 workflow/audit columns. `server/db.js` maintains the exact legacy field inventory in `MUSTAHIK_COLUMNS`.
- The project already has separate operational tables named `applications`, `assessments`, and `ppd`, plus other workflow evidence tables. In this schema those hold application history, survey evidence, and disbursement artifacts respectively; they are not the requested four normalized entities.
- `server/repository.js`, P0 services, routes, and tests issue direct reads and writes to `mustahik`, `applications`, `assessments`, and `ppd`. A table rename or drop-in view replacement would break write paths. The current code has no repository abstraction that can transparently replace those relations.
- `server/penyaluran-p0/migration-runner.js` is PostgreSQL-only, checksums migrations, and wraps DDL in a database transaction. SQLite uses inline bootstrap and is not wired to P0 migrations. Docker Compose describes a backend but no dedicated staging profile; `docker ps` showed no running containers in this workspace.
- Contract gaps: source rows can have more than one application/assessment/disbursement; a flat mustahik row may also carry one historical value for each. NIK uniqueness/format is not enforced in the legacy store. Therefore this patch snapshots full source rows and stores source identity with each normalized record; it refuses malformed nonempty NIKs and duplicate NIKs rather than silently coercing or merging profiles.

### Implementation and compatibility decision

`server/mustahik-normalization.js` adds four normalized, additive tables and four non-joining read views. `mustahik_normalized_read_model` (and `mustahik_profiles_read_model`) is strictly one row per profile and exposes only profile fields. `mustahik_applications_read_model`, `mustahik_surveys_read_model`, and `mustahik_disbursements_read_model` each expose relational columns and one row per corresponding source/history record. Consumers join a chosen entity to profiles by `profile_id`; histories are never joined together by these views, so 2 applications × 3 surveys × 2 disbursements remain 2, 3, and 2 rows rather than 12 cross-product rows. Full source records remain available in `source_payload` on normalized tables.

These views are **not** legacy endpoint adapters and do not expose the legacy endpoint contract. Existing API endpoints and repository methods continue to read/write the unchanged legacy tables (`mustahik`, `applications`, `assessments`, `ppd`). No endpoint cutover or dual-write has occurred. Compatibility today comes solely from leaving those legacy tables in place. A future cutover requires an explicit repository/API mapping and separate compatibility tests.

| Consumer/data surface | Current source | Contract state |
| --- | --- | --- |
| Existing API endpoints and repository reads/writes | Legacy `mustahik`, `applications`, `assessments`, `ppd` | Unchanged; no cutover |
| Normalized profile consumers | `mustahik_normalized_read_model` / `mustahik_profiles_read_model` | One row per profile; relational profile columns, not legacy endpoint shape |
| Normalized application history | `mustahik_applications_read_model` | One row per application; join to profile by `profile_id` |
| Normalized survey history | `mustahik_surveys_read_model` | One row per survey; join to profile by `profile_id` |
| Normalized disbursement history | `mustahik_disbursements_read_model` | One row per disbursement; join to profile by `profile_id` |

Before inserting normalized rows, migration validates that every operational `mustahik_id` in `applications`, `assessments`, and `ppd` matches a source `mustahik.id`. Invalid references fail the transaction after the protected source backup is durably written; DDL/data changes roll back while the backup and legacy source rows remain available. Per-entity counts and exact source payloads are checked after copy.

Inside a database transaction, the PostgreSQL runner first takes `SHARE ROW EXCLUSIVE` locks on the four legacy source tables. While writes are blocked, it writes a mode-0600 JSON backup to a caller-selected absolute path using an atomic no-overwrite link, then applies table/index/view DDL and upserts in that transaction. It verifies row counts and exact saved payloads; if the DB transaction fails, the external backup remains available for recovery. A rerun requires a new backup path. The CLI accepts only `MKA141_TEST_DATABASE_URL` PostgreSQL databases whose names end in `_test`, plus explicit `--apply` and `--backup-path` arguments; it cannot target a production or staging name.

The SQLite fixture tests execute the same DDL and data migration function. The staging endpoint was unavailable during this task, so the CLI intentionally does not bypass its `_test` guard to contact a staging or production database. A subsequent integration step must design dual-write/read cutover before the legacy tables can be retired.

### Safe local commands

```sh
npm run test:server -- --test-name-pattern='normalization'
MKA141_TEST_DATABASE_URL='postgresql://…/baznas_mka141_test' npm run mustahik:normalize:test-db -- --backup-path /secure/path/mka141-backup.json
```

Do not put real NIKs, account numbers, or other production data into fixtures or issue comments. The backup contains sensitive personal data and must be protected and retained according to the project data policy.
