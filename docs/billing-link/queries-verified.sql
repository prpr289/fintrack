-- FinTrack · ใบวางบิลคู่ค้า — query ที่ Dashboard วัตถุดิบต้องใช้
-- ทั้งหมดอ่านจาก pending_bills.line_items (JSON) โดยตรง *ไม่มีตารางใหม่*
--
-- สถานะ: รันผ่านแล้วบนเอนจิน D1 ผ่าน `wrangler d1 execute fintrack-db --local`
--         (local ของ wrangler v4 รัน workerd = SQLite ตัวเดียวกับ D1 production)
-- ยังไม่ได้ยืนยันบน --remote เพราะ session นี้ auth ไม่ผ่าน — ให้ยิงซ้ำหนึ่งครั้งก่อนเริ่มเขียนโค้ด:
--   npx wrangler d1 execute fintrack-db --remote --command "SELECT json_extract(value,'$.name') FROM json_each('[{\"name\":\"x\"}]')"
--
-- ฟีเจอร์ SQLite ที่พิสูจน์แล้วว่าใช้ได้: json_each · json_extract · ROW_NUMBER() · LEAD()
--
-- ผลลัพธ์จากข้อมูลทดสอบ (บิลจ่ายแล้ว 3 ใบ: มีรายการ 2 ใบ ฿2,335 + "ของแห้ง" ก้อนเดียว ฿8,400):
--   Q1 มะละกอ ฿1,440 (50 กก. · 2 ครั้ง) > มะเขือเทศ ฿350 > มะนาว ฿325 > แตงร้าน ฿220
--      บิลที่ยังไม่จ่ายถูกกรองออกถูกต้อง
--   Q2 ราคาล่าสุด มะละกอ = 30 (ของวันที่ 27) ไม่ใช่ 28 (ของวันที่ 20)
--   Q4 ความครอบคลุม 21.8% — "ของแห้ง" ก้อนเดียวกลบรายการละเอียดทั้งหมด
--   Q5 จับได้ว่ามะละกอขึ้นจาก 28 -> 30 (+7.1%)
--
-- หมายเหตุ: การเรียงลำดับ "ของคู่ค้ารายนี้ก่อน" ใน Q3 ยังไม่ได้ทดสอบจริง
--           เพราะข้อมูลทดสอบมีคู่ค้ารายเดียว — ต้องทดสอบซ้ำเมื่อมีข้อมูลหลายร้าน

-- Q1 Dashboard: วัตถุดิบเรียงตามยอดเงิน
SELECT json_extract(li.value,'$.name') AS item,
       ROUND(SUM(json_extract(li.value,'$.qty') * json_extract(li.value,'$.unitPrice')),2) AS baht,
       SUM(json_extract(li.value,'$.qty')) AS qty,
       COUNT(*) AS times
FROM pending_bills pb, json_each(pb.line_items) li
WHERE pb.workspace_id='ws1' AND pb.status='paid' AND pb.line_items IS NOT NULL
GROUP BY item ORDER BY baht DESC;

-- Q2 ราคาล่าสุดต่อ (ของ x คู่ค้า) สำหรับเติมช่องราคาอัตโนมัติ
SELECT item, unit_price, paid_at FROM (
  SELECT json_extract(li.value,'$.name') AS item,
         json_extract(li.value,'$.unitPrice') AS unit_price,
         pb.paid_at AS paid_at,
         ROW_NUMBER() OVER (PARTITION BY json_extract(li.value,'$.name') ORDER BY pb.paid_at DESC) AS rn
  FROM pending_bills pb, json_each(pb.line_items) li
  WHERE pb.workspace_id='ws1' AND pb.payee_ref_id='v1'
    AND pb.status='paid' AND pb.line_items IS NOT NULL
) WHERE rn=1 ORDER BY item;

-- Q3 Autocomplete: ของที่เคยซื้อ เอาของคู่ค้ารายนี้ขึ้นก่อน
SELECT json_extract(li.value,'$.name') AS item, COUNT(*) AS n,
       MAX(CASE WHEN pb.payee_ref_id='v1' THEN 1 ELSE 0 END) AS this_vendor
FROM pending_bills pb, json_each(pb.line_items) li
WHERE pb.workspace_id='ws1' AND pb.line_items IS NOT NULL
GROUP BY item ORDER BY this_vendor DESC, n DESC;

-- Q4 ความครอบคลุมข้อมูล (% ของยอดซื้อที่มีรายการละเอียด)
SELECT ROUND(100.0*SUM(CASE WHEN line_items IS NOT NULL THEN amount ELSE 0 END)/SUM(amount),1) AS coverage_pct,
       ROUND(SUM(amount),2) AS total_baht
FROM pending_bills WHERE workspace_id='ws1' AND status='paid';

-- Q5 ราคาขึ้นผิดปกติ: เทียบราคาล่าสุดกับครั้งก่อนหน้า
SELECT item, prev_price, last_price,
       ROUND(100.0*(last_price-prev_price)/prev_price,1) AS pct_change
FROM (
  SELECT json_extract(li.value,'$.name') AS item,
         json_extract(li.value,'$.unitPrice') AS last_price,
         LEAD(json_extract(li.value,'$.unitPrice')) OVER (
           PARTITION BY json_extract(li.value,'$.name') ORDER BY pb.paid_at DESC) AS prev_price,
         ROW_NUMBER() OVER (PARTITION BY json_extract(li.value,'$.name') ORDER BY pb.paid_at DESC) AS rn
  FROM pending_bills pb, json_each(pb.line_items) li
  WHERE pb.workspace_id='ws1' AND pb.status='paid' AND pb.line_items IS NOT NULL
) WHERE rn=1 AND prev_price IS NOT NULL AND last_price <> prev_price;
