// Run: node vendor-dedupe.test.mjs
import assert from 'node:assert'
import { normalizeVendorName, editDistance, similarity, findDuplicatePairs } from './vendor-dedupe.mjs'

// --- normalizeVendorName: ตัดคำนำหน้าที่ไม่ใช่ชื่อจริง ---
assert.strictEqual(normalizeVendorName('นางสาว กรกมล ธรรมรัตน์'), 'กรกมล ธรรมรัตน์')
assert.strictEqual(normalizeVendorName('นาง จรีพร แก้วอ่อน'), 'จรีพร แก้วอ่อน')
assert.strictEqual(normalizeVendorName('บจก. สดดี (หาดใหญ่)'), 'สดดี')   // ตัดสาขาในวงเล็บ
assert.strictEqual(normalizeVendorName('บริษัท ภิรมย์ เอ็มดี'), 'ภิรมย์ เอ็มดี')
assert.strictEqual(normalizeVendorName('  Siam   Makro '), 'siam makro')  // ยุบวรรค + ตัวพิมพ์เล็ก
assert.strictEqual(normalizeVendorName(''), '')
assert.strictEqual(normalizeVendorName(null), '')
// ตัดเฉพาะหน้าสุด ห้ามตัดกลางชื่อ
assert.strictEqual(normalizeVendorName('ข้าวนาย ก'), 'ข้าวนาย ก')

// --- editDistance ---
assert.strictEqual(editDistance('abc', 'abc'), 0)
assert.strictEqual(editDistance('abc', 'abd'), 1)
assert.strictEqual(editDistance('', 'abc'), 3)

// --- similarity: เคสจริงจาก production ---
// คู่นี้คือคนเดียวกัน ชื่อล่างสะกดตก น์ — ต้องจับได้
assert.ok(similarity('กรกมล ธรรมรัตน์', 'นางสาว กรกมล ธรรมรัต') >= 0.85,
  'ต้องจับคู่ชื่อสะกดตกได้ ได้ ' + similarity('กรกมล ธรรมรัตน์', 'นางสาว กรกมล ธรรมรัต'))

// ต่างกันแค่คำนำหน้า = ร้านเดียวกันแน่นอน
assert.strictEqual(similarity('บจก. สดดี', 'สดดี'), 1)

// คนละร้านชัดเจน ห้ามจับคู่
assert.ok(similarity('มะละกอ', 'กระเทียม') < 0.5)
assert.ok(similarity('นาง จรีพร แก้วอ่อน', 'นาง กฤษณา ชุณหสุนทร') < 0.82)

// ชื่อสั้นห้ามจับคู่มั่ว — CFW / CF ต่างกันตัวเดียวแต่คนละร้านได้
assert.strictEqual(similarity('CFW', 'CF'), 0)

// ⚠️ ข้อจำกัดที่ยอมรับ: ไทย↔อังกฤษของร้านเดียวกัน จับไม่ได้
// ทดสอบไว้เพื่อบันทึกพฤติกรรมจริง ไม่ใช่เพื่ออวดว่าทำได้
assert.ok(similarity('Siam Makro', 'แม็คโคร') < 0.82,
  'ยอมรับว่าจับไทย-อังกฤษไม่ได้ ต้องมีปุ่มรวมด้วยมือ')

// --- findDuplicatePairs ---
const vendors = [
  { id: 'a', vendorName: 'กรกมล ธรรมรัตน์', occurrenceCount: 23 },
  { id: 'b', vendorName: 'นางสาว กรกมล ธรรมรัต', occurrenceCount: 20 },
  { id: 'c', vendorName: 'Siam Makro', occurrenceCount: 62 },
  { id: 'd', vendorName: 'แม็คโคร', occurrenceCount: 45 },
  { id: 'e', vendorName: 'พัสดุ', occurrenceCount: 44 },
]
const pairs = findDuplicatePairs(vendors)
assert.strictEqual(pairs.length, 1, 'ควรเจอคู่เดียว (กรกมล) ได้ ' + pairs.length)
// ร้านที่ใช้บ่อยกว่าต้องเป็นตัวที่อยู่รอด
assert.strictEqual(pairs[0].keep.id, 'a')
assert.strictEqual(pairs[0].drop.id, 'b')
assert.ok(pairs[0].reason.length > 0)

// ไม่มีข้อมูล / ข้อมูลพัง ต้องไม่ระเบิด
assert.deepStrictEqual(findDuplicatePairs([]), [])
assert.deepStrictEqual(findDuplicatePairs(null), [])
assert.deepStrictEqual(findDuplicatePairs([{ id: 'x' }, null]), [])

// คู่ที่ต่างกันแค่คำนำหน้า ต้องได้คะแนนเต็มและมาก่อน
const withExact = findDuplicatePairs([
  { id: 'p', vendorName: 'กรกมล ธรรมรัตน์', occurrenceCount: 23 },
  { id: 'q', vendorName: 'นางสาว กรกมล ธรรมรัต', occurrenceCount: 20 },
  { id: 'r', vendorName: 'บจก. สดดี', occurrenceCount: 26 },
  { id: 's', vendorName: 'สดดี', occurrenceCount: 5 },
])
assert.strictEqual(withExact[0].score, 1)
assert.strictEqual(withExact[0].keep.id, 'r')

console.log('vendor-dedupe: ผ่านหมด ✓')
