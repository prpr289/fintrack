import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight,
  FileCheck2, Loader2, Paperclip, RefreshCw, RotateCcw, ShieldCheck, Upload,
} from 'lucide-react'
import { api } from '../api'
import { parseObservedBalanceToSatang, satangToDecimalString, subtractSatang } from '../dailyAuditRules'

const STATUS = {
  open: { label: 'ยังไม่ปิดยอด', color: '#60a5fa', bg: 'rgba(96,165,250,.12)', icon: CalendarCheck },
  needs_review: { label: 'ต้องตรวจใหม่', color: '#f87171', bg: 'rgba(248,113,113,.12)', icon: AlertTriangle },
  closed: { label: 'ตรวจครบแล้ว', color: '#34d399', bg: 'rgba(52,211,153,.12)', icon: CheckCircle2 },
  closed_with_exception: { label: 'ปิดพร้อมข้อยกเว้น', color: '#fbbf24', bg: 'rgba(251,191,36,.12)', icon: AlertTriangle },
  historical_unverified: { label: 'ข้อมูลย้อนหลังยังไม่ตรวจ', color: '#94a3b8', bg: 'rgba(148,163,184,.12)', icon: FileCheck2 },
  not_required: { label: 'ไม่มีกระเป๋าที่ต้องตรวจ', color: '#94a3b8', bg: 'rgba(148,163,184,.12)', icon: FileCheck2 },
}

const ISSUE_LABEL = {
  draft: 'รายการร่างยังไม่ยืนยัน',
  pending_edit: 'มีการแก้ไขรอยืนยัน',
  missing_category: 'ยังไม่ระบุหมวดหมู่',
  unreconciled: 'ยังไม่ได้ยืนยันรายการ',
  broken_transfer: 'คู่โอนเงินไม่ครบหรือไม่สมดุล',
  possible_duplicate: 'อาจเป็นรายการซ้ำ',
}

const EVENT_LABEL = {
  close: 'ปิดยอดเรียบร้อย',
  close_with_exception: 'ปิดยอดพร้อมข้อยกเว้น',
  reopen: 'เปิดตรวจใหม่',
  stale: 'รายการเปลี่ยน ต้องตรวจใหม่',
  resolve_duplicate: 'ยืนยันว่าไม่ใช่รายการซ้ำ',
}

function thaiToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map(p => [p.type, p.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function moveDate(date, days) {
  const parsed = new Date(`${date}T00:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function fmtTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

function fmtSatang(value) {
  if (!Number.isSafeInteger(value)) return '—'
  const exact = satangToDecimalString(value)
  const negative = exact.startsWith('-')
  const [whole, fraction] = (negative ? exact.slice(1) : exact).split('.')
  return `${negative ? '-' : ''}฿${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`
}

function StatusPill({ status }) {
  const cfg = STATUS[status] || STATUS.open
  const Icon = cfg.icon
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ color: cfg.color, background: cfg.bg }}>
      <Icon className="w-3.5 h-3.5" /> {cfg.label}
    </span>
  )
}

function AuditWalletCard({ wallet, date, onUpdated }) {
  const [observed, setObserved] = useState('')
  const [reason, setReason] = useState('')
  const [file, setFile] = useState(null)
  const [evidenceId, setEvidenceId] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const isClosed = wallet.status === 'closed' || wallet.status === 'closed_with_exception'
  const observedValue = observed !== ''
    ? observed
    : wallet.observedBalanceSatang == null ? '' : satangToDecimalString(wallet.observedBalanceSatang)
  let varianceSatang = isClosed ? wallet.varianceSatang : null
  let observedFormatError = ''
  if (!isClosed && observedValue !== '') {
    try {
      varianceSatang = subtractSatang(
        parseObservedBalanceToSatang(String(observedValue)),
        wallet.bookBalanceSatang,
      )
    } catch {
      varianceSatang = null
      observedFormatError = 'กรุณาระบุยอดเป็นตัวเลขทศนิยมไม่เกิน 2 ตำแหน่ง'
    }
  }
  const needsException = wallet.blockerCount > 0 || (varianceSatang != null && varianceSatang !== 0)

  const upload = async () => {
    if (!file) return
    setBusy('upload'); setError('')
    try {
      const result = await api.uploadDailyAuditEvidence(date, wallet.id, file)
      setEvidenceId(result.evidence.id)
      setFile(null)
      await onUpdated()
    } catch (err) { setError(err.message) }
    finally { setBusy('') }
  }

  const close = async () => {
    if (observedValue === '') return
    setBusy('close'); setError('')
    try {
      const result = await api.closeDailyAuditWallet(date, wallet.id, {
        requestId: crypto.randomUUID(),
        observedBalance: String(observedValue),
        expectedRevision: wallet.revision,
        expectedChangeVersion: wallet.currentChangeVersion,
        exceptionReason: needsException ? reason : null,
        evidenceId,
      })
      onUpdated(result.audit)
    } catch (err) { setError(err.message) }
    finally { setBusy('') }
  }

  const reopen = async () => {
    const reopenReason = window.prompt('กรุณาระบุเหตุผลที่ต้องเปิดตรวจใหม่')
    if (!reopenReason?.trim()) return
    setBusy('reopen'); setError('')
    try {
      const result = await api.reopenDailyAuditWallet(date, wallet.id, {
        requestId: crypto.randomUUID(), expectedRevision: wallet.revision, reason: reopenReason,
      })
      onUpdated(result.audit)
    } catch (err) { setError(err.message) }
    finally { setBusy('') }
  }

  const resolveDuplicate = async (issue) => {
    setBusy(issue.issueKey); setError('')
    try {
      const result = await api.resolveDailyAuditIssue(issue.issueKey, {
        requestId: crypto.randomUUID(), auditDate: date, walletId: wallet.id,
      })
      onUpdated(result.audit)
    } catch (err) { setError(err.message) }
    finally { setBusy('') }
  }

  const openEvidence = async (id) => {
    setBusy(id); setError('')
    try {
      const url = await api.fetchDailyAuditEvidence(id)
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) { setError(err.message) }
    finally { setBusy('') }
  }

  return (
    <article className="rounded-2xl overflow-hidden" style={{ background: '#151a2d', border: '1px solid #252c43' }}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid #252c43' }}>
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0" style={{ background: wallet.color || '#34d399' }} />
          <div>
            <h2 className="text-white font-semibold">{wallet.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{wallet.type} · {wallet.transactionCount} รายการ</p>
          </div>
        </div>
        <StatusPill status={wallet.status} />
      </header>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl p-3" style={{ background: '#0e1322', border: '1px solid #252c43' }}>
            <p className="text-xs text-slate-500">ยอดตามระบบ</p>
             <p className="text-lg font-bold text-white tabular-nums mt-1">{fmtSatang(wallet.bookBalanceSatang)}</p>
          </div>
          <label className="rounded-xl p-3 block" style={{ background: '#0e1322', border: '1px solid #252c43' }}>
            <span className="text-xs text-slate-500">ยอดจริงที่ตรวจพบ *</span>
            <input type="number" step="0.01" value={observedValue} onChange={e => setObserved(e.target.value)}
              disabled={isClosed}
              className="w-full bg-transparent text-lg font-bold text-white tabular-nums mt-1 outline-none disabled:text-slate-500"
               placeholder="0.00" aria-label={`ยอดจริงของ ${wallet.name}`} />
            {observedFormatError && <span className="text-[11px] text-red-400">{observedFormatError}</span>}
          </label>
          <div className="rounded-xl p-3" style={{ background: '#0e1322', border: '1px solid #252c43' }}>
            <p className="text-xs text-slate-500">ผลต่าง</p>
            <p className="text-lg font-bold tabular-nums mt-1"
              style={{ color: varianceSatang == null ? '#64748b' : varianceSatang === 0 ? '#34d399' : '#f87171' }}>
              {varianceSatang == null ? '—' : `${varianceSatang > 0 ? '+' : ''}${fmtSatang(varianceSatang)}`}
            </p>
          </div>
        </div>

        {wallet.issues.length > 0 && (
          <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(248,113,113,.07)', border: '1px solid rgba(248,113,113,.2)' }}>
            <div className="flex items-center gap-2 text-sm font-semibold text-red-300">
              <AlertTriangle className="w-4 h-4" /> ต้องตรวจ {wallet.issues.length} ประเด็น
            </div>
            {wallet.issues.map(issue => (
              <div key={issue.issueKey || `${issue.code}:${issue.transactionId}`} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-300">
                  {ISSUE_LABEL[issue.code] || issue.code}
                  {issue.transactionName && <span className="text-slate-500"> · {issue.transactionName}</span>}
                </span>
                {issue.code === 'possible_duplicate' && (
                  <button onClick={() => resolveDuplicate(issue)} disabled={!!busy}
                    className="px-2.5 py-1 rounded-lg font-medium text-amber-300 disabled:opacity-50"
                    style={{ background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.25)' }}>
                    {busy === issue.issueKey ? 'กำลังบันทึก…' : 'ยืนยันว่าไม่ซ้ำ'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!isClosed && needsException && (
          <label className="block">
            <span className="text-xs text-amber-300">เหตุผลข้อยกเว้น *</span>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={1000}
              className="mt-1.5 w-full rounded-xl px-3 py-2 text-sm text-slate-200 outline-none resize-y"
              style={{ background: '#0e1322', border: '1px solid #343c56' }}
              placeholder="อธิบายสาเหตุและแนวทางติดตาม…" />
          </label>
        )}

        <div className="rounded-xl p-3" style={{ background: '#0e1322', border: '1px solid #252c43' }}>
          <div className="flex flex-wrap items-center gap-2">
            <Paperclip className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-400">หลักฐาน (ไม่บังคับ)</span>
            {!isClosed && (
              <>
                <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)}
                  className="text-xs text-slate-500 max-w-full" />
                <button onClick={upload} disabled={!file || !!busy}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 disabled:opacity-40"
                  style={{ border: '1px solid #343c56' }}>
                  {busy === 'upload' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  อัปโหลด
                </button>
              </>
            )}
          </div>
          {wallet.evidence.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {wallet.evidence.map(item => (
                <button key={item.id} onClick={() => { setEvidenceId(item.id); openEvidence(item.id) }}
                  className="text-xs px-2.5 py-1.5 rounded-lg truncate max-w-[16rem]"
                  style={{ color: evidenceId === item.id ? '#34d399' : '#94a3b8', background: '#151a2d' }}>
                  {item.fileName}{evidenceId === item.id ? ' · เลือกแล้ว' : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        {wallet.exceptionReason && (
          <p className="text-xs text-amber-300 rounded-lg px-3 py-2" style={{ background: 'rgba(251,191,36,.08)' }}>
            เหตุผล: {wallet.exceptionReason}
          </p>
        )}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-slate-600">
            revision {wallet.revision} · ตรวจล่าสุด {fmtTime(wallet.closedAt)}
          </p>
          {isClosed ? (
            <button onClick={reopen} disabled={!!busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-amber-300 disabled:opacity-50"
              style={{ background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.25)' }}>
              {busy === 'reopen' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              เปิดตรวจใหม่
            </button>
          ) : (
            <button onClick={close}
              disabled={observedValue === '' || !!observedFormatError || !!busy || (needsException && !reason.trim())}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: needsException ? '#b45309' : '#059669' }}>
              {busy === 'close' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {needsException ? 'ปิดพร้อมข้อยกเว้น' : 'ยืนยันและปิดยอด'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

export default function DailyAudit() {
  const [date, setDate] = useState(thaiToday)
  const [audit, setAudit] = useState(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let active = true
    api.dailyAudit(date)
      .then(result => { if (active) { setAudit(result.audit); setError('') } })
      .catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [date])

  const reload = useCallback(async (nextAudit) => {
    if (nextAudit?.auditDate) { setAudit(nextAudit); return }
    setRefreshing(true)
    try {
      const result = await api.dailyAudit(date)
      setAudit(result.audit); setError('')
    } catch (err) { setError(err.message) }
    finally { setRefreshing(false) }
  }, [date])

  const overall = STATUS[audit?.overallStatus] || STATUS.open
  const OverallIcon = overall.icon
  const latestEvents = useMemo(() => audit?.events || [], [audit])

  const changeDate = (next) => { setAudit(null); setError(''); setDate(next) }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
            <ShieldCheck className="w-4 h-4" /> AUDIT GATE
          </div>
          <h1 className="text-2xl font-bold text-white mt-1">ตรวจยอดรายวัน</h1>
          <p className="text-sm text-slate-500 mt-1">เทียบยอดตามระบบกับยอดจริง ก่อนปิดยอดแต่ละกระเป๋า</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => changeDate(moveDate(date, -1))} className="p-2.5 rounded-xl text-slate-400 hover:text-white" style={{ border: '1px solid #2b3248' }} aria-label="วันก่อนหน้า">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input type="date" value={date} onChange={e => changeDate(e.target.value)}
            className="rounded-xl px-3 py-2 text-sm text-slate-200 outline-none"
            style={{ background: '#151a2d', border: '1px solid #2b3248', colorScheme: 'dark' }} />
          <button onClick={() => changeDate(moveDate(date, 1))} className="p-2.5 rounded-xl text-slate-400 hover:text-white" style={{ border: '1px solid #2b3248' }} aria-label="วันถัดไป">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => reload()} disabled={refreshing} className="p-2.5 rounded-xl text-slate-400 hover:text-white disabled:opacity-40" style={{ border: '1px solid #2b3248' }} aria-label="โหลดใหม่">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl px-4 py-3 text-sm text-red-300" style={{ background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.2)' }}>{error}</p>}

      {!audit ? (
        <div className="py-24 flex items-center justify-center text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> กำลังโหลดข้อมูลตรวจยอด…
        </div>
      ) : (
        <>
          <section className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            style={{ background: overall.bg, border: `1px solid ${overall.color}33` }}>
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: `${overall.color}1f` }}>
                <OverallIcon className="w-5 h-5" style={{ color: overall.color }} />
              </span>
              <div>
                <p className="text-xs text-slate-500">สถานะวันที่ {date}</p>
                <p className="font-semibold mt-0.5" style={{ color: overall.color }}>{overall.label}</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 tabular-nums">ปิดแล้ว {audit.closedWalletCount} / {audit.requiredWalletCount} กระเป๋า</p>
          </section>

          {audit.wallets.length === 0 ? (
            <div className="rounded-2xl py-20 text-center text-slate-500" style={{ background: '#151a2d', border: '1px solid #252c43' }}>
              ไม่มีกระเป๋าธุรกิจที่ต้องตรวจในขณะนี้
            </div>
          ) : (
            <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {audit.wallets.map(wallet => (
                <AuditWalletCard key={`${date}:${wallet.id}:${wallet.revision}:${wallet.currentChangeVersion}`}
                  wallet={wallet} date={date} onUpdated={reload} />
              ))}
            </section>
          )}

          <section className="rounded-2xl overflow-hidden" style={{ background: '#151a2d', border: '1px solid #252c43' }}>
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid #252c43' }}>
              <FileCheck2 className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-white">ประวัติการตรวจสอบ</h2>
            </div>
            {latestEvents.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-600 text-center">ยังไม่มีประวัติสำหรับวันนี้</p>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {latestEvents.map(event => (
                  <div key={event.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-sm">
                    <div>
                      <span className="font-medium text-slate-200">{EVENT_LABEL[event.eventType] || event.eventType}</span>
                      <span className="text-slate-500"> · {event.actorName || (event.eventType === 'stale' ? 'ระบบ' : 'Admin')}</span>
                      {event.reason && <p className="text-xs text-slate-500 mt-0.5">{event.reason}</p>}
                    </div>
                    <span className="text-xs text-slate-600 whitespace-nowrap">{fmtTime(event.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
