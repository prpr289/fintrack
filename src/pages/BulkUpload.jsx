import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { today } from '../fmt'
import { useAuth } from '../AuthContext'
import { UploadCloud, Loader2, X, FileText, AlertTriangle, Check, Printer, ExternalLink, Sparkles } from 'lucide-react'

const INPUT = 'w-full rounded-lg px-2.5 py-1.5 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }
const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const OCR_CONCURRENCY = 4

let rowSeq = 0

// Run async `worker` over `items` with a bounded number of parallel tasks.
async function runPool(items, limit, worker) {
  let i = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      await worker(items[idx], idx)
    }
  })
  await Promise.all(runners)
}

function buildTxName(row) {
  const r = (row.recipientName || '').trim()
  if (!r) return row.slipType === 'receipt' ? 'ใบเสร็จ' : 'รายการโอนเงิน'
  if (row.type === 'income') return `รับจาก ${r}`
  if (row.slipType === 'receipt') return r
  return `โอนให้ ${r}`
}

function voucherData(row) {
  return {
    id: row.txId, n: row.recipientName || '', amt: Number(row.amount) || 0,
    d: row.date, b: row.bank || '', r: row.reference || '',
    si: row.slipId || '', ty: row.type, mo: row.note || '',
  }
}

function Label({ children }) {
  return <label className="block text-[0.7rem] font-medium text-slate-400 mb-0.5">{children}</label>
}

const SLIP_BADGE = {
  transfer: { text: 'สลิปโอนเงิน', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/20' },
  receipt: { text: 'ใบเสร็จ/ใบกำกับ', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/20' },
  other: { text: 'อื่นๆ', cls: 'bg-slate-600/30 text-slate-300 border-slate-600/30' },
}
const SOURCE_LABEL = {
  vendor_profile: 'จาก Vendor ที่จำ',
  'vendor_profile+history': 'Vendor + ประวัติ',
  history: 'จากประวัติ',
}

export default function BulkUpload() {
  const { user } = useAuth()
  const canWrite = user?.role === 'admin' || user?.role === 'staff'

  const [phase, setPhase] = useState('upload') // upload | review | done
  const [rows, setRows] = useState([])
  const [cats, setCats] = useState([])
  const [wallets, setWallets] = useState([])
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    Promise.all([api.categories(), api.wallets()])
      .then(([cd, wd]) => { setCats(cd.categories || []); setWallets(wd.wallets || []) })
      .catch(() => {})
  }, [])

  const mainCats = cats.filter(c => !c.parentId)
  const subCatsOf = (pid) => cats.filter(c => c.parentId === pid)

  const updateRow = (key, patch) =>
    setRows(rs => rs.map(r => r.id === key ? { ...r, ...patch } : r))
  const removeRow = (key) =>
    setRows(rs => rs.filter(r => r.id !== key))

  // Duplicate signatures within the batch (amount + date + recipient)
  const dupSig = (r) => `${Number(r.amount) || 0}|${r.date}|${(r.recipientName || '').trim().toLowerCase()}`
  const sigCount = {}
  rows.forEach(r => { if (r.amount && r.recipientName) sigCount[dupSig(r)] = (sigCount[dupSig(r)] || 0) + 1 })

  const analyzeRow = async (row) => {
    updateRow(row.id, { status: 'analyzing' })
    try {
      const a = await api.ocrSlip(row.file)
      if (!a.isSlip) {
        updateRow(row.id, {
          status: 'ready', isSlip: false, slipType: 'other',
          type: 'expense', scope: 'business', amount: '', date: today(),
          recipientName: '', bank: '', reference: '', note: '',
          categoryId: '', subCategoryId: '', walletId: '', source: null,
        })
        return
      }
      const s = a.suggest || {}, o = a.ocr || {}
      updateRow(row.id, {
        status: 'ready', isSlip: true, slipType: a.slipType || 'transfer',
        type: 'expense', scope: 'business',
        amount: o.amount || '', date: o.date || today(),
        recipientName: o.recipientName || '', bank: o.bank || '', reference: o.reference || '',
        note: '',
        vendorId: s.vendorId || '', taxId: s.taxId || o.taxId || '',
        categoryId: s.categoryId || '', subCategoryId: s.subCategoryId || '',
        walletId: s.walletId || '', source: s.source || null,
      })
    } catch (e) {
      updateRow(row.id, {
        status: 'ready', isSlip: false, slipType: 'other', error: e.message,
        type: 'expense', scope: 'business', amount: '', date: today(),
        recipientName: '', bank: '', reference: '', note: '',
        categoryId: '', subCategoryId: '', walletId: '', source: null,
      })
    }
  }

  const addFiles = (fileList) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    if (!files.length) return
    const newRows = files.map(f => ({
      id: `r${++rowSeq}`, file: f, fileName: f.name,
      previewUrl: URL.createObjectURL(f), status: 'pending',
    }))
    setRows(rs => [...rs, ...newRows])
    setPhase('review')
    runPool(newRows, OCR_CONCURRENCY, analyzeRow)
  }

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
  }

  // A row is savable if it has a positive amount and a valid date.
  const isValid = (r) => Number(r.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date || '')
  const analyzing = rows.some(r => r.status === 'analyzing' || r.status === 'pending')
  const savableRows = rows.filter(r => (r.status === 'ready') && isValid(r))

  const confirmAll = async () => {
    if (!savableRows.length) return
    setSaving(true)
    // Sequential to keep wallet-balance updates consistent.
    for (const row of savableRows) {
      updateRow(row.id, { status: 'saving', error: null })
      try {
        const body = {
          name: buildTxName(row), amount: Number(row.amount), type: row.type,
          scope: row.scope || 'business', date: row.date,
        }
        if (row.walletId) body.walletId = row.walletId
        if (row.categoryId) body.categoryId = row.categoryId
        if (row.subCategoryId) body.subCategoryId = row.subCategoryId
        if (row.note) body.note = row.note
        else if (row.reference) body.note = `อ้างอิง: ${row.reference}`

        const res = await api.createTransaction(body)
        const txId = res?.transaction?.id
        if (!txId) throw new Error('สร้างรายการไม่สำเร็จ')

        let slipId = ''
        try {
          const up = await api.uploadSlip(txId, row.file, row.slipType === 'receipt' ? 'receipt' : 'transfer')
          slipId = up?.slip?.id || ''
        } catch (e) { console.error('uploadSlip:', e) }

        // Transfer vendors aren't learned server-side on upload — learn here with
        // the user-confirmed category/wallet. Receipts are learned by the server.
        if (row.slipType !== 'receipt' && (row.recipientName || '').trim()) {
          try {
            await api.learnVendor({
              vendorName: row.recipientName.trim(),
              categoryId: row.categoryId || '', subCategoryId: row.subCategoryId || '',
              walletId: row.walletId || '', taxId: row.taxId || '',
            })
          } catch (e) { console.error('learnVendor:', e) }
        }

        updateRow(row.id, { status: 'saved', txId, slipId })
      } catch (e) {
        updateRow(row.id, { status: 'failed', error: e.message })
      }
    }
    setSaving(false)
    setPhase('done')
  }

  const printAll = () => {
    const arr = rows.filter(r => r.status === 'saved').map(voucherData)
    if (!arr.length) return
    window.open(`/vouchers/print?d=${encodeURIComponent(JSON.stringify(arr))}`, '_blank')
  }
  const openOne = (row) =>
    window.open(`/voucher?d=${encodeURIComponent(JSON.stringify(voucherData(row)))}`, '_blank')

  if (!canWrite) {
    return <div className="p-8 text-center text-slate-500">ต้องเป็น admin หรือ staff จึงจะใช้งานได้</div>
  }

  const savedCount = rows.filter(r => r.status === 'saved').length
  const failedCount = rows.filter(r => r.status === 'failed').length

  return (
    <div className="p-4 sm:p-5 space-y-4 max-w-5xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" /> อัปโหลดสลิปหลายใบ → ใบสำคัญจ่าย
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          ลากสลิปหลายใบมาวาง ระบบอ่าน OCR + จับคู่ Vendor ให้อัตโนมัติ · ตรวจแล้วยืนยันทีเดียว · ใช้ได้บนเว็บเท่านั้น
        </p>
      </div>

      {/* Dropzone */}
      {phase !== 'done' && (
        <div
          role="button"
          tabIndex={0}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
          className={`rounded-2xl py-8 px-4 text-center cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 ${dragOver ? 'bg-emerald-500/10' : 'hover:bg-white/[0.02]'}`}
          style={{ border: `2px dashed ${dragOver ? '#10b981' : '#2e3349'}` }}
        >
          <UploadCloud className="w-9 h-9 mx-auto mb-2 text-slate-500" />
          <p className="text-sm text-slate-300 font-medium">ลากสลิปมาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
          <p className="text-xs text-slate-400 mt-1">รูปภาพ (JPG, PNG, HEIC) · หลายไฟล์พร้อมกันได้ · สูงสุด 10MB/ไฟล์</p>
          <input ref={fileRef} type="file" multiple accept="image/*" className="hidden"
            onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
        </div>
      )}

      {/* Review summary bar */}
      {rows.length > 0 && phase !== 'done' && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl px-4 py-3" style={CARD}>
          <div className="text-sm text-slate-400">
            {analyzing
              ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-emerald-400" /> กำลังอ่านสลิป {rows.filter(r => r.status === 'ready' || r.status === 'saved').length}/{rows.length}...</span>
              : <>พร้อมบันทึก <span className="text-emerald-400 font-semibold">{savableRows.length}</span> / {rows.length} รายการ</>}
          </div>
          <button onClick={confirmAll} disabled={saving || analyzing || !savableRows.length}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-5 py-2 text-sm font-semibold transition-colors flex items-center gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> กำลังบันทึก...</> : <><Check className="w-4 h-4" /> ยืนยันทั้งหมด ({savableRows.length})</>}
          </button>
        </div>
      )}

      {/* Done summary */}
      {phase === 'done' && (
        <div className="rounded-xl p-5 space-y-3" style={CARD}>
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <Check className="w-5 h-5" /> บันทึกสำเร็จ {savedCount} รายการ
            {failedCount > 0 && <span className="text-red-400">· ล้มเหลว {failedCount}</span>}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={printAll} disabled={!savedCount}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-2">
              <Printer className="w-4 h-4" /> พิมพ์ใบสำคัญจ่ายทั้งหมด ({savedCount})
            </button>
            <button onClick={() => { setRows([]); setPhase('upload') }}
              className="border border-slate-600 text-slate-300 hover:bg-white/5 rounded-lg px-4 py-2 text-sm font-semibold">
              อัปโหลดชุดใหม่
            </button>
          </div>
        </div>
      )}

      {/* Rows */}
      <div className="space-y-3">
        {rows.map(row => {
          const dup = row.amount && row.recipientName && sigCount[dupSig(row)] > 1
          const slipBadge = SLIP_BADGE[row.slipType] || SLIP_BADGE.other
          const busy = row.status === 'analyzing' || row.status === 'pending'
          return (
            <div key={row.id} className="rounded-xl overflow-hidden" style={CARD}>
              <div className="flex gap-3 p-3">
                {/* Thumbnail */}
                <div className="flex-shrink-0">
                  <img src={row.previewUrl} alt={row.fileName}
                    className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border border-slate-700" />
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Top row: status + filename + actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[0.68rem] px-1.5 py-0.5 rounded border ${slipBadge.cls}`}>{slipBadge.text}</span>
                    {row.source && <span className="text-[0.68rem] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">{SOURCE_LABEL[row.source] || row.source}</span>}
                    {dup && <span className="text-[0.68rem] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/20 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> อาจซ้ำ</span>}
                    <span className="text-xs text-slate-400 truncate flex-1 min-w-0">{row.fileName}</span>
                    {row.status === 'saved' && <span className="text-xs text-emerald-400 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> บันทึกแล้ว</span>}
                    {row.status === 'failed' && <span className="text-xs text-red-400">ล้มเหลว</span>}
                    {row.status !== 'saved' && row.status !== 'saving' && phase !== 'done' && (
                      <button aria-label="ลบสลิปนี้" title="ลบสลิปนี้" onClick={() => { if (row.status === 'ready' && !window.confirm('ลบแถวนี้?')) return; removeRow(row.id) }} className="text-slate-500 hover:text-red-400 p-2 -m-1"><X className="w-4 h-4" /></button>
                    )}
                    {row.status === 'saved' && (
                      <button onClick={() => openOne(row)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" /> เปิดใบ</button>
                    )}
                  </div>

                  {busy ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-400" /> กำลังอ่าน...
                    </div>
                  ) : (
                    <>
                      {row.error && <p className="text-xs text-amber-400">⚠️ {row.error} — กรอกข้อมูลเองด้านล่าง</p>}
                      {/* Editable fields */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <Label>ประเภท</Label>
                          <select value={row.type} onChange={e => updateRow(row.id, { type: e.target.value })} className={INPUT} style={INPUT_STYLE} disabled={row.status === 'saved'}>
                            <option value="expense">รายจ่าย (PV)</option>
                            <option value="income">รายรับ (RV)</option>
                          </select>
                        </div>
                        <div>
                          <Label>ยอดเงิน (บาท)</Label>
                          <input type="number" min="0.01" step="0.01" value={row.amount}
                            onChange={e => updateRow(row.id, { amount: e.target.value })}
                            className={INPUT} style={INPUT_STYLE} disabled={row.status === 'saved'} placeholder="0.00" />
                        </div>
                        <div>
                          <Label>วันที่</Label>
                          <input type="date" value={row.date || ''} onChange={e => updateRow(row.id, { date: e.target.value })}
                            className={INPUT} style={INPUT_STYLE} disabled={row.status === 'saved'} />
                        </div>
                        <div>
                          <Label>กระเป๋าเงิน</Label>
                          <select value={row.walletId || ''} onChange={e => updateRow(row.id, { walletId: e.target.value })} className={INPUT} style={INPUT_STYLE} disabled={row.status === 'saved'}>
                            <option value="">อัตโนมัติ</option>
                            {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <Label>{row.type === 'income' ? 'รับจาก' : 'จ่ายให้ / ร้านค้า'}</Label>
                          <input value={row.recipientName || ''} onChange={e => updateRow(row.id, { recipientName: e.target.value })}
                            className={INPUT} style={INPUT_STYLE} disabled={row.status === 'saved'} placeholder="ชื่อผู้รับ/ร้านค้า" />
                        </div>
                        <div>
                          <Label>หมวดหมู่</Label>
                          <select value={row.categoryId || ''} onChange={e => updateRow(row.id, { categoryId: e.target.value, subCategoryId: '' })} className={INPUT} style={INPUT_STYLE} disabled={row.status === 'saved'}>
                            <option value="">— ไม่ระบุ —</option>
                            {mainCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <Label>หมวดย่อย</Label>
                          <select value={row.subCategoryId || ''} onChange={e => updateRow(row.id, { subCategoryId: e.target.value })} className={INPUT} style={INPUT_STYLE}
                            disabled={row.status === 'saved' || !row.categoryId || subCatsOf(row.categoryId).length === 0}>
                            <option value="">— ไม่ระบุ —</option>
                            {row.categoryId && subCatsOf(row.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2 sm:col-span-4">
                          <Label>เลขอ้างอิง / หมายเหตุ</Label>
                          <input value={row.reference || ''} onChange={e => updateRow(row.id, { reference: e.target.value })}
                            className={INPUT} style={INPUT_STYLE} disabled={row.status === 'saved'} placeholder="เลขอ้างอิงจากสลิป" />
                        </div>
                      </div>
                      {!isValid(row) && row.status === 'ready' && (
                        <p className="text-xs text-amber-500">ต้องมียอดเงิน &gt; 0 และวันที่ถูกต้องจึงจะบันทึกได้</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {rows.length === 0 && phase === 'upload' && (
          <div className="text-center text-slate-600 text-sm py-8 flex flex-col items-center gap-2">
            <FileText className="w-8 h-8 opacity-40" />
            ยังไม่มีสลิป — ลากไฟล์มาวางด้านบนเพื่อเริ่ม
          </div>
        )}
      </div>
    </div>
  )
}
