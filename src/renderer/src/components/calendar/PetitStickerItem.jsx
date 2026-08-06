import { memo, useEffect, useRef } from 'react'

import { useApp } from '../../context/AppContext'
import { clampInBox, resolveAnchoredPosition, withAnchorRatios } from '../../utils/stickerHelpers'
import { getStickerImageStyle } from '../../utils/stickerStyle'
import StickerTransformHandles from '../decorate/StickerTransformHandles'

import { petitStickerDisplayY } from './PetitStickerLayer'

const DRAG_THRESHOLD_PX = 4

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
  const basePosRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef(null)
  const pendingMoveRef = useRef(null)
  const endDragSessionRef = useRef(null)

  const applyFullStyle = (width) => {
    const img = imgRef.current
    if (img) Object.assign(img.style, getStickerImageStyle(sticker, width ?? sticker.width))
  }

  const boxW = bounds?.width ?? 0
  const boxH = bounds?.height ?? 0
  const ratioPos = resolveAnchoredPosition(sticker, boxW, boxH, sticker.width)
  const displayY = petitStickerDisplayY({ ...sticker, y: ratioPos.y }, scrollMetrics)
  const basePos = { x: ratioPos.x, y: displayY }
  basePosRef.current = basePos

  const syncDom = (data, { lite = false } = {}) => {
    const el = rootRef.current
    const img = imgRef.current
    const inner = innerRef.current
    if (!el) return

    const width = data.width ?? sticker.width
    const origin = basePosRef.current
    let x = data.x ?? origin.x
    let y = data.y ?? origin.y

    if (bounds && (data.x !== undefined || data.y !== undefined) && !lite) {
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
      if (data.translateX !== undefined || data.translateY !== undefined) {
        el.style.transform = `translate3d(${data.translateX ?? 0}px, ${data.translateY ?? 0}px, 0)`
        return
      }
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

    el.style.transform = ''
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.zIndex = String(100 + layerIndex)
    if (inner) inner.style.transform = `rotate(${rotation}deg)`
    applyFullStyle(width)
  }

  useEffect(() => {
    if (dragRef.current) return
    syncDom({ x: basePos.x, y: basePos.y })
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
    const origin = basePosRef.current

    if (bounds) {
      const clamped = clampInBox(
        data.x ?? origin.x,
        data.y ?? origin.y,
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
        data.x ?? origin.x,
        data.y ?? origin.y,
        boxW,
        boxH,
        data.width ?? sticker.width,
        { petit: true }
      )
    }

    dispatch({ type: 'UPDATE_PETIT_STICKER', payload: { id: sticker.id, data } })
    pendingRef.current = null
  }

  const clearRaf = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    pendingMoveRef.current = null
  }

  const applyDragMove = (pt) => {
    const drag = dragRef.current
    if (!drag || !pt) return

    if (drag.mode === 'move') {
      let x = drag.origX + (pt.clientX - drag.startX)
      let y = drag.origY + (pt.clientY - drag.startY)
      if (bounds) {
        const clamped = clampInBox(
          x,
          y,
          drag.stickerW ?? sticker.width,
          bounds.width,
          bounds.height,
          drag.stickerW ?? sticker.width,
          sticker.heightRatio
        )
        x = clamped.x
        y = clamped.y
      }
      const el = rootRef.current
      if (el) {
        el.style.transform = `translate3d(${x - drag.origX}px, ${y - drag.origY}px, 0)`
      }
      pendingRef.current = { ...pendingRef.current, x, y }
    } else if (drag.mode === 'rotate') {
      const angle = Math.atan2(pt.clientY - drag.cy, pt.clientX - drag.cx)
      const rotation = drag.origRotation + ((angle - drag.startAngle) * 180) / Math.PI
      syncDom({ rotation }, { lite: true })
      pendingRef.current = { ...pendingRef.current, rotation }
    } else if (drag.mode === 'resize') {
      const width = Math.max(32, drag.origWidth + (pt.clientX - drag.startX))
      syncDom({ width }, { lite: true })
      pendingRef.current = { ...pendingRef.current, width }
    }
  }

  const scheduleDragMove = (pt) => {
    pendingMoveRef.current = pt
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const next = pendingMoveRef.current
      if (!next || !dragRef.current) return
      applyDragMove(next)
    })
  }

  const endDragSession = (e) => {
    const drag = dragRef.current
    if (!drag) return
    const mode = drag.mode
    const pointerId = e?.pointerId ?? drag.pointerId
    const clientX = e?.clientX
    const clientY = e?.clientY

    if (
      (mode === 'move' || mode === 'rotate' || mode === 'resize') &&
      clientX != null &&
      clientY != null
    ) {
      applyDragMove({ clientX, clientY })
    }

    dragRef.current = null
    clearRaf()

    if (mode === 'move' && rootRef.current) {
      rootRef.current.style.removeProperty('transform')
      if (pendingRef.current?.x !== undefined) {
        syncDom({ x: pendingRef.current.x, y: pendingRef.current.y })
      }
    }

    rootRef.current?.style.removeProperty('will-change')
    innerRef.current?.style.removeProperty('will-change')
    imgRef.current?.style.removeProperty('will-change')
    if (mode === 'resize') applyFullStyle(pendingRef.current?.width ?? sticker.width)

    if (mode === 'move' || mode === 'rotate' || mode === 'resize') {
      commit()
    } else {
      pendingRef.current = null
    }

    try {
      drag.target?.releasePointerCapture?.(pointerId)
    } catch {
      /* ignore */
    }
  }
  endDragSessionRef.current = endDragSession

  const handlePointerDown = (e) => {
    if (sticker.pinned) {
      e.stopPropagation()
      return
    }
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    onSelect()

    if (sticker.locked) return

    if (dragRef.current) endDragSession(e)
    rootRef.current?.style.removeProperty('transform')

    const origin = basePosRef.current
    dragRef.current = {
      mode: 'armed',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: origin.x,
      origY: origin.y,
      stickerW: sticker.width,
      target: e.currentTarget
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
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
    if (dragRef.current) endDragSession(e)
    dragRef.current = {
      mode: 'rotate',
      pointerId: e.pointerId,
      cx,
      cy,
      startAngle: Math.atan2(e.clientY - cy, e.clientX - cx),
      origRotation: sticker.rotation || 0,
      target: e.currentTarget
    }
    innerRef.current?.style.setProperty('will-change', 'transform')
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const handleResizeDown = (e) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    if (dragRef.current) endDragSession(e)
    dragRef.current = {
      mode: 'resize',
      pointerId: e.pointerId,
      startX: e.clientX,
      origWidth: sticker.width,
      target: e.currentTarget
    }
    imgRef.current?.style.setProperty('will-change', 'width')
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const handlePointerMove = (e) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.pointerId != null && e.pointerId !== drag.pointerId) return
    e.stopPropagation()

    if (drag.mode === 'armed') {
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return
      drag.mode = 'move'
      rootRef.current?.style.setProperty('will-change', 'transform')
    }

    if (drag.mode === 'move') {
      applyDragMove({ clientX: e.clientX, clientY: e.clientY })
      return
    }
    scheduleDragMove({ clientX: e.clientX, clientY: e.clientY })
  }

  const handlePointerUp = (e) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.pointerId != null && e.pointerId !== drag.pointerId) return
    e.stopPropagation()
    endDragSession(e)
  }

  useEffect(() => {
    const onWindowUp = (e) => {
      if (!dragRef.current) return
      endDragSessionRef.current?.(e)
    }
    window.addEventListener('pointerup', onWindowUp, true)
    window.addEventListener('pointercancel', onWindowUp, true)
    return () => {
      window.removeEventListener('pointerup', onWindowUp, true)
      window.removeEventListener('pointercancel', onWindowUp, true)
      clearRaf()
      dragRef.current = null
    }
  }, [])

  const imageStyle = getStickerImageStyle(sticker)
  const showHandles = selected && !sticker.locked && !sticker.pinned

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
      onPointerCancel={handlePointerUp}
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
          data-sticker-select-frame={selected ? '' : undefined}
          className="relative inline-block"
          style={
            selected
              ? { boxShadow: '0 0 0 2px #ffffff, 0 0 0 4px #3b82f6' }
              : undefined
          }
        >
          <img
            ref={imgRef}
            src={sticker.src}
            alt=""
            draggable={false}
            className="block max-w-none"
            style={imageStyle}
          />
          {showHandles && (
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
