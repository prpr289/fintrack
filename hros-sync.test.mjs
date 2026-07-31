// Run: node hros-sync.test.mjs
import assert from 'node:assert'
import { hrosSyncEnabled, withHrosSync } from './hros-sync.mjs'

// --- hrosSyncEnabled: default ON ---
assert.strictEqual(hrosSyncEnabled(null), true)              // ยังไม่เคยกดสวิตช์
assert.strictEqual(hrosSyncEnabled(''), true)
assert.strictEqual(hrosSyncEnabled('{}'), true)
assert.strictEqual(hrosSyncEnabled('{"theme":"dark"}'), true)
assert.strictEqual(hrosSyncEnabled('ไม่ใช่ JSON'), true)      // พัง = ไม่ตัดการ sync

// --- hrosSyncEnabled: OFF ต้องเป็น false เป๊ะ ๆ เท่านั้น ---
assert.strictEqual(hrosSyncEnabled('{"hrosSyncEnabled":false}'), false)
assert.strictEqual(hrosSyncEnabled('{"hrosSyncEnabled":true}'), true)
assert.strictEqual(hrosSyncEnabled('{"hrosSyncEnabled":0}'), true)   // ไม่ใช่ false = เปิด

// --- withHrosSync: ไม่ทับ key อื่น ---
assert.deepStrictEqual(JSON.parse(withHrosSync('{"theme":"dark"}', false)), { theme: 'dark', hrosSyncEnabled: false })
assert.deepStrictEqual(JSON.parse(withHrosSync('{"hrosSyncEnabled":false}', true)), { hrosSyncEnabled: true })
assert.deepStrictEqual(JSON.parse(withHrosSync('พัง', false)), { hrosSyncEnabled: false })
assert.deepStrictEqual(JSON.parse(withHrosSync('[1,2]', true)), { hrosSyncEnabled: true })

// --- round trip ---
assert.strictEqual(hrosSyncEnabled(withHrosSync('{"a":1}', false)), false)
assert.strictEqual(hrosSyncEnabled(withHrosSync(withHrosSync(null, false), true)), true)

console.log('hros-sync: ok')
