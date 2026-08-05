import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const overlayRoot = document.getElementById('overlay-root')

/** TabBar 등 — 앵커 버튼 아래에 overlay-root에 고정 표시 (흔적 박스·콘텐츠 위) */
export default function AnchoredPopup({
  anchorRef,
  open,
  onClose,
  children,
  className = '',
  align = 'right',
  offsetY = 4
}) {
  const popupRef = useRef(null)
  const [style, setStyle] = useState(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef?.current) {
      setStyle(null)
      return
    }

    const update = () => {
      const rect = anchorRef.current.getBoundingClientRect()
      const left = align === 'right' ? rect.right : rect.left
      setStyle({
        position: 'fixed',
        top: rect.bottom + offsetY,
        left,
        transform: align === 'right' ? 'translateX(-100%)' : undefined,
        WebkitAppRegion: 'no-drag',
        zIndex: 100002
      })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef, align, offsetY])

  useEffect(() => {
    if (!open) return undefined

    const onDown = (e) => {
      if (popupRef.current?.contains(e.target)) return
      if (anchorRef?.current?.contains(e.target)) return
      onClose()
    }

    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open, onClose, anchorRef])

  if (!open || !overlayRoot || !style) return null

  return createPortal(
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: 100001, WebkitAppRegion: 'no-drag' }}
        aria-hidden
        onMouseDown={onClose}
      />
      <div
        ref={popupRef}
        data-popup-root
        className={className}
        style={style}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    overlayRoot
  )
}
