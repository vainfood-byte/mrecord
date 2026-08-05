import { useEffect, useState } from 'react'

/** auto-fill 그리드 열 수 — gap 포함 너비 계산 */
export function useGridColumnCount(containerRef, itemWidth, gap = 16) {
  const [columnCount, setColumnCount] = useState(1)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined

    const update = () => {
      const width = el.clientWidth
      if (width <= 0) return
      const cols = Math.max(1, Math.floor((width + gap) / (itemWidth + gap)))
      setColumnCount((prev) => (prev === cols ? prev : cols))
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef, itemWidth, gap])

  return columnCount
}
