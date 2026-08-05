import { useEffect, useRef, useState } from 'react'

const DEFAULT_ROOT_MARGIN = '240px'
const PRIMED_CACHE_MAX = 512

/** 정렬로 카드가 행 사이를 옮겨 재마운트돼도 이미 본 표지는 즉시 표시 (id → src) */
const primedByKey = new Map()

function trimPrimedCache() {
  while (primedByKey.size > PRIMED_CACHE_MAX) {
    const oldest = primedByKey.keys().next().value
    primedByKey.delete(oldest)
  }
}

function wasPrimed(cacheKey, src) {
  if (!src) return false
  if (cacheKey != null) return primedByKey.get(cacheKey) === src
  return primedByKey.get(src) === true
}

function markPrimed(cacheKey, src) {
  if (!src) return
  if (cacheKey != null) primedByKey.set(cacheKey, src)
  else primedByKey.set(src, true)
  trimPrimedCache()
}

/** Intersection Observer + native lazy loading for cover images */
export default function LazyImage({
  src,
  alt = '',
  className = '',
  rootMargin = DEFAULT_ROOT_MARGIN,
  eager = false,
  cacheKey,
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
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (cancelled || !entry?.isIntersecting) return
        setVisible(true)
        markPrimed(cacheKey, src)
        observer.disconnect()
      },
      { rootMargin }
    )

    observer.observe(el)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [src, eager, rootMargin, cacheKey])

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
