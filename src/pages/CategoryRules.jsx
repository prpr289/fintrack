import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { Wand2, Plus, Trash2, Loader2, ArrowRight, Info } from 'lucide-react'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }

function Label({ children }) {
  return <label className="block text-xs font-medium text-slate-400 mb-1">{children}</label>
}

export default function CategoryRules() {
  const [rules, setRules] = useState([])
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ keyword: '', categoryId: '', subCategoryId: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const mainCats = cats.filter(c => !c.parentId)
  const subCatsOf = (pid) => cats.filter(c => c.parentId === pid)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rd, cd] = await Promise.all([api.categoryRules(), api.categories()])
      setRules(rd.rules || [])
      setCats(cd.categories || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const add = async (e) => {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      await api.createCategoryRule({
        keyword: form.keyword.trim(),
        categoryId: form.categoryId,
        subCategoryId: form.subCategoryId || undefined,
      })
      setForm({ keyword: '', categoryId: '', subCategoryId: '' })
      load()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const del = async (r) => {
    if (!confirm(`ลบกฎ "${r.keyword}"?`)) return
    await api.deleteCategoryRule(r.id)
    setRules(rs => rs.filter(x => x.id !== r.id))
  }

  return (
    <div className="rules-page p-4 sm:p-5 space-y-4 max-w-3xl mx-auto">
      <style>{`
        .rules-page button:focus-visible, .rules-page input:focus-visible, .rules-page select:focus-visible {
          outline: 2px solid rgba(16,185,129,0.55); outline-offset: 2px; border-radius: 0.5rem;
        }
        @media (prefers-reduced-motion: reduce) {
          .rules-page *, .rules-page *::before, .rules-page *::after {
            animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-900/30"
          style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
          <Wand2 className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-white leading-tight">กฎหมวดหมู่อัตโนมัติ</h2>
          <p className="text-sm text-slate-500">บังคับหมวดเมื่ออ่านสลิป — มาก่อน "ความจำ" ของ AI</p>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-xl px-4 py-3 text-xs text-slate-400 flex gap-2" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
        <Info className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div>
          ถ้าชื่อผู้รับ/ร้านบนสลิป <b>มีคำที่ตั้งไว้</b> ระบบจะใช้หมวดนี้ทันที (ทั้งตอนอัปหลายใบและทาง LINE)
          โดย<b>ไม่เดาจากความจำ</b> · ถ้ามีหลายกฎตรงกัน จะเลือกคำที่ยาว/เจาะจงที่สุด
        </div>
      </div>

      {/* Add form */}
      <form onSubmit={add} className="rounded-xl p-4 space-y-3" style={CARD}>
        <div>
          <Label>ถ้าชื่อ/ข้อความมีคำว่า</Label>
          <input value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))}
            required className={INPUT} style={INPUT_STYLE} placeholder='เช่น "เซเว่น", "ปตท", "การไฟฟ้า"' />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>→ ใช้หมวดหมู่</Label>
            <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value, subCategoryId: '' }))} required className={INPUT} style={INPUT_STYLE}>
              <option value="">— เลือกหมวด —</option>
              {mainCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {form.categoryId && subCatsOf(form.categoryId).length > 0 && (
            <div>
              <Label>หมวดย่อย (ไม่บังคับ)</Label>
              <select value={form.subCategoryId} onChange={e => setForm(f => ({ ...f, subCategoryId: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                <option value="">— ไม่ระบุ —</option>
                {subCatsOf(form.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button type="submit" disabled={saving || !form.keyword.trim() || !form.categoryId}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} เพิ่มกฎ
        </button>
      </form>

      {/* Rules list */}
      <div className="rounded-xl overflow-hidden" style={CARD}>
        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 text-emerald-500 animate-spin" /></div>
        ) : rules.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#0d1120', border: '1px solid #2e3349' }}>
              <Wand2 className="w-6 h-6 text-slate-600" />
            </div>
            <p className="text-slate-300 text-sm font-medium">ยังไม่มีกฎ</p>
            <p className="text-slate-600 text-xs">เพิ่มกฎด้านบนเพื่อบังคับหมวดให้ตรง</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#1a2035' }}>
            {rules.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm font-medium text-slate-200 px-2 py-0.5 rounded-md flex-shrink-0" style={{ background: '#0d1120', border: '1px solid #2e3349' }}>
                  "{r.keyword}"
                </span>
                <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                <span className="text-sm text-emerald-300 flex-1 min-w-0 truncate">
                  {r.categoryName || '—'}{r.subCategoryName && <span className="text-slate-500"> › {r.subCategoryName}</span>}
                </span>
                <button onClick={() => del(r)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
