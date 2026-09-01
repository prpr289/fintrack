import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import MerchantModal from '../components/MerchantModal'
import PromptPayQR from '../components/PromptPayQR'
import DocBadge from '../components/DocBadge'
import VendorItemsPanel from '../components/VendorItemsPanel'
import { docTypeMeta, whtTypeMeta, taxpayerLabel } from '../merchantMeta'
import { ArrowLeft, Store, Loader2, Pencil, Trash2, Landmark, Receipt, Plus } from 'lucide-react'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const PANEL = { background: '#0d1120', border: '1px solid #1f2937' }
const thb = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const BILL_STATUS = {
  pending: ['รอจ่าย', '#f59e0b'],
  paid: ['จ่ายแล้ว', '#34d399'],
  rejected: ['ตีกลับ', '#f43f5e'],
}

function Panel({ title, children, action }) {
  return (
    <div className="rounded-xl p-4" style={PANEL}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-sm py-1">
      <dt className="text-xs text-slate-500 pt-0.5">{label}</dt>
      <dd className="text-slate-200 break-words">{children ?? <span className="text-slate-600">—</span>}</dd>
    </div>
  )
}

export default function MerchantDetail() {
  // staff แก้ข้อมูลร้านได้ แต่ลบไม่ได้ — ลบแล้วบอทลืมการจับคู่ ย้อนกลับยาก
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { id } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [cats, setCats] = useState([])
  const [wallets, setWallets] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const [md, cd, wd] = await Promise.all([api.merchant(id), api.categories(), api.wallets()])
      setData(md)
      setCats(cd.categories || [])
      setWallets(wd.wallets || [])
    } catch (e) { setErr(e.message) } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  const del = async () => {
    if (!confirm(`ลบร้าน "${data.vendor.vendorName}"? บอทจะลืมการจับคู่นี้ (บิลเก่าไม่หาย)`)) return
    try { await api.deleteVendor(id); nav('/merchants') } catch (e) { setErr(e.message) }
  }

  const fmtDate = (s) => s ? new Date(s).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' }) : '—'

  if (loading) return <div className="p-12 text-center"><Loader2 className="w-5 h-5 text-emerald-500 animate-spin mx-auto" /></div>
  if (err && !data) return (
    <div className="p-5 space-y-3">
      <Link to="/merchants" className="text-sm text-emerald-400 inline-flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />กลับไปรายการร้านค้า</Link>
      <p className="text-red-400 text-sm" role="alert">{err}</p>
    </div>
  )

  const m = data.vendor
  const bills = data.bills || []
  const doc = docTypeMeta(m.docType)
  const wht = whtTypeMeta(m.whtType)
  // worker นับจากบิลทุกใบ (ไม่ใช่แค่ 50 ใบที่โชว์) — เผื่อ worker เก่ายังไม่ส่ง stats มา
  const st = data.stats || { billCount: bills.length, paidTotal: 0, pendingTotal: 0, pendingCount: 0, lastPaidAt: null }

  return (
    <div className="merchant-page p-4 sm:p-5 space-y-4">
      <style>{`
        .merchant-page a:focus-visible, .merchant-page button:focus-visible {
          outline: 2px solid rgba(16,185,129,0.55); outline-offset: 2px; border-radius: 0.5rem;
        }
        @media (prefers-reduced-motion: reduce) {
          .merchant-page *, .merchant-page *::before, .merchant-page *::after {
            animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <Link to="/merchants" className="text-sm text-slate-400 hover:text-slate-200 inline-flex items-center gap-1.5">
        <ArrowLeft className="w-4 h-4" />ร้านค้าทั้งหมด
      </Link>

      <div className="flex items-start gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-900/30"
          style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
          <Store className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-white leading-tight break-words">{m.vendorName}</h2>
            <DocBadge docType={m.docType} short />
          </div>
          {m.displayName && <p className="text-xs text-slate-500 mt-0.5">{m.displayName}</p>}
          <p className="text-sm text-slate-500 mt-0.5">
            {m.businessType
              ? <>{m.businessType}{m.businessSubType && <span className="text-slate-600"> › {m.businessSubType}</span>}</>
              : <span className="text-slate-600">ยังไม่ระบุหมวดธุรกิจ</span>}
            <span className="text-slate-600"> · เจอ {m.occurrenceCount || 0} ครั้ง · ล่าสุด {fmtDate(m.lastSeen)}</span>
          </p>
          {m.isActive === false && (
            <p className="text-xs text-amber-400 mt-1">ร้านนี้ถูกทำเครื่องหมายว่าเลิกใช้แล้ว — ไม่ขึ้นในช่องเลือกร้านตอนแจ้งบิล</p>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setEditing(true)} aria-label="แก้ไขร้านค้า" title="แก้ไขร้านค้า"
            className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
          {isAdmin && <button onClick={del} aria-label="ลบร้านค้า" title="ลบร้านค้า"
            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>}
        </div>
      </div>

      {err && <p className="text-red-400 text-sm" role="alert">{err}</p>}

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="ข้อมูลติดต่อ">
          <dl>
            <Row label="ที่อยู่">{m.address}</Row>
            <Row label="เบอร์โทร">{m.phone && <span className="font-mono tabular-nums">{m.phone}</span>}</Row>
            <Row label="ผู้ติดต่อ">{m.contactPerson}</Row>
          </dl>
          {!m.address && (
            <p className="text-xs text-amber-400/90 mt-3 leading-relaxed">
              ที่อยู่ต้องตรงกับที่พิมพ์บนใบกำกับภาษี — ไม่ครบแล้วใช้อ้างอิงกับสรรพากรไม่ได้
            </p>
          )}
        </Panel>

        <Panel title="บัญชีรับเงิน">
          {m.bankAccountNo || m.promptpayId ? (
            <div className="flex gap-4">
              <div className="min-w-0 flex-1 space-y-3">
                {m.bankAccountNo && (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(16,185,129,0.12)' }}>
                      <Landmark className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">{m.bankName || 'ธนาคาร (ไม่ระบุ)'}</p>
                      <p className="text-base text-emerald-400 font-mono tabular-nums tracking-wide">{m.bankAccountNo}</p>
                      {m.bankAccountName && <p className="text-xs text-slate-500 mt-0.5">{m.bankAccountName}</p>}
                    </div>
                  </div>
                )}
                {m.promptpayId && (
                  <div>
                    <p className="text-xs text-slate-500">พร้อมเพย์</p>
                    <p className="text-sm text-slate-200 font-mono tabular-nums">{m.promptpayId}</p>
                  </div>
                )}
              </div>
              {m.promptpayId && <PromptPayQR promptpayId={m.promptpayId} size={104} label="สแกนจ่ายได้ · ยังไม่ระบุยอด" />}
            </div>
          ) : (
            <p className="text-sm text-slate-500">ยังไม่มีเลขบัญชี —{' '}
              <button onClick={() => setEditing(true)} className="text-emerald-400 hover:text-emerald-300">เพิ่มเลย</button>
            </p>
          )}
        </Panel>

        <Panel title="ข้อมูลภาษี (อ้างอิงสรรพากร)">
          <dl>
            <Row label="ประเภทผู้เสียภาษี">{taxpayerLabel(m.taxpayerType)}</Row>
            <Row label="เลขผู้เสียภาษี">{m.taxId && <span className="font-mono tabular-nums">{m.taxId}</span>}</Row>
            <Row label="รหัสสาขา">
              {m.taxBranch && <span className="font-mono tabular-nums">{m.taxBranch}
                {m.taxBranch === '00000' && <span className="text-slate-500 font-sans"> (สำนักงานใหญ่)</span>}</span>}
            </Row>
            <Row label="เอกสารที่ออกให้"><DocBadge docType={m.docType} /></Row>
            <Row label="หัก ณ ที่จ่าย">
              {wht ? <>{wht.label}{wht.rate > 0 && <span className="tabular-nums"> {wht.rate}%</span>}</> : null}
            </Row>
          </dl>
          {doc && (
            <p className="text-xs mt-3 leading-relaxed" style={{ color: doc.color }}>ซื้อจากร้านนี้ → {doc.effect}</p>
          )}
        </Panel>

        <Panel title="ค่าตั้งต้นเวลาแจ้งบิล">
          <dl>
            <Row label="หมวดค่าใช้จ่าย">
              {m.typicalCategoryName && <>{m.typicalCategoryName}
                {m.typicalSubCategoryName && <span className="text-slate-500"> › {m.typicalSubCategoryName}</span>}</>}
            </Row>
            <Row label="กระเป๋าเงิน">{m.typicalWalletName}</Row>
            <Row label="ซื้อประจำ">{m.keywords}</Row>
          </dl>
          <p className="text-xs text-slate-600 mt-3">เลือกร้านนี้ตอนแจ้งบิล แล้วหมวดกับกระเป๋าจะเติมให้อัตโนมัติ</p>
        </Panel>

        <Panel title="ยอดซื้อสะสม">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-100 tabular-nums">{thb(st.paidTotal)}</span>
            <span className="text-xs text-slate-500">จ่ายไปแล้ว</span>
          </div>
          <dl className="mt-2">
            <Row label="บิลทั้งหมด"><span className="tabular-nums">{st.billCount}</span> ใบ</Row>
            <Row label="รอจ่าย">
              <span className="tabular-nums">{st.pendingCount}</span> ใบ
              {st.pendingTotal > 0 && <span className="text-amber-400 tabular-nums"> · {thb(st.pendingTotal)}</span>}
            </Row>
            <Row label="จ่ายล่าสุด">{st.lastPaidAt ? fmtDate(st.lastPaidAt) : null}</Row>
          </dl>
          <Link to="/pending-bills"
            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-2 text-sm font-semibold transition-colors">
            <Plus className="w-4 h-4" />แจ้งบิลร้านนี้
          </Link>
        </Panel>
      </div>

      <div className="rounded-xl overflow-hidden" style={CARD}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid #1f2937' }}>
          <Receipt className="w-4 h-4 text-slate-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">ประวัติบิลร้านนี้</h3>
        </div>
        {bills.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">ยังไม่มีบิลของร้านนี้</p>
        ) : (
          <div className="divide-y" style={{ borderColor: '#1a2035' }}>
            {bills.map(b => {
              const [label, color] = BILL_STATUS[b.status] || [b.status, '#94a3b8']
              return (
                <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-200 truncate">{b.name}</p>
                    <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                      {fmtDate(b.createdAt)}{b.kind === 'goods_receipt' && ' · ใบรับของ'}
                    </p>
                  </div>
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color }}>{label}</span>
                  <span className="text-sm text-slate-200 tabular-nums text-right flex-shrink-0 w-24">{thb(b.amount)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <VendorItemsPanel vendorId={m.id} isAdmin={isAdmin} />

      {editing && <MerchantModal merchant={m} cats={cats} wallets={wallets} onClose={() => setEditing(false)} onDone={load} />}
    </div>
  )
}
