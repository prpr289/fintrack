import { useEffect, useState } from 'react'
import { api } from '../api'

const SHOP_NAME = 'ร้านตำมั้ย'
const SHOP_ADDRESS = 'เลขที่ 21/33/1 ถนนแหลมสนอ่อน ตำบลบ่อยาง อำเภอเมือง จังหวัดสงขลา 90000'

function thb(n) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function formatDateThai(dateStr) {
  if (!dateStr) return '-'
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
    return `${d} ${months[m - 1]} พ.ศ. ${y + 543}`
  } catch { return dateStr }
}

// Shared print/responsive styles — used by the single voucher page and the
// bulk print page. Inject once per page with <style>{voucherStyle}</style>.
export const voucherStyle = `
  * { box-sizing: border-box; }

  .voucher-doc {
    font-size: 0.875rem;
  }

  /* Bulk print: one voucher per page */
  .voucher-page { page-break-after: always; }
  .voucher-page:last-child { page-break-after: auto; }

  /* ── Mobile ── */
  @media (max-width: 600px) {
    .voucher-wrap { padding: 0.75rem 0.5rem !important; }
    .voucher-doc { padding: 1rem !important; font-size: 0.78rem !important; }
    .v-title { font-size: 1.25rem !important; }
    .v-meta { flex-direction: column !important; gap: 0.5rem !important; }
    .v-meta-right { text-align: left !important; }
    .v-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .v-table { min-width: 420px; font-size: 0.75rem !important; }
    .v-sigs { gap: 1.5rem !important; margin-top: 2rem !important; }
    .v-sig-line { height: 2rem !important; }
  }

  /* ── Print ── */
  @media print {
    .no-print { display: none !important; }
    body { background: white !important; margin: 0; padding: 0; }
    .voucher-wrap { padding: 0 !important; background: white !important; }
    .voucher-doc { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; }
    .v-table-wrap { overflow: visible !important; }
    .v-table { min-width: unset !important; }
    .v-slip img { max-height: 86mm !important; page-break-inside: avoid; }
  }
  @page { size: A4 portrait; margin: 15mm 20mm; }
`

// The voucher document itself (white card). Loads its own attached slips by
// transaction id, with the URL slip id (data.si) as an unauthenticated fallback.
// `data` shape: { id, n, amt, d, b, r, si, ty, mo }
export default function VoucherDoc({ data }) {
  const [attachments, setAttachments] = useState([])
  const [slipStatus, setSlipStatus] = useState('idle') // idle | loading | empty | unauthed | error
  const [slipErr, setSlipErr] = useState('')

  useEffect(() => {
    if (!data?.id) return
    const token = localStorage.getItem('ft_token')

    const loadOne = async (sid) => {
      try {
        const url = await api.fetchSlipBlob(sid)
        setAttachments([{ id: sid, slipType: 'transfer', blobUrl: url }])
        setSlipStatus('loaded')
        return true
      } catch { return false }
    }

    const run = async () => {
      setSlipStatus('loading')
      setSlipErr('')

      if (!token) {
        if (data.si && await loadOne(data.si)) return
        setSlipStatus('unauthed')
        return
      }

      let items
      try {
        const listed = await api.listSlips(data.id)
        items = listed?.slips || []
      } catch (e) {
        if (data.si && await loadOne(data.si)) return
        setSlipStatus('error')
        setSlipErr(e?.message || 'โหลดสลิปไม่สำเร็จ')
        return
      }

      if (!items.length) {
        if (data.si && await loadOne(data.si)) return
        setSlipStatus('empty')
        return
      }

      const loaded = await Promise.all(items.map(async s => {
        try {
          const url = await api.fetchSlipBlob(s.id)
          return { ...s, blobUrl: url }
        } catch { return { ...s, blobUrl: null } }
      }))
      const ok = loaded.filter(s => s.blobUrl)
      setAttachments(ok)
      setSlipStatus(ok.length ? 'loaded' : 'error')
    }

    run()
  }, [data?.id, data?.si])

  if (!data) return null

  const amount = parseFloat(data.amt) || 0
  const isIncome = data.ty === 'income'
  const docPrefix = isIncome ? 'RV' : 'PV'
  const voucherNo = `${docPrefix}-${(data.d || '').replace(/-/g, '')}-${(data.id || 'XXXX').slice(-4).toUpperCase()}`
  const docTitle = isIncome ? 'ใบรับเงิน' : 'ใบสำคัญจ่าย'
  const docSubtitle = isIncome ? 'Money Receipt' : 'Payment Voucher'
  const payToLabel = isIncome ? 'รับจาก / From' : 'จ่ายให้ / Pay to'
  const defaultDesc = isIncome ? 'รับชำระค่าสินค้า/บริการ' : 'ชำระค่าสินค้า/บริการ'

  return (
    <div className="voucher-doc" style={{ background: '#fff', borderRadius: '0.75rem', boxShadow: '0 4px 16px rgba(0,0,0,.1)', padding: '2rem 2.5rem', fontFamily: '"Sarabun", "Noto Sans Thai", sans-serif', color: '#111', lineHeight: 1.6 }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem', borderBottom: '2px solid #111', paddingBottom: '0.875rem' }}>
        <div className="v-title" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{docTitle}</div>
        <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>{docSubtitle}</div>
      </div>

      {/* Shop info + voucher meta */}
      <div className="v-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{SHOP_NAME}</div>
          <div style={{ color: '#6b7280', fontSize: '0.78rem', marginTop: '0.2rem', lineHeight: 1.5 }}>{SHOP_ADDRESS}</div>
        </div>
        <div className="v-meta-right" style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.85rem' }}>
          <div><span style={{ color: '#6b7280' }}>เลขที่: </span><strong>{voucherNo}</strong></div>
          <div><span style={{ color: '#6b7280' }}>วันที่: </span>{formatDateThai(data.d)}</div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #e5e7eb', marginBottom: '1rem' }} />

      {/* Table */}
      <div className="v-table-wrap">
        <table className="v-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '2rem' }} />
            <col />
            <col style={{ width: '7.5rem' }} />
            <col style={{ width: '7rem' }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={th({ textAlign: 'center' })}>#</th>
              <th style={th({ textAlign: 'left' })}>รายการ / Description</th>
              <th style={th({ textAlign: 'left' })}>{payToLabel}</th>
              <th style={th({ textAlign: 'right' })}>จำนวนเงิน (บาท)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td({ textAlign: 'center' })}>1</td>
              <td style={td()}>
                {data.mo || (data.r ? `อ้างอิง: ${data.r}` : defaultDesc)}
              </td>
              <td style={td()}>{data.n || '-'}</td>
              <td style={td({ textAlign: 'right', fontWeight: 600 })}>{thb(amount)}</td>
            </tr>
            <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
              <td style={td({ textAlign: 'right' })} colSpan={3}>รวมทั้งสิ้น / Total</td>
              <td style={td({ textAlign: 'right' })}>{thb(amount)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bank / ref */}
      {(data.b || data.r) && (
        <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
          {data.b && <span>ธนาคาร: {data.b}</span>}
          {data.r && <span>เลขอ้างอิง: {data.r}</span>}
        </div>
      )}

      {/* Signatures */}
      <div className="v-sigs" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem', marginTop: '3rem' }}>
        {[['ผู้รับเงิน', 'Received by'], ['ผู้อนุมัติ', 'Approved by']].map(([th2, en]) => (
          <div key={th2} style={{ textAlign: 'center' }}>
            <div className="v-sig-line" style={{ borderBottom: '1.5px solid #374151', marginBottom: '0.4rem', height: '2.5rem' }} />
            <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{th2} / {en}</div>
            <div style={{ color: '#9ca3af', fontSize: '0.72rem', marginTop: '0.3rem' }}>วันที่ ___ / ___ / ___</div>
          </div>
        ))}
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="v-slip" style={{ marginTop: '1.75rem', borderTop: '1.5px dashed #d1d5db', paddingTop: '1rem' }}>
          {attachments.map((s, i) => {
            const typeLabels = { transfer: 'สลิปโอนเงิน / Payment Slip', receipt: 'ใบเสร็จรับเงิน / Receipt', tax_invoice: 'ใบกำกับภาษี / Tax Invoice', other: 'เอกสารแนบ / Attachment' }
            const label = typeLabels[s.slipType] || typeLabels.other
            const ocr = s.ocrData
            return (
              <div key={s.id} style={{ marginBottom: i < attachments.length - 1 ? '1.25rem' : 0 }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, marginBottom: '0.5rem', textAlign: 'center', letterSpacing: '0.02em' }}>
                  {label}
                </div>
                {ocr?.vendor_name && (
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', textAlign: 'center', marginBottom: '0.4rem' }}>
                    {ocr.vendor_name}{ocr.tax_id ? ` · เลขภาษี ${ocr.tax_id}` : ''}
                    {ocr.doc_number ? ` · เลขที่ ${ocr.doc_number}` : ''}
                  </div>
                )}
                <img
                  src={s.blobUrl}
                  alt={label}
                  style={{ display: 'block', margin: '0 auto', maxWidth: '95%', maxHeight: '86mm', objectFit: 'contain', borderRadius: '0.375rem', border: '1px solid #e5e7eb', pageBreakInside: 'avoid' }}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Slip status (only when no attachments shown) */}
      {attachments.length === 0 && slipStatus !== 'idle' && (
        <div className="no-print v-slip-status" style={{ marginTop: '1.5rem', borderTop: '1px dashed #d1d5db', paddingTop: '1rem', textAlign: 'center', fontSize: '0.78rem', color: '#6b7280' }}>
          {slipStatus === 'loading' && '⏳ กำลังโหลดสลิป...'}
          {slipStatus === 'empty' && '— ไม่มีสลิปแนบสำหรับรายการนี้ —'}
          {slipStatus === 'unauthed' && '🔒 กรุณาเข้าสู่ระบบเพื่อดูสลิปแนบ'}
          {slipStatus === 'error' && `⚠️ โหลดสลิปไม่สำเร็จ${slipErr ? `: ${slipErr}` : ''}`}
        </div>
      )}

    </div>
  )
}

function th(extra = {}) {
  return { border: '1px solid #d1d5db', padding: '0.4rem 0.5rem', fontWeight: 600, verticalAlign: 'top', ...extra }
}
function td(extra = {}) {
  return { border: '1px solid #d1d5db', padding: '0.4rem 0.5rem', verticalAlign: 'top', wordBreak: 'break-word', overflowWrap: 'break-word', ...extra }
}
