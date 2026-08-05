import { useState } from 'react'
import { STICKER_BORDER_OPTIONS } from '../../utils/stickerStyle'
import ColorPickerPopover from '../ui/ColorPickerPopover'

export default function StickerStyleMenuSection({ sticker, onUpdate }) {
  const [picker, setPicker] = useState(null)
  const isMultiply = sticker.blendMode === 'multiply'
  const opacityPercent = Math.round((sticker.opacity ?? 1) * 100)

  const stopMenuPointer = (e) => {
    e.stopPropagation()
  }

  const toggleShadow = (e) => {
    e.stopPropagation()
    if (isMultiply) return
    onUpdate({ shadowEnabled: sticker.shadowEnabled === false })
  }

  const setBorder = (borderColor, extra = {}) => (e) => {
    e.stopPropagation()
    const isSame = sticker.borderColor === borderColor
    onUpdate(
      isSame
        ? { borderColor: null, borderCustomColor: null }
        : { borderColor, ...extra }
    )
  }

  const shadowOn = !isMultiply && sticker.shadowEnabled !== false
  const customColor = sticker.borderCustomColor || '#888888'

  const openCustomPicker = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setPicker({ x: e.clientX, y: e.clientY + 8 })
  }

  const setOpacity = (e) => {
    e.stopPropagation()
    const next = Number(e.target.value) / 100
    onUpdate({ opacity: next })
  }

  return (
    <>
      <div className="my-1 border-t border-[var(--color-border)]" />
      <div className="px-3 py-1.5">
        <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <span>투명도</span>
          <span className="tabular-nums">{opacityPercent}%</span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          value={Math.max(10, opacityPercent)}
          onChange={setOpacity}
          onPointerDown={stopMenuPointer}
          className="w-full"
        />
      </div>
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-xs text-[var(--color-text-muted)]">그림자</span>
        <button
          type="button"
          onPointerDown={toggleShadow}
          disabled={isMultiply}
          title={isMultiply ? '곱하기 모드에서는 그림자를 사용할 수 없습니다' : undefined}
          className={`rounded-full px-2 py-0.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40 ${
            shadowOn ? 'bg-[var(--color-accent)] text-white' : 'bg-black/10'
          }`}
        >
          {isMultiply ? '—' : shadowOn ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="px-3 pb-1.5">
        <span className="mb-1 block text-xs text-[var(--color-text-muted)]">테두리</span>
        <div className="flex flex-wrap items-center gap-2">
          {STICKER_BORDER_OPTIONS.map((opt) => {
            const isCustom = opt.id === 'custom'
            const active = sticker.borderColor === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                title={isCustom ? `${opt.label} (우클릭: 색상 변경)` : opt.label}
                onPointerDown={setBorder(opt.id, isCustom ? { borderCustomColor: customColor } : {})}
                onContextMenu={isCustom ? openCustomPicker : undefined}
                className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-105 ${
                  active
                    ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)] ring-offset-1'
                    : 'border-[var(--color-border)]'
                }`}
                style={{
                  backgroundColor: isCustom
                    ? customColor
                    : opt.id === 'text'
                      ? 'var(--color-bg-card)'
                      : opt.color
                }}
              />
            )
          })}
        </div>
      </div>

      {picker && (
        <ColorPickerPopover
          value={customColor}
          x={picker.x}
          y={picker.y}
          paletteOnly
          onChange={(hex) => onUpdate({ borderColor: 'custom', borderCustomColor: hex })}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  )
}
