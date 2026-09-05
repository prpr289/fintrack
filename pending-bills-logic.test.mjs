// Run: node pending-bills-logic.test.mjs
import assert from 'node:assert'
import {
  NO_BILL_CAP, validateBillInput, checkNoBillCap, isWeakEvidence, dupKey, weakRatioByUser, duplicateIds, sumLineItems, validateLineItems,
  unpricedItems, billsWithUnpricedItems, droppedRows, unpricedBillIds, sameGoods, canonicalItems,
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

// ── droppedRows: แถวที่ modal ทิ้งเงียบทั้งที่ผู้ใช้พิมพ์ไปแล้ว ────────────
// ตัวกรองจริงของ modal: name.trim() && Number(qty) > 0 && Number(unitPrice) >= 0
const keptPriceBlank = { name: 'ผักกาดหอม', qty: 3, unitPrice: '' }   // Number('')=0, 0>=0 ผ่าน
assert.deepStrictEqual(droppedRows([keptPriceBlank]), [])             // ไม่ถูกทิ้ง -> unpricedItems จับต่อ
assert.strictEqual(unpricedItems([keptPriceBlank]).length, 1)         // และจับได้จริง

// ที่หายเงียบจริงมีสองแบบ
const noQty = { name: 'ผักกาดหอม', qty: '', unitPrice: 20 }
const noName = { name: '', qty: 5, unitPrice: 150 }                   // ช่องยอดเคยโชว์ ฿750 ทั้งที่ถูกทิ้ง
assert.strictEqual(droppedRows([noQty])[0].reason, 'ยังไม่ใส่จำนวน')
assert.strictEqual(droppedRows([noQty])[0].name, 'ผักกาดหอม')
assert.strictEqual(droppedRows([noName])[0].reason, 'ไม่มีชื่อรายการ')
assert.strictEqual(droppedRows([{ name: 'x', qty: 0, unitPrice: 5 }])[0].reason, 'ยังไม่ใส่จำนวน')

// แถวว่างเปล่าที่ modal เติมไว้ให้พิมพ์ ไม่ใช่ความผิดพลาด ห้ามเตือน
assert.deepStrictEqual(droppedRows([{ name: '', qty: '', unitPrice: '' }]), [])
assert.deepStrictEqual(droppedRows([{}]), [])
assert.deepStrictEqual(droppedRows([]), [])
assert.deepStrictEqual(droppedRows(null), [])
assert.deepStrictEqual(droppedRows([null]), [])

// index ต้องชี้แถวจริงเพื่อไฮไลต์ได้ถูกตัว
const mixed = [{ name: 'ก', qty: 1, unitPrice: 10 }, noQty, { name: 'ค', qty: 2, unitPrice: 5 }, noName]
assert.deepStrictEqual(droppedRows(mixed).map(r => r.index), [1, 3])
assert.strictEqual(sumLineItems(mixed.filter(it => String(it.name||'').trim() && Number(it.qty)>0 && Number(it.unitPrice)>=0)), 20)

// ── unpricedBillIds: ตัวใหม่ที่เลือกสถานะได้ (ของเดิมล็อก pending ห้ามแก้) ──
const zero = [{ name: 'x', qty: 1, unitPrice: 0 }]
const q = [
  { id: 'p', status: 'pending', lineItems: zero },
  { id: 'd', status: 'paid', lineItems: zero },
  { id: 'r', status: 'rejected', lineItems: zero },
  { id: 'ok', status: 'paid', lineItems: [{ name: 'y', qty: 1, unitPrice: 9 }] },
]
assert.deepStrictEqual(unpricedBillIds(q), ['p'])                        // default = pending เท่านั้น
assert.deepStrictEqual(unpricedBillIds(q, ['paid']), ['d'])              // จ่ายไปแล้วทั้งที่ยอดขาด
assert.deepStrictEqual(unpricedBillIds(q, ['pending', 'paid']), ['p', 'd'])
assert.deepStrictEqual(unpricedBillIds([], ['paid']), [])
assert.deepStrictEqual(unpricedBillIds(null), [])
// ของเดิมต้องไม่เปลี่ยนพฤติกรรม
assert.deepStrictEqual(billsWithUnpricedItems(q), ['p'])

// ── sameGoods: เทียบ "ของ" ไม่ใช่ไบต์ ────────────────────────────────
// เหตุที่ต้องมี: GoodsReceiptModal เก็บ qty/unitPrice เป็น string ดิบจากช่องกรอก
// (PendingBills.jsx: lineItems: validItems) ส่วน BillingLinkModal กับ EditBillModal
// ส่งเป็น number การเทียบ JSON ตรง ๆ จึงบอกว่า "ของเปลี่ยน" ทุกครั้งที่แก้ใบรับของ
// แล้วลบลายเซ็นคู่ค้าทิ้ง ทั้งที่ของไม่ได้เปลี่ยน และใบรับของเซ็นใหม่ไม่ได้
const storedGoodsReceipt = [{ name: 'หมู', qty: '4', unit: 'กก.', unitPrice: '120' }]
const sentFromEditModal = [{ name: 'หมู', qty: 4, unit: 'กก.', unitPrice: 120 }]
assert.strictEqual(JSON.stringify(sentFromEditModal) === JSON.stringify(storedGoodsReceipt), false) // เทียบไบต์หลอก
assert.strictEqual(sameGoods(sentFromEditModal, storedGoodsReceipt), true)   // เทียบของ ถูกต้อง

assert.strictEqual(sameGoods([{ name: ' หมู ', qty: '4', unitPrice: 120 }], [{ name: 'หมู', qty: 4, unitPrice: '120' }]), true) // ช่องว่างหัวท้าย
assert.strictEqual(sameGoods([{ name: 'x', qty: 1, unitPrice: 0 }], [{ name: 'x', qty: 1, unitPrice: '' }]), true) // ราคาว่าง = 0
assert.strictEqual(sameGoods([{ name: 'x', qty: 1, unitPrice: 5, unit: undefined }], [{ name: 'x', qty: 1, unitPrice: 5, unit: '' }]), true)
// สลับลำดับแถวไม่ได้แปลว่าของเปลี่ยน
assert.strictEqual(sameGoods([{ name: 'ข', qty: 1, unitPrice: 2 }, { name: 'ก', qty: 1, unitPrice: 1 }],
                             [{ name: 'ก', qty: 1, unitPrice: 1 }, { name: 'ข', qty: 1, unitPrice: 2 }]), true)
// ของเปลี่ยนจริงต้องจับได้ทุกแบบ
assert.strictEqual(sameGoods([{ name: 'ไก่', qty: 4, unitPrice: 120 }], storedGoodsReceipt), false) // เปลี่ยนชื่อของ
assert.strictEqual(sameGoods([{ name: 'หมู', qty: 5, unitPrice: 120 }], storedGoodsReceipt), false) // เปลี่ยนจำนวน
assert.strictEqual(sameGoods([{ name: 'หมู', qty: 4, unitPrice: 130 }], storedGoodsReceipt), false) // เปลี่ยนราคา
assert.strictEqual(sameGoods([{ name: 'หมู', qty: 4, unit: 'ขีด', unitPrice: 120 }], storedGoodsReceipt), false) // เปลี่ยนหน่วย
assert.strictEqual(sameGoods([...storedGoodsReceipt, { name: 'ไก่', qty: 1, unitPrice: 0 }], storedGoodsReceipt), false) // เพิ่มแถว
assert.strictEqual(sameGoods([], storedGoodsReceipt), false)
// สลับยอดกันระหว่างสองแถว = ของคนละชุด ต้องจับได้ (กันการเรียงกลบความต่าง)
assert.strictEqual(sameGoods([{ name: 'ก', qty: 1, unitPrice: 2 }, { name: 'ข', qty: 1, unitPrice: 1 }],
                             [{ name: 'ก', qty: 1, unitPrice: 1 }, { name: 'ข', qty: 1, unitPrice: 2 }]), false)
// ข้อมูลพิการต้องไม่ทำให้พัง
assert.strictEqual(sameGoods(null, null), true)
assert.strictEqual(sameGoods(null, []), true)
assert.strictEqual(sameGoods([null, { name: 'x', qty: 1, unitPrice: 1 }], [{ name: 'x', qty: 1, unitPrice: 1 }]), true)
assert.strictEqual(canonicalItems(null).length, 0)
// ต้องแปลงเป็น "ตัวเลข" จริง ไม่ใช่แค่ทำให้เป็นสตริงเหมือนกัน — ผู้ใช้พิมพ์ 4.0 ก็คือ 4
assert.strictEqual(sameGoods([{ name: 'x', qty: '4.0', unitPrice: '5.00' }], [{ name: 'x', qty: 4, unitPrice: 5 }]), true)
assert.strictEqual(sameGoods([{ name: 'x', qty: 0, unitPrice: 1 }], [{ name: 'x', qty: '', unitPrice: 1 }]), true)

console.log('pending-bills-logic.test.mjs OK')
