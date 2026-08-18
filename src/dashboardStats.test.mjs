import test from 'node:test'
import assert from 'node:assert/strict'
import { getOperatingTransactions, isInternalTransfer, summarizeDashboardTransactions } from './dashboardStats.js'

test('credit-card payments do not count as operating income or expense', () => {
  const transactions = [
    { id: 'sales', type: 'income', amount: 813982, transferPairId: null },
    { id: 'costs', type: 'expense', amount: 746945.86, transferPairId: null },
    { id: 'pay-300-out', type: 'expense', amount: 300000, transferPairId: 'xfer-300' },
    { id: 'pay-300-in', type: 'income', amount: 300000, transferPairId: 'xfer-300' },
    { id: 'pay-200-out', type: 'expense', amount: 200000, transferPairId: 'xfer-200' },
    { id: 'pay-200-in', type: 'income', amount: 200000, transferPairId: 'xfer-200' },
    { id: 'pay-100-out', type: 'expense', amount: 100000, transferPairId: 'xfer-100' },
    { id: 'pay-100-in', type: 'income', amount: 100000, transferPairId: 'xfer-100' },
  ]

  const stats = summarizeDashboardTransactions(transactions)

  assert.equal(isInternalTransfer(transactions[2]), true)
  assert.equal(isInternalTransfer(transactions[0]), false)
  assert.deepEqual(getOperatingTransactions(transactions).map(transaction => transaction.id), ['sales', 'costs'])
  assert.equal(stats.income, 813982)
  assert.equal(stats.expense, 746945.86)
  assert.equal(Number(stats.net.toFixed(2)), 67036.14)
})
