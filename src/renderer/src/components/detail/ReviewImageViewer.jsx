import { useCallback, useEffect, useMemo, useState, memo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { OVERLAY_ABOVE_SIDE_PANEL } from '../../constants/overlayZIndex'

const overlayRoot = document.getElementById('overlay-root')
/** Data URL 문자열이 이 길이 이상이면 blob URL로 변환 후 표시 (메인 스레드 부담 완화) */
const LARGE_DATA_URL_CHARS = 256 * 1024

function isLargeDataUrl(src) {
  return typeof src === 'string' && /^data:image\//i.test(src) && src.length >= LARGE_DATA_URL_CHARS
}

/**
 * 감상박스 본문 이미지 전체보기 — overlay-root / body Portal로 레이어 분리.
 * 거대 Base64는 클릭 핸들러 밖에서 blob URL로 변환해 전달합니다.
 */
function ReviewImageViewer({ index, count, resolveSrc, onClose, onNavigate }) {
  const rawSrc = useMemo(() => {
    try {
      return resolveSrc?.(index) || ''
    } catch {
      return ''
    }
  }, [index, count, resolveSrc])

  const [displaySrc, setDisplaySrc] = useState('')

  useEffect(() => {
    let cancelled = false
    let blobUrl = null
    let rafId = 0

    if (!rawSrc) {
      setDisplaySrc('')
      return undefined
    }

    if (!isLargeDataUrl(rawSrc)) {
      setDisplaySrc(rawSrc)
      return undefined
    }

    /* 거대 Data URL은 즉시 src로 넣지 않음 — rAF 이후 blob 변환 */
    setDisplaySrc('')
    rafId = requestAnimationFrame(() => {
      fetch(rawSrc)
        .then((res) => res.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob)
          if (cancelled) {
            URL.revokeObjectURL(url)
            return
          }
          blobUrl = url
          setDisplaySrc(url)
        })
        .catch(() => {
          /* fallback: 변환 실패 시 원본 Data URL (엑박·미표시 방지) */
          if (!cancelled) setDisplaySrc(rawSrc)
        })
    })

    return () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      if (blobUrl) {
        try {
          URL.revokeObjectURL(blobUrl)
        } catch {
          /* ignore */
        }
      }
    }
  }, [rawSrc])

  const handleBackdrop = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose?.()
    },
    [onClose]
  )

  const stopNavEvent = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleNav = useCallback(
    (delta) => (e) => {
      e.preventDefault()
      e.stopPropagation()
      onNavigate?.(delta)
    },
    [onNavigate]
  )

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onNavigate?.(-1)
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        onNavigate?.(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, onNavigate])

  const portalTarget = overlayRoot || document.body
  if (!portalTarget) return null

  const showNav = count > 1

  return createPortal(
    <div
      data-review-image-viewer
      className="fixed inset-0 flex items-center justify-center bg-black/70"
      style={{
        zIndex: Math.max(OVERLAY_ABOVE_SIDE_PANEL, 100100),
        WebkitAppRegion: 'no-drag'
      }}
      onMouseDown={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="본문 이미지 보기"
    >
      <button
        type="button"
        className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
        onMouseDown={stopNavEvent}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onClose?.()
        }}
        title="닫기"
      >
        <X size={18} />
      </button>
      {showNav && (
        <>
          <button
            type="button"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 md:left-6"
            onMouseDown={stopNavEvent}
            onClick={handleNav(-1)}
            title="이전 이미지"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 md:right-6"
            onMouseDown={stopNavEvent}
            onClick={handleNav(1)}
            title="다음 이미지"
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}
      {displaySrc ? (
        <img
          src={displaySrc}
          alt=""
          className="max-h-[88vh] max-w-[92vw] object-contain"
          draggable={false}
          decoding="async"
          loading="eager"
          style={{ contain: 'layout paint', willChange: 'transform' }}
        />
      ) : (
        <div className="h-10 w-10 animate-pulse rounded-full bg-white/20" aria-hidden />
      )}
      {showNav && (
        <p className="absolute bottom-4 text-xs text-white/80">
          {index + 1} / {count}
        </p>
      )}
    </div>,
    portalTarget
  )
}

export default memo(ReviewImageViewer)
