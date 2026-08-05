import { ChevronRight } from 'lucide-react'
import { useApp, useSelectedRecord } from '../../context/AppContext'
import { getTabLabel } from '../../utils/tabHelpers'

export default function Breadcrumb() {
  const { state, dispatch } = useApp()
  const record = useSelectedRecord()
  if (!record) return null

  const tabLabel = getTabLabel(state.activeTab, state.settings)
  const series = record.series
  const volumeLabel =
    state.selectedVolume && series?.enabled
      ? `${state.selectedVolume}${series.unit}`
      : null

  const goMain = () => {
    dispatch({ type: 'DISMISS_DETAIL' })
  }

  const goRecord = () => {
    dispatch({ type: 'SET_VOLUME', payload: null })
    if (state.detailMode === 'full') {
      dispatch({ type: 'SET_DETAIL_MODE', payload: 'side' })
    }
  }

  return (
    <nav className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
      <button
        type="button"
        onClick={goMain}
        className="hover:text-[var(--color-accent)] hover:underline"
      >
        {tabLabel}
      </button>
      <ChevronRight size={12} />
      <button
        type="button"
        onClick={goRecord}
        className="max-w-[140px] truncate hover:text-[var(--color-accent)] hover:underline"
      >
        {record.title}
      </button>
      {volumeLabel && (
        <>
          <ChevronRight size={12} />
          <span className="text-[var(--color-text)]">{volumeLabel}</span>
        </>
      )}
    </nav>
  )
}
