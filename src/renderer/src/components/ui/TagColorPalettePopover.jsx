import { useRef } from 'react'

import { TAG_COLOR_PALETTE } from '../../data/propertyTypes'
import { ensurePaletteSlots } from '../../utils/colorPickerHelpers'
import { useOutsideDismiss } from '../../hooks/useOutsideDismiss'

function ColorSwatch({ color, active, onClick }) {
  return (
    <button
      type="button"
      title={color}
      onClick={onClick}
      className={`h-8 w-8 rounded-full border ${
        active ? 'ring-2 ring-[var(--color-accent)] ring-offset-1' : 'border-black/10'
      }`}
      style={{ backgroundColor: color }}
    />
  )
}

export default function TagColorPalettePopover({ x, y, value, settings, onSelect, onClose }) {
  const ref = useRef(null)
  useOutsideDismiss(ref, true, onClose)

  const customOnly = settings?.tagCustomColorOnly === true
  const customPalette = ensurePaletteSlots(settings?.tagCustomPalette, 10).filter(Boolean)
  const baseColors = customOnly ? [] : TAG_COLOR_PALETTE
  const left = Math.min(x, window.innerWidth - 220)
  const top = Math.min(y, window.innerHeight - 280)

  const pick = (color) => {
    onSelect?.(color)
    onClose?.()
  }

  return (
    <>
      <div className="fixed inset-0 z-[200]" aria-hidden onMouseDown={onClose} />
      <div
        ref={ref}
        data-popup-root
        className="fixed z-[201] w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-3 shadow-lg"
        style={{ left, top, WebkitAppRegion: 'no-drag' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="mb-2 text-[10px] font-medium text-[var(--color-text-muted)]">
          커스텀 색상 팔레트
        </p>

        {!customOnly && baseColors.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {baseColors.map((color) => (
              <ColorSwatch
                key={`base-${color}`}
                color={color}
                active={value === color}
                onClick={() => pick(color)}
              />
            ))}
          </div>
        )}

        {customPalette.length > 0 ? (
          <div className="grid grid-cols-5 gap-1.5">
            {customPalette.map((color) => (
              <ColorSwatch
                key={`custom-${color}`}
                color={color}
                active={value === color}
                onClick={() => pick(color)}
              />
            ))}
          </div>
        ) : (
          <p className="py-2 text-center text-[10px] leading-snug text-[var(--color-text-muted)]">
            설정 &gt; 컬러 설정에서
            <br />
            팔레트 색상을 추가해 주세요.
          </p>
        )}
      </div>
    </>
  )
}
