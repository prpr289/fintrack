// Run: node worker-auth.test.mjs
// ทดสอบด่านตัวตนของ worker ระดับ route จริง (worker.fetch) โดย stub เฉพาะ D1 / Durable Object
// ครอบ: /auth/register ปิดสาธารณะ · JWT ต้องตรงกับ user ที่ยัง active ใน D1 · WebSocket ·
//       CORS allowlist (ALLOWED_ORIGINS) · 500 ไม่คาย err.message · service token ของ LINE bot / HR OS ยังใช้ได้
import assert from 'node:assert'
import worker from './worker.js'

const SECRET = 'test-secret'
const SVC_TOKEN = 'svc-token-0123456789abcdef'
const HROS_TOKEN = 'hros-token-fedcba9876543210'
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function mintJWT(payload, { expOffset = 3600 } = {}) {
  const enc = new TextEncoder()
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const now = Math.floor(Date.now() / 1000)
  const body = b64url(enc.encode(JSON.stringify({ ...payload, iat: now, exp: now + expOffset })))
  const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${body}`))
  return `${header}.${body}.${b64url(new Uint8Array(sig))}`
}

const baseUsers = () => [
  { id: 'u-admin', workspace_id: 'ws1', email: 'admin@x', name: 'แอดมิน', role: 'admin', is_active: 1, settings: null },
  { id: 'u-staff', workspace_id: 'ws1', email: 'staff@x', name: 'พนักงาน', role: 'staff', is_active: 1, settings: null },
  { id: 'u-gone', workspace_id: 'ws1', email: 'gone@x', name: 'ลาออกแล้ว', role: 'admin', is_active: 0, settings: null },
  { id: 'svc-user', workspace_id: 'ws1', email: 'bot@x', name: 'LINE Bot', role: 'admin', is_active: 1, settings: null },
  { id: 'hros-user', workspace_id: 'ws1', email: 'hros@x', name: 'HR OS', role: 'admin', is_active: 1, settings: null },
]

// ── D1 stub: รู้จักเฉพาะ SQL ที่ route ในเทสนี้ยิง ที่เหลือคืนว่าง · จดทุก SQL ไว้ตรวจ ──
function makeDB({ users = baseUsers(), throwOn = null } = {}) {
  const log = []
  const batches = []
  const db = {
    log, batches, users,
    prepare(sql) {
      if (throwOn && throwOn.test(sql)) throw new Error('D1_ERROR: no such column: secret_internal_col (SQLITE_ERROR)')
      const stmt = {
        sql, args: [],
        bind(...a) { stmt.args = a; return stmt },
        async first() {
          log.push({ sql, args: stmt.args })
          if (/FROM users WHERE id = \? AND is_active = 1/i.test(sql)) {
            const u = users.find(x => x.id === stmt.args[0] && x.is_active === 1)
            return u ? { ...u } : null
          }
          if (/FROM users WHERE email = \?/i.test(sql)) {
            const u = users.find(x => x.email === stmt.args[0])
            return u ? { ...u } : null
          }
          return null
        },
        async all() {
          log.push({ sql, args: stmt.args })
          if (/FROM users WHERE workspace_id = \?/i.test(sql)) return { results: users.filter(x => x.workspace_id === stmt.args[0]) }
          return { results: [] }
        },
        async run() { log.push({ sql, args: stmt.args }); return { meta: { changes: 1 } } },
      }
      return stmt
    },
    async batch(stmts) { batches.push(stmts); return stmts.map(() => ({ success: true })) },
  }
  return db
}

function makeRealtime() {
  const rooms = []
  return {
    rooms,
    idFromName(name) { rooms.push(name); return name },
    get(id) { return { fetch: async () => new Response(`room:${id}`, { status: 200 }) } },
  }
}

function makeEnv(over = {}) {
  return {
    DB: makeDB(), REALTIME: makeRealtime(), JWT_SECRET: SECRET,
    SERVICE_TOKEN: SVC_TOKEN, SERVICE_USER_ID: 'svc-user',
    HROS_SERVICE_TOKEN: HROS_TOKEN, HROS_SERVICE_USER_ID: 'hros-user',
    ...over,
  }
}

async function call(method, path, { token, body, origin, env = makeEnv() } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (origin) headers.Origin = origin
  const res = await worker.fetch(new Request(`https://fintrack-api.test${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  }), env, {})
  const text = await res.clone().text()
  let json = null
  try { json = JSON.parse(text) } catch { json = null }
  return { res, status: res.status, json, text, env }
}

const jwtFor = (sub, claims = {}) => mintJWT({ sub, ws: 'ws1', role: 'admin', name: 'claim-name', ...claims })
const registerBody = { email: 'new@x', password: 'secret123', name: 'คนใหม่', workspaceName: 'ร้านใหม่' }

// ── 1. POST /auth/register ไม่เปิดสาธารณะแล้ว ──────────────────────────
{
  const r = await call('POST', '/auth/register', { body: registerBody })
  assert.strictEqual(r.status, 403, 'ไม่มี token ต้องถูกปฏิเสธ')
  assert.strictEqual(typeof r.json.error, 'string')
  assert.strictEqual(r.env.DB.batches.length, 0, 'ต้องไม่สร้าง workspace/user')
  assert.ok(!('token' in r.json), 'ต้องไม่คืน token')
}
{
  const r = await call('POST', '/auth/register', { token: 'not-a-jwt', body: registerBody })
  assert.strictEqual(r.status, 403, 'token มั่วต้องถูกปฏิเสธ')
  assert.strictEqual(r.env.DB.batches.length, 0)
}
{
  const r = await call('POST', '/auth/register', { token: await jwtFor('u-staff', { role: 'staff' }), body: registerBody })
  assert.strictEqual(r.status, 403, 'staff สร้าง workspace ไม่ได้')
  assert.strictEqual(r.env.DB.batches.length, 0)
}
{
  // JWT อ้างว่าเป็น admin แต่ใน D1 เป็น staff → ต้องเชื่อ D1
  const r = await call('POST', '/auth/register', { token: await jwtFor('u-staff', { role: 'admin' }), body: registerBody })
  assert.strictEqual(r.status, 403, 'role ใน JWT ต้องไม่มีผล')
  assert.strictEqual(r.env.DB.batches.length, 0)
}
{
  const r = await call('POST', '/auth/register', { token: await jwtFor('u-gone'), body: registerBody })
  assert.strictEqual(r.status, 403, 'admin ที่ถูกปิดบัญชีต้องใช้ไม่ได้')
  assert.strictEqual(r.env.DB.batches.length, 0)
}
{
  const r = await call('POST', '/auth/register', { token: SVC_TOKEN, body: registerBody })
  assert.strictEqual(r.status, 403, 'LINE bot service token ห้ามสร้าง workspace แม้แถว user เป็น admin')
  assert.strictEqual(r.env.DB.batches.length, 0)
  const h = await call('POST', '/auth/register', { token: HROS_TOKEN, body: registerBody })
  assert.strictEqual(h.status, 403, 'HR OS service token ห้ามสร้าง workspace')
  assert.strictEqual(h.env.DB.batches.length, 0)
}
{
  const r = await call('POST', '/auth/register', { token: await jwtFor('u-admin'), body: registerBody })
  assert.strictEqual(r.status, 200, 'admin ที่ล็อกอินและ active ยังเรียกได้')
  assert.strictEqual(r.env.DB.batches.length, 1)
  assert.strictEqual(typeof r.json.token, 'string', 'response shape เดิม: token')
  assert.strictEqual(r.json.user.role, 'admin', 'response shape เดิม: user')
  assert.strictEqual(r.json.user.email, 'new@x')
  assert.match(r.json.user.workspaceId, /^ws_/)
}
{
  const r = await call('POST', '/auth/register', { token: await jwtFor('u-admin'), body: { ...registerBody, email: 'staff@x' } })
  assert.strictEqual(r.status, 409, 'อีเมลซ้ำยังตอบ 409 เหมือนเดิม')
}

// ── 2. JWT ต้องตรงกับ user ที่ยัง active ใน D1 ทุก request ─────────────
{
  const r = await call('GET', '/me', { token: await jwtFor('u-gone') })
  assert.strictEqual(r.status, 401, 'ปิดบัญชีแล้ว token เดิม (ยังไม่หมดอายุ) ต้องใช้ไม่ได้ทันที')
  assert.deepStrictEqual(r.json, { error: 'Invalid token' })
}
{
  const r = await call('GET', '/me', { token: await jwtFor('u-never-existed') })
  assert.strictEqual(r.status, 401, 'user ที่ไม่มีใน D1')
}
{
  // ปิดบัญชีผ่าน DELETE /users/:id แล้ว token ของคนนั้นต้องตายทันที
  const env = makeEnv()
  const staffTok = await jwtFor('u-staff', { role: 'staff' })
  assert.strictEqual((await call('GET', '/me', { token: staffTok, env })).status, 200, 'ก่อนปิด ใช้ได้')
  const del = await call('DELETE', '/users/u-staff', { token: await jwtFor('u-admin'), env })
  assert.strictEqual(del.status, 200)
  assert.ok(env.DB.log.some(l => /UPDATE users SET is_active = 0/.test(l.sql) && l.args[0] === 'u-staff'))
  env.DB.users.find(u => u.id === 'u-staff').is_active = 0 // จำลองผลของ UPDATE ใน D1
  assert.strictEqual((await call('GET', '/me', { token: staffTok, env })).status, 401, 'หลังปิด ใช้ไม่ได้')
}
{
  // ถูกลดสิทธิ์จาก admin เป็น staff: token เก่าที่ claim admin ต้องไม่ผ่านหน้าที่เฉพาะ admin
  const r = await call('GET', '/users', { token: await jwtFor('u-staff', { role: 'admin' }) })
  assert.strictEqual(r.status, 403, 'role มาจาก D1 ไม่ใช่ JWT')
  const ok = await call('GET', '/users', { token: await jwtFor('u-admin', { role: 'viewer' }) })
  assert.strictEqual(ok.status, 200, 'กลับกัน: D1 เป็น admin ก็ต้องผ่าน')
}
{
  // workspace ต้องมาจาก D1 ไม่ใช่ claim ws
  const r = await call('GET', '/users', { token: await jwtFor('u-admin', { ws: 'ws-someone-else' }) })
  assert.strictEqual(r.status, 200)
  const q = r.env.DB.log.find(l => /FROM users WHERE workspace_id = \?/.test(l.sql))
  assert.strictEqual(q.args[0], 'ws1', 'ต้อง query ด้วย workspace จริงใน D1')
}
{
  const r = await call('GET', '/me', { token: await jwtFor('u-admin') })
  assert.strictEqual(r.status, 200)
  assert.strictEqual(r.json.user.id, 'u-admin')
  assert.strictEqual(r.json.user.name, 'แอดมิน')
}
{
  const r = await call('GET', '/me', { token: await mintJWT({ sub: 'u-admin', ws: 'ws1', role: 'admin' }, { expOffset: -10 }) })
  assert.strictEqual(r.status, 401, 'JWT หมดอายุยังถูกปฏิเสธเหมือนเดิม')
  const bad = await mintJWT({ sub: 'u-admin', ws: 'ws1', role: 'admin' })
  assert.strictEqual((await call('GET', '/me', { token: bad.slice(0, -2) + 'xx' })).status, 401, 'ลายเซ็นผิด')
  assert.strictEqual((await call('GET', '/me')).status, 401, 'ไม่มี token')
}

// ── 3. service token ของ LINE bot / HR OS ยังทำงานเหมือนเดิม ────────────
{
  const r = await call('GET', '/me', { token: SVC_TOKEN })
  assert.strictEqual(r.status, 200, 'LINE bot token ต้องใช้ได้')
  assert.strictEqual(r.json.user.id, 'svc-user')
  const cats = await call('GET', '/categories', { token: SVC_TOKEN })
  assert.strictEqual(cats.status, 200, 'LINE bot เรียก /categories ได้ (webhook ใช้ทุกข้อความ)')
  const wallets = await call('GET', '/wallets', { token: SVC_TOKEN })
  assert.strictEqual(wallets.status, 200, 'LINE bot เรียก /wallets ได้')
}
for (const wrong of [SVC_TOKEN.slice(0, -1) + 'X', SVC_TOKEN.slice(0, -1), SVC_TOKEN + 'a', 'X' + SVC_TOKEN.slice(1), ` ${SVC_TOKEN}`]) {
  assert.strictEqual((await call('GET', '/me', { token: wrong })).status, 401, `token เกือบถูก (${wrong.length} ตัว) ต้องไม่ผ่าน`)
}
{
  const env = makeEnv()
  env.DB.users.find(u => u.id === 'svc-user').is_active = 0
  assert.strictEqual((await call('GET', '/me', { token: SVC_TOKEN, env })).status, 401, 'service user ถูกปิด = token ใช้ไม่ได้ (เหมือนเดิม)')
}
{
  const env = makeEnv({ SERVICE_TOKEN: undefined })
  assert.strictEqual((await call('GET', '/me', { token: SVC_TOKEN, env })).status, 401, 'ไม่ได้ตั้ง SERVICE_TOKEN = path นี้ปิด')
}
{
  const r = await call('GET', '/me', { token: HROS_TOKEN })
  assert.strictEqual(r.status, 200, 'HR OS token ต้องใช้ได้')
  assert.strictEqual(r.json.user.id, 'hros-user')
  assert.strictEqual((await call('GET', '/me', { token: HROS_TOKEN.slice(0, -1) + 'Z' })).status, 401)
  const env = makeEnv()
  env.DB.users.find(u => u.id === 'hros-user').settings = JSON.stringify({ hrosSyncEnabled: false })
  const off = await call('GET', '/me', { token: HROS_TOKEN, env })
  assert.strictEqual(off.status, 403, 'สวิตช์ปิด HR OS ยังมีผลเหมือนเดิม')
  // สวิตช์ HR OS ต้องไม่กระทบ LINE bot
  assert.strictEqual((await call('GET', '/me', { token: SVC_TOKEN, env })).status, 200)
  // สลับ token กันใช้ต้องไม่ได้ตัวตนของอีกระบบ
  const envCross = makeEnv({ HROS_SERVICE_TOKEN: undefined })
  assert.strictEqual((await call('GET', '/me', { token: HROS_TOKEN, env: envCross })).status, 401)
}

// ── 4. WebSocket ─────────────────────────────────────────────────────
{
  const none = await call('GET', '/ws')
  assert.strictEqual(none.status, 401, 'ไม่มี token')
  assert.strictEqual(none.env.REALTIME.rooms.length, 0)

  const bad = await call('GET', '/ws?token=garbage')
  assert.strictEqual(bad.status, 401)
  assert.strictEqual(bad.env.REALTIME.rooms.length, 0)

  const gone = await call('GET', `/ws?token=${await jwtFor('u-gone')}`)
  assert.strictEqual(gone.status, 401, 'บัญชีที่ถูกปิดต่อ realtime ไม่ได้')
  assert.strictEqual(gone.env.REALTIME.rooms.length, 0, 'ต้องไม่ถึง Durable Object')

  const ok = await call('GET', `/ws?token=${await jwtFor('u-staff', { ws: 'ws-someone-else' })}`)
  assert.strictEqual(ok.status, 200)
  assert.deepStrictEqual(ok.env.REALTIME.rooms, ['ws1'], 'ห้องต้องมาจาก workspace ใน D1 ไม่ใช่ claim ws')

  const svc = await call('GET', `/ws?token=${SVC_TOKEN}`)
  assert.strictEqual(svc.status, 401, 'WebSocket รับเฉพาะ JWT เหมือนเดิม')
}

// ── 5. 500 ต้องไม่คาย err.message ────────────────────────────────────
{
  const origError = console.error
  const logged = []
  console.error = (...a) => logged.push(a)
  try {
    const env = makeEnv({ DB: makeDB({ throwOn: /FROM wallets/i }) })
    const r = await call('GET', '/wallets', { token: await jwtFor('u-admin'), env })
    assert.strictEqual(r.status, 500)
    assert.deepStrictEqual(r.json, { error: 'Internal server error' }, 'body ต้องเป็นข้อความกลาง')
    assert.ok(!/secret_internal_col|D1_ERROR|SQLITE/.test(r.text), 'รายละเอียดห้ามหลุดไป client')
    assert.strictEqual(r.res.headers.get('Access-Control-Allow-Origin'), '*', '500 ยังมี CORS header เหมือนเดิม')
    assert.ok(logged.some(a => a.some(x => String(x && x.message || x).includes('secret_internal_col'))), 'รายละเอียดต้องอยู่ใน log')
  } finally {
    console.error = origError
  }
}

// ── 6. CORS ──────────────────────────────────────────────────────────
{
  // ไม่ตั้ง ALLOWED_ORIGINS = พฤติกรรมเดิมทุกอย่าง
  const pre = await call('OPTIONS', '/transactions', { origin: 'https://anything.example' })
  assert.strictEqual(pre.status, 204)
  assert.strictEqual(pre.res.headers.get('Access-Control-Allow-Origin'), '*')
  assert.strictEqual(pre.res.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PATCH, DELETE, OPTIONS')
  assert.strictEqual(pre.res.headers.get('Vary'), null, 'ไม่ตั้ง = ไม่เพิ่ม header ใหม่')
  const health = await call('GET', '/health', { origin: 'https://anything.example' })
  assert.strictEqual(health.res.headers.get('Access-Control-Allow-Origin'), '*')
  const nf = await call('GET', '/nope', { token: await jwtFor('u-admin') })
  assert.strictEqual(nf.status, 404)
  assert.strictEqual(nf.res.headers.get('Access-Control-Allow-Origin'), '*')
}
{
  const allow = { ALLOWED_ORIGINS: 'https://fintrack-frontend-d6m.pages.dev, http://localhost:5173' }
  const good = await call('OPTIONS', '/transactions', { origin: 'https://fintrack-frontend-d6m.pages.dev', env: makeEnv(allow) })
  assert.strictEqual(good.status, 204)
  assert.strictEqual(good.res.headers.get('Access-Control-Allow-Origin'), 'https://fintrack-frontend-d6m.pages.dev')
  assert.match(good.res.headers.get('Vary') || '', /Origin/)
  assert.strictEqual(good.res.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization')

  const evil = await call('OPTIONS', '/transactions', { origin: 'https://evil.example', env: makeEnv(allow) })
  assert.strictEqual(evil.res.headers.get('Access-Control-Allow-Origin'), null, 'origin นอกรายชื่อไม่ได้ header')

  const evilGet = await call('GET', '/me', { token: await jwtFor('u-admin'), origin: 'https://evil.example', env: makeEnv(allow) })
  assert.strictEqual(evilGet.res.headers.get('Access-Control-Allow-Origin'), null)

  // LINE bot / HR OS เรียกจากเซิร์ฟเวอร์ ไม่มี Origin → status และ body ต้องเหมือนตอนไม่ตั้ง
  const svcWith = await call('GET', '/me', { token: SVC_TOKEN, env: makeEnv(allow) })
  const svcWithout = await call('GET', '/me', { token: SVC_TOKEN })
  assert.strictEqual(svcWith.status, 200)
  assert.deepStrictEqual(svcWith.json, svcWithout.json, 'ตั้ง ALLOWED_ORIGINS แล้ว LINE bot ได้ข้อมูลเหมือนเดิม')
  const hrosWith = await call('GET', '/me', { token: HROS_TOKEN, env: makeEnv(allow) })
  assert.strictEqual(hrosWith.status, 200, 'HR OS sync ไม่กระทบ')

  const local = await call('GET', '/health', { origin: 'http://localhost:5173', env: makeEnv(allow) })
  assert.strictEqual(local.res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173')

  const blank = await call('GET', '/health', { origin: 'https://evil.example', env: makeEnv({ ALLOWED_ORIGINS: ' , ' }) })
  assert.strictEqual(blank.res.headers.get('Access-Control-Allow-Origin'), '*', 'ค่าว่าง = เหมือนไม่ตั้ง')
}

console.log('worker-auth.test.mjs OK — register · JWT/D1 · service token · WebSocket · 500 · CORS ผ่านหมด')
