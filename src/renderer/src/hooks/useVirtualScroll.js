import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

/** Fixed-row virtual scroll for long lists (e.g. record table). */
export function useVirtualScroll({
  scrollRef,
  count,
  estimateSize = 44,
  overscan = 10
}) {
  const [, startTransition] = useTransition()
  const rafRef = useRef(0)
  const [range, setRange] = useState(() => ({
    start: 0,
    end: Math.min(count, 30)
  }))

  const update = useCallback(() => {
    const el = scrollRef.current
    if (!el || count === 0) {
      startTransition(() => {
        setRange((prev) => (prev.start === 0 && prev.end === 0 ? prev : { start: 0, end: 0 }))
      })
      return
    }

    const scrollTop = el.scrollTop
    const viewport = el.clientHeight
    const dynamicOverscan = Math.max(overscan, Math.ceil(viewport / estimateSize / 2))
    const start = Math.max(0, Math.floor(scrollTop / estimateSize) - dynamicOverscan)
    const visible = Math.ceil(viewport / estimateSize) + dynamicOverscan * 2
    const end = Math.min(count, start + visible)

    startTransition(() => {
      setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
    })
  }, [scrollRef, count, estimateSize, overscan, startTransition])

  const scheduleUpdate = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0
      update()
    })
  }, [update])

  useEffect(() => {
    update()
  }, [count, update])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined

    update()
    el.addEventListener('scroll', scheduleUpdate, { passive: true })
    const ro = new ResizeObserver(scheduleUpdate)
    ro.observe(el)

    return () => {
      el.removeEventListener('scroll', scheduleUpdate)
      ro.disconnect()
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    }
  }, [scheduleUpdate, update, scrollRef])

  const { start, end } = range

  return {
    startIndex: start,
    endIndex: end,
    paddingTop: start * estimateSize,
    paddingBottom: Math.max(0, (count - end) * estimateSize),
    visibleItems: count > 0 ? end - start : 0
  }
}
