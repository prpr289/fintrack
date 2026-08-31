-- ข้อมูลร้านสำหรับขึ้นหัวเอกสารที่คู่ค้าเห็น
-- ก่อนหน้านี้ workspaces มีแค่ id/name/owner_id/created_at ใบวางบิลจึงขึ้นได้แค่ชื่อ
-- (และค้างที่ค่า default "My Business" เพราะไม่มีหน้าจอให้แก้ด้วยซ้ำ)
--
-- Additive nullable ทั้งหมด — โค้ดเดิมที่ไม่รู้จักคอลัมน์นี้ไม่กระทบ
-- rollback = ปล่อยคอลัมน์ว่างไว้ เอกสารจะกลับไปแสดงแค่ชื่อเหมือนเดิม
--
-- SQLite ADD COLUMN ไม่มี IF NOT EXISTS — apply ONCE ห้ามรันซ้ำ:
--   npx wrangler d1 execute fintrack-db --remote --file migrations/0010_workspace_profile.sql

ALTER TABLE workspaces ADD COLUMN address TEXT;     -- ที่อยู่ตามที่จะให้ขึ้นเอกสาร
ALTER TABLE workspaces ADD COLUMN tax_id TEXT;      -- เลขประจำตัวผู้เสียภาษี
ALTER TABLE workspaces ADD COLUMN tax_branch TEXT;  -- รหัสสาขา 00000 = สำนักงานใหญ่
ALTER TABLE workspaces ADD COLUMN phone TEXT;       -- เบอร์ติดต่อบนเอกสาร
