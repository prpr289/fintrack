-- รวมร้านค้าที่ซ้ำกัน
--
-- ที่มา: ร้านถูกสร้างอัตโนมัติตอนอ่านสลิป โดยจับคู่ชื่อแบบตรงตัวเป๊ะ
-- สะกดต่างนิดเดียวก็เป็นคนละร้าน — ตรวจจริงบน production 1 ก.ย. 69 พบ
-- 130 คู่ที่น่าจะซ้ำ กระทบ 161 จาก 351 ร้าน (46%)
--
-- ทำไมต้องเก็บแถวเดิมไว้ ไม่ลบ:
--   ถ้าลบ "แม็คโคร" ทิ้ง ครั้งหน้าที่ OCR อ่านสลิปเจอชื่อนี้ ระบบจะสร้างใหม่อีก
--   จึงเก็บแถวไว้ ปิดใช้งาน แล้วชี้ merged_into ไปที่ร้านที่อยู่รอด
--   upsertVendorProfile จะเดินตามลูกศรนี้ไปเพิ่มยอดให้ร้านที่ถูกต้องแทน
--
-- Additive nullable — โค้ดเดิมที่ไม่รู้จักคอลัมน์นี้ไม่กระทบ
-- rollback = ปล่อยคอลัมน์ว่างไว้ (ร้านที่รวมไปแล้วจะยังปิดใช้งานอยู่ ซึ่งถูกต้อง)
--
-- SQLite ADD COLUMN ไม่มี IF NOT EXISTS — apply ONCE:
--   npx wrangler d1 execute fintrack-db --remote --file migrations/0012_vendor_merge.sql

ALTER TABLE vendor_profiles ADD COLUMN merged_into TEXT;

-- ใช้ตอนเดินตามลูกศรใน upsert และตอนแสดงรายชื่อ
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_merged
  ON vendor_profiles(workspace_id, merged_into);
