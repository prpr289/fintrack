import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../AuthContext'

const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }
const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const ROLE_LABEL = { admin: 'Admin', staff: 'Staff', viewer: 'Viewer' }

export default function Profile() {
  const { user, refreshUser } = useAuth()
  const [name, setName] = useState(user?.name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [profileMsg, setProfileMsg] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  const saveProfile = async (e) => {
    e.preventDefault()
    setSavingProfile(true)
    setProfileMsg('')
    try {
      await api.updateMe({ name, phone })
      await refreshUser()
      setProfileMsg('บันทึกแล้ว ✓')
    } catch (err) { setProfileMsg(err.message) } finally { setSavingProfile(false) }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    setSavingPw(true)
    setPwMsg('')
    try {
      await api.changePassword(currentPw, newPw)
      setCurrentPw('')
      setNewPw('')
      setPwMsg('เปลี่ยนรหัสผ่านแล้ว ✓')
    } catch (err) { setPwMsg(err.message) } finally { setSavingPw(false) }
  }

  return (
    <div className="p-5 max-w-lg space-y-4">
      <h2 className="text-xl font-bold text-white">โปรไฟล์</h2>

      {/* Profile card */}
      <div className="rounded-xl p-5" style={CARD}>
        <div className="flex items-center gap-4 mb-5 pb-5" style={{ borderBottom: '1px solid #1f2937' }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold"
            style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}>
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="font-semibold text-white">{user?.name}</p>
            <p className="text-sm text-slate-400">{user?.email}</p>
            <span className="text-xs px-2 py-0.5 rounded-full mt-1 inline-block"
              style={{ color: '#c084fc', background: 'rgba(192,132,252,0.15)' }}>
              {ROLE_LABEL[user?.role]}
            </span>
          </div>
        </div>

        <form onSubmit={saveProfile} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">ชื่อ</label>
            <input value={name} onChange={e => setName(e.target.value)} required className={INPUT} style={INPUT_STYLE} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">เบอร์โทร</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className={INPUT} style={INPUT_STYLE} />
          </div>
          {profileMsg && (
            <p className={`text-sm ${profileMsg.includes('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{profileMsg}</p>
          )}
          <button type="submit" disabled={savingProfile}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors">
            {savingProfile ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="rounded-xl p-5" style={CARD}>
        <h3 className="font-semibold text-slate-200 mb-4">เปลี่ยนรหัสผ่าน</h3>
        <form onSubmit={changePassword} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">รหัสผ่านปัจจุบัน</label>
            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required className={INPUT} style={INPUT_STYLE} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">รหัสผ่านใหม่</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={6} className={INPUT} style={INPUT_STYLE} />
          </div>
          {pwMsg && (
            <p className={`text-sm ${pwMsg.includes('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{pwMsg}</p>
          )}
          <button type="submit" disabled={savingPw}
            className="text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: '#1e2538', border: '1px solid #2e3349' }}
            onMouseOver={e => e.currentTarget.style.background = '#2e3349'}
            onMouseOut={e => e.currentTarget.style.background = '#1e2538'}>
            {savingPw ? 'กำลังเปลี่ยน...' : 'เปลี่ยนรหัสผ่าน'}
          </button>
        </form>
      </div>
    </div>
  )
}
