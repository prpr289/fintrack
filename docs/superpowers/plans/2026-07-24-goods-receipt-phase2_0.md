# Goods Receipt (ใบรับของ) — Phase 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** เพิ่ม "โหมดใบรับของ" ต่อยอดบน pending_bills เดิม — พนักงานคีย์รายการ (ระบบคูณ) → ผู้ขายเซ็นบนจอ → ตรวจรับ → เข้าคิวรอจ่าย → เจ้าของจ่าย (reuse Phase 1.2) → ผู้ขายเปิดหน้า public ตรวจสอบ/พิพาทได้.

**Architecture:** additive บน `pending_bills` (`kind='goods_receipt'` + line_items + vendor_signature + received_by + public_token). Reuse คิว/จ่าย/refund/สลิปโอน เดิมทั้งหมด. หน้าเอกสาร = หน้า public `/receipt/:token` เดียว (เป็นทั้ง "เอกสารใบรับของ" และ "หน้าผู้ขายดู" — light theme, printable). Signature = HTML canvas → PNG → R2. Public receipt endpoints อยู่ **นอก requireAuth** (เหมือน /health).

**Tech Stack:** worker.js (D1 `env.DB`, R2 `env.SLIPS`), React+Vite+react-router, `qrcode` (dep ใหม่ เล็ก สำหรับ QR ให้ผู้ขายสแกน), tests = `node <f>.test.mjs`.

**Visual spec:** scratchpad `goods-receipt-mockup.html` (4 จอ) — implementer เปิดอ่าน match layout/สี. จอ staff+admin = dark app theme; เอกสาร+public = light.

## Global Constraints
- **INTEGRATION_POLICY: additive only.** ห้ามแตะ `functions/*`, `requireAuth`, token/secret, route/handler เดิม (นอกจากเติม additive). worker.js: ทุก top-level function ใหม่ตามด้วย `__name(fn,"fn");`.
- **Money/anti-fraud:** `amount` ของ goods_receipt = **server รวมจาก line_items เท่านั้น** (ไม่เชื่อ client). คนรับ (staff) ≠ คนจ่าย (admin) — คงไว้. reuse pay/refund guards เดิม (atomic + TOCTOU).
- **Public page ปลอดภัย:** `public_token` สุ่ม ≥32 hex เดาไม่ได้ · endpoint คืนเฉพาะฟิลด์ปลอดภัย · เลขบัญชี mask 4 ท้าย · ไม่ต้อง login · ไม่รั่วข้อมูลบิลอื่น.
- **Migration:** apply มือ (worker no runner). DB=`fintrack-db`.
- **Test:** pure logic → `node ...test.mjs` (ไม่มี `npm test`, ห้าม `node --test`). Handler/React → lint/build + manual.
- UI tokens เดิม: `CARD`,`INPUT`,`INPUT_STYLE`,`Overlay`,`thb()`, emerald/dark. Public page = light (ดู mockup section ④).
- Base: branch จาก origin/main (มี Phase 1/1.1/1.2 ครบ). Spec/analysis: บทสนทนา + mockup artifact.

---

### Task 1: Migration — goods-receipt columns

**Files:** Create `migrations/0005_goods_receipt.sql`

- [ ] **Step 1:**
```sql
-- Phase 2.0: goods-receipt (ใบรับของ) fields on pending_bills. Additive nullable, SAFE.
-- Apply ONCE:
--   npx wrangler d1 execute fintrack-db --remote --file migrations/0005_goods_receipt.sql
ALTER TABLE pending_bills ADD COLUMN kind TEXT NOT NULL DEFAULT 'simple';
ALTER TABLE pending_bills ADD COLUMN line_items TEXT;
ALTER TABLE pending_bills ADD COLUMN vendor_signature_key TEXT;
ALTER TABLE pending_bills ADD COLUMN received_by_user_id TEXT;
ALTER TABLE pending_bills ADD COLUMN received_by_name TEXT;
ALTER TABLE pending_bills ADD COLUMN public_token TEXT;
CREATE INDEX IF NOT EXISTS idx_pb_public_token ON pending_bills(public_token);
```
- [ ] **Step 2: Commit** — `git commit -am "feat(goods-receipt-2.0): migration line_items/signature/public_token"`

---

### Task 2: Logic — line items (TDD)

**Files:** Modify `pending-bills-logic.mjs` + `pending-bills-logic.test.mjs`

**Interfaces:** Produces `sumLineItems(items)` → number (Σ round(qty*unitPrice), 2dp) ; `validateLineItems(items)` → {ok} | {ok:false,error}.

- [ ] **Step 1: add tests** (merge import; before final console.log):
```js
import { sumLineItems, validateLineItems } from './pending-bills-logic.mjs'
assert.strictEqual(sumLineItems([{qty:3.6,unitPrice:300},{qty:1,unitPrice:120}]), 1200)
assert.strictEqual(sumLineItems([]), 0)
assert.strictEqual(sumLineItems([{qty:2,unitPrice:12.5}]), 25)
assert.strictEqual(validateLineItems([{name:'ปลาทู',qty:3.6,unitPrice:300}]).ok, true)
assert.strictEqual(validateLineItems([]).ok, false)                                   // ต้องมีอย่างน้อย 1
assert.strictEqual(validateLineItems([{name:'',qty:1,unitPrice:10}]).ok, false)        // ชื่อว่าง
assert.strictEqual(validateLineItems([{name:'x',qty:0,unitPrice:10}]).ok, false)       // จำนวน 0
assert.strictEqual(validateLineItems([{name:'x',qty:1,unitPrice:-5}]).ok, false)       // ราคาติดลบ
```
- [ ] **Step 2: run → FAIL** (`node pending-bills-logic.test.mjs`)
- [ ] **Step 3: add exports:**
```js
export function sumLineItems(items) {
  return Math.round((items || []).reduce((s, it) => s + Number(it.qty) * Number(it.unitPrice), 0) * 100) / 100
}
export function validateLineItems(items) {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'ต้องมีอย่างน้อย 1 รายการ' }
  for (const it of items) {
    if (!it || !String(it.name || '').trim()) return { ok: false, error: 'ชื่อรายการห้ามว่าง' }
    if (!(Number(it.qty) > 0)) return { ok: false, error: 'จำนวนต้องมากกว่า 0' }
    if (!(Number(it.unitPrice) >= 0)) return { ok: false, error: 'ราคา/หน่วยไม่ถูกต้อง' }
  }
  return { ok: true }
}
```
- [ ] **Step 4: run → PASS** · **Step 5: Commit** — `git commit -am "feat(goods-receipt-2.0): line-item logic + tests"`

---

### Task 3: Backend — goods-receipt create, signature upload, public receipt (worker.js additive)

**Files:** Modify `worker.js`

**Interfaces:** Produces: `createPendingBill` accepts `kind`,`lineItems`,`receivedBy` (goods_receipt → amount server-computed, public_token generated); `POST /pending-bills/:id/signature`; **public** `GET /receipt/:token` + `GET /receipt/:token/signature`; `formatPendingBill` adds `kind`,`lineItems`,`hasSignature`,`publicToken`,`receivedByName`.

- [ ] **Step 1: import** (top): `import { sumLineItems, validateLineItems } from "./pending-bills-logic.mjs";` (merge with existing import from that module).

- [ ] **Step 2: public routes** — in `fetch`, right AFTER the `/health` line and BEFORE `const auth = await requireAuth(...)`:
```js
      const rcptMatch = path.match(/^\/receipt\/([a-f0-9]{16,})$/);
      if (rcptMatch && method === "GET") return cors(await getPublicReceipt(rcptMatch[1], env));
      const rcptSigMatch = path.match(/^\/receipt\/([a-f0-9]{16,})\/signature$/);
      if (rcptSigMatch && method === "GET") return cors(await getPublicReceiptSignature(rcptSigMatch[1], env));
```

- [ ] **Step 3: signature route** — with the other `/pending-bills/:id/...` guards (inside auth block):
```js
      const pbSigMatch = path.match(/^\/pending-bills\/([a-zA-Z0-9_-]+)\/signature$/);
      if (pbSigMatch && method === "POST") return cors(await uploadVendorSignature(pbSigMatch[1], request, env, user));
```

- [ ] **Step 4: extend `createPendingBill`** — accept goods-receipt shape. After the existing destructure add `kind`, `lineItems`, then branch:
```js
  const isGoods = kind === "goods_receipt";
  let finalAmount = Number(amount);
  let lineItemsJson = null;
  if (isGoods) {
    const lv = validateLineItems(lineItems);
    if (!lv.ok) return json({ error: lv.error }, 400);
    finalAmount = sumLineItems(lineItems);
    lineItemsJson = JSON.stringify(lineItems);
  }
  // ... existing validateBillInput can be skipped-for-goods on amount (amount is server-computed); still validate name/scope/payeeType/evidenceType as today.
  const publicToken = isGoods ? (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "") : null;
```
Then in the INSERT add columns `kind, line_items, received_by_user_id, received_by_name, public_token` binding `isGoods ? 'goods_receipt' : 'simple'`, `lineItemsJson`, `isGoods ? user.id : null`, `isGoods ? (user.name||null) : null`, `publicToken`. Use `finalAmount` for the amount bind. (For goods_receipt, `evidence_type` = `'receipt'` default is fine; the goods photo uploads via existing evidence endpoint.) Keep the rest identical/additive.

- [ ] **Step 5: `formatPendingBill`** — add:
```js
    kind: b.kind || "simple",
    lineItems: b.line_items ? (() => { try { return JSON.parse(b.line_items) } catch { return null } })() : null,
    hasSignature: !!b.vendor_signature_key,
    receivedByName: b.received_by_name || null,
    publicToken: b.public_token || null,
```

- [ ] **Step 6: handlers** (end of file, each `__name`):
```js
async function uploadVendorSignature(billId, request, env, user) {
  const b = await env.DB.prepare("SELECT id, status, submitted_by_user_id, received_by_user_id FROM pending_bills WHERE id = ? AND workspace_id = ?").bind(billId, user.workspace_id).first();
  if (!b) return json({ error: "ไม่พบบิล" }, 404);
  if (b.status !== "pending") return json({ error: "บิลนี้ถูกดำเนินการไปแล้ว" }, 409);
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.startsWith("image/")) return json({ error: "signature ต้องเป็นรูปภาพ" }, 400);
  const sigId = "sig_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const fileKey = `${user.workspace_id}/signatures/${billId}/${sigId}`;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > 2 * 1024 * 1024) return json({ error: "ไฟล์ใหญ่เกินไป" }, 400);
  await env.SLIPS.put(fileKey, buf, { httpMetadata: { contentType } });
  await env.DB.prepare("UPDATE pending_bills SET vendor_signature_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(fileKey, billId).run();
  return json({ ok: true }, 201);
}
__name(uploadVendorSignature, "uploadVendorSignature");

async function getPublicReceipt(token, env) {
  const b = await env.DB.prepare(
    "SELECT pb.*, w.name AS shop_name FROM pending_bills pb LEFT JOIN workspaces w ON pb.workspace_id = w.id WHERE pb.public_token = ?"
  ).bind(token).first();
  if (!b) return json({ error: "ไม่พบเอกสาร" }, 404);
  const acc = b.payee_account_no ? ("••" + String(b.payee_account_no).slice(-4)) : null;
  let items = null; try { items = b.line_items ? JSON.parse(b.line_items) : null } catch {}
  return json({
    receiptNo: "GR-" + (b.created_at || "").slice(2, 10).replace(/-/g, "") + "-" + b.id.slice(-4),
    shopName: b.shop_name || "ร้านค้า",
    vendorName: b.payee_name || null,
    date: b.created_at,
    lineItems: items,
    amount: Number(b.amount),
    hasSignature: !!b.vendor_signature_key,
    status: b.status,
    paidAt: b.paid_at || null,
    payeeAccountMasked: acc,
    receivedByName: b.received_by_name || null
  });
}
__name(getPublicReceipt, "getPublicReceipt");

async function getPublicReceiptSignature(token, env) {
  const b = await env.DB.prepare("SELECT vendor_signature_key FROM pending_bills WHERE public_token = ?").bind(token).first();
  if (!b || !b.vendor_signature_key) return json({ error: "not found" }, 404);
  const obj = await env.SLIPS.get(b.vendor_signature_key);
  if (!obj) return json({ error: "not found" }, 404);
  return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType || "image/png" } });
}
__name(getPublicReceiptSignature, "getPublicReceiptSignature");
```
- [ ] **Step 7:** `node -c worker.js` + `npm run lint` (0 new). Commit — `git commit -am "feat(goods-receipt-2.0): create+signature+public receipt endpoints"`

---

### Task 4: api.js methods

**Files:** Modify `src/api.js`

- [ ] **Step 1:** add:
```js
  uploadVendorSignature: (billId, blob) => {
    const t = token(); const headers = { 'Content-Type': 'image/png' }
    if (t) headers['Authorization'] = `Bearer ${t}`
    return fetch(`${BASE}/pending-bills/${billId}/signature`, { method: 'POST', headers, body: blob })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'อัปลายเซ็นไม่สำเร็จ'); return d })
  },
  publicReceipt: (tokenStr) => fetch(`${BASE}/receipt/${tokenStr}`).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'ไม่พบเอกสาร'); return d }),
  publicReceiptSignatureUrl: (tokenStr) => `${BASE}/receipt/${tokenStr}/signature`,
```
(`createPendingBill` เดิมใช้ได้เลย — ส่ง `kind:'goods_receipt'`, `lineItems`, `payeeType:'vendor'`, `payeeRefId`.)
- [ ] **Step 2:** `npm run build` · Commit — `git commit -am "feat(goods-receipt-2.0): api signature + public receipt"`

---

### Task 5: Frontend — staff "รับของ" screen (line items + signature pad + QR)

**Files:** Modify `src/pages/PendingBills.jsx`; add dep `qrcode`

**Interfaces:** Consumes `api.createPendingBill({kind:'goods_receipt', lineItems, payeeType:'vendor', payeeRefId, name, scope, evidenceType:'receipt'})` → `{bill:{id, publicToken,...}}`; `api.uploadBillEvidence(id, photoFile)`; `api.uploadVendorSignature(id, pngBlob)`; `api.vendorProfiles()`.

- [ ] **Step 1:** `npm install qrcode` (client QR lib). Verify it's in package.json deps.

- [ ] **Step 2: SignaturePad component** (in PendingBills.jsx) — canvas + pointer drawing → `toBlob`:
```jsx
function SignaturePad({ onChange }) {
  const ref = useRef(null); const drawing = useRef(false)
  const pos = (e) => { const c = ref.current, r = c.getBoundingClientRect(); const t = e.touches?.[0] || e; return [t.clientX - r.left, t.clientY - r.top] }
  const start = (e) => { e.preventDefault(); drawing.current = true; const ctx = ref.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...pos(e)) }
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const ctx = ref.current.getContext('2d'); ctx.lineTo(...pos(e)); ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke() }
  const end = () => { if (!drawing.current) return; drawing.current = false; ref.current.toBlob(b => onChange(b), 'image/png') }
  const clear = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); onChange(null) }
  return (
    <div>
      <canvas ref={ref} width={300} height={90} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
        style={{ width: '100%', height: 90, background: '#0d1120', border: '1px solid #2e3349', borderRadius: 8, touchAction: 'none' }} />
      <button type="button" onClick={clear} className="text-xs text-slate-500 mt-1">ล้าง เซ็นใหม่</button>
    </div>
  )
}
```

- [ ] **Step 3: GoodsReceiptModal** (new; reuse `Overlay`/`INPUT`) — match mockup §①:
  - vendor `<select>` from `api.vendorProfiles()` (โชว์บัญชี ••4 ท้าย ใต้ช่อง) + [เพิ่มผู้ขายใหม่ → link to /vendors] ;
  - line-items editor: rows of {name, qty, unit(text), unitPrice} + live `amount = qty*unitPrice`; add/remove row; live total via `sumLineItems`;
  - photo file input (goods) ; `SignaturePad` (required — vendor signs) ;
  - `received by` = current user (auto, display) ;
  - submit: `createPendingBill({kind:'goods_receipt', name: 'รับของ '+vendorName, amount: total, scope:'business', payeeType:'vendor', payeeRefId: vendorId, evidenceType:'receipt', lineItems})` → `bill.id`+`publicToken` → `uploadBillEvidence(id, photo)` (if photo) → `uploadVendorSignature(id, sigBlob)` → success shows QR (qrcode → dataURL of `${window.location.origin}/receipt/${publicToken}`) + copy-link, then onDone.
  - guards: ≥1 line item, signature required, vendor required.
- [ ] **Step 4:** Add a "รับของ" button on the PendingBills page for staff (next to "แจ้งบิล") opening GoodsReceiptModal.
- [ ] **Step 5:** `npm run build` (green). Commit — `git commit -am "feat(goods-receipt-2.0): จอรับของ staff (line items + signature pad + QR)"`

---

### Task 6: Admin queue shows goods-receipt detail

**Files:** Modify `src/pages/PendingBills.jsx` (BillCard)

- [ ] **Step 1:** In `BillCard`, when `bill.kind === 'goods_receipt'`: render the line-items list (name · qty×unitPrice · amount) + a badge "ใบรับของ · ผู้ขายเซ็น" (if `hasSignature`) + a "ดูใบรับของ" button opening `/receipt/${bill.publicToken}` in a new tab. Keep existing card actions (จ่ายแล้ว/ปฏิเสธ) — pay reuses Phase 1.2 modal unchanged.
- [ ] **Step 2:** `npm run build` · Commit — `git commit -am "feat(goods-receipt-2.0): admin card แสดงรายการ+ลิงก์ใบรับของ"`

---

### Task 7: Public receipt page `/receipt/:token` (the document)

**Files:** Create `src/pages/Receipt.jsx`; Modify `src/App.jsx` (public route)

**Interfaces:** Consumes `api.publicReceipt(token)`, `api.publicReceiptSignatureUrl(token)`.

- [ ] **Step 1: `src/pages/Receipt.jsx`** — public page (light, printable) matching mockup §② + §④: read `:token` via `useParams`; fetch `api.publicReceipt(token)`; render shop header, receiptNo, vendor, date, line-items table, total, vendor signature `<img src={publicReceiptSignatureUrl(token)}>` (if hasSignature), status pill (รอจ่าย 🕐 / จ่ายแล้ว ✅ + paidAt + masked account), disclaimer, print button. Light theme (own styles — do NOT use the app's dark tokens; white paper look per mockup). On not-found → friendly "ไม่พบเอกสาร".
- [ ] **Step 2: `src/App.jsx`** — add `import Receipt from './pages/Receipt'` + a PUBLIC route (outside `RequireAuth`, next to `/voucher`): `<Route path="/receipt/:token" element={<Receipt />} />`.
- [ ] **Step 3:** `npm run build` (green). Commit — `git commit -am "feat(goods-receipt-2.0): public /receipt/:token page (เอกสาร+ผู้ขายดู)"`

---

## Acceptance Criteria (manual)
1. staff กด "รับของ" → เพิ่มรายการ (ระบบคูณยอดถูก) → ผู้ขายเซ็นบนจอ → ถ่ายรูป → ตรวจรับ → เข้าคิว `pending` kind=goods_receipt ; ยอด = ผลรวม line items (server)
2. amount ที่ client ส่งมาถูก override ด้วย server-sum (ลอง tamper → ยอดยังถูก)
3. admin เห็นรายการ + ลายเซ็น + กด "จ่ายแล้ว" (จอ 1.2: บัญชี+สลิปโอน) → เข้าเล่ม
4. เปิด `/receipt/:token` (ไม่ต้อง login) เห็นรายการ/ยอด/ลายเซ็น/สถานะ ; ก่อนจ่าย=รอจ่าย หลังจ่าย=จ่ายแล้ว ; เลขบัญชี mask
5. token มั่ว/ผิด → 404 friendly ; ไม่รั่วบิลอื่น
6. `npm run build` เขียว · `node -c worker.js` ok · ไม่แตะ functions/*/auth เดิม

## Deploy (held for owner)
`0005` migration → diff worker vs prod → `wrangler deploy` → `npm run build` + `wrangler pages deploy --branch=main` → verify: staff รับของ, public /receipt เปิดได้, LINE bot ยังทำงาน. แล้ว PR เข้า main (clean จาก origin/main).

## Notes / deferred to 2.1
- price-history flag (เตือนราคาผิดปกติ) — mockup §③ โชว์ไว้ แต่ทำจริงเฟส 2.1
- offline draft, standing order, OCR โพย — later
