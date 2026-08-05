import { getRatingSortValue, getRecordRatingIcon } from './ratingHelpers'

function matchesSearch(record, queryLower) {
  return (
    record.title.toLowerCase().includes(queryLower) ||
    record.author.toLowerCase().includes(queryLower) ||
    (record.oneLine || '').toLowerCase().includes(queryLower)
  )
}

function matchesTags(record, filterTagIds) {
  const ids = record.tagIds
  if (!ids?.length) return false
  for (let i = 0; i < filterTagIds.length; i++) {
    if (!ids.includes(filterTagIds[i])) return false
  }
  return true
}

/** YYYY-MM-DD / ISO 문자열은 Date 파싱 없이 비교 가능 */
function readDateKey(value) {
  if (!value) return ''
  return typeof value === 'string' ? value : String(value)
}

function getRecordCreatedTime(record) {
  if (record.createdAt) {
    const t = Date.parse(record.createdAt)
    if (!Number.isNaN(t)) return t
  }
  const match = /^rec-(\d+)$/.exec(record.id || '')
  if (match) return Number(match[1])
  if (record.readDate) {
    const t = Date.parse(record.readDate)
    if (!Number.isNaN(t)) return t
  }
  return 0
}

function sortRecords(records, sortBy, sortDir) {
  const n = records.length
  if (n <= 1) return records

  const dir = sortDir === 'asc' ? 1 : -1
  const order = new Uint32Array(n)
  for (let i = 0; i < n; i++) order[i] = i

  if (sortBy === 'createdAt' || sortBy === 'latest') {
    const keys = new Float64Array(n)
    for (let i = 0; i < n; i++) keys[i] = getRecordCreatedTime(records[i])
    order.sort((a, b) => dir * (keys[b] - keys[a]))
    const out = new Array(n)
    for (let i = 0; i < n; i++) out[i] = records[order[i]]
    return out
  }

  if (sortBy === 'readDate') {
    const keys = new Array(n)
    for (let i = 0; i < n; i++) keys[i] = readDateKey(records[i].readDate)
    order.sort((a, b) => {
      const ak = keys[a]
      const bk = keys[b]
      if (ak === bk) return 0
      if (!ak) return 1
      if (!bk) return -1
      return dir * (ak < bk ? 1 : -1)
    })
    const out = new Array(n)
    for (let i = 0; i < n; i++) out[i] = records[order[i]]
    return out
  }

  if (sortBy === 'rating') {
    const keys = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const rec = records[i]
      keys[i] = getRatingSortValue(rec.rating, getRecordRatingIcon(rec))
    }
    order.sort((a, b) => dir * (keys[b] - keys[a]))
    const out = new Array(n)
    for (let i = 0; i < n; i++) out[i] = records[order[i]]
    return out
  }

  const keys = new Array(n)
  for (let i = 0; i < n; i++) keys[i] = records[i].title || ''
  order.sort((a, b) => dir * keys[a].localeCompare(keys[b], 'ko'))
  const out = new Array(n)
  for (let i = 0; i < n; i++) out[i] = records[order[i]]
  return out
}

/** 목록/갤러리용 필터·정렬 — review HTML 제외(대용량 검색 렉 방지) */
export function filterRecords(state) {
  const { records, filterTagIds, searchQuery, sortBy, sortDir } = state
  const hasTagFilter = filterTagIds.length > 0
  const queryLower = searchQuery.trim().toLowerCase()
  const hasSearch = queryLower.length > 0

  let list = records
  if (hasTagFilter || hasSearch) {
    const filtered = []
    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      if (hasTagFilter && !matchesTags(record, filterTagIds)) continue
      if (hasSearch && !matchesSearch(record, queryLower)) continue
      filtered.push(record)
    }
    list = filtered
  }

  return sortRecords(list, sortBy, sortDir)
}
