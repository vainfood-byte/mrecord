import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, PanelRight, Trash2, X } from 'lucide-react'
import { useApp, useSelectedRecord } from '../../context/AppContext'
import { useDragResize, usePanelResize } from '../../hooks/useClipboardPaste'
import Breadcrumb from '../detail/Breadcrumb'
import CoverBlock from '../detail/CoverBlock'
import PropertyFieldList, { formatDateTime } from '../detail/PropertyFieldList'
import ReviewEditor from '../detail/ReviewEditor'
import SeriesBox from '../detail/SeriesBox'
import EditableTitle from '../ui/EditableTitle'
import ResizeHandle from '../ui/ResizeHandle'
import DeleteConfirmDialog from '../ui/DeleteConfirmDialog'
import { restoreFocusAfterNativeDialog, resetInteractionLocks } from '../../utils/restoreFocusAfterDialog'
import { resolveCoverChangePatch } from '../../utils/coverImageHelpers'

const WIDE_THRESHOLD = 480
const DEFAULT_LEFT_WIDTH = 288
const COVER_ASPECT_WIDTH = 3
const COVER_ASPECT_HEIGHT = 4
const DEFAULT_COVER_HEIGHT = Math.round(
  (DEFAULT_LEFT_WIDTH * COVER_ASPECT_HEIGHT) / COVER_ASPECT_WIDTH
)
const DEFAULT_FULL_LAYOUT = {
  leftWidth: DEFAULT_LEFT_WIDTH,
  coverHeight: DEFAULT_COVER_HEIGHT,
  reviewHeight: 480,
  reviewPercent: 80
}

const MIN_COVER_HEIGHT = DEFAULT_COVER_HEIGHT
const overlayRoot = document.getElementById('overlay-root')
let initialSideWidthApplied = false

function ResizableLeftAside({ record, layout, onCoverChange, onCoverDelete, onCoverResize }) {
  const coverHeight = Math.max(layout.coverHeight, MIN_COVER_HEIGHT)
  return (
    <aside
      className="flex shrink-0 flex-col overflow-hidden"
      style={{ width: layout.leftWidth }}
    >
      <div className="shrink-0 overflow-hidden rounded-lg" style={{ height: coverHeight }}>
        <CoverBlock
          record={record}
          fitContainer
          onCoverChange={onCoverChange}
          onCoverDelete={onCoverDelete}
        />
      </div>
      <ResizeHandle direction="horizontal" onMouseDown={onCoverResize} className="py-1" />
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-visible">
        <PropertyFieldList />
      </div>
    </aside>
  )
}

function SideCoverPropertiesStack({ record, onCoverChange, onCoverDelete }) {
  return (
    <div className="flex shrink-0 flex-col gap-3">
      <div className="w-full shrink-0">
        <CoverBlock record={record} onCoverChange={onCoverChange} onCoverDelete={onCoverDelete} />
      </div>
      <PropertyFieldList />
    </div>
  )
}

export default function DetailPanel() {
  const { state, dispatch } = useApp()
  const record = useSelectedRecord()
  const draftFocusAppliedRef = useRef(null)

  useEffect(() => {
    resetInteractionLocks()
    window.mrecord?.focusWindow?.()
  }, [record?.id, state.detailMode])

  useEffect(() => {
    if (state.detailSkipSlideIn) {
      dispatch({ type: 'CLEAR_DETAIL_SKIP_SLIDE' })
    }
  }, [state.detailSkipSlideIn, dispatch])

  useEffect(() => {
    if (!record?.id || !state.detailIsDraft) return undefined
    if (draftFocusAppliedRef.current === record.id) return undefined
    draftFocusAppliedRef.current = record.id

    const timer = window.setTimeout(() => {
      const root = document.querySelector('[data-detail-panel]')
      if (!root) return
      if (state.detailEditTitle) {
        const input = root.querySelector('[data-detail-title-input]')
        if (input instanceof HTMLInputElement) {
          input.focus()
          input.select()
          return
        }
      }
      const editor = root.querySelector('[data-export-review="true"]')
      if (editor instanceof HTMLElement) editor.focus()
    }, 120)
    return () => window.clearTimeout(timer)
  }, [record?.id, state.detailIsDraft, state.detailEditTitle])

  useEffect(() => {
    if (!state.detailMode) return
    const coverHeight = state.settings.fullViewLayout?.coverHeight ?? DEFAULT_FULL_LAYOUT.coverHeight
    if (coverHeight >= MIN_COVER_HEIGHT) return
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        fullViewLayout: {
          ...DEFAULT_FULL_LAYOUT,
          ...(state.settings.fullViewLayout || {}),
          coverHeight: MIN_COVER_HEIGHT
        }
      }
    })
  }, [state.detailMode, dispatch, state.settings.fullViewLayout?.coverHeight])

  useEffect(() => {
    if (state.detailMode !== 'side' || initialSideWidthApplied) return
    initialSideWidthApplied = true
    const target = Math.round(window.innerWidth * 0.5)
    const clamped = Math.max(320, Math.min(target, Math.floor(window.innerWidth * 0.7)))
    const current = state.settings.detailPanelWidth || 480
    if (Math.abs(clamped - current) > 2) {
      dispatch({ type: 'SET_PANEL_WIDTH', payload: clamped })
    }
  }, [state.detailMode, dispatch, state.settings.detailPanelWidth])

  const panelWidth = state.settings.detailPanelWidth || 480
  const fullLayout = { ...DEFAULT_FULL_LAYOUT, ...(state.settings.fullViewLayout || {}) }
  const [resizingWidth, setResizingWidth] = useState(null)
  const [liveFullLayout, setLiveFullLayout] = useState(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [sideTop, setSideTop] = useState(0)
  const layout = liveFullLayout || fullLayout
  const displayWidth = resizingWidth ?? panelWidth

  const commitFullLayout = (patch) => {
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: { fullViewLayout: { ...fullLayout, ...patch } }
    })
    setLiveFullLayout(null)
  }

  const sideLeftMax = Math.max(220, Math.min(520, displayWidth - 240))

  const startFullLeftResize = useDragResize(layout.leftWidth, {
    axis: 'x',
    min: 220,
    max: state.detailMode === 'full' ? 520 : sideLeftMax,
    onMove: (leftWidth) => setLiveFullLayout({ ...layout, leftWidth }),
    onCommit: (leftWidth) => commitFullLayout({ leftWidth })
  })

  const startCoverResize = useDragResize(layout.coverHeight, {
    axis: 'y',
    min: 120,
    max: 420,
    onMove: (coverHeight) => setLiveFullLayout({ ...layout, coverHeight }),
    onCommit: (coverHeight) => commitFullLayout({ coverHeight })
  })

  const startResize = usePanelResize(panelWidth, {
    onMove: setResizingWidth,
    onCommit: (w) => {
      dispatch({ type: 'SET_PANEL_WIDTH', payload: w })
      setResizingWidth(null)
    }
  }, 320, () => Math.floor(window.innerWidth * 0.7))

  useEffect(() => {
    if (state.detailMode !== 'side') return undefined
    const measure = () => {
      const main = document.querySelector('[data-main-content]')
      setSideTop(main ? main.getBoundingClientRect().top : 0)
    }
    measure()
    window.addEventListener('resize', measure)
    const unsubBounds = window.mrecord?.onWindowBoundsChanged?.(measure)
    return () => {
      window.removeEventListener('resize', measure)
      unsubBounds?.()
    }
  }, [state.detailMode])

  if (!record || !state.detailMode) return null

  const isFull = state.detailMode === 'full'
  const isWide = !isFull && displayWidth >= WIDE_THRESHOLD

  const updateRecord = (patch) => {
    dispatch({ type: 'UPDATE_RECORD', payload: { ...record, ...patch } })
  }

  const titleProps = {
    title: record.title,
    onSave: (title) => updateRecord({ title }),
    autoEdit: state.detailEditTitle,
    onEditStart: () => dispatch({ type: 'MARK_DETAIL_TITLE_EDITED' }),
    onEditEnd: () => dispatch({ type: 'CLEAR_DETAIL_EDIT_TITLE' })
  }

  const toggleView = () => {
    dispatch({ type: 'SET_DETAIL_MODE', payload: isFull ? 'side' : 'full' })
  }

  const handleDelete = () => {
    if (state.settings.confirmBeforeDelete === false) {
      dispatch({ type: 'DELETE_RECORD', payload: record.id })
      restoreFocusAfterNativeDialog()
      return
    }
    setDeleteOpen(true)
  }

  const confirmDelete = (skipAsk) => {
    if (skipAsk) {
      dispatch({ type: 'UPDATE_SETTINGS', payload: { confirmBeforeDelete: false } })
    }
    dispatch({ type: 'DELETE_RECORD', payload: record.id })
    setDeleteOpen(false)
    restoreFocusAfterNativeDialog()
  }

  const coverProps = {
    /* Base64/Data URL → save-cover-image IPC → media:// (실패 시 원본 유지) */
    onCoverChange: (url) => {
      void (async () => {
        const patch = await resolveCoverChangePatch(url, record.id)
        updateRecord(patch)
      })()
    },
    onCoverDelete: () => updateRecord({ coverUrl: '', thumbnailUrl: '' })
  }

  const reviewEditorProps = {
    fullLayoutReviewHeight: layout.reviewHeight,
    fullLayoutReviewPercent: layout.reviewPercent ?? 80,
    onFullLayoutReviewHeightChange: (reviewHeight) => commitFullLayout({ reviewHeight }),
    onFullLayoutReviewPercentChange: (reviewPercent) => commitFullLayout({ reviewPercent })
  }

  const panelStyle = isFull
    ? {}
    : {
        width: displayWidth,
        top: sideTop,
        height: sideTop > 0 ? `calc(100vh - ${sideTop}px)` : '100%'
      }

  const panel = (
    <div
      data-detail-panel
      className={`flex flex-col bg-[var(--color-bg-panel)] ${
        isFull
          ? 'min-h-0 flex-1'
          : `fixed right-0 z-[100000] border-l border-[var(--color-border)] shadow-xl${
              state.detailSkipSlideIn ? '' : ' animate-slide-in'
            }`
      }`}
      style={{ ...panelStyle, WebkitAppRegion: 'no-drag' }}
    >
      {!isFull && (
        <div
          onMouseDown={startResize}
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-[var(--color-accent)]/30"
        />
      )}

      {!isFull && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <EditableTitle
            {...titleProps}
            className="min-w-0 flex-1 text-lg font-semibold"
            inputClassName="min-w-0 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-lg font-semibold outline-none"
          />
          <button
            type="button"
            onClick={handleDelete}
            className="shrink-0 rounded-lg p-2 text-red-500 hover:bg-red-500/10"
            title="기록 삭제"
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            onClick={toggleView}
            className="shrink-0 rounded-lg p-2 hover:bg-black/5"
            title="전체보기"
          >
            <Maximize2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'DISMISS_DETAIL' })}
            className="shrink-0 rounded-lg p-2 hover:bg-black/5"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {isFull ? (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <aside
              className="flex shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)] p-4"
              style={{ width: layout.leftWidth }}
            >
              <div
                className="shrink-0 overflow-hidden rounded-lg"
                style={{ height: Math.max(layout.coverHeight, MIN_COVER_HEIGHT) }}
              >
                <CoverBlock record={record} fitContainer {...coverProps} />
              </div>
              <ResizeHandle direction="horizontal" onMouseDown={startCoverResize} className="py-1" />
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-visible">
                <PropertyFieldList />
              </div>
            </aside>

            <div className="group flex w-2 shrink-0 items-stretch justify-center hover:bg-[var(--color-accent)]/10">
              <ResizeHandle direction="vertical" onMouseDown={startFullLeftResize} />
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-stretch gap-3 border-b border-[var(--color-border)] px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2">
                  <EditableTitle
                    {...titleProps}
                    className="min-w-0 flex-1 text-lg font-semibold"
                    inputClassName="min-w-0 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-lg font-semibold outline-none"
                  />
                </div>
                <div className="flex min-w-0 flex-[1.15] items-center">
                  <SeriesBox />
                </div>
                <div className="flex shrink-0 items-center gap-1 self-center">
                  <button type="button" onClick={handleDelete} className="rounded-lg p-2 text-red-500 hover:bg-red-500/10" title="기록 삭제">
                    <Trash2 size={16} />
                  </button>
                  <button type="button" onClick={() => dispatch({ type: 'SET_DETAIL_MODE', payload: 'side' })} className="rounded-lg p-2 hover:bg-black/5" title="사이드보기">
                    <PanelRight size={16} />
                  </button>
                  <button type="button" onClick={() => dispatch({ type: 'DISMISS_DETAIL' })} className="rounded-lg p-2 hover:bg-black/5" title="닫기">
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3">
                <ReviewEditor fullLayout {...reviewEditorProps} />
              </div>
            </div>
          </div>
        ) : isWide ? (
          <div className="flex min-h-0 flex-1 overflow-hidden p-4 pt-3">
            <ResizableLeftAside
              record={record}
              layout={layout}
              {...coverProps}
              onCoverResize={startCoverResize}
            />

            <div className="group mx-1 flex w-2 shrink-0 items-stretch justify-center hover:bg-[var(--color-accent)]/10">
              <ResizeHandle direction="vertical" onMouseDown={startFullLeftResize} />
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
              <SeriesBox />
              <ReviewEditor compact {...reviewEditorProps} />
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 pt-3">
            <SideCoverPropertiesStack record={record} {...coverProps} />
            <div className="shrink-0">
              <SeriesBox />
            </div>
            <ReviewEditor compact {...reviewEditorProps} />
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-[var(--color-border)] px-4 py-2">
        <Breadcrumb />
        <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
          생성 {formatDateTime(record.createdAt)}
        </span>
      </div>

      {deleteOpen && (
        <DeleteConfirmDialog
          message={`「${record.title || '제목 없음'}」 기록을 삭제할까요?`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </div>
  )

  if (!isFull && overlayRoot) {
    return createPortal(panel, overlayRoot)
  }

  return panel
}
