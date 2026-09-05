// Run: node pending-bills-patch.test.mjs
// ทดสอบ PATCH /pending-bills/:id ระดับ route จริง โดย stub เฉพาะ D1 (ไม่ต้องมี wrangler/D1 จริง)
// เหตุผลที่ต้องมี: route นี้เขียนทับยอดเงินและลบคำยืนยันของคู่ค้า build ผ่านไม่ได้แปลว่าถูก
import assert from 'node:assert'
import worker from './worker.js'

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

// ── D1 stub: จดทุก SQL ที่ถูกยิง เพื่อตรวจว่าเขียนคอลัมน์อะไรบ้าง ──
function makeDB(billRow) {
  const log = []
  return {
    log,
    prepare(sql) {
      const stmt = {
        sql, args: [],
        bind(...a) { stmt.args = a; return stmt },
        async first() {
          log.push({ sql, args: stmt.args })
          if (/FROM pending_bills/i.test(sql) || /FROM pending_bills pb/i.test(sql)) return billRow ? { ...billRow } : null
          return null
        },
        async run() {
          log.push({ sql, args: stmt.args })
          return { meta: { changes: 1 } }
        },
        async all() { log.push({ sql, args: stmt.args }); return { results: [] } },
      }
      return stmt
    },
  }
}

const baseBill = {
  id: 'pb1', workspace_id: 'ws1', status: 'pending', kind: 'billing_link',
  name: 'วางบิล ร้านผัก', amount: 1840, category_id: null, sub_category_id: null, note: null,
  evidence_type: 'slip_transfer', line_items: JSON.stringify([
    { name: 'มะละกอ', qty: 40, unit: 'กก.', unitPrice: 20 },
    { name: 'ผักกาดหอม', qty: 3, unit: 'กก.', unitPrice: 0 },
  ]),
  public_token: 'a'.repeat(64), vendor_ack: null, vendor_signature_key: null,
  submitted_by_user_id: 'u9', created_at: '2026-09-01 00:00:00', updated_at: '2026-09-01 00:00:00',
}

async function call(body, { role = 'admin', bill = baseBill, userId = 'u1', env: envOver = {} } = {}) {
  const db = makeDB(bill)
  const env = { DB: db, JWT_SECRET: SECRET, SERVICE_TOKEN: 'svc-tok', SERVICE_USER_ID: 'svc-user', ...envOver }
  const token = await mintJWT({ sub: userId, ws: 'ws1', role, name: 'T' })
  const res = await worker.fetch(new Request('https://x/pending-bills/pb1', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), env, {})
  let json = null
  try { json = await res.clone().json() } catch { json = null }
  return { status: res.status, json, db }
}
const updateSQL = (db) => db.log.find(l => /^UPDATE pending_bills/i.test(l.sql.trim()))

// ── 1. สิทธิ์ ──────────────────────────────────────────────────────
assert.strictEqual((await call({ name: 'x' }, { role: 'staff' })).status, 403, 'staff ต้องถูกปฏิเสธ')
assert.strictEqual((await call({ name: 'x' }, { role: 'viewer' })).status, 403, 'viewer ต้องถูกปฏิเสธ')
// service token ของ LINE bot / HR OS ต้องเข้าไม่ได้ แม้แถว user จะเป็น admin
assert.strictEqual((await call({ name: 'x' }, { userId: 'svc-user' })).status, 403, 'service user ต้องถูกปฏิเสธ')
assert.strictEqual((await call({ name: 'x' }, { userId: 'hros-user', env: { HROS_SERVICE_USER_ID: 'hros-user' } })).status, 403, 'HROS service user ต้องถูกปฏิเสธ')

// ── 2. สถานะ ──────────────────────────────────────────────────────
assert.strictEqual((await call({ name: 'x' }, { bill: null })).status, 404, 'ไม่พบบิล')
assert.strictEqual((await call({ name: 'x' }, { bill: { ...baseBill, status: 'paid' } })).status, 409, 'จ่ายแล้วห้ามแก้')
assert.strictEqual((await call({ name: 'x' }, { bill: { ...baseBill, status: 'rejected' } })).status, 409, 'ปฏิเสธแล้วห้ามแก้')

// ── 3. ตรวจ input ─────────────────────────────────────────────────
assert.strictEqual((await call({})).status, 400, 'ไม่มีอะไรให้แก้')
assert.strictEqual((await call({ name: '   ' })).status, 400, 'ชื่อว่างไม่ได้')
assert.strictEqual((await call({ amount: 5000 })).status, 400, 'บิลมีรายการ ห้ามส่ง amount ตรง ๆ')
assert.strictEqual((await call({ lineItems: [] })).status, 400, 'รายการว่างไม่ได้')
assert.strictEqual((await call({ lineItems: [{ name: 'x', qty: 0, unitPrice: 5 }] })).status, 400, 'qty ต้อง > 0')

// ── 4. ยอดเงินต้องคำนวณจากเซิร์ฟเวอร์ ห้ามเชื่อ client ─────────────
{
  const r = await call({ lineItems: [{ name: 'a', qty: 2, unitPrice: 30 }, { name: 'b', qty: 1, unitPrice: 40 }], amount: 999999 })
  assert.strictEqual(r.status, 200, 'แก้รายการต้องผ่าน')
  const u = updateSQL(r.db)
  const ai = u.sql.split('SET ')[1].split(' WHERE')[0].split(', ').findIndex(c => c.startsWith('amount ='))
  const cols = u.sql.split('SET ')[1].split(' WHERE')[0].split(', ')
  assert.ok(cols.some(c => c.startsWith('amount =')), 'ต้องเขียน amount')
  assert.strictEqual(u.args[ai], 100, 'amount ต้อง = 2*30+1*40 = 100 ไม่ใช่ 999999 ที่ client ส่งมา')
}

// ── 5. เพดานบิลไม่มีบิลต้องเช็คซ้ำเมื่อยอดเปลี่ยน ──────────────────
{
  const cashBill = { ...baseBill, kind: 'simple', line_items: null, evidence_type: 'self_declared', amount: 500 }
  assert.strictEqual((await call({ amount: 5000 }, { bill: cashBill })).status, 400, 'เงินสดไม่มีบิลเกินเพดานต้องถูกปฏิเสธ')
  assert.strictEqual((await call({ amount: 900 }, { bill: cashBill })).status, 200, 'ต่ำกว่าเพดานผ่านได้')
}

// ── 6. คำยืนยันคู่ค้า: ยอดเปลี่ยน = ล้างทั้งคำยืนยันและลายเซ็น ──────
{
  const acked = { ...baseBill, vendor_ack: JSON.stringify({ name: 'ป้านิด', at: '2026-09-02T00:00:00Z', ip: '1.1.1.1', ua: 'x' }), vendor_signature_key: 'ws1/sig/pb1' }
  const r = await call({ lineItems: [{ name: 'a', qty: 1, unitPrice: 55 }] }, { bill: acked })
  assert.strictEqual(r.status, 200)
  assert.strictEqual(r.json.ackCleared, true, 'ต้องรายงานว่าล้างคำยืนยันแล้ว')
  const u = updateSQL(r.db)
  const cols = u.sql.split('SET ')[1].split(' WHERE')[0].split(', ')
  assert.ok(cols.some(c => c.startsWith('vendor_ack =')), 'ต้องล้าง vendor_ack')
  // ลายเซ็นต้องถูกล้างพร้อมกัน ไม่งั้นลายเซ็นจริงของคู่ค้าจะค้างอยู่ใต้ยอดที่เขาไม่เคยเซ็น
  assert.ok(cols.some(c => c.startsWith('vendor_signature_key =')), 'ต้องล้างลายเซ็นด้วย')
  assert.strictEqual(u.args[cols.findIndex(c => c.startsWith('vendor_ack ='))], null, 'ไม่มี dispute เดิม -> null')
  assert.strictEqual(u.args[cols.findIndex(c => c.startsWith('vendor_signature_key ='))], null)
}

// ── 7. แก้อย่างอื่นโดยยอดไม่เปลี่ยน = ห้ามแตะคำยืนยัน ──────────────
{
  const acked = { ...baseBill, vendor_ack: JSON.stringify({ name: 'ป้านิด', at: '2026-09-02T00:00:00Z' }), vendor_signature_key: 'k' }
  const r = await call({ note: 'แก้โน้ตเฉย ๆ' }, { bill: acked })
  assert.strictEqual(r.status, 200)
  assert.strictEqual(r.json.ackCleared, false, 'โน้ตภายในเปลี่ยน ไม่ควรล้างคำยืนยัน')
  const cols = updateSQL(r.db).sql.split('SET ')[1].split(' WHERE')[0]
  assert.ok(!cols.includes('vendor_ack'), 'ห้ามแตะ vendor_ack')
  assert.ok(!cols.includes('vendor_signature_key'), 'ห้ามแตะลายเซ็น')
}

// ── 8. คำทักท้วงของคู่ค้าต้องไม่หายไปกับการล้างคำยืนยัน ─────────────
{
  const both = { ...baseBill, vendor_ack: JSON.stringify({ name: 'ป้านิด', at: '2026-09-02T00:00:00Z', disputeReason: 'ของขาด 2 กก.', disputeAt: '2026-09-01T00:00:00Z' }) }
  const r = await call({ lineItems: [{ name: 'a', qty: 1, unitPrice: 77 }] }, { bill: both })
  const u = updateSQL(r.db)
  const cols = u.sql.split('SET ')[1].split(' WHERE')[0].split(', ')
  const kept = JSON.parse(u.args[cols.findIndex(c => c.startsWith('vendor_ack ='))])
  assert.strictEqual(kept.at, null, 'คำยืนยันต้องถูกล้าง')
  assert.strictEqual(kept.disputeReason, 'ของขาด 2 กก.', 'คำทักท้วงต้องอยู่ต่อ')
  assert.strictEqual(kept.disputeAt, '2026-09-01T00:00:00Z')
}

// ── 9. ห้ามแตะคอลัมน์ต้องห้ามเด็ดขาด ───────────────────────────────
{
  const r = await call({ name: 'ใหม่', status: 'paid', kind: 'simple', publicToken: 'hack', payeeAccountNo: '999', id: 'other' })
  assert.strictEqual(r.status, 200)
  const setClause = updateSQL(r.db).sql.split('SET ')[1].split(' WHERE')[0]
  for (const forbidden of ['status', 'kind', 'public_token', 'payee_', 'workspace_id', 'submitted_by']) {
    assert.ok(!setClause.includes(forbidden), `ห้ามเขียนคอลัมน์ ${forbidden} — เจอใน: ${setClause}`)
  }
  // WHERE ต้องยืนยัน status ซ้ำ กันแข่งกับปุ่มจ่าย
  assert.ok(/status = 'pending'/.test(updateSQL(r.db).sql), 'WHERE ต้องล็อก status = pending')
  assert.ok(/workspace_id = \?/.test(updateSQL(r.db).sql), 'WHERE ต้องล็อก workspace_id')
}

// ── 10. ต้องมี audit log และคืน JSON เสมอ (req() parse JSON ก่อนเช็ค ok) ──
{
  const r = await call({ name: 'ชื่อใหม่' })
  assert.strictEqual(r.status, 200)
  assert.ok(r.json && r.json.bill !== undefined, 'ต้องคืน { bill }')
  const audit = r.db.log.find(l => /INSERT INTO audit_log/i.test(l.sql))
  assert.ok(audit, 'ต้องลง audit log')
  const details = JSON.parse(audit.args[6])
  assert.strictEqual(details.amountFrom, 1840, 'audit ต้องเก็บยอดเดิม')
  assert.strictEqual(audit.args[3], 'update')
  assert.strictEqual(audit.args[4], 'pending_bill')
}
// error ก็ต้องเป็น JSON
{
  const r = await call({}, {})
  assert.ok(r.json && r.json.error, 'error ต้องเป็น JSON body')
}

// ── 11. BLOCKER: ใบรับของมีลายเซ็นแต่ไม่มี vendor_ack เสมอ
//   loadAckableBill รับเฉพาะ billing_link ส่วน GoodsReceiptModal บังคับให้เซ็นทุกใบ
//   guard ที่ผูกกับ vendor_ack จึงไม่เคยทำงานกับใบรับของเลย -> ลายเซ็นจริงค้างใต้ยอดใหม่
{
  const gr = { ...baseBill, kind: 'goods_receipt', vendor_ack: null, vendor_signature_key: 'ws1/sig/pb1' }
  const r = await call({ lineItems: [{ name: 'หมู', qty: 4, unitPrice: 300 }] }, { bill: gr })
  assert.strictEqual(r.status, 200)
  const cols = updateSQL(r.db).sql.split('SET ')[1].split(' WHERE')[0]
  assert.ok(cols.includes('vendor_signature_key'), 'ใบรับของ: ของเปลี่ยนต้องล้างลายเซ็น แม้ไม่มี vendor_ack')
  assert.strictEqual(r.json.signatureCleared, true)
}
{
  const signedNotAcked = { ...baseBill, vendor_ack: null, vendor_signature_key: 'k' }
  const r = await call({ lineItems: [{ name: 'a', qty: 1, unitPrice: 99 }] }, { bill: signedNotAcked })
  assert.ok(updateSQL(r.db).sql.includes('vendor_signature_key'), 'เซ็นแล้วยังไม่ยืนยัน ก็ต้องล้าง')
}
{
  const r = await call({ lineItems: [{ name: 'a', qty: 1, unitPrice: 99 }] }, { bill: { ...baseBill, vendor_ack: null, vendor_signature_key: null } })
  assert.strictEqual(r.json.signatureCleared, false)
  assert.strictEqual(r.json.ackCleared, false)
}

// ── 12. BLOCKER: สลับของทั้งตะกร้าโดยยอดรวมเท่าเดิม ต้องล้างหลักฐานด้วย
{
  const acked = { ...baseBill, amount: 800, line_items: JSON.stringify([{ name: 'หมู', qty: 4, unit: 'กก.', unitPrice: 200 }]),
    vendor_ack: JSON.stringify({ name: 'ป้า', at: '2026-09-02T00:00:00Z' }), vendor_signature_key: 'k' }
  const r = await call({ lineItems: [{ name: 'ไก่', qty: 8, unit: 'กก.', unitPrice: 100 }] }, { bill: acked })  // ยอดยัง 800
  assert.strictEqual(r.json.ackCleared, true, 'ของเปลี่ยนแม้ยอดเท่าเดิม ต้องล้างคำยืนยัน')
  assert.strictEqual(r.json.signatureCleared, true)
}

// ── 13. BLOCKER: ห้ามแก้จนยอดเป็น 0 (create บังคับ amount > 0 อยู่แล้ว)
assert.strictEqual((await call({ lineItems: [{ name: 'a', qty: 2, unitPrice: 0 }, { name: 'b', qty: 1, unitPrice: 0 }] })).status, 400, 'ยอดรวม 0 ต้องถูกปฏิเสธ')

// ── 14. กันแข่ง: คู่ค้าเซ็น/ยืนยันระหว่างแอดมินแก้ -> WHERE ล็อกค่าที่อ่านมาตอนต้น
{
  const r = await call({ name: 'x' }, { bill: { ...baseBill, vendor_ack: null, vendor_signature_key: 'k' } })
  const u = updateSQL(r.db)
  assert.ok(/vendor_ack IS \?/.test(u.sql) && /vendor_signature_key IS \?/.test(u.sql), 'WHERE ต้องล็อกทั้งสองคอลัมน์')
  assert.strictEqual(u.args[u.args.length - 1], 'k')
  assert.strictEqual(u.args[u.args.length - 2], null)
}

// ── 15. BLOCKER (เจอตอน review รอบสอง): ใบรับของเก็บ qty/ราคาเป็น "สตริง"
//   ส่วน EditBillModal ส่งกลับเป็นตัวเลข ถ้าเทียบ JSON ตรง ๆ จะบอกว่าของเปลี่ยนทุกครั้ง
//   แล้วลบลายเซ็นทิ้งแม้แก้แค่ชื่อ — และใบรับของเซ็นใหม่ผ่านระบบไม่ได้
{
  // นี่คือรูปร่างที่ GoodsReceiptModal เก็บจริง (lineItems: validItems ดิบ ๆ จากช่องกรอก)
  const realGR = {
    ...baseBill, kind: 'goods_receipt', vendor_signature_key: 'ws1/sig/pb1', vendor_ack: null,
    amount: 480, line_items: JSON.stringify([{ name: 'หมู', qty: '4', unit: 'กก.', unitPrice: '120' }]),
  }
  // แก้แค่ชื่อรายการ ของไม่เปลี่ยนเลย -> ห้ามแตะลายเซ็น
  const r = await call({ name: 'รับของ ร้านใหม่', lineItems: [{ name: 'หมู', qty: 4, unit: 'กก.', unitPrice: 120 }] }, { bill: realGR })
  assert.strictEqual(r.status, 200)
  assert.strictEqual(r.json.signatureCleared, false, 'ของชุดเดิม (string vs number) ห้ามลบลายเซ็น')
  const cols = updateSQL(r.db).sql.split('SET ')[1].split(' WHERE')[0]
  assert.ok(!cols.includes('vendor_signature_key'), 'ห้ามเขียนคอลัมน์ลายเซ็นเลย')
  // แต่ถ้าของเปลี่ยนจริง ต้องล้าง
  const r2 = await call({ lineItems: [{ name: 'ไก่', qty: 4, unit: 'กก.', unitPrice: 120 }] }, { bill: realGR })
  assert.strictEqual(r2.json.signatureCleared, true, 'ของเปลี่ยนจริงต้องล้างลายเซ็น')
  // สลับลำดับแถวไม่ใช่ของเปลี่ยน
  const two = { ...realGR, amount: 580, line_items: JSON.stringify([{ name: 'หมู', qty: '4', unit: 'กก.', unitPrice: '120' }, { name: 'ไก่', qty: '1', unit: 'กก.', unitPrice: '100' }]) }
  const r3 = await call({ lineItems: [{ name: 'ไก่', qty: 1, unit: 'กก.', unitPrice: 100 }, { name: 'หมู', qty: 4, unit: 'กก.', unitPrice: 120 }] }, { bill: two })
  assert.strictEqual(r3.json.signatureCleared, false, 'สลับลำดับแถวไม่ใช่ของเปลี่ยน')
}

// ── 16. วันส่งของซ่อนอยู่ใน note และถูกพิมพ์บนใบที่คู่ค้าเซ็น (getPublicReceipt แกะด้วย regex)
//   เปลี่ยนวันส่งของ = เปลี่ยนสิ่งที่เขาตกลง ต้องล้าง แต่โน้ตภายในอื่น ๆ ต้องไม่ล้าง
{
  const withDue = { ...baseBill, note: 'ของส่งวันที่ 2026-09-10',
    vendor_ack: JSON.stringify({ name: 'ป้า', at: '2026-09-02T00:00:00Z' }), vendor_signature_key: 'k' }
  const moved = await call({ note: 'ของส่งวันที่ 2026-12-31' }, { bill: withDue })
  assert.strictEqual(moved.json.ackCleared, true, 'เลื่อนวันส่งของ ต้องล้างคำยืนยัน')
  assert.strictEqual(moved.json.signatureCleared, true)

  const sameDue = await call({ note: 'ของส่งวันที่ 2026-09-10 (โทรยืนยันแล้ว)' }, { bill: withDue })
  assert.strictEqual(sameDue.json.ackCleared, false, 'วันส่งเท่าเดิม เพิ่มข้อความต่อท้าย ไม่ต้องล้าง')
  assert.strictEqual(sameDue.json.signatureCleared, false)

  const internal = { ...baseBill, note: 'ของโอปอ', vendor_signature_key: 'k' }
  const r = await call({ note: 'ของโอปอ · จ่ายด่วน' }, { bill: internal })
  assert.strictEqual(r.json.signatureCleared, false, 'โน้ตภายในล้วน ห้ามล้างลายเซ็น')
}

console.log('pending-bills-patch.test.mjs OK — 16 กลุ่ม ผ่านหมด')
