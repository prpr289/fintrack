import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { thb } from '../fmt'
import { BarChart3, ArrowDownLeft, ArrowUpRight, AlertTriangle, CheckCircle2, Loader2, Wallet } from 'lucide-react'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const PERIODS = [
  { key: 'thisMonth', label: 'เดือนนี้' },
  { key: 'lastMonth', label: 'เดือนที่แล้ว' },
  { key: '7d',  label: '7 วัน' },
  { key: '30d', label: '30 วัน' },
  { key: 'all', label: 'ทั้งหมด' },
]
function rangeOf(key, custom) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const ago = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return d }
  switch (key) {
    case 'thisMonth': return { from: ymd(new Date(y, m, 1)), to: ymd(now) }
    case 'lastMonth': return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) }
    case '7d':  return { from: ymd(ago(6)), to: ymd(now) }
    case '30d': return { from: ymd(ago(29)), to: ymd(now) }
    case 'custom': return (custom.from && custom.to) ? custom : null
    default: return null
  }
}

const SCOPES = [['', 'ทุก scope'], ['business', 'ธุรกิจ'], ['personal', 'ส่วนตัว']]

function Num({ value, color, signed }) {
  return <span className="tabular-nums" style={color ? { color } : undefined}>{signed && value > 0 ? '+' : ''}{thb(value)}</span>
}

export default function Reports() {
  const [period, setPeriod] = useState('thisMonth')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [scope, setScope] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const range = rangeOf(period, custom)
    const params = {}
    if (range) { params.from = range.from; params.to = range.to }
    if (scope) params.scope = scope
    try {
      const d = await api.reportWallets(params)
      setData(d)
    } catch (e) { console.error(e); setData(null) } finally { setLoading(false) }
  }, [period, custom, scope])

  useEffect(() => { load() }, [load])

  const wallets = data?.wallets || []
  const totals = data?.totals
  const mismatches = wallets.filter(w => !w.reconcile.ok)
  const totalBalance = wallets.reduce((s, w) => s + w.currentBalance, 0)
  const periodLabel = period === 'custom' && custom.from && custom.to
    ? `${custom.from} → ${custom.to}`
    : PERIODS.find(p => p.key === period)?.label || ''

  return (
    <div className="reports-page p-4 sm:p-5 space-y-4 max-w-6xl mx-auto">
      <style>{`
        .reports-page button:focus-visible, .reports-page input:focus-visible, .reports-page select:focus-visible {
          outline: 2px solid rgba(16,185,129,0.55); outline-offset: 2px; border-radius: 0.5rem;
        }
        @media (prefers-reduced-motion: reduce) {
          .reports-page *, .reports-page *::before, .reports-page *::after {
            animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-900/30"
          style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
          <BarChart3 className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-white leading-tight">รายงานแยกกระเป๋า</h2>
          <p className="text-sm text-slate-500">รับ–จ่ายจริง แยกจากการโอน · <span className="text-slate-400">{periodLabel}</span></p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => { setPeriod(p.key) }}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${period === p.key ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            style={period === p.key ? {} : { border: '1px solid #2e3349', background: '#0d1120' }}>
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5">
          <input type="date" value={custom.from} onChange={e => { const v = e.target.value; setCustom(c => ({ ...c, from: v })); if (v && custom.to) setPeriod('custom') }}
            className="rounded-lg px-2 py-1.5 text-xs text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500" style={{ background: '#0d1120' }} />
          <span className="text-slate-600 text-xs">–</span>
          <input type="date" value={custom.to} onChange={e => { const v = e.target.value; setCustom(c => ({ ...c, to: v })); if (custom.from && v) setPeriod('custom') }}
            className="rounded-lg px-2 py-1.5 text-xs text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500" style={{ background: '#0d1120' }} />
        </div>
        <select value={scope} onChange={e => setScope(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 ml-auto" style={{ background: '#0d1120' }}>
          {SCOPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>
      ) : (
        <>
          {/* Reconcile */}
          {mismatches.length > 0 ? (
            <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <div className="flex items-center gap-2 text-red-400 font-semibold text-sm mb-2">
                <AlertTriangle className="w-4 h-4" /> พบ {mismatches.length} กระเป๋ายอดไม่ตรง (ยอดปัจจุบัน ≠ ตั้งต้น + รับ−จ่ายสะสม)
              </div>
              <div className="space-y-1.5">
                {mismatches.map(w => (
                  <div key={w.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: w.color || '#9CA3AF' }} />{w.name}
                    </span>
                    <span className="text-slate-400 tabular-nums">
                      ควรเป็น {thb(w.reconcile.expected)} · จริง {thb(w.currentBalance)} ·
                      <span className={w.reconcile.diff < 0 ? 'text-red-400' : 'text-amber-400'}> ต่าง {w.reconcile.diff > 0 ? '+' : ''}{thb(w.reconcile.diff)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : wallets.length > 0 && (
            <div className="rounded-xl px-4 py-2.5 flex items-center gap-2 text-emerald-400 text-sm" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
              <CheckCircle2 className="w-4 h-4" /> ยอดทุกกระเป๋าตรงกัน — ไม่มีความผิดปกติ
            </div>
          )}

          {/* Desktop table */}
          <div className="rounded-xl overflow-hidden hidden md:block" style={CARD}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #1f2937', background: '#111827' }}>
                    {['กระเป๋า', 'รับจริง', 'จ่ายจริง', 'โอนเข้า', 'โอนออก', 'สุทธิ', 'ยอดปัจจุบัน'].map((h, i) => (
                      <th key={i} className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((w, i) => (
                    <tr key={w.id} className="hover:bg-white/[0.02]" style={{ borderBottom: i < wallets.length - 1 ? '1px solid #1a2035' : 'none' }}>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: w.color || '#9CA3AF' }} />
                          <span className="font-medium text-slate-200">{w.name}</span>
                          {!w.reconcile.ok && <AlertTriangle className="w-3.5 h-3.5 text-red-400" title="ยอดไม่ตรง" />}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right"><Num value={w.realIncome} color="#34d399" /></td>
                      <td className="px-4 py-3 text-right"><Num value={w.realExpense} color="#f87171" /></td>
                      <td className="px-4 py-3 text-right"><Num value={w.transferIn} color="#60a5fa" /></td>
                      <td className="px-4 py-3 text-right"><Num value={w.transferOut} color="#fbbf24" /></td>
                      <td className="px-4 py-3 text-right font-semibold"><Num value={w.net} color={w.net >= 0 ? '#34d399' : '#f87171'} signed /></td>
                      <td className="px-4 py-3 text-right font-semibold"><Num value={w.currentBalance} color={w.currentBalance < 0 ? '#f87171' : '#e2e8f0'} /></td>
                    </tr>
                  ))}
                  {totals && wallets.length > 0 && (
                    <tr style={{ background: '#111827', fontWeight: 700 }}>
                      <td className="px-4 py-3 text-slate-300">รวม</td>
                      <td className="px-4 py-3 text-right"><Num value={totals.realIncome} color="#34d399" /></td>
                      <td className="px-4 py-3 text-right"><Num value={totals.realExpense} color="#f87171" /></td>
                      <td className="px-4 py-3 text-right"><Num value={totals.transferIn} color="#60a5fa" /></td>
                      <td className="px-4 py-3 text-right"><Num value={totals.transferOut} color="#fbbf24" /></td>
                      <td className="px-4 py-3 text-right"><Num value={totals.net} color={totals.net >= 0 ? '#34d399' : '#f87171'} signed /></td>
                      <td className="px-4 py-3 text-right"><Num value={totalBalance} color={totalBalance < 0 ? '#f87171' : '#e2e8f0'} /></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {wallets.map(w => (
              <div key={w.id} className="rounded-xl p-4" style={CARD}>
                <div className="flex items-center justify-between mb-3">
                  <span className="flex items-center gap-2 font-semibold text-slate-200">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: w.color || '#9CA3AF' }} />{w.name}
                    {!w.reconcile.ok && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                  </span>
                  <span className="text-sm font-bold"><Num value={w.currentBalance} color={w.currentBalance < 0 ? '#f87171' : '#e2e8f0'} /></span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <Row label="รับจริง" icon={<ArrowDownLeft className="w-3 h-3 text-emerald-400" />}><Num value={w.realIncome} color="#34d399" /></Row>
                  <Row label="จ่ายจริง" icon={<ArrowUpRight className="w-3 h-3 text-red-400" />}><Num value={w.realExpense} color="#f87171" /></Row>
                  <Row label="โอนเข้า"><Num value={w.transferIn} color="#60a5fa" /></Row>
                  <Row label="โอนออก"><Num value={w.transferOut} color="#fbbf24" /></Row>
                  <Row label="สุทธิ"><Num value={w.net} color={w.net >= 0 ? '#34d399' : '#f87171'} signed /></Row>
                </div>
              </div>
            ))}
          </div>

          {wallets.length === 0 && (
            <div className="p-12 text-center flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#0d1120', border: '1px solid #2e3349' }}>
                <Wallet className="w-6 h-6 text-slate-600" />
              </div>
              <p className="text-slate-300 text-sm font-medium">ไม่มีข้อมูลในช่วงนี้</p>
              <p className="text-slate-600 text-xs">ลองปรับช่วงเวลา</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Row({ label, icon, children }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500 flex items-center gap-1">{icon}{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  )
}
