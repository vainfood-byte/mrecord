import { memo, useCallback, useMemo, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useRecordListView } from '../hooks/useRecordListView'
import StarRating from '../components/ui/StarRating'
import InlineTextCell from '../components/ui/InlineTextCell'
import InlineTagCell from '../components/ui/InlineTagCell'
import InlineDateCell from '../components/ui/InlineDateCell'
import RecordLinkCell from '../components/ui/RecordLinkCell'
import { useRecordContextMenu } from '../hooks/useRecordContextMenu'
import { useVirtualScroll } from '../hooks/useVirtualScroll'
import { VIRTUAL_THRESHOLD } from '../constants/virtualization'
import { isRecordLocked } from '../components/layout/LockToggle'
import { getRecordRatingIcon } from '../utils/ratingHelpers'
import { getPropertyFieldForTab } from '../utils/tabHelpers'

const ROW_HEIGHT = 44

const RecordRow = memo(function RecordRow({
  rec,
  locked,
  checked,
  editMode,
  tagsByCategory,
  settings,
  dispatch,
  bind,
  onOpen,
  onToggleOne,
  blockSideOpen
}) {
  const updateField = useCallback(
    (field, value) => {
      dispatch({ type: 'UPDATE_RECORD', payload: { ...rec, [field]: value } })
    },
    [dispatch, rec]
  )

  const updateRecord = useCallback(
    (patch) => {
      dispatch({ type: 'UPDATE_RECORD', payload: { ...rec, ...patch } })
    },
    [dispatch, rec]
  )

  return (
    <tr
      {...bind(rec.id)}
      data-open-record
      onClick={(e) => onOpen(rec, e)}
      className={`border-b border-[var(--color-border)]/50 transition-colors ${
        locked ? 'pointer-events-none blur-sm select-none' : 'cursor-pointer hover:bg-black/[0.03]'
      } ${checked ? 'bg-[var(--color-accent)]/5' : ''}`}
    >
      {editMode && (
        <td className="w-8 px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={checked}
            disabled={locked}
            data-record-select
            onChange={(e) => onToggleOne(rec.id, e)}
            className="h-3.5 w-3.5 rounded border-[var(--color-border)]"
          />
        </td>
      )}
      <td className="px-4 py-2.5 font-medium" data-record-title-col>
        <InlineTextCell
          value={rec.title}
          onSave={(title) => updateField('title', title)}
          onActivate={() => dispatch({ type: 'SELECT_RECORD', payload: rec.id })}
          title="클릭: 사이드 보기 · 더블클릭: 제목 수정"
        />
      </td>
      <td className="px-3 py-2.5">
        <InlineTextCell
          value={rec.author}
          onSave={(author) => updateField('author', author)}
          title="더블클릭하여 저자 수정"
        />
      </td>
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <StarRating
          rating={rec.rating}
          size={12}
          iconType={getRecordRatingIcon(rec)}
          interactive={!locked}
          onChange={(rating) => updateField('rating', rating)}
        />
      </td>
      <td className="px-3 py-2.5" onMouseDown={blockSideOpen} onClick={blockSideOpen}>
        <InlineTagCell
          record={rec}
          category="유형"
          categoryTags={tagsByCategory['유형']}
          settings={settings}
          locked={locked}
          onUpdate={updateRecord}
        />
      </td>
      <td className="px-3 py-2.5" onMouseDown={blockSideOpen} onClick={blockSideOpen}>
        <InlineTagCell
          record={rec}
          category="장르"
          categoryTags={tagsByCategory['장르']}
          settings={settings}
          locked={locked}
          onUpdate={updateRecord}
        />
      </td>
      <td className="px-3 py-2.5" onMouseDown={blockSideOpen} onClick={blockSideOpen}>
        <InlineTagCell
          record={rec}
          category="사이트"
          categoryTags={tagsByCategory['사이트']}
          settings={settings}
          locked={locked}
          onUpdate={updateRecord}
        />
      </td>
      <td className="px-3 py-2.5" data-record-link-col>
        <RecordLinkCell
          value={rec.link}
          locked={locked}
          onSave={(link) => updateField('link', link)}
        />
      </td>
      <td className="max-w-[200px] px-3 py-2.5 text-[var(--color-text-muted)]" data-record-oneline-col>
        <InlineTextCell
          value={rec.oneLine}
          onSave={(oneLine) => updateField('oneLine', oneLine)}
          className="block truncate"
          title="더블클릭하여 한마디 수정"
        />
      </td>
      <td className="px-3 py-2.5" data-record-date-col onMouseDown={blockSideOpen} onClick={blockSideOpen}>
        <InlineDateCell
          value={rec.readDate}
          locked={locked}
          onSave={(readDate) => updateField('readDate', readDate)}
        />
      </td>
      <td className="px-3 py-2.5" data-record-status-col onMouseDown={blockSideOpen} onClick={blockSideOpen}>
        <InlineTagCell
          record={rec}
          category="상태"
          categoryTags={tagsByCategory['상태']}
          settings={settings}
          locked={locked}
          onUpdate={updateRecord}
        />
      </td>
    </tr>
  )
})

export default function RecordView() {
  const { state, dispatch } = useApp()
  const { records: rawRecords, pagedView } = useRecordListView()
  const records = rawRecords
  const { bind, portal, deleteDialog } = useRecordContextMenu()
  const lock = state.settings.lockSettings
  const rootRef = useRef(null)
  const editMode = state.recordEditMode
  const selectedIds = useMemo(() => new Set(state.recordSelectedIds), [state.recordSelectedIds])

  const tagsByCategory = useMemo(() => {
    const map = {}
    for (const tag of state.tags) {
      if (!map[tag.category]) map[tag.category] = []
      map[tag.category].push(tag)
    }
    return map
  }, [state.tags])

  const visibleIds = useMemo(() => records.map((r) => r.id), [records])
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  const useVirtual = !state.exportInProgress && !pagedView && records.length >= VIRTUAL_THRESHOLD
  const { startIndex, endIndex, paddingTop, paddingBottom } = useVirtualScroll({
    scrollRef: rootRef,
    count: useVirtual ? records.length : 0,
    estimateSize: ROW_HEIGHT
  })

  const visibleRecords = useVirtual ? records.slice(startIndex, endIndex) : records

  const toggleOne = useCallback(
    (id, e) => {
      e.stopPropagation()
      dispatch({ type: 'TOGGLE_RECORD_SELECT', payload: id })
    },
    [dispatch]
  )

  const toggleAll = useCallback(() => {
    dispatch({
      type: 'SET_RECORD_SELECT_ALL',
      payload: allSelected ? [] : visibleIds
    })
  }, [allSelected, dispatch, visibleIds])

  const openRecord = useCallback(
    (rec, e) => {
      if (e.target.closest('[data-inline-edit]')) return
      if (e.target.closest('[data-record-title]')) return
      if (e.target.closest('[data-no-side-open]')) return
      if (e.target.closest('[data-popup-root]')) return
      if (e.target.closest('[data-date-picker-portal]')) return
      if (e.target.closest('[data-record-select]')) return
      if (isRecordLocked(rec, lock)) return
      dispatch({ type: 'SELECT_RECORD', payload: rec.id })
    },
    [dispatch, lock]
  )

  const blockSideOpen = useCallback((e) => e.stopPropagation(), [])

  const oneLineLabel = useMemo(
    () => getPropertyFieldForTab('oneLine', state.settings)?.label ?? '한마디',
    [state.settings]
  )

  const colSpan = editMode ? 11 : 10

  return (
    <>
      <div ref={rootRef} data-record-export-root className="overflow-auto rounded-lg bg-[var(--color-bg)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)]">
              {editMode && (
                <th className="w-8 px-2 py-2 font-medium">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    data-record-select
                    className="h-3.5 w-3.5 rounded border-[var(--color-border)]"
                    title="전체 선택"
                  />
                </th>
              )}
              <th className="px-4 py-2 font-medium" data-record-title-col>제목</th>
              <th className="px-3 py-2 font-medium">저자</th>
              <th className="px-3 py-2 font-medium">별점</th>
              <th className="px-3 py-2 font-medium">유형</th>
              <th className="px-3 py-2 font-medium">장르</th>
              <th className="px-3 py-2 font-medium">사이트</th>
              <th className="px-3 py-2 font-medium" data-record-link-col>링크</th>
              <th className="px-3 py-2 font-medium" data-record-oneline-col>{oneLineLabel}</th>
              <th className="px-3 py-2 font-medium" data-record-date-col>처음 읽은 날</th>
              <th className="px-3 py-2 font-medium" data-record-status-col>상태</th>
            </tr>
          </thead>
          <tbody>
            {useVirtual && paddingTop > 0 && (
              <tr aria-hidden>
                <td colSpan={colSpan} style={{ height: paddingTop, padding: 0, border: 0 }} />
              </tr>
            )}
            {visibleRecords.map((rec, i) => {
              const locked = isRecordLocked(rec, lock)
              const checked = selectedIds.has(rec.id)
              return (
                <RecordRow
                  key={rec.id}
                  rec={rec}
                  locked={locked}
                  checked={checked}
                  editMode={editMode}
                  tagsByCategory={tagsByCategory}
                  settings={state.settings}
                  dispatch={dispatch}
                  bind={bind}
                  onOpen={openRecord}
                  onToggleOne={toggleOne}
                  blockSideOpen={blockSideOpen}
                />
              )
            })}
            {useVirtual && paddingBottom > 0 && (
              <tr aria-hidden>
                <td colSpan={colSpan} style={{ height: paddingBottom, padding: 0, border: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
        {records.length === 0 && (
          <p className="py-12 text-center text-[var(--color-text-muted)]">기록이 없습니다.</p>
        )}
      </div>
      {portal}
      {deleteDialog}
    </>
  )
}
