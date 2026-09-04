import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { Plus, X, Receipt, AlertTriangle, FileText, Truck, Camera, PackageCheck, MoreHorizontal, ChevronDown } from 'lucide-react'
import MerchantPicker from '../components/MerchantPicker'
import SignaturePad from '../components/SignaturePad'
import PromptPayQR from '../components/PromptPayQR'
import { isWeakEvidence, weakRatioByUser, duplicateIds, sumLineItems, unpricedItems, billsWithUnpricedItems } from '../../pending-bills-logic.mjs'
import PendingBillStyles from '../components/PendingBillStyles'
import { parseOrderText, normalizeUnit } from '../parseOrderText.js'

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
          <MerchantPicker vendors={vendors} value={form.vendorRefId}
            onChange={id => {
              // เลือกร้าน → เติมหมวดที่ร้านนี้ใช้ประจำให้ ถ้ายังไม่ได้เลือกหมวดเอง
              const v = vendors.find(x => x.id === id)
              setForm(f => ({ ...f, vendorRefId: id, categoryId: f.categoryId || v?.typicalCategoryId || '' }))
            }}
            canCreate={me?.role === 'admin'}
            onCreated={v => setVendors(prev => [v, ...prev])} />
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
          <MerchantPicker vendors={vendors} value={vendorId} onChange={setVendorId} label="ผู้ขาย"
            canCreate={me?.role === 'admin'} onCreated={v => setVendors(prev => [v, ...prev])} />
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

// ออกใบวางบิลให้คู่ค้ายืนยันเองผ่านลิงก์ — คนละโหมดกับ "รับของ" ที่ผู้ขายเซ็นต่อหน้า
// ต่างกันแค่: ไม่บังคับรูป ไม่บังคับลายเซ็น และเริ่มจากวางข้อความสั่งของแทนพิมพ์ทีละแถว
function BillingLinkModal({ me, onClose, onDone }) {
  const [vendors, setVendors] = useState([])
  const [vendorId, setVendorId] = useState('')
  const [paste, setPaste] = useState('')
  const [items, setItems] = useState([])
  const [unparsed, setUnparsed] = useState([])
  const [deliveryDate, setDeliveryDate] = useState(null)
  const [prices, setPrices] = useState([])
  const [basket, setBasket] = useState([])
  const [picked, setPicked] = useState({})   // { itemId: qty }
  const [showBasket, setShowBasket] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [created, setCreated] = useState(null)
  const [qr, setQr] = useState(null)

  useEffect(() => { api.vendorProfiles().then(d => setVendors(d.vendors || [])).catch(() => {}) }, [])

  // ราคาล่าสุด — API เรียงของคู่ค้ารายนี้มาก่อน จึงหยิบตัวแรกที่เจอต่อชื่อได้เลย
  useEffect(() => {
    api.lastPrices(vendorId ? { vendorId } : {}).then(d => setPrices(d.prices || [])).catch(() => setPrices([]))
  }, [vendorId])

  // ตะกร้าสินค้าประจำของคู่ค้ารายนี้ — คู่ค้าเก่าสั่งของชุดเดิมซ้ำ ๆ กดเลือกเร็วกว่าพิมพ์
  useEffect(() => {
    let cancelled = false
    const p = vendorId ? api.vendorItems(vendorId) : Promise.resolve({ items: [] })
    p.then(d => { if (!cancelled) setBasket(d.items || []) })
      .catch(() => { if (!cancelled) setBasket([]) })
    return () => { cancelled = true }
  }, [vendorId])

  const priceMap = {}
  for (const p of prices) if (!(p.name in priceMap)) priceMap[p.name] = p
  const nameOptions = Object.keys(priceMap)

  const vendor = vendors.find(v => v.id === vendorId)
  const validItems = items.filter(it => String(it.name || '').trim() && Number(it.qty) > 0 && Number(it.unitPrice) >= 0)
  const total = sumLineItems(validItems)
  const missingPrice = items.filter(it => String(it.name || '').trim() && !(Number(it.unitPrice) > 0)).length

  const pickedCount = Object.values(picked).filter(q => Number(q) > 0).length
  // เพิ่มของที่ติ๊กไว้เข้าตาราง — ถ้ามีชื่อนั้นอยู่แล้วให้บวกจำนวนแทนสร้างแถวซ้ำ
  const addPicked = () => {
    const rows = basket.filter(b => Number(picked[b.id]) > 0)
    if (!rows.length) return
    setItems(prev => {
      const next = [...prev]
      for (const b of rows) {
        const qty = Number(picked[b.id])
        const at = next.findIndex(it => String(it.name || '').trim() === b.name)
        if (at >= 0) next[at] = { ...next[at], qty: (Number(next[at].qty) || 0) + qty }
        else next.push({ name: b.name, qty, unit: b.unit || 'กก.', unitPrice: b.lastPrice ?? '', guessedUnit: false })
      }
      return next
    })
    setPicked({})
    setShowBasket(false)
  }

  const withLastPrice = (it) => {
    const p = priceMap[it.name]
    if (!p) return { ...it, unitPrice: '' }
    // หน่วยจากราคาเดิมใช้แทนได้เฉพาะตอนที่คนไม่ได้เขียนหน่วยมา
    return { ...it, unitPrice: p.unitPrice, unit: it.guessedUnit && p.unit ? p.unit : it.unit }
  }

  const doParse = () => {
    const r = parseOrderText(paste)
    setItems(r.items.map(withLastPrice))
    setUnparsed(r.unparsed)
    setDeliveryDate(r.deliveryDate)
    setErr('')
  }

  const updateItem = (idx, next) => setItems(prev => prev.map((it, i) => i === idx ? next : it))
  const addItem = () => setItems(prev => [...prev, { name: '', qty: '', unit: 'กก.', unitPrice: '' }])
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))

  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (!vendorId) { setErr('เลือกคู่ค้าก่อน'); return }
    if (validItems.length === 0) { setErr('ต้องมีอย่างน้อย 1 รายการที่กรอกครบ (ชื่อ · จำนวน · ราคา/หน่วย)'); return }
    setSaving(true)
    try {
      let bill = created
      if (!bill) {
        const res = await api.createPendingBill({
          kind: 'billing_link',
          name: 'วางบิล ' + (vendor?.vendorName || ''),
          amount: total, scope: 'business', payeeType: 'vendor', payeeRefId: vendorId,
          evidenceType: 'receipt',
          note: deliveryDate ? `ของส่งวันที่ ${deliveryDate}` : null,
          // ยุบหน่วยตอนบันทึก กันคนพิมพ์ "กก" มือแล้ว Dashboard นับแยกจาก "กก."
          lineItems: validItems.map(it => ({ name: it.name.trim(), qty: Number(it.qty), unit: normalizeUnit(it.unit), unitPrice: Number(it.unitPrice) })),
        })
        bill = res.bill
        setCreated(bill)
      }
      const url = `${window.location.origin}/receipt/${bill.publicToken}`
      setQr({ url, dataUrl: await QRCode.toDataURL(url, { margin: 1, width: 220 }) })
    } catch (e2) {
      setErr(created ? `สร้างใบไว้แล้ว แต่ ${e2.message || 'สร้าง QR ไม่สำเร็จ'} — กดอีกครั้งได้ ไม่สร้างใบซ้ำ` : (e2.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่'))
    } finally { setSaving(false) }
  }

  const finish = () => { onDone(); onClose() }

  if (qr) {
    return (
      <Overlay onClose={finish}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="font-semibold text-slate-100">ออกใบวางบิลแล้ว</h3>
          <button onClick={finish} aria-label="ปิด"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 flex flex-col items-center gap-3 overflow-y-auto">
          <p className="text-sm text-slate-200 text-center">
            <span className="font-semibold">{vendor?.vendorName}</span> · {thb(total)}<br />ส่งลิงก์ให้คู่ค้ายืนยันรายการ
          </p>
          <img src={qr.dataUrl} alt="QR ใบวางบิล" className="rounded-lg" style={{ width: 180, height: 180 }} />
          <div className="w-full flex items-center gap-2 rounded-lg p-2.5" style={{ background: '#0d1120', border: '1px solid #1f2937' }}>
            <span className="text-xs text-slate-400 truncate flex-1">{qr.url}</span>
            <CopyBtn text={qr.url} />
          </div>
          {navigator.share && (
            <button onClick={() => navigator.share({ url: qr.url, title: 'ใบวางบิล' }).catch(() => {})}
              className="w-full rounded-lg py-2.5 text-sm font-semibold border border-slate-600 text-slate-200">
              แชร์เข้าแชทไลน์
            </button>
          )}
          <p className="text-xs text-slate-400 text-center">คู่ค้ากดยืนยันในลิงก์นี้ · พอโอนเงินแล้วแนบสลิป ลิงก์เดิมจะกลายเป็นใบสำคัญจ่ายเอง</p>
          <button onClick={finish} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-3 text-sm font-semibold mt-1">เสร็จสิ้น</button>
        </div>
      </Overlay>
    )
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="font-semibold text-slate-100">ออกใบวางบิลให้คู่ค้า</h3>
        <button onClick={onClose} aria-label="ปิด"><X className="w-5 h-5 text-slate-400" /></button>
      </div>
      <form onSubmit={submit} className="p-4 space-y-3.5 overflow-y-auto">
        <MerchantPicker vendors={vendors} value={vendorId} onChange={setVendorId} label="คู่ค้า"
          canCreate={me?.role === 'admin'} onCreated={v => setVendors(prev => [v, ...prev])} />

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5" htmlFor="paste-order">
            วางข้อความสั่งของจากแชทไลน์
          </label>
          <textarea id="paste-order" rows={4} className={INPUT} style={INPUT_STYLE} value={paste}
            onChange={e => setPaste(e.target.value)} placeholder={'30/8/69\nมะละกอ30กก.\nแตงร้าน10กก.'} />
          <button type="button" onClick={doParse} disabled={!paste.trim()}
            className="w-full mt-1.5 rounded-lg py-2 text-xs font-semibold disabled:opacity-40"
            style={{ background: '#10b98115', color: '#34d399' }}>
            แตกเป็นรายการ
          </button>
        </div>

        {basket.length > 0 && (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #2e3349' }}>
            <button type="button" onClick={() => setShowBasket(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium"
              style={{ color: '#34d399', background: '#10b98115' }}>
              <span>เลือกจากรายการประจำของร้านนี้ ({basket.length})</span>
              <span className="text-slate-400">{showBasket ? 'ซ่อน' : 'เปิด'}</span>
            </button>
            {showBasket && (
              <div className="max-h-56 overflow-y-auto divide-y" style={{ borderColor: '#1f2937' }}>
                {basket.map(b => (
                  <div key={b.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-200 truncate">{b.name}</p>
                      <p className="text-[11px] text-slate-600 tabular-nums">
                        {b.unit || '—'}{b.lastPrice != null ? ` · ${thb(b.lastPrice)}` : ' · ยังไม่มีราคา'}
                      </p>
                    </div>
                    <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="จำนวน"
                      className="w-20 rounded-md px-2 py-1 text-xs text-slate-200 border border-slate-600 text-right focus:outline-none focus:border-emerald-500"
                      style={INPUT_STYLE} value={picked[b.id] ?? ''}
                      onChange={e => setPicked(prev => ({ ...prev, [b.id]: e.target.value }))} />
                  </div>
                ))}
              </div>
            )}
            {showBasket && (
              <button type="button" onClick={addPicked} disabled={pickedCount === 0}
                className="w-full py-2.5 text-xs font-semibold disabled:opacity-40"
                style={{ color: '#34d399', background: '#10b98122' }}>
                เพิ่ม {pickedCount} รายการที่เลือก
              </button>
            )}
          </div>
        )}

        {unparsed.length > 0 && (
          <div className="rounded-lg p-2.5 text-xs" style={{ background: '#3a2e1233', border: '1px solid #78350f' }}>
            <p className="text-amber-400 font-medium mb-1">แตกไม่ออก {unparsed.length} บรรทัด — กรอกเองด้านล่าง</p>
            {unparsed.map((l, i) => <p key={i} className="text-slate-400 truncate">{l}</p>)}
          </div>
        )}

        {deliveryDate && <p className="text-xs text-slate-400">ของส่งวันที่ {deliveryDate}</p>}

        <datalist id="known-item-names">
          {nameOptions.map(n => <option key={n} value={n} />)}
        </datalist>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">รายการ · ราคาเติมจากครั้งก่อนให้แล้ว แก้ได้</label>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #2e3349' }}>
            {items.length === 0 && <p className="p-3 text-xs text-slate-500 text-center">ยังไม่มีรายการ — วางข้อความแล้วกดแตก หรือเพิ่มเอง</p>}
            {items.map((it, idx) => (
              <div key={idx} className="p-2.5 border-b" style={{ borderColor: '#1f2937' }}>
                <div className="flex gap-1.5">
                  <input list="known-item-names" className="flex-1 min-w-0 rounded-md px-2 py-1.5 text-xs text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500"
                    style={INPUT_STYLE} placeholder="ชื่อของ" value={it.name}
                    onChange={e => updateItem(idx, withLastPriceIfEmpty(it, e.target.value, priceMap))} />
                  <button type="button" onClick={() => removeItem(idx)} aria-label="ลบรายการ" className="shrink-0 px-1">
                    <X className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
                <div className="flex gap-1.5 mt-1.5 items-center">
                  <input className="w-16 rounded-md px-2 py-1.5 text-xs text-slate-200 border border-slate-600 text-right focus:outline-none focus:border-emerald-500"
                    style={INPUT_STYLE} type="number" min="0" step="0.01" inputMode="decimal" placeholder="จำนวน"
                    value={it.qty} onChange={e => updateItem(idx, { ...it, qty: e.target.value })} />
                  <input className="w-16 rounded-md px-2 py-1.5 text-xs text-slate-200 border focus:outline-none focus:border-emerald-500"
                    style={{ ...INPUT_STYLE, borderColor: it.guessedUnit ? '#b45309' : '#475569' }}
                    placeholder="หน่วย" value={it.unit}
                    onChange={e => updateItem(idx, { ...it, unit: e.target.value, guessedUnit: false })} />
                  <span className="text-slate-600 text-xs">×</span>
                  <input className="flex-1 min-w-0 rounded-md px-2 py-1.5 text-xs text-slate-200 border text-right focus:outline-none focus:border-emerald-500"
                    style={{ ...INPUT_STYLE, borderColor: Number(it.unitPrice) > 0 ? '#475569' : '#b45309' }}
                    type="number" min="0" step="0.01" inputMode="decimal" placeholder="ราคา/หน่วย"
                    value={it.unitPrice} onChange={e => updateItem(idx, { ...it, unitPrice: e.target.value })} />
                  <span className="text-xs font-semibold text-slate-200 tabular-nums w-16 text-right shrink-0">
                    {(Number(it.qty) > 0 && Number(it.unitPrice) >= 0) ? thb(Number(it.qty) * Number(it.unitPrice)) : '—'}
                  </span>
                </div>
              </div>
            ))}
            <button type="button" onClick={addItem}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium"
              style={{ color: '#34d399', background: '#10b98115' }}>
              <Plus className="w-3.5 h-3.5" />เพิ่มรายการ
            </button>
          </div>
        </div>

        {missingPrice > 0 && (
          <p className="text-xs text-amber-400">ยังไม่ได้ใส่ราคา {missingPrice} รายการ — ระบบไม่รู้ราคาเก่าของชิ้นนั้น ต้องกรอกเอง</p>
        )}

        <div className="flex items-baseline justify-between px-0.5">
          <span className="text-xs text-slate-400">ยอดรวม (ระบบคูณให้)</span>
          <span className="text-2xl font-bold text-slate-100 tabular-nums">{thb(total)}</span>
        </div>

        {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
        <button type="submit" disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors">
          {saving ? 'กำลังออกใบ...' : created ? 'ลองอีกครั้ง' : 'ออกใบวางบิล + สร้างลิงก์'}
        </button>
      </form>
    </Overlay>
  )
}

// เปลี่ยนชื่อของแล้วเติมราคาล่าสุดให้ทันที เฉพาะตอนที่ช่องราคายังว่าง — ไม่ทับของที่คนพิมพ์เอง
function withLastPriceIfEmpty(it, nextName, priceMap) {
  const next = { ...it, name: nextName }
  if (Number(it.unitPrice) > 0) return next
  const p = priceMap[nextName]
  if (p) { next.unitPrice = p.unitPrice; if (it.guessedUnit && p.unit) { next.unit = p.unit; next.guessedUnit = false } }
  return next
}

function AttachSlipBtn({ txId, onDone }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const upload = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true)
    try { await api.uploadSlip(txId, f, 'transfer'); onDone?.() }
    catch (err) { alert(err.message || 'แนบสลิปไม่สำเร็จ') }
    finally { setBusy(false); if (ref.current) ref.current.value = '' }
  }
  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={upload} />
      <button type="button" disabled={busy} onClick={() => ref.current?.click()}
        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 disabled:opacity-50">
        <Camera className="w-3.5 h-3.5" />{busy ? 'กำลังอัป...' : 'แนบสลิปโอน'}
      </button>
    </>
  )
}

function PayModal({ bill, onClose, onDone }) {
  const [wallets, setWallets] = useState([])
  const [walletId, setWalletId] = useState('')
  const [date, setDate] = useState(new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10))
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [merchant, setMerchant] = useState(null)
  useEffect(() => { api.wallets().then(d => { const ws = d.wallets || d || []; setWallets(ws); if (ws[0]) setWalletId(ws[0].id) }).catch(() => {}) }, [])
  // ดึงข้อมูลร้าน ณ ตอนนี้เพื่อวาด QR พร้อมยอด — บิลเก็บ snapshot บัญชีไว้ตอนแจ้ง
  // ถ้าสองอันไม่ตรงกันแปลว่ามีคนแก้บัญชีร้านหลังแจ้งบิล ต้องเตือนก่อนโอน
  useEffect(() => {
    if (bill.payeeType !== 'vendor' || !bill.payeeRefId) return
    api.merchant(bill.payeeRefId).then(d => setMerchant(d.vendor)).catch(() => {})
  }, [bill.payeeType, bill.payeeRefId])
  const acctChanged = !!(merchant?.bankAccountNo && bill.payeeAccountNo && merchant.bankAccountNo !== bill.payeeAccountNo)
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
        {bill.kind === 'billing_link' && !bill.vendorAck?.at && (
          <div className="rounded-xl p-3 flex items-start gap-2 text-xs" style={{ background: '#3a2e1233', border: '1px solid #78350f' }}>
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-amber-300">
              {bill.vendorAck?.disputeAt
                ? <><b>คู่ค้าทักท้วงรายการนี้</b> — {bill.vendorAck.disputeReason}</>
                : <b>คู่ค้ายังไม่ยืนยันรายการ</b>}
              <div className="text-slate-400 mt-0.5">จ่ายได้ แต่ระบบจะติดป้ายไว้บนใบว่าจ่ายก่อนคู่ค้ายืนยัน</div>
            </div>
          </div>
        )}
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
              {acctChanged && (
                <p className="text-xs text-amber-400 mt-2.5 leading-relaxed">
                  ⚠ บัญชีของร้านถูกแก้หลังแจ้งบิลใบนี้ (ตอนนี้เป็น {merchant.bankAccountNo}) — ตรวจให้แน่ก่อนโอน
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-400">ยังไม่ได้ตั้งบัญชีปลายทาง (ตั้งได้ที่เมนูร้านค้า)</p>
          )}
          {merchant?.promptpayId && !acctChanged && (
            <div className="mt-3 pt-3 flex items-center gap-3" style={{ borderTop: '1px solid #1f2937' }}>
              <PromptPayQR promptpayId={merchant.promptpayId} amount={bill.amount} size={96} label={null} />
              <div className="text-xs text-slate-400 leading-relaxed">
                <div className="text-slate-300 font-semibold">สแกนจ่ายพร้อมเพย์</div>
                <div>ยอด <span className="tabular-nums text-emerald-400 font-semibold">{thb(bill.amount)}</span> ติดไปกับ QR แล้ว</div>
                <div className="text-slate-500">{merchant.bankAccountName || merchant.vendorName}</div>
              </div>
            </div>
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

// ── ตัวช่วยการแสดงผล ───────────────────────────────────────────────────
// ตัดคำนำหน้าที่ป้ายบอกซ้ำอยู่แล้ว ทำตอน "แสดงผล" ไม่แก้ข้อมูลในดาต้าเบส
// เพราะบิลเก่าที่สร้างไว้แล้วก็มีคำนี้ติดมาด้วย แก้ตอนสร้างช่วยแค่ของใหม่
const KIND_PREFIX = /^(วางบิล|รับของ)\s+/
function displayName(bill) {
  const n = String(bill.name || '').replace(KIND_PREFIX, '').trim()
  return n || bill.payeeName || bill.name || '—'
}
// D1 คืน created_at เป็น "YYYY-MM-DD HH:MM:SS" (UTC ไม่มี Z) — เติมให้ก่อน parse
function parseTs(v) {
  if (!v) return NaN
  return Date.parse(/[TZ]/.test(v) ? v : String(v).replace(' ', 'T') + 'Z')
}
function ageText(iso) {
  const t = parseTs(iso)
  if (!Number.isFinite(t)) return null
  const d = Math.floor((Date.now() - t) / 86400000)
  // นาฬิกาเครื่องช้ากว่าเซิร์ฟเวอร์ไม่กี่วินาที ทำให้ d ติดลบ — ยังถือว่า "วันนี้" ไม่ใช่ซ่อนอายุทิ้ง
  return d <= 0 ? 'วันนี้' : d + ' วัน'
}
function kindText(bill) {
  if (bill.kind === 'goods_receipt') return 'ใบรับของ' + (bill.hasSignature ? ' · ผู้ขายเซ็น' : '')
  // ไม่โชว์ "รอคู่ค้ายืนยัน" เพราะเป็นสถานะตั้งต้นของทุกใบวางบิล = ไม่ให้ข้อมูลอะไรเลย
  // โชว์เฉพาะตอน "ยืนยันแล้ว" ซึ่งเป็นข้อยกเว้นที่เปลี่ยนการตัดสินใจ (จ่ายได้สบายใจขึ้น)
  if (bill.kind === 'billing_link') return 'ใบวางบิล' + (bill.vendorAck?.at ? ' · ' + (bill.vendorAck.name || 'คู่ค้า') + ' ยืนยันแล้ว' : '')
  return bill.categoryName || 'บิลทั่วไป'
}

function BillRow({ bill, isAdmin, isDup, widthRatio, onPay, onReject, onView, onReceived, onRefund, onDone }) {
  const [menu, setMenu] = useState(false)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState('')
  const moreRef = useRef(null)
  const weak = isWeakEvidence(bill.evidenceType)
  const pending = bill.status === 'pending'
  const items = Array.isArray(bill.lineItems) ? bill.lineItems : []
  const unpriced = pending ? unpricedItems(items) : []
  const depositAwaiting = bill.isDeposit && bill.status === 'paid' && !bill.goodsReceivedAt
  const showCert = bill.status === 'paid' && bill.evidenceType === 'self_declared'
  const age = ageText(bill.createdAt)
  const disputed = !!bill.vendorAck?.disputeAt

  const copy = async (text, label) => {
    closeMenu()
    try {
      await navigator.clipboard.writeText(String(text))
      setCopied(label); setTimeout(() => setCopied(''), 1600)
    } catch { alert('คัดลอกไม่สำเร็จ — เบราว์เซอร์ไม่อนุญาต') }
  }
  const openCert = () => {
    const payload = encodeURIComponent(JSON.stringify({
      id: bill.createdTxId, n: bill.payeeName || bill.submittedByName || '-', amt: bill.amount,
      d: (bill.paidAt || bill.createdAt || '').slice(0, 10), b: bill.payeeBank || '', r: '', si: '', ty: 'cert', mo: bill.name || '',
    }))
    window.open('/voucher?d=' + payload, '_blank')
  }
  const closeMenu = () => { setMenu(false); moreRef.current?.focus() }
  const act = (fn) => { closeMenu(); fn() }
  // ถ้าไม่มีอะไรให้เลือกเลย อย่าโชว์ปุ่ม ⋯ ที่กดแล้วได้กล่องเปล่า
  const hasMenu = !!(bill.publicToken || bill.hasEvidence || showCert || pending ||
    (isAdmin && bill.status === 'paid' && !bill.refundTxId))

  return (
    <li>
      <div className={'row' + (unpriced.length ? ' is-todo' : '') + (bill.status === 'rejected' ? ' is-off' : '')}
        style={{ '--w': widthRatio }}>
        <div className="amt">{thb(bill.amount)}</div>
        <div className="body">
          <div className="who">{displayName(bill)}</div>
          <div className="meta">
            {/* ป้ายรายแถวเหลือเฉพาะ "ข้อยกเว้น" — ถ้าตัวไหนขึ้นทุกแถว แปลว่าออกแบบพลาดอีกรอบ */}
            {copied && <><span className="good">{copied}</span><span className="sep">·</span></>}
            {unpriced.length > 0 && <><span className="warn">{unpriced.length} รายการยังไม่ลงราคา</span><span className="sep">·</span></>}
            {disputed && <><span className="bad">คู่ค้าทักท้วง</span><span className="sep">·</span></>}
            {weak && <><span className="warn">หลักฐานอ่อน</span><span className="sep">·</span></>}
            {isDup && <><span className="warn">อาจซ้ำ</span><span className="sep">·</span></>}
            {depositAwaiting && <><span className="warn">มัดจำรอของ</span><span className="sep">·</span></>}
            {bill.refundTxId && <><span className="good">คืนแล้ว</span><span className="sep">·</span></>}
            {!pending && <><span>{bill.status === 'paid' ? 'จ่ายแล้ว' : 'ปฏิเสธ'}</span><span className="sep">·</span></>}
            <span>{kindText(bill)}</span>
            {items.length > 0 && <><span className="sep">·</span><span className="age">{items.length} รายการ</span></>}
            <span className="sep">·</span><span>{bill.submittedByName || '—'}</span>
            {/* บัญชีปลายทาง — เงินจะออกไปเข้าบัญชีนี้ ห้ามหายจากคิวเด็ดขาด */}
            {bill.payeeAccountNo && <><span className="sep">·</span>
              <span className="age">โอนไป {bill.payeeBank || ''} ••{String(bill.payeeAccountNo).slice(-4)}</span></>}
            {age && <><span className="sep">·</span><span className="age">{age}</span></>}
          </div>
        </div>
        <div className="act">
          {items.length > 0 && (
            <button type="button" className="more" aria-expanded={open} onClick={() => setOpen(v => !v)}
              aria-label={open ? 'ย่อรายการ' : 'ดูรายการทั้งหมด ' + items.length + ' รายการ'}>
              <ChevronDown className="w-4 h-4" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
            </button>
          )}
          {isAdmin && pending && <button type="button" className="pay" onClick={() => onPay(bill)}>จ่าย</button>}
          {depositAwaiting && <button type="button" className="pay" onClick={() => onReceived(bill)}>ของมาแล้ว</button>}
          {hasMenu && <div className="menuwrap" onKeyDown={e => { if (e.key === 'Escape') closeMenu() }}>
            <button ref={moreRef} type="button" className="more" aria-haspopup="menu" aria-expanded={menu}
              aria-label="ตัวเลือกเพิ่มเติม" onClick={() => setMenu(v => !v)}>
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menu && <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={closeMenu} />
              <ul className="menu" role="menu">
                {bill.publicToken && <li role="none"><button role="menuitem" type="button" onClick={() => act(() => window.open('/receipt/' + bill.publicToken, '_blank'))}>
                  <PackageCheck className="w-4 h-4" />{bill.kind === 'billing_link' ? 'ดูใบวางบิล' : 'ดูใบรับของ'}</button></li>}
                {bill.hasEvidence && <li role="none"><button role="menuitem" type="button" onClick={() => act(() => onView(bill))}>
                  <Receipt className="w-4 h-4" />ดูหลักฐาน</button></li>}
                {showCert && <li role="none"><button role="menuitem" type="button" onClick={() => act(openCert)}>
                  <FileText className="w-4 h-4" />ใบรับรอง</button></li>}
                {bill.kind === 'billing_link' && bill.status === 'paid' && bill.createdTxId && (
                  <li role="none"><AttachSlipBtn txId={bill.createdTxId} onDone={onDone} /></li>
                )}
                {bill.publicToken && pending && <li role="none"><button role="menuitem" type="button"
                  onClick={() => copy(window.location.origin + '/receipt/' + bill.publicToken, 'คัดลอกลิงก์คู่ค้าแล้ว')}>
                  <FileText className="w-4 h-4" />คัดลอกลิงก์คู่ค้า</button></li>}
                {pending && <li role="none"><button role="menuitem" type="button"
                  onClick={() => copy(window.location.origin + '/pending-bills?pay=' + bill.id, 'คัดลอกลิงก์จ่ายแล้ว')}>
                  <FileText className="w-4 h-4" />คัดลอกลิงก์จ่าย</button></li>}
                {isAdmin && bill.status === 'paid' && !bill.refundTxId && <li role="none"><button role="menuitem" type="button"
                  onClick={() => act(() => onRefund(bill))}><Receipt className="w-4 h-4" />คืนเงิน</button></li>}
                {isAdmin && pending && <>
                  <li role="separator"><hr /></li>
                  <li role="none"><button role="menuitem" className="danger" type="button" onClick={() => act(() => onReject(bill))}>
                    <X className="w-4 h-4" />ปฏิเสธบิลนี้</button></li>
                </>}
              </ul>
            </>}
          </div>}
        </div>
      </div>

      {/* กางรายการ: ที่ยังไม่ลงราคาขึ้นก่อนและสว่างกว่า เพราะเป็นสิ่งเดียวที่ต้องลงมือทำ */}
      {open && items.length > 0 && (
        <div className="open">
          {unpriced.length > 0 && <p className="hint">{unpriced.length} รายการยังไม่ลงราคา — ยอดที่โชว์จึงยังไม่ใช่ยอดจริง</p>}
          <ul>
            {[...items].sort((a, b) => (Number(a.unitPrice) === 0 ? 0 : 1) - (Number(b.unitPrice) === 0 ? 0 : 1)).map((it, i) => {
              const zero = Number(it.unitPrice) === 0
              return (
                <li key={i} className={zero ? 'todo' : undefined}>
                  <span>{it.name} · {it.qty}{it.unit || ''}{zero ? '' : '×' + thb(it.unitPrice)}</span>
                  {zero ? <i>ยังไม่ลงราคา</i> : <span>= {thb(Number(it.qty) * Number(it.unitPrice))}</span>}
                </li>
              )
            })}
          </ul>
          <p className="foot">รวมที่ลงราคาแล้ว {thb(sumLineItems(items))}</p>
          {bill.status === 'rejected' && bill.rejectReason && <p className="rej">เหตุผลที่ปฏิเสธ: {bill.rejectReason}</p>}
        </div>
      )}
      {!open && bill.status === 'rejected' && bill.rejectReason && (
        <div className="open"><p className="rej" style={{ margin: 0 }}>เหตุผลที่ปฏิเสธ: {bill.rejectReason}</p></div>
      )}
    </li>
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
  const [showBilling, setShowBilling] = useState(false)
  const [payBill, setPayBill] = useState(null)
  const [refundBill, setRefundBill] = useState(null)
  const [adminFilter, setAdminFilter] = useState('pending')
  const [sortBy, setSortBy] = useState('amount')
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
  // ใบที่ยอดยังไม่ครบ — ธงเดียวในหน้านี้ที่กันความผิดพลาดเรื่องเงิน จึงมาก่อนทุกอย่าง
  const unpricedSet = new Set(billsWithUnpricedItems(bills))
  const maxAmount = bills.reduce((m, b) => Math.max(m, Number(b.amount) || 0), 0) || 1
  const strongCount = bills.filter(b => !isWeakEvidence(b.evidenceType)).length
  const weakCount = bills.length - strongCount
  const disputeCount = bills.filter(b => b.vendorAck?.disputeAt).length
  // นับ "จำนวนใบ" ไม่ใช่ผลรวมของเงื่อนไข — ใบเดียวติดได้หลายข้อพร้อมกัน
  // (เงินสดไม่มีบิล 2 ใบที่ซ้ำกัน เคยนับได้ 4 จากคิว 2 ใบ แล้วแถบวิ่งเกิน 100%)
  const needLookIds = new Set([
    ...unpricedSet, ...dupSet,
    ...bills.filter(b => isWeakEvidence(b.evidenceType)).map(b => b.id),
    ...bills.filter(b => b.vendorAck?.disputeAt).map(b => b.id),
  ])
  const needLookCount = needLookIds.size
  const ordered = [...bills].sort((a, b) => {
    // ใบที่ยอดไม่ครบลอยขึ้นบนสุดเสมอ ไม่ว่าจะเรียงแบบไหน
    const ta = unpricedSet.has(a.id) ? 0 : 1
    const tb = unpricedSet.has(b.id) ? 0 : 1
    if (ta !== tb) return ta - tb
    if (sortBy === 'age') {
      // ไม่มีวันที่ = ไม่รู้ว่าค้างนานแค่ไหน ให้ไปท้ายแถว ไม่ใช่ลอยขึ้นบนเป็นใบเก่าสุด
      const ta = parseTs(a.createdAt), tb = parseTs(b.createdAt)
      return (Number.isFinite(ta) ? ta : Infinity) - (Number.isFinite(tb) ? tb : Infinity)
    }
    return (Number(b.amount) || 0) - (Number(a.amount) || 0)
  })
  const todoBills = ordered.filter(b => unpricedSet.has(b.id))
  const restBills = ordered.filter(b => !unpricedSet.has(b.id))
  const rowOf = (b) => (
    <BillRow key={b.id} bill={b} isAdmin={isAdmin} isDup={dupSet.has(b.id)}
      widthRatio={(Number(b.amount) || 0) / maxAmount}
      onPay={setPayBill} onReject={reject} onView={view} onReceived={received}
      onRefund={setRefundBill} onDone={load} />
  )
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
    <div className="pb max-w-4xl mx-auto p-4">
      <PendingBillStyles />
      <div className="top">
        <div>
          <h1 className="h1">{isAdmin ? (adminFilter === 'paid' ? 'บิลที่จ่ายแล้ว' : 'คิวบิลรอจ่าย') : 'บิลรอจ่ายของฉัน'}</h1>
          <p className="sum">
            {bills.length} รายการ · รวม {thb(total)}
            {depositAwaitingCount > 0 && ` · มัดจำรอของ ${depositAwaitingCount}`}
          </p>
        </div>
        <div className="acts">
          <button type="button" className="abtn" onClick={() => setShowBilling(true)}
            title="ไม่ได้เจอตัวคู่ค้า — ส่งลิงก์ให้เขายืนยันเอง"><FileText className="w-4 h-4" />วางบิล</button>
          <button type="button" className="abtn" onClick={() => setShowReceipt(true)}
            title="เจอตัวคู่ค้า — ให้เซ็นต่อหน้าตอนรับของ"><Truck className="w-4 h-4" />รับของ</button>
          <button type="button" className="abtn abtn--go" onClick={() => setShowSubmit(true)}>
            <Plus className="w-4 h-4" />แจ้งบิล</button>
        </div>
      </div>

      {/* ธงกันจ่ายยอดขาด — ขึ้นก่อนทุกอย่างเพราะเป็นเรื่องเงินที่ย้อนกลับไม่ได้ */}
      {unpricedSet.size > 0 && (
        <div className="alarm" role="alert">
          <AlertTriangle className="w-4 h-4" style={{ flex: 'none', color: '#f59e0b' }} />
          <span><b>{unpricedSet.size} ใบยอดยังไม่ครบ</b> — มีของที่รับมาแล้วแต่ยังไม่ลงราคา
            จ่ายตอนนี้จะบันทึกยอดขาด ต้องปฏิเสธแล้วออกใบใหม่ให้ราคาครบก่อน</span>
        </div>
      )}

      {/* ของที่ทุกใบเหมือนกันอยู่ตรงนี้ที่เดียว ไม่ใช่ป้ายซ้ำบนทุกแถว */}
      {bills.length > 0 && (
        <div className="rail">
          <div className="rc">
            <h2>หลักฐาน</h2>
            <div className="v"><b>{strongCount}</b><span>/ {bills.length} ใบ แข็ง</span></div>
            <div className="track"><i style={{ '--p': Math.round((strongCount / bills.length) * 100) + '%' }} /></div>
            <p>{weakCount === 0 ? 'ทุกใบมีสลิปหรือใบเสร็จ' : `${weakCount} ใบเป็นเงินสดไม่มีบิล`}</p>
          </div>
          <div className={'rc' + (needLookCount > 0 ? ' rc--todo' : '')}>
            <h2>ต้องดูก่อนจ่าย</h2>
            <div className="v"><b>{needLookCount}</b><span>{needLookCount === 0 ? 'ไม่มี' : 'ใบ'}</span></div>
            <div className="track"><i style={{ '--p': Math.round((needLookCount / bills.length) * 100) + '%' }} /></div>
            <p>ยอดไม่ครบ {unpricedSet.size} · หลักฐานอ่อน {weakCount} · อาจซ้ำ {dupSet.size} · ทักท้วง {disputeCount}</p>
          </div>
        </div>
      )}

      <div className="tools">
        {isAdmin && (
          <div className="seg">
            {[['pending', 'รอจ่าย'], ['paid', 'จ่ายแล้ว']].map(([v, label]) => (
              <button key={v} type="button" className="seg-b" aria-pressed={adminFilter === v}
                onClick={() => setAdminFilter(v)}>{label}</button>
            ))}
          </div>
        )}
        <span className="spacer" />
        <span className="tlabel">เรียงตาม</span>
        <div className="seg">
          {[['amount', 'ยอดมาก→น้อย'], ['age', 'ค้างนานสุด']].map(([v, label]) => (
            <button key={v} type="button" className="seg-b" aria-pressed={sortBy === v}
              onClick={() => setSortBy(v)}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? <p className="sum" style={{ padding: '18px 2px' }}>กำลังโหลด...</p>
        : bills.length === 0 ? (
          <div className="panel"><div className="empty">
            <Receipt className="w-8 h-8" style={{ margin: '0 auto', opacity: .5, color: '#93a0b8' }} />
            <p>{isAdmin && adminFilter === 'paid' ? 'ยังไม่มีบิลที่จ่ายแล้ว' : 'ยังไม่มีบิลรอจ่าย'}</p>
          </div></div>
        ) : (
          <div className="panel">
            <div className="colhead"><span className="ch-a">ยอด</span><span>คู่ค้า</span></div>
            {todoBills.length > 0 && <>
              <div className="gh gh--todo">ต้องดูก่อน <span className="gc">{todoBills.length}</span></div>
              <ul className="list">{todoBills.map(rowOf)}</ul>
            </>}
            {restBills.length > 0 && <>
              {todoBills.length > 0 && <div className="gh">{!isAdmin ? 'บิลอื่นของฉัน' : (adminFilter === 'paid' ? 'จ่ายแล้ว' : 'พร้อมจ่าย')} <span className="gc">{restBills.length}</span></div>}
              <ul className="list">{restBills.map(rowOf)}</ul>
            </>}
          </div>
        )}

      {isAdmin && Object.entries(ratios).filter(([, r]) => r >= 40).map(([uid, r]) => {
        const nm = bills.find(b => b.submittedByUserId === uid)?.submittedByName || uid
        return <div key={uid} className="watch"><AlertTriangle className="w-4 h-4" style={{ flex: 'none' }} />{nm}: บิลไม่มีบิล {r}% ของยอดรอจ่าย — จับตา</div>
      })}
      {showSubmit && <SubmitBillModal me={user} onClose={() => setShowSubmit(false)} onDone={load} />}
      {showReceipt && <GoodsReceiptModal me={user} onClose={() => setShowReceipt(false)} onDone={load} />}
      {showBilling && <BillingLinkModal me={user} onClose={() => setShowBilling(false)} onDone={load} />}
      {payBill && <PayModal bill={payBill} onClose={() => setPayBill(null)} onDone={load} />}
      {refundBill && <RefundModal bill={refundBill} onClose={() => setRefundBill(null)} onDone={load} />}
    </div>
  )
}
