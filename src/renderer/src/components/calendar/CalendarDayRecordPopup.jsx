import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useOutsideDismiss } from '../../hooks/useOutsideDismiss'
import { isRecordLocked } from '../layout/LockToggle'

export default function CalendarDayRecordPopup({
  dateKey,
  records,
  x,
  y,
  lock,
  onSelect,
  onClose
}) {
  const ref = useRef(null)

  useOutsideDismiss(ref, true, onClose)

  useEffect(() => {
    const onEsc = (e) => {
      e.preventDefault()
      onClose()
    }
    window.addEventListener('mrecord:escape', onEsc)
    return () => window.removeEventListener('mrecord:escape', onEsc)
  }, [onClose])

  const pad = 8
  const width = 280
  const maxH = 360
  const left = Math.min(Math.max(pad, x), window.innerWidth - width - pad)
  const top = Math.min(Math.max(pad, y - maxH), window.innerHeight - maxH - pad)

  return createPortal(
    <div
      ref={ref}
      data-popup-root
      className="fixed z-[90] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-panel)] shadow-xl"
      style={{ left, top, width, maxHeight: maxH }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3">
        <p className="text-sm font-semibold text-[var(--color-text)]">{dateKey}</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          {records.length}개 작품 · 클릭하여 열기
        </p>
      </div>
      <ul className="max-h-[300px] overflow-y-auto py-2">
        {records.map((rec) => {
          const locked = isRecordLocked(rec, lock)
          return (
            <li key={rec.id} className="px-2">
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  if (locked) return
                  onSelect(rec.id)
                  onClose()
                }}
                className={`flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  locked ? 'cursor-default' : 'hover:bg-[var(--color-accent)]/10'
                }`}
              >
                <span
                  className={`truncate text-sm font-semibold text-[var(--color-text)] ${
                    locked ? 'blur-sm select-none' : 'hover:text-[var(--color-accent)]'
                  }`}
                >
                  {rec.title}
                </span>
                {rec.author && rec.author !== '작가 미상' && (
                  <span
                    className={`truncate text-xs text-[var(--color-text-muted)] ${
                      locked ? 'blur-sm select-none' : ''
                    }`}
                  >
                    {rec.author}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>,
    document.body
  )
}
