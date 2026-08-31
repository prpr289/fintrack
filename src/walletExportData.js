import {
  isPostedWalletActivity,
  summarizeWalletTransactions,
  walletTransactionCategory,
  walletTransactionRecipient,
} from './walletDetail.js'

const moneyFormatter = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function getWalletExportTransactions(transactions = []) {
  return transactions.filter(transaction => (
    isPostedWalletActivity(transaction)
    && (transaction?.type === 'income' || transaction?.type === 'expense')
  ))
}

export function summarizeWalletExport(transactions = []) {
  return summarizeWalletTransactions(getWalletExportTransactions(transactions))
}

export function walletExportCategory(transaction) {
  return walletTransactionCategory(transaction)
}

export function walletExportRecipient(transaction) {
  return walletTransactionRecipient(transaction)
}

export function walletExportRecorder(transaction) {
  return transaction?.createdByName || transaction?.submittedBy || '-'
}

export function formatWalletExportMoney(value, signed = false) {
  const amount = Number(value || 0)
  const prefix = amount < 0 ? '-' : signed ? '+' : ''
  return `${prefix}฿${moneyFormatter.format(Math.abs(amount))}`
}

export function formatWalletExportDate(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${value}T12:00:00`))
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildWalletExportHtml({
  wallet,
  transactions = [],
  periodLabel,
  rangeLabel,
  generatedAt = new Date(),
}) {
  const exportTransactions = getWalletExportTransactions(transactions)
  const totals = summarizeWalletExport(exportTransactions)
  const generatedLabel = new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(generatedAt)
  const rows = exportTransactions.map(transaction => {
    const signedAmount = transaction.type === 'expense'
      ? -Number(transaction.amount || 0)
      : Number(transaction.amount || 0)
    return `<tr>
      <td>${escapeHtml(formatWalletExportDate(transaction.date))}</td>
      <td>${escapeHtml(transaction.name || '-')}</td>
      <td>${escapeHtml(walletExportCategory(transaction))}</td>
      <td>${escapeHtml(walletExportRecipient(transaction))}</td>
      <td>${escapeHtml(walletExportRecorder(transaction))}</td>
      <td>${transaction.type === 'income' ? 'รายรับ' : 'รายจ่าย'}</td>
      <td class="amount ${transaction.type}">${escapeHtml(formatWalletExportMoney(signedAmount, true))}</td>
    </tr>`
  }).join('') || '<tr><td colspan="7" style="padding: 24px; text-align: center; color: #64748b;">ไม่มีรายการธุรกรรมในช่วงนี้</td></tr>'

  return `<!doctype html>
  <html lang="th">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Sarabun, Tahoma, sans-serif; color: #172033; margin: 20px; }
        h1 { margin: 0; color: #0f766e; font-size: 24px; }
        .meta { margin: 6px 0 18px; color: #64748b; font-size: 12px; }
        .cards { width: 100%; border-collapse: separate; border-spacing: 8px; margin: 0 -8px 16px; }
        .cards td { border: 1px solid #dbe4ee; background: #f8fafc; padding: 10px 12px; }
        .cards small { color: #64748b; display: block; margin-bottom: 3px; }
        .cards strong { font-size: 16px; }
        table.ledger { width: 100%; border-collapse: collapse; font-size: 11px; }
        .ledger th { background: #0f766e; color: white; padding: 8px; text-align: left; }
        .ledger td { border: 1px solid #dbe4ee; padding: 7px 8px; vertical-align: top; }
        .ledger tbody tr:nth-child(even) { background: #f8fafc; }
        .amount { text-align: right; white-space: nowrap; font-weight: 600; }
        .income { color: #047857; }
        .expense { color: #dc2626; }
        .summary td { background: #ecfdf5; border-top: 2px solid #0f766e; font-weight: 700; }
        .summary .expense-total { color: #dc2626; }
        .summary .income-total { color: #047857; }
        .summary .net-total { color: ${totals.net >= 0 ? '#047857' : '#dc2626'}; }
      </style>
    </head>
    <body>
      <h1>รายงานกระเป๋า ${escapeHtml(wallet?.name || '-')}</h1>
      <div class="meta">${escapeHtml(periodLabel)}${rangeLabel ? ` · ${escapeHtml(rangeLabel)}` : ''} · สร้างเมื่อ ${escapeHtml(generatedLabel)}</div>
      <table class="cards"><tr>
        <td><small>รายรับรวม</small><strong class="income">${escapeHtml(formatWalletExportMoney(totals.income, true))}</strong></td>
        <td><small>ค่าใช้จ่ายรวม</small><strong class="expense">${escapeHtml(formatWalletExportMoney(-totals.expense, true))}</strong></td>
        <td><small>สุทธิรายรับ–รายจ่ายของช่วง</small><strong class="net-total">${escapeHtml(formatWalletExportMoney(totals.net, true))}</strong></td>
        <td><small>ยอดคงเหลือปัจจุบัน ณ วันที่ออกรายงาน</small><strong>${escapeHtml(formatWalletExportMoney(wallet?.currentBalance || 0))}</strong></td>
      </tr></table>
      <table class="ledger">
        <thead><tr><th>วันที่</th><th>รายการ</th><th>หมวดหมู่</th><th>ผู้รับ/ร้านค้า</th><th>ผู้บันทึก</th><th>ประเภท</th><th>จำนวนเงิน</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="summary">
          <td colspan="2">สรุปสิ้นงวด (${exportTransactions.length.toLocaleString('th-TH')} รายการ)</td>
          <td class="income-total">รายรับรวม<br>${escapeHtml(formatWalletExportMoney(totals.income, true))}</td>
          <td class="expense-total">ค่าใช้จ่ายรวม<br>${escapeHtml(formatWalletExportMoney(-totals.expense, true))}</td>
          <td class="net-total">สุทธิรายรับ–รายจ่ายของช่วง<br>${escapeHtml(formatWalletExportMoney(totals.net, true))}</td>
          <td colspan="2">ยอดคงเหลือปัจจุบัน ณ วันที่ออกรายงาน<br>${escapeHtml(formatWalletExportMoney(wallet?.currentBalance || 0))}</td>
        </tr></tfoot>
      </table>
    </body>
  </html>`
}
