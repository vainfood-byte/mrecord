import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  setMonth,
  setYear,
  startOfMonth,
  startOfWeek,
  subMonths
} from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const overlayRoot = document.getElementById('overlay-root')

export function formatPropertyDate(value) {
  if (!value) return ''
  try {
    const d = parsePickerDate(value)
    if (!isValidDate(d)) return String(value)
    return format(d, 'yyyy년 M월 d일', { locale: ko })
  } catch {
    return String(value)
  }
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i)

function parsePickerDate(value) {
  if (!value) return new Date()
  const raw = String(value).trim()
  if (!raw) return new Date()
  if (/^\d{4}$/.test(raw)) return new Date(Number(raw), 0, 1)
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const d = parseISO(`${raw}-01`)
    return isValidDate(d) ? d : new Date()
  }
  if (raw.includes('T')) {
    const d = new Date(raw)
    return isValidDate(d) ? d : new Date()
  }
  try {
    const d = parseISO(raw.length >= 10 ? raw.slice(0, 10) : raw)
    return isValidDate(d) ? d : new Date()
  } catch {
    return new Date()
  }
}

function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime())
}

function buildCalendarDays(viewMonth) {
  if (!isValidDate(viewMonth)) return []
  try {
    const monthStart = startOfMonth(viewMonth)
    const monthEnd = endOfMonth(viewMonth)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
    if (!isValidDate(calStart) || !isValidDate(calEnd)) return []
    if (calStart.getTime() > calEnd.getTime()) return []
    return eachDayOfInterval({ start: calStart, end: calEnd })
  } catch {
    return []
  }
}

export { parsePickerDate, isValidDate }

export default function DatePickerPopover({
  value,
  onChange,
  onClose,
  dateFormat = 'full',
  inline = false,
  anchorRect = null
}) {
  const initial = parsePickerDate(value)
  const [viewMonth, setViewMonth] = useState(() =>
    isValidDate(initial) ? startOfMonth(initial) : startOfMonth(new Date())
  )
  const [mode, setMode] = useState(dateFormat === 'year' ? 'years' : 'days')
  const ref = useRef(null)
  const pickingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const next = parsePickerDate(value)
    if (isValidDate(next)) {
      setViewMonth(startOfMonth(next))
    }
  }, [value])

  useEffect(() => {
    if (inline) return undefined
    const handler = (e) => {
      if (pickingRef.current) return
      if (ref.current?.contains(e.target)) return
      if (e.target.closest('[data-date-picker-portal]')) return
      onCloseRef.current?.()
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [inline])

  const days = buildCalendarDays(viewMonth)
  const selectedRaw = value ? parsePickerDate(value) : null
  const selected = selectedRaw && isValidDate(selectedRaw) ? selectedRaw : null
  const today = new Date()
  const viewYear = viewMonth.getFullYear()

  const pick = (day) => {
    pickingRef.current = true
    let formatted
    if (dateFormat === 'year') {
      formatted = format(day, 'yyyy')
    } else if (dateFormat === 'year-month') {
      formatted = format(day, 'yyyy-MM')
    } else {
      formatted = format(day, 'yyyy-MM-dd')
    }
    onChange(formatted)
    window.setTimeout(() => {
      pickingRef.current = false
    }, 0)
  }

  const panelClass = inline
    ? 'w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-2 shadow-lg'
    : anchorRect
      ? 'z-[100011] w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-2 shadow-lg'
      : 'absolute left-0 top-full z-[100011] mt-1 w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-2 shadow-lg'

  const content = (
    <div
      ref={ref}
      data-date-picker-portal
      data-property-popup
      data-no-side-open
      className={panelClass}
      style={{
        WebkitAppRegion: 'no-drag',
        ...(anchorRect
          ? {
              position: 'fixed',
              left: anchorRect.left,
              top: anchorRect.top,
              transform: anchorRect.openUp ? 'translateY(-100%)' : undefined
            }
          : {})
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (mode === 'days') setViewMonth(subMonths(viewMonth, 1))
            else if (mode === 'months') setViewMonth(setYear(viewMonth, viewYear - 1))
            else setMode('years')
          }}
          className="rounded p-1 hover:bg-black/5"
        >
          <ChevronLeft size={14} />
        </button>

        <div className="flex items-center gap-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode(mode === 'years' ? 'days' : 'years')}
            className="rounded px-1.5 py-0.5 hover:bg-black/5"
          >
            {viewYear}년
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === 'months' ? 'days' : 'months')}
            className="rounded px-1.5 py-0.5 hover:bg-black/5"
          >
            {format(viewMonth, 'M월', { locale: ko })}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (mode === 'days') setViewMonth(addMonths(viewMonth, 1))
            else if (mode === 'months') setViewMonth(setYear(viewMonth, viewYear + 1))
            else setMode('years')
          }}
          className="rounded p-1 hover:bg-black/5"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {mode === 'years' && (
        <div className="grid max-h-44 grid-cols-3 gap-1 overflow-y-auto">
          {Array.from({ length: 12 }, (_, i) => viewYear - 5 + i).map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => {
                if (dateFormat === 'year') {
                  pick(new Date(year, 0, 1))
                  return
                }
                setViewMonth(setYear(viewMonth, year))
                setMode('months')
              }}
              className={`rounded py-1.5 text-xs hover:bg-black/5 ${
                year === viewYear ? 'bg-[var(--color-accent)]/15 font-semibold text-[var(--color-accent)]' : ''
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      )}

      {mode === 'months' && (
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                if (dateFormat === 'year-month') {
                  pick(new Date(viewYear, m, 1))
                  return
                }
                setViewMonth(setMonth(viewMonth, m))
                setMode('days')
              }}
              className={`rounded py-1.5 text-xs hover:bg-black/5 ${
                m === viewMonth.getMonth() ? 'bg-[var(--color-accent)]/15 font-semibold text-[var(--color-accent)]' : ''
              }`}
            >
              {m + 1}월
            </button>
          ))}
        </div>
      )}

      {mode === 'days' && (
        <>
          <div className="mb-1 grid grid-cols-7 text-center text-[10px] text-[var(--color-text-muted)]">
            {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
              <div key={d} className="py-0.5">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const inMonth = isSameMonth(day, viewMonth)
              const isSelected = selected && isSameDay(day, selected)
              const isToday = isSameDay(day, today)
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(day)
                  }}
                  className={`flex h-7 w-full items-center justify-center rounded text-xs transition-colors ${
                    isSelected
                      ? 'bg-[var(--color-accent)] font-semibold text-white'
                      : isToday
                        ? 'ring-1 ring-[var(--color-accent)] hover:bg-black/5'
                        : inMonth
                          ? 'hover:bg-black/5'
                          : 'text-[var(--color-text-muted)]/50 hover:bg-black/5'
                  }`}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>
        </>
      )}

      <div className="mt-2 flex gap-1 border-t border-[var(--color-border)] pt-2">
        <button
          type="button"
          onClick={() => pick(today)}
          className="flex-1 rounded border border-[var(--color-border)] py-1 text-[10px] hover:bg-black/5"
        >
          오늘
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="flex-1 rounded border border-[var(--color-border)] py-1 text-[10px] text-red-600 hover:bg-red-50"
          >
            지우기
          </button>
        )}
      </div>
    </div>
  )

  if (inline) return content
  if (anchorRect && overlayRoot) return createPortal(content, overlayRoot)
  return content
}
