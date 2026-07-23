-- บัญชีปลายทางการโอน (เก็บล่วงหน้า) — additive nullable columns, SAFE.
-- SQLite ADD COLUMN ไม่มี IF NOT EXISTS — apply ONCE, ห้ามรันซ้ำ:
--   npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE users ADD COLUMN bank_name TEXT"
--   npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE users ADD COLUMN bank_account_no TEXT"
--   npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE users ADD COLUMN bank_account_name TEXT"
--   npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE vendor_profiles ADD COLUMN bank_name TEXT"
--   npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE vendor_profiles ADD COLUMN bank_account_no TEXT"
ALTER TABLE users ADD COLUMN bank_name TEXT;
ALTER TABLE users ADD COLUMN bank_account_no TEXT;
ALTER TABLE users ADD COLUMN bank_account_name TEXT;
ALTER TABLE vendor_profiles ADD COLUMN bank_name TEXT;
ALTER TABLE vendor_profiles ADD COLUMN bank_account_no TEXT;
