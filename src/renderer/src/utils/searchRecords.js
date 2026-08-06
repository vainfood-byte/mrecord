import { getRecordReviewSearchText } from './recordHeavyStore'

function matchesQuickFields(r, q, indexedEntry) {
  if (indexedEntry) {
    return (
      indexedEntry.title.includes(q) ||
      indexedEntry.author.includes(q) ||
      indexedEntry.oneLine.includes(q)
    )
  }
  return (
    (r.title || '').toLowerCase().includes(q) ||
    (r.author || '').toLowerCase().includes(q) ||
    (r.oneLine || '').toLowerCase().includes(q)
  )
}

/** 빠른 검색 — review 제외, 결과 상한 (대용량 목록용) */
export function searchRecordsQuick(records, query, limit = 40, listIndex) {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const indexed = listIndex?.searchText?.length === records.length
  const out = []
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (matchesQuickFields(r, q, indexed ? listIndex.searchText[i] : null)) {
      out.push(r)
      if (out.length >= limit) break
    }
  }
  return out
}

/** 검색 메뉴용 — 본문(review) 포함, 상한 적용 (heavy 스토어 lazy 조회) */
export function searchRecordsWithReview(records, query, limit = 40, listIndex) {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const indexed = listIndex?.searchText?.length === records.length
  const out = []
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (matchesQuickFields(r, q, indexed ? listIndex.searchText[i] : null)) {
      out.push(r)
      if (out.length >= limit) break
      continue
    }
    const { review, subtitle } = getRecordReviewSearchText(r.id, r)
    if (review.toLowerCase().includes(q) || subtitle.toLowerCase().includes(q)) {
      out.push(r)
      if (out.length >= limit) break
    }
  }
  return out
}
