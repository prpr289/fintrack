import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeTransactionPageTransactions } from './transactionSummary.js'

test('transaction-page totals match dashboard totals by excluding internal transfers', () => {
  const transactions = [
    { id: 'income', type: 'income', amount: 1439750, transferPairId: null },
    { id: 'expense', type: 'expense', amount: 1255930.20, transferPairId: null },
    { id: 'transfer-out', type: 'expense', amount: 700000, transferPairId: 'transfer-700000' },
    { id: 'transfer-in', type: 'income', amount: 700000, transferPairId: 'transfer-700000' },
  ]

  const summary = summarizeTransactionPageTransactions(transactions)

  assert.deepEqual({ ...summary, net: Number(summary.net.toFixed(2)) }, {
    income: 1439750,
    expense: 1255930.20,
    net: 183819.80,
    incomeCount: 1,
    expenseCount: 1,
  })
})
