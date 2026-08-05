import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { normalizeHex } from '../../utils/colorPickerHelpers'
import ColorPickerPopover from './ColorPickerPopover'

export default function ColorPickerTrigger({
  value,
  onChange,
  onPreview,
  className = '',
  barClassName = 'h-7 w-14',
  title = '색상 선택'
}) {
  const [open, setOpen] = useState(false)
  const [liveColor, setLiveColor] = useState(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const btnRef = useRef(null)
  const safe = normalizeHex(value)
  const displayColor = liveColor ?? safe

  const openPicker = (e) => {
    const rect = btnRef.current?.getBoundingClientRect()
    const nextPos = {
      x: rect?.left ?? e.clientX,
      y: (rect?.bottom ?? e.clientY) + 6,
      pickX: e.clientX,
      pickY: e.clientY
    }
    flushSync(() => {
      setLiveColor(null)
      setPos(nextPos)
      setOpen(true)
    })
  }

  const closePicker = () => {
    setLiveColor(null)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={title}
        onClick={openPicker}
        className={`rounded-full border border-[var(--color-border)] ${barClassName} ${className}`}
        style={{ backgroundColor: displayColor }}
      />
      {open && (
        <ColorPickerPopover
          value={safe}
          x={pos.pickX ?? pos.x}
          y={pos.pickY ?? pos.y}
          onChange={(hex) => {
            onChange?.(hex)
            closePicker()
          }}
          onPreview={(hex) => {
            setLiveColor(hex)
            onPreview?.(hex)
          }}
          onClose={closePicker}
        />
      )}
    </>
  )
}
