import { Plus } from 'lucide-react'
import { getGalleryCoverAspectStyle } from '../../constants/galleryCardSizes'

export function GalleryAddCard({ onClick, width = 140, hideTitle = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      data-add-record
      data-export-hide
      className="flex flex-col overflow-hidden rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      style={{ width }}
      title="새 기록 추가"
    >
      <div
        className={`flex w-full items-center justify-center ${hideTitle ? '' : 'aspect-[3/4]'}`}
        style={getGalleryCoverAspectStyle(width, hideTitle)}
      >
        <Plus size={32} strokeWidth={1.5} />
      </div>
      {!hideTitle && (
        <div className="min-h-[2.75rem] px-2 py-2">
          <p className="text-center text-xs">&nbsp;</p>
        </div>
      )}
    </button>
  )
}

export function TagBlockAddCard({ onClick, width = 200, minHeight = 480 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      data-add-record
      data-export-hide
      className="flex shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      style={{ width, minHeight, WebkitAppRegion: 'no-drag' }}
      title="새 기록 추가"
    >
      <Plus size={28} strokeWidth={1.5} />
    </button>
  )
}

export function ListAddRow({ onClick, label = '새 페이지' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      data-add-record
      className="flex w-full items-center justify-center gap-1 border-t border-dashed border-[var(--color-border)] py-4 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-black/[0.02] hover:text-[var(--color-accent)]"
      title="새 기록 추가"
    >
      <Plus size={16} />
      {label}
    </button>
  )
}

export function RatingAddSection({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      data-add-record
      className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] py-6 text-sm text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      title="새 기록 추가"
    >
      <Plus size={20} />
      새 페이지
    </button>
  )
}
