import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { Plus, Pencil, Trash2, X, MessageCircle } from 'lucide-react'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }
const ROLES = ['admin', 'staff', 'viewer']
const ROLE_LABEL = { admin: 'Admin', staff: 'Staff', viewer: 'Viewer' }
const ROLE_STYLE = {
  admin: { color: '#c084fc', background: 'rgba(192,132,252,0.15)' },
  staff: { color: '#60a5fa', background: 'rgba(96,165,250,0.15)' },
  viewer: { color: '#94a3b8', background: 'rgba(148,163,184,0.15)' },
}
const EMPTY = { email: '', password: '', name: '', role: 'staff' }

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

export default function Users() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const d = await api.users()
    setUsers(d.users || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(EMPTY); setErr(''); setShowForm(true) }
  const openEdit = (u) => { setEditing(u); setForm({ email: u.email, password: '', name: u.name, role: u.role }); setErr(''); setShowForm(true) }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      if (editing) {
        const body = { name: form.name, role: form.role }
        if (form.password) body.password = form.password
        await api.updateUser(editing.id, body)
      } else {
        await api.createUser(form)
      }
      setShowForm(false)
      load()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const del = async (u) => {
    if (u.id === me.id) return alert('ไม่สามารถลบตัวเองได้')
    if (!confirm(`ลบผู้ใช้ "${u.name}"?`)) return
    try { await api.deleteUser(u.id); load() } catch (e) { alert(e.message) }
  }

  if (loading) return (
    <div className="p-6 flex items-center gap-2 text-slate-500">
      <div className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      กำลังโหลด...
    </div>
  )

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">จัดการผู้ใช้</h2>
          <p className="text-sm text-slate-500 mt-0.5">{users.length} ผู้ใช้ในระบบ</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-3 sm:px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /><span className="hidden sm:inline">เพิ่มผู้ใช้</span><span className="sm:hidden">เพิ่ม</span>
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={CARD}>
        {/* Mobile cards */}
        <div className="md:hidden divide-y" style={{ borderColor: '#1a2035' }}>
          {users.map(u => (
            <div key={u.id} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-medium text-slate-200 text-sm">
                    {u.name} {u.id === me.id && <span className="text-xs text-slate-500">(คุณ)</span>}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{u.email}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(u)} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {u.id !== me.id && (
                    <button onClick={() => del(u)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={ROLE_STYLE[u.role]}>
                  {ROLE_LABEL[u.role]}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={u.isActive ? { color: '#34d399', background: 'rgba(16,185,129,0.15)' } : { color: '#f87171', background: 'rgba(239,68,68,0.15)' }}>
                  {u.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #1f2937', background: '#111827' }}>
                {['ชื่อ', 'อีเมล', 'Role', 'สถานะ', ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className="hover:bg-white/[0.02] transition-colors"
                  style={{ borderBottom: i < users.length - 1 ? '1px solid #1a2035' : 'none' }}>
                  <td className="px-4 py-3 font-medium text-slate-200">
                    {u.name} {u.id === me.id && <span className="text-xs text-slate-500">(คุณ)</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={ROLE_STYLE[u.role]}>
                      {ROLE_LABEL[u.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={u.isActive ? { color: '#34d399', background: 'rgba(16,185,129,0.15)' } : { color: '#f87171', background: 'rgba(239,68,68,0.15)' }}>
                      {u.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(u)} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {u.id !== me.id && (
                        <button onClick={() => del(u)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <LineUsersCard />

      {showForm && (
        <Modal title={editing ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'} onClose={() => setShowForm(false)}>
          <form onSubmit={save} className="space-y-3">
            <div><label className="block text-xs font-medium text-slate-400 mb-1.5">ชื่อ</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className={INPUT} style={INPUT_STYLE} /></div>
            {!editing && (
              <div><label className="block text-xs font-medium text-slate-400 mb-1.5">อีเมล</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required className={INPUT} style={INPUT_STYLE} /></div>
            )}
            <div><label className="block text-xs font-medium text-slate-400 mb-1.5">{editing ? 'รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' : 'รหัสผ่าน'}</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required={!editing} minLength={editing ? undefined : 6} className={INPUT} style={INPUT_STYLE} /></div>
            <div><label className="block text-xs font-medium text-slate-400 mb-1.5">Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select></div>
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <button type="submit" disabled={saving}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

function LineUsersCard() {
  const [lineUsers, setLineUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { const d = await api.lineUsers(); setLineUsers(d.lineUsers || []) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const del = async (u) => {
    if (!confirm(`ลบ ${u.employeeName} ออกจากการลงทะเบียน LINE?`)) return
    try { await api.deleteLineUser(u.id); setLineUsers(l => l.filter(x => x.id !== u.id)) }
    catch (e) { alert(e.message) }
  }

  return (
    <div className="rounded-2xl p-5 mt-6" style={CARD}>
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="w-4 h-4 text-green-400" />
        <h2 className="font-semibold text-slate-200 text-sm">พนักงานที่ลงทะเบียน LINE Bot</h2>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        พนักงานส่ง <span className="text-slate-300 font-mono">ลงทะเบียน ชื่อ</span> ไปที่ LINE Bot ของร้านเพื่อผูกบัญชี
        รายการที่ส่งผ่าน LINE จะแสดงชื่อผู้บันทึกอัตโนมัติ
      </p>
      {loading ? (
        <p className="text-slate-500 text-sm text-center py-4">กำลังโหลด...</p>
      ) : lineUsers.length === 0 ? (
        <p className="text-slate-600 text-sm text-center py-4">ยังไม่มีพนักงานลงทะเบียน</p>
      ) : (
        <div className="space-y-2">
          {lineUsers.map(u => (
            <div key={u.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: '#0d1120', border: '1px solid #1f2937' }}>
              <div>
                <p className="text-sm font-medium text-slate-200">{u.employeeName}</p>
                {u.lineDisplayName && u.lineDisplayName !== u.employeeName && (
                  <p className="text-xs text-slate-500">LINE: {u.lineDisplayName}</p>
                )}
                <p className="text-xs text-slate-600 font-mono">{u.lineUserId.slice(0, 16)}…</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{u.createdAt?.slice(0, 10)}</span>
                <button onClick={() => del(u)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
