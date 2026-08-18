import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filterWalletTransactions,
  getWalletPeriodRange,
  summarizeWalletTransactions,
  walletTransactionRecipient,
} from './walletDetail.js'

test('wallet detail month ranges use local calendar boundaries', () => {
  const now = new Date(2026, 7, 10, 12)
  assert.deepEqual(getWalletPeriodRange('thisMonth', now), { from: '2026-08-01', to: '2026-08-31' })
  assert.deepEqual(getWalletPeriodRange('lastMonth', now), { from: '2026-07-01', to: '2026-07-31' })
  assert.equal(getWalletPeriodRange('all', now), null)
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
