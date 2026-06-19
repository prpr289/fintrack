import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../api'
import { thb, date } from '../fmt'
import { useWs } from '../useWs'
import { TrendingUp, TrendingDown, Wallet, ChevronDown, Calendar, X, LayoutDashboard } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, ReferenceLine,
} from 'recharts'

function fmt(d) { return d.toISOString().slice(0, 10) }

function rangeOf(key, custom) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const ago = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return d }
  switch (key) {
    case 'today':      return { from: fmt(now), to: fmt(now) }
    case 'yesterday':  return { from: fmt(ago(1)), to: fmt(ago(1)) }
    case '3d':         return { from: fmt(ago(2)), to: fmt(now) }
    case '7d':         return { from: fmt(ago(6)), to: fmt(now) }
    case '15d':        return { from: fmt(ago(14)), to: fmt(now) }
    case 'thisMonth':  return { from: fmt(new Date(y, m, 1)), to: fmt(now) }
    case 'lastMonth': {
      return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) }
    }
    case 'custom': return custom.from && custom.to ? custom : null
    default:       return null
  }
}

function prevRangeOf(key, custom) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const ago = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return d }
  switch (key) {
    case 'today':     return { from: fmt(ago(1)), to: fmt(ago(1)) }
    case 'yesterday': return { from: fmt(ago(2)), to: fmt(ago(2)) }
    case '3d':        return { from: fmt(ago(5)), to: fmt(ago(3)) }
    case '7d':        return { from: fmt(ago(13)), to: fmt(ago(7)) }
    case '15d':       return { from: fmt(ago(29)), to: fmt(ago(15)) }
    case 'thisMonth': return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) }
    case 'lastMonth': return { from: fmt(new Date(y, m - 2, 1)), to: fmt(new Date(y, m - 1, 0)) }
    case 'custom': {
      if (!custom.from || !custom.to) return null
      const from = new Date(custom.from), to = new Date(custom.to)
      const days = Math.round((to - from) / 86400000) + 1
      const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1)
      const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - days + 1)
      return { from: fmt(prevFrom), to: fmt(prevTo) }
    }
    default: return null
  }
}

const PERIODS = [
  { key: 'today',     label: 'วันนี้' },
  { key: 'yesterday', label: 'เมื่อวาน' },
  { key: '3d',        label: '3 วันที่ผ่านมา' },
  { key: '7d',        label: '7 วันที่ผ่านมา' },
  { key: '15d',       label: '15 วันที่ผ่านมา' },
  { key: 'thisMonth', label: 'เดือนนี้' },
  { key: 'lastMonth', label: 'เดือนที่แล้ว' },
  { key: 'custom',    label: 'กำหนดเอง...' },
]

function PeriodPicker({ period, custom, appliedCustom, onChange, onCustomChange, onApplyCustom }) {
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (key) => {
    if (key === 'custom') { setShowCustom(true); setOpen(false) }
    else { onChange(key); setShowCustom(false); setOpen(false) }
  }

  const applyCustom = () => {
    if (custom.from && custom.to) {
      onChange('custom')
      onApplyCustom(custom)
      setShowCustom(false)
    }
  }

  const label = period === 'custom' && appliedCustom.from && appliedCustom.to
    ? `${appliedCustom.from} → ${appliedCustom.to}`
    : PERIODS.find(p => p.key === period)?.label || 'เลือกช่วงเวลา'

  const range = rangeOf(period, appliedCustom)

  return (
    <div className="space-y-2">
      <div ref={ref} className="relative">
        <button onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          style={{ background: '#1e2538', border: '1px solid #2e3349', color: '#e2e8f0' }}>
          <Calendar className="w-4 h-4 text-slate-400" />
          <span>{label}</span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 rounded-xl shadow-2xl z-30 py-1 min-w-[180px]"
            style={{ background: '#1e2538', border: '1px solid #2e3349' }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => select(p.key)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-white/5 ${period === p.key ? 'text-emerald-400 font-semibold' : 'text-slate-300'}`}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {showCustom && (
        <div className="flex flex-col gap-2 p-3 rounded-xl" style={{ background: '#1e2538', border: '1px solid #2e3349' }}>
          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-xs text-slate-500 mb-1">ตั้งแต่วันที่</p>
              <input type="date" value={custom.from}
                onChange={e => onCustomChange({ ...custom, from: e.target.value })}
                className="w-full rounded-lg px-3 py-1.5 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500"
                style={{ background: '#0d1120' }} />
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-500 mb-1">ถึงวันที่</p>
              <input type="date" value={custom.to}
                onChange={e => onCustomChange({ ...custom, to: e.target.value })}
                className="w-full rounded-lg px-3 py-1.5 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500"
                style={{ background: '#0d1120' }} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={applyCustom} disabled={!custom.from || !custom.to}
              className="flex-1 px-4 py-1.5 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-colors">
              ดู
            </button>
            <button onClick={() => setShowCustom(false)} aria-label="ปิด" title="ปิด" className="p-2 text-slate-500 hover:text-slate-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {range && (
        <p className="text-xs text-slate-500">
          ข้อมูลระหว่าง <span className="text-slate-400">{range.from}</span>
          {range.from !== range.to && <> ถึง <span className="text-slate-400">{range.to}</span></>}
        </p>
      )}
    </div>
  )
}

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg p-3 text-sm shadow-xl" style={{ background: '#1e2538', border: '1px solid #2e3349' }}>
      <p className="text-slate-300 font-medium mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: {thb(p.value)}</p>)}
    </div>
  )
}

function pct(curr, prev) {
  if (!prev || prev === 0) return null
  return Math.round(((curr - prev) / Math.abs(prev)) * 100)
}

function StatCard({ icon: Icon, iconBg, iconColor, label, value, valueColor, prevValue }) {
  const change = prevValue !== undefined && prevValue !== null ? pct(
    typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value,
    prevValue
  ) : null

  return (
    <div className="rounded-xl p-5" style={{ background: '#161b2e', border: '1px solid #1f2937' }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: iconBg }}>
          <Icon className="w-5 h-5" style={{ color: iconColor }} />
        </div>
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums" style={{ color: valueColor || '#f1f5f9' }}>{value}</div>
      {change !== null && (
        <div aria-label={`${change >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(change)}%`} className={`text-xs mt-1.5 flex items-center gap-1 ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {change >= 0 ? '↑' : '↓'} {Math.abs(change)}% vs ช่วงก่อน
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [period, setPeriod] = useState('today')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [appliedCustom, setAppliedCustom] = useState({ from: '', to: '' })
  const [wallets, setWallets] = useState([])
  const [txs, setTxs] = useState([])
  const [prevStats, setPrevStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const range = rangeOf(period, appliedCustom)
    const prevRange = prevRangeOf(period, appliedCustom)
    const params = { limit: 1000 }
    if (range) { params.from = range.from; params.to = range.to }

    const fetches = [api.wallets(), api.transactions(params)]
    if (prevRange) {
      fetches.push(api.transactions({ limit: 1000, from: prevRange.from, to: prevRange.to }))
    }

    const [wd, td, prevTd] = await Promise.all(fetches)
    setWallets(wd.wallets || [])
    setTxs(td.transactions || [])

    if (prevTd) {
      const pl = prevTd.transactions || []
      const pi = pl.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      const pe = pl.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
      setPrevStats({ income: pi, expense: pe, net: pi - pe })
    } else {
      setPrevStats(null)
    }
    setLoading(false)
  }, [period, appliedCustom])

  useEffect(() => { load() }, [load])
  const reloadTimer = useRef(null)
  useWs((msg) => {
    if (['tx.created', 'tx.updated', 'tx.deleted', 'wallet.updated'].includes(msg.event)) {
      clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(load, 1500)
    }
  })

  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const net     = income - expense
  const totalBalance = wallets.reduce((s, w) => s + (w.currentBalance || 0), 0)

  const catMap = {}
  txs.forEach(t => {
    const key = t.categoryName || 'ไม่ระบุ'
    if (!catMap[key]) catMap[key] = { name: key, income: 0, expense: 0, total: 0 }
    if (t.type === 'income') catMap[key].income += t.amount
    else catMap[key].expense += t.amount
    catMap[key].total += t.amount
  })
  const top10 = Object.values(catMap).sort((a, b) => b.total - a.total).slice(0, 10)

  const range = rangeOf(period, appliedCustom)
  const dailyData = (() => {
    if (!range) return []
    const start = new Date(range.from), end = new Date(range.to)
    const days = []
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(fmt(d))
    const map = {}
    days.forEach(d => { map[d] = { income: 0, expense: 0 } })
    txs.forEach(t => { if (t.date && map[t.date]) {
      if (t.type === 'income') map[t.date].income += t.amount
      else map[t.date].expense += t.amount
    }})
    return days
      .map(d => ({
        date: d.slice(5),
        รายรับ: map[d].income,
        รายจ่าย: map[d].expense,
        คงเหลือ: map[d].income - map[d].expense,
      }))
      .filter(r => r.รายรับ > 0 || r.รายจ่าย > 0)
  })()

  const recentTxs = [...txs].slice(0, 10)
  const periodLabel = period === 'custom' && appliedCustom.from && appliedCustom.to
    ? `${appliedCustom.from} ถึง ${appliedCustom.to}`
    : PERIODS.find(p => p.key === period)?.label || ''

  return (
    <div className="dash-page p-5 space-y-5">
      <style>{`
        .dash-page button:focus-visible,
        .dash-page input:focus-visible {
          outline: 2px solid rgba(16,185,129,0.55);
          outline-offset: 2px;
          border-radius: 0.5rem;
        }
        @media (prefers-reduced-motion: reduce) {
          .dash-page *, .dash-page *::before, .dash-page *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-900/30"
            style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            <LayoutDashboard className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white leading-tight">ภาพรวม</h2>
            <p className="text-sm text-slate-500">
              รายงาน: <span className="text-slate-300">{periodLabel}</span>
              {loading && <span className="ml-2 inline-block w-3 h-3 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin align-middle" />}
            </p>
          </div>
        </div>
        <PeriodPicker
          period={period} custom={custom} appliedCustom={appliedCustom}
          onChange={setPeriod} onCustomChange={setCustom} onApplyCustom={setAppliedCustom}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Wallet}       iconBg="rgba(59,130,246,0.15)"  iconColor="#60a5fa" label="ยอดรวมทุกกระเป๋า" value={thb(totalBalance)} />
        <StatCard icon={TrendingUp}   iconBg="rgba(16,185,129,0.15)"  iconColor="#34d399" label="รายรับ"  value={`+${thb(income)}`}  valueColor="#34d399" prevValue={prevStats?.income} />
        <StatCard icon={TrendingDown} iconBg="rgba(239,68,68,0.15)"   iconColor="#f87171" label="รายจ่าย" value={`-${thb(expense)}`} valueColor="#f87171" prevValue={prevStats?.expense} />
        <StatCard
          icon={net >= 0 ? TrendingUp : TrendingDown}
          iconBg={net >= 0 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)"}
          iconColor={net >= 0 ? "#34d399" : "#f87171"}
          label="กำไร / ขาดทุน"
          value={`${net >= 0 ? '+' : ''}${thb(net)}`}
          valueColor={net >= 0 ? "#34d399" : "#f87171"}
          prevValue={prevStats?.net}
        />
      </div>

      {dailyData.length > 0 && (
        <div className="rounded-xl p-4 sm:p-5" style={{ background: '#161b2e', border: '1px solid #1f2937' }}>
          <h3 className="text-sm font-semibold text-slate-200 mb-1">รายรับ / รายจ่าย / คงเหลือ แต่ละวัน</h3>
          <p className="text-xs text-slate-500 mb-4">แสดงเฉพาะวันที่มีรายการ</p>
          <div className="h-48 sm:h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={40}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip content={<DarkTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <ReferenceLine y={0} stroke="#374151" />
                <Line type="monotone" dataKey="รายรับ"  stroke="#34d399" strokeWidth={2} dot={dailyData.length <= 14} />
                <Line type="monotone" dataKey="รายจ่าย" stroke="#f87171" strokeWidth={2} dot={dailyData.length <= 14} />
                <Line type="monotone" dataKey="คงเหลือ" stroke="#60a5fa" strokeWidth={2} dot={false} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {top10.length > 0 && (
        <div className="rounded-xl p-4 sm:p-5" style={{ background: '#161b2e', border: '1px solid #1f2937' }}>
          <h3 className="text-sm font-semibold text-slate-200 mb-1">10 หมวดหมู่สูงสุด</h3>
          <p className="text-xs text-slate-500 mb-4">ช่วง: {periodLabel}</p>
          <div style={{ height: Math.max(top10.length * 40, 160) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="income"  name="รายรับ"  stackId="a" fill="#34d399" />
                <Bar dataKey="expense" name="รายจ่าย" stackId="a" fill="#f87171" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {!loading && txs.length === 0 && (
        <div className="rounded-xl p-10 text-center" style={{ background: '#161b2e', border: '1px solid #1f2937' }}>
          <p className="text-slate-500 text-sm">ไม่มีรายการในช่วง <span className="text-slate-400">{periodLabel}</span></p>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-3">กระเป๋าเงิน (ยอดปัจจุบัน)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {wallets.map(w => (
            <div key={w.id} className="rounded-xl p-4 flex items-center gap-3"
              style={{ background: '#161b2e', border: '1px solid #1f2937' }}>
              <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: w.color || '#9CA3AF' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{w.name}</p>
                <p className="text-xs text-slate-500">{w.type} · {w.scope}</p>
              </div>
              <div className={`text-sm font-bold tabular-nums ${(w.currentBalance || 0) < 0 ? 'text-red-400' : 'text-white'}`}>
                {thb(w.currentBalance || 0)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {recentTxs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-3">
            รายการในช่วงนี้ {txs.length > 10 && <span className="text-slate-500 font-normal">(แสดง 10 ล่าสุด จาก {txs.length})</span>}
          </h3>
          <div className="rounded-xl overflow-hidden" style={{ background: '#161b2e', border: '1px solid #1f2937' }}>
            {recentTxs.map((t, i) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
                style={{ borderBottom: i < recentTxs.length - 1 ? '1px solid #1f2937' : 'none' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 font-bold"
                  style={{ background: t.type === 'income' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: t.type === 'income' ? '#34d399' : '#f87171' }}>
                  <span className="sr-only">{t.type === 'income' ? 'รายรับ' : 'รายจ่าย'}</span>
                  <span aria-hidden="true">{t.type === 'income' ? '↑' : '↓'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.categoryName || '-'} · {t.walletName || '-'} · {date(t.date)}</p>
                </div>
                <div className={`text-sm font-semibold flex-shrink-0 tabular-nums ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {t.type === 'income' ? '+' : '-'}{thb(t.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
