import { buildWalletExportHtml, formatWalletExportDate } from './walletExportData'

function reportRangeLabel(range) {
  if (!range) return 'ทุกช่วงเวลา'
  return range.from === range.to
    ? formatWalletExportDate(range.from)
    : `${formatWalletExportDate(range.from)} ถึง ${formatWalletExportDate(range.to)}`
}

export function exportWalletTransactionsXls({ wallet, transactions, periodLabel, range, filename }) {
  const html = buildWalletExportHtml({
    wallet,
    transactions,
    periodLabel,
    rangeLabel: reportRangeLabel(range),
  })
  const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
