// Run: node src/parseOrderText.test.mjs
import assert from 'node:assert'
import { parseOrderText, DEFAULT_UNIT } from './parseOrderText.js'

// --- ข้อความจริงจากกลุ่ม "บจก. สดดี | ตำมั้ย" 29 ส.ค. 69 ---
const real = parseOrderText(`30/8/69
มะละกอ30กก.
แตงร้าน10กก.
มะเขือเทศ10กก.คะ`)
assert.strictEqual(real.deliveryDate, '2026-08-30')          // พ.ศ. 69 → ค.ศ. 2026
assert.strictEqual(real.unparsed.length, 0)
assert.deepStrictEqual(real.items, [
  { name: 'มะละกอ', qty: 30, unit: 'กก.', guessedUnit: false },
  { name: 'แตงร้าน', qty: 10, unit: 'กก.', guessedUnit: false },
  { name: 'มะเขือเทศ', qty: 10, unit: 'กก.', guessedUnit: false },  // "คะ" ถูกตัดก่อนแยก
])

// --- ข้อความคุยในกลุ่มเดียวกัน ต้องไม่กลายเป็นรายการ ---
const noise = parseOrderText(`@MOB มะละกอขอสวยๆ คัดให้หน่อยนะคะ
ราคาวันที่29/8/69นะครับ
สวัสดีครับ
มะนาว5กก.`)
assert.deepStrictEqual(noise.items.map(i => i.name), ['มะนาว'])
assert.strictEqual(noise.deliveryDate, null)   // 29/8/69 ติดอยู่ในประโยค ไม่ใช่บรรทัดวันที่ล้วน
// ประโยคที่มีวันที่ปน = ข้อความคุย ข้ามเงียบ ไม่ต้องไปกวนคนด้วยแถวว่าง
// (ถ้าไม่กัน จะได้ของชื่อ "ราคาวันที่29/8/" จำนวน 69 — เคยพลาดมาแล้ว)
assert.deepStrictEqual(noise.unparsed, [])

// --- คนละคนพิมพ์คนละแบบ: หัวข้อเลข เว้นวรรค คำลงท้ายหลายแบบ ---
const styles = parseOrderText(`1. มะละกอ 20 กก
2) มะนาว 5กก.ครับ
- พริกขี้หนูสวน 3 กก
• กระเทียม 4 กก จ้า`)
assert.deepStrictEqual(styles.items.map(i => `${i.name}|${i.qty}|${i.unit}`), [
  'มะละกอ|20|กก.', 'มะนาว|5|กก.', 'พริกขี้หนูสวน|3|กก.', 'กระเทียม|4|กก.',
])

// --- ไม่เขียนหน่วย → เดา กก. ให้ แต่ต้องติดธงให้คนตรวจ ---
const noUnit = parseOrderText('มะละกอ 30')
assert.deepStrictEqual(noUnit.items, [{ name: 'มะละกอ', qty: 30, unit: DEFAULT_UNIT, guessedUnit: true }])

// --- หน่วยน้ำหนักเขียนได้หลายแบบ ต้องยุบเป็นอันเดียว ไม่งั้น Dashboard นับแยก ---
for (const u of ['กก.', 'กก', 'โล', 'กิโล', 'กิโลกรัม', 'ก.ก.']) {
  const r = parseOrderText(`มะละกอ 10${u}`)
  assert.strictEqual(r.items.length, 1, `พัง: ${u}`)
  assert.strictEqual(r.items[0].unit, 'กก.', `ไม่ยุบหน่วย: ${u}`)
  assert.strictEqual(r.items[0].guessedUnit, false, `ควรรู้ว่าคนเขียนหน่วยเอง: ${u}`)
}

// --- หน่วยอื่นเก็บตามที่พิมพ์ ไม่แปลงค่า (การแปลงหน่วยเป็นงาน P2) ---
const others = parseOrderText(`น้ำมันพืช 5 ลัง
ไข่ไก่ 30 ฟอง
พริกแกง 2 ถุง
ข่า 5 ขีด`)
assert.deepStrictEqual(others.items.map(i => i.unit), ['ลัง', 'ฟอง', 'ถุง', 'ขีด'])

// --- ชื่อของมีตัวเลขอยู่ในตัว ต้องไม่ตัดผิดที่ ---
const digits = parseOrderText('ไข่ไก่เบอร์2 30ฟอง')
assert.deepStrictEqual(digits.items, [{ name: 'ไข่ไก่เบอร์2', qty: 30, unit: 'ฟอง', guessedUnit: false }])

// --- น้ำหนักที่ชั่งได้จริงมักมีทศนิยม ---
assert.strictEqual(parseOrderText('มะละกอ 28.5 กก.').items[0].qty, 28.5)
assert.strictEqual(parseOrderText('มะละกอ 28,5 กก.').items[0].qty, 28.5)  // คนไทยพิมพ์ , แทนจุดบ่อย

// --- แตกไม่ออกต้องคืนบรรทัดเดิม ห้ามทิ้งเงียบ ---
const bad = parseOrderText(`หมู 1,200 บาท
30 กก.
มะนาว 0 กก.`)
assert.strictEqual(bad.items.length, 0)
assert.strictEqual(bad.unparsed.length, 3)   // ไม่มีชื่อ / จำนวนเป็น 0 → ให้คนกรอกเอง

// --- รูปแบบวันที่อื่น ๆ ---
assert.strictEqual(parseOrderText('30/08/2569').deliveryDate, '2026-08-30')
assert.strictEqual(parseOrderText('30-8-69').deliveryDate, '2026-08-30')
assert.strictEqual(parseOrderText('1/9/2026').deliveryDate, '2026-09-01')   // ปี ค.ศ. เต็มก็รับ
assert.strictEqual(parseOrderText('45/8/69').deliveryDate, null)            // วันที่ไม่มีจริง → ไม่เดา

// --- ข้อความว่าง ---
assert.deepStrictEqual(parseOrderText(''), { deliveryDate: null, items: [], unparsed: [] })
assert.deepStrictEqual(parseOrderText(null), { deliveryDate: null, items: [], unparsed: [] })

// --- ยอดรวมต้องตรงกับที่ sumLineItems คิด หลังเติมราคา ---
const order = parseOrderText(`30/8/69
มะละกอ30กก.
แตงร้าน10กก.
มะเขือเทศ10กก.คะ`)
const prices = { 'มะละกอ': 28, 'แตงร้าน': 22, 'มะเขือเทศ': 35 }
const total = order.items.reduce((s, it) => s + it.qty * prices[it.name], 0)
assert.strictEqual(total, 1410)

console.log('parseOrderText: ผ่านหมด ✓')
