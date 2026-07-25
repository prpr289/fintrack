import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { thb, date, ymd } from '../fmt'
import { ArrowLeft, ArrowUp, ArrowDown, ChevronRight, Loader2, Wallet } from 'lucide-react'

// ── Luxe theme tokens (mirror Transactions.jsx) ──
const FONT_SERIF = "'Noto Serif Thai', serif"
const FONT_MONO = "'JetBrains Mono', monospace"
const EMERALD = '#34d399', ROSE = '#fb7185'
const GLASS = {
  background: 'linear-gradient(160deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012))',
  border: '1px solid rgba(255,255,255,0.07)',
  backdropFilter: 'blur(26px) saturate(130%)',
  WebkitBackdropFilter: 'blur(26px) saturate(130%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
}

const PERIODS = [
  { key: 'thisMonth', label: 'เดือนนี้' },
  { key: 'lastMonth', label: 'เดือนที่แล้ว' },
  { key: '7d', label: '7 วัน' },
  { key: '30d', label: '30 วัน' },
  { key: 'all', label: 'ทั้งหมด' },
]
function rangeOf(key) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const ago = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return d }
  switch (key) {
    case 'thisMonth': return { from: ymd(new Date(y, m, 1)), to: ymd(now) }
    case 'lastMonth': return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) }
    case '7d': return { from: ymd(ago(6)), to: ymd(now) }
    case '30d': return { from: ymd(ago(29)), to: ymd(now) }
    default: return null
  }
}

// Group an already-date-sorted tx list into day buckets with a running net.
function groupByDate(list) {
  const groups = []
  const idx = {}
  for (const t of list) {
    const k = t.date
    if (!(k in idx)) { idx[k] = groups.length; groups.push({ key: k, items: [], net: 0 }) }
    const g = groups[idx[k]]
    g.items.push(t)
    g.net += t.type === 'income' ? t.amount : -t.amount
  }
  return groups
}
const signedThb = (type, amount) => (type === 'income' ? '+' : '−') + thb(amount)
const isAuto = (t) => typeof t?.note === 'string' && t.note.startsWith('auto:HROS')
const isAutoTx = (t) => t?.source === 'auto' || isAuto(t)

function AutoBadge() {
  return (
    <span title="ดึงจาก HR OS อัตโนมัติ" className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full flex-none"
      style={{ color: '#a5b4fc', background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.28)' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#818cf8' }} /> ระบบ
    </span>
  )
}

function MiniStat({ label, value, color, signed }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(6,12,20,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-[10.5px] mb-0.5" style={{ color: 'rgba(148,163,184,0.75)' }}>{label}</div>
      <div className="tabular-nums" style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 15, color }}>
        {signed && value > 0 ? '+' : ''}{thb(value)}
      </div>
    </div>
  )
}

function Row({ t }) {
  const dot = t.type === 'income' ? EMERALD : (t.categoryColor || '#7c9fd6')
  return (
    <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontSize: 14, color: '#eaf0f6', fontWeight: 500 }}>{t.name}</span>
          {isAutoTx(t) && <AutoBadge />}
        </div>
        {t.categoryName && (
          <div className="inline-flex items-center gap-1.5 mt-1 max-w-full">
            <span className="flex-none" style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />
            <span className="truncate" style={{ fontSize: 12, color: 'rgba(211,219,229,0.85)' }}>{t.categoryName}</span>
            {t.subCategoryName && (
              <span className="inline-flex items-center gap-1 truncate" style={{ fontSize: 12, color: 'rgba(148,163,184,0.75)' }}>
                <ChevronRight className="w-2.5 h-2.5 flex-none" /> {t.subCategoryName}
              </span>
            )}
          </div>
        )}
        {t.note && !isAuto(t) && <p className="truncate mt-1" style={{ fontSize: 12, color: 'rgba(148,163,184,0.75)' }}>{t.note}</p>}
      </div>
      <span className="flex items-center gap-1 flex-shrink-0 whitespace-nowrap" style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 14, color: t.type === 'income' ? EMERALD : ROSE }}>
        {t.type === 'income' ? <ArrowUp className="w-3 h-3" strokeWidth={2.8} /> : <ArrowDown className="w-3 h-3" strokeWidth={2.8} />}
        {thb(t.amount)}
      </span>
    </div>
  )
}

export default function WalletDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [wallet, setWallet] = useState(null)
  const [txs, setTxs] = useState([])
  const [period, setPeriod] = useState('thisMonth')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const range = rangeOf(period)
    const params = { walletId: id, limit: 1000 }
    if (range) { params.from = range.from; params.to = range.to }
    try {
      const [wd, td] = await Promise.all([api.wallets(), api.transactions(params)])
      const w = (wd.wallets || []).find(x => x.id === id)
      if (!w) { setNotFound(true); setWallet(null); setTxs([]) }
      else { setNotFound(false); setWallet(w); setTxs(td.transactions || []) }
    } catch (e) { console.error(e); setNotFound(true) } finally { setLoading(false) }
  }, [id, period])
  useEffect(() => { load() }, [load])

  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const net = income - expense
  const groups = groupByDate(txs)
  const color = wallet?.color || '#0369A1'
  const periodLabel = PERIODS.find(p => p.key === period)?.label || ''

  return (
    <div className="wd-page relative p-4 sm:p-6" style={{ background: '#06080c', minHeight: '100%', fontFamily: "'Anuphan', sans-serif", color: '#dbe2ea' }}>
      <style>{`
        .wd-page button:focus-visible { outline: 2px solid rgba(16,185,129,0.55); outline-offset: 2px; border-radius: 0.5rem; }
        @media (prefers-reduced-motion: reduce) { .wd-page *, .wd-page *::before, .wd-page *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
      `}</style>

      <div className="pointer-events-none" style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', bottom: -440, left: '8%', width: 820, height: 820, borderRadius: '50%', background: `radial-gradient(circle,${color}12,transparent 60%)`, filter: 'blur(100px)' }} />
        <div style={{ position: 'absolute', top: -320, right: -160, width: 680, height: 680, borderRadius: '50%', background: 'radial-gradient(circle,rgba(30,52,66,0.32),transparent 64%)', filter: 'blur(90px)' }} />
      </div>

      <div className="relative z-10 space-y-4 max-w-4xl mx-auto">
        <button onClick={() => nav(-1)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 transition-colors"
          style={{ fontSize: 12.5, color: 'rgba(148,163,184,0.85)', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <ArrowLeft className="w-4 h-4" /> ย้อนกลับ
        </button>

        {loading ? (
          <div className="p-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: EMERALD }} /></div>
        ) : notFound ? (
          <div className="p-14 text-center flex flex-col items-center gap-2 rounded-2xl" style={GLASS}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Wallet className="w-6 h-6" style={{ color: 'rgba(148,163,184,0.5)' }} />
            </div>
            <p style={{ color: '#d3dbe5', fontSize: 14, fontWeight: 500 }}>ไม่พบกระเป๋านี้</p>
            <p style={{ color: 'rgba(148,163,184,0.7)', fontSize: 12.5 }}>อาจถูกลบ หรือคุณไม่มีสิทธิ์เข้าถึง</p>
          </div>
        ) : (
          <>
            {/* Hero */}
            <div className="relative overflow-hidden rounded-3xl p-5 sm:p-6"
              style={{ background: `linear-gradient(150deg,${color}22,${color}05 60%,rgba(255,255,255,0.012))`, border: `1px solid ${color}3a`, boxShadow: `0 30px 70px -38px ${color}55,inset 0 1px 0 rgba(255,255,255,0.1)` }}>
              <div className="absolute pointer-events-none" style={{ bottom: -90, right: -40, width: 260, height: 260, borderRadius: '50%', background: `radial-gradient(circle,${color}28,transparent 64%)`, filter: 'blur(30px)' }} />
              <div className="relative">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="flex-none" style={{ width: 14, height: 14, borderRadius: '50%', background: color, boxShadow: `0 0 10px ${color}66` }} />
                      <span style={{ fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 600, color: '#f2f7fc' }}>{wallet.name}</span>
                    </div>
                    <div className="flex gap-2 mt-2.5 flex-wrap">
                      <span className="text-xs px-2.5 py-0.5 rounded-full" style={{ color: '#9fb0c2', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>{wallet.type}</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full" style={{ color: '#9fb0c2', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>{wallet.scope === 'business' ? 'ธุรกิจ' : 'ส่วนตัว'}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="uppercase" style={{ fontSize: 11, letterSpacing: '2px', color: 'rgba(148,163,184,0.7)' }}>ยอดปัจจุบัน</div>
                    <div className="tabular-nums" style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 'clamp(1.9rem,6vw,2.4rem)', letterSpacing: '-0.5px', color: (wallet.currentBalance || 0) < 0 ? ROSE : '#eaf3ff', lineHeight: 1.05, marginTop: 4 }}>
                      {thb(wallet.currentBalance || 0)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2.5 mt-5">
                  <MiniStat label={`เงินเข้า · ${periodLabel}`} value={income} color={EMERALD} />
                  <MiniStat label={`เงินออก · ${periodLabel}`} value={expense} color={ROSE} />
                  <MiniStat label={`สุทธิ · ${periodLabel}`} value={net} color={net >= 0 ? EMERALD : ROSE} signed />
                </div>
              </div>
            </div>

            {/* Period control */}
            <div className="flex flex-wrap gap-2">
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)}
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                  style={period === p.key
                    ? { background: '#10b981', color: '#06231a', fontWeight: 500, border: '1px solid rgba(110,231,199,0.4)' }
                    : { color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                  {p.label}
                </button>
              ))}
            </div>

            {/* Ledger */}
            <div className="rounded-3xl overflow-hidden" style={{ ...GLASS, boxShadow: '0 34px 70px -40px rgba(0,0,0,0.9),inset 0 1px 0 rgba(255,255,255,0.06)' }}>
              {txs.length === 0 ? (
                <div className="p-14 text-center flex flex-col items-center gap-2">
                  <p style={{ color: '#d3dbe5', fontSize: 14, fontWeight: 500 }}>ไม่มีรายการในช่วงนี้</p>
                  <p style={{ color: 'rgba(148,163,184,0.7)', fontSize: 12.5 }}>ลองปรับช่วงเวลา</p>
                </div>
              ) : groups.map(g => (
                <div key={g.key}>
                  <div className="flex items-center gap-3 px-4 sm:px-5 py-2.5" style={{ background: 'rgba(255,255,255,0.016)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontFamily: FONT_SERIF, fontSize: 14, color: '#d9e1ea', fontWeight: 600, whiteSpace: 'nowrap' }}>{date(g.key)}</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: 'rgba(148,163,184,0.75)' }}>{g.items.length} รายการ</span>
                    <span className="flex-1" style={{ height: 1, background: 'linear-gradient(90deg,rgba(255,255,255,0.07),transparent)' }} />
                    <span className="uppercase" style={{ fontSize: 10.5, letterSpacing: '1.5px', color: 'rgba(148,163,184,0.45)' }}>สุทธิ</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 500, color: g.net >= 0 ? 'rgba(110,231,199,0.92)' : 'rgba(251,154,168,0.92)', whiteSpace: 'nowrap' }}>{signedThb(g.net >= 0 ? 'income' : 'expense', Math.abs(g.net))}</span>
                  </div>
                  {g.items.map(t => <Row key={t.id} t={t} />)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
