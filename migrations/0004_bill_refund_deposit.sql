-- Phase 1.1: refund + deposit(มัดจำ) fields on pending_bills. Additive nullable, SAFE.
-- Apply ONCE (SQLite ADD COLUMN ไม่มี IF NOT EXISTS — ห้ามรันซ้ำ):
--   npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE pending_bills ADD COLUMN refund_tx_id TEXT"
--   npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE pending_bills ADD COLUMN refunded_at TEXT"
--   npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE pending_bills ADD COLUMN is_deposit INTEGER DEFAULT 0"
--   npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE pending_bills ADD COLUMN goods_received_at TEXT"
ALTER TABLE pending_bills ADD COLUMN refund_tx_id TEXT;
ALTER TABLE pending_bills ADD COLUMN refunded_at TEXT;
ALTER TABLE pending_bills ADD COLUMN is_deposit INTEGER DEFAULT 0;
ALTER TABLE pending_bills ADD COLUMN goods_received_at TEXT;
