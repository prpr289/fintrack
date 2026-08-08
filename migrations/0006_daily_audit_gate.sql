-- Daily Close Audit Gate (additive migration)

ALTER TABLE transactions ADD COLUMN reconciled_by_user_id TEXT;
ALTER TABLE transactions ADD COLUMN reconciled_at TEXT;

CREATE TABLE IF NOT EXISTS daily_audit_settings (
  workspace_id TEXT PRIMARY KEY,
  effective_date TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_audit_change_counters (
  workspace_id TEXT NOT NULL,
  audit_date TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  change_version INTEGER NOT NULL DEFAULT 0,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, audit_date, wallet_id)
);

CREATE TABLE IF NOT EXISTS daily_audit_wallet_closures (
  workspace_id TEXT NOT NULL,
  audit_date TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('closed', 'closed_with_exception', 'needs_review')),
  book_balance_satang INTEGER NOT NULL,
  observed_balance_satang INTEGER,
  variance_satang INTEGER,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  blocker_count INTEGER NOT NULL DEFAULT 0,
  change_version INTEGER NOT NULL DEFAULT 0,
  closed_by_user_id TEXT,
  closed_at TEXT,
  exception_reason TEXT,
  evidence_id TEXT,
  last_request_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, audit_date, wallet_id)
);

CREATE TABLE IF NOT EXISTS daily_audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  audit_date TEXT NOT NULL,
  wallet_id TEXT,
  issue_key TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('close', 'close_with_exception', 'reopen', 'stale', 'resolve_duplicate')),
  previous_status TEXT,
  new_status TEXT,
  revision INTEGER,
  book_balance_satang INTEGER,
  observed_balance_satang INTEGER,
  variance_satang INTEGER,
  transaction_count INTEGER,
  blocker_count INTEGER,
  change_version INTEGER,
  reason TEXT,
  evidence_id TEXT,
  actor_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, request_id)
);

CREATE TABLE IF NOT EXISTS daily_audit_issue_resolutions (
  workspace_id TEXT NOT NULL,
  issue_key TEXT NOT NULL,
  audit_date TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  resolution TEXT NOT NULL CHECK (resolution IN ('not_duplicate')),
  resolved_by_user_id TEXT NOT NULL,
  resolved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, issue_key)
);

CREATE TABLE IF NOT EXISTS transaction_reconcile_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('reconciled', 'unreconciled')),
  actor_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_audit_evidence (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  audit_date TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_audit_closures_date
  ON daily_audit_wallet_closures (workspace_id, audit_date);
CREATE INDEX IF NOT EXISTS idx_daily_audit_events_date
  ON daily_audit_events (workspace_id, audit_date, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_audit_resolutions_date
  ON daily_audit_issue_resolutions (workspace_id, audit_date, wallet_id);
CREATE INDEX IF NOT EXISTS idx_reconcile_events_transaction
  ON transaction_reconcile_events (workspace_id, transaction_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_audit_evidence_date
  ON daily_audit_evidence (workspace_id, audit_date, wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_audit_date_wallet
  ON transactions (workspace_id, date, wallet_id);

CREATE TRIGGER IF NOT EXISTS daily_audit_tx_insert
AFTER INSERT ON transactions
WHEN NEW.workspace_id IS NOT NULL AND NEW.date IS NOT NULL AND NEW.wallet_id IS NOT NULL
BEGIN
  INSERT INTO daily_audit_change_counters (workspace_id, audit_date, wallet_id, change_version, changed_at)
  VALUES (NEW.workspace_id, NEW.date, NEW.wallet_id, 1, CURRENT_TIMESTAMP)
  ON CONFLICT (workspace_id, audit_date, wallet_id)
  DO UPDATE SET change_version = change_version + 1, changed_at = CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS daily_audit_tx_update_current
AFTER UPDATE ON transactions
WHEN NEW.workspace_id IS NOT NULL AND NEW.date IS NOT NULL AND NEW.wallet_id IS NOT NULL
BEGIN
  INSERT INTO daily_audit_change_counters (workspace_id, audit_date, wallet_id, change_version, changed_at)
  VALUES (NEW.workspace_id, NEW.date, NEW.wallet_id, 1, CURRENT_TIMESTAMP)
  ON CONFLICT (workspace_id, audit_date, wallet_id)
  DO UPDATE SET change_version = change_version + 1, changed_at = CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS daily_audit_tx_update_previous
AFTER UPDATE ON transactions
WHEN OLD.workspace_id IS NOT NULL AND OLD.date IS NOT NULL AND OLD.wallet_id IS NOT NULL
  AND (OLD.workspace_id IS NOT NEW.workspace_id OR OLD.date IS NOT NEW.date OR OLD.wallet_id IS NOT NEW.wallet_id)
BEGIN
  INSERT INTO daily_audit_change_counters (workspace_id, audit_date, wallet_id, change_version, changed_at)
  VALUES (OLD.workspace_id, OLD.date, OLD.wallet_id, 1, CURRENT_TIMESTAMP)
  ON CONFLICT (workspace_id, audit_date, wallet_id)
  DO UPDATE SET change_version = change_version + 1, changed_at = CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS daily_audit_tx_delete
AFTER DELETE ON transactions
WHEN OLD.workspace_id IS NOT NULL AND OLD.date IS NOT NULL AND OLD.wallet_id IS NOT NULL
BEGIN
  INSERT INTO daily_audit_change_counters (workspace_id, audit_date, wallet_id, change_version, changed_at)
  VALUES (OLD.workspace_id, OLD.date, OLD.wallet_id, 1, CURRENT_TIMESTAMP)
  ON CONFLICT (workspace_id, audit_date, wallet_id)
  DO UPDATE SET change_version = change_version + 1, changed_at = CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS daily_audit_transfer_insert_counterpart
AFTER INSERT ON transactions
WHEN NEW.transfer_pair_id IS NOT NULL
BEGIN
  INSERT INTO daily_audit_change_counters (workspace_id, audit_date, wallet_id, change_version, changed_at)
  SELECT DISTINCT t.workspace_id, t.date, t.wallet_id, 1, CURRENT_TIMESTAMP
  FROM transactions t
  WHERE t.workspace_id = NEW.workspace_id AND t.transfer_pair_id = NEW.transfer_pair_id
    AND t.id IS NOT NEW.id AND t.date IS NOT NULL AND t.wallet_id IS NOT NULL
  ON CONFLICT (workspace_id, audit_date, wallet_id)
  DO UPDATE SET change_version = change_version + 1, changed_at = CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS daily_audit_transfer_update_previous_counterpart
AFTER UPDATE ON transactions
WHEN OLD.transfer_pair_id IS NOT NULL
BEGIN
  INSERT INTO daily_audit_change_counters (workspace_id, audit_date, wallet_id, change_version, changed_at)
  SELECT DISTINCT t.workspace_id, t.date, t.wallet_id, 1, CURRENT_TIMESTAMP
  FROM transactions t
  WHERE t.workspace_id = OLD.workspace_id AND t.transfer_pair_id = OLD.transfer_pair_id
    AND t.id IS NOT NEW.id AND t.date IS NOT NULL AND t.wallet_id IS NOT NULL
  ON CONFLICT (workspace_id, audit_date, wallet_id)
  DO UPDATE SET change_version = change_version + 1, changed_at = CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS daily_audit_transfer_update_current_counterpart
AFTER UPDATE ON transactions
WHEN NEW.transfer_pair_id IS NOT NULL
BEGIN
  INSERT INTO daily_audit_change_counters (workspace_id, audit_date, wallet_id, change_version, changed_at)
  SELECT DISTINCT t.workspace_id, t.date, t.wallet_id, 1, CURRENT_TIMESTAMP
  FROM transactions t
  WHERE t.workspace_id = NEW.workspace_id AND t.transfer_pair_id = NEW.transfer_pair_id
    AND t.id IS NOT NEW.id AND t.date IS NOT NULL AND t.wallet_id IS NOT NULL
  ON CONFLICT (workspace_id, audit_date, wallet_id)
  DO UPDATE SET change_version = change_version + 1, changed_at = CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS daily_audit_transfer_delete_counterpart
AFTER DELETE ON transactions
WHEN OLD.transfer_pair_id IS NOT NULL
BEGIN
  INSERT INTO daily_audit_change_counters (workspace_id, audit_date, wallet_id, change_version, changed_at)
  SELECT DISTINCT t.workspace_id, t.date, t.wallet_id, 1, CURRENT_TIMESTAMP
  FROM transactions t
  WHERE t.workspace_id = OLD.workspace_id AND t.transfer_pair_id = OLD.transfer_pair_id
    AND t.id IS NOT OLD.id AND t.date IS NOT NULL AND t.wallet_id IS NOT NULL
  ON CONFLICT (workspace_id, audit_date, wallet_id)
  DO UPDATE SET change_version = change_version + 1, changed_at = CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS daily_audit_events_no_update
BEFORE UPDATE ON daily_audit_events
BEGIN
  SELECT RAISE(ABORT, 'daily_audit_events are immutable');
END;

CREATE TRIGGER IF NOT EXISTS daily_audit_events_no_delete
BEFORE DELETE ON daily_audit_events
BEGIN
  SELECT RAISE(ABORT, 'daily_audit_events are immutable');
END;

CREATE TRIGGER IF NOT EXISTS reconcile_events_no_update
BEFORE UPDATE ON transaction_reconcile_events
BEGIN
  SELECT RAISE(ABORT, 'transaction_reconcile_events are immutable');
END;

CREATE TRIGGER IF NOT EXISTS reconcile_events_no_delete
BEFORE DELETE ON transaction_reconcile_events
BEGIN
  SELECT RAISE(ABORT, 'transaction_reconcile_events are immutable');
END;

CREATE TRIGGER IF NOT EXISTS daily_audit_evidence_no_update
BEFORE UPDATE ON daily_audit_evidence
BEGIN
  SELECT RAISE(ABORT, 'daily_audit_evidence metadata is immutable');
END;

CREATE TRIGGER IF NOT EXISTS daily_audit_evidence_no_delete
BEFORE DELETE ON daily_audit_evidence
BEGIN
  SELECT RAISE(ABORT, 'daily_audit_evidence metadata is immutable');
END;
