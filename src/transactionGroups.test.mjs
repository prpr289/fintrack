import test from 'node:test'
import assert from 'node:assert/strict'
import { groupTransactionsByDate } from './transactionGroups.js'

test('groups transactions by date and calculates income, expense, and balance', () => {
  const transactions = [
    { id: 1, date: '2026-07-28', type: 'expense', amount: 1850 },
    { id: 2, date: '2026-07-28', type: 'income', amount: 6420 },
    { id: 3, date: '2026-07-28', type: 'expense', amount: '1160' },
    { id: 4, date: '2026-07-28', type: 'income', amount: '6310' },
    { id: 5, date: '2026-07-27', type: 'income', amount: 1500 },
  ]

  const groups = groupTransactionsByDate(transactions)

  assert.deepEqual(
    groups.map(({ key, income, expense, net, items }) => ({
      key,
      income,
      expense,
      net,
      itemIds: items.map(item => item.id),
    })),
    [
      { key: '2026-07-28', income: 12730, expense: 3010, net: 9720, itemIds: [1, 2, 3, 4] },
      { key: '2026-07-27', income: 1500, expense: 0, net: 1500, itemIds: [5] },
    ],
  )
})
