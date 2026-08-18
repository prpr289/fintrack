import test from 'node:test'
import assert from 'node:assert/strict'
import { attachMonthlyBalances, monthToDateRange } from './wallet-balances.mjs'

test('month-to-date range follows Bangkok month boundaries', () => {
  const beforeThaiMidnight = new Date('2026-08-31T16:59:59.000Z')
  const afterThaiMidnight = new Date('2026-08-31T17:00:00.000Z')

  assert.deepEqual(monthToDateRange(beforeThaiMidnight), {
    from: '2026-08-01',
    to: '2026-08-31',
    timeZone: 'Asia/Bangkok',
  })
  assert.deepEqual(monthToDateRange(afterThaiMidnight), {
    from: '2026-09-01',
    to: '2026-09-01',
    timeZone: 'Asia/Bangkok',
  })
})

test('monthly balances stay separate from cumulative wallet balances', () => {
  const wallets = [
    { id: 'cash', currentBalance: 12500 },
    { id: 'bank', currentBalance: 48000 },
  ]

  assert.deepEqual(
    attachMonthlyBalances(wallets, [
      { wallet_id: 'cash', monthly_balance: -750, monthly_income: 2000, monthly_expense: 2750 },
    ]),
    [
      {
        id: 'cash',
        currentBalance: 12500,
        monthlyBalance: -750,
        monthlyIncome: 2000,
        monthlyExpense: 2750,
      },
      {
        id: 'bank',
        currentBalance: 48000,
        monthlyBalance: 0,
        monthlyIncome: 0,
        monthlyExpense: 0,
      },
    ],
  )
})
