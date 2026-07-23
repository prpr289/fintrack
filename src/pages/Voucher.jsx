import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import VoucherDoc, { voucherStyle } from '../components/VoucherDoc'

export default function Voucher() {
  const [params] = useSearchParams()

  const data = useMemo(() => {
    try { return JSON.parse(decodeURIComponent(params.get('d') || '')) }
    catch { return null }
  }, [params])

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontFamily: 'sans-serif' }}>
        ไม่พบข้อมูลเอกสาร
      </div>
    )
  }

  const docTitle = data.ty === 'cert' ? 'ใบรับรองแทนใบเสร็จรับเงิน' : data.ty === 'income' ? 'ใบรับเงิน' : 'ใบสำคัญจ่าย'

  return (
    <>
      <style>{voucherStyle}</style>

      <div className="voucher-wrap" style={{ minHeight: '100vh', background: '#f3f4f6', padding: '1.5rem 1rem' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>

          {/* Toolbar */}
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ color: '#374151', fontWeight: 600, fontSize: '0.95rem' }}>{docTitle}</span>
            <button
              onClick={() => window.print()}
              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
            >
              🖨️ พิมพ์ / PDF
            </button>
          </div>

          <VoucherDoc data={data} />
        </div>
      </div>
    </>
  )
}
