import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { api } from '../api'
import { thb, today } from '../fmt'
import { useAuth } from '../AuthContext'
import {
  Plus, Pencil, Trash2, X, ArrowRightLeft, Lock, Unlock, Wallet,
  CreditCard, CheckCircle2, Circle, CalendarDays, Info, ShieldCheck,
  ArrowLeft, Loader2, ChevronDown,
} from 'lucide-react'
import {
  formatPaymentAmount,
  getCreditOutstanding,
  getPaymentImpact,
  parsePaymentAmount,
  validateCreditCardPayment,
} from '../creditCardPayment'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }
const TYPES = ['cash', 'bank', 'credit']
const SCOPES = ['business', 'personal']
const COLORS = ['#1A7A4A','#0369A1','#6B7280','#7C3AED','#B45309','#BE185D','#C0392B','#9CA3AF']
const EMPTY_W = { name: '', scope: 'business', type: 'cash', initialBalance: '', color: '#1A7A4A' }
const EMPTY_T = { fromWalletId: '', toWalletId: '', amount: '', date: today(), note: '' }
const TYPE_LABELS = { cash: 'เงินสด', bank: 'บัญชีธนาคาร', credit: 'บัตรเครดิต' }

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

function Label({ children }) {
  return <label className="block text-xs font-medium text-slate-400 mb-1.5">{children}</label>
}

function formatThaiDate(date) {
  if (!date) return '-'
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${date}T12:00:00`))
}

function CreditCardPaymentDrawer({ creditWallet, wallets, onClose, onPaid }) {
  const outstanding = getCreditOutstanding(creditWallet.currentBalance)
  const sourceWallets = useMemo(
    () => wallets
      .filter(w => w.id !== creditWallet.id && w.type !== 'credit' && Number(w.currentBalance || 0) > 0)
      .sort((a, b) => {
        if (a.type === 'bank' && b.type !== 'bank') return -1
        if (b.type === 'bank' && a.type !== 'bank') return 1
        return Number(b.currentBalance || 0) - Number(a.currentBalance || 0)
      }),
    [creditWallet.id, wallets],
  )
  const defaultSource = sourceWallets.find(w => Number(w.currentBalance || 0) >= outstanding) || sourceWallets[0]
  const [payment, setPayment] = useState({
    fromWalletId: defaultSource?.id || '',
    amount: outstanding ? formatPaymentAmount(outstanding) : '',
    amountMode: 'full',
    date: today(),
  })
  const [stage, setStage] = useState('form')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmedImpact, setConfirmedImpact] = useState(null)
  const [confirmedSourceName, setConfirmedSourceName] = useState('')
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const savingRef = useRef(saving)
  const selectedSource = sourceWallets.find(w => w.id === payment.fromWalletId)
  const amount = parsePaymentAmount(payment.amount)
  const impact = getPaymentImpact({
    sourceBalance: selectedSource?.currentBalance,
    creditBalance: creditWallet.currentBalance,
    amount,
  })

  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => { savingRef.current = saving }, [saving])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const trigger = document.activeElement
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !savingRef.current) onCloseRef.current()
      if (event.key !== 'Tab') return

      const focusable = [...(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [])].filter(element => !element.hasAttribute('hidden'))
      if (!focusable.length) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      if (trigger instanceof HTMLElement) trigger.focus()
    }
  }, [])

  useEffect(() => { dialogRef.current?.focus() }, [stage])

  const chooseAmountMode = (mode) => {
    setError('')
    setPayment(current => ({
      ...current,
      amountMode: mode,
      amount: mode === 'full' ? formatPaymentAmount(outstanding) : '',
    }))
  }

  const validate = () => validateCreditCardPayment({
    sourceWalletId: payment.fromWalletId,
    creditWalletId: creditWallet.id,
    sourceBalance: selectedSource?.currentBalance,
    creditBalance: creditWallet.currentBalance,
    amount: payment.amount,
    date: payment.date,
  })

  const reviewPayment = (event) => {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setStage('review')
  }

  const confirmPayment = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      setStage('form')
      return
    }

    setSaving(true)
    setError('')
    try {
      await api.createTransfer({
        fromWalletId: payment.fromWalletId,
        toWalletId: creditWallet.id,
        amount,
        date: payment.date,
        note: `ชำระบัตรเครดิต ${creditWallet.name}`,
      })
      setConfirmedImpact(impact)
      setConfirmedSourceName(selectedSource?.name || '')
      await onPaid().catch(() => undefined)
      setStage('success')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" aria-live="polite">
      <button type="button" aria-label="ปิดหน้าจ่ายบัตรเครดิต" onClick={onClose}
        disabled={saving} className="absolute inset-0 cursor-default bg-black/45 disabled:cursor-wait" />
      <aside ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="credit-payment-title" tabIndex={-1}
        className="relative flex h-[100dvh] w-full flex-col shadow-2xl sm:max-w-[30rem]"
        style={{ background: '#11182a', borderLeft: '1px solid #2e3349' }}>
        <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-7" style={{ borderBottom: '1px solid #273047' }}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-red-400/20 bg-red-400/10">
              <CreditCard className="h-5 w-5 text-red-400" />
            </div>
            <div className="min-w-0">
              <h3 id="credit-payment-title" className="truncate text-xl font-bold text-white">
                {stage === 'review' ? 'ยืนยันการจ่ายบัตรเครดิต' : stage === 'success' ? 'จ่ายบัตรเครดิตเรียบร้อย' : `จ่าย${creditWallet.name}`}
              </h3>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200 disabled:opacity-40"
            aria-label="ปิด">
            <X className="h-5 w-5" />
          </button>
        </header>

        {stage === 'form' && (
          <form onSubmit={reviewPayment} className="flex min-h-0 flex-1 flex-col">
            <div className="credit-payment-scroll min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5 sm:px-7">
              <section>
                <p className="text-sm text-slate-500">ยอดค้างชำระปัจจุบัน</p>
                <p className="mt-1.5 text-4xl font-bold tabular-nums text-red-400">-{thb(outstanding)}</p>
              </section>

              <section>
                <h4 className="mb-3 text-[0.95rem] font-semibold text-slate-200">1. เลือกกระเป๋าต้นทาง</h4>
                <div className="space-y-3">
                  {sourceWallets.map(wallet => {
                    const selected = wallet.id === payment.fromWalletId
                    return (
                      <button key={wallet.id} type="button"
                        onClick={() => { setPayment(current => ({ ...current, fromWalletId: wallet.id })); setError('') }}
                        aria-pressed={selected}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${selected ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-700 hover:border-slate-600'}`}>
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="h-3.5 w-3.5 flex-shrink-0 rounded-full" style={{ backgroundColor: wallet.color || '#9CA3AF' }} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-200">{wallet.name}</span>
                            <span className="block text-xs text-slate-500">ยอดคงเหลือ {thb(wallet.currentBalance || 0)}</span>
                          </span>
                        </span>
                        <span className="flex flex-shrink-0 items-center gap-3">
                          <span className="hidden text-sm font-semibold tabular-nums text-slate-300 min-[390px]:block">{thb(wallet.currentBalance || 0)}</span>
                          {selected ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <Circle className="h-5 w-5 text-slate-600" />}
                        </span>
                      </button>
                    )
                  })}
                  {sourceWallets.length === 0 && (
                    <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
                      กรุณาเพิ่มกระเป๋าเงินสดหรือบัญชีธนาคารก่อนจ่ายบัตรเครดิต
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h4 className="mb-3 text-[0.95rem] font-semibold text-slate-200">2. จำนวนที่ต้องการจ่าย</h4>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['full', 'เต็มจำนวน'],
                    ['minimum', 'ขั้นต่ำ'],
                    ['custom', 'กำหนดเอง'],
                  ].map(([mode, label]) => (
                    <button key={mode} type="button" onClick={() => chooseAmountMode(mode)}
                      aria-pressed={payment.amountMode === mode}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors sm:text-sm ${payment.amountMode === mode ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="relative mt-3">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-slate-500">฿</span>
                  <input type="text" inputMode="decimal" aria-label="จำนวนเงินที่ต้องการจ่าย"
                    value={payment.amount}
                    onChange={event => {
                      const sanitized = event.target.value.replace(/[^\d.,]/g, '')
                      setPayment(current => ({ ...current, amount: sanitized, amountMode: current.amountMode === 'minimum' ? 'minimum' : 'custom' }))
                      setError('')
                    }}
                    onBlur={() => setPayment(current => ({ ...current, amount: formatPaymentAmount(current.amount) }))}
                    placeholder={payment.amountMode === 'minimum' ? 'กรอกยอดขั้นต่ำจากใบแจ้งหนี้' : '0.00'}
                    className="w-full rounded-xl border border-slate-700 bg-[#0d1424] py-3 pl-11 pr-4 text-3xl font-bold tabular-nums text-white outline-none transition-colors placeholder:text-base placeholder:font-normal focus:border-emerald-500" />
                </div>
                {payment.amountMode === 'minimum' && (
                  <p className="mt-2 text-xs text-slate-500">กรอกยอดขั้นต่ำตามใบแจ้งหนี้ เพื่อไม่คำนวณอัตราชำระแทนธนาคาร</p>
                )}
              </section>

              <section>
                <h4 className="mb-3 text-[0.95rem] font-semibold text-slate-200">3. วันที่จ่ายเงิน</h4>
                <div className="relative rounded-xl border border-slate-700 bg-[#0d1424] transition-colors focus-within:border-emerald-500">
                  <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <span className="block py-2.5 pl-11 pr-4 text-sm text-slate-200">{formatThaiDate(payment.date)}</span>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input type="date" value={payment.date}
                    aria-label="วันที่จ่ายเงิน"
                    onChange={event => { setPayment(current => ({ ...current, date: event.target.value })); setError('') }}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                </div>
              </section>

              <section className="!mt-2">
                <h4 className="mb-1 text-[0.95rem] font-semibold text-slate-200">4. ผลกระทบหลังจ่าย</h4>
                <div className="space-y-2 rounded-xl border border-slate-700 bg-[#0d1424] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-slate-300">
                      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: selectedSource?.color || '#64748b' }} />
                      <span className="truncate">{selectedSource?.name || 'กระเป๋าต้นทาง'} <span className="text-slate-500">(หลังจ่าย)</span></span>
                    </span>
                    <span className="flex flex-shrink-0 flex-col items-end">
                      <strong className={`text-sm tabular-nums ${impact && impact.sourceAfter < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {impact ? thb(impact.sourceAfter) : '-'}
                      </strong>
                      {impact && <span className="mt-0.5 text-[0.68rem] tabular-nums text-slate-500">ลดลง {thb(amount)}</span>}
                    </span>
                  </div>
                  <div className="h-px bg-slate-800" />
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-slate-300">
                      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: creditWallet.color || '#f87171' }} />
                      <span className="truncate">{creditWallet.name} <span className="text-slate-500">(หลังจ่าย)</span></span>
                    </span>
                    <span className="flex flex-shrink-0 flex-col items-end">
                      <strong className={`text-sm tabular-nums ${impact && impact.creditAfter < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {impact ? thb(impact.creditAfter) : '-'}
                      </strong>
                      {impact && <span className="mt-0.5 text-[0.68rem] tabular-nums text-slate-500">ลดลง {thb(amount)}</span>}
                    </span>
                  </div>
                </div>
              </section>

              <div className="!mt-5 flex gap-2 rounded-xl border border-slate-700 bg-slate-800/30 p-3 text-xs leading-5 text-slate-500">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>บันทึกเป็นการโอนภายใน ไม่รวมในรายรับ–รายจ่าย</p>
              </div>

              {error && <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-2 text-sm text-red-400">{error}</p>}
            </div>

            <footer className="space-y-4 px-5 py-5 sm:px-7" style={{ borderTop: '1px solid #273047' }}>
              <button type="submit" disabled={!sourceWallets.length || outstanding <= 0}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-[1.125rem] text-sm font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">
                ตรวจสอบและจ่าย <Lock className="h-4 w-4" />
              </button>
              <button type="button" onClick={onClose} className="w-full rounded-lg py-2 text-sm font-medium text-emerald-500 hover:text-emerald-400">ยกเลิก</button>
            </footer>
          </form>
        )}

        {stage === 'review' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="credit-payment-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5 text-center">
                <p className="text-sm text-slate-400">ยอดชำระ</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-white">{thb(amount)}</p>
                <p className="mt-2 text-sm text-slate-500">{selectedSource?.name} → {creditWallet.name}</p>
              </div>

              <div className="rounded-xl border border-slate-700 bg-[#0d1424] p-4">
                <dl className="space-y-4 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-slate-500">วันที่จ่าย</dt>
                    <dd className="font-medium text-slate-200">{formatThaiDate(payment.date)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-slate-500">ยอดกระเป๋าหลังจ่าย</dt>
                    <dd className="font-semibold tabular-nums text-emerald-400">{thb(impact?.sourceAfter || 0)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-slate-500">ยอดค้างบัตรหลังจ่าย</dt>
                    <dd className="font-semibold tabular-nums text-red-400">-{thb(impact?.outstandingAfter || 0)}</dd>
                  </div>
                </dl>
              </div>

              <div className="flex gap-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100/80">
                <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
                <p>กรุณาตรวจสอบยอดและกระเป๋าต้นทางให้ถูกต้อง เมื่อยืนยันแล้วระบบจะบันทึกรายการโอนทันที</p>
              </div>
              {error && <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-2 text-sm text-red-400">{error}</p>}
            </div>
            <footer className="grid grid-cols-[auto_1fr] gap-2 px-5 py-4 sm:px-7" style={{ borderTop: '1px solid #273047' }}>
              <button type="button" onClick={() => setStage('form')} disabled={saving}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-300 hover:border-slate-600 disabled:opacity-40">
                <ArrowLeft className="h-4 w-4" /> แก้ไข
              </button>
              <button type="button" onClick={confirmPayment} disabled={saving}
                className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> กำลังบันทึก...</> : <><ShieldCheck className="h-4 w-4" /> ยืนยันการจ่าย</>}
              </button>
            </footer>
          </div>
        )}

        {stage === 'success' && (
          <div className="flex flex-1 flex-col items-center justify-center px-7 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <h4 className="mt-5 text-xl font-bold text-white">ชำระบัตรเรียบร้อย</h4>
            <p className="mt-2 text-sm text-slate-400">บันทึกการโอน {thb(amount)} จาก {confirmedSourceName} ไปยัง {creditWallet.name} แล้ว</p>
            <div className="mt-6 w-full rounded-xl border border-slate-700 bg-[#0d1424] p-4 text-left text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">ยอดค้างบัตรคงเหลือ</span>
                <strong className="tabular-nums text-red-400">-{thb(confirmedImpact?.outstandingAfter || 0)}</strong>
              </div>
            </div>
            <button type="button" onClick={onClose} className="mt-6 w-full rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-500">เสร็จสิ้น</button>
          </div>
        )}
      </aside>
    </div>
  )
}

export default function Wallets() {
  const { user } = useAuth()
  const [wallets, setWallets] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [paymentCard, setPaymentCard] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_W)
  const [transfer, setTransfer] = useState(EMPTY_T)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const isAdmin = user?.role === 'admin'
  const canTransfer = user?.role === 'admin' || user?.role === 'staff'

  const load = useCallback(async () => {
    const d = await api.wallets()
    setWallets(d.wallets || [])
    setLoading(false)
  }, [])

  // The API-backed initial load intentionally starts when the page mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(EMPTY_W); setErr(''); setShowForm(true) }
  const openEdit = (w) => {
    setEditing(w)
    setForm({ name: w.name, scope: w.scope, type: w.type, initialBalance: w.initialBalance || '', color: w.color || '#1A7A4A' })
    setErr('')
    setShowForm(true)
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      const body = { ...form, initialBalance: form.initialBalance !== '' ? Number(form.initialBalance) : 0 }
      if (editing) await api.updateWallet(editing.id, body)
      else await api.createWallet(body)
      setShowForm(false)
      load()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const del = async (w) => {
    if (!confirm(`ลบกระเป๋า "${w.name}"?`)) return
    try { await api.deleteWallet(w.id); load() } catch (e) { alert(e.message) }
  }

  const toggleVisibility = async (w) => {
    try {
      await api.updateWallet(w.id, { staffVisible: !w.staffVisible })
      load()
    } catch (e) { alert(e.message) }
  }

  const doTransfer = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      await api.createTransfer({ ...transfer, amount: Number(transfer.amount) })
      setShowTransfer(false)
      setTransfer(EMPTY_T)
      load()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const totalBalance = wallets.reduce((s, w) => s + (w.currentBalance || 0), 0)

  if (loading) return (
    <div className="p-6 flex items-center gap-2 text-slate-500">
      <div className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      กำลังโหลด...
    </div>
  )

  return (
    <div className={`wallets-page space-y-4 p-5 transition-[padding] duration-200 ${paymentCard ? 'sm:pr-[31.25rem]' : ''}`}>
      <style>{`
        .wallets-page button:focus-visible, .wallets-page input:focus-visible, .wallets-page select:focus-visible {
          outline: 2px solid rgba(16,185,129,0.55); outline-offset: 2px; border-radius: 0.5rem;
        }
        .credit-payment-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .credit-payment-scroll::-webkit-scrollbar { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .wallets-page *, .wallets-page *::before, .wallets-page *::after {
            animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
          }
        }
      `}</style>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-900/30"
            style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white leading-tight">กระเป๋าเงิน</h2>
            <p className="text-sm text-slate-500">ยอดรวม <span className="tabular-nums">{thb(totalBalance)}</span></p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canTransfer && (
            <button onClick={() => { setTransfer(EMPTY_T); setErr(''); setShowTransfer(true) }}
              className="flex items-center gap-2 text-slate-300 hover:text-white text-sm px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
              style={{ border: '1px solid #2e3349', background: '#161b2e' }}>
              <ArrowRightLeft className="w-4 h-4" /> โอนเงิน
            </button>
          )}
          {isAdmin && (
            <button onClick={openCreate}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-3 py-2 rounded-lg transition-colors whitespace-nowrap">
              <Plus className="w-4 h-4" /> เพิ่มกระเป๋า
            </button>
          )}
        </div>
      </div>

      {wallets.length === 0 ? (
        <div className="rounded-xl p-10 flex flex-col items-center justify-center text-center gap-3" style={CARD}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: '#1f2937' }}>
            <Wallet className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-400 text-sm">ยังไม่มีกระเป๋า</p>
        </div>
      ) : (
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${paymentCard ? '' : 'lg:grid-cols-3'}`}>
        {wallets.map(w => (
          <div key={w.id} className="rounded-xl p-5 relative"
            style={{ ...CARD, borderColor: w.type === 'credit' && getCreditOutstanding(w.currentBalance) > 0 ? 'rgba(248,113,113,0.45)' : '#1f2937', opacity: isAdmin ? 1 : 1 }}>
            {/* Private badge for admin view */}
            {isAdmin && !w.staffVisible && (
              <div className="absolute top-3 left-3 flex items-center gap-1 text-xs text-orange-400 bg-orange-400/10 border border-orange-400/20 px-2 py-0.5 rounded-full">
                <Lock className="w-2.5 h-2.5" /> เฉพาะ Admin
              </div>
            )}
            <div className={`flex items-start justify-between ${isAdmin && !w.staffVisible ? 'mt-6' : ''} mb-4`}>
              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: w.color || '#9CA3AF' }} />
                <span className="font-semibold text-slate-200">{w.name}</span>
              </div>
              {isAdmin && (
                <div className="flex gap-1.5">
                  <button onClick={() => toggleVisibility(w)}
                    aria-label={w.staffVisible ? 'ซ่อนจาก Staff' : 'แสดงให้ Staff เห็น'}
                    title={w.staffVisible ? 'ซ่อนจาก Staff' : 'แสดงให้ Staff เห็น'}
                    className={`p-2 rounded-lg transition-colors ${w.staffVisible ? 'text-slate-500 hover:text-orange-400 hover:bg-orange-500/10' : 'text-orange-400 bg-orange-400/10 hover:bg-orange-400/20'}`}>
                    {w.staffVisible ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => openEdit(w)} aria-label="แก้ไข" title="แก้ไข" className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => del(w)} aria-label="ลบ" title="ลบ" className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            <div className={`text-2xl font-bold mb-3 tabular-nums ${(w.currentBalance || 0) < 0 ? 'text-red-400' : 'text-white'}`}>
              {thb(w.currentBalance || 0)}
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-slate-400 px-2 py-0.5 rounded-full" style={{ background: '#1f2937' }}>{TYPE_LABELS[w.type] || w.type}</span>
                <span className="text-xs text-slate-400 px-2 py-0.5 rounded-full" style={{ background: '#1f2937' }}>{w.scope === 'business' ? 'ธุรกิจ' : 'ส่วนตัว'}</span>
              </div>
              {w.type === 'credit' && canTransfer && (
                <button type="button" onClick={() => { setErr(''); setPaymentCard(w) }}
                  disabled={getCreditOutstanding(w.currentBalance) <= 0}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/70 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-transparent disabled:text-slate-600"
                  title={getCreditOutstanding(w.currentBalance) > 0 ? 'จ่ายค่าบัตรเครดิต' : 'ไม่มียอดค้างชำระ'}>
                  <CreditCard className="h-3.5 w-3.5" /> {getCreditOutstanding(w.currentBalance) > 0 ? 'จ่ายบัตร' : 'ชำระแล้ว'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      )}

      {showForm && (
        <Modal title={editing ? 'แก้ไขกระเป๋า' : 'เพิ่มกระเป๋าเงิน'} onClose={() => setShowForm(false)}>
          <form onSubmit={save} className="space-y-3">
            <div><Label>ชื่อกระเป๋า</Label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className={INPUT} style={INPUT_STYLE} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>ประเภท</Label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select></div>
              <div><Label>Scope</Label>
                <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                  {SCOPES.map(s => <option key={s} value={s}>{s === 'business' ? 'ธุรกิจ' : 'ส่วนตัว'}</option>)}
                </select></div>
            </div>
            {!editing && (
              <div><Label>ยอดเริ่มต้น (บาท)</Label>
                <input type="number" step="0.01" value={form.initialBalance} onChange={e => setForm(f => ({ ...f, initialBalance: e.target.value }))} className={INPUT} style={INPUT_STYLE} placeholder="0" /></div>
            )}
            <div>
              <Label>สี</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                    aria-label={`สี ${c}`} aria-pressed={form.color === c}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? 'border-white scale-110' : 'border-transparent opacity-70 hover:opacity-100'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <button type="submit" disabled={saving}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </form>
        </Modal>
      )}

      {showTransfer && (
        <Modal title="โอนเงินระหว่างกระเป๋า" onClose={() => setShowTransfer(false)}>
          <form onSubmit={doTransfer} className="space-y-3">
            <div><Label>จากกระเป๋า</Label>
              <select value={transfer.fromWalletId} onChange={e => setTransfer(t => ({ ...t, fromWalletId: e.target.value }))} required className={INPUT} style={INPUT_STYLE}>
                <option value="">เลือก...</option>
                {wallets.map(w => <option key={w.id} value={w.id}>{w.name} ({thb(w.currentBalance || 0)})</option>)}
              </select></div>
            <div><Label>ไปกระเป๋า</Label>
              <select value={transfer.toWalletId} onChange={e => setTransfer(t => ({ ...t, toWalletId: e.target.value }))} required className={INPUT} style={INPUT_STYLE}>
                <option value="">เลือก...</option>
                {wallets.filter(w => w.id !== transfer.fromWalletId).map(w => <option key={w.id} value={w.id}>{w.name} ({thb(w.currentBalance || 0)})</option>)}
              </select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>จำนวนเงิน</Label>
                <input type="number" min="0.01" step="0.01" value={transfer.amount} onChange={e => setTransfer(t => ({ ...t, amount: e.target.value }))} required className={INPUT} style={INPUT_STYLE} /></div>
              <div><Label>วันที่</Label>
                <input type="date" value={transfer.date} onChange={e => setTransfer(t => ({ ...t, date: e.target.value }))} required className={INPUT} style={INPUT_STYLE} /></div>
            </div>
            <div><Label>หมายเหตุ</Label>
              <input value={transfer.note} onChange={e => setTransfer(t => ({ ...t, note: e.target.value }))} className={INPUT} style={INPUT_STYLE} /></div>
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <button type="submit" disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
              {saving ? 'กำลังโอน...' : 'โอนเงิน'}
            </button>
          </form>
        </Modal>
      )}

      {paymentCard && (
        <CreditCardPaymentDrawer
          creditWallet={paymentCard}
          wallets={wallets}
          onClose={() => setPaymentCard(null)}
          onPaid={load}
        />
      )}
    </div>
  )
}
