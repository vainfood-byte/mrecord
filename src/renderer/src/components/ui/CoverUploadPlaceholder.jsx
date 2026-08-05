import { Plus } from 'lucide-react'

/** 달력박스 커버 피커와 동일한 빈 커버 업로드 슬롯 */
export default function CoverUploadPlaceholder({ className = '', onClick }) {
  const inner = (
    <div
      className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--color-bg-card)] text-[var(--color-text-muted)] ${className}`}
    >
      <Plus size={28} />
      <span className="text-[10px]">커버 업로드</span>
    </div>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="h-full w-full">
        {inner}
      </button>
    )
  }

  return inner
}
