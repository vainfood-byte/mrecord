import { useRef, useState } from 'react'
import { getYear } from 'date-fns'
import { useOutsideDismiss } from '../../hooks/useOutsideDismiss'

export default function CalendarExportMenu({
  anchorRef,
  displayYear,
  onExportMonth,
  onExportYear,
  onClose
}) {
  const ref = useRef(null)
  const [yearOpen, setYearOpen] = useState(false)
  useOutsideDismiss(ref, true, onClose, { ignoreSelector: '[data-calendar-export-trigger]' })

  const rect = anchorRef?.current?.getBoundingClientRect()
  const left = Math.min(rect?.right ? rect.right - 168 : 0, window.innerWidth - 180)
  const top = (rect?.bottom ?? 0) + 4
  const yearOptions = Array.from({ length: 7 }, (_, i) => displayYear - 3 + i)

  return (
    <>
      <div
        className="fixed inset-0 z-[99998]"
        aria-hidden
        data-export-popup
        onMouseDown={onClose}
      />
      <div
        ref={ref}
        data-popup-root
        className="fixed z-[99999] w-44 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
        style={{ left, top, WebkitAppRegion: 'no-drag' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            onExportMonth()
            onClose()
          }}
          className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5"
        >
          해당 월 내보내기
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setYearOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-black/5"
          >
            연도별 내보내기
            <span className="text-[10px] text-[var(--color-text-muted)]">{yearOpen ? '▲' : '▼'}</span>
          </button>
          {yearOpen && (
            <div className="border-t border-[var(--color-border)] py-1">
              {yearOptions.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => {
                    onExportYear(year)
                    onClose()
                  }}
                  className="block w-full px-4 py-1.5 text-left text-xs hover:bg-black/5"
                >
                  {year}년
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
