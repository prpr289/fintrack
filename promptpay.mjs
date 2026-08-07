// สร้าง payload QR พร้อมเพย์ (EMVCo Merchant Presented QR)
//
// เก็บ "เลขพร้อมเพย์" ของร้านแล้ววาด QR เอง ดีกว่าเก็บรูป QR ที่ร้านส่งมา เพราะ
// (1) ใส่ยอดเงินลงใน QR ได้ คนจ่ายกรอกยอดผิดไม่ได้
// (2) รูปถูกสลับแล้วเงินเข้าบัญชีคนอื่นโดยไม่มีใครรู้ ส่วนเลขเทียบกับเลขผู้เสียภาษีได้

const GUID = 'A000000677010111'   // PromptPay AID
const ID_MOBILE = '01'
const ID_NATIONAL = '02'          // เลขบัตร ปชช. / เลขผู้เสียภาษี 13 หลัก
const ID_EWALLET = '03'

// TLV: tag + ความยาว 2 หลัก + ค่า
function tlv(tag, value) {
  return tag + String(value.length).padStart(2, '0') + value
}

// CRC-16/CCITT-FALSE — poly 0x1021, init 0xFFFF, ไม่ reflect, ไม่ xor ตอนจบ
export function crc16(str) {
  let crc = 0xFFFF
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// แปลงเลขที่ผู้ใช้พิมพ์ → {id, value} ตามชนิดที่พร้อมเพย์รองรับ
// คืน null ถ้าไม่เข้ารูปแบบไหนเลย เพื่อให้ฝั่งเรียกใช้ "ไม่โชว์ QR" แทนที่จะโชว์ QR ที่สแกนไม่ได้
export function normalizePromptPayId(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  if (!d) return null
  // มือถือ 10 หลักขึ้นต้น 0 → 0066xxxxxxxxx (13 หลัก)
  if (d.length === 10 && d.startsWith('0')) {
    return { id: ID_MOBILE, value: ('66' + d.slice(1)).padStart(13, '0') }
  }
  // พิมพ์มาเป็น 66xxxxxxxxx อยู่แล้ว
  if (d.length === 11 && d.startsWith('66')) {
    return { id: ID_MOBILE, value: d.padStart(13, '0') }
  }
  // เลขบัตรประชาชน / เลขผู้เสียภาษีนิติบุคคล 13 หลัก
  if (d.length === 13) return { id: ID_NATIONAL, value: d }
  // e-Wallet 15 หลัก
  if (d.length === 15) return { id: ID_EWALLET, value: d }
  return null
}

// amount ว่าง/0 → QR แบบใช้ซ้ำได้ (static, tag 01 = 11)
// amount มีค่า  → QR ครั้งเดียวพร้อมยอด (dynamic, tag 01 = 12)
export function promptPayPayload(rawId, amount) {
  const target = normalizePromptPayId(rawId)
  if (!target) return null
  const amt = Number(amount)
  const hasAmount = Number.isFinite(amt) && amt > 0

  const body =
    tlv('00', '01') +
    tlv('01', hasAmount ? '12' : '11') +
    tlv('29', tlv('00', GUID) + tlv(target.id, target.value)) +
    tlv('53', '764') +
    (hasAmount ? tlv('54', amt.toFixed(2)) : '') +
    tlv('58', 'TH')

  const withCrcTag = body + '6304'
  return withCrcTag + crc16(withCrcTag)
}

// ตรวจว่า payload ที่ได้มา CRC ถูกต้องจริง — ใช้ในเทสต์และกันของที่ประกอบเองผิด
export function verifyPayload(payload) {
  if (typeof payload !== 'string' || payload.length < 8) return false
  const body = payload.slice(0, -4)
  if (!body.endsWith('6304')) return false
  return crc16(body) === payload.slice(-4)
}
