import { useEffect, useState } from 'react'

/** 스티커 레이어용 뷰포트 크기 — 전체화면 전환 등 resize 이벤트 누락 대비 */
export function useStickerViewport() {
  const [viewportSize, setViewportSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 0,
    h: typeof window !== 'undefined' ? window.innerHeight : 0
  }))

  useEffect(() => {
    let rafId = 0

    const update = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        setViewportSize({
          w: window.innerWidth,
          h: window.innerHeight
        })
      })
    }

    update()

    const ro = new ResizeObserver(update)
    ro.observe(document.documentElement)
    if (document.body) ro.observe(document.body)

    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)

    const removeBoundsListener = window.mrecord?.onWindowBoundsChanged?.(update)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      removeBoundsListener?.()
    }
  }, [])

  return viewportSize
}
