import { memo, useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

import { getStickerImageStyle } from '../../utils/stickerStyle'
import { resolveStickerDisplayPosition, withAnchorRatios, clampStickerToWindow } from '../../utils/stickerHelpers'
import {
  getIsStickerSelected,
  setSelectedStickerId,
  subscribeSelectedSticker
} from '../../utils/stickerSelectionStore'
import StickerTransformHandles from './StickerTransformHandles'

const DRAG_THRESHOLD_PX = 4

function useIsSelected(stickerId) {
  return useSyncExternalStore(
    subscribeSelectedSticker,
    () => getIsStickerSelected(stickerId),
    () => false
  )
}

function StickerItem({
  sticker,
  viewportSize,
  layerIndex,
  zIndexBase = 100,
  dispatch,
  onContextMenu
}) {
  const selected = useIsSelected(sticker.id)
  const rootRef = useRef(null)
  const imgRef = useRef(null)
  const innerRef = useRef(null)
  const dragRef = useRef(null)
  const pendingRef = useRef(null)
  const viewportRef = useRef(viewportSize)
  const rafRef = useRef(null)
  const pendingMoveRef = useRef(null)
  const basePosRef = useRef({ x: 0, y: 0 })
  const endDragSessionRef = useRef(null)

  useEffect(() => {
    viewportRef.current = viewportSize
  }, [viewportSize])

  const display = resolveStickerDisplayPosition(
    sticker,
    viewportSize.w,
    viewportSize.h,
    sticker.width
  )
  const basePos = { x: display.x, y: display.y }
  basePosRef.current = basePos

  const editable = !sticker.locked

  const applyFullStyle = (width) => {
    const img = imgRef.current
    if (img) Object.assign(img.style, getStickerImageStyle(sticker, width ?? sticker.width))
  }

  const syncDom = (data, { lite = false } = {}) => {
    const el = rootRef.current
    const img = imgRef.current
    const inner = innerRef.current
    if (!el) return

    const origin = basePosRef.current
    let x = data.x ?? origin.x
    let y = data.y ?? origin.y
    const width = data.width ?? sticker.width

    if (!lite) {
      const vp = viewportRef.current
      if (vp.w > 0 && vp.h > 0) {
        const clamped = clampStickerToWindow(x, y, width, vp.w, vp.h, { ...sticker, width })
        x = clamped.x
        y = clamped.y
      }
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
    if (inner) inner.style.transform = `rotate(${rotation}deg)`
    applyFullStyle(width)
  }

  useEffect(() => {
    if (dragRef.current) return
    syncDom({ x: basePos.x, y: basePos.y })
    if (rootRef.current) {
      rootRef.current.style.zIndex = String(zIndexBase + layerIndex)
    }
  }, [
    basePos.x,
    basePos.y,
    viewportSize.w,
    viewportSize.h,
    sticker.rotation,
    sticker.width,
    sticker.shadowEnabled,
    sticker.borderColor,
    sticker.borderCustomColor,
    sticker.blendMode,
    sticker.opacity,
    sticker.offsetRightRatio,
    sticker.offsetBottomRatio,
    layerIndex,
    zIndexBase
  ])

  const commit = () => {
    if (!pendingRef.current || !dispatch) return
    let data = { ...pendingRef.current }
    const width = data.width ?? sticker.width
    const draft = { ...sticker, ...data, width }
    const vp = viewportRef.current
    const origin = basePosRef.current

    if (data.x !== undefined || data.y !== undefined || data.width !== undefined) {
      const clamped = clampStickerToWindow(
        data.x ?? origin.x,
        data.y ?? origin.y,
        width,
        vp.w,
        vp.h,
        draft
      )
      data = withAnchorRatios(draft, clamped.x, clamped.y, vp.w, vp.h, width)
    }

    dispatch({
      type: 'UPDATE_STICKER',
      payload: { id: sticker.id, data, skipPresetSync: true }
    })
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
    if (drag.mode !== 'move' && drag.mode !== 'rotate' && drag.mode !== 'resize') return

    const vp = viewportRef.current

    if (drag.mode === 'move') {
      const nextX = drag.origX + (pt.clientX - drag.startX)
      const nextY = drag.origY + (pt.clientY - drag.startY)
      const w = drag.stickerW ?? sticker.width
      const clamped = clampStickerToWindow(nextX, nextY, w, vp.w, vp.h, sticker)
      const el = rootRef.current
      if (el) {
        el.style.transform = `translate3d(${clamped.x - drag.origX}px, ${clamped.y - drag.origY}px, 0)`
      }
      pendingRef.current = { x: clamped.x, y: clamped.y }
    } else if (drag.mode === 'rotate') {
      const angle = Math.atan2(pt.clientY - drag.cy, pt.clientX - drag.cx)
      const rotation = drag.origRotation + ((angle - drag.startAngle) * 180) / Math.PI
      syncDom({ rotation }, { lite: true })
      pendingRef.current = { rotation }
    } else if (drag.mode === 'resize') {
      const width = Math.max(40, drag.origWidth + (pt.clientX - drag.startX))
      const clamped = clampStickerToWindow(
        drag.origX,
        drag.origY,
        width,
        vp.w,
        vp.h,
        { ...sticker, width }
      )
      syncDom({ width, x: clamped.x, y: clamped.y }, { lite: true })
      pendingRef.current = { width, x: clamped.x, y: clamped.y }
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

  const blockBubble = (e) => {
    e.stopPropagation()
    e.preventDefault()
  }

  const selectSelf = useCallback(() => {
    setSelectedStickerId(sticker.id)
  }, [sticker.id])

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
    if (e.button !== 0) return
    blockBubble(e)
    if (!selected) selectSelf()

    if (!editable) return

    /* 이전 드래그가 남아 translate/추종이 이어지지 않게 정리 */
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
    /* threshold 전에 캡처해야 pointerup 유실·유령 추종을 막음 */
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const handleRotateDown = (e) => {
    if (!editable) return
    blockBubble(e)
    if (!selected) selectSelf()
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
    if (!editable) return
    blockBubble(e)
    if (!selected) selectSelf()
    const origin = basePosRef.current
    if (dragRef.current) endDragSession(e)
    dragRef.current = {
      mode: 'resize',
      pointerId: e.pointerId,
      startX: e.clientX,
      origWidth: sticker.width,
      origX: origin.x,
      origY: origin.y,
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

    /* 이동은 즉시 반영(렉 감소), 회전/리사이즈만 rAF 합침 */
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
    blockBubble(e)
    endDragSession(e)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setSelectedStickerId(null)
    }
    const onWindowUp = (e) => {
      if (!dragRef.current) return
      endDragSessionRef.current?.(e)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerup', onWindowUp, true)
    window.addEventListener('pointercancel', onWindowUp, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerup', onWindowUp, true)
      window.removeEventListener('pointercancel', onWindowUp, true)
      clearRaf()
      dragRef.current = null
    }
  }, [])

  const imageStyle = getStickerImageStyle(sticker)
  const showHandles = selected && editable

  if (!display.visible) return null

  return (
    <div
      ref={rootRef}
      data-sticker-root
      data-sticker-id={sticker.id}
      className="absolute touch-none select-none"
      style={{
        left: basePos.x,
        top: basePos.y,
        zIndex: zIndexBase + layerIndex,
        pointerEvents: 'auto',
        WebkitAppRegion: 'no-drag'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseDown={blockBubble}
      onClick={blockBubble}
      onContextMenu={(e) => {
        blockBubble(e)
        if (!selected) selectSelf()
        onContextMenu(e.clientX, e.clientY)
      }}
    >
      <div
        ref={innerRef}
        className="relative"
        style={{ transform: `rotate(${sticker.rotation || 0}deg)` }}
      >
        <div
          data-sticker-select-frame={showHandles ? '' : undefined}
          className="relative inline-block"
          style={
            showHandles
              ? { boxShadow: '0 0 0 2px #ffffff, 0 0 0 4px #3b82f6' }
              : sticker.blendMode === 'multiply'
                ? { isolation: 'isolate' }
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

function propsEqual(prev, next) {
  return (
    prev.sticker === next.sticker &&
    prev.layerIndex === next.layerIndex &&
    prev.zIndexBase === next.zIndexBase &&
    prev.dispatch === next.dispatch &&
    prev.onContextMenu === next.onContextMenu &&
    prev.viewportSize?.w === next.viewportSize?.w &&
    prev.viewportSize?.h === next.viewportSize?.h
  )
}

export default memo(StickerItem, propsEqual)
