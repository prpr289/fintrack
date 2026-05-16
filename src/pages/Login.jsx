import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      nav('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0d0f17 0%, #131929 100%)' }}>
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💼</div>
          <h1 className="text-2xl font-bold text-white">บัญชีธุรกิจของฉัน</h1>
          <p className="text-slate-400 text-sm mt-1">เข้าสู่ระบบเพื่อจัดการบัญชี</p>
        </div>

        <div className="rounded-2xl border border-slate-700/50 p-7" style={{ background: '#161b2e' }}>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">อีเมล</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                style={{ background: '#0d1120' }}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">รหัสผ่าน</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} required
                className="w-full rounded-lg px-3 py-2.5 text-sm text-white border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                style={{ background: '#0d1120' }}
                placeholder="••••••"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit" disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors mt-2"
            >
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
