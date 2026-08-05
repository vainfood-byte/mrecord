import { memo, useEffect, useRef } from 'react'

import { useApp } from '../../context/AppContext'
import { clampInBox, resolveAnchoredPosition, withAnchorRatios } from '../../utils/stickerHelpers'
import { getStickerImageStyle } from '../../utils/stickerStyle'
import StickerTransformHandles from '../decorate/StickerTransformHandles'

import { petitStickerDisplayY } from './PetitStickerLayer'

function PetitStickerItem({
  sticker,
  selected,
  layerIndex,
  bounds,
  scrollMetrics,
  onSelect,
  onContextMenu
}) {
  const { dispatch } = useApp()

  const rootRef = useRef(null)

  const imgRef = useRef(null)

  const innerRef = useRef(null)

  const dragRef = useRef(null)

  const pendingRef = useRef(null)

  const applyFullStyle = (width) => {
    const img = imgRef.current
    if (img) Object.assign(img.style, getStickerImageStyle(sticker, width ?? sticker.width))
  }

  const boxW = bounds?.width ?? 0
  const boxH = bounds?.height ?? 0
  const ratioPos = resolveAnchoredPosition(sticker, boxW, boxH, sticker.width)
  const displayY = petitStickerDisplayY({ ...sticker, y: ratioPos.y }, scrollMetrics)
  const basePos = { x: ratioPos.x, y: displayY }

  const syncDom = (data, { lite = false } = {}) => {
    const el = rootRef.current
    const img = imgRef.current
    const inner = innerRef.current
    if (!el) return

    const width = data.width ?? sticker.width
    let x = data.x ?? basePos.x
    let y = data.y ?? basePos.y

    if (bounds && (data.x !== undefined || data.y !== undefined)) {
      const clamped = clampInBox(
        x,
        y,
        width,
        bounds.width,
        bounds.height,
        width,
        sticker.heightRatio
      )
      x = clamped.x
      y = clamped.y
    }

    const rotation = data.rotation ?? sticker.rotation ?? 0

    if (lite) {
      if (data.x !== undefined || data.y !== undefined) {
        el.style.left = `${x}px`
        el.style.top = `${y}px`
      }
      if (data.width !== undefined && img) {
        img.style.width = `${width}px`
      }
      if (data.rotation !== undefined && inner) {
        inner.style.transform = `rotate(${rotation}deg)`
      }
      return
    }

    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.zIndex = String(100 + layerIndex)
    if (inner) inner.style.transform = `rotate(${rotation}deg)`
    applyFullStyle(width)
  }

  useEffect(() => {
    if (dragRef.current) return
    syncDom({ x: sticker.x, y: basePos.y })
  }, [
    sticker.x,
    sticker.y,
    sticker.xRatio,
    sticker.yRatio,
    sticker.rotation,
    sticker.width,
    sticker.shadowEnabled,
    sticker.borderColor,
    sticker.borderCustomColor,
    sticker.opacity,
    sticker.pinned,
    layerIndex,
    bounds,
    basePos.x,
    basePos.y
  ])

  const commit = () => {
    if (!pendingRef.current) return
    let data = { ...pendingRef.current }

    if (bounds) {
      const clamped = clampInBox(
        data.x ?? basePos.x,
        data.y ?? basePos.y,
        data.width ?? sticker.width,
        bounds.width,
        bounds.height,
        data.width ?? sticker.width,
        sticker.heightRatio
      )
      data = { ...data, ...clamped }
    }

    if (sticker.pinned && scrollMetrics && data.y !== undefined) {
      data.y = data.y - scrollMetrics.viewportOffset + scrollMetrics.scrollTop
    }

    if (boxW > 0 && boxH > 0 && (data.x !== undefined || data.y !== undefined)) {
      data = withAnchorRatios(
        { ...sticker, ...data },
        data.x ?? basePos.x,
        data.y ?? data.y ?? basePos.y,
        boxW,
        boxH,
        data.width ?? sticker.width,
        { petit: true }
      )
    }

    dispatch({ type: 'UPDATE_PETIT_STICKER', payload: { id: sticker.id, data } })
    pendingRef.current = null
  }

  const handlePointerDown = (e) => {
    if (sticker.pinned) {
      e.stopPropagation()
      return
    }
    if (e.button !== 0) return
    e.stopPropagation()
    onSelect()
    if (!sticker.locked) {
      dragRef.current = {
        mode: 'move',
        startX: e.clientX,
        startY: e.clientY,
        origX: basePos.x,
        origY: basePos.y
      }
      rootRef.current?.style.setProperty('will-change', 'left, top')
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }

  const handleRotateDown = (e) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    dragRef.current = {
      mode: 'rotate',
      cx,
      cy,
      startAngle: Math.atan2(e.clientY - cy, e.clientX - cx),
      origRotation: sticker.rotation || 0
    }
    innerRef.current?.style.setProperty('will-change', 'transform')
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleResizeDown = (e) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    dragRef.current = { mode: 'resize', startX: e.clientX, origWidth: sticker.width }
    imgRef.current?.style.setProperty('will-change', 'width')
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.mode === 'move') {
      let x = drag.origX + (e.clientX - drag.startX)
      let y = drag.origY + (e.clientY - drag.startY)
      if (bounds) {
        const clamped = clampInBox(
          x,
          y,
          sticker.width,
          bounds.width,
          bounds.height,
          sticker.width,
          sticker.heightRatio
        )
        x = clamped.x
        y = clamped.y
      }
      syncDom({ x, y }, { lite: true })
      pendingRef.current = { ...pendingRef.current, x, y }
    } else if (drag.mode === 'rotate') {
      const angle = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx)
      const rotation = drag.origRotation + ((angle - drag.startAngle) * 180) / Math.PI
      syncDom({ rotation }, { lite: true })
      pendingRef.current = { ...pendingRef.current, rotation }
    } else if (drag.mode === 'resize') {
      const width = Math.max(32, drag.origWidth + (e.clientX - drag.startX))
      syncDom({ width }, { lite: true })
      pendingRef.current = { ...pendingRef.current, width }
    }
  }

  const handlePointerUp = (e) => {
    if (!dragRef.current) return
    const mode = dragRef.current.mode
    dragRef.current = null
    rootRef.current?.style.removeProperty('will-change')
    innerRef.current?.style.removeProperty('will-change')
    imgRef.current?.style.removeProperty('will-change')
    if (mode === 'resize') applyFullStyle(pendingRef.current?.width ?? sticker.width)
    commit()
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  const imageStyle = getStickerImageStyle(sticker)

  return (
    <div
      ref={rootRef}
      data-petit-sticker-root
      data-petit-sticker-id={sticker.id}
      className="absolute touch-none select-none"
      style={{
        left: basePos.x,
        top: basePos.y,
        zIndex: 100 + layerIndex,
        pointerEvents: 'auto'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onSelect()
        onContextMenu(e.clientX, e.clientY)
      }}
    >
      <div
        ref={innerRef}
        data-petit-inner
        className="relative"
        style={{ transform: `rotate(${sticker.rotation || 0}deg)` }}
      >
        <div
          className={`relative inline-block ${selected ? 'ring-2 ring-dashed ring-[var(--color-accent)]' : ''}`}
        >
          <img
            ref={imgRef}
            src={sticker.src}
            alt=""
            draggable={false}
            className="block max-w-none"
            style={imageStyle}
          />
          {selected && !sticker.locked && !sticker.pinned && (
            <StickerTransformHandles
              onRotateDown={handleRotateDown}
              onResizeDown={handleResizeDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(PetitStickerItem)
