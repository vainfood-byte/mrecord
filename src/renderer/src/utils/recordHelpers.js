import { randomTagColor } from './tagColorHelpers'

/** 태그 팔레트와 동일한 랜덤 표지 색 */
export function randomCoverColor(settings = {}) {
  return randomTagColor(settings)
}

/** 사이드 패널 초안 변경 여부 비교용 */
export function recordDraftFingerprint(record) {
  if (!record) return ''
  try {
    return JSON.stringify({
      title: record.title,
      author: record.author,
      coverUrl: record.coverUrl,
      coverColor: record.coverColor,
      rating: record.rating,
      link: record.link,
      oneLine: record.oneLine,
      review: record.review,
      reviewSubtitle: record.reviewSubtitle,
      reviewImages: record.reviewImages,
      tagIds: record.tagIds,
      isLifeBook: record.isLifeBook,
      series: record.series,
      volumeReviews: record.volumeReviews,
      customFields: record.customFields,
      tagFieldValues: record.tagFieldValues,
      readDate: record.readDate,
      finishDate: record.finishDate
    })
  } catch {
    return `fallback-${record.id}`
  }
}

/** 새 작품 기본 템플릿 */
export function createEmptyRecord(settings = {}) {
  const now = new Date().toISOString()
  return {
    id: `rec-${Date.now()}`,
    title: '새 작품',
    author: '작가 미상',
    coverUrl: '',
    coverColor: randomCoverColor(settings),
    rating: 0,
    link: '',
    oneLine: '',
    review: '',
    reviewSubtitle: '',
    reviewImages: [],
    tagIds: [],
    isLifeBook: false,
    series: { enabled: false, unit: '권', volumes: [1], disabledVolumes: [] },
    volumeReviews: {},
    customFields: {},
    tagFieldValues: {},
    readDate: now.slice(0, 10),
    finishDate: now.slice(0, 4),
    createdAt: now
  }
}

/** 이전 독서를 바탕으로 새 기록 생성 — 제목만 새로, 나머지는 유지 */
export function createRecordFromSource(source, patch = {}, settings = {}) {
  if (!source) return { ...createEmptyRecord(settings), ...patch }

  const now = new Date().toISOString()
  const { id: _id, title: _title, createdAt: _createdAt, ...rest } = source

  return {
    ...createEmptyRecord(settings),
    ...rest,
    ...patch,
    id: `rec-${Date.now()}`,
    title: patch.title ?? '새 작품',
    createdAt: now,
    readDate: patch.readDate ?? rest.readDate ?? now.slice(0, 10),
    finishDate: patch.finishDate ?? rest.finishDate ?? now.slice(0, 4)
  }
}

/** 흔적 박스 통계 — 태그/속성 기준 개수 */
export function countByTraceSource(records, tags, sourceType, sourceId) {
  if (sourceType === 'tag') {
    return records.filter((r) => r.tagIds?.includes(sourceId)).length
  }
  if (sourceType === 'field') {
    const field = sourceId
    if (field === 'year') {
      const tag = tags.find((t) => t.id === sourceId)
      const yearVal = tag?.name || sourceId
      return records.filter((r) => r.year === yearVal || r.tagIds?.includes(sourceId)).length
    }
    return records.filter((r) => {
      const val = r[field] ?? r.customFields?.[field]
      return val != null && val !== ''
    }).length
  }
  return 0
}
