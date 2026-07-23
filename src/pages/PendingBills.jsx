import { useState, useEffect } from 'react'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { Plus, X, Receipt, AlertTriangle, FileText } from 'lucide-react'
import { isWeakEvidence, weakRatioByUser, duplicateIds } from '../../pending-bills-logic.mjs'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }
const thb = (n) => '฿' + Number(n || 0).toLocaleString('th-TH')

const EVIDENCE_TIERS = [
  ['slip_transfer', 'โอน / PromptPay', 'แข็ง'],
  ['receipt', 'เงินสด + ใบเสร็จ', 'แข็ง'],
  ['self_declared', 'เงินสด ตลาดสด (ไม่มีบิล)', 'อ่อน'],
]

function Overlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="w-full sm:max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
        style={{ background: '#161b2e', border: '1px solid #2e3349' }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function SubmitBillModal({ me, onClose, onDone }) {
  const [categories, setCategories] = useState([])
  const [vendors, setVendors] = useState([])
  const [form, setForm] = useState({ name: '', amount: '', scope: 'business', categoryId: '', note: '', payeeType: 'employee', vendorRefId: '', evidenceType: 'slip_transfer', isDeposit: false })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { api.categories().then(d => setCategories(d.categories || d || [])).catch(() => {}) }, [])
  useEffect(() => { api.vendorProfiles().then(d => setVendors(d.vendors || [])).catch(() => {}) }, [])
  const weak = isWeakEvidence(form.evidenceType)
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (!file) { setErr('ต้องแนบรูปหลักฐาน'); return }
    if (form.payeeType === 'vendor' && !form.vendorRefId) { setErr('เลือกร้านค้าปลายทาง'); return }
    setSaving(true)
    const body = { name: form.name, amount: Number(form.amount), scope: form.scope, note: form.note || undefined,
      categoryId: form.categoryId || undefined, payeeType: form.payeeType,
      payeeRefId: form.payeeType === 'employee' ? me.id : form.vendorRefId, evidenceType: form.evidenceType,
      isDeposit: form.isDeposit }
    let created = null
    try {
      const res = await api.createPendingBill(body)
      created = res.bill
      await api.uploadBillEvidence(created.id, file)
      onDone(); onClose()
    } catch (e) {
      if (created) { try { await api.deletePendingBill(created.id) } catch {} }
      setErr(e.message)
    } finally { setSaving(false) }
  }
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="font-semibold text-slate-100">แจ้งบิลรอจ่าย</h3>
        <button onClick={onClose} aria-label="ปิด"><X className="w-5 h-5 text-slate-400" /></button>
      </div>
      <form onSubmit={submit} className="p-4 space-y-3 overflow-y-auto">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">ชื่อรายการ</label>
          <input className={INPUT} style={INPUT_STYLE} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">จำนวนเงิน</label>
            <input className={INPUT} style={INPUT_STYLE} type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">ขอบเขต</label>
            <select className={INPUT} style={INPUT_STYLE} value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}>
              <option value="business">ธุรกิจ</option><option value="personal">ส่วนตัว</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">หมวดหมู่</label>
          <select className={INPUT} style={INPUT_STYLE} value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">— ไม่ระบุ —</option>
            {categories.filter(c => !c.parentId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">ปลายทางการโอน</label>
          <select className={INPUT} style={INPUT_STYLE} value={form.payeeType}
            onChange={e => setForm({ ...form, payeeType: e.target.value, vendorRefId: '' })}>
            <option value="employee">ตัวเอง (สำรองจ่าย)</option>
            <option value="vendor">ร้านค้า/ซัพพลายเออร์</option>
          </select>
        </div>
        {form.payeeType === 'vendor' && (
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">เลือกร้านค้า/ซัพพลายเออร์</label>
            <select className={INPUT} style={INPUT_STYLE} value={form.vendorRefId} onChange={e => setForm({ ...form, vendorRefId: e.target.value })}>
              <option value="">— เลือกร้านค้า —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.vendorName}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">จ่ายด้วยวิธีไหน</label>
          <div className="space-y-2">
            {EVIDENCE_TIERS.map(([v, label, strength]) => (
              <button type="button" key={v} aria-pressed={form.evidenceType === v} onClick={() => setForm({ ...form, evidenceType: v })}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm border transition-colors"
                style={{ borderColor: form.evidenceType === v ? '#10b981' : '#2e3349', color: '#e2e8f0', background: form.evidenceType === v ? '#10b98115' : 'transparent' }}>
                <span>{label}</span>
                <span className="text-xs" style={{ color: strength === 'อ่อน' ? '#f59e0b' : '#34d399' }}>หลักฐาน{strength}</span>
              </button>
            ))}
          </div>
          {weak && <p className="text-xs text-amber-400 mt-2">ตลาดสดไม่มีบิล: บังคับแนบรูปของ · ยอดเกิน ฿1,000 ต้องจ่ายแบบโอน · ระบบจะออกใบรับรองแทนใบเสร็จให้</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">แนบรูปหลักฐาน{weak ? ' (รูปของ)' : ''}</label>
          <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)}
            className="block w-full text-xs text-slate-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">หมายเหตุ</label>
          <input className={INPUT} style={INPUT_STYLE} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.isDeposit} onChange={e => setForm({ ...form, isDeposit: e.target.checked })} />
          มัดจำ/จ่ายก่อนของมา
        </label>
        {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
        <button type="submit" disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors">
          {saving ? 'กำลังส่ง...' : 'ส่งบิลรอจ่าย'}
        </button>
      </form>
    </Overlay>
  )
}

function PayModal({ bill, onClose, onDone }) {
  const [wallets, setWallets] = useState([])
  const [walletId, setWalletId] = useState('')
  const [date, setDate] = useState(new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { api.wallets().then(d => { const ws = d.wallets || d || []; setWallets(ws); if (ws[0]) setWalletId(ws[0].id) }).catch(() => {}) }, [])
  const pay = async (e) => {
    e.preventDefault(); setSaving(true); setErr('')
    try { await api.payPendingBill(bill.id, { walletId, date }); onDone(); onClose() }
    catch (e) { setErr(e.message) } finally { setSaving(false) }
  }
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="font-semibold text-slate-100">ยืนยันจ่ายแล้ว · {thb(bill.amount)}</h3>
        <button onClick={onClose} aria-label="ปิด"><X className="w-5 h-5 text-slate-400" /></button>
      </div>
      <form onSubmit={pay} className="p-4 space-y-3">
        <p className="text-xs text-slate-400">บันทึกเป็นรายจ่าย {thb(bill.amount)} เข้าเล่มบัญชี — จะตัดยอดกระเป๋าที่เลือก</p>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">จ่ายออกจากกระเป๋าเงิน</label>
          <select className={INPUT} style={INPUT_STYLE} value={walletId} onChange={e => setWalletId(e.target.value)} required>
            {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">วันที่จ่าย</label>
          <input className={INPUT} style={INPUT_STYLE} type="date" value={date} onChange={e => setDate(e.target.value)} required />
        </div>
        {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
        <button type="submit" disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors">
          {saving ? 'กำลังบันทึก...' : 'บันทึกเข้าเล่ม'}
        </button>
      </form>
    </Overlay>
  )
}

function RefundModal({ bill, onClose, onDone }) {
  const [wallets, setWallets] = useState([])
  const [walletId, setWalletId] = useState('')
  const [amount, setAmount] = useState(bill.amount)
  const [date, setDate] = useState(new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { api.wallets().then(d => { const ws = d.wallets || d || []; setWallets(ws); if (ws[0]) setWalletId(ws[0].id) }).catch(() => {}) }, [])
  const refund = async (e) => {
    e.preventDefault(); setSaving(true); setErr('')
    try { await api.refundPendingBill(bill.id, { walletId, amount: Number(amount), date }); onDone(); onClose() }
    catch (e) { setErr(e.message) } finally { setSaving(false) }
  }
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="font-semibold text-slate-100">คืนเงิน · {bill.name}</h3>
        <button onClick={onClose} aria-label="ปิด"><X className="w-5 h-5 text-slate-400" /></button>
      </div>
      <form onSubmit={refund} className="p-4 space-y-3">
        <p className="text-xs text-slate-400">บันทึกเป็นรายรับคืนเงิน — จะเข้ายอดกระเป๋าที่เลือก</p>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">รับเงินคืนเข้ากระเป๋าเงิน</label>
          <select className={INPUT} style={INPUT_STYLE} value={walletId} onChange={e => setWalletId(e.target.value)} required>
            {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">จำนวนเงินคืน</label>
          <input className={INPUT} style={INPUT_STYLE} type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">วันที่คืนเงิน</label>
          <input className={INPUT} style={INPUT_STYLE} type="date" value={date} onChange={e => setDate(e.target.value)} required />
        </div>
        {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
        <button type="submit" disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors">
          {saving ? 'กำลังบันทึก...' : 'บันทึกคืนเงิน'}
        </button>
      </form>
    </Overlay>
  )
}

function BillCard({ bill, isAdmin, isDup, onPay, onReject, onView, onReceived, onRefund }) {
  const weak = isWeakEvidence(bill.evidenceType)
  const showCert = bill.status === 'paid' && bill.evidenceType === 'self_declared'
  const depositAwaiting = bill.isDeposit && bill.status === 'paid' && !bill.goodsReceivedAt
  const openCert = () => {
    const payload = encodeURIComponent(JSON.stringify({
      id: bill.createdTxId, n: bill.payeeName || bill.submittedByName || '-', amt: bill.amount,
      d: (bill.paidAt || bill.createdAt || '').slice(0, 10), b: bill.payeeBank || '', r: '', si: '', ty: 'cert', mo: bill.name || '',
    }))
    window.open(`/voucher?d=${payload}`, '_blank')
  }
  return (
    <div className="rounded-xl p-4" style={{ ...CARD, borderColor: weak ? '#b45309' : '#1f2937' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-100">{bill.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: weak ? '#b4530922' : '#15803d22', color: weak ? '#f59e0b' : '#34d399' }}>
              หลักฐาน{weak ? 'อ่อน' : 'แข็ง'}
            </span>
            {bill.status !== 'pending' && <span className="text-xs text-slate-500">· {bill.status === 'paid' ? 'จ่ายแล้ว' : 'ปฏิเสธ'}</span>}
            {isDup && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#b4530922', color: '#f59e0b' }}>อาจซ้ำ</span>}
            {depositAwaiting && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#1d4ed822', color: '#60a5fa' }}>รอของ</span>}
            {bill.refundTxId && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#15803d22', color: '#34d399' }}>คืนแล้ว</span>}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex gap-2 flex-wrap">
            <span>โดย {bill.submittedByName || '—'}</span>
            {bill.categoryName && <span>· {bill.categoryName}</span>}
            {bill.payeeAccountNo && <span>· โอนไป {bill.payeeBank || ''} ••{String(bill.payeeAccountNo).slice(-4)}</span>}
          </div>
          {bill.status === 'rejected' && bill.rejectReason && <p className="text-xs text-red-400 mt-1">เหตุผล: {bill.rejectReason}</p>}
        </div>
        <div className="text-lg font-bold text-slate-100 tabular-nums">{thb(bill.amount)}</div>
      </div>
      <div className="flex gap-2 mt-3">
        {bill.hasEvidence && <button onClick={() => onView(bill)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300">ดูหลักฐาน</button>}
        {showCert && (
          <button onClick={openCert} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300">
            <FileText className="w-3.5 h-3.5" />ใบรับรอง
          </button>
        )}
        {isAdmin && bill.status === 'pending' && <>
          <button onClick={() => onPay(bill)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">จ่ายแล้ว</button>
          <button onClick={() => onReject(bill)} className="text-xs px-3 py-1.5 rounded-lg text-red-400">ปฏิเสธ</button>
        </>}
        {depositAwaiting && <button onClick={() => onReceived(bill)} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white">ของมาแล้ว</button>}
        {isAdmin && bill.status === 'paid' && !bill.refundTxId && <button onClick={() => onRefund(bill)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300">คืนเงิน</button>}
      </div>
    </div>
  )
}

export default function PendingBills() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const isViewer = !!user && user.role !== 'admin' && user.role !== 'staff'
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSubmit, setShowSubmit] = useState(false)
  const [payBill, setPayBill] = useState(null)
  const [refundBill, setRefundBill] = useState(null)
  const [adminFilter, setAdminFilter] = useState('pending')
  // admin: คิวเลือกได้ pending/paid ผ่าน adminFilter · staff: บิลของฉันทุกสถานะ (เห็นจ่ายแล้ว/ปฏิเสธ+เหตุผล ตาม acceptance #6)
  // viewer: ไม่มีสิทธิ์เข้าถึงบิลรอจ่าย เลย ข้ามการเรียก api ไปเลย (กัน 403 ที่ถูกกลืน)
  const load = () => {
    if (isViewer) { setLoading(false); return }
    setLoading(true)
    api.pendingBills(isAdmin ? { status: adminFilter } : {}).then(d => setBills(d.bills || [])).catch(() => setBills([])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [adminFilter])
  const reject = async (bill) => {
    const reason = window.prompt('เหตุผลที่ปฏิเสธ:')
    if (reason === null) return
    try { await api.rejectPendingBill(bill.id, { reason }); load() } catch (e) { alert(e.message) }
  }
  const view = async (bill) => { try { const url = await api.fetchBillEvidenceBlob(bill.id); window.open(url, '_blank') } catch (e) { alert(e.message) } }
  const received = async (bill) => { try { await api.markGoodsReceived(bill.id); load() } catch (e) { alert(e.message) } }
  const ratios = weakRatioByUser(bills.map(b => ({ submittedByUserId: b.submittedByUserId, amount: b.amount, evidenceType: b.evidenceType })))
  const total = bills.reduce((s, b) => s + b.amount, 0)
  const dupSet = duplicateIds(bills.map(b => ({ id: b.id, payeeRefId: b.payeeRefId, payeeName: b.payeeName, amount: b.amount, date: (b.createdAt || '').slice(0, 10) })))
  const depositAwaitingCount = bills.filter(b => b.isDeposit && b.status === 'paid' && !b.goodsReceivedAt).length
  if (isViewer) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <div className="rounded-xl p-8 text-center" style={CARD}>
          <p className="text-slate-300 text-sm">คุณไม่มีสิทธิ์เข้าถึงบิลรอจ่าย</p>
        </div>
      </div>
    )
  }
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">{isAdmin ? (adminFilter === 'paid' ? 'บิลที่จ่ายแล้ว' : 'คิวบิลรอจ่าย') : 'บิลรอจ่ายของฉัน'}</h1>
          {isAdmin && <p className="text-sm text-slate-400 tabular-nums">{adminFilter === 'paid' ? 'จ่ายแล้ว' : 'รอจ่าย'} {bills.length} รายการ · รวม {thb(total)}</p>}
          {depositAwaitingCount > 0 && <p className="text-sm text-blue-400 tabular-nums">มัดจำรอของ {depositAwaitingCount}</p>}
        </div>
        {!isAdmin && <button onClick={() => setShowSubmit(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm font-semibold"><Plus className="w-4 h-4" />แจ้งบิล</button>}
      </div>
      {isAdmin && (
        <div className="flex gap-2">
          {[['pending', 'รอจ่าย'], ['paid', 'จ่ายแล้ว']].map(([v, label]) => (
            <button key={v} onClick={() => setAdminFilter(v)} aria-pressed={adminFilter === v}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: adminFilter === v ? '#10b981' : '#2e3349', color: adminFilter === v ? '#34d399' : '#94a3b8', background: adminFilter === v ? '#10b98115' : 'transparent' }}>
              {label}
            </button>
          ))}
        </div>
      )}
      {loading ? <p className="text-slate-500 text-sm">กำลังโหลด...</p>
        : bills.length === 0 ? <div className="text-center text-slate-500 py-12"><Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>{isAdmin && adminFilter === 'paid' ? 'ยังไม่มีบิลที่จ่ายแล้ว' : 'ยังไม่มีบิลรอจ่าย'}</p></div>
        : <div className="space-y-3">{bills.map(b => <BillCard key={b.id} bill={b} isAdmin={isAdmin} isDup={dupSet.has(b.id)} onPay={setPayBill} onReject={reject} onView={view} onReceived={received} onRefund={setRefundBill} />)}</div>}
      {isAdmin && Object.entries(ratios).filter(([, r]) => r >= 40).map(([uid, r]) => {
        const nm = bills.find(b => b.submittedByUserId === uid)?.submittedByName || uid
        return <div key={uid} className="flex items-center gap-2 text-xs text-amber-400"><AlertTriangle className="w-4 h-4" />{nm}: บิลไม่มีบิล {r}% ของยอดรอจ่าย — จับตา</div>
      })}
      {showSubmit && <SubmitBillModal me={user} onClose={() => setShowSubmit(false)} onDone={load} />}
      {payBill && <PayModal bill={payBill} onClose={() => setPayBill(null)} onDone={load} />}
      {refundBill && <RefundModal bill={refundBill} onClose={() => setRefundBill(null)} onDone={load} />}
    </div>
  )
}
