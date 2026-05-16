import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const CARD = { background: '#161b2e', border: '1px solid #1f2937' }
const PAGE_SIZE = 50

const ACTION_COLOR = { create: '#34d399', update: '#60a5fa', delete: '#f87171', transfer: '#c084fc', update_password: '#f59e0b' }
const ACTION_LABEL = { create: 'สร้าง', update: 'แก้ไข', delete: 'ลบ', transfer: 'โอนเงิน', update_password: 'เปลี่ยนรหัส' }
const ENTITY_LABEL = { transaction: 'ธุรกรรม', user: 'ผู้ใช้', wallet: 'กระเป๋า', category: 'หมวดหมู่' }

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.auditLog({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      setLogs(data.logs || [])
      setTotal(data.total || 0)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { load() }, [load])

  const fmtDate = (s) => {
    if (!s) return '-'
    return new Date(s).toLocaleString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">ประวัติการใช้งาน</h2>
        <p className="text-sm text-slate-500 mt-0.5">บันทึกการกระทำทั้งหมดในระบบ · รวม {total} รายการ</p>
      </div>

      <div className="rounded-xl overflow-hidden" style={CARD}>
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-5 h-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mx-auto" />
          </div>
        ) : logs.length === 0 ? (
          <p className="p-8 text-center text-slate-500 text-sm">ยังไม่มีบันทึกการใช้งาน</p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y" style={{ borderColor: '#1a2035' }}>
              {logs.map(l => (
                <div key={l.id} className="p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-200 text-sm">{l.userName}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        color: ACTION_COLOR[l.action] || '#94a3b8',
                        background: `${ACTION_COLOR[l.action] || '#94a3b8'}18`,
                      }}>
                      {ACTION_LABEL[l.action] || l.action}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{ENTITY_LABEL[l.entityType] || l.entityType}</span>
                    <span className="text-slate-700">·</span>
                    <span className="text-xs text-slate-600 font-mono truncate flex-1">{l.entityId}</span>
                  </div>
                  <p className="text-xs text-slate-500">{fmtDate(l.createdAt)}</p>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #1f2937', background: '#111827' }}>
                    {['วันเวลา', 'ผู้ใช้', 'การกระทำ', 'ประเภท', 'รหัสอ้างอิง'].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l, i) => (
                    <tr key={l.id} className="hover:bg-white/[0.02] transition-colors"
                      style={{ borderBottom: i < logs.length - 1 ? '1px solid #1a2035' : 'none' }}>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{fmtDate(l.createdAt)}</td>
                      <td className="px-4 py-3 text-slate-300 font-medium">{l.userName}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            color: ACTION_COLOR[l.action] || '#94a3b8',
                            background: `${ACTION_COLOR[l.action] || '#94a3b8'}18`,
                          }}>
                          {ACTION_LABEL[l.action] || l.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{ENTITY_LABEL[l.entityType] || l.entityType}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-mono truncate max-w-36">{l.entityId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs sm:text-sm text-slate-500">
            {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} จาก {total}
          </p>
          <div className="flex items-center gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-400 hover:text-white disabled:opacity-30 rounded-lg transition-colors"
              style={{ border: '1px solid #2e3349', background: '#161b2e' }}>
              <ChevronLeft className="w-4 h-4" /><span className="hidden sm:inline">ก่อนหน้า</span>
            </button>
            <span className="text-sm text-slate-500">{page}/{totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-400 hover:text-white disabled:opacity-30 rounded-lg transition-colors"
              style={{ border: '1px solid #2e3349', background: '#161b2e' }}>
              <span className="hidden sm:inline">ถัดไป</span><ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
