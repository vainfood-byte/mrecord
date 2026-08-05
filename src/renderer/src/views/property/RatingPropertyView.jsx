import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useRecordListView } from '../../hooks/useRecordListView'
import StarRating from '../../components/ui/StarRating'
import { RatingAddSection } from '../../components/ui/AddRecordCard'

export default function RatingPropertyView({ field }) {
  const { dispatch } = useApp()
  const records = useRecordListView().records

  const groups = useMemo(() => {
    const map = { 5: [], 4: [], 3: [], 2: [], 1: [], 0: [] }
    records.forEach((rec) => {
      const val =
        field.id === 'rating'
          ? rec.rating || 0
          : rec.customFields?.[field.id] ?? 0
      const key = Math.min(5, Math.max(0, Math.round(val)))
      map[key].push(rec)
    })
    return [5, 4, 3, 2, 1].map((score) => ({ score, items: map[score] }))
  }, [records, field.id])

  const iconType = field.ratingIcon || 'star'

  return (
    <div className="space-y-4">
      {groups.map(({ score, items }) => (
        <section
          key={score}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]"
        >
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
            <StarRating rating={score} iconType={iconType} size={14} />
            <span className="text-sm text-[var(--color-text-muted)]">({items.length})</span>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {items.map((rec) => (
              <button
                key={rec.id}
                type="button"
                data-open-record
                onClick={() => dispatch({ type: 'SELECT_RECORD', payload: rec.id })}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-black/[0.03]"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{rec.title}</span>
              </button>
            ))}
            {items.length === 0 && (
              <p className="px-4 py-3 text-xs text-[var(--color-text-muted)]">없음</p>
            )}
          </div>
        </section>
      ))}
      <RatingAddSection onClick={() => dispatch({ type: 'CREATE_NEW_RECORD' })} />
    </div>
  )
}
