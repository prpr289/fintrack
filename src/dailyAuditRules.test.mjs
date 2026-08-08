import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AUDIT_ISSUE,
  amountToSatang,
  buildAuditIssues,
  canGreenClose,
  deriveWalletAuditStatus,
  parseMoneyToSatang,
  parseObservedBalanceToSatang,
  satangToAmount,
  satangToDecimalString,
  subtractSatang,
} from './dailyAuditRules.js'

const tx = (overrides = {}) => ({
  id: 'tx-1', workspace_id: 'ws-1', wallet_id: 'w-1', category_id: 'cat-1',
  name: 'ซื้อวัตถุดิบ', amount: 10, type: 'expense', date: '2026-08-08',
  is_reconciled: 1, is_draft: 0, pending_changes: null, transfer_pair_id: null,
  ...overrides,
})

test('money conversion is exact to satang and rejects extra decimals', () => {
  assert.equal(parseMoneyToSatang('123.45'), 12345)
  assert.equal(parseMoneyToSatang('-0.01'), -1)
  assert.equal(amountToSatang(0.1 + 0.2), 30)
  assert.equal(satangToAmount(-12345), -123.45)
  assert.equal(satangToDecimalString(-12345), '-123.45')
  assert.throws(() => parseMoneyToSatang('1.001'), /invalid money/)
  assert.throws(() => parseMoneyToSatang('NaN'), /invalid money/)
})

test('numeric observed values are not an accepted wire format', () => {
  assert.equal(parseObservedBalanceToSatang('100.00'), 10000)
  assert.throws(() => parseObservedBalanceToSatang(100))
  assert.throws(() => parseObservedBalanceToSatang('0.005'))
  assert.equal(amountToSatang(0.005), 1)
  assert.equal(subtractSatang(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER - 2), 1)
  assert.throws(() => subtractSatang(Number.MAX_SAFE_INTEGER, -1), /out of range/)
  const largeBookSatang = Number.MAX_SAFE_INTEGER - 1
  assert.equal(satangToDecimalString(largeBookSatang), '90071992547409.90')
  assert.notEqual(amountToSatang(satangToAmount(largeBookSatang)), largeBookSatang)
  assert.equal(subtractSatang(largeBookSatang, largeBookSatang), 0)
})

test('draft, pending edit, missing category and unreconciled rows block close', () => {
  const rows = [
    tx({ id: 'draft', is_draft: 1 }),
    tx({ id: 'pending', pending_changes: '{}' }),
    tx({ id: 'missing', category_id: null }),
    tx({ id: 'unreconciled', is_reconciled: 0 }),
  ]
  const result = buildAuditIssues(rows)
  assert.ok(result.byTransaction.draft.some((x) => x.code === AUDIT_ISSUE.DRAFT))
  assert.ok(result.byTransaction.pending.some((x) => x.code === AUDIT_ISSUE.PENDING_EDIT))
  assert.ok(result.byTransaction.missing.some((x) => x.code === AUDIT_ISSUE.MISSING_CATEGORY))
  assert.ok(result.byTransaction.unreconciled.some((x) => x.code === AUDIT_ISSUE.UNRECONCILED))
})

test('a valid transfer pair is treated as one pair without category blockers', () => {
  const pair = [
    tx({ id: 'out', wallet_id: 'w-1', category_id: null, transfer_pair_id: 'pair-1', type: 'expense', amount: 250 }),
    tx({ id: 'in', wallet_id: 'w-2', category_id: null, transfer_pair_id: 'pair-1', type: 'income', amount: 250 }),
  ]
  const result = buildAuditIssues(pair)
  assert.deepEqual(result.blockers, [])
})

test('an unreconciled transfer pair produces one shared blocker', () => {
  const pair = [
    tx({ id: 'out', wallet_id: 'w-1', category_id: null, transfer_pair_id: 'pair-open', type: 'expense', is_reconciled: 0 }),
    tx({ id: 'in', wallet_id: 'w-2', category_id: null, transfer_pair_id: 'pair-open', type: 'income', is_reconciled: 0 }),
  ]
  const result = buildAuditIssues(pair)
  assert.equal(result.blockers.length, 1)
  assert.equal(result.blockers[0].issueKey, 'reconcile-transfer:pair-open')
})

test('a broken transfer pair blocks every surviving leg', () => {
  const result = buildAuditIssues([
    tx({ id: 'out', category_id: null, transfer_pair_id: 'pair-broken', type: 'expense' }),
  ])
  assert.equal(result.byTransaction.out[0].code, AUDIT_ISSUE.BROKEN_TRANSFER)
})

test('duplicate candidate is stable by membership and can be resolved', () => {
  const rows = [tx({ id: 'a' }), tx({ id: 'b' })]
  const first = buildAuditIssues(rows)
  const duplicate = first.blockers.find((x) => x.code === AUDIT_ISSUE.POSSIBLE_DUPLICATE)
  assert.match(duplicate.issueKey, /^duplicate:[a-f0-9]{32}$/)
  const changedMembership = buildAuditIssues([...rows, tx({ id: 'c' })]).blockers.find((x) => x.code === AUDIT_ISSUE.POSSIBLE_DUPLICATE)
  assert.notEqual(changedMembership.issueKey, duplicate.issueKey)
  const resolved = buildAuditIssues(rows, [duplicate.issueKey])
  assert.equal(resolved.blockers.some((x) => x.code === AUDIT_ISSUE.POSSIBLE_DUPLICATE), false)
})

test('closed wallet becomes needs_review when transaction version changes', () => {
  assert.equal(deriveWalletAuditStatus({ status: 'closed', change_version: 4 }, 4), 'closed')
  assert.equal(deriveWalletAuditStatus({ status: 'closed', change_version: 4 }, 5), 'needs_review')
  assert.equal(deriveWalletAuditStatus(null, 0), 'open')
  assert.equal(canGreenClose(0, 0), true)
  assert.equal(canGreenClose(1, 0), false)
  assert.equal(canGreenClose(0, 1), false)
})
