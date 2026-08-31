import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWalletExportHtml, formatWalletExportMoney, summarizeWalletExport } from './walletExportData.js'

const transactions = [
  { date: '2026-08-31', name: 'ยอดขาย', type: 'income', amount: 11080, categoryName: 'ยอดขาย' },
  { date: '2026-08-31', name: 'ซื้อยา', type: 'expense', amount: 350, categoryName: 'ยารักษาโรค' },
  { date: '2026-08-31', name: 'ซื้อผัก', type: 'expense', amount: 1715, categoryName: 'วัตถุดิบ' },
]

test('wallet export totals include income, expense, and net balance', () => {
  assert.deepEqual(summarizeWalletExport(transactions), {
    income: 11080,
    expense: 2065,
    net: 9015,
  })
})

test('wallet export excludes drafts and internal transfers from rows and totals', () => {
  const mixedTransactions = [
    ...transactions,
    { date: '2026-08-31', name: 'ฉบับร่าง', type: 'expense', amount: 999, isDraft: true },
    { date: '2026-08-31', name: 'โอนภายใน', type: 'income', amount: 5000, transferPairId: 'pair-1' },
  ]

  assert.deepEqual(summarizeWalletExport(mixedTransactions), {
    income: 11080,
    expense: 2065,
    net: 9015,
  })
})

test('wallet export money always preserves a negative balance', () => {
  assert.equal(formatWalletExportMoney(-12500), '-฿12,500.00')
  assert.equal(formatWalletExportMoney(-12500, true), '-฿12,500.00')
})

test('wallet export still produces a complete zero-activity monthly report', () => {
  const html = buildWalletExportHtml({
    wallet: { name: 'กระเป๋าทดสอบ', currentBalance: 2500 },
    transactions: [],
    periodLabel: 'เดือนนี้',
    rangeLabel: '1 ส.ค. 2569 ถึง 31 ส.ค. 2569',
    generatedAt: new Date(2026, 7, 31, 12),
  })

  assert.match(html, /ไม่มีรายการธุรกรรมในช่วงนี้/)
  assert.match(html, /สรุปสิ้นงวด \(0 รายการ\)/)
  assert.match(html, /\+฿0\.00/)
  assert.match(html, /฿2,500\.00/)
})

test('wallet Excel export includes a polished summary row after every transaction', () => {
  const html = buildWalletExportHtml({
    wallet: { name: 'ร้านพี่อี๊ดตำถาด', currentBalance: -12500 },
    transactions,
    periodLabel: 'เดือนนี้',
    rangeLabel: '1 ส.ค. 2569 ถึง 31 ส.ค. 2569',
    generatedAt: new Date(2026, 7, 31, 12),
  })

  assert.equal((html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr>/g) || []).length, 3)
  assert.match(html, /ผู้บันทึก/)
  assert.match(html, /สรุปสิ้นงวด \(3 รายการ\)/)
  assert.match(html, /รายรับรวม/)
  assert.match(html, /\+฿11,080\.00/)
  assert.match(html, /ค่าใช้จ่ายรวม/)
  assert.match(html, /-฿2,065\.00/)
  assert.match(html, /สุทธิรายรับ–รายจ่ายของช่วง/)
  assert.match(html, /\+฿9,015\.00/)
  assert.match(html, /ยอดคงเหลือปัจจุบัน ณ วันที่ออกรายงาน/)
  assert.match(html, /-฿12,500\.00/)
})
