import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { Search, Pencil, Trash2, X, Store, Loader2 } from 'lucide-react'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }

function Label({ children }) {
  return <label className="block text-xs font-medium text-slate-400 mb-1">{children}</label>
}

function EditModal({ vendor, cats, wallets, onClose, onDone }) {
  const mainCats = cats.filter(c => !c.parentId)
  const subCatsOf = (pid) => cats.filter(c => c.parentId === pid)
  const [form, setForm] = useState({
    vendorName: vendor.vendorName || '',
    taxId: vendor.taxId || '',
    address: vendor.address || '',
    phone: vendor.phone || '',
    categoryId: vendor.typicalCategoryId || '',
    subCategoryId: vendor.typicalSubCategoryId || '',
    walletId: vendor.typicalWalletId || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async (e) => {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      await api.updateVendor(vendor.id, {
        vendorName: form.vendorName.trim(),
        taxId: form.taxId,
        address: form.address,
        phone: form.phone,
        categoryId: form.categoryId,
        subCategoryId: form.categoryId ? form.subCategoryId : '',
        walletId: form.walletId,
      })
      onDone(); onClose()
    } catch (e) { setErr(e.message); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="w-full sm:max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
        style={{ background: '#161b2e', border: '1px solid #2e3349' }}>
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
          <h3 className="font-semibold text-slate-200">แก้ไข Vendor</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={save} className="p-5 space-y-3 overflow-y-auto">
          <div>
            <Label>ชื่อ Vendor / ผู้รับเงิน</Label>
            <input value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} required className={INPUT} style={INPUT_STYLE} />
            <p className="text-xs text-slate-500 mt-1">บอทใช้ชื่อนี้จับคู่สลิป — แก้ให้ตรงกับที่อ่านจากสลิป</p>
          </div>
          <div>
            <Label>หมวดหมู่หลัก</Label>
            <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value, subCategoryId: '' }))} className={INPUT} style={INPUT_STYLE}>
              <option value="">— ไม่ระบุ —</option>
              {mainCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {form.categoryId && subCatsOf(form.categoryId).length > 0 && (
            <div>
              <Label>หมวดย่อย</Label>
              <select value={form.subCategoryId} onChange={e => setForm(f => ({ ...f, subCategoryId: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                <option value="">— ไม่ระบุ —</option>
                {subCatsOf(form.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <Label>กระเป๋าเงินที่ใช้ประจำ</Label>
            <select value={form.walletId} onChange={e => setForm(f => ({ ...f, walletId: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
              <option value="">— ไม่ระบุ —</option>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>เลขผู้เสียภาษี</Label>
              <input value={form.taxId} onChange={e => setForm(f => ({ ...f, taxId: e.target.value }))} className={INPUT} style={INPUT_STYLE} />
            </div>
            <div>
              <Label>เบอร์โทร</Label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={INPUT} style={INPUT_STYLE} />
            </div>
          </div>
          <div>
            <Label>ที่อยู่</Label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={INPUT} style={INPUT_STYLE} />
          </div>
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button type="submit" disabled={saving}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function Vendors() {
  const [vendors, setVendors] = useState([])
  const [cats, setCats] = useState([])
  const [wallets, setWallets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [vd, cd, wd] = await Promise.all([
        api.vendorProfiles(debounced),
        api.categories(),
        api.wallets(),
      ])
      setVendors(vd.vendors || [])
      setCats(cd.categories || [])
      setWallets(wd.wallets || [])
    } finally { setLoading(false) }
  }, [debounced])

  useEffect(() => { load() }, [load])

  const del = async (v) => {
    if (!confirm(`ลบ vendor "${v.vendorName}"? บอทจะลืมการจับคู่นี้`)) return
    await api.deleteVendor(v.id)
    load()
  }

  const fmtDate = (s) => s ? new Date(s).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'

  return (
    <div className="vendors-page p-4 sm:p-5 space-y-4">
      <style>{`
        .vendors-page button:focus-visible, .vendors-page input:focus-visible, .vendors-page select:focus-visible {
          outline: 2px solid rgba(16,185,129,0.55); outline-offset: 2px; border-radius: 0.5rem;
        }
        @media (prefers-reduced-motion: reduce) {
          .vendors-page *, .vendors-page *::before, .vendors-page *::after {
            animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
          }
        }
      `}</style>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-900/30"
          style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
          <Store className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-white leading-tight">Vendor ที่ AI จำ</h2>
          <p className="text-sm text-slate-500 mt-0.5">ชื่อผู้รับเงิน → หมวด/กระเป๋าที่บอทเติมให้อัตโนมัติ · แก้/ลบได้ที่นี่</p>
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ vendor..."
          className="w-full rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 border border-slate-700 focus:outline-none focus:border-emerald-500"
          style={{ background: '#0d1120' }} />
      </div>

      <div className="rounded-xl overflow-hidden" style={CARD}>
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-5 h-5 text-emerald-500 animate-spin mx-auto" /></div>
        ) : vendors.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-1" style={{ background: '#0d1120', border: '1px solid #2e3349' }}>
              <Store className="w-6 h-6 text-slate-600" />
            </div>
            <p className="text-slate-300 text-sm font-medium">{debounced ? 'ไม่พบ vendor ที่ค้นหา' : 'ยังไม่มี vendor ที่จำไว้'}</p>
            {!debounced && <p className="text-slate-600 text-xs">บอทจะเริ่มจำเมื่อมีการบันทึกสลิป</p>}
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y" style={{ borderColor: '#1a2035' }}>
              {vendors.map(v => (
                <div key={v.id} className="p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-200 text-sm flex-1">{v.vendorName}</p>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => setEditing(v)} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => del(v)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>{v.typicalCategoryName || '— ไม่ระบุหมวด —'}{v.typicalSubCategoryName && <span className="text-slate-600"> › {v.typicalSubCategoryName}</span>}</span>
                    {v.typicalWalletName && <span>· {v.typicalWalletName}</span>}
                    <span>· เจอ <span className="tabular-nums">{v.occurrenceCount || 0}</span> ครั้ง</span>
                    <span>· ล่าสุด {fmtDate(v.lastSeen)}</span>
                  </div>
                  {v.taxId && <p className="text-xs text-slate-600 font-mono">เลขภาษี {v.taxId}</p>}
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #1f2937', background: '#111827' }}>
                    {['Vendor', 'หมวดหมู่', 'กระเป๋า', 'เจอ', 'ล่าสุด', ''].map((h, i) => (
                      <th key={i} className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${i >= 3 ? 'text-center' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((v, i) => (
                    <tr key={v.id} className="hover:bg-white/[0.02]" style={{ borderBottom: i < vendors.length - 1 ? '1px solid #1a2035' : 'none' }}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-200">{v.vendorName}</p>
                        {v.taxId && <p className="text-xs text-slate-600 font-mono">เลขภาษี {v.taxId}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {v.typicalCategoryName || <span className="text-slate-600">— ไม่ระบุ —</span>}
                        {v.typicalSubCategoryName && <span className="text-xs text-slate-600 ml-1">› {v.typicalSubCategoryName}</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{v.typicalWalletName || <span className="text-slate-600">—</span>}</td>
                      <td className="px-4 py-3 text-center text-slate-400 tabular-nums">{v.occurrenceCount || 0}</td>
                      <td className="px-4 py-3 text-center text-slate-500 whitespace-nowrap text-xs">{fmtDate(v.lastSeen)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setEditing(v)} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => del(v)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {editing && <EditModal vendor={editing} cats={cats} wallets={wallets} onClose={() => setEditing(null)} onDone={load} />}
    </div>
  )
}
