import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, AlertTriangle, Clock, FileText, Zap, Check, X, Settings, ChevronLeft, BellOff, Flame } from 'lucide-react'
import { thb } from '../fmt'
import RecurringNotifyControls from './RecurringNotifyControls'

// Per-kind visual language. Distinct icon SHAPES (not colour alone) satisfy color-not-only a11y.
const KIND = {
  overdue:  { icon: AlertTriangle, tag: 'เลยกำหนด',     color: '#f87171', tint: 'rgba(248,113,113,0.12)', to: '/recurring' },
  due:      { icon: Clock,         tag: 'ใกล้ครบกำหนด', color: '#fbbf24', tint: 'rgba(251,191,36,0.12)', to: '/recurring' },
  draft:    { icon: FileText,      tag: 'รอยืนยัน',     color: '#60a5fa', tint: 'rgba(96,165,250,0.12)', to: '/transactions' },
  upcoming: { icon: Zap,           tag: 'ใกล้ตัดเงิน',  color: '#a78bfa', tint: 'rgba(167,139,250,0.12)', to: '/recurring' },
}
const DAY_OPTIONS = [3, 7, 14, 30]
const KIND_TOGGLES = [
  { key: 'upcoming', label: 'ใกล้ตัดเงินอัตโนมัติ' },
  { key: 'manual',   label: 'ใกล้ / เลยกำหนด (บันทึกเอง)' },
  { key: 'draft',    label: 'Draft รอยืนยัน' },
]

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

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} role="switch" aria-checked={on}
      className="relative w-10 h-6 rounded-full flex-shrink-0 transition-colors"
      style={{ background: on ? '#059669' : '#374151' }}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: on ? '1.125rem' : '0.125rem' }} />
    </button>
  )
}

export default function NotificationBell({ ctrl, placement = 'sidebar' }) {
  const { list, unreadCount, seen, markAllRead, settings, setDays, toggleKind, saveItem, getItems } = ctrl
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('list')     // 'list' | 'settings'
  const [highlight, setHighlight] = useState(() => new Set())
  const [items, setItems] = useState([])
  const [expandedId, setExpandedId] = useState(null)

  const toggle = () => {
    if (!open) {
      setHighlight(new Set(list.filter(n => !seen.has(n.id)).map(n => n.id)))
      markAllRead()
      setView('list')
    }
    setOpen(o => !o)
  }
  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const openSettings = async () => { setView('settings'); setExpandedId(null); setItems(await getItems()) }
  const goto = (n) => { close(); nav(KIND[n.kind]?.to || '/') }
  const doMute = async (e, n) => { e.stopPropagation(); await saveItem(n.refId, { notifyMuted: true }) }
  const changeItem = async (id, patch) => { setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it)); await saveItem(id, patch) }

  const itemSummary = (it) => {
    if (it.notifyMuted) return <span className="text-slate-600">ปิดเสียง</span>
    const lead = it.notifyLeadDays == null ? `ค่าเริ่มต้น (${settings.days} วัน)` : `เตือน ${it.notifyLeadDays} วัน`
    return <>{lead}{it.notifyPriority && <span className="text-red-400"> · เร่งด่วน</span>}</>
  }

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
        .notif-scope button:focus-visible, .notif-scope [role="button"]:focus-visible { outline: 2px solid rgba(16,185,129,.55); outline-offset: 2px; border-radius: .625rem; }
      `}</style>

      <button
        onClick={toggle}
        aria-label={unreadCount > 0 ? `แจ้งเตือน ${unreadCount} รายการใหม่` : 'แจ้งเตือน'}
        aria-haspopup="dialog" aria-expanded={open}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-slate-700/50 transition-colors"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center tabular-nums"
            style={{ background: '#ef4444', border: '2px solid #111827' }}>
            {badge}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/50" style={{ zIndex: 60 }} onClick={close} aria-hidden="true" />
          <div role="dialog" aria-label="แจ้งเตือนรายการประจำ"
            className="notif-pop rounded-2xl overflow-hidden flex flex-col"
            style={{ ...panelStyle, background: '#161b2e', border: '1px solid #2e3349', boxShadow: '0 20px 50px rgba(0,0,0,.55)', maxHeight: 'min(70vh, 520px)' }}>

            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
              {view === 'settings' ? (
                <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-slate-300 hover:text-white text-sm font-semibold" aria-label="ย้อนกลับ">
                  <ChevronLeft className="w-4 h-4" /> ตั้งค่าการแจ้งเตือน
                </button>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-white text-sm">แจ้งเตือน</span>
                  {list.length > 0 && <span className="text-xs text-slate-500">· {list.length} รายการ</span>}
                </div>
              )}
              <div className="flex items-center gap-1">
                {view === 'list' && (
                  <button onClick={openSettings} className="text-slate-500 hover:text-slate-200 p-1" aria-label="ตั้งค่าการแจ้งเตือน">
                    <Settings className="w-4 h-4" />
                  </button>
                )}
                <button onClick={close} className="text-slate-500 hover:text-slate-300 p-1" aria-label="ปิด"><X className="w-4 h-4" /></button>
              </div>
            </div>

            {view === 'settings' ? (
              <div className="overflow-y-auto p-4 space-y-5">
                <div>
                  <p className="text-xs font-medium text-slate-400 mb-2">เตือนล่วงหน้า · ค่าเริ่มต้น <span className="text-slate-600">(รายการที่ไม่ได้ตั้งเอง)</span></p>
                  <div className="flex gap-2">
                    {DAY_OPTIONS.map(d => (
                      <button key={d} onClick={() => setDays(d)}
                        className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                        style={settings.days === d
                          ? { background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.4)' }
                          : { background: '#0d1120', color: '#94a3b8', border: '1px solid #2e3349' }}>
                        {d} วัน
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-400 mb-2">ประเภทที่แจ้งเตือน</p>
                  <div className="space-y-1">
                    {KIND_TOGGLES.map(t => (
                      <div key={t.key} className="flex items-center justify-between py-1.5">
                        <span className="text-sm text-slate-300">{t.label}</span>
                        <Toggle on={!!settings.kinds[t.key]} onClick={() => toggleKind(t.key)} />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-400 mb-2">ตั้งค่ารายรายการ</p>
                  {items.length === 0 ? (
                    <p className="text-xs text-slate-600">— ไม่มีรายการประจำ —</p>
                  ) : (
                    <div className="space-y-2">
                      {items.map(it => {
                        const muted = it.notifyMuted
                        return (
                          <div key={it.id} className="rounded-lg" style={{ border: '1px solid #232a40' }}>
                            <div className="flex items-center gap-3 p-2.5 cursor-pointer" onClick={() => setExpandedId(e => e === it.id ? null : it.id)}>
                              <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ background: muted ? 'rgba(100,116,139,0.15)' : it.notifyPriority ? 'rgba(248,113,113,0.14)' : 'rgba(16,185,129,0.12)' }}>
                                {muted ? <BellOff className="w-4 h-4 text-slate-500" /> : it.notifyPriority ? <Flame className="w-4 h-4" style={{ color: '#f87171' }} /> : <Bell className="w-4 h-4" style={{ color: '#34d399' }} />}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm font-medium truncate ${muted ? 'text-slate-500' : 'text-slate-200'}`}>{it.name}</div>
                                <div className="text-xs text-slate-500">{itemSummary(it)}</div>
                              </div>
                              <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: it.type === 'income' ? '#34d399' : '#f87171' }}>
                                {it.type === 'income' ? '+' : '-'}{thb(it.amount)}
                              </span>
                              <Toggle on={!muted} onClick={(e) => { e.stopPropagation(); changeItem(it.id, { notifyMuted: !muted }) }} />
                            </div>
                            {expandedId === it.id && !muted && (
                              <div className="px-2.5 pb-2.5">
                                <RecurringNotifyControls value={it} showToggle={false} globalDays={settings.days} onChange={patch => changeItem(it.id, patch)} />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : list.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-3" style={{ background: 'rgba(16,185,129,0.12)' }}>
                  <Check className="w-6 h-6" style={{ color: '#34d399' }} />
                </div>
                <p className="text-slate-300 text-sm font-medium">ไม่มีรายการค้าง</p>
                <p className="text-slate-600 text-xs mt-1">รายการประจำทั้งหมดอัปเดตแล้ว</p>
              </div>
            ) : (
              <div className="overflow-y-auto">
                {list.map((n, i) => {
                  const k = KIND[n.kind] || KIND.due
                  const urgent = n.priority
                  const Icon = urgent ? Flame : k.icon
                  const color = urgent ? '#f87171' : k.color
                  const tint = urgent ? 'rgba(248,113,113,0.14)' : k.tint
                  const tag = urgent ? 'เร่งด่วน' : k.tag
                  const isNew = highlight.has(n.id)
                  const canMute = n.kind !== 'draft'
                  const bg = urgent ? 'rgba(248,113,113,0.06)' : isNew ? 'rgba(16,185,129,0.045)' : undefined
                  return (
                    <div key={n.id} role="button" tabIndex={0}
                      onClick={() => goto(n)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goto(n) } }}
                      className="notif-row w-full text-left flex gap-3 px-4 py-3 transition-colors hover:bg-slate-500/5 relative cursor-pointer"
                      style={{ borderBottom: '1px solid #1f2937', borderLeft: urgent ? '3px solid #f87171' : undefined, animationDelay: `${Math.min(i, 8) * 35}ms`, background: bg }}>
                      {isNew && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ background: '#34d399' }} aria-hidden="true" />}
                      <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: tint }}>
                        <Icon className="w-[18px] h-[18px]" style={{ color }} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-slate-200 text-sm truncate">{n.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-semibold" style={{ color, background: tint }}>{tag}</span>
                        </span>
                        <span className="block text-xs text-slate-500 leading-snug">{describe(n)}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-sm font-bold tabular-nums" style={{ color: n.type === 'income' ? '#34d399' : '#f87171' }}>
                          {n.type === 'income' ? '+' : '-'}{thb(n.amount)}
                        </span>
                        {canMute && (
                          <button onClick={(e) => doMute(e, n)} title="ปิดเสียงรายการนี้"
                            className="text-slate-600 hover:text-slate-300 p-0.5" aria-label={`ปิดเสียง ${n.name}`}>
                            <BellOff className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
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
