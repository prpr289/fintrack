import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { Plus, Pencil, Trash2, X, ChevronDown, ChevronRight, GripVertical, Tag, Layers } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── Styles ──────────────────────────────────────────────────────────────────
const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const INPUT = 'w-full rounded-lg px-3 py-2 text-sm text-slate-200 border border-slate-600 focus:outline-none focus:border-emerald-500 transition-colors'
const INPUT_STYLE = { background: '#0d1120' }
const COLORS = ['#1A7A4A','#0369A1','#6B7280','#7C3AED','#B45309','#BE185D','#C0392B','#9CA3AF','#D97706','#059669','#0891B2','#DC2626']
const EMPTY = { name: '', color: '#1A7A4A', type: 'both', parentId: '', groupName: '' }
const TYPE_LABEL = { both: 'ทั้งหมด', income: 'รายรับ', expense: 'รายจ่าย' }
const TYPE_COLOR = { both: '#64748b', income: '#34d399', expense: '#f87171' }
// Suggested groups for raw-material sub-categories (datalist hints; free-text still allowed)
const SUGGESTED_GROUPS = ['อาหารทะเล', 'เนื้อหมู', 'เนื้อไก่', 'เนื้อวัว', 'ของแห้ง', 'ผักสด', 'เครื่องปรุง', 'อุปกรณ์สิ้นเปลือง']

// Group sub-categories by groupName; named groups ordered by total usage desc, ungrouped ("อื่นๆ") pinned last.
function groupSubs(subs) {
  const map = new Map()
  for (const s of subs) {
    const key = s.groupName || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(s)
  }
  const byUsage = (a, b) => (b.usageCount || 0) - (a.usageCount || 0) || a.name.localeCompare(b.name, 'th')
  const groups = [...map.entries()].map(([name, items]) => ({
    name,
    items: items.slice().sort(byUsage),
    usage: items.reduce((sum, i) => sum + (i.usageCount || 0), 0),
  }))
  const named = groups.filter(g => g.name).sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name, 'th'))
  const ungrouped = groups.filter(g => !g.name)
  return [...named, ...ungrouped]
}

// ── Modal ────────────────────────────────────────────────────────────────────
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

// ── Sub-category row ─────────────────────────────────────────────────────────
function SubRow({ sub, isAdmin, onEdit, onDel }) {
  return (
    <div className="flex items-center gap-3 pl-10 pr-3 py-2.5 hover:bg-white/[0.02] transition-colors"
      style={{ borderBottom: '1px solid #1a2035' }}>
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sub.color }} />
      <span className="text-sm text-slate-300 flex-1 min-w-0 truncate">{sub.name}</span>
      {sub.usageCount > 0 && (
        <span className="text-[11px] text-slate-500 tabular-nums flex-shrink-0" title="จำนวนรายการที่ใช้หมวดนี้">
          {sub.usageCount} รายการ
        </span>
      )}
      <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
        style={{ color: TYPE_COLOR[sub.type], background: `${TYPE_COLOR[sub.type]}20` }}>
        {TYPE_LABEL[sub.type]}
      </span>
      {isAdmin && (
        <div className="flex gap-0.5 flex-shrink-0">
          <button onClick={() => onEdit(sub)} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={() => onDel(sub)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sortable Main category card ──────────────────────────────────────────────
function SortableMainCard({ cat, subs, isAdmin, isOpen, onToggle, onEdit, onDel, onAddSub, onEditSub, onDelSub }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })
  const outerStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 10 : undefined,
  }
  const [collapsed, setCollapsed] = useState({})
  const toggleGroup = (name) => setCollapsed(c => ({ ...c, [name]: !c[name] }))

  const groups = groupSubs(subs)
  const hasGroups = groups.some(g => g.name)

  return (
    <div ref={setNodeRef} className="rounded-xl overflow-hidden" style={{ ...outerStyle, ...CARD }}>
      {/* Main row */}
      <div className="flex items-center gap-2 px-3 py-3.5">
        <button {...attributes} {...listeners}
          className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing touch-none flex-shrink-0 p-0.5"
          title="ลากเพื่อเรียงหมวดหลัก">
          <GripVertical className="w-4 h-4" />
        </button>

        <button onClick={() => onToggle(cat.id)}
          className="text-slate-500 hover:text-slate-300 transition-colors w-5 flex-shrink-0">
          {subs.length > 0
            ? (isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)
            : <span className="w-4 h-4 block" />}
        </button>

        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
        <span className="font-semibold text-slate-200 flex-1 min-w-0 truncate">{cat.name}</span>

        <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ color: TYPE_COLOR[cat.type], background: `${TYPE_COLOR[cat.type]}20` }}>
          {TYPE_LABEL[cat.type]}
        </span>

        {subs.length > 0 && (
          <span className="text-xs text-slate-500 px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: '#1f2937' }}>
            {subs.length} ย่อย
          </span>
        )}

        {isAdmin && (
          <div className="flex gap-1 ml-1 flex-shrink-0">
            <button onClick={() => onAddSub(cat.id)}
              className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" title="เพิ่มหมวดย่อย">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onEdit(cat)} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDel(cat)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Sub-categories — grouped, usage-sorted, collapsible */}
      {isOpen && (
        <div style={{ borderTop: '1px solid #1f2937', background: '#111827' }}>
          {subs.length > 0 ? (
            groups.map(g => {
              const isCollapsed = !!collapsed[g.name]
              return (
                <div key={g.name || '__none'}>
                  {hasGroups && (
                    <button onClick={() => toggleGroup(g.name)}
                      className="w-full flex items-center gap-2 pl-6 pr-3 py-2 hover:bg-white/[0.03] transition-colors"
                      style={{ background: '#0d1322', borderBottom: '1px solid #1a2035' }}>
                      {isCollapsed
                        ? <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                        : <ChevronDown className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />}
                      <Layers className="w-3 h-3 flex-shrink-0" style={{ color: g.name ? '#10b981' : '#64748b' }} />
                      <span className="text-xs font-semibold tracking-wide flex-1 text-left truncate"
                        style={{ color: g.name ? '#a7f3d0' : '#94a3b8' }}>
                        {g.name || 'อื่นๆ'}
                      </span>
                      <span className="text-[11px] text-slate-600 flex-shrink-0">{g.items.length} หมวด</span>
                      {g.usage > 0 && <span className="text-[11px] text-slate-500 tabular-nums flex-shrink-0">· {g.usage} รายการ</span>}
                    </button>
                  )}
                  {!isCollapsed && g.items.map(s => (
                    <SubRow key={s.id} sub={s} isAdmin={isAdmin} onEdit={onEditSub} onDel={onDelSub} />
                  ))}
                </div>
              )
            })
          ) : isAdmin ? (
            <button onClick={() => onAddSub(cat.id)}
              className="w-full text-left pl-12 pr-4 py-2.5 text-xs text-slate-600 hover:text-emerald-400 transition-colors flex items-center gap-2">
              <Plus className="w-3 h-3" /> เพิ่มหมวดย่อย
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Categories() {
  const { user } = useAuth()
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState({})
  const [savingOrder, setSavingOrder] = useState(false)

  const isAdmin = user?.role === 'admin'

  const load = useCallback(async () => {
    const d = await api.categories()
    const list = d.categories || []
    setCats(list)
    const exp = {}
    list.forEach(c => { if (c.parentId) exp[c.parentId] = true })
    setExpanded(exp)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Derived ────────────────────────────────────────────────────────────────
  const mainCats = cats.filter(c => !c.parentId)
  const subCatsOf = (parentId) => cats.filter(c => c.parentId === parentId)
  const groupOptions = [...new Set([
    ...cats.filter(c => c.parentId && c.groupName).map(c => c.groupName),
    ...SUGGESTED_GROUPS,
  ])]

  // ── Drag sensors (main categories only) ──────────────────────────────────────
  const mainSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const persistOrder = async (items) => {
    setSavingOrder(true)
    try {
      await Promise.all(
        items.map((item, idx) => api.updateCategory(item.id, { sortOrder: idx }))
      )
    } finally {
      setSavingOrder(false)
    }
  }

  const handleMainDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = mainCats.findIndex(c => c.id === active.id)
    const newIdx = mainCats.findIndex(c => c.id === over.id)
    const reordered = arrayMove(mainCats, oldIdx, newIdx)
    // Optimistic update
    setCats(prev => {
      const subs = prev.filter(c => c.parentId)
      return [...reordered, ...subs]
    })
    await persistOrder(reordered)
  }

  // ── Category form ──────────────────────────────────────────────────────────
  const toggleExpand = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  const openCreate = (parentId = '') => {
    setEditing(null); setForm({ ...EMPTY, parentId }); setErr(''); setShowForm(true)
  }
  const openEdit = (c) => {
    setEditing(c)
    setForm({ name: c.name, color: c.color || '#1A7A4A', type: c.type, parentId: c.parentId || '', groupName: c.groupName || '' })
    setErr(''); setShowForm(true)
  }

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setErr('')
    try {
      const body = { ...form }
      body.groupName = form.parentId ? (form.groupName.trim() || null) : null
      if (!body.parentId) delete body.parentId
      if (editing) await api.updateCategory(editing.id, body)
      else await api.createCategory(body)
      setShowForm(false); load()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const del = async (c) => {
    const hasSub = subCatsOf(c.id).length > 0
    if (!confirm(hasSub ? `ลบ "${c.name}" และหมวดย่อยทั้งหมด?` : `ลบ "${c.name}"?`)) return
    try { await api.deleteCategory(c.id); load() } catch (e) { alert(e.message) }
  }

  if (loading) return (
    <div className="p-6 flex items-center gap-2 text-slate-500">
      <div className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      กำลังโหลด...
    </div>
  )

  return (
    <div className="categories-page p-5 space-y-4">
      <style>{`
        .categories-page button:focus-visible, .categories-page input:focus-visible, .categories-page select:focus-visible {
          outline: 2px solid rgba(16,185,129,0.55); outline-offset: 2px; border-radius: 0.5rem;
        }
        @media (prefers-reduced-motion: reduce) {
          .categories-page *, .categories-page *::before, .categories-page *::after {
            animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
          }
        }
      `}</style>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-900/30"
            style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            <Tag className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white leading-tight">หมวดหมู่</h2>
            <p className="text-sm text-slate-500">
              {mainCats.length} หมวดหลัก · {cats.length - mainCats.length} หมวดย่อย · เรียงกลุ่มตามการใช้งานอัตโนมัติ
              {savingOrder && <span className="ml-2 text-emerald-400">กำลังบันทึกลำดับ...</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <p className="text-xs text-slate-600 hidden sm:block">
              <GripVertical className="w-3 h-3 inline mr-1" />ลากเพื่อเรียงหมวดหลัก
            </p>
          )}
          {isAdmin && (
            <button onClick={() => openCreate()}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> เพิ่มหมวดหมู่
            </button>
          )}
        </div>
      </div>

      {/* Main categories — sortable */}
      <DndContext sensors={mainSensors} collisionDetection={closestCenter} onDragEnd={handleMainDragEnd}>
        <SortableContext items={mainCats.map(c => c.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {mainCats.map(cat => (
              <SortableMainCard
                key={cat.id}
                cat={cat}
                subs={subCatsOf(cat.id)}
                isAdmin={isAdmin}
                isOpen={!!expanded[cat.id]}
                onToggle={toggleExpand}
                onEdit={openEdit}
                onDel={del}
                onAddSub={openCreate}
                onEditSub={openEdit}
                onDelSub={del}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Form modal */}
      {showForm && (
        <Modal
          title={editing ? 'แก้ไขหมวดหมู่' : (form.parentId ? `เพิ่มหมวดย่อย — ${cats.find(c => c.id === form.parentId)?.name}` : 'เพิ่มหมวดหมู่หลัก')}
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">ชื่อหมวดหมู่</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className={INPUT} style={INPUT_STYLE} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">ประเภท</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                <option value="both">ทั้งหมด</option>
                <option value="income">รายรับ</option>
                <option value="expense">รายจ่าย</option>
              </select>
            </div>
            {form.parentId && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">กลุ่ม / ประเภท (ไม่บังคับ)</label>
                <input list="cat-group-options" value={form.groupName}
                  onChange={e => setForm(f => ({ ...f, groupName: e.target.value }))}
                  className={INPUT} style={INPUT_STYLE} placeholder="เช่น อาหารทะเล, เนื้อหมู, ของแห้ง" />
                <datalist id="cat-group-options">
                  {groupOptions.map(g => <option key={g} value={g} />)}
                </datalist>
                <p className="text-[11px] text-slate-600 mt-1">จัดหมวดย่อยให้อยู่กลุ่มเดียวกัน · เลือกจากที่มี หรือพิมพ์ใหม่</p>
              </div>
            )}
            {!form.parentId && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">สังกัดหมวดหลัก (เว้นว่าง = หมวดหลัก)</label>
                <select value={form.parentId} onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))} className={INPUT} style={INPUT_STYLE}>
                  <option value="">— หมวดหลัก —</option>
                  {mainCats.filter(c => !editing || c.id !== editing.id).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">สี</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
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
    </div>
  )
}
