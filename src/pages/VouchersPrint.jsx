import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import VoucherDoc, { voucherStyle } from '../components/VoucherDoc'

// Bulk print page: renders many vouchers stacked, one per printed page.
// URL: /vouchers/print?d=<encoded JSON array of voucher data objects>
export default function VouchersPrint() {
  const [params] = useSearchParams()

  const list = useMemo(() => {
    try {
      const parsed = JSON.parse(decodeURIComponent(params.get('d') || '[]'))
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  }, [params])

  if (!list.length) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontFamily: 'sans-serif' }}>
        ไม่พบข้อมูลเอกสาร
      </div>
    )
  }

  return (
    <>
      <style>{voucherStyle}</style>

      <div className="voucher-wrap" style={{ minHeight: '100vh', background: '#f3f4f6', padding: '1.5rem 1rem' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>

          {/* Toolbar */}
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ color: '#374151', fontWeight: 600, fontSize: '0.95rem' }}>
              ใบสำคัญจ่าย {list.length} ใบ
            </span>
            <button
              onClick={() => window.print()}
              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
            >
              🖨️ พิมพ์ทั้งหมด / PDF
            </button>
          </div>

          {list.map((data, i) => (
            <div key={data.id || i} className="voucher-page" style={{ marginBottom: '1.5rem' }}>
              <VoucherDoc data={data} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
