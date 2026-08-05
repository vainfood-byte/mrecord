import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getDate, getMonth, getYear, setDate, setMonth, setYear } from 'date-fns'

import { useOutsideDismiss } from '../../hooks/useOutsideDismiss'

export default function CalendarJumpPicker({ x, y, initialDate, onJump, onClose }) {
  const ref = useRef(null)
  const [draft, setDraft] = useState(initialDate)

  useOutsideDismiss(ref, true, onClose, { ignoreSelector: '[data-calendar-jump-trigger]' })

  const year = getYear(draft)
  const month = getMonth(draft) + 1
  const day = getDate(draft)
  const maxDay = new Date(year, month, 0).getDate()
  const yearOptions = Array.from({ length: 21 }, (_, i) => year - 10 + i)

  const apply = () => {
    onJump(draft)
    onClose()
  }

  const pad = 8
  const width = 240
  const left = Math.min(Math.max(pad, x), window.innerWidth - width - pad)
  const top = Math.min(Math.max(pad, y), window.innerHeight - 220 - pad)

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[89]"
        aria-hidden
        data-export-popup
        onMouseDown={onClose}
      />
      <div
        ref={ref}
        data-popup-root
        className="fixed z-[90] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-3 shadow-xl"
        style={{ left, top, width, WebkitAppRegion: 'no-drag' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
      <p className="mb-2 text-xs font-semibold">날짜 이동</p>
      <div className="space-y-2">
        <label className="block text-[10px] text-[var(--color-text-muted)]">
          연도
          <select
            value={year}
            onChange={(e) =>
              setDraft((d) => setYear(d, Number(e.target.value)))
            }
            className="mt-0.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[10px] text-[var(--color-text-muted)]">
          월
          <select
            value={month}
            onChange={(e) =>
              setDraft((d) => setMonth(d, Number(e.target.value) - 1))
            }
            className="mt-0.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[10px] text-[var(--color-text-muted)]">
          날짜
          <select
            value={Math.min(day, maxDay)}
            onChange={(e) =>
              setDraft((d) => setDate(d, Number(e.target.value)))
            }
            className="mt-0.5 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs"
          >
            {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}일
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded border border-[var(--color-border)] py-1.5 text-xs hover:bg-black/5"
        >
          취소
        </button>
        <button
          type="button"
          onClick={apply}
          className="flex-1 rounded bg-[var(--color-accent)] py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          이동
        </button>
      </div>
    </div>
    </>,
    document.body
  )
}
