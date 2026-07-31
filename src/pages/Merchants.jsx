import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import MerchantModal from '../components/MerchantModal'
import DocBadge from '../components/DocBadge'
import { Search, Store, Loader2, Plus, ChevronRight, Landmark } from 'lucide-react'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }

export default function Merchants() {
  const [merchants, setMerchants] = useState([])
  const [cats, setCats] = useState([])
  const [wallets, setWallets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [md, cd, wd] = await Promise.all([api.merchants(debounced), api.categories(), api.wallets()])
      setMerchants(md.vendors || [])
      setCats(cd.categories || [])
      setWallets(wd.wallets || [])
    } finally { setLoading(false) }
  }, [debounced])

  useEffect(() => { load() }, [load])

  const fmtDate = (s) => s ? new Date(s).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' }) : '-'

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
          <p className="text-sm text-slate-500 mt-0.5">ข้อมูลร้าน · บัญชีรับเงิน · เอกสารภาษี — ใช้เติมอัตโนมัติตอนแจ้งบิล</p>
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" /><span className="hidden sm:inline">เพิ่มร้านค้า</span>
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหา ชื่อร้าน / เลขผู้เสียภาษี / เลขบัญชี / เบอร์โทร…" aria-label="ค้นหาร้านค้า"
          className="w-full rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 border border-slate-700 focus:outline-none focus:border-emerald-500"
          style={{ background: '#0d1120' }} />
      </div>

      <div className="rounded-xl overflow-hidden" style={CARD}>
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-5 h-5 text-emerald-500 animate-spin mx-auto" /></div>
        ) : merchants.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-1" style={{ background: '#0d1120', border: '1px solid #2e3349' }}>
              <Store className="w-6 h-6 text-slate-600" />
            </div>
            <p className="text-slate-300 text-sm font-medium">{debounced ? 'ไม่พบร้านค้าที่ค้นหา' : 'ยังไม่มีร้านค้า'}</p>
            <button onClick={() => setAdding(true)} className="text-emerald-400 hover:text-emerald-300 text-sm font-medium mt-1">
              + เพิ่มร้านใหม่{debounced ? ` "${debounced}"` : ''}
            </button>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#1a2035' }}>
            {merchants.map(m => (
              <Link key={m.id} to={`/merchants/${m.id}`}
                className="flex items-center gap-3 p-4 hover:bg-white/[0.02] transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-200 text-sm truncate">{m.vendorName}</p>
                    <DocBadge docType={m.docType} short />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-1">
                    <span>{m.typicalCategoryName || 'ไม่ระบุหมวด'}
                      {m.typicalSubCategoryName && <span className="text-slate-600"> › {m.typicalSubCategoryName}</span>}</span>
                    {m.bankAccountNo && (
                      <span className="flex items-center gap-1">· <Landmark className="w-3 h-3" />
                        {m.bankName || 'บัญชี'} <span className="font-mono tabular-nums">{m.bankAccountNo}</span></span>
                    )}
                    {m.taxId && <span className="font-mono tabular-nums">· ภาษี {m.taxId}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 hidden sm:block">
                  <p className="text-xs text-slate-400 tabular-nums">เจอ {m.occurrenceCount || 0} ครั้ง</p>
                  <p className="text-xs text-slate-600 mt-0.5">ล่าสุด {fmtDate(m.lastSeen)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {!loading && merchants.length > 0 && (
        <p className="text-xs text-slate-600">{merchants.length} ร้าน</p>
      )}

      {adding && <MerchantModal merchant={null} cats={cats} wallets={wallets} onClose={() => setAdding(false)} onDone={load} />}
    </div>
  )
}
