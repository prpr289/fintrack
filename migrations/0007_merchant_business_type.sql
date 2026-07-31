-- Merchants 3.0: หมวดธุรกิจของร้าน (ร้านนี้ค้าขายอะไร) + คำค้น + สถานะเลิกใช้
-- Additive nullable — ของเดิมไม่กระทบ · rollback = ปล่อยคอลัมน์ว่างไว้
--
-- คนละแกนกับ typical_category_id ที่มีอยู่แล้ว:
--   business_type      = ติดที่ตัวร้าน  "ร้านนี้ขายอะไร"      ใช้ค้นหา/กรอง/หาร้านสำรอง
--   typical_category_* = ติดที่ตัวบิล   "ลงบัญชีหมวดไหน"      ใช้ลงบัญชี
-- ร้านเดียวขายหลายอย่างได้ (แม็คโครขายทั้งของแห้งและถุงมือ) จึงยัดรวมช่องเดียวไม่ได้
--
-- SQLite ADD COLUMN ไม่มี IF NOT EXISTS — apply ONCE, ห้ามรันซ้ำ:
--   npx wrangler d1 execute fintrack-db --remote --file migrations/0007_merchant_business_type.sql

ALTER TABLE vendor_profiles ADD COLUMN business_type TEXT;      -- หมวดธุรกิจหลัก
ALTER TABLE vendor_profiles ADD COLUMN business_sub_type TEXT;  -- หมวดธุรกิจย่อย
ALTER TABLE vendor_profiles ADD COLUMN keywords TEXT;           -- สินค้าที่ซื้อประจำ คั่นด้วยจุลภาค — ใช้ค้นหา
ALTER TABLE vendor_profiles ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;  -- 0 = เลิกใช้ร้านนี้แล้ว (ซ่อน ไม่ลบ)
