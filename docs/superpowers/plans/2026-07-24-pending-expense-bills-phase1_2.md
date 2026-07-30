# Pending Expense Bills — Phase 1.2 (admin pay modal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** ยกเครื่อง PayModal (จอ "จ่ายเงิน" ของแอดมิน) ให้: (1) โชว์บัญชีปลายทาง + ปุ่มคัดลอกเลขบัญชี/ยอด, (2) ลิงก์ดูบิล/หลักฐานจากพนักงาน, (3) **บังคับแนบสลิปโอน** ก่อนยืนยัน → รายการเก็บ 2 หลักฐาน (บิลพนักงาน + สลิปโอนของแอดมิน). เน้นสวย ตรงตาม mockup ที่อนุมัติแล้ว.

**Architecture:** **Frontend-only.** ไม่แตะ backend/migration เลย — `api.payPendingBill(id,{walletId,date})` คืน `txId` อยู่แล้ว และมี `api.uploadSlip(txId,file,'transfer')` อยู่แล้ว. ลำดับตอน submit: pay → ได้ txId → uploadSlip(transfer). ข้อมูลบัญชี (`payeeBank/payeeName/payeeAccountNo`) มากับบิลจาก `formatPendingBill` แล้ว.

**Tech Stack:** React+Vite, Tailwind + inline style tokens, lucide-react. ไม่มี React test setup → verify = `npm run build` + self-review + manual.

## Global Constraints
- **Frontend-only, additive.** ห้ามแตะ backend/worker/migration/`functions/*`. แก้เฉพาะ `src/pages/PendingBills.jsx` (PayModal + ที่เกี่ยวข้อง). ไม่แก้ api.js (methods ครบแล้ว).
- **Visual = ตาม mockup** (dark/emerald เหมือนแอปจริง): scratchpad `admin-pay-mockup.html` คือ visual spec — implementer เปิดอ่านเพื่อ match layout/สี/สเปซ. 3 สเต็ป: ① โอนไปบัญชีนี้ ② แนบสลิปโอน (บังคับ) ③ บันทึก. มี note "เก็บ 2 หลักฐาน".
- UI tokens เดิมในไฟล์: `CARD`, `INPUT`, `INPUT_STYLE`, emerald buttons, `Overlay`, `thb()`.
- คัดลอก = `navigator.clipboard.writeText(...)` (prod เป็น https + click gesture → ใช้ได้) พร้อม feedback สั้นๆ (เช่น เปลี่ยนป้ายปุ่มเป็น "คัดลอกแล้ว" 1.5 วิ).

---

### Task 1: ยกเครื่อง PayModal ใน PendingBills.jsx

**Files:** Modify `src/pages/PendingBills.jsx` (component `PayModal` + ทำ `CopyBtn` เล็กๆ ในไฟล์)

**Interfaces:**
- Consumes: `api.payPendingBill(id,{walletId,date})` → `{ ok, transaction, txId }`; `api.uploadSlip(txId, file, 'transfer')`; `api.fetchBillEvidenceBlob(billId)`; `api.wallets()`. Bill fields: `payeeBank`, `payeeName`, `payeeAccountNo`, `amount`, `hasEvidence`, `id`.

- [ ] **Step 1: อ่าน PayModal ปัจจุบัน + เปิด mockup เป็น visual spec**
Read `src/pages/PendingBills.jsx` (หา `function PayModal`). Read visual spec: `C:\Users\Admin\AppData\Local\Temp\claude\C--Users-Admin-Documents-ai-thaninnat-fintrack-frontend--claude-worktrees-elegant-bartik-aabcc6\b73cc894-61bb-40f1-832e-35e0988bfb55\scratchpad\admin-pay-mockup.html` — match its 3-step layout, destination card, copy buttons, dropzone, footer note.

- [ ] **Step 2: เพิ่ม `CopyBtn` helper** (ในไฟล์ ก่อน PayModal):
```jsx
function CopyBtn({ text }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(String(text)); setDone(true); setTimeout(() => setDone(false), 1500) } catch {}
  }
  return <button type="button" onClick={copy}
    className="text-xs font-medium rounded-md px-2.5 py-1 border transition-colors"
    style={{ borderColor: '#10b98155', color: '#34d399', background: done ? '#10b98122' : 'transparent' }}>
    {done ? 'คัดลอกแล้ว' : 'คัดลอก'}
  </button>
}
```

- [ ] **Step 3: ยกเครื่อง `PayModal`** — โครงใหม่ (มี state เดิม wallets/walletId/date/saving/err + เพิ่ม `file`, `viewing`):
  - **หัวบิล**: avatar + ชื่อรายการ + badge หลักฐาน (แข็ง/อ่อน ตาม `isWeakEvidence(bill.evidenceType)`) + ยอด. ถ้า `bill.hasEvidence` → ปุ่ม/ลิงก์ "ดูบิล/หลักฐานจากพนักงาน" เรียก `api.fetchBillEvidenceBlob(bill.id)` แล้ว `window.open(url,'_blank')` (try/catch alert).
  - **สเต็ป ① โอนไปบัญชีนี้**: การ์ด emerald-tint แสดง `bill.payeeBank` (ถ้าว่างโชว์ "—"), `bill.payeeName`, แถวเลขบัญชี `bill.payeeAccountNo` + `<CopyBtn text={bill.payeeAccountNo}/>`, แถวยอด `thb(bill.amount)` + `<CopyBtn text={bill.amount}/>`. ถ้าไม่มี `payeeAccountNo` → โชว์ข้อความ "ยังไม่ได้ตั้งบัญชีปลายทาง (ตั้งได้ที่หน้าผู้ใช้/Vendor)".
  - **สเต็ป ② แนบสลิปโอน (บังคับ)**: `<input type="file" accept="image/*,application/pdf">` → `setFile`. โชว์ชื่อไฟล์ที่แนบ + ข้อความ "หลักฐานการโอนของคุณ — คนละใบกับบิลพนักงาน".
  - **สเต็ป ③ บันทึก**: select กระเป๋า (default `bill.paidWalletId`? ไม่มีตอน pay — default wallet แรก) + วันที่ (default วันนี้). (เหมือน PayModal เดิม)
  - **footer**: ปุ่ม "ยกเลิก" + "ยืนยันจ่ายแล้ว". ปุ่มยืนยัน **disabled ถ้ายังไม่แนบไฟล์** (หรือกดแล้วเตือน "ต้องแนบสลิปโอนก่อน"). ใต้ปุ่ม note "รายการนี้จะเก็บ 2 หลักฐาน: บิลพนักงาน + สลิปโอนของคุณ".
  - **submit**:
```js
const pay = async (e) => {
  e.preventDefault()
  if (!file) { setErr('ต้องแนบสลิปโอนก่อน'); return }
  setSaving(true); setErr('')
  try {
    const res = await api.payPendingBill(bill.id, { walletId, date })
    const txId = res?.txId || res?.transaction?.id
    if (txId) {
      try { await api.uploadSlip(txId, file, 'transfer') }
      catch { alert('จ่ายสำเร็จแล้ว แต่แนบสลิปโอนไม่สำเร็จ — แนบซ้ำได้ที่รายการในหน้าธุรกรรม') }
    }
    onDone(); onClose()
  } catch (e) { setErr(e.message) } finally { setSaving(false) }
}
```
Match the mockup styling (reuse existing `INPUT`/`INPUT_STYLE`, emerald buttons, `Overlay`, dark card). Make it clean/สวย — proper spacing, step headers with numbered chips, the destination card tinted emerald.

- [ ] **Step 4: Build + self-review**
`npm run build` (green). Self-review: confirm can't confirm without file; pay→uploadSlip('transfer') wiring; copy buttons; destination handles missing account; matches mockup.

- [ ] **Step 5: Commit** — `git commit -am "feat(pending-bills-1.2): จอจ่ายเงินโชว์บัญชีปลายทาง+คัดลอก + บังคับแนบสลิปโอน (2 หลักฐาน)"`

---

## Acceptance Criteria (manual)
1. กด "จ่ายแล้ว" → เห็นบัญชีปลายทาง (ธนาคาร/ชื่อ/เลข/ยอด) + ปุ่มคัดลอกใช้ได้จริง
2. ปุ่ม "ยืนยันจ่ายแล้ว" กดไม่ได้จนกว่าจะแนบสลิปโอน
3. หลังยืนยัน → transaction มี 2 สลิป: บิลพนักงาน (เดิม) + สลิปโอนชนิด `transfer` (ใหม่)
4. บิลไม่มี payeeAccountNo → โชว์ข้อความชวนไปตั้งบัญชี ไม่พัง
5. `npm run build` เขียว · ไม่แตะ backend/worker/migration/functions

## Deploy (held for owner — Pages only, ไม่มี migration/worker)
`npm run build` → `npx wrangler pages deploy dist --project-name=fintrack-frontend --branch=main --commit-dirty=true`. ไม่ต้อง apply migration, ไม่ต้อง deploy worker (frontend-only). แล้ว push+PR เข้า main ให้ repo==prod.
