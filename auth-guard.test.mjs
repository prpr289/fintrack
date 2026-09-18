// Run: node auth-guard.test.mjs
import assert from 'node:assert'
import { safeTokenEqual, parseAllowedOrigins, applyCorsPolicy } from './auth-guard.mjs'

// ── safeTokenEqual: ผลต้องเท่ากับ === ทุกกรณี (LINE bot พึ่งค่านี้) ──
const tok = 'a3f9c2e1b7d4'.repeat(4)
assert.strictEqual(await safeTokenEqual(tok, tok), true)
assert.strictEqual(await safeTokenEqual(tok.slice(0, -1) + 'x', tok), false, 'ต่างตัวสุดท้าย')
assert.strictEqual(await safeTokenEqual('x' + tok.slice(1), tok), false, 'ต่างตัวแรก')
assert.strictEqual(await safeTokenEqual(tok.slice(0, -1), tok), false, 'สั้นกว่า (prefix)')
assert.strictEqual(await safeTokenEqual(tok + 'a', tok), false, 'ยาวกว่า')
assert.strictEqual(await safeTokenEqual(tok + ' ', tok), false, 'ช่องว่างท้ายไม่ถูกตัดทิ้ง')
assert.strictEqual(await safeTokenEqual('', tok), false, 'token ว่าง')
assert.strictEqual(await safeTokenEqual(tok, ''), false, 'secret ว่าง')
assert.strictEqual(await safeTokenEqual('', ''), false, 'ว่างทั้งคู่ต้องไม่ผ่าน')
assert.strictEqual(await safeTokenEqual(undefined, tok), false)
assert.strictEqual(await safeTokenEqual(tok, undefined), false)
assert.strictEqual(await safeTokenEqual(null, null), false)
assert.strictEqual(await safeTokenEqual(123, 123), false, 'ไม่ใช่ string')
assert.strictEqual(await safeTokenEqual('โทเคนไทย', 'โทเคนไทย'), true, 'unicode')
{
  // สุ่มคู่ที่มี prefix ร่วมกันยาว ๆ แล้วเทียบกับ === ตรง ๆ
  const alphabet = 'abcdef0123456789'
  const rnd = (n) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  for (let i = 0; i < 300; i++) {
    const base = rnd(1 + Math.floor(Math.random() * 40))
    const other = Math.random() < 0.3 ? base : base.slice(0, Math.floor(Math.random() * base.length)) + rnd(Math.floor(Math.random() * 3))
    assert.strictEqual(await safeTokenEqual(other, base), other !== '' && other === base, `${other} vs ${base}`)
  }
}

// ── parseAllowedOrigins ──
assert.strictEqual(parseAllowedOrigins(undefined), null, 'ไม่ตั้ง = พฤติกรรมเดิม')
assert.strictEqual(parseAllowedOrigins(''), null)
assert.strictEqual(parseAllowedOrigins(' , ,'), null, 'มีแต่ comma = ไม่ตั้ง')
assert.deepStrictEqual(
  parseAllowedOrigins(' https://fintrack-frontend-d6m.pages.dev/ ,http://localhost:5173,, '),
  ['https://fintrack-frontend-d6m.pages.dev', 'http://localhost:5173'],
  'ตัดช่องว่างและ / ท้าย'
)

// ── applyCorsPolicy ──
const mkReq = (origin) => new Request('https://w/x', { headers: origin ? { Origin: origin } : {} })
const mkRes = () => {
  const r = new Response('{"ok":true}', { status: 201, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' } })
  return r
}
{
  // ไม่ตั้ง = ต้องเป็น object ตัวเดิม ไม่ใช่แค่ header เหมือน
  const r = mkRes()
  assert.strictEqual(applyCorsPolicy(r, mkReq('https://evil.example'), {}), r)
  assert.strictEqual(applyCorsPolicy(r, mkReq('https://evil.example'), { ALLOWED_ORIGINS: '' }), r)
  assert.strictEqual(applyCorsPolicy(r, mkReq(null), undefined), r)
}
{
  const env = { ALLOWED_ORIGINS: 'https://app.example,http://localhost:5173' }
  const ok = applyCorsPolicy(mkRes(), mkReq('https://app.example'), env)
  assert.strictEqual(ok.headers.get('Access-Control-Allow-Origin'), 'https://app.example')
  assert.match(ok.headers.get('Vary') || '', /Origin/)
  assert.strictEqual(ok.status, 201, 'status คงเดิม')
  assert.strictEqual(ok.headers.get('Content-Type'), 'application/json')
  assert.strictEqual(ok.headers.get('Access-Control-Allow-Methods'), 'GET', 'header อื่นคงเดิม')
  assert.deepStrictEqual(await ok.json(), { ok: true }, 'body คงเดิม')

  const bad = applyCorsPolicy(mkRes(), mkReq('https://evil.example'), env)
  assert.strictEqual(bad.headers.get('Access-Control-Allow-Origin'), null, 'origin นอกรายชื่อต้องไม่ได้ header')
  assert.strictEqual(bad.status, 201)
  assert.deepStrictEqual(await bad.json(), { ok: true }, 'ไม่ใช่ด่านตัวตน — ไม่เปลี่ยน body')

  const lookalike = applyCorsPolicy(mkRes(), mkReq('https://app.example.evil.com'), env)
  assert.strictEqual(lookalike.headers.get('Access-Control-Allow-Origin'), null, 'ต้องตรงทั้งคำ ไม่ใช่ prefix')

  const server = applyCorsPolicy(mkRes(), mkReq(null), env)
  assert.strictEqual(server.headers.get('Access-Control-Allow-Origin'), null, 'เรียกจากเซิร์ฟเวอร์ไม่มี Origin')
  assert.strictEqual(server.status, 201)

  // WebSocket upgrade ต้องส่งต่อตัวเดิม
  const ws = { status: 101, headers: new Headers(), webSocket: {} }
  assert.strictEqual(applyCorsPolicy(ws, mkReq('https://app.example'), env), ws)
}

console.log('auth-guard: ok')
