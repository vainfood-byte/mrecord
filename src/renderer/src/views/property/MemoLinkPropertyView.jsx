import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { Crop, Trash2 } from 'lucide-react'
import { Virtualizer } from 'virtua'
import { useApp } from '../../context/AppContext'
import { useMainScrollRef } from '../../context/MainScrollContext'
import { useRecordListView } from '../../hooks/useRecordListView'
import { useGridColumnCount } from '../../hooks/useGridColumnCount'
import { isRecordLocked } from '../../components/layout/LockToggle'
import { GalleryAddCard } from '../../components/ui/AddRecordCard'
import CoverUploadPlaceholder from '../../components/ui/CoverUploadPlaceholder'
import LazyImage from '../../components/ui/LazyImage'
import CoverCropEditor from '../../components/calendar/CoverCropEditor'
import { useClipboardPaste } from '../../hooks/useClipboardPaste'
import { GALLERY_CARD_SIZES, getGalleryCardWidth } from '../../constants/galleryCardSizes'
import { GALLERY_GRID_GAP, VIRTUAL_THRESHOLD } from '../../constants/virtualization'
import { coverPlaceholderStyle } from '../../utils/colorUtils'
import { offscreenCardHint } from '../../utils/renderHints'
import {
  clearMemoCover,
  getMemoCardImageState,
  isMemoCoverActive,
  setMemoCoverUrl,
  toggleMemoCover
} from '../../utils/memoCoverHelpers'
import {
  MEMO_TEXT_SIZES,
  getMemoGradientStyle,
  getMemoGradientTextStyle,
  getMemoPanelStyle,
  MEMO_GRADIENT_COVER_RATIO,
  MEMO_V2_PANEL_INSET_PX,
  MEMO_V2_PANEL_PAD_PX,
  computeMemoV2LayoutMetrics,
  getMemoTabSettings,
  getMemoTextSizePx,
  getMemoExportTextSizePx,
  patchMemoTabSettings
} from '../../utils/memoTabSettings'
import { SizeOptionMenuSection } from '../../components/ui/SizeOptionMenuSection'

function getFieldValue(rec, field) {
  if (field.type === 'link') return rec.link || rec[field.id] || ''
  return rec[field.id] ?? rec.customFields?.[field.id] ?? ''
}

function PopupMenu({ x, y, children, onClose }) {
  return (
    <>
      <div className="fixed inset-0 z-[200]" onMouseDown={onClose} />
      <div
        data-popup-root
        className="fixed z-[201] min-w-[150px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
        style={{ left: x, top: y, WebkitAppRegion: 'no-drag' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  )
}

function MenuButton({ children, onClick, active, className = '' }) {
  return (
    <button
      type="button"
      className={`block w-full px-3 py-2 text-left text-xs hover:bg-black/5 ${active ? 'font-medium text-[var(--color-accent)]' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function MenuSection({ label, variant, options, current, onSelect }) {
  return (
    <SizeOptionMenuSection
      label={label}
      variant={variant}
      options={options}
      current={current}
      onSelect={onSelect}
    />
  )
}

function MemoCardBackground({
  rec,
  imageState,
  blurCover,
  locked,
  showCoverControls,
  eagerCover,
  cacheKey,
  onUpload,
  onCrop,
  onDeleteCover,
  onChangeCover
}) {
  if (imageState.mode === 'upload') {
    if (locked) {
      return (
        <div
          className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs font-medium blur-sm"
          style={coverPlaceholderStyle(imageState.color)}
        >
          {rec.title}
        </div>
      )
    }
    return (
      <div className="absolute inset-0">
        <CoverUploadPlaceholder onClick={onUpload} />
      </div>
    )
  }

  if (imageState.url) {
    return (
      <>
        <LazyImage
          src={imageState.url}
          alt={rec.title}
          cacheKey={cacheKey}
          eager={eagerCover}
          className={`absolute inset-0 h-full w-full object-cover ${blurCover ? 'scale-110 blur-md' : ''}`}
          draggable={false}
        />
        {showCoverControls && !locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/0 opacity-0 transition-opacity group-hover:opacity-100 group-hover:bg-black/45">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChangeCover()
              }}
              className="rounded-lg bg-white px-3 py-1.5 text-[10px] font-medium text-neutral-900 shadow hover:bg-neutral-100"
            >
              커버 변경
            </button>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onCrop()
                }}
                className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[10px] font-medium text-neutral-900 shadow hover:bg-neutral-100"
              >
                <Crop size={11} /> 크롭
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteCover()
                }}
                className="flex items-center gap-1 rounded-lg bg-red-500/90 px-2.5 py-1 text-[10px] text-white shadow hover:bg-red-600"
              >
                <Trash2 size={11} /> 커버 삭제
              </button>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div
      className={`absolute inset-0 flex items-center justify-center p-2 text-center text-xs font-medium leading-snug ${blurCover ? 'blur-sm' : ''}`}
      style={coverPlaceholderStyle(imageState.color)}
    >
      {rec.title}
    </div>
  )
}

const MemoCardV1 = memo(function MemoCardV1({
  rec,
  field,
  cardWidth,
  fillWidth = false,
  blurCoverImage,
  blurTitle,
  gradient,
  textSizePx,
  imageState,
  locked,
  maintainLayout,
  eagerCover,
  dispatch,
  onCardContextMenu,
  onUpload,
  onCrop,
  onDeleteCover,
  onChangeCover
}) {
  const memoVal = getFieldValue(rec, field)
  const textStyle = getMemoGradientTextStyle(gradient)
  const showCoverControls = imageState.mode === 'cover'

  return (
    <div
      data-memo-card-export
      data-maintain-layout={maintainLayout ? '' : undefined}
      className="group min-w-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ width: fillWidth ? '100%' : cardWidth }}
      onContextMenu={onCardContextMenu}
    >
      <div
        data-memo-title-bar
        className={`border-b border-[var(--color-border)] bg-[var(--color-bg-sub-panel)] px-2 py-1.5 ${blurTitle ? 'blur-sm select-none' : ''}`}
      >
        <p
          data-memo-title
          className="line-clamp-2 text-left font-medium leading-snug text-[var(--color-text)]"
          style={{ fontSize: `${textSizePx}px` }}
        >
          {rec.title}
        </p>
      </div>

      <div
        data-memo-cover
        className="relative aspect-[3/4] w-full cursor-pointer overflow-hidden"
        style={{ backgroundColor: rec.coverColor || '#C4A882' }}
        onClick={() => dispatch({ type: 'SELECT_RECORD', payload: rec.id })}
      >
        <MemoCardBackground
          rec={rec}
          imageState={imageState}
          blurCover={blurCoverImage}
          locked={locked}
          showCoverControls={showCoverControls}
          eagerCover={eagerCover}
          cacheKey={`${rec.id}:${field.id}`}
          onUpload={onUpload}
          onCrop={onCrop}
          onDeleteCover={onDeleteCover}
          onChangeCover={onChangeCover}
        />

        <div
          data-memo-gradient
          data-memo-color={gradient}
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{
            height: `${MEMO_GRADIENT_COVER_RATIO * 100}%`,
            ...(gradient !== 'theme' ? { background: getMemoGradientStyle(gradient) } : {})
          }}
        />

        <div
          data-memo-text-wrap
          className="pointer-events-none absolute inset-x-0 top-0 z-10 px-2.5 py-2"
        >
          <p
            data-memo-text
            data-memo-color={gradient}
            className={`whitespace-pre-wrap break-keep text-left leading-snug line-clamp-[7] ${
              maintainLayout ? 'overflow-hidden' : ''
            }`}
            style={{
              fontSize: `${textSizePx}px`,
              ...(gradient !== 'theme' ? textStyle : {})
            }}
          >
            {memoVal || '—'}
          </p>
        </div>
      </div>
    </div>
  )
})

const MemoCardV2 = memo(function MemoCardV2({
  rec,
  field,
  cardWidth,
  fillWidth = false,
  blurCoverImage,
  blurTitle,
  gradient,
  textSizePx,
  imageState,
  locked,
  maintainLayout,
  eagerCover,
  dispatch,
  onCardContextMenu,
  onUpload,
  onCrop,
  onDeleteCover,
  onChangeCover
}) {
  const memoVal = getFieldValue(rec, field)
  const panelStyle = getMemoPanelStyle(gradient)
  const showCoverControls = imageState.mode === 'cover'
  const coverMinHeight = Math.round(cardWidth * (4 / 3))
  const { panelMinHeight } = computeMemoV2LayoutMetrics(cardWidth, coverMinHeight)

  return (
    <div
      data-memo-card-export
      data-maintain-layout={maintainLayout ? '' : undefined}
      className="group min-w-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ width: fillWidth ? '100%' : cardWidth }}
      onContextMenu={onCardContextMenu}
    >
      <div
        data-memo-cover
        className={`relative flex w-full cursor-pointer items-center justify-center overflow-hidden ${
          maintainLayout ? 'aspect-[3/4]' : ''
        }`}
        style={{
          backgroundColor: rec.coverColor || '#C4A882',
          ...(maintainLayout ? {} : { minHeight: coverMinHeight })
        }}
        onClick={() => dispatch({ type: 'SELECT_RECORD', payload: rec.id })}
      >
        <MemoCardBackground
          rec={rec}
          imageState={imageState}
          blurCover={blurCoverImage}
          locked={locked}
          showCoverControls={showCoverControls}
          eagerCover={eagerCover}
          cacheKey={`${rec.id}:${field.id}`}
          onUpload={onUpload}
          onCrop={onCrop}
          onDeleteCover={onDeleteCover}
          onChangeCover={onChangeCover}
        />

        <div
          className={`z-10 box-border ${
            maintainLayout
              ? 'absolute inset-0 flex'
              : 'relative flex w-full items-center justify-center'
          }`}
          style={{
            padding: `${MEMO_V2_PANEL_INSET_PX}px`
          }}
        >
          <div
            data-memo-panel
            data-memo-color={gradient}
            className={`flex w-full items-center justify-center rounded-md shadow-sm ${
              maintainLayout ? 'min-h-0 max-h-full flex-1 overflow-hidden' : ''
            }`}
            style={{
              boxSizing: 'border-box',
              padding: `${MEMO_V2_PANEL_PAD_PX}px`,
              ...(maintainLayout ? {} : { minHeight: panelMinHeight }),
              ...(gradient !== 'theme' ? panelStyle : {})
            }}
          >
            <p
              data-memo-text
              data-memo-color={gradient}
              className={`w-full whitespace-pre-wrap break-keep text-center leading-snug ${
                maintainLayout ? 'line-clamp-[12] overflow-hidden' : ''
              }`}
              style={{
                fontSize: `${textSizePx}px`,
                wordBreak: 'keep-all',
                ...(gradient !== 'theme' ? { color: panelStyle.color } : {})
              }}
            >
              {memoVal || '—'}
            </p>
          </div>
        </div>
      </div>

      <div
        data-memo-title-bar
        className={`border-t border-[var(--color-border)] bg-[var(--color-bg-sub-panel)] px-2 py-1.5 ${blurTitle ? 'blur-sm select-none' : ''}`}
      >
        <p
          data-memo-title
          className="line-clamp-2 text-center font-medium leading-snug text-[var(--color-text)]"
          style={{ fontSize: `${textSizePx}px` }}
        >
          {rec.title}
        </p>
      </div>
    </div>
  )
})

function buildMemoCardProps({
  rec,
  field,
  cardWidth,
  fillColumns,
  tabSettings,
  displayTextSizePx,
  lock,
  exportInProgress,
  dispatch,
  openCardMenu,
  openUpload,
  setCropState,
  deleteRecordCover
}) {
  const locked = isRecordLocked(rec, lock)
  const imageState = getMemoCardImageState(rec, field.id)
  const blurCoverImage = locked || (tabSettings.hideCover && imageState.mode !== 'upload')
  return {
    rec,
    field,
    cardWidth,
    fillWidth: fillColumns,
    blurCoverImage,
    blurTitle: locked,
    locked,
    gradient: tabSettings.gradient,
    textSizePx: displayTextSizePx,
    maintainLayout: tabSettings.maintainLayout,
    imageState,
    eagerCover: exportInProgress,
    dispatch,
    onCardContextMenu: (e) => openCardMenu(e, rec.id),
    onUpload: () => openUpload(rec),
    onCrop: () => {
      if (imageState.url) setCropState({ rec, imageUrl: imageState.url })
    },
    onDeleteCover: () => deleteRecordCover(rec),
    onChangeCover: () => openUpload(rec)
  }
}

function renderMemoCardCell({
  index,
  records,
  field,
  cardWidth,
  cardHeight,
  tabSettings,
  displayTextSizePx,
  lock,
  exportInProgress,
  dispatch,
  openCardMenu,
  openUpload,
  setCropState,
  deleteRecordCover,
  fillColumns = false
}) {
  const totalSlots = records.length + 1
  if (index >= totalSlots) return null

  if (index === records.length) {
    return (
      <GalleryAddCard
        key="memo-add-card"
        onClick={() => dispatch({ type: 'CREATE_NEW_RECORD' })}
        width={cardWidth}
        fillWidth={fillColumns}
      />
    )
  }

  const rec = records[index]
  const cardProps = buildMemoCardProps({
    rec,
    field,
    cardWidth,
    fillColumns,
    tabSettings,
    displayTextSizePx,
    lock,
    exportInProgress,
    dispatch,
    openCardMenu,
    openUpload,
    setCropState,
    deleteRecordCover
  })

  return (
    <div
      key={rec.id}
      data-memo-card
      style={{
        width: fillColumns ? '100%' : cardWidth,
        minWidth: 0,
        minHeight: cardHeight,
        ...offscreenCardHint(cardWidth, cardHeight)
      }}
    >
      {tabSettings.cardVersion === 'v2' ? <MemoCardV2 {...cardProps} /> : <MemoCardV1 {...cardProps} />}
    </div>
  )
}

const MemoGridRow = memo(function MemoGridRow({
  rowIndex,
  columnCount,
  records,
  field,
  cardWidth,
  cardHeight,
  gap,
  tabSettings,
  displayTextSizePx,
  lock,
  exportInProgress,
  dispatch,
  openCardMenu,
  openUpload,
  setCropState,
  deleteRecordCover,
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
        return renderMemoCardCell({
          index,
          records,
          field,
          cardWidth,
          cardHeight,
          tabSettings,
          displayTextSizePx,
          lock,
          exportInProgress,
          dispatch,
          openCardMenu,
          openUpload,
          setCropState,
          deleteRecordCover,
          fillColumns
        })
      })}
    </div>
  )
})

function MemoFlatGrid({
  records,
  field,
  cardWidth,
  cardHeight,
  tabSettings,
  displayTextSizePx,
  lock,
  exportInProgress,
  dispatch,
  openCardMenu,
  openUpload,
  setCropState,
  deleteRecordCover,
  onContextMenu,
  fillColumns = false
}) {
  return (
    <div
      data-memo-export-root
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
      {records.map((rec) => {
        const cardProps = buildMemoCardProps({
          rec,
          field,
          cardWidth,
          fillColumns,
          tabSettings,
          displayTextSizePx,
          lock,
          exportInProgress,
          dispatch,
          openCardMenu,
          openUpload,
          setCropState,
          deleteRecordCover
        })
        return (
          <div
            key={rec.id}
            data-memo-card
            style={{
              width: fillColumns ? '100%' : cardWidth,
              minWidth: 0,
              ...offscreenCardHint(cardWidth, cardHeight)
            }}
          >
            {tabSettings.cardVersion === 'v2' ? (
              <MemoCardV2 {...cardProps} />
            ) : (
              <MemoCardV1 {...cardProps} />
            )}
          </div>
        )
      })}
      <GalleryAddCard
        onClick={() => dispatch({ type: 'CREATE_NEW_RECORD' })}
        width={cardWidth}
        fillWidth={fillColumns}
      />
    </div>
  )
}

function MemoCardView({ field, sorted, tabSettings, onUpdateSettings, pagedView }) {
  const { state, dispatch } = useApp()
  const mainScrollRef = useMainScrollRef()
  const lock = state.settings.lockSettings
  const exportInProgress = state.exportInProgress
  const cardWidth = getGalleryCardWidth(tabSettings.cardSize)
  /* 사이드 패널 열림: 어두운 테마/갤러리와 동일하게 minmax(1fr)로 남은 폭 밀착 */
  const fillColumns = state.detailMode === 'side'
  const textSizePx = getMemoTextSizePx(tabSettings.textSize)
  const displayTextSizePx = exportInProgress ? getMemoExportTextSizePx() : textSizePx
  const [cardMenu, setCardMenu] = useState(null)
  const [cropState, setCropState] = useState(null)
  const fileRef = useRef(null)
  const containerRef = useRef(null)
  const gridRef = useRef(null)
  const [uploadTargetId, setUploadTargetId] = useState(null)
  const columnCount = useGridColumnCount(containerRef, cardWidth, GALLERY_GRID_GAP)

  const updateRecordCover = (rec, coverUrl) => {
    dispatch({
      type: 'UPDATE_RECORD',
      payload: { ...rec, ...setMemoCoverUrl(rec, field.id, coverUrl) }
    })
  }

  const deleteRecordCover = useCallback(
    (rec) => {
      dispatch({
        type: 'UPDATE_RECORD',
        payload: { ...rec, ...clearMemoCover(rec, field.id) }
      })
    },
    [dispatch, field.id]
  )

  const openUpload = useCallback((rec) => {
    setUploadTargetId(rec.id)
    fileRef.current?.click()
  }, [])

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file || !uploadTargetId) return
    const rec = sorted.find((r) => r.id === uploadTargetId)
    if (!rec) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCropState({ rec, imageUrl: reader.result })
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
    setUploadTargetId(null)
  }

  useClipboardPaste(
    (dataUrl) => {
      if (!uploadTargetId) return
      const rec = sorted.find((r) => r.id === uploadTargetId)
      if (!rec) return
      setCropState({ rec, imageUrl: dataUrl })
      setUploadTargetId(null)
    },
    {
      shouldIgnore: () => {
        const hovered =
          Boolean(gridRef.current?.matches(':hover')) ||
          Boolean(containerRef.current?.matches(':hover'))
        return !hovered || !uploadTargetId
      }
    }
  )

  const openCardMenu = useCallback((e, recordId = null) => {
    e.preventDefault()
    e.stopPropagation()
    setCardMenu({ x: e.clientX, y: e.clientY, recordId })
  }, [])

  const cardHeight = Math.round(cardWidth * (4 / 3) + 44)
  const rowHeight = cardHeight + GALLERY_GRID_GAP
  const rowCount = Math.ceil((sorted.length + 1) / columnCount)
  const rowIndexes = useMemo(() => Array.from({ length: rowCount }, (_, i) => i), [rowCount])
  /* V2 + 규격유지 해제 시 행 높이 가변 → itemSize 없이 Virtua 실측 */
  const fixedCardHeight =
    tabSettings.cardVersion !== 'v2' || tabSettings.maintainLayout === true
  const useVirtual =
    mainScrollRef &&
    !exportInProgress &&
    !state.exportRecordSlice &&
    !pagedView &&
    sorted.length >= VIRTUAL_THRESHOLD

  const colorOptions = [
    ['black', { label: '블랙' }],
    ['white', { label: '화이트' }],
    ['theme', { label: '테마' }]
  ]

  const rowProps = useMemo(
    () => ({
      columnCount,
      records: sorted,
      field,
      cardWidth,
      cardHeight,
      gap: GALLERY_GRID_GAP,
      tabSettings,
      displayTextSizePx,
      lock,
      exportInProgress,
      dispatch,
      openCardMenu,
      openUpload,
      setCropState,
      deleteRecordCover,
      fillColumns
    }),
    [
      columnCount,
      sorted,
      field,
      cardWidth,
      cardHeight,
      tabSettings,
      displayTextSizePx,
      lock,
      exportInProgress,
      dispatch,
      openCardMenu,
      openUpload,
      deleteRecordCover,
      fillColumns
    ]
  )

  return (
    <>
      <div ref={containerRef} className="w-full min-w-0" style={{ width: '100%', maxWidth: 'none' }}>
        {useVirtual ? (
          <div
            ref={gridRef}
            data-memo-export-root
            className="w-full min-w-0"
            style={{ width: '100%', maxWidth: 'none' }}
            onContextMenu={openCardMenu}
          >
            <Virtualizer
              scrollRef={mainScrollRef}
              data={rowIndexes}
              {...(fixedCardHeight ? { itemSize: rowHeight } : {})}
              bufferSize={rowHeight * 2}
            >
              {(rowIndex) => <MemoGridRow rowIndex={rowIndex} {...rowProps} />}
            </Virtualizer>
          </div>
        ) : (
          <div ref={gridRef}>
            <MemoFlatGrid
              records={sorted}
              field={field}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              tabSettings={tabSettings}
              displayTextSizePx={displayTextSizePx}
              lock={lock}
              exportInProgress={exportInProgress}
              dispatch={dispatch}
              openCardMenu={openCardMenu}
              openUpload={openUpload}
              setCropState={setCropState}
              deleteRecordCover={deleteRecordCover}
              onContextMenu={openCardMenu}
              fillColumns={fillColumns}
            />
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {cropState && (
        <CoverCropEditor
          imageUrl={cropState.imageUrl}
          aspect={3 / 4}
          freeResize
          onApply={(url) => {
            updateRecordCover(cropState.rec, url)
            setCropState(null)
          }}
          onClose={() => setCropState(null)}
        />
      )}

      {cardMenu && (() => {
        const menuRec = cardMenu.recordId
          ? sorted.find((r) => r.id === cardMenu.recordId)
          : null
        const coverActive = menuRec ? isMemoCoverActive(menuRec, field.id) : false

        return (
        <PopupMenu x={cardMenu.x} y={cardMenu.y} onClose={() => setCardMenu(null)}>
          <MenuButton
            onClick={() => {
              onUpdateSettings({
                cardVersion: tabSettings.cardVersion === 'v2' ? 'v1' : 'v2'
              })
              setCardMenu(null)
            }}
          >
            다른 버전
          </MenuButton>
          {menuRec && (
            <MenuButton
              active={coverActive}
              onClick={() => {
                dispatch({
                  type: 'UPDATE_RECORD',
                  payload: { ...menuRec, ...toggleMemoCover(menuRec, field.id) }
                })
                setCardMenu(null)
              }}
            >
              커버로 변경
              {coverActive ? ' ✓' : ''}
            </MenuButton>
          )}
          <MenuSection
            label="카드 크기 변경"
            variant="card"
            options={Object.entries(GALLERY_CARD_SIZES)}
            current={tabSettings.cardSize}
            onSelect={(key) => onUpdateSettings({ cardSize: key })}
          />
          <MenuSection
            label="텍스트 크기 변경"
            variant="text"
            options={Object.entries(MEMO_TEXT_SIZES)}
            current={tabSettings.textSize}
            onSelect={(key) => onUpdateSettings({ textSize: key })}
          />
          <MenuSection
            label="컬러"
            variant="color"
            options={colorOptions}
            current={tabSettings.gradient}
            onSelect={(key) => onUpdateSettings({ gradient: key })}
          />
          <div className="my-1 border-t border-[var(--color-border)]" />
          <MenuButton
            active={tabSettings.maintainLayout}
            onClick={() => {
              onUpdateSettings({ maintainLayout: !tabSettings.maintainLayout })
              setCardMenu(null)
            }}
          >
            규격유지
            {tabSettings.maintainLayout ? ' ✓' : ''}
          </MenuButton>
          <MenuButton
            active={tabSettings.hideCover}
            onClick={() => {
              onUpdateSettings({ hideCover: !tabSettings.hideCover })
              setCardMenu(null)
            }}
          >
            표지 숨기기
            {tabSettings.hideCover ? ' ✓' : ''}
          </MenuButton>
        </PopupMenu>
        )
      })()}
    </>
  )
}

export default function MemoLinkPropertyView({ field }) {
  const { state, dispatch } = useApp()
  const { records, pagedView } = useRecordListView()
  const tabSettings = getMemoTabSettings(state.settings, field.id)

  const updateTabSettings = (patch) => {
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        memoTabSettings: patchMemoTabSettings(state.settings, field.id, patch)
      }
    })
  }

  return (
    <MemoCardView
      field={field}
      sorted={records}
      tabSettings={tabSettings}
      onUpdateSettings={updateTabSettings}
      pagedView={pagedView}
    />
  )
}
