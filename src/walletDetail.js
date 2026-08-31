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
  const explicitRecipient = transaction.recipientName
    || transaction.vendorName
    || transaction.merchantName
    || transaction.payeeName
    || transaction.counterpartyName
  if (String(explicitRecipient || '').trim()) return String(explicitRecipient).trim()
  if (transaction.name?.startsWith('โอนให้ ')) return transaction.name.slice('โอนให้ '.length)
  return transaction.name || '-'
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

export function getWalletSelectableDates(period = 'thisMonth', transactionDates = [], now = new Date()) {
  const range = getWalletPeriodRange(period, now)
  if (!range) return [...new Set(transactionDates.filter(Boolean))].sort((a, b) => b.localeCompare(a))

  const dates = []
  const first = new Date(`${range.from}T12:00:00`)
  const cursor = new Date(`${range.to}T12:00:00`)
  while (cursor >= first) {
    dates.push(ymd(cursor))
    cursor.setDate(cursor.getDate() - 1)
  }
  return dates
}

export function getWalletExportFilename(walletName = 'wallet', period = 'thisMonth', extension = 'xls', now = new Date()) {
  const safeWalletName = String(walletName || 'wallet')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
  const range = getWalletPeriodRange(period, now)
  const periodName = range ? range.from.slice(0, 7) : 'all'
  const safeExtension = String(extension || 'xls').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'xls'
  return `wallet-${safeWalletName || 'wallet'}-${periodName}.${safeExtension}`
}
