import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, Crop } from 'lucide-react'

const overlayRoot = document.getElementById('overlay-root')

/** 빈 텍스트 노드를 건너뛰고 형제 기준으로 이미지 순서 이동 */
function moveReviewImageByStep(img, direction) {
  if (!img?.parentNode) return false
  if (direction < 0) {
    let prev = img.previousSibling
    while (prev && prev.nodeType === Node.TEXT_NODE && !String(prev.textContent || '').trim()) {
      prev = prev.previousSibling
    }
    if (!prev) return false
    img.parentNode.insertBefore(img, prev)
    return true
  }
  let next = img.nextSibling
  while (next && next.nodeType === Node.TEXT_NODE && !String(next.textContent || '').trim()) {
    next = next.nextSibling
  }
  if (!next) return false
  img.parentNode.insertBefore(next, img)
  return true
}

export default function ReviewImageToolbar({ img, onContentChange, onCrop }) {
  const [rect, setRect] = useState(null)
  const resizeRef = useRef(null)

  const updateRect = useCallback(() => {
    if (!img?.isConnected) {
      setRect(null)
      return
    }
    setRect(img.getBoundingClientRect())
  }, [img])

  useLayoutEffect(() => {
    updateRect()
    const editor = img?.closest('[contenteditable]')
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    editor?.addEventListener('scroll', updateRect)
    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
      editor?.removeEventListener('scroll', updateRect)
    }
  }, [img, updateRect])

  useEffect(() => {
    const onMove = (e) => {
      const drag = resizeRef.current
      if (!drag || !img) return
      const dx = e.clientX - drag.startX
      const natW = img.naturalWidth || 200
      const natH = img.naturalHeight || 200
      const ratio = natW / natH
      const nextW = Math.max(60, Math.min(800, drag.origW + dx))
      img.style.width = `${Math.round(nextW)}px`
      img.style.height = `${Math.round(nextW / ratio)}px`
      updateRect()
      onContentChange?.()
    }
    const onUp = () => {
      resizeRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [img, onContentChange, updateRect])

  const handleMove = (direction) => {
    if (!img?.isConnected) return
    if (!moveReviewImageByStep(img, direction)) return
    // 레이아웃 반영 후 오버레이 재배치
    requestAnimationFrame(() => {
      updateRect()
      onContentChange?.()
    })
  }

  if (!img || !rect || !overlayRoot) return null

  const barTop = Math.max(4, rect.top - 34)

  return createPortal(
    <div data-review-img-ui style={{ WebkitAppRegion: 'no-drag' }}>
      <div
        className="fixed z-[100002] flex items-center gap-0.5 rounded-md border border-white/40 bg-black/70 p-0.5 text-white shadow"
        style={{ left: rect.left, top: barTop }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title="위로"
          onClick={(e) => {
            e.stopPropagation()
            handleMove(-1)
          }}
          className="flex h-7 items-center gap-0.5 rounded px-1.5 text-[11px] hover:bg-white/15"
        >
          <ChevronUp size={13} />
          위로
        </button>
        <button
          type="button"
          title="아래로"
          onClick={(e) => {
            e.stopPropagation()
            handleMove(1)
          }}
          className="flex h-7 items-center gap-0.5 rounded px-1.5 text-[11px] hover:bg-white/15"
        >
          <ChevronDown size={13} />
          아래로
        </button>
      </div>
      <button
        type="button"
        title="크롭"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onCrop?.()
        }}
        className="fixed z-[100002] flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-black/70 text-white shadow hover:bg-black/85"
        style={{ left: rect.right - 30, top: rect.top + 4 }}
      >
        <Crop size={13} />
      </button>
      <button
        type="button"
        data-resize-handle
        title="크기 조절"
        onPointerDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const w = img.getBoundingClientRect().width
          resizeRef.current = { startX: e.clientX, origW: w }
        }}
        className="fixed z-[100002] h-3.5 w-3.5 cursor-se-resize rounded-full border-2 border-white bg-[var(--color-accent)] shadow"
        style={{ left: rect.right - 8, top: rect.bottom - 8 }}
        aria-label="크기 조절"
      />
      <div
        className="pointer-events-none fixed z-[100001] rounded ring-2 ring-[var(--color-accent)]/80"
        style={{
          left: rect.left - 1,
          top: rect.top - 1,
          width: rect.width + 2,
          height: rect.height + 2
        }}
      />
    </div>,
    overlayRoot
  )
}
