import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { thb, ymd } from '../fmt'
import { BarChart3, ArrowDownLeft, ArrowUpRight, AlertTriangle, CheckCircle2, Loader2, Wallet, PieChart, ChevronDown } from 'lucide-react'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const SUNK = { background: '#0d1120', border: '1px solid #1f2937' }

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

// Top-level summary tile
function StatTile({ label, value, color, signed, icon }) {
  return (
    <div className="rounded-xl px-3.5 py-3" style={CARD}>
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1">{icon}{label}</div>
      <div className="text-base sm:text-lg font-bold tabular-nums leading-tight" style={{ color: color || '#e2e8f0' }}>
        {signed && value > 0 ? '+' : ''}{thb(value)}
      </div>
    </div>
  )
}

// Compact per-wallet flow stat
function MiniStat({ label, value, color, signed, icon }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={SUNK}>
      <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-0.5">{icon}{label}</div>
      <div className="text-sm font-semibold tabular-nums truncate" style={{ color }}>{signed && value > 0 ? '+' : ''}{thb(value)}</div>
    </div>
  )
}

// One wallet: summary + expense-by-category breakdown bars
function WalletCard({ w }) {
  const [open, setOpen] = useState(false)
  const cats = w.categories || []
  const maxCat = cats.reduce((mx, c) => Math.max(mx, c.total), 0) || 1
  const shown = open ? cats : cats.slice(0, 4)
  const hasExpense = cats.length > 0

  return (
    <div className="rounded-2xl overflow-hidden" style={CARD}>
      {/* Header */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: w.color || '#9CA3AF', boxShadow: `0 0 10px ${(w.color || '#9CA3AF')}66` }} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-100 truncate">{w.name}</span>
                {!w.reconcile.ok && <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" title="ยอดไม่ตรง" />}
              </div>
              <span className="text-[11px] text-slate-500">{w.scope === 'business' ? 'ธุรกิจ' : 'ส่วนตัว'}</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[11px] text-slate-500">ยอดปัจจุบัน</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: w.currentBalance < 0 ? '#f87171' : '#e2e8f0' }}>
              {thb(w.currentBalance)}
            </div>
          </div>
        </div>

        {/* Flow mini-stats */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <MiniStat label="รับจริง" value={w.realIncome} color="#34d399" icon={<ArrowDownLeft className="w-2.5 h-2.5 text-emerald-400" />} />
          <MiniStat label="จ่ายจริง" value={w.realExpense} color="#f87171" icon={<ArrowUpRight className="w-2.5 h-2.5 text-red-400" />} />
          <MiniStat label="สุทธิ" value={w.net} color={w.net >= 0 ? '#34d399' : '#f87171'} signed />
        </div>
      </div>

      {/* Expense by category */}
      <div style={{ borderTop: '1px solid #1f2937', background: '#111827' }} className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
            <PieChart className="w-3.5 h-3.5 text-emerald-400" /> จ่ายไปกับหมวด
          </span>
          {hasExpense && <span className="text-[11px] text-slate-600">{cats.length} หมวด</span>}
        </div>

        {hasExpense ? (
          <div className="space-y-2.5">
            {shown.map(c => {
              const share = w.realExpense > 0 ? (c.total / w.realExpense) * 100 : 0
              return (
                <div key={c.id || 'none'}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                      <span className="text-xs text-slate-300 truncate">{c.name}</span>
                      <span className="text-[10px] text-slate-600 flex-shrink-0">×{c.count}</span>
                    </span>
                    <span className="text-xs tabular-nums text-slate-300 flex-shrink-0">
                      {thb(c.total)} <span className="text-slate-600">· {share.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#0d1120' }}>
                    <div className="h-full rounded-full"
                      style={{ width: `${Math.max(2, (c.total / maxCat) * 100)}%`, background: c.color, transition: 'width .35s ease' }} />
                  </div>
                </div>
              )
            })}
            {cats.length > 4 && (
              <button onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors pt-0.5">
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                {open ? 'ย่อ' : `ดูทั้งหมด (${cats.length})`}
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-600 py-1.5">ไม่มีรายจ่ายในช่วงนี้</p>
        )}
      </div>
    </div>
  )
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
  const headerRange = rangeOf(period, custom)
  const periodLabel = period === 'custom' && custom.from && custom.to
    ? `${custom.from} → ${custom.to}`
    : `${PERIODS.find(p => p.key === period)?.label || ''}${headerRange ? ` (${headerRange.from} → ${headerRange.to})` : ''}`

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
          <p className="text-sm text-slate-500">แต่ละกระเป๋าจ่ายเข้าหมวดไหนบ้าง · <span className="text-slate-400">{periodLabel}</span></p>
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
      ) : wallets.length === 0 ? (
        <div className="p-12 text-center flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={SUNK}>
            <Wallet className="w-6 h-6 text-slate-600" />
          </div>
          <p className="text-slate-300 text-sm font-medium">ไม่มีข้อมูลในช่วงนี้</p>
          <p className="text-slate-600 text-xs">ลองปรับช่วงเวลา</p>
        </div>
      ) : (
        <>
          {/* Totals */}
          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <StatTile label="ยอดรวมทุกกระเป๋า" value={totalBalance} color={totalBalance < 0 ? '#f87171' : '#e2e8f0'} icon={<Wallet className="w-3 h-3 text-slate-500" />} />
              <StatTile label="รับจริงรวม" value={totals.realIncome} color="#34d399" icon={<ArrowDownLeft className="w-3 h-3 text-emerald-400" />} />
              <StatTile label="จ่ายจริงรวม" value={totals.realExpense} color="#f87171" icon={<ArrowUpRight className="w-3 h-3 text-red-400" />} />
              <StatTile label="สุทธิรวม" value={totals.net} color={totals.net >= 0 ? '#34d399' : '#f87171'} signed icon={<BarChart3 className="w-3 h-3 text-slate-500" />} />
            </div>
          )}

          {/* Reconcile status */}
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
          ) : (
            <div className="rounded-xl px-4 py-2.5 flex items-center gap-2 text-emerald-400 text-sm" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
              <CheckCircle2 className="w-4 h-4" /> ยอดทุกกระเป๋าตรงกัน — ไม่มีความผิดปกติ
            </div>
          )}

          {/* Wallet cards */}
          <div className="grid gap-4 lg:grid-cols-2">
            {wallets.map(w => <WalletCard key={w.id} w={w} />)}
          </div>
        </>
      )}
    </div>
  )
}
