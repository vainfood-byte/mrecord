import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../../context/AppContext'
import { fitMenuPosition, resolveStickerDisplayPosition, withAnchorRatios } from '../../utils/stickerHelpers'
import StickerFrameSubmenu from './StickerFrameSubmenu'
import StickerStyleMenuSection from './StickerStyleMenuSection'

const LAYER_ITEMS = [
  { label: '맨 위로', action: 'front' },
  { label: '위로', action: 'forward' },
  { label: '아래로', action: 'backward' },
  { label: '맨 아래로', action: 'back' }
]

const OTHER_ITEMS = [
  { type: 'divider' },
  { label: '곱하기 모드', action: 'toggleMultiply' },
  { label: '액자화', action: 'toggleFrame' },
  { label: '위치 잠금', action: 'toggleLock' },
  { label: '삭제', action: 'delete', danger: true }
]

export default function StickerContextMenu({
  stickerId,
  x,
  y,
  stackIndex = 0,
  stackTotal = 1,
  onCycleStack
}) {
  const { state, dispatch } = useApp()
  const menuRef = useRef(null)
  const [pos, setPos] = useState({ x, y })
  const sticker = (state.settings.stickers || []).find((s) => s.id === stickerId)
  const stickers = state.settings.stickers || []
  const layerIndex = stickers.findIndex((s) => s.id === stickerId)
  const canForward = layerIndex >= 0 && layerIndex < stickers.length - 1
  const canBackward = layerIndex > 0

  useLayoutEffect(() => {
    setPos({ x, y })
  }, [x, y, stickerId])

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos(fitMenuPosition(x, y, rect.width, rect.height))
  }, [x, y, stickerId, stackIndex, stackTotal, layerIndex])

  useLayoutEffect(() => {
    const onPointerDown = (e) => {
      if (menuRef.current?.contains(e.target)) return
      dispatch({ type: 'SET_STICKER_CONTEXT_MENU', payload: null })
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [dispatch])

  if (!sticker) return null

  const run = (action) => {
    switch (action) {
      case 'front':
      case 'forward':
      case 'backward':
      case 'back':
        dispatch({ type: 'REORDER_STICKER', payload: { id: stickerId, direction: action } })
        break
      case 'cycle':
        onCycleStack?.()
        return
      case 'toggleMultiply': {
        const nextMultiply = sticker.blendMode !== 'multiply'
        dispatch({
          type: 'UPDATE_STICKER',
          payload: {
            id: stickerId,
            data: {
              blendMode: nextMultiply ? 'multiply' : 'normal',
              ...(nextMultiply ? { shadowEnabled: false } : {})
            }
          }
        })
        break
      }
      case 'toggleFrame':
        dispatch({
          type: 'UPDATE_STICKER',
          payload: {
            id: stickerId,
            data: { framed: !sticker.framed, tabId: sticker.tabId || state.activeTab }
          }
        })
        break
      case 'toggleLock': {
        const nextLocked = !sticker.locked
        const cw = window.innerWidth
        const ch = window.innerHeight
        if (nextLocked) {
          const pos = resolveStickerDisplayPosition(sticker, cw, ch, sticker.width)
          dispatch({
            type: 'UPDATE_STICKER',
            payload: {
              id: stickerId,
              data: {
                locked: true,
                fixedX: pos.x,
                fixedY: pos.y
              }
            }
          })
        } else {
          const pos = resolveStickerDisplayPosition(sticker, cw, ch, sticker.width)
          dispatch({
            type: 'UPDATE_STICKER',
            payload: {
              id: stickerId,
              data: withAnchorRatios(
                { ...sticker, locked: false, fixedX: undefined, fixedY: undefined },
                pos.x,
                pos.y,
                cw,
                ch,
                sticker.width
              )
            }
          })
        }
        break
      }
      case 'delete':
        dispatch({ type: 'DELETE_STICKER', payload: stickerId })
        dispatch({ type: 'SET_STICKER_CONTEXT_MENU', payload: null })
        return
      default:
        break
    }
    dispatch({ type: 'SET_STICKER_CONTEXT_MENU', payload: null })
  }

  const handleAction = (action) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    run(action)
  }

  return createPortal(
    <div
      ref={menuRef}
      data-sticker-menu
      className="pointer-events-auto fixed z-[9999] min-w-[160px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
      style={{ left: pos.x, top: pos.y, WebkitAppRegion: 'no-drag' }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {stackTotal > 1 && (
        <>
          <p className="px-3 py-1.5 text-[10px] text-[var(--color-text-muted)]">
            겹친 스티커 {stackIndex + 1}/{stackTotal}
          </p>
          <button
            type="button"
            onMouseDown={handleAction('cycle')}
            className="block w-full border-b border-[var(--color-border)] px-3 py-1.5 text-left text-xs text-[var(--color-accent)] hover:bg-black/[0.04]"
          >
            다른 겹친 스티커 선택
          </button>
        </>
      )}

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
            onMouseDown={disabled ? undefined : handleAction(item.action)}
            className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-black/[0.04] disabled:cursor-default disabled:opacity-40`}
          >
            {item.label}
          </button>
        )
      })}

      <StickerStyleMenuSection
        sticker={sticker}
        onUpdate={(data) =>
          dispatch({
            type: 'UPDATE_STICKER',
            payload: { id: stickerId, data, skipPresetSync: true }
          })
        }
      />

      <div className="my-1 border-t border-[var(--color-border)]" />
      <StickerFrameSubmenu
        current={sticker.frameShape}
        onSelect={(frameShape) => {
          dispatch({
            type: 'UPDATE_STICKER',
            payload: { id: stickerId, data: { frameShape } }
          })
          dispatch({ type: 'SET_STICKER_CONTEXT_MENU', payload: null })
        }}
      />

      {OTHER_ITEMS.map((item, i) =>
        item.type === 'divider' ? (
          <div key={`d-${i}`} className="my-1 border-t border-[var(--color-border)]" />
        ) : (
          <button
            key={item.action}
            type="button"
            onMouseDown={handleAction(item.action)}
            className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-black/[0.04] ${
              item.danger ? 'text-red-600' : ''
            } ${sticker.locked && item.action === 'toggleLock' ? 'font-medium text-[var(--color-accent)]' : ''} ${
              sticker.blendMode === 'multiply' && item.action === 'toggleMultiply'
                ? 'font-medium text-[var(--color-accent)]'
                : ''
            } ${sticker.framed && item.action === 'toggleFrame' ? 'font-medium text-[var(--color-accent)]' : ''}`}
          >
            {item.label}
            {sticker.locked && item.action === 'toggleLock' ? ' ✓' : ''}
            {sticker.blendMode === 'multiply' && item.action === 'toggleMultiply' ? ' ✓' : ''}
            {sticker.framed && item.action === 'toggleFrame' ? ' ✓' : ''}
          </button>
        )
      )}
    </div>,
    document.body
  )
}
