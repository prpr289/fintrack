const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100

export function parsePaymentAmount(value) {
  if (value === '' || value === null || value === undefined) return Number.NaN
  return Number(String(value).replaceAll(',', '').trim())
}

export function formatPaymentAmount(value) {
  const numeric = parsePaymentAmount(value)
  if (!Number.isFinite(numeric)) return ''
  return numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function getCreditOutstanding(balance) {
  const numeric = Number(balance)
  if (!Number.isFinite(numeric)) return 0
  return roundMoney(Math.max(0, -numeric))
}

export function getPaymentImpact({ sourceBalance, creditBalance, amount }) {
  if (amount === '' || amount === null || amount === undefined) return null
  const payment = parsePaymentAmount(amount)
  const source = Number(sourceBalance)
  const credit = Number(creditBalance)

  if (![payment, source, credit].every(Number.isFinite)) return null

  return {
    sourceBefore: roundMoney(source),
    sourceAfter: roundMoney(source - payment),
    creditBefore: roundMoney(credit),
    creditAfter: roundMoney(credit + payment),
    outstandingAfter: getCreditOutstanding(credit + payment),
  }
}

export function validateCreditCardPayment({
  sourceWalletId,
  creditWalletId,
  sourceBalance,
  creditBalance,
  amount,
  date,
}) {
  if (!sourceWalletId) return 'กรุณาเลือกกระเป๋าต้นทาง'
  if (!creditWalletId) return 'ไม่พบบัตรเครดิตที่ต้องการจ่าย'
  if (sourceWalletId === creditWalletId) return 'กระเป๋าต้นทางและบัตรเครดิตต้องเป็นคนละกระเป๋า'

  const payment = parsePaymentAmount(amount)
  if (!Number.isFinite(payment) || payment <= 0) return 'กรุณาระบุจำนวนเงินที่มากกว่า 0'

  const outstanding = getCreditOutstanding(creditBalance)
  if (outstanding <= 0) return 'บัตรเครดิตใบนี้ไม่มียอดค้างชำระ'
  if (payment > outstanding) return 'จำนวนเงินสูงกว่ายอดค้างชำระของบัตร'

  const available = Number(sourceBalance)
  if (!Number.isFinite(available) || payment > available) return 'ยอดคงเหลือในกระเป๋าต้นทางไม่เพียงพอ'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return 'กรุณาเลือกวันที่จ่ายเงิน'

  return ''
}
