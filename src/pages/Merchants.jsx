import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import MerchantModal from '../components/MerchantModal'
import MergeSuggestions from '../components/MergeSuggestions'
import MerchantRowStyles from '../components/MerchantRowStyles'
import { BUSINESS_TYPES, docTypeMeta } from '../merchantMeta'
import { Search, Plus, Check, CheckCircle2, Circle, ListChecks } from 'lucide-react'

const PAGE = 100

// แท็บแทนแถวชิป 11 อัน — ชิปหมวดธุรกิจใช้ไม่ได้จริงเพราะแทบทุกร้านไม่ระบุหมวด
// เกณฑ์ "ประจำ" อิงการใช้งานจริง (เจอตั้งแต่ 5 ครั้ง) ไม่ใช่ความครบของข้อมูล
const TABS = [
  { key: 'regular', label: 'คู่ค้าประจำ', countKey: 'regular', hint: 'เจอตั้งแต่ 5 ครั้งขึ้นไป' },
  { key: 'occasional', label: 'ใช้นาน ๆ ครั้ง', countKey: 'occasional', hint: 'เจอไม่ถึง 5 ครั้ง — ส่วนใหญ่เป็นชื่อที่ระบบเดามาจากสลิป' },
  { key: 'hidden', label: 'ซ่อนแล้ว', countKey: 'hidden', hint: 'ไม่โผล่ตอนแจ้งบิล แต่ยังอ้างอิงย้อนหลังได้' },
]

const SORTS = [
  { key: 'used', label: 'ใช้บ่อยสุด' },
  { key: 'recent', label: 'พบล่าสุด' },
  { key: 'name', label: 'ชื่อ ก–ฮ' },
]

const DATA_SLOTS = [
  { key: 'businessType', label: 'หมวดธุรกิจ' },
  { key: 'docType', label: 'ชนิดเอกสาร' },
  { key: 'bankAccountNo', label: 'เลขบัญชี' },
]
const isComplete = (m) => DATA_SLOTS.every(s => m[s.key])

// ชั้นความถี่ — แบ่งกำแพง 353 แถวให้มีจังหวะ ใช้เฉพาะตอนเรียงตามความถี่
// (เรียงตามวันที่หรือชื่อ การแบ่งชั้นความถี่ไม่มีความหมาย)
const TIERS = [
  { min: 40, label: 'เจอ 40 ครั้งขึ้นไป' },
  { min: 20, label: 'เจอ 20–39 ครั้ง' },
  { min: 5, label: 'เจอ 5–19 ครั้ง' },
  { min: 0, label: 'เจอไม่ถึง 5 ครั้ง' },
]
const tierOf = (n) => TIERS.find(t => (Number(n) || 0) >= t.min) || TIERS[TIERS.length - 1]

// ชนิดเอกสารเป็นข้อความ + รูปทรงไอคอนต่างกัน ไม่ใช่ป้ายสี
// เก็บครบทั้ง 4 แบบเพราะผลทางภาษีต่างกันคนละเรื่อง (เต็มรูป/ย่อ/บิลเงินสด/ไม่มี)
// และ "ยังไม่ระบุ" เป็นตัวสว่างที่สุดในบรรทัด โดยไม่ใช้สีสื่อความหมายเลย
const DOC_SHAPE = {
  full_tax: <path d="M5.4 8.2 7.2 10 10.8 5.9" strokeLinecap="round" strokeLinejoin="round" />,
  short_tax: <path d="M5.6 8h4.8" strokeLinecap="round" />,
  receipt: <path d="M5.4 6.4h5.2M5.4 9.2h3.4" strokeLinecap="round" />,
  none: <path d="M5.2 5.2 10.8 10.8" strokeLinecap="round" />,
}
const DOC_CLASS = { full_tax: 'full', short_tax: 'short', receipt: 'receipt', none: 'none' }

function DocLine({ docType }) {
  const d = docTypeMeta(docType)
  return (
    <span className={`doc doc--${d ? DOC_CLASS[d.value] : 'unset'}`}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <rect x="3" y="2.6" width="10" height="10.8" rx="1.6" strokeDasharray={d ? undefined : '2.6 2.2'} />
        {d ? DOC_SHAPE[d.value] : null}
      </svg>
      <span className="t">{d ? d.short : 'ยังไม่ระบุเอกสาร'}</span>
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
  const [selMode, setSelMode] = useState(false)
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
  const activeTab = TABS.find(t => t.key === tab)

  // คอลัมน์ซ้ายคือ "ค่าที่กำลังเรียง" ไม่ใช่ "จำนวนครั้ง" ตายตัว
  // เรียงตามวันที่ก็โชว์วันที่ — สมอตาจึงไม่ตายตอนไปแท็บ 294 ร้านที่ทุกตัวเลขเป็น 1
  const byDate = sort === 'recent'
  const maxCount = Math.max(1, ...merchants.map(m => Number(m.occurrenceCount) || 0))
  const times = merchants.map(m => (m.lastSeen ? new Date(m.lastSeen).getTime() : 0)).filter(Boolean)
  const minT = times.length ? Math.min(...times) : 0
  const maxT = times.length ? Math.max(...times) : 1
  // แท่งวัดใต้แถว = สัดส่วนของค่าที่กำลังเรียง ทำให้ที่ว่างขวาจอกลายเป็นข้อมูล
  // แทนที่จะเป็นความว่างเปล่าที่สายตาต้องวิ่งข้าม
  const barOf = (m) => {
    if (!byDate) return (Number(m.occurrenceCount) || 0) / maxCount
    if (!m.lastSeen || maxT === minT) return 1
    return 0.12 + 0.88 * ((new Date(m.lastSeen).getTime() - minT) / (maxT - minT))
  }
  const weightOf = (n) => (n >= 40 ? 't1' : n >= 20 ? 't2' : 't3')

  const completeOnPage = merchants.filter(isComplete).length
  const showGroups = !byDate && sort !== 'name' && !searching
  // คำนวณหัวกลุ่มล่วงหน้า — แถวไหนเป็นแถวแรกของชั้นความถี่ และชั้นนั้นมีกี่ร้าน
  const tierCounts = {}
  const startsTier = {}
  if (showGroups) {
    let prev = null
    for (const m of merchants) {
      const k = tierOf(Number(m.occurrenceCount) || 0).label
      tierCounts[k] = (tierCounts[k] || 0) + 1
      if (k !== prev) { startsTier[m.id] = k; prev = k }
    }
  }

  return (
    <div className={`mp p-4 sm:p-5${selMode ? ' sel-mode' : ''}`}>
      <MerchantRowStyles />

      {/* หัวหน้าบอกสถานะจริง ไม่ใช่คำโฆษณา — เดิมเขียนว่า "ใช้เติมข้อมูลอัตโนมัติตอนออกบิล"
          ทั้งที่ยังไม่มีร้านไหนมีเลขบัญชีให้เติมสักร้าน */}
      <div className="flex items-start gap-3 mb-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-white leading-tight">ร้านค้า / ซัพพลายเออร์</h2>
          {counts && (
            <p className="text-[13.5px] mt-1.5 tnum" style={{ color: 'var(--ink-3)' }}>
              <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{counts.total}</b> ร้าน
              <span className="mx-1.5">·</span>
              คู่ค้าประจำ <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{counts.regular}</b> ร้าน
            </p>
          )}
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" /><span className="hidden sm:inline">เพิ่มร้านค้า</span>
        </button>
      </div>

      <div className="cols">
        <div className="main">
          {!searching && (
            <div className="tabs" role="tablist">
              {TABS.filter(t => isAdmin || t.key !== 'hidden').map(t => (
                <button key={t.key} className="tab" role="tab" title={t.hint}
                  aria-current={tab === t.key ? 'page' : undefined}
                  onClick={() => { setTab(t.key); resetPaging() }}>
                  {t.label}
                  {counts && <span className="c">{counts[t.countKey]}</span>}
                </button>
              ))}
            </div>
          )}

          <div className="search">
            <Search className="w-4 h-4" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา ชื่อร้าน / เลขผู้เสียภาษี / เลขบัญชี / เบอร์โทร…" aria-label="ค้นหาร้านค้า" />
          </div>

          <div className="tools">
            {!searching && (
              <>
                <span className="tlabel">เรียงตาม</span>
                <div className="seg">
                  {SORTS.map(s => (
                    <button key={s.key} className="seg-b" aria-pressed={sort === s.key}
                      onClick={() => { setSort(s.key); resetPaging() }}>
                      {sort === s.key && <Check className="w-3 h-3" />}
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <span className="spacer" />
            {isAdmin && (
              <button className="tbtn" aria-pressed={selMode}
                onClick={() => { setSelMode(v => !v); setPicked([]) }}>
                <ListChecks className="w-4 h-4" />เลือกหลายรายการ
              </button>
            )}
          </div>

          {isAdmin && picked.length > 0 && (
            <div className="selbar">
              <span>เลือกไว้ <span className="n">{picked.length}</span> รายการ</span>
              <select disabled={bulkBusy} defaultValue="" aria-label="ตั้งหมวดธุรกิจ"
                onChange={e => { if (e.target.value) { bulk({ businessType: e.target.value }); e.target.value = '' } }}>
                <option value="">ตั้งหมวดธุรกิจ…</option>
                {BUSINESS_TYPES.map(b => <option key={b.value} value={b.value}>{b.value}</option>)}
              </select>
              <button disabled={bulkBusy} onClick={() => bulk({ isActive: false }, `ซ่อน ${picked.length} ร้าน?\n\nจะไม่โผล่ตอนแจ้งบิล แต่บิลเก่ายังอ้างอิงได้ตามเดิม`)}>ซ่อน</button>
              {tab === 'hidden' && <button disabled={bulkBusy} onClick={() => bulk({ isActive: true })}>เอากลับมาใช้</button>}
              <button onClick={() => setPicked([])}>ยกเลิกที่เลือก</button>
            </div>
          )}

          {err && <p className="text-sm text-red-400 mt-2" role="alert">{err}</p>}

          <div className="panel">
            {/* หัวคอลัมน์ — ของเดิมมีเลข 62 กับวันที่ลอย ๆ โดยไม่บอกว่าคืออะไร */}
            <div className="colhead">
              <span className="ch-n">{byDate ? 'พบล่าสุด' : 'ครั้ง'}</span>
              <span className="ch-b">ชื่อร้าน · ชนิดเอกสาร{byDate ? ' · จำนวนครั้ง' : ' · พบล่าสุด'}</span>
            </div>

            {loading ? (
              <div className="empty"><p>กำลังโหลด…</p></div>
            ) : merchants.length === 0 ? (
              <div className="empty">
                <p>{searching ? 'ไม่พบร้านค้าที่ค้นหา' : 'ยังไม่มีร้านในกลุ่มนี้'}</p>
                {searching && <button onClick={() => setAdding(true)}>+ เพิ่มร้านใหม่ &quot;{debounced}&quot;</button>}
              </div>
            ) : (
              <ul className="list">
                {merchants.map(m => {
                  const n = Number(m.occurrenceCount) || 0
                  const head = startsTier[m.id]
                  return (
                    <li key={m.id} style={{ display: 'contents' }}>
                      {head && (
                        <div className="gh">{head}<span className="gc">{tierCounts[head]} ร้าน</span></div>
                      )}
                      <div className={`row${picked.includes(m.id) ? ' is-sel' : ''}${m.isActive === false ? ' is-off' : ''}`}
                        style={{ '--w': barOf(m) }}>
                        {isAdmin && (
                          <label className="lead">
                            <input type="checkbox" className="pick" checked={picked.includes(m.id)}
                              onChange={() => toggle(m.id)} aria-label={`เลือก ${m.vendorName}`} />
                            <span className="box" aria-hidden="true">
                              <svg width="11" height="9" viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 5.3 4.4 8.6 11 1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          </label>
                        )}
                        <div className="num">
                          {byDate ? <span className="kd">{fmtDate(m.lastSeen)}</span> : <span className={weightOf(n)}>{n}</span>}
                        </div>
                        <Link className="body" to={`/merchants/${m.id}`}>
                          <span className="name">
                            {m.vendorName}
                            {isComplete(m) && <CheckCircle2 className="ok w-3.5 h-3.5" aria-label="ตั้งค่าข้อมูลครบแล้ว" />}
                          </span>
                          <span className="meta">
                            <DocLine docType={m.docType} />
                            <span className="sep">·</span>
                            <span className="seen">{byDate ? `เจอ ${n} ครั้ง` : `พบล่าสุด ${fmtDate(m.lastSeen)}`}</span>
                          </span>
                        </Link>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* หน้าถัดไป — ของเดิมตัดที่ 200 เงียบ ๆ ทั้งที่มีมากกว่านั้น */}
          {!loading && !searching && (merchants.length === PAGE || page > 0) && (
            <div className="foot">
              <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>ก่อนหน้า</button>
              <span>
                {page * PAGE + 1}–{page * PAGE + merchants.length}
                {counts && activeTab && <> จาก {counts[activeTab.countKey]}</>}
              </span>
              <button disabled={merchants.length < PAGE} onClick={() => setPage(p => p + 1)}>ถัดไป</button>
            </div>
          )}
        </div>

        {/* แถบขวา — ตัวบอกความครบย้ายมาอยู่ตรงนี้ก้อนเดียว
            เพราะเมื่อทุกแถวมีสถานะเดียวกันหมด ตัวบอกรายแถวให้ข้อมูล 0 บิต
            เป็นเสียงรบกวนล้วน ๆ ไม่ว่าจะทำให้ดัง (ป้ายส้ม) หรือจาง (จุดเทา 1.65:1) */}
        <aside className="rail">
          <div className="card card--todo">
            <h2>ข้อมูลที่ยังไม่ได้ตั้งค่า</h2>
            <div className="ratio">
              <b>{completeOnPage}</b>
              <span>จาก {merchants.length} ร้านในหน้านี้</span>
            </div>
            <div className="track"><i style={{ '--p': `${merchants.length ? (completeOnPage / merchants.length) * 100 : 0}%` }} /></div>
            <p className="mute">ถ้าไม่มีข้อมูลพวกนี้ ตอนออกใบวางบิลต้องพิมพ์เองทุกครั้ง และตอนปิดปีจะหาเอกสารไม่เจอ</p>
            <ul className="fields">
              {DATA_SLOTS.map(s => <li key={s.key}><Circle className="w-3 h-3" />{s.label}</li>)}
            </ul>
            {completeOnPage > 0 && (
              <p className="legend"><CheckCircle2 className="w-3.5 h-3.5" />ร้านที่ครบทั้ง 3 ช่องมีเครื่องหมายนี้ท้ายชื่อ</p>
            )}
          </div>

          {isAdmin && <MergeSuggestions onMerged={load} />}
        </aside>
      </div>

      {adding && <MerchantModal merchant={null} cats={cats} wallets={wallets} onClose={() => setAdding(false)} onDone={load} />}
    </div>
  )
}
