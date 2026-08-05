import { ChevronLeft, ChevronRight } from 'lucide-react'

import { useApp } from '../../context/AppContext'
import { useRecordListView } from '../../hooks/useRecordListView'

const PAGE_WINDOW = 10

function getVisiblePages(current, total, windowSize = PAGE_WINDOW) {
  if (total <= windowSize) {
    return Array.from({ length: total }, (_, i) => i)
  }
  let start = Math.max(0, current - Math.floor(windowSize / 2))
  if (start + windowSize > total) {
    start = total - windowSize
  }
  return Array.from({ length: windowSize }, (_, i) => start + i)
}

export default function RecordPageNav() {
  const { state } = useApp()
  const { pagedView, page, totalPages, totalCount, setPage } = useRecordListView()

  if (!pagedView || totalCount === 0 || state.activeTab === 'calendar') return null

  const visiblePages = getVisiblePages(page, totalPages)

  return (
    <nav
      data-export-hide
      className="flex shrink-0 items-center justify-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-5"
      aria-label="페이지 이동"
    >
      <button
        type="button"
        disabled={page <= 0}
        onClick={() => setPage(page - 1)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)] transition-colors hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-35"
        title="이전 페이지"
      >
        <ChevronLeft size={18} />
      </button>

      <div className="flex items-center gap-2">
        {visiblePages.map((pageIndex) => {
          const active = pageIndex === page
          return (
            <button
              key={pageIndex}
              type="button"
              onClick={() => setPage(pageIndex)}
              className={`min-w-[2.25rem] rounded-lg px-2 py-1.5 text-sm tabular-nums transition-colors ${
                active
                  ? 'bg-[var(--color-bg-panel)] font-bold text-[var(--color-text)] shadow-sm'
                  : 'font-normal text-[var(--color-text-muted)] hover:bg-black/[0.04]'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              {pageIndex + 1}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        disabled={page >= totalPages - 1}
        onClick={() => setPage(page + 1)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)] transition-colors hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-35"
        title="다음 페이지"
      >
        <ChevronRight size={18} />
      </button>
    </nav>
  )
}
