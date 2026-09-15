import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Building2, CheckCircle2, ChevronDown, ClipboardList, Download, Loader2, Wallet } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { thb } from '../fmt'
import { collectPaginatedItems } from '../pagination'
import { formatWalletExportDate } from '../walletExportData'
import {
  CASH_BOOK_HALVES,
  beYear,
  buildCashBook,
  collectWalletOptions,
  defaultWalletIds,
  getCashBookFilename,
  getCashBookRange,
  guessGoodsCategoryIds,
} from '../cashBook'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const SUNK = { background: '#0d1120', border: '1px solid #1f2937' }
const PREFS_KEY = 'ft_cashbook_v1'

// ค่าที่จำไว้เป็นแค่การตั้งค่าการแสดงผล — อ่านไม่ได้ก็ต้องเดินต่อได้ ไม่ throw
function readPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function writePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* โหมดส่วนตัว/ปิด storage */ }
}

function taxYears(now = new Date()) {
  const current = now.getFullYear()
  return [current, current - 1, current - 2, current - 3]
}

function Tile({ label, value, color, hint }) {
  return (
    <div className="rounded-xl px-3.5 py-3" style={CARD}>
      <div className="text-[11px] text-slate-500 mb-1">{label}</div>
      <div className="text-base sm:text-lg font-bold tabular-nums leading-tight" style={{ color: color || '#e2e8f0' }}>
        {thb(value)}
      </div>
      {hint && <div className="text-[10px] text-slate-600 mt-0.5">{hint}</div>}
    </div>
  )
}

export default function CashBook() {
  const { user } = useAuth()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [half, setHalf] = useState('full')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [source, setSource] = useState({ wallets: [], categories: [], workspace: null, transactions: [] })
  const [walletIds, setWalletIds] = useState([])
  const [goodsIds, setGoodsIds] = useState([])
  const [operatorName, setOperatorName] = useState('')
  const [showCategories, setShowCategories] = useState(false)
  const [busy, setBusy] = useState('')
  const [exportError, setExportError] = useState('')

  const range = useMemo(() => getCashBookRange(year, half), [year, half])
  const halfMeta = CASH_BOOK_HALVES.find(item => item.value === half) || CASH_BOOK_HALVES[0]

  // ทั้งปีต้องดึงหลายพันแถว (หลายรอบ ๆ ละ 1,000) ถ้าผู้ใช้สลับช่วงระหว่างที่ยังโหลดไม่เสร็จ
  // คำตอบของช่วงเก่าอาจกลับมาทีหลังแล้วทับของใหม่ → ตัวเลขเป็นของอีกช่วง แต่หัวรายงานบอกอีกช่วง
  // ในรายงานภาษีนี่คือความผิดที่มองไม่เห็น จึงนับรอบไว้ แล้วทิ้งคำตอบที่ไม่ใช่รอบล่าสุด
  const loadRequestRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current
    setLoading(true)
    setError('')
    try {
      const period = getCashBookRange(year, half)
      const [walletData, categoryData, workspaceData, { items }] = await Promise.all([
        api.wallets(),
        api.categories(),
        api.workspace(),
        collectPaginatedItems(async ({ limit, offset }) => {
          const data = await api.transactions({ ...period, limit, offset })
          return { items: data.transactions, total: data.total }
        }),
      ])
      if (requestId !== loadRequestRef.current) return
      setSource({
        wallets: walletData.wallets || [],
        categories: categoryData.categories || [],
        workspace: workspaceData.workspace || null,
        transactions: items,
      })
    } catch (err) {
      if (requestId !== loadRequestRef.current) return
      setError(err.message || 'โหลดข้อมูลไม่สำเร็จ')
      setSource({ wallets: [], categories: [], workspace: null, transactions: [] })
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false)
    }
  }, [year, half])

  useEffect(() => {
    // โหลดใหม่ทุกครั้งที่เปลี่ยนช่วงปี — หน้านี้ผูกกับช่วงเวลาโดยตรง
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    return () => { loadRequestRef.current += 1 }
  }, [load])

  const walletOptions = useMemo(
    () => collectWalletOptions(source.wallets, source.transactions),
    [source.wallets, source.transactions],
  )

  const expenseCategories = useMemo(
    () => source.categories.filter(category => category.type !== 'income'),
    [source.categories],
  )

  // ตั้งค่าเริ่มต้นครั้งเดียวหลังข้อมูลชุดแรกมาถึง: ใช้ค่าที่เคยเลือกไว้ ถ้าไม่มีก็เดาให้
  const [primed, setPrimed] = useState(false)
  useEffect(() => {
    if (primed || loading || walletOptions.length === 0) return
    const prefs = readPrefs()
    const knownWallets = new Set(walletOptions.map(option => option.id))
    const savedWallets = (prefs?.walletIds || []).filter(id => knownWallets.has(id))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWalletIds(savedWallets.length > 0 ? savedWallets : defaultWalletIds(walletOptions))
    setGoodsIds(prefs?.goodsCategoryIds || guessGoodsCategoryIds(expenseCategories))
    setOperatorName(prefs?.operatorName || user?.name || '')
    setPrimed(true)
  }, [primed, loading, walletOptions, expenseCategories, user])

  useEffect(() => {
    if (!primed) return
    writePrefs({ walletIds, goodsCategoryIds: goodsIds, operatorName })
  }, [primed, walletIds, goodsIds, operatorName])

  const report = useMemo(
    () => buildCashBook({ transactions: source.transactions, walletIds, goodsCategoryIds: goodsIds }),
    [source.transactions, walletIds, goodsIds],
  )

  const periodLabel = range
    ? `ปีภาษี ${beYear(year)} · ${halfMeta.label} (${formatWalletExportDate(range.from)} – ${formatWalletExportDate(range.to)})`
    : ''

  const header = {
    operatorName,
    shopName: source.workspace?.name || '',
    address: source.workspace?.address || '',
    taxId: source.workspace?.taxId || '',
    taxBranch: source.workspace?.taxBranch || '',
  }

  const ready = !loading && !error && walletIds.length > 0
  const toggle = (list, id) => (list.includes(id) ? list.filter(item => item !== id) : [...list, id])

  const runExport = async (kind) => {
    if (!ready || busy) return
    setBusy(kind)
    setExportError('')
    try {
      const filename = getCashBookFilename(year, half, kind === 'pdf' ? 'pdf' : kind === 'xls' ? 'xls' : 'csv')
      const exporter = await import('../cashBookExport')
      if (kind === 'pdf') await exporter.exportCashBookPdf({ report, header, periodLabel, filename })
      else if (kind === 'xls') exporter.exportCashBookXls({ report, header, periodLabel, filename })
      else exporter.exportCashBookCsv({ report, filename })
    } catch (err) {
      // ล้มตอนสร้างไฟล์ ≠ ล้มตอนโหลดข้อมูล — ตัวเลขบนหน้ายังใช้ได้ อย่าล้างทั้งหน้าทิ้ง
      setExportError(err.message || 'สร้างไฟล์ไม่สำเร็จ')
    } finally {
      setBusy('')
    }
  }

  const vatPct = Math.min(100, Math.max(0, report.vat.pct))
  const vatColor = report.vat.over ? '#f87171' : vatPct >= 80 ? '#fbbf24' : '#34d399'
  const provablePct = report.totals.expense > 0
    ? Math.round((report.warnings.unevidencedExpense.provable / report.totals.expense) * 1000) / 10
    : 100
  const provableColor = provablePct >= 90 ? '#34d399' : provablePct >= 60 ? '#fbbf24' : '#f87171'
  // แสดง 8 หมวดแรกพอ — ที่เหลือมักเป็นเศษที่ไล่เก็บไม่คุ้มแรง แต่ยังบอกยอดรวมไว้ให้เห็น
  const unevidencedTop = report.warnings.unevidencedExpense.byCategory.slice(0, 8)
  const unevidencedRest = report.warnings.unevidencedExpense.byCategory.slice(8)
  const unevidencedMax = unevidencedTop[0]?.amount || 0
  const unevidencedRestAmount = unevidencedRest.reduce((sum, item) => sum + item.amount, 0)

  return (
    <div className="cash-book-page p-4 sm:p-5 space-y-4 max-w-6xl mx-auto">
      <style>{`
        .cash-book-page button:focus-visible, .cash-book-page input:focus-visible, .cash-book-page select:focus-visible {
          outline: 2px solid rgba(16,185,129,0.55); outline-offset: 2px; border-radius: 0.5rem;
        }
        @media (prefers-reduced-motion: reduce) {
          .cash-book-page *, .cash-book-page *::before, .cash-book-page *::after {
            animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-900/30"
          style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
          <ClipboardList className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-white leading-tight">รายงานเงินสดรับ–จ่าย</h2>
          <p className="text-sm text-slate-500">
            ตามแบบแนบท้ายประกาศอธิบดีกรมสรรพากร เกี่ยวกับภาษีเงินได้ (ฉบับที่ 161) · <span className="text-slate-400">{halfMeta.form}</span>
          </p>
        </div>
      </div>

      {/* ช่วงเวลา */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={year} onChange={event => setYear(Number(event.target.value))}
          className="rounded-lg px-3 py-1.5 text-xs text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500"
          style={{ background: '#0d1120' }}>
          {taxYears().map(item => <option key={item} value={item}>ปีภาษี {beYear(item)}</option>)}
        </select>
        {CASH_BOOK_HALVES.map(item => (
          <button key={item.value} type="button" aria-pressed={half === item.value} onClick={() => setHalf(item.value)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${half === item.value ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            style={half === item.value ? {} : { border: '1px solid #2e3349', background: '#0d1120' }}>
            {item.label} · {item.form}
          </button>
        ))}
        <span className="text-[11px] text-slate-600 ml-auto tabular-nums">{periodLabel}</span>
      </div>

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>
      ) : error ? (
        <div className="rounded-xl p-4 flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-300">
            {error}
            <button type="button" onClick={load} className="ml-2 underline text-emerald-400">ลองใหม่</button>
          </div>
        </div>
      ) : (
        <>
          {/* ผู้ประกอบกิจการ */}
          <div className="rounded-2xl p-4 space-y-3" style={CARD}>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Building2 className="w-4 h-4 text-slate-500" /> หัวเอกสาร
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[11px] text-slate-500 block">ชื่อผู้ประกอบกิจการ</span>
                <input id="cash-book-operator" value={operatorName} onChange={event => setOperatorName(event.target.value)}
                  placeholder="ชื่อ-นามสกุลของเจ้าของกิจการ" maxLength={120}
                  className="w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500"
                  style={{ background: '#0d1120' }} />
              </label>
              <div className="space-y-1">
                <span className="text-[11px] text-slate-500 block">สถานประกอบการ · เลขประจำตัวผู้เสียภาษีอากร</span>
                <div className="rounded-lg px-3 py-2 text-sm text-slate-300" style={SUNK}>
                  {header.shopName || 'ยังไม่ได้ตั้งชื่อร้าน'}
                  <span className="text-slate-500"> · </span>
                  {header.taxId
                    ? <span className="tabular-nums">{header.taxId}</span>
                    : <span className="text-amber-400">ยังไม่ได้กรอกเลขผู้เสียภาษี — กรอกที่หน้า “ข้อมูลร้านค้า”</span>}
                </div>
              </div>
            </div>
          </div>

          {/* กระเป๋า */}
          <div className="rounded-2xl p-4 space-y-3" style={CARD}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Wallet className="w-4 h-4 text-slate-500" /> กระเป๋าที่จะรวมในรายงาน
              </div>
              <span className="text-[11px] text-slate-500">เลือกแล้ว {walletIds.length} / {walletOptions.length}</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {walletOptions.map(option => {
                const on = walletIds.includes(option.id)
                return (
                  <button key={option.id} type="button" aria-pressed={on}
                    onClick={() => setWalletIds(list => toggle(list, option.id))}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors"
                    style={on
                      ? { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.5)' }
                      : SUNK}>
                    <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                      style={on ? { background: '#059669' } : { border: '1.5px solid #475569' }}>
                      {on && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-200">{option.name}</span>
                    <span className="text-[10px] text-slate-500 flex-shrink-0">
                      {option.isActive ? (option.scope === 'business' ? 'ธุรกิจ' : option.scope === 'personal' ? 'ส่วนตัว' : '—') : 'ปิดใช้งานแล้ว'}
                    </span>
                  </button>
                )
              })}
            </div>
            {walletIds.length === 0 && (
              <p className="text-xs text-amber-400">เลือกอย่างน้อย 1 กระเป๋าก่อนถึงจะออกไฟล์ได้</p>
            )}
          </div>

          {/* หมวดที่นับเป็นซื้อสินค้า */}
          <div className="rounded-2xl p-4 space-y-3" style={CARD}>
            <button type="button" aria-expanded={showCategories} onClick={() => setShowCategories(open => !open)}
              className="w-full flex items-center justify-between gap-2 text-left">
              <div className="min-w-0">
                <div className="text-sm text-slate-300">หมวดที่นับเป็น “ซื้อสินค้า”</div>
                <div className="text-[11px] text-slate-500">
                  {goodsIds.length} หมวด · ที่เหลือลงช่อง “ค่าใช้จ่ายอื่นๆ” — แบบ 161 บังคับให้แยกสองช่องนี้
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform ${showCategories ? 'rotate-180' : ''}`} />
            </button>
            {showCategories && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {expenseCategories.map(category => {
                  const on = goodsIds.includes(category.id)
                  return (
                    <button key={category.id} type="button" aria-pressed={on}
                      onClick={() => setGoodsIds(list => toggle(list, category.id))}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors"
                      style={on
                        ? { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.5)' }
                        : SUNK}>
                      <span className="w-3 h-3 rounded-sm flex-shrink-0"
                        style={on ? { background: '#059669' } : { border: '1.5px solid #475569' }} />
                      <span className="truncate text-slate-300">{category.name}</span>
                    </button>
                  )
                })}
                {expenseCategories.length === 0 && <p className="text-xs text-slate-500">ยังไม่มีหมวดรายจ่าย</p>}
              </div>
            )}
          </div>

          {/* คำเตือนก่อนออกไฟล์ */}
          {report.warnings.outside.count > 0 && (
            <div className="rounded-xl p-4 flex items-start gap-2.5" style={{ background: 'rgba(180,83,9,0.10)', border: '1px solid rgba(180,83,9,0.35)' }}>
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm text-slate-300 space-y-1">
                <div>
                  มีรายการของกิจการอยู่ในกระเป๋าที่ยังไม่ได้ติ๊ก{' '}
                  <b className="text-amber-400 tabular-nums">{report.warnings.outside.count} รายการ</b>{' '}
                  รวม <b className="text-amber-400 tabular-nums">{thb(report.warnings.outside.amount)}</b>
                </div>
                <div className="text-[11px] text-slate-500">
                  {report.warnings.outside.wallets.map(item => `${item.name} (${item.count})`).join(' · ')}
                  {' — '}ถ้าไม่รวม รายจ่ายพวกนี้จะไม่ขึ้นในรายงาน และกำไรจะสูงกว่าความจริง
                </div>
              </div>
            </div>
          )}

          {(report.warnings.lateEntry > 0 || report.warnings.pendingEdit > 0 || report.warnings.anomalies > 0) && (
            <div className="rounded-xl px-4 py-3 text-[11px] text-slate-400 flex flex-wrap gap-x-4 gap-y-1" style={SUNK}>
              {report.warnings.lateEntry > 0 && <span>บันทึกช้ากว่า 3 วันทำการ <b className="text-slate-200 tabular-nums">{report.warnings.lateEntry}</b> รายการ</span>}
              {report.warnings.pendingEdit > 0 && <span>รออนุมัติแก้ไข <b className="text-slate-200 tabular-nums">{report.warnings.pendingEdit}</b> รายการ</span>}
              {report.warnings.anomalies > 0 && <span className="text-amber-400">จำนวนเงินผิดปกติ <b className="tabular-nums">{report.warnings.anomalies}</b> รายการ</span>}
            </div>
          )}

          {/* ยอดรวม */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Tile label="รายรับ" value={report.totals.income} color="#34d399" hint={`${report.totals.count.toLocaleString('th-TH')} รายการ`} />
            <Tile label="รายจ่าย — ซื้อสินค้า" value={report.totals.goods} color="#f87171" />
            <Tile label="รายจ่าย — ค่าใช้จ่ายอื่นๆ" value={report.totals.other} color="#f87171" />
            <Tile label="กำไรจากการขาย" value={report.totals.profit} color={report.totals.profit >= 0 ? '#e2e8f0' : '#f87171'} />
          </div>

          {/* รายจ่ายที่พิสูจน์ได้ — ตัวชี้ขาดของการหักตามความจำเป็นและสมควร */}
          <div className="rounded-2xl p-4 space-y-2" style={CARD}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-slate-300">รายจ่ายที่มีหลักฐานพิสูจน์ได้</span>
              <span className="tabular-nums font-semibold" style={{ color: provableColor }}>
                {thb(report.warnings.unevidencedExpense.provable)} / {thb(report.totals.expense)} ({provablePct}%)
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={SUNK}>
              <div className="h-full rounded-full" style={{ width: `${provablePct}%`, background: provableColor }} />
            </div>
            <p className="text-[11px] text-slate-500">
              {report.warnings.unevidencedExpense.count > 0 ? (
                <>
                  ยันไม่ได้ <b className="tabular-nums" style={{ color: provableColor }}>{thb(report.warnings.unevidencedExpense.amount)}</b>
                  {' '}จาก <span className="tabular-nums">{report.warnings.unevidencedExpense.count.toLocaleString('th-TH')}</span> รายการ
                  {' '}({report.warnings.unevidencedExpense.pct}% ของรายจ่าย) — หักตามความจำเป็นและสมควรต้องมีหลักฐานพิสูจน์ได้ ส่วนนี้จึงเสี่ยงถูกตัดออก
                </>
              ) : 'ทุกรายจ่ายในช่วงนี้มีหลักฐานแนบครบ'}
            </p>

            {unevidencedTop.length > 0 && (
              <div className="pt-2 space-y-2">
                <div className="text-[11px] text-slate-500">ยอดที่ยันไม่ได้ กระจุกอยู่หมวดไหน</div>
                {unevidencedTop.map(item => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-slate-300 truncate">{item.name}</span>
                      <span className="tabular-nums text-slate-200 shrink-0">
                        {thb(item.amount)}
                        <span className="text-slate-600"> · {item.count.toLocaleString('th-TH')} รายการ · {item.pct}%</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={SUNK}>
                      <div className="h-full rounded-full"
                        style={{ width: `${unevidencedMax ? (item.amount / unevidencedMax) * 100 : 0}%`, background: 'linear-gradient(90deg,#b45309,#f59e0b)' }} />
                    </div>
                  </div>
                ))}
                {unevidencedRest.length > 0 && (
                  <div className="text-[11px] text-slate-600">
                    และอีก {unevidencedRest.length.toLocaleString('th-TH')} หมวด รวม <span className="tabular-nums">{thb(unevidencedRestAmount)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* เพดาน VAT */}
          <div className="rounded-2xl p-4 space-y-2" style={CARD}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-slate-300">รายรับสะสมเทียบเพดานจดทะเบียน VAT</span>
              <span className="tabular-nums font-semibold" style={{ color: vatColor }}>
                {thb(report.vat.base)} / {thb(report.vat.threshold)} ({report.vat.pct}%)
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={SUNK}>
              <div className="h-full rounded-full" style={{ width: `${vatPct}%`, background: vatColor }} />
            </div>
            <p className="text-[11px] text-slate-500">
              {report.vat.over
                ? 'เกินเพดานแล้ว — ต้องยื่นคำขอจดทะเบียนภาษีมูลค่าเพิ่มภายใน 30 วันนับแต่วันที่รายรับเกิน และรายงานตามแบบ 161 จะไม่ใช่แบบที่ใช้อีกต่อไป'
                : 'นับเฉพาะกระเป๋าที่ติ๊กไว้ด้านบน'}
              {report.vat.excludedRefunds > 0 && ` · ไม่นับเงินคืนจากคู่ค้า ${thb(report.vat.excludedRefunds)}`}
            </p>
          </div>

          {/* สรุปรายเดือน */}
          <div className="rounded-2xl overflow-hidden" style={CARD}>
            <div className="px-4 py-3 text-sm text-slate-300 border-b" style={{ borderColor: '#1f2937' }}>สรุปรายเดือน</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left font-medium px-4 py-2">เดือน</th>
                    <th className="text-right font-medium px-4 py-2">รายรับ</th>
                    <th className="text-right font-medium px-4 py-2">ซื้อสินค้า</th>
                    <th className="text-right font-medium px-4 py-2">ค่าใช้จ่ายอื่นๆ</th>
                    <th className="text-right font-medium px-4 py-2">รายการ</th>
                  </tr>
                </thead>
                <tbody>
                  {report.months.map(month => (
                    <tr key={month.key} className="border-t" style={{ borderColor: '#1f2937' }}>
                      <td className="px-4 py-2 text-slate-300">{month.label}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-emerald-400">{thb(month.income)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-red-400">{thb(month.goods)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-red-400">{thb(month.other)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">{month.rows.length.toLocaleString('th-TH')}</td>
                    </tr>
                  ))}
                  {report.months.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">ไม่มีรายการในช่วงที่เลือก</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ดาวน์โหลด */}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => runExport('pdf')} disabled={!ready || Boolean(busy)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {busy === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              PDF ตามแบบสรรพากร
            </button>
            <button type="button" onClick={() => runExport('xls')} disabled={!ready || Boolean(busy)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-emerald-400 disabled:opacity-40"
              style={{ border: '1px solid rgba(16,185,129,0.5)' }}>
              {busy === 'xls' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Excel
            </button>
            <button type="button" onClick={() => runExport('csv')} disabled={!ready || Boolean(busy)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-slate-300 disabled:opacity-40"
              style={{ border: '1px solid #2e3349' }}>
              {busy === 'csv' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              CSV
            </button>
          </div>

          {exportError && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {exportError}
            </p>
          )}

          <p className="text-[11px] text-slate-600">
            ไฟล์ทั้งหมดสร้างในเครื่องนี้ ไม่มีการส่งข้อมูลออก · ก่อนใช้ยื่นจริง ให้ผู้ทำบัญชีตรวจอีกรอบ
          </p>
        </>
      )}
    </div>
  )
}
