import { memo, useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { useApp } from '../../context/AppContext'
import { useStickerViewport } from '../../hooks/useStickerViewport'
import StickerItem from './StickerItem'
import StickerContextMenu from './StickerContextMenu'
import { getStickerHitsAtPoint } from '../../utils/stickerHelpers'
import { setSelectedStickerId } from '../../utils/stickerSelectionStore'

const TIER_CONFIG = {
  multiply: { layerZ: 'z-[50]', zIndexBase: 10 },
  normal: { layerZ: 'z-[56]', zIndexBase: 100 }
}

const LAYER_ISOLATION = {
  contain: 'layout style',
  willChange: 'transform'
}

const EMPTY_STICKERS = []

const StickerLayerTier = memo(function StickerLayerTier({
  tier,
  visibleStickers,
  stickerIndexById,
  viewportSize,
  dispatch,
  onContextMenu
}) {
  const config = TIER_CONFIG[tier]
  if (!visibleStickers.length) return null

  return (
    <div
      data-global-sticker-layer
      data-sticker-tier={tier}
      className={`pointer-events-none fixed inset-0 ${config.layerZ}`}
      style={LAYER_ISOLATION}
    >
      {visibleStickers.map((sticker) => {
        const idx = stickerIndexById.get(sticker.id) ?? 0
        return (
          <StickerItem
            key={sticker.id}
            sticker={sticker}
            viewportSize={viewportSize}
            layerIndex={idx}
            zIndexBase={config.zIndexBase}
            dispatch={dispatch}
            onContextMenu={onContextMenu}
          />
        )
      })}
    </div>
  )
})

function StickerLayer({ placement = 'normal' }) {
  const { state, dispatch } = useApp()
  const cycleRef = useRef({ x: 0, y: 0, ids: [], index: 0 })
  const prevSlotRef = useRef(state.settings.activePresetSlot ?? 0)
  const switchGenRef = useRef(0)

  const stickers = state.settings.stickers ?? EMPTY_STICKERS
  const activePresetSlot = state.settings.activePresetSlot ?? 0
  const activeTab = state.activeTab

  const [renderStickers, setRenderStickers] = useState(stickers)
  const [layerKey, setLayerKey] = useState(activePresetSlot)

  useEffect(() => {
    if (prevSlotRef.current !== activePresetSlot) {
      prevSlotRef.current = activePresetSlot
      const gen = ++switchGenRef.current
      setRenderStickers([])
      setLayerKey(activePresetSlot)
      cycleRef.current = { x: 0, y: 0, ids: [], index: 0 }
      startTransition(() => {
        if (switchGenRef.current !== gen) return
        setRenderStickers(stickers)
      })
      return
    }
    setRenderStickers(stickers)
  }, [activePresetSlot, stickers])

  const allVisible = useMemo(
    () => renderStickers.filter((s) => s.framed || s.tabId === activeTab),
    [renderStickers, activeTab]
  )
  const multiplyStickers = useMemo(
    () => allVisible.filter((s) => s.blendMode === 'multiply'),
    [allVisible]
  )
  const normalStickers = useMemo(
    () => allVisible.filter((s) => s.blendMode !== 'multiply'),
    [allVisible]
  )
  const { stickerContextMenu } = state
  const viewportSize = useStickerViewport()
  const stickerIndexById = useMemo(() => {
    const map = new Map()
    renderStickers.forEach((s, i) => map.set(s.id, i))
    return map
  }, [renderStickers])

  useEffect(() => {
    if (placement !== 'normal') return undefined
    const onDown = (e) => {
      if (e.target.closest('[data-sticker-root]')) return
      if (e.target.closest('[data-sticker-menu]')) return
      if (e.target.closest('[data-decorate-panel]')) return
      if (e.target.closest('[data-lock-dialog]')) return
      if (e.target.closest('[data-date-picker-portal]')) return
      if (e.target.closest('[data-popup-root]')) return
      /* 선택 해제는 외부 스토어만 — 갤러리 동기 리렌더 없이 파란상자 즉시 제거 */
      setSelectedStickerId(null)
      startTransition(() => {
        dispatch({ type: 'SET_STICKER_CONTEXT_MENU', payload: null })
      })
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [dispatch, placement])

  const openContextMenu = useCallback(
    (x, y) => {
      const hits = getStickerHitsAtPoint(x, y)
      if (!hits.length) return

      const ids = hits.map((h) => h.id)
      const prev = cycleRef.current
      const sameSpot =
        Math.hypot(x - prev.x, y - prev.y) < 12 &&
        ids.length === prev.ids.length &&
        ids.every((id, i) => id === prev.ids[i])

      let index = 0
      if (ids.length > 1 && sameSpot) {
        index = (prev.index + 1) % ids.length
      }

      cycleRef.current = { x, y, ids, index }
      const targetId = ids[index]

      setSelectedStickerId(targetId)
      startTransition(() => {
        dispatch({
          type: 'SET_STICKER_CONTEXT_MENU',
          payload: { stickerId: targetId, x, y, stackIndex: index, stackTotal: ids.length }
        })
      })
    },
    [dispatch]
  )

  const handleContextMenu = useCallback((x, y) => openContextMenu(x, y), [openContextMenu])

  const handleCycleStack = useCallback(() => {
    if (!stickerContextMenu) return
    openContextMenu(stickerContextMenu.x, stickerContextMenu.y)
  }, [openContextMenu, stickerContextMenu])

  if (placement === 'multiply') {
    if (!multiplyStickers.length) return null
    return (
      <StickerLayerTier
        key={`m-${layerKey}`}
        tier="multiply"
        visibleStickers={multiplyStickers}
        stickerIndexById={stickerIndexById}
        viewportSize={viewportSize}
        dispatch={dispatch}
        onContextMenu={handleContextMenu}
      />
    )
  }

  if (!normalStickers.length && !stickerContextMenu) return null

  return (
    <>
      {normalStickers.length > 0 && (
        <StickerLayerTier
          key={`n-${layerKey}`}
          tier="normal"
          visibleStickers={normalStickers}
          stickerIndexById={stickerIndexById}
          viewportSize={viewportSize}
          dispatch={dispatch}
          onContextMenu={handleContextMenu}
        />
      )}

      {stickerContextMenu && (
        <StickerContextMenu
          stickerId={stickerContextMenu.stickerId}
          x={stickerContextMenu.x}
          y={stickerContextMenu.y}
          stackIndex={stickerContextMenu.stackIndex ?? 0}
          stackTotal={stickerContextMenu.stackTotal ?? 1}
          onCycleStack={handleCycleStack}
        />
      )}
    </>
  )
}

export default memo(StickerLayer)
