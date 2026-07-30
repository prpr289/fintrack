import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { Plus, X, Receipt, AlertTriangle, FileText, Truck, Camera, PackageCheck } from 'lucide-react'
import { isWeakEvidence, weakRatioByUser, duplicateIds, sumLineItems } from '../../pending-bills-logic.mjs'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }
const thb = (n) => '฿' + Number(n || 0).toLocaleString('th-TH')

const EVIDENCE_TIERS = [
  ['slip_transfer', 'โอน / PromptPay', 'แข็ง'],
  ['receipt', 'เงินสด + ใบเสร็จ', 'แข็ง'],
  ['self_declared', 'เงินสด ตลาดสด (ไม่มีบิล)', 'อ่อน'],
]

function Overlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="w-full sm:max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
        style={{ background: '#161b2e', border: '1px solid #2e3349' }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function SubmitBillModal({ me, onClose, onDone }) {
  const [categories, setCategories] = useState([])
  const [vendors, setVendors] = useState([])
  const [form, setForm] = useState({ name: '', amount: '', scope: 'business', categoryId: '', note: '', payeeType: 'employee', vendorRefId: '', evidenceType: 'slip_transfer', isDeposit: false })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { api.categories().then(d => setCategories(d.categories || d || [])).catch(() => {}) }, [])
  useEffect(() => { api.vendorProfiles().then(d => setVendors(d.vendors || [])).catch(() => {}) }, [])
  const weak = isWeakEvidence(form.evidenceType)
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (!file) { setErr('ต้องแนบรูปหลักฐาน'); return }
    if (form.payeeType === 'vendor' && !form.vendorRefId) { setErr('เลือกร้านค้าปลายทาง'); return }
    setSaving(true)
    const body = { name: form.name, amount: Number(form.amount), scope: form.scope, note: form.note || undefined,
      categoryId: form.categoryId || undefined, payeeType: form.payeeType,
      payeeRefId: form.payeeType === 'employee' ? me.id : form.vendorRefId, evidenceType: form.evidenceType,
      isDeposit: form.isDeposit }
    let created = null
    try {
      const res = await api.createPendingBill(body)
      created = res.bill
      await api.uploadBillEvidence(created.id, file)
      onDone(); onClose()
    } catch (e) {
      if (created) { try { await api.deletePendingBill(created.id) } catch {} }
      setErr(e.message)
    } finally { setSaving(false) }
  }
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="font-semibold text-slate-100">แจ้งบิลรอจ่าย</h3>
        <button onClick={onClose} aria-label="ปิด"><X className="w-5 h-5 text-slate-400" /></button>
      </div>
      <form onSubmit={submit} className="p-4 space-y-3 overflow-y-auto">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">ชื่อรายการ</label>
          <input className={INPUT} style={INPUT_STYLE} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">จำนวนเงิน</label>
            <input className={INPUT} style={INPUT_STYLE} type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">ขอบเขต</label>
            <select className={INPUT} style={INPUT_STYLE} value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}>
              <option value="business">ธุรกิจ</option><option value="personal">ส่วนตัว</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">หมวดหมู่</label>
          <select className={INPUT} style={INPUT_STYLE} value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">— ไม่ระบุ —</option>
            {categories.filter(c => !c.parentId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">ปลายทางการโอน</label>
          <select className={INPUT} style={INPUT_STYLE} value={form.payeeType}
            onChange={e => setForm({ ...form, payeeType: e.target.value, vendorRefId: '' })}>
            <option value="employee">ตัวเอง (สำรองจ่าย)</option>
            <option value="vendor">ร้านค้า/ซัพพลายเออร์</option>
          </select>
        </div>
        {form.payeeType === 'vendor' && (
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">เลือกร้านค้า/ซัพพลายเออร์</label>
            <select className={INPUT} style={INPUT_STYLE} value={form.vendorRefId} onChange={e => setForm({ ...form, vendorRefId: e.target.value })}>
              <option value="">— เลือกร้านค้า —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.vendorName}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">จ่ายด้วยวิธีไหน</label>
          <div className="space-y-2">
            {EVIDENCE_TIERS.map(([v, label, strength]) => (
              <button type="button" key={v} aria-pressed={form.evidenceType === v} onClick={() => setForm({ ...form, evidenceType: v })}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm border transition-colors"
                style={{ borderColor: form.evidenceType === v ? '#10b981' : '#2e3349', color: '#e2e8f0', background: form.evidenceType === v ? '#10b98115' : 'transparent' }}>
                <span>{label}</span>
                <span className="text-xs" style={{ color: strength === 'อ่อน' ? '#f59e0b' : '#34d399' }}>หลักฐาน{strength}</span>
              </button>
            ))}
          </div>
          {weak && <p className="text-xs text-amber-400 mt-2">ตลาดสดไม่มีบิล: บังคับแนบรูปของ · ยอดเกิน ฿1,000 ต้องจ่ายแบบโอน · ระบบจะออกใบรับรองแทนใบเสร็จให้</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">แนบรูปหลักฐาน{weak ? ' (รูปของ)' : ''}</label>
          <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)}
            className="block w-full text-xs text-slate-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">หมายเหตุ</label>
          <input className={INPUT} style={INPUT_STYLE} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.isDeposit} onChange={e => setForm({ ...form, isDeposit: e.target.checked })} />
          มัดจำ/จ่ายก่อนของมา
        </label>
        {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
        <button type="submit" disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors">
          {saving ? 'กำลังส่ง...' : 'ส่งบิลรอจ่าย'}
        </button>
      </form>
    </Overlay>
  )
}

function SignaturePad({ onChange }) {
  const ref = useRef(null); const drawing = useRef(false)
  const pos = (e) => { const c = ref.current, r = c.getBoundingClientRect(); const t = e.touches?.[0] || e; return [t.clientX - r.left, t.clientY - r.top] }
  const start = (e) => { e.preventDefault(); drawing.current = true; const ctx = ref.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...pos(e)) }
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const ctx = ref.current.getContext('2d'); ctx.lineTo(...pos(e)); ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke() }
  const end = () => { if (!drawing.current) return; drawing.current = false; ref.current.toBlob(b => onChange(b), 'image/png') }
  const clear = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); onChange(null) }
  return (
    <div>
      <canvas ref={ref} width={300} height={90} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
        style={{ width: '100%', height: 90, background: '#0d1120', border: '1px solid #2e3349', borderRadius: 8, touchAction: 'none' }} />
      <button type="button" onClick={clear} className="text-xs text-slate-500 mt-1">ล้าง เซ็นใหม่</button>
    </div>
  )
}

function emptyLineItem() { return { name: '', qty: '', unit: 'กก.', unitPrice: '' } }

function GoodsReceiptModal({ me, onClose, onDone }) {
  const [vendors, setVendors] = useState([])
  const [vendorId, setVendorId] = useState('')
  const [items, setItems] = useState([emptyLineItem()])
  const [photo, setPhoto] = useState(null)
  const [sigBlob, setSigBlob] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [created, setCreated] = useState(null) // {id, publicToken} once the bill exists — avoids creating a duplicate on retry
  const [qr, setQr] = useState(null) // {url, dataUrl} once evidence+signature are both safely uploaded
  const [receivedAt] = useState(() => new Date())
  useEffect(() => { api.vendorProfiles().then(d => setVendors(d.vendors || [])).catch(() => {}) }, [])

  const vendor = vendors.find(v => v.id === vendorId)
  const validItems = items.filter(it => String(it.name || '').trim() && Number(it.qty) > 0 && Number(it.unitPrice) >= 0)
  const total = sumLineItems(validItems)

  const updateItem = (idx, next) => setItems(prev => prev.map((it, i) => i === idx ? next : it))
  const addItem = () => setItems(prev => [...prev, emptyLineItem()])
  const removeItem = (idx) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (!vendorId) { setErr('เลือกผู้ขายก่อน'); return }
    if (validItems.length === 0) { setErr('ต้องมีอย่างน้อย 1 รายการที่กรอกครบ (ชื่อ · จำนวน · ราคา/หน่วย)'); return }
    if (!photo) { setErr('ต้องแนบรูปของที่รับ'); return }
    if (!sigBlob) { setErr('ต้องให้ผู้ขายเซ็นรับทราบยอดก่อน'); return }
    setSaving(true)
    try {
      let bill = created
      if (!bill) {
        const res = await api.createPendingBill({
          kind: 'goods_receipt', name: 'รับของ ' + (vendor?.vendorName || ''), amount: total,
          scope: 'business', payeeType: 'vendor', payeeRefId: vendorId, evidenceType: 'receipt', lineItems: validItems,
        })
        bill = res.bill
        setCreated(bill)
      }
      if (photo) {
        await api.uploadBillEvidence(bill.id, photo)
      }
      await api.uploadVendorSignature(bill.id, sigBlob)
      const url = `${window.location.origin}/receipt/${bill.publicToken}`
      const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 })
      setQr({ url, dataUrl })
    } catch (e2) {
      setErr(created
        ? `สร้างใบตรวจรับไว้แล้ว แต่ ${e2.message || 'อัปโหลดลายเซ็นไม่สำเร็จ'} — กด "ลองอีกครั้ง" เพื่อลองใหม่ (ไม่สร้างใบซ้ำ)`
        : (e2.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่'))
    } finally { setSaving(false) }
  }

  const finish = () => { onDone(); onClose() }

  if (qr) {
    return (
      <Overlay onClose={finish}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="font-semibold text-slate-100">ตรวจรับสำเร็จ</h3>
          <button onClick={finish} aria-label="ปิด"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 flex flex-col items-center gap-3 overflow-y-auto">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#10b98122', color: '#34d399' }}>
            <PackageCheck className="w-5 h-5" />
          </div>
          <p className="text-sm text-slate-200 text-center">
            รับของจาก <span className="font-semibold">{vendor?.vendorName}</span> · {thb(total)}<br />ส่งเข้าคิวรอจ่ายแล้ว
          </p>
          <img src={qr.dataUrl} alt="QR ใบรับของ" className="rounded-lg" style={{ width: 180, height: 180 }} />
          <p className="text-xs text-slate-400 text-center">ให้ผู้ขายสแกนเก็บลิงก์ใบรับของนี้ไว้ตรวจสอบ/อ้างอิงกรณีมีข้อพิพาท</p>
          <div className="w-full flex items-center gap-2 rounded-lg p-2.5" style={{ background: '#0d1120', border: '1px solid #1f2937' }}>
            <span className="text-xs text-slate-400 truncate flex-1">{qr.url}</span>
            <CopyBtn text={qr.url} />
          </div>
          <button onClick={finish} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-3 text-sm font-semibold mt-1">เสร็จสิ้น</button>
        </div>
      </Overlay>
    )
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="font-semibold text-slate-100">รับของจากผู้ขาย</h3>
        <button onClick={onClose} aria-label="ปิด"><X className="w-5 h-5 text-slate-400" /></button>
      </div>
      <form onSubmit={submit} className="p-4 space-y-3.5 overflow-y-auto">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">ผู้ขาย</label>
          <select className={INPUT} style={INPUT_STYLE} value={vendorId} onChange={e => setVendorId(e.target.value)} required>
            <option value="">— เลือกผู้ขาย —</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.vendorName}</option>)}
          </select>
          {vendor && (
            <p className="text-xs text-slate-500 mt-1.5">
              {vendor.bankAccountNo ? <>โอนเข้า: {vendor.bankName || '—'} ••{String(vendor.bankAccountNo).slice(-4)}</> : 'ยังไม่ได้ตั้งบัญชีรับเงินของผู้ขายนี้'}
            </p>
          )}
          {vendors.length === 0 && <p className="text-xs text-amber-400 mt-1.5">ยังไม่มีผู้ขายในระบบ — แจ้งแอดมินให้เพิ่มผู้ขายก่อน</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">รายการที่รับ</label>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #2e3349' }}>
            {items.map((it, idx) => (
              <div key={idx} className="p-2.5 border-b" style={{ borderColor: '#1f2937' }}>
                <div className="flex gap-1.5">
                  <input className="flex-1 min-w-0 rounded-md px-2 py-1.5 text-xs text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500"
                    style={INPUT_STYLE} placeholder="ชื่อของ" value={it.name} onChange={e => updateItem(idx, { ...it, name: e.target.value })} />
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)} aria-label="ลบรายการ" className="shrink-0 px-1">
                      <X className="w-3.5 h-3.5 text-slate-500" />
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 mt-1.5 items-center">
                  <input className="w-16 rounded-md px-2 py-1.5 text-xs text-slate-200 border border-slate-600 text-right focus:outline-none focus:border-emerald-500"
                    style={INPUT_STYLE} type="number" min="0" step="0.01" inputMode="decimal" placeholder="จำนวน" value={it.qty} onChange={e => updateItem(idx, { ...it, qty: e.target.value })} />
                  <input className="w-16 rounded-md px-2 py-1.5 text-xs text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500"
                    style={INPUT_STYLE} placeholder="หน่วย" value={it.unit} onChange={e => updateItem(idx, { ...it, unit: e.target.value })} />
                  <span className="text-slate-600 text-xs">×</span>
                  <input className="flex-1 min-w-0 rounded-md px-2 py-1.5 text-xs text-slate-200 border border-slate-600 text-right focus:outline-none focus:border-emerald-500"
                    style={INPUT_STYLE} type="number" min="0" step="0.01" inputMode="decimal" placeholder="ราคา/หน่วย" value={it.unitPrice} onChange={e => updateItem(idx, { ...it, unitPrice: e.target.value })} />
                  <span className="text-xs font-semibold text-slate-200 tabular-nums w-16 text-right shrink-0">
                    {(Number(it.qty) > 0 && Number(it.unitPrice) >= 0) ? thb(Number(it.qty) * Number(it.unitPrice)) : '—'}
                  </span>
                </div>
              </div>
            ))}
            <button type="button" onClick={addItem}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors"
              style={{ color: '#34d399', background: '#10b98115' }}>
              <Plus className="w-3.5 h-3.5" />เพิ่มรายการ (ของ · จำนวน · ราคา/หน่วย)
            </button>
          </div>
        </div>

        <div className="flex items-baseline justify-between px-0.5">
          <span className="text-xs text-slate-400">ยอดรวม (ระบบคูณให้)</span>
          <span className="text-2xl font-bold text-slate-100 tabular-nums">{thb(total)}</span>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-slate-400">รูปของที่รับ</label>
            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#3a2e1233', color: '#f59e0b' }}>บังคับ</span>
          </div>
          {photo ? (
            <div className="rounded-lg p-2.5 flex items-center gap-3" style={{ background: '#10b98115', border: '1px solid #10b98133' }}>
              <div className="w-9 h-9 rounded-md flex items-center justify-center font-bold shrink-0" style={{ background: 'linear-gradient(135deg,#2a3350,#3a4568)', color: '#34d399' }}>✓</div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-200 truncate">{photo.name}</div>
                <div className="text-[11px] text-slate-500">ถ่ายรูปของแล้ว 1 รูป</div>
              </div>
              <button type="button" onClick={() => setPhoto(null)} aria-label="ลบรูป"><X className="w-4 h-4 text-slate-500" /></button>
            </div>
          ) : (
            <label className="rounded-lg p-3 flex items-center justify-center gap-2 cursor-pointer" style={{ border: '1.5px dashed #475569' }}>
              <Camera className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-400">แนบรูปของที่รับ (บังคับ)</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => setPhoto(e.target.files?.[0] || null)} />
            </label>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-slate-400">ลายเซ็นผู้ขายรับทราบยอด</label>
            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#3a2e1233', color: '#f59e0b' }}>บังคับ</span>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ border: '1.6px dashed #10b98155', background: '#10b98115' }}>
            <SignaturePad onChange={setSigBlob} />
            <p className="text-[11px] text-slate-400 mt-2">ยื่นจอให้ผู้ขายเซ็น — รับทราบว่าส่งของ + ยอด {thb(total)} ถูกต้อง</p>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          ผู้ตรวจรับ: <span className="text-slate-200 font-medium">{me?.name || '—'}</span> · เวลา {receivedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
        </p>

        {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
        <button type="submit" disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors">
          {saving ? 'กำลังบันทึก...' : (created ? 'ลองอีกครั้ง' : 'ตรวจรับ & ส่งเข้าคิวรอจ่าย')}
        </button>
      </form>
    </Overlay>
  )
}

function CopyBtn({ text, label }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(String(text)); setDone(true); setTimeout(() => setDone(false), 1500) } catch {}
  }
  return (
    <button type="button" onClick={copy}
      className="text-xs font-medium rounded-md px-2.5 py-1 border transition-colors shrink-0"
      style={{ borderColor: '#10b98155', color: '#34d399', background: done ? '#10b98122' : 'transparent' }}>
      {done ? 'คัดลอกแล้ว' : (label || 'คัดลอก')}
    </button>
  )
}

function StepHeader({ n, children, required }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-100 mb-2.5">
      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: '#10b98122', color: '#34d399' }}>{n}</span>
      <span>{children}</span>
      {required && <span className="ml-auto text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#3a2e1233', color: '#f59e0b' }}>บังคับ</span>}
    </div>
  )
}

function PayModal({ bill, onClose, onDone }) {
  const [wallets, setWallets] = useState([])
  const [walletId, setWalletId] = useState('')
  const [date, setDate] = useState(new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10))
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { api.wallets().then(d => { const ws = d.wallets || d || []; setWallets(ws); if (ws[0]) setWalletId(ws[0].id) }).catch(() => {}) }, [])
  const weak = isWeakEvidence(bill.evidenceType)
  const viewEvidence = async () => {
    try { const url = await api.fetchBillEvidenceBlob(bill.id); window.open(url, '_blank') } catch (e) { alert(e.message) }
  }
  const pay = async (e) => {
    e.preventDefault()
    if (!file) { setErr('ต้องแนบสลิปโอนก่อน'); return }
    setSaving(true); setErr('')
    try {
      const res = await api.payPendingBill(bill.id, { walletId, date })
      const txId = res?.txId || res?.transaction?.id
      if (txId) {
        try { await api.uploadSlip(txId, file, 'transfer') }
        catch { alert('จ่ายสำเร็จแล้ว แต่แนบสลิปโอนไม่สำเร็จ — แนบซ้ำได้ที่รายการในหน้าธุรกรรม') }
      }
      onDone(); onClose()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="font-semibold text-slate-100">จ่ายเงิน · {bill.name}</h3>
        <button onClick={onClose} aria-label="ปิด"><X className="w-5 h-5 text-slate-400" /></button>
      </div>
      <form onSubmit={pay} className="p-4 space-y-3.5 overflow-y-auto">
        <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: '#0d1120', border: '1px solid #1f2937' }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm shrink-0" style={{ background: '#10b98115', color: '#34d399' }}>
            {(bill.submittedByName || bill.payeeName || '?').slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap text-[14.5px] font-semibold text-slate-100">
              <span className="truncate">{bill.name}</span>
              <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0"
                style={{ background: weak ? '#3a2e1233' : '#10b98115', color: weak ? '#f59e0b' : '#34d399' }}>
                หลักฐาน{weak ? 'อ่อน' : 'แข็ง'}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">โดย {bill.submittedByName || '—'}{bill.categoryName ? ` · หมวด ${bill.categoryName}` : ''}</div>
          </div>
          <div className="text-lg font-bold text-slate-100 tabular-nums shrink-0">{thb(bill.amount)}</div>
        </div>
        {bill.hasEvidence && (
          <button type="button" onClick={viewEvidence} className="flex items-center gap-1.5 text-xs -mt-1.5" style={{ color: '#34d399' }}>
            <FileText className="w-3.5 h-3.5" />ดูบิล/หลักฐานจากพนักงาน
          </button>
        )}

        <div className="rounded-xl p-3" style={{ border: '1px solid #2e3349' }}>
          <StepHeader n={1}>โอนไปบัญชีนี้</StepHeader>
          {bill.payeeAccountNo ? (
            <div className="rounded-lg p-3" style={{ background: '#10b98115', border: '1px solid #10b98133' }}>
              <div className="font-semibold text-sm text-slate-100">{bill.payeeBank || '—'}</div>
              <div className="text-xs text-slate-400 mt-0.5">{bill.payeeName || '—'}</div>
              <div className="flex items-center justify-between gap-2 mt-2.5">
                <div>
                  <div className="text-xs text-slate-400">เลขบัญชี</div>
                  <div className="font-semibold text-sm text-slate-100 tabular-nums tracking-wide">{bill.payeeAccountNo}</div>
                </div>
                <CopyBtn text={bill.payeeAccountNo} />
              </div>
              <div className="flex items-center justify-between gap-2 mt-2.5">
                <div>
                  <div className="text-xs text-slate-400">ยอดที่ต้องโอน</div>
                  <div className="font-semibold text-sm text-slate-100 tabular-nums">{thb(bill.amount)}</div>
                </div>
                <CopyBtn text={bill.amount} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-amber-400">ยังไม่ได้ตั้งบัญชีปลายทาง (ตั้งได้ที่หน้าผู้ใช้/Vendor)</p>
          )}
        </div>

        <div className="rounded-xl p-3" style={{ border: '1px solid #2e3349' }}>
          <StepHeader n={2} required>แนบสลิปโอน</StepHeader>
          {file ? (
            <div className="rounded-lg p-2.5 flex items-center gap-3" style={{ background: '#10b98115', border: '1.6px dashed #10b981' }}>
              <div className="w-9 h-9 rounded-md flex items-center justify-center font-bold shrink-0" style={{ background: 'linear-gradient(135deg,#2a3350,#3a4568)', color: '#34d399' }}>✓</div>
              <div className="min-w-0">
                <div className="text-sm text-slate-100 font-medium truncate">{file.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">แนบแล้ว · หลักฐานการโอนของคุณ</div>
              </div>
            </div>
          ) : (
            <label className="rounded-lg p-3 flex flex-col items-center justify-center gap-1 cursor-pointer text-center"
              style={{ border: '1.6px dashed #475569' }}>
              <span className="text-xs text-slate-300 font-medium">แตะเพื่อเลือกไฟล์สลิปโอน</span>
              <span className="text-[11px] text-slate-500">รูปภาพหรือ PDF</span>
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
            </label>
          )}
          <p className="text-[11.5px] text-slate-400 mt-1.5">เก็บไว้เป็นหลักฐานว่าคุณโอนให้พนักงาน/ร้านค้าจริง — คนละใบกับบิลที่พนักงานส่งมา</p>
        </div>

        <div className="rounded-xl p-3" style={{ border: '1px solid #2e3349' }}>
          <StepHeader n={3}>บันทึกเข้าเล่ม</StepHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">จ่ายออกจากกระเป๋า</label>
              <select className={INPUT} style={INPUT_STYLE} value={walletId} onChange={e => setWalletId(e.target.value)} required>
                {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">วันที่จ่าย</label>
              <input className={INPUT} style={INPUT_STYLE} type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
          </div>
        </div>

        {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
        <div className="pt-1 space-y-2.5" style={{ borderTop: '1px solid #1f2937' }}>
          <div className="flex gap-2.5 pt-2.5">
            <button type="button" onClick={onClose} className="flex-1 text-center font-semibold text-sm rounded-lg py-2.5 border border-slate-600 text-slate-300">ยกเลิก</button>
            <button type="submit" disabled={saving || !file}
              className="flex-1 text-center font-semibold text-sm rounded-lg py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors">
              {saving ? 'กำลังบันทึก...' : 'ยืนยันจ่ายแล้ว'}
            </button>
          </div>
          <p className="text-[11.5px] text-slate-400 text-center">รายการนี้จะเก็บ <span className="font-semibold" style={{ color: '#34d399' }}>2 หลักฐาน</span>: บิลพนักงาน + สลิปโอนของคุณ</p>
        </div>
      </form>
    </Overlay>
  )
}

function RefundModal({ bill, onClose, onDone }) {
  const [wallets, setWallets] = useState([])
  const [walletId, setWalletId] = useState('')
  const [amount, setAmount] = useState(bill.amount)
  const [date, setDate] = useState(new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { api.wallets().then(d => { const ws = d.wallets || d || []; setWallets(ws); const paid = bill.paidWalletId && ws.some(w => w.id === bill.paidWalletId) ? bill.paidWalletId : (ws[0] && ws[0].id); if (paid) setWalletId(paid) }).catch(() => {}) }, [bill.paidWalletId])
  const refund = async (e) => {
    e.preventDefault(); setSaving(true); setErr('')
    try { await api.refundPendingBill(bill.id, { walletId, amount: Number(amount), date }); onDone(); onClose() }
    catch (e) { setErr(e.message) } finally { setSaving(false) }
  }
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="font-semibold text-slate-100">คืนเงิน · {bill.name}</h3>
        <button onClick={onClose} aria-label="ปิด"><X className="w-5 h-5 text-slate-400" /></button>
      </div>
      <form onSubmit={refund} className="p-4 space-y-3">
        <p className="text-xs text-slate-400">บันทึกเป็นรายรับคืนเงิน — จะเข้ายอดกระเป๋าที่เลือก</p>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">รับเงินคืนเข้ากระเป๋าเงิน</label>
          <select className={INPUT} style={INPUT_STYLE} value={walletId} onChange={e => setWalletId(e.target.value)} required>
            {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">จำนวนเงินคืน</label>
          <input className={INPUT} style={INPUT_STYLE} type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">วันที่คืนเงิน</label>
          <input className={INPUT} style={INPUT_STYLE} type="date" value={date} onChange={e => setDate(e.target.value)} required />
        </div>
        {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
        <button type="submit" disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors">
          {saving ? 'กำลังบันทึก...' : 'บันทึกคืนเงิน'}
        </button>
      </form>
    </Overlay>
  )
}

function BillCard({ bill, isAdmin, isDup, onPay, onReject, onView, onReceived, onRefund }) {
  const weak = isWeakEvidence(bill.evidenceType)
  const showCert = bill.status === 'paid' && bill.evidenceType === 'self_declared'
  const depositAwaiting = bill.isDeposit && bill.status === 'paid' && !bill.goodsReceivedAt
  const openCert = () => {
    const payload = encodeURIComponent(JSON.stringify({
      id: bill.createdTxId, n: bill.payeeName || bill.submittedByName || '-', amt: bill.amount,
      d: (bill.paidAt || bill.createdAt || '').slice(0, 10), b: bill.payeeBank || '', r: '', si: '', ty: 'cert', mo: bill.name || '',
    }))
    window.open(`/voucher?d=${payload}`, '_blank')
  }
  return (
    <div className="rounded-xl p-4" style={{ ...CARD, borderColor: weak ? '#b45309' : '#1f2937' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-100">{bill.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: weak ? '#b4530922' : '#15803d22', color: weak ? '#f59e0b' : '#34d399' }}>
              หลักฐาน{weak ? 'อ่อน' : 'แข็ง'}
            </span>
            {bill.status !== 'pending' && <span className="text-xs text-slate-500">· {bill.status === 'paid' ? 'จ่ายแล้ว' : 'ปฏิเสธ'}</span>}
            {isDup && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#b4530922', color: '#f59e0b' }}>อาจซ้ำ</span>}
            {depositAwaiting && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#1d4ed822', color: '#60a5fa' }}>รอของ</span>}
            {bill.refundTxId && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#15803d22', color: '#34d399' }}>คืนแล้ว</span>}
            {bill.kind === 'goods_receipt' && (
              <span className="text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: '#10b98122', color: '#34d399' }}>
                <PackageCheck className="w-3 h-3" />ใบรับของ{bill.hasSignature ? ' · ผู้ขายเซ็น' : ''}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex gap-2 flex-wrap">
            <span>โดย {bill.submittedByName || '—'}</span>
            {bill.categoryName && <span>· {bill.categoryName}</span>}
            {bill.payeeAccountNo && <span>· โอนไป {bill.payeeBank || ''} ••{String(bill.payeeAccountNo).slice(-4)}</span>}
          </div>
          {bill.kind === 'goods_receipt' && Array.isArray(bill.lineItems) && bill.lineItems.length > 0 && (
            <ul className="text-xs text-slate-500 mt-1.5 space-y-0.5">
              {bill.lineItems.map((it, idx) => {
                const amt = Number(it.qty) * Number(it.unitPrice)
                return (
                  <li key={idx} className="flex justify-between gap-2">
                    <span className="truncate">{it.name} · {it.qty}{it.unit || ''}×{thb(it.unitPrice)}</span>
                    <span className="tabular-nums shrink-0">= {thb(amt)}</span>
                  </li>
                )
              })}
            </ul>
          )}
          {bill.status === 'rejected' && bill.rejectReason && <p className="text-xs text-red-400 mt-1">เหตุผล: {bill.rejectReason}</p>}
        </div>
        <div className="text-lg font-bold text-slate-100 tabular-nums">{thb(bill.amount)}</div>
      </div>
      <div className="flex gap-2 mt-3">
        {bill.kind === 'goods_receipt' && bill.publicToken && (
          <button onClick={() => window.open(`/receipt/${bill.publicToken}`, '_blank')} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300">
            <PackageCheck className="w-3.5 h-3.5" />ดูใบรับของ
          </button>
        )}
        {bill.hasEvidence && <button onClick={() => onView(bill)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300">ดูหลักฐาน</button>}
        {showCert && (
          <button onClick={openCert} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300">
            <FileText className="w-3.5 h-3.5" />ใบรับรอง
          </button>
        )}
        {bill.status === 'pending' && (
          <CopyBtn text={`${window.location.origin}/pending-bills?pay=${bill.id}`} label="คัดลอกลิงก์จ่าย" />
        )}
        {isAdmin && bill.status === 'pending' && <>
          <button onClick={() => onPay(bill)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">จ่ายแล้ว</button>
          <button onClick={() => onReject(bill)} className="text-xs px-3 py-1.5 rounded-lg text-red-400">ปฏิเสธ</button>
        </>}
        {depositAwaiting && <button onClick={() => onReceived(bill)} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white">ของมาแล้ว</button>}
        {isAdmin && bill.status === 'paid' && !bill.refundTxId && <button onClick={() => onRefund(bill)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300">คืนเงิน</button>}
      </div>
    </div>
  )
}

export default function PendingBills() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const isViewer = !!user && user.role !== 'admin' && user.role !== 'staff'
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSubmit, setShowSubmit] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [payBill, setPayBill] = useState(null)
  const [refundBill, setRefundBill] = useState(null)
  const [adminFilter, setAdminFilter] = useState('pending')
  const [sp, setSp] = useSearchParams()
  const payId = sp.get('pay')
  const [deepHandled, setDeepHandled] = useState(false)
  // deep-link ?pay=<billId>: เปิด PayModal อัตโนมัติ (เฉพาะ admin) — จาก "คัดลอกลิงก์จ่าย" ที่พนักงาน/แอดมินส่งให้เจ้าของ
  useEffect(() => {
    if (!payId || deepHandled || !user) return
    if (!isAdmin) { setDeepHandled(true); return } // เฉพาะ admin จ่ายได้ — ไม่เปิดให้ role อื่น
    setDeepHandled(true)
    ;(async () => {
      let bill = bills.find(b => b.id === payId)
      if (!bill) { try { bill = (await api.getPendingBill(payId)).bill } catch { bill = null } }
      if (bill && bill.status === 'pending') setPayBill(bill)
      // ล้าง ?pay ออกจาก URL กันเปิดซ้ำตอน refresh
      const next = new URLSearchParams(sp); next.delete('pay'); setSp(next, { replace: true })
    })()
  }, [payId, deepHandled, user, isAdmin, bills])
  // admin: คิวเลือกได้ pending/paid ผ่าน adminFilter · staff: บิลของฉันทุกสถานะ (เห็นจ่ายแล้ว/ปฏิเสธ+เหตุผล ตาม acceptance #6)
  // viewer: ไม่มีสิทธิ์เข้าถึงบิลรอจ่าย เลย ข้ามการเรียก api ไปเลย (กัน 403 ที่ถูกกลืน)
  const load = () => {
    if (isViewer) { setLoading(false); return }
    setLoading(true)
    api.pendingBills(isAdmin ? { status: adminFilter } : {}).then(d => setBills(d.bills || [])).catch(() => setBills([])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [adminFilter])
  const reject = async (bill) => {
    const reason = window.prompt('เหตุผลที่ปฏิเสธ:')
    if (reason === null) return
    try { await api.rejectPendingBill(bill.id, { reason }); load() } catch (e) { alert(e.message) }
  }
  const view = async (bill) => { try { const url = await api.fetchBillEvidenceBlob(bill.id); window.open(url, '_blank') } catch (e) { alert(e.message) } }
  const received = async (bill) => { try { await api.markGoodsReceived(bill.id); load() } catch (e) { alert(e.message) } }
  const ratios = weakRatioByUser(bills.map(b => ({ submittedByUserId: b.submittedByUserId, amount: b.amount, evidenceType: b.evidenceType })))
  const total = bills.reduce((s, b) => s + b.amount, 0)
  const dupSet = duplicateIds(bills.map(b => ({ id: b.id, payeeRefId: b.payeeRefId, payeeName: b.payeeName, amount: b.amount, date: (b.createdAt || '').slice(0, 10) })))
  const depositAwaitingCount = bills.filter(b => b.isDeposit && b.status === 'paid' && !b.goodsReceivedAt).length
  if (isViewer) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <div className="rounded-xl p-8 text-center" style={CARD}>
          <p className="text-slate-300 text-sm">คุณไม่มีสิทธิ์เข้าถึงบิลรอจ่าย</p>
        </div>
      </div>
    )
  }
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">{isAdmin ? (adminFilter === 'paid' ? 'บิลที่จ่ายแล้ว' : 'คิวบิลรอจ่าย') : 'บิลรอจ่ายของฉัน'}</h1>
          {isAdmin && <p className="text-sm text-slate-400 tabular-nums">{adminFilter === 'paid' ? 'จ่ายแล้ว' : 'รอจ่าย'} {bills.length} รายการ · รวม {thb(total)}</p>}
          {depositAwaitingCount > 0 && <p className="text-sm text-blue-400 tabular-nums">มัดจำรอของ {depositAwaitingCount}</p>}
        </div>
        {!isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => setShowReceipt(true)} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold border border-slate-600 text-slate-200 hover:border-emerald-500 transition-colors"><Truck className="w-4 h-4" />รับของ</button>
            <button onClick={() => setShowSubmit(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm font-semibold"><Plus className="w-4 h-4" />แจ้งบิล</button>
          </div>
        )}
      </div>
      {isAdmin && (
        <div className="flex gap-2">
          {[['pending', 'รอจ่าย'], ['paid', 'จ่ายแล้ว']].map(([v, label]) => (
            <button key={v} onClick={() => setAdminFilter(v)} aria-pressed={adminFilter === v}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: adminFilter === v ? '#10b981' : '#2e3349', color: adminFilter === v ? '#34d399' : '#94a3b8', background: adminFilter === v ? '#10b98115' : 'transparent' }}>
              {label}
            </button>
          ))}
        </div>
      )}
      {loading ? <p className="text-slate-500 text-sm">กำลังโหลด...</p>
        : bills.length === 0 ? <div className="text-center text-slate-500 py-12"><Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>{isAdmin && adminFilter === 'paid' ? 'ยังไม่มีบิลที่จ่ายแล้ว' : 'ยังไม่มีบิลรอจ่าย'}</p></div>
        : <div className="space-y-3">{bills.map(b => <BillCard key={b.id} bill={b} isAdmin={isAdmin} isDup={dupSet.has(b.id)} onPay={setPayBill} onReject={reject} onView={view} onReceived={received} onRefund={setRefundBill} />)}</div>}
      {isAdmin && Object.entries(ratios).filter(([, r]) => r >= 40).map(([uid, r]) => {
        const nm = bills.find(b => b.submittedByUserId === uid)?.submittedByName || uid
        return <div key={uid} className="flex items-center gap-2 text-xs text-amber-400"><AlertTriangle className="w-4 h-4" />{nm}: บิลไม่มีบิล {r}% ของยอดรอจ่าย — จับตา</div>
      })}
      {showSubmit && <SubmitBillModal me={user} onClose={() => setShowSubmit(false)} onDone={load} />}
      {showReceipt && <GoodsReceiptModal me={user} onClose={() => setShowReceipt(false)} onDone={load} />}
      {payBill && <PayModal bill={payBill} onClose={() => setPayBill(null)} onDone={load} />}
      {refundBill && <RefundModal bill={refundBill} onClose={() => setRefundBill(null)} onDone={load} />}
    </div>
  )
}
