import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GripHorizontal, Save, X } from 'lucide-react'
import { useApp, useSelectedRecord } from '../../context/AppContext'
import { resetInteractionLocks } from '../../utils/restoreFocusAfterDialog'
import PropertyFieldList from './PropertyFieldList'

const overlayRoot = document.getElementById('overlay-root')
const MIN_W = 280
const MIN_H = 320
const DEFAULT_LAYOUT = { x: 120, y: 80, width: 360, height: 480 }

export default function PropertyRemotePanel() {
  const { state, dispatch } = useApp()
  const record = useSelectedRecord()
  const layout = { ...DEFAULT_LAYOUT, ...(state.settings.propertyRemoteLayout || {}) }
  const [draft, setDraft] = useState(() => (record ? { ...record } : null))
  const [pos, setPos] = useState({ x: layout.x, y: layout.y })
  const [size, setSize] = useState({ width: layout.width, height: layout.height })
  const dragRef = useRef(null)
  const resizeRef = useRef(null)
  const posRef = useRef(pos)
  const sizeRef = useRef(size)
  posRef.current = pos
  sizeRef.current = size

  useEffect(() => {
    if (record) setDraft({ ...record })
  }, [record?.id])

  const persistLayout = useCallback(
    (patch) => {
      dispatch({ type: 'UPDATE_PROPERTY_REMOTE_LAYOUT', payload: patch })
    },
    [dispatch]
  )

  const handlePatch = useCallback((patch) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const handleSave = () => {
    if (draft) dispatch({ type: 'UPDATE_RECORD', payload: draft })
  }

  const handleClose = () => {
    persistLayout({ x: pos.x, y: pos.y, width: size.width, height: size.height })
    dispatch({ type: 'SET_PROPERTY_REMOTE_OPEN', payload: false })
  }

  const startDrag = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
    document.body.style.userSelect = 'none'
  }

  const startResize = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: size.width,
      origH: size.height
    }
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const onMove = (e) => {
      if (dragRef.current) {
        const d = dragRef.current
        setPos({
          x: Math.max(8, d.origX + (e.clientX - d.startX)),
          y: Math.max(8, d.origY + (e.clientY - d.startY))
        })
      }
      if (resizeRef.current) {
        const r = resizeRef.current
        setSize({
          width: Math.max(MIN_W, r.origW + (e.clientX - r.startX)),
          height: Math.max(MIN_H, r.origH + (e.clientY - r.startY))
        })
      }
    }
    const onUp = () => {
      if (dragRef.current || resizeRef.current) {
        persistLayout({
          x: posRef.current.x,
          y: posRef.current.y,
          width: sizeRef.current.width,
          height: sizeRef.current.height
        })
      }
      dragRef.current = null
      resizeRef.current = null
      resetInteractionLocks()
    }
    const onBlur = () => onUp()
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      window.removeEventListener('blur', onBlur)
      resetInteractionLocks()
    }
  }, [persistLayout])

  if (!overlayRoot || !state.propertyRemoteOpen) return null

  const horizontal = size.width >= 520

  return createPortal(
    <div
      data-property-remote
      className="fixed z-[200] flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-panel)] shadow-2xl"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: size.height,
        WebkitAppRegion: 'no-drag'
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="flex shrink-0 cursor-grab items-center justify-between border-b border-[var(--color-border)] px-3 py-2 active:cursor-grabbing"
        onMouseDown={startDrag}
      >
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-[var(--color-text-muted)]">
          <GripHorizontal size={14} className="shrink-0" />
          <span className="truncate">
            속성 리모컨{record?.title ? ` · ${record.title}` : ''}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={!draft}
            className="rounded-lg px-2 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-40"
            title="저장"
          >
            <Save size={14} />
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 hover:bg-black/5"
            title="닫기"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {draft ? (
          <PropertyFieldList
            recordOverride={draft}
            onRecordPatch={handlePatch}
            remoteMode
            layoutMode={horizontal ? 'horizontal' : 'vertical'}
          />
        ) : (
          <p className="py-8 text-center text-xs text-[var(--color-text-muted)]">
            작품을 선택하면 속성이 표시됩니다.
          </p>
        )}
      </div>
      <div
        className="absolute bottom-0 right-0 z-10 h-4 w-4 cursor-se-resize"
        onMouseDown={startResize}
        title="크기 조절"
      />
    </div>,
    overlayRoot
  )
}
