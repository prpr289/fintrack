// ตัวเขียนไฟล์ของรายงานเงินสดรับ-จ่าย (แบบแนบท้ายประกาศฯ 161)
//
// ไฟล์นี้มีเฉพาะส่วนที่ต้องใช้เบราว์เซอร์ — jsPDF, Blob, การกดดาวน์โหลด
// เนื้อหาของเอกสาร (แถว/ยอดรวม/HTML/CSV) อยู่ใน cashBook.js เพื่อให้ `node --test` ตรวจได้
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { addSarabunFonts, loadFontData } from './walletExport'
import {
  buildCashBookCsv,
  buildCashBookHtml,
  buildCashBookTableRows,
  cashBookHeaderLines,
  cashBookMoney,
} from './cashBook'

const TABLE_HEAD = [
  [
    { content: 'วัน/เดือน/ปี', rowSpan: 2 },
    { content: 'รายการ', rowSpan: 2 },
    { content: 'รายรับ\n(บาท)', rowSpan: 2 },
    { content: 'รายจ่าย (บาท)', colSpan: 2 },
    { content: 'หมายเหตุ', rowSpan: 2 },
  ],
  ['ซื้อสินค้า', 'ค่าใช้จ่ายอื่นๆ'],
]

const total = value => cashBookMoney(value, { blankWhenZero: false })

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function exportCashBookPdf({ report, header, periodLabel, filename }) {
  const [regularFont, semiBoldFont] = await loadFontData()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  addSarabunFonts(doc, regularFont, semiBoldFont)

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  doc.setFont('Sarabun', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(15, 23, 42)
  doc.text('รายงานเงินสดรับ – จ่าย', pageWidth / 2, 16, { align: 'center' })

  doc.setFont('Sarabun', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(51, 65, 85)
  cashBookHeaderLines({ header, periodLabel }).forEach((line, index) => {
    const y = 23 + index * 5
    if (line[0]) doc.text(`${line[0]} : ${line[1] || '.'.repeat(40)}`, 10, y)
    if (line[2]) doc.text(`${line[2]} : ${line[3] || '.'.repeat(18)}`, pageWidth / 2 + 12, y)
  })

  const rows = buildCashBookTableRows(report)
  const body = rows.length > 0
    ? rows.map(row => row.cells)
    : [[{ content: 'ไม่มีรายการในช่วงที่รายงาน', colSpan: 6, styles: { halign: 'center', textColor: [100, 116, 139], minCellHeight: 16 } }]]

  autoTable(doc, {
    startY: 46,
    margin: { top: 16, right: 10, bottom: 16, left: 10 },
    head: TABLE_HEAD,
    body,
    foot: [[
      { content: 'รวมทั้งสิ้น', colSpan: 2, styles: { fontStyle: 'bold' } },
      { content: total(report.totals.income), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: total(report.totals.goods), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: total(report.totals.other), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: `${report.totals.count.toLocaleString('th-TH')} รายการ`, styles: { fontStyle: 'bold' } },
    ]],
    showFoot: 'lastPage',
    styles: {
      font: 'Sarabun', fontSize: 8, cellPadding: 1.8, textColor: [30, 41, 59],
      lineColor: [148, 163, 184], lineWidth: 0.2, overflow: 'linebreak', valign: 'middle',
    },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center', lineWidth: 0.3 },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], lineWidth: 0.3 },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 54 },
      2: { cellWidth: 24, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 38, fontSize: 7 },
    },
    didParseCell(data) {
      if (data.section !== 'body') return
      if (rows[data.row.index]?.kind !== 'subtotal') return
      data.cell.styles.fontStyle = 'bold'
      data.cell.styles.fillColor = [248, 250, 252]
    },
  })

  // บล็อกสรุปตามตัวอย่างแนบท้ายแบบ: รายรับ / รายจ่าย / กำไรจากการขาย
  let y = (doc.lastAutoTable?.finalY || 46) + 8
  if (y > pageHeight - 46) {
    doc.addPage()
    y = 20
  }
  doc.setFont('Sarabun', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(15, 23, 42)
  doc.text('สรุป', 12, y)
  doc.setFont('Sarabun', 'normal')
  doc.setFontSize(9)
  const summary = [
    ['รายรับ', total(report.totals.income)],
    ['รายจ่าย — ซื้อสินค้า', total(report.totals.goods)],
    ['รายจ่าย — ค่าใช้จ่ายอื่นๆ', total(report.totals.other)],
    ['รวมรายจ่าย', total(report.totals.expense)],
  ]
  summary.forEach((line, index) => {
    doc.text(line[0], 20, y + 6 + index * 5)
    doc.text(line[1], 110, y + 6 + index * 5, { align: 'right' })
  })
  const profitY = y + 8 + summary.length * 5
  doc.setFont('Sarabun', 'bold')
  doc.text('กำไรจากการขาย', 20, profitY)
  doc.text(total(report.totals.profit), 110, profitY, { align: 'right' })

  const totalPages = doc.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    doc.setFont('Sarabun', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text(
      'รายงานเงินสดรับ-จ่าย ตามแบบแนบท้ายประกาศอธิบดีกรมสรรพากร เกี่ยวกับภาษีเงินได้ (ฉบับที่ 161)',
      10, pageHeight - 8,
    )
    doc.text(`หน้า ${page} / ${totalPages}`, pageWidth - 10, pageHeight - 8, { align: 'right' })
  }

  doc.setProperties({
    title: `รายงานเงินสดรับ-จ่าย ${periodLabel || ''}`,
    author: header?.operatorName || 'FinTrack',
    creator: 'FinTrack',
  })
  doc.save(filename)
}

export function exportCashBookXls({ report, header, periodLabel, filename }) {
  const html = buildCashBookHtml({ report, header, periodLabel })
  downloadBlob(new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' }), filename)
}

export function exportCashBookCsv({ report, filename }) {
  downloadBlob(new Blob(['﻿' + buildCashBookCsv(report)], { type: 'text/csv;charset=utf-8;' }), filename)
}
