// Run: node vendor-items-logic.test.mjs
import assert from 'node:assert'
import { itemKey, isValidItemName, billItemsToBasketRows, sortBasket, isStale } from './vendor-items-logic.mjs'

// --- itemKey: กฎเทียบชื่อต้องเหมือนกันทั้งสองฝั่ง ---
assert.strictEqual(itemKey('  มะละกอ  '), 'มะละกอ')
assert.strictEqual(itemKey('มะละกอ   ดิบ'), 'มะละกอ ดิบ')   // ยุบช่องว่างซ้อน
assert.strictEqual(itemKey('มะละกอ ดิบ'), 'มะละกอ ดิบ')     // ช่องว่างเดี่ยวคงไว้
assert.strictEqual(itemKey(null), '')
// ตั้งใจไม่ยุบวรรคทั้งหมด — "หมู สับ" กับ "หมูสับ" ต้องยังเป็นคนละกุญแจ
assert.notStrictEqual(itemKey('หมู สับ'), itemKey('หมูสับ'))

assert.strictEqual(isValidItemName('มะละกอ'), true)
assert.strictEqual(isValidItemName('   '), false)
assert.strictEqual(isValidItemName('x'.repeat(121)), false)

// --- billItemsToBasketRows ---
const rows = billItemsToBasketRows([
  { name: 'มะละกอ', qty: 30, unit: 'กก.', unitPrice: 28 },
  { name: 'แตงร้าน', qty: 10, unit: 'กก.', unitPrice: 22 },
])
assert.strictEqual(rows.length, 2)
assert.deepStrictEqual(rows[0], { name: 'มะละกอ', unit: 'กก.', unitPrice: 28, qty: 30 })

// ชื่อซ้ำในใบเดียวกันต้องยุบเหลือแถวเดียว ไม่งั้นตะกร้าจะมีของซ้ำ
const dup = billItemsToBasketRows([
  { name: 'มะละกอ', qty: 10, unit: 'กก.', unitPrice: 28 },
  { name: ' มะละกอ ', qty: 20, unit: 'กก.', unitPrice: 30 },
])
assert.strictEqual(dup.length, 1)
assert.strictEqual(dup[0].qty, 30)          // จำนวนบวกกัน
assert.strictEqual(dup[0].unitPrice, 30)    // ราคาเอาแถวหลังสุดที่มีราคา

// ราคา 0 (ของแถม) ไม่ทับราคาจริงที่มีอยู่แล้ว
const freebie = billItemsToBasketRows([
  { name: 'ถุงหิ้ว', qty: 1, unit: 'ใบ', unitPrice: 5 },
  { name: 'ถุงหิ้ว', qty: 2, unit: 'ใบ', unitPrice: 0 },
])
assert.strictEqual(freebie[0].unitPrice, 5)

// ชื่อว่างต้องถูกทิ้ง ไม่หลุดเข้าตะกร้า
assert.strictEqual(billItemsToBasketRows([{ name: '  ', qty: 1, unitPrice: 1 }]).length, 0)
assert.strictEqual(billItemsToBasketRows(null).length, 0)

// --- sortBasket: ซื้อบ่อยก่อน · ปิดใช้งานไปท้ายเสมอ ---
const sorted = sortBasket([
  { name: 'ข', timesBought: 1, lastBoughtAt: '2026-08-30 10:00:00', isActive: true },
  { name: 'ก', timesBought: 5, lastBoughtAt: '2026-08-01 10:00:00', isActive: true },
  { name: 'ค', timesBought: 9, lastBoughtAt: '2026-08-31 10:00:00', isActive: false },
])
assert.deepStrictEqual(sorted.map(x => x.name), ['ก', 'ข', 'ค'])

// ซื้อเท่ากัน → เอาที่ซื้อล่าสุดขึ้นก่อน
const tie = sortBasket([
  { name: 'เก่า', timesBought: 2, lastBoughtAt: '2026-07-01 10:00:00', isActive: true },
  { name: 'ใหม่', timesBought: 2, lastBoughtAt: '2026-08-30 10:00:00', isActive: true },
])
assert.deepStrictEqual(tie.map(x => x.name), ['ใหม่', 'เก่า'])

// --- isStale ---
const now = Date.parse('2026-08-31T00:00:00Z')
assert.strictEqual(isStale({ lastBoughtAt: '2026-08-01 00:00:00' }, now), false)
assert.strictEqual(isStale({ lastBoughtAt: '2025-08-01 00:00:00' }, now), true)
assert.strictEqual(isStale({ lastBoughtAt: null }, now), false)   // ยังไม่เคยซื้อ = กรอกเองไว้ ไม่ใช่ของเก่า
assert.strictEqual(isStale({ lastBoughtAt: 'ไม่ใช่วันที่' }, now), false)

console.log('vendor-items-logic: ผ่านหมด ✓')
