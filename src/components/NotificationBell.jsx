import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, AlertTriangle, Clock, FileText, Zap, Check, X } from 'lucide-react'
import { thb } from '../fmt'

// Per-kind visual language. Distinct icon SHAPES (not colour alone) satisfy color-not-only a11y.
const KIND = {
  overdue:  { icon: AlertTriangle, tag: 'เลยกำหนด',     color: '#f87171', tint: 'rgba(248,113,113,0.12)', to: '/recurring' },
  due:      { icon: Clock,         tag: 'ใกล้ครบกำหนด', color: '#fbbf24', tint: 'rgba(251,191,36,0.12)', to: '/recurring' },
  draft:    { icon: FileText,      tag: 'รอยืนยัน',     color: '#60a5fa', tint: 'rgba(96,165,250,0.12)', to: '/transactions' },
  upcoming: { icon: Zap,           tag: 'ใกล้ตัดเงิน',  color: '#a78bfa', tint: 'rgba(167,139,250,0.12)', to: '/recurring' },
}

const todayISO = () => new Date().toISOString().slice(0, 10)
const dayDiff = (fromISO, toISO) =>
  Math.round((new Date(toISO + 'T00:00:00Z') - new Date(fromISO + 'T00:00:00Z')) / 86400000)

function describe(n) {
  if (n.kind === 'draft') return 'สร้างเป็น Draft แล้ว · แตะเพื่อยืนยันยอด + แนบสลิป'
  const d = dayDiff(todayISO(), n.dueDate)
  if (n.kind === 'upcoming') return d <= 0 ? `จะตัดเงินอัตโนมัติวันนี้ (${n.dueDate})` : `จะตัดเงินอัตโนมัติใน ${d} วัน (${n.dueDate})`
  if (n.kind === 'overdue') return `เลยกำหนดมา ${-d} วัน (ครบกำหนด ${n.dueDate})`
  if (d <= 0) return `ครบกำหนดวันนี้ (${n.dueDate})`
  return `ครบกำหนดใน ${d} วัน (${n.dueDate})`
}

export default function NotificationBell({ list, unreadCount, seen, markAllRead, placement = 'sidebar' }) {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(() => new Set()) // unread snapshot for THIS open

  const toggle = () => {
    if (!open) {
      setHighlight(new Set(list.filter(n => !seen.has(n.id)).map(n => n.id)))
      markAllRead() // opening = seen; snapshot keeps the "new" accent visible this session
    }
    setOpen(o => !o)
  }
  const close = () => setOpen(false)

  // close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const goto = (n) => { close(); nav(KIND[n.kind]?.to || '/') }

  const panelStyle = placement === 'topbar'
    ? { position: 'fixed', top: '3.5rem', left: '0.75rem', right: '0.75rem', zIndex: 61 }
    : { position: 'fixed', top: '4.25rem', left: '15rem', width: 380, maxWidth: 'calc(100vw - 2rem)', zIndex: 61 }

  const badge = unreadCount > 9 ? '9+' : String(unreadCount)

  return (
    <div className="notif-scope">
      <style>{`
        .notif-pop { animation: notifPop .18s ease-out; transform-origin: top; }
        .notif-row { opacity: 0; animation: notifRow .22s ease-out forwards; }
        @keyframes notifPop { from { opacity: 0; transform: translateY(-6px) scale(.98) } to { opacity: 1; transform: none } }
        @keyframes notifRow { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) {
          .notif-pop, .notif-row { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
        .notif-scope button:focus-visible { outline: 2px solid rgba(16,185,129,.55); outline-offset: 2px; border-radius: .625rem; }
      `}</style>

      <button
        onClick={toggle}
        aria-label={unreadCount > 0 ? `แจ้งเตือน ${unreadCount} รายการใหม่` : 'แจ้งเตือน'}
        aria-haspopup="dialog" aria-expanded={open}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-slate-700/50 transition-colors"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center tabular-nums"
            style={{ background: '#ef4444', border: '2px solid #111827' }}
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/50" style={{ zIndex: 60 }} onClick={close} aria-hidden="true" />
          <div
            role="dialog" aria-label="แจ้งเตือนรายการประจำ"
            className="notif-pop rounded-2xl overflow-hidden flex flex-col"
            style={{ ...panelStyle, background: '#161b2e', border: '1px solid #2e3349', boxShadow: '0 20px 50px rgba(0,0,0,.55)', maxHeight: 'min(70vh, 520px)' }}
          >
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-white text-sm">แจ้งเตือน</span>
                {list.length > 0 && <span className="text-xs text-slate-500">· {list.length} รายการ</span>}
              </div>
              <button onClick={close} className="text-slate-500 hover:text-slate-300 p-1" aria-label="ปิด">
                <X className="w-4 h-4" />
              </button>
            </div>

            {list.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: 'rgba(16,185,129,0.12)' }}>
                  <Check className="w-6 h-6" style={{ color: '#34d399' }} />
                </div>
                <p className="text-slate-300 text-sm font-medium">ไม่มีรายการค้าง</p>
                <p className="text-slate-600 text-xs mt-1">รายการประจำทั้งหมดอัปเดตแล้ว</p>
              </div>
            ) : (
              <div className="overflow-y-auto">
                {list.map((n, i) => {
                  const k = KIND[n.kind] || KIND.due
                  const Icon = k.icon
                  const isNew = highlight.has(n.id)
                  return (
                    <button
                      key={n.id}
                      onClick={() => goto(n)}
                      className="notif-row w-full text-left flex gap-3 px-4 py-3 transition-colors hover:bg-slate-500/5 relative"
                      style={{ borderBottom: '1px solid #1f2937', animationDelay: `${Math.min(i, 8) * 35}ms`, background: isNew ? 'rgba(16,185,129,0.045)' : undefined }}
                    >
                      {isNew && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ background: '#34d399' }} aria-hidden="true" />}
                      <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: k.tint }}>
                        <Icon className="w-[18px] h-[18px]" style={{ color: k.color }} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-slate-200 text-sm truncate">{n.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-semibold" style={{ color: k.color, background: k.tint }}>{k.tag}</span>
                        </span>
                        <span className="block text-xs text-slate-500 leading-snug">{describe(n)}</span>
                      </span>
                      <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: n.type === 'income' ? '#34d399' : '#f87171' }}>
                        {n.type === 'income' ? '+' : '-'}{thb(n.amount)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
