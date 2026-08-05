import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { OVERLAY_ABOVE_SIDE_PANEL } from '../../constants/overlayZIndex'

const overlayRoot = document.getElementById('overlay-root')

export const QUOTE_WRAP_OPTIONS = [
  { id: 'double', label: '큰 따옴표 “ ”', open: '“', close: '”' },
  { id: 'single', label: '작은 따옴표 ‘ ’', open: '‘', close: '’' },
  { id: 'corner', label: '겹낫표 『 』', open: '『', close: '』' },
  { id: 'angle', label: '겹화살괄호 ≪ ≫', open: '≪', close: '≫' },
  { id: 'half', label: '홑낫표 ｢ ｣', open: '｢', close: '｣' }
]

/** 줄바꿈·서식 유지 + Ctrl+Z 되돌리기 지원 */
export function wrapRangeWithQuotes(range, open, close) {
  if (!range || range.collapsed) return false

  const sel = window.getSelection()
  if (!sel) return false

  const fragment = range.cloneContents()
  const temp = document.createElement('div')
  temp.appendChild(fragment)
  const innerHtml = temp.innerHTML
  if (!innerHtml && !range.toString()) return false

  sel.removeAllRanges()
  sel.addRange(range)

  try {
    document.execCommand('insertHTML', false, `${open}${innerHtml}${close}`)
    return true
  } catch {
    return false
  }
}

export default function QuoteWrapMenu({ x, y, onSelect, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const onDown = (e) => {
      if (e.button === 2) return
      if (ref.current?.contains(e.target)) return
      if (e.target.closest?.('[data-quote-wrap-menu]')) return
      onClose()
    }
    // contextmenu 직후 mousedown이 메뉴를 즉시 닫지 않도록 한 틱 뒤 등록
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onDown, true)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', onDown, true)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 180)
  const top = Math.min(y, window.innerHeight - 220)

  const menu = (
    <div
      ref={ref}
      data-popup-root
      data-quote-wrap-menu
      className="fixed min-w-[168px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
      style={{
        left,
        top,
        zIndex: OVERLAY_ABOVE_SIDE_PANEL,
        WebkitAppRegion: 'no-drag'
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <p className="px-3 py-1.5 text-[10px] font-medium text-[var(--color-text-muted)]">따옴표로 감싸기</p>
      {QUOTE_WRAP_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onSelect(opt)
            onClose()
          }}
          className="block w-full px-3 py-2 text-left text-xs hover:bg-black/5"
        >
          {opt.label}
        </button>
      ))}
    </div>
  )

  return overlayRoot ? createPortal(menu, overlayRoot) : menu
}
