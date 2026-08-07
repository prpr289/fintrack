// Run: node promptpay.test.mjs
import assert from 'node:assert'
import { crc16, normalizePromptPayId, promptPayPayload, verifyPayload } from './promptpay.mjs'

// --- CRC-16/CCITT-FALSE เทียบกับ check value มาตรฐานของอัลกอริทึม ---
// "123456789" → 0x29B1 คือค่าตรวจสอบที่ประกาศไว้ในสเปกของ CRC-16/CCITT-FALSE
assert.strictEqual(crc16('123456789'), '29B1')
assert.strictEqual(crc16(''), 'FFFF')

// --- normalize: มือถือ ---
assert.deepStrictEqual(normalizePromptPayId('0812345678'), { id: '01', value: '0066812345678' })
assert.deepStrictEqual(normalizePromptPayId('081-234-5678'), { id: '01', value: '0066812345678' }, 'มีขีดคั่นต้องได้ผลเดียวกัน')
assert.deepStrictEqual(normalizePromptPayId('66812345678'), { id: '01', value: '0066812345678' })
assert.strictEqual(normalizePromptPayId('0812345678').value.length, 13)

// --- normalize: เลขบัตร ปชช. / เลขผู้เสียภาษี 13 หลัก ---
assert.deepStrictEqual(normalizePromptPayId('0107536000841'), { id: '02', value: '0107536000841' })
assert.deepStrictEqual(normalizePromptPayId('0-1075-36000-84-1'), { id: '02', value: '0107536000841' }, 'เลขภาษีแบบมีขีดต้องใช้ได้')

// --- normalize: e-Wallet 15 หลัก ---
assert.deepStrictEqual(normalizePromptPayId('004999012345678'), { id: '03', value: '004999012345678' })

// --- normalize: ของที่ใช้ไม่ได้ ต้องคืน null ไม่ใช่ QR มั่ว ---
assert.strictEqual(normalizePromptPayId(''), null)
assert.strictEqual(normalizePromptPayId(null), null)
assert.strictEqual(normalizePromptPayId('123'), null, 'สั้นเกิน')
assert.strictEqual(normalizePromptPayId('12345678901234567890'), null, 'ยาวเกิน')
assert.strictEqual(normalizePromptPayId('abcdefg'), null, 'ไม่มีตัวเลขเลย')
assert.strictEqual(promptPayPayload('123', 100), null, 'เลขใช้ไม่ได้ ต้องไม่คืน payload')

// --- payload แบบไม่ระบุยอด (static, ใช้ซ้ำได้) ---
const stat = promptPayPayload('0812345678')
assert.ok(stat.startsWith('000201'), 'ขึ้นต้นด้วย payload format indicator 01')
assert.ok(stat.startsWith('00020101021129'), 'ไม่ระบุยอด → tag 01 = 11 (static)')
assert.ok(stat.includes('0016A000000677010111'), 'ต้องมี AID ของพร้อมเพย์')
assert.ok(stat.includes('01130066812345678'), 'sub-tag 01 ยาว 13 ตามด้วยเบอร์ที่ normalize แล้ว')
assert.ok(stat.includes('5303764'), 'สกุลเงิน 764 (THB)')
assert.ok(stat.includes('5802TH'), 'ประเทศ TH')
assert.ok(!stat.includes('54'.padStart(2, '0') + '07'), 'ไม่ระบุยอดต้องไม่มี tag 54')
assert.ok(verifyPayload(stat), 'CRC ต้องตรวจผ่าน')

// --- payload แบบระบุยอด (dynamic, ครั้งเดียว) ---
const dyn = promptPayPayload('0812345678', 11205)
assert.ok(dyn.startsWith('00020101021229'), 'ระบุยอด → tag 01 = 12 (dynamic)')
assert.ok(dyn.includes('540811205.00'), 'tag 54 ยาว 08 ค่า 11205.00 (ทศนิยม 2 ตำแหน่งเสมอ)')
assert.ok(verifyPayload(dyn))

// เศษสตางค์ต้องไม่หาย
assert.ok(promptPayPayload('0812345678', 1234.5).includes('54071234.50'))
assert.ok(promptPayPayload('0812345678', 0.25).includes('54040.25'))

// ยอด 0 / ติดลบ / ไม่ใช่ตัวเลข = ถือว่าไม่ระบุยอด ไม่ใช่ QR ยอด 0 ที่สแกนแล้วงง
for (const bad of [0, -50, NaN, null, undefined, 'abc']) {
  const p = promptPayPayload('0812345678', bad)
  assert.ok(p.startsWith('00020101021129'), `amount=${bad} ต้องออกเป็น static`)
  assert.ok(verifyPayload(p))
}

// --- เลขคนละเบอร์ต้องได้ payload คนละอัน (กันวาด QR ผิดร้าน) ---
assert.notStrictEqual(promptPayPayload('0812345678'), promptPayPayload('0898765432'))
// ยอดต่างกันก็ต้องต่างกัน
assert.notStrictEqual(promptPayPayload('0812345678', 100), promptPayPayload('0812345678', 200))

// --- verifyPayload จับของเสีย ---
assert.strictEqual(verifyPayload(stat.slice(0, -1) + '0'), false, 'CRC ผิดต้องไม่ผ่าน')
assert.strictEqual(verifyPayload('สั้นไป'), false)
assert.strictEqual(verifyPayload(null), false)

// --- ความยาว TLV ต้องตรงกับค่าจริงทุกช่อง (สแกนเนอร์อ่านตามความยาว) ---
function walk(s) {
  const out = []
  let i = 0
  while (i < s.length) {
    const tag = s.slice(i, i + 2)
    const len = Number(s.slice(i + 2, i + 4))
    assert.ok(Number.isInteger(len), `ความยาวของ tag ${tag} ต้องเป็นตัวเลข`)
    const val = s.slice(i + 4, i + 4 + len)
    assert.strictEqual(val.length, len, `tag ${tag} ประกาศยาว ${len} แต่ได้ ${val.length}`)
    out.push([tag, val])
    i += 4 + len
  }
  assert.strictEqual(i, s.length, 'อ่าน TLV แล้วต้องจบพอดี ไม่มีเศษ')
  return out
}
const tags = Object.fromEntries(walk(dyn))
assert.strictEqual(tags['00'], '01')
assert.strictEqual(tags['53'], '764')
assert.strictEqual(tags['58'], 'TH')
assert.strictEqual(tags['54'], '11205.00')
assert.strictEqual(tags['63'].length, 4)
// tag 29 ข้างในก็ต้องเป็น TLV ที่ถูกต้อง
const inner = Object.fromEntries(walk(tags['29']))
assert.strictEqual(inner['00'], 'A000000677010111')
assert.strictEqual(inner['01'], '0066812345678')

console.log('promptpay: ok')
