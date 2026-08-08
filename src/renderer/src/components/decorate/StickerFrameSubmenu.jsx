import { useLayoutEffect, useRef, useState } from 'react'
import { normalizeFrameShape, STICKER_FRAME_OPTIONS } from '../../utils/stickerFrame'

/**
 * 스티커 우클릭 — [프레임 바꾸기 ▶] 서브메뉴
 * 우측 펼침, 공간 부족 시 좌측.
 */
export default function StickerFrameSubmenu({ current, onSelect }) {
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState('right')
  const [top, setTop] = useState(0)
  const itemRef = useRef(null)
  const subRef = useRef(null)
  const closeTimer = useRef(null)
  const active = normalizeFrameShape(current)

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const scheduleClose = () => {
    clearClose()
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  const openMenu = () => {
    clearClose()
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    const item = itemRef.current
    const sub = subRef.current
    if (!item || !sub) return

    const itemRect = item.getBoundingClientRect()
    const subRect = sub.getBoundingClientRect()
    const pad = 8
    const spaceRight = window.innerWidth - itemRect.right - pad
    const spaceLeft = itemRect.left - pad
    const nextSide =
      spaceRight >= subRect.width || spaceRight >= spaceLeft ? 'right' : 'left'

    let nextTop = 0
    const overflowBottom = itemRect.top + subRect.height + pad - window.innerHeight
    if (overflowBottom > 0) {
      nextTop = -Math.min(overflowBottom, Math.max(0, subRect.height - itemRect.height))
    }
    setSide(nextSide)
    setTop(nextTop)
  }, [open])

  useLayoutEffect(() => () => clearClose(), [])

  const pick = (id) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    const next = active === id ? null : id
    onSelect(next)
  }

  return (
    <div
      className="relative"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={itemRef}
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          openMenu()
        }}
        className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-black/[0.04] ${
          active ? 'font-medium text-[var(--color-accent)]' : ''
        }`}
      >
        <span>프레임 바꾸기</span>
        <span className="text-[10px] text-[var(--color-text-muted)]">▶</span>
      </button>

      {open && (
        <div
          ref={subRef}
          data-sticker-frame-submenu
          className="absolute z-10 min-w-[168px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
          style={{
            top,
            ...(side === 'right' ? { left: '100%', marginLeft: 2 } : { right: '100%', marginRight: 2 })
          }}
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {STICKER_FRAME_OPTIONS.map((opt) => {
            const isOn = active === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onMouseDown={pick(opt.id)}
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-black/[0.04] ${
                  isOn ? 'font-medium text-[var(--color-accent)]' : ''
                }`}
              >
                {opt.label}
                {isOn ? ' ✓' : ''}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
