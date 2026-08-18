import { docTypeMeta } from '../merchantMeta'

// ป้ายบอกว่าซื้อจากร้านนี้แล้วลงรายจ่ายทางภาษีได้แค่ไหน — โผล่ทุกจอที่มีชื่อร้าน
// "ยังไม่ระบุ" ตั้งใจให้เห็นชัด ไม่ซ่อน เพราะร้านที่ไม่รู้ว่าออกเอกสารอะไรได้
// คือร้านที่จะมีปัญหาตอนปิดปี
export default function DocBadge({ docType, short = false, className = '' }) {
  const d = docTypeMeta(docType)
  if (!d) {
    return (
      <span className={`text-[11px] px-2 py-0.5 rounded font-semibold whitespace-nowrap border border-slate-700 text-slate-500 ${className}`}>
        ยังไม่ระบุเอกสาร
      </span>
    )
  }
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded font-semibold whitespace-nowrap ${className}`}
      style={{ background: `${d.color}1f`, color: d.color, border: `1px solid ${d.color}47` }}>
      {short ? d.short : d.label}
    </span>
  )
}
