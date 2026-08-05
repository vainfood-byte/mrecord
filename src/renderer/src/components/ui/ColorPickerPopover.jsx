import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../../context/AppContext'
import { pushRecentColor } from '../../utils/recentColorHelpers'
import { normalizeHex } from '../../utils/colorPickerHelpers'
import RecentColorRow from './RecentColorRow'
import StandardColorPalette from './StandardColorPalette'

const overlayRoot = document.getElementById('overlay-root')
const POPOVER_W = 256
const POPOVER_H = 88
const EXTENDED_POPOVER_W = 280
const EXTENDED_POPOVER_H = 280
const POPOVER_Z = 100003
const NATIVE_PICKER_W = 280
const NATIVE_PICKER_H = 320
const GAP = 12
const OFFSET_X = 16

function clampPopover(left, top, width = POPOVER_W, height = POPOVER_H) {
  return {
    popoverLeft: Math.min(Math.max(8, left), window.innerWidth - width - 8),
    popoverTop: Math.min(Math.max(8, top), window.innerHeight - height - 8)
  }
}

/** 클릭 기준 우측 상단(컬러피커) · 우측 하단(최근 색상) — 편집박스 등 */
function computeSplitLayout(x, y, anchorBottom, extended = false) {
  const panelW = extended ? EXTENDED_POPOVER_W : POPOVER_W
  const panelH = extended ? EXTENDED_POPOVER_H : POPOVER_H
  const anchorX = Math.min(Math.max(8, x + OFFSET_X), window.innerWidth - 28 - 8)
  const anchorY = Math.max(8, y - GAP)
  const recentY = anchorBottom != null ? anchorBottom + GAP : y + GAP
  const { popoverLeft, popoverTop } = clampPopover(x + OFFSET_X, recentY, panelW, panelH)
  return { anchorX, anchorY, popoverLeft, popoverTop, panelW, panelH }
}

function computeLayout(x, y) {
  const anchorX = Math.min(Math.max(8, x), window.innerWidth - 28 - 8)
  const anchorY = Math.max(8, y)

  if (anchorX + NATIVE_PICKER_W + GAP + POPOVER_W <= window.innerWidth - 8) {
    return {
      anchorX,
      anchorY,
      popoverLeft: anchorX + NATIVE_PICKER_W + GAP,
      popoverTop: Math.min(Math.max(8, anchorY), window.innerHeight - POPOVER_H - 8)
    }
  }

  if (anchorY + NATIVE_PICKER_H + GAP + POPOVER_H <= window.innerHeight - 8) {
    return {
      anchorX,
      anchorY,
      popoverLeft: Math.min(Math.max(8, anchorX), window.innerWidth - POPOVER_W - 8),
      popoverTop: anchorY + NATIVE_PICKER_H + GAP
    }
  }

  if (anchorY - POPOVER_H - GAP >= 8) {
    return {
      anchorX,
      anchorY: Math.max(8, anchorY - NATIVE_PICKER_H),
      popoverLeft: Math.min(Math.max(8, anchorX), window.innerWidth - POPOVER_W - 8),
      popoverTop: anchorY - POPOVER_H - GAP
    }
  }

  return {
    anchorX,
    anchorY,
    popoverLeft: Math.max(8, window.innerWidth - POPOVER_W - 8),
    popoverTop: Math.min(Math.max(8, anchorY + NATIVE_PICKER_H + GAP), window.innerHeight - POPOVER_H - 8)
  }
}

function resolveNativeAnchor({ x, y, anchorBottom, layoutMode, showStandardPalette }) {
  if (layoutMode === 'split') {
    const split = computeSplitLayout(x, y, anchorBottom, showStandardPalette)
    return { anchorX: split.anchorX, anchorY: split.anchorY }
  }
  const layout = computeLayout(x, y)
  return { anchorX: layout.anchorX, anchorY: layout.anchorY }
}

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
  input.style.zIndex = String(POPOVER_Z + 1)
  input.style.pointerEvents = 'auto'
  void input.offsetWidth
  void input.getBoundingClientRect()
}

export default function ColorPickerPopover({
  value,
  x,
  y,
  anchorBottom,
  onChange,
  onPreview,
  onClose,
  layoutMode = 'auto',
  showStandardPalette = false,
  paletteOnly = false
}) {
  const { state, dispatch } = useApp()
  const ref = useRef(null)
  const inputRef = useRef(null)
  const draftRef = useRef(normalizeHex(value))
  const initialRef = useRef(normalizeHex(value))
  const onChangeRef = useRef(onChange)
  const onPreviewRef = useRef(onPreview)
  const onCloseRef = useRef(onClose)
  const applyAndCloseRef = useRef(() => {})
  const nativeOpenRef = useRef(false)
  const [draft, setDraft] = useState(() => normalizeHex(value))
  const layout =
    layoutMode === 'split'
      ? computeSplitLayout(x, y, anchorBottom, showStandardPalette)
      : { ...computeLayout(x, y), panelW: POPOVER_W, panelH: POPOVER_H }

  onChangeRef.current = onChange
  onPreviewRef.current = onPreview
  onCloseRef.current = onClose

  const emitPreview = (next) => {
    const handler = onPreviewRef.current || onChangeRef.current
    handler?.(next)
  }

  applyAndCloseRef.current = () => {
    nativeOpenRef.current = false

    const chosen = draftRef.current
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: { recentPickColors: pushRecentColor(state.settings.recentPickColors, chosen) }
    })
    onChangeRef.current?.(chosen)
    onCloseRef.current?.()
  }

  useEffect(() => {
    const next = normalizeHex(value)
    draftRef.current = next
    initialRef.current = next
    setDraft(next)
  }, [value])

  useLayoutEffect(() => {
    if (paletteOnly) return undefined

    const input = inputRef.current
    if (!input) return undefined

    const { anchorX, anchorY } = resolveNativeAnchor({
      x,
      y,
      anchorBottom,
      layoutMode,
      showStandardPalette
    })

    input.value = draftRef.current
    nativeOpenRef.current = true
    document.body.dataset.colorPickerOpen = '1'

    const syncDraft = (e) => {
      const next = normalizeHex(e.target.value)
      draftRef.current = next
      setDraft(next)
      emitPreview(next)
    }

    const onNativeChange = (e) => {
      syncDraft(e)
      nativeOpenRef.current = false
      delete document.body.dataset.colorPickerOpen
      applyAndCloseRef.current()
    }

    const onNativeCancel = () => {
      nativeOpenRef.current = false
      delete document.body.dataset.colorPickerOpen
      if (draftRef.current.toLowerCase() !== initialRef.current.toLowerCase()) {
        applyAndCloseRef.current()
      }
    }

    input.addEventListener('input', syncDraft)
    input.addEventListener('change', onNativeChange)
    input.addEventListener('cancel', onNativeCancel)

    const openNativePicker = () => {
      applyNativeInputAnchor(input, anchorX, anchorY)
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

    applyNativeInputAnchor(input, anchorX, anchorY)
    const openRaf = requestAnimationFrame(openNativePicker)

    return () => {
      cancelAnimationFrame(openRaf)
      input.removeEventListener('input', syncDraft)
      input.removeEventListener('change', onNativeChange)
      input.removeEventListener('cancel', onNativeCancel)
    }
  }, [x, y, anchorBottom, layoutMode, showStandardPalette, paletteOnly])

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target)) return
      if (e.target.closest?.('[data-color-picker-native]')) return
      if (nativeOpenRef.current || document.body.dataset.colorPickerOpen === '1') return
      onCloseRef.current?.()
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [])

  useEffect(
    () => () => {
      nativeOpenRef.current = false
      delete document.body.dataset.colorPickerOpen
    },
    []
  )

  const selectColor = (hex) => {
    const next = normalizeHex(hex)
    draftRef.current = next
    setDraft(next)
    applyAndCloseRef.current()
  }

  const popoverLeft = Math.min(layout.popoverLeft, window.innerWidth - layout.panelW - 8)
  const popoverTop = Math.min(layout.popoverTop, window.innerHeight - layout.panelH - 8)

  const content = (
    <>
      {!paletteOnly && (
        <input
          ref={inputRef}
          type="color"
          data-color-picker-native
          defaultValue={draft}
          tabIndex={-1}
          aria-hidden
          style={{
            position: 'fixed',
            left: layout.anchorX,
            top: layout.anchorY,
            width: 28,
            height: 28,
            opacity: 0.01,
            border: 0,
            padding: 0,
            margin: 0,
            zIndex: POPOVER_Z + 1,
            pointerEvents: 'auto'
          }}
        />
      )}
      <div
        ref={ref}
        data-popup-root
        data-color-picker-popover
        className="fixed rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-3 shadow-lg"
        style={{
          left: popoverLeft,
          top: popoverTop,
          width: layout.panelW,
          zIndex: POPOVER_Z,
          WebkitAppRegion: 'no-drag'
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {showStandardPalette && (
          <div className="mb-3">
            <StandardColorPalette value={draft} onSelect={selectColor} />
          </div>
        )}
        <RecentColorRow value={draft} onSelect={selectColor} />
      </div>
    </>
  )

  return overlayRoot ? createPortal(content, overlayRoot) : content
}
