import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { PlugZap, Loader2, Info, CheckCircle2, PauseCircle, AlertTriangle } from 'lucide-react'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }

const fmtDateTime = (s) => {
  if (!s) return 'ยังไม่เคยดึง'
  return new Date(s).toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function Integrations() {
  const [st, setSt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try { setSt(await api.hrosStatus()) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async () => {
    const next = !st.enabled
    if (!next && !confirm('ปิดการดึงค่าใช้จ่ายจาก HR OS?\n\nรายการที่ดึงมาแล้วยังอยู่ครบ — แค่หยุดรับรายการใหม่ จนกว่าจะกดเปิดอีกครั้ง')) return
    setSaving(true); setErr('')
    try {
      await api.setHrosEnabled(next)
      await load()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const on = st?.enabled

  return (
    <div className="integrations-page p-4 sm:p-5 space-y-4 max-w-2xl mx-auto">
      <style>{`
        .integrations-page button:focus-visible {
          outline: 2px solid rgba(16,185,129,0.55); outline-offset: 2px; border-radius: 0.5rem;
        }
        @media (prefers-reduced-motion: reduce) {
          .integrations-page *, .integrations-page *::before, .integrations-page *::after {
            animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-900/30"
          style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
          <PlugZap className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-white leading-tight">เชื่อมระบบ HR OS</h2>
          <p className="text-sm text-slate-500">สวิตช์เปิด/ปิดการดึงค่าใช้จ่าย (เงินเดือน/เบิก) จาก HR OS</p>
        </div>
      </div>

      {err && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-300 flex gap-2"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {err}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด...
        </div>
      ) : !st ? null : !st.configured || !st.linked ? (
        <div className="rounded-xl p-4 space-y-2" style={CARD}>
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4" /> ยังไม่ได้ตั้งค่าการเชื่อมต่อ
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {!st.configured
              ? <>ยังไม่ได้ตั้ง secret <code className="text-slate-300">HROS_SERVICE_TOKEN</code> + <code className="text-slate-300">HROS_SERVICE_USER_ID</code> ที่ worker (<code className="text-slate-300">fintrack-api</code>) — ตอนนี้ HR OS ยังส่งข้อมูลเข้ามาไม่ได้อยู่แล้ว</>
              : <>ตั้ง secret แล้ว แต่หา user ปลายทาง (<code className="text-slate-300">HROS_SERVICE_USER_ID</code>) ใน workspace นี้ไม่เจอ หรือถูกปิดใช้งานอยู่</>}
          </p>
        </div>
      ) : (
        <div className="rounded-xl p-4 sm:p-5 space-y-4" style={CARD}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              {on
                ? <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                : <PauseCircle className="w-5 h-5 text-slate-500 flex-shrink-0" />}
              <div className="min-w-0">
                <div className={`font-semibold ${on ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {on ? 'กำลังดึงข้อมูลอยู่' : 'หยุดดึงข้อมูลอยู่'}
                </div>
                <div className="text-xs text-slate-500 truncate">ผ่านผู้ใช้ระบบ: {st.serviceUserName}</div>
              </div>
            </div>

            <button
              onClick={toggle} disabled={saving}
              aria-pressed={!!on}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
              style={on
                ? { background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }
                : { background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', border: '1px solid transparent' }}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {on ? 'ปิดการดึงข้อมูล' : 'เปิดการดึงข้อมูล'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1" style={{ borderTop: '1px solid #1f2937' }}>
            <div className="pt-3">
              <div className="text-xs text-slate-500">ดึงมาแล้วทั้งหมด</div>
              <div className="text-lg font-bold text-slate-200">{st.autoCount} รายการ</div>
            </div>
            <div className="pt-3">
              <div className="text-xs text-slate-500">ดึงล่าสุด</div>
              <div className="text-sm font-semibold text-slate-200">{fmtDateTime(st.lastSyncAt)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl px-4 py-3 text-xs text-slate-400 flex gap-2"
        style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
        <Info className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div>ปิดแล้ว = HR OS ส่งรายการใหม่เข้ามาไม่ได้ (ระบบตอบกลับว่าปิดอยู่) · <b>รายการเก่าไม่หาย</b> · เปิดใหม่เมื่อไหร่ก็ได้</div>
          <div>สวิตช์นี้<b>ไม่กระทบ LINE bot</b> — คนละกุญแจ คนละทาง ตามกติกาใน INTEGRATION_POLICY.md</div>
        </div>
      </div>
    </div>
  )
}
