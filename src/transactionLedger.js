export const TRANSACTION_SOURCE_CHANNELS = [
  'web',
  'line',
  'csv_import',
  'bulk_slip',
  'pending_bill',
  'recurring',
  'hros',
  'internal_transfer',
  'legacy_manual',
]

export const TRANSACTION_SOURCE_LABELS = {
  web: 'เว็บ',
  line: 'LINE',
  csv_import: 'นำเข้า CSV',
  bulk_slip: 'อัปโหลดสลิป',
  pending_bill: 'บิลรอจ่าย',
  recurring: 'รายการประจำ',
  hros: 'HR OS',
  internal_transfer: 'โอนภายใน',
  legacy_manual: 'ข้อมูลเดิม',
}

export function sourceChannelOf(transaction) {
  if (TRANSACTION_SOURCE_CHANNELS.includes(transaction?.sourceChannel)) {
    return transaction.sourceChannel
  }
  if (transaction?.transferPairId) return 'internal_transfer'
  if (transaction?.source === 'auto') return 'hros'
  if (transaction?.recurringId) return 'recurring'
  if (String(transaction?.submittedBy || '').trim()) return 'line'
  return 'legacy_manual'
}

export function sourceChannelLabel(transactionOrChannel) {
  const channel = typeof transactionOrChannel === 'string'
    ? transactionOrChannel
    : sourceChannelOf(transactionOrChannel)
  return TRANSACTION_SOURCE_LABELS[channel] || 'ไม่ระบุช่องทาง'
}

export function transactionActors(transaction) {
  return {
    submitter: String(transaction?.submittedBy || '').trim() || null,
    recorder: String(transaction?.createdByName || '').trim() || null,
    recorderId: transaction?.createdByUserId || null,
  }
}

export function transactionStatus(transaction) {
  if (transaction?.isDraft) return { key: 'draft', label: 'ฉบับร่าง', tone: 'warning' }
  if (transaction?.pendingChanges) return { key: 'pending_edit', label: 'รออนุมัติแก้ไข', tone: 'info' }
  if (transaction?.isReconciled) return { key: 'reconciled', label: 'ตรวจแล้ว', tone: 'success' }
  return { key: 'unreconciled', label: 'รอตรวจ', tone: 'neutral' }
}

export function buildTransactionQuery({
  from,
  to,
  search,
  type,
  scope,
  walletId,
  categoryId,
  createdByUserId,
  sourceChannel,
  status,
  hasSlip,
  limit,
  offset,
} = {}) {
  const params = {}
  const values = {
    from,
    to,
    search: String(search || '').trim(),
    type,
    scope,
    walletId,
    categoryId,
    createdByUserId,
    sourceChannel,
    status,
    hasSlip,
    limit,
    offset,
  }
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'all') {
      params[key] = value
    }
  })
  return params
}
