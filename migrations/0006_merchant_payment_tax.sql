-- Merchants 2.0: QR รับเงิน (พร้อมเพย์) + ข้อมูลอ้างอิงภาษีสรรพากร บน vendor_profiles
-- Additive nullable ทั้งหมด — ของเดิม (LINE bot, OCR, matchSuggest, บิลรอจ่าย) ไม่กระทบ
-- rollback = ปล่อยคอลัมน์ว่างไว้ ไม่ต้องแก้อะไรกลับ
--
-- SQLite ADD COLUMN ไม่มี IF NOT EXISTS — apply ONCE, ห้ามรันซ้ำ:
--   npx wrangler d1 execute fintrack-db --remote --file migrations/0006_merchant_payment_tax.sql

-- ข้อมูลร้าน
ALTER TABLE vendor_profiles ADD COLUMN display_name TEXT;      -- ชื่อตามทะเบียน (ถ้าต่างจากชื่อเรียก) ใช้เทียบใบกำกับ
ALTER TABLE vendor_profiles ADD COLUMN contact_person TEXT;    -- ชื่อ+เบอร์คนที่ติดต่อได้จริง

-- บัญชีรับเงิน
ALTER TABLE vendor_profiles ADD COLUMN bank_account_name TEXT; -- ชื่อบัญชี — ให้คนโอนเทียบก่อนกดยืนยัน
ALTER TABLE vendor_profiles ADD COLUMN promptpay_id TEXT;      -- เบอร์ / เลข ปชช. / เลขผู้เสียภาษี → วาด QR เอง

-- ภาษี (ตัวชี้ว่าซื้อจากร้านนี้ลงรายจ่ายทางภาษีได้แค่ไหน)
ALTER TABLE vendor_profiles ADD COLUMN taxpayer_type TEXT;     -- individual | juristic
ALTER TABLE vendor_profiles ADD COLUMN tax_branch TEXT;        -- รหัสสาขา 00000 = สำนักงานใหญ่
ALTER TABLE vendor_profiles ADD COLUMN doc_type TEXT;          -- full_tax | short_tax | receipt | none
ALTER TABLE vendor_profiles ADD COLUMN wht_type TEXT;          -- none | transport | ads | service | rent
ALTER TABLE vendor_profiles ADD COLUMN wht_rate REAL;          -- อัตรา % หัก ณ ที่จ่าย
