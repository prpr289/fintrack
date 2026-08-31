import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'

const FONT = '"Sarabun","Noto Sans Thai",-apple-system,"Segoe UI",Roboto,sans-serif'

function thb(n) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)
}

function formatThaiDateTime(s) {
  if (!s) return '-'
  try {
    const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z')
    if (isNaN(d.getTime())) return s
    return d.toLocaleString('th-TH', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
    })
  } catch { return s }
}

const STATUS_META = {
  pending:  { label: '🕐 รอร้านโอน', bg: '#fffbeb', fg: '#b45309', border: '#fde68a' },
  paid:     { label: '✅ จ่ายแล้ว',  bg: '#ecfdf5', fg: '#15803d', border: '#a7f3d0' },
  rejected: { label: '✕ ปฏิเสธ',    bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' },
}

// เอกสารใบเดียวเปลี่ยนหัวตามสถานะ — ไม่มีการสร้างเอกสารใหม่ ลิงก์ที่คู่ค้าเก็บไว้ใช้ได้ตลอด
// ใบรับของ (เซ็นต่อหน้า) ไม่เปลี่ยนหัว เพราะของเดิมใช้งานอยู่แล้ว ห้ามแตะ
function docTitle(data) {
  if (data.kind !== 'billing_link') return { th: 'ใบรับของ', en: 'GOODS RECEIPT' }
  if (data.status === 'paid') return { th: 'ใบสำคัญจ่าย', en: 'PAYMENT VOUCHER' }
  if (data.ack?.at) return { th: 'ใบตรวจรับ', en: 'GOODS RECEIPT' }
  return { th: 'ใบวางบิล', en: 'BILLING NOTE' }
}

const printStyle = `
  @media print {
    .no-print { display: none !important; }
    body { background: white !important; margin: 0; padding: 0; }
    .receipt-wrap { padding: 0 !important; background: white !important; }
    .receipt-doc { box-shadow: none !important; border-radius: 0 !important; }
  }
  @page { size: A4 portrait; margin: 15mm 20mm; }
`

function CenterMsg({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontFamily: FONT, background: '#f3f4f6', padding: '1rem', textAlign: 'center' }}>
      {children}
    </div>
  )
}

function th(extra = {}) {
  return { border: '1px solid #cbd2dc', padding: '0.4rem 0.5rem', fontWeight: 700, textAlign: 'left', background: '#f1f3f7', ...extra }
}
function td(extra = {}) {
  return { border: '1px solid #cbd2dc', padding: '0.4rem 0.5rem', verticalAlign: 'top', ...extra }
}

const inputStyle = {
  width: '100%', padding: '0.55rem 0.65rem', fontSize: '0.9rem', fontFamily: FONT,
  border: '1px solid #cbd2dc', borderRadius: '0.4rem', background: '#fff', color: '#1f2430',
}

// ฟอร์มให้คู่ค้ายืนยันรายการ — โผล่เฉพาะใบวางบิลที่ยังไม่ยืนยันและยังไม่จ่าย
function AckForm({ token, onDone }) {
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')
  const [mode, setMode] = useState('ack')   // ack | dispute
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (mode === 'ack' && !name.trim()) { setErr('กรุณาพิมพ์ชื่อผู้ยืนยัน'); return }
    if (mode === 'dispute' && !reason.trim()) { setErr('กรุณาบอกด้วยว่ารายการไหนไม่ตรง'); return }
    setBusy(true)
    try {
      if (mode === 'ack') await api.ackReceipt(token, name.trim())
      else await api.disputeReceipt(token, reason.trim())
      await onDone()
    } catch (e2) {
      setErr(e2.message || 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="no-print"
      style={{ marginTop: '1.1rem', border: '1px dashed #b6bdc9', borderRadius: '0.5rem', padding: '0.95rem', background: '#f7f8fa' }}>
      {mode === 'ack' ? (
        <>
          <label htmlFor="ack-name" style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.4rem' }}>
            ตรวจรายการแล้ว พิมพ์ชื่อผู้ยืนยัน
          </label>
          <input id="ack-name" style={inputStyle} value={name} onChange={e => setName(e.target.value)}
            placeholder="ชื่อ–นามสกุล" autoComplete="name" maxLength={120} />
        </>
      ) : (
        <>
          <label htmlFor="ack-reason" style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.4rem' }}>
            รายการไหนไม่ตรง บอกไว้ตรงนี้ ทางร้านจะติดต่อกลับ
          </label>
          <textarea id="ack-reason" rows={3} style={{ ...inputStyle, resize: 'vertical' }} value={reason}
            onChange={e => setReason(e.target.value)} placeholder="เช่น มะละกอส่งจริง 28 กก. ไม่ใช่ 30 กก." maxLength={500} />
        </>
      )}

      {err && <p role="alert" style={{ color: '#b91c1c', fontSize: '0.82rem', margin: '0.5rem 0 0' }}>{err}</p>}

      <button type="submit" disabled={busy}
        style={{ width: '100%', marginTop: '0.6rem', background: mode === 'ack' ? '#059669' : '#b45309', color: '#fff',
          border: 'none', borderRadius: '0.4rem', padding: '0.65rem 1rem', fontSize: '0.92rem', fontWeight: 600,
          fontFamily: FONT, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'กำลังส่ง...' : mode === 'ack' ? 'ยืนยันรายการถูกต้อง' : 'ส่งเรื่องทักท้วง'}
      </button>

      <button type="button" onClick={() => { setMode(mode === 'ack' ? 'dispute' : 'ack'); setErr('') }}
        style={{ width: '100%', marginTop: '0.5rem', background: 'none', border: 'none', color: '#6b7280',
          fontSize: '0.8rem', fontFamily: FONT, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
        {mode === 'ack' ? 'รายการไม่ตรง — แจ้งทักท้วง' : 'กลับไปยืนยันรายการ'}
      </button>

      <p style={{ fontSize: '0.72rem', color: '#8a93a3', textAlign: 'center', margin: '0.7rem 0 0', lineHeight: 1.6 }}>
        สำหรับผู้ขายเท่านั้น · ยืนยันได้ครั้งเดียว แก้ไม่ได้<br />
        ระบบบันทึกชื่อ เวลา และหมายเลขเครื่องที่ใช้ยืนยันไว้เป็นหลักฐาน
      </p>
    </form>
  )
}

export default function Receipt() {
  const { token } = useParams()
  const [state, setState] = useState('loading') // loading | ready | notfound
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    const d = await api.publicReceipt(token)
    setData(d)
    setState('ready')
  }, [token])

  useEffect(() => {
    let cancelled = false
    setState('loading')
    api.publicReceipt(token)
      .then(d => { if (!cancelled) { setData(d); setState('ready') } })
      .catch(() => { if (!cancelled) setState('notfound') })
    return () => { cancelled = true }
  }, [token])

  if (state === 'loading') return <CenterMsg>กำลังโหลดเอกสาร...</CenterMsg>
  if (state === 'notfound' || !data) return <CenterMsg>ไม่พบเอกสาร — ลิงก์นี้อาจไม่ถูกต้องหรือถูกลบไปแล้ว</CenterMsg>

  const items = Array.isArray(data.lineItems) ? data.lineItems : []
  const statusMeta = STATUS_META[data.status] || STATUS_META.pending
  const title = docTitle(data)
  const ack = data.ack || null
  const canAck = data.kind === 'billing_link' && data.status === 'pending' && !ack?.at

  return (
    <>
      <style>{printStyle}</style>
      <div className="receipt-wrap" style={{ minHeight: '100vh', background: '#f3f4f6', padding: '1.5rem 1rem', fontFamily: FONT }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>

          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
            <button
              onClick={() => window.print()}
              style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}
            >
              🖨️ พิมพ์ / PDF
            </button>
          </div>

          <div className="receipt-doc" style={{ background: '#fff', color: '#1f2430', borderRadius: '0.75rem', boxShadow: '0 4px 16px rgba(0,0,0,.1)', padding: '1.75rem 1.5rem', lineHeight: 1.6 }}>

            {/* Shop header */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid #1f2430', paddingBottom: '0.6rem', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{data.shopName}</div>
            </div>

            <div style={{ textAlign: 'center', fontSize: '1rem', fontWeight: 700, letterSpacing: '0.02em', margin: '0.1rem 0 0.9rem' }}>
              {title.th} / {title.en}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.82rem', marginBottom: '0.3rem' }}>
              <span>เลขที่ <strong>{data.receiptNo}</strong></span>
              <span>วันที่ <strong>{formatThaiDateTime(data.date)}</strong></span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.82rem', marginBottom: '0.9rem' }}>
              <span>ผู้ขาย <strong>{data.vendorName || '-'}</strong></span>
              {data.payeeAccountMasked && <span>รับเงินเข้า <strong>{data.payeeAccountMasked}</strong></span>}
            </div>

            {/* Line items */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
              <thead>
                <tr>
                  <th style={th()}>รายการ</th>
                  <th style={th({ textAlign: 'right' })}>จำนวน</th>
                  <th style={th({ textAlign: 'right' })}>ราคา/หน่วย</th>
                  <th style={th({ textAlign: 'right' })}>จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td style={td({ textAlign: 'center', color: '#9ca3af' })} colSpan={4}>— ไม่มีรายการ —</td></tr>
                ) : items.map((it, idx) => {
                  const amt = Number(it.qty) * Number(it.unitPrice)
                  return (
                    <tr key={idx}>
                      <td style={td()}>{it.name}</td>
                      <td style={td({ textAlign: 'right', fontVariantNumeric: 'tabular-nums' })}>{it.qty}{it.unit ? ` ${it.unit}` : ''}</td>
                      <td style={td({ textAlign: 'right', fontVariantNumeric: 'tabular-nums' })}>{thb(it.unitPrice)}</td>
                      <td style={td({ textAlign: 'right', fontVariantNumeric: 'tabular-nums' })}>{thb(amt)}</td>
                    </tr>
                  )
                })}
                <tr style={{ background: '#f7f8fa', fontWeight: 700 }}>
                  <td style={td()} colSpan={3}>รวมทั้งสิ้น</td>
                  <td style={td({ textAlign: 'right', fontVariantNumeric: 'tabular-nums' })}>{thb(data.amount)}</td>
                </tr>
              </tbody>
            </table>

            {/* ลายเซ็นที่เซ็นต่อหน้า (โหมดรับของเดิม) */}
            {data.hasSignature && (
              <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.35rem' }}>ลายเซ็นผู้ขาย (รับทราบยอด)</div>
                <div style={{ border: '1px dashed #b6bdc9', borderRadius: '0.5rem', padding: '0.4rem', background: '#fff', display: 'inline-block' }}>
                  <img
                    src={api.publicReceiptSignatureUrl(token)}
                    alt="ลายเซ็นผู้ขาย"
                    style={{ maxWidth: '260px', maxHeight: '90px', display: 'block' }}
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                </div>
              </div>
            )}

            {/* คู่ค้ายืนยันเองจากลิงก์ */}
            {ack?.at && (
              <div style={{ marginTop: '1.1rem', border: '1px solid #c7d2fe', background: '#eef2ff', borderRadius: '0.5rem', padding: '0.8rem 0.9rem' }}>
                <div style={{ fontWeight: 700, color: '#3730a3', fontSize: '0.88rem' }}>
                  {ack.name} · ยืนยันรายการถูกต้อง
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.15rem' }}>
                  {formatThaiDateTime(ack.at)}
                </div>
              </div>
            )}

            {/* ทักท้วงแล้ว ยังไม่ยืนยัน */}
            {ack?.disputeAt && !ack?.at && (
              <div style={{ marginTop: '1.1rem', border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '0.5rem', padding: '0.8rem 0.9rem' }}>
                <div style={{ fontWeight: 700, color: '#b91c1c', fontSize: '0.88rem' }}>ผู้ขายแจ้งทักท้วงรายการ</div>
                <div style={{ fontSize: '0.82rem', color: '#1f2430', marginTop: '0.25rem' }}>{ack.disputeReason}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.15rem' }}>{formatThaiDateTime(ack.disputeAt)}</div>
              </div>
            )}

            {canAck && <AckForm token={token} onDone={load} />}

            {/* Status pill */}
            <div style={{ marginTop: '1.1rem', display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 700, padding: '0.4rem 0.85rem', borderRadius: '999px', background: statusMeta.bg, color: statusMeta.fg, border: `1px solid ${statusMeta.border}` }}>
              <span>{statusMeta.label}</span>
              {data.status === 'paid' && (
                <span style={{ fontWeight: 500 }}>
                  · {formatThaiDateTime(data.paidAt)}{data.payeeAccountMasked ? ` · โอนเข้า ${data.payeeAccountMasked}` : ''}
                </span>
              )}
            </div>

            {/* สลิปโอน — โผล่เองเมื่อพนักงานแนบ ไม่ต้องส่งลิงก์ใหม่ให้คู่ค้า */}
            {data.kind === 'billing_link' && data.status === 'paid' && data.hasPaymentSlip && (
              <div style={{ marginTop: '1.1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.35rem' }}>หลักฐานการโอน</div>
                <img
                  src={api.publicReceiptSlipUrl(token)}
                  alt="สลิปโอนเงิน"
                  style={{ maxWidth: '100%', maxHeight: '420px', borderRadius: '0.5rem', border: '1px solid #cbd2dc' }}
                  onError={e => { e.currentTarget.style.display = 'none' }}
                />
              </div>
            )}

            {/* ผู้ตรวจรับ */}
            {data.receivedByName && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#6b7280' }}>
                ผู้ตรวจรับ: <strong style={{ color: '#1f2430' }}>{data.receivedByName}</strong>
              </div>
            )}

            {/* Disclaimer */}
            <div style={{ marginTop: '1.25rem', paddingTop: '0.9rem', borderTop: '1px dashed #cbd2dc', fontSize: '0.72rem', color: '#8a93a3', textAlign: 'center', lineHeight: 1.6 }}>
              {data.status === 'paid' && data.kind === 'billing_link'
                ? 'เอกสารนี้ออกโดยผู้จ่ายเงิน ใช้เป็นหลักฐานประกอบรายจ่าย · ไม่ใช่ใบเสร็จรับเงินและไม่มีภาษีมูลค่าเพิ่ม'
                : 'หน้านี้สำหรับผู้ขายตรวจสอบรายการที่ส่งให้ร้าน · ใช้อ้างอิงกรณีมีข้อโต้แย้ง · แสดงเฉพาะใบนี้ (เลขบัญชีปิดบางส่วนเพื่อความปลอดภัย)'}
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
