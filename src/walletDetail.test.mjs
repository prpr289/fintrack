import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filterWalletTransactions,
  getWalletPageSizeOptions,
  getWalletPeriodRange,
  summarizeWalletTransactions,
  summarizeWalletTransactionsByDate,
  walletTransactionRecipient,
} from './walletDetail.js'

test('wallet detail month ranges use local calendar boundaries', () => {
  const now = new Date(2026, 7, 10, 12)
  assert.deepEqual(getWalletPeriodRange('thisMonth', now), { from: '2026-08-01', to: '2026-08-31' })
  assert.deepEqual(getWalletPeriodRange('lastMonth', now), { from: '2026-07-01', to: '2026-07-31' })
  assert.equal(getWalletPeriodRange('all', now), null)
})

test('wallet page-size options always include every filtered transaction in the month', () => {
  assert.deepEqual(getWalletPageSizeOptions(268, 50), [5, 10, 25, 50, 100, 200, 268])
  assert.deepEqual(getWalletPageSizeOptions(50, 50), [5, 10, 25, 50])
  assert.deepEqual(getWalletPageSizeOptions(3, 50), [3, 50])
})

test('wallet summaries exclude drafts and every internal transfer', () => {
  const transactions = [
    { type: 'income', amount: 12000 },
    { type: 'expense', amount: 4200 },
    { type: 'expense', amount: 50000, transferPairId: 'credit-card-payment' },
    { type: 'income', amount: 3000, transferPairId: 'wallet-transfer' },
    { type: 'expense', amount: 700, isDraft: true },
  ]

  assert.deepEqual(summarizeWalletTransactions(transactions), {
    income: 12000,
    expense: 4200,
    net: 7800,
  })
})

test('wallet daily summaries include all posted income and expense for each date', () => {
  const transactions = [
    { date: '2026-08-25', type: 'income', amount: 12500 },
    { date: '2026-08-25', type: 'expense', amount: 850 },
    { date: '2026-08-25', type: 'expense', amount: 400, isDraft: true },
    { date: '2026-08-25', type: 'expense', amount: 3000, transferPairId: 'pair-1' },
    { date: '2026-08-24', type: 'expense', amount: 1200 },
  ]

  assert.deepEqual(summarizeWalletTransactionsByDate(transactions), {
    '2026-08-25': { income: 12500, expense: 850, net: 11650 },
    '2026-08-24': { income: 0, expense: 1200, net: -1200 },
  })
})

test('expense list filters by category and Thai search while excluding transfers', () => {
  const transactions = [
    { id: '1', type: 'expense', name: 'โอนให้ นาง ติหวา หีมละ', categoryId: 'payroll', categoryName: 'เงินเดือนและค่าแรง' },
    { id: '2', type: 'expense', name: 'ซื้อวัตถุดิบ', categoryId: 'stock', categoryName: 'วัตถุดิบ' },
    { id: '3', type: 'expense', name: 'ชำระบัตรเครดิต', categoryId: 'other', transferPairId: 'pair-1' },
    { id: '4', type: 'income', name: 'รับเงินสด', categoryId: 'sales' },
  ]

  assert.deepEqual(
    filterWalletTransactions(transactions, { categoryId: 'payroll', search: 'ติหวา' }).map(row => row.id),
    ['1'],
  )
  assert.deepEqual(
    filterWalletTransactions(transactions, { expenseOnly: false }).map(row => row.id),
    ['1', '2', '4'],
  )
  assert.equal(walletTransactionRecipient(transactions[0]), 'นาง ติหวา หีมละ')
})
