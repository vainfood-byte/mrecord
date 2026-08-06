import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Virtualizer } from 'virtua'
import { useApp } from '../context/AppContext'
import { useMainScrollRef } from '../context/MainScrollContext'
import { useRecordListView } from '../hooks/useRecordListView'
import { useGridColumnCount } from '../hooks/useGridColumnCount'
import { isRecordLocked } from '../components/layout/LockToggle'
import { coverPlaceholderStyle } from '../utils/colorUtils'
import { GalleryAddCard } from '../components/ui/AddRecordCard'
import InlineTextCell from '../components/ui/InlineTextCell'
import LazyImage from '../components/ui/LazyImage'
import CoverCropEditor from '../components/calendar/CoverCropEditor'
import DeleteConfirmDialog from '../components/ui/DeleteConfirmDialog'
import { resetInteractionLocks, restoreFocusAfterNativeDialog } from '../utils/restoreFocusAfterDialog'
import { GALLERY_GRID_GAP, VIRTUAL_THRESHOLD } from '../constants/virtualization'
import {
  GALLERY_CARD_SIZES,
  getGalleryCardWidth,
  getGalleryCoverAspectStyle
} from '../constants/galleryCardSizes'
import { SizeOptionMenuSection } from '../components/ui/SizeOptionMenuSection'
import { offscreenCardHint } from '../utils/renderHints'
import { resolveCoverChangePatch } from '../utils/coverImageHelpers'

const overlayRoot = document.getElementById('overlay-root')

function GalleryContextMenu({
  x,
  y,
  cardSize,
  hideTitle,
  hideCover,
  showCoverActions,
  hasCoverUrl,
  onChangeCover,
  onEditCover,
  onSelectSize,
  onToggleHideTitle,
  onToggleHideCover,
  onDelete,
  onClose
}) {
  const menu = (
    <>
      <div className="fixed inset-0 z-[200]" onMouseDown={onClose} />
      <div
        data-popup-root
        className="fixed z-[201] min-w-[150px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
        style={{ left: x, top: y, WebkitAppRegion: 'no-drag' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {showCoverActions && (
          <>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-xs hover:bg-black/5"
              onClick={() => {
                onChangeCover()
                onClose()
              }}
            >
              표지 변경
            </button>
            {hasCoverUrl && (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-xs hover:bg-black/5"
                onClick={() => {
                  onEditCover()
                  onClose()
                }}
              >
                표지 편집
              </button>
            )}
          </>
        )}
        <SizeOptionMenuSection
          label="카드 크기 변경"
          variant="card"
          options={Object.entries(GALLERY_CARD_SIZES)}
          current={cardSize}
          onSelect={(key) => {
            onSelectSize(key)
            onClose()
          }}
        />
        <div className="my-1 border-t border-[var(--color-border)]" />
        <button
          type="button"
          className={`block w-full px-3 py-2 text-left text-xs hover:bg-black/5 ${
            hideTitle ? 'font-medium text-[var(--color-accent)]' : ''
          }`}
          onClick={() => {
            onToggleHideTitle()
            onClose()
          }}
        >
          제목 생략
          {hideTitle ? ' ✓' : ''}
        </button>
        <button
          type="button"
          className={`block w-full px-3 py-2 text-left text-xs hover:bg-black/5 ${
            hideCover ? 'font-medium text-[var(--color-accent)]' : ''
          }`}
          onClick={() => {
            onToggleHideCover()
            onClose()
          }}
        >
          표지 숨기기
          {hideCover ? ' ✓' : ''}
        </button>
        {showCoverActions && (
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-500/10"
            onClick={() => {
              onDelete()
              onClose()
            }}
          >
            작품 삭제
          </button>
        )}
      </div>
    </>
  )

  return overlayRoot ? createPortal(menu, overlayRoot) : menu
}

const GalleryCard = memo(function GalleryCard({
  rec,
  locked,
  dispatch,
  cardWidth,
  fillWidth = false,
  hideTitle,
  hideCover,
  onOpenMenu,
  onRequestDelete,
  eagerCover = false
}) {
  const [cropSrc, setCropSrc] = useState(null)
  const [coverSrcBroken, setCoverSrcBroken] = useState(false)
  const fileRef = useRef(null)
  const blurCover = locked || hideCover
  /* 갤러리 카드: 썸네일 우선, 없거나 로드 실패 시 원본 coverUrl */
  const listCoverSrc =
    (!coverSrcBroken && rec.thumbnailUrl) || rec.coverUrl || ''

  useEffect(() => {
    setCoverSrcBroken(false)
  }, [rec.id, rec.thumbnailUrl, rec.coverUrl])

  const update = (patch) => dispatch({ type: 'UPDATE_RECORD', payload: { ...rec, ...patch } })

  const handleCoverFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      void (async () => {
        const patch = await resolveCoverChangePatch(reader.result, rec.id)
        setCoverSrcBroken(false)
        update(patch)
      })()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const openCardMenu = useCallback(
    (e) => {
      if (locked) return
      onOpenMenu(e, rec.id, {
        onChangeCover: () => fileRef.current?.click(),
        onEditCover: () => setCropSrc(rec.coverUrl),
        onDelete: () => onRequestDelete(rec.id)
      })
    },
    [locked, onOpenMenu, onRequestDelete, rec.id, rec.coverUrl]
  )

  return (
    <>
      <div
        data-gallery-card-export
        className={`group overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] text-left shadow-sm transition-all ${
          locked ? '' : 'hover:-translate-y-0.5 hover:shadow-md'
        }`}
        style={{ width: fillWidth ? '100%' : cardWidth }}
        onContextMenu={openCardMenu}
      >
        <div
          data-gallery-cover
          className={`relative w-full overflow-hidden ${hideTitle ? '' : 'aspect-[3/4]'} ${locked ? '' : 'cursor-pointer'}`}
          style={{
            backgroundColor: rec.coverColor || '#C4A882',
            ...getGalleryCoverAspectStyle(cardWidth, hideTitle)
          }}
          onClick={() => !locked && dispatch({ type: 'SELECT_RECORD', payload: rec.id })}
        >
          {listCoverSrc ? (
            <LazyImage
              src={listCoverSrc}
              alt={rec.title}
              cacheKey={rec.id}
              eager={eagerCover}
              className={`h-full w-full object-cover ${blurCover ? 'scale-110 blur-md' : ''}`}
              draggable={false}
              onContextMenu={openCardMenu}
              onError={() => {
                if (rec.thumbnailUrl && rec.coverUrl && !coverSrcBroken) {
                  setCoverSrcBroken(true)
                }
              }}
            />
          ) : (
            <div
              data-gallery-cover-title
              className={`flex h-full items-center justify-center p-2 text-center text-xs font-medium leading-snug ${
                blurCover ? 'blur-sm' : ''
              }`}
              style={coverPlaceholderStyle(rec.coverColor)}
              onContextMenu={openCardMenu}
            >
              {rec.title}
            </div>
          )}
        </div>
        {!hideTitle && (
          <div
            data-gallery-title-bar
            className={`min-h-[2.75rem] px-2 py-2 ${locked ? 'blur-sm select-none' : 'cursor-pointer'}`}
            onClick={() => !locked && dispatch({ type: 'SELECT_RECORD', payload: rec.id })}
          >
            <InlineTextCell
              value={rec.title}
              onSave={(title) => update({ title })}
              className="line-clamp-2 text-xs font-medium leading-snug"
              inputClassName="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-xs outline-none"
              title="더블클릭하여 제목 수정"
            />
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverFile} />

      {cropSrc && (
        <CoverCropEditor
          imageUrl={cropSrc}
          aspect={3 / 4}
          freeResize
          onApply={(url) => {
            void (async () => {
              const patch = await resolveCoverChangePatch(url, rec.id)
              setCoverSrcBroken(false)
              update(patch)
              setCropSrc(null)
            })()
          }}
          onClose={() => setCropSrc(null)}
        />
      )}
    </>
  )
})

function renderGalleryCardCell({
  index,
  records,
  columnCount,
  cardWidth,
  cardHeight,
  hideTitle,
  hideCover,
  lock,
  dispatch,
  onOpenMenu,
  onRequestDelete,
  eagerCover,
  fillColumns = false
}) {
  const totalSlots = records.length + 1
  const cellWidth = fillColumns ? '100%' : cardWidth

  if (index >= totalSlots) return null

  if (index === records.length) {
    return (
      <GalleryAddCard
        key="gallery-add-card"
        onClick={() =>
          dispatch({
            type: 'CREATE_NEW_RECORD',
            payload: { cloneFrom: false, autoEditTitle: true }
          })
        }
        width={cardWidth}
        fillWidth={fillColumns}
        hideTitle={hideTitle}
      />
    )
  }

  const rec = records[index]
  return (
    <div
      key={rec.id}
      data-gallery-card
      style={{
        width: cellWidth,
        minWidth: 0,
        minHeight: cardHeight,
        ...offscreenCardHint(cardWidth, cardHeight)
      }}
    >
      <GalleryCard
        rec={rec}
        locked={isRecordLocked(rec, lock)}
        dispatch={dispatch}
        cardWidth={cardWidth}
        fillWidth={fillColumns}
        hideTitle={hideTitle}
        hideCover={hideCover}
        onOpenMenu={onOpenMenu}
        onRequestDelete={onRequestDelete}
        eagerCover={eagerCover}
      />
    </div>
  )
}

const GalleryGridRow = memo(function GalleryGridRow({
  rowIndex,
  columnCount,
  records,
  cardWidth,
  cardHeight,
  gap,
  hideTitle,
  hideCover,
  lock,
  dispatch,
  onOpenMenu,
  onRequestDelete,
  eagerCover,
  fillColumns = false
}) {
  const start = rowIndex * columnCount

  return (
    <div
      className="grid w-full justify-start"
      style={{
        width: '100%',
        gridTemplateColumns: fillColumns
          ? `repeat(${columnCount}, minmax(${cardWidth}px, 1fr))`
          : `repeat(${columnCount}, ${cardWidth}px)`,
        columnGap: gap,
        justifyContent: 'start',
        minHeight: cardHeight,
        marginBottom: gap
      }}
    >
      {Array.from({ length: columnCount }, (_, col) => {
        const index = start + col
        const totalSlots = records.length + 1
        if (index >= totalSlots) {
          return (
            <div
              key={`empty-${rowIndex}-${col}`}
              aria-hidden
              style={{ width: fillColumns ? '100%' : cardWidth, minWidth: 0 }}
            />
          )
        }
        return renderGalleryCardCell({
          index,
          records,
          columnCount,
          cardWidth,
          cardHeight,
          hideTitle,
          hideCover,
          lock,
          dispatch,
          onOpenMenu,
          onRequestDelete,
          eagerCover,
          fillColumns
        })
      })}
    </div>
  )
})

function GalleryFlatGrid({
  records,
  cardWidth,
  cardHeight,
  hideTitle,
  hideCover,
  lock,
  dispatch,
  onOpenMenu,
  onRequestDelete,
  onContextMenu,
  eagerCover,
  fillColumns = false
}) {
  return (
    <div
      data-gallery-export-root
      className="grid w-full min-w-0 justify-start gap-4"
      style={{
        width: '100%',
        maxWidth: 'none',
        gridTemplateColumns: fillColumns
          ? `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`
          : `repeat(auto-fill, ${cardWidth}px)`,
        justifyContent: 'start'
      }}
      onContextMenu={onContextMenu}
    >
      {records.map((rec) => (
        <div
          key={rec.id}
          data-gallery-card
          style={{
            width: fillColumns ? '100%' : cardWidth,
            minWidth: 0,
            minHeight: cardHeight,
            ...offscreenCardHint(cardWidth, cardHeight)
          }}
        >
          <GalleryCard
            rec={rec}
            locked={isRecordLocked(rec, lock)}
            dispatch={dispatch}
            cardWidth={cardWidth}
            fillWidth={fillColumns}
            hideTitle={hideTitle}
            hideCover={hideCover}
            onOpenMenu={onOpenMenu}
            onRequestDelete={onRequestDelete}
            eagerCover={eagerCover}
          />
        </div>
      ))}
      <GalleryAddCard
        onClick={() =>
          dispatch({
            type: 'CREATE_NEW_RECORD',
            payload: { cloneFrom: false, autoEditTitle: true }
          })
        }
        width={cardWidth}
        fillWidth={fillColumns}
        hideTitle={hideTitle}
      />
    </div>
  )
}

export default function GalleryView() {
  const { state, dispatch } = useApp()
  const { records: rawRecords, pagedView } = useRecordListView()
  const records = rawRecords
  const mainScrollRef = useMainScrollRef()
  const containerRef = useRef(null)
  const lock = state.settings.lockSettings
  const cardSize = state.settings.galleryCardSize || 'medium'
  const hideTitle = state.settings.galleryHideTitle === true
  const hideCover = state.settings.galleryHideCover === true
  const cardWidth = getGalleryCardWidth(cardSize)
  /* 사이드 패널 열림: 고정 px 열 대신 minmax(1fr)로 남은 폭을 채움 (닫힘 시 기존 유지) */
  const fillColumns = state.detailMode === 'side'
  const columnCount = useGridColumnCount(containerRef, cardWidth, GALLERY_GRID_GAP)
  const [gridMenu, setGridMenu] = useState(null)
  const [cardMenu, setCardMenu] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const cardActionsRef = useRef(null)

  const requestDelete = useCallback((recordId) => {
    setPendingDeleteId(recordId)
    setCardMenu(null)
  }, [])

  const confirmDelete = useCallback(() => {
    if (!pendingDeleteId) return
    dispatch({ type: 'DELETE_RECORD', payload: pendingDeleteId })
    setPendingDeleteId(null)
    setCardMenu(null)
    setGridMenu(null)
    cardActionsRef.current = null
    resetInteractionLocks()
    restoreFocusAfterNativeDialog()
  }, [dispatch, pendingDeleteId])

  const cancelDelete = useCallback(() => {
    setPendingDeleteId(null)
    resetInteractionLocks()
    restoreFocusAfterNativeDialog()
  }, [])

  const updateCardSize = useCallback(
    (key) => {
      dispatch({ type: 'UPDATE_SETTINGS', payload: { galleryCardSize: key } })
    },
    [dispatch]
  )

  const toggleHideTitle = useCallback(() => {
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: { galleryHideTitle: !hideTitle }
    })
  }, [dispatch, hideTitle])

  const toggleHideCover = useCallback(() => {
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: { galleryHideCover: !hideCover }
    })
  }, [dispatch, hideCover])

  const openCardMenu = useCallback((e, recordId, actions) => {
    e.preventDefault()
    e.stopPropagation()
    cardActionsRef.current = actions
    setCardMenu({ x: e.clientX, y: e.clientY, recordId })
    setGridMenu(null)
  }, [])

  const cardHeight = hideTitle ? Math.round(cardWidth * 0.75) : Math.round(cardWidth * (4 / 3) + 44)
  const rowHeight = cardHeight + GALLERY_GRID_GAP
  const rowCount = Math.ceil((records.length + 1) / columnCount)
  const rowIndexes = useMemo(() => Array.from({ length: rowCount }, (_, i) => i), [rowCount])
  const useVirtual =
    mainScrollRef &&
    !state.exportInProgress &&
    !state.exportRecordSlice &&
    !pagedView &&
    records.length >= VIRTUAL_THRESHOLD

  const handleGridContextMenu = useCallback((e) => {
    if (e.target.closest('[data-gallery-card-export]')) return
    e.preventDefault()
    setCardMenu(null)
    setGridMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const menuRec = cardMenu ? records.find((r) => r.id === cardMenu.recordId) : null
  const cardActions = cardActionsRef.current

  const rowProps = useMemo(
    () => ({
      columnCount,
      records,
      cardWidth,
      cardHeight,
      gap: GALLERY_GRID_GAP,
      hideTitle,
      hideCover,
      lock,
      dispatch,
      onOpenMenu: openCardMenu,
      onRequestDelete: requestDelete,
      eagerCover: state.exportInProgress,
      fillColumns
    }),
    [
      columnCount,
      records,
      cardWidth,
      cardHeight,
      hideTitle,
      hideCover,
      lock,
      dispatch,
      openCardMenu,
      requestDelete,
      state.exportInProgress,
      fillColumns
    ]
  )

  return (
    <>
      <div ref={containerRef} className="w-full min-w-0" style={{ width: '100%', maxWidth: 'none' }}>
        {useVirtual ? (
          <div
            data-gallery-export-root
            className="w-full min-w-0"
            style={{ width: '100%', maxWidth: 'none' }}
            onContextMenu={handleGridContextMenu}
          >
            <Virtualizer
              scrollRef={mainScrollRef}
              data={rowIndexes}
              itemSize={rowHeight}
              bufferSize={rowHeight * 2}
            >
              {(rowIndex) => <GalleryGridRow rowIndex={rowIndex} {...rowProps} />}
            </Virtualizer>
          </div>
        ) : (
          <GalleryFlatGrid
            records={records}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            hideTitle={hideTitle}
            hideCover={hideCover}
            lock={lock}
            dispatch={dispatch}
            onOpenMenu={openCardMenu}
            onRequestDelete={requestDelete}
            onContextMenu={handleGridContextMenu}
            eagerCover={state.exportInProgress}
            fillColumns={fillColumns}
          />
        )}
      </div>

      {cardMenu && menuRec && cardActions && (
        <GalleryContextMenu
          x={cardMenu.x}
          y={cardMenu.y}
          cardSize={cardSize}
          hideTitle={hideTitle}
          hideCover={hideCover}
          showCoverActions
          hasCoverUrl={Boolean(menuRec.coverUrl)}
          onChangeCover={cardActions.onChangeCover}
          onEditCover={cardActions.onEditCover}
          onSelectSize={updateCardSize}
          onToggleHideTitle={toggleHideTitle}
          onToggleHideCover={toggleHideCover}
          onDelete={cardActions.onDelete}
          onClose={() => setCardMenu(null)}
        />
      )}

      {gridMenu && (
        <GalleryContextMenu
          x={gridMenu.x}
          y={gridMenu.y}
          cardSize={cardSize}
          hideTitle={hideTitle}
          hideCover={hideCover}
          showCoverActions={false}
          hasCoverUrl={false}
          onChangeCover={() => {}}
          onEditCover={() => {}}
          onSelectSize={updateCardSize}
          onToggleHideTitle={toggleHideTitle}
          onToggleHideCover={toggleHideCover}
          onDelete={() => {}}
          onClose={() => setGridMenu(null)}
        />
      )}

      {pendingDeleteId && (
        <DeleteConfirmDialog
          message="이 작품을 삭제할까요?"
          showSkipAsk={false}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </>
  )
}
