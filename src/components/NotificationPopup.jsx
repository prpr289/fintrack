import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, AlertTriangle, X, Bell } from 'lucide-react'
import { thb } from '../fmt'

// Admin-only daily nag for the alerts that actually matter (urgent + overdue).
// The bell stays the full list; this is just the "don't miss this" layer.
// "Shown today" is a date string in localStorage per user — no server state needed.
const seenKey = (uid) => `ft_notif_popup_${uid || 'anon'}`
const todayISO = () => new Date().toISOString().slice(0, 10)
const readShown = (uid) => {
  try { return localStorage.getItem(seenKey(uid)) } catch { return null }
}

export default function NotificationPopup({ ctrl, user }) {
  const nav = useNavigate()
  const [dismissed, setDismissed] = useState(false)
  const uid = user?.id

  const alerts = (ctrl.list || []).filter(n => n.priority || n.kind === 'overdue')
  // Derived during render (no effect) so there's no setState-in-effect cascade.
  const open = user?.role === 'admin' && alerts.length > 0 && !dismissed && readShown(uid) !== todayISO()

  const close = () => {
    setDismissed(true)
    try { localStorage.setItem(seenKey(uid), todayISO()) } catch { /* ignore quota */ }
  }
  const goto = () => { close(); nav('/recurring') }

  if (!open) return null

  const urgentN = alerts.reduce((n, a) => n + (a.priority ? 1 : 0), 0)
  const overdueN = alerts.reduce((n, a) => n + (a.kind === 'overdue' && !a.priority ? 1 : 0), 0)
  const total = alerts.reduce((s, a) => s + (a.type === 'income' ? 0 : Number(a.amount) || 0), 0)

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 80, background: 'rgba(0,0,0,0.6)' }}
      onClick={close} role="presentation">
      <style>{`
        .np-card { animation: npIn .2s ease-out }
        @keyframes npIn { from { opacity: 0; transform: translateY(8px) scale(.97) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) { .np-card { animation: none } }
      `}</style>
      <div role="dialog" aria-modal="true" aria-label="รายการที่ต้องจัดการ"
        onClick={e => e.stopPropagation()}
        className="np-card w-full rounded-2xl overflow-hidden flex flex-col"
        style={{ maxWidth: 440, maxHeight: '85vh', background: '#161b2e', border: '1px solid #2e3349', boxShadow: '0 24px 60px rgba(0,0,0,.6)' }}>

        <div className="flex items-start gap-3 p-5" style={{ borderBottom: '1px solid #1f2937' }}>
          <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(248,113,113,0.14)' }}>
            <Bell className="w-5 h-5" style={{ color: '#f87171' }} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-semibold text-base leading-snug">มีรายการต้องจัดการ</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {urgentN > 0 && <span className="text-red-400">เร่งด่วน {urgentN} รายการ</span>}
              {urgentN > 0 && overdueN > 0 && ' · '}
              {overdueN > 0 && <span className="text-amber-400">เลยกำหนด {overdueN} รายการ</span>}
              {total > 0 && <span className="text-slate-500"> · รวม {thb(total)}</span>}
            </p>
          </div>
          <button onClick={close} className="text-slate-500 hover:text-slate-300 p-1 flex-shrink-0" aria-label="ปิด">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto">
          {alerts.slice(0, 6).map(a => {
            const urgent = a.priority
            const Icon = urgent ? Flame : AlertTriangle
            const color = urgent ? '#f87171' : '#fbbf24'
            const tint = urgent ? 'rgba(248,113,113,0.12)' : 'rgba(251,191,36,0.12)'
            return (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3"
                style={{ borderBottom: '1px solid #1f2937', borderLeft: urgent ? '3px solid #f87171' : '3px solid transparent' }}>
                <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: tint }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200 truncate">{a.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-semibold" style={{ color, background: tint }}>
                      {urgent ? 'เร่งด่วน' : 'เลยกำหนด'}
                    </span>
                  </span>
                  {a.dueDate && <span className="block text-xs text-slate-500">ครบกำหนด {a.dueDate}</span>}
                </span>
                <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: a.type === 'income' ? '#34d399' : '#f87171' }}>
                  {a.type === 'income' ? '+' : '-'}{thb(a.amount)}
                </span>
              </div>
            )
          })}
          {alerts.length > 6 && (
            <p className="text-xs text-slate-500 px-5 py-2.5">และอีก {alerts.length - 6} รายการ</p>
          )}
        </div>

        <div className="flex gap-2 p-4 flex-shrink-0" style={{ borderTop: '1px solid #1f2937' }}>
          <button onClick={close}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700/40"
            style={{ border: '1px solid #2e3349' }}>
            ไว้ทีหลัง
          </button>
          <button onClick={goto}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: '#059669' }}>
            ดูรายการประจำ
          </button>
        </div>
      </div>
    </div>
  )
}
