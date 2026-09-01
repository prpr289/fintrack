import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { GitMerge, X } from 'lucide-react'

// คู่ร้านที่น่าจะเป็นร้านเดียวกัน — ระบบเสนอ คนกดยืนยัน
//
// ทำไมไม่รวมให้อัตโนมัติ: รวมผิดแล้วประวัติสองร้านปนกัน แก้กลับยากมาก
// ตรวจจริงบน production 1 ก.ย. 69 พบ 130 คู่ กระทบ 161 จาก 351 ร้าน (46%)
//
// ⚠️ ตัวตรวจจับ "Siam Makro" กับ "แม็คโคร" ไม่ได้ (คนละภาษา ไม่มีเลขบัญชีให้ยึด)
// ร้านแบบนั้นต้องรวมด้วยมือจากหน้ารายละเอียดร้าน
const PANEL = { background: '#0d1120', border: '1px solid #1f2937' }

export default function MergeSuggestions({ onMerged }) {
  const [pairs, setPairs] = useState([])
  const [scanned, setScanned] = useState(0)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [dismissed, setDismissed] = useState([])

  const load = useCallback(() => {
    return api.vendorDuplicates(200)
      .then(d => { setPairs(d.pairs || []); setScanned(d.scanned || 0); setErr('') })
      .catch(e => setErr(e.message || 'ตรวจชื่อซ้ำไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const visible = pairs.filter(p => !dismissed.includes(p.drop.id + p.keep.id))

  const merge = async (p) => {
    if (!confirm(`รวม "${p.drop.vendorName}" เข้ากับ "${p.keep.vendorName}"?\n\nบิลและสินค้าของร้านแรกจะย้ายมาที่ร้านหลัง\nชื่อเดิมถูกเก็บไว้ (ปิดใช้งาน) เพื่อกันระบบสร้างซ้ำตอนอ่านสลิป`)) return
    setBusy(p.drop.id); setErr('')
    try {
      await api.mergeVendor(p.drop.id, p.keep.id)
      await load()
      onMerged?.()
    } catch (e) { setErr(e.message || 'รวมไม่สำเร็จ') } finally { setBusy('') }
  }

  if (loading) return null
  if (!visible.length && !err) return null

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#3a2e1233', border: '1px solid #78350f' }}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <GitMerge className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <span className="text-sm text-amber-300 flex-1">
          พบชื่อที่น่าจะเป็นร้านเดียวกัน <b className="tabular-nums">{visible.length}</b> คู่
          <span className="text-slate-500"> · จาก {scanned} ร้าน</span>
        </span>
        <span className="text-xs text-slate-400">{open ? 'ซ่อน' : 'ตรวจและรวม'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {err && <p className="text-xs text-red-400" role="alert">{err}</p>}
          {visible.slice(0, 20).map(p => (
            <div key={p.drop.id + p.keep.id} className="rounded-lg p-3" style={PANEL}>
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="text-slate-200">{p.keep.vendorName}</span>
                <span className="text-xs text-slate-500 tabular-nums">{p.keep.occurrenceCount} ครั้ง</span>
                <span className="text-slate-600">←</span>
                <span className="text-slate-400">{p.drop.vendorName}</span>
                <span className="text-xs text-slate-500 tabular-nums">{p.drop.occurrenceCount} ครั้ง</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full ml-auto"
                  style={{ background: p.score === 1 ? '#10b98122' : '#b4530922', color: p.score === 1 ? '#34d399' : '#f59e0b' }}>
                  {p.reason}
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => merge(p)} disabled={busy === p.drop.id}
                  className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50">
                  {busy === p.drop.id ? 'กำลังรวม...' : `รวมเข้า "${p.keep.vendorName}"`}
                </button>
                <button onClick={() => setDismissed(d => [...d, p.drop.id + p.keep.id])}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 flex items-center gap-1">
                  <X className="w-3 h-3" />คนละร้าน
                </button>
              </div>
            </div>
          ))}
          {visible.length > 20 && (
            <p className="text-xs text-slate-500">แสดง 20 คู่แรก · รวมเสร็จแล้วรายการจะอัปเดตให้เอง</p>
          )}
          <p className="text-[11px] text-slate-600 leading-relaxed">
            ตัวตรวจจับได้เฉพาะชื่อที่สะกดคล้ายกัน — ชื่อไทยกับอังกฤษของร้านเดียวกัน (เช่น Siam Makro กับ แม็คโคร)
            ต้องรวมด้วยมือจากหน้ารายละเอียดร้าน
          </p>
        </div>
      )}
    </div>
  )
}
