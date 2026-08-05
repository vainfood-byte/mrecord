import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../../context/AppContext'
import { fitMenuPosition } from '../../utils/stickerHelpers'
import StickerStyleMenuSection from '../decorate/StickerStyleMenuSection'
import { convertPetitStickerCoords } from './PetitStickerLayer'

const LAYER_ITEMS = [
  { label: '맨 위로', action: 'front' },
  { label: '위로', action: 'forward' },
  { label: '아래로', action: 'backward' },
  { label: '맨 아래로', action: 'back' }
]

export default function PetitStickerContextMenu({ stickerId, x, y, getScrollMetrics, onClose }) {
  const { state, dispatch } = useApp()
  const menuRef = useRef(null)
  const [pos, setPos] = useState({ x, y })
  const all = state.settings.calendarPetitStickers || []
  const sticker = all.find((s) => s.id === stickerId)
  const layerIndex = all.findIndex((s) => s.id === stickerId)

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos(fitMenuPosition(x, y, rect.width, rect.height))
  }, [x, y, stickerId])

  useLayoutEffect(() => {
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [onClose])

  if (!sticker) return null

  const run = (action) => {
    const metrics = getScrollMetrics?.()

    switch (action) {
      case 'front':
      case 'forward':
      case 'backward':
      case 'back':
        dispatch({ type: 'REORDER_PETIT_STICKER', payload: { id: stickerId, direction: action } })
        break
      case 'togglePin': {
        const nextPinned = !sticker.pinned
        const coords = convertPetitStickerCoords(sticker, metrics, nextPinned)
        dispatch({
          type: 'UPDATE_PETIT_STICKER',
          payload: {
            id: stickerId,
            data: { pinned: nextPinned, locked: false, ...coords }
          }
        })
        break
      }
      case 'toggleLock': {
        const nextLocked = !sticker.locked
        const coords = sticker.pinned
          ? convertPetitStickerCoords(sticker, metrics, false)
          : { y: sticker.y }
        dispatch({
          type: 'UPDATE_PETIT_STICKER',
          payload: {
            id: stickerId,
            data: { locked: nextLocked, pinned: false, ...coords }
          }
        })
        break
      }
      case 'delete':
        dispatch({ type: 'DELETE_PETIT_STICKER', payload: stickerId })
        onClose()
        return
      default:
        break
    }
    onClose()
  }

  const handle = (action) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    run(action)
  }

  const canForward = layerIndex >= 0 && layerIndex < all.length - 1
  const canBackward = layerIndex > 0

  return createPortal(
    <div
      ref={menuRef}
      data-petit-sticker-menu
      className="pointer-events-auto fixed z-[9999] min-w-[160px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
      style={{ left: pos.x, top: pos.y, WebkitAppRegion: 'no-drag' }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {LAYER_ITEMS.map((item) => {
        const disabled =
          (item.action === 'forward' && !canForward) ||
          (item.action === 'backward' && !canBackward) ||
          (item.action === 'front' && !canForward) ||
          (item.action === 'back' && !canBackward)
        return (
          <button
            key={item.action}
            type="button"
            disabled={disabled}
            onMouseDown={disabled ? undefined : handle(item.action)}
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-black/[0.04] disabled:opacity-40"
          >
            {item.label}
          </button>
        )
      })}
      <div className="my-1 border-t border-[var(--color-border)]" />
      <StickerStyleMenuSection
        sticker={sticker}
        onUpdate={(data) =>
          dispatch({ type: 'UPDATE_PETIT_STICKER', payload: { id: stickerId, data } })
        }
      />
      <button
        type="button"
        onMouseDown={handle('togglePin')}
        className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-black/[0.04] ${
          sticker.pinned ? 'font-medium text-[var(--color-accent)]' : ''
        }`}
      >
        위치 잠금{sticker.pinned ? ' ✓' : ''}
      </button>
      <button
        type="button"
        onMouseDown={handle('toggleLock')}
        className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-black/[0.04] ${
          sticker.locked ? 'font-medium text-[var(--color-accent)]' : ''
        }`}
      >
        액자화{sticker.locked ? ' ✓' : ''}
      </button>
      <button
        type="button"
        onMouseDown={handle('delete')}
        className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-black/[0.04]"
      >
        삭제
      </button>
    </div>,
    document.body
  )
}
