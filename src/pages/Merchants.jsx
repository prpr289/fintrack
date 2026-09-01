import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import MerchantModal from '../components/MerchantModal'
import MergeSuggestions from '../components/MergeSuggestions'
import DocBadge from '../components/DocBadge'
import { BUSINESS_TYPES } from '../merchantMeta'
import { Search, Store, Loader2, Plus, ChevronRight, EyeOff } from 'lucide-react'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const SUNK = { background: '#0d1120', border: '1px solid #1f2937' }
const PAGE = 100

// แท็บแทนแถวชิป 11 อัน — ชิปหมวดธุรกิจใช้ไม่ได้จริงเพราะแทบทุกร้านไม่ระบุหมวด
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

// ความครบของข้อมูลเป็นจุดสามจุด ไม่ใช่ข้อความ
// รอบก่อนใช้ป้ายสีส้มเขียนว่า "ยังไม่มีหมวด · เอกสาร · บัญชี" ซึ่งโผล่แทบทุกแถว
// กลายเป็นเสียงรบกวนที่ดังกว่าข้อความเดิมที่ตั้งใจจะแก้ — สามจุดอ่านออกในพริบตา
// และไม่แย่งสายตาไปจากชื่อร้าน ซึ่งเป็นสิ่งที่คนมาหาจริง ๆ
const DATA_SLOTS = [
  { key: 'businessType', label: 'หมวดธุรกิจ' },
  { key: 'docType', label: 'ชนิดเอกสาร' },
  { key: 'bankAccountNo', label: 'เลขบัญชี' },
]

function DataDots({ m }) {
  const filled = DATA_SLOTS.filter(s => m[s.key])
  const title = filled.length === DATA_SLOTS.length
    ? 'ข้อมูลครบ'
    : 'ยังไม่มี: ' + DATA_SLOTS.filter(s => !m[s.key]).map(s => s.label).join(' · ')
  return (
    <span className="flex items-center gap-1 flex-shrink-0" title={title} aria-label={title}>
      {DATA_SLOTS.map(s => (
        <span key={s.key} className="w-1.5 h-1.5 rounded-full"
          style={{ background: m[s.key] ? '#10b981' : '#334155' }} />
      ))}
    </span>
  )
}

export default function Merchants() {
  // staff เพิ่ม/แก้ร้านได้ แต่ไม่เห็นเครื่องมือที่ย้อนกลับยาก — เซิร์ฟเวอร์กันซ้ำอีกชั้นอยู่แล้ว
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
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

  // รีเซ็ตหน้าและที่เลือกตรงจุดที่เปลี่ยนจริง ไม่ sync ผ่าน effect
  const resetPaging = () => { setPage(0); setPicked([]) }

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); resetPaging() }, 350)
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

  const toggle = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const allPicked = merchants.length > 0 && picked.length === merchants.length
  const toggleAll = () => setPicked(allPicked ? [] : merchants.map(m => m.id))

  const bulk = async (body, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return
    setBulkBusy(true); setErr('')
    try {
      await api.bulkUpdateVendors({ ids: picked, ...body })
      setPicked([])
      await load()
    } catch (e) { setErr(e.message || 'แก้ไม่สำเร็จ') } finally { setBulkBusy(false) }
  }

  const fmtDate = (s) => s ? new Date(s).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' }) : '—'
  const tabCount = (t) => counts ? counts[t.countKey] : null
  const activeTab = TABS.find(t => t.key === tab)
  const completeOnPage = merchants.filter(m => DATA_SLOTS.every(s => m[s.key])).length

  return (
    <div className="merchants-page p-4 sm:p-5 space-y-4">
      <style>{`
        .merchants-page a:focus-visible, .merchants-page button:focus-visible, .merchants-page input:focus-visible, .merchants-page select:focus-visible {
          outline: 2px solid rgba(16,185,129,0.55); outline-offset: 2px; border-radius: 0.5rem;
        }
        .m-row { border-left: 2px solid transparent; }
        .m-row:hover { background: rgba(255,255,255,0.025); }
        .m-row[data-picked="true"] { background: rgba(16,185,129,0.06); border-left-color: #10b981; }
        @media (prefers-reduced-motion: reduce) {
          .merchants-page *, .merchants-page *::before, .merchants-page *::after {
            animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      {/* หัวหน้า — เลิกอ้างว่า "ใช้เติมข้อมูลอัตโนมัติ" เพราะยังไม่มีร้านไหนมีเลขบัญชีให้เติม
          เปลี่ยนเป็นบอกสถานะจริงว่ามีกี่ร้าน และข้อมูลครบกี่ร้านในหน้านี้ */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-900/30"
          style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
          <Store className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-white leading-tight">ร้านค้า / ซัพพลายเออร์</h2>
          {counts && (
            <p className="text-sm text-slate-500 mt-0.5 tabular-nums">
              {counts.total} ร้าน
              <span className="text-slate-700"> · </span>
              <span className={completeOnPage === 0 ? 'text-amber-500/80' : 'text-slate-500'}>
                ข้อมูลครบ {completeOnPage}/{merchants.length} ในหน้านี้
              </span>
            </p>
          )}
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" /><span className="hidden sm:inline">เพิ่มร้านค้า</span>
        </button>
      </div>

      {isAdmin && <MergeSuggestions onMerged={load} />}

      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหา ชื่อร้าน / เลขผู้เสียภาษี / เลขบัญชี / เบอร์โทร…" aria-label="ค้นหาร้านค้า"
          className="w-full rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 border border-slate-700 focus:outline-none focus:border-emerald-500"
          style={{ background: '#0d1120' }} />
      </div>

      {!searching && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex gap-1.5 flex-wrap" role="tablist">
            {TABS.filter(t => isAdmin || t.key !== 'hidden').map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); resetPaging() }} role="tab" aria-selected={tab === t.key}
                title={t.hint}
                className="text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap"
                style={{
                  background: tab === t.key ? 'rgba(16,185,129,0.12)' : '#0d1120',
                  borderColor: tab === t.key ? 'rgba(16,185,129,0.4)' : '#1f2937',
                  color: tab === t.key ? '#34d399' : '#94a3b8',
                  fontWeight: tab === t.key ? 600 : 400,
                }}>
                {t.label}
                {tabCount(t) != null && <span className="tabular-nums opacity-70"> {tabCount(t)}</span>}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-600">เรียง</span>
            <select value={sort} onChange={e => { setSort(e.target.value); resetPaging() }} aria-label="เรียงลำดับ"
              className="text-xs rounded-lg px-2 py-1.5 text-slate-300 border border-slate-700" style={{ background: '#0d1120' }}>
              {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {isAdmin && picked.length > 0 && (
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
        {/* หัวคอลัมน์ — ของเดิมมีตัวเลข 62 กับวันที่ลอย ๆ โดยไม่บอกว่าคืออะไร */}
        {!loading && merchants.length > 0 && (
          <div className="flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-600 uppercase tracking-wide"
            style={{ background: '#0d1120', borderBottom: '1px solid #1f2937' }}>
            {isAdmin && (
              <input type="checkbox" checked={allPicked} onChange={toggleAll}
                aria-label="เลือกทั้งหน้า" className="flex-shrink-0 accent-emerald-500" />
            )}
            <span className="flex-1">ร้านค้า</span>
            <span className="w-12 text-center hidden sm:inline" title="หมวดธุรกิจ · ชนิดเอกสาร · เลขบัญชี">ข้อมูล</span>
            <span className="w-10 text-right">ครั้ง</span>
            <span className="w-16 text-right hidden sm:inline">ล่าสุด</span>
            <span className="w-4" />
          </div>
        )}

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
            {merchants.map(m => (
              <div key={m.id} data-picked={picked.includes(m.id)}
                className="m-row flex items-center gap-2.5 px-3 py-2.5 transition-colors">
                {isAdmin && (
                  <input type="checkbox" checked={picked.includes(m.id)} onChange={() => toggle(m.id)}
                    aria-label={`เลือก ${m.vendorName}`} className="flex-shrink-0 accent-emerald-500" />
                )}
                <Link to={`/merchants/${m.id}`} className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="min-w-0 flex-1 flex items-center gap-2">
                    <span className={`text-sm truncate ${m.isActive === false ? 'text-slate-500 line-through' : 'text-slate-100'}`}>
                      {m.vendorName}
                    </span>
                    {m.docType && <DocBadge docType={m.docType} short />}
                    {m.isActive === false && <EyeOff className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />}
                  </span>
                  <span className="w-12 hidden sm:flex justify-center"><DataDots m={m} /></span>
                  <span className="w-10 text-right text-xs text-slate-400 tabular-nums flex-shrink-0">{m.occurrenceCount || 0}</span>
                  <span className="w-16 text-right text-xs text-slate-600 tabular-nums flex-shrink-0 hidden sm:inline">{fmtDate(m.lastSeen)}</span>
                  <ChevronRight className="w-4 h-4 text-slate-700 flex-shrink-0" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* หน้าถัดไป — ของเดิมตัดที่ 200 เงียบ ๆ ทั้งที่มีมากกว่านั้น */}
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
