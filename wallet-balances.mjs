const DEFAULT_TIME_ZONE = 'Asia/Bangkok'

function datePartsInTimeZone(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)

  return Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]),
  )
}

export function monthToDateRange(value = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const { year, month, day } = datePartsInTimeZone(value, timeZone)
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${day}`,
    timeZone,
  }
}

export function attachMonthlyBalances(wallets, monthlyRows) {
  const monthlyByWallet = new Map(
    monthlyRows.map(row => [row.wallet_id, {
      monthlyBalance: Number(row.monthly_balance) || 0,
      monthlyIncome: Number(row.monthly_income) || 0,
      monthlyExpense: Number(row.monthly_expense) || 0,
    }]),
  )

  return wallets.map(wallet => ({
    ...wallet,
    ...(monthlyByWallet.get(wallet.id) || {
      monthlyBalance: 0,
      monthlyIncome: 0,
      monthlyExpense: 0,
    }),
  }))
}
