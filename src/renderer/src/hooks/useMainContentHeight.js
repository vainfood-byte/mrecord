import { useEffect, useState } from 'react'

/** main 콘텐츠 영역 높이 — 가상 스크롤 뷰포트 */
export function useMainContentHeight(offset = 0) {
  const [height, setHeight] = useState(600)

  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return

    const update = () => {
      const styles = getComputedStyle(main)
      const py = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)
      setHeight(Math.max(320, Math.floor(main.clientHeight - py - offset)))
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(main)
    window.addEventListener('resize', update)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [offset])

  return height
}

export function getGalleryColumnCount(viewportWidth, cardWidth, gap = 16) {
  if (viewportWidth < 1) return 1
  return Math.max(1, Math.floor((viewportWidth + gap) / (cardWidth + gap)))
}

export function getGalleryCardHeight(cardWidth, hideTitle) {
  return hideTitle ? Math.round(cardWidth * 0.75) : Math.round(cardWidth * (4 / 3) + 44)
}
