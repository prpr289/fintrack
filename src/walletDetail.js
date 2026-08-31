import { ymd } from './fmt.js'

export const WALLET_DETAIL_PAGE_SIZE = 5
const WALLET_DETAIL_PAGE_SIZE_STEPS = [5, 10, 25, 50, 100, 200]

export function getWalletPageSizeOptions(total = 0, currentPageSize = WALLET_DETAIL_PAGE_SIZE) {
  const normalizedTotal = Math.max(0, Number(total) || 0)
  const normalizedCurrent = Math.max(1, Number(currentPageSize) || WALLET_DETAIL_PAGE_SIZE)
  const options = WALLET_DETAIL_PAGE_SIZE_STEPS.filter(option => option <= normalizedTotal)
  options.push(normalizedCurrent)
  if (normalizedTotal > 0) options.push(normalizedTotal)
  return [...new Set(options)].sort((a, b) => a - b)
}

export function getWalletPeriodRange(period = 'thisMonth', now = new Date()) {
  if (period === 'all') return null

  const year = now.getFullYear()
  const month = now.getMonth()
  const offset = period === 'lastMonth' ? -1 : 0
  const from = new Date(year, month + offset, 1)
  const to = new Date(year, month + offset + 1, 0)

  return { from: ymd(from), to: ymd(to) }
}

export function isPostedWalletActivity(transaction) {
  return !transaction?.transferPairId && !transaction?.isDraft
}

export function summarizeWalletTransactions(transactions = []) {
  return transactions.reduce((summary, transaction) => {
    if (!isPostedWalletActivity(transaction)) return summary

    const amount = Number(transaction.amount || 0)
    if (transaction.type === 'income') summary.income += amount
    if (transaction.type === 'expense') summary.expense += amount
    summary.net = summary.income - summary.expense
    return summary
  }, { income: 0, expense: 0, net: 0 })
}

export function summarizeWalletTransactionsByDate(transactions = []) {
  return transactions.reduce((summaries, transaction) => {
    if (!isPostedWalletActivity(transaction) || !transaction?.date) return summaries

    const day = summaries[transaction.date] || { income: 0, expense: 0, net: 0 }
    const amount = Number(transaction.amount || 0)
    if (transaction.type === 'income') day.income += amount
    if (transaction.type === 'expense') day.expense += amount
    day.net = day.income - day.expense
    summaries[transaction.date] = day
    return summaries
  }, {})
}

export function walletTransactionCategory(transaction) {
  return transaction?.subCategoryName || transaction?.categoryName || 'ไม่ระบุหมวดหมู่'
}

export function walletTransactionRecipient(transaction) {
  if (!transaction) return '-'
  if (transaction.name?.startsWith('โอนให้ ')) return transaction.name.slice('โอนให้ '.length)
  return transaction.submittedBy || transaction.name || '-'
}

export function filterWalletTransactions(transactions = [], filters = {}) {
  const search = String(filters.search || '').trim().toLocaleLowerCase('th-TH')
  const categoryId = filters.categoryId || ''
  const date = filters.date || ''
  const expenseOnly = filters.expenseOnly !== false

  return transactions.filter(transaction => {
    if (!isPostedWalletActivity(transaction)) return false
    if (expenseOnly && transaction.type !== 'expense') return false
    if (date && transaction.date !== date) return false
    if (categoryId && transaction.categoryId !== categoryId && transaction.subCategoryId !== categoryId) return false
    if (!search) return true

    return [
      transaction.name,
      transaction.note,
      transaction.categoryName,
      transaction.subCategoryName,
      transaction.submittedBy,
      transaction.createdByName,
    ].some(value => String(value || '').toLocaleLowerCase('th-TH').includes(search))
  })
}

export function getWalletTransactionDates(transactions = [], filters = {}) {
  const dates = filterWalletTransactions(transactions, { ...filters, date: '' })
    .map(transaction => transaction.date)
    .filter(Boolean)

  return [...new Set(dates)].sort((a, b) => b.localeCompare(a))
}
