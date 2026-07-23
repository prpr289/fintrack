# Pending Expense Bills — Phase 1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** เพิ่ม 4 อย่างบนฟีเจอร์บิลรอจ่าย (เฟส 1): refund, แท็กมัดจำ/รอของ, เตือนบิลซ้ำ, และ cert แสดงรูปหลักฐาน — additive ทั้งหมด ไม่แตะ `functions/*`.

**Architecture:** ต่อยอดตาราง/endpoints/หน้า `PendingBills` เดิม. refund = สร้าง transaction แบบ `income` (reuse pattern ของ `createTransaction`) โยงกลับบิล. มัดจำ = 2 column ใหม่ + ปุ่ม. บิลซ้ำ = pure helper (มี test). cert รูป = ส่ง tx id ของบิลที่จ่ายแล้วให้ตัวโหลดสลิปเดิม.

**Tech Stack:** Cloudflare Worker (`worker.js`, D1 `env.DB`), React+Vite, tests = `node <f>.test.mjs` (`node:assert`).

## Global Constraints
- **INTEGRATION_POLICY: additive only.** ห้ามแตะ `functions/*`, `requireAuth`, token/secret, หรือ route/handler เดิม (นอกจากเติมฟิลด์แบบ additive). worker.js: ทุก top-level function ใหม่ตามด้วย `__name(fn,"fn");`.
- **Money path:** refund สร้าง `income` tx (+wallet) แบบ atomic; กันคืนซ้ำ (`refund_tx_id` ต้องว่าง); reuse `env.DB.batch`.
- **Migrations:** ไฟล์ SQL ใหม่ apply มือตอน deploy (Task ท้าย, ค้างรอเจ้าของ). DB=`fintrack-db`.
- **Test:** เฉพาะ pure logic ทดสอบด้วย `node ...test.mjs` (ไม่มี `npm test`, ห้าม `node --test`). Handler/React verify ด้วย lint/build + manual.
- UI tokens เดิม: `CARD={background:'#161b2e',border:'1px solid #1f2937'}`, `INPUT`, `INPUT_STYLE`, emerald accent. Error shape `json({error},status)`.
- Base branch: มี Phase 1 ครบแล้ว (HEAD 5b49eea). Spec: `docs/superpowers/specs/2026-07-23-pending-expense-bills-design.md`.

---

### Task 1: Migration — refund + deposit columns

**Files:** Create `migrations/0004_bill_refund_deposit.sql`

- [ ] **Step 1: เขียนไฟล์**
```sql
-- Phase 1.1: refund + deposit(มัดจำ) fields on pending_bills. Additive nullable, SAFE.
-- Apply ONCE (SQLite ADD COLUMN ไม่มี IF NOT EXISTS — ห้ามรันซ้ำ):
--   npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE pending_bills ADD COLUMN refund_tx_id TEXT"
--   npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE pending_bills ADD COLUMN refunded_at TEXT"
--   npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE pending_bills ADD COLUMN is_deposit INTEGER DEFAULT 0"
--   npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE pending_bills ADD COLUMN goods_received_at TEXT"
ALTER TABLE pending_bills ADD COLUMN refund_tx_id TEXT;
ALTER TABLE pending_bills ADD COLUMN refunded_at TEXT;
ALTER TABLE pending_bills ADD COLUMN is_deposit INTEGER DEFAULT 0;
ALTER TABLE pending_bills ADD COLUMN goods_received_at TEXT;
```
- [ ] **Step 2: Commit** — `git commit -am "feat(pending-bills-1.1): migration refund + deposit columns"`

---

### Task 2: Logic — duplicate detection (TDD)

**Files:** Modify `pending-bills-logic.mjs`; Modify `pending-bills-logic.test.mjs`

**Interfaces:** Produces `duplicateIds(bills)` → Set of bill ids that share a dupKey with another bill. Reuses existing `dupKey`.

- [ ] **Step 1: เพิ่ม test (ต่อท้ายก่อน `console.log`)** ใน `pending-bills-logic.test.mjs`:
```js
// --- duplicateIds ---
import { duplicateIds } from './pending-bills-logic.mjs'
const dupBills = [
  { id: 'a', payeeRefId: 'u1', amount: 500, date: '2026-07-23' },
  { id: 'b', payeeRefId: 'u1', amount: 500, date: '2026-07-23' }, // dup of a
  { id: 'c', payeeRefId: 'u1', amount: 500, date: '2026-07-24' }, // different day
  { id: 'd', payeeRefId: 'u2', amount: 500, date: '2026-07-23' }, // different payee
]
const dups = duplicateIds(dupBills)
assert.strictEqual(dups.has('a'), true)
assert.strictEqual(dups.has('b'), true)
assert.strictEqual(dups.has('c'), false)
assert.strictEqual(dups.has('d'), false)
```
(Note: add the `import { duplicateIds }` to the existing import line at top instead of a second import statement — merge names.)

- [ ] **Step 2: รัน → FAIL** `node pending-bills-logic.test.mjs` (duplicateIds not exported)
- [ ] **Step 3: เพิ่ม export ใน `pending-bills-logic.mjs`:**
```js
export function duplicateIds(bills) {
  const byKey = {}
  for (const b of bills) {
    const k = dupKey(b)
    ;(byKey[k] = byKey[k] || []).push(b.id)
  }
  const out = new Set()
  for (const k of Object.keys(byKey)) {
    if (byKey[k].length > 1) byKey[k].forEach(id => out.add(id))
  }
  return out
}
```
- [ ] **Step 4: รัน → PASS** (`pending-bills-logic.test.mjs OK`)
- [ ] **Step 5: Commit** — `git commit -am "feat(pending-bills-1.1): duplicateIds logic + test"`

---

### Task 3: Worker — refund + received endpoints, isDeposit on create, format fields

**Files:** Modify `worker.js` (additive: 2 route guards, 2 handlers, extend `createPendingBill` + `formatPendingBill`)

**Interfaces:** Produces `POST /pending-bills/:id/refund` (admin), `POST /pending-bills/:id/received`; `createPendingBill` accepts `isDeposit`; `formatPendingBill` returns `refundTxId, refundedAt, isDeposit, goodsReceivedAt`.

- [ ] **Step 1: route guards** (in `fetch`, next to the other `/pending-bills/:id/...` guards, before 404):
```js
      if (pbPayMatch && method === "POST") return cors(await payPendingBill(pbPayMatch[1], request, env, user));
      const pbRefundMatch = path.match(/^\/pending-bills\/([a-zA-Z0-9_-]+)\/refund$/);
      if (pbRefundMatch && method === "POST") return cors(await refundPendingBill(pbRefundMatch[1], request, env, user));
      const pbRecvMatch = path.match(/^\/pending-bills\/([a-zA-Z0-9_-]+)\/received$/);
      if (pbRecvMatch && method === "POST") return cors(await markGoodsReceived(pbRecvMatch[1], env, user));
```
(the first line already exists — add the two `const pb...Match` blocks after it.)

- [ ] **Step 2: `createPendingBill`** — accept `isDeposit`: destructure `isDeposit` from body; add `is_deposit` to the INSERT column list + `VALUES` + bind `isDeposit ? 1 : 0`. (Additive — extend the existing INSERT.)

- [ ] **Step 3: `formatPendingBill`** — add before the closing `}`:
```js
    refundTxId: b.refund_tx_id || null,
    refundedAt: b.refunded_at || null,
    isDeposit: !!b.is_deposit,
    goodsReceivedAt: b.goods_received_at || null,
```

- [ ] **Step 4: add handlers** (end of file, each with `__name`):
```js
async function refundPendingBill(id, request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "เฉพาะ Admin" }, 403);
  const b = await env.DB.prepare("SELECT * FROM pending_bills WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!b) return json({ error: "ไม่พบบิล" }, 404);
  if (b.status !== "paid") return json({ error: "คืนได้เฉพาะบิลที่จ่ายแล้ว" }, 400);
  if (b.refund_tx_id) return json({ error: "บิลนี้คืนเงินไปแล้ว" }, 409);
  const body = await request.json().catch(() => ({}));
  const walletId = body.walletId || b.paid_wallet_id;
  const amt = Number(body.amount || b.amount);
  const date = body.date || new Date().toISOString().slice(0, 10);
  if (!walletId || !(amt > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "ข้อมูลคืนเงินไม่ถูกต้อง" }, 400);
  const wallet = await env.DB.prepare("SELECT id FROM wallets WHERE id = ? AND workspace_id = ? AND is_active = 1").bind(walletId, user.workspace_id).first();
  if (!wallet) return json({ error: "ไม่พบกระเป๋า" }, 404);
  const txId = "tx_" + crypto.randomUUID();
  // claim first so a double-click can't create two refunds
  const claim = await env.DB.prepare("UPDATE pending_bills SET refund_tx_id = ?, refunded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ? AND status = 'paid' AND refund_tx_id IS NULL").bind(txId, id, user.workspace_id).run();
  if (!claim.meta || claim.meta.changes !== 1) return json({ error: "บิลนี้คืนเงินไปแล้ว" }, 409);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO transactions (id, workspace_id, created_by_user_id, wallet_id, category_id, sub_category_id, name, amount, type, scope, date, note, submitted_by, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'income', ?, ?, ?, ?, 'manual')").bind(txId, user.workspace_id, user.id, walletId, b.category_id || null, b.sub_category_id || null, "คืนเงิน: " + b.name, amt, b.scope, date, "คืนจากบิล " + id, b.submitted_by_name || null),
      env.DB.prepare("UPDATE wallets SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(amt, walletId)
    ]);
  } catch (e) {
    console.error("refundPendingBill batch failed:", e);
    await env.DB.prepare("UPDATE pending_bills SET refund_tx_id = NULL, refunded_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
    return json({ error: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" }, 500);
  }
  await logAudit(env, user, "refund", "pending_bill", id, { txId, amount: amt });
  await broadcastChange(env, user.workspace_id, { event: "tx.created", txId, walletId, by: user.name });
  return json({ ok: true, txId });
}
__name(refundPendingBill, "refundPendingBill");

async function markGoodsReceived(id, env, user) {
  const b = await env.DB.prepare("SELECT status, is_deposit, submitted_by_user_id FROM pending_bills WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!b) return json({ error: "ไม่พบบิล" }, 404);
  if (user.role !== "admin" && b.submitted_by_user_id !== user.id) return json({ error: "ไม่มีสิทธิ์" }, 403);
  if (!b.is_deposit) return json({ error: "ไม่ใช่บิลมัดจำ" }, 400);
  await env.DB.prepare("UPDATE pending_bills SET goods_received_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  await logAudit(env, user, "goods_received", "pending_bill", id, {});
  return json({ ok: true });
}
__name(markGoodsReceived, "markGoodsReceived");
```
- [ ] **Step 5: verify** `node -c worker.js` + `npm run lint` (0 new errors). Commit — `git commit -am "feat(pending-bills-1.1): refund + goods-received endpoints, isDeposit"`

---

### Task 4: api.js methods

**Files:** Modify `src/api.js`

- [ ] **Step 1: add** (in the `api` object near the other pending-bills methods):
```js
  refundPendingBill: (id, body) => req('POST', `/pending-bills/${id}/refund`, body),
  markGoodsReceived: (id) => req('POST', `/pending-bills/${id}/received`),
```
- [ ] **Step 2:** `npm run build`; Commit — `git commit -am "feat(pending-bills-1.1): api refund + received"`

---

### Task 5: Frontend — refund, deposit tag, duplicate flag

**Files:** Modify `src/pages/PendingBills.jsx`

**Interfaces:** Consumes `api.refundPendingBill`, `api.markGoodsReceived`, `duplicateIds` from `../../pending-bills-logic.mjs`; bill fields `isDeposit`, `goodsReceivedAt`, `refundTxId`, `refundedAt`.

- [ ] **Step 1: SubmitBillModal** — add a "มัดจำ/จ่ายก่อนของมา" checkbox bound to `form.isDeposit` (default false); include `isDeposit: form.isDeposit` in the `createPendingBill` body.

- [ ] **Step 2: PendingBills page** — import `duplicateIds` (merge into existing `../../pending-bills-logic.mjs` import). Compute `const dupSet = duplicateIds(bills.map(b => ({ id: b.id, payeeRefId: b.payeeRefId, payeeName: b.payeeName, amount: b.amount, date: (b.createdAt||'').slice(0,10) })))`. Pass `isDup={dupSet.has(bill.id)}` to each `BillCard`. Add a header count for deposits awaiting goods: `bills.filter(b => b.isDeposit && b.status==='paid' && !b.goodsReceivedAt).length` → show "มัดจำรอของ N" when > 0.

- [ ] **Step 3: BillCard** — additive badges/buttons:
  - if `isDup` → amber chip "อาจซ้ำ".
  - if `bill.isDeposit && bill.status==='paid' && !bill.goodsReceivedAt` → chip "รอของ" + button "ของมาแล้ว" (calls `onReceived(bill)`).
  - if `bill.status==='paid' && !bill.refundTxId` (admin only) → button "คืนเงิน" (calls `onRefund(bill)`).
  - if `bill.refundTxId` → chip "คืนแล้ว".

- [ ] **Step 4: RefundModal** (new, mirror `PayModal`): loads wallets (default to nothing special — user picks; you may pre-select the first), amount input defaulted to `bill.amount`, date default today; on submit calls `api.refundPendingBill(bill.id, { walletId, amount:Number(amount), date })`; onDone→load. Page wires `refundBill` state + `onRefund={setRefundBill}` like `payBill`.

- [ ] **Step 5: received handler** — page-level `const received = async (bill) => { try { await api.markGoodsReceived(bill.id); load() } catch(e){ alert(e.message) } }`, passed as `onReceived`.

- [ ] **Step 6:** `npm run build`; self-review (api names, field names, admin-gating on refund). Commit — `git commit -am "feat(pending-bills-1.1): refund modal, deposit tag+รอของ, บิลซ้ำ flag"`

---

### Task 6: cert voucher shows the evidence photo

**Files:** Modify `src/pages/PendingBills.jsx` (the `openCert` builder), `src/components/VoucherDoc.jsx` (slip-load guard)

- [ ] **Step 1:** In `PendingBills.jsx` `openCert(bill)`: set the voucher payload `id` to `bill.createdTxId` (the paid bill's real transaction id, which owns the evidence slip) instead of the `pb_` bill id. Keep `ty:'cert'` and the other fields.
- [ ] **Step 2:** In `VoucherDoc.jsx`, the slip-loading `useEffect` currently skips when `data.ty === 'cert'` (added in Phase 1 to avoid 404 on a bill id). Now that cert passes a real `tx_` id, change the guard to load slips whenever `data?.id` is present (remove the `data.ty === 'cert'` skip) — a valid tx id will resolve its slips (the evidence). Confirm `id` for the payment/receipt voucher paths is unchanged.
- [ ] **Step 3:** `npm run build`; sanity-check that a paid self_declared bill's cert now renders the attached image. Commit — `git commit -am "feat(pending-bills-1.1): cert แสดงรูปหลักฐาน"`

---

## Deploy (held for owner — same gate as Phase 1)
Apply `migrations/0004_*.sql` (4 ALTERs, one-time) together with Phase 1's migrations; diff worker vs prod; `wrangler deploy` + Pages; verify LINE bot unaffected.

## Notes
- บิลรวมหลายคน (split) = deferred by owner — แนะนำให้แต่ละคนยื่นบิลแยก.
- refund เป็นแบบเต็ม/บางส่วน (amount ปรับได้) แต่ 1 บิลคืนได้ครั้งเดียว (กันซ้ำด้วย `refund_tx_id`).
