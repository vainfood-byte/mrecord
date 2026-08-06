import { useRef, useState, useEffect, useCallback, memo } from 'react'
import { Camera, Feather, Image as ImageIcon, Save } from 'lucide-react'
import { useApp, useSelectedRecord, useTagsMap } from '../../context/AppContext'
import CoverCropEditor from '../calendar/CoverCropEditor'
import EditBox from './EditBox'
import ReviewImageToolbar from './ReviewImageToolbar'
import ReviewImageViewer from './ReviewImageViewer'
import QuoteWrapMenu, { wrapRangeWithQuotes } from './QuoteWrapMenu'
import CharInsertMenu from '../ui/CharInsertMenu'
import { exportFullRecord, buildSeriesReviewSections } from '../../utils/exportFullRecord'
import { resolveFontFamily } from '../../data/defaults'
import { getThemeColors } from '../../utils/colorUtils'
import EditableTitle from '../ui/EditableTitle'
import ResizeHandle from '../ui/ResizeHandle'
import { useDragResize } from '../../hooks/useClipboardPaste'
import { createReviewContentSaver } from '../../utils/reviewContentSaver'
import { FLUSH_PENDING_SAVES_EVENT } from '../../utils/storage'
import { insertTextAtCursor as insertTextIntoEditor } from '../../utils/insertTextAtCursor'
import { hydrateRecord } from '../../utils/recordHeavyStore'

/** 본문 이미지 리플로우 병목 차단 — GPU 레이어 분리 */
function applyReviewImgPerfStyle(img) {
  if (!img) return
  img.style.contain = 'layout paint'
  img.style.willChange = 'transform'
}

function applyReviewImgPerfStyles(root) {
  if (!root) return
  root.querySelectorAll('img').forEach(applyReviewImgPerfStyle)
}

function revokeBlobUrl(src) {
  if (typeof src === 'string' && src.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(src)
    } catch {
      /* ignore */
    }
  }
}

/** 본문 비어 있음 여부 (텍스트·이미지 모두 없을 때) */
function isReviewBodyEmpty(html) {
  if (!html || !String(html).trim()) return true
  if (/<img\b/i.test(html)) return false
  const text = String(html)
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '')
  return !text
}

function insertImageAtCursor(editor, dataUrl) {
  editor.focus()
  const img = document.createElement('img')
  img.src = dataUrl
  img.className = 'review-img max-w-full rounded-lg my-2 cursor-pointer inline-block'
  img.style.width = '200px'
  img.draggable = false
  applyReviewImgPerfStyle(img)

  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0)
    if (editor.contains(range.commonAncestorContainer)) {
      range.deleteContents()
      range.insertNode(img)
      range.setStartAfter(img)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
  }
  editor.appendChild(img)
}

/** 본문 파일 드롭용 — EditBox/Ctrl+V 경로와 분리된 로컬 헬퍼 */
function readImageFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('invalid image'))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function dataTransferHasFiles(dt) {
  if (!dt?.types) return false
  return Array.from(dt.types).includes('Files')
}

function insertTextAtCursor(editor, text) {
  insertTextIntoEditor(editor, text)
}

const ReviewSubtitleInput = memo(function ReviewSubtitleInput({
  initialValue,
  recordKey,
  className,
  placeholder,
  onCommit,
  onFlush
}) {
  const [draft, setDraft] = useState(initialValue)
  const timerRef = useRef(null)
  const draftRef = useRef(initialValue)
  const onFlushRef = useRef(onFlush)
  onFlushRef.current = onFlush

  // 회차/작품 전환 시 이전 소제목을 먼저 flush한 뒤 새 값 로드
  useEffect(() => {
    setDraft(initialValue)
    draftRef.current = initialValue
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      onFlushRef.current?.(draftRef.current)
    }
  }, [recordKey]) // eslint-disable-line react-hooks/exhaustive-deps -- initialValue는 key 변경 시점 값만 사용

  const handleChange = (e) => {
    const value = e.target.value
    draftRef.current = value
    setDraft(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onCommit(value)
    }, 250)
  }

  const handleBlur = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    onFlush(draftRef.current)
  }

  return (
    <input
      type="text"
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      style={{ WebkitAppRegion: 'no-drag' }}
      className={className}
    />
  )
})

function ReviewEditor({
  compact = false,
  fullLayout = false,
  propertyFields,
  minBodyHeight,
  fullLayoutReviewHeight = 480,
  fullLayoutReviewPercent = 80,
  onFullLayoutReviewHeightChange,
  onFullLayoutReviewPercentChange
}) {
  const { state, dispatch } = useApp()
  const record = useSelectedRecord()
  const tagsMap = useTagsMap()
  const editorRef = useRef(null)
  const contentKeyRef = useRef('')
  const contentSaverRef = useRef(null)
  const saveReviewRef = useRef(null)
  const recordRef = useRef(record)
  const recordsRef = useRef(state.records)
  const volumeReviewsRef = useRef({})
  /** 현재 에디터에 바인딩된 저장 대상 (회차 전환 전에 flush할 때 사용) */
  const activeTargetRef = useRef({ recordId: null, volume: null })
  const subtitleLiveRef = useRef('')
  const isComposingRef = useRef(false)
  const isEditingRef = useRef(false)
  const imgDragRef = useRef(null)
  /** 본문 이미지 더블탭(펜/마우스) — 타임스탬프·좌표 허용 + 이중 오픈 방지 */
  const imgDblTapRef = useRef({ img: null, time: 0, x: 0, y: 0, openedAt: 0 })
  /** 편집 중 최신 본문 HTML — [저장] 시 editor DOM과 함께 사용 */
  const draftHtmlRef = useRef('')
  const inputFrameRef = useRef(null)
  const inputDebounceRef = useRef(null)
  /** contentKey와 일치할 때만 갱신 — 회차 전환 직전 프레임에서도 이전 회차 목록 유지 */
  const stableChapterImagesRef = useRef([])
  const [seriesExport, setSeriesExport] = useState(false)
  const [editBoxCollapsed, setEditBoxCollapsed] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  /** 수동 저장 직후 UI용 본문 스냅샷 — 전역 state 반영 전 [작성하기] 잔존 방지 */
  const [bodyHtmlSnapshot, setBodyHtmlSnapshot] = useState(null)
  const [pruneEpoch, setPruneEpoch] = useState(0)
  const [imageViewer, setImageViewer] = useState(null)
  const [selectedImg, setSelectedImg] = useState(null)
  const [cropSrc, setCropSrc] = useState(null)
  const [quoteMenu, setQuoteMenu] = useState(null)
  const [charMenu, setCharMenu] = useState(null)
  const [liveReviewHeight, setLiveReviewHeight] = useState(null)
  /** 본문 파일 드래그 오버 하이라이트 (편집 모드 전용) */
  const [bodyDragOver, setBodyDragOver] = useState(false)
  const bodyDragDepthRef = useRef(0)
  isEditingRef.current = isEditing
  const resizable = Boolean(onFullLayoutReviewHeightChange || onFullLayoutReviewPercentChange)
  const reviewHeight = liveReviewHeight ?? fullLayoutReviewHeight
  const reviewPercent = fullLayoutReviewPercent ?? 80
  const activeReviewPercent = liveReviewHeight ?? reviewPercent
  const activeEditPercent = 100 - activeReviewPercent
  /** 편집 모드일 때만 편집박스·리사이즈 분할 표시 */
  const showEditPane = isEditing

  const startReviewResize = useDragResize(reviewPercent, {
    axis: 'y',
    min: 50,
    max: 90,
    onMove: setLiveReviewHeight,
    onCommit: (pct) => {
      onFullLayoutReviewPercentChange?.(pct)
      onFullLayoutReviewHeightChange?.(Math.round((pct / 100) * 800))
      setLiveReviewHeight(null)
    }
  })

  const series = record?.series || { enabled: false, unit: '권', volumes: [1] }
  const vol = state.selectedVolume
  const isVolumeMode = series.enabled && vol != null

  const volumeReviews = record?.volumeReviews || {}
  const current = isVolumeMode
    ? volumeReviews[vol] || { subtitle: '', content: '', images: [] }
    : {
        subtitle: record?.reviewSubtitle || '',
        content: record?.review || '',
        images: record?.reviewImages || []
      }

  const headerLabel = isVolumeMode ? `${vol} ${series.unit}` : ''
  const subtitleKey = `${record?.id ?? ''}:${vol ?? ''}`
  const chapterKey = `${record?.id ?? ''}:${vol ?? ''}`
  const displayBodyHtml =
    bodyHtmlSnapshot !== null ? bodyHtmlSnapshot : current.content || ''
  const isBodyEmpty = isReviewBodyEmpty(displayBodyHtml)

  recordRef.current = record
  recordsRef.current = state.records
  if (record && activeTargetRef.current.recordId === record.id) {
    volumeReviewsRef.current = volumeReviews
  }
  {
    const liveKey = `${record?.id ?? ''}-${vol ?? 'all'}`
    if (contentKeyRef.current === liveKey) {
      stableChapterImagesRef.current = current.images || []
    }
  }

  const saveReviewToTarget = useCallback(
    (patch, target) => {
      if (!target?.recordId) return
      // 동일 이벤트 내 연속 저장 시 recordsRef는 아직 이전 스냅샷일 수 있음 → recordRef 우선
      const fromList = recordsRef.current?.find((r) => r.id === target.recordId)
      const rec =
        (recordRef.current?.id === target.recordId ? recordRef.current : null) ||
        (fromList ? hydrateRecord(fromList) : null)
      if (!rec) return

      if (target.volume != null) {
        const baseReviews =
          recordRef.current?.id === target.recordId
            ? volumeReviewsRef.current || rec.volumeReviews || {}
            : rec.volumeReviews || {}
        const reviews = { ...baseReviews }
        const prev = reviews[target.volume] || { subtitle: '', content: '', images: [] }
        const nextVol = { ...prev, ...patch }
        const nextReviews = { ...reviews, [target.volume]: nextVol }
        if (recordRef.current?.id === target.recordId) {
          volumeReviewsRef.current = nextReviews
        }
        const nextRec = { ...rec, volumeReviews: nextReviews }
        if (recordRef.current?.id === target.recordId) recordRef.current = nextRec
        if (recordsRef.current) {
          recordsRef.current = recordsRef.current.map((r) =>
            r.id === nextRec.id ? nextRec : r
          )
        }
        dispatch({ type: 'UPDATE_RECORD', payload: nextRec })
        return
      }

      const nextRec = {
        ...rec,
        reviewSubtitle: patch.subtitle !== undefined ? patch.subtitle : rec.reviewSubtitle ?? '',
        review: patch.content !== undefined ? patch.content : rec.review ?? '',
        reviewImages: patch.images !== undefined ? patch.images : rec.reviewImages ?? []
      }
      if (recordRef.current?.id === target.recordId) recordRef.current = nextRec
      if (recordsRef.current) {
        recordsRef.current = recordsRef.current.map((r) =>
          r.id === nextRec.id ? nextRec : r
        )
      }
      dispatch({ type: 'UPDATE_RECORD', payload: nextRec })
    },
    [dispatch]
  )

  const saveReview = useCallback(
    (patch) => {
      saveReviewToTarget(patch, activeTargetRef.current)
    },
    [saveReviewToTarget]
  )

  saveReviewRef.current = saveReview

  useEffect(() => {
    contentSaverRef.current = createReviewContentSaver({
      getContent: () => editorRef.current?.innerHTML || draftHtmlRef.current || '',
      onSave: (content) => saveReviewRef.current?.({ content }),
      delay: 280
    })
    return () => {
      contentSaverRef.current?.cancel()
      if (inputDebounceRef.current) clearTimeout(inputDebounceRef.current)
    }
  }, [])

  /** 편집 중 포맷/이미지 조작만 디바운스 저장 — 타이핑은 수동 저장(또는 회차 전환 flush) */
  const scheduleContentSave = useCallback(() => {
    if (!isEditingRef.current) return
    contentSaverRef.current?.schedule()
  }, [])

  const flushContentSave = useCallback(() => {
    contentSaverRef.current?.flush()
  }, [])

  const flushSubtitleSave = useCallback((value) => {
    const next = value ?? subtitleLiveRef.current ?? ''
    subtitleLiveRef.current = next
    saveReviewRef.current?.({ subtitle: next })
  }, [])

  const flushPendingReviewSaves = useCallback(() => {
    contentSaverRef.current?.flush()
    flushSubtitleSave()
  }, [flushSubtitleSave])

  const commitSubtitle = useCallback((value) => {
    subtitleLiveRef.current = value
    saveReviewRef.current?.({ subtitle: value })
  }, [])

  const addImage = useCallback(
    (dataUrl, atCursor = false) => {
      const editor = editorRef.current
      if (!editor) return
      if (atCursor) insertImageAtCursor(editor, dataUrl)
      const images = [...new Set([...(current.images || []), dataUrl])]
      saveReviewRef.current?.({ images })
      scheduleContentSave()
    },
    [current.images, scheduleContentSave]
  )

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const onPaste = (e) => {
      if (!isEditingRef.current) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (!file) continue
          const reader = new FileReader()
          reader.onload = () => {
            if (typeof reader.result === 'string') addImage(reader.result, true)
          }
          reader.readAsDataURL(file)
          return
        }
      }
    }

    editor.addEventListener('paste', onPaste)
    return () => editor.removeEventListener('paste', onPaste)
  }, [addImage, record?.id, vol])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const moveImgToPoint = (img, clientX, clientY) => {
      const range = document.caretRangeFromPoint?.(clientX, clientY)
      if (!range || !editor.contains(range.startContainer)) return
      img.remove()
      range.insertNode(img)
      range.setStartAfter(img)
      range.collapse(true)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }

    const openReviewImageViewer = (img) => {
      if (!img || !editor.contains(img)) return
      const now = performance.now()
      // dblclick + pointer 더블탭 이중 실행 차단
      if (now - (imgDblTapRef.current.openedAt || 0) < 400) return
      const imgs = [...editor.querySelectorAll('img')]
      const index = Math.max(0, imgs.indexOf(img))
      if (!imgs.length || index < 0) return
      imgDblTapRef.current = { img: null, time: 0, x: 0, y: 0, openedAt: now }
      setSelectedImg(null)
      setCropSrc(null)
      /* Base64 URL 배열을 state에 넣지 않음 — index만 보관, src는 DOM에서 resolve */
      setImageViewer({ index, count: imgs.length })
    }

    const onPointerDown = (e) => {
      // 펜/마우스/터치 공통: 동일 img 300ms·10px 이내 2회 → 뷰어 오픈 (읽기·편집 모두)
      const tapImg = e.target?.closest?.('img')
      if (
        tapImg &&
        editor.contains(tapImg) &&
        !e.target.closest?.('[data-resize-handle]') &&
        (e.button === 0 || e.button == null)
      ) {
        const now = performance.now()
        const prev = imgDblTapRef.current
        const dt = now - (prev.time || 0)
        const dist = Math.hypot(e.clientX - (prev.x || 0), e.clientY - (prev.y || 0))
        if (prev.img === tapImg && dt <= 300 && dist <= 10) {
          e.preventDefault()
          imgDragRef.current = null
          openReviewImageViewer(tapImg)
          return
        }
        imgDblTapRef.current = {
          ...prev,
          img: tapImg,
          time: now,
          x: e.clientX,
          y: e.clientY
        }
      }

      if (!isEditingRef.current) {
        if (!e.target.closest('[data-review-img-ui]')) setSelectedImg(null)
        return
      }
      if (e.target.tagName !== 'IMG') {
        if (!e.target.closest('[data-review-img-ui]')) setSelectedImg(null)
        return
      }
      if (e.target.closest('[data-resize-handle]')) return
      setSelectedImg(e.target)
      imgDragRef.current = {
        img: e.target,
        startX: e.clientX,
        startY: e.clientY,
        moved: false
      }
    }

    const onPointerMove = (e) => {
      const d = imgDragRef.current
      if (!d) return
      if (!d.moved && (Math.abs(e.clientX - d.startX) > 6 || Math.abs(e.clientY - d.startY) > 6)) {
        d.moved = true
        e.preventDefault()
        d.img.style.opacity = '0.55'
        d.img.style.cursor = 'grabbing'
        // 드래그로 판정되면 더블탭 후보 무효화
        imgDblTapRef.current = { ...imgDblTapRef.current, img: null, time: 0 }
      }
    }

    const onPointerUp = (e) => {
      const d = imgDragRef.current
      if (!d) return
      d.img.style.opacity = ''
      d.img.style.cursor = 'pointer'
      if (d.moved) moveImgToPoint(d.img, e.clientX, e.clientY)
      imgDragRef.current = null
      if (d.moved) scheduleContentSave()
    }

    const onDblClick = (e) => {
      const img = e.target?.closest?.('img')
      if (!img || !editor.contains(img)) return
      e.preventDefault()
      openReviewImageViewer(img)
    }

    editor.addEventListener('pointerdown', onPointerDown)
    editor.addEventListener('dblclick', onDblClick)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      editor.removeEventListener('pointerdown', onPointerDown)
      editor.removeEventListener('dblclick', onDblClick)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [record?.id, vol, scheduleContentSave])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return
      if (!isEditingRef.current) return
      if (!selectedImg || cropSrc) return
      if (!editorRef.current?.contains(selectedImg)) return
      e.preventDefault()
      selectedImg.remove()
      setSelectedImg(null)
      scheduleContentSave()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedImg, cropSrc, scheduleContentSave])

  const resolveViewerSrc = useCallback((i) => {
    const imgs = editorRef.current?.querySelectorAll?.('img')
    if (!imgs?.length) return ''
    const node = imgs[i]
    return node?.currentSrc || node?.src || ''
  }, [])

  const navigateViewer = useCallback((delta) => {
    setImageViewer((prev) => {
      if (!prev) return prev
      const imgs = editorRef.current?.querySelectorAll?.('img')
      const count = imgs?.length || prev.count || 0
      if (count <= 0) return null
      const next = (prev.index + delta + count) % count
      return { index: next, count }
    })
  }, [])

  const closeViewer = useCallback(() => setImageViewer(null), [])

  /** 회차/작품 전환 시 로컬 UI만 경량 리셋 (본문 DOM은 flush 이후 load effect에서 교체) */
  useEffect(() => {
    if (inputDebounceRef.current) {
      clearTimeout(inputDebounceRef.current)
      inputDebounceRef.current = null
    }
    setSelectedImg(null)
    setCropSrc(null)
    setIsEditing(false)
    setBodyHtmlSnapshot(null)
    setImageViewer(null)
    setQuoteMenu(null)
    setCharMenu(null)
    setBodyDragOver(false)
    bodyDragDepthRef.current = 0
    imgDblTapRef.current = { img: null, time: 0, x: 0, y: 0, openedAt: 0 }
  }, [record?.id, vol])

  useEffect(() => {
    const onFlushPending = () => flushPendingReviewSaves()
    window.addEventListener(FLUSH_PENDING_SAVES_EVENT, onFlushPending)
    return () => window.removeEventListener(FLUSH_PENDING_SAVES_EVENT, onFlushPending)
  }, [flushPendingReviewSaves])

  useEffect(() => {
    if (!record || !editorRef.current) return
    const key = `${record.id}-${vol ?? 'all'}`
    if (contentKeyRef.current === key) return

    // 이전 회차/작품 감상을 바인딩된 대상에 먼저 저장 (recordRef가 바뀌어도 target id로 저장)
    const prevTarget = activeTargetRef.current
    contentSaverRef.current?.flush()
    if (prevTarget.recordId) {
      saveReviewToTarget({ subtitle: subtitleLiveRef.current ?? '' }, prevTarget)
    }

    // flush 완료 후: 본문에 없는 편집박스 임시 blob URL만 해제 (저장된 본문 이미지는 유지)
    if (contentKeyRef.current) {
      const flushedHtml = editorRef.current?.innerHTML || ''
      for (const src of stableChapterImagesRef.current || []) {
        if (
          typeof src === 'string' &&
          src.startsWith('blob:') &&
          !flushedHtml.includes(src)
        ) {
          revokeBlobUrl(src)
        }
      }
    }

    const nextVolume = series.enabled && vol != null ? vol : null
    contentKeyRef.current = key
    activeTargetRef.current = { recordId: record.id, volume: nextVolume }
    volumeReviewsRef.current = record.volumeReviews || {}

    const reviews = record.volumeReviews || {}
    const html =
      nextVolume != null ? reviews[nextVolume]?.content || '' : record.review || ''
    const subtitle =
      nextVolume != null ? reviews[nextVolume]?.subtitle || '' : record.reviewSubtitle || ''
    const nextImages =
      nextVolume != null
        ? reviews[nextVolume]?.images || []
        : record.reviewImages || []

    editorRef.current.innerHTML = html
    applyReviewImgPerfStyles(editorRef.current)
    contentSaverRef.current?.reset(html)
    draftHtmlRef.current = html
    subtitleLiveRef.current = subtitle
    stableChapterImagesRef.current = [...nextImages]
    setBodyHtmlSnapshot(null)
  }, [record?.id, vol, series.enabled, saveReviewToTarget, record?.review, record?.reviewSubtitle, record?.volumeReviews, record?.reviewImages])

  useEffect(
    () => () => {
      flushPendingReviewSaves()
      if (inputFrameRef.current != null) cancelAnimationFrame(inputFrameRef.current)
    },
    [flushPendingReviewSaves]
  )

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return undefined

    const savedRangeRef = { current: null }

    const rangeInEditor = (range) => {
      if (!range) return false
      const root = range.commonAncestorContainer
      return root === editor || editor.contains(root)
    }

    const captureSelection = () => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount < 1 || sel.isCollapsed) {
        savedRangeRef.current = null
        return
      }
      const range = sel.getRangeAt(0)
      if (!rangeInEditor(range) || !range.toString()) {
        savedRangeRef.current = null
        return
      }
      savedRangeRef.current = range.cloneRange()
    }

    const onContextMenu = (e) => {
      if (!editor.contains(e.target)) return
      if (!isEditingRef.current) return
      e.preventDefault()
      e.stopPropagation()

      captureSelection()
      const sel = window.getSelection()
      let range = null
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const live = sel.getRangeAt(0)
        if (rangeInEditor(live) && live.toString()) range = live.cloneRange()
      }
      if (!range && savedRangeRef.current) range = savedRangeRef.current.cloneRange()

      if (range && !range.collapsed && range.toString()) {
        setQuoteMenu({
          x: e.clientX,
          y: e.clientY,
          range
        })
        setCharMenu(null)
      } else {
        setCharMenu({ x: e.clientX, y: e.clientY })
        setQuoteMenu(null)
      }
    }

    editor.addEventListener('mouseup', captureSelection)
    editor.addEventListener('keyup', captureSelection)
    editor.addEventListener('contextmenu', onContextMenu)
    return () => {
      editor.removeEventListener('mouseup', captureSelection)
      editor.removeEventListener('keyup', captureSelection)
      editor.removeEventListener('contextmenu', onContextMenu)
    }
  }, [record?.id, vol])

  const applyQuoteWrap = (opt) => {
    const editor = editorRef.current
    if (!editor || !quoteMenu?.range) return
    editor.focus()
    if (wrapRangeWithQuotes(quoteMenu.range, opt.open, opt.close)) {
      scheduleContentSave()
    }
  }

  if (!record) return null

  const flushSave = () => {
    flushContentSave()
    flushSubtitleSave()
  }

  /** 저장 대상(작품/회차)이 바인딩되어 있는지 보장 */
  const ensureActiveTargetBound = () => {
    if (!record?.id) return
    const nextVolume = series.enabled && vol != null ? vol : null
    const key = `${record.id}-${vol ?? 'all'}`
    if (
      activeTargetRef.current.recordId === record.id &&
      activeTargetRef.current.volume === nextVolume &&
      contentKeyRef.current === key
    ) {
      return
    }
    activeTargetRef.current = { recordId: record.id, volume: nextVolume }
    volumeReviewsRef.current = record.volumeReviews || {}
    contentKeyRef.current = key
  }

  /** 에디터 최신 HTML을 상위 저장 로직으로 즉시 동기화 + 미사용 목록 이미지 정리 */
  const persistEditorContentNow = (extraPatch = {}) => {
    ensureActiveTargetBound()
    const editor = editorRef.current
    const html = editor?.innerHTML || draftHtmlRef.current || ''
    draftHtmlRef.current = html
    const used = new Set()
    if (editor) {
      editor.querySelectorAll('img').forEach((img) => {
        const attr = img.getAttribute('src')
        if (attr) used.add(attr)
        if (img.src) used.add(img.src)
        if (img.currentSrc) used.add(img.currentSrc)
      })
    }
    const list = current.images || []
    const nextImages = []
    let removed = false
    for (const src of list) {
      if (src && (used.has(src) || html.includes(src))) {
        nextImages.push(src)
      } else {
        removed = true
        revokeBlobUrl(src)
      }
    }
    const patch = { content: html, ...extraPatch }
    if (removed) patch.images = nextImages
    // content + subtitle 등을 한 번에 전달 (연속 dispatch로 content가 덮어씌워지지 않게)
    saveReviewRef.current?.(patch)
    contentSaverRef.current?.reset(html)
    return html
  }

  const enterEditMode = () => {
    ensureActiveTargetBound()
    draftHtmlRef.current = editorRef.current?.innerHTML || current.content || ''
    setIsEditing(true)
    requestAnimationFrame(() => {
      const el = editorRef.current
      if (!el) return
      el.focus()
      draftHtmlRef.current = el.innerHTML || draftHtmlRef.current
    })
  }

  const handleManualSave = () => {
    if (inputDebounceRef.current) {
      clearTimeout(inputDebounceRef.current)
      inputDebounceRef.current = null
    }
    const subtitle = subtitleLiveRef.current ?? ''
    const html = persistEditorContentNow({ subtitle })
    setBodyHtmlSnapshot(html)
    setPruneEpoch((n) => n + 1)
    setSelectedImg(null)
    setCropSrc(null)
    clearBodyDragOver()
    setIsEditing(false)
  }

  /**
   * 타이핑과 전역 state 업데이트 분리:
   * 입력 중에는 전역 dispatch 없이 draft만 갱신하고,
   * 회차 전환·FLUSH·수동 저장 시에만 persist 한다.
   */
  const handleInput = () => {
    if (isComposingRef.current || !isEditingRef.current) return
    draftHtmlRef.current = editorRef.current?.innerHTML || ''
    if (inputDebounceRef.current) clearTimeout(inputDebounceRef.current)
    inputDebounceRef.current = setTimeout(() => {
      inputDebounceRef.current = null
      draftHtmlRef.current = editorRef.current?.innerHTML || draftHtmlRef.current
      applyReviewImgPerfStyles(editorRef.current)
    }, 250)
  }

  const clearBodyDragOver = () => {
    bodyDragDepthRef.current = 0
    setBodyDragOver(false)
  }

  const handleBodyDragEnter = (e) => {
    if (!isEditingRef.current) return
    if (!dataTransferHasFiles(e.dataTransfer) && !e.dataTransfer?.types?.includes?.('text/plain')) {
      return
    }
    e.preventDefault()
    bodyDragDepthRef.current += 1
    if (dataTransferHasFiles(e.dataTransfer)) setBodyDragOver(true)
  }

  const handleBodyDragLeave = () => {
    if (!isEditingRef.current) return
    bodyDragDepthRef.current = Math.max(0, bodyDragDepthRef.current - 1)
    if (bodyDragDepthRef.current === 0) setBodyDragOver(false)
  }

  const handleBodyDragOver = (e) => {
    // 브라우저가 드롭 파일을 새 탭으로 여는 기본 동작 차단
    e.preventDefault()
    if (!isEditingRef.current) return
    if (dataTransferHasFiles(e.dataTransfer)) {
      e.dataTransfer.dropEffect = 'copy'
      if (!bodyDragOver) setBodyDragOver(true)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    clearBodyDragOver()
    if (!isEditingRef.current) return
    const editor = editorRef.current
    if (!editor) return

    // 1) OS 이미지 파일 직접 드롭 (단일·복수) — Ctrl+V / EditBox 로직은 건드리지 않음
    const fileList = e.dataTransfer?.files
    const imageFiles = fileList?.length
      ? Array.from(fileList).filter((f) => f.type.startsWith('image/'))
      : []

    if (imageFiles.length) {
      Promise.all(imageFiles.map(readImageFileAsDataURL))
        .then((results) => {
          if (!results.length || !isEditingRef.current || !editorRef.current) return
          for (const dataUrl of results) {
            insertImageAtCursor(editorRef.current, dataUrl)
          }
          // 편집박스 목록과 동기화 → 저장 시 미사용 이미지 정리 로직과 호환
          const prev = stableChapterImagesRef.current || []
          const images = [...new Set([...prev, ...results])]
          stableChapterImagesRef.current = images
          saveReviewRef.current?.({ images })
          scheduleContentSave()
        })
        .catch(() => {})
      return
    }

    // 2) 기존 편집박스 → 본문 text/plain 드롭 (동작 유지)
    const src = e.dataTransfer.getData('text/plain')
    if (!src) return
    insertImageAtCursor(editor, src)
    addImage(src, false)
  }

  const handleExport = async () => {
    flushSave()
    const liveContent = editorRef.current?.innerHTML || current.content || ''
    let sections
    if (seriesExport) {
      sections = buildSeriesReviewSections(record)
    } else if (isVolumeMode) {
      sections = [{
        label: `${record.title} - ${vol}${series.unit}`,
        subtitle: subtitleLiveRef.current || current.subtitle || '',
        content: liveContent
      }]
    } else {
      sections = [{
        label: record.title,
        subtitle: subtitleLiveRef.current || current.subtitle || '',
        content: liveContent
      }]
    }
    const fields = (propertyFields || state.settings.propertyFields).filter(
      (f) => f.exportVisible !== false
    )
    const theme = getThemeColors()
    try {
      await exportFullRecord({
        record,
        fields,
        tagsMap,
        reviewSections: sections,
        seriesExport,
        theme,
        presets: state.settings.presets,
        activePresetSlot: state.settings.activePresetSlot ?? 0,
        fontFamily: resolveFontFamily(state.settings),
        backgroundImage: state.settings.backgroundImage,
        backgroundImageOpacity: state.settings.backgroundImageOpacity,
        backgroundImageMode: state.settings.backgroundImageMode,
        showBackgroundImage: state.settings.exportImageOptions?.showBackgroundImage !== false
      })
    } catch (err) {
      console.error(err)
      alert(`내보내기에 실패했습니다.\n${err?.message || err}`)
    }
  }

  return (
    <div
      className={`flex min-w-0 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] ${
        fullLayout || resizable ? 'h-full min-h-0 flex-1' : compact ? '' : 'h-full'
      }`}
    >
      <div
        className={fullLayout || resizable ? 'flex min-h-0 flex-col' : 'contents'}
        style={
          fullLayout || resizable
            ? {
                flex: showEditPane ? `${activeReviewPercent} 1 0%` : '1 1 0%',
                minHeight: 0
              }
            : undefined
        }
      >
      <div className="flex shrink-0 items-start justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div className="min-w-0 flex-1">
          {!fullLayout && record?.title && (
            <EditableTitle
              title={record.title}
              onSave={(title) =>
                dispatch({ type: 'UPDATE_RECORD', payload: { ...record, title } })
              }
              className="block truncate text-lg font-bold"
              inputClassName="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-lg font-bold outline-none"
            />
          )}
          {fullLayout && headerLabel && (
            <p className="truncate text-lg font-bold">{headerLabel}</p>
          )}
          <ReviewSubtitleInput
            initialValue={current.subtitle || ''}
            recordKey={subtitleKey}
            placeholder={fullLayout && !headerLabel ? '부제' : '부제'}
            onCommit={commitSubtitle}
            onFlush={flushSubtitleSave}
            className={`w-full bg-transparent text-sm text-[var(--color-text-muted)] outline-none placeholder:text-[var(--color-text-muted)]/40 ${
              (fullLayout ? headerLabel : record?.title) ? 'mt-1' : ''
            }`}
          />
        </div>
        {/* 순서: [시리즈] → [이미지내보내기] → [저장|깃펜] */}
        <div className="ml-2 flex shrink-0 items-center gap-2">
          {series.enabled && (
            <label
              className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]"
              title="시리즈 전체 내보내기"
            >
              <input
                type="checkbox"
                checked={seriesExport}
                onChange={(e) => setSeriesExport(e.target.checked)}
              />
              시리즈
            </label>
          )}
          <button
            type="button"
            onClick={handleExport}
            className="rounded-lg p-2 hover:bg-black/5"
            title="이미지 내보내기"
          >
            <Camera size={16} />
          </button>
          {isEditing ? (
            <button
              type="button"
              onClick={handleManualSave}
              className="rounded-lg p-2 hover:bg-black/5"
              title="저장"
            >
              <Save size={16} />
            </button>
          ) : (
            !isBodyEmpty && (
              <button
                type="button"
                onClick={enterEditMode}
                className="rounded-lg p-2 hover:bg-black/5"
                title="편집"
              >
                <Feather size={16} />
              </button>
            )
          )}
        </div>
      </div>

      <div
        className={`relative ${
          fullLayout || resizable
            ? 'min-h-0 flex-1'
            : compact && minBodyHeight
              ? 'flex-1'
              : 'min-h-[180px] flex-1'
        }`}
      >
        <div
          ref={editorRef}
          contentEditable={isEditing}
          suppressContentEditableWarning
          onInput={handleInput}
          onCompositionStart={() => { isComposingRef.current = true }}
          onCompositionEnd={() => {
            isComposingRef.current = false
            handleInput()
          }}
          onDragEnter={handleBodyDragEnter}
          onDragLeave={handleBodyDragLeave}
          onDragOver={handleBodyDragOver}
          onDrop={handleDrop}
          className={`h-full leading-relaxed outline-none transition-[box-shadow] duration-150 ${
            isEditing ? '' : 'cursor-default select-text'
          } ${
            bodyDragOver && isEditing
              ? 'shadow-[inset_0_0_0_2px_var(--color-accent)]'
              : ''
          } ${
            fullLayout || resizable || (compact && minBodyHeight)
              ? 'overflow-y-auto p-4'
              : 'min-h-[180px] overflow-y-auto p-4'
          }`}
          style={{
            WebkitAppRegion: 'no-drag',
            ...(compact && minBodyHeight && !fullLayout && !resizable
              ? { minHeight: minBodyHeight }
              : null)
          }}
          data-export-review="true"
        />
        {!isEditing && isBodyEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
            <button
              type="button"
              onClick={enterEditMode}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] shadow-sm hover:bg-black/[0.04]"
              style={{ WebkitAppRegion: 'no-drag' }}
              title="작성하기"
            >
              <Feather size={16} />
              작성하기
            </button>
          </div>
        )}
      </div>
      </div>

      {showEditPane && resizable && (
        <ResizeHandle direction="horizontal" onMouseDown={startReviewResize} className="py-1" />
      )}

      {showEditPane && (
        <div
          className={
            fullLayout || resizable
              ? 'flex min-h-0 flex-col overflow-hidden'
              : ''
          }
          style={
            fullLayout || resizable
              ? { flex: `${activeEditPercent} 1 0%`, minHeight: 0 }
              : undefined
          }
        >
          <EditBox
            images={current.images || []}
            onImagesChange={(imgs) => saveReview({ images: imgs })}
            editorRef={editorRef}
            onContentChange={scheduleContentSave}
            collapsed={editBoxCollapsed}
            onToggleCollapse={() => setEditBoxCollapsed(!editBoxCollapsed)}
            docked={fullLayout || resizable}
            editing={isEditing}
            pruneEpoch={pruneEpoch}
            chapterKey={chapterKey}
          />
        </div>
      )}

      {quoteMenu && (
        <QuoteWrapMenu
          x={quoteMenu.x}
          y={quoteMenu.y}
          onSelect={applyQuoteWrap}
          onClose={() => setQuoteMenu(null)}
        />
      )}

      {charMenu && (
        <CharInsertMenu
          x={charMenu.x}
          y={charMenu.y}
          onInsert={(ch) => {
            insertTextAtCursor(editorRef.current, ch)
            scheduleContentSave()
          }}
          onClose={() => setCharMenu(null)}
        />
      )}

      {showEditPane && !fullLayout && !resizable && (
        <div className="border-t border-[var(--color-border)] px-3 py-1.5 text-[10px] text-[var(--color-text-muted)]">
          <ImageIcon size={10} className="mr-1 inline" />
          Ctrl+V · 편집 박스는 내보내기 제외
        </div>
      )}

      {isEditing && selectedImg && !cropSrc && !imageViewer && (
        <ReviewImageToolbar
          img={selectedImg}
          onContentChange={scheduleContentSave}
          onCrop={() => setCropSrc(selectedImg.src)}
        />
      )}

      {cropSrc && !imageViewer && (
        <CoverCropEditor
          imageUrl={cropSrc}
          aspect={
            selectedImg
              ? selectedImg.getBoundingClientRect().width /
                Math.max(selectedImg.getBoundingClientRect().height, 1)
              : 1
          }
          freeResize
          onApply={(dataUrl) => {
            if (selectedImg) {
              selectedImg.src = dataUrl
              selectedImg.style.height = 'auto'
              applyReviewImgPerfStyle(selectedImg)
              scheduleContentSave()
            }
            setCropSrc(null)
          }}
          onClose={() => setCropSrc(null)}
        />
      )}

      {imageViewer && (
        <ReviewImageViewer
          index={imageViewer.index}
          count={imageViewer.count}
          resolveSrc={resolveViewerSrc}
          onClose={closeViewer}
          onNavigate={navigateViewer}
        />
      )}
    </div>
  )
}

export default memo(ReviewEditor)
