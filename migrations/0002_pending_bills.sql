-- Pending expense bills (บิลรายจ่ายรอชำระ) — Phase 1.
-- แยกจาก transactions โดยตั้งใจ: บิลรอจ่ายไม่ใช่ transaction จนกว่าจะ "จ่าย"
-- จึงรั่วเข้ายอดรวม/ยอดกระเป๋าไม่ได้. SAFE ก่อน deploy worker (ตารางใหม่ล้วน).
-- Apply ONCE against live D1:
--   npx wrangler d1 execute fintrack-db --remote --file migrations/0002_pending_bills.sql
CREATE TABLE IF NOT EXISTS pending_bills (
  id                   TEXT PRIMARY KEY,
  workspace_id         TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',
  source               TEXT NOT NULL DEFAULT 'web',
  submitted_by_user_id TEXT,
  submitted_by_name    TEXT,
  name                 TEXT NOT NULL,
  amount               REAL NOT NULL,
  category_id          TEXT,
  sub_category_id      TEXT,
  scope                TEXT NOT NULL DEFAULT 'business',
  note                 TEXT,
  payee_type           TEXT NOT NULL DEFAULT 'employee',
  payee_ref_id         TEXT,
  payee_name           TEXT,
  payee_bank           TEXT,
  payee_account_no     TEXT,
  evidence_type        TEXT NOT NULL,
  evidence_key         TEXT,
  evidence_mime        TEXT,
  evidence_ocr         TEXT,
  reject_reason        TEXT,
  created_tx_id        TEXT,
  paid_wallet_id       TEXT,
  paid_by_user_id      TEXT,
  paid_at              TEXT,
  created_at           TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at           TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pb_ws_status ON pending_bills(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_pb_ws_submitter ON pending_bills(workspace_id, submitted_by_user_id);
