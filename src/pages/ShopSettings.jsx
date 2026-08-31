import { useEffect, useState } from 'react'
import { api } from '../api'
import { Building2, Loader2 } from 'lucide-react'

// ข้อมูลร้านที่ขึ้นหัวเอกสารทุกใบที่คู่ค้าเห็น
// ก่อนมีหน้านี้ ชื่อร้านแก้ได้ทางเดียวคือยิงคำสั่งเข้าฐานข้อมูล จึงค้างที่ค่า default "My Business"
const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }

const FIELDS = [
  { key: 'name',      label: 'ชื่อร้าน',                 hint: 'ขึ้นบรรทัดแรกของทุกเอกสาร', required: true, max: 120 },
  { key: 'address',   label: 'ที่อยู่',                   hint: 'ตามที่จะให้ปรากฏบนเอกสาร', textarea: true, max: 300 },
  { key: 'taxId',     label: 'เลขประจำตัวผู้เสียภาษี',    hint: '13 หลัก — เว้นว่างได้ถ้ายังไม่มี', max: 40 },
  { key: 'taxBranch', label: 'รหัสสาขา',                  hint: '00000 = สำนักงานใหญ่', max: 20 },
  { key: 'phone',     label: 'เบอร์ติดต่อ',               hint: 'เบอร์ที่คู่ค้าโทรกลับได้', max: 40 },
]

export default function ShopSettings() {
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    api.workspace()
      .then(d => setForm({
        name: d.workspace?.name || '', address: d.workspace?.address || '',
        taxId: d.workspace?.taxId || '', taxBranch: d.workspace?.taxBranch || '',
        phone: d.workspace?.phone || '',
      }))
      .catch(e => setErr(e.message || 'โหลดข้อมูลร้านไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setErr(''); setMsg('')
    if (!form.name.trim()) { setErr('ชื่อร้านห้ามว่าง'); return }
    setSaving(true)
    try {
      await api.updateWorkspace(form)
      setMsg('บันทึกแล้ว — เอกสารที่ออกหลังจากนี้จะใช้ข้อมูลใหม่')
    } catch (e2) { setErr(e2.message || 'บันทึกไม่สำเร็จ') } finally { setSaving(false) }
  }

  if (loading) return <div className="p-5 text-slate-500 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />กำลังโหลด...</div>
  if (!form) return <div className="p-5 text-slate-400 text-sm">{err || 'ไม่พบข้อมูลร้าน'}</div>

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
          <Building2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white leading-tight">ข้อมูลร้านค้า</h2>
          <p className="text-sm text-slate-500">ขึ้นหัวเอกสารทุกใบที่คู่ค้าเปิดดู</p>
        </div>
      </div>

      <form onSubmit={save} className="rounded-2xl p-4 sm:p-5 space-y-4" style={CARD}>
        {FIELDS.map(f => (
          <div key={f.key}>
            <label htmlFor={`shop-${f.key}`} className="block text-xs font-medium text-slate-400 mb-1.5">
              {f.label}{f.required && <span className="text-amber-400"> *</span>}
            </label>
            {f.textarea ? (
              <textarea id={`shop-${f.key}`} rows={2} className={INPUT} style={INPUT_STYLE} maxLength={f.max}
                value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
            ) : (
              <input id={`shop-${f.key}`} className={INPUT} style={INPUT_STYLE} maxLength={f.max}
                value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
            )}
            <p className="text-[11px] text-slate-600 mt-1">{f.hint}</p>
          </div>
        ))}

        {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
        {msg && <p className="text-sm text-emerald-400" role="status">{msg}</p>}

        <button type="submit" disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors">
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </form>

      {/* ตัวอย่างหัวเอกสาร — เห็นผลทันทีว่าคู่ค้าจะเห็นอะไร ไม่ต้องออกใบจริงมาลอง */}
      <div className="rounded-2xl p-4 sm:p-5" style={CARD}>
        <p className="text-xs text-slate-400 mb-2">คู่ค้าจะเห็นหัวเอกสารแบบนี้</p>
        <div style={{ background: '#fff', color: '#1f2430', borderRadius: '0.5rem', padding: '0.9rem 1rem',
          fontFamily: '"Sarabun","Noto Sans Thai",sans-serif', borderBottom: '2px solid #1f2430' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{form.name || 'ยังไม่ได้ตั้งชื่อร้าน'}</div>
          {form.address && <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{form.address}</div>}
          {form.taxId && (
            <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
              เลขประจำตัวผู้เสียภาษี {form.taxId}{form.taxBranch ? ` · สาขา ${form.taxBranch}` : ''}
            </div>
          )}
          {form.phone && <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>โทร {form.phone}</div>}
        </div>
      </div>
    </div>
  )
}
