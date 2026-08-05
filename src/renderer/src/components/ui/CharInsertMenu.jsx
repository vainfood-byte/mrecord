import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { OVERLAY_ABOVE_SIDE_PANEL } from '../../constants/overlayZIndex'

const overlayRoot = document.getElementById('overlay-root')

const EMOJI_SAMPLES = ['😀', '😊', '🥲', '😭', '❤️', '⭐', '✨', '👍', '🎉', '🔥', '💡', '📚', '🎬', '🎵', '🌸', '🍀']

const SPECIAL_SAMPLES = [
  '…', '—', '–', '·', '※', '★', '☆', '♥', '♡', '♪', '♬',
  '「', '」', '『', '』', '【', '】', '《', '》', '〈', '〉',
  '“', '”', '‘', '’', '≪', '≫', '｢', '｣', '→', '←', '↑', '↓'
]

export default function CharInsertMenu({ x, y, mode = 'both', onInsert, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target)) return
      if (e.target.closest?.('[data-char-insert-menu]')) return
      onClose()
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onDown, true)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', onDown, true)
    }
  }, [onClose])

  const panel = (
    <div
      ref={ref}
      data-popup-root
      data-char-insert-menu
      className="fixed max-w-[240px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-2 shadow-lg"
      style={{ left: x, top: y, zIndex: OVERLAY_ABOVE_SIDE_PANEL, WebkitAppRegion: 'no-drag' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {(mode === 'both' || mode === 'emoji') && (
        <>
          <p className="mb-1 px-1 text-[10px] font-medium text-[var(--color-text-muted)]">이모티콘</p>
          <div className="mb-2 flex flex-wrap gap-1">
            {EMOJI_SAMPLES.map((ch) => (
              <button
                key={ch}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onInsert(ch)
                  onClose()
                }}
                className="flex h-7 w-7 items-center justify-center rounded text-sm hover:bg-black/5"
              >
                {ch}
              </button>
            ))}
          </div>
        </>
      )}
      {(mode === 'both' || mode === 'special') && (
        <>
          <p className="mb-1 px-1 text-[10px] font-medium text-[var(--color-text-muted)]">특수문자</p>
          <div className="flex flex-wrap gap-1">
            {SPECIAL_SAMPLES.map((ch) => (
              <button
                key={ch}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onInsert(ch)
                  onClose()
                }}
                className="flex h-7 min-w-7 items-center justify-center rounded px-1 text-xs hover:bg-black/5"
              >
                {ch}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )

  return overlayRoot ? createPortal(panel, overlayRoot) : panel
}
