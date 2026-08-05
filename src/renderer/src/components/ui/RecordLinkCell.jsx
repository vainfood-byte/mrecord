import { useEffect, useRef, useState } from 'react'
import { Link2 } from 'lucide-react'

function normalizeUrl(raw) {
  const url = String(raw || '').trim()
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `https://${url}`
}

export default function RecordLinkCell({ value, locked, onSave }) {
  const [menu, setMenu] = useState(null)
  const [draft, setDraft] = useState(value || '')
  const ref = useRef(null)

  useEffect(() => {
    setDraft(value || '')
  }, [value])

  useEffect(() => {
    if (!menu) return
    const onDown = (e) => {
      if (ref.current?.contains(e.target)) return
      setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menu])

  const openLink = () => {
    const url = normalizeUrl(value)
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (!value && locked) {
    return <span className="text-[var(--color-text-muted)]">—</span>
  }

  return (
    <div
      ref={ref}
      data-inline-edit
      className="relative flex items-center justify-center"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={!value && locked}
        onClick={() => value && openLink()}
        onContextMenu={(e) => {
          if (locked) return
          e.preventDefault()
          e.stopPropagation()
          setMenu({ x: e.clientX, y: e.clientY })
          setDraft(value || '')
        }}
        className={`rounded-md p-1.5 transition-colors ${
          value
            ? 'text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10'
            : 'text-[var(--color-text-muted)] hover:bg-black/5'
        } ${locked ? 'pointer-events-none opacity-50' : ''}`}
        title={value ? `링크 열기: ${value}` : '우클릭: 링크 입력'}
      >
        <Link2 size={16} />
      </button>

      {menu && (
        <>
          <div className="fixed inset-0 z-[119]" onMouseDown={() => setMenu(null)} />
          <div
            data-popup-root
            className="fixed z-[120] w-64 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-2 shadow-lg"
            style={{ left: menu.x, top: menu.y, WebkitAppRegion: 'no-drag' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-[10px] font-medium text-[var(--color-text-muted)]">링크 주소</p>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSave(draft.trim())
                  setMenu(null)
                }
                if (e.key === 'Escape') setMenu(null)
              }}
              placeholder="https://..."
              className="w-full rounded border border-[var(--color-border)] px-2 py-1.5 text-xs outline-none"
            />
            <div className="mt-2 flex gap-1">
              <button
                type="button"
                onClick={() => {
                  onSave(draft.trim())
                  setMenu(null)
                }}
                className="flex-1 rounded bg-[var(--color-accent)] py-1.5 text-xs text-white"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => {
                  onSave('')
                  setMenu(null)
                }}
                className="rounded border border-[var(--color-border)] px-2 py-1.5 text-xs hover:bg-black/5"
              >
                지우기
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
