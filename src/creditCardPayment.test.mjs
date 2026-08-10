import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCreditOutstanding,
  getPaymentImpact,
  formatPaymentAmount,
  parsePaymentAmount,
  validateCreditCardPayment,
} from './creditCardPayment.js'

test('payment amount accepts a formatted currency input', () => {
  assert.equal(parsePaymentAmount('50,000.00'), 50000)
  assert.equal(formatPaymentAmount('50000'), '50,000.00')
})

test('credit outstanding is the unpaid portion of a negative card balance', () => {
  assert.equal(getCreditOutstanding(-62750), 62750)
  assert.equal(getCreditOutstanding(1200), 0)
  assert.equal(getCreditOutstanding(undefined), 0)
})

test('payment impact subtracts from source and pays down the card', () => {
  assert.deepEqual(getPaymentImpact({ sourceBalance: 287200, creditBalance: -62750, amount: 50000 }), {
    sourceBefore: 287200,
    sourceAfter: 237200,
    creditBefore: -62750,
    creditAfter: -12750,
    outstandingAfter: 12750,
  })
})

test('valid payment passes validation', () => {
  assert.equal(validateCreditCardPayment({
    sourceWalletId: 'bank',
    creditWalletId: 'card',
    sourceBalance: 100000,
    creditBalance: -25000,
    amount: 12000,
    date: '2026-08-10',
  }), '')
})

test('payment cannot exceed the source balance or card outstanding', () => {
  const base = {
    sourceWalletId: 'bank',
    creditWalletId: 'card',
    sourceBalance: 10000,
    creditBalance: -25000,
    date: '2026-08-10',
  }

  assert.equal(
    validateCreditCardPayment({ ...base, amount: 12000 }),
    'ยอดคงเหลือในกระเป๋าต้นทางไม่เพียงพอ',
  )
  assert.equal(
    validateCreditCardPayment({ ...base, sourceBalance: 50000, amount: 30000 }),
    'จำนวนเงินสูงกว่ายอดค้างชำระของบัตร',
  )
})

test('paid-off cards cannot receive another payment', () => {
  assert.equal(validateCreditCardPayment({
    sourceWalletId: 'bank',
    creditWalletId: 'card',
    sourceBalance: 50000,
    creditBalance: 0,
    amount: 1000,
    date: '2026-08-10',
  }), 'บัตรเครดิตใบนี้ไม่มียอดค้างชำระ')
})
