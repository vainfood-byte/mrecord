import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const overlayRoot = document.getElementById('overlay-root')
const MIN_SCALE = 0.2
const MAX_ZOOM_RATIO = 3
const MIN_FRAME = 48

/** 표지/커버 크롭 — 드래그·줌으로 영역 지정, freeResize 시 프레임 크기 자유 조절 */
export default function CoverCropEditor({
  imageUrl,
  aspect = 168 / 240,
  freeResize = false,
  onApply,
  onClose
}) {
  const viewportRef = useRef(null)
  const imgRef = useRef(null)
  const dragRef = useRef(null)
  const frameResizeRef = useRef(null)
  const fitScaleRef = useRef(1)

  const [viewport, setViewport] = useState({ w: 320, h: 480 })
  const [frame, setFrame] = useState({ w: 200, h: 280 })
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  const framePos = {
    x: (viewport.w - frame.w) / 2,
    y: (viewport.h - frame.h) / 2
  }

  const fitImage = useCallback((nw, nh, fw, fh, vpW, vpH) => {
    if (!nw || !nh || !vpW || !vpH) return
    const s = Math.max(fw / nw, fh / nh)
    fitScaleRef.current = s
    const frameX = (vpW - fw) / 2
    const frameY = (vpH - fh) / 2
    setScale(s)
    setOffset({
      x: frameX + (fw - nw * s) / 2,
      y: frameY + (fh - nh * s) / 2
    })
  }, [])

  const initFrameSize = useCallback((vpW, vpH) => {
    if (freeResize) {
      const fw = Math.min(vpW - 24, 220)
      const fh = Math.min(vpH - 24, fw / aspect)
      return { w: fw, h: fh }
    }
    const fw = Math.min(vpW - 24, (vpH - 24) * aspect)
    return { w: fw, h: fw / aspect }
  }, [aspect, freeResize])

  const getMinScale = useCallback(() => {
    const fit = fitScaleRef.current || MIN_SCALE
    return Math.min(MIN_SCALE, fit)
  }, [])

  const getMaxScale = useCallback(() => {
    const fit = fitScaleRef.current || MIN_SCALE
    return fit * MAX_ZOOM_RATIO
  }, [])

  const resetToFit = useCallback(
    (fw = frame.w, fh = frame.h) => {
      const fit = fitScaleRef.current
      const fx = (viewport.w - fw) / 2
      const fy = (viewport.h - fh) / 2
      const dw = natural.w * fit
      const dh = natural.h * fit
      setScale(fit)
      setOffset({
        x: fx + (fw - dw) / 2,
        y: fy + (fh - dh) / 2
      })
    },
    [frame.h, frame.w, natural.h, natural.w, viewport.h, viewport.w]
  )

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => {
      const vpW = el.clientWidth
      const vpH = el.clientHeight
      const next = initFrameSize(vpW, vpH)
      setViewport({ w: vpW, h: vpH })
      setFrame(next)
      if (natural.w && natural.h) fitImage(natural.w, natural.h, next.w, next.h, vpW, vpH)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect, fitImage, initFrameSize, natural.h, natural.w])

  useEffect(() => {
    const onEsc = (e) => {
      e.preventDefault()
      onClose()
    }
    window.addEventListener('mrecord:escape', onEsc)
    return () => window.removeEventListener('mrecord:escape', onEsc)
  }, [onClose])

  const clampOffset = useCallback(
    (nextScale, nextOffset, fw = frame.w, fh = frame.h) => {
      const fx = (viewport.w - fw) / 2
      const fy = (viewport.h - fh) / 2
      const dw = natural.w * nextScale
      const dh = natural.h * nextScale
      return {
        x: Math.min(fx, Math.max(fx + fw - dw, nextOffset.x)),
        y: Math.min(fy, Math.max(fy + fh - dh, nextOffset.y))
      }
    },
    [frame.h, frame.w, natural.h, natural.w, viewport.h, viewport.w]
  )

  const onImgLoad = () => {
    const img = imgRef.current
    const el = viewportRef.current
    if (!img || !el) return
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    setNatural({ w: nw, h: nh })
    const vpW = el.clientWidth
    const vpH = el.clientHeight
    const next = initFrameSize(vpW, vpH)
    setFrame(next)
    fitImage(nw, nh, next.w, next.h, vpW, vpH)
  }

  const zoomAt = (delta, cx, cy) => {
    setScale((prev) => {
      const fit = fitScaleRef.current
      const minS = Math.min(MIN_SCALE, fit)
      const maxS = fit * MAX_ZOOM_RATIO
      let next = Math.min(maxS, Math.max(minS, prev + delta))

      if (delta < 0 && next <= fit + 0.02) {
        resetToFit()
        return fit
      }

      setOffset((off) => {
        const ratio = next / prev
        const nx = cx - (cx - off.x) * ratio
        const ny = cy - (cy - off.y) * ratio
        return clampOffset(next, { x: nx, y: ny })
      })
      return next
    })
  }

  const setZoomScale = (targetScale) => {
    const fit = fitScaleRef.current
    const minS = Math.min(MIN_SCALE, fit)
    const maxS = fit * MAX_ZOOM_RATIO
    const next = Math.min(maxS, Math.max(minS, targetScale))
    const cx = viewport.w / 2
    const cy = viewport.h / 2

    if (next <= fit + 0.02) {
      resetToFit()
      return
    }

    setScale((prev) => {
      setOffset((off) => {
        const ratio = next / prev
        return clampOffset(next, {
          x: cx - (cx - off.x) * ratio,
          y: cy - (cy - off.y) * ratio
        })
      })
      return next
    })
  }

  const onWheel = (e) => {
    e.preventDefault()
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const step = fitScaleRef.current * 0.5
    zoomAt(e.deltaY < 0 ? step : -step, e.clientX - rect.left, e.clientY - rect.top)
  }

  const onPointerDown = (e) => {
    if (frameResizeRef.current) return
    e.preventDefault()
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e) => {
    if (frameResizeRef.current) {
      const r = frameResizeRef.current
      const dx = e.clientX - r.startX
      const dy = e.clientY - r.startY
      const maxW = viewport.w - 24
      const maxH = viewport.h - 24
      const nextW = Math.min(maxW, Math.max(MIN_FRAME, r.origW + dx))
      const nextH = Math.min(maxH, Math.max(MIN_FRAME, r.origH + dy))
      setFrame({ w: nextW, h: nextH })
      setOffset((off) => clampOffset(scale, off, nextW, nextH))
      return
    }
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    setOffset(
      clampOffset(scale, {
        x: dragRef.current.ox + dx,
        y: dragRef.current.oy + dy
      })
    )
  }

  const onPointerUp = (e) => {
    dragRef.current = null
    if (frameResizeRef.current) {
      frameResizeRef.current = null
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    }
  }

  const onFrameResizeDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    frameResizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: frame.w,
      origH: frame.h
    }
    viewportRef.current?.setPointerCapture(e.pointerId)
  }

  const applyCrop = () => {
    const img = imgRef.current
    if (!img?.naturalWidth) return
    const fx = framePos.x
    const fy = framePos.y
    const sx = (fx - offset.x) / scale
    const sy = (fy - offset.y) / scale
    const sw = frame.w / scale
    const sh = frame.h / scale
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sw))
    canvas.height = Math.max(1, Math.round(sh))
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    onApply?.(canvas.toDataURL('image/png'))
    onClose()
  }

  const fitScale = fitScaleRef.current
  const minScale = getMinScale()
  const maxScale = getMaxScale()
  const displayPct = fitScale > 0 ? Math.round((scale / fitScale) * 100) : Math.round(scale * 100)

  const modal = (
    <div
      className="fixed inset-0 z-[100010] flex flex-col bg-black/80"
      onMouseDown={onClose}
      data-cover-crop
    >
      <div
        className="flex shrink-0 items-center justify-between px-4 py-3 text-white"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-medium">
          크롭 — 드래그·줌{freeResize ? ' · 모서리로 크기 조절' : ''}
        </p>
        <button type="button" onClick={onClose} className="rounded p-1 hover:bg-white/10">
          <X size={18} />
        </button>
      </div>

      <div
        className="relative mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-4 pb-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          ref={viewportRef}
          className="relative mx-auto w-full flex-1 touch-none select-none overflow-hidden rounded-lg bg-neutral-900"
          style={{ maxHeight: 'min(70vh, 560px)' }}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {natural.w > 0 && (
            <img
              ref={imgRef}
              src={imageUrl}
              alt=""
              draggable={false}
              onLoad={onImgLoad}
              className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
              style={{
                width: natural.w * scale,
                height: natural.h * scale,
                transform: `translate(${offset.x}px, ${offset.y}px)`
              }}
            />
          )}
          {!natural.w && (
            <img ref={imgRef} src={imageUrl} alt="" className="hidden" onLoad={onImgLoad} />
          )}
          <div
            className="pointer-events-none absolute rounded-sm border-2 border-orange-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={{
              width: frame.w,
              height: frame.h,
              left: framePos.x,
              top: framePos.y
            }}
          />
          {freeResize && (
            <div
              role="presentation"
              onPointerDown={onFrameResizeDown}
              className="absolute z-10 h-5 w-5 cursor-se-resize rounded-sm border-2 border-white bg-orange-500 shadow"
              style={{
                left: framePos.x + frame.w - 10,
                top: framePos.y + frame.h - 10
              }}
              title="크롭 영역 크기 조절"
            />
          )}
        </div>

        <div className="mt-3 flex items-center gap-3 px-1">
          <span className="shrink-0 text-[10px] text-white/60">줌</span>
          <input
            type="range"
            min={minScale}
            max={maxScale}
            step={0.01}
            value={scale}
            onChange={(e) => setZoomScale(Number(e.target.value))}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-orange-500"
          />
          <span className="w-10 shrink-0 text-right text-xs text-white/80">{displayPct}%</span>
          <button
            type="button"
            onClick={() => resetToFit()}
            className="shrink-0 rounded-lg border border-white/20 px-2 py-1 text-xs text-white/90 hover:bg-white/10"
          >
            맞춤
          </button>
        </div>

        <button
          type="button"
          onClick={applyCrop}
          className="mt-3 w-full rounded-lg bg-[var(--color-accent)] py-2.5 text-sm font-medium text-white"
        >
          크롭 적용
        </button>
      </div>
    </div>
  )

  return overlayRoot ? createPortal(modal, overlayRoot) : modal
}
