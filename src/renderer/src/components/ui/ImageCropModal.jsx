import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

export default function ImageCropModal({ src, onApply, onClose }) {
  const containerRef = useRef(null)
  const imgRef = useRef(null)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [display, setDisplay] = useState({ w: 0, h: 0 })
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const [outW, setOutW] = useState(400)
  const [outH, setOutH] = useState(400)
  const dragRef = useRef(null)

  const onImgLoad = (e) => {
    const img = e.target
    setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    const maxW = 480
    const scale = Math.min(1, maxW / img.naturalWidth)
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    setDisplay({ w: dw, h: dh })
    const size = Math.min(dw, dh) * 0.6
    setCrop({ x: (dw - size) / 2, y: (dh - size) / 2, w: size, h: size })
    setOutW(Math.round(size / scale))
    setOutH(Math.round(size / scale))
  }

  const toNatural = useCallback(
    (rect) => {
      const sx = display.w / natural.w
      const sy = display.h / natural.h
      return {
        x: Math.round(rect.x / sx),
        y: Math.round(rect.y / sy),
        w: Math.round(rect.w / sx),
        h: Math.round(rect.h / sy)
      }
    },
    [display, natural]
  )

  const onMouseDown = (e) => {
    const box = containerRef.current.getBoundingClientRect()
    const x = e.clientX - box.left
    const y = e.clientY - box.top
    dragRef.current = { mode: 'draw', startX: x, startY: y, crop: { x, y, w: 0, h: 0 } }
  }

  const onMouseMove = (e) => {
    if (!dragRef.current) return
    const box = containerRef.current.getBoundingClientRect()
    const x = e.clientX - box.left
    const y = e.clientY - box.top
    const { startX, startY, mode } = dragRef.current

    if (mode === 'draw') {
      const nx = Math.min(startX, x)
      const ny = Math.min(startY, y)
      const w = Math.abs(x - startX)
      const h = Math.abs(y - startY)
      setCrop({ x: nx, y: ny, w, h })
    } else if (mode === 'move') {
      const { ox, oy, ow, oh } = dragRef.current
      setCrop({
        x: Math.max(0, Math.min(display.w - ow, ox + (x - startX))),
        y: Math.max(0, Math.min(display.h - oh, oy + (y - startY))),
        w: ow,
        h: oh
      })
    }
  }

  const onMouseUp = () => {
    dragRef.current = null
  }

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  })

  const apply = () => {
    const img = imgRef.current
    if (!img || !crop.w || !crop.h) return
    const nat = toNatural(crop)
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, nat.x, nat.y, nat.w, nat.h, 0, 0, outW, outH)
    onApply(canvas.toDataURL('image/png'))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">이미지 크롭</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-black/5">
            <X size={16} />
          </button>
        </div>

        <p className="mb-2 text-xs text-[var(--color-text-muted)]">
          드래그로 영역을 선택하세요
        </p>

        <div
          ref={containerRef}
          className="relative mx-auto select-none overflow-hidden rounded-lg bg-black/20"
          style={{ width: display.w || 'auto', height: display.h || 'auto' }}
          onMouseDown={onMouseDown}
        >
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={onImgLoad}
            className="block max-w-full"
            style={{ width: display.w || '100%' }}
          />
          {crop.w > 0 && (
            <div
              className="pointer-events-none absolute border-2 border-[var(--color-accent)] bg-[var(--color-accent)]/20"
              style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
            />
          )}
        </div>

        <div className="mt-3 flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            너비
            <input
              type="number"
              min={1}
              value={outW}
              onChange={(e) => setOutW(Number(e.target.value))}
              className="w-16 rounded border border-[var(--color-border)] px-1 py-0.5"
            />
          </label>
          <label className="flex items-center gap-1">
            높이
            <input
              type="number"
              min={1}
              value={outH}
              onChange={(e) => setOutH(Number(e.target.value))}
              className="w-16 rounded border border-[var(--color-border)] px-1 py-0.5"
            />
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5">
            취소
          </button>
          <button
            type="button"
            onClick={apply}
            className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm text-white hover:opacity-90"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  )
}
