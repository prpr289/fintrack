// Run: node audit-diff.test.mjs
import assert from 'node:assert'
import { diffFields, MONEY_FIELDS, FIELD_LABELS } from './audit-diff.mjs'

// --- เคสหลัก: staff แก้เลขบัญชี ต้องเก็บทั้งค่าเดิมและค่าใหม่ ---
const before = { vendor_name: 'บจก. สดดี', bank_account_no: '1234567890', phone: null }
const d = diffFields(before, [['bank_account_no', '9999999999'], ['phone', '081-000-0000']])
assert.strictEqual(d.count, 2)
assert.deepStrictEqual(d.changes.bank_account_no, { from: '1234567890', to: '9999999999', label: 'เลขบัญชี' })
assert.deepStrictEqual(d.changes.phone, { from: null, to: '081-000-0000', label: 'เบอร์โทร' })
// ต้องติดธงว่าแตะทางเดินเงิน
assert.deepStrictEqual(d.moneyChanged, ['bank_account_no'])

// --- ส่งมาแต่ค่าเท่าเดิม ไม่นับว่าแก้ (กันประวัติรกด้วยรายการที่ไม่ได้เปลี่ยนอะไร) ---
const same = diffFields({ phone: '081' }, [['phone', '081']])
assert.strictEqual(same.count, 0)
assert.deepStrictEqual(same.moneyChanged, [])

// --- ค่าว่างรูปแบบต่าง ๆ ถือว่าเท่ากันหมด ไม่ใช่การแก้ ---
assert.strictEqual(diffFields({ phone: null }, [['phone', '']]).count, 0)
assert.strictEqual(diffFields({ phone: '' }, [['phone', null]]).count, 0)
assert.strictEqual(diffFields({ phone: undefined }, [['phone', null]]).count, 0)

// --- เติมค่าตอนที่เดิมว่าง = ถือว่าแก้ ต้องบันทึก ---
const fill = diffFields({ bank_account_no: null }, [['bank_account_no', '5555']])
assert.strictEqual(fill.count, 1)
assert.strictEqual(fill.changes.bank_account_no.from, null)
assert.deepStrictEqual(fill.moneyChanged, ['bank_account_no'])

// --- ลบค่าทิ้ง = ถือว่าแก้เหมือนกัน ---
const clear = diffFields({ bank_account_no: '5555' }, [['bank_account_no', null]])
assert.strictEqual(clear.count, 1)
assert.strictEqual(clear.changes.bank_account_no.to, null)

// --- ตัวเลขกับสตริงที่ค่าเท่ากัน ไม่นับว่าแก้ (DB คืนเป็น number ได้) ---
assert.strictEqual(diffFields({ wht_rate: 3 }, [['wht_rate', '3']]).count, 0)
assert.strictEqual(diffFields({ is_active: 1 }, [['is_active', 1]]).count, 0)
assert.strictEqual(diffFields({ is_active: 1 }, [['is_active', 0]]).count, 1)

// --- ช่องทางเดินเงินต้องครบตามที่ตั้งใจ ---
assert.deepStrictEqual(MONEY_FIELDS, ['bank_account_no', 'bank_name', 'bank_account_name', 'promptpay_id'])
for (const f of MONEY_FIELDS) assert.ok(FIELD_LABELS[f], 'ช่องเงินต้องมีชื่อไทย: ' + f)

// --- ไม่มีข้อมูล / ข้อมูลพัง ต้องไม่ระเบิด ---
assert.strictEqual(diffFields(null, [['phone', 'x']]).count, 1)
assert.strictEqual(diffFields({}, null).count, 0)
assert.strictEqual(diffFields(null, null).count, 0)

// --- ช่องที่ไม่ได้ส่งมาแก้ ต้องไม่โผล่ในประวัติ ---
const partial = diffFields({ phone: '081', address: 'เดิม' }, [['phone', '082']])
assert.deepStrictEqual(Object.keys(partial.changes), ['phone'])

console.log('audit-diff: ผ่านหมด ✓')
