import { useCallback, useEffect, useRef, useState } from 'react'
import DatePickerPopover from './DatePickerPopover'
import { formatDateByMode, normalizeDateValue } from '../../utils/dateFieldFormat'

export default function InlineDateCell({
  value,
  onSave,
  locked,
  title = '클릭: 날짜 변경',
  dateFormat = 'full',
  placeholder = '—',
  className = 'w-full whitespace-nowrap text-left hover:text-[var(--color-accent)]'
}) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const btnRef = useRef(null)
  const openRef = useRef(false)

  openRef.current = open

  const closePicker = useCallback(() => {
    openRef.current = false
    setOpen(false)
    setAnchorRect(null)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!openRef.current) return
      if (btnRef.current?.contains(e.target)) return
      if (e.target.closest('[data-date-picker-portal]')) return
      closePicker()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, closePicker])

  if (locked) return <span>—</span>

  const displayValue = value ? formatDateByMode(value, dateFormat) : placeholder
  const pickerValue = normalizeDateValue(value, dateFormat)

  const openPicker = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    const pickerHeight = 320
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < pickerHeight && rect.top > pickerHeight
    setAnchorRect({
      left: Math.min(rect.left, window.innerWidth - 240),
      top: openUp ? rect.top - 8 : rect.bottom + 4,
      openUp
    })
    openRef.current = true
    setOpen(true)
  }

  const handleChange = (next) => {
    closePicker()
    onSave(normalizeDateValue(next, dateFormat))
  }

  return (
    <div
      className="relative w-full"
      data-inline-edit
      data-no-side-open
      data-property-popup
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={btnRef}
        type="button"
        data-record-date
        onClick={openPicker}
        className={className}
        title={title}
      >
        {displayValue}
      </button>
      {open && anchorRect && (
        <DatePickerPopover
          value={pickerValue}
          dateFormat={dateFormat}
          anchorRect={anchorRect}
          onChange={handleChange}
          onClose={closePicker}
        />
      )}
    </div>
  )
}
