import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import MerchantModal from '../components/MerchantModal'
import MergeSuggestions from '../components/MergeSuggestions'
import DocBadge from '../components/DocBadge'
import { BUSINESS_TYPES } from '../merchantMeta'
import { Search, Store, Loader2, Plus, ChevronRight, EyeOff } from 'lucide-react'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const SUNK = { background: '#0d1120', border: '1px solid #1f2937' }
const PAGE = 100

// แท็บแทนแถวชิป 11 อัน — ชิปหมวดธุรกิจใช้ไม่ได้จริงเพราะ 353 จาก 354 ร้านไม่ระบุหมวด
// เกณฑ์ "ประจำ" อิงการใช้งานจริง (เจอตั้งแต่ 5 ครั้ง) ไม่ใช่ความครบของข้อมูล
// ถ้าอิงความครบ แท็บแรกจะว่างเปล่าเพราะแทบไม่มีร้านไหนกรอกข้อมูลไว้
const TABS = [
  { key: 'regular', label: 'คู่ค้าประจำ', countKey: 'regular', hint: 'เจอตั้งแต่ 5 ครั้งขึ้นไป' },
  { key: 'occasional', label: 'ใช้นาน ๆ ครั้ง', countKey: 'occasional', hint: 'เจอไม่ถึง 5 ครั้ง — ส่วนใหญ่เป็นชื่อที่ระบบเดามาจากสลิป' },
  { key: 'hidden', label: 'ซ่อนแล้ว', countKey: 'hidden', hint: 'ไม่โผล่ตอนแจ้งบิล แต่ยังอ้างอิงย้อนหลังได้' },
]

const SORTS = [
  { key: 'used', label: 'ใช้บ่อยสุด' },
  { key: 'recent', label: 'ล่าสุด' },
  { key: 'name', label: 'ชื่อ ก–ฮ' },
]

// รวมสถานะข้อมูลเป็นป้ายเดียว — ของเดิมเขียน "ยังไม่ระบุหมวดธุรกิจ" ซ้ำทุกแถว
// ซึ่งกินที่ 353 บรรทัดโดยไม่บอกอะไรที่ต่างกันเลย
function completeness(m) {
  const missing = []
  if (!m.businessType) missing.push('หมวด')
  if (!m.docType) missing.push('เอกสาร')
  if (!m.bankAccountNo) missing.push('บัญชี')
  return missing
}

export default function Merchants() {
  const [merchants, setMerchants] = useState([])
  const [counts, setCounts] = useState(null)
  const [cats, setCats] = useState([])
  const [wallets, setWallets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [adding, setAdding] = useState(false)
  const [tab, setTab] = useState('regular')
  const [sort, setSort] = useState('used')
  const [page, setPage] = useState(0)
  const [picked, setPicked] = useState([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(t)
  }, [search])

  // ค้นหาแล้วให้ข้ามแท็บ — คนค้นหาต้องการเจอร้าน ไม่ใช่เจอแท็บที่ถูก
  const searching = debounced.trim().length > 0

  const load = useCallback(() => {
    const opts = searching
      ? { includeInactive: true }
      : { scope: tab === 'hidden' ? '' : tab, includeInactive: tab === 'hidden', sort, limit: PAGE, offset: page * PAGE }
    return Promise.all([api.merchants(debounced, opts), api.categories(), api.wallets()])
      .then(([md, cd, wd]) => {
        const list = md.vendors || []
        setMerchants(tab === 'hidden' && !searching ? list.filter(m => m.isActive === false) : list)
        setCounts(md.counts || null)
        setCats(cd.categories || [])
        setWallets(wd.wallets || [])
        setErr('')
      })
      .catch(e => setErr(e.message || 'โหลดรายชื่อไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [debounced, searching, tab, sort, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(0); setPicked([]) }, [tab, sort, debounced])

  const toggle = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const bulk = async (body, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return
    setBulkBusy(true); setErr('')
    try {
      await api.bulkUpdateVendors({ ids: picked, ...body })
      setPicked([])
      await load()
    } catch (e) { setErr(e.message || 'แก้ไม่สำเร็จ') } finally { setBulkBusy(false) }
  }

  const fmtDate = (s) => s ? new Date(s).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' }) : '-'
  const tabCount = (t) => counts ? counts[t.countKey] : null
  const activeTab = TABS.find(t => t.key === tab)

  return (
    <div className="merchants-page p-4 sm:p-5 space-y-4">
      <style>{`
        .merchants-page a:focus-visible, .merchants-page button:focus-visible, .merchants-page input:focus-visible, .merchants-page select:focus-visible {
          outline: 2px solid rgba(16,185,129,0.55); outline-offset: 2px; border-radius: 0.5rem;
        }
        @media (prefers-reduced-motion: reduce) {
          .merchants-page *, .merchants-page *::before, .merchants-page *::after {
            animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-900/30"
          style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
          <Store className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-white leading-tight">ร้านค้า / ซัพพลายเออร์</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {counts ? <>ทั้งหมด <span className="tabular-nums">{counts.total}</span> ร้าน · ใช้เติมข้อมูลอัตโนมัติตอนออกบิล</> : 'ทะเบียนคู่ค้า'}
          </p>
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" /><span className="hidden sm:inline">เพิ่มร้านค้า</span>
        </button>
      </div>

      <MergeSuggestions onMerged={load} />

      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหา ชื่อร้าน / เลขผู้เสียภาษี / เลขบัญชี / เบอร์โทร…" aria-label="ค้นหาร้านค้า"
          className="w-full rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 border border-slate-700 focus:outline-none focus:border-emerald-500"
          style={{ background: '#0d1120' }} />
      </div>

      {!searching && (
        <div>
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} role="tab" aria-selected={tab === t.key}
                className="text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap"
                style={{
                  background: tab === t.key ? 'rgba(16,185,129,0.12)' : '#0d1120',
                  borderColor: tab === t.key ? 'rgba(16,185,129,0.4)' : '#1f2937',
                  color: tab === t.key ? '#34d399' : '#94a3b8',
                  fontWeight: tab === t.key ? 600 : 400,
                }}>
                {t.label}{tabCount(t) != null && <span className="tabular-nums"> {tabCount(t)}</span>}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-xs text-slate-600">เรียง</span>
              <select value={sort} onChange={e => setSort(e.target.value)} aria-label="เรียงลำดับ"
                className="text-xs rounded-lg px-2 py-1.5 text-slate-300 border border-slate-700" style={{ background: '#0d1120' }}>
                {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>
          {activeTab?.hint && <p className="text-[11px] text-slate-600 mt-1.5">{activeTab.hint}</p>}
        </div>
      )}

      {picked.length > 0 && (
        <div className="rounded-xl p-3 flex items-center gap-2 flex-wrap" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}>
          <span className="text-sm text-slate-200">เลือกไว้ <b className="tabular-nums">{picked.length}</b> ร้าน</span>
          <select disabled={bulkBusy} defaultValue="" aria-label="ตั้งหมวดธุรกิจ"
            onChange={e => { if (e.target.value) { bulk({ businessType: e.target.value }); e.target.value = '' } }}
            className="text-xs rounded-lg px-2 py-1.5 text-slate-300 border border-slate-600" style={{ background: '#0d1120' }}>
            <option value="">ตั้งหมวดธุรกิจ…</option>
            {BUSINESS_TYPES.map(b => <option key={b.value} value={b.value}>{b.value}</option>)}
          </select>
          <button disabled={bulkBusy} onClick={() => bulk({ isActive: false }, `ซ่อน ${picked.length} ร้าน?\n\nจะไม่โผล่ตอนแจ้งบิล แต่บิลเก่ายังอ้างอิงได้ตามเดิม`)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 disabled:opacity-50">ซ่อน</button>
          {tab === 'hidden' && (
            <button disabled={bulkBusy} onClick={() => bulk({ isActive: true })}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 disabled:opacity-50">เอากลับมาใช้</button>
          )}
          <button onClick={() => setPicked([])} className="text-xs text-slate-500 ml-auto">ยกเลิกที่เลือก</button>
        </div>
      )}

      {err && <p className="text-sm text-red-400" role="alert">{err}</p>}

      <div className="rounded-xl overflow-hidden" style={CARD}>
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-5 h-5 text-emerald-500 animate-spin mx-auto" /></div>
        ) : merchants.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-1" style={SUNK}>
              <Store className="w-6 h-6 text-slate-600" />
            </div>
            <p className="text-slate-300 text-sm font-medium">
              {searching ? 'ไม่พบร้านค้าที่ค้นหา' : 'ยังไม่มีร้านในกลุ่มนี้'}
            </p>
            {searching && (
              <button onClick={() => setAdding(true)} className="text-emerald-400 hover:text-emerald-300 text-sm font-medium mt-1">
                + เพิ่มร้านใหม่ &quot;{debounced}&quot;
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#1a2035' }}>
            {merchants.map(m => {
              const missing = completeness(m)
              return (
                <div key={m.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.02] transition-colors">
                  <input type="checkbox" checked={picked.includes(m.id)} onChange={() => toggle(m.id)}
                    aria-label={`เลือก ${m.vendorName}`} className="flex-shrink-0 accent-emerald-500" />
                  <Link to={`/merchants/${m.id}`} className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className={`text-sm truncate flex-1 ${m.isActive === false ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                      {m.vendorName}
                    </span>
                    {m.docType && <DocBadge docType={m.docType} short />}
                    {missing.length > 0 && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full flex-shrink-0 hidden sm:inline"
                        style={{ background: '#b4530922', color: '#f59e0b' }}>ยังไม่มี{missing.join(' · ')}</span>
                    )}
                    {m.isActive === false && <EyeOff className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />}
                    <span className="text-xs text-slate-400 tabular-nums w-12 text-right flex-shrink-0">{m.occurrenceCount || 0}</span>
                    <span className="text-xs text-slate-600 tabular-nums w-16 text-right flex-shrink-0 hidden sm:inline">{fmtDate(m.lastSeen)}</span>
                    <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* หน้าถัดไป — ของเดิมตัดที่ 200 เงียบ ๆ ทั้งที่มี 354 ร้าน */}
      {!loading && !searching && (merchants.length === PAGE || page > 0) && (
        <div className="flex items-center justify-between">
          <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 disabled:opacity-30">ก่อนหน้า</button>
          <span className="text-xs text-slate-600 tabular-nums">
            {page * PAGE + 1}–{page * PAGE + merchants.length}
            {counts && activeTab && <> จาก {counts[activeTab.countKey]}</>}
          </span>
          <button disabled={merchants.length < PAGE} onClick={() => setPage(p => p + 1)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 disabled:opacity-30">ถัดไป</button>
        </div>
      )}

      {adding && <MerchantModal merchant={null} cats={cats} wallets={wallets} onClose={() => setAdding(false)} onDone={load} />}
    </div>
  )
}
