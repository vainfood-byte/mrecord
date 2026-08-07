import { useCallback, useEffect } from 'react'
import { resetInteractionLocks } from '../utils/restoreFocusAfterDialog'

/** 클립보드 이미지 붙여넣기 지원 */
export function useClipboardPaste(onPaste, { enabled = true, shouldIgnore } = {}) {
  const handlePaste = useCallback(
    async (e) => {
      if (!enabled) return
      if (shouldIgnore?.()) return

      const items = e.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (!file) continue
          const reader = new FileReader()
          reader.onload = () => {
            if (typeof reader.result === 'string') onPaste(reader.result)
          }
          reader.readAsDataURL(file)
          return
        }
      }
    },
    [enabled, onPaste, shouldIgnore]
  )

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])
}

/** 패널 좌측 가장자리 드래그 리사이즈 — 드래그 중에는 onMove, 놓을 때 onCommit */
export function usePanelResize(initialWidth, { onMove, onCommit }, min = 320, max = 900) {
  const startResize = useCallback(
    (e) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = initialWidth
      let lastWidth = startWidth
      let ended = false
      const resolveMax = () => (typeof max === 'function' ? max() : max)

      const endDrag = () => {
        if (ended) return
        ended = true
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        window.removeEventListener('blur', endDrag)
        resetInteractionLocks()
        onCommit(lastWidth)
      }

      const onMouseMove = (ev) => {
        const cap = resolveMax()
        const delta = startX - ev.clientX
        lastWidth = Math.min(cap, Math.max(min, startWidth + delta))
        onMove?.(lastWidth)
      }

      const onMouseUp = () => endDrag()

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      window.addEventListener('blur', endDrag)
    },
    [initialWidth, onMove, onCommit, min, max]
  )

  return startResize
}

/** 세로 드래그 리사이즈 */
export function useVerticalResize(initialHeight, { onMove, onCommit }, min = 60, max = 220) {
  const startResize = useCallback(
    (e) => {
      e.preventDefault()
      const startY = e.clientY
      const startHeight = initialHeight
      let lastHeight = startHeight
      let ended = false

      const endDrag = () => {
        if (ended) return
        ended = true
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        window.removeEventListener('blur', endDrag)
        resetInteractionLocks()
        onCommit(lastHeight)
      }

      const onMouseMove = (ev) => {
        const delta = ev.clientY - startY
        lastHeight = Math.min(max, Math.max(min, startHeight + delta))
        onMove?.(lastHeight)
      }

      const onMouseUp = () => endDrag()

      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      window.addEventListener('blur', endDrag)
    },
    [initialHeight, onMove, onCommit, min, max]
  )

  return startResize
}

/** 범용 드래그 리사이즈 — axis: 'x' | 'y'
 * getContainerSize가 있으면 delta(px)를 컨테이너 크기 대비 %로 변환한다.
 */
export function useDragResize(
  initialValue,
  { axis = 'y', onMove, onCommit, min = 80, max = 800, invert = false, getContainerSize } = {}
) {
  const startResize = useCallback(
    (e) => {
      e.preventDefault()
      const startPos = axis === 'x' ? e.clientX : e.clientY
      const startValue = initialValue
      let lastValue = startValue
      let ended = false
      const containerSize = typeof getContainerSize === 'function' ? getContainerSize() : 0

      const endDrag = () => {
        if (ended) return
        ended = true
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        window.removeEventListener('blur', endDrag)
        resetInteractionLocks()
        onCommit(lastValue)
      }

      const onMouseMove = (ev) => {
        const current = axis === 'x' ? ev.clientX : ev.clientY
        const deltaPx = current - startPos
        const delta = containerSize > 0 ? (deltaPx / containerSize) * 100 : deltaPx
        const next = invert ? startValue - delta : startValue + delta
        lastValue = Math.min(max, Math.max(min, next))
        onMove?.(lastValue)
      }

      const onMouseUp = () => endDrag()

      document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      window.addEventListener('blur', endDrag)
    },
    [initialValue, axis, onMove, onCommit, min, max, invert, getContainerSize]
  )

  return startResize
}
