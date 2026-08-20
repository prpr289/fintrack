-- Transaction ledger audit metadata (additive, rollback-safe).
-- The application derives the same conservative value if this field is absent/null.
ALTER TABLE transactions ADD COLUMN source_channel TEXT;

UPDATE transactions
SET source_channel = CASE
  WHEN transfer_pair_id IS NOT NULL THEN 'internal_transfer'
  WHEN source = 'auto' THEN 'hros'
  WHEN recurring_id IS NOT NULL THEN 'recurring'
  WHEN TRIM(COALESCE(submitted_by, '')) <> '' THEN 'line'
  ELSE 'legacy_manual'
END
WHERE source_channel IS NULL OR TRIM(source_channel) = '';

CREATE INDEX IF NOT EXISTS idx_transactions_workspace_creator_date
  ON transactions(workspace_id, created_by_user_id, date);

CREATE INDEX IF NOT EXISTS idx_transactions_workspace_source_date
  ON transactions(workspace_id, source_channel, date);

CREATE INDEX IF NOT EXISTS idx_slips_workspace_transaction
  ON slips(workspace_id, transaction_id);
