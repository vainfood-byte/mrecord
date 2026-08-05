import { Plus } from 'lucide-react'
import { useApp } from '../../context/AppContext'

export default function RightSidebar() {
  const { state } = useApp()
  const readCount = state.records.length
  const currentYear = new Date().getFullYear()

  return (
    <aside className="hidden w-[200px] shrink-0 flex-col gap-3 border-l border-[var(--color-border)] bg-[var(--color-sidebar)] p-3 xl:flex">
      {/* Cover placeholder */}
      <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] text-center text-xs text-[var(--color-text-muted)]">
        커버
        <br />
        (자유 이미지)
      </div>

      {/* Stats card */}
      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]">
        <div
          className="flex aspect-[4/3] items-center justify-center text-3xl font-bold text-white"
          style={{ backgroundColor: '#A8C4A0' }}
        >
          {currentYear}
        </div>
        <div className="p-2 text-center text-xs">
          <span className="font-semibold">{readCount}</span> 권의 책을 읽었어요
        </div>
      </div>

      {/* Add widget */}
      <button
        type="button"
        className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:bg-black/5"
      >
        <Plus size={24} />
      </button>
    </aside>
  )
}
