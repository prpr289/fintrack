import { getOperatingTransactions, summarizeDashboardTransactions } from './dashboardStats.js'

export function summarizeTransactionPageTransactions(transactions = []) {
  const operatingTransactions = getOperatingTransactions(transactions)
  const incomeTransactions = operatingTransactions.filter(transaction => transaction.type === 'income')
  const expenseTransactions = operatingTransactions.filter(transaction => transaction.type === 'expense')
  const { income, expense, net } = summarizeDashboardTransactions(operatingTransactions)

  return {
    income,
    expense,
    net,
    incomeCount: incomeTransactions.length,
    expenseCount: expenseTransactions.length,
  }
}
