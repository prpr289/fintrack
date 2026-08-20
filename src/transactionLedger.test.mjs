import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTransactionQuery,
  sourceChannelLabel,
  sourceChannelOf,
  transactionActors,
  transactionStatus,
} from './transactionLedger.js'

test('keeps submitter and authenticated recorder as separate identities', () => {
  assert.deepEqual(transactionActors({
    submittedBy: 'พีรพีร์',
    createdByName: 'Fintrack Service',
    createdByUserId: 'u_service',
  }), {
    submitter: 'พีรพีร์',
    recorder: 'Fintrack Service',
    recorderId: 'u_service',
  })
})

test('does not invent a submitter or replace a missing recorder', () => {
  assert.deepEqual(transactionActors({ createdByUserId: 'u_deleted' }), {
    submitter: null,
    recorder: null,
    recorderId: 'u_deleted',
  })
})

test('derives conservative legacy source channels in priority order', () => {
  assert.equal(sourceChannelOf({ transferPairId: 'pair_1', source: 'auto', submittedBy: 'A' }), 'internal_transfer')
  assert.equal(sourceChannelOf({ source: 'auto', submittedBy: 'A' }), 'hros')
  assert.equal(sourceChannelOf({ recurringId: 'rec_1', submittedBy: 'A' }), 'recurring')
  assert.equal(sourceChannelOf({ submittedBy: 'A' }), 'line')
  assert.equal(sourceChannelOf({}), 'legacy_manual')
  assert.equal(sourceChannelLabel('line'), 'LINE')
})

test('reports the most actionable transaction status', () => {
  assert.equal(transactionStatus({ isDraft: true, isReconciled: true }).key, 'draft')
  assert.equal(transactionStatus({ pendingChanges: { amount: 100 }, isReconciled: true }).key, 'pending_edit')
  assert.equal(transactionStatus({ isReconciled: true }).key, 'reconciled')
  assert.equal(transactionStatus({}).key, 'unreconciled')
})

test('builds one compact query contract for list, summary and export', () => {
  assert.deepEqual(buildTransactionQuery({
    from: '2026-08-01',
    to: '2026-08-20',
    search: '  พีรพีร์  ',
    type: 'all',
    scope: '',
    walletId: 'w_1',
    sourceChannel: 'line',
    status: 'reconciled',
    hasSlip: 'true',
    limit: 50,
    offset: 0,
  }), {
    from: '2026-08-01',
    to: '2026-08-20',
    search: 'พีรพีร์',
    walletId: 'w_1',
    sourceChannel: 'line',
    status: 'reconciled',
    hasSlip: 'true',
    limit: 50,
    offset: 0,
  })
})
