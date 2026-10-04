// Run: node pay-request.test.mjs
// ปุ่ม "ขอโอนเงิน" ของ LINE bot — เลือกร้านผิด = เลขบัญชีผิด = เงินไปผิดคน จึงต้องมีเทสกันไว้
import assert from 'node:assert'
import worker from './worker.js'
import { pickVendor, findSamePending, buildPayRequestFlex } from './functions/api/line-webhook.js'

// ── 1. เลือกร้าน ───────────────────────────────────────────────────
const long = 'ห้างหุ้นส่วนจำกัด ผักสดป้าศรี สาขาตลาดท่าแพ' // > 25 ตัวอักษร
const vendors = [
  { id: 'v1', vendorName: 'ร้านผักป้าศรี', bankAccountNo: '0123456789' },
  { id: 'v2', vendorName: 'ร้านผักป้าศรี 2', bankAccountNo: '999' },
  { id: 'v3', vendorName: long, bankAccountNo: '555' },
  { id: 'v4', vendorName: 'ร้านเลิกแล้ว', bankAccountNo: '111', isActive: false },
]
assert.strictEqual(pickVendor(vendors, 'ร้านผักป้าศรี').id, 'v1', 'ชื่อตรงเป๊ะ')
assert.strictEqual(pickVendor(vendors, ' ร้านผักป้าศรี ').id, 'v1', 'เว้นวรรคหัวท้ายไม่มีผล')
assert.strictEqual(pickVendor(vendors, 'ร้านผัก'), null, 'ชื่อสั้นที่ตรงแค่บางส่วน ห้ามเดา')
assert.strictEqual(pickVendor(vendors, long.slice(0, 25)).id, 'v3', 'ชื่อที่ถูกตัด 25 ตัว เจอร้านเดียว = ใช้ได้')
assert.strictEqual(pickVendor([...vendors, { id: 'v5', vendorName: long + ' (2)' }], long.slice(0, 25)), null, 'ถูกตัดแล้วเจอสองร้าน ห้ามเดา')
assert.strictEqual(pickVendor(vendors, 'ร้านเลิกแล้ว'), null, 'ร้านที่เลิกใช้แล้วห้ามเลือก')
assert.strictEqual(pickVendor(vendors, ''), null, 'ไม่มีชื่อ')

// ── 2. กันบิลซ้ำ ────────────────────────────────────────────────────
const pending = [{ id: 'pb1', payeeRefId: 'v1', amount: 1850 }, { id: 'pb2', payeeRefId: 'v2', amount: 1850 }]
assert.strictEqual(findSamePending(pending, 'v1', '1850').id, 'pb1', 'ร้านเดียวกัน ยอดเท่ากัน = ใบเดิม')
assert.strictEqual(findSamePending(pending, 'v1', 1851), null, 'ยอดต่าง = ใบใหม่')
assert.strictEqual(findSamePending(pending, 'v3', 1850), null, 'ร้านต่าง = ใบใหม่')

// ── 3. การ์ดรอโอน ───────────────────────────────────────────────────
const bill = { id: 'pb1', amount: 1850, payeeName: 'ร้านผักป้าศรี', payeeBank: 'กสิกรไทย', payeeAccountNo: '0123456789', submittedByName: 'ฝน' }
const flex = buildPayRequestFlex(bill, 'https://app/pending-bills?pay=pb1')
const text = JSON.stringify(flex)
assert.strictEqual(flex.contents.footer.contents[0].action.uri, 'https://app/pending-bills?pay=pb1', 'ปุ่มต้องชี้หน้าโอนของบิลใบนั้น')
assert.ok(text.includes('0123456789') && text.includes('1,850.00') && text.includes('ฝน'), 'การ์ดต้องมีเลขบัญชี ยอด และคนขอ')
assert.ok(!text.includes('แนบรูปบิลไม่สำเร็จ'), 'แนบรูปสำเร็จ ไม่ต้องเตือน')
assert.ok(JSON.stringify(buildPayRequestFlex(bill, 'u', { evidenceOk: false })).includes('แนบรูปบิลไม่สำเร็จ'), 'แนบรูปพลาดต้องเตือน')

// ── 4. worker: POST /pending-bills จากบอท vs จากเว็บ ─────────────────
const SECRET = 'test-secret'
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
async function mintJWT(payload) {
  const enc = new TextEncoder()
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const now = Math.floor(Date.now() / 1000)
  const body = b64url(enc.encode(JSON.stringify({ ...payload, iat: now, exp: now + 3600 })))
  const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${body}`))
  return `${header}.${body}.${b64url(new Uint8Array(sig))}`
}
async function createBill(token) {
  const log = []
  const DB = {
    prepare(sql) {
      const stmt = {
        sql, args: [],
        bind(...a) { stmt.args = a; return stmt },
        async first() {
          if (/FROM users WHERE id = \? AND is_active = 1/i.test(sql)) return { id: 'owner', workspace_id: 'ws1', role: 'admin', name: 'เจ้าของ' }
          if (/FROM vendor_profiles/i.test(sql)) return { vendor_name: 'ร้านผักป้าศรี', bank_name: 'กสิกรไทย', bank_account_no: '0123456789' }
          if (/FROM pending_bills/i.test(sql)) return { id: 'pb1', status: 'pending', amount: 1850 }
          return null
        },
        async run() { log.push({ sql, args: stmt.args }); return { meta: { changes: 1 } } },
        async all() { return { results: [] } },
      }
      return stmt
    },
  }
  const env = { DB, JWT_SECRET: SECRET, SERVICE_TOKEN: 'svc-tok', SERVICE_USER_ID: 'owner' }
  const res = await worker.fetch(new Request('https://x/pending-bills', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'ผักสด', amount: 1850, scope: 'business', payeeType: 'vendor', payeeRefId: 'v1', evidenceType: 'receipt', submittedByName: 'ฝน' }),
  }), env, {})
  const ins = log.find(l => /^INSERT INTO pending_bills/i.test(l.sql.trim()))
  return { status: res.status, source: ins?.args[2], submittedByName: ins?.args[4], args: ins?.args }
}
const viaBot = await createBill('svc-tok')
assert.strictEqual(viaBot.status, 201, 'บอทสร้างบิลได้')
assert.strictEqual(viaBot.source, 'line', 'บิลจากบอทต้องติดป้าย line')
assert.strictEqual(viaBot.submittedByName, 'ฝน', 'ชื่อคนขอมาจากบอท ไม่ใช่ชื่อบัญชีบริการ')
assert.ok(viaBot.args.includes('0123456789'), 'เลขบัญชีถูก freeze ลงบิล')

const viaWeb = await createBill(await mintJWT({ sub: 'owner', ws: 'ws1', role: 'admin', name: 'เจ้าของ' }))
assert.strictEqual(viaWeb.status, 201, 'เว็บสร้างบิลได้เหมือนเดิม')
assert.strictEqual(viaWeb.source, 'web', 'บิลจากเว็บยังเป็น web')
assert.strictEqual(viaWeb.submittedByName, 'เจ้าของ', 'เว็บส่ง submittedByName มาเองไม่ได้ — ใช้ชื่อคนล็อกอินเสมอ')

// ── 5. บอท: กดปุ่มขอโอนเงินทั้งเส้น (stub LINE + worker) ──────────────
// สวิตช์ปิด = ต้องไม่ยิงอะไรเลย (นี่คือแผน rollback) · สวิตช์เปิด = สร้างบิล แนบรูป ตอบการ์ดลิงก์
async function pressPayReq(envOver, { pendingBills = [], vendorList = vendors } = {}) {
  const calls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    calls.push({ url: u, method: init.method || 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body })
    const ok = (obj) => new Response(JSON.stringify(obj), { status: 200 })
    if (u.includes('api-data.line.me')) return new Response(new Uint8Array([1, 2, 3]))
    if (u.includes('/vendor-profiles')) return ok({ vendors: vendorList })
    if (u.includes('/line-users/lookup')) return ok({ employee: { name: 'ฝน' } })
    if (u.endsWith('/evidence')) return ok({ ok: true })
    if (u.includes('/pending-bills') && init.method === 'POST') return ok({ bill: { ...bill, id: 'pb9' } })
    if (u.includes('/pending-bills')) return ok({ bills: pendingBills })
    return ok({})
  }
  try {
    const raw = JSON.stringify({ events: [{
      type: 'postback', replyToken: 'rt', source: { userId: 'U1', groupId: 'G1' },
      postback: { data: JSON.stringify({ a: 'payreq', m: 'msg1', amt: 1850, d: '2026-10-04', n: 'ร้านผักป้าศรี', c: 'cat1' }) },
    }] })
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', enc.encode('line-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = Buffer.from(await crypto.subtle.sign('HMAC', key, enc.encode(raw))).toString('base64')
    const { onRequestPost } = await import('./functions/api/line-webhook.js')
    const waits = []
    const res = await onRequestPost({
      request: new Request('https://x/api/line-webhook', { method: 'POST', headers: { 'x-line-signature': sig }, body: raw }),
      env: { LINE_CHANNEL_SECRET: 'line-secret', LINE_CHANNEL_ACCESS_TOKEN: 'lt', FINTRACK_TOKEN: 'ft', FINTRACK_API_URL: 'https://api', ...envOver },
      waitUntil: (p) => waits.push(p),
    })
    await Promise.all(waits)
    return { status: res.status, calls }
  } finally { globalThis.fetch = realFetch }
}

const off = await pressPayReq({})
assert.strictEqual(off.status, 200, 'webhook ตอบ 200 เสมอ')
assert.strictEqual(off.calls.length, 0, 'สวิตช์ปิด: ห้ามยิงอะไรเลย')

const on = await pressPayReq({ PAY_REQUEST_ENABLED: '1' })
const created = on.calls.find(c => c.url === 'https://api/pending-bills' && c.method === 'POST')
assert.ok(created, 'สวิตช์เปิด: ต้องสร้างบิลรอจ่าย')
assert.deepStrictEqual(
  { ...created.body },
  { name: 'จ่าย ร้านผักป้าศรี', amount: 1850, scope: 'business', payeeType: 'vendor', payeeRefId: 'v1', evidenceType: 'receipt', categoryId: 'cat1', submittedByName: 'ฝน' },
  'บิลต้องผูกร้านในทะเบียน และพกชื่อคนขอ',
)
assert.ok(on.calls.some(c => c.url === 'https://api/pending-bills/pb9/evidence' && c.method === 'POST'), 'ต้องแนบรูปบิลเป็นหลักฐาน')
assert.ok(!on.calls.some(c => c.url.includes('/transactions')), 'ขอโอนเงินต้องไม่ลงรายจ่ายทันที')
const reply = on.calls.find(c => c.url.includes('/message/reply'))
assert.strictEqual(reply.body.messages[0].contents.footer.contents[0].action.uri,
  'https://fintrack-frontend-d6m.pages.dev/pending-bills?pay=pb9&openExternalBrowser=1', 'การ์ดต้องลิงก์ไปหน้าโอนของบิลที่เพิ่งสร้าง')

const dup = await pressPayReq({ PAY_REQUEST_ENABLED: '1' }, { pendingBills: [{ ...bill, id: 'pbOld', payeeRefId: 'v1' }] })
assert.ok(!dup.calls.some(c => c.url === 'https://api/pending-bills' && c.method === 'POST'), 'กดซ้ำ: ห้ามสร้างบิลใบที่สอง')
assert.ok(JSON.stringify(dup.calls.find(c => c.url.includes('/message/reply')).body).includes('pay=pbOld'), 'กดซ้ำ: ตอบลิงก์ใบเดิม')

const noAcc = await pressPayReq({ PAY_REQUEST_ENABLED: '1' }, { vendorList: [{ id: 'v1', vendorName: 'ร้านผักป้าศรี', bankAccountNo: null }] })
assert.ok(!noAcc.calls.some(c => c.url.includes('/pending-bills')), 'ร้านไม่มีเลขบัญชี: ห้ามสร้างบิล')
assert.ok(noAcc.calls.find(c => c.url.includes('/message/reply')).body.messages[0].text.includes('ยังไม่มีเลขบัญชี'), 'ร้านไม่มีเลขบัญชี: ต้องบอกน้องให้เพิ่มร้าน')

console.log('pay-request: ok')
