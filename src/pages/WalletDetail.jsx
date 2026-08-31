import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { thb } from '../fmt'
import {
  filterWalletTransactions,
  getWalletPeriodRange,
  isPostedWalletActivity,
  summarizeWalletTransactions,
  WALLET_DETAIL_PAGE_SIZE,
  walletTransactionCategory,
  walletTransactionRecipient,
} from '../walletDetail'
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Wallet,
  X,
} from 'lucide-react'
import PaginationBar from '../components/PaginationBar'
import { collectPaginatedItems, getPagination } from '../pagination'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const PERIODS = [
  { value: 'thisMonth', label: 'เดือนนี้' },
  { value: 'lastMonth', label: 'เดือนที่แล้ว' },
  { value: 'all', label: 'ทั้งหมด' },
]
const TYPE_LABELS = { cash: 'เงินสด', bank: 'บัญชีธนาคาร', credit: 'บัตรเครดิต' }
const WALLET_PAGE_SIZE_OPTIONS = [5, 10, 25, 50]

async function fetchAllWalletTransactions(params) {
  const { items } = await collectPaginatedItems(async ({ limit, offset }) => {
    const data = await api.transactions({ ...params, limit, offset })
    return { items: data.transactions, total: data.total }
  })
  return items
}

function formatThaiDate(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${value}T12:00:00`))
}

function SummaryCard({ label, value, icon: Icon, tone = 'neutral', signed = false }) {
  const toneClasses = {
    neutral: 'bg-blue-500/10 text-blue-400',
    expense: 'bg-red-400/10 text-red-400',
    income: 'bg-emerald-400/10 text-emerald-400',
    negative: 'bg-red-400/10 text-red-400',
    positive: 'bg-emerald-400/10 text-emerald-400',
  }
  const valueClass = tone === 'negative'
    ? 'text-red-400'
    : tone === 'positive'
      ? 'text-emerald-400'
      : 'text-white'
  const prefix = signed && value > 0 ? '+' : ''

  return (
    <article className="flex min-h-28 items-center gap-4 rounded-xl p-4 sm:p-5" style={CARD}>
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400 sm:text-sm">{label}</p>
        <p className={`mt-1 truncate text-xl font-bold tabular-nums 2xl:text-2xl ${valueClass}`} title={`${prefix}${thb(value)}`}>
          {prefix}{thb(value)}
        </p>
      </div>
    </article>
  )
}

function TransactionAmount({ transaction }) {
  const expense = transaction.type === 'expense'
  return (
    <span className={`font-bold tabular-nums ${expense ? 'text-red-400' : 'text-emerald-400'}`}>
      {expense ? '-' : '+'}{thb(transaction.amount)}
    </span>
  )
}

export default function WalletDetail() {
  const { walletId } = useParams()
  const [wallet, setWallet] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [period, setPeriod] = useState('thisMonth')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [expenseOnly, setExpenseOnly] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(WALLET_DETAIL_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const transactionsRef = useRef(null)

  const changePage = nextPage => {
    setPage(nextPage)
    transactionsRef.current?.scrollIntoView({ block: 'start' })
  }

  const changePageSize = nextPageSize => {
    setPageSize(nextPageSize)
    setPage(1)
    transactionsRef.current?.scrollIntoView({ block: 'start' })
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const range = getWalletPeriodRange(period)
      const params = { walletId }
      if (range) Object.assign(params, range)

      const [walletData, walletTransactions] = await Promise.all([
        api.wallets(),
        fetchAllWalletTransactions(params),
      ])
      const selectedWallet = (walletData.wallets || []).find(item => item.id === walletId)
      if (!selectedWallet) throw new Error('ไม่พบกระเป๋าเงินนี้')

      setWallet(selectedWallet)
      setTransactions(walletTransactions)
    } catch (err) {
      setError(err.message || 'โหลดข้อมูลกระเป๋าไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [period, walletId])

  // The API-backed load intentionally synchronizes the page with its route and period.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const summary = useMemo(() => summarizeWalletTransactions(transactions), [transactions])
  const categoryOptions = useMemo(() => {
    const options = new Map()
    transactions.filter(isPostedWalletActivity).forEach(transaction => {
      const id = transaction.subCategoryId || transaction.categoryId
      if (id) options.set(id, walletTransactionCategory(transaction))
    })
    return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1], 'th'))
  }, [transactions])
  const filteredTransactions = useMemo(
    () => filterWalletTransactions(transactions, { search, categoryId, expenseOnly }),
    [transactions, search, categoryId, expenseOnly],
  )
  const pagination = getPagination({ total: filteredTransactions.length, page, pageSize })
  const visibleTransactions = filteredTransactions.slice(
    pagination.offset,
    pagination.offset + pagination.pageSize,
  )
  const periodLabel = PERIODS.find(item => item.value === period)?.label || 'ช่วงนี้'
  const scopeLabel = wallet?.scope === 'business' ? 'ธุรกิจ' : 'ส่วนตัว'
  const balanceTone = Number(wallet?.currentBalance || 0) < 0 ? 'negative' : 'neutral'
  const netTone = summary.net < 0 ? 'negative' : 'positive'

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-500" /> กำลังโหลดรายละเอียดกระเป๋า...
      </div>
    )
  }

  if (error || !wallet) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-5 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-400/10 text-red-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">เปิดรายละเอียดกระเป๋าไม่ได้</h1>
          <p className="mt-1 text-sm text-slate-500">{error}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/wallets" className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-600 hover:text-white">
            กลับหน้ากระเป๋า
          </Link>
          <button type="button" onClick={load} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
            <RefreshCw className="h-4 w-4" /> ลองใหม่
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="wallet-detail-page mx-auto max-w-[1480px] space-y-6 px-4 pb-24 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10">
      <style>{`
        .wallet-detail-page button:focus-visible,
        .wallet-detail-page a:focus-visible,
        .wallet-detail-page input:focus-visible,
        .wallet-detail-page select:focus-visible {
          outline: 2px solid rgba(16,185,129,0.65);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .wallet-detail-page *, .wallet-detail-page *::before, .wallet-detail-page *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <nav aria-label="เส้นทางหน้าปัจจุบัน" className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/wallets" className="flex items-center gap-2 rounded-lg py-1 pr-1 transition-colors hover:text-emerald-400">
          <ArrowLeft className="h-4 w-4" /> กระเป๋าเงิน
        </Link>
        <span aria-hidden="true">/</span>
        <span className="max-w-[55vw] truncate text-slate-400">{wallet.name}</span>
      </nav>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 flex-shrink-0 rounded-full" style={{ backgroundColor: wallet.color || '#10b981' }} />
            <h1 className="truncate text-2xl font-bold text-white sm:text-3xl">{wallet.name}</h1>
          </div>
          <p className="mt-1.5 pl-7 text-sm text-slate-500 sm:text-base">{scopeLabel} · {TYPE_LABELS[wallet.type] || wallet.type}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/wallets?transferFrom=${encodeURIComponent(wallet.id)}`}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#161b2e] px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-600 hover:text-white">
            <ArrowRightLeft className="h-4 w-4" /> โอนเงิน
          </Link>
          <Link to={`/transactions?walletId=${encodeURIComponent(wallet.id)}&new=1`}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500">
            <Plus className="h-4 w-4" /> เพิ่มรายการ
          </Link>
        </div>
      </header>

      <section aria-label={`สรุปกระเป๋า ${wallet.name}`} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="ยอดคงเหลือปัจจุบัน" value={Number(wallet.currentBalance || 0)} icon={wallet.type === 'credit' ? CreditCard : Wallet} tone={balanceTone} />
        <SummaryCard label={`ค่าใช้จ่าย${periodLabel}`} value={summary.expense} icon={ArrowDown} tone="expense" />
        <SummaryCard label={`รายรับ${periodLabel}`} value={summary.income} icon={ArrowUp} tone="income" />
        <SummaryCard label={`สุทธิ${periodLabel}`} value={summary.net} icon={Activity} tone={netTone} signed />
      </section>

      <section ref={transactionsRef} className="scroll-mt-20 overflow-hidden rounded-xl md:scroll-mt-4" style={CARD} aria-labelledby="wallet-expense-title">
        <div className="border-b border-slate-800 px-4 py-5 sm:px-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="wallet-expense-title" className="text-lg font-bold text-white sm:text-xl">
                {expenseOnly ? 'รายการค่าใช้จ่ายของกระเป๋านี้' : 'รายการธุรกรรมของกระเป๋านี้'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">ไม่นับรายการโอนเงินภายในและการจ่ายบัตรเครดิตเป็นรายรับหรือรายจ่าย</p>
            </div>
            <p className="text-xs text-slate-500">{filteredTransactions.length.toLocaleString('th-TH')} รายการ</p>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-[0.8fr_1.15fr_1.05fr_auto]">
            <label className="relative block">
              <span className="sr-only">ช่วงเวลา</span>
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <select value={period} onChange={event => { setPeriod(event.target.value); setPage(1) }}
                className="h-11 w-full appearance-none rounded-lg border border-slate-700 bg-[#0d1120] pl-10 pr-8 text-sm text-slate-200 transition-colors hover:border-slate-600">
                {PERIODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="relative block">
              <span className="sr-only">ค้นหารายการ</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} placeholder="ค้นหารายการ"
                className="h-11 w-full rounded-lg border border-slate-700 bg-[#0d1120] pl-10 pr-3 text-sm text-slate-200 placeholder:text-slate-600 hover:border-slate-600" />
            </label>
            <label className="relative block">
              <span className="sr-only">หมวดหมู่</span>
              <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <select value={categoryId} onChange={event => { setCategoryId(event.target.value); setPage(1) }}
                className="h-11 w-full appearance-none rounded-lg border border-slate-700 bg-[#0d1120] pl-10 pr-8 text-sm text-slate-200 transition-colors hover:border-slate-600">
                <option value="">ทุกหมวดหมู่</option>
                {categoryOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <button type="button" aria-pressed={expenseOnly} onClick={() => { setExpenseOnly(value => !value); setPage(1) }}
              className={`flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors ${expenseOnly ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-[#0d1120] text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}>
              <Filter className="h-4 w-4" />
              <span className="whitespace-nowrap">{expenseOnly ? 'แสดงเฉพาะค่าใช้จ่าย' : 'กรองเฉพาะค่าใช้จ่าย'}</span>
              {expenseOnly && <X className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </div>

        <PaginationBar
          total={filteredTransactions.length}
          page={pagination.page}
          pageSize={pagination.pageSize}
          pageSizeOptions={WALLET_PAGE_SIZE_OPTIONS}
          onPageChange={changePage}
          onPageSizeChange={changePageSize}
          ariaLabel="แบ่งหน้ารายการกระเป๋าด้านบน"
          announce
          className="border-b border-slate-800 bg-white/[0.01]"
        />

        {visibleTransactions.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-500">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-300">ไม่พบรายการในเงื่อนไขนี้</p>
              <p className="mt-1 text-xs text-slate-600">ลองเปลี่ยนช่วงเวลา คำค้นหา หรือหมวดหมู่</p>
            </div>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] table-fixed text-left">
                <thead className="bg-[#111827]/70 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="w-[14%] px-5 py-3">วันที่</th>
                    <th className="w-[22%] px-4 py-3">รายการ</th>
                    <th className="w-[18%] px-4 py-3">หมวดหมู่</th>
                    <th className="w-[20%] px-4 py-3">ผู้รับ/ร้านค้า</th>
                    <th className="w-[14%] px-4 py-3 text-right">จำนวนเงิน</th>
                    <th className="w-[12%] px-5 py-3 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {visibleTransactions.map(transaction => (
                    <tr key={transaction.id} className="text-sm transition-colors hover:bg-white/[0.025]">
                      <td className="px-5 py-4 text-slate-400">{formatThaiDate(transaction.date)}</td>
                      <td className="px-4 py-4 font-medium text-slate-200"><span className="block truncate" title={transaction.name}>{transaction.name}</span></td>
                      <td className="px-4 py-4 text-slate-400">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: transaction.subCategoryColor || transaction.categoryColor || '#64748b' }} />
                          <span className="truncate" title={walletTransactionCategory(transaction)}>{walletTransactionCategory(transaction)}</span>
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-400"><span className="block truncate" title={walletTransactionRecipient(transaction)}>{walletTransactionRecipient(transaction)}</span></td>
                      <td className="px-4 py-4 text-right"><TransactionAmount transaction={transaction} /></td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> สำเร็จ
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-800 md:hidden">
              {visibleTransactions.map(transaction => (
                <article key={transaction.id} className="space-y-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-slate-200">{transaction.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">{formatThaiDate(transaction.date)}</p>
                    </div>
                    <TransactionAmount transaction={transaction} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: transaction.subCategoryColor || transaction.categoryColor || '#64748b' }} />
                      <span className="truncate">{walletTransactionCategory(transaction)} · {walletTransactionRecipient(transaction)}</span>
                    </span>
                    <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> สำเร็จ</span>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        <PaginationBar
          total={filteredTransactions.length}
          page={pagination.page}
          pageSize={pagination.pageSize}
          pageSizeOptions={WALLET_PAGE_SIZE_OPTIONS}
          onPageChange={changePage}
          onPageSizeChange={changePageSize}
          ariaLabel="แบ่งหน้ารายการกระเป๋าด้านล่าง"
          className="border-t border-slate-800 bg-white/[0.01]"
        />
      </section>
    </div>
  )
}
