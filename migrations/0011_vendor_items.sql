-- ตะกร้าสินค้าประจำของแต่ละคู่ค้า
--
-- ทำไมต้องมีตารางนี้ ทั้งที่ก่อนหน้านี้บอกว่าคำนวณจากประวัติก็พอ:
--   1) ตัวเติมราคาเดิมกรองเฉพาะบิลที่จ่ายแล้ว — ระหว่างซ้อมโดยไม่กดจ่ายจะว่างตลอด
--   2) คู่ค้าเก่าที่ซื้อกันมาเป็นปี ระบบไม่รู้จักสักรายการ เพราะประวัติอยู่ในกระดาษกับแชท
-- ตารางนี้ให้กรอกล่วงหน้าได้ และโตเองจากการออกใบจริง
--
-- unique (workspace_id, vendor_id, name) = กันของซ้ำในร้านเดียวกัน ใช้กับ upsert
-- is_active = ซ่อนของที่เลิกซื้อ ไม่ลบ เพราะบิลเก่ายังอ้างชื่อนั้นอยู่
--
-- ตารางใหม่ล้วน SAFE ที่จะรันก่อน deploy worker
--   npx wrangler d1 execute fintrack-db --remote --file migrations/0011_vendor_items.sql

CREATE TABLE IF NOT EXISTS vendor_items (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL,
  vendor_id      TEXT NOT NULL,
  name           TEXT NOT NULL,
  unit           TEXT,
  last_price     REAL,
  times_bought   INTEGER NOT NULL DEFAULT 0,
  last_bought_at TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_items_unique
  ON vendor_items(workspace_id, vendor_id, name);

CREATE INDEX IF NOT EXISTS idx_vendor_items_lookup
  ON vendor_items(workspace_id, vendor_id, is_active);
