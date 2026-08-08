export const AUDIT_ISSUE = Object.freeze({
  DRAFT: 'draft',
  PENDING_EDIT: 'pending_edit',
  MISSING_CATEGORY: 'missing_category',
  UNRECONCILED: 'unreconciled',
  BROKEN_TRANSFER: 'broken_transfer',
  POSSIBLE_DUPLICATE: 'possible_duplicate',
})

const valueOf = (row, snake, camel) => row?.[snake] ?? row?.[camel]
const truthyDb = (value) => value === true || value === 1 || value === '1'

export function parseMoneyToSatang(value) {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('invalid money')
  const text = String(value).trim()
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) throw new Error('invalid money')
  const negative = text.startsWith('-')
  const unsigned = negative ? text.slice(1) : text
  const [whole, fraction = ''] = unsigned.split('.')
  const satang = (BigInt(whole) * 100n) + BigInt((fraction + '00').slice(0, 2))
  const signed = negative ? -satang : satang
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error('money out of range')
  }
  return Number(signed)
}

export function parseObservedBalanceToSatang(value) {
  if (typeof value !== 'string') throw new Error('observed balance must be a string')
  return parseMoneyToSatang(value)
}

export function amountToSatang(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) throw new Error('invalid amount')
  const satang = Math.round(amount * 100)
  if (!Number.isSafeInteger(satang)) throw new Error('amount out of range')
  return satang
}

export function satangToAmount(value) {
  if (!Number.isSafeInteger(value)) throw new Error('invalid satang')
  return value / 100
}

export function satangToDecimalString(value) {
  if (!Number.isSafeInteger(value)) throw new Error('invalid satang')
  const signed = BigInt(value)
  const negative = signed < 0n
  const absolute = negative ? -signed : signed
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
}

export function subtractSatang(left, right) {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) throw new Error('invalid satang')
  const difference = BigInt(left) - BigInt(right)
  if (difference > BigInt(Number.MAX_SAFE_INTEGER) || difference < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error('satang difference out of range')
  }
  return Number(difference)
}

export function normalizeAuditText(value) {
  return String(value || '').trim().toLocaleLowerCase('th-TH').replace(/\s+/g, ' ')
}

function fnv1a64(value, offset) {
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  let hash = offset
  for (const char of value) {
    hash ^= BigInt(char.codePointAt(0))
    hash = (hash * prime) & mask
  }
  return hash.toString(16).padStart(16, '0')
}

export function auditFingerprint(value) {
  const text = String(value)
  return fnv1a64(text, 0xcbf29ce484222325n) + fnv1a64(text, 0x84222325cbf29ce4n)
}

function addIssue(byTransaction, blockers, transactionId, issue) {
  if (!transactionId) return
  if (!byTransaction[transactionId]) byTransaction[transactionId] = []
  if (!byTransaction[transactionId].some((row) => row.code === issue.code && row.issueKey === issue.issueKey)) {
    byTransaction[transactionId].push(issue)
  }
  blockers.set(issue.issueKey || `${issue.code}:${transactionId}`, issue)
}

function isValidTransferPair(rows) {
  if (rows.length !== 2) return false
  const [left, right] = rows
  const leftType = valueOf(left, 'type', 'type')
  const rightType = valueOf(right, 'type', 'type')
  const leftWallet = valueOf(left, 'wallet_id', 'walletId')
  const rightWallet = valueOf(right, 'wallet_id', 'walletId')
  const leftDate = valueOf(left, 'date', 'date')
  const rightDate = valueOf(right, 'date', 'date')
  const leftWorkspace = valueOf(left, 'workspace_id', 'workspaceId')
  const rightWorkspace = valueOf(right, 'workspace_id', 'workspaceId')
  return leftType !== rightType
    && new Set([leftType, rightType]).size === 2
    && ['income', 'expense'].includes(leftType)
    && ['income', 'expense'].includes(rightType)
    && leftWallet && rightWallet && leftWallet !== rightWallet
    && leftDate === rightDate
    && leftWorkspace === rightWorkspace
    && amountToSatang(valueOf(left, 'amount', 'amount')) === amountToSatang(valueOf(right, 'amount', 'amount'))
}

export function buildAuditIssues(transactions, resolvedIssueKeys = []) {
  const rows = Array.isArray(transactions) ? transactions : []
  const resolved = new Set(resolvedIssueKeys)
  const byTransaction = {}
  const blockers = new Map()
  const transfers = new Map()
  const duplicateGroups = new Map()

  for (const tx of rows) {
    const id = valueOf(tx, 'id', 'id')
    const pairId = valueOf(tx, 'transfer_pair_id', 'transferPairId')
    const isDraft = truthyDb(valueOf(tx, 'is_draft', 'isDraft'))
    const pending = valueOf(tx, 'pending_changes', 'pendingChanges')
    const categoryId = valueOf(tx, 'category_id', 'categoryId')
    const reconciled = truthyDb(valueOf(tx, 'is_reconciled', 'isReconciled'))

    if (isDraft) addIssue(byTransaction, blockers, id, { code: AUDIT_ISSUE.DRAFT, issueKey: `draft:${id}` })
    if (pending) addIssue(byTransaction, blockers, id, { code: AUDIT_ISSUE.PENDING_EDIT, issueKey: `pending:${id}` })
    if (!categoryId && !pairId) addIssue(byTransaction, blockers, id, { code: AUDIT_ISSUE.MISSING_CATEGORY, issueKey: `category:${id}` })
    if (!reconciled && !isDraft) {
      addIssue(byTransaction, blockers, id, {
        code: AUDIT_ISSUE.UNRECONCILED,
        issueKey: pairId ? `reconcile-transfer:${pairId}` : `reconcile:${id}`,
      })
    }

    if (pairId) {
      if (!transfers.has(pairId)) transfers.set(pairId, [])
      transfers.get(pairId).push(tx)
    } else if (!isDraft) {
      const walletId = valueOf(tx, 'wallet_id', 'walletId') || ''
      const date = valueOf(tx, 'date', 'date') || ''
      const type = valueOf(tx, 'type', 'type') || ''
      const amount = amountToSatang(valueOf(tx, 'amount', 'amount'))
      const category = categoryId || ''
      const name = normalizeAuditText(valueOf(tx, 'name', 'name'))
      const detail = name || `category:${category}`
      const signature = [walletId, date, type, amount, detail].join('|')
      if (!duplicateGroups.has(signature)) duplicateGroups.set(signature, [])
      duplicateGroups.get(signature).push(tx)
    }
  }

  for (const [pairId, group] of transfers) {
    if (isValidTransferPair(group)) continue
    const issue = { code: AUDIT_ISSUE.BROKEN_TRANSFER, issueKey: `transfer:${pairId}` }
    for (const tx of group) addIssue(byTransaction, blockers, valueOf(tx, 'id', 'id'), issue)
  }

  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue
    const ids = group.map((tx) => valueOf(tx, 'id', 'id')).filter(Boolean).sort()
    const issueKey = `duplicate:${auditFingerprint(ids.join('|'))}`
    if (resolved.has(issueKey)) continue
    const issue = { code: AUDIT_ISSUE.POSSIBLE_DUPLICATE, issueKey, transactionCount: ids.length }
    for (const id of ids) addIssue(byTransaction, blockers, id, issue)
  }

  return { byTransaction, blockers: [...blockers.values()] }
}

export function deriveWalletAuditStatus(closure, currentChangeVersion) {
  if (!closure) return 'open'
  const captured = Number(valueOf(closure, 'change_version', 'changeVersion') || 0)
  if (captured !== Number(currentChangeVersion || 0)) return 'needs_review'
  return valueOf(closure, 'status', 'status') || 'open'
}

export function canGreenClose(varianceSatang, blockerCount) {
  return varianceSatang === 0 && blockerCount === 0
}
