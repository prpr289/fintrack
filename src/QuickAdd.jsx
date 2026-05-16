import { useState } from 'react'
import { api } from './api'
import { today } from './fmt'
import { useAuth } from './AuthContext'
import { Plus, X, Loader2, Paperclip, Check } from 'lucide-react'

const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }

function Label({ children }) {
  return <label className="block text-xs font-medium text-slate-400 mb-1.5">{children}</label>
}

function SlipUploadStep({ tx, onDone }) {
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(0)

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) {
        await api.uploadSlip(tx.id, file, tx.transferPairId ? 'transfer' : 'receipt')
        setUploaded(n => n + 1)
      }
    } catch (e) { alert(e.message) } finally { setUploading(false) }
  }

  return (
    <div className="p-5 space-y-4">
      <div className="text-center space-y-1">
        <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
          <Check className="w-5 h-5 text-emerald-400" />
        </div>
        <p className="font-semibold text-slate-200 text-sm">บันทึกแล้ว</p>
        <p className="text-xs text-slate-500 truncate max-w-[240px] mx-auto">{tx.name}</p>
      </div>

      <div className="space-y-2">
        <Label>แนบสลิป / ใบเสร็จ (ไม่บังคับ)</Label>
        <label className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm cursor-pointer transition-colors ${uploading ? 'opacity-50 pointer-events-none' : 'hover:bg-white/5'}`}
          style={{ border: '2px dashed #2e3349', color: '#94a3b8' }}>
          {uploading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> กำลังอัพโหลด...</>
            : <><Paperclip className="w-4 h-4" /> เลือกไฟล์ (หลายไฟล์ได้)</>
          }
          <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handleFiles} />
        </label>
        {uploaded > 0 && (
          <p className="text-xs text-emerald-400 text-center">อัพโหลดแล้ว {uploaded} ไฟล์</p>
        )}
        <p className="text-xs text-slate-600 text-center">JPG, PNG, HEIC, PDF · สูงสุด 10MB/ไฟล์</p>
      </div>

      <button onClick={onDone}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
        เสร็จสิ้น
      </button>
    </div>
  )
}

export default function QuickAdd() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState('form') // 'form' | 'slip'
  const [wallets, setWallets] = useState([])
  const [categories, setCategories] = useState([])
  const [loadingData, setLoadingData] = useState(false)
  const [form, setForm] = useState({ name: '', amount: '', type: 'expense', scope: 'business', date: today(), walletId: '', categoryId: '', subCategoryId: '', note: '' })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedTx, setSavedTx] = useState(null)

  const canWrite = user?.role === 'admin' || user?.role === 'staff'

  const openModal = async () => {
    setStep('form')
    setErr('')
    setSavedTx(null)
    setOpen(true)
    setLoadingData(true)
    try {
      const [wd, cd] = await Promise.all([api.wallets(), api.categories()])
      const ws = wd.wallets || []
      setWallets(ws)
      setCategories(cd.categories || [])
      setForm({ name: '', amount: '', type: 'expense', scope: 'business', date: today(), walletId: ws[0]?.id || '', categoryId: '', subCategoryId: '', note: '' })
    } catch (e) { setErr(e.message) } finally { setLoadingData(false) }
  }

  const close = () => { setOpen(false); setSavedTx(null); setStep('form') }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      const body = { ...form, amount: Number(form.amount) }
      if (!body.categoryId) delete body.categoryId
      if (!body.subCategoryId) delete body.subCategoryId
      if (!body.note) delete body.note
      const res = await api.createTransaction(body)
      setSavedTx(res?.transaction || null)
      setStep('slip')
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  if (!canWrite) return null

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={openModal}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-150 hover:scale-110 active:scale-95"
        style={{ boxShadow: '0 4px 24px rgba(16,185,129,0.4)' }}
        title="เพิ่มรายการธุรกรรม"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
          <div className="w-full sm:max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
            style={{ background: '#161b2e', border: '1px solid #2e3349' }}>
            {/* Drag handle (mobile) */}
            <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-700" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
              <h3 className="font-semibold text-slate-200">
                {step === 'form' ? 'เพิ่มรายการธุรกรรม' : 'แนบสลิป'}
              </h3>
              <button onClick={close} className="text-slate-500 hover:text-slate-300 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            {step === 'slip' && savedTx ? (
              <SlipUploadStep tx={savedTx} onDone={close} />
            ) : loadingData ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
              </div>
            ) : (
              <form onSubmit={save} className="p-5 space-y-3 overflow-y-auto">
                <div>
                  <Label>ชื่อรายการ</Label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required autoFocus className={INPUT} style={INPUT_STYLE} placeholder="เช่น ค่าวัตถุดิบ, ยอดขาย..." />
                </div>

                {/* Type + Scope */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>ประเภท</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[['expense', 'รายจ่าย', 'text-red-400', 'border-red-500/50', 'rgba(239,68,68,0.08)'],
                        ['income',  'รายรับ',  'text-emerald-400', 'border-emerald-500/50', 'rgba(16,185,129,0.08)']].map(([val, label, color, border, bg]) => (
                        <button key={val} type="button" onClick={() => setForm(f => ({ ...f, type: val }))}
                          className={`py-2 rounded-lg text-xs font-semibold transition-colors ${form.type === val ? color : 'text-slate-500 hover:text-slate-300'}`}
                          style={{ border: `1px solid ${form.type === val ? border.replace('border-', '') : '#374151'}`, background: form.type === val ? bg : '#0d1120' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Scope</Label>
                    <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                      <option value="business">ธุรกิจ</option>
                      <option value="personal">ส่วนตัว</option>
                    </select>
                  </div>
                </div>

                {/* Amount + Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>จำนวนเงิน (บาท)</Label>
                    <input type="number" min="0.01" step="0.01" value={form.amount}
                      onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                      required className={INPUT} style={INPUT_STYLE} placeholder="0.00" />
                  </div>
                  <div>
                    <Label>วันที่</Label>
                    <input type="date" value={form.date}
                      onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                      required className={INPUT} style={INPUT_STYLE} />
                  </div>
                </div>

                {/* Wallet */}
                <div>
                  <Label>กระเป๋าเงิน</Label>
                  <select value={form.walletId} onChange={e => setForm(f => ({ ...f, walletId: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                    <option value="">เลือกอัตโนมัติ</option>
                    {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>

                {/* Category */}
                <div>
                  <Label>หมวดหมู่ (ไม่บังคับ)</Label>
                  <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value, subCategoryId: '' }))} className={INPUT} style={INPUT_STYLE}>
                    <option value="">ไม่ระบุ</option>
                    {categories.filter(c => !c.parentId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                {/* Sub-category */}
                {form.categoryId && categories.filter(c => c.parentId === form.categoryId).length > 0 && (
                  <div>
                    <Label>หมวดย่อย (ไม่บังคับ)</Label>
                    <select value={form.subCategoryId} onChange={e => setForm(f => ({ ...f, subCategoryId: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                      <option value="">ไม่ระบุ</option>
                      {categories.filter(c => c.parentId === form.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Note */}
                <div>
                  <Label>หมายเหตุ (ไม่บังคับ)</Label>
                  <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                    className={INPUT} style={INPUT_STYLE} placeholder="รายละเอียดเพิ่มเติม..." />
                </div>

                {err && <p className="text-red-400 text-sm">{err}</p>}

                <button type="submit" disabled={saving}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors">
                  {saving ? 'กำลังบันทึก...' : 'บันทึก & แนบสลิป →'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
