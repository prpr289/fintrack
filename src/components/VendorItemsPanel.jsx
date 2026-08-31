import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { Plus, X, Package, Loader2, EyeOff, Eye } from 'lucide-react'
import { normalizeUnit } from '../parseOrderText.js'

// ตะกร้าสินค้าประจำของคู่ค้ารายนี้
// โตเองทุกครั้งที่ออกใบ แต่กรอกล่วงหน้าได้ด้วย — จำเป็นสำหรับคู่ค้าเก่าที่ซื้อกันมานาน
// แต่ระบบยังไม่รู้จักสักรายการ เพราะประวัติเดิมอยู่ในกระดาษกับแชท
const PANEL = { background: '#0d1120', border: '1px solid #1f2937' }
const INPUT_STYLE = { background: '#0d1120' }
const thb = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtDate(s) {
  if (!s) return null
  try {
    const d = new Date(String(s).replace(' ', 'T') + 'Z')
    return isNaN(d) ? null : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })
  } catch { return null }
}

export default function VendorItemsPanel({ vendorId, isAdmin }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showHidden, setShowHidden] = useState(false)
  const [err, setErr] = useState('')
  const [draft, setDraft] = useState({ name: '', unit: 'กก.', lastPrice: '' })
  const [busy, setBusy] = useState(false)

  // ไม่ setState ตรง ๆ ในตัว effect — ให้ทุกการอัปเดตเกิดใน .then/.catch เท่านั้น
  // (setState แบบ synchronous ใน effect ทำให้ React render ซ้อนกันโดยไม่จำเป็น)
  // ผลพลอยได้: ตอนโหลดซ้ำจะเห็นของเดิมค้างไว้แทนจอว่าง ซึ่งอ่านง่ายกว่า
  const load = useCallback(() => {
    return api.vendorItems(vendorId, { all: showHidden })
      .then(d => { setItems(d.items || []); setErr('') })
      .catch(e => setErr(e.message || 'โหลดรายการไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [vendorId, showHidden])

  useEffect(() => { load() }, [load])

  const add = async (e) => {
    e.preventDefault()
    if (!draft.name.trim()) return
    setBusy(true); setErr('')
    try {
      await api.createVendorItem(vendorId, {
        name: draft.name.trim(),
        unit: normalizeUnit(draft.unit),
        lastPrice: draft.lastPrice === '' ? null : Number(draft.lastPrice),
      })
      setDraft({ name: '', unit: 'กก.', lastPrice: '' })
      await load()
    } catch (e2) { setErr(e2.message || 'เพิ่มไม่สำเร็จ') } finally { setBusy(false) }
  }

  const toggle = async (it) => {
    try { await api.updateVendorItem(it.id, { isActive: !it.isActive }); await load() }
    catch (e) { setErr(e.message || 'แก้ไม่สำเร็จ') }
  }

  const remove = async (it) => {
    if (!confirm(`ลบ "${it.name}" ออกจากรายการประจำ?\n(บิลเก่าที่มีของชิ้นนี้ไม่กระทบ)`)) return
    try { await api.deleteVendorItem(it.id); await load() }
    catch (e) { setErr(e.message || 'ลบไม่สำเร็จ') }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={PANEL}>
      <div className="px-4 py-3 flex items-center justify-between gap-2 border-b" style={{ borderColor: '#1f2937' }}>
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-slate-200">สินค้าที่ซื้อประจำ</span>
          {!loading && <span className="text-xs text-slate-500 tabular-nums">{items.length} รายการ</span>}
        </div>
        <button onClick={() => setShowHidden(v => !v)} className="text-xs text-slate-400 flex items-center gap-1">
          {showHidden ? <><Eye className="w-3.5 h-3.5" />รวมที่ซ่อน</> : <><EyeOff className="w-3.5 h-3.5" />เฉพาะที่ใช้</>}
        </button>
      </div>

      {loading ? (
        <p className="px-4 py-4 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />กำลังโหลด...</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">
          ยังไม่มีรายการ — เพิ่มของที่ซื้อประจำไว้ก่อนได้เลย ไม่ต้องรอออกใบจริง
        </p>
      ) : (
        <div className="divide-y" style={{ borderColor: '#1f2937' }}>
          {items.map(it => (
            <div key={it.id} className="px-4 py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className={`text-sm truncate ${it.isActive ? 'text-slate-200' : 'text-slate-500 line-through'}`}>{it.name}</p>
                <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                  {it.unit || '—'}
                  {it.timesBought > 0 ? ` · ซื้อ ${it.timesBought} ครั้ง` : ' · ยังไม่เคยซื้อ'}
                  {fmtDate(it.lastBoughtAt) ? ` · ล่าสุด ${fmtDate(it.lastBoughtAt)}` : ''}
                </p>
              </div>
              <span className="text-sm text-slate-200 tabular-nums text-right flex-shrink-0 w-20">
                {it.lastPrice == null ? '—' : thb(it.lastPrice)}
              </span>
              <button onClick={() => toggle(it)} title={it.isActive ? 'ซ่อน' : 'เอากลับมาใช้'} className="shrink-0 text-slate-500 hover:text-slate-300">
                {it.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              {isAdmin && (
                <button onClick={() => remove(it)} title="ลบถาวร" className="shrink-0 text-slate-600 hover:text-red-400">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={add} className="px-4 py-3 border-t flex gap-1.5 items-center flex-wrap" style={{ borderColor: '#1f2937' }}>
        <input className="flex-1 min-w-[8rem] rounded-md px-2 py-1.5 text-xs text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500"
          style={INPUT_STYLE} placeholder="ชื่อสินค้า" value={draft.name} maxLength={120}
          onChange={e => setDraft({ ...draft, name: e.target.value })} />
        <input className="w-16 rounded-md px-2 py-1.5 text-xs text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500"
          style={INPUT_STYLE} placeholder="หน่วย" value={draft.unit} maxLength={20}
          onChange={e => setDraft({ ...draft, unit: e.target.value })} />
        <input className="w-20 rounded-md px-2 py-1.5 text-xs text-slate-200 border border-slate-600 text-right focus:outline-none focus:border-emerald-500"
          style={INPUT_STYLE} type="number" min="0" step="0.01" inputMode="decimal" placeholder="ราคา"
          value={draft.lastPrice} onChange={e => setDraft({ ...draft, lastPrice: e.target.value })} />
        <button type="submit" disabled={busy || !draft.name.trim()}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-40"
          style={{ color: '#34d399', background: '#10b98115' }}>
          <Plus className="w-3.5 h-3.5" />เพิ่ม
        </button>
      </form>

      {err && <p className="px-4 pb-3 text-xs text-red-400" role="alert">{err}</p>}
    </div>
  )
}
