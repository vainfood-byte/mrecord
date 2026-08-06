import { getRatingSortValue, getRecordRatingIcon } from './ratingHelpers'

/** records 변경 시에만 재구축 — 검색/태그 매칭용 소문자·Set 인덱스 */
export function buildRecordListIndex(records) {
  const n = records.length
  const searchText = new Array(n)
  const tagSets = new Array(n)
  for (let i = 0; i < n; i++) {
    const r = records[i]
    searchText[i] = {
      title: (r.title || '').toLowerCase(),
      author: (r.author || '').toLowerCase(),
      oneLine: (r.oneLine || '').toLowerCase()
    }
    const ids = r.tagIds
    tagSets[i] = ids?.length ? new Set(ids) : null
  }
  return { searchText, tagSets }
}

function matchesSearchIndexed(entry, queryLower) {
  return (
    entry.title.includes(queryLower) ||
    entry.author.includes(queryLower) ||
    entry.oneLine.includes(queryLower)
  )
}

function matchesSearch(record, queryLower) {
  return (
    (record.title || '').toLowerCase().includes(queryLower) ||
    (record.author || '').toLowerCase().includes(queryLower) ||
    (record.oneLine || '').toLowerCase().includes(queryLower)
  )
}

function matchesTagsIndexed(tagSet, filterTagIds) {
  if (!tagSet) return false
  for (let i = 0; i < filterTagIds.length; i++) {
    if (!tagSet.has(filterTagIds[i])) return false
  }
  return true
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

/** 필터만 — 정렬과 분리해 정렬 변경 시 재필터 방지 */
export function filterRecordsOnly(records, filterTagIds, searchQuery, listIndex) {
  const tags = filterTagIds || []
  const hasTagFilter = tags.length > 0
  const queryLower = (searchQuery || '').trim().toLowerCase()
  const hasSearch = queryLower.length > 0

  if (!hasTagFilter && !hasSearch) return records

  const indexed = listIndex && listIndex.searchText?.length === records.length
  const filtered = []
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (hasTagFilter) {
      const ok = indexed
        ? matchesTagsIndexed(listIndex.tagSets[i], tags)
        : matchesTags(record, tags)
      if (!ok) continue
    }
    if (hasSearch) {
      const ok = indexed
        ? matchesSearchIndexed(listIndex.searchText[i], queryLower)
        : matchesSearch(record, queryLower)
      if (!ok) continue
    }
    filtered.push(record)
  }
  return filtered
}

export function sortRecordsList(records, sortBy, sortDir) {
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
export function filterRecords(state, listIndex) {
  const { records, filterTagIds, searchQuery, sortBy, sortDir } = state
  const filtered = filterRecordsOnly(records, filterTagIds, searchQuery, listIndex)
  return sortRecordsList(filtered, sortBy, sortDir)
}
