import { useEffect, useState, useCallback } from 'react'
import JSZip from 'jszip'
import { api } from '../api'
import { thb, ymd } from '../fmt'
import { Loader2, Eye, X, ImagePlus, ChevronLeft, ChevronRight, Paperclip, Download } from 'lucide-react'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const MONTH_NAMES = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500'
const INPUT_BG = { background: '#0d1120' }

function SlipCard({ slip, onDelete }) {
  const [loading, setLoading] = useState(false)
  const [blobUrl, setBlobUrl] = useState(null)
  const isPdf = slip.mimeType === 'application/pdf'
  const isTransfer = slip.slipType === 'transfer'

  const view = async () => {
    if (blobUrl) { window.open(blobUrl, '_blank'); return }
    setLoading(true)
    try {
      const url = await api.fetchSlipBlob(slip.id)
      setBlobUrl(url)
      window.open(url, '_blank')
    } catch (e) { alert(e.message) } finally { setLoading(false) }
  }

  return (
    <div className="relative group rounded-xl overflow-hidden flex flex-col" style={{ background: '#0d1120', border: '1px solid #2e3349' }}>
      <button onClick={view} className="flex-1 p-4 flex flex-col items-center gap-2 hover:bg-white/5 transition-colors">
        {loading
          ? <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
          : isPdf
            ? <div className="text-3xl font-bold text-red-400 py-2">PDF</div>
            : <ImagePlus className="w-8 h-8 text-slate-600" />
        }
        <div className="text-center w-full">
          <p className="text-xs text-slate-300 truncate">{slip.fileName}</p>
          <span className="inline-block text-xs px-2 py-0.5 rounded-full mt-1"
            style={{ color: isTransfer ? '#60a5fa' : '#34d399', background: isTransfer ? 'rgba(96,165,250,0.1)' : 'rgba(52,211,153,0.1)' }}>
            {isTransfer ? 'สลิปโอน' : 'ใบเสร็จ'}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-400 mt-auto">
          <Eye className="w-3 h-3" /> กดดู
        </div>
      </button>
      {onDelete && (
        <button onClick={() => onDelete(slip.id)}
          aria-label="ลบสลิป" title="ลบสลิป"
          className="absolute top-2 right-2 min-w-[40px] min-h-[40px] rounded-full bg-red-500/80 text-white flex items-center justify-center transition-opacity">
          <X className="w-4 h-4" />
        </button>
      )}
      <div className="px-3 pb-3 text-center">
        <p className="text-xs text-slate-400 truncate">{slip.txName}</p>
        <p className={`text-xs font-semibold mt-0.5 tabular-nums ${slip.txType === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
          {slip.txType === 'income' ? '+' : '-'}{thb(slip.txAmount)}
        </p>
      </div>
    </div>
  )
}

function DownloadModal({ currentYear, currentMonth, onClose }) {
  const now = new Date()
  const todayStr = ymd(now)
  const pad = n => String(n).padStart(2, '0')
  const firstOfMonth = `${currentYear}-${pad(currentMonth)}-01`
  const lastOfMonth = ymd(new Date(currentYear, currentMonth, 0))

  const [preset, setPreset] = useState('month')
  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(lastOfMonth)
  const [progress, setProgress] = useState(null)
  const [progressLabel, setProgressLabel] = useState('')
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  const dateRange = preset === 'today'
    ? { from: todayStr, to: todayStr }
    : preset === 'month'
      ? { from: firstOfMonth, to: lastOfMonth }
      : { from, to }

  const download = async () => {
    setProgress(0)
    setProgressLabel('กำลังโหลดรายการสลิป...')
    setErr('')
    setDone(false)
    try {
      const d = await api.allSlips({ from: dateRange.from, to: dateRange.to })
      const slips = d.slips || []
      if (slips.length === 0) {
        setErr('ไม่มีสลิปในช่วงวันที่นี้')
        setProgress(null)
        return
      }

      const zip = new JSZip()
      const total = slips.length
      let fetched = 0

      // Concurrency limit of 3
      const queue = [...slips]
      const worker = async () => {
        while (queue.length > 0) {
          const slip = queue.shift()
          try {
            const blob = await api.downloadSlipBlob(slip.id)
            const folder = slip.txDate || 'unknown'
            const safeName = (slip.fileName || `slip-${slip.id}`).replace(/[/\\?%*:|"<>]/g, '-')
            zip.folder(folder).file(safeName, blob)
          } catch {
            // Skip files that fail to load
          }
          fetched++
          const pct = Math.round((fetched / total) * 85)
          setProgress(pct)
          setProgressLabel(`โหลดไฟล์ ${fetched}/${total}...`)
        }
      }

      await Promise.all([worker(), worker(), worker()])

      setProgress(92)
      setProgressLabel('กำลังสร้างไฟล์ ZIP...')
      const content = await zip.generateAsync({ type: 'blob' })

      setProgress(100)
      setProgressLabel('เสร็จแล้ว!')

      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `slips-${dateRange.from}-to-${dateRange.to}.zip`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)

      setDone(true)
    } catch (e) {
      setErr(e.message)
      setProgress(null)
    }
  }

  const presets = [
    ['today', 'วันนี้'],
    ['month', `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`],
    ['custom', 'กำหนดเอง'],
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm rounded-2xl p-5 space-y-4" style={{ background: '#161b2e', border: '1px solid #2e3349' }}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-200 flex items-center gap-2">
            <Download className="w-4 h-4 text-emerald-400" /> ดาวน์โหลดสลิป ZIP
          </h3>
          <button onClick={onClose} aria-label="ปิด" title="ปิด" className="text-slate-400 hover:text-slate-300 p-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <p className="text-xs text-slate-400 mb-2">เลือกช่วงเวลา</p>
          <div className="grid grid-cols-3 gap-2">
            {presets.map(([val, label]) => (
              <button key={val} onClick={() => setPreset(val)} disabled={progress !== null}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${preset === val ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                style={{ border: `1px solid ${preset === val ? '#059669' : '#374151'}`, background: preset === val ? '#059669' : '#0d1120' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1.5">จากวันที่</p>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                disabled={progress !== null} className={INPUT} style={INPUT_BG} />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1.5">ถึงวันที่</p>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                disabled={progress !== null} className={INPUT} style={INPUT_BG} />
            </div>
          </div>
        )}

        {progress !== null && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>{progressLabel}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: '#1f2937' }}>
              <div className="h-2 rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {err && <p className="text-red-400 text-xs">{err}</p>}

        {done ? (
          <button onClick={onClose}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
            ปิด
          </button>
        ) : (
          <button onClick={download} disabled={progress !== null}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
            {progress !== null
              ? <><Loader2 className="w-4 h-4 animate-spin" /> กำลังดาวน์โหลด...</>
              : <><Download className="w-4 h-4" /> ดาวน์โหลด ZIP</>
            }
          </button>
        )}
      </div>
    </div>
  )
}

export default function SlipsGallery() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [slips, setSlips] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDownload, setShowDownload] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api.allSlips({ year, month })
      setSlips(d.slips || [])
    } finally { setLoading(false) }
  }, [year, month])

  useEffect(() => { load() }, [load])

  const handleDelete = async (slipId) => {
    if (!confirm('ลบไฟล์นี้?')) return
    try {
      await api.deleteSlip(slipId)
      setSlips(s => s.filter(x => x.id !== slipId))
    } catch (e) { alert(e.message) }
  }

  const byDate = {}
  slips.forEach(s => {
    const d = s.txDate || 'ไม่ระบุวันที่'
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(s)
  })
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  const fmtDate = (dateStr) => {
    if (!dateStr || dateStr === 'ไม่ระบุวันที่') return dateStr
    const [y, m, d] = dateStr.split('-')
    return `${parseInt(d)} ${MONTH_NAMES[parseInt(m) - 1]} ${y}`
  }

  return (
    <div className="slips-page p-4 sm:p-5 space-y-4">
      <style>{`
        .slips-page button:focus-visible, .slips-page input:focus-visible, .slips-page select:focus-visible {
          outline: 2px solid rgba(16,185,129,0.55); outline-offset: 2px; border-radius: 0.5rem;
        }
        @media (prefers-reduced-motion: reduce) {
          .slips-page *, .slips-page *::before, .slips-page *::after {
            animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
          }
        }
      `}</style>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-900/30"
            style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            <Paperclip className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white leading-tight">สลิปทั้งหมด</h2>
            <p className="text-sm text-slate-500 mt-0.5">รวม <span className="tabular-nums">{slips.length}</span> ไฟล์ · {MONTH_NAMES[month - 1]} {year}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Download button */}
          <button onClick={() => setShowDownload(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-emerald-400 rounded-lg transition-colors hover:bg-emerald-500/10"
            style={{ border: '1px solid rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.05)' }}>
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">ดาวน์โหลด ZIP</span>
            <span className="sm:hidden">ZIP</span>
          </button>

          {/* Month/Year navigator */}
          <button onClick={() => {
            const prev = month === 1 ? { m: 12, y: year - 1 } : { m: month - 1, y: year }
            setMonth(prev.m); setYear(prev.y)
          }} aria-label="เดือนก่อนหน้า" title="เดือนก่อนหน้า" className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors" style={{ border: '1px solid #2e3349', background: '#161b2e' }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500"
            style={{ background: '#0d1120' }}>
            {MONTH_NAMES.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500"
            style={{ background: '#0d1120' }}>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => {
            const next = month === 12 ? { m: 1, y: year + 1 } : { m: month + 1, y: year }
            setMonth(next.m); setYear(next.y)
          }} aria-label="เดือนถัดไป" title="เดือนถัดไป" className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors" style={{ border: '1px solid #2e3349', background: '#161b2e' }}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-xl p-3 text-xs text-slate-500" style={CARD}>
        <Paperclip className="w-3 h-3 inline mr-1.5 text-yellow-400" />
        แนบสลิปได้ที่หน้า <span className="text-slate-300">รายการธุรกรรม</span> — กดปุ่ม <span className="text-yellow-400 font-medium">📎 สลิป</span> ในแต่ละรายการ
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
        </div>
      ) : slips.length === 0 ? (
        <div className="rounded-xl p-12 text-center flex flex-col items-center gap-2" style={CARD}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-1" style={{ background: '#0d1120', border: '1px solid #2e3349' }}>
            <Paperclip className="w-6 h-6 text-slate-600" />
          </div>
          <p className="text-slate-400 text-sm font-medium">ยังไม่มีสลิปใน{MONTH_NAMES[month - 1]}นี้</p>
          <p className="text-slate-600 text-xs mt-1">ไปที่หน้ารายการธุรกรรม แล้วกดปุ่ม 📎 เพื่อแนบสลิป</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map(dateStr => (
            <div key={dateStr}>
              <div className="flex items-center gap-3 mb-3">
                <div className="text-sm font-semibold text-slate-300">{fmtDate(dateStr)}</div>
                <div className="flex-1 h-px" style={{ background: '#1f2937' }} />
                <span className="text-xs text-slate-400 tabular-nums">{byDate[dateStr].length} ไฟล์</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {byDate[dateStr].map(s => (
                  <SlipCard key={s.id} slip={s} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showDownload && (
        <DownloadModal
          currentYear={year}
          currentMonth={month}
          onClose={() => setShowDownload(false)}
        />
      )}
    </div>
  )
}
