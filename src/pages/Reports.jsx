import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { thb, ymd, date as formatDate } from '../fmt'
import { BarChart3, ArrowDownLeft, ArrowUpRight, AlertTriangle, CheckCircle2, Loader2, Wallet, PieChart, ChevronDown, ReceiptText, ArrowRightLeft, RotateCcw } from 'lucide-react'

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

// One wallet: summary + expense-by-category breakdown bars + lazy-loaded transactions
function WalletCard({ w, reportParams }) {
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [transactionsOpen, setTransactionsOpen] = useState(false)
  const [transactions, setTransactions] = useState(null)
  const [transactionTotal, setTransactionTotal] = useState(w.count || 0)
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [transactionsError, setTransactionsError] = useState('')
  const [allTransactionsOpen, setAllTransactionsOpen] = useState(false)
  const cats = w.categories || []
  const maxCat = cats.reduce((mx, c) => Math.max(mx, c.total), 0) || 1
  const shown = categoriesOpen ? cats : cats.slice(0, 4)
  const hasExpense = cats.length > 0
  const visibleTransactions = allTransactionsOpen ? (transactions || []) : (transactions || []).slice(0, 5)

  async function loadTransactions() {
    setTransactionsLoading(true)
    setTransactionsError('')
    try {
      const result = await api.transactions({ ...reportParams, walletId: w.id, limit: 1000 })
      setTransactions(result.transactions || [])
      setTransactionTotal(Number(result.total) || 0)
    } catch (error) {
      console.error(error)
      setTransactionsError('โหลดรายการธุรกรรมไม่สำเร็จ')
    } finally {
      setTransactionsLoading(false)
    }
  }

  function toggleTransactions() {
    const nextOpen = !transactionsOpen
    setTransactionsOpen(nextOpen)
    if (nextOpen && transactions === null && !transactionsLoading) loadTransactions()
  }

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
              <button onClick={() => setCategoriesOpen(o => !o)}
                aria-expanded={categoriesOpen}
                className="flex min-h-8 items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors pt-0.5">
                <ChevronDown className={`w-3 h-3 transition-transform ${categoriesOpen ? 'rotate-180' : ''}`} />
                {categoriesOpen ? 'ย่อ' : `ดูทั้งหมด (${cats.length})`}
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-600 py-1.5">ไม่มีรายจ่ายในช่วงนี้</p>
        )}
      </div>

      {/* Transactions for this wallet */}
      <div style={{ borderTop: '1px solid #1f2937', background: '#0f1626' }}>
        <button type="button" onClick={toggleTransactions} aria-expanded={transactionsOpen}
          className="w-full min-h-12 px-4 sm:px-5 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.025] transition-colors">
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(16,185,129,0.1)' }}>
              <ReceiptText className="w-3.5 h-3.5 text-emerald-400" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-slate-300">รายการธุรกรรม</span>
              <span className="block text-[10px] text-slate-600">เฉพาะกระเป๋านี้ในช่วงที่เลือก</span>
            </span>
          </span>
          <span className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[11px] tabular-nums text-slate-500">{transactionTotal} รายการ</span>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${transactionsOpen ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {transactionsOpen && (
          <div className="px-4 sm:px-5 pb-4" aria-live="polite">
            {transactionsLoading ? (
              <div className="min-h-20 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" /> กำลังโหลดรายการ...
              </div>
            ) : transactionsError ? (
              <div className="min-h-20 rounded-xl flex flex-col items-center justify-center gap-2" style={SUNK}>
                <span className="text-xs text-red-400">{transactionsError}</span>
                <button type="button" onClick={loadTransactions}
                  className="min-h-8 px-3 flex items-center gap-1.5 rounded-lg text-[11px] text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 transition-colors">
                  <RotateCcw className="w-3 h-3" /> ลองใหม่
                </button>
              </div>
            ) : visibleTransactions.length > 0 ? (
              <>
                <div className="rounded-xl overflow-hidden" style={SUNK}>
                  {visibleTransactions.map((tx, index) => {
                    const isIncome = tx.type === 'income'
                    const isTransfer = !!tx.transferPairId
                    const meta = isTransfer
                      ? (isIncome ? 'รับโอนเข้ากระเป๋า' : 'โอนออกจากกระเป๋า')
                      : (tx.subCategoryName || tx.categoryName || 'ไม่ระบุหมวด')
                    const color = isIncome ? '#34d399' : '#f87171'
                    return (
                      <div key={tx.id}
                        className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 ${index > 0 ? 'border-t border-slate-800' : ''}`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: isIncome ? 'rgba(16,185,129,0.1)' : 'rgba(248,113,113,0.1)' }}>
                            {isTransfer
                              ? <ArrowRightLeft className="w-3.5 h-3.5" style={{ color }} />
                              : isIncome
                                ? <ArrowDownLeft className="w-3.5 h-3.5" style={{ color }} />
                                : <ArrowUpRight className="w-3.5 h-3.5" style={{ color }} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-slate-200 truncate" title={tx.name}>{tx.name}</span>
                            <span className="block text-[10px] text-slate-500 truncate">{formatDate(tx.date)} · {meta}</span>
                          </span>
                        </div>
                        <span className="text-right flex-shrink-0">
                          <span className="block text-xs font-semibold tabular-nums" style={{ color }}>
                            {isIncome ? '+' : '−'}{thb(tx.amount)}
                          </span>
                          <span className="block text-[10px] text-slate-600">{isIncome ? 'รับเข้า' : 'จ่ายออก'}</span>
                        </span>
                      </div>
                    )
                  })}
                </div>

                {(transactions || []).length > 5 && (
                  <button type="button" onClick={() => setAllTransactionsOpen(open => !open)}
                    aria-expanded={allTransactionsOpen}
                    className="min-h-8 mt-1.5 flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors">
                    <ChevronDown className={`w-3 h-3 transition-transform ${allTransactionsOpen ? 'rotate-180' : ''}`} />
                    {allTransactionsOpen ? 'ย่อรายการ' : `ดูทั้งหมด (${transactionTotal})`}
                  </button>
                )}
                {transactionTotal > (transactions || []).length && (
                  <p className="mt-1 text-[10px] text-slate-600">แสดง {transactions.length.toLocaleString('th-TH')} รายการล่าสุดจากทั้งหมด {transactionTotal.toLocaleString('th-TH')} รายการ</p>
                )}
              </>
            ) : (
              <div className="min-h-20 rounded-xl flex items-center justify-center text-xs text-slate-600" style={SUNK}>
                ไม่มีรายการธุรกรรมในช่วงนี้
              </div>
            )}
          </div>
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

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial async report fetch; state updates track request lifecycle
  useEffect(() => { load() }, [load])

  const wallets = data?.wallets || []
  const totals = data?.totals
  const mismatches = wallets.filter(w => !w.reconcile.ok)
  const totalBalance = wallets.reduce((s, w) => s + w.currentBalance, 0)
  const headerRange = rangeOf(period, custom)
  const reportParams = {}
  if (headerRange) { reportParams.from = headerRange.from; reportParams.to = headerRange.to }
  if (scope) reportParams.scope = scope
  const reportKey = JSON.stringify(reportParams)
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
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {wallets.map(w => <WalletCard key={`${w.id}:${reportKey}`} w={w} reportParams={reportParams} />)}
          </div>
        </>
      )}
    </div>
  )
}
