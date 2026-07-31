// Run: node merchant-search.test.mjs
import assert from 'node:assert'
import { matchMerchant, searchMerchants } from './merchant-search.mjs'

const makro = { vendorName: 'แม็คโคร หาดใหญ่', taxId: '0-1075-36000-84-1', bankName: 'KBank', bankAccountNo: '012-8-84371-6', phone: '074-361-100' }
const eed = { vendorName: 'ร้านอี๊ด อาหารทะเล', bankAccountNo: '8040221745', phone: '0893301174' }
const bare = { vendorName: 'ตลาดสด ป้าจรี' }
const packs = { vendorName: 'บริษัท ภิรมย์ เอ็มดี', businessType: 'บรรจุภัณฑ์', businessSubType: 'กล่อง & ถุง', keywords: 'กล่องข้าว, ถุงหูหิ้ว, ฟอยล์', displayName: 'บจก. ภิรมย์ เอ็มดี' }

// --- ว่าง = ผ่านหมด (ไม่กรอง) ---
assert.strictEqual(matchMerchant(makro, ''), true)
assert.strictEqual(matchMerchant(makro, '   '), true)
assert.strictEqual(matchMerchant(makro, null), true)

// --- ชื่อ ---
assert.strictEqual(matchMerchant(makro, 'แม็คโคร'), true)
assert.strictEqual(matchMerchant(makro, 'หาดใหญ่'), true)
assert.strictEqual(matchMerchant(makro, 'อี๊ด'), false)

// --- ชื่อธนาคาร ไม่สนตัวพิมพ์เล็กใหญ่ ---
assert.strictEqual(matchMerchant(makro, 'kbank'), true)
assert.strictEqual(matchMerchant(makro, 'KBANK'), true)

// --- เลขบัญชี: พิมพ์มีขีด / ไม่มีขีด / เฉพาะเลขท้าย ---
assert.strictEqual(matchMerchant(makro, '012-8-84371-6'), true)
assert.strictEqual(matchMerchant(makro, '012884371'), true, 'พิมพ์ติดกันต้องเจอบัญชีที่เก็บแบบมีขีด')
assert.strictEqual(matchMerchant(makro, '4371'), true, 'เลขท้ายบัญชีต้องเจอ')

// --- เลขผู้เสียภาษี ---
assert.strictEqual(matchMerchant(makro, '0107536000841'), true, 'เลขภาษี 13 หลักติดกัน')
assert.strictEqual(matchMerchant(makro, '36000'), true)

// --- เบอร์โทร ---
assert.strictEqual(matchMerchant(makro, '074361100'), true)
assert.strictEqual(matchMerchant(eed, '0893301174'), true)

// --- เลขที่ไม่มีอยู่จริง ต้องไม่เจอ ---
assert.strictEqual(matchMerchant(makro, '9999'), false)
assert.strictEqual(matchMerchant(bare, '4371'), false, 'ร้านที่ไม่มีเลขอะไรเลย ห้าม match เลข')

// --- ตัวเลขของร้านนี้ ห้ามไปโผล่ในร้านอื่น ---
assert.strictEqual(matchMerchant(eed, '4371'), false)

// --- field ว่าง ไม่พัง ---
assert.strictEqual(matchMerchant(bare, 'ป้าจรี'), true)
assert.strictEqual(matchMerchant(bare, 'แม็คโคร'), false)

// --- หมวดธุรกิจ / คำค้นสินค้า / ชื่อตามทะเบียน ---
assert.strictEqual(matchMerchant(packs, 'บรรจุภัณฑ์'), true, 'ค้นด้วยหมวดธุรกิจหลัก')
assert.strictEqual(matchMerchant(packs, 'กล่อง'), true, 'ค้นด้วยหมวดย่อย')
assert.strictEqual(matchMerchant(packs, 'ฟอยล์'), true, 'ค้นด้วยสินค้าที่ซื้อประจำ')
assert.strictEqual(matchMerchant(packs, 'บจก.'), true, 'ค้นด้วยชื่อตามทะเบียน')
assert.strictEqual(matchMerchant(packs, 'อาหารทะเล'), false, 'หมวดของร้านอื่น ห้าม match')
assert.strictEqual(matchMerchant(makro, 'ฟอยล์'), false, 'คำค้นของร้านอื่น ห้าม match')

// --- searchMerchants: กรอง + จำกัดจำนวน ---
const list = [makro, eed, bare]
assert.deepStrictEqual(searchMerchants(list, 'แม็คโคร'), [makro])
assert.strictEqual(searchMerchants(list, '').length, 3)
assert.strictEqual(searchMerchants(list, '', 2).length, 2, 'ต้องตัดตาม limit')
assert.deepStrictEqual(searchMerchants(null, 'x'), [], 'list ว่างต้องไม่พัง')

console.log('merchant-search: ok')
