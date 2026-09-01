// เทียบค่าก่อน–หลัง สำหรับเก็บลง audit log — logic ล้วน ไม่มี dependency
//
// ที่มา: เปิดให้ staff แก้ข้อมูลร้านค้าได้เอง รวมถึงเลขบัญชีรับเงิน
// การแก้เลขบัญชี = เปลี่ยนปลายทางการโอน จึงต้องมีร่องรอยว่าใครเปลี่ยนอะไรจากอะไรเป็นอะไร
// ของเดิม logAudit เก็บแค่ body ที่ส่งมา (ค่าใหม่) ไม่รู้ว่าค่าเดิมคืออะไร ตามรอยไม่ได้

// ช่องที่เป็นทางเดินเงิน — เปลี่ยนแล้วเงินไปคนละที่ ต้องเด้งให้เห็นชัดในหน้าประวัติ
export const MONEY_FIELDS = ['bank_account_no', 'bank_name', 'bank_account_name', 'promptpay_id']

export const FIELD_LABELS = {
  vendor_name: 'ชื่อร้าน', display_name: 'ชื่อที่แสดง', tax_id: 'เลขผู้เสียภาษี',
  tax_branch: 'สาขา', address: 'ที่อยู่', phone: 'เบอร์โทร', contact_person: 'ผู้ติดต่อ',
  bank_name: 'ธนาคาร', bank_account_no: 'เลขบัญชี', bank_account_name: 'ชื่อบัญชี',
  promptpay_id: 'พร้อมเพย์', taxpayer_type: 'ประเภทผู้เสียภาษี', doc_type: 'ชนิดเอกสาร',
  wht_type: 'หัก ณ ที่จ่าย', wht_rate: 'อัตราหัก ณ ที่จ่าย',
  business_type: 'หมวดธุรกิจ', business_sub_type: 'หมวดย่อย', keywords: 'คำค้น',
  is_active: 'สถานะใช้งาน',
}

const norm = (v) => (v === undefined || v === null || v === '') ? null : v

/**
 * เทียบเฉพาะช่องที่ถูกส่งมาแก้จริง — ช่องที่ไม่ได้แตะจะไม่โผล่ในประวัติ
 * @param {object} before แถวเดิมจากฐานข้อมูล (คีย์เป็นชื่อคอลัมน์)
 * @param {Array<[string, any]>} pairs คู่ (คอลัมน์, ค่าใหม่) ที่กำลังจะเขียน
 * @returns {{changes: object, moneyChanged: string[], count: number}}
 */
export function diffFields(before, pairs) {
  const changes = {}
  const moneyChanged = []
  for (const [col, next] of pairs || []) {
    const a = norm(before ? before[col] : null)
    const b = norm(next)
    if (String(a) === String(b)) continue      // ส่งมาแต่ค่าเท่าเดิม ไม่ถือว่าแก้
    changes[col] = { from: a, to: b, label: FIELD_LABELS[col] || col }
    if (MONEY_FIELDS.includes(col)) moneyChanged.push(col)
  }
  return { changes, moneyChanged, count: Object.keys(changes).length }
}
