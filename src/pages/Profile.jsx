import { useState, useRef } from 'react'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { Camera, Loader2 } from 'lucide-react'
import AvatarCropModal from '../components/AvatarCropModal'

const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }
const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const ROLE_LABEL = { admin: 'Admin', staff: 'Staff', viewer: 'Viewer' }

export default function Profile() {
  const { user, refreshUser } = useAuth()
  const [name, setName] = useState(user?.name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [bankName, setBankName] = useState(user?.bankName || '')
  const [bankAccountNo, setBankAccountNo] = useState(user?.bankAccountNo || '')
  const [bankAccountName, setBankAccountName] = useState(user?.bankAccountName || '')
  const [profileMsg, setProfileMsg] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [avatarFile, setAvatarFile] = useState(null)
  const [savingAvatar, setSavingAvatar] = useState(false)
  const fileRef = useRef(null)

  const pickAvatar = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) { setProfileMsg('กรุณาเลือกไฟล์รูปภาพ'); return }
    if (f.size > 10 * 1024 * 1024) { setProfileMsg('ไฟล์ใหญ่เกิน 10MB'); return }
    setAvatarFile(f)
  }

  const saveAvatar = async (dataUrl) => {
    setSavingAvatar(true)
    setProfileMsg('')
    try {
      await api.updateMe({ avatarUrl: dataUrl })
      await refreshUser()
      setAvatarFile(null)
      setProfileMsg('อัปเดตรูปโปรไฟล์แล้ว ✓')
    } catch (err) { setProfileMsg(err.message) } finally { setSavingAvatar(false) }
  }

  const removeAvatar = async () => {
    if (!confirm('ลบรูปโปรไฟล์?')) return
    setProfileMsg('')
    try {
      await api.updateMe({ avatarUrl: '' })
      await refreshUser()
      setProfileMsg('ลบรูปแล้ว ✓')
    } catch (err) { setProfileMsg(err.message) }
  }

  const saveProfile = async (e) => {
    e.preventDefault()
    setSavingProfile(true)
    setProfileMsg('')
    try {
      await api.updateMe({ name, phone, bankName, bankAccountNo, bankAccountName })
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
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-2xl font-bold"
              style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}>
              {user?.avatarUrl
                ? <img src={user.avatarUrl} alt={user?.name} className="w-full h-full object-cover" />
                : (user?.name?.[0]?.toUpperCase() || '?')}
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={savingAvatar}
              title="เปลี่ยนรูปโปรไฟล์" aria-label="เปลี่ยนรูปโปรไฟล์"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 flex items-center justify-center transition-colors after:absolute after:-inset-1.5 after:content-['']"
              style={{ border: '2px solid #161b2e' }}>
              {savingAvatar ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Camera className="w-3.5 h-3.5 text-white" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-white truncate">{user?.name}</p>
            <p className="text-sm text-slate-400 truncate">{user?.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs px-2 py-0.5 rounded-full inline-block"
                style={{ color: '#c084fc', background: 'rgba(192,132,252,0.15)' }}>
                {ROLE_LABEL[user?.role]}
              </span>
              {user?.avatarUrl && (
                <button type="button" onClick={removeAvatar} aria-label="ลบรูปโปรไฟล์" title="ลบรูปโปรไฟล์"
                  className="text-xs text-red-400 hover:text-red-300 transition-colors p-2 -m-2 inline-flex items-center min-h-[40px]">
                  ลบรูป
                </button>
              )}
            </div>
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
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">ธนาคาร</label>
            <input value={bankName} onChange={e => setBankName(e.target.value)} className={INPUT} style={INPUT_STYLE} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">เลขที่บัญชี</label>
            <input value={bankAccountNo} onChange={e => setBankAccountNo(e.target.value)} className={INPUT} style={INPUT_STYLE} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">ชื่อบัญชี</label>
            <input value={bankAccountName} onChange={e => setBankAccountName(e.target.value)} className={INPUT} style={INPUT_STYLE} />
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

      {avatarFile && (
        <AvatarCropModal
          file={avatarFile}
          saving={savingAvatar}
          onCancel={() => setAvatarFile(null)}
          onSave={saveAvatar}
        />
      )}
    </div>
  )
}
