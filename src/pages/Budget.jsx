import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { thb } from '../fmt'
import { Plus, Trash2, X, Target } from 'lucide-react'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }
const MONTH_NAMES = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function pad2(n) { return String(n).padStart(2, '0') }

export default function Budget() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [budgets, setBudgets] = useState([])
  const [categories, setCategories] = useState([])
  const [txs, setTxs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ categoryId: '', amount: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const lastDay = new Date(year, month, 0).getDate()
    const from = `${year}-${pad2(month)}-01`
    const to   = `${year}-${pad2(month)}-${pad2(lastDay)}`
    const [bd, cd, td] = await Promise.all([
      api.budgets(),
      api.categories(),
      api.transactions({ from, to, limit: 1000 }),
    ])
    setBudgets(bd.budgets || [])
    setCategories(cd.categories || [])
    setTxs(td.transactions || [])
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  const mainCats = categories.filter(c => !c.parentId)
  const monthBudgets = budgets.filter(b => b.year === year && b.month === month)

  const actualByCategory = {}
  txs.forEach(t => {
    if (!t.categoryId) return
    if (!actualByCategory[t.categoryId]) actualByCategory[t.categoryId] = 0
    if (t.type === 'expense') actualByCategory[t.categoryId] += t.amount
    else actualByCategory[t.categoryId] -= t.amount
  })

  const saveBudget = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      await api.createBudget({ categoryId: form.categoryId, year, month, amount: Number(form.amount) })
      setShowForm(false)
      setForm({ categoryId: '', amount: '' })
      load()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const delBudget = async (b) => {
    if (!confirm(`ลบงบประมาณ "${b.categoryName}"?`)) return
    try { await api.deleteBudget(b.id); load() } catch (e) { alert(e.message) }
  }

  const totalBudget  = monthBudgets.reduce((s, b) => s + b.amount, 0)
  const totalActual  = monthBudgets.reduce((s, b) => s + Math.max(0, actualByCategory[b.categoryId] || 0), 0)
  const totalRemain  = totalBudget - totalActual

  return (
    <div className="budget-page p-4 sm:p-5 space-y-4">
      <style>{`
        .budget-page button:focus-visible, .budget-page input:focus-visible, .budget-page select:focus-visible {
          outline: 2px solid rgba(16,185,129,0.55); outline-offset: 2px; border-radius: 0.5rem;
        }
        @media (prefers-reduced-motion: reduce) {
          .budget-page *, .budget-page *::before, .budget-page *::after {
            animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
          }
        }
      `}</style>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-900/30"
            style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            <Target className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white leading-tight">งบประมาณ</h2>
            <p className="text-sm text-slate-500 mt-0.5">กำหนดงบประมาณรายจ่ายต่อหมวดหมู่รายเดือน</p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className={INPUT} style={{ ...INPUT_STYLE, width: 'auto' }}>
            {MONTH_NAMES.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className={INPUT} style={{ ...INPUT_STYLE, width: 'auto' }}>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => { setForm({ categoryId: mainCats[0]?.id || '', amount: '' }); setErr(''); setShowForm(true) }}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-3 sm:px-4 py-2 rounded-lg transition-colors whitespace-nowrap">
            <Plus className="w-4 h-4" /> เพิ่มงบ
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {monthBudgets.length > 0 && (
        <div className="rounded-xl p-4 grid grid-cols-3 gap-4 text-center" style={CARD}>
          <div>
            <p className="text-xs text-slate-500 mb-1">งบทั้งหมด</p>
            <p className="text-lg font-bold text-white tabular-nums">{thb(totalBudget)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">ใช้แล้ว</p>
            <p className={`text-lg font-bold tabular-nums ${totalActual > totalBudget ? 'text-red-400' : 'text-yellow-400'}`}>{thb(totalActual)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">คงเหลือ</p>
            <p className={`text-lg font-bold tabular-nums ${totalRemain < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{thb(totalRemain)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center">
          <div className="w-5 h-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mx-auto" />
        </div>
      ) : monthBudgets.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={CARD}>
          <Target className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm font-medium">ยังไม่มีงบประมาณสำหรับเดือนนี้</p>
          <p className="text-slate-600 text-xs mt-1">กดปุ่ม "+ เพิ่มงบ" เพื่อเริ่มกำหนดงบประมาณ</p>
        </div>
      ) : (
        <div className="space-y-3">
          {monthBudgets.map(b => {
            const actual = Math.max(0, actualByCategory[b.categoryId] || 0)
            const pct = b.amount > 0 ? Math.min(100, Math.round((actual / b.amount) * 100)) : 0
            const remaining = b.amount - actual
            const isOver = actual > b.amount
            const barColor = isOver ? '#f87171' : pct > 80 ? '#f59e0b' : '#34d399'
            return (
              <div key={b.id} className="rounded-xl p-4" style={CARD}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: b.categoryColor || '#9CA3AF' }} />
                    <span className="font-medium text-slate-200">{b.categoryName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`text-sm font-semibold tabular-nums ${isOver ? 'text-red-400' : 'text-slate-200'}`}>
                        {thb(actual)} / {thb(b.amount)}
                      </p>
                      <p className={`text-xs tabular-nums ${isOver ? 'text-red-400' : 'text-emerald-400'}`}>
                        {isOver ? `เกินงบ ${thb(Math.abs(remaining))}` : `เหลือ ${thb(remaining)}`}
                      </p>
                    </div>
                    <button onClick={() => delBudget(b)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="w-full rounded-full h-2.5" style={{ background: '#1f2937' }}>
                  <div className="h-2.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-slate-600">0</span>
                  <span className="text-xs font-semibold tabular-nums" style={{ color: barColor }}>{pct}%</span>
                  <span className="text-xs text-slate-600 tabular-nums">{thb(b.amount)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
          <div className="w-full sm:max-w-sm sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
            style={{ background: '#161b2e', border: '1px solid #2e3349' }}>
            <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-700" />
            </div>
            <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
              <h3 className="font-semibold text-slate-200">กำหนดงบประมาณ</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300 p-1"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={saveBudget} className="p-5 space-y-3 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">หมวดหมู่</label>
                <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} required className={INPUT} style={INPUT_STYLE}>
                  <option value="">เลือกหมวดหมู่...</option>
                  {mainCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">งบประมาณ (บาท)</label>
                <input type="number" min="1" step="1" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required className={INPUT} style={INPUT_STYLE} placeholder="0" />
              </div>
              <p className="text-xs text-slate-500">เดือน: <span className="text-slate-300">{MONTH_NAMES[month - 1]} {year}</span></p>
              {err && <p className="text-red-400 text-sm">{err}</p>}
              <button type="submit" disabled={saving}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
