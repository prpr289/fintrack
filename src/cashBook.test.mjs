import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCashBook,
  businessDaysBetween,
  collectWalletOptions,
  defaultWalletIds,
  getCashBookFilename,
  getCashBookRange,
  guessGoodsCategoryIds,
  isLateEntry,
  buildCashBookCsv,
  buildCashBookHtml,
  buildCashBookTableRows,
} from './cashBook.js'

const SHOP = 'w_shop'
const PERSONAL = 'w_personal'
const GOODS_CATEGORY = 'c_raw'

// วันที่ที่ใช้ซ้ำ: 2026-01-05 คือวันจันทร์ · 2026-01-09 คือวันศุกร์
// id ต้องเรียงตามลำดับที่สร้าง เพราะ buildCashBook ใช้ id เป็นตัวตัดสินลำดับสุดท้าย
// (เลือก id แทน "ลำดับที่รับมา" เพื่อให้ไฟล์เดิมออกมาเหมือนเดิมเสมอ ไม่ว่า pagination จะคืนมาเรียงยังไง)
let seq = 0
function tx(overrides = {}) {
  seq += 1
  return {
    id: `t_${String(seq).padStart(4, '0')}`,
    date: '2026-01-05',
    createdAt: '2026-01-05 03:00:00',
    name: 'รายการ',
    type: 'expense',
    amount: 100,
    scope: 'business',
    walletId: SHOP,
    walletName: 'เงินสดหน้าร้าน',
    slipCount: 1,
    ...overrides,
  }
}

test('cash book keeps only posted income and expense from the selected wallets', () => {
  const report = buildCashBook({
    walletIds: [SHOP],
    transactions: [
      tx({ name: 'ขายสินค้า', type: 'income', amount: 1200 }),
      tx({ name: 'ซื้อของ', amount: 300 }),
      tx({ name: 'ฉบับร่าง', amount: 999, isDraft: true }),
      tx({ name: 'โอนเข้าบัญชี', amount: 500, transferPairId: 'pair-1' }),
      tx({ name: 'จ่ายจากกระเป๋าส่วนตัว', amount: 800, walletId: PERSONAL, walletName: 'ส่วนตัว' }),
    ],
  })

  assert.deepEqual(report.rows.map(row => row.name), ['ขายสินค้า', 'ซื้อของ'])
  assert.equal(report.totals.income, 1200)
  assert.equal(report.totals.expense, 300)
  assert.equal(report.totals.profit, 900)
})

test('business spending left in an unticked wallet is counted and named, never silently dropped', () => {
  const report = buildCashBook({
    walletIds: [SHOP],
    transactions: [
      tx({ name: 'ซื้อของ', amount: 300 }),
      tx({ name: 'ซื้อวัตถุดิบด้วยบัตรส่วนตัว', amount: 800, walletId: PERSONAL, walletName: 'บัตรเครดิตส่วนตัว' }),
      tx({ name: 'ค่าน้ำมันส่วนตัว', amount: 200, scope: 'personal', walletId: PERSONAL, walletName: 'บัตรเครดิตส่วนตัว' }),
    ],
  })

  assert.equal(report.warnings.outside.count, 1)
  assert.equal(report.warnings.outside.amount, 800)
  assert.deepEqual(report.warnings.outside.wallets, [{ name: 'บัตรเครดิตส่วนตัว', count: 1 }])
})

test('expenses split into the goods column only for the chosen categories', () => {
  const report = buildCashBook({
    walletIds: [SHOP],
    goodsCategoryIds: [GOODS_CATEGORY],
    transactions: [
      tx({ name: 'ซื้อผัก', amount: 1715, categoryId: GOODS_CATEGORY }),
      tx({ name: 'ซื้อเนื้อ', amount: 500, subCategoryId: GOODS_CATEGORY }),
      tx({ name: 'ค่าไฟ', amount: 1250, categoryId: 'c_utility' }),
      tx({ name: 'ขายสินค้า', type: 'income', amount: 9000, categoryId: GOODS_CATEGORY }),
    ],
  })

  assert.equal(report.totals.goods, 2215)
  assert.equal(report.totals.other, 1250)
  assert.equal(report.totals.income, 9000, 'รายรับต้องไม่ตกไปช่องซื้อสินค้า แม้หมวดจะตรงกัน')
  assert.equal(report.totals.profit, 9000 - 2215 - 1250)
})

test('rows are grouped into month subtotals in calendar order', () => {
  const report = buildCashBook({
    walletIds: [SHOP],
    transactions: [
      tx({ date: '2026-03-02', name: 'ขาย มี.ค.', type: 'income', amount: 500 }),
      tx({ date: '2026-01-31', name: 'ขาย ม.ค.', type: 'income', amount: 1000 }),
      tx({ date: '2026-01-05', name: 'ค่าเช่า ม.ค.', amount: 400 }),
    ],
  })

  assert.deepEqual(report.months.map(month => month.key), ['2026-01', '2026-03'])
  assert.deepEqual(report.months.map(month => month.income), [1000, 500])
  assert.deepEqual(report.months.map(month => month.other), [400, 0])
  assert.deepEqual(report.rows.map(row => row.date), ['2026-01-05', '2026-01-31', '2026-03-02'])
})

test('vendor refunds stay in the report but leave the VAT threshold base', () => {
  const report = buildCashBook({
    walletIds: [SHOP],
    transactions: [
      tx({ name: 'ขายสินค้า', type: 'income', amount: 1000 }),
      tx({ name: 'คืนเงิน: ซื้อของผิด', type: 'income', amount: 250, sourceChannel: 'pending_bill' }),
    ],
  })

  assert.equal(report.totals.income, 1250, 'เป็นเงินสดรับจริง ต้องอยู่ในรายงาน')
  assert.equal(report.vat.base, 1000)
  assert.equal(report.vat.excludedRefunds, 250)
  assert.match(report.rows[1].note, /ไม่ใช่ยอดขาย/)
})

test('a broken amount becomes zero and is flagged instead of poisoning the totals', () => {
  const report = buildCashBook({
    walletIds: [SHOP],
    transactions: [
      tx({ name: 'ค่าของ', amount: 100 }),
      tx({ name: 'ยอดพัง', amount: null }),
      tx({ name: 'ยอดติดลบ', amount: -50 }),
    ],
  })

  assert.equal(report.totals.expense, 100)
  assert.equal(report.warnings.anomalies, 2)
  assert.match(report.rows[1].note, /จำนวนเงินไม่ถูกต้อง/)
})

test('late entries follow business days, so a Friday expense keyed on Wednesday is late', () => {
  // ศุกร์ 2026-01-09 → พุธ 2026-01-14 = จ.,อ.,พ. = 3 วันทำการ (ยังทัน)
  assert.equal(businessDaysBetween('2026-01-09', '2026-01-14'), 3)
  // ศุกร์ 2026-01-09 → พฤ. 2026-01-15 = 4 วันทำการ (ช้า)
  assert.equal(businessDaysBetween('2026-01-09', '2026-01-15'), 4)
  assert.equal(businessDaysBetween('2026-01-09', '2026-01-09'), 0)

  // createdAt เป็น UTC ไม่มี marker — 2026-01-14 20:00 UTC คือ 15 ม.ค. เวลาไทย จึงช้า
  assert.equal(isLateEntry({ date: '2026-01-09', createdAt: '2026-01-14 03:00:00' }), false)
  assert.equal(isLateEntry({ date: '2026-01-09', createdAt: '2026-01-14 20:00:00' }), true)
  assert.equal(isLateEntry({ date: '2026-01-09', createdAt: null }), false)

  const report = buildCashBook({
    walletIds: [SHOP],
    transactions: [tx({ date: '2026-01-09', createdAt: '2026-01-19 03:00:00', amount: 100 })],
  })
  assert.equal(report.warnings.lateEntry, 1)
})

test('missing evidence and pending edits are counted for the pre-export warning', () => {
  const report = buildCashBook({
    walletIds: [SHOP],
    transactions: [
      tx({ name: 'มีสลิป', amount: 100 }),
      tx({ name: 'ไม่มีสลิป', amount: 100, slipCount: 0 }),
      tx({ name: 'รออนุมัติ', amount: 100, pendingChanges: { amount: 200 } }),
    ],
  })

  assert.equal(report.warnings.noSlip, 1)
  assert.equal(report.warnings.pendingEdit, 1)
  assert.match(report.rows[1].note, /ไม่มีหลักฐานแนบ/)
})

test('wallets closed mid-year still appear as options so their rows can be included', () => {
  const options = collectWalletOptions(
    [{ id: SHOP, name: 'เงินสดหน้าร้าน', scope: 'business' }, { id: PERSONAL, name: 'ส่วนตัว', scope: 'personal' }],
    [tx({ walletId: 'w_closed', walletName: 'บัญชีเก่า' })],
  )

  assert.deepEqual(options.map(option => option.id), [SHOP, PERSONAL, 'w_closed'])
  assert.equal(options[2].isActive, false)
  assert.deepEqual(defaultWalletIds(options), [SHOP], 'กระเป๋าที่ปิดแล้วต้องไม่ถูกติ๊กให้อัตโนมัติ')
})

test('period, filename, and goods guessing follow the Thai tax year', () => {
  assert.deepEqual(getCashBookRange(2026, 'full'), { from: '2026-01-01', to: '2026-12-31' })
  assert.deepEqual(getCashBookRange(2026, 'h1'), { from: '2026-01-01', to: '2026-06-30' })
  assert.equal(getCashBookRange('ไม่ใช่ปี'), null)
  assert.equal(getCashBookFilename(2026, 'h1', 'pdf'), 'cash-book-2569-h1.pdf')

  assert.deepEqual(
    guessGoodsCategoryIds([
      { id: 'c_raw', name: 'วัตถุดิบ' },
      { id: 'c_goods', name: 'ซื้อสินค้า' },
      { id: 'c_power', name: 'ค่าไฟฟ้า' },
    ]),
    ['c_raw', 'c_goods'],
  )
})

test('an empty period still produces a complete zero report', () => {
  const report = buildCashBook({ walletIds: [SHOP], transactions: [] })

  assert.deepEqual(report.rows, [])
  assert.deepEqual(report.months, [])
  assert.deepEqual(report.totals, { income: 0, goods: 0, other: 0, expense: 0, profit: 0, count: 0 })
  assert.equal(report.vat.base, 0)
  assert.equal(report.vat.over, false)
  assert.equal(report.warnings.outside.count, 0)
})

// ── เนื้อหาของเอกสารที่ส่งให้บัญชี/สรรพากร ────────────────────────────────────

function sampleReport() {
  return buildCashBook({
    walletIds: [SHOP],
    goodsCategoryIds: [GOODS_CATEGORY],
    transactions: [
      tx({ date: '2026-01-02', name: 'ขายสินค้า', type: 'income', amount: 12000 }),
      tx({ date: '2026-01-10', name: 'ซื้อสินค้า', amount: 21000, categoryId: GOODS_CATEGORY }),
      tx({ date: '2026-01-11', name: 'ค่าน้ำ ค่าไฟ', amount: 1250, categoryId: 'c_utility' }),
      tx({ date: '2026-02-03', name: 'ขาย <b>เพิ่ม</b>', type: 'income', amount: 500 }),
    ],
  })
}

test('table rows leave empty money cells blank but always print month subtotals', () => {
  const rows = buildCashBookTableRows(sampleReport())

  assert.deepEqual(rows.map(row => row.kind), ['entry', 'entry', 'entry', 'subtotal', 'entry', 'subtotal'])
  assert.deepEqual(rows[0].cells.slice(2, 5), ['12,000.00', '', ''], 'ช่องที่ไม่มียอดต้องว่าง ไม่ใช่ 0.00')
  assert.deepEqual(rows[3].cells.slice(0, 5), ['รวม ม.ค. 2569', '', '12,000.00', '21,000.00', '1,250.00'])
  assert.deepEqual(rows[5].cells.slice(2, 5), ['500.00', '0.00', '0.00'], 'แถวรวมต้องพิมพ์ 0.00 ให้เห็นว่าเดือนนั้นไม่มียอด')
})

test('the Excel document carries the 161 column layout and escapes user text', () => {
  const html = buildCashBookHtml({
    report: sampleReport(),
    header: { operatorName: 'ธนินท์รัฐ', shopName: 'Famous Star Food', taxId: '1234567890123' },
    periodLabel: 'ปีภาษี 2569',
    generatedAt: new Date('2026-09-15T03:00:00Z'),
  })

  assert.match(html, /<th colspan="2">รายจ่าย \(บาท\)<\/th>/)
  assert.match(html, /<th>ซื้อสินค้า<\/th><th>ค่าใช้จ่ายอื่นๆ<\/th>/)
  assert.doesNotMatch(html, /คงเหลือ/, 'แบบ 161 ไม่มีช่องคงเหลือ')
  assert.match(html, /ชื่อผู้ประกอบกิจการ/)
  assert.match(html, /1234567890123/)
  assert.match(html, /รวมทั้งสิ้น/)
  assert.match(html, /กำไรจากการขาย/)
  assert.match(html, /ขาย &lt;b&gt;เพิ่ม&lt;\/b&gt;/, 'ชื่อรายการต้องถูก escape ไม่ใช่ฝัง HTML ดิบ')
})

test('the CSV keeps the form columns first and closes with the tax totals', () => {
  const csv = buildCashBookCsv(sampleReport())
  const lines = csv.split('\r\n')

  assert.equal(
    lines[0],
    '"วัน/เดือน/ปี","รายการ","รายรับ","ซื้อสินค้า","ค่าใช้จ่ายอื่นๆ","หมายเหตุ","วันที่ (ค.ศ.)","กระเป๋า","หมวดหมู่","จำนวนหลักฐาน","รหัสรายการ"',
  )
  assert.equal(lines.length, 1 + 4 + 2)
  assert.match(lines[1], /^"2 ม\.ค\. 2569","ขายสินค้า","12000","","",/)
  assert.match(lines.at(-2), /^"รวมทั้งสิ้น","","12500","21000","1250"/)
  assert.match(lines.at(-1), /^"กำไรจากการขาย","","-9750"/)
})

test('unevidenced expense is measured in baht, and income without a slip is not counted', () => {
  const report = buildCashBook({
    walletIds: [SHOP],
    goodsCategoryIds: [GOODS_CATEGORY],
    transactions: [
      tx({ name: 'ซื้อผัก มีบิล', amount: 600, categoryId: GOODS_CATEGORY, categoryName: 'วัตถุดิบ' }),
      tx({ name: 'ซื้อเนื้อ ไม่มีบิล', amount: 300, categoryId: GOODS_CATEGORY, categoryName: 'วัตถุดิบ', slipCount: 0 }),
      tx({ name: 'ค่าแรง ไม่มีบิล', amount: 100, categoryName: 'ค่าแรง', slipCount: 0 }),
      tx({ name: 'ขายสินค้า ไม่มีบิล', type: 'income', amount: 5000, categoryName: 'ยอดขาย', slipCount: 0 }),
    ],
  })

  const unevidenced = report.warnings.unevidencedExpense
  assert.equal(report.totals.expense, 1000)
  assert.equal(unevidenced.count, 2)
  assert.equal(unevidenced.amount, 400)
  assert.equal(unevidenced.pct, 40)
  assert.equal(unevidenced.provable, 600)
  assert.equal(report.warnings.noSlip, 3, 'ตัวนับรวมยังนับรายรับที่ไม่มีสลิปด้วย')
  assert.deepEqual(unevidenced.byCategory, [
    { name: 'วัตถุดิบ', count: 1, amount: 300, pct: 75 },
    { name: 'ค่าแรง', count: 1, amount: 100, pct: 25 },
  ], 'เรียงจากยอดมากไปน้อย และไม่มีหมวดของรายรับปน')
})

test('unevidenced categories merge duplicate names and prefer the sub-category label', () => {
  const report = buildCashBook({
    walletIds: [SHOP],
    transactions: [
      tx({ name: 'ของสด 1', amount: 200, categoryName: 'วัตถุดิบ', subCategoryName: 'ของสด', slipCount: 0 }),
      tx({ name: 'ของสด 2', amount: 500, categoryName: 'วัตถุดิบ', subCategoryName: 'ของสด', slipCount: 0 }),
      tx({ name: 'ไม่ระบุหมวด', amount: 300, slipCount: 0 }),
    ],
  })

  assert.deepEqual(report.warnings.unevidencedExpense.byCategory, [
    { name: 'ของสด', count: 2, amount: 700, pct: 70 },
    { name: 'ไม่ระบุหมวดหมู่', count: 1, amount: 300, pct: 30 },
  ])
})

test('a report with no expenses reports zero unevidenced percent instead of NaN', () => {
  const report = buildCashBook({ walletIds: [SHOP], transactions: [] })
  assert.deepEqual(report.warnings.unevidencedExpense, {
    count: 0, amount: 0, pct: 0, provable: 0, byCategory: [],
  })
})
