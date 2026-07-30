-- Phase 2.0: goods-receipt (ใบรับของ) fields on pending_bills. Additive nullable, SAFE.
-- Apply ONCE:
--   npx wrangler d1 execute fintrack-db --remote --file migrations/0005_goods_receipt.sql
ALTER TABLE pending_bills ADD COLUMN kind TEXT NOT NULL DEFAULT 'simple';
ALTER TABLE pending_bills ADD COLUMN line_items TEXT;
ALTER TABLE pending_bills ADD COLUMN vendor_signature_key TEXT;
ALTER TABLE pending_bills ADD COLUMN received_by_user_id TEXT;
ALTER TABLE pending_bills ADD COLUMN received_by_name TEXT;
ALTER TABLE pending_bills ADD COLUMN public_token TEXT;
CREATE INDEX IF NOT EXISTS idx_pb_public_token ON pending_bills(public_token);
