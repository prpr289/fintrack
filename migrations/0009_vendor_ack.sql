-- ใบวางบิลคู่ค้า: ช่องเก็บ "คู่ค้ายืนยันรายการแล้ว" บน pending_bills
-- เก็บเป็น JSON ช่องเดียว ไม่แตกเป็น 5 คอลัมน์ เพราะทั้งก้อนถูกอ่านพร้อมกันเสมอ:
--   {"name":"สมทรง แก้วมณี","at":"2026-08-30T10:14:00Z","ip":"183.88.x.x","ua":"...",
--    "disputeReason":null,"disputeAt":null}
-- NULL = ยังไม่ยืนยัน · มี at = ยืนยันแล้ว · มี disputeAt = คู่ค้าทักท้วง
--
-- Additive nullable — ของเดิม (LINE bot, โหมดรับของ, บิลรอจ่าย) ไม่กระทบเลย
-- rollback = ปล่อยคอลัมน์ว่างไว้ ไม่ต้องแก้อะไรกลับ
--
-- SQLite ADD COLUMN ไม่มี IF NOT EXISTS — apply ONCE, ห้ามรันซ้ำ:
--   npx wrangler d1 execute fintrack-db --remote --file migrations/0009_vendor_ack.sql
--
-- ปลอดภัยที่จะรันก่อน deploy worker (โค้ดเดิมไม่รู้จักคอลัมน์นี้ ก็ไม่กระทบ)

ALTER TABLE pending_bills ADD COLUMN vendor_ack TEXT;

-- รายงานวัตถุดิบกรองด้วย (workspace, status, paid_at) เป็นหลัก
CREATE INDEX IF NOT EXISTS idx_pb_ws_status_paid_at
  ON pending_bills(workspace_id, status, paid_at);
