import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { thb } from '../fmt'
import { useAuth } from '../AuthContext'
import { Plus, Pencil, Trash2, X, Play, Pause, Zap } from 'lucide-react'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }
const FREQ_LABEL = { daily: 'ทุกวัน', weekly: 'ทุกสัปดาห์', monthly: 'ทุกเดือน', yearly: 'ทุกปี' }
const EMPTY = { name: '', amount: '', type: 'expense', scope: 'business', frequency: 'monthly', dueDay: '1', walletId: '', categoryId: '', autoCreate: true, draftMode: false, nextDueDate: '' }

function Label({ children }) {
  return <label className="block text-xs font-medium text-slate-400 mb-1.5">{children}</label>
}

export default function Recurring() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [wallets, setWallets] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [triggering, setTriggering] = useState(null)

  const canWrite = user?.role === 'admin' || user?.role === 'staff'
  const isDaily = form.frequency === 'daily'

  const load = useCallback(async () => {
    setLoading(true)
    const [rd, wd, cd] = await Promise.all([api.recurring(), api.wallets(), api.categories()])
    setItems(rd.recurring || [])
    setWallets(wd.wallets || [])
    setCategories(cd.categories || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const mainCats = categories.filter(c => !c.parentId)

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY, walletId: wallets[0]?.id || '' })
    setErr('')
    setShowForm(true)
  }

  const openEdit = (r) => {
    setEditing(r)
    setForm({
      name: r.name, amount: String(r.amount), type: r.type, scope: r.scope,
      frequency: r.frequency, dueDay: String(r.dueDay), walletId: r.walletId,
      categoryId: r.categoryId || '', autoCreate: r.autoCreate,
      draftMode: r.draftMode || false, nextDueDate: r.nextDueDate || '',
    })
    setErr('')
    setShowForm(true)
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      const body = {
        ...form,
        amount: Number(form.amount),
        dueDay: Number(form.dueDay) || 1,
      }
      if (!body.categoryId) delete body.categoryId
      if (!body.nextDueDate) delete body.nextDueDate
      if (editing) await api.updateRecurring(editing.id, body)
      else await api.createRecurring(body)
      setShowForm(false)
      load()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const del = async (r) => {
    if (!confirm(`ลบรายการประจำ "${r.name}"?`)) return
    try { await api.deleteRecurring(r.id); load() } catch (e) { alert(e.message) }
  }

  const trigger = async (r) => {
    if (!confirm(`สร้างรายการ "${r.name}" ทันทีใช่ไหม?`)) return
    setTriggering(r.id)
    try {
      await api.triggerRecurring(r.id)
      alert('สร้างรายการแล้ว')
      load()
    } catch (e) { alert(e.message) } finally { setTriggering(null) }
  }

  const toggleActive = async (r) => {
    try {
      await api.updateRecurring(r.id, { isActive: !r.isActive })
      load()
    } catch (e) { alert(e.message) }
  }

  if (loading) return (
    <div className="p-6 flex items-center gap-2 text-slate-500">
      <div className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      กำลังโหลด...
    </div>
  )

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">รายการประจำ</h2>
          <p className="text-sm text-slate-500 mt-0.5">รายรับ/รายจ่ายที่เกิดซ้ำอัตโนมัติ · {items.length} รายการ</p>
        </div>
        {canWrite && (
          <button onClick={openCreate} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> เพิ่มรายการประจำ
          </button>
        )}
      </div>

      <div className="rounded-xl p-3 text-xs text-slate-500" style={CARD}>
        <Zap className="w-3 h-3 inline mr-1.5 text-yellow-400" />
        ระบบจะสร้างรายการอัตโนมัติทุกวันเวลา 08:00 น. (ตาม Cron Trigger ที่ตั้งไว้) สำหรับรายการที่ถึงกำหนด
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={CARD}>
          <p className="text-slate-400 text-sm font-medium">ยังไม่มีรายการประจำ</p>
          <p className="text-slate-600 text-xs mt-1">เพิ่มรายการที่ต้องบันทึกซ้ำทุกวัน/สัปดาห์/เดือน/ปี</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(r => {
            const wallet = wallets.find(w => w.id === r.walletId)
            const cat = categories.find(c => c.id === r.categoryId)
            const freqText = r.frequency === 'daily'
              ? 'ทุกวัน'
              : `${FREQ_LABEL[r.frequency]} (วันที่ ${r.dueDay})`
            return (
              <div key={r.id} className="rounded-xl p-4" style={{ ...CARD, opacity: r.isActive ? 1 : 0.5 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-slate-200">{r.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.type === 'income' ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'}`}>
                        {r.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                      </span>
                      {!r.isActive && <span className="text-xs text-slate-600 bg-slate-700 px-2 py-0.5 rounded-full">หยุดพัก</span>}
                    </div>
                    <p className={`text-xl font-bold ${r.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.type === 'income' ? '+' : '-'}{thb(r.amount)}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs text-slate-500">
                      <span>{freqText}</span>
                      {wallet && <span>กระเป๋า: {wallet.name}</span>}
                      {cat && <span>หมวด: {cat.name}</span>}
                      {r.nextDueDate && <span className="text-slate-400">ครั้งถัดไป: {r.nextDueDate}</span>}
                      {r.autoCreate && <span className="text-emerald-500">auto ✓</span>}
                      {r.draftMode && <span className="text-amber-400">draft mode</span>}
                    </div>
                  </div>
                  {canWrite && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => trigger(r)} disabled={!!triggering}
                        title="สร้างรายการทันที"
                        className="p-1.5 text-slate-500 hover:text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition-colors disabled:opacity-40">
                        {triggering === r.id ? <div className="w-3.5 h-3.5 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => toggleActive(r)}
                        title={r.isActive ? 'หยุดพัก' : 'เปิดใช้งาน'}
                        className={`p-1.5 rounded-lg transition-colors ${r.isActive ? 'text-slate-500 hover:text-orange-400 hover:bg-orange-500/10' : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10'}`}>
                        {r.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => openEdit(r)} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => del(r)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
          <div className="w-full sm:max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
            style={{ background: '#161b2e', border: '1px solid #2e3349' }}>
            <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-700" />
            </div>
            <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
              <h3 className="font-semibold text-slate-200">{editing ? 'แก้ไขรายการประจำ' : 'เพิ่มรายการประจำ'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300 p-1"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="p-5 space-y-3 overflow-y-auto">
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
                  <Label>ความถี่</Label>
                  <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                    <option value="daily">ทุกวัน</option>
                    <option value="weekly">ทุกสัปดาห์</option>
                    <option value="monthly">ทุกเดือน</option>
                    <option value="yearly">ทุกปี</option>
                  </select>
                </div>
              </div>
              <div className={`gap-3 ${isDaily ? '' : 'grid grid-cols-2'}`}>
                {!isDaily && (
                  <div>
                    <Label>วันที่ครบกำหนด</Label>
                    <input type="number" min="1" max="31" value={form.dueDay} onChange={e => setForm(f => ({ ...f, dueDay: e.target.value }))} required className={INPUT} style={INPUT_STYLE} placeholder="1-31" />
                  </div>
                )}
                <div>
                  <Label>วันที่เริ่มต้น (ไม่บังคับ)</Label>
                  <input type="date" value={form.nextDueDate} onChange={e => setForm(f => ({ ...f, nextDueDate: e.target.value }))} className={INPUT} style={INPUT_STYLE} />
                </div>
              </div>
              <div>
                <Label>กระเป๋าเงิน</Label>
                <select value={form.walletId} onChange={e => setForm(f => ({ ...f, walletId: e.target.value }))} required className={INPUT} style={INPUT_STYLE}>
                  <option value="">เลือก...</option>
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <Label>หมวดหมู่ (ไม่บังคับ)</Label>
                <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                  <option value="">ไม่ระบุ</option>
                  {mainCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.autoCreate} onChange={e => setForm(f => ({ ...f, autoCreate: e.target.checked }))}
                  className="w-4 h-4 rounded accent-emerald-500" />
                <span className="text-sm text-slate-300">สร้างรายการอัตโนมัติ</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.draftMode} onChange={e => setForm(f => ({ ...f, draftMode: e.target.checked }))}
                  className="w-4 h-4 rounded accent-amber-500" />
                <div>
                  <span className="text-sm text-slate-300">Draft Mode</span>
                  <p className="text-xs text-slate-500">สร้างเป็น Draft ให้ยืนยันยอด+แนบสลิปในภายหลัง</p>
                </div>
              </label>
              {err && <p className="text-red-400 text-sm">{err}</p>}
              <button type="submit" disabled={saving}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
