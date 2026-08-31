import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import sarabunRegularUrl from './assets/fonts/Sarabun-Regular.ttf?url'
import sarabunSemiBoldUrl from './assets/fonts/Sarabun-SemiBold.ttf?url'
import {
  formatWalletExportDate,
  formatWalletExportMoney,
  getWalletExportTransactions,
  summarizeWalletExport,
  walletExportCategory,
  walletExportRecorder,
  walletExportRecipient,
} from './walletExportData'

let fontDataPromise

async function assetAsBase64(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('โหลดฟอนต์สำหรับ PDF ไม่สำเร็จ')
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function loadFontData() {
  if (!fontDataPromise) {
    fontDataPromise = Promise.all([
      assetAsBase64(sarabunRegularUrl),
      assetAsBase64(sarabunSemiBoldUrl),
    ]).catch(error => {
      fontDataPromise = undefined
      throw error
    })
  }
  return fontDataPromise
}

function addSarabunFonts(doc, regular, semiBold) {
  doc.addFileToVFS('Sarabun-Regular.ttf', regular)
  doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal')
  doc.addFileToVFS('Sarabun-SemiBold.ttf', semiBold)
  doc.addFont('Sarabun-SemiBold.ttf', 'Sarabun', 'bold')
  doc.setFont('Sarabun', 'normal')
}

function reportRangeLabel(range) {
  if (!range) return 'ทุกช่วงเวลา'
  return range.from === range.to
    ? formatWalletExportDate(range.from)
    : `${formatWalletExportDate(range.from)} ถึง ${formatWalletExportDate(range.to)}`
}

function fitText(doc, value, maxWidth) {
  const text = String(value || '')
  if (doc.getTextWidth(text) <= maxWidth) return text
  let fitted = text
  while (fitted && doc.getTextWidth(`${fitted}…`) > maxWidth) fitted = fitted.slice(0, -1)
  return `${fitted}…`
}

function drawHeader(doc, { wallet, periodLabel, range, totals }) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const generatedLabel = new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date())
  doc.setFillColor(7, 74, 69)
  doc.roundedRect(12, 10, pageWidth - 24, 27, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('Sarabun', 'bold')
  doc.setFontSize(18)
  doc.text(fitText(doc, `รายงานกระเป๋า ${wallet?.name || '-'}`, 172), 18, 21)
  doc.setFont('Sarabun', 'normal')
  doc.setFontSize(9)
  doc.text(`${periodLabel} · ${reportRangeLabel(range)}`, 18, 29)
  doc.setFontSize(8)
  doc.text(`ออกรายงาน ${generatedLabel}`, pageWidth - 18, 29, { align: 'right' })

  const cards = [
    { label: 'รายรับรวม', value: formatWalletExportMoney(totals.income, true), fill: [236, 253, 245], color: [4, 120, 87] },
    { label: 'ค่าใช้จ่ายรวม', value: formatWalletExportMoney(-totals.expense, true), fill: [254, 242, 242], color: [220, 38, 38] },
    { label: 'สุทธิรายรับ–รายจ่ายของช่วง', value: formatWalletExportMoney(totals.net, true), fill: [239, 246, 255], color: totals.net >= 0 ? [4, 120, 87] : [220, 38, 38] },
    { label: 'ยอดคงเหลือปัจจุบัน ณ วันที่ออกรายงาน', value: formatWalletExportMoney(wallet?.currentBalance || 0), fill: [248, 250, 252], color: Number(wallet?.currentBalance || 0) >= 0 ? [15, 23, 42] : [220, 38, 38] },
  ]
  const gap = 4
  const cardWidth = (pageWidth - 24 - gap * 3) / 4
  cards.forEach((card, index) => {
    const x = 12 + index * (cardWidth + gap)
    doc.setFillColor(...card.fill)
    doc.roundedRect(x, 42, cardWidth, 22, 2, 2, 'F')
    doc.setTextColor(100, 116, 139)
    doc.setFont('Sarabun', 'normal')
    doc.setFontSize(7.2)
    const labelLines = doc.splitTextToSize(card.label, cardWidth - 8).slice(0, 2)
    doc.text(labelLines, x + 4, 48)
    doc.setTextColor(...card.color)
    doc.setFont('Sarabun', 'bold')
    doc.setFontSize(12)
    doc.text(fitText(doc, card.value, cardWidth - 8), x + 4, 59)
  })
}

function drawPageFooter(doc, pageNumber, totalPages) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setDrawColor(226, 232, 240)
  doc.line(12, pageHeight - 12, pageWidth - 12, pageHeight - 12)
  doc.setTextColor(100, 116, 139)
  doc.setFont('Sarabun', 'normal')
  doc.setFontSize(7.5)
  doc.text('FinTrack · รายงานกระเป๋าเงิน', 12, pageHeight - 7)
  doc.text(`หน้า ${pageNumber} / ${totalPages}`, pageWidth - 12, pageHeight - 7, { align: 'right' })
}

export async function exportWalletTransactionsPdf({ wallet, transactions, periodLabel, range, filename }) {
  const [regularFont, semiBoldFont] = await loadFontData()
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  addSarabunFonts(doc, regularFont, semiBoldFont)
  const exportTransactions = getWalletExportTransactions(transactions)
  const totals = summarizeWalletExport(exportTransactions)
  drawHeader(doc, { wallet, periodLabel, range, totals })

  const body = exportTransactions.map(transaction => {
    const signedAmount = transaction.type === 'expense'
      ? -Number(transaction.amount || 0)
      : Number(transaction.amount || 0)
    return [
      formatWalletExportDate(transaction.date),
      transaction.name || '-',
      walletExportCategory(transaction),
      walletExportRecipient(transaction),
      walletExportRecorder(transaction),
      transaction.type === 'income' ? 'รายรับ' : 'รายจ่าย',
      formatWalletExportMoney(signedAmount, true),
    ]
  })
  if (body.length === 0) {
    body.push([{ content: 'ไม่มีรายการธุรกรรมในช่วงนี้', colSpan: 7, styles: { halign: 'center', textColor: [100, 116, 139], minCellHeight: 18 } }])
  }

  autoTable(doc, {
    startY: 68,
    margin: { top: 24, right: 12, bottom: 17, left: 12 },
    head: [['วันที่', 'รายการ', 'หมวดหมู่', 'ผู้รับ/ร้านค้า', 'ผู้บันทึก', 'ประเภท', 'จำนวนเงิน']],
    body,
    foot: [[
      { content: `สรุปสิ้นงวด (${exportTransactions.length.toLocaleString('th-TH')} รายการ)`, colSpan: 2, styles: { fontStyle: 'bold' } },
      { content: `รายรับรวม\n${formatWalletExportMoney(totals.income, true)}`, styles: { textColor: [4, 120, 87], fontStyle: 'bold' } },
      { content: `ค่าใช้จ่ายรวม\n${formatWalletExportMoney(-totals.expense, true)}`, styles: { textColor: [220, 38, 38], fontStyle: 'bold' } },
      { content: `สุทธิรายรับ–รายจ่าย\n${formatWalletExportMoney(totals.net, true)}`, styles: { textColor: totals.net >= 0 ? [4, 120, 87] : [220, 38, 38], fontStyle: 'bold' } },
      { content: `ยอดคงเหลือปัจจุบัน\n${formatWalletExportMoney(wallet?.currentBalance || 0)}`, colSpan: 2, styles: { textColor: Number(wallet?.currentBalance || 0) >= 0 ? [15, 23, 42] : [220, 38, 38], fontStyle: 'bold' } },
    ]],
    showFoot: 'lastPage',
    styles: {
      font: 'Sarabun',
      fontSize: 8.2,
      cellPadding: 2.5,
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      minCellHeight: 9,
    },
    footStyles: {
      fillColor: [236, 253, 245],
      textColor: [15, 23, 42],
      minCellHeight: 17,
      valign: 'middle',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 52 },
      2: { cellWidth: 36 },
      3: { cellWidth: 47 },
      4: { cellWidth: 40 },
      5: { cellWidth: 24, halign: 'center' },
      6: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
    },
    willDrawCell(data) {
      if (data.section === 'body' && data.column.index === 6 && exportTransactions[data.row.index]) {
        const transaction = exportTransactions[data.row.index]
        doc.setTextColor(...(transaction?.type === 'income' ? [4, 120, 87] : [220, 38, 38]))
      }
    },
    willDrawPage(data) {
      if (data.pageNumber > 1) {
        doc.setTextColor(15, 118, 110)
        doc.setFont('Sarabun', 'bold')
        doc.setFontSize(11)
        doc.text(fitText(doc, `รายงานกระเป๋า ${wallet?.name || '-'}`, 180), 12, 14)
        doc.setTextColor(100, 116, 139)
        doc.setFont('Sarabun', 'normal')
        doc.setFontSize(8)
        doc.text(`${periodLabel} · ${reportRangeLabel(range)}`, 12, 19)
      }
    },
  })

  const totalPages = doc.getNumberOfPages()
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    doc.setPage(pageNumber)
    drawPageFooter(doc, pageNumber, totalPages)
  }

  doc.setProperties({
    title: `รายงานกระเป๋า ${wallet?.name || ''}`,
    subject: `${periodLabel} ${reportRangeLabel(range)}`,
    author: 'FinTrack',
    creator: 'FinTrack',
  })
  doc.save(filename)
}
