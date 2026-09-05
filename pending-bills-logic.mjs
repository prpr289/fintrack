// Pure business rules for pending expense bills — dependency-free.
// Shared by worker.js (wrangler bundles the relative import) and the test.
// ponytail: keep the money/rules logic here so it has one runnable check.
export const NO_BILL_CAP = 1000
export const EVIDENCE_TYPES = ['slip_transfer', 'receipt', 'self_declared']
const PAYEE_TYPES = ['employee', 'vendor', 'other']
const SCOPES = ['business', 'personal']

export function validateBillInput(input) {
  const { name, amount, scope, payeeType, evidenceType } = input || {}
  if (!name || !String(name).trim()) return { ok: false, error: 'ต้องมีชื่อรายการ' }
  if (!(Number(amount) > 0)) return { ok: false, error: 'จำนวนเงินต้องมากกว่า 0' }
  if (!SCOPES.includes(scope)) return { ok: false, error: 'scope ไม่ถูกต้อง' }
  if (!PAYEE_TYPES.includes(payeeType)) return { ok: false, error: 'ปลายทางไม่ถูกต้อง' }
  if (!EVIDENCE_TYPES.includes(evidenceType)) return { ok: false, error: 'ประเภทหลักฐานไม่ถูกต้อง' }
  return { ok: true }
}

export function checkNoBillCap(evidenceType, amount, cap = NO_BILL_CAP) {
  if (evidenceType === 'self_declared' && Number(amount) > cap) {
    return { ok: false, error: `เกินเพดานบิลไม่มีบิล (฿${cap}) ต้องจ่ายแบบโอน` }
  }
  return { ok: true }
}

export function isWeakEvidence(evidenceType) {
  return evidenceType === 'self_declared'
}

export function dupKey(bill) {
  const payee = bill.payeeRefId || bill.payeeName || ''
  return `${payee}|${bill.amount}|${bill.date}`
}

export function weakRatioByUser(bills) {
  const acc = {}
  for (const b of bills) {
    const u = b.submittedByUserId
    if (!acc[u]) acc[u] = { weak: 0, total: 0 }
    acc[u].total += Number(b.amount)
    if (isWeakEvidence(b.evidenceType)) acc[u].weak += Number(b.amount)
  }
  const out = {}
  for (const u of Object.keys(acc)) {
    out[u] = acc[u].total > 0 ? Math.round((acc[u].weak / acc[u].total) * 100) : 0
  }
  return out
}

export function duplicateIds(bills) {
  const byKey = {}
  for (const b of bills) {
    const k = dupKey(b)
    ;(byKey[k] = byKey[k] || []).push(b.id)
  }
  const out = new Set()
  for (const k of Object.keys(byKey)) {
    if (byKey[k].length > 1) byKey[k].forEach(id => out.add(id))
  }
  return out
}

export function sumLineItems(items) {
  return Math.round((items || []).reduce((s, it) => s + Number(it.qty) * Number(it.unitPrice), 0) * 100) / 100
}

export function validateLineItems(items) {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'ต้องมีอย่างน้อย 1 รายการ' }
  for (const it of items) {
    if (!it || !String(it.name || '').trim()) return { ok: false, error: 'ชื่อรายการห้ามว่าง' }
    if (!(Number(it.qty) > 0)) return { ok: false, error: 'จำนวนต้องมากกว่า 0' }
    if (!(Number(it.unitPrice) >= 0)) return { ok: false, error: 'ราคา/หน่วยไม่ถูกต้อง' }
  }
  return { ok: true }
}

// ── เพิ่มใหม่ (additive) — ไม่แตะฟังก์ชันด้านบน เพราะ worker.js import ไฟล์นี้อยู่ ──
// ของที่รับมาแล้วแต่ยังไม่ได้ลงราคา: qty ใส่แล้ว แต่ unitPrice ยังเป็น 0
// เจ้าของเคาะ 2026-09-04: unitPrice 0 = "ยังไม่ลงราคา" เสมอ (ไม่ใช่ของแถม) → เตือนทุกครั้ง
// เพราะยอดที่โชว์จะต่ำกว่ายอดจริง ถ้าจ่ายไปแล้วส่วนต่างจะตามไม่เจอ
export function unpricedItems(items) {
  return (items || []).filter(it => it && Number(it.unitPrice) === 0)
}

// นับใบที่ "ยอดยังไม่ครบ" — เฉพาะบิลที่ยังรอจ่าย เพราะจ่ายไปแล้วเตือนไม่ช่วยอะไร
export function billsWithUnpricedItems(bills) {
  return (bills || [])
    .filter(b => b.status === 'pending' && unpricedItems(b.lineItems).length > 0)
    .map(b => b.id)
}

// ── เฟส 2 (additive) — ยังไม่แตะของเดิมเหมือนเดิม เพราะ worker.js import ไฟล์นี้ ──

// แถวที่ตัวกรอง validItems ของ modal จะทิ้งทั้งที่ผู้ใช้พิมพ์อะไรลงไปแล้ว
// ตัวกรองจริงคือ: ชื่อไม่ว่าง && qty > 0 && unitPrice >= 0
// จุดที่คนสะดุด: Number('') === 0 ทำให้ "ราคาว่าง" ผ่าน (กลายเป็น ฿0 ซึ่ง unpricedItems จับได้)
// แต่ "จำนวนว่าง" ไม่ผ่าน (0 > 0 เป็นเท็จ) แถวจึงหายไปทั้งแถวโดยไม่มีอะไรบอก
export function droppedRows(items) {
  const out = []
  ;(items || []).forEach((it, index) => {
    if (!it) return
    const hasName = !!String(it.name || '').trim()
    const qtyOk = Number(it.qty) > 0
    const priceOk = Number(it.unitPrice) >= 0
    if (hasName && qtyOk && priceOk) return
    // แถวที่ยังว่างเปล่าทั้งแถวไม่ใช่ความผิดพลาด — เป็นแถวที่ modal เติมไว้ให้พิมพ์ต่อ
    const touched = hasName || String(it.qty ?? '') !== '' || String(it.unitPrice ?? '') !== ''
    if (!touched) return
    const reason = !hasName ? 'ไม่มีชื่อรายการ' : !qtyOk ? 'ยังไม่ใส่จำนวน' : 'ราคาไม่ถูกต้อง'
    out.push({ index, name: String(it.name || '').trim(), reason })
  })
  return out
}

// เหมือน billsWithUnpricedItems แต่เลือกสถานะได้ — ของเดิมล็อก pending ไว้และมีเทสต์ปักไว้แล้ว
// จึงเพิ่มตัวใหม่แทนการแก้ตัวเดิม (INTEGRATION_POLICY ข้อ 2)
export function unpricedBillIds(bills, statuses) {
  const allow = statuses && statuses.length ? statuses : ['pending']
  return (bills || [])
    .filter(b => allow.includes(b.status) && unpricedItems(b.lineItems).length > 0)
    .map(b => b.id)
}

// เทียบว่า "ของ" ชุดเดิมไหม — ห้ามเทียบ JSON ตรง ๆ เด็ดขาด
// GoodsReceiptModal เก็บ qty/unitPrice เป็น string ดิบจากช่องกรอก (lineItems: validItems)
// ส่วน BillingLinkModal กับ EditBillModal ส่งเป็น number (map ผ่าน Number())
// เทียบไบต์จึงบอกว่า "ของเปลี่ยน" ทุกครั้งที่แก้ใบรับของ แม้แก้แค่ชื่อ -> ลบลายเซ็นคู่ค้าทิ้งฟรี ๆ
// เรียงก่อนเทียบด้วย เพราะสลับลำดับแถวไม่ได้แปลว่าของเปลี่ยน
// worker กับหน้าเว็บต้องเรียกตัวนี้ตัวเดียวกัน ห้ามเขียนตรรกะเทียบซ้ำคนละที่
export function canonicalItems(items) {
  return (items || [])
    .filter(Boolean)
    .map(it => [
      String(it.name ?? '').trim(),
      Number(it.qty) || 0,
      String(it.unit ?? ''),
      Number(it.unitPrice) || 0,
    ].join('\u0001'))
    .sort()
}

export function sameGoods(a, b) {
  const x = canonicalItems(a), y = canonicalItems(b)
  return x.length === y.length && x.every((v, i) => v === y[i])
}
