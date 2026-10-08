// Run: node lifevault-summary.test.mjs
// ทดสอบช่องอ่านของ Life Vault ผ่าน worker.fetch จริง · D1 = SQLite ในหน่วยความจำ (node:sqlite) จึงรัน SQL จริง
// ครอบ: ปิดอยู่จนตั้งค่าครบ · คนอื่นเรียกไม่ได้ (ต้นทาง กุญแจ บัญชี role) · กุญแจนี้เข้า route อื่นไม่ได้ ·
//       ตัวเลข 5 ตัวตามนิยาม · ไม่กระทบเส้นทางเดิม · ข้อมูลทั้งหมดในไฟล์นี้สมมติ
import assert from 'node:assert'
import { DatabaseSync } from 'node:sqlite'
import worker from './worker.js'
import { LIFEVAULT_SUMMARY_PATH } from './lifevault-summary.mjs'

const ORIGIN = 'https://vault.example'
const TOKEN = 'lv-token-0123456789abcdef'
const SVC_TOKEN = 'svc-token-0123456789abcdef'
const NOW = new Date('2026-10-09T03:00:00Z') // 9 ต.ค. 2026 เวลาไทย → เดือนล่าสุดที่จบแล้ว = 2026-09

function makeDB() {
  const sql = new DatabaseSync(':memory:')
  sql.exec(`
    CREATE TABLE users (id TEXT, workspace_id TEXT, role TEXT, name TEXT, is_active INTEGER, settings TEXT);
    CREATE TABLE wallets (id TEXT, workspace_id TEXT, scope TEXT, type TEXT, current_balance REAL, is_active INTEGER DEFAULT 1);
    CREATE TABLE transactions (id TEXT, workspace_id TEXT, wallet_id TEXT, amount REAL, type TEXT, scope TEXT, date TEXT, is_draft INTEGER, transfer_pair_id TEXT);
    INSERT INTO users VALUES ('u-owner','ws1','admin','เจ้าของ',1,NULL), ('u-staff','ws1','staff','พนักงาน',1,NULL),
      ('u-gone','ws1','admin','ปิดแล้ว',0,NULL), ('svc-user','ws1','admin','LINE Bot',1,NULL), ('u-other','ws2','admin','ร้านอื่น',1,NULL);
    INSERT INTO wallets VALUES
      ('w-cash','ws1','personal','cash',10000,1), ('w-bank','ws1','personal','bank',50000,1), ('w-card','ws1','personal','credit',-8000,1),
      ('w-closed','ws1','personal','bank',99999,0), ('w-shop','ws1','business','bank',777777,1), ('w-other','ws2','personal','bank',555555,1);
    INSERT INTO transactions VALUES
      ('t1','ws1','w-bank',1000,'income','personal','2026-10-02',0,NULL),   -- หลังสิ้นเดือน: ต้องถอยออกจากยอด
      ('t2','ws1','w-card',500,'expense','personal','2026-10-03',0,NULL),   -- หลังสิ้นเดือน: บัตรสิ้นเดือน = -7500
      ('t3','ws1','w-bank',9999,'expense','personal','2026-10-04',1,NULL),  -- ร่าง: ไม่เคยเข้ายอด ไม่ต้องถอย
      ('t4','ws1','w-bank',30000,'income','personal','2026-09-01',0,NULL),
      ('t5','ws1','w-shop',20000,'expense','business','2026-09-05',0,'p1'), -- ร้าน → ส่วนตัว: นับเป็นรายรับส่วนตัว
      ('t6','ws1','w-bank',20000,'income','personal','2026-09-05',0,'p1'),
      ('t7','ws1','w-bank',5000,'expense','personal','2026-09-06',0,'p2'),  -- ส่วนตัว → ส่วนตัว: ไม่นับทั้งสองทาง
      ('t8','ws1','w-cash',5000,'income','personal','2026-09-06',0,'p2'),
      ('t9','ws1','w-bank',3000,'expense','personal','2026-09-07',0,'p3'),  -- ส่วนตัว → ร้าน: ไม่นับเป็นรายจ่าย
      ('t10','ws1','w-shop',3000,'income','business','2026-09-07',0,'p3'),
      ('t11','ws1','w-bank',12000,'expense','personal','2026-09-10',0,NULL),
      ('t12','ws1','w-card',3000.5,'expense','personal','2026-09-11',0,NULL),
      ('t13','ws1','w-bank',7777,'expense','personal','2026-09-12',1,NULL), -- ร่าง: ไม่นับ
      ('t14','ws1','w-shop',40000,'expense','business','2026-09-13',0,NULL),-- ของร้าน: ไม่นับ
      ('t15','ws1','w-bank',9000,'expense','personal','2026-08-10',0,NULL),
      ('t16','ws1','w-bank',6000,'expense','personal','2026-07-10',0,NULL),
      ('t17','ws1','w-bank',4000,'expense','personal','2026-06-10',0,NULL), -- นอกช่วง 3 เดือน
      ('t18','ws2','w-other',88888,'expense','personal','2026-09-10',0,NULL);-- ร้านอื่น: ไม่นับ
  `)
  return {
    sql,
    prepare(q) {
      const st = { args: [], bind(...a) { st.args = a; return st },
        async first() { return sql.prepare(q).get(...st.args) ?? null },
        async all() { return { results: sql.prepare(q).all(...st.args) } },
        async run() { return sql.prepare(q).run(...st.args) } }
      return st
    },
  }
}
const mkEnv = (over = {}) => ({ DB: makeDB(), JWT_SECRET: 'test-secret', SERVICE_TOKEN: SVC_TOKEN, SERVICE_USER_ID: 'svc-user',
  LIFEVAULT_TOKEN: TOKEN, LIFEVAULT_USER_ID: 'u-owner', LIFEVAULT_ORIGIN: ORIGIN + '/', ...over })
const call = (env, { path = LIFEVAULT_SUMMARY_PATH, method = 'GET', origin = ORIGIN, token = TOKEN } = {}) =>
  worker.fetch(new Request('https://api.test' + path, { method, headers: { ...(origin ? { Origin: origin } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) } }), env, {})
const leaks = async (res) => { const t = await res.text(); assert.ok(!/satang|net_worth/.test(t), 'คำตอบที่ถูกปฏิเสธต้องไม่มีตัวเลข: ' + t) }

// ── ปิดอยู่จนตั้งค่าครบ 3 ตัว ──
for (const k of ['LIFEVAULT_TOKEN', 'LIFEVAULT_USER_ID', 'LIFEVAULT_ORIGIN']) {
  const res = await call(mkEnv({ [k]: undefined }))
  assert.strictEqual(res.status, 404, `ไม่ตั้ง ${k} ต้องปิด`)
  await leaks(res)
}

// ── คนอื่นเรียกไม่ได้ ──
{
  const env = mkEnv()
  for (const [label, opt, status] of [
    ['ต้นทางอื่น', { origin: 'https://evil.example' }, 403],
    ['ไม่มีต้นทาง (ยิงจากเซิร์ฟเวอร์)', { origin: null }, 403],
    ['ไม่มีกุญแจ', { token: null }, 401],
    ['กุญแจผิด', { token: TOKEN + 'x' }, 401],
    ['กุญแจของ LINE bot', { token: SVC_TOKEN }, 401],
    ['POST', { method: 'POST' }, 405],
  ]) {
    const res = await call(env, opt)
    assert.strictEqual(res.status, status, label)
    if (status === 403) assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), null, label + ': ต้องไม่อนุญาตต้นทาง')
    await leaks(res)
  }
  // กุญแจถูก ต้นทางผิด ก็ยังไม่ได้
  assert.strictEqual((await call(env, { origin: 'https://vault.example.evil.test' })).status, 403)
}
// บัญชีที่ผูกกับกุญแจต้องเป็นเจ้าของที่ยังใช้งาน
for (const id of ['u-staff', 'u-gone', 'u-missing']) {
  const res = await call(mkEnv({ LIFEVAULT_USER_ID: id }))
  assert.strictEqual(res.status, 403, `บัญชี ${id} ต้องถูกปฏิเสธ`)
  await leaks(res)
}
// กุญแจของ Vault เข้า route อื่นของ Fintrack ไม่ได้
for (const path of ['/wallets', '/transactions', '/users', '/auth/me']) {
  assert.strictEqual((await call(mkEnv(), { path })).status, 401, `กุญแจ Vault ต้องเข้า ${path} ไม่ได้`)
}

// ── preflight ของเบราว์เซอร์ ──
{
  const ok = await call(mkEnv(), { method: 'OPTIONS', token: null })
  assert.strictEqual(ok.status, 204)
  assert.strictEqual(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN)
  assert.match(ok.headers.get('Access-Control-Allow-Headers'), /Authorization/)
  assert.strictEqual((await call(mkEnv(), { method: 'OPTIONS', token: null, origin: 'https://evil.example' })).status, 403)
}

// ── ตัวเลข 5 ตัว (เรียก handler ตรงเพื่อกำหนด "วันนี้") ──
{
  const { handleLifeVaultSummary } = await import('./lifevault-summary.mjs')
  const get = (env, qs = '') => handleLifeVaultSummary(new Request('https://api.test' + LIFEVAULT_SUMMARY_PATH + qs, { headers: { Origin: ORIGIN, Authorization: 'Bearer ' + TOKEN } }), env, NOW)
  // ALLOWED_ORIGINS ของหน้าเว็บ Fintrack ไม่มี Vault อยู่ ก็ต้องไม่ตัด header ของช่องนี้
  const res = await get(mkEnv({ ALLOWED_ORIGINS: 'https://fintrack.example' }))
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), ORIGIN)
  assert.strictEqual(res.headers.get('Cache-Control'), 'no-store')
  assert.deepStrictEqual(await res.json(), {
    month: '2026-09',
    as_of: '2026-09-30',
    // เงินสด 10000 + ธนาคาร (50000 − 1000) + บัตร (−8000 + 500) = 51500 บาท · กระเป๋าที่ปิด ของร้าน และร้านอื่นไม่นับ
    net_worth_satang: 5150000,
    // รายรับ 30000 + 20000 (ร้าน → ส่วนตัว) = 50000 · รายจ่าย 15000.50 → (50000 − 15000.5) / 50000 = 70.0%
    savings_rate_pct: 70,
    debt_satang: 750000,
    // สภาพคล่อง 59000 ÷ เฉลี่ย (15000.5 + 9000 + 6000) / 3 = 5.9 เดือน
    reserve_months: 5.9,
    expense_satang: 1500050,
  })
  // เดือนนี้: ภาพ ณ วันนี้ · ไม่ถอยรายการ
  const cur = await (await get(mkEnv(), '?month=2026-10')).json()
  assert.strictEqual(cur.as_of, '2026-10-09')
  assert.strictEqual(cur.net_worth_satang, 5200000)
  assert.strictEqual(cur.debt_satang, 800000)
  assert.strictEqual(cur.expense_satang, 50000)
  assert.strictEqual(cur.savings_rate_pct, 50)
  // เดือนที่ไม่มีรายการ: หารไม่ได้ = 0 ไม่ใช่ NaN/null (Vault ไม่รับ)
  const empty = await (await get(mkEnv(), '?month=2025-01')).json()
  assert.strictEqual(empty.savings_rate_pct, 0)
  assert.strictEqual(empty.reserve_months, 0)
  assert.strictEqual(empty.expense_satang, 0)
  assert.ok(Number.isSafeInteger(empty.net_worth_satang))
  for (const bad of ['2026-11', '2026-13', '2026-9', 'x', "2026-09'--"]) {
    assert.strictEqual((await get(mkEnv(), '?month=' + encodeURIComponent(bad))).status, 400, 'month ไม่ถูกต้อง: ' + bad)
  }
  // คำตอบมีแค่ 7 ช่อง ไม่มีชื่อกระเป๋า/รายการ
  assert.deepStrictEqual(Object.keys(cur).sort(), ['as_of', 'debt_satang', 'expense_satang', 'month', 'net_worth_satang', 'reserve_months', 'savings_rate_pct'])
}

// ── จำกัดความถี่ ──
{
  const res = await call(mkEnv({ RATE_LIMITER: { limit: async ({ key }) => ({ success: !key.startsWith('lifevault:') }) } }))
  assert.strictEqual(res.status, 429)
}

// ── เส้นทางเดิมไม่เปลี่ยน ──
{
  const health = await call(mkEnv({ LIFEVAULT_TOKEN: undefined }), { path: '/health', token: null })
  assert.strictEqual(health.status, 200)
  assert.strictEqual(health.headers.get('Access-Control-Allow-Origin'), '*')
}

console.log('lifevault-summary: all tests passed')
