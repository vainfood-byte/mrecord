import { Plus } from 'lucide-react'
import { useRef } from 'react'

export default function PetitStickerLibrary({ library, open, onAddFile, onDragStart }) {
  const inputRef = useRef(null)
  if (!open) return null

  const slots = Array.from({ length: 6 }, (_, i) => library[i] || null)

  return (
    <div
      className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-3"
      data-export-hide
    >
      <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">쁘띠스티커 라이브러리</p>
      <div className="grid grid-cols-6 gap-2">
        {slots.map((src, i) =>
          src ? (
            <div
              key={`lib-${i}-${src.slice(0, 24)}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-petit-sticker-src', src)
                e.dataTransfer.effectAllowed = 'copy'
                onDragStart?.(src)
              }}
              className="flex aspect-square cursor-grab items-center justify-center overflow-hidden rounded-lg border border-[var(--color-border)] bg-white active:cursor-grabbing"
              title="달력으로 드래그"
            >
              <img src={src} alt="" draggable={false} className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <button
              key={`empty-${i}`}
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              title="PNG 추가"
            >
              <Plus size={16} />
            </button>
          )
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onAddFile?.(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
