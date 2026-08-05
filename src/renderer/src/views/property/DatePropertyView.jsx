import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { useRecordListView } from '../../hooks/useRecordListView'
import { formatDateByMode } from '../../utils/dateFieldFormat'
import { ListAddRow } from '../../components/ui/AddRecordCard'

function getDateValue(rec, fieldId) {
  return rec[fieldId] || rec.customFields?.[fieldId] || ''
}

export default function DatePropertyView({ field }) {
  const { dispatch } = useApp()
  const records = useRecordListView().records
  const dateFormat = field.dateFormat || 'full'

  const sorted = useMemo(() => {
    return [...records].sort((a, b) => {
      const da = getDateValue(a, field.id) || ''
      const db = getDateValue(b, field.id) || ''
      return db.localeCompare(da)
    })
  }, [records, field.id])

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
      <div className="border-b border-[var(--color-border)] px-4 py-2 text-sm font-medium">
        {field.label} · 최근순
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {sorted.map((rec) => (
          <button
            key={rec.id}
            type="button"
            data-open-record
            onClick={() => dispatch({ type: 'SELECT_RECORD', payload: rec.id })}
            className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-black/[0.03]"
          >
            <span className="min-w-0 flex-1 truncate font-medium">{rec.title}</span>
            <span className="shrink-0 text-sm text-[var(--color-text-muted)]">
              {formatDateByMode(getDateValue(rec, field.id), dateFormat) || '날짜 없음'}
            </span>
          </button>
        ))}
        {sorted.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
            표시할 기록이 없습니다
          </p>
        )}
        <ListAddRow onClick={() => dispatch({ type: 'CREATE_NEW_RECORD' })} />
      </div>
    </div>
  )
}
