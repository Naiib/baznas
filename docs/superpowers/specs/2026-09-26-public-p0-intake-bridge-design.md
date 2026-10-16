# Public P0 Intake Bridge Design

Status: approved for isolated M2 implementation. Date: 2026-09-26.

Keep the existing unauthenticated public application form and POST /api/public/pengajuan available after cutover. When cutover is active and P0 is enabled, route multipart requests to canonical P0 intake using a dedicated server-configured service actor. The browser cannot choose the actor, workflow mode, status, file number, dates, score, approval, or amount.

Allow-list fields accepted by canonical intake; ignore legacy display-only and computed fields. Validate upload count, size, declared MIME, and byte signature; write random path-safe names to the existing upload directory and record them in the existing documents table. Commit case, application, documents, intake activity audit, and idempotency response in one database transaction; remove newly written files on rollback.

Return the server-generated file number in the existing response shape so the public tracking endpoint resolves the case. Preserve legacy intake before cutover. After cutover, never call the legacy writer. If P0 is disabled, reject before multipart parsing or storage.

Use Idempotency-Key if supplied. The unchanged form sends none, so derive an opaque fallback from normalized fields and file hashes. Same-content retries replay; explicit-key payload changes conflict.

Deployment requires a dedicated active penyaluran staff service account configured with PENYALURAN_P0_PUBLIC_ACTOR_ID. Missing or invalid config returns 503. PostgreSQL and filesystem cannot share a transaction; rollback cleanup compensates for write failures, though process crashes may leave unreferenced files.

Scope: isolated M2 backend route/service, related tests, and this design/plan only. No production, deployment, push, merge, schema, repository, or artifact-storage change. Public status remains Diajukan; proposed amounts and scores are not authoritative.
