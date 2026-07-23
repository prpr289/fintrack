# บิลรายจ่ายรอชำระ (Pending-payment Expense Bills) — Design

Date: 2026-07-23
Branch: `claude/pending-expense-bill-function-ad854f`
Status: approved design (pending spec review)
Scope of this spec: **Phase 1 (web) เท่านั้น** — LINE เป็น Phase 2 (ระบุไว้ท้ายเอกสาร)

## Problem

พนักงานแจ้งบิลค่าใช้จ่ายให้เจ้าของผ่าน LINE (แชทส่งรูป/ข้อความเฉยๆ — **ยังไม่ผ่านบอท**)
เจ้าของต้องทำงาน **2 รอบ**: (1) ไล่โอนเงินทีละคน แล้ว (2) นั่งคีย์รายการเข้าระบบเองจากรูปในแชท

ปัญหาแท้จริง: การแจ้งบิลวันนี้ไม่มีโครงสร้าง เจ้าของเลยเป็นคนกรอกข้อมูล 100% และไม่มี
"คิว" ให้เห็นว่าค้างจ่ายใครบ้าง จึงลืม/จ่ายซ้ำได้

**Goal (1 ประโยค):** ย้ายภาระกรอกข้อมูลไปที่พนักงานทั้งหมด และบีบงานของเจ้าของให้เหลือ
**ตรวจเร็ว + โอน + กดยืนยันครั้งเดียว** โดยบิลที่ยังไม่จ่าย **ไม่กระทบยอดบัญชีใดๆ** จนกว่าจะกดจ่าย

Non-goal: แอปนี้ **ไม่โอนเงินเอง** (ผิดกฎ + ไม่มี banking integration) — โอนยังทำในแอปธนาคาร
ระบบแค่ทำให้ "ตรวจ" เบาลงและ "บันทึก" เกิดอัตโนมัติตอนกดจ่าย

## Core concept

**Pending bill** = คำร้องขอเบิก/ให้จ่าย ที่พนักงานส่งมาพร้อมหลักฐาน มัน**ไม่ใช่ transaction**
จนกว่าเจ้าของจะกด "จ่ายแล้ว" — ตอนนั้นถึงสร้าง `transactions` จริง (reuse `createTransaction`
เดิม) แนบหลักฐานเป็น slip แล้วตัดยอดกระเป๋า

3 สถานะ: `pending` → `paid` (สร้าง tx) / `rejected` (ทิ้งพร้อมเหตุผล)

**Payee** (ปลายทางเงิน) มี 2 แบบปนกัน (ยืนยันจากเจ้าของ): `employee` (สำรองจ่าย → โอนคืนพนักงาน)
หรือ `vendor`/`other` (จ่ายร้าน/ซัพตรง) — เก็บบัญชีปลายทางล่วงหน้าแล้ว snapshot ลงบิลตอนส่ง

**Evidence tier** (แก้ปัญหาตลาดสดไม่มีบิล — *ไม่ใช้ PO*):

| evidence_type | ความแข็ง | กติกา (server-enforced) |
|---|---|---|
| `slip_transfer` | แข็ง | บังคับแนบสลิปโอน (OCR อ่านยอดถ้าได้) |
| `receipt` | แข็ง | บังคับแนบใบเสร็จ/บิลเงินสด |
| `self_declared` | **อ่อน** | ตลาดสดไม่มีบิล — บังคับ **รูปของ** + ยอด ≤ เพดาน (default ฿1,000) ไม่งั้นบังคับให้โอน · ระบบออก "ใบรับรองแทนใบเสร็จรับเงิน" ให้อัตโนมัติ · ติดธง "หลักฐานอ่อน" ในคิว |

## Scope

**In (Phase 1 — web, ไม่แตะ `functions/*`):**
- ตาราง `pending_bills` + migration
- worker endpoints ใหม่ (additive) สำหรับ create/list/get/pay/reject/delete + upload evidence
- ฟิลด์บัญชีปลายทางบน `users` (พนักงาน) และ `vendor_profiles` (ซัพ) + UI ตั้งค่า
- หน้าเว็บ "แจ้งบิลรอจ่าย" (พนักงาน login กรอกเอง)
- หน้าเว็บ "คิวบิลรอจ่าย" (แอดมิน ตรวจ+จ่าย+ปฏิเสธ)
- ออกใบรับรองแทนใบเสร็จอัตโนมัติ (voucher variant) เมื่อ `self_declared`
- ธง "หลักฐานอ่อน" + เพดานยอดบิลไม่มีบิล + จับบิลซ้ำ (flag)
- สถานะบิลให้พนักงานผู้ส่งเห็นในเว็บ + audit log ทุก state change

**Out (Phase 2 / later — YAGNI ตอนนี้):**
- LINE: ปุ่ม "ส่งเป็นบิลรอจ่าย" + เด้งแจ้งกลับพนักงาน (แตะ `functions/*` → policy-gated)
- ติ๊กจ่ายหลายใบรวด (batch pay UI) — endpoint เตรียม hook ไว้ แต่ UI ไว้ V1
- PromptPay QR/deeplink ให้แอปธนาคารเด้งเติมยอด
- Delegate ผู้อนุมัติหลายสาขา
- OCR ยอดจากรูปฝั่งเว็บ (Phase 1 พึ่งการพิมพ์ + cross-check เฉพาะกรณีมี OCR)

## Data Model

Source of truth ของบิลรอจ่าย = ตารางใหม่ `pending_bills` (D1). **แยกจาก `transactions` โดยตั้งใจ**
เพื่อให้บิลรอจ่าย **ไม่มีทางรั่วเข้ายอดรวม/รายงาน/ยอดกระเป๋าโดยบังเอิญ** (money-correctness by
construction — ไม่ต้องไปเติม `WHERE` guard ในทุก query ที่รวมเงิน)

```sql
-- migrations/0002_pending_bills.sql
CREATE TABLE pending_bills (
  id                  TEXT PRIMARY KEY,            -- 'pb_' + uuid
  workspace_id        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | paid | rejected
  source              TEXT NOT NULL DEFAULT 'web',     -- web | line
  submitted_by_user_id TEXT,                       -- FK users.id (web); null สำหรับ line
  submitted_by_name   TEXT,                        -- ชื่อแสดง (snapshot)
  name                TEXT NOT NULL,               -- รายการนี้คือค่าอะไร
  amount              REAL NOT NULL,               -- > 0
  category_id         TEXT,
  sub_category_id     TEXT,
  scope               TEXT NOT NULL DEFAULT 'business', -- business | personal
  note                TEXT,
  payee_type          TEXT NOT NULL DEFAULT 'employee', -- employee | vendor | other
  payee_ref_id        TEXT,                        -- users.id หรือ vendor_profiles.id
  payee_name          TEXT,                        -- snapshot
  payee_bank          TEXT,                        -- snapshot
  payee_account_no    TEXT,                        -- snapshot (แสดง mask 4 ตัวท้ายใน UI)
  evidence_type       TEXT NOT NULL,               -- slip_transfer | receipt | self_declared (self_declared → รูปที่แนบคือ "รูปของ")
  evidence_key        TEXT,                        -- R2 object key ของรูปหลักฐาน
  evidence_ocr        TEXT,                        -- JSON ผล OCR ถ้ามี
  reject_reason       TEXT,
  created_tx_id       TEXT,                        -- FK transactions.id เมื่อ paid
  paid_wallet_id      TEXT,
  paid_by_user_id     TEXT,
  paid_at             TEXT,
  created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_pb_ws_status ON pending_bills(workspace_id, status);
CREATE INDEX idx_pb_ws_submitter ON pending_bills(workspace_id, submitted_by_user_id);
```

**บัญชีปลายทาง (เก็บล่วงหน้า, Q4=เก็บ):** additive columns, nullable ทั้งหมด → ปลอดภัย
```sql
-- migrations/0003_payout_accounts.sql
ALTER TABLE users            ADD COLUMN bank_name TEXT;
ALTER TABLE users            ADD COLUMN bank_account_no TEXT;
ALTER TABLE users            ADD COLUMN bank_account_name TEXT;
ALTER TABLE vendor_profiles  ADD COLUMN bank_name TEXT;
ALTER TABLE vendor_profiles  ADD COLUMN bank_account_no TEXT;
```
ตอนส่งบิล ระบบ **snapshot** บัญชีของ payee ที่เลือกลงบิล (freeze — ถ้าโปรไฟล์เปลี่ยนทีหลัง
บิลเก่าไม่เพี้ยน)

**Evidence ↔ slip:** รูปหลักฐานเก็บใน R2 bucket `SLIPS` เดิม key `${workspace_id}/bills/${billId}/${slipId}`
ตอน **pay** → สร้าง tx → เพิ่มแถวใน `slips` โดย `file_key` ชี้ไปที่ `evidence_key` เดิม
(`getSlipUrl` เสิร์ฟจาก `file_key` ที่เก็บไว้ ไม่ได้ประกอบ path ใหม่ → **ไม่ต้อง copy object**) →
UI voucher/slip เดิมใช้งานได้ทันที

## API (worker.js — additive routes ล้วน, ห้ามแตะ route/auth เดิม)

| method + path | หน้าที่ | สิทธิ์ |
|---|---|---|
| `POST /pending-bills` | สร้างบิล (server snapshot บัญชี payee + บังคับกติกา evidence) | admin, staff |
| `POST /pending-bills/:id/evidence` | อัปโหลดรูปหลักฐาน (mirror `uploadSlip`) | ผู้ส่ง หรือ admin |
| `GET /pending-bills?status=&limit=&offset=` | ลิสต์ (admin=ทั้งหมด · staff=เฉพาะของตัวเอง) | admin, staff |
| `GET /pending-bills/:id` | รายละเอียด + presigned evidence URL | admin หรือ ผู้ส่ง |
| `POST /pending-bills/:id/pay` | จ่าย → สร้าง tx + แนบ slip + `status=paid` + snapshot paid_* | **admin only** |
| `POST /pending-bills/:id/reject` | ปฏิเสธ + `reject_reason` | **admin only** |
| `DELETE /pending-bills/:id` | ลบ (เฉพาะ `pending`) | ผู้ส่ง(ของตัวเอง) หรือ admin |
| `PATCH /me` · `PATCH /users/:id` | เพิ่มรับ `bankName/bankAccountNo/bankAccountName` (additive) | self / admin |
| vendor create/update | เพิ่มรับ `bankName/bankAccountNo` (additive) | admin |

Batch hook (endpoint เตรียมไว้ UI ทำ V1): `POST /pending-bills/pay-batch {ids[], walletId, date}` → loop `pay` แต่ละใบ

**กติกา evidence ที่ server บังคับตอน `POST /pending-bills` + `pay`:**
1. `evidence_type` required
2. ถ้า ≠ `self_declared` → ต้องมี `evidence_key` (อัปโหลดแล้ว) ก่อน `pay`
3. ถ้า `self_declared` → ต้องมี **รูปของ** (`evidence_key`) **และ** `amount ≤ NO_BILL_CAP` (default 1000) ไม่งั้น 400 `"เกินเพดานบิลไม่มีบิล ต้องจ่ายแบบโอน"`
4. `pay` ต้อง `status='pending'` เท่านั้น (กันจ่ายซ้ำ — ถ้า `paid` แล้ว → 409)
5. duplicate flag (ไม่บล็อก): payee+amount+date ซ้ำภายใน 7 วัน → set flag ให้ UI เตือน

`pay` internal: reuse logic เดียวกับ `createTransaction` (name, amount, type=`expense`, scope,
date, categoryId, subCategoryId, walletId, submittedBy=`submitted_by_name`, source=`manual`)
→ ได้ `tx.id` → เขียน `created_tx_id`, `paid_*`, `status='paid'` → เพิ่ม slips row →
`logAudit('pending_bill.pay', ...)`

## Workflows (by role)

**พนักงานส่งบิล (เว็บ):** login → หน้า/โมดัล "แจ้งบิลรอจ่าย" → กรอก ยอด/ชื่อ/หมวด/scope →
เลือก **payee** (ค่าเริ่ม = ตัวเอง/reimburse) → เลือก **วิธีจ่าย** (evidence tier) → แนบรูป
(บังคับ) → ส่ง → บิล `pending` (source=web, submitted_by_user_id=me)

**เจ้าของตรวจ+จ่าย:** หน้า "คิวบิลรอจ่าย" → เห็นการ์ดสรุป + ธง (หลักฐานอ่อน / ยอด≠OCR /
ซ้ำ) → โอนในแอปธนาคาร → กด "จ่ายแล้ว" (โมดัลเลือกกระเป๋า+วันที่) → สร้าง tx + ตัดยอด · หรือ
กด "ปฏิเสธ" + เหตุผล

**พนักงานเห็นสถานะ:** หน้า/แท็บ "บิลของฉัน" → `รอจ่าย / จ่ายแล้ว / ปฏิเสธ(+เหตุผล)`
(Phase 1 = เห็นในเว็บ · Phase 2 = เด้ง LINE)

## Roles & Permissions (+ Audit)

- สร้างบิล: admin, staff (viewer ไม่ได้)
- คิวทั้งหมด + จ่าย + ปฏิเสธ: **admin only** (เจ้าของ) — ยืนยันแล้วว่าสาขาเดียว คนอนุมัติคนเดียวพอ (multi-branch delegate = later)
- staff เห็นเฉพาะบิลของตัวเอง (list filter by `submitted_by_user_id`)
- route "คิวบิลรอจ่าย" = admin-only (ห่อ `RequireAdmin` เหมือน `/reports`, `/recurring`)
- ทุก create/pay/reject → `logAudit` (reuse ของเดิม)

## UI / UX spec

ยึด **design language เดิมของ FinTrack** (สี/badge/modal/card แบบ `Transactions.jsx`,
`QuickAdd.jsx`, `VoucherDoc.jsx`) — ไม่สร้าง design system ใหม่ กฎ UX ที่ยึด (จาก ui-ux-pro-max
Quick Reference, ปรับสำหรับเว็บ):

**หน้า "แจ้งบิลรอจ่าย" (พนักงาน)** — reuse โครง modal 2 สเต็ปของ `QuickAdd` ได้
- `form-labels`/`input-labels`: ทุก field มี label เห็นชัด (ไม่ใช่ placeholder-only)
- `input-type-keyboard`: ยอด = `inputmode="decimal"` · `number-tabular` แสดงยอดเป็น tabular-nums
- payee selector: default "ตัวเอง (สำรองจ่าย)" → auto-fill บัญชีที่เก็บไว้ (mask 4 ท้าย) · เลือก vendor/other ได้
- evidence tier: 3 การ์ดเลือก → เลือก `self_declared` แล้ว **reveal** ช่องรูป(บังคับ) + note ว่าจะออกใบรับรองให้ + เตือนเพดานยอด (`progressive-disclosure`)
- `inline-validation`: validate on blur, error ใต้ field (`error-placement`, `error-clarity` = บอกวิธีแก้)
- `loading-buttons` + `success-feedback`: ปุ่มส่ง disable+spinner ตอนส่ง, สำเร็จเด้ง toast (`aria-live="polite"`)
- touch target ≥ 44px, `color-not-only` (badge หลักฐานใช้สี + ข้อความ)

**หน้า "คิวบิลรอจ่าย" (แอดมิน)** — เป็น dashboard/queue (`visual-hierarchy`: สรุปก่อนรายละเอียด)
- metric row: จำนวนรอจ่าย · ยอดรวมต้องโอน · ค้างนานสุด (`number-tabular`)
- card ต่อบิล: ผู้ส่ง(avatar+ชื่อ) · ยอด · หมวด(chip) · payee+บัญชี (คลิกคัดลอกได้) · badge หลักฐาน แข็ง/อ่อน · thumbnail รูป · อายุบิล · ธงเตือน
- action: ดูหลักฐาน · **จ่ายแล้ว** (โมดัล: เลือกกระเป๋า+วันที่ → `confirmation` ก่อน commit) · ปฏิเสธ (เหตุผล, `destructive-emphasis` สีแดงแยกจากปุ่มหลัก)
- 1 primary CTA ต่อการ์ด (`primary-action` = ปุ่ม "จ่ายแล้ว")
- `empty-states`: "ยังไม่มีบิลรอจ่าย" + คำแนะนำ · `progressive-loading`: skeleton ตอนโหลด
- filter สถานะ + sort (อายุ/ยอด) · แถวอัปเดตใช้ `aria-live`
- แถบเตือนรายคน: "% บิลไม่มีบิลเดือนนี้" (คำนวณฝั่ง client จาก list — MVP)

**ใบรับรองแทนใบเสร็จรับเงิน** — voucher variant ใหม่ (ต่อยอด `VoucherDoc.jsx`) render จากข้อมูล
บิล/tx เมื่อ `evidence_type='self_declared'`: หัวร้าน · เลขที่ `CR-…` · วันที่ · payee (ระบุ
"ผู้ขายไม่ออกใบเสร็จ") · ตารางรายการ · ยอด · เหตุที่ไม่มีใบเสร็จ · ช่องเซ็นผู้จ่าย/ผู้อนุมัติ ·
แนบรูปของ — client-side เหมือน voucher เดิม

**ตั้งค่าบัญชีปลายทาง:** เพิ่มฟิลด์บัญชีใน `Profile` (ของตัวเอง), `Users` (admin ตั้งให้ staff),
`Vendors` (ต่อซัพ) — แสดง mask 4 ท้าย

**Nav:** เพิ่มเมนู "บิลรอจ่าย" — admin เห็นเป็น "คิวบิลรอจ่าย" · staff เห็นเป็น "แจ้งบิล/บิลของฉัน"

## Money-correctness & Fraud controls

- pending bill แยกตาราง → **เป็นไปไม่ได้**ที่จะรั่วเข้ายอด/รายงานก่อนจ่าย
- `pay` เป็น atomic + guard `status='pending'` (กันจ่ายซ้ำ/double balance) → 409 ถ้าจ่ายแล้ว
- บังคับแนบหลักฐานตาม tier · เพดานยอดบิลไม่มีบิล · duplicate flag
- ธง "หลักฐานอ่อน" + %รายคน = ตัวปรามการดันทุกอย่างเข้าช่อง self_declared
- audit log ทุก state change
- **honest ceiling:** เงินสด self_declared เป็น "substantiated" ไม่ใช่ "confirmed" ระดับสลิป — รูปของปลอมได้ ระบบแค่ปราม ไม่ใช่พิสูจน์

## Phases & Build Priority

| Phase | ทำอะไร | เกณฑ์จบ | แตะ policy? |
|---|---|---|---|
| **1 (สเปกนี้ · เว็บ)** | ตาราง+migration · endpoints · บัญชีปลายทาง+UI · ฟอร์มส่งบิล · คิวแอดมิน · pay/reject · ใบรับรองอัตโนมัติ · สถานะให้ staff · audit | พนักงานส่งบิลเว็บ → เจ้าของจ่าย+ยืนยัน → เกิด tx จริง + ตัดยอด + แนบสลิป ครบวงจร บนเว็บ | **ไม่แตะ** `functions/*` |
| **2 (additive · gated)** | LINE ปุ่ม "ส่งเป็นบิลรอจ่าย" (path ใหม่ ข้างของเดิม) → เรียก `POST /pending-bills` · เด้งแจ้งกลับพนักงานตอนจ่าย/ปฏิเสธ | ส่งผ่าน LINE เข้าคิวเดียวกันได้ + flow LINE เดิมพิสูจน์แล้วไม่เจ๊ง | **แตะ** `functions/*` → checklist + เจ้าของเคาะ |
| **later (V2)** | batch pay UI · PromptPay QR/deeplink · delegate หลายสาขา · analytics รายคน | — | — |

## Integration Policy compliance (Phase 1)

- **แตะ (additive ล้วน):** `worker.js` (เพิ่ม route + table ใหม่ ไม่แก้ route/auth เดิม) · `migrations/*` (ไฟล์ใหม่) · `src/*` (หน้าใหม่ + ฟิลด์เพิ่ม)
- **ไม่แตะ:** `functions/*` · `SERVICE_TOKEN` · `SERVICE_USER_ID` · `FINTRACK_TOKEN` · LINE tokens · route/auth เดิมของ worker
- **ไม่มี secret ใหม่** ใน Phase 1 → ไม่ต้อง redeploy Pages ด้วยเหตุ secret
- ⚠️ `worker.js` hand-maintained → **diff กับ prod (หรือ `fintrack-worker-deployed.js`) ก่อน deploy** กัน deploy repo เก่าทับของใหม่กว่า
- **Rollback:** ซ่อนเมนู + เลิกเรียก endpoint ใหม่ → จบ · column/table ที่เพิ่มเป็น additive nullable ปล่อยไว้ได้ ไม่กระทบของเดิม (rollback = ลบของใหม่ ไม่ต้องแก้ของเดิมกลับ)

## Risks

| ความเสี่ยง | ความแรง | กันพัง |
|---|---|---|
| **Adoption** — พนักงานไม่เคยใช้เครื่องมือ อาจกลับไปแชทรูป | สูงสุด | ฟอร์ม ≤20 วิ · เจ้าของช่วย onboard · Phase 2 LINE คือทางที่พนักงานคุ้นจริง |
| `worker.js` drift (repo ตามหลัง prod) | กลาง | diff prod ก่อน deploy · เพิ่มเฉพาะ route ใหม่ |
| ช่องโหว่ self_declared เป็นที่ซ่อนบิลปลอม | กลาง | เพดานยอด + %รายคน + audit + รูปของบังคับ |
| double-pay / ยอดเพี้ยน | ต่ำ | แยกตาราง + guard status + atomic |

## Acceptance Criteria (ตรวจได้จริง — Phase 1)

1. staff login สร้างบิลได้ผ่านฟอร์มเว็บ พร้อมแนบรูป → บิลขึ้นในคิวแอดมินสถานะ `pending`
2. ยอด/รายงาน/ยอดกระเป๋า **ไม่เปลี่ยน** ตราบใดที่บิลยัง `pending`
3. admin กด "จ่ายแล้ว" เลือกกระเป๋า+วันที่ → เกิด `transactions` (expense) 1 แถว, ยอดกระเป๋าลดตามยอด, รูปกลายเป็น slip ของ tx นั้น, บิล = `paid` + `created_tx_id` ชี้ถูก
4. กด "จ่ายแล้ว" ซ้ำใบเดิม → 409 ไม่เกิด tx ซ้ำ
5. เลือก `self_declared` ยอด > เพดาน → server 400 ปฏิเสธ · ยอด ≤ เพดาน + แนบรูป → ผ่าน และมีปุ่มออก "ใบรับรองแทนใบเสร็จ"
6. admin ปฏิเสธ + เหตุผล → บิล `rejected`, staff ผู้ส่งเห็นเหตุผลในเว็บ
7. staff เห็นเฉพาะบิลตัวเอง · viewer สร้าง/เห็นคิวไม่ได้ (403)
8. คิวติดธง "หลักฐานอ่อน" กับบิล `self_declared` และแสดง %รายคน
9. ไม่มีการแก้ไข `functions/*` หรือ route/auth เดิมของ worker (diff ยืนยัน)

## Assumptions / Open

- สาขาเดียว เจ้าของอนุมัติคนเดียวพอ (multi-branch = later) — ยืนยันแล้ว
- เพดานบิลไม่มีบิล default ฿1,000 (ปรับได้ทีหลัง — hardcode ก่อน, config เป็น later)
- ภาษี: "ใบรับรองแทนใบเสร็จ" เป็น document category มาตรฐาน แต่รายละเอียด deductibility/หัก ณ ที่จ่าย → ยืนยันกับบัญชีของเจ้าของ (เชื่อมกับ FinTrack tax roadmap)
- เคสยังไม่ครอบใน Phase 1 (รอเจ้าของยืนยันว่าจำเป็นไหม): จ่ายมัดจำ/จ่ายก่อนของมา · ซื้อแล้วคืน · บิลรวมหลายคนจ่าย
