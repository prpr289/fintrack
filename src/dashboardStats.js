export function isInternalTransfer(transaction) {
  return Boolean(transaction?.transferPairId)
}

export function getOperatingTransactions(transactions = []) {
  return transactions.filter(transaction => !isInternalTransfer(transaction))
}

export function summarizeDashboardTransactions(transactions = []) {
  const operatingTransactions = getOperatingTransactions(transactions)
  const income = operatingTransactions
    .filter(transaction => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const expense = operatingTransactions
    .filter(transaction => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0)

  return { income, expense, net: income - expense }
}
