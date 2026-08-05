import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { collectYearsFromRecords } from '../../utils/dateFieldFormat'

const YEAR_SPAN = 12

function buildYearGrid(centerYear) {
  const start = centerYear - Math.floor(YEAR_SPAN / 2)
  return Array.from({ length: YEAR_SPAN }, (_, i) => start + i)
}

export default function YearPickerPopover({ value, onChange, onClose, records, fieldId }) {
  const ref = useRef(null)
  const recordYears = collectYearsFromRecords(records, fieldId)
  const current = value ? String(value).slice(0, 4) : ''
  const nowYear = new Date().getFullYear()
  const initialCenter = current && /^\d{4}$/.test(current) ? Number(current) : nowYear

  const [centerYear, setCenterYear] = useState(initialCenter)
  const [custom, setCustom] = useState(current)

  useEffect(() => {
    setCustom(current)
    if (current && /^\d{4}$/.test(current)) {
      setCenterYear(Number(current))
    }
  }, [current])

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const gridYears = useMemo(() => buildYearGrid(centerYear), [centerYear])

  const pick = (year) => {
    onChange(String(year))
    onClose?.()
  }

  const applyCustom = () => {
    const y = custom.trim().slice(0, 4)
    if (/^\d{4}$/.test(y)) pick(y)
  }

  const quickYears = useMemo(() => {
    const set = new Set([...recordYears, String(nowYear), String(nowYear - 1), current].filter(Boolean))
    return [...set].sort((a, b) => Number(b) - Number(a)).slice(0, 6)
  }, [recordYears, nowYear, current])

  return (
    <div
      ref={ref}
      data-property-popup
      className="absolute left-0 top-full z-40 mt-1 w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-2 shadow-lg"
      style={{ WebkitAppRegion: 'no-drag' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="mb-1.5 text-[10px] text-[var(--color-text-muted)]">연도 선택</p>

      {quickYears.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {quickYears.map((y) => (
            <button
              key={`quick-${y}`}
              type="button"
              onClick={() => pick(y)}
              className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
                current === y
                  ? 'bg-[var(--color-accent)] font-semibold text-white'
                  : 'border border-[var(--color-border)] hover:bg-black/5'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCenterYear((y) => y - YEAR_SPAN)}
          className="rounded p-1 hover:bg-black/5"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-medium">{centerYear - 5} – {centerYear + 6}</span>
        <button
          type="button"
          onClick={() => setCenterYear((y) => y + YEAR_SPAN)}
          className="rounded p-1 hover:bg-black/5"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1">
        {gridYears.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => pick(year)}
            className={`rounded py-1.5 text-xs transition-colors ${
              current === String(year)
                ? 'bg-[var(--color-accent)] font-semibold text-white'
                : year === nowYear
                  ? 'ring-1 ring-[var(--color-accent)] hover:bg-black/5'
                  : 'hover:bg-black/5'
            }`}
          >
            {year}
          </button>
        ))}
      </div>

      <div className="flex gap-1 border-t border-[var(--color-border)] pt-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={(e) => e.key === 'Enter' && applyCustom()}
          placeholder="yyyy"
          className="min-w-0 flex-1 rounded border border-[var(--color-border)] px-2 py-1 text-xs outline-none"
        />
        <button
          type="button"
          onClick={applyCustom}
          className="rounded bg-[var(--color-accent)] px-2 py-1 text-[10px] text-white"
        >
          적용
        </button>
      </div>

      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('')
            onClose?.()
          }}
          className="mt-1 w-full rounded border border-[var(--color-border)] py-1 text-[10px] text-red-600 hover:bg-red-50"
        >
          지우기
        </button>
      )}
    </div>
  )
}
