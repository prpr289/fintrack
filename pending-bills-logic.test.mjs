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
