// ตะกร้าสินค้าประจำของแต่ละคู่ค้า — logic ล้วน ไม่มี dependency
// ใช้ร่วมกันสองฝั่ง: worker.js (upsert ตอนออกใบ) และหน้าจอ (จัดลำดับ/กันชื่อซ้ำ)
// ponytail: เก็บกฎการเทียบชื่อไว้ที่เดียว ไม่งั้นฝั่งเซิร์ฟกับฝั่งจอจะเทียบคนละแบบแล้วเกิดของซ้ำ

// กุญแจเทียบชื่อ — ตัดหัวท้าย ยุบช่องว่างซ้อน ไม่แปลงตัวพิมพ์เพราะภาษาไทยไม่มีเคส
// ตั้งใจไม่ตัดวรรคทั้งหมด: "หมู สับ" กับ "หมูสับ" อาจเป็นคนละอย่างจริง ให้คนรวมเองทีหลัง
export function itemKey(name) {
  return String(name || '').trim().replace(/\s+/g, ' ')
}

export function isValidItemName(name) {
  const k = itemKey(name)
  return k.length > 0 && k.length <= 120
}

// แปลงรายการในบิลเป็นแถวสำหรับ upsert เข้าตะกร้า — รวมชื่อซ้ำในใบเดียวกันให้เหลือแถวเดียว
// (คนกรอกมะละกอสองบรรทัดในใบเดียวได้ ตะกร้าไม่ควรมีสองแถว)
export function billItemsToBasketRows(lineItems) {
  const byKey = new Map()
  for (const it of lineItems || []) {
    const name = itemKey(it?.name)
    if (!name) continue
    const qty = Number(it?.qty)
    const price = Number(it?.unitPrice)
    const prev = byKey.get(name)
    if (prev) {
      prev.qty += Number.isFinite(qty) ? qty : 0
      // ราคาล่าสุดในใบเดียวกัน = แถวหลังสุดที่มีราคา > 0
      if (Number.isFinite(price) && price > 0) prev.unitPrice = price
      if (it?.unit) prev.unit = it.unit
    } else {
      byKey.set(name, {
        name,
        unit: it?.unit || null,
        unitPrice: Number.isFinite(price) && price > 0 ? price : null,
        qty: Number.isFinite(qty) ? qty : 0,
      })
    }
  }
  return [...byKey.values()]
}

// ลำดับที่หน้าจอควรโชว์: ซื้อบ่อยก่อน แล้วค่อยล่าสุด แล้วค่อยชื่อ
// ของที่ปิดใช้งานไปกองท้ายเสมอ ไม่ลบทิ้งเพราะยังต้องอ้างอิงบิลเก่า
export function sortBasket(items) {
  return [...(items || [])].sort((a, b) => {
    if (!!a.isActive !== !!b.isActive) return a.isActive ? -1 : 1
    const t = (Number(b.timesBought) || 0) - (Number(a.timesBought) || 0)
    if (t !== 0) return t
    const d = String(b.lastBoughtAt || '').localeCompare(String(a.lastBoughtAt || ''))
    if (d !== 0) return d
    return String(a.name || '').localeCompare(String(b.name || ''), 'th')
  })
}

// รายการที่ไม่ได้ซื้อเกิน N วัน = ควรซ่อน (ไม่ลบ) — หน้าจอเอาไปทำปุ่ม "ซ่อนของที่ไม่ได้ซื้อนาน"
export function isStale(item, now, days = 180) {
  if (!item?.lastBoughtAt) return false
  const t = Date.parse(String(item.lastBoughtAt).replace(' ', 'T') + 'Z')
  if (!Number.isFinite(t)) return false
  return (now - t) > days * 86400000
}
