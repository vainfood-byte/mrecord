import { memo, useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { useApp } from '../../context/AppContext'
import PetitStickerItem from './PetitStickerItem'
import PetitStickerContextMenu from './PetitStickerContextMenu'

const LAYER_ISOLATION = {
  contain: 'layout style',
  willChange: 'transform'
}

const EMPTY_PETIT = []

export function getPetitStickerScrollMetrics(containerRef, viewportRef) {
  const box = containerRef.current
  const vp = viewportRef?.current
  if (!box || !vp) return null
  return {
    scrollTop: vp.scrollTop,
    viewportOffset: vp.offsetTop,
    viewportHeight: vp.clientHeight,
    scrollHeight: vp.scrollHeight
  }
}

export function petitStickerDisplayY(sticker, metrics) {
  if (!metrics) return sticker.y
  if (sticker.pinned) {
    return metrics.viewportOffset + sticker.y - metrics.scrollTop
  }
  return sticker.y
}

export function convertPetitStickerCoords(sticker, metrics, toPinned) {
  if (!metrics) return { y: sticker.y }
  if (toPinned) {
    return { y: sticker.y - metrics.viewportOffset + metrics.scrollTop }
  }
  return { y: metrics.viewportOffset + sticker.y - metrics.scrollTop }
}

function PetitStickerLayer({ monthKey, containerRef, viewportRef }) {
  const { state } = useApp()
  const [selectedId, setSelectedId] = useState(null)
  const [menu, setMenu] = useState(null)
  const [bounds, setBounds] = useState(null)
  const [scrollTop, setScrollTop] = useState(0)
  const cycleRef = useRef({ x: 0, y: 0, ids: [], index: 0 })
  const activePresetSlot = state.settings.activePresetSlot ?? 0
  const prevSlotRef = useRef(activePresetSlot)
  const switchGenRef = useRef(0)

  const allStickersSource = state.settings.calendarPetitStickers ?? EMPTY_PETIT
  const [allStickers, setAllStickers] = useState(allStickersSource)
  const [layerKey, setLayerKey] = useState(activePresetSlot)

  useEffect(() => {
    if (prevSlotRef.current !== activePresetSlot) {
      prevSlotRef.current = activePresetSlot
      const gen = ++switchGenRef.current
      setAllStickers([])
      setLayerKey(activePresetSlot)
      setSelectedId(null)
      setMenu(null)
      cycleRef.current = { x: 0, y: 0, ids: [], index: 0 }
      startTransition(() => {
        if (switchGenRef.current !== gen) return
        setAllStickers(allStickersSource)
      })
      return
    }
    setAllStickers(allStickersSource)
  }, [activePresetSlot, allStickersSource])

  const visibleStickers = useMemo(
    () => allStickers.filter((s) => s.locked || s.monthKey === monthKey),
    [allStickers, monthKey]
  )

  const hasPinned = visibleStickers.some((s) => s.pinned)

  const scrollMetrics = useMemo(() => {
    if (!hasPinned) return null
    const box = containerRef.current
    const vp = viewportRef?.current
    if (!box || !vp) return null
    return {
      scrollTop,
      viewportOffset: vp.offsetTop,
      viewportHeight: vp.clientHeight,
      scrollHeight: vp.scrollHeight
    }
  }, [containerRef, viewportRef, scrollTop, bounds, hasPinned])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      setBounds({ width: el.clientWidth, height: el.clientHeight })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])

  useEffect(() => {
    const vp = viewportRef?.current
    if (!vp || !hasPinned) return
    const onScroll = () => setScrollTop(vp.scrollTop)
    onScroll()
    vp.addEventListener('scroll', onScroll, { passive: true })
    return () => vp.removeEventListener('scroll', onScroll)
  }, [viewportRef, hasPinned])

  useEffect(() => {
    const onDown = (e) => {
      if (e.target.closest('[data-petit-sticker-root]')) return
      if (e.target.closest('[data-petit-sticker-menu]')) return
      setSelectedId(null)
      setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const openMenu = useCallback((x, y) => {
    const nodes = document.querySelectorAll('[data-petit-sticker-root]')
    const hits = []
    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        hits.push({
          id: node.getAttribute('data-petit-sticker-id'),
          z: Number(node.style.zIndex) || 0
        })
      }
    })
    hits.sort((a, b) => b.z - a.z)
    if (!hits.length) return

    const ids = hits.map((h) => h.id)
    const prev = cycleRef.current
    const sameSpot =
      Math.hypot(x - prev.x, y - prev.y) < 12 &&
      ids.length === prev.ids.length &&
      ids.every((id, i) => id === prev.ids[i])

    let index = 0
    if (ids.length > 1 && sameSpot) index = (prev.index + 1) % ids.length
    cycleRef.current = { x, y, ids, index }

    const targetId = ids[index]
    setSelectedId(targetId)
    setMenu({ stickerId: targetId, x, y })
  }, [])

  const getScrollMetrics = useCallback(
    () => getPetitStickerScrollMetrics(containerRef, viewportRef),
    [containerRef, viewportRef]
  )

  if (!visibleStickers.length && !menu) return null

  return (
    <>
      <div
        key={layerKey}
        className="pointer-events-none absolute inset-0 z-20"
        style={LAYER_ISOLATION}
        data-petit-sticker-layer
      >
        {visibleStickers.map((sticker, idx) => {
          const layerIndex = allStickers.findIndex((s) => s.id === sticker.id)
          return (
            <PetitStickerItem
              key={sticker.id}
              sticker={sticker}
              layerIndex={layerIndex >= 0 ? layerIndex : idx}
              selected={selectedId === sticker.id}
              bounds={bounds}
              scrollMetrics={scrollMetrics}
              onSelect={() => setSelectedId(sticker.id)}
              onContextMenu={openMenu}
            />
          )
        })}
      </div>
      {menu && (
        <PetitStickerContextMenu
          stickerId={menu.stickerId}
          x={menu.x}
          y={menu.y}
          getScrollMetrics={getScrollMetrics}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}

export default memo(PetitStickerLayer)
