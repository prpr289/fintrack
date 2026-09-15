// รายงานเงินสดรับ-จ่าย ตามแบบแนบท้ายประกาศอธิบดีกรมสรรพากร เกี่ยวกับภาษีเงินได้ (ฉบับที่ 161)
//
// คอลัมน์ตามแบบ: วัน/เดือน/ปี | รายการ | รายรับ (บาท) | รายจ่าย(บาท): ซื้อสินค้า | ค่าใช้จ่ายอื่นๆ | หมายเหตุ
// แบบนี้ไม่มีช่อง "คงเหลือ" — อย่าเติมเข้าไปเอง
//
// ไฟล์นี้ต้องไม่มี DOM/React เพื่อให้ `node --test` รันได้ตรง ๆ
import { sqlTime } from './fmt.js'
import { isPostedWalletActivity } from './walletDetail.js'
import { formatWalletExportDate } from './walletExportData.js'

// เพดานรายรับที่ต้องจดทะเบียนภาษีมูลค่าเพิ่ม (ยื่น ภ.พ.01 ภายใน 30 วันนับแต่วันที่เกิน)
export const VAT_THRESHOLD = 1800000

// ปีภาษีของบุคคลธรรมดาคือปีปฏิทิน · ครึ่งปีแรกใช้ยื่น ภ.ง.ด.94
export const CASH_BOOK_HALVES = [
  { value: 'full', label: 'ทั้งปี', form: 'ภ.ง.ด.90' },
  { value: 'h1', label: 'ครึ่งปีแรก', form: 'ภ.ง.ด.94' },
]

export function getCashBookRange(year, half = 'full') {
  const y = Number(year)
  if (!Number.isInteger(y)) return null
  return { from: `${y}-01-01`, to: half === 'h1' ? `${y}-06-30` : `${y}-12-31` }
}

export function beYear(gregorianYear) {
  return Number(gregorianYear) + 543
}

// ponytail: เดาจากชื่อหมวด เพราะตาราง categories ไม่มีช่องบอกว่าเป็นต้นทุนสินค้า
// ถ้าเดาพลาดบ่อย ค่อยเพิ่มคอลัมน์ที่ categories แล้วเลิกใช้ตัวนี้
const GOODS_NAME_PATTERN = /วัตถุดิบ|สินค้า|ของสด|ของแห้ง|ซื้อ|ต้นทุน/

export function guessGoodsCategoryIds(categories = []) {
  return categories
    .filter(category => category?.id && GOODS_NAME_PATTERN.test(String(category.name || '')))
    .map(category => category.id)
}

// รวมกระเป๋าที่ยังใช้งานอยู่ เข้ากับกระเป๋าที่ถูกปิดไปแล้วแต่ยังมีรายการในช่วงที่รายงาน
// ถ้าไม่รวม รายการของกระเป๋าที่ปิดไปจะหายจากรายงานโดยไม่มีอะไรเตือน
export function collectWalletOptions(wallets = [], transactions = []) {
  const options = new Map()
  wallets.forEach(wallet => {
    if (!wallet?.id) return
    options.set(wallet.id, {
      id: wallet.id,
      name: wallet.name || 'ไม่ระบุชื่อ',
      scope: wallet.scope || null,
      color: wallet.color || null,
      isActive: true,
    })
  })
  transactions.forEach(transaction => {
    const id = transaction?.walletId
    if (!id || options.has(id)) return
    options.set(id, {
      id,
      name: transaction.walletName || 'กระเป๋าที่ปิดใช้งานแล้ว',
      scope: null,
      color: transaction.walletColor || null,
      isActive: false,
    })
  })
  return [...options.values()]
}

export function defaultWalletIds(walletOptions = []) {
  return walletOptions.filter(wallet => wallet.isActive && wallet.scope === 'business').map(wallet => wallet.id)
}

// จำนวนเงินที่ใช้ได้จริง — ค่าที่ไม่เป็นจำนวนบวกถือว่าผิดปกติ ปัดเป็น 0 แล้วนับแยกไว้ให้เห็น
function usableAmount(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return { amount: 0, ok: false }
  return { amount: Math.round(amount * 100) / 100, ok: true }
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

// วันที่ตามเวลาไทย — createdAt จาก D1 เป็น UTC ไม่มี marker ต้องผ่าน sqlTime ก่อน
function bangkokYmd(sqlTimestamp) {
  const at = sqlTime(sqlTimestamp)
  if (!at) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at)
}

// ponytail: นับเฉพาะเสาร์-อาทิตย์เป็นวันหยุด ไม่รู้จักวันหยุดนักขัตฤกษ์
// ใช้เป็นคำเตือนเท่านั้น ไม่ได้เข้าไปในตัวเลขของรายงาน — ถ้าต้องแม่นกว่านี้ค่อยใส่ตารางวันหยุด
export function businessDaysBetween(fromYmd, toYmd) {
  if (!fromYmd || !toYmd || toYmd <= fromYmd) return 0
  const cursor = new Date(`${fromYmd}T12:00:00`)
  const end = new Date(`${toYmd}T12:00:00`)
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return 0
  let days = 0
  let guard = 0
  while (cursor < end && guard < 800) {
    cursor.setDate(cursor.getDate() + 1)
    const weekday = cursor.getDay()
    if (weekday !== 0 && weekday !== 6) days += 1
    guard += 1
  }
  return days
}

// ข้อ 3 ของประกาศฯ: ต้องลงรายการภายใน 3 วันทำการ นับแต่วันที่มีรายได้หรือรายจ่าย
export function isLateEntry(transaction) {
  const entryDate = bangkokYmd(transaction?.createdAt)
  if (!transaction?.date || !entryDate) return false
  return businessDaysBetween(transaction.date, entryDate) > 3
}

// เงินคืนจากคู่ค้าถูกบันทึกเป็นรายรับ (เป็นเงินสดรับจริง จึงอยู่ในรายงาน)
// แต่ไม่ใช่ยอดขาย จึงไม่นับในฐานคำนวณเพดาน VAT
export function isVendorRefund(transaction) {
  return transaction?.type === 'income' && transaction?.sourceChannel === 'pending_bill'
}

function buildNote(transaction, flags) {
  const parts = []
  const own = String(transaction?.note || '').trim()
  if (own) parts.push(own)
  if (flags.refund) parts.push('เงินคืนจากคู่ค้า ไม่ใช่ยอดขาย')
  if (flags.anomaly) parts.push('จำนวนเงินไม่ถูกต้อง ต้องตรวจสอบ')
  if (!flags.hasSlip) parts.push('ไม่มีหลักฐานแนบ')
  if (flags.lateEntry) parts.push('บันทึกช้ากว่า 3 วันทำการ')
  if (flags.pendingEdit) parts.push('รออนุมัติแก้ไข')
  return parts.join(' · ')
}

function monthKeyOf(date) {
  return String(date || '').slice(0, 7)
}

function monthLabelOf(monthKey) {
  const at = new Date(`${monthKey}-01T12:00:00`)
  if (Number.isNaN(at.getTime())) return monthKey
  return new Intl.DateTimeFormat('th-TH', { month: 'short', year: 'numeric' }).format(at)
}

export function isReportableTransaction(transaction) {
  return isPostedWalletActivity(transaction)
    && (transaction?.type === 'income' || transaction?.type === 'expense')
}

function compareRows(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  const aCreated = String(a.createdAt || '')
  const bCreated = String(b.createdAt || '')
  if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1
  return String(a.id).localeCompare(String(b.id))
}

/**
 * สร้างรายงานเงินสดรับ-จ่ายจากรายการทั้งช่วง
 * @param transactions รายการ "ทั้งหมด" ในช่วงที่รายงาน (ทุกกระเป๋า) — ตัวคำเตือนต้องใช้รายการนอกกระเป๋าที่เลือกด้วย
 * @param walletIds    id ของกระเป๋าที่ผู้ใช้ติ๊กให้เข้ารายงาน
 * @param goodsCategoryIds id ของหมวด/หมวดย่อยที่นับเป็น "ซื้อสินค้า"
 */
export function buildCashBook({ transactions = [], walletIds = [], goodsCategoryIds = [] } = {}) {
  const selected = new Set(walletIds)
  const goods = new Set(goodsCategoryIds)

  const rows = []
  const outsideWallets = new Map()
  let outsideCount = 0
  let outsideAmount = 0
  let noSlip = 0
  // หักค่าใช้จ่ายตามความจำเป็นและสมควร ต้องมีหลักฐานพิสูจน์ได้ — รายจ่ายที่ไม่มีหลักฐาน
  // คือส่วนที่เสี่ยงถูกตัดออก จำนวน "บาท" จึงสำคัญกว่าจำนวน "รายการ" (รายรับไม่เกี่ยว ไม่นับ)
  let unevidencedCount = 0
  let unevidencedAmount = 0
  const unevidencedByCategory = new Map()
  let lateEntry = 0
  let pendingEdit = 0
  let anomalies = 0
  let refundTotal = 0

  transactions.forEach(transaction => {
    if (!isReportableTransaction(transaction)) return

    if (!selected.has(transaction.walletId)) {
      // รายจ่าย/รายรับของกิจการที่จ่ายจากกระเป๋าที่ไม่ได้ติ๊ก จะหายจากรายงานเงียบ ๆ — ต้องนับไว้เตือน
      if (transaction.scope === 'business') {
        outsideCount += 1
        outsideAmount += usableAmount(transaction.amount).amount
        const name = transaction.walletName || 'ไม่ทราบกระเป๋า'
        outsideWallets.set(name, (outsideWallets.get(name) || 0) + 1)
      }
      return
    }

    const { amount, ok } = usableAmount(transaction.amount)
    const isIncome = transaction.type === 'income'
    const categoryName = transaction.subCategoryName || transaction.categoryName || 'ไม่ระบุหมวดหมู่'
    const isGoods = !isIncome && (goods.has(transaction.categoryId) || goods.has(transaction.subCategoryId))
    const refund = isVendorRefund(transaction)
    const flags = {
      refund,
      anomaly: !ok,
      hasSlip: Number(transaction.slipCount || 0) > 0,
      lateEntry: isLateEntry(transaction),
      pendingEdit: Boolean(transaction.pendingChanges),
    }

    if (!ok) anomalies += 1
    if (!flags.hasSlip) {
      noSlip += 1
      if (!isIncome) {
        unevidencedCount += 1
        unevidencedAmount += amount
        const bucket = unevidencedByCategory.get(categoryName) || { name: categoryName, count: 0, amount: 0 }
        bucket.count += 1
        bucket.amount += amount
        unevidencedByCategory.set(categoryName, bucket)
      }
    }
    if (flags.lateEntry) lateEntry += 1
    if (flags.pendingEdit) pendingEdit += 1
    if (refund) refundTotal += amount

    rows.push({
      id: transaction.id,
      date: transaction.date,
      createdAt: transaction.createdAt,
      name: transaction.name || '-',
      income: isIncome ? amount : 0,
      goods: isGoods ? amount : 0,
      other: !isIncome && !isGoods ? amount : 0,
      note: buildNote(transaction, flags),
      walletId: transaction.walletId,
      walletName: transaction.walletName || '-',
      categoryName: transaction.subCategoryName || transaction.categoryName || 'ไม่ระบุหมวดหมู่',
      slipCount: Number(transaction.slipCount || 0),
      lateEntry: flags.lateEntry,
      pendingEdit: flags.pendingEdit,
      anomaly: flags.anomaly,
      refund,
    })
  })

  rows.sort(compareRows)

  const monthMap = new Map()
  const totals = { income: 0, goods: 0, other: 0 }
  rows.forEach(row => {
    const key = monthKeyOf(row.date)
    const month = monthMap.get(key) || { key, label: monthLabelOf(key), rows: [], income: 0, goods: 0, other: 0 }
    month.rows.push(row)
    month.income += row.income
    month.goods += row.goods
    month.other += row.other
    monthMap.set(key, month)
    totals.income += row.income
    totals.goods += row.goods
    totals.other += row.other
  })

  const months = [...monthMap.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(month => ({
      ...month,
      income: round2(month.income),
      goods: round2(month.goods),
      other: round2(month.other),
    }))

  const income = round2(totals.income)
  const goodsTotal = round2(totals.goods)
  const otherTotal = round2(totals.other)
  const expense = round2(goodsTotal + otherTotal)
  const vatBase = round2(income - refundTotal)

  return {
    rows,
    months,
    totals: {
      income,
      goods: goodsTotal,
      other: otherTotal,
      expense,
      profit: round2(income - expense),
      count: rows.length,
    },
    vat: {
      base: vatBase,
      excludedRefunds: round2(refundTotal),
      threshold: VAT_THRESHOLD,
      pct: Math.round((vatBase / VAT_THRESHOLD) * 1000) / 10,
      over: vatBase > VAT_THRESHOLD,
    },
    warnings: {
      outside: {
        count: outsideCount,
        amount: round2(outsideAmount),
        wallets: [...outsideWallets.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => ({ name, count })),
      },
      noSlip,
      // รายจ่ายที่ยันไม่ได้ = ส่วนที่เสี่ยงถูกตัดออกตอนหักตามความจำเป็นและสมควร
      unevidencedExpense: {
        count: unevidencedCount,
        amount: round2(unevidencedAmount),
        pct: expense > 0 ? Math.round((unevidencedAmount / expense) * 1000) / 10 : 0,
        provable: round2(expense - unevidencedAmount),
        // เรียงจากหมวดที่ยอดยันไม่ได้มากสุด — ใช้ตัดสินว่าจะไล่เก็บหลักฐานหมวดไหนก่อนถึงคุ้มแรง
        byCategory: [...unevidencedByCategory.values()]
          .map(bucket => ({
            name: bucket.name,
            count: bucket.count,
            amount: round2(bucket.amount),
            pct: unevidencedAmount > 0 ? Math.round((bucket.amount / unevidencedAmount) * 1000) / 10 : 0,
          }))
          .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'th')),
      },
      lateEntry,
      pendingEdit,
      anomalies,
    },
  }
}

// ── เนื้อหาของเอกสาร ──────────────────────────────────────────────────────────
// อยู่ในไฟล์นี้ (ไม่ใช่ใน cashBookExport.js) เพราะ cashBookExport ต้อง import ฟอนต์
// ผ่าน `?url` ของ Vite ซึ่ง `node --test` โหลดไม่ได้ — เนื้อหาที่ส่งให้สรรพากร
// ต้องทดสอบได้ จึงแยกส่วนที่เขียนไฟล์ (jsPDF/Blob) ออกจากส่วนที่ประกอบข้อความ

// ช่องว่างในแบบราชการแปลว่า "ไม่มีจำนวนเงินในช่องนี้" — อย่าพิมพ์ 0.00 ให้รก
export function cashBookMoney(value, { blankWhenZero = true } = {}) {
  const amount = Number(value) || 0
  if (amount === 0 && blankWhenZero) return ''
  return amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function cashBookHeaderLines({ header, periodLabel, generatedAt = new Date() }) {
  const generated = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(generatedAt)
  return [
    ['ชื่อผู้ประกอบกิจการ', header?.operatorName || '', 'เลขประจำตัวผู้เสียภาษีอากร', header?.taxId || ''],
    ['ชื่อสถานประกอบการ', header?.shopName || '', 'รหัสสาขา', header?.taxBranch || ''],
    ['ที่ตั้งสถานประกอบการ', header?.address || '', 'ช่วงที่รายงาน', periodLabel || ''],
    ['', '', 'ออกรายงานเมื่อ', generated],
  ]
}

// รายการรายวัน + แถว "รวม" ท้ายทุกเดือน ตามตัวอย่างแนบท้ายแบบ
export function buildCashBookTableRows(report) {
  const rows = []
  report.months.forEach(month => {
    month.rows.forEach(row => {
      rows.push({
        kind: 'entry',
        cells: [
          formatWalletExportDate(row.date),
          row.name,
          cashBookMoney(row.income),
          cashBookMoney(row.goods),
          cashBookMoney(row.other),
          row.note,
        ],
      })
    })
    rows.push({
      kind: 'subtotal',
      cells: [
        `รวม ${month.label}`, '',
        cashBookMoney(month.income, { blankWhenZero: false }),
        cashBookMoney(month.goods, { blankWhenZero: false }),
        cashBookMoney(month.other, { blankWhenZero: false }),
        '',
      ],
    })
  })
  return rows
}

const CSV_HEADERS = [
  'วัน/เดือน/ปี', 'รายการ', 'รายรับ', 'ซื้อสินค้า', 'ค่าใช้จ่ายอื่นๆ', 'หมายเหตุ',
  'วันที่ (ค.ศ.)', 'กระเป๋า', 'หมวดหมู่', 'จำนวนหลักฐาน', 'รหัสรายการ',
]

export function buildCashBookCsv(report) {
  const lines = [CSV_HEADERS]
  report.rows.forEach(row => {
    lines.push([
      formatWalletExportDate(row.date), row.name,
      row.income || '', row.goods || '', row.other || '', row.note,
      row.date, row.walletName, row.categoryName, row.slipCount, row.id,
    ])
  })
  lines.push(['รวมทั้งสิ้น', '', report.totals.income, report.totals.goods, report.totals.other, '', '', '', '', '', ''])
  lines.push(['กำไรจากการขาย', '', report.totals.profit, '', '', '', '', '', '', '', ''])
  return lines
    .map(line => line.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildCashBookHtml({ report, header, periodLabel, generatedAt = new Date() }) {
  const total = value => escapeHtml(cashBookMoney(value, { blankWhenZero: false }))
  const metaRows = cashBookHeaderLines({ header, periodLabel, generatedAt })
    .map(line => `<tr>
      <td class="label">${escapeHtml(line[0])}</td><td>${escapeHtml(line[1])}</td>
      <td class="label">${escapeHtml(line[2])}</td><td>${escapeHtml(line[3])}</td>
    </tr>`).join('')

  const rows = buildCashBookTableRows(report)
  const bodyRows = rows.length > 0
    ? rows.map(row => `<tr class="${row.kind}">
        <td>${escapeHtml(row.cells[0])}</td>
        <td>${escapeHtml(row.cells[1])}</td>
        <td class="n">${escapeHtml(row.cells[2])}</td>
        <td class="n">${escapeHtml(row.cells[3])}</td>
        <td class="n">${escapeHtml(row.cells[4])}</td>
        <td>${escapeHtml(row.cells[5])}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:20px">ไม่มีรายการในช่วงที่รายงาน</td></tr>'

  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><style>
  body { font-family: Sarabun, Tahoma, sans-serif; color: #0f172a; margin: 18px; }
  h1 { font-size: 18px; text-align: center; margin: 0 0 12px; }
  table.meta { border-collapse: collapse; margin-bottom: 12px; font-size: 12px; }
  table.meta td { padding: 2px 8px 2px 0; }
  table.meta .label { color: #475569; }
  table.book { border-collapse: collapse; width: 100%; font-size: 12px; }
  table.book th, table.book td { border: 1px solid #94a3b8; padding: 4px 7px; vertical-align: top; }
  table.book thead th { background: #f1f5f9; text-align: center; }
  table.book td.n { text-align: right; white-space: nowrap; }
  table.book tr.subtotal td { background: #f8fafc; font-weight: 700; }
  table.book tfoot td { background: #f1f5f9; font-weight: 700; }
  table.summary { margin-top: 14px; font-size: 12px; border-collapse: collapse; }
  table.summary td { padding: 2px 8px 2px 0; }
  table.summary td.n { text-align: right; }
  table.summary tr.profit td { font-weight: 700; border-top: 1px solid #94a3b8; }
</style></head><body>
  <h1>รายงานเงินสดรับ – จ่าย</h1>
  <table class="meta">${metaRows}</table>
  <table class="book">
    <thead>
      <tr>
        <th rowspan="2">วัน/เดือน/ปี</th><th rowspan="2">รายการ</th><th rowspan="2">รายรับ (บาท)</th>
        <th colspan="2">รายจ่าย (บาท)</th><th rowspan="2">หมายเหตุ</th>
      </tr>
      <tr><th>ซื้อสินค้า</th><th>ค่าใช้จ่ายอื่นๆ</th></tr>
    </thead>
    <tbody>${bodyRows}</tbody>
    <tfoot><tr>
      <td colspan="2">รวมทั้งสิ้น</td>
      <td class="n">${total(report.totals.income)}</td>
      <td class="n">${total(report.totals.goods)}</td>
      <td class="n">${total(report.totals.other)}</td>
      <td>${escapeHtml(report.totals.count.toLocaleString('th-TH'))} รายการ</td>
    </tr></tfoot>
  </table>
  <table class="summary">
    <tr><td>สรุป — รายรับ</td><td class="n">${total(report.totals.income)}</td></tr>
    <tr><td>รายจ่าย — ซื้อสินค้า</td><td class="n">${total(report.totals.goods)}</td></tr>
    <tr><td>รายจ่าย — ค่าใช้จ่ายอื่นๆ</td><td class="n">${total(report.totals.other)}</td></tr>
    <tr><td>รวมรายจ่าย</td><td class="n">${total(report.totals.expense)}</td></tr>
    <tr class="profit"><td>กำไรจากการขาย</td><td class="n">${total(report.totals.profit)}</td></tr>
  </table>
</body></html>`
}

export function getCashBookFilename(year, half, extension) {
  const suffix = half === 'h1' ? 'h1' : 'full'
  const safeExtension = String(extension || 'pdf').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'pdf'
  return `cash-book-${beYear(year)}-${suffix}.${safeExtension}`
}
