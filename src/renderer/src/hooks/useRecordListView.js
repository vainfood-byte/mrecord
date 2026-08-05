import { useEffect, useMemo } from 'react'

import { useApp, useFilteredRecords } from '../context/AppContext'

export const RECORD_PAGE_SIZE = 100

function scrollMainToTop() {
  document.querySelector('[data-main-scroll]')?.scrollTo({ top: 0, behavior: 'auto' })
}

/** 필터·정렬된 목록 + (선택) 100개 단위 페이지 보기 */
export function useRecordListView() {
  const { state, dispatch } = useApp()
  const allRecords = useFilteredRecords()
  const pagedView = Boolean(state.settings.pagedView)
  const exportSlice = state.exportRecordSlice
  const page = state.recordViewPage ?? 0
  const totalCount = allRecords.length
  const totalPages = Math.max(1, Math.ceil(totalCount / RECORD_PAGE_SIZE))
  const safePage = Math.min(Math.max(0, page), totalPages - 1)

  useEffect(() => {
    if (safePage !== page) {
      dispatch({ type: 'SET_RECORD_VIEW_PAGE', payload: safePage })
    }
  }, [safePage, page, dispatch])

  useEffect(() => {
    if (!pagedView || exportSlice) return
    scrollMainToTop()
  }, [pagedView, safePage, exportSlice])

  useEffect(() => {
    if (exportSlice) return
    scrollMainToTop()
  }, [state.sortBy, state.sortDir, state.filterTagIds, state.searchQuery, exportSlice])

  const records = useMemo(() => {
    if (exportSlice) {
      return allRecords.slice(exportSlice.start, exportSlice.end)
    }
    if (!pagedView) return allRecords
    const start = safePage * RECORD_PAGE_SIZE
    return allRecords.slice(start, start + RECORD_PAGE_SIZE)
  }, [allRecords, pagedView, safePage, exportSlice])

  return {
    records,
    allRecords,
    pagedView,
    page: safePage,
    totalPages,
    totalCount,
    pageSize: RECORD_PAGE_SIZE,
    setPage: (next) => dispatch({ type: 'SET_RECORD_VIEW_PAGE', payload: next })
  }
}
