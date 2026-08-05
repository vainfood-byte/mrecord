import { useApp } from '../../context/AppContext'

export default function ExportProgressIndicator() {
  const { state } = useApp()
  const progress = state.exportProgress
  if (!state.exportInProgress && !progress) return null

  const label = progress?.label || '내보내는 중…'
  const percent = progress?.percent
  const indeterminate = percent == null

  return (
    <div
      className="flex min-w-[120px] max-w-[180px] items-center gap-2 rounded-lg px-2 py-1"
      aria-live="polite"
      title={label}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-medium text-[var(--color-text-muted)]">{label}</p>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/10">
          {indeterminate ? (
            <div className="export-progress-indeterminate h-full w-1/3 rounded-full bg-[var(--color-accent)]" />
          ) : (
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-200"
              style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
