# Pending Expense Bills — Phase 1 (Web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** พนักงาน login เว็บส่ง "บิลรอจ่าย" พร้อมหลักฐาน → เจ้าของเห็นคิว ตรวจ แล้วกด "จ่ายแล้ว" ครั้งเดียวเพื่อบันทึกเป็นรายจ่ายจริง โดยไม่แตะโค้ด LINE bot.

**Architecture:** ตารางใหม่ `pending_bills` (แยกจาก `transactions` เพื่อไม่ให้บิลรอจ่ายรั่วเข้ายอด) + endpoints ใหม่ใน `worker.js` (additive) + หน้าเว็บใหม่ `PendingBills.jsx` (role-branched: admin=คิว, staff=บิลของฉัน+ส่งบิล). ตอน "จ่าย" reuse pattern ของ `createTransaction` สร้าง tx จริง + ตัดยอด + ผูกสลิป. Logic ที่เป็นกฎเงิน (validate/cap/weak/ratio) แยกเป็น `pending-bills-logic.mjs` แบบ dependency-free แล้วเทสต์ด้วย `node:assert` ตามธรรมเนียม repo.

**Tech Stack:** Cloudflare Worker (`worker.js`, D1 `env.DB`, R2 `env.SLIPS`), React 18 + Vite + react-router + Tailwind v4 + lucide-react, tests = `node <file>.test.mjs` (`node:assert`, no runner).

## Global Constraints

- **INTEGRATION_POLICY (บังคับ):** ห้ามแตะ `functions/*`, `SERVICE_TOKEN`, `SERVICE_USER_ID`, `FINTRACK_TOKEN`, LINE tokens และ route/auth เดิมของ worker. เพิ่มเฉพาะ route/table/column ใหม่ (additive).
- **worker.js เป็น hand-maintained + bundled** — ทุก top-level function ต้องตามด้วย `__name(fn, "fn");`. ก่อน deploy **diff กับ prod (หรือ `fintrack-worker-deployed.js`) ก่อน** กัน deploy repo เก่าทับ.
- **D1 migrations ไม่มี runner** — สร้างไฟล์ `migrations/000N_*.sql` + header ที่ระบุคำสั่ง `npx wrangler d1 execute fintrack-db --remote --command "..."` แล้วรันมือครั้งเดียว. DB name = `fintrack-db`.
- **Test convention:** ไม่มี `npm test`. เทสต์เฉพาะ pure logic ใน `.mjs` (import จาก worker ด้วย ได้) รันด้วย `node path/x.test.mjs`. **ห้าม** ใช้ `node --test`. Handler/React ไม่มี unit test ใน repo นี้ → ใช้ manual verification.
- **NO_BILL_CAP = 1000** (hardcode ใน logic module).
- **Evidence tiers:** `slip_transfer` | `receipt` (แข็ง) | `self_declared` (อ่อน, ตลาดสดไม่มีบิล). ทุก tier บังคับแนบรูปก่อน pay. `self_declared` เพิ่มเงื่อนไข `amount ≤ NO_BILL_CAP`.
- **UI tokens (match ของเดิม):** `const CARD = { background: '#161b2e', border: '1px solid #1f2937' }` · `const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'` · `const INPUT_STYLE = { background: '#0d1120' }` · accent = emerald-600/500. Error response shape ทุกที่ = `json({ error: "..." }, status)`.
- Spec อ้างอิง: `docs/superpowers/specs/2026-07-23-pending-expense-bills-design.md`.

---

### Task 1: D1 migrations (ตาราง + คอลัมน์บัญชี)

**Files:**
- Create: `migrations/0002_pending_bills.sql`
- Create: `migrations/0003_payout_accounts.sql`

**Interfaces:**
- Produces: table `pending_bills`, คอลัมน์ `users.bank_name/bank_account_no/bank_account_name`, `vendor_profiles.bank_name/bank_account_no` — ใช้โดย Task 3/4.

- [ ] **Step 1: เขียนไฟล์ migration ตาราง**

`migrations/0002_pending_bills.sql`:
```sql
-- Pending expense bills (บิลรายจ่ายรอชำระ) — Phase 1.
-- แยกจาก transactions โดยตั้งใจ: บิลรอจ่ายไม่ใช่ transaction จนกว่าจะ "จ่าย"
-- จึงรั่วเข้ายอดรวม/ยอดกระเป๋าไม่ได้. SAFE ก่อน deploy worker (ตารางใหม่ล้วน).
-- Apply ONCE against live D1:
--   npx wrangler d1 execute fintrack-db --remote --file migrations/0002_pending_bills.sql
CREATE TABLE IF NOT EXISTS pending_bills (
  id                   TEXT PRIMARY KEY,
  workspace_id         TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',
  source               TEXT NOT NULL DEFAULT 'web',
  submitted_by_user_id TEXT,
  submitted_by_name    TEXT,
  name                 TEXT NOT NULL,
  amount               REAL NOT NULL,
  category_id          TEXT,
  sub_category_id      TEXT,
  scope                TEXT NOT NULL DEFAULT 'business',
  note                 TEXT,
  payee_type           TEXT NOT NULL DEFAULT 'employee',
  payee_ref_id         TEXT,
  payee_name           TEXT,
  payee_bank           TEXT,
  payee_account_no     TEXT,
  evidence_type        TEXT NOT NULL,
  evidence_key         TEXT,
  evidence_mime        TEXT,
  evidence_ocr         TEXT,
  reject_reason        TEXT,
  created_tx_id        TEXT,
  paid_wallet_id       TEXT,
  paid_by_user_id      TEXT,
  paid_at              TEXT,
  created_at           TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at           TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pb_ws_status ON pending_bills(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_pb_ws_submitter ON pending_bills(workspace_id, submitted_by_user_id);
```

- [ ] **Step 2: เขียนไฟล์ migration คอลัมน์บัญชีปลายทาง**

`migrations/0003_payout_accounts.sql`:
```sql
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
```

- [ ] **Step 3: Commit** (ยังไม่ apply — apply จริงทำใน Task 10 ตอน deploy)

```bash
git add migrations/0002_pending_bills.sql migrations/0003_payout_accounts.sql
git commit -m "feat(pending-bills): D1 migrations สำหรับ pending_bills + payout accounts"
```

---

### Task 2: Pure logic module + tests (TDD)

**Files:**
- Create: `pending-bills-logic.mjs` (repo root — เหมือน `notif-due.mjs`)
- Test: `pending-bills-logic.test.mjs`

**Interfaces:**
- Produces: `NO_BILL_CAP`, `EVIDENCE_TYPES`, `validateBillInput(input)`, `checkNoBillCap(evidenceType, amount, cap?)`, `isWeakEvidence(evidenceType)`, `dupKey(bill)`, `weakRatioByUser(bills)` — ใช้โดย worker handlers (Task 3) และหน้าเว็บ (Task 6, import ผ่าน api ไม่ได้ — frontend re-implement `isWeakEvidence`/ratio ตามต้องการ หรือ import ตรงจาก `../pending-bills-logic.mjs`).

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

`pending-bills-logic.test.mjs`:
```js
// Run: node pending-bills-logic.test.mjs
import assert from 'node:assert'
import {
  NO_BILL_CAP, validateBillInput, checkNoBillCap, isWeakEvidence, dupKey, weakRatioByUser,
} from './pending-bills-logic.mjs'

// --- validateBillInput ---
assert.deepStrictEqual(
  validateBillInput({ name: 'ค่าวัตถุดิบ', amount: 850, scope: 'business', payeeType: 'employee', evidenceType: 'self_declared' }),
  { ok: true })
assert.strictEqual(validateBillInput({ name: '', amount: 850, scope: 'business', payeeType: 'employee', evidenceType: 'receipt' }).ok, false)
assert.strictEqual(validateBillInput({ name: 'x', amount: 0, scope: 'business', payeeType: 'employee', evidenceType: 'receipt' }).ok, false)
assert.strictEqual(validateBillInput({ name: 'x', amount: 10, scope: 'business', payeeType: 'employee', evidenceType: 'nope' }).ok, false)
assert.strictEqual(validateBillInput({ name: 'x', amount: 10, scope: 'weird', payeeType: 'employee', evidenceType: 'receipt' }).ok, false)
assert.strictEqual(validateBillInput({ name: 'x', amount: 10, scope: 'business', payeeType: 'ufo', evidenceType: 'receipt' }).ok, false)

// --- checkNoBillCap ---
assert.strictEqual(checkNoBillCap('self_declared', 850).ok, true)
assert.strictEqual(checkNoBillCap('self_declared', 1200).ok, false)
assert.strictEqual(checkNoBillCap('self_declared', 1000).ok, true)      // ≤ cap ผ่าน
assert.strictEqual(checkNoBillCap('slip_transfer', 5000).ok, true)      // cap เฉพาะ self_declared
assert.strictEqual(NO_BILL_CAP, 1000)

// --- isWeakEvidence ---
assert.strictEqual(isWeakEvidence('self_declared'), true)
assert.strictEqual(isWeakEvidence('slip_transfer'), false)
assert.strictEqual(isWeakEvidence('receipt'), false)

// --- dupKey ---
assert.strictEqual(dupKey({ payeeRefId: 'u1', amount: 850, date: '2026-07-23' }), 'u1|850|2026-07-23')
assert.strictEqual(dupKey({ payeeRefId: null, payeeName: 'ตลาด', amount: 50, date: '2026-07-23' }), 'ตลาด|50|2026-07-23')

// --- weakRatioByUser ---  (weakAmount / totalAmount * 100, ปัดจำนวนเต็ม)
const bills = [
  { submittedByUserId: 'u1', amount: 900, evidenceType: 'self_declared' },
  { submittedByUserId: 'u1', amount: 100, evidenceType: 'receipt' },
  { submittedByUserId: 'u2', amount: 200, evidenceType: 'slip_transfer' },
]
assert.deepStrictEqual(weakRatioByUser(bills), { u1: 90, u2: 0 })

console.log('pending-bills-logic.test.mjs OK')
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `node pending-bills-logic.test.mjs`
Expected: FAIL — `Cannot find module './pending-bills-logic.mjs'`

- [ ] **Step 3: เขียน module ให้ test ผ่าน**

`pending-bills-logic.mjs`:
```js
// Pure business rules for pending expense bills — dependency-free.
// Shared by worker.js (wrangler bundles the relative import) and the test.
// ponytail: keep the money/rules logic here so it has one runnable check.
export const NO_BILL_CAP = 1000
export const EVIDENCE_TYPES = ['slip_transfer', 'receipt', 'self_declared']
const PAYEE_TYPES = ['employee', 'vendor', 'other']
const SCOPES = ['business', 'personal']

export function validateBillInput(input) {
  const { name, amount, scope, payeeType, evidenceType } = input || {}
  if (!name || !String(name).trim()) return { ok: false, error: 'ต้องมีชื่อรายการ' }
  if (!(Number(amount) > 0)) return { ok: false, error: 'จำนวนเงินต้องมากกว่า 0' }
  if (!SCOPES.includes(scope)) return { ok: false, error: 'scope ไม่ถูกต้อง' }
  if (!PAYEE_TYPES.includes(payeeType)) return { ok: false, error: 'ปลายทางไม่ถูกต้อง' }
  if (!EVIDENCE_TYPES.includes(evidenceType)) return { ok: false, error: 'ประเภทหลักฐานไม่ถูกต้อง' }
  return { ok: true }
}

export function checkNoBillCap(evidenceType, amount, cap = NO_BILL_CAP) {
  if (evidenceType === 'self_declared' && Number(amount) > cap) {
    return { ok: false, error: `เกินเพดานบิลไม่มีบิล (฿${cap}) ต้องจ่ายแบบโอน` }
  }
  return { ok: true }
}

export function isWeakEvidence(evidenceType) {
  return evidenceType === 'self_declared'
}

export function dupKey(bill) {
  const payee = bill.payeeRefId || bill.payeeName || ''
  return `${payee}|${bill.amount}|${bill.date}`
}

export function weakRatioByUser(bills) {
  const acc = {}
  for (const b of bills) {
    const u = b.submittedByUserId
    if (!acc[u]) acc[u] = { weak: 0, total: 0 }
    acc[u].total += Number(b.amount)
    if (isWeakEvidence(b.evidenceType)) acc[u].weak += Number(b.amount)
  }
  const out = {}
  for (const u of Object.keys(acc)) {
    out[u] = acc[u].total > 0 ? Math.round((acc[u].weak / acc[u].total) * 100) : 0
  }
  return out
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `node pending-bills-logic.test.mjs`
Expected: PASS — `pending-bills-logic.test.mjs OK`

- [ ] **Step 5: Commit**

```bash
git add pending-bills-logic.mjs pending-bills-logic.test.mjs
git commit -m "feat(pending-bills): pure rules module + tests (validate/cap/weak/ratio)"
```

---

### Task 3: Backend endpoints (worker.js — additive)

**Files:**
- Modify: `worker.js` (เพิ่ม import บนสุด, เพิ่ม route guards ในบล็อก `fetch` หลังบล็อก `/transactions` ~line 48, เพิ่ม handler functions + `formatPendingBill` ท้ายไฟล์ก่อน helpers)

**Interfaces:**
- Consumes: `validateBillInput`, `checkNoBillCap` จาก `./pending-bills-logic.mjs`; helpers เดิม `json`, `requireRole`, `logAudit`, `fetchTxFull`, `env.DB`, `env.SLIPS`.
- Produces: endpoints `POST/GET /pending-bills`, `GET/DELETE /pending-bills/:id`, `POST/GET /pending-bills/:id/evidence`, `POST /pending-bills/:id/pay`, `POST /pending-bills/:id/reject`; JSON shape จาก `formatPendingBill` (camelCase) — ใช้โดย api.js (Task 5) และหน้าเว็บ (Task 6).

- [ ] **Step 1: เพิ่ม import logic module** (บนสุดของ `worker.js` ต่อจาก import `notif-due.mjs` บรรทัด 1)

```js
import { validateBillInput, checkNoBillCap } from "./pending-bills-logic.mjs";
```

- [ ] **Step 2: เพิ่ม route guards** (ในเมธอด `fetch` หลังบล็อก `/transactions` เดิม เช่นหลังบรรทัด ~48 และ **ต้องอยู่เหนือ** `return cors(json({ error: "Not found" }, 404));`)

```js
      if (path === "/pending-bills" && method === "POST") return cors(await createPendingBill(request, env, user));
      if (path === "/pending-bills" && method === "GET") return cors(await listPendingBills(request, env, user));
      const pbMatch = path.match(/^\/pending-bills\/([a-zA-Z0-9_-]+)$/);
      if (pbMatch && method === "GET") return cors(await getPendingBill(pbMatch[1], env, user));
      if (pbMatch && method === "DELETE") return cors(await deletePendingBill(pbMatch[1], env, user));
      const pbEvMatch = path.match(/^\/pending-bills\/([a-zA-Z0-9_-]+)\/evidence$/);
      if (pbEvMatch && method === "POST") return cors(await uploadBillEvidence(pbEvMatch[1], request, env, user));
      if (pbEvMatch && method === "GET") return cors(await getBillEvidence(pbEvMatch[1], env, user));
      const pbPayMatch = path.match(/^\/pending-bills\/([a-zA-Z0-9_-]+)\/pay$/);
      if (pbPayMatch && method === "POST") return cors(await payPendingBill(pbPayMatch[1], request, env, user));
      const pbRejMatch = path.match(/^\/pending-bills\/([a-zA-Z0-9_-]+)\/reject$/);
      if (pbRejMatch && method === "POST") return cors(await rejectPendingBill(pbRejMatch[1], request, env, user));
```

- [ ] **Step 3: เพิ่ม `formatPendingBill` + handlers** (ท้ายไฟล์ ก่อนบล็อก helper `json`/`cors`; ทุกฟังก์ชันตามด้วย `__name(...)`)

```js
function formatPendingBill(b) {
  if (!b) return null;
  return {
    id: b.id,
    workspaceId: b.workspace_id,
    status: b.status,
    source: b.source,
    submittedByUserId: b.submitted_by_user_id || null,
    submittedByName: b.submitted_by_name || null,
    name: b.name,
    amount: Number(b.amount),
    categoryId: b.category_id || null,
    categoryName: b.category_name || null,
    subCategoryId: b.sub_category_id || null,
    scope: b.scope,
    note: b.note || null,
    payeeType: b.payee_type,
    payeeRefId: b.payee_ref_id || null,
    payeeName: b.payee_name || null,
    payeeBank: b.payee_bank || null,
    payeeAccountNo: b.payee_account_no || null,
    evidenceType: b.evidence_type,
    hasEvidence: !!b.evidence_key,
    rejectReason: b.reject_reason || null,
    createdTxId: b.created_tx_id || null,
    paidAt: b.paid_at || null,
    createdAt: b.created_at,
    updatedAt: b.updated_at
  };
}
__name(formatPendingBill, "formatPendingBill");

async function snapshotPayee(env, workspaceId, payeeType, payeeRefId) {
  // freeze ชื่อ+บัญชีปลายทางลงบิล ณ ตอนส่ง
  if (payeeType === "employee" && payeeRefId) {
    const u = await env.DB.prepare("SELECT name, bank_name, bank_account_no FROM users WHERE id = ? AND workspace_id = ?").bind(payeeRefId, workspaceId).first();
    if (u) return { name: u.name || null, bank: u.bank_name || null, acc: u.bank_account_no || null };
  }
  if (payeeType === "vendor" && payeeRefId) {
    const v = await env.DB.prepare("SELECT vendor_name, bank_name, bank_account_no FROM vendor_profiles WHERE id = ? AND workspace_id = ?").bind(payeeRefId, workspaceId).first();
    if (v) return { name: v.vendor_name || null, bank: v.bank_name || null, acc: v.bank_account_no || null };
  }
  return { name: null, bank: null, acc: null };
}
__name(snapshotPayee, "snapshotPayee");

async function createPendingBill(request, env, user) {
  if (!requireRole(user, "admin", "staff")) return json({ error: "ไม่มีสิทธิ์" }, 403);
  const body = await request.json();
  const { name, amount, scope, note, categoryId, subCategoryId, payeeType, payeeRefId, payeeName, evidenceType } = body;
  const v = validateBillInput({ name, amount, scope, payeeType, evidenceType });
  if (!v.ok) return json({ error: v.error }, 400);
  const cap = checkNoBillCap(evidenceType, amount);
  if (!cap.ok) return json({ error: cap.error }, 400);
  const snap = await snapshotPayee(env, user.workspace_id, payeeType, payeeRefId);
  const id = "pb_" + crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO pending_bills (id, workspace_id, status, source, submitted_by_user_id, submitted_by_name, name, amount, category_id, sub_category_id, scope, note, payee_type, payee_ref_id, payee_name, payee_bank, payee_account_no, evidence_type) VALUES (?, ?, 'pending', 'web', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, user.workspace_id, user.id, user.name || null, name, Number(amount), categoryId || null, subCategoryId || null, scope, note || null, payeeType, payeeRefId || null, payeeName || snap.name, snap.bank, snap.acc, evidenceType).run();
  await logAudit(env, user, "create", "pending_bill", id, { name, amount: Number(amount) });
  const b = await env.DB.prepare("SELECT pb.*, c.name AS category_name FROM pending_bills pb LEFT JOIN categories c ON pb.category_id = c.id WHERE pb.id = ?").bind(id).first();
  return json({ bill: formatPendingBill(b) }, 201);
}
__name(createPendingBill, "createPendingBill");

async function listPendingBills(request, env, user) {
  if (!requireRole(user, "admin", "staff")) return json({ error: "ไม่มีสิทธิ์" }, 403);
  const status = new URL(request.url).searchParams.get("status");
  const clauses = ["pb.workspace_id = ?"];
  const args = [user.workspace_id];
  if (status) { clauses.push("pb.status = ?"); args.push(status); }
  if (user.role !== "admin") { clauses.push("pb.submitted_by_user_id = ?"); args.push(user.id); }
  const rows = await env.DB.prepare(
    `SELECT pb.*, c.name AS category_name FROM pending_bills pb LEFT JOIN categories c ON pb.category_id = c.id WHERE ${clauses.join(" AND ")} ORDER BY pb.created_at ASC`
  ).bind(...args).all();
  return json({ bills: (rows.results || []).map(formatPendingBill) });
}
__name(listPendingBills, "listPendingBills");

async function getPendingBill(id, env, user) {
  const b = await env.DB.prepare("SELECT pb.*, c.name AS category_name FROM pending_bills pb LEFT JOIN categories c ON pb.category_id = c.id WHERE pb.id = ? AND pb.workspace_id = ?").bind(id, user.workspace_id).first();
  if (!b) return json({ error: "ไม่พบบิล" }, 404);
  if (user.role !== "admin" && b.submitted_by_user_id !== user.id) return json({ error: "ไม่มีสิทธิ์" }, 403);
  return json({ bill: formatPendingBill(b) });
}
__name(getPendingBill, "getPendingBill");

async function uploadBillEvidence(billId, request, env, user) {
  const b = await env.DB.prepare("SELECT id, submitted_by_user_id FROM pending_bills WHERE id = ? AND workspace_id = ?").bind(billId, user.workspace_id).first();
  if (!b) return json({ error: "ไม่พบบิล" }, 404);
  if (user.role !== "admin" && b.submitted_by_user_id !== user.id) return json({ error: "ไม่มีสิทธิ์" }, 403);
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.startsWith("image/") && contentType !== "application/pdf") return json({ error: "Only images and PDF allowed" }, 400);
  const slipId = "s_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const fileKey = `${user.workspace_id}/bills/${billId}/${slipId}`;
  const bodyBuf = await request.arrayBuffer();
  if (bodyBuf.byteLength > 10 * 1024 * 1024) return json({ error: "File too large (max 10MB)" }, 400);
  await env.SLIPS.put(fileKey, bodyBuf, { httpMetadata: { contentType }, customMetadata: { workspaceId: user.workspace_id, billId } });
  await env.DB.prepare("UPDATE pending_bills SET evidence_key = ?, evidence_mime = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(fileKey, contentType, billId).run();
  return json({ ok: true }, 201);
}
__name(uploadBillEvidence, "uploadBillEvidence");

async function getBillEvidence(id, env, user) {
  const b = await env.DB.prepare("SELECT evidence_key, evidence_mime, submitted_by_user_id FROM pending_bills WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!b || !b.evidence_key) return json({ error: "ไม่พบหลักฐาน" }, 404);
  if (user.role !== "admin" && b.submitted_by_user_id !== user.id) return json({ error: "ไม่มีสิทธิ์" }, 403);
  const obj = await env.SLIPS.get(b.evidence_key);
  if (!obj) return json({ error: "not found" }, 404);
  return new Response(obj.body, { headers: { "Content-Type": b.evidence_mime || "application/octet-stream" } });
}
__name(getBillEvidence, "getBillEvidence");

async function payPendingBill(id, request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "เฉพาะ Admin" }, 403);
  const b = await env.DB.prepare("SELECT * FROM pending_bills WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!b) return json({ error: "ไม่พบบิล" }, 404);
  if (b.status !== "pending") return json({ error: "บิลนี้ถูกดำเนินการไปแล้ว" }, 409);
  if (!b.evidence_key) return json({ error: "ต้องแนบหลักฐานก่อน" }, 400);
  const body = await request.json().catch(() => ({}));
  const { walletId, date } = body;
  if (!walletId || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return json({ error: "ต้องระบุกระเป๋าและวันที่" }, 400);
  const wallet = await env.DB.prepare("SELECT * FROM wallets WHERE id = ? AND workspace_id = ? AND is_active = 1").bind(walletId, user.workspace_id).first();
  if (!wallet) return json({ error: "ไม่พบกระเป๋า" }, 404);
  const txId = "tx_" + crypto.randomUUID();
  const amt = Number(b.amount);
  const slipId = "s_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const slipType = b.evidence_type === "slip_transfer" ? "transfer" : (b.evidence_type === "receipt" ? "receipt" : "other");
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO transactions (id, workspace_id, created_by_user_id, wallet_id, category_id, sub_category_id, name, amount, type, scope, date, note, submitted_by, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'expense', ?, ?, ?, ?, 'manual')"
    ).bind(txId, user.workspace_id, user.id, walletId, b.category_id || null, b.sub_category_id || null, b.name, amt, b.scope, date, b.note || null, b.submitted_by_name || null),
    env.DB.prepare("UPDATE wallets SET current_balance = current_balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(amt, walletId),
    env.DB.prepare(
      "INSERT INTO slips (id, workspace_id, transaction_id, file_key, file_name, file_size, mime_type, slip_type, ocr_text, ocr_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(slipId, user.workspace_id, txId, b.evidence_key, "bill_" + id, 0, b.evidence_mime || "image/jpeg", slipType, null, b.evidence_ocr || null),
    env.DB.prepare("UPDATE pending_bills SET status = 'paid', created_tx_id = ?, paid_wallet_id = ?, paid_by_user_id = ?, paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(txId, walletId, user.id, id)
  ]);
  await logAudit(env, user, "pay", "pending_bill", id, { txId, amount: amt });
  const tx = await fetchTxFull(env, txId);
  return json({ ok: true, transaction: formatTransaction(tx), txId });
}
__name(payPendingBill, "payPendingBill");

async function rejectPendingBill(id, request, env, user) {
  if (!requireRole(user, "admin")) return json({ error: "เฉพาะ Admin" }, 403);
  const b = await env.DB.prepare("SELECT status FROM pending_bills WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!b) return json({ error: "ไม่พบบิล" }, 404);
  if (b.status !== "pending") return json({ error: "บิลนี้ถูกดำเนินการไปแล้ว" }, 409);
  const { reason } = await request.json().catch(() => ({}));
  await env.DB.prepare("UPDATE pending_bills SET status = 'rejected', reject_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(reason || null, id).run();
  await logAudit(env, user, "reject", "pending_bill", id, { reason: reason || null });
  return json({ ok: true });
}
__name(rejectPendingBill, "rejectPendingBill");

async function deletePendingBill(id, env, user) {
  const b = await env.DB.prepare("SELECT status, submitted_by_user_id, evidence_key FROM pending_bills WHERE id = ? AND workspace_id = ?").bind(id, user.workspace_id).first();
  if (!b) return json({ error: "ไม่พบบิล" }, 404);
  if (user.role !== "admin" && b.submitted_by_user_id !== user.id) return json({ error: "ไม่มีสิทธิ์" }, 403);
  if (b.status !== "pending") return json({ error: "ลบได้เฉพาะบิลที่ยังรอจ่าย" }, 400);
  if (b.evidence_key) { try { await env.SLIPS.delete(b.evidence_key); } catch (e) {} }
  await env.DB.prepare("DELETE FROM pending_bills WHERE id = ?").bind(id).run();
  await logAudit(env, user, "delete", "pending_bill", id, {});
  return json({ ok: true });
}
__name(deletePendingBill, "deletePendingBill");
```

- [ ] **Step 4: Lint + manual smoke** (ไม่มี unit test สำหรับ handler ตามธรรมเนียม repo)

Run: `npm run lint`
Expected: ไม่มี error ใหม่จากบล็อกที่เพิ่ม. (integration verify จริงทำ Task 10 หลัง deploy dev worker.)

- [ ] **Step 5: Commit**

```bash
git add worker.js
git commit -m "feat(pending-bills): worker endpoints (create/list/get/evidence/pay/reject/delete)"
```

---

### Task 4: Backend — รับฟิลด์บัญชีปลายทาง (additive)

**Files:**
- Modify: `worker.js` — handler `handleUpdateMe` (PATCH `/me`), `updateUser` (PATCH `/users/:id`), และ vendor update handler

**Interfaces:**
- Consumes: columns จาก Task 1.
- Produces: `/me`, `/users/:id`, vendor update รับ `bankName`, `bankAccountNo`, `bankAccountName` (users) / `bankName`, `bankAccountNo` (vendor) — ใช้โดย Task 8.

- [ ] **Step 1: อ่าน handler เดิม** ของ `handleUpdateMe`, `updateUser`, vendor update ใน `worker.js` (grep `"/me"`, `updateUser`, `updateVendor`/`vendor-profiles`) เพื่อดู UPDATE statement เดิม

- [ ] **Step 2: เพิ่มฟิลด์แบบ additive** — ในแต่ละ handler destructure ฟิลด์ใหม่จาก body แล้วต่อ SET clause. ตัวอย่างรูปแบบ (ปรับชื่อ variable/where ให้ตรงของเดิม):

`handleUpdateMe` — เพิ่มใน SET (users):
```js
// destructure เพิ่ม: const { bankName, bankAccountNo, bankAccountName } = body;
// ต่อท้าย SET เดิม (คั่นด้วย comma) แล้ว bind เรียงตามลำดับ:
//   bank_name = ?, bank_account_no = ?, bank_account_name = ?
//   .bind(..., bankName ?? null, bankAccountNo ?? null, bankAccountName ?? null, ...)
```
`updateUser` — เหมือนกัน (users). Vendor update — เพิ่ม `bank_name = ?, bank_account_no = ?` (vendor_profiles) โดย bind `bankName ?? null, bankAccountNo ?? null`.

ให้ include คอลัมน์ใหม่ใน SELECT/format ของ `/me` และ vendor/users list ด้วย (camelCase: `bankName`, `bankAccountNo`, `bankAccountName`) เพื่อ prefill ในฟอร์ม.

- [ ] **Step 3: Lint** — `npm run lint` (ไม่มี error ใหม่)

- [ ] **Step 4: Commit**

```bash
git add worker.js
git commit -m "feat(pending-bills): รับ/คืนฟิลด์บัญชีปลายทางบน users + vendor (additive)"
```

---

### Task 5: Frontend API methods

**Files:**
- Modify: `src/api.js` (เพิ่ม property ในออบเจกต์ `api`)

**Interfaces:**
- Produces: `api.pendingBills(params)`, `api.createPendingBill(body)`, `api.getPendingBill(id)`, `api.deletePendingBill(id)`, `api.payPendingBill(id, body)`, `api.rejectPendingBill(id, body)`, `api.uploadBillEvidence(billId, file)`, `api.billEvidenceUrl(id)` — ใช้โดย Task 6.

- [ ] **Step 1: เพิ่ม methods** (วางในบล็อก object `api` ต่อจากกลุ่ม slips/transactions)

```js
  pendingBills: (params) => req('GET', '/pending-bills?' + new URLSearchParams(params || {})),
  createPendingBill: (body) => req('POST', '/pending-bills', body),
  getPendingBill: (id) => req('GET', `/pending-bills/${id}`),
  deletePendingBill: (id) => req('DELETE', `/pending-bills/${id}`),
  payPendingBill: (id, body) => req('POST', `/pending-bills/${id}/pay`, body),
  rejectPendingBill: (id, body) => req('POST', `/pending-bills/${id}/reject`, body),
  billEvidenceUrl: (id) => `${BASE}/pending-bills/${id}/evidence`,
  uploadBillEvidence: (billId, file) => {
    const t = token()
    const headers = {}
    if (t) headers['Authorization'] = `Bearer ${t}`
    headers['Content-Type'] = file.type
    const params = new URLSearchParams({ name: file.name })
    return fetch(`${BASE}/pending-bills/${billId}/evidence?${params}`, { method: 'POST', headers, body: file })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'อัพโหลดไม่สำเร็จ'); return d })
  },
```
Note: `BASE` และ `token()` เป็นตัวที่มีอยู่แล้วบนสุดไฟล์. `billEvidenceUrl` คืน URL ตรงๆ (ใช้ fetch พร้อม auth header เวลาจะดูรูป — ดู Task 6). ถ้า evidence เป็น image การเปิดรูปต้องแนบ token → ใช้ `fetchSlipBlob`-style helper; เพิ่ม:
```js
  fetchBillEvidenceBlob: async (id) => {
    const t = token()
    const r = await fetch(`${BASE}/pending-bills/${id}/evidence`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
    if (!r.ok) throw new Error('โหลดรูปไม่สำเร็จ')
    return URL.createObjectURL(await r.blob())
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/api.js
git commit -m "feat(pending-bills): api.js methods สำหรับบิลรอจ่าย"
```

---

### Task 6: Frontend page `PendingBills.jsx` (คิวแอดมิน + บิลของฉัน + ส่งบิล)

**Files:**
- Create: `src/pages/PendingBills.jsx`

**Interfaces:**
- Consumes: `api.*` (Task 5), `useAuth()` → `{ user }` (`user.role`, `user.id`), lucide-react icons, `isWeakEvidence`/`weakRatioByUser` จาก `../../pending-bills-logic.mjs`.
- Produces: default export `<PendingBills />` — ใช้โดย Task 7.

- [ ] **Step 1: สร้างหน้า** (role-branch: `admin` = คิว+จ่าย/ปฏิเสธ · `staff` = บิลของฉัน+ปุ่มส่งบิล). โครง modal/สไตล์ mirror `QuickAdd.jsx` + `ConfirmDraftModal`.

`src/pages/PendingBills.jsx`:
```jsx
import { useState, useEffect } from 'react'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { Plus, X, Receipt, AlertTriangle } from 'lucide-react'
import { isWeakEvidence, weakRatioByUser } from '../../pending-bills-logic.mjs'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }
const thb = (n) => '฿' + Number(n || 0).toLocaleString('th-TH')

const EVIDENCE_TIERS = [
  ['slip_transfer', 'โอน / PromptPay', 'แข็ง'],
  ['receipt', 'เงินสด + ใบเสร็จ', 'แข็ง'],
  ['self_declared', 'เงินสด ตลาดสด (ไม่มีบิล)', 'อ่อน'],
]

function Overlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="w-full sm:max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
        style={{ background: '#161b2e', border: '1px solid #2e3349' }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function SubmitBillModal({ me, onClose, onDone }) {
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState({ name: '', amount: '', scope: 'business', categoryId: '', note: '', payeeType: 'employee', evidenceType: 'slip_transfer' })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { api.categories().then(d => setCategories(d.categories || d || [])).catch(() => {}) }, [])
  const weak = isWeakEvidence(form.evidenceType)
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (!file) { setErr('ต้องแนบรูปหลักฐาน'); return }
    setSaving(true)
    try {
      const body = { name: form.name, amount: Number(form.amount), scope: form.scope, note: form.note || undefined,
        categoryId: form.categoryId || undefined, payeeType: form.payeeType,
        payeeRefId: form.payeeType === 'employee' ? me.id : undefined, evidenceType: form.evidenceType }
      const res = await api.createPendingBill(body)
      await api.uploadBillEvidence(res.bill.id, file)
      onDone(); onClose()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="font-semibold text-slate-100">แจ้งบิลรอจ่าย</h3>
        <button onClick={onClose} aria-label="ปิด"><X className="w-5 h-5 text-slate-400" /></button>
      </div>
      <form onSubmit={submit} className="p-4 space-y-3 overflow-y-auto">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">ชื่อรายการ</label>
          <input className={INPUT} style={INPUT_STYLE} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">จำนวนเงิน</label>
            <input className={INPUT} style={INPUT_STYLE} type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">ขอบเขต</label>
            <select className={INPUT} style={INPUT_STYLE} value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}>
              <option value="business">ธุรกิจ</option><option value="personal">ส่วนตัว</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">หมวดหมู่</label>
          <select className={INPUT} style={INPUT_STYLE} value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">— ไม่ระบุ —</option>
            {categories.filter(c => !c.parentId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">จ่ายด้วยวิธีไหน</label>
          <div className="space-y-2">
            {EVIDENCE_TIERS.map(([v, label, strength]) => (
              <button type="button" key={v} onClick={() => setForm({ ...form, evidenceType: v })}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm border transition-colors"
                style={{ borderColor: form.evidenceType === v ? '#10b981' : '#2e3349', color: '#e2e8f0', background: form.evidenceType === v ? '#10b98115' : 'transparent' }}>
                <span>{label}</span>
                <span className="text-xs" style={{ color: strength === 'อ่อน' ? '#f59e0b' : '#34d399' }}>หลักฐาน{strength}</span>
              </button>
            ))}
          </div>
          {weak && <p className="text-xs text-amber-400 mt-2">ตลาดสดไม่มีบิล: บังคับแนบรูปของ · ยอดเกิน ฿1,000 ต้องจ่ายแบบโอน · ระบบจะออกใบรับรองแทนใบเสร็จให้</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">แนบรูปหลักฐาน{weak ? ' (รูปของ)' : ''}</label>
          <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)}
            className="block w-full text-xs text-slate-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">หมายเหตุ</label>
          <input className={INPUT} style={INPUT_STYLE} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
        </div>
        {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
        <button type="submit" disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors">
          {saving ? 'กำลังส่ง...' : 'ส่งบิลรอจ่าย'}
        </button>
      </form>
    </Overlay>
  )
}

function PayModal({ bill, onClose, onDone }) {
  const [wallets, setWallets] = useState([])
  const [walletId, setWalletId] = useState('')
  const [date, setDate] = useState(new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { api.wallets().then(d => { const ws = d.wallets || d || []; setWallets(ws); if (ws[0]) setWalletId(ws[0].id) }).catch(() => {}) }, [])
  const pay = async (e) => {
    e.preventDefault(); setSaving(true); setErr('')
    try { await api.payPendingBill(bill.id, { walletId, date }); onDone(); onClose() }
    catch (e) { setErr(e.message) } finally { setSaving(false) }
  }
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="font-semibold text-slate-100">ยืนยันจ่ายแล้ว · {thb(bill.amount)}</h3>
        <button onClick={onClose} aria-label="ปิด"><X className="w-5 h-5 text-slate-400" /></button>
      </div>
      <form onSubmit={pay} className="p-4 space-y-3">
        <p className="text-xs text-slate-400">บันทึกเป็นรายจ่าย {thb(bill.amount)} เข้าเล่มบัญชี — จะตัดยอดกระเป๋าที่เลือก</p>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">จ่ายออกจากกระเป๋าเงิน</label>
          <select className={INPUT} style={INPUT_STYLE} value={walletId} onChange={e => setWalletId(e.target.value)} required>
            {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">วันที่จ่าย</label>
          <input className={INPUT} style={INPUT_STYLE} type="date" value={date} onChange={e => setDate(e.target.value)} required />
        </div>
        {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
        <button type="submit" disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors">
          {saving ? 'กำลังบันทึก...' : 'บันทึกเข้าเล่ม'}
        </button>
      </form>
    </Overlay>
  )
}

function BillCard({ bill, isAdmin, onPay, onReject, onView }) {
  const weak = isWeakEvidence(bill.evidenceType)
  return (
    <div className="rounded-xl p-4" style={{ ...CARD, borderColor: weak ? '#b45309' : '#1f2937' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-100">{bill.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: weak ? '#b4530922' : '#15803d22', color: weak ? '#f59e0b' : '#34d399' }}>
              หลักฐาน{weak ? 'อ่อน' : 'แข็ง'}
            </span>
            {bill.status !== 'pending' && <span className="text-xs text-slate-500">· {bill.status === 'paid' ? 'จ่ายแล้ว' : 'ปฏิเสธ'}</span>}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex gap-2 flex-wrap">
            <span>โดย {bill.submittedByName || '—'}</span>
            {bill.categoryName && <span>· {bill.categoryName}</span>}
            {bill.payeeAccountNo && <span>· โอนไป {bill.payeeBank || ''} ••{String(bill.payeeAccountNo).slice(-4)}</span>}
          </div>
          {bill.status === 'rejected' && bill.rejectReason && <p className="text-xs text-red-400 mt-1">เหตุผล: {bill.rejectReason}</p>}
        </div>
        <div className="text-lg font-bold text-slate-100 tabular-nums">{thb(bill.amount)}</div>
      </div>
      <div className="flex gap-2 mt-3">
        {bill.hasEvidence && <button onClick={() => onView(bill)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300">ดูหลักฐาน</button>}
        {isAdmin && bill.status === 'pending' && <>
          <button onClick={() => onPay(bill)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">จ่ายแล้ว</button>
          <button onClick={() => onReject(bill)} className="text-xs px-3 py-1.5 rounded-lg text-red-400">ปฏิเสธ</button>
        </>}
      </div>
    </div>
  )
}

export default function PendingBills() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSubmit, setShowSubmit] = useState(false)
  const [payBill, setPayBill] = useState(null)
  // admin: คิวเฉพาะ pending · staff: บิลของฉันทุกสถานะ (เห็นจ่ายแล้ว/ปฏิเสธ+เหตุผล ตาม acceptance #6)
  const load = () => { setLoading(true); api.pendingBills(isAdmin ? { status: 'pending' } : {}).then(d => setBills(d.bills || [])).catch(() => setBills([])).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [])
  const reject = async (bill) => { const reason = window.prompt('เหตุผลที่ปฏิเสธ:'); if (reason === null) return; await api.rejectPendingBill(bill.id, { reason }); load() }
  const view = async (bill) => { try { const url = await api.fetchBillEvidenceBlob(bill.id); window.open(url, '_blank') } catch (e) { alert(e.message) } }
  const ratios = weakRatioByUser(bills.map(b => ({ submittedByUserId: b.submittedByUserId, amount: b.amount, evidenceType: b.evidenceType })))
  const total = bills.reduce((s, b) => s + b.amount, 0)
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">{isAdmin ? 'คิวบิลรอจ่าย' : 'บิลรอจ่ายของฉัน'}</h1>
          {isAdmin && <p className="text-sm text-slate-400 tabular-nums">รอจ่าย {bills.length} รายการ · รวม {thb(total)}</p>}
        </div>
        {!isAdmin && <button onClick={() => setShowSubmit(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm font-semibold"><Plus className="w-4 h-4" />แจ้งบิล</button>}
      </div>
      {loading ? <p className="text-slate-500 text-sm">กำลังโหลด...</p>
        : bills.length === 0 ? <div className="text-center text-slate-500 py-12"><Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>ยังไม่มีบิลรอจ่าย</p></div>
        : <div className="space-y-3">{bills.map(b => <BillCard key={b.id} bill={b} isAdmin={isAdmin} onPay={setPayBill} onReject={reject} onView={view} />)}</div>}
      {isAdmin && Object.entries(ratios).filter(([, r]) => r >= 40).map(([uid, r]) => {
        const nm = bills.find(b => b.submittedByUserId === uid)?.submittedByName || uid
        return <div key={uid} className="flex items-center gap-2 text-xs text-amber-400"><AlertTriangle className="w-4 h-4" />{nm}: บิลไม่มีบิล {r}% ของยอดรอจ่าย — จับตา</div>
      })}
      {showSubmit && <SubmitBillModal me={user} onClose={() => setShowSubmit(false)} onDone={load} />}
      {payBill && <PayModal bill={payBill} onClose={() => setPayBill(null)} onDone={load} />}
    </div>
  )
}
```

- [ ] **Step 2: Build เพื่อเช็ค syntax/import**

Run: `npm run build`
Expected: build ผ่าน ไม่มี import error (import `../../pending-bills-logic.mjs` resolve ได้เพราะอยู่ repo root; ถ้า Vite ไม่ยอม import นอก src ให้ย้าย import มา re-implement `isWeakEvidence`/`weakRatioByUser` inline — ดู fallback ใน Step 3).

- [ ] **Step 3 (fallback ถ้า build fail จาก import นอก src):** คัดลอก `isWeakEvidence` + `weakRatioByUser` มาไว้ต้นไฟล์ `PendingBills.jsx` แทน import (โค้ดเดียวกับ Task 2 module) แล้ว build ใหม่ให้ผ่าน.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PendingBills.jsx
git commit -m "feat(pending-bills): หน้า PendingBills (คิวแอดมิน + ส่งบิล + จ่าย/ปฏิเสธ)"
```

---

### Task 7: Route + nav

**Files:**
- Modify: `src/App.jsx` (import + route)
- Modify: `src/Layout.jsx` (icon import + nav item ทั้ง staff array และ non-staff array)

**Interfaces:**
- Consumes: `PendingBills` (Task 6).

- [ ] **Step 1: App.jsx** — เพิ่ม import ต่อจาก imports หน้าอื่น (~line 20): `import PendingBills from './pages/PendingBills'` และเพิ่ม child route **ไม่ห่อ `RequireAdmin`** (หน้า branch เองตาม role) ในบล็อก `<Route path="/">` (เช่นหลัง `transactions`):
```jsx
            <Route path="pending-bills" element={<PendingBills />} />
```

- [ ] **Step 2: Layout.jsx** — เพิ่มไอคอนใน import lucide (line 3), เช่นเพิ่ม `Receipt`:
```jsx
// ...existing..., BarChart3, Wand2, Receipt } from 'lucide-react'
```
เพิ่ม nav item ใน **staff array** (หลัง `/transactions`, ~line 88) และใน **non-staff array** (หลัง `/transactions`, ~line 96):
```jsx
        { to: '/pending-bills', icon: Receipt, label: 'บิลรอจ่าย' },
```
(ใส่ทั้งสอง array เพราะทั้ง admin และ staff ต้องเห็น — หน้า branch role เอง.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build ผ่าน

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/Layout.jsx
git commit -m "feat(pending-bills): route /pending-bills + เมนู"
```

---

### Task 8: ฟิลด์บัญชีปลายทางในฟอร์ม (Profile / Users / Vendors)

**Files:**
- Modify: `src/pages/Profile.jsx`, `src/pages/Users.jsx`, `src/pages/Vendors.jsx`

**Interfaces:**
- Consumes: `/me`, `/users/:id`, vendor update ที่รับ bank fields (Task 4).

- [ ] **Step 1: Profile.jsx** — เพิ่ม state + inputs + payload (บัญชีพนักงานตัวเอง). เพิ่มใต้ `phone`:
```jsx
const [bankName, setBankName] = useState(user?.bankName || '')
const [bankAccountNo, setBankAccountNo] = useState(user?.bankAccountNo || '')
const [bankAccountName, setBankAccountName] = useState(user?.bankAccountName || '')
```
เพิ่ม inputs ในฟอร์ม `saveProfile` (แบบเดียวกับช่อง phone) และใส่ในpayload:
```jsx
await api.updateMe({ name, phone, bankName, bankAccountNo, bankAccountName })
```

- [ ] **Step 2: Users.jsx** — เพิ่ม field ใน `EMPTY`, `openEdit` seed, และ body ของ `updateUser`/`createUser`:
```jsx
const EMPTY = { email: '', password: '', name: '', role: 'staff', bankName: '', bankAccountNo: '', bankAccountName: '' }
// openEdit seed: ..., bankName: u.bankName || '', bankAccountNo: u.bankAccountNo || '', bankAccountName: u.bankAccountName || ''
// save body (edit): { name, role, bankName, bankAccountNo, bankAccountName, ...(password?) }
```
เพิ่ม inputs ในฟอร์ม (204–223) แบบเดียวกับช่อง name.

- [ ] **Step 3: Vendors.jsx** — เพิ่มใน `form` state + `api.updateVendor` payload:
```jsx
// form: ..., bankName: vendor.bankName || '', bankAccountNo: vendor.bankAccountNo || '',
// updateVendor payload: ..., bankName: form.bankName, bankAccountNo: form.bankAccountNo,
```
เพิ่ม inputs ใน grid (82–91).

- [ ] **Step 4: Build + Commit**

```bash
npm run build
git add src/pages/Profile.jsx src/pages/Users.jsx src/pages/Vendors.jsx
git commit -m "feat(pending-bills): ฟิลด์บัญชีปลายทางใน Profile/Users/Vendors"
```

---

### Task 9: ใบรับรองแทนใบเสร็จรับเงิน (voucher variant)

**Files:**
- Modify: `src/components/VoucherDoc.jsx` (เพิ่มโหมด "ใบรับรองแทนใบเสร็จ")
- Modify: `src/pages/PendingBills.jsx` (ปุ่ม "ใบรับรอง" บนบิล self_declared ที่จ่ายแล้ว)

**Interfaces:**
- Consumes: ข้อมูลบิล/tx.

- [ ] **Step 1:** อ่าน `src/components/VoucherDoc.jsx` + `src/pages/Voucher.jsx` ดู payload shape (`{ id, n, amt, d, b, r, si, ty, mo }`) และ prop ที่เลือก title (`ty`).

- [ ] **Step 2:** เพิ่มค่า `ty` ใหม่ (เช่น `'cert'`) ที่ทำให้หัวเอกสารเป็น "ใบรับรองแทนใบเสร็จรับเงิน", เลขที่ขึ้นต้น `CR-`, และมีบรรทัด "เหตุที่ไม่มีใบเสร็จ: ซื้อจากผู้ขายรายย่อยในตลาดสดซึ่งไม่ออกใบเสร็จ" + ช่องเซ็นผู้จ่าย/ผู้อนุมัติ. ส่วนที่เหลือ reuse โครงเดิม.

- [ ] **Step 3:** ใน `PendingBills.jsx` bill card: ถ้า `bill.status === 'paid' && bill.evidenceType === 'self_declared'` เพิ่มปุ่ม "ใบรับรอง" เปิด `/voucher?d=<payload ty=cert>` (แบบเดียวกับ `openVoucher` ใน `Transactions.jsx`).

- [ ] **Step 4: Build + Commit**

```bash
npm run build
git add src/components/VoucherDoc.jsx src/pages/PendingBills.jsx
git commit -m "feat(pending-bills): ออกใบรับรองแทนใบเสร็จอัตโนมัติ (self_declared)"
```

---

### Task 10: Deploy + end-to-end verification (INTEGRATION_POLICY gate)

**Files:** none (deploy + manual verify)

- [ ] **Step 1: Diff worker prod ก่อน** — เทียบ `worker.js` ปัจจุบันกับ `fintrack-worker-deployed.js` (snapshot prod ในรีโป) ให้แน่ใจว่า diff มีแต่ของที่เราเพิ่ม ไม่มี route/auth เดิมหาย:
```bash
git diff --no-index fintrack-worker-deployed.js worker.js
```
ถ้า `fintrack-worker-deployed.js` เก่ากว่า prod จริง ให้ดึงโค้ด prod ปัจจุบันมาเทียบก่อน (hand-maintained warning).

- [ ] **Step 2: Apply migrations (ครั้งเดียว)**
```bash
npx wrangler d1 execute fintrack-db --remote --file migrations/0002_pending_bills.sql
npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE users ADD COLUMN bank_name TEXT"
npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE users ADD COLUMN bank_account_no TEXT"
npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE users ADD COLUMN bank_account_name TEXT"
npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE vendor_profiles ADD COLUMN bank_name TEXT"
npx wrangler d1 execute fintrack-db --remote --command "ALTER TABLE vendor_profiles ADD COLUMN bank_account_no TEXT"
```

- [ ] **Step 3: Deploy worker + Pages** (`npx wrangler deploy` สำหรับ worker; build+deploy Pages ตาม workflow เดิม).

- [ ] **Step 4: ตรวจตาม Acceptance Criteria ในสเปก (9 ข้อ)** — ทำจริงผ่าน Ut:
  1. staff สร้างบิล+แนบรูป → ขึ้นคิว `pending`
  2. ยอดกระเป๋า/รายงานไม่ขยับตอน `pending`
  3. admin กด "จ่ายแล้ว" → เกิด tx expense, ยอดกระเป๋าลด, รูปเป็น slip ของ tx, บิล `paid` + `createdTxId`
  4. กด "จ่ายแล้ว" ซ้ำ → 409 ไม่เกิด tx ซ้ำ
  5. `self_declared` ยอด > 1000 → 400 · ≤1000+รูป → ผ่าน + มีปุ่มใบรับรอง
  6. ปฏิเสธ+เหตุผล → `rejected`, staff เห็นเหตุผล
  7. staff เห็นเฉพาะบิลตัวเอง · viewer สร้าง/เห็นคิวไม่ได้ (403)
  8. คิวติดธง "หลักฐานอ่อน" + %รายคน
  9. **ยืนยัน `functions/*` ไม่ถูกแก้** และ LINE bot เดิมยังทำงาน (ส่งสลิปทาง LINE → บันทึกได้ปกติ)

- [ ] **Step 5:** ถ้าผ่านครบ → merge/PR. Rollback plan (ถ้าพัง): ซ่อนเมนู + เลิกเรียก endpoint; ตาราง/คอลัมน์ที่เพิ่มปล่อยไว้ได้ (additive nullable ไม่กระทบของเดิม).

---

## Notes / Deferred (Phase 2+)
- LINE ปุ่ม "ส่งเป็นบิลรอจ่าย" + เด้งแจ้งกลับ = Phase 2 (แตะ `functions/*`, ต้อง checklist + เจ้าของเคาะ)
- batch pay UI, PromptPay QR/deeplink, delegate หลายสาขา, config เพดานยอด = later
- Duplicate detection: logic (`dupKey`) พร้อมใน module แล้ว แต่ Phase 1 ยังไม่ query เตือนใน UI — เพิ่มได้ทีหลังโดยไม่แก้ schema
