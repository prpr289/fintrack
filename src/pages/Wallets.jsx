import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { thb, today } from '../fmt'
import { useAuth } from '../AuthContext'
import { Plus, Pencil, Trash2, X, ArrowRightLeft, Lock, Unlock, Wallet } from 'lucide-react'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }
const TYPES = ['cash', 'bank', 'credit']
const SCOPES = ['business', 'personal']
const COLORS = ['#1A7A4A','#0369A1','#6B7280','#7C3AED','#B45309','#BE185D','#C0392B','#9CA3AF']
const EMPTY_W = { name: '', scope: 'business', type: 'cash', initialBalance: '', color: '#1A7A4A' }
const EMPTY_T = { fromWalletId: '', toWalletId: '', amount: '', date: today(), note: '' }

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="w-full sm:max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
        style={{ background: '#161b2e', border: '1px solid #2e3349' }}>
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
          <h3 className="font-semibold text-slate-200">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function Label({ children }) {
  return <label className="block text-xs font-medium text-slate-400 mb-1.5">{children}</label>
}

export default function Wallets() {
  const { user } = useAuth()
  const [wallets, setWallets] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_W)
  const [transfer, setTransfer] = useState(EMPTY_T)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const isAdmin = user?.role === 'admin'
  const canTransfer = user?.role === 'admin' || user?.role === 'staff'

  const load = useCallback(async () => {
    const d = await api.wallets()
    setWallets(d.wallets || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(EMPTY_W); setErr(''); setShowForm(true) }
  const openEdit = (w) => {
    setEditing(w)
    setForm({ name: w.name, scope: w.scope, type: w.type, initialBalance: w.initialBalance || '', color: w.color || '#1A7A4A' })
    setErr('')
    setShowForm(true)
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      const body = { ...form, initialBalance: form.initialBalance !== '' ? Number(form.initialBalance) : 0 }
      if (editing) await api.updateWallet(editing.id, body)
      else await api.createWallet(body)
      setShowForm(false)
      load()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const del = async (w) => {
    if (!confirm(`ลบกระเป๋า "${w.name}"?`)) return
    try { await api.deleteWallet(w.id); load() } catch (e) { alert(e.message) }
  }

  const toggleVisibility = async (w) => {
    try {
      await api.updateWallet(w.id, { staffVisible: !w.staffVisible })
      load()
    } catch (e) { alert(e.message) }
  }

  const doTransfer = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      await api.createTransfer({ ...transfer, amount: Number(transfer.amount) })
      setShowTransfer(false)
      setTransfer(EMPTY_T)
      load()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const totalBalance = wallets.reduce((s, w) => s + (w.currentBalance || 0), 0)

  if (loading) return (
    <div className="p-6 flex items-center gap-2 text-slate-500">
      <div className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      กำลังโหลด...
    </div>
  )

  return (
    <div className="wallets-page p-5 space-y-4">
      <style>{`
        .wallets-page button:focus-visible, .wallets-page input:focus-visible, .wallets-page select:focus-visible {
          outline: 2px solid rgba(16,185,129,0.55); outline-offset: 2px; border-radius: 0.5rem;
        }
        @media (prefers-reduced-motion: reduce) {
          .wallets-page *, .wallets-page *::before, .wallets-page *::after {
            animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
          }
        }
      `}</style>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-900/30"
            style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white leading-tight">กระเป๋าเงิน</h2>
            <p className="text-sm text-slate-500">ยอดรวม <span className="tabular-nums">{thb(totalBalance)}</span></p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canTransfer && (
            <button onClick={() => { setTransfer(EMPTY_T); setErr(''); setShowTransfer(true) }}
              className="flex items-center gap-2 text-slate-300 hover:text-white text-sm px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
              style={{ border: '1px solid #2e3349', background: '#161b2e' }}>
              <ArrowRightLeft className="w-4 h-4" /> โอนเงิน
            </button>
          )}
          {isAdmin && (
            <button onClick={openCreate}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-3 py-2 rounded-lg transition-colors whitespace-nowrap">
              <Plus className="w-4 h-4" /> เพิ่มกระเป๋า
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {wallets.map(w => (
          <div key={w.id} className="rounded-xl p-5 relative" style={{ ...CARD, opacity: isAdmin ? 1 : 1 }}>
            {/* Private badge for admin view */}
            {isAdmin && !w.staffVisible && (
              <div className="absolute top-3 left-3 flex items-center gap-1 text-xs text-orange-400 bg-orange-400/10 border border-orange-400/20 px-2 py-0.5 rounded-full">
                <Lock className="w-2.5 h-2.5" /> เฉพาะ Admin
              </div>
            )}
            <div className={`flex items-start justify-between ${isAdmin && !w.staffVisible ? 'mt-6' : ''} mb-4`}>
              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: w.color || '#9CA3AF' }} />
                <span className="font-semibold text-slate-200">{w.name}</span>
              </div>
              {isAdmin && (
                <div className="flex gap-1">
                  <button onClick={() => toggleVisibility(w)}
                    title={w.staffVisible ? 'ซ่อนจาก Staff' : 'แสดงให้ Staff เห็น'}
                    className={`p-1.5 rounded-lg transition-colors ${w.staffVisible ? 'text-slate-500 hover:text-orange-400 hover:bg-orange-500/10' : 'text-orange-400 bg-orange-400/10 hover:bg-orange-400/20'}`}>
                    {w.staffVisible ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => openEdit(w)} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => del(w)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            <div className={`text-2xl font-bold mb-3 tabular-nums ${(w.currentBalance || 0) < 0 ? 'text-red-400' : 'text-white'}`}>
              {thb(w.currentBalance || 0)}
            </div>
            <div className="flex gap-2">
              <span className="text-xs text-slate-400 px-2 py-0.5 rounded-full" style={{ background: '#1f2937' }}>{w.type}</span>
              <span className="text-xs text-slate-400 px-2 py-0.5 rounded-full" style={{ background: '#1f2937' }}>{w.scope === 'business' ? 'ธุรกิจ' : 'ส่วนตัว'}</span>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal title={editing ? 'แก้ไขกระเป๋า' : 'เพิ่มกระเป๋าเงิน'} onClose={() => setShowForm(false)}>
          <form onSubmit={save} className="space-y-3">
            <div><Label>ชื่อกระเป๋า</Label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className={INPUT} style={INPUT_STYLE} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>ประเภท</Label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select></div>
              <div><Label>Scope</Label>
                <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                  {SCOPES.map(s => <option key={s} value={s}>{s === 'business' ? 'ธุรกิจ' : 'ส่วนตัว'}</option>)}
                </select></div>
            </div>
            {!editing && (
              <div><Label>ยอดเริ่มต้น (บาท)</Label>
                <input type="number" step="0.01" value={form.initialBalance} onChange={e => setForm(f => ({ ...f, initialBalance: e.target.value }))} className={INPUT} style={INPUT_STYLE} placeholder="0" /></div>
            )}
            <div>
              <Label>สี</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? 'border-white scale-110' : 'border-transparent opacity-70 hover:opacity-100'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <button type="submit" disabled={saving}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </form>
        </Modal>
      )}

      {showTransfer && (
        <Modal title="โอนเงินระหว่างกระเป๋า" onClose={() => setShowTransfer(false)}>
          <form onSubmit={doTransfer} className="space-y-3">
            <div><Label>จากกระเป๋า</Label>
              <select value={transfer.fromWalletId} onChange={e => setTransfer(t => ({ ...t, fromWalletId: e.target.value }))} required className={INPUT} style={INPUT_STYLE}>
                <option value="">เลือก...</option>
                {wallets.map(w => <option key={w.id} value={w.id}>{w.name} ({thb(w.currentBalance || 0)})</option>)}
              </select></div>
            <div><Label>ไปกระเป๋า</Label>
              <select value={transfer.toWalletId} onChange={e => setTransfer(t => ({ ...t, toWalletId: e.target.value }))} required className={INPUT} style={INPUT_STYLE}>
                <option value="">เลือก...</option>
                {wallets.filter(w => w.id !== transfer.fromWalletId).map(w => <option key={w.id} value={w.id}>{w.name} ({thb(w.currentBalance || 0)})</option>)}
              </select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>จำนวนเงิน</Label>
                <input type="number" min="0.01" step="0.01" value={transfer.amount} onChange={e => setTransfer(t => ({ ...t, amount: e.target.value }))} required className={INPUT} style={INPUT_STYLE} /></div>
              <div><Label>วันที่</Label>
                <input type="date" value={transfer.date} onChange={e => setTransfer(t => ({ ...t, date: e.target.value }))} required className={INPUT} style={INPUT_STYLE} /></div>
            </div>
            <div><Label>หมายเหตุ</Label>
              <input value={transfer.note} onChange={e => setTransfer(t => ({ ...t, note: e.target.value }))} className={INPUT} style={INPUT_STYLE} /></div>
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <button type="submit" disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {saving ? 'กำลังโอน...' : 'โอนเงิน'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
