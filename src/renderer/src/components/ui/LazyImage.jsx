import { useEffect, useRef, useState } from 'react'
import { LAZY_IMAGE_LOAD_DEBOUNCE_MS } from '../../constants/virtualization'

const DEFAULT_ROOT_MARGIN = '240px'
/** 비시각적 primed 캐시 상한 — Old key 자동 purge (UI/DOM 로직과 무관) */
const PRIMED_CACHE_MAX = 400

/** 정렬로 카드가 행 사이를 옮겨 재마운트돼도 이미 본 표지는 즉시 표시 (id → src) */
const primedByKey = new Map()

function trimPrimedCache() {
  while (primedByKey.size > PRIMED_CACHE_MAX) {
    const oldest = primedByKey.keys().next().value
    primedByKey.delete(oldest)
  }
}

/** Map 삽입 순서 = LRU: 재접근 시 delete+set 으로 최근 사용 끝으로 이동 */
function touchPrimedEntry(key, value) {
  if (primedByKey.has(key)) primedByKey.delete(key)
  primedByKey.set(key, value)
  trimPrimedCache()
}

function wasPrimed(cacheKey, src) {
  if (!src) return false
  if (cacheKey != null) {
    if (primedByKey.get(cacheKey) !== src) return false
    touchPrimedEntry(cacheKey, src)
    return true
  }
  if (primedByKey.get(src) !== true) return false
  touchPrimedEntry(src, true)
  return true
}

function markPrimed(cacheKey, src) {
  if (!src) return
  if (cacheKey != null) touchPrimedEntry(cacheKey, src)
  else touchPrimedEntry(src, true)
}

/** Intersection Observer + native lazy loading for cover images */
export default function LazyImage({
  src,
  alt = '',
  className = '',
  rootMargin = DEFAULT_ROOT_MARGIN,
  eager = false,
  cacheKey,
  debounceMs = LAZY_IMAGE_LOAD_DEBOUNCE_MS,
  ...rest
}) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(() => Boolean((eager && src) || wasPrimed(cacheKey, src)))
  const shouldLoad = Boolean(src && (eager || visible))

  useEffect(() => {
    if (!src) {
      setVisible(false)
      return undefined
    }

    if (eager || wasPrimed(cacheKey, src)) {
      setVisible(true)
      markPrimed(cacheKey, src)
      return undefined
    }

    const el = ref.current
    if (!el) return undefined

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      markPrimed(cacheKey, src)
      return undefined
    }

    let cancelled = false
    let loadTimer = 0
    const delay = Math.max(0, Number(debounceMs) || 0)

    const commitLoad = () => {
      if (cancelled) return
      setVisible(true)
      markPrimed(cacheKey, src)
      observer.disconnect()
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (cancelled) return
        if (entry?.isIntersecting) {
          /* 빠른 스크롤 시 버퍼 영역 스침만으로 디스크 I/O가 폭주하지 않도록 디바운스 */
          if (loadTimer) window.clearTimeout(loadTimer)
          if (delay <= 0) {
            commitLoad()
            return
          }
          loadTimer = window.setTimeout(commitLoad, delay)
          return
        }
        if (loadTimer) {
          window.clearTimeout(loadTimer)
          loadTimer = 0
        }
      },
      { rootMargin }
    )

    observer.observe(el)
    return () => {
      cancelled = true
      if (loadTimer) window.clearTimeout(loadTimer)
      observer.disconnect()
    }
  }, [src, eager, rootMargin, cacheKey, debounceMs])

  useEffect(() => {
    if (visible && src) markPrimed(cacheKey, src)
  }, [visible, src, cacheKey])

  return (
    <img
      ref={ref}
      data-cover-url={src || undefined}
      src={shouldLoad ? src : undefined}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={className}
      {...rest}
    />
  )
}
