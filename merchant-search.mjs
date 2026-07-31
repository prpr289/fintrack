// ค้นหาร้านค้าฝั่ง client — ใช้เกณฑ์เดียวกับ SQL ใน worker (listVendorProfiles ?q=)
// เพื่อให้ picker ในหน้าบิลรอจ่าย กับ หน้าร้านค้า ให้ผลตรงกัน

// คืน digits ล้วนของทุก field ที่เป็นตัวเลข — คนหน้างานจำ "ท้ายบัญชี 4371"
// ไม่ได้จำขีดคั่น จึงต้องเทียบแบบตัดสัญลักษณ์ออกด้วย
function digitsOf(...vals) {
  return vals.filter(Boolean).join(' ').replace(/\D/g, '')
}

export function matchMerchant(v, term) {
  const t = String(term || '').trim().toLowerCase()
  if (!t) return true
  const hay = [v.vendorName, v.taxId, v.bankName, v.bankAccountNo, v.phone]
    .filter(Boolean).join(' ').toLowerCase()
  if (hay.includes(t)) return true
  const digits = t.replace(/\D/g, '')
  if (!digits) return false
  return digitsOf(v.taxId, v.bankAccountNo, v.phone).includes(digits)
}

export function searchMerchants(list, term, limit = 30) {
  return (list || []).filter(v => matchMerchant(v, term)).slice(0, limit)
}
