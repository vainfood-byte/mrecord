import { useLayoutEffect, useRef } from 'react'
import { hexToRgb, normalizeHex, rgbToHex } from '../../utils/colorPickerHelpers'

function applyNativeInputAnchor(input, anchorX, anchorY) {
  input.style.position = 'fixed'
  input.style.left = `${anchorX}px`
  input.style.top = `${anchorY}px`
  input.style.width = '28px'
  input.style.height = '28px'
  input.style.opacity = '0.01'
  input.style.border = '0'
  input.style.padding = '0'
  input.style.margin = '0'
  input.style.zIndex = '999999'
  input.style.pointerEvents = 'auto'
  void input.offsetWidth
  void input.getBoundingClientRect()
}

export default function ColorPickerPanel({ value = '#000000', onDraftChange, autoOpen = true }) {
  const inputRef = useRef(null)
  const safe = normalizeHex(value)
  const rgb = hexToRgb(safe)

  const openNativeAt = (clientX, clientY) => {
    const input = inputRef.current
    if (!input) return
    document.body.dataset.colorPickerOpen = '1'
    applyNativeInputAnchor(input, Math.max(0, clientX - 12), Math.max(0, clientY - 12))
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
        return
      } catch {
        /* click fallback */
      }
    }
    input.click()
  }

  useLayoutEffect(() => {
    if (inputRef.current && inputRef.current.value !== safe) {
      inputRef.current.value = safe
    }
  }, [safe])

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input || !autoOpen) return undefined

    const markNativeClosed = () => {
      delete document.body.dataset.colorPickerOpen
    }

    input.addEventListener('cancel', markNativeClosed)

    return () => {
      input.removeEventListener('cancel', markNativeClosed)
      markNativeClosed()
    }
  }, [autoOpen])

  const emitHex = (hex) => {
    onDraftChange?.(normalizeHex(hex))
  }

  const emitRgb = (r, g, b) => {
    emitHex(rgbToHex(r, g, b))
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="color"
        defaultValue={safe}
        onInput={(e) => emitHex(e.target.value)}
        onChange={(e) => {
          emitHex(e.target.value)
          delete document.body.dataset.colorPickerOpen
        }}
        className="fixed opacity-0"
        style={{ left: 0, top: 0, width: 28, height: 28, WebkitAppRegion: 'no-drag' }}
        tabIndex={-1}
        aria-hidden
      />

      <button
        type="button"
        onClick={(e) => openNativeAt(e.clientX, e.clientY)}
        className="w-full rounded-lg border border-[var(--color-border)] py-2 text-xs hover:bg-black/5"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        색상 선택
      </button>

      <div className="grid grid-cols-3 gap-2">
        {[
          ['R', rgb.r, (v) => emitRgb(v, rgb.g, rgb.b)],
          ['G', rgb.g, (v) => emitRgb(rgb.r, v, rgb.b)],
          ['B', rgb.b, (v) => emitRgb(rgb.r, rgb.g, v)]
        ].map(([label, val, setter]) => (
          <label key={label} className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
            <span className="w-3">{label}</span>
            <input
              type="number"
              min={0}
              max={255}
              value={val}
              onChange={(e) => setter(Number(e.target.value))}
              className="w-full rounded border border-[var(--color-border)] bg-white px-1.5 py-1 text-xs outline-none"
            />
          </label>
        ))}
      </div>
    </div>
  )
}
