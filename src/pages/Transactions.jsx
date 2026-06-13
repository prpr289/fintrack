import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../api'
import { thb, date, today } from '../fmt'
import { useWs } from '../useWs'
import { useAuth } from '../AuthContext'
import {
  Plus, Pencil, Trash2, X, Download, Upload, FileDown, AlertCircle,
  CheckCircle2, Check, Search, ChevronLeft, ChevronRight, FileSpreadsheet,
  Paperclip, Eye, Loader2, ImagePlus, Clock, FileText,
  ArrowUp, ArrowDown, SearchX, Calendar, ChevronDown,
} from 'lucide-react'
import { exportTransactionsCsv, exportTransactionsXls, exportTemplateCsv, parseCsv } from '../csvUtils'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }
const EMPTY = { name: '', amount: '', type: 'expense', scope: 'business', date: today(), walletId: '', categoryId: '', subCategoryId: '', note: '' }
const PAGE_SIZE = 50

// ── Luxe theme tokens (mirrors the standalone design) ──────────────
const FONT_SERIF = "'Noto Serif Thai', serif"
const FONT_MONO = "'JetBrains Mono', monospace"
// Frosted-glass surface used across cards / table.
const GLASS = {
  background: 'linear-gradient(160deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012))',
  border: '1px solid rgba(255,255,255,0.07)',
  backdropFilter: 'blur(26px) saturate(130%)',
  WebkitBackdropFilter: 'blur(26px) saturate(130%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
}
const CAT_PALETTE = ['#34d399', '#86b8a0', '#9d93c4', '#c98e98', '#5fb8d9', '#e6b980', '#7c9fd6', '#c98ec0', '#8fcf9d', '#d6a07c']
function hashColor(str) {
  let h = 0
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return CAT_PALETTE[h % CAT_PALETTE.length]
}
// Signed currency string "+฿1,234.00" / "−฿1,234.00" (uses thb()'s ฿ + grouping).
function signedThb(type, amount) {
  return (type === 'income' ? '+' : '−') + thb(amount)
}
// Small wallet/card glyph used in the wallet column (matches the design).
function CreditCardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.55)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
      <rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 10.5h20" />
    </svg>
  )
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

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div
        className={`w-full ${wide ? 'sm:max-w-lg' : 'sm:max-w-md'} sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col`}
        style={{ background: '#161b2e', border: '1px solid #2e3349' }}>
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
          <h3 className="font-semibold text-slate-200">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function Label({ children }) {
  return <label className="block text-xs font-medium text-slate-400 mb-1.5">{children}</label>
}

// ── Hero "net balance" card with profit-margin badge ───────────────
function NetHeroCard({ net, income, periodLabel }) {
  const pos = net >= 0
  const margin = income > 0 ? (net / income) * 100 : 0
  const accent = pos ? '#aef5da' : '#fda4af'
  return (
    <div className="relative overflow-hidden rounded-3xl p-5 sm:p-7"
      style={{
        background: pos
          ? 'linear-gradient(150deg,rgba(16,185,129,0.13),rgba(16,185,129,0.02) 60%,rgba(255,255,255,0.012))'
          : 'linear-gradient(150deg,rgba(251,113,133,0.12),rgba(251,113,133,0.02) 60%,rgba(255,255,255,0.012))',
        border: `1px solid ${pos ? 'rgba(52,211,153,0.22)' : 'rgba(251,113,133,0.22)'}`,
        backdropFilter: 'blur(30px) saturate(140%)', WebkitBackdropFilter: 'blur(30px) saturate(140%)',
        boxShadow: `0 30px 70px -38px ${pos ? 'rgba(16,185,129,0.45)' : 'rgba(251,113,133,0.4)'},inset 0 1px 0 rgba(255,255,255,0.1)`,
      }}>
      <div className="absolute pointer-events-none" style={{ bottom: -90, right: -40, width: 260, height: 260, borderRadius: '50%', background: `radial-gradient(circle,${pos ? 'rgba(52,211,153,0.16)' : 'rgba(251,113,133,0.16)'},transparent 64%)`, filter: 'blur(30px)' }} />
      <div className="relative">
        <div className="uppercase mb-3" style={{ fontSize: 11, letterSpacing: '2.5px', color: pos ? 'rgba(167,243,208,0.7)' : 'rgba(253,164,175,0.7)' }}>
          ยอดคงเหลือสุทธิ · {periodLabel}
        </div>
        <div className="leading-none" style={{ fontFamily: FONT_SERIF, fontWeight: 600, color: accent, letterSpacing: '-0.5px' }}>
          <span className="inline-flex items-baseline flex-wrap">
            <span style={{ fontFamily: 'inherit', fontSize: 'clamp(2.25rem,9vw,3.1rem)' }}>{signedThb(pos ? 'income' : 'expense', Math.abs(net))}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1" style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 500, color: pos ? '#6ee7c7' : '#fda4af', background: pos ? 'rgba(52,211,153,0.12)' : 'rgba(251,113,133,0.12)', border: `1px solid ${pos ? 'rgba(52,211,153,0.22)' : 'rgba(251,113,133,0.22)'}` }}>
            {pos ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}{Math.abs(margin).toFixed(1)}%
          </span>
          <span className="text-xs sm:text-[12.5px]" style={{ color: pos ? 'rgba(167,243,208,0.65)' : 'rgba(253,164,175,0.65)' }}>
            อัตรากำไรสุทธิจากรายรับช่วงนี้
          </span>
        </div>
      </div>
    </div>
  )
}

// Income / Expense stat card (glass) with optional ratio bar.
function StatCard({ label, value, count, color, icon: Icon, sign, ratio }) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-4 sm:p-5" style={GLASS}>
      <div className="flex items-center justify-between mb-3">
        <span className="uppercase" style={{ fontSize: 11, letterSpacing: '2px', color: 'rgba(148,163,184,0.65)' }}>{label}</span>
        <span className="flex items-center justify-center rounded-lg" style={{ width: 26, height: 26, background: color + '1f', border: `1px solid ${color}38` }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </span>
      </div>
      <div className="whitespace-nowrap leading-none" style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 'clamp(1.25rem,5.5vw,1.7rem)', color: '#eef6f1' }}>
        <span className="inline-flex items-baseline">
          <span style={{ fontFamily: 'Anuphan,sans-serif', fontSize: '0.5em', fontWeight: 500, color: 'rgba(238,246,241,0.5)', marginRight: '0.18em' }}>{sign} ฿</span>
          {thb(value).replace('฿', '')}
        </span>
      </div>
      {ratio != null && (
        <div className="flex items-center gap-2 mt-3">
          <div className="flex-1 rounded-full overflow-hidden" style={{ height: 5, background: 'rgba(255,255,255,0.06)' }}>
            <div style={{ width: `${Math.min(100, Math.max(0, ratio))}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg,${color}b3,${color})` }} />
          </div>
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: color + 'e6' }}>{ratio.toFixed(0)}%</span>
        </div>
      )}
      {count != null && (
        <div className="mt-2.5" style={{ fontSize: 11.5, color: 'rgba(148,163,184,0.6)' }}>
          จาก <span style={{ fontFamily: FONT_MONO, color: '#9fb0c2' }}>{count}</span> รายการ
        </div>
      )}
    </div>
  )
}

// ── Date-range filter ──────────────────────────────────────────
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TX_PERIODS = [
  { key: 'thisMonth', label: 'เดือนนี้' },
  { key: 'lastMonth', label: 'เดือนที่แล้ว' },
  { key: '7d',  label: '7 วันล่าสุด' },
  { key: '30d', label: '30 วันล่าสุด' },
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'custom', label: 'กำหนดเอง...' },
]

// Returns { from, to } for the API, or null when no date filter (show all).
function txRangeOf(key, custom) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const ago = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return d }
  switch (key) {
    case 'thisMonth': return { from: ymd(new Date(y, m, 1)), to: ymd(now) }
    case 'lastMonth': return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) }
    case '7d':  return { from: ymd(ago(6)), to: ymd(now) }
    case '30d': return { from: ymd(ago(29)), to: ymd(now) }
    case 'custom': return (custom.from && custom.to) ? custom : null
    case 'all':
    default: return null
  }
}

function periodLabelOf(period, custom) {
  if (period === 'custom' && custom.from && custom.to) return `${custom.from} → ${custom.to}`
  return TX_PERIODS.find(p => p.key === period)?.label || 'ช่วงเวลา'
}

function PeriodControl({ period, customRange, onPick, onApplyCustom }) {
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(period === 'custom')
  const [draft, setDraft] = useState(customRange)
  const ref = useRef()

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setShowCustom(false) } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const select = (key) => {
    if (key === 'custom') { setDraft(customRange); setShowCustom(true); setOpen(false) }
    else { onPick(key); setShowCustom(false); setOpen(false) }
  }
  const apply = () => { if (draft.from && draft.to) { onApplyCustom(draft); setShowCustom(false) } }

  const ddStyle = { background: '#1e2538', border: '1px solid #2e3349' }

  return (
    <div ref={ref} className="relative w-full sm:w-auto">
      <button type="button" onClick={() => { setOpen(o => !o); setShowCustom(false) }}
        className="flex items-center gap-2 justify-between rounded-xl px-4 py-3 w-full sm:w-auto sm:min-w-[150px] transition-all"
        style={{ fontSize: 13, fontWeight: 500, color: '#cdd6e1', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.035)' }}>
        <span className="flex items-center gap-2 truncate"><Calendar className="w-4 h-4 flex-shrink-0" style={{ color: '#6ee7c7' }} strokeWidth={1.8} />{periodLabelOf(period, customRange)}</span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'rgba(148,163,184,0.7)' }} />
      </button>

      {open && (
        <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1 rounded-xl shadow-2xl z-30 py-1 min-w-[180px]" style={ddStyle}>
          {TX_PERIODS.map(p => (
            <button key={p.key} type="button" onClick={() => select(p.key)}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-white/5 ${period === p.key ? 'text-emerald-400 font-semibold' : 'text-slate-300'}`}>
              {p.label}
            </button>
          ))}
        </div>
      )}

      {showCustom && (
        <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1 z-30 p-3 rounded-xl flex flex-col gap-2 w-[260px]" style={ddStyle}>
          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-xs text-slate-500 mb-1">จาก</p>
              <input type="date" value={draft.from} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))}
                className="w-full rounded-lg px-2 py-1.5 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500" style={{ background: '#0d1120' }} />
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-500 mb-1">ถึง</p>
              <input type="date" value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))}
                className="w-full rounded-lg px-2 py-1.5 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500" style={{ background: '#0d1120' }} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={apply} disabled={!draft.from || !draft.to}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg py-1.5 text-sm font-semibold transition-colors">ดู</button>
            <button type="button" onClick={() => setShowCustom(false)} className="px-2 text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  )
}

const DOC_TYPE_LABELS = {
  transfer: { label: 'สลิปโอน', color: '#60a5fa' },
  receipt: { label: 'ใบเสร็จ', color: '#34d399' },
  tax_invoice: { label: 'ใบกำกับภาษี', color: '#f59e0b' },
  other: { label: 'อื่นๆ', color: '#94a3b8' },
}

function SlipThumb({ slip, onDelete }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (blobUrl) { window.open(blobUrl, '_blank'); return }
    setLoading(true)
    try {
      const url = await api.fetchSlipBlob(slip.id)
      setBlobUrl(url)
      window.open(url, '_blank')
    } catch (e) { alert(e.message) } finally { setLoading(false) }
  }

  const isPdf = slip.mimeType === 'application/pdf'
  const docMeta = DOC_TYPE_LABELS[slip.slipType] || DOC_TYPE_LABELS.other
  const ocr = slip.ocrData

  return (
    <div className="relative group rounded-xl overflow-hidden" style={{ background: '#0d1120', border: '1px solid #2e3349' }}>
      <button onClick={load} className="w-full p-3 flex flex-col items-center gap-1.5 hover:bg-white/5 transition-colors">
        {loading
          ? <Loader2 className="w-7 h-7 text-slate-400 animate-spin" />
          : isPdf
            ? <div className="text-2xl font-bold text-red-400">PDF</div>
            : <ImagePlus className="w-7 h-7 text-slate-500" />
        }
        <p className="text-xs text-slate-300 truncate max-w-[100px]">{ocr?.vendor_name || slip.fileName}</p>
        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: docMeta.color + '22', color: docMeta.color }}>
          {docMeta.label}
        </span>
        {ocr?.total && <p className="text-xs text-slate-500">฿{ocr.total.toLocaleString()}</p>}
        <div className="flex items-center gap-1 text-xs text-slate-500"><Eye className="w-3 h-3" /> ดู</div>
      </button>
      <button onClick={() => onDelete(slip.id)}
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

function InlineSlips({ txId, isTransfer }) {
  const [slips, setSlips] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  const load = useCallback(async () => {
    setLoading(true)
    try { const d = await api.listSlips(txId); setSlips(d.slips || []) }
    finally { setLoading(false) }
  }, [txId])

  useEffect(() => { load() }, [load])

  const handleFiles = async (files) => {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files))
        await api.uploadSlip(txId, file, isTransfer ? 'transfer' : 'receipt')
      await load()
    } catch (e) { alert(e.message) } finally { setUploading(false) }
  }


  const handleDelete = async (slipId) => {
    if (!confirm('ลบไฟล์นี้?')) return
    try { await api.deleteSlip(slipId); setSlips(s => s.filter(x => x.id !== slipId)) }
    catch (e) { alert(e.message) }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Paperclip className="w-3.5 h-3.5 text-yellow-400" />
        <span className="text-xs font-medium text-slate-400">ไฟล์แนบ / สลิป</span>
      </div>
      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 text-emerald-500 animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {slips.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {slips.map(s => <SlipThumb key={s.id} slip={s} onDelete={handleDelete} />)}
            </div>
          )}
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-medium transition-colors disabled:opacity-50"
            style={{ border: '2px dashed #2e3349', color: '#94a3b8' }}>
            {uploading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังอัพโหลด...</>
              : <><ImagePlus className="w-3.5 h-3.5" /> {slips.length > 0 ? 'เพิ่มไฟล์' : 'อัพโหลดสลิป / ใบเสร็จ'} (เลือกได้หลายไฟล์)</>
            }
          </button>
          <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden"
            onChange={e => handleFiles(e.target.files)} />
        </div>
      )}
    </div>
  )
}

function OcrCard({ ocr }) {
  if (!ocr) return null
  return (
    <div className="rounded-xl p-3 text-xs space-y-1" style={{ background: '#0d1120', border: '1px solid #2e3349' }}>
      <p className="text-amber-400 font-semibold flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5" /> AI อ่านเอกสารได้แล้ว
      </p>
      {ocr.vendor_name && <p className="text-slate-300"><span className="text-slate-500">ร้าน/บริษัท: </span>{ocr.vendor_name}</p>}
      {ocr.tax_id && <p className="text-slate-300"><span className="text-slate-500">เลขภาษี: </span>{ocr.tax_id}</p>}
      {ocr.doc_number && <p className="text-slate-300"><span className="text-slate-500">เลขที่เอกสาร: </span>{ocr.doc_number}</p>}
      {ocr.doc_date && <p className="text-slate-300"><span className="text-slate-500">วันที่: </span>{ocr.doc_date}</p>}
      {ocr.total != null && <p className="text-emerald-400 font-semibold"><span className="text-slate-500">ยอดรวม: </span>฿{ocr.total.toLocaleString()}</p>}
      {ocr.items?.length > 0 && (
        <div className="mt-1 pt-1" style={{ borderTop: '1px solid #2e3349' }}>
          {ocr.items.slice(0, 3).map((it, i) => (
            <p key={i} className="text-slate-400 truncate">{it.name} {it.amount != null ? `฿${it.amount.toLocaleString()}` : ''}</p>
          ))}
          {ocr.items.length > 3 && <p className="text-slate-600">+{ocr.items.length - 3} รายการ</p>}
        </div>
      )}
    </div>
  )
}

function SlipModal({ tx, onClose }) {
  const [slips, setSlips] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docType, setDocType] = useState(tx.transferPairId ? 'transfer' : 'receipt')
  const [lastOcr, setLastOcr] = useState(null)
  const fileRef = useRef()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api.listSlips(tx.id)
      setSlips(d.slips || [])
    } finally { setLoading(false) }
  }, [tx.id])

  useEffect(() => { load() }, [load])

  const handleFiles = async (files) => {
    if (!files?.length) return
    setUploading(true)
    setLastOcr(null)
    try {
      for (const file of Array.from(files)) {
        const res = await api.uploadSlip(tx.id, file, docType)
        if (res?.slip?.ocrData) setLastOcr(res.slip.ocrData)
      }
      await load()
    } catch (e) { alert(e.message) } finally { setUploading(false) }
  }

  const handleDelete = async (slipId) => {
    if (!confirm('ลบไฟล์นี้?')) return
    try { await api.deleteSlip(slipId); setSlips(s => s.filter(x => x.id !== slipId)) }
    catch (e) { alert(e.message) }
  }

  const isTransfer = !!tx.transferPairId

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="w-full sm:max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
        style={{ background: '#161b2e', border: '1px solid #2e3349' }}>
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
          <div>
            <h3 className="font-semibold text-slate-200">ไฟล์แนบ</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{tx.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded-lg transition-colors" style={{ border: '1px solid #2e3349' }}>ข้าม</button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>
          ) : (
            <>
              {slips.length === 0 && !uploading && (
                <p className="text-center text-slate-500 text-sm py-2">ยังไม่มีไฟล์แนบ</p>
              )}
              {slips.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {slips.map(s => <SlipThumb key={s.id} slip={s} onDelete={handleDelete} />)}
                </div>
              )}
              {lastOcr && <OcrCard ocr={lastOcr} />}

              {/* Doc type selector */}
              {!isTransfer && (
                <div className="flex gap-2 flex-wrap">
                  {[['receipt','ใบเสร็จรับเงิน'], ['tax_invoice','ใบกำกับภาษี'], ['transfer','สลิปโอนเงิน'], ['other','อื่นๆ']].map(([v, l]) => (
                    <button key={v} onClick={() => setDocType(v)}
                      className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                      style={{
                        borderColor: docType === v ? DOC_TYPE_LABELS[v].color : '#2e3349',
                        color: docType === v ? DOC_TYPE_LABELS[v].color : '#64748b',
                        background: docType === v ? DOC_TYPE_LABELS[v].color + '15' : 'transparent',
                      }}>
                      {l}
                    </button>
                  ))}
                </div>
              )}

              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ border: '2px dashed #2e3349', color: '#94a3b8' }}>
                {uploading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> กำลังอัพโหลด + OCR...</>
                  : <><Paperclip className="w-4 h-4" /> อัพโหลด {DOC_TYPE_LABELS[docType]?.label || 'ไฟล์'} (หลายไฟล์ได้)</>
                }
              </button>
              <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden"
                onChange={e => handleFiles(e.target.files)} />
              <p className="text-xs text-slate-600 text-center">
                {(docType === 'receipt' || docType === 'tax_invoice') ? 'AI จะอ่านและจดจำข้อมูลจากเอกสารอัตโนมัติ · ' : ''}
                รองรับ JPG, PNG, HEIC, PDF · สูงสุด 10MB
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ConfirmDraftModal({ tx, onClose, onDone }) {
  const [amount, setAmount] = useState(String(tx.amount))
  const [note, setNote] = useState(tx.note === 'draft — รอยืนยัน' ? '' : (tx.note || ''))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const confirm = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      await api.confirmTransaction(tx.id, { amount: Number(amount), note: note || undefined })
      onDone()
      onClose()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="w-full sm:max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
        style={{ background: '#161b2e', border: '1px solid #2e3349' }}>
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
          <div>
            <h3 className="font-semibold text-slate-200">ยืนยันรายการ Draft</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[220px]">{tx.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={confirm} className="p-5 space-y-4 overflow-y-auto">
          <div className="rounded-lg px-3 py-2.5 text-xs text-amber-300" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <Clock className="w-3 h-3 inline mr-1.5" />
            กรอกยอดจริงแล้วกดยืนยัน — ระบบจะตัดยอดจากกระเป๋าทันที
          </div>
          <div>
            <Label>จำนวนเงินจริง (บาท)</Label>
            <input type="number" min="0.01" step="0.01" value={amount}
              onChange={e => setAmount(e.target.value)} required
              className={INPUT} style={INPUT_STYLE} autoFocus />
          </div>
          <div>
            <Label>หมายเหตุ (ไม่บังคับ)</Label>
            <input value={note} onChange={e => setNote(e.target.value)} className={INPUT} style={INPUT_STYLE} />
          </div>
          <div className="pt-1 border-t" style={{ borderColor: '#1f2937' }}>
            <InlineSlips txId={tx.id} isTransfer={!!tx.transferPairId} />
          </div>
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button type="submit" disabled={saving}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors">
            {saving ? 'กำลังยืนยัน...' : '✓ ยืนยันรายการ'}
          </button>
        </form>
      </div>
    </div>
  )
}

const EDIT_FIELD_LABELS = {
  name: 'ชื่อรายการ', amount: 'จำนวนเงิน', type: 'ประเภท', scope: 'Scope',
  date: 'วันที่', note: 'หมายเหตุ', category_id: 'หมวดหมู่', sub_category_id: 'หมวดย่อย', wallet_id: 'กระเป๋า',
}

function EditConfirmModal({ tx, cats, wallets, onClose, onDone }) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const changes = tx.pendingChanges || {}
  const keys = Object.keys(changes)

  const catName = (id) => cats.find(c => c.id === id)?.name || (id || '— ไม่ระบุ —')
  const walName = (id) => wallets.find(w => w.id === id)?.name || (id || '— ไม่ระบุ —')
  const fmtVal = (field, val) => {
    if (val === null || val === '' || val === undefined) return '— ว่าง —'
    if (field === 'amount') return `฿${thb(Number(val))}`
    if (field === 'type') return val === 'income' ? 'รายรับ' : 'รายจ่าย'
    if (field === 'scope') return val === 'business' ? 'ธุรกิจ' : 'ส่วนตัว'
    if (field === 'category_id' || field === 'sub_category_id') return catName(val)
    if (field === 'wallet_id') return walName(val)
    return String(val)
  }
  const curVal = (field) => ({
    name: tx.name, amount: tx.amount, type: tx.type, scope: tx.scope, date: tx.date,
    note: tx.note, category_id: tx.categoryId, sub_category_id: tx.subCategoryId, wallet_id: tx.walletId,
  }[field])

  const run = async (which) => {
    setBusy(which); setErr('')
    try {
      if (which === 'confirm') await api.confirmEdit(tx.id)
      else await api.cancelEdit(tx.id)
      onDone(); onClose()
    } catch (e) { setErr(e.message); setBusy('') }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="w-full sm:max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
        style={{ background: '#161b2e', border: '1px solid #2e3349' }}>
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
          <div>
            <h3 className="font-semibold text-slate-200">ยืนยันการแก้ไข</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[220px]">{tx.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="rounded-lg px-3 py-2.5 text-xs text-blue-300" style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
            <Pencil className="w-3 h-3 inline mr-1.5" />
            {tx.editedBy ? `${tx.editedBy} แก้ไขรายการนี้ — ` : ''}ตรวจสอบแล้วกดยืนยัน ระบบจะอัปเดตยอดในกระเป๋า
          </div>
          <div className="space-y-2">
            {keys.map(f => (
              <div key={f} className="text-sm">
                <p className="text-xs text-slate-500 mb-0.5">{EDIT_FIELD_LABELS[f] || f}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-500 line-through">{fmtVal(f, curVal(f))}</span>
                  <span className="text-slate-600">→</span>
                  <span className="text-emerald-300 font-medium">{fmtVal(f, changes[f])}</span>
                </div>
              </div>
            ))}
            {keys.length === 0 && <p className="text-sm text-slate-500">ไม่มีรายละเอียดการแก้ไข</p>}
          </div>
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => run('cancel')} disabled={!!busy}
              className="flex-1 rounded-lg py-3 text-sm font-semibold transition-colors text-slate-300 border border-slate-600 hover:bg-white/5 disabled:opacity-50">
              {busy === 'cancel' ? 'กำลังยกเลิก...' : 'ยกเลิกการแก้ไข'}
            </button>
            <button onClick={() => run('confirm')} disabled={!!busy}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors">
              {busy === 'confirm' ? 'กำลังยืนยัน...' : '✓ ยืนยันการแก้ไข'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ExportModal({ onClose, currentFilter, currentSearch, defaultRange }) {
  const now = new Date()
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const todayStr = now.toISOString().slice(0, 10)

  const [from, setFrom] = useState(defaultRange?.from || firstOfMonth)
  const [to, setTo] = useState(defaultRange?.to || todayStr)
  const [fmt, setFmt] = useState('excel')
  const [exporting, setExporting] = useState(false)

  const presets = [
    { label: 'เดือนนี้', from: firstOfMonth, to: todayStr },
    { label: 'เดือนที่แล้ว', from: (() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.toISOString().slice(0, 10) })(), to: (() => { const d = new Date(now.getFullYear(), now.getMonth(), 0); return d.toISOString().slice(0, 10) })() },
    { label: 'ปีนี้', from: `${now.getFullYear()}-01-01`, to: todayStr },
    { label: 'ทั้งหมด', from: '2000-01-01', to: todayStr },
  ]

  const doExport = async () => {
    if (!from || !to || from > to) { alert('ช่วงวันที่ไม่ถูกต้อง'); return }
    setExporting(true)
    try {
      const all = await api.transactions({
        limit: 5000, from, to,
        ...(currentFilter.type && { type: currentFilter.type }),
        ...(currentFilter.scope && { scope: currentFilter.scope }),
        ...(currentSearch && { search: currentSearch }),
      })
      const txs = all.transactions || []
      const filename = `transactions-${from}-to-${to}`
      if (fmt === 'csv') exportTransactionsCsv(txs, `${filename}.csv`)
      else exportTransactionsXls(txs, `${filename}.xls`)
      onClose()
    } catch (e) { alert(e.message) } finally { setExporting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="w-full sm:max-w-sm sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
        style={{ background: '#161b2e', border: '1px solid #2e3349' }}>
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
          <h3 className="font-semibold text-slate-200">Export รายการธุรกรรม</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label>ช่วงเวลาด่วน</Label>
            <div className="flex flex-wrap gap-2">
              {presets.map(p => (
                <button key={p.label} onClick={() => { setFrom(p.from); setTo(p.to) }}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${from === p.from && to === p.to ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  style={from === p.from && to === p.to ? {} : { border: '1px solid #2e3349', background: '#0d1120' }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>ช่วงวันที่กำหนดเอง</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-slate-500 mb-1">จาก</p>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={INPUT} style={INPUT_STYLE} />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">ถึง</p>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} className={INPUT} style={INPUT_STYLE} />
              </div>
            </div>
          </div>
          <div>
            <Label>รูปแบบไฟล์</Label>
            <div className="grid grid-cols-2 gap-2">
              {[['excel', 'Excel (.xls)', FileSpreadsheet], ['csv', 'CSV (.csv)', FileDown]].map(([val, label, Icon]) => (
                <button key={val} type="button" onClick={() => setFmt(val)}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors ${fmt === val ? 'text-emerald-400' : 'text-slate-400 hover:border-slate-500 hover:text-slate-200'}`}
                  style={{ border: `1px solid ${fmt === val ? 'rgba(16,185,129,0.5)' : '#2e3349'}`, background: fmt === val ? 'rgba(16,185,129,0.08)' : '#0d1120' }}>
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={doExport} disabled={exporting || !from || !to}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
            {exporting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> กำลัง Export...</>
              : <><Download className="w-4 h-4" /> Export</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

function ImportModal({ onClose, onDone }) {
  const fileRef = useRef()
  const [step, setStep] = useState('pick')
  const [parseResult, setParseResult] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: [] })
  const [dragOver, setDragOver] = useState(false)

  const handleFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        setParseResult(parseCsv(e.target.result))
        setStep('preview')
      } catch (err) { alert(err.message) }
    }
    reader.readAsText(file, 'utf-8')
  }

  const startImport = async () => {
    if (!parseResult?.rows?.length) return
    setStep('importing')
    const failed = []
    let done = 0
    setProgress({ done: 0, total: parseResult.rows.length, failed: [] })
    for (const row of parseResult.rows) {
      try { await api.createTransaction(row) } catch (e) { failed.push({ row, error: e.message }) }
      done++
      setProgress({ done, total: parseResult.rows.length, failed: [...failed] })
    }
    setStep('done')
    setProgress(p => ({ ...p, failed }))
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="w-full sm:max-w-lg sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col" style={{ background: '#161b2e', border: '1px solid #2e3349' }}>
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
          <h3 className="font-semibold text-slate-200">นำเข้ารายการจาก CSV</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          {step === 'pick' && (
            <>
              <button onClick={exportTemplateCsv}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-emerald-400 transition-colors">
                <FileDown className="w-4 h-4" /> ดาวน์โหลด Template CSV
              </button>
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-600 hover:border-slate-400'}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}>
                <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-slate-300 text-sm font-medium">คลิกหรือลากไฟล์ CSV มาวาง</p>
                <p className="text-slate-500 text-xs mt-1">รองรับ .csv (UTF-8)</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={e => handleFile(e.target.files[0])} />
              <div className="rounded-lg p-3 text-xs text-slate-400 space-y-1" style={{ background: '#111827' }}>
                <p className="font-medium text-slate-300">columns ที่ต้องมี:</p>
                <code className="text-emerald-400">date, name, amount, type, scope</code>
                <p>+ เสริม: <code className="text-slate-300">note</code></p>
              </div>
            </>
          )}
          {step === 'preview' && parseResult && (
            <>
              {parseResult.errors.length > 0 && (
                <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                    <AlertCircle className="w-4 h-4" /> พบ {parseResult.errors.length} แถวผิดพลาด (จะถูกข้าม)
                  </div>
                  <div className="max-h-20 overflow-y-auto text-xs text-red-300 space-y-0.5 mt-1">
                    {parseResult.errors.map((e, i) => <p key={i}>แถว {e.row}: {e.errors.join(', ')}</p>)}
                  </div>
                </div>
              )}
              <div className="rounded-lg p-3 text-sm" style={{ background: '#111827' }}>
                <p className="text-slate-300">จะนำเข้า <span className="text-emerald-400 font-semibold">{parseResult.rows.length}</span> รายการ</p>
                <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                  {parseResult.rows.slice(0, 50).map((r, i) => (
                    <div key={i} className="flex gap-2 text-xs text-slate-400">
                      <span className="text-slate-500 w-4">{i + 1}</span>
                      <span className="text-slate-300">{r.date}</span>
                      <span className="flex-1 truncate">{r.name}</span>
                      <span className={r.type === 'income' ? 'text-emerald-400' : 'text-red-400'}>
                        {r.type === 'income' ? '+' : '-'}{r.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {parseResult.rows.length > 50 && <p className="text-xs text-slate-500 text-center">... และอีก {parseResult.rows.length - 50} รายการ</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep('pick')} className="flex-1 text-sm text-slate-400 hover:text-slate-200 rounded-lg py-2.5 transition-colors" style={{ border: '1px solid #2e3349' }}>
                  เลือกไฟล์ใหม่
                </button>
                <button onClick={startImport} disabled={parseResult.rows.length === 0}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm rounded-lg py-2.5 font-semibold transition-colors">
                  นำเข้า {parseResult.rows.length} รายการ
                </button>
              </div>
            </>
          )}
          {step === 'importing' && (
            <div className="py-4 space-y-4">
              <p className="text-slate-300 text-sm text-center">กำลังนำเข้า... {progress.done}/{progress.total}</p>
              <div className="w-full rounded-full h-2" style={{ background: '#1f2937' }}>
                <div className="h-2 rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}
          {step === 'done' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg p-4"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-emerald-400 font-semibold text-sm">
                    นำเข้าสำเร็จ {progress.done - progress.failed.length}/{progress.done} รายการ
                  </p>
                  {progress.failed.length > 0 && <p className="text-xs text-slate-400 mt-0.5">ล้มเหลว {progress.failed.length} รายการ</p>}
                </div>
              </div>
              <button onClick={() => { onClose(); onDone() }}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg py-2.5 font-semibold transition-colors">
                เสร็จสิ้น
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Transactions() {
  const { user } = useAuth()
  const [txs, setTxs] = useState([])
  const [wallets, setWallets] = useState([])
  const [categories, setCategories] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState({ type: '', scope: '' })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [slipTx, setSlipTx] = useState(null)
  const [confirmTx, setConfirmTx] = useState(null)
  const [editConfirmTx, setEditConfirmTx] = useState(null)
  const [summary, setSummary] = useState(null) // { income, expense, net } across current filter
  const [period, setPeriod] = useState('thisMonth') // default to the current month
  const [customRange, setCustomRange] = useState({ from: '', to: '' })

  const canWrite = user?.role === 'admin' || user?.role === 'staff'

  const pickPeriod = (key) => { setPeriod(key); setPage(1) }
  const applyCustom = (r) => { setCustomRange(r); setPeriod('custom'); setPage(1) }

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  const setFilterWithReset = (updater) => { setFilter(updater); setPage(1) }

  const load = useCallback(async () => {
    setLoading(true)
    const range = txRangeOf(period, customRange)
    const params = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }
    if (filter.type) params.type = filter.type
    if (filter.scope) params.scope = filter.scope
    if (debouncedSearch) params.search = debouncedSearch
    if (range) { params.from = range.from; params.to = range.to }
    const [td, wd, cd] = await Promise.all([
      api.transactions(params),
      api.wallets(),
      api.categories(),
    ])
    setTxs(td.transactions || [])
    setTotal(td.total || 0)
    setWallets(wd.wallets || [])
    setCategories(cd.categories || [])
    setLoading(false)
  }, [filter, page, debouncedSearch, period, customRange])

  useEffect(() => { load() }, [load])
  useWs((msg) => { if (['tx.created', 'tx.updated', 'tx.deleted'].includes(msg.event)) load() })

  // Totals across the whole filtered set (not just the current page).
  // Re-runs when the filter/search changes or the row count changes (add/delete).
  useEffect(() => {
    let cancelled = false
    const range = txRangeOf(period, customRange)
    const params = { limit: 5000 }
    if (filter.type) params.type = filter.type
    if (filter.scope) params.scope = filter.scope
    if (debouncedSearch) params.search = debouncedSearch
    if (range) { params.from = range.from; params.to = range.to }
    api.transactions(params).then(d => {
      if (cancelled) return
      const list = d.transactions || []
      const inc = list.filter(t => t.type === 'income')
      const exp = list.filter(t => t.type === 'expense')
      const income = inc.reduce((s, t) => s + t.amount, 0)
      const expense = exp.reduce((s, t) => s + t.amount, 0)
      setSummary({ income, expense, net: income - expense, incomeCount: inc.length, expenseCount: exp.length })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [filter, debouncedSearch, total, period, customRange])

  const mainCats = categories.filter(c => !c.parentId)
  const subCatsOf = (parentId) => categories.filter(c => c.parentId === parentId)

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY, walletId: wallets[0]?.id || '' })
    setErr('')
    setShowForm(true)
  }

  const openEdit = (t) => {
    setEditing(t)
    setForm({
      name: t.name, amount: String(t.amount), type: t.type, scope: t.scope,
      date: t.date, walletId: t.walletId || '', categoryId: t.categoryId || '',
      subCategoryId: t.subCategoryId || '', note: t.note || '',
    })
    setErr('')
    setShowForm(true)
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      const body = { ...form, amount: Number(form.amount) }
      if (!body.categoryId) delete body.categoryId
      if (!body.subCategoryId) delete body.subCategoryId
      if (!body.walletId) delete body.walletId
      if (!body.note) delete body.note
      if (editing) {
        const res = await api.updateTransaction(editing.id, body)
        setShowForm(false)
        // Staged edit (non-draft) → open the confirm dialog so the change can be applied.
        if (res?.pending && res.transaction) setEditConfirmTx(res.transaction)
      } else {
        const res = await api.createTransaction(body)
        setShowForm(false)
        if (res?.transaction) setSlipTx(res.transaction)
      }
      load()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const del = async (t) => {
    if (!confirm(`ลบ "${t.name}"?`)) return
    await api.deleteTransaction(t.id)
    load()
  }

  const openVoucher = async (t) => {
    const payee = t.name?.startsWith('โอนให้ ') ? t.name.slice(7) : t.name
    const ref = t.note?.startsWith('อ้างอิง: ') ? t.note.slice(9) : (t.note || '')
    let slipId = ''
    try { const d = await api.listSlips(t.id); slipId = d.slips?.[0]?.id || '' } catch {}
    // Record who printed (server logs printed_by + audit). Non-blocking.
    try { await api.printTransaction(t.id); load() } catch (e) { console.error('print log:', e) }
    const payload = encodeURIComponent(JSON.stringify({
      id: t.id, n: payee, amt: t.amount, d: t.date, b: '', r: ref, si: slipId, ty: t.type, mo: t.note || '',
    }))
    window.open(`/voucher?d=${payload}`, '_blank')
  }

  const toggleReconcile = async (t) => {
    try {
      const res = await api.reconcileTransaction(t.id)
      setTxs(prev => prev.map(tx => tx.id === t.id ? { ...tx, isReconciled: res.isReconciled } : tx))
    } catch (e) { alert(e.message) }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const groups = groupByDate(txs)
  // Colored dot per category: income → emerald, else the category's own color (or a stable hash).
  const dotColor = (t) => {
    if (t.type === 'income') return '#34d399'
    const c = categories.find(x => x.id === t.categoryId)
    return c?.color || hashColor(t.categoryName || t.name || '')
  }

  return (
    <div className="tx-page relative p-4 sm:p-6" style={{ background: '#06080c', minHeight: '100%', fontFamily: "'Anuphan', sans-serif", color: '#dbe2ea' }}>
      <style>{`
        .tx-page button:focus-visible,
        .tx-page input:focus-visible,
        .tx-page select:focus-visible {
          outline: 2px solid rgba(16,185,129,0.55);
          outline-offset: 2px;
          border-radius: 0.5rem;
        }
        .tx-page select option { background: #0d1322; color: #e2e8f0; }
        .tx-page ::-webkit-scrollbar { width: 9px; height: 9px; }
        .tx-page ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
        .tx-page ::-webkit-scrollbar-thumb:hover { background: rgba(52,211,153,0.25); background-clip: content-box; }
        @keyframes txRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .tx-rise { animation: txRise .4s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .tx-page *, .tx-page *::before, .tx-page *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      {/* Ambient background */}
      <div className="pointer-events-none" style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', bottom: -440, left: '8%', width: 820, height: 820, borderRadius: '50%', background: 'radial-gradient(circle,rgba(16,185,129,0.07),transparent 60%)', filter: 'blur(100px)' }} />
        <div style={{ position: 'absolute', top: -320, right: -160, width: 680, height: 680, borderRadius: '50%', background: 'radial-gradient(circle,rgba(30,52,66,0.32),transparent 64%)', filter: 'blur(90px)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.012) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.012) 1px,transparent 1px)', backgroundSize: '56px 56px' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(140% 105% at 50% 30%,transparent 36%,rgba(3,5,8,0.82) 100%)' }} />
      </div>

      <div className="relative z-10 space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="uppercase mb-1.5" style={{ fontSize: 10.5, letterSpacing: '3px', color: 'rgba(110,231,199,0.7)' }}>
            Ledger · {periodLabelOf(period, customRange)}
          </div>
          <h2 className="m-0 leading-none" style={{ fontFamily: FONT_SERIF, fontWeight: 600, color: '#f5f9fc', fontSize: 'clamp(1.75rem,7vw,2.25rem)', letterSpacing: '0.2px' }}>
            รายการธุรกรรม
          </h2>
          <div className="flex items-center gap-2.5 mt-2.5 text-sm" style={{ color: 'rgba(148,163,184,0.8)' }}>
            <span style={{ fontFamily: FONT_MONO, fontWeight: 500, color: '#9fb0c2' }}>{total}</span> รายการทั้งหมด
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(148,163,184,0.5)' }} />
            <span className="inline-flex items-center gap-1.5"><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />กระทบยอด</span>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setShowExport(true)}
            className="inline-flex items-center gap-2 rounded-xl transition-all p-2.5 sm:px-4 sm:py-2.5"
            style={{ fontSize: 13, fontWeight: 600, color: '#c4cfdb', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }} title="Export">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          {canWrite && (
            <button onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-2 rounded-xl transition-all p-2.5 sm:px-4 sm:py-2.5"
              style={{ fontSize: 13, fontWeight: 600, color: '#c4cfdb', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }} title="Import CSV">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </button>
          )}
          {canWrite && (
            <button onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl transition-all px-4 py-2.5"
              style={{ fontSize: 13, fontWeight: 600, color: '#06231a', background: 'linear-gradient(140deg,#5eead4,#10b981)', border: '1px solid rgba(110,231,199,0.4)', boxShadow: '0 10px 26px -12px rgba(16,185,129,0.7)' }}>
              <Plus className="w-4 h-4" strokeWidth={2.6} />
              <span className="whitespace-nowrap">เพิ่มรายการ</span>
            </button>
          )}
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5">
        <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 flex-1 sm:min-w-[260px] transition-all"
          style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Search className="w-[18px] h-[18px] flex-shrink-0" style={{ color: 'rgba(148,163,184,0.8)' }} strokeWidth={1.9} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ หรือ หมายเหตุ…"
            className="flex-1 bg-transparent focus:outline-none min-w-0"
            style={{ color: '#e2e8f0', fontSize: 13.5 }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="flex-shrink-0" style={{ color: 'rgba(148,163,184,0.7)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <PeriodControl period={period} customRange={customRange} onPick={pickPeriod} onApplyCustom={applyCustom} />
        <div className="flex gap-2.5">
          {[
            { key: 'type', options: [['', 'ทุกประเภท'], ['income', 'รายรับ'], ['expense', 'รายจ่าย']] },
            { key: 'scope', options: [['', 'ทุก scope'], ['business', 'ธุรกิจ'], ['personal', 'ส่วนตัว']] },
          ].map(({ key, options }) => (
            <select key={key} value={filter[key]}
              onChange={e => setFilterWithReset(f => ({ ...f, [key]: e.target.value }))}
              className="flex-1 rounded-xl pl-4 pr-9 py-3 focus:outline-none transition-all appearance-none cursor-pointer"
              style={{
                fontSize: 13, fontWeight: 500, color: '#cdd6e1',
                background: "rgba(255,255,255,0.035) url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\") no-repeat right 12px center",
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
              {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
        </div>
      </div>

      {/* Summary totals (current filter) */}
      {summary && (
        <div className="flex flex-col lg:flex-row gap-3 sm:gap-4">
          <div className="lg:flex-[1.7] min-w-0">
            <NetHeroCard net={summary.net} income={summary.income} periodLabel={periodLabelOf(period, customRange)} />
          </div>
          <div className="grid grid-cols-2 lg:flex lg:flex-col lg:flex-1 gap-3 sm:gap-4">
            <StatCard label="รายรับ" value={summary.income} count={summary.incomeCount} color="#34d399" icon={ArrowUp} sign="+" />
            <StatCard label="รายจ่าย" value={summary.expense} count={summary.expenseCount} color="#fb7185" icon={ArrowDown} sign="−"
              ratio={summary.income > 0 ? (summary.expense / summary.income) * 100 : null} />
          </div>
        </div>
      )}

      {/* Transaction list */}
      <div className="rounded-3xl overflow-hidden" style={{ ...GLASS, boxShadow: '0 34px 70px -40px rgba(0,0,0,0.9),inset 0 1px 0 rgba(255,255,255,0.06)' }}>
        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
          </div>
        ) : txs.length === 0 ? (
          <div className="p-12 sm:p-16 text-center flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <SearchX className="w-7 h-7" style={{ color: 'rgba(148,163,184,0.5)' }} />
            </div>
            <p style={{ color: '#d3dbe5', fontSize: 14, fontWeight: 600 }}>ไม่พบรายการ</p>
            <p style={{ color: 'rgba(148,163,184,0.5)', fontSize: 12.5 }}>
              {(debouncedSearch || filter.type || filter.scope || period !== 'all') ? 'ลองปรับช่วงเวลา / คำค้นหา หรือตัวกรอง' : 'ยังไม่มีรายการธุรกรรม — เริ่มจากปุ่มเพิ่มรายการ'}
            </p>
          </div>
        ) : (
          <>
            {/* ── Mobile: grouped luxe cards ── */}
            <div className="md:hidden">
              {groups.map(g => (
                <div key={g.key}>
                  <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.016)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontFamily: FONT_SERIF, fontSize: 13.5, color: '#d9e1ea', fontWeight: 600 }}>{date(g.key)}</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: 'rgba(148,163,184,0.5)' }}>{g.items.length} รายการ</span>
                    <span className="flex-1" style={{ height: 1, background: 'linear-gradient(90deg,rgba(255,255,255,0.07),transparent)' }} />
                    <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 500, color: g.net >= 0 ? 'rgba(110,231,199,0.92)' : 'rgba(251,154,168,0.92)' }}>{signedThb(g.net >= 0 ? 'income' : 'expense', Math.abs(g.net))}</span>
                  </div>
                  {g.items.map(t => {
                    const canEdit = user?.role === 'admin' || (user?.role === 'staff' && t.createdByUserId === user.id)
                    const canConfirmEdit = user?.role === 'admin' || t.createdByUserId === user?.id
                    return (
                      <div key={t.id} className="px-4 py-3.5 tx-rise" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: t.isDraft ? 'rgba(251,191,36,0.05)' : (t.pendingChanges ? 'rgba(96,165,250,0.06)' : 'transparent') }}>
                        {t.isDraft && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium mb-2">
                            <Clock className="w-3 h-3" /> Draft — รอยืนยัน
                          </div>
                        )}
                        {t.pendingChanges && (
                          <div className="flex items-center gap-1.5 text-xs text-blue-300 font-medium mb-2">
                            <Pencil className="w-3 h-3" /> แก้ไข-รอยืนยัน{t.editedBy ? ` · ${t.editedBy}` : ''}
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="leading-snug" style={{ fontSize: 14, color: '#eaf0f6', fontWeight: 500 }}>{t.name}</p>
                            {t.categoryName ? (
                              <div className="inline-flex items-center gap-1.5 mt-1 max-w-full">
                                <span className="flex-none" style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor(t) }} />
                                <span className="truncate" style={{ fontSize: 12, color: 'rgba(211,219,229,0.85)' }}>{t.categoryName}</span>
                                {t.subCategoryName && <span className="inline-flex items-center gap-1 truncate" style={{ fontSize: 11.5, color: 'rgba(148,163,184,0.55)' }}><ChevronRight className="w-2.5 h-2.5 flex-none" /> {t.subCategoryName}</span>}
                              </div>
                            ) : null}
                          </div>
                          <span className="flex items-center gap-1 flex-shrink-0 whitespace-nowrap" style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 14, color: t.type === 'income' ? '#34d399' : '#fb7185' }}>
                            {t.type === 'income' ? <ArrowUp className="w-3 h-3" strokeWidth={2.8} /> : <ArrowDown className="w-3 h-3" strokeWidth={2.8} />}
                            {thb(t.amount)}
                          </span>
                        </div>
                        {t.note && t.note !== 'draft — รอยืนยัน' && <p className="truncate mt-1.5" style={{ fontSize: 11.5, color: 'rgba(148,163,184,0.5)' }}>{t.note}</p>}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2" style={{ fontSize: 11.5, color: 'rgba(148,163,184,0.6)' }}>
                          {t.walletName && (
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                              <CreditCardIcon /> <span className="truncate" style={{ fontFamily: FONT_MONO, fontSize: 11 }}>{t.walletName}</span>
                            </span>
                          )}
                          {t.submittedBy && <span style={{ color: 'rgba(110,231,199,0.7)' }}>👤 {t.submittedBy}</span>}
                          {t.isReconciled && <span className="inline-flex items-center gap-1" style={{ color: '#34d399' }}><Check className="w-3 h-3" /> กระทบยอดแล้ว</span>}
                          {t.printedBy && <span>🖨️ {t.printedBy}{t.printCount > 1 ? ` ×${t.printCount}` : ''}</span>}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {t.isDraft && canWrite && (
                              <button onClick={() => setConfirmTx(t)}
                                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-semibold text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 transition-colors">
                                <Check className="w-3 h-3" /> ยืนยัน
                              </button>
                            )}
                            {!t.isDraft && t.pendingChanges && canConfirmEdit && (
                              <button onClick={() => setEditConfirmTx(t)}
                                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-semibold text-blue-300 border border-blue-400/30 hover:bg-blue-400/10 transition-colors">
                                <Check className="w-3 h-3" /> ยืนยันการแก้ไข
                              </button>
                            )}
                            {!t.isDraft && (
                              <button onClick={() => setSlipTx(t)}
                                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                                style={{ color: 'rgba(203,213,225,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <Paperclip className="w-3 h-3" /> สลิป
                              </button>
                            )}
                            {!t.isDraft && canWrite && (t.type === 'expense' || t.type === 'income') && (
                              <button onClick={() => openVoucher(t)}
                                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors hover:text-emerald-300"
                                style={{ color: 'rgba(203,213,225,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <FileText className="w-3 h-3" /> {t.type === 'income' ? 'ใบรับเงิน' : 'ใบสำคัญ'}
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {canWrite && (
                              <button onClick={() => toggleReconcile(t)} title={t.isReconciled ? 'กระทบยอดแล้ว' : 'คลิกเพื่อกระทบยอด'}
                                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                                  t.isReconciled ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 'text-slate-500 border border-white/10 hover:border-emerald-500/40'
                                }`}>
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canWrite && canEdit && (
                              <>
                                <button onClick={() => openEdit(t)} className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={() => del(t)} className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* ── Desktop: grouped grid ── */}
            <div className="hidden md:block">
              <div style={{ overflowX: 'auto' }}><div style={{ minWidth: 860 }}>
                <div className="grid items-center gap-4 px-6 py-3.5" style={{ gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1.1fr) 160px 130px 160px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['รายการ', 'หมวดหมู่', 'กระเป๋า', 'จำนวน', ''].map((h, i) => (
                    <div key={i} className="uppercase" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '1.5px', color: 'rgba(148,163,184,0.55)', textAlign: i === 3 ? 'right' : 'left' }}>{h}</div>
                  ))}
                </div>
                {groups.map(g => (
                  <div key={g.key}>
                    <div className="flex items-center gap-3 px-6 py-2.5" style={{ background: 'rgba(255,255,255,0.016)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontFamily: FONT_SERIF, fontSize: 14, color: '#d9e1ea', fontWeight: 600, whiteSpace: 'nowrap' }}>{date(g.key)}</span>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>{g.items.length} รายการ</span>
                      <span className="flex-1" style={{ height: 1, background: 'linear-gradient(90deg,rgba(255,255,255,0.07),transparent)' }} />
                      <span className="uppercase" style={{ fontSize: 10.5, letterSpacing: '1.5px', color: 'rgba(148,163,184,0.45)' }}>สุทธิ</span>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 500, color: g.net >= 0 ? 'rgba(110,231,199,0.92)' : 'rgba(251,154,168,0.92)', whiteSpace: 'nowrap' }}>{signedThb(g.net >= 0 ? 'income' : 'expense', Math.abs(g.net))}</span>
                    </div>
                    {g.items.map(t => {
                      const canEdit = user?.role === 'admin' || (user?.role === 'staff' && t.createdByUserId === user.id)
                      const canConfirmEdit = user?.role === 'admin' || t.createdByUserId === user?.id
                      return (
                        <div key={t.id} className="grid items-center gap-4 px-6 py-3.5 transition-colors hover:bg-white/[0.028]"
                          style={{ gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1.1fr) 160px 130px 160px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: t.isDraft ? 'rgba(251,191,36,0.04)' : (t.pendingChanges ? 'rgba(96,165,250,0.05)' : undefined) }}>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="truncate" style={{ fontSize: 14, color: '#eaf0f6', fontWeight: 500 }}>{t.name}</span>
                              {t.isDraft && <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full"><Clock className="w-2.5 h-2.5" /> Draft</span>}
                              {t.pendingChanges && <span className="flex items-center gap-1 text-xs text-blue-300 bg-blue-400/10 px-1.5 py-0.5 rounded-full"><Pencil className="w-2.5 h-2.5" /> แก้ไข</span>}
                            </div>
                            {t.note && t.note !== 'draft — รอยืนยัน' && <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>{t.note}</span>}
                            {t.submittedBy && (
                              <span className="inline-flex items-center gap-1.5" style={{ fontSize: 11.5, color: 'rgba(203,213,225,0.7)' }}>
                                <span className="flex items-center justify-center flex-none" style={{ width: 16, height: 16, borderRadius: '50%', fontSize: 8.5, fontWeight: 700, color: '#0a1410', background: 'linear-gradient(135deg,#6ee7c7,#5fb8d9)' }}>{t.submittedBy.slice(0, 1)}</span>
                                {t.submittedBy}
                              </span>
                            )}
                            {t.printedBy && <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.45)' }}>🖨️ {t.printedBy}{t.printCount > 1 ? ` ×${t.printCount}` : ''}</span>}
                          </div>
                          <div className="min-w-0">
                            {t.categoryName ? (
                              <div className="inline-flex items-center gap-1.5 max-w-full min-w-0">
                                <span className="flex-none" style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor(t) }} />
                                <span className="truncate" style={{ fontSize: 12.5, color: '#d3dbe5' }}>{t.categoryName}</span>
                                {t.subCategoryName && (
                                  <span className="inline-flex items-center gap-1 truncate min-w-0" style={{ fontSize: 11.5, color: 'rgba(148,163,184,0.55)' }}>
                                    <ChevronRight className="w-2.5 h-2.5 flex-none" style={{ color: 'rgba(148,163,184,0.4)' }} />{t.subCategoryName}
                                  </span>
                                )}
                              </div>
                            ) : <span style={{ color: 'rgba(148,163,184,0.35)', fontSize: 13 }}>ไม่ระบุ</span>}
                          </div>
                          <div className="min-w-0">
                            {t.walletName ? (
                              <span className="inline-flex items-center gap-1.5 max-w-full min-w-0">
                                <CreditCardIcon />
                                <span className="truncate" style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: 'rgba(203,213,225,0.78)' }}>{t.walletName}</span>
                              </span>
                            ) : <span style={{ color: 'rgba(148,163,184,0.35)' }}>-</span>}
                          </div>
                          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap" style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 14, color: t.type === 'income' ? '#34d399' : '#fb7185' }}>
                            {t.type === 'income' ? <ArrowUp className="w-3 h-3" strokeWidth={2.8} style={{ opacity: 0.85 }} /> : <ArrowDown className="w-3 h-3" strokeWidth={2.8} style={{ opacity: 0.85 }} />}
                            {thb(t.amount)}
                          </div>
                          <div className="flex items-center justify-end gap-0.5">
                            {canWrite && (
                              <button onClick={() => toggleReconcile(t)} title={t.isReconciled ? 'กระทบยอดแล้ว' : 'คลิกเพื่อกระทบยอด'}
                                className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${
                                  t.isReconciled ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'border-white/10 text-transparent hover:border-emerald-500/40 hover:text-emerald-500/60'
                                }`}>
                                <Check className="w-3 h-3" />
                              </button>
                            )}
                            {t.isDraft && canWrite && (
                              <button onClick={() => setConfirmTx(t)} title="ยืนยันรายการ Draft"
                                className="p-1.5 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!t.isDraft && t.pendingChanges && canConfirmEdit && (
                              <button onClick={() => setEditConfirmTx(t)} title="ยืนยันการแก้ไข"
                                className="p-1.5 text-blue-300 hover:text-blue-200 hover:bg-blue-500/10 rounded-lg transition-colors">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!t.isDraft && (
                              <button onClick={() => setSlipTx(t)} title="แนบสลิป/ใบเสร็จ"
                                className="p-1.5 text-slate-500 hover:text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition-colors">
                                <Paperclip className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!t.isDraft && canWrite && (t.type === 'expense' || t.type === 'income') && (
                              <button onClick={() => openVoucher(t)} title={t.type === 'income' ? 'ใบรับเงิน' : 'ใบสำคัญจ่าย'}
                                className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors">
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canWrite && canEdit && (
                              <>
                                <button onClick={() => openEdit(t)} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => del(t)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div></div>
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span style={{ fontSize: 12.5, color: 'rgba(148,163,184,0.7)' }}>
            แสดง <span style={{ fontFamily: FONT_MONO, color: '#cbd5e1' }}>{Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)}</span> จาก <span style={{ fontFamily: FONT_MONO, color: '#6ee7c7' }}>{total}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="flex items-center justify-center w-9 h-9 rounded-xl disabled:opacity-30 transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(203,213,225,0.7)' }} title="ก่อนหน้า">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="flex items-center justify-center min-w-9 h-9 px-3 rounded-xl" style={{ fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 600, color: '#06231a', background: 'linear-gradient(140deg,#5eead4,#10b981)' }}>{page}</span>
            <span className="px-1" style={{ fontSize: 12.5, color: 'rgba(148,163,184,0.6)' }}>/ {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="flex items-center justify-center w-9 h-9 rounded-xl disabled:opacity-30 transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(203,213,225,0.7)' }} title="ถัดไป">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      </div>

      {/* Form modal */}
      {showForm && (
        <Modal title={editing ? 'แก้ไขรายการ' : 'เพิ่มรายการ'} onClose={() => setShowForm(false)}>
          <form onSubmit={save} className="space-y-3">
            <div>
              <Label>ชื่อรายการ</Label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className={INPUT} style={INPUT_STYLE} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>ประเภท</Label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                  <option value="income">รายรับ</option>
                  <option value="expense">รายจ่าย</option>
                </select>
              </div>
              <div>
                <Label>Scope</Label>
                <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                  <option value="business">ธุรกิจ</option>
                  <option value="personal">ส่วนตัว</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>จำนวนเงิน (บาท)</Label>
                <input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required className={INPUT} style={INPUT_STYLE} />
              </div>
              <div>
                <Label>วันที่</Label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required className={INPUT} style={INPUT_STYLE} />
              </div>
            </div>
            <div>
              <Label>กระเป๋าเงิน</Label>
              <select value={form.walletId} onChange={e => setForm(f => ({ ...f, walletId: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                <option value="">เลือกอัตโนมัติ</option>
                {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <Label>หมวดหมู่หลัก</Label>
              <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value, subCategoryId: '' }))} className={INPUT} style={INPUT_STYLE}>
                <option value="">ไม่ระบุ</option>
                {mainCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {form.categoryId && subCatsOf(form.categoryId).length > 0 && (
              <div>
                <Label>หมวดย่อย</Label>
                <select value={form.subCategoryId} onChange={e => setForm(f => ({ ...f, subCategoryId: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                  <option value="">ไม่ระบุ</option>
                  {subCatsOf(form.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <Label>หมายเหตุ</Label>
              <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className={INPUT} style={INPUT_STYLE} />
            </div>
            {editing && (
              <div className="pt-1 border-t" style={{ borderColor: '#1f2937' }}>
                <InlineSlips txId={editing.id} isTransfer={!!editing.transferPairId} />
              </div>
            )}
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <button type="submit" disabled={saving}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors">
              {saving ? 'กำลังบันทึก...' : editing ? 'บันทึก' : 'บันทึก & แนบสลิป →'}
            </button>
            {!editing && (
              <p className="text-center text-xs text-slate-500">
                <Paperclip className="w-3 h-3 inline mr-1 text-yellow-400" />
                หลังบันทึก จะมีให้อัพโหลดสลิป/ใบเสร็จทันที
              </p>
            )}
          </form>
        </Modal>
      )}

      {showExport && <ExportModal onClose={() => setShowExport(false)} currentFilter={filter} currentSearch={debouncedSearch} defaultRange={txRangeOf(period, customRange)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={load} />}
      {slipTx && <SlipModal tx={slipTx} onClose={() => setSlipTx(null)} />}
      {confirmTx && <ConfirmDraftModal tx={confirmTx} onClose={() => setConfirmTx(null)} onDone={load} />}
      {editConfirmTx && <EditConfirmModal tx={editConfirmTx} cats={categories} wallets={wallets} onClose={() => setEditConfirmTx(null)} onDone={load} />}
    </div>
  )
}
