# Public P0 Intake Bridge Plan

1. Add contract tests first: service writes one canonical case and document, rejects unsafe content, resolves only the configured server-side actor, replays retries, and preserves the public tracking response.
2. Run the new tests red against current behavior.
3. Implement bounded in-memory multipart parsing for post-cutover requests; retain the existing pre-cutover parser and writer.
4. Resolve a dedicated active penyaluran staff identity from server configuration. Filter request fields through canonical intake allow-list; never take actor or workflow claims from the browser.
5. Extend canonical intake transaction to reserve idempotency, create the case/application, safely store validated uploads, persist documents and upload audit, then complete the response. Remove filesystem writes if the transaction fails.
6. Use the explicit idempotency header when supplied; derive a stable opaque key from canonical fields and upload digests for the current form.
7. Preserve file number response/tracking behavior, restore the established 503 contract when P0 is unavailable, and prove the legacy writer is not called after cutover.
8. Run focused P0/legacy route tests, diff-check, and the disposable PostgreSQL 16 suite. Inspect the final diff and commit only the cohesive M2 changes.

Guardrails: no schema, repository, artifact-storage, frontend, production, deployment, push, or merge changes. Existing authenticated uploads route authorization remains the download boundary. This sequence cannot make filesystem and PostgreSQL writes crash-atomic; synchronous rollback cleanup covers handled transaction failures.
