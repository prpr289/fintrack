import { useState, useMemo, useRef, useEffect } from 'react'
import { api } from '../api'
import { Search, Store, X, Plus, Landmark } from 'lucide-react'
import { searchMerchants } from '../../merchant-search.mjs'

const INPUT = 'w-full rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }

// ponytail: กรองในเครื่องจากลิสต์ที่โหลดมาแล้ว (เพดาน 200 ร้านจาก API)
// ถ้าเกินนั้นค่อยเปลี่ยนไปยิง /vendor-profiles?q= แบบ debounce
export default function MerchantPicker({ vendors, value, onChange, canCreate = false, onCreated, label = 'ร้านค้า/ซัพพลายเออร์' }) {
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState('')
  const box = useRef(null)

  const selected = vendors.find(v => v.id === value) || null
  const matches = useMemo(() => searchMerchants(vendors, term), [vendors, term])

  useEffect(() => {
    if (!open) return
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const pick = (v) => { onChange(v.id); setOpen(false); setTerm('') }

  const quickAdd = async () => {
    const name = term.trim()
    if (!name) return
    setCreating(true); setErr('')
    try {
      const res = await api.createMerchant({ vendorName: name })
      onCreated?.(res.vendor)
      pick(res.vendor)
    } catch (e) { setErr(e.message) } finally { setCreating(false) }
  }

  if (selected && !open) {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
        <div className="rounded-lg p-3" style={{ background: '#0d1120', border: '1px solid rgba(16,185,129,0.3)' }}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-200 truncate">{selected.vendorName}</p>
              {selected.typicalCategoryName && (
                <p className="text-xs text-slate-500 mt-0.5">{selected.typicalCategoryName}
                  {selected.typicalSubCategoryName && <span className="text-slate-600"> › {selected.typicalSubCategoryName}</span>}</p>
              )}
            </div>
            <button type="button" onClick={() => { setOpen(true); setTerm('') }}
              className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 flex-shrink-0">เปลี่ยน</button>
          </div>
          {selected.bankAccountNo ? (
            <div className="flex items-center gap-2 mt-2.5 pt-2.5" style={{ borderTop: '1px solid #1f2937' }}>
              <Landmark className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              <span className="text-xs text-slate-400">{selected.bankName || 'บัญชีปลายทาง'}</span>
              <span className="text-sm text-emerald-400 font-mono tabular-nums">{selected.bankAccountNo}</span>
            </div>
          ) : (
            <p className="text-xs text-amber-400 mt-2.5 pt-2.5" style={{ borderTop: '1px solid #1f2937' }}>
              ยังไม่มีเลขบัญชีของร้านนี้ — เพิ่มได้ที่เมนูร้านค้า
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={box}>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input value={term} onChange={e => { setTerm(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
          placeholder="พิมพ์ชื่อร้าน / เลขบัญชี / เลขภาษี…" aria-label="ค้นหาร้านค้า"
          className={INPUT} style={INPUT_STYLE} />
        {selected && (
          <button type="button" onClick={() => setOpen(false)} aria-label="ยกเลิกการค้นหา"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
        )}
      </div>

      {open && (
        <div className="mt-1 rounded-lg overflow-hidden" style={{ background: '#1e2130', border: '1px solid #2e3349' }} role="listbox">
          <div className="max-h-52 overflow-y-auto">
            {matches.length === 0 ? (
              <p className="px-3 py-4 text-xs text-slate-500 text-center">
                {term.trim() ? 'ไม่พบร้านค้าที่ค้นหา' : 'ยังไม่มีร้านค้าในระบบ'}
              </p>
            ) : matches.map(v => (
              <button type="button" key={v.id} onClick={() => pick(v)} role="option" aria-selected={v.id === value}
                className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <span className="flex items-center gap-2">
                  <Store className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                  <span className="text-sm text-slate-200 truncate">{v.vendorName}</span>
                </span>
                <span className="block text-xs text-slate-500 mt-0.5 pl-5.5 truncate">
                  {v.typicalCategoryName || 'ไม่ระบุหมวด'}
                  {v.bankAccountNo && <span className="font-mono tabular-nums"> · {v.bankName || 'บัญชี'} {v.bankAccountNo}</span>}
                </span>
              </button>
            ))}
          </div>
          {canCreate && term.trim() && !matches.some(v => v.vendorName.toLowerCase() === term.trim().toLowerCase()) && (
            <button type="button" onClick={quickAdd} disabled={creating}
              className="w-full text-left px-3 py-2.5 text-sm text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 flex items-center gap-2"
              style={{ borderTop: '1px solid #2e3349' }}>
              <Plus className="w-4 h-4" />{creating ? 'กำลังเพิ่ม...' : `เพิ่มร้านใหม่ "${term.trim()}"`}
            </button>
          )}
        </div>
      )}
      {err && <p className="text-xs text-red-400 mt-1" role="alert">{err}</p>}
    </div>
  )
}
