import { Palette } from 'lucide-react'
import { TRACE_GRAPH_COLOR_MODE_LABELS } from '../../utils/traceHelpers'

export default function TraceGraphPaletteButton({ mode = 'theme', onCycle }) {
  const label = TRACE_GRAPH_COLOR_MODE_LABELS[mode] || TRACE_GRAPH_COLOR_MODE_LABELS.theme

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onCycle?.()
      }}
      className="absolute bottom-1.5 right-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)]/50 bg-[var(--color-bg-card)]/70 text-[var(--color-text-muted)]/70 shadow-sm backdrop-blur-[1px] hover:bg-[var(--color-bg-card)]/90 hover:text-[var(--color-text-muted)]"
      title={`그래프 색상: ${label} (클릭하여 변경)`}
    >
      <Palette size={14} strokeWidth={2} />
    </button>
  )
}
