import { ymd } from './fmt.js'

export const WALLET_DETAIL_PAGE_SIZE = 5

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
  const expenseOnly = filters.expenseOnly !== false

  return transactions.filter(transaction => {
    if (!isPostedWalletActivity(transaction)) return false
    if (expenseOnly && transaction.type !== 'expense') return false
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
