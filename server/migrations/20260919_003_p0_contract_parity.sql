-- Migration: 20260919_003_p0_contract_parity.sql
-- Milestone 1 Contract Parity Fixes:
-- 1. Ensure activity_logs.mustahik_id is nullable (support global activity logs without mustahik_id).
-- 2. Fail-closed preflight check on ppd_payments.verification_status (reject NULL values with explicit P0 error).
-- 3. Set default 'pending' and NOT NULL on ppd_payments.verification_status for upgraded legacy schema parity.

-- Fail closed before any contract DDL. A missing relation/column is not a
-- legacy variation that this migration can safely normalize: recording 003 in
-- that state would make the checksum ledger claim a contract that was never
-- applied. Keep all four catalog checks in one transaction before mutating any
-- relation so the runner can prove that failed preconditions leave no ledger
-- row and no partial DDL.
DO $p0_contract_parity_preflight$
BEGIN
  IF to_regclass(format('%I.%I', current_schema(), 'activity_logs')) IS NULL THEN
    RAISE EXCEPTION 'P0_MIGRATION_PRECONDITION_FAILED:activity_logs';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'activity_logs'
      AND column_name = 'mustahik_id'
  ) THEN
    RAISE EXCEPTION 'P0_MIGRATION_PRECONDITION_FAILED:activity_logs.mustahik_id';
  END IF;
  IF to_regclass(format('%I.%I', current_schema(), 'ppd_payments')) IS NULL THEN
    RAISE EXCEPTION 'P0_MIGRATION_PRECONDITION_FAILED:ppd_payments';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'ppd_payments'
      AND column_name = 'verification_status'
  ) THEN
    RAISE EXCEPTION 'P0_MIGRATION_PRECONDITION_FAILED:ppd_payments.verification_status';
  END IF;
END
$p0_contract_parity_preflight$;

-- 1. Ensure activity_logs.mustahik_id is nullable.
DO $p0_contract_parity_activity_logs$
BEGIN
  ALTER TABLE activity_logs ALTER COLUMN mustahik_id DROP NOT NULL;
END
$p0_contract_parity_activity_logs$;

-- 2. Fail-closed preflight for ppd_payments.verification_status and set contract
DO $p0_contract_parity_ppd_payments$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM ppd_payments
  WHERE verification_status IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION 'P0_MIGRATION_NULL_VERIFICATION_STATUS: % row(s) in ppd_payments have NULL verification_status. Manual reconciliation required.', null_count;
  END IF;

  ALTER TABLE ppd_payments
    ALTER COLUMN verification_status SET DEFAULT 'pending';

  ALTER TABLE ppd_payments
    ALTER COLUMN verification_status SET NOT NULL;
END
$p0_contract_parity_ppd_payments$;
