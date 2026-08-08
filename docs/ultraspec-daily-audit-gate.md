# ULTRASPEC — Daily Close Audit Gate

Status: FROZEN — Gate 2 approved
Spec revision: 1
Owner: Fintrack owner
Size: L — database, API, authorization, financial calculations, UI, notifications

## 1. Goal and outcome

- Problem: ยอดที่ระบบคำนวณได้ยังไม่มีขั้นตอนเทียบกับยอดเงินจริงรายวัน จึงตรวจพบรายการตกหล่น รายการซ้ำ หรือยอดคลาดเคลื่อนได้ช้า
- Observable outcome: Admin ตรวจและปิดยอดแยกตามวันที่และกระเป๋าธุรกิจ โดยกรอกยอดจริงจากเงินสด แอปธนาคาร หรือยอดหนี้บัตรเครดิต แล้วระบบเทียบกับยอดตามบัญชีถึงระดับสตางค์
- Success metric:
  - ทุกกระเป๋าธุรกิจที่ยังใช้งานอยู่มีสถานะตรวจยอดรายวันชัดเจน
  - สีเขียวเกิดได้เมื่อยอดต่างเท่ากับ 0.00 บาทและไม่มีประเด็นค้าง
  - ทุกการปิด เปิดใหม่ และยืนยันข้อยกเว้นตรวจย้อนหลังได้
  - Staff ไม่ได้รับยอดรวม ยอดจริง หรือยอดต่างจาก API หรือ UI

## 2. Non-goals

- ไม่เชื่อม Bank Feed, Open Banking, OCR Statement หรือระบบบัญชีภายนอก
- ไม่ส่ง LINE หรืออีเมลในรุ่นแรก
- ไม่บล็อกการสร้างหรือแก้ธุรกรรมแบบ Hard Gate
- ไม่บังคับแนบหลักฐาน
- ไม่ครอบคลุมกระเป๋าส่วนตัว
- ไม่บังคับปิดยอดข้อมูลก่อนวันเริ่มใช้งาน
- ไม่รับรองความถูกต้องเชิงบัญชีหรือภาษีแทนผู้ตรวจสอบมนุษย์

## 3. Scope and boundaries

### In scope

- Soft Gate สำหรับกระเป๋า `scope=business` ที่ `is_active=1` ทุกชนิด: cash, bank, credit
- ปิดยอดรายกระเป๋า; ภาพรวมของวันปิดครบเมื่อกระเป๋าที่บังคับตรวจทุกใบปิดแล้ว
- ยอดจริงเป็นข้อมูลบังคับทุกครั้งที่ปิดกระเป๋า
- ยอดและผลต่างคำนวณ/จัดเก็บเป็น integer satang; ผ่านเมื่อผลต่างเท่ากับ 0
- สีเขียวต้องไม่มี draft, pending edit, missing category, unreconciled transaction, broken transfer pair หรือ duplicate candidate ที่ยังไม่ได้ตัดสิน
- ปิดแบบมีข้อยกเว้นได้เมื่อ Admin ระบุเหตุผล; แสดงสีส้ม `closed_with_exception`
- ธุรกรรมโอนตรวจเป็นหนึ่งคู่ ไม่รวมเป็นรายรับ/รายจ่ายจริงซ้ำสอง
- การแก้ข้อมูลหลังปิดยอดทำให้ผลปิดเดิม stale และกลับสู่ `needs_review` โดยอัตโนมัติ
- Admin แนบหลักฐานได้แต่ไม่บังคับ; เหตุผลบังคับเฉพาะ exception และ reopen
- ประวัติ Audit เป็น append-only
- หน้า Admin ใหม่ชื่อ “ตรวจยอดรายวัน”; Staff เห็นเฉพาะ issue ของรายการที่ตนรับผิดชอบในหน้าธุรกรรม
- แจ้งเตือน Audit ภายใน Notification Bell เฉพาะ Admin

### Assumptions accepted

- A-01: วันที่อ้างอิงคือ `transactions.date` ในเขตเวลา Asia/Bangkok
- A-02: ปิดยอดของวันปัจจุบันได้ แต่ธุรกรรมที่ตามมาจะทำให้ต้องตรวจใหม่
- A-03: ยอดบัตรเครดิตใช้เครื่องหมายเดียวกับยอดคงเหลือที่ระบบแสดงอยู่
- A-04: ข้อมูลย้อนหลังเริ่มเป็น optional backfill; วันที่มีผลเริ่มเมื่อ workspace เปิดใช้ Audit Gate ครั้งแรก
- A-05: Viewer ไม่มีสิทธิ์เข้าหน้า Audit และไม่มีสิทธิ์เปลี่ยนสถานะ
- A-06: รายการซ้ำเป็น candidate เท่านั้น ระบบไม่ลบหรือรวมรายการเอง

### Dependencies

- Cloudflare Worker + D1
- R2 binding `SLIPS` สำหรับหลักฐาน Audit โดยใช้ namespace/key ใหม่ ไม่แตะไฟล์สลิปเดิม
- React/Vite frontend และระบบ auth/role ปัจจุบัน

## 4. Change Manifest

| Path/resource | Mode | Purpose | Risk |
|---|---|---|---|
| `docs/ultraspec-daily-audit-gate.md` | NEW | Frozen spec และหลักฐานขอบเขต | Low |
| `migrations/0006_daily_audit_gate.sql` | NEW | ตาราง, index, transaction change counter และ immutable-event guards | Critical |
| `src/dailyAuditRules.js` | NEW | กฎ satang, state และ issue แบบ pure/deterministic | High |
| `src/dailyAuditRules.test.mjs` | NEW | Unit regression tests | High |
| `worker.js` | EDIT | Audit API, authorization, aggregation, close/reopen, evidence, notifications, reconcile metadata | Critical |
| `src/api.js` | EDIT | Client contracts ของ Audit API | High |
| `src/App.jsx` | EDIT | Admin-only route | High |
| `src/Layout.jsx` | EDIT | เมนู “ตรวจยอดรายวัน” เฉพาะ Admin | High |
| `src/pages/DailyAudit.jsx` | NEW | หน้าเลือกวัน ตรวจ/ปิดยอด และประวัติ | High |
| `src/pages/Transactions.jsx` | EDIT | Issue badges ระดับรายการ; รักษาการซ่อนยอดรวมของ Staff | Critical |
| `src/useNotifications.js` | EDIT | Audit notification เฉพาะ Admin | High |
| `src/components/NotificationBell.jsx` | EDIT | รูปแบบและปลายทาง notification ชนิด Audit | Normal |
| `src/components/NotificationPopup.jsx` | READ-ONLY | ยืนยันว่า Audit ไม่เปิด daily popup ในรุ่นแรก | Normal |

Forbidden paths/resources/actions:

- ห้ามแตะ `functions/**`, LINE bot, LIFF, integration tokens, secrets และ bindings เดิม
- ห้ามแตะหรือรวม `.superpowers/`, `design-qa.md`, `qa-artifacts/`, `vat-restaurant-guidance-th.html`
- ห้ามเปิดเผย aggregate, observed balance หรือ variance ให้ Staff/Viewer แม้ซ่อนเฉพาะหน้า UI แล้วก็ตาม
- ห้าม deploy, migrate remote D1, commit หรือ push โดยไม่มีคำอนุญาตแยกต่างหาก
- ห้ามลบ/แก้ Audit event ที่บันทึกแล้ว

## 5. Current-state evidence

- `src/transactionGroups.js` รวมยอดจากรายการที่ frontend โหลดมา จึงไม่ใช่ authoritative full-day total
- `worker.js` จำกัด transaction list สูงสุด 1,000 รายการต่อคำขอ; Audit จะใช้ server-side aggregate ที่ไม่ผ่าน pagination
- `worker.js` มี wallet reconciliation เชิงคณิตศาสตร์ แต่ยังไม่เทียบยอดจริงภายนอก
- `transactions.is_reconciled` เป็น boolean และยังไม่มีผู้ยืนยัน เวลา หรือ append-only event
- `logAudit` เดิม fail-open จึงไม่ใช้เป็นหลักฐานหลักของ Daily Close
- Staff ถูกซ่อน daily aggregates และแก้ได้เฉพาะรายการที่ตนสร้างอยู่แล้ว; พฤติกรรมนี้ต้องไม่ถดถอย
- Remote D1 schema/migration state: UNVERIFIED — Wrangler account ตอบ error 7403; ต้องตรวจอีกครั้งก่อน remote migration/deploy
- Dirty state ที่ไม่เกี่ยวข้อง: `.superpowers/`, `design-qa.md`, `qa-artifacts/`, `vat-restaurant-guidance-th.html`

## 6. Interfaces and data contracts

| ID | Producer | Consumer | Contract after | Authorization |
|---|---|---|---|---|
| I-01 | Worker | DailyAudit page | `GET /audit/daily?date=YYYY-MM-DD` คืน wallet states, book/observed/variance, blockers, history | Admin only |
| I-02 | Worker | Transactions page | `GET /audit/transaction-issues?from=&to=` คืนเฉพาะ transaction ID + issue codes | Admin: all; Staff: own rows only |
| I-03 | DailyAudit page | Worker | `POST /audit/daily/:date/wallets/:walletId/close` พร้อม observed balance, requestId, expected revision/change version, optional reason/evidence | Admin only |
| I-04 | DailyAudit page | Worker | `POST /audit/daily/:date/wallets/:walletId/reopen` พร้อม reason, requestId, expected revision | Admin only |
| I-05 | DailyAudit page | Worker | `POST /audit/issues/:issueKey/resolve` ยืนยัน `not_duplicate` พร้อม requestId | Admin only |
| I-06 | DailyAudit page | Worker/R2 | upload/list/download Audit evidence ภายใต้ wallet/date; ไม่ใช้ key ของ slips เดิม | Admin only |
| I-07 | Worker | Notification Bell | `/notifications` เพิ่ม kind=`audit` เฉพาะ Admin ไม่มีข้อมูลสำหรับ Staff | Admin only |
| I-08 | Worker | Transactions page | reconcile response เพิ่ม reconciledBy/reconciledAt; Staff ทำได้เฉพาะรายการตนเอง | Admin/owner Staff |

### Data model

- `daily_audit_settings`: workspace effective date และสถานะเปิดใช้
- `daily_audit_wallet_closures`: current projection ต่อ workspace/date/wallet พร้อม revision, captured transaction change version และจำนวนเงินเป็น satang
- `daily_audit_events`: append-only close/reopen/stale/exception events พร้อม actor, timestamp, snapshot, reason และ requestId
- `daily_audit_issue_resolutions`: current resolution ของ duplicate issue; ทุกการเปลี่ยนมี event ประกอบ
- `transaction_reconcile_events`: append-only reconciled/unreconciled history
- `daily_audit_change_counters`: monotonic version ต่อ workspace/date/wallet
- `daily_audit_evidence`: immutable metadata ของไฟล์ R2 ที่ผูกกับ Audit event
- `transactions`: เพิ่ม `reconciled_by_user_id` และ `reconciled_at`
- D1 triggers บน transaction insert/update/delete เพิ่ม change counter เพื่อครอบคลุม manual, transfer, recurring, LINE, pending bill และ refund โดยไม่พึ่งทุก call site
- UPDATE/DELETE guards ป้องกันการแก้หรือลบ event/evidence metadata ที่บันทึกแล้ว

Validation, privacy, retention, migration:

- รับ observed balance เป็น decimal string ไม่รับ NaN/Infinity/เกิน 2 ทศนิยม และแปลงเป็น satang ฝั่ง server
- API ตรวจ workspace ownership และ role ทุก route; การซ่อนด้วย React อย่างเดียวไม่ถือเป็น authorization
- Evidence อนุญาตเฉพาะชนิด/ขนาดเดียวกับนโยบาย upload ที่มีอยู่ และใช้ object key แบบ random UUID
- Migration เป็น additive; ข้อมูลเดิมไม่ถูกแก้ยอดหรือ backfill ว่า “ผ่าน”
- Audit/evidence retention เป็นไม่มีกำหนดในรุ่นแรก; การลบต้องเป็นงานใหม่พร้อมนโยบายเฉพาะ

## 7. Required behavior

1. State ต่อ wallet: `open -> needs_review -> closed | closed_with_exception -> needs_review (stale) -> closed...`
2. Overall day เป็น closed เมื่อ required wallets ทุกใบเป็น `closed` หรือ `closed_with_exception`; ถ้ามี exception ภาพรวมต้องไม่เป็นสีเขียวล้วน
3. Book closing balance = initial balance + signed sum ของ transaction ทุกแถวถึง audit date โดยใช้ server-side aggregate และ integer satang
4. Observed balance บังคับทุกกระเป๋า; variance = observed - book
5. Green close ต้อง variance=0 และ blocker count=0
6. ถ้ามี variance หรือ blocker Admin ปิดได้เฉพาะ `closed_with_exception` พร้อมเหตุผลที่ไม่เป็นค่าว่าง
7. Blockers: unreconciled real-money row, draft, pending edit, missing category ที่ไม่ใช่ transfer, broken transfer pair และ unresolved duplicate candidate
8. Transfer pair ที่ถูกต้องต้องมี 2 legs, จำนวนเงินเท่ากัน, type ตรงข้าม, wallet คนละใบ, workspace/date/pair เดียวกัน
9. Duplicate candidate ใช้ wallet/date/type/amount-satang และรายละเอียด normalized; issue key ต้องรวม transaction membership เพื่อไม่ให้ resolution เก่าครอบรายการใหม่
10. Staff เห็น issue codes/ข้อความของ transaction ตนเองเท่านั้น ไม่เห็นจำนวน issue รวมของวันหรือ wallet
11. Reconcile toggle ต้องบันทึก actor/time แบบ atomic กับ event; Staff จำกัดเฉพาะ transaction ที่ `created_by_user_id=user.id`
12. Close/reopen/resolve เป็น idempotent ด้วย requestId; request ซ้ำคืนผลเดิม ไม่สร้าง event ซ้ำ
13. Close ใช้ optimistic concurrency: expected revision และ change version ไม่ตรงให้ HTTP 409 และบังคับ reload
14. การเปลี่ยน transaction หลัง close ตรวจพบจาก change counter แม้เป็น delete; ผลปิดเดิมยังคงใน history แต่ current state เป็น stale/needs_review
15. ปิดยอดวันปัจจุบันได้; transaction ที่เกิดภายหลังทำให้ stale ตามข้อ 14
16. Evidence เป็น optional; หลังผูกกับ close event แล้วไม่ให้แก้ทับหรือลบในรุ่นแรก
17. วันที่ก่อน effective date แสดง `historical_unverified`; Admin เลือกตรวจย้อนหลังได้โดยสมัครใจ
18. Notification Bell ของ Admin แสดงจำนวนวันที่ยังไม่ครบและลิงก์ไปหน้า Audit; Staff ไม่ได้รับ notification kind นี้

## 8. Edge and error behavior

| ID | Condition | Expected result | User-visible signal | Recovery | Criticality |
|---|---|---|---|---|---|
| E-01 | Staff/Viewer เรียก full Audit API | 403 ไม่มี payload การเงิน | “ไม่มีสิทธิ์” | Admin login | Critical |
| E-02 | observed balance ไม่ถูกต้อง | 400 ไม่เขียนข้อมูล | ระบุรูปแบบยอด | แก้ค่า | Critical |
| E-03 | transaction เปลี่ยนระหว่างตรวจและปิด | 409 ไม่สร้าง close event | “ข้อมูลเปลี่ยน กรุณาตรวจใหม่” | reload | Critical |
| E-04 | ยอดต่างหรือ blocker แต่ไม่มี reason | 422 ไม่ปิด | แสดงรายการที่ต้องแก้/ใส่เหตุผล | แก้รายการหรือใส่เหตุผล | Critical |
| E-05 | requestId ซ้ำ | คืน event เดิม | ไม่สร้างรายการซ้ำ | none | High |
| E-06 | transfer ขาดหนึ่งขา | blocker | ป้าย “คู่โอนไม่ครบ” | แก้รายการ/Admin exception | Critical |
| E-07 | duplicate false positive | blocker จน Admin ยืนยัน not_duplicate | ป้ายรายการซ้ำที่เป็นไปได้ | resolve | High |
| E-08 | upload evidence ล้มเหลว | close ยังทำต่อได้เพราะ optional; ไม่สร้าง metadata ค้าง | แจ้งอัปโหลดไม่สำเร็จ | retry/ปิดโดยไม่มีไฟล์ | High |
| E-09 | ไม่มีกระเป๋าธุรกิจ active | day=`not_required` | Empty state | สร้าง/เปิด wallet | Normal |
| E-10 | วันที่ก่อน effective date | historical_unverified | ป้ายสีเทา | Admin เลือก audit | Normal |
| E-11 | D1/event write ล้มเหลว | financial state และ event ต้องไม่สำเร็จครึ่งเดียว | แจ้งไม่สำเร็จ | retry | Critical |

## 9. Security and operational constraints

- Admin-only boundary enforced in Worker before query that returns aggregates
- Staff issue query adds both workspace and owner predicates server-side
- ห้าม log observed balance, evidence content, auth token หรือ request body ที่มีข้อมูลละเอียด
- Audit mutations ใช้ D1 batch/transactional semantics; หากพิสูจน์ atomicity ไม่ได้ให้หยุด Gate 3
- Server aggregate ไม่มี `limit=1000`
- Query ทุกเส้นมี workspace/date/wallet index และจำกัด date range ของ Staff issue endpoint
- No production migration/deploy in implementation approval; production requires separate explicit approval and verified remote schema

## 10. Impact Map

| ID | Change | Upstream | Downstream | Failure mode | Regression evidence |
|---|---|---|---|---|---|
| IMP-01 | D1 schema/triggers | transactions table | every transaction writer | writes fail or stale not detected | T-02, T-07 |
| IMP-02 | book/variance rules | D1 amounts | close states/UI | money rounding wrong | T-01, T-03 |
| IMP-03 | Audit auth contracts | JWT role/workspace | API/UI | Staff data leak | T-04, T-10 |
| IMP-04 | reconcile metadata | existing toggle endpoint | Transactions/Audit | unauthorized reconcile or missing history | T-05 |
| IMP-05 | close concurrency/idempotency | page request | D1 events/state | double-close/lost update | T-06 |
| IMP-06 | issue detection | transaction rows | green gate | false pass | T-07 |
| IMP-07 | Admin Audit UI | API | route/navigation | unusable close flow | T-08, T-11 |
| IMP-08 | Staff transaction UI | issue API | privacy and daily list | aggregate leak/regression | T-10, T-11 |
| IMP-09 | notifications | audit summary | bell | Staff alert leak or popup regression | T-09, T-12 |
| IMP-10 | evidence | browser/R2 | audit history | orphan/overwrite/data exposure | T-13 |

## 11. Implementation plan

| Step | Files/resources | Behavior delivered | Check after step | Stop condition |
|---|---|---|---|---|
| 1 | migration + rules + unit tests | additive schema, counters, exact satang/state rules | migration dry-run + unit tests | destructive/unsupported SQL |
| 2 | worker routes | auth, aggregate, issues, close/reopen/resolve, reconcile history | focused API checks | any privacy/atomicity failure |
| 3 | Admin UI/API client | daily wallet workflow, evidence, history | build + manual states | API contract drift |
| 4 | Staff transaction UI | own issue badges with no aggregates | role matrix check | any aggregate visible/returned |
| 5 | notifications | Admin bell item only | role + popup regression | Staff receives audit item |
| 6 | full verification/review | baseline comparison, accessibility, review findings | Gate 3 matrix | critical UNVERIFIED/FAIL |

## 12. Test Matrix

| ID | Scenario | Layer | Expected | Criticality | Evidence now |
|---|---|---|---|---|---|
| T-01 | decimal-to-satang, signs, exact zero variance | Unit | deterministic exact results | Critical | PASS — 8 Audit rule tests; 13 repository tests total |
| T-02 | apply migration to isolated D1 fixture; triggers increment on insert/update/delete | Integration | schema and counters correct | Critical | PASS — fresh local D1 apply; insert/update/delete and transfer-counterpart triggers |
| T-03 | aggregate >1,000 rows and credit/cash/bank signs | Integration | no pagination loss; correct book balance | Critical | PASS — 1,001 rows=`1010.01`; bank=`115`; credit=`-20` |
| T-04 | Admin/Staff/Viewer API role matrix and workspace isolation | Integration | no aggregate leak | Critical | PASS — role matrix, owner predicate, second-workspace isolation |
| T-05 | reconcile own/all restrictions and immutable event | Integration | atomic metadata/history | Critical | PASS — owner restriction and immutable event guard |
| T-06 | duplicate requestId and stale expected revision/change version | Integration | idempotent result/409 | Critical | PASS — same request idempotent; mismatched reuse/stale revision return 409 |
| T-07 | all blockers, transfer pair, duplicate resolution, delete-after-close | Unit/Integration | no false green | Critical | PASS — blocker rules, cross-scope/inactive pair, counterpart delete stale |
| T-08 | wallet-by-wallet close, exception, reopen, overall status | UI/API | expected state transitions | Critical | PASS — API state matrix and production UI build |
| T-09 | audit notification only Admin and correct route | Integration/UI | Staff absent | High | PASS — Admin present, Staff absent, full effective-date range |
| T-10 | Staff transaction screen and response contain no aggregate/observed/variance | API/UI | privacy preserved | Critical | PASS — response contains own IDs/codes only; existing hidden totals unchanged |
| T-11 | desktop/mobile, keyboard/focus, loading/error/empty states | Manual UI | usable and accessible | High | UNVERIFIED — local browser reload blocked by browser security policy; build passed; owner accepted risk 2026-08-08 |
| T-12 | existing recurring notification bell/popup | Regression | no behavior change | High | PARTIAL — existing branches unchanged and build/lint scope passed; interactive popup not rerun; owner accepted risk 2026-08-08 |
| T-13 | evidence upload/list/download, random key, failure without partial metadata | Integration | secure optional evidence | High | PARTIAL — upload/download and random namespace passed; forced DB-failure cleanup not injected; owner accepted risk 2026-08-08 |
| T-14 | `node --test`, lint, production build | Regression/static | no new failures | Critical | PASS — tests 13/13; build pass; targeted lint pass; full lint equals known baseline |

### Regression baseline

Baseline must be captured in Phase 3 before first production-code edit using the same scopes as the after run:

- `node --test`
- `npm run lint`
- `npm run build`
- Targeted local D1 fixture/migration check (command finalized in Safe Test Preflight)
- Existing Staff view manual evidence: date/count visible; daily totals and P&L absent

Phase 5 evidence summary (2026-08-08):

- Baseline: tests 5/5 PASS; build PASS; full lint 258 errors/5 warnings from existing repository/worktree scope
- After: tests 13/13 PASS; build PASS; targeted changed-file lint PASS; full lint excluding generated `.wrangler` temp remains 258 errors/5 warnings
- Local Worker/D1 runtime: auth/privacy, evidence, exception, idempotency, reconciliation, duplicate resolution, green close, stale projection/event, backdated invalidation, >1,000 rows, cross-wallet transfer invalidation, complete 201-event history and 69-day notification range PASS
- Rollback checkpoint and restore drill: PASS at `C:\Users\Admin\AppData\Local\Temp\fintrack-audit-checkpoint-c780e3e-20260808`
- Remote D1 schema and production Worker comparison remain UNVERIFIED and are mandatory before any separately approved production migration/deploy
- Gate 3 verdict: `SHIP WITH UNVERIFIED ITEMS`; owner explicitly accepted the three non-critical risks in chat on 2026-08-08

## 13. Acceptance criteria

| ID | Observable criterion | Criticality | Evidence |
|---|---|---|---|
| A-01 | Admin ปิดยอดได้ทีละ wallet ด้วย observed balance ที่บังคับ | Critical | T-01, T-08 |
| A-02 | Green เฉพาะ variance=0 และ blocker=0 | Critical | T-01, T-07 |
| A-03 | Exception ต้องมี reason และแสดงสีส้ม | Critical | T-08 |
| A-04 | ทุก required wallet ปิดแล้วจึงปิดภาพรวมวัน | High | T-08 |
| A-05 | การแก้/ลบ/เพิ่ม transaction หลัง close ทำให้ stale | Critical | T-02, T-07 |
| A-06 | History append-only เก็บ actor/time/snapshot/reason | Critical | T-05, T-08 |
| A-07 | Staff เห็นเฉพาะ issue ของรายการตนเองและไม่เห็น aggregate | Critical | T-04, T-10 |
| A-08 | Duplicate candidate ไม่ถูกลบเองและ Admin resolve ได้ | High | T-07 |
| A-09 | Evidence optional และ failure ไม่ทำให้ close เสียครึ่งเดียว | High | T-13 |
| A-10 | Notification อยู่ในระบบและส่งเฉพาะ Admin | High | T-09, T-12 |
| A-11 | ข้อมูลเก่าเป็น historical_unverified และเลือก backfill ได้ | Normal | T-08 |
| A-12 | Existing LINE/functions/config และ Staff-hidden totals ไม่เปลี่ยน | Critical | T-10, T-14 |

## 14. Review and handoff plan

- Review resolver: ใช้ `code-review` skill ตาม ULTRACODE Phase 5
- Independence target: context-isolated reviewer/fresh-eyes review ตาม capability ที่มีใน Phase 5
- Findings ทุกข้อระบุ severity, evidence, accept/reject, fix และ retest
- Handoff pack: local only; export, commit, push, migration และ deploy ไม่ได้รับอนุญาตจาก Gate 2 approval

## 15. Rollback Plan

| Layer | Restore source | Target | Exact action | Verification |
|---|---|---|---|---|
| Code | Phase 3 external per-file backup + manifest/hash | exact EDIT/NEW paths in Change Manifest | copy back only edited files; remove only newly created feature files after validating absolute paths; no reset/checkout | rerun baseline scopes |
| Local D1 test | isolated temporary test store | temporary test DB only | discard validated temp directory | recreate and rerun migration fixture |
| Remote code | previously deployed Worker/Pages revision, only after separate production approval | Worker/Pages deployment | redeploy exact previous verified revision | auth + existing transactions/LINE smoke checks |
| Remote data | additive schema preserved | new Audit tables/triggers | default rollback preserves all Audit data; if trigger disable is required, apply reviewed compensating migration that drops only named Audit triggers | integrity queries + existing transaction write smoke test |
| R2 evidence | preserve objects | `daily-audit/` namespace only | no automatic deletion; orphan cleanup is a separately approved operation | metadata/object count check |

Preconditions and limits:

- User authorizes any remote rollback/deploy/migration
- Code rollback does not remove Audit data created after deployment
- Destructive table/object deletion is outside this plan and requires separate approval
- Restore drill will be performed on the local per-file checkpoint before implementation

## 16. Spec changelog and deviations

| Revision/date | Change | Reason | Approved by | Evidence affected |
|---|---|---|---|---|
| 1 / 2026-08-08 | Initial spec frozen from 14 confirmed decisions | Gate 2 approved explicitly in chat | Fintrack owner | All |
| 1 evidence / 2026-08-08 | Test states, reviewer closure and Gate 3 risk acceptance recorded; no behavioral contract change | Phase 5/6 evidence update | Fintrack owner | T-01–T-14 |

Deviation log:

| ID | Actual differs from frozen spec | Reason | Approval | Retest |
|---|---|---|---|---|
| none | No behavioral deviation from frozen revision 1 | — | — | — |
