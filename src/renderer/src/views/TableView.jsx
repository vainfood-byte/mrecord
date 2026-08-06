import { useMemo } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useApp, useTagsMap } from '../context/AppContext'
import { useRecordListView } from '../hooks/useRecordListView'
import StarRating from '../components/ui/StarRating'
import TagBadge from '../components/ui/TagBadge'
import { useRecordContextMenu } from '../hooks/useRecordContextMenu'

function formatDate(d) {
  if (!d) return '-'
  try {
    return format(new Date(d), 'yyyy년 M월 d일', { locale: ko })
  } catch {
    return d
  }
}

/**
 * 공통 테이블 뷰 — 각 탭은 같은 데이터를 다른 컬럼으로 보여줌
 */
export default function TableView({ columns, filterFn }) {
  const { dispatch } = useApp()
  const allRecords = useRecordListView().records
  const tagsMap = useTagsMap()
  const { bind, portal, deleteDialog } = useRecordContextMenu()

  const records = useMemo(
    () => (filterFn ? allRecords.filter(filterFn) : allRecords),
    [allRecords, filterFn]
  )

  const renderCell = (rec, col) => {
    switch (col.type) {
      case 'rating':
        return <StarRating rating={rec.rating} size={12} />
      case 'date':
        return formatDate(rec[col.key])
      case 'tags': {
        const tags = rec.tagIds
          .map((id) => tagsMap[id])
          .filter(Boolean)
          .filter((t) => !col.tagCategory || t.category === col.tagCategory)
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <TagBadge key={t.id} tag={t} small />
            ))}
          </div>
        )
      }
      default:
        return rec[col.key] || '-'
    }
  }

  return (
    <>
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)]">
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-2 font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((rec) => (
            <tr
              key={rec.id}
              {...bind(rec.id)}
              data-open-record
              onClick={() => dispatch({ type: 'SELECT_RECORD', payload: rec.id })}
              className="cursor-pointer border-b border-[var(--color-border)]/50 transition-colors hover:bg-black/[0.03]"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-2.5 ${col.wide ? 'max-w-[300px] truncate' : ''} ${
                    col.key === 'title' ? 'font-medium' : ''
                  }`}
                >
                  {renderCell(rec, col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {records.length === 0 && (
        <p className="py-12 text-center text-[var(--color-text-muted)]">표시할 기록이 없습니다.</p>
      )}
    </div>
    {portal}
    {deleteDialog}
    </>
  )
}
