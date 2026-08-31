import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { getPageItems, getPagination } from '../pagination'

const DEFAULT_PAGE_SIZE_OPTIONS = [25, 50, 100, 200]

export default function PaginationBar({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  ariaLabel = 'แบ่งหน้ารายการ',
  announce = false,
  disabled = false,
  className = '',
}) {
  const pagination = getPagination({ total, page, pageSize })
  const pageItems = getPageItems(pagination)

  if (pagination.total === 0) return null

  const goToPage = nextPage => {
    if (disabled) return
    const safeNextPage = Math.min(Math.max(1, nextPage), Math.max(1, pagination.totalPages))
    if (safeNextPage !== pagination.page) onPageChange(safeNextPage)
  }

  const iconButtonClass = 'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.08] text-slate-400 transition-colors hover:border-emerald-400/30 hover:bg-emerald-400/[0.08] hover:text-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/70 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-white/[0.08] disabled:hover:bg-transparent disabled:hover:text-slate-400'

  return (
    <div className={`flex flex-col gap-3 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between ${className}`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <p
          className="text-xs text-slate-500 sm:text-[13px]"
          role={announce ? 'status' : undefined}
          aria-live={announce ? 'polite' : undefined}
        >
          แสดง <span className="font-mono tabular-nums text-slate-300">{pagination.startRow.toLocaleString('th-TH')}–{pagination.endRow.toLocaleString('th-TH')}</span>
          {' '}จาก <span className="font-mono tabular-nums text-emerald-300">{pagination.total.toLocaleString('th-TH')}</span> รายการ
        </p>

        <label className="flex min-h-11 items-center gap-2 text-xs text-slate-500 sm:text-[13px]">
          <span className="whitespace-nowrap">แสดงต่อหน้า</span>
          <span className="relative">
            <select
              value={pagination.pageSize}
              onChange={event => onPageSizeChange(Number(event.target.value))}
              disabled={disabled}
              aria-label={`${ariaLabel}: จำนวนรายการต่อหน้า`}
              className="h-11 min-w-[76px] cursor-pointer appearance-none rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 pr-8 font-mono text-[13px] tabular-nums text-slate-200 transition-colors hover:border-emerald-400/30 focus:outline-none focus-visible:border-emerald-400/60 focus-visible:ring-2 focus-visible:ring-emerald-400/25 disabled:cursor-wait disabled:opacity-50"
            >
              {pageSizeOptions.map(option => (
                <option key={option} value={option}>{option.toLocaleString('th-TH')}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          </span>
          <span>รายการ</span>
        </label>
      </div>

      <nav className="flex items-center justify-between gap-1.5 sm:justify-end" aria-label={ariaLabel}>
        <button type="button" onClick={() => goToPage(1)} disabled={disabled || !pagination.hasPrevious}
          className={`${iconButtonClass} hidden sm:flex`} aria-label="ไปหน้าแรก" title="หน้าแรก">
          <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => goToPage(pagination.page - 1)} disabled={disabled || !pagination.hasPrevious}
          className={iconButtonClass} aria-label="ไปหน้าก่อนหน้า" title="ก่อนหน้า">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="hidden items-center gap-1.5 lg:flex">
          {pageItems.map(item => typeof item === 'number' ? (
            <button
              type="button"
              key={item}
              onClick={() => goToPage(item)}
              disabled={disabled}
              aria-label={`ไปหน้า ${item}`}
              aria-current={item === pagination.page ? 'page' : undefined}
              className={`flex h-11 min-w-11 items-center justify-center rounded-xl px-3 font-mono text-[13px] font-semibold tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/70 ${item === pagination.page ? 'text-[#06231a]' : 'border border-white/[0.08] text-slate-400 hover:border-emerald-400/30 hover:bg-emerald-400/[0.08] hover:text-emerald-300'}`}
              style={item === pagination.page ? { background: 'linear-gradient(140deg,#5eead4,#10b981)' } : undefined}
            >
              {item.toLocaleString('th-TH')}
            </button>
          ) : (
            <span key={item} className="flex h-11 min-w-6 items-center justify-center text-sm text-slate-600" aria-hidden="true">…</span>
          ))}
        </div>

        <span className="min-w-[96px] text-center text-xs tabular-nums text-slate-400 lg:hidden">
          หน้า <span className="font-mono text-slate-200">{pagination.page.toLocaleString('th-TH')}</span> จาก {pagination.totalPages.toLocaleString('th-TH')}
        </span>

        <button type="button" onClick={() => goToPage(pagination.page + 1)} disabled={disabled || !pagination.hasNext}
          className={iconButtonClass} aria-label="ไปหน้าถัดไป" title="ถัดไป">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => goToPage(pagination.totalPages)} disabled={disabled || !pagination.hasNext}
          className={`${iconButtonClass} hidden sm:flex`} aria-label="ไปหน้าสุดท้าย" title="หน้าสุดท้าย">
          <ChevronsRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </nav>
    </div>
  )
}
