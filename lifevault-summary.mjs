// ช่องอ่านอย่างเดียวให้ Life Vault ดึง "ภาพสิ้นเดือนการเงินส่วนตัวของเจ้าของ" 5 ตัวเลข
// รูปแบบคำตอบและนิยามตัวเลข: docs/lifevault/personal-summary-api.md
// Run tests: node lifevault-summary.test.mjs
//
// กุญแจแยกของ Life Vault (INTEGRATION_POLICY ข้อ 1) — ไม่ผ่าน requireAuth จึงใช้เข้า route อื่นไม่ได้
// INERT จนกว่าจะตั้งครบ 3 ค่า: LIFEVAULT_TOKEN · LIFEVAULT_USER_ID · LIFEVAULT_ORIGIN
// rollback = ลบ LIFEVAULT_TOKEN ทิ้ง แล้วช่องนี้กลับเป็น 404
import { safeTokenEqual } from './auth-guard.mjs'

export const LIFEVAULT_SUMMARY_PATH = '/integrations/lifevault/personal-summary'

const pad = (n) => String(n).padStart(2, '0')
const addMonth = (ym, d) => {
  const [y, m] = ym.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + d, 1))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`
}
const lastDay = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}
// วันที่ของรายการใน Fintrack เป็นวันตามเวลาไทย (UTC+7 ไม่มี DST)
const thaiToday = (now) => new Date(now.getTime() + 7 * 3600e3).toISOString().slice(0, 10)
const satang = (baht) => Math.round((Number(baht) || 0) * 100)
const r1 = (n) => Math.round(n * 10) / 10

// รายรับ/รายจ่ายส่วนตัวจริงของแต่ละเดือน (เจ้าของเคาะ 9 ต.ค. 69):
// - ไม่นับรายการร่าง
// - โอนระหว่างกระเป๋า: ไม่นับเป็นรายจ่ายเสมอ · นับเป็นรายรับเฉพาะเมื่ออีกขาของคู่โอนเป็นของร้าน (scope business)
const FLOW_SQL = `SELECT substr(t.date, 1, 7) AS month,
    SUM(CASE WHEN t.type = 'income' AND (t.transfer_pair_id IS NULL OR EXISTS (
      SELECT 1 FROM transactions p WHERE p.transfer_pair_id = t.transfer_pair_id AND p.id != t.id AND p.scope = 'business'
    )) THEN t.amount ELSE 0 END) AS income,
    SUM(CASE WHEN t.type = 'expense' AND t.transfer_pair_id IS NULL THEN t.amount ELSE 0 END) AS expense
  FROM transactions t
  WHERE t.workspace_id = ? AND t.scope = 'personal' AND COALESCE(t.is_draft, 0) = 0 AND t.date >= ? AND t.date <= ?
  GROUP BY month`

export async function personalSummary(db, workspaceId, month, today) {
  const end = lastDay(month)
  const asOf = end < today ? end : today
  const from = `${addMonth(month, -2)}-01`
  const [wallets, later, flows] = await Promise.all([
    db.prepare("SELECT id, type, current_balance FROM wallets WHERE workspace_id = ? AND scope = 'personal' AND is_active = 1").bind(workspaceId).all(),
    // ยอด ณ วันที่ของภาพ = ยอดปัจจุบัน − ผลของรายการหลังวันนั้น (รายการร่างไม่เคยถูกนับเข้ายอดกระเป๋า)
    db.prepare("SELECT wallet_id, SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) AS net FROM transactions WHERE workspace_id = ? AND date > ? AND COALESCE(is_draft, 0) = 0 AND wallet_id IS NOT NULL GROUP BY wallet_id").bind(workspaceId, asOf).all(),
    db.prepare(FLOW_SQL).bind(workspaceId, from, asOf).all(),
  ])
  const laterNet = new Map((later.results || []).map((r) => [r.wallet_id, Number(r.net) || 0]))
  let net = 0, debt = 0, liquid = 0
  for (const w of wallets.results || []) {
    const bal = satang(Number(w.current_balance) - (laterNet.get(w.id) || 0))
    net += bal
    // ponytail: Fintrack มีหนี้ชนิดเดียวคือยอดค้างบัตรเครดิต (ยอดติดลบของกระเป๋า credit) — เงินกู้/ทรัพย์สินอื่นไม่มีในระบบ
    if (w.type === 'credit') debt += Math.max(0, -bal)
    else liquid += bal
  }
  const byMonth = new Map((flows.results || []).map((r) => [r.month, r]))
  const income = satang(byMonth.get(month)?.income), expense = satang(byMonth.get(month)?.expense)
  // เฉลี่ย 3 เดือนที่จบที่เดือนของภาพ เดือนที่ไม่มีรายการนับเป็น 0
  const avgExpense = [0, -1, -2].reduce((s, d) => s + satang(byMonth.get(addMonth(month, d))?.expense), 0) / 3
  return {
    month,
    as_of: asOf,
    net_worth_satang: net,
    // ไม่มีรายรับ = 0 (หารไม่ได้) · ตัดที่ -999 ตามช่วงที่ Vault รับ
    savings_rate_pct: income > 0 ? Math.max(-999, r1(((income - expense) / income) * 100)) : 0,
    debt_satang: debt,
    // ไม่มีรายจ่ายใน 3 เดือน = 0 (หารไม่ได้) · ตัดที่ 999 ตามช่วงที่ Vault รับ
    reserve_months: avgExpense > 0 ? Math.min(999, Math.max(0, r1(liquid / avgExpense))) : 0,
    expense_satang: expense,
  }
}

// คืน null เมื่อ path ไม่ใช่ของช่องนี้ ให้ worker เดินเส้นทางเดิมต่อ
// ตั้ง header CORS เองและคืนก่อน applyCorsPolicy — ไม่ขึ้นกับ ALLOWED_ORIGINS ของหน้าเว็บ Fintrack
export async function handleLifeVaultSummary(request, env, now = new Date()) {
  const url = new URL(request.url)
  if (url.pathname !== LIFEVAULT_SUMMARY_PATH) return null
  const origin = String(env.LIFEVAULT_ORIGIN || '').trim().replace(/\/+$/, '')
  const reply = (body, status, allow = true) => new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      ...(body === null ? {} : { 'Content-Type': 'application/json' }),
      ...(allow ? { 'Access-Control-Allow-Origin': origin } : {}),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Accept',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    },
  })
  if (!env.LIFEVAULT_TOKEN || !env.LIFEVAULT_USER_ID || !origin) return reply({ error: 'Not found' }, 404, false)
  // CORS ไม่ใช่ด่านตัวตน (กุญแจคือด่าน) แต่ผู้เรียกที่ถูกต้องมีแค่เบราว์เซอร์ที่เปิด Vault จึงปัดต้นทางอื่นทิ้งตั้งแต่ต้น
  if (request.headers.get('Origin') !== origin) return reply({ error: 'Forbidden origin' }, 403, false)
  if (request.method === 'OPTIONS') return reply(null, 204)
  if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405)
  if (env.RATE_LIMITER) {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown'
    const { success } = await env.RATE_LIMITER.limit({ key: 'lifevault:' + ip })
    if (!success) return reply({ error: 'เรียกถี่เกินไป กรุณารอสักครู่' }, 429)
  }
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ') || !(await safeTokenEqual(auth.slice(7), env.LIFEVAULT_TOKEN))) return reply({ error: 'Invalid token' }, 401)
  try {
    // เฉพาะเจ้าของ: บัญชีที่ผูกกับกุญแจต้องยัง active และเป็น admin — ปิดบัญชีหรือลด role แล้วกุญแจใช้ไม่ได้ทันที
    const owner = await env.DB.prepare('SELECT id, workspace_id, role FROM users WHERE id = ? AND is_active = 1').bind(env.LIFEVAULT_USER_ID).first()
    if (!owner || owner.role !== 'admin') return reply({ error: 'Forbidden' }, 403)
    const today = thaiToday(now)
    const month = url.searchParams.get('month') || addMonth(today.slice(0, 7), -1)
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > today.slice(0, 7)) return reply({ error: 'month ต้องเป็น YYYY-MM และไม่เกินเดือนนี้' }, 400)
    return reply(await personalSummary(env.DB, owner.workspace_id, month, today), 200)
  } catch (err) {
    console.error('lifevault summary error', err)
    return reply({ error: 'Internal error' }, 500)
  }
}
