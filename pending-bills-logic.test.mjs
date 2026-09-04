// Run: node pending-bills-logic.test.mjs
import assert from 'node:assert'
import {
  NO_BILL_CAP, validateBillInput, checkNoBillCap, isWeakEvidence, dupKey, weakRatioByUser, duplicateIds, sumLineItems, validateLineItems,
  unpricedItems, billsWithUnpricedItems,
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

// --- duplicateIds ---
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

// --- sumLineItems ---
assert.strictEqual(sumLineItems([{qty:3.6,unitPrice:300},{qty:1,unitPrice:120}]), 1200)
assert.strictEqual(sumLineItems([]), 0)
assert.strictEqual(sumLineItems([{qty:2,unitPrice:12.5}]), 25)

// --- validateLineItems ---
assert.strictEqual(validateLineItems([{name:'ปลาทู',qty:3.6,unitPrice:300}]).ok, true)
assert.strictEqual(validateLineItems([]).ok, false)                                   // ต้องมีอย่างน้อย 1
assert.strictEqual(validateLineItems([{name:'',qty:1,unitPrice:10}]).ok, false)        // ชื่อว่าง
assert.strictEqual(validateLineItems([{name:'x',qty:0,unitPrice:10}]).ok, false)       // จำนวน 0
assert.strictEqual(validateLineItems([{name:'x',qty:1,unitPrice:-5}]).ok, false)       // ราคาติดลบ

// ── unpricedItems: ของรับมาแล้วแต่ยังไม่ลงราคา ────────────────────────
// เคสจริงจากหน้าจอ 2026-09-04: ใบ ฿1,840 บวกได้จาก 6 บรรทัดแรก ที่เหลือ x฿0
const bill1840 = [
  { name: 'มะละกอ', qty: 40, unitPrice: 20 },
  { name: 'พริกแดง', qty: 8, unitPrice: 60 },
  { name: 'กะหล่ำปลี', qty: 15, unitPrice: 20 },
  { name: 'ต้นหอม', qty: 1, unitPrice: 90 },
  { name: 'ผักชี', qty: 1, unitPrice: 100 },
  { name: 'ผักชีฝรั่ง', qty: 1, unitPrice: 70 },
  { name: 'ผักกาดหอม', qty: 3, unitPrice: 0 },
  { name: 'มะเขือม่วง', qty: 1, unitPrice: 0 },
]
assert.strictEqual(sumLineItems(bill1840), 1840)                 // ยอดที่โชว์
assert.strictEqual(unpricedItems(bill1840).length, 2)            // ...แต่ยังไม่ครบ
assert.strictEqual(unpricedItems(bill1840)[0].name, 'ผักกาดหอม')

assert.deepStrictEqual(unpricedItems([]), [])                    // ไม่มีรายการ
assert.deepStrictEqual(unpricedItems(null), [])                  // บิล simple: lineItems = null
assert.deepStrictEqual(unpricedItems(undefined), [])
assert.strictEqual(unpricedItems([{ name: 'x', qty: 1, unitPrice: '0' }]).length, 1)  // JSON ส่ง string มา
assert.strictEqual(unpricedItems([{ name: 'x', qty: 1, unitPrice: 0.5 }]).length, 0)  // มีราคาแล้ว
assert.strictEqual(unpricedItems([null, { qty: 1, unitPrice: 0 }]).length, 1)         // แถวเสียไม่ทำพัง
assert.strictEqual(unpricedItems([{ qty: 1, unitPrice: 0 }, { qty: 2, unitPrice: 0 }]).length, 2) // ฿0 ทั้งใบ

// ── billsWithUnpricedItems: เตือนเฉพาะใบที่ยังรอจ่าย ──────────────────
const queue = [
  { id: 'a', status: 'pending',  lineItems: bill1840 },                            // ต้องเตือน
  { id: 'b', status: 'pending',  lineItems: [{ qty: 1, unitPrice: 50 }] },          // ราคาครบ
  { id: 'c', status: 'pending',  lineItems: null },                                 // บิล simple
  { id: 'd', status: 'paid',     lineItems: bill1840 },                             // จ่ายแล้ว ไม่เตือน
  { id: 'e', status: 'rejected', lineItems: bill1840 },                             // ปฏิเสธแล้ว ไม่เตือน
]
assert.deepStrictEqual(billsWithUnpricedItems(queue), ['a'])
assert.deepStrictEqual(billsWithUnpricedItems([]), [])
assert.deepStrictEqual(billsWithUnpricedItems(null), [])

console.log('pending-bills-logic.test.mjs OK')
