// ตรวจหาชื่อร้านที่น่าจะเป็นร้านเดียวกัน — logic ล้วน ไม่มี dependency
//
// ที่มา: ร้านค้าถูกสร้างอัตโนมัติตอนระบบอ่านสลิป โดยจับคู่ชื่อแบบตรงตัวเป๊ะ
// (vendor_name = ? COLLATE NOCASE) สะกดต่างนิดเดียวก็กลายเป็นคนละร้าน
// ผลจริงบน production: 354 ร้าน มีทั้งชื่อซ้ำ ชื่อสะกดตก และคำที่ไม่ใช่ชื่อร้าน
//
// ⚠️ ข้อจำกัดที่ต้องรู้: ตัวนี้จับ "Siam Makro" กับ "แม็คโคร" ไม่ได้
// เพราะเป็นคนละภาษาและไม่มีสัญญาณอื่นให้ยึด (เลขบัญชี/เลขภาษีว่างทั้งหมด)
// หน้าจอจึงต้องมีปุ่มรวมด้วยมือควบคู่เสมอ ไม่ใช่พึ่งตัวนี้อย่างเดียว
//
// ponytail: ไม่รวมให้อัตโนมัติเด็ดขาด — เสนอคู่ให้คนกด เพราะรวมผิดแล้วแก้กลับยาก

// คำนำหน้าที่ไม่ได้เป็นส่วนหนึ่งของชื่อจริง ตัดทิ้งก่อนเทียบ
const PREFIXES = [
  'บริษัทจำกัด', 'บริษัท', 'บจก.', 'บจก', 'หจก.', 'หจก', 'หสม.', 'ห้างหุ้นส่วนจำกัด',
  'นางสาว', 'น.ส.', 'นาง', 'นาย', 'คุณ', 'ร้าน', 'บมจ.', 'บมจ',
]

// ยุบชื่อให้เหลือแก่น: ตัดคำนำหน้า วงเล็บ เครื่องหมาย และช่องว่างซ้อน
export function normalizeVendorName(name) {
  let s = String(name || '').trim()
  if (!s) return ''
  s = s.replace(/\([^)]*\)/g, ' ')          // (หาดใหญ่) ไม่ใช่ชื่อร้าน เป็นสาขา
  s = s.replace(/[.,\-–—_/\\'"]/g, ' ')
  for (const p of PREFIXES) {
    // ตัดเฉพาะตอนอยู่หน้าสุด ไม่ตัดกลางชื่อ
    if (s.startsWith(p)) { s = s.slice(p.length); break }
  }
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

// ระยะแก้ไข (Levenshtein) — ใช้เทียบชื่อที่สะกดตกหล่น
export function editDistance(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]
}

// 0–1 · ยิ่งสูงยิ่งน่าจะเป็นร้านเดียวกัน
export function similarity(nameA, nameB) {
  const a = normalizeVendorName(nameA)
  const b = normalizeVendorName(nameB)
  if (!a || !b) return 0
  if (a === b) return 1                       // ต่างกันแค่คำนำหน้า/วรรค/วงเล็บ
  const short = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  // ชื่อสั้นเกินไปเทียบไม่ได้ — "CFW" กับ "CF" ไม่ควรถือว่าซ้ำ
  if (short.length < 4) return 0
  if (long.startsWith(short) || long.includes(short)) return 0.9
  const d = editDistance(a, b)
  const ratio = 1 - d / long.length
  return ratio > 0 ? ratio : 0
}

/**
 * หาคู่ที่น่าจะซ้ำ — คืนเรียงจากมั่นใจมากไปน้อย
 * @param {Array} vendors [{ id, vendorName, occurrenceCount, lastSeen }]
 * @param {number} minScore ค่าต่ำสุดที่จะเสนอ (0.82 = ต่างกันไม่เกินราว 2 ตัวอักษรในชื่อ 12 ตัว)
 */
export function findDuplicatePairs(vendors, minScore = 0.82, limit = 50) {
  const list = (vendors || []).filter(v => v && v.vendorName)
  const out = []
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const score = similarity(list[i].vendorName, list[j].vendorName)
      if (score < minScore) continue
      // ให้ร้านที่ใช้บ่อยกว่าเป็นตัวตั้ง (ตัวที่จะอยู่รอดหลังรวม)
      const [keep, drop] = (Number(list[i].occurrenceCount) || 0) >= (Number(list[j].occurrenceCount) || 0)
        ? [list[i], list[j]] : [list[j], list[i]]
      out.push({ keep, drop, score: Math.round(score * 100) / 100, reason: reasonFor(keep.vendorName, drop.vendorName, score) })
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}

function reasonFor(a, b, score) {
  if (score === 1) return 'ต่างกันแค่คำนำหน้าหรือวรรค'
  const na = normalizeVendorName(a), nb = normalizeVendorName(b)
  if (na.includes(nb) || nb.includes(na)) return 'ชื่อหนึ่งอยู่ในอีกชื่อ'
  return `สะกดต่างกัน ${editDistance(na, nb)} ตัวอักษร`
}
