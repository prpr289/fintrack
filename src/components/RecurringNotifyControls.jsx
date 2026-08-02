import { Flame, Bell, Info } from 'lucide-react'

// Per-item notification controls, shared by the recurring form and the bell settings.
// value = { notifyMuted, notifyLeadDays (null = use default), notifyPriority }
// onChange(patch) — parent decides persistence (form batches on submit; settings saves live).
const PRESETS = [{ label: 'ค่าเริ่มต้น', val: null }, { label: '1', val: 1 }, { label: '3', val: 3 }, { label: '7', val: 7 }, { label: '14', val: 14 }, { label: '30', val: 30 }]

function Sw({ on, onClick }) {
  return (
    <button type="button" onClick={onClick} role="switch" aria-checked={on}
      className="relative w-10 h-6 rounded-full flex-shrink-0 transition-colors"
      style={{ background: on ? '#059669' : '#374151' }}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: on ? '1.125rem' : '0.125rem' }} />
    </button>
  )
}

export default function RecurringNotifyControls({ value, onChange, showToggle = true, globalDays }) {
  const on = !value.notifyMuted
  const lead = value.notifyLeadDays ?? null
  const isPreset = lead === null || [1, 3, 7, 14, 30].includes(lead)
  const base = 'px-3 py-1.5 rounded-lg text-sm border transition-colors'

  return (
    <div className="rounded-xl p-3" style={{ border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.05)' }}>
      {showToggle && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-200 flex items-center gap-2"><Bell className="w-4 h-4 text-emerald-400" /> แจ้งเตือนรายการนี้</span>
          <Sw on={on} onClick={() => onChange({ notifyMuted: on })} />
        </div>
      )}

      {on && (
        <>
          <p className="text-xs font-medium text-slate-400 mt-3 mb-1.5">เตือนล่วงหน้า</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => {
              const active = lead === p.val
              return (
                <button type="button" key={String(p.val)} onClick={() => onChange({ notifyLeadDays: p.val })}
                  className={`${base} ${active ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' : 'border-slate-600 text-slate-400'}`}
                  style={active ? undefined : { background: '#0d1120' }}>
                  {p.val === null ? (globalDays ? `ค่าเริ่มต้น (${globalDays})` : 'ค่าเริ่มต้น') : `${p.label} วัน`}
                </button>
              )
            })}
            <input type="number" min="1" max="60" placeholder="เอง"
              value={!isPreset && lead != null ? lead : ''}
              onChange={e => { const v = e.target.value === '' ? null : Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), 60); onChange({ notifyLeadDays: v }) }}
              className="w-16 px-2 py-1.5 rounded-lg text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500"
              style={{ background: '#0d1120' }} aria-label="กำหนดจำนวนวันเอง" />
          </div>

          <p className="text-xs font-medium text-slate-400 mt-3 mb-1.5">ระดับความสำคัญ</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => onChange({ notifyPriority: false })}
              className={`${base} ${!value.notifyPriority ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' : 'border-slate-600 text-slate-400'}`}
              style={value.notifyPriority ? { background: '#0d1120' } : undefined}>ปกติ</button>
            <button type="button" onClick={() => onChange({ notifyPriority: true })}
              className={`${base} ${value.notifyPriority ? 'border-red-500/50 text-red-400 bg-red-500/10' : 'border-slate-600 text-slate-400'}`}
              style={value.notifyPriority ? undefined : { background: '#0d1120' }}>
              <Flame className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> เร่งด่วน
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2 flex items-start gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> เร่งด่วน = เด้งบนสุด + ไฮไลต์แดง + เตือนเร็วขึ้น (อย่างน้อย 14 วัน) + กระดิ่งนับเฉพาะตัวเร่งด่วน</p>
        </>
      )}
    </div>
  )
}
