-- Task 11: durable receipt lease/finalization state and one receipt per PPD.
-- This is intentionally additive so deployments that already applied 001 do
-- not need a checksum change or replay of the original migration.

ALTER TABLE ppd
  ADD COLUMN IF NOT EXISTS receipt_lease_token VARCHAR(100),
  ADD COLUMN IF NOT EXISTS receipt_lease_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_payload_sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS receipt_file_id INTEGER,
  ADD COLUMN IF NOT EXISTS receipt_file_sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS receipt_created_at TIMESTAMPTZ;

UPDATE ppd
SET receipt_status = 'failed',
    receipt_error = COALESCE(NULLIF(btrim(receipt_error), ''), 'Legacy receipt status was not recognized.')
WHERE receipt_status IS NOT NULL
  AND receipt_status NOT IN ('pending', 'processing', 'ready', 'failed');

DO $p0_receipt_status_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ppd_receipt_status_check'
      AND conrelid = 'ppd'::regclass
  ) THEN
    ALTER TABLE ppd
      ADD CONSTRAINT ppd_receipt_status_check CHECK (
        receipt_status IS NULL
        OR receipt_status IN ('pending', 'processing', 'ready', 'failed')
      );
  END IF;
END
$p0_receipt_status_constraint$;

DO $p0_receipt_artifact_duplicates$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT artifact_type, artifact_id, artifact_revision, kind
    FROM artifact_files
    WHERE kind = 'system_receipt_pdf'
    GROUP BY artifact_type, artifact_id, artifact_revision, kind
    HAVING COUNT(*) > 1
  ) duplicates;
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'P0 receipt migration blocked: % duplicate system_receipt_pdf artifact identity group(s) require manual reconciliation before uq_system_receipt_artifact.', duplicate_count;
  END IF;
END
$p0_receipt_artifact_duplicates$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_receipt_artifact
  ON artifact_files(artifact_type, artifact_id, artifact_revision, kind)
  WHERE kind = 'system_receipt_pdf';

DO $p0_receipt_event_duplicates$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT artifact_type, artifact_id, artifact_revision, approval_step
    FROM artifact_approvals
    WHERE action = 'receipt_generated' AND approval_step = 'receipt_generated'
    GROUP BY artifact_type, artifact_id, artifact_revision, approval_step
    HAVING COUNT(*) > 1
  ) duplicates;
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'P0 receipt migration blocked: % duplicate receipt_generated event group(s) require manual reconciliation before uq_system_receipt_generated_event.', duplicate_count;
  END IF;
END
$p0_receipt_event_duplicates$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_receipt_generated_event
  ON artifact_approvals(artifact_type, artifact_id, artifact_revision, approval_step)
  WHERE action = 'receipt_generated' AND approval_step = 'receipt_generated';
