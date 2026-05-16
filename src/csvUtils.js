// ── Export ────────────────────────────────────────────────────────────────────

export function exportTransactionsCsv(transactions, filename = 'transactions.csv') {
  const headers = ['date', 'name', 'amount', 'type', 'scope', 'category', 'sub_category', 'wallet', 'reconciled', 'note']
  const rows = transactions.map(t => [
    t.date || '',
    t.name || '',
    t.amount ?? '',
    t.type || '',
    t.scope || '',
    t.categoryName || '',
    t.subCategoryName || '',
    t.walletName || '',
    t.isReconciled ? 'yes' : 'no',
    (t.note || '').replace(/"/g, '""'),
  ])

  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${v}"`).join(','))
    .join('\r\n')

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportTransactionsXls(transactions, filename = 'transactions.xls') {
  const rows = [
    ['วันที่', 'ชื่อรายการ', 'หมวดหมู่', 'หมวดย่อย', 'กระเป๋า', 'ประเภท', 'Scope', 'จำนวน (บาท)', 'ยืนยันแล้ว', 'หมายเหตุ'],
    ...transactions.map(t => [
      t.date || '',
      t.name || '',
      t.categoryName || '',
      t.subCategoryName || '',
      t.walletName || '',
      t.type === 'income' ? 'รายรับ' : 'รายจ่าย',
      t.scope === 'business' ? 'ธุรกิจ' : 'ส่วนตัว',
      t.type === 'expense' ? -t.amount : t.amount,
      t.isReconciled ? 'ใช่' : 'ไม่',
      t.note || '',
    ]),
  ]
  const escape = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const tableHtml = '<html><head><meta charset="utf-8"/></head><body><table border="1">' +
    rows.map(row => '<tr>' + row.map(cell => `<td>${escape(cell)}</td>`).join('') + '</tr>').join('') +
    '</table></body></html>'
  const blob = new Blob(['﻿' + tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportTemplateCsv() {
  const headers = ['date', 'name', 'amount', 'type', 'scope', 'note']
  const example = [
    ['2026-05-10', 'ยอดขายวันนี้', '5000', 'income', 'business', 'หมายเหตุ'],
    ['2026-05-10', 'ค่าวัตถุดิบ', '1500', 'expense', 'business', ''],
  ]
  const csv = [headers, ...example]
    .map(row => row.map(v => `"${v}"`).join(','))
    .join('\r\n')

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Import ────────────────────────────────────────────────────────────────────

// Returns array of { date, name, amount, type, scope, note } or throws with row info
export function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) throw new Error('ไฟล์ต้องมีอย่างน้อย 1 แถวข้อมูล (+ header)')

  const header = parseCsvRow(lines[0]).map(h => h.toLowerCase().trim())
  const required = ['date', 'name', 'amount', 'type', 'scope']
  for (const r of required) {
    if (!header.includes(r)) throw new Error(`header ต้องมี column: ${r}`)
  }

  const rows = []
  const errors = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cells = parseCsvRow(line)
    const obj = {}
    header.forEach((h, idx) => { obj[h] = (cells[idx] || '').trim() })

    const rowErrors = []
    if (!obj.date || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date))
      rowErrors.push('date ต้องเป็นรูปแบบ YYYY-MM-DD')
    if (!obj.name)
      rowErrors.push('name ห้ามว่าง')
    const amt = Number(obj.amount)
    if (!obj.amount || isNaN(amt) || amt <= 0)
      rowErrors.push('amount ต้องเป็นตัวเลขมากกว่า 0')
    if (!['income', 'expense'].includes(obj.type))
      rowErrors.push('type ต้องเป็น income หรือ expense')
    if (!['business', 'personal'].includes(obj.scope))
      rowErrors.push('scope ต้องเป็น business หรือ personal')

    if (rowErrors.length > 0) {
      errors.push({ row: i + 1, errors: rowErrors })
    } else {
      rows.push({
        date: obj.date,
        name: obj.name,
        amount: amt,
        type: obj.type,
        scope: obj.scope,
        note: obj.note || undefined,
      })
    }
  }

  return { rows, errors }
}

function parseCsvRow(line) {
  const cells = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      cells.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells
}
