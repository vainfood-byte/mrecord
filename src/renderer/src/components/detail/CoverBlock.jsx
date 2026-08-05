import { useRef, useState } from 'react'
import { Crop, ImageIcon, Trash2 } from 'lucide-react'
import { useClipboardPaste } from '../../hooks/useClipboardPaste'
import { coverPlaceholderStyle } from '../../utils/colorUtils'
import CoverCropEditor from '../calendar/CoverCropEditor'
import LazyImage from '../ui/LazyImage'

function CoverOverlayButtons({ hasImage, onChange, onEdit, onDelete, changeLabel = '표지 변경 (Ctrl+V)' }) {
  const btnClass =
    'rounded-lg bg-white px-4 py-2 text-xs font-medium text-neutral-900 shadow hover:bg-neutral-100'
  const btnSmClass =
    'flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 shadow hover:bg-neutral-100'

  return (
    <>
      <ImageIcon size={28} className="text-white/80" />
      <button type="button" onClick={onChange} className={btnClass}>
        {changeLabel}
      </button>
      {hasImage && onEdit && (
        <button type="button" onClick={onEdit} className={btnSmClass}>
          <Crop size={12} className="text-neutral-900" /> 편집
        </button>
      )}
      {hasImage && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1 rounded-lg bg-red-500/90 px-3 py-1.5 text-xs text-white hover:bg-red-600"
        >
          <Trash2 size={12} /> 표지 삭제
        </button>
      )}
    </>
  )
}

/** 표지 — 호버 시 변경/편집/삭제 */
export default function CoverBlock({ record, onCoverChange, onCoverDelete, className = '', fitContainer = false }) {
  const [hover, setHover] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const inputRef = useRef(null)
  const rootRef = useRef(null)

  useClipboardPaste((dataUrl) => onCoverChange?.(dataUrl), {
    shouldIgnore: () =>
      Boolean(document.querySelector('[data-cover-picker], [data-cover-crop]')) ||
      !rootRef.current?.matches(':hover')
  })

  const pickFile = () => inputRef.current?.click()

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onCoverChange?.(reader.result)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <>
      <div
        ref={rootRef}
        data-record-cover-paste
        className={`group relative overflow-hidden rounded-lg shadow-md ${
          fitContainer ? 'aspect-auto h-full w-full' : 'aspect-[3/4] w-full'
        } ${className}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {record.coverUrl ? (
          <LazyImage src={record.coverUrl} alt={record.title} className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center p-4 text-center text-sm font-semibold leading-snug"
            style={coverPlaceholderStyle(record.coverColor)}
          >
            {record.title}
          </div>
        )}

        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 transition-opacity ${
            hover ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <CoverOverlayButtons
            hasImage={Boolean(record.coverUrl)}
            onChange={pickFile}
            onEdit={() => record.coverUrl && setCropSrc(record.coverUrl)}
            onDelete={onCoverDelete}
          />
        </div>

        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      {cropSrc && (
        <CoverCropEditor
          imageUrl={cropSrc}
          aspect={3 / 4}
          freeResize
          onApply={(url) => {
            onCoverChange?.(url)
            setCropSrc(null)
          }}
          onClose={() => setCropSrc(null)}
        />
      )}
    </>
  )
}

/** 흔적 박스용 작은 커버 */
export function TraceCoverBlock({ coverUrl, onChange, onDelete, placeholder = '커버' }) {
  const [hover, setHover] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const inputRef = useRef(null)
  const rootRef = useRef(null)

  useClipboardPaste((dataUrl) => onChange?.(dataUrl), {
    shouldIgnore: () =>
      Boolean(document.querySelector('[data-record-cover-paste]:hover, [data-cover-picker], [data-cover-crop]')) ||
      !rootRef.current?.matches(':hover')
  })

  return (
    <>
      <div
        ref={rootRef}
        data-trace-cover-paste
        className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {coverUrl ? (
          <LazyImage src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--color-text-muted)]">
            {placeholder}
          </div>
        )}
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 transition-opacity ${
            hover ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded bg-white px-2 py-1 text-[10px] text-neutral-900 hover:bg-neutral-100"
          >
            변경
          </button>
          {coverUrl && (
            <button
              type="button"
              onClick={() => setCropSrc(coverUrl)}
              className="rounded bg-white px-2 py-1 text-[10px] text-neutral-900 hover:bg-neutral-100"
            >
              편집
            </button>
          )}
          {coverUrl && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded bg-red-500/90 px-2 py-1 text-[10px] text-white"
            >
              삭제
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              if (typeof reader.result === 'string') onChange?.(reader.result)
            }
            reader.readAsDataURL(file)
            e.target.value = ''
          }}
        />
      </div>

      {cropSrc && (
        <CoverCropEditor
          imageUrl={cropSrc}
          aspect={4 / 3}
          freeResize
          onApply={(url) => {
            onChange?.(url)
            setCropSrc(null)
          }}
          onClose={() => setCropSrc(null)}
        />
      )}
    </>
  )
}
