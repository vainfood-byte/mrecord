import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Crop, ImageIcon, Pencil, Plus, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { coverPlaceholderStyle } from '../../utils/colorUtils'
import { getCalendarGradientStyle } from '../../utils/calendarHelpers'
import CoverCropEditor from './CoverCropEditor'
import ColorPickerTrigger from '../ui/ColorPickerTrigger'
import ColorPickerPopover from '../ui/ColorPickerPopover'

const GRADIENT_OPTIONS = [
  { id: 'white', label: '흰색' },
  { id: 'black', label: '검은색' },
  { id: 'custom1', label: '사용자1' },
  { id: 'custom2', label: '사용자2' }
]

const CARD_W = 168
const PEEK = 52

export default function CalendarCoverPicker({ dateKey, records, initialCover, onClose }) {
  const { state, dispatch } = useApp()
  const inputRef = useRef(null)
  const panelRef = useRef(null)
  const customColors = state.settings.calendarGradientColors || { custom1: '#ffffff', custom2: '#000000' }

  const [gradient, setGradient] = useState(initialCover?.gradient || 'black')
  const [idx, setIdx] = useState(0)
  const [customEdit, setCustomEdit] = useState(null)
  const [gradientPicker, setGradientPicker] = useState(null)
  const [uploadUrl, setUploadUrl] = useState(null)
  const [cropUrl, setCropUrl] = useState(null)

  const items = [
    ...records.map((rec) => ({ type: 'record', rec })),
    { type: 'upload', id: '__upload__' }
  ]
  const uploadIdx = items.length - 1
  const current = items[idx]
  const currentRec = current?.type === 'record' ? current.rec : null
  const previewUrl = uploadUrl || currentRec?.coverUrl || ''
  const previewColor = currentRec?.coverColor || '#6b5344'

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (!item.type.startsWith('image/')) continue
        e.preventDefault()
        e.stopPropagation()
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            setUploadUrl(reader.result)
            setIdx(uploadIdx)
          }
        }
        reader.readAsDataURL(file)
        return
      }
    }
    document.addEventListener('paste', onPaste, true)
    return () => document.removeEventListener('paste', onPaste, true)
  }, [uploadIdx])

  useEffect(() => {
    const onEsc = (e) => {
      if (cropUrl) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('mrecord:escape', onEsc)
    return () => window.removeEventListener('mrecord:escape', onEsc)
  }, [cropUrl, onClose])

  const applyCover = (coverUrl, coverColor, sourceRecordId = null) => {
    dispatch({
      type: 'SET_CALENDAR_DAY_COVER',
      payload: {
        dateKey,
        cover: {
          coverUrl: coverUrl || '',
          coverColor: coverColor || '#6b5344',
          sourceRecordId,
          gradient
        }
      }
    })
    onClose()
  }

  const clearCover = () => {
    dispatch({
      type: 'SET_CALENDAR_DAY_COVER',
      payload: { dateKey, cover: null }
    })
    onClose()
  }

  const handleFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadUrl(reader.result)
        setIdx(uploadIdx)
      }
    }
    reader.readAsDataURL(file)
  }

  const gradientStyle = getCalendarGradientStyle(gradient, customColors)
  const dayNum = dateKey.slice(-2).replace(/^0/, '')

  return (
    <>
      <div
        data-cover-picker
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
        onMouseDown={onClose}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          className="w-full max-w-xl rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-4 shadow-xl outline-none"
          onMouseDown={(e) => e.stopPropagation()}
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{dateKey} 커버</h3>
            <button type="button" onClick={onClose} className="rounded p-1 hover:bg-black/5">
              <X size={16} />
            </button>
          </div>

          <div className="mb-3">
            <p className="mb-1.5 text-[10px] text-[var(--color-text-muted)]">상단 그라데이션 옵션</p>
            <div className="flex items-center gap-2">
              {GRADIENT_OPTIONS.map((opt) => {
                const isCustomSlot = opt.id === 'custom1' || opt.id === 'custom2'
                return (
                  <button
                    key={opt.id}
                    type="button"
                    title={
                      isCustomSlot ? `${opt.label} (우클릭: 색상 변경)` : opt.label
                    }
                    onClick={() => setGradient(opt.id)}
                    onContextMenu={
                      isCustomSlot
                        ? (e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setGradientPicker({
                              key: opt.id,
                              x: e.clientX,
                              y: e.clientY + 8
                            })
                          }
                        : undefined
                    }
                    className={`h-7 w-7 rounded-full border-2 ${
                      gradient === opt.id
                        ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)] ring-offset-1'
                        : 'border-[var(--color-border)]'
                    }`}
                    style={{
                      backgroundColor:
                        opt.id === 'white'
                          ? '#ffffff'
                          : opt.id === 'black'
                            ? '#000000'
                            : customColors[opt.id] || '#cccccc'
                    }}
                  />
                )
              })}
              <button
                type="button"
                title="사용자 색 수정"
                onClick={() => setCustomEdit(customEdit ? null : 'custom1')}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] hover:bg-black/5"
              >
                <Pencil size={12} />
              </button>
            </div>
            {customEdit && (
              <div className="mt-2 flex gap-3">
                {['custom1', 'custom2'].map((key) => (
                  <div key={key} className="flex flex-col items-center gap-1">
                    <ColorPickerTrigger
                      value={customColors[key] || '#ffffff'}
                      onChange={(hex) =>
                        dispatch({
                          type: 'UPDATE_SETTINGS',
                          payload: {
                            calendarGradientColors: { ...customColors, [key]: hex }
                          }
                        })
                      }
                      barClassName="h-8 w-8"
                      title={key === 'custom1' ? '사용자1' : '사용자2'}
                    />
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {key === 'custom1' ? '사용자1' : '사용자2'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="relative mb-3 overflow-hidden py-2" style={{ height: 300 }}>
            <div
              className="flex items-center transition-transform duration-300 ease-out"
              style={{
                transform: `translateX(calc(50% - ${idx * (CARD_W - PEEK) + CARD_W / 2}px))`
              }}
            >
              {items.map((item, i) => {
                const isCenter = i === idx
                const rec = item.type === 'record' ? item.rec : null
                const url = isCenter && uploadUrl ? uploadUrl : rec?.coverUrl || ''
                const color = rec?.coverColor || '#6b5344'

                return (
                  <div
                    key={rec?.id || item.id}
                    className={`relative shrink-0 overflow-hidden rounded-lg border transition-all duration-300 ${
                      isCenter
                        ? 'z-10 scale-100 border-[var(--color-accent)] shadow-lg'
                        : 'z-0 scale-[0.78] border-[var(--color-border)] opacity-50'
                    }`}
                    style={{
                      width: CARD_W,
                      height: 240,
                      marginLeft: i > 0 ? -PEEK : 0
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setIdx(i)
                        if (item.type === 'upload' && !uploadUrl) {
                          inputRef.current?.click()
                        }
                      }}
                      className="absolute inset-0 z-[1]"
                      aria-label={rec?.title || '커버 선택'}
                    />
                    {item.type === 'upload' ? (
                      uploadUrl ? (
                        <>
                          <img
                            src={uploadUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                          {isCenter && gradientStyle && (
                            <div
                              className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-1/2"
                              style={gradientStyle}
                            />
                          )}
                        </>
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
                          <Plus size={28} />
                          <span className="text-[10px]">커버 업로드</span>
                        </div>
                      )
                    ) : url ? (
                      <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <div
                        className="flex h-full w-full flex-col items-center justify-center gap-2"
                        style={coverPlaceholderStyle(color)}
                      >
                        <ImageIcon size={28} className="opacity-60" />
                        <span className="px-2 text-center text-[10px]">{rec?.title}</span>
                      </div>
                    )}
                    {isCenter && gradientStyle && (
                      <div
                        className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-1/2"
                        style={gradientStyle}
                      />
                    )}
                    {isCenter && (
                      <span className="pointer-events-none absolute left-2 top-2 z-[3] flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-xs font-bold text-white">
                        {dayNum}
                      </span>
                    )}
                    {isCenter && previewUrl && (
                      <button
                        type="button"
                        title="크롭"
                        onClick={(e) => {
                          e.stopPropagation()
                          setCropUrl(previewUrl)
                        }}
                        className="absolute right-2 top-2 z-[4] rounded bg-black/50 p-1 text-white hover:bg-black/70"
                      >
                        <Crop size={12} />
                      </button>
                    )}
                    {isCenter && rec?.title && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-6">
                        <p className="truncate text-center text-[11px] font-medium text-white">
                          {rec.title}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {idx > 0 && (
              <button
                type="button"
                onClick={() => setIdx((i) => i - 1)}
                className="absolute left-1 top-1/2 z-20 -translate-y-1/2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-panel)]/95 p-1.5 shadow hover:bg-[var(--color-bg-panel)]"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            {idx < items.length - 1 && (
              <button
                type="button"
                onClick={() => setIdx((i) => i + 1)}
                className="absolute right-1 top-1/2 z-20 -translate-y-1/2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-panel)]/95 p-1.5 shadow hover:bg-[var(--color-bg-panel)]"
              >
                <ChevronRight size={18} />
              </button>
            )}
          </div>

          {current?.type === 'upload' ? (
            uploadUrl ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyCover(uploadUrl, previewColor, null)}
                  className="flex-1 rounded-lg bg-[var(--color-accent)] py-2 text-xs font-medium text-white"
                >
                  이 표지 적용
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs hover:bg-black/5"
                >
                  커버 변경
                </button>
                <button
                  type="button"
                  onClick={clearCover}
                  className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                >
                  커버 지우기
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex-1 rounded-lg border border-dashed border-[var(--color-border)] py-3 text-xs hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                >
                  커버 변경 (Ctrl+V / 파일)
                </button>
                {initialCover && (
                  <button
                    type="button"
                    onClick={clearCover}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                  >
                    커버 지우기
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  applyCover(
                    uploadUrl || currentRec.coverUrl,
                    currentRec.coverColor,
                    uploadUrl ? null : currentRec.id
                  )
                }
                className="flex-1 rounded-lg bg-[var(--color-accent)] py-2 text-xs font-medium text-white"
              >
                이 표지 적용
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs hover:bg-black/5"
              >
                커버 변경
              </button>
              {(initialCover || uploadUrl) && (
                <button
                  type="button"
                  onClick={clearCover}
                  className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                >
                  커버 지우기
                </button>
              )}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      </div>

      {cropUrl && (
        <CoverCropEditor
          imageUrl={cropUrl}
          aspect={CARD_W / 240}
          freeResize
          onApply={(dataUrl) => {
            setUploadUrl(dataUrl)
            setCropUrl(null)
          }}
          onClose={() => setCropUrl(null)}
        />
      )}

      {gradientPicker && (
        <ColorPickerPopover
          value={customColors[gradientPicker.key] || '#ffffff'}
          x={gradientPicker.x}
          y={gradientPicker.y}
          paletteOnly
          onChange={(hex) =>
            dispatch({
              type: 'UPDATE_SETTINGS',
              payload: {
                calendarGradientColors: { ...customColors, [gradientPicker.key]: hex }
              }
            })
          }
          onClose={() => setGradientPicker(null)}
        />
      )}
    </>
  )
}
