# Quick-Pay Deep Link — Phase 2.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** พนักงานส่งลิงก์จ่ายให้เจ้าของ → เจ้าของแตะ → เด้งหน้าจ่าย (PayModal เฟส 1.2) ของบิลนั้นทันที → โอน+อัพสลิป → บันทึก. **แต่การจ่ายยังต้อง login เป็นเจ้าของ (admin)** — ลิงก์แค่พาไปบิลที่ถูก ไม่ใช่ token เปิดจ่ายลอยๆ.

**Architecture:** frontend-only. ลิงก์ = `/{origin}/pending-bills?pay=<billId>`. reuse `payPendingBill` (admin-only, authed) + `getPendingBill` เดิม — **ไม่มี pay endpoint แบบ no-auth** (ปลอดภัย). ถ้าเจ้าของยังไม่ login → เด้ง /login แล้วกลับมาที่ลิงก์เดิมหลัง login. ถ้า login แล้ว → PendingBills อ่าน `?pay=` แล้วเปิด PayModal ให้บิลนั้น.

**Tech Stack:** React + react-router (useSearchParams/useLocation/useNavigate).

## Global Constraints
- **Frontend-only, additive.** ไม่แตะ worker/backend/migration/`functions/*`/api.js (methods ครบแล้ว: `payPendingBill`, `getPendingBill`). แก้ `src/App.jsx`, `src/pages/Login.jsx`, `src/pages/PendingBills.jsx`.
- **Security (สำคัญ):** ลิงก์พก **แค่ bill id** ไม่ใช่ capability. การจ่าย = admin-only + authenticated (payPendingBill เดิมบังคับอยู่แล้ว). ลิงก์หลุด = ไม่เสียหาย (คนเปิดต้องเป็น admin ที่ login ถึงจ่ายได้). auto-open PayModal เฉพาะ `isAdmin`; ถ้าไม่ใช่ admin → ไม่เปิด (แสดงบิลปกติ/ข้อความ).
- UI tokens เดิม: `CopyBtn`, `Overlay`, emerald. Base: branch จาก origin/main (มีทุกเฟสถึง 2.0).

---

### Task 1: Login redirect-back (พา deep link กลับมาหลัง login)

**Files:** Modify `src/App.jsx` (RequireAuth), `src/pages/Login.jsx`

**Interfaces:** RequireAuth ส่ง `state.from` (full location) ไป /login; Login กลับไปที่ `from` หลัง login สำเร็จ (คง query string เช่น `?pay=`).

- [ ] **Step 1:** อ่าน `src/App.jsx` (`RequireAuth`) + `src/pages/Login.jsx` (post-login navigate).
- [ ] **Step 2: `RequireAuth`** — capture location + ส่งเป็น state:
```jsx
// import { useLocation } from 'react-router-dom' (merge)
function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">กำลังโหลด...</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}
```
- [ ] **Step 3: `Login.jsx`** — หลัง login สำเร็จ กลับไป `from` (คง pathname+search); ถ้าไม่มี → `/`:
```jsx
// import { useLocation, useNavigate } from 'react-router-dom' (merge with existing)
const navigate = useNavigate()
const location = useLocation()
const from = location.state?.from ? (location.state.from.pathname + (location.state.from.search || '')) : '/'
// ...ในตัว handler หลัง await login(...) สำเร็จ:
navigate(from, { replace: true })
```
(ถ้า Login เดิมใช้ `<Navigate>` หลัง user ถูก set แทน useNavigate → ปรับให้ปลายทางเป็น `from` แทน `/` แต่คง logic เดิม.)
- [ ] **Step 4:** `npm run build` (green). Self-review: logged-out เปิด `/pending-bills?pay=x` → เด้ง login → หลัง login กลับมา `/pending-bills?pay=x` (query คงอยู่). Commit — `git commit -am "feat(quickpay-2.1): login redirect-back (คง deep link + query)"`

---

### Task 2: PendingBills deep-link → เปิด PayModal + ปุ่มคัดลอกลิงก์จ่าย

**Files:** Modify `src/pages/PendingBills.jsx`

**Interfaces:** Consumes `useSearchParams`, `api.getPendingBill(id)`, existing `PayModal`/`payBill` state, `CopyBtn`.

- [ ] **Step 1: อ่าน deep-link param + auto-open** — ในคอมโพเนนต์ `PendingBills`:
```jsx
// import { useSearchParams } from 'react-router-dom' (merge)
const [sp, setSp] = useSearchParams()
const payId = sp.get('pay')
const [deepHandled, setDeepHandled] = useState(false)
useEffect(() => {
  if (!payId || deepHandled || !user) return
  if (!isAdmin) { setDeepHandled(true); return }   // เฉพาะ admin จ่ายได้ — ไม่เปิดให้ role อื่น
  setDeepHandled(true)
  ;(async () => {
    let bill = bills.find(b => b.id === payId)
    if (!bill) { try { bill = (await api.getPendingBill(payId)).bill } catch { bill = null } }
    if (bill && bill.status === 'pending') setPayBill(bill)
    // ล้าง ?pay ออกจาก URL กันเปิดซ้ำ
    const next = new URLSearchParams(sp); next.delete('pay'); setSp(next, { replace: true })
  })()
}, [payId, deepHandled, user, isAdmin, bills])
```
(หมายเหตุ: `payBill` state + `PayModal` + `setPayBill` มีอยู่แล้วจากเฟส 1.2 — เปิดได้ทันที; onDone→load เดิม.)
- [ ] **Step 2: ปุ่ม "ลิงก์จ่าย (ส่งเจ้าของ)"** — ใน `BillCard` เมื่อ `bill.status === 'pending'` เพิ่มปุ่มคัดลอกลิงก์ `${window.location.origin}/pending-bills?pay=${bill.id}` (ใช้ `CopyBtn` หรือปุ่มเล็กสไตล์เดียวกัน). แสดงให้ทั้ง staff (ส่งให้เจ้าของ) และ admin. ข้อความปุ่ม เช่น "คัดลอกลิงก์จ่าย".
- [ ] **Step 3:** `npm run build` (green). Self-review: admin เปิด `?pay=<pendingBillId>` → PayModal เด้งบิลนั้น; ล้าง param แล้วไม่เด้งซ้ำ; non-admin ไม่เด้ง; บิลที่ไม่ pending ไม่เด้ง; ปุ่มคัดลอกได้ URL ถูก; ไม่กระทบ flow เดิม.
- [ ] **Step 4: Commit** — `git commit -am "feat(quickpay-2.1): deep-link เปิด PayModal (admin) + ปุ่มคัดลอกลิงก์จ่าย"`

---

## Acceptance Criteria (manual)
1. staff/admin กดปุ่ม "คัดลอกลิงก์จ่าย" บนบิล pending → ได้ URL `/pending-bills?pay=<id>`
2. admin (login แล้ว) เปิดลิงก์ → PayModal ของบิลนั้นเด้งทันที (บัญชี+คัดลอก+บังคับสลิปโอน) → จ่ายได้
3. เจ้าของยังไม่ login เปิดลิงก์ → เด้ง /login → หลัง login กลับมาเปิด PayModal บิลเดิม (query คงอยู่)
4. staff (ไม่ใช่ admin) เปิดลิงก์ → ไม่เด้งจ่าย (จ่ายไม่ได้อยู่แล้ว 403) — เห็นบิลปกติ
5. ล้าง `?pay` หลังเปิด → refresh ไม่เด้งซ้ำ · บิลที่ไม่ pending/ไม่พบ → ไม่เด้ง/ไม่ crash
6. `npm run build` เขียว · ไม่แตะ backend/worker/migration/functions/api.js

## Deploy (held for owner — Pages only)
`npm run build` → `wrangler pages deploy dist --project-name=fintrack-frontend --branch=main`. ไม่มี migration/worker. แล้ว push+PR เข้า main.

## Notes / later
- auto-เด้งแจ้งเจ้าของทาง LINE ตอนพนักงานส่งบิล = เฟส LINE (แตะ functions/* — checklist + เจ้าของเคาะ) ทีหลัง
