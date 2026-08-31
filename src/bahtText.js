// แปลงจำนวนเงินเป็นตัวอักษรไทย — ใช้บนใบวางบิล/ใบสำคัญจ่าย กันแก้ตัวเลขทีหลัง
// ponytail: อัลกอริทึมมาตรฐาน ไม่มี dependency · เพดาน: รองรับถึงหลักล้านล้าน พอสำหรับบิลวัตถุดิบ

const DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

// อ่านเลขไม่เกิน 6 หลัก (0–999,999)
function readGroup(n) {
  if (n === 0) return ''
  const s = String(n)
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i])
    const place = s.length - 1 - i
    if (d === 0) continue
    if (place === 1 && d === 1) out += 'สิบ'            // สิบ ไม่ใช่ หนึ่งสิบ
    else if (place === 1 && d === 2) out += 'ยี่สิบ'     // ยี่สิบ ไม่ใช่ สองสิบ
    else if (place === 0 && d === 1 && s.length > 1) out += 'เอ็ด'  // ยี่สิบเอ็ด ไม่ใช่ ยี่สิบหนึ่ง
    else out += DIGITS[d] + PLACES[place]
  }
  return out
}

// เลขเต็มจำนวน — ตัดเป็นกลุ่มละ 6 หลักแล้วต่อด้วย "ล้าน"
function readInteger(n) {
  if (n === 0) return 'ศูนย์'
  let out = ''
  const groups = []
  let rest = n
  while (rest > 0) { groups.unshift(rest % 1000000); rest = Math.floor(rest / 1000000) }
  groups.forEach((g, i) => {
    if (g === 0) return
    // กลุ่มท้ายที่เป็น 1 หลังหลักล้าน อ่านว่า "เอ็ด" เช่น 1,000,001 = หนึ่งล้านเอ็ด
    out += (i > 0 && g === 1) ? 'เอ็ด' : readGroup(g)
    const millions = groups.length - 1 - i
    out += 'ล้าน'.repeat(millions)
  })
  return out
}

/**
 * @param {number} amount จำนวนเงินบาท (ทศนิยม = สตางค์)
 * @returns {string} เช่น 2141 → "สองพันหนึ่งร้อยสี่สิบเอ็ดบาทถ้วน"
 */
export function bahtText(amount) {
  const n = Number(amount)
  if (!isFinite(n)) return ''
  const neg = n < 0
  // ปัดที่สตางค์ก่อนแยกส่วน กัน 0.005 ปัดขึ้นแล้วบาทไม่ตาม
  const total = Math.round(Math.abs(n) * 100)
  const baht = Math.floor(total / 100)
  const satang = total % 100
  const head = neg ? 'ลบ' : ''
  if (satang === 0) return `${head}${readInteger(baht)}บาทถ้วน`
  return `${head}${readInteger(baht)}บาท${readInteger(satang)}สตางค์`
}
