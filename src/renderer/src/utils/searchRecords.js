/** 빠른 검색 — review 제외, 결과 상한 (대용량 목록용) */
export function searchRecordsQuick(records, query, limit = 40) {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const out = []
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (
      r.title.toLowerCase().includes(q) ||
      r.author.toLowerCase().includes(q) ||
      (r.oneLine || '').toLowerCase().includes(q)
    ) {
      out.push(r)
      if (out.length >= limit) break
    }
  }
  return out
}

/** 검색 메뉴용 — 본문(review) 포함, 상한 적용 */
export function searchRecordsWithReview(records, query, limit = 40) {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const out = []
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (
      r.title.toLowerCase().includes(q) ||
      r.author.toLowerCase().includes(q) ||
      (r.oneLine || '').toLowerCase().includes(q) ||
      (r.review || '').toLowerCase().includes(q) ||
      (r.reviewSubtitle || '').toLowerCase().includes(q)
    ) {
      out.push(r)
      if (out.length >= limit) break
    }
  }
  return out
}
