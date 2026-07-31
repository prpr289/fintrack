import { useState } from 'react'
import { api } from '../api'
import { X } from 'lucide-react'

const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }

export function Label({ children, hint }) {
  return (
    <label className="block text-xs font-medium text-slate-400 mb-1">
      {children}{hint && <span className="text-slate-600 font-normal"> — {hint}</span>}
    </label>
  )
}

export function Section({ title, sub, children }) {
  return (
    <div className="pt-4 mt-4 first:pt-0 first:mt-0" style={{ borderTop: '1px solid #1f2937' }}>
      <h4 className="text-xs font-bold text-emerald-400">{title}</h4>
      {sub && <p className="text-xs text-slate-600 mt-0.5 mb-3">{sub}</p>}
      <div className={sub ? 'space-y-3' : 'space-y-3 mt-3'}>{children}</div>
    </div>
  )
}

// One modal for both "เพิ่มร้านค้า" and "แก้ไข" — merchant=null means create.
// Only the name is required; everything else can be filled in later, because a
// half-filled merchant beats an abandoned form at the counter.
export default function MerchantModal({ merchant, cats, wallets, onClose, onDone }) {
  const isNew = !merchant
  const mainCats = cats.filter(c => !c.parentId)
  const subCatsOf = (pid) => cats.filter(c => c.parentId === pid)
  const [form, setForm] = useState({
    vendorName: merchant?.vendorName || '',
    taxId: merchant?.taxId || '',
    address: merchant?.address || '',
    phone: merchant?.phone || '',
    categoryId: merchant?.typicalCategoryId || '',
    subCategoryId: merchant?.typicalSubCategoryId || '',
    walletId: merchant?.typicalWalletId || '',
    bankName: merchant?.bankName || '',
    bankAccountNo: merchant?.bankAccountNo || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async (e) => {
    e.preventDefault()
    setSaving(true); setErr('')
    const body = {
      vendorName: form.vendorName.trim(),
      taxId: form.taxId, address: form.address, phone: form.phone,
      categoryId: form.categoryId,
      subCategoryId: form.categoryId ? form.subCategoryId : '',
      walletId: form.walletId,
      bankName: form.bankName, bankAccountNo: form.bankAccountNo,
    }
    try {
      const res = isNew ? await api.createMerchant(body) : await api.updateVendor(merchant.id, body)
      onDone(res.vendor); onClose()
    } catch (e2) { setErr(e2.message); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="w-full sm:max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
        style={{ background: '#161b2e', border: '1px solid #2e3349' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
          <h3 className="font-semibold text-slate-200">{isNew ? 'เพิ่มร้านค้า' : 'แก้ไขร้านค้า'}</h3>
          <button onClick={onClose} aria-label="ปิด" title="ปิด" className="text-slate-500 hover:text-slate-300 p-2"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={save} className="px-5 py-4 overflow-y-auto">

          <Section title="ข้อมูลร้าน" sub="ชื่อร้านควรตรงกับที่อ่านได้จากสลิป เพื่อให้บอทจับคู่อัตโนมัติเจอ">
            <div>
              <Label>ชื่อร้านค้า / ผู้รับเงิน</Label>
              <input value={form.vendorName} onChange={e => set('vendorName', e.target.value)} required autoFocus={isNew} className={INPUT} style={INPUT_STYLE} />
            </div>
            <div>
              <Label>ที่อยู่</Label>
              <input value={form.address} onChange={e => set('address', e.target.value)} className={INPUT} style={INPUT_STYLE} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>เบอร์โทร</Label>
                <input value={form.phone} onChange={e => set('phone', e.target.value)} className={INPUT} style={INPUT_STYLE} />
              </div>
              <div>
                <Label>เลขผู้เสียภาษี</Label>
                <input value={form.taxId} onChange={e => set('taxId', e.target.value)} inputMode="numeric" className={INPUT} style={INPUT_STYLE} />
              </div>
            </div>
          </Section>

          <Section title="บัญชีรับเงิน" sub="ใช้ตอนจ่ายบิล — ระบบจะโชว์ให้ยืนยันก่อนโอนทุกครั้ง">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>ธนาคาร</Label>
                <input value={form.bankName} onChange={e => set('bankName', e.target.value)} className={INPUT} style={INPUT_STYLE} />
              </div>
              <div>
                <Label>เลขที่บัญชี</Label>
                <input value={form.bankAccountNo} onChange={e => set('bankAccountNo', e.target.value)} inputMode="numeric" className={INPUT} style={INPUT_STYLE} />
              </div>
            </div>
          </Section>

          <Section title="ค่าตั้งต้นเวลาแจ้งบิล" sub="เลือกร้านนี้ตอนแจ้งบิล แล้ว 3 ช่องนี้จะเติมให้อัตโนมัติ">
            <div>
              <Label>หมวดค่าใช้จ่าย</Label>
              <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value, subCategoryId: '' }))} className={INPUT} style={INPUT_STYLE}>
                <option value="">— ไม่ระบุ —</option>
                {mainCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {form.categoryId && subCatsOf(form.categoryId).length > 0 && (
              <div>
                <Label>หมวดย่อย</Label>
                <select value={form.subCategoryId} onChange={e => set('subCategoryId', e.target.value)} className={INPUT} style={INPUT_STYLE}>
                  <option value="">— ไม่ระบุ —</option>
                  {subCatsOf(form.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <Label>กระเป๋าเงินที่ใช้ประจำ</Label>
              <select value={form.walletId} onChange={e => set('walletId', e.target.value)} className={INPUT} style={INPUT_STYLE}>
                <option value="">— ไม่ระบุ —</option>
                {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </Section>

          {err && <p className="text-red-400 text-sm mt-3" role="alert">{err}</p>}
          <button type="submit" disabled={saving}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors mt-4">
            {saving ? 'กำลังบันทึก...' : isNew ? 'เพิ่มร้านค้า' : 'บันทึก'}
          </button>
        </form>
      </div>
    </div>
  )
}
