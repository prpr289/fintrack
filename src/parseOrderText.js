// แตกข้อความสั่งของจากแชทไลน์ให้เป็นรายการ — regex ล้วน ไม่มี dependency
//
// ponytail: กฎง่าย ๆ ที่คนอ่านออก ดีกว่าเดาเก่ง — บรรทัดไหนแตกไม่ออกส่งคืนใน `unparsed`
// ให้คนกรอกเอง ห้ามเดาเงียบ ๆ เพราะข้อมูลผิดที่ไหลเข้าเงียบแพงกว่าไม่มีข้อมูล
//
// รูปแบบจริงจากกลุ่ม "บจก. สดดี | ตำมั้ย":
//   30/8/69
//   มะละกอ30กก.        ← ชื่อติดตัวเลข ไม่มีเว้นวรรค
//   แตงร้าน10กก.
//   มะเขือเทศ10กก.คะ   ← มีคำลงท้ายเกาะ

// เรียงยาวก่อนสั้น เพราะ alternation จับตัวแรกที่แมตช์ ('กิโลกรัม' ต้องมาก่อน 'กก')
const UNITS = [
  'กิโลกรัม', 'กิโล', 'ก.ก.', 'กก', 'โล',
  'กระสอบ', 'กล่อง', 'แพ็ค', 'แพ็ก', 'แพค', 'แพก', 'ถุง', 'ลัง', 'แผง', 'โหล',
  'ขีด', 'ฟอง', 'ใบ', 'ลูก', 'หัว', 'มัด', 'ตัว', 'ขวด', 'ชิ้น', 'กำ', 'ต้น',
].sort((a, b) => b.length - a.length)

// หน่วยน้ำหนักที่เขียนได้หลายแบบ ยุบให้เหลือแบบเดียว ไม่งั้น "โล" กับ "กก." จะนับแยกกันใน Dashboard
// ponytail: ยุบเฉพาะชื่อพ้อง ไม่แปลงค่า — 'ขีด' ยังเป็น 'ขีด' เพราะการแปลงหน่วยเป็นงานของ P2
const UNIT_ALIASES = { 'กก': 'กก.', 'ก.ก.': 'กก.', 'โล': 'กก.', 'กิโล': 'กก.', 'กิโลกรัม': 'กก.' }
export const DEFAULT_UNIT = 'กก.'

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const UNIT_ALT = UNITS.map(esc).join('|')

// <ชื่อ><จำนวน><หน่วย?> — จุดท้ายสุดเป็นของ "กก." ที่คนพิมพ์ติดมา
const LINE_RE = new RegExp(`^(.*?)(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_ALT})?\\s*\\.?$`)
const DATE_RE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/
// วันที่ปนอยู่กลางประโยค = ข้อความคุย ("ราคาวันที่29/8/69นะครับ") ไม่ใช่รายการสั่ง
// ถ้าไม่กันไว้ จะได้ของชื่อ "ราคาวันที่29/8/" จำนวน 69
const HAS_DATE_RE = /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/
const LIST_MARKER_RE = /^(?:[-•*·]|\d+[.)])\s*/
const POLITE_RE = /(?:\s*(?:นะ)?(?:ค่ะ|คะ|ครับ|คับ|จ้า|จ้ะ|จ๊ะ|ฮะ|นะ)\s*)+$/

// "30/8/69" = 30 ส.ค. พ.ศ. 2569 → คืน ISO. ปี 2 หลักถือเป็น พ.ศ. เสมอ (ร้านพิมพ์แบบนี้)
function toIsoDate(d, m, y) {
  let year = Number(y)
  if (String(y).length <= 2) year = 2500 + year
  if (year >= 2400) year -= 543
  const day = Number(d)
  const month = Number(m)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * @param {string} text ข้อความที่ก๊อปมาจากแชท
 * @returns {{deliveryDate: string|null, items: Array, unparsed: string[]}}
 *   items: { name, qty, unit, guessedUnit } — guessedUnit = true แปลว่าคนไม่ได้เขียนหน่วย
 *   ระบบเดา 'กก.' ให้ ต้องไฮไลต์ช่องนั้นให้คนตรวจ
 */
export function parseOrderText(text) {
  const items = []
  const unparsed = []
  let deliveryDate = null

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('@')) continue          // ข้อความคุยกันในกลุ่ม ไม่ใช่รายการสั่ง
    if (!/\d/.test(line)) continue              // ไม่มีตัวเลข = ไม่ใช่รายการ

    const asDate = line.match(DATE_RE)
    if (asDate) {
      const iso = toIsoDate(asDate[1], asDate[2], asDate[3])
      if (iso && !deliveryDate) deliveryDate = iso
      continue
    }
    if (HAS_DATE_RE.test(line)) continue         // ประโยคที่มีวันที่ปน = ข้อความคุย ข้ามเงียบได้ ไม่ใช่รายการที่แตกไม่ออก

    const cleaned = line.replace(LIST_MARKER_RE, '').replace(POLITE_RE, '').trim()
    const m = cleaned.match(LINE_RE)
    const name = m ? m[1].replace(/[-–:•]+\s*$/, '').trim() : ''

    if (!m || !name) { unparsed.push(line); continue }

    const qty = Number(m[2].replace(',', '.'))
    if (!(qty > 0)) { unparsed.push(line); continue }

    const typed = m[3]
    items.push({
      name,
      qty,
      unit: typed ? (UNIT_ALIASES[typed] || typed) : DEFAULT_UNIT,
      guessedUnit: !typed,
    })
  }

  return { deliveryDate, items, unparsed }
}
