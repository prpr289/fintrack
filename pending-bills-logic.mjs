// Pure business rules for pending expense bills — dependency-free.
// Shared by worker.js (wrangler bundles the relative import) and the test.
// ponytail: keep the money/rules logic here so it has one runnable check.
export const NO_BILL_CAP = 1000
export const EVIDENCE_TYPES = ['slip_transfer', 'receipt', 'self_declared']
const PAYEE_TYPES = ['employee', 'vendor', 'other']
const SCOPES = ['business', 'personal']

export function validateBillInput(input) {
  const { name, amount, scope, payeeType, evidenceType } = input || {}
  if (!name || !String(name).trim()) return { ok: false, error: 'ต้องมีชื่อรายการ' }
  if (!(Number(amount) > 0)) return { ok: false, error: 'จำนวนเงินต้องมากกว่า 0' }
  if (!SCOPES.includes(scope)) return { ok: false, error: 'scope ไม่ถูกต้อง' }
  if (!PAYEE_TYPES.includes(payeeType)) return { ok: false, error: 'ปลายทางไม่ถูกต้อง' }
  if (!EVIDENCE_TYPES.includes(evidenceType)) return { ok: false, error: 'ประเภทหลักฐานไม่ถูกต้อง' }
  return { ok: true }
}

export function checkNoBillCap(evidenceType, amount, cap = NO_BILL_CAP) {
  if (evidenceType === 'self_declared' && Number(amount) > cap) {
    return { ok: false, error: `เกินเพดานบิลไม่มีบิล (฿${cap}) ต้องจ่ายแบบโอน` }
  }
  return { ok: true }
}

export function isWeakEvidence(evidenceType) {
  return evidenceType === 'self_declared'
}

export function dupKey(bill) {
  const payee = bill.payeeRefId || bill.payeeName || ''
  return `${payee}|${bill.amount}|${bill.date}`
}

export function weakRatioByUser(bills) {
  const acc = {}
  for (const b of bills) {
    const u = b.submittedByUserId
    if (!acc[u]) acc[u] = { weak: 0, total: 0 }
    acc[u].total += Number(b.amount)
    if (isWeakEvidence(b.evidenceType)) acc[u].weak += Number(b.amount)
  }
  const out = {}
  for (const u of Object.keys(acc)) {
    out[u] = acc[u].total > 0 ? Math.round((acc[u].weak / acc[u].total) * 100) : 0
  }
  return out
}
