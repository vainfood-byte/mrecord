/**
 * 감상/리뷰 고용량 필드 — React 목록 state와 분리 보관.
 * mrecord-data.json 스키마는 그대로 두고, 인메모리만 경량화한다.
 */

export const HEAVY_RECORD_FIELDS = ['review', 'reviewSubtitle', 'reviewImages', 'volumeReviews']

const HEAVY_FIELD_SET = new Set(HEAVY_RECORD_FIELDS)

const EMPTY_HEAVY = Object.freeze({
  review: '',
  reviewSubtitle: '',
  reviewImages: Object.freeze([]),
  volumeReviews: Object.freeze({})
})

/** @type {Map<string, { review: string, reviewSubtitle: string, reviewImages: any[], volumeReviews: Record<string, any> }>} */
const heavyById = new Map()

function cloneEmptyHeavy() {
  return {
    review: '',
    reviewSubtitle: '',
    reviewImages: [],
    volumeReviews: {}
  }
}

export function getEmptyHeavyFields() {
  return cloneEmptyHeavy()
}

export function extractHeavyFields(record) {
  if (!record || typeof record !== 'object') return cloneEmptyHeavy()
  return {
    review: record.review ?? '',
    reviewSubtitle: record.reviewSubtitle ?? '',
    reviewImages: Array.isArray(record.reviewImages) ? record.reviewImages : [],
    volumeReviews:
      record.volumeReviews && typeof record.volumeReviews === 'object'
        ? record.volumeReviews
        : {}
  }
}

/** 목록/갤러리용 — 고용량 필드·런타임 메타 제거 */
export function toListRecord(record) {
  if (!record || typeof record !== 'object') return record
  let needsStrip = false
  for (const key of HEAVY_RECORD_FIELDS) {
    if (key in record) {
      needsStrip = true
      break
    }
  }
  if (!needsStrip && !('__heavyRev' in record)) return record
  const list = { ...record }
  for (const key of HEAVY_RECORD_FIELDS) {
    delete list[key]
  }
  delete list.__heavyRev
  return list
}

export function getRecordHeavy(id) {
  if (!id) return null
  return heavyById.get(id) ?? null
}

/**
 * payload에 포함된 heavy 키만 반영 (부분 업데이트 시 기존 감상 보존)
 */
export function syncRecordHeavyFromPayload(id, payload) {
  if (!id || !payload || typeof payload !== 'object') return getRecordHeavy(id)

  let touched = false
  for (const key of HEAVY_RECORD_FIELDS) {
    if (key in payload) {
      touched = true
      break
    }
  }
  if (!touched) return getRecordHeavy(id) ?? null

  const prev = heavyById.get(id) || cloneEmptyHeavy()
  const next = {
    review: 'review' in payload ? (payload.review ?? '') : prev.review,
    reviewSubtitle:
      'reviewSubtitle' in payload ? (payload.reviewSubtitle ?? '') : prev.reviewSubtitle,
    reviewImages:
      'reviewImages' in payload
        ? Array.isArray(payload.reviewImages)
          ? payload.reviewImages
          : []
        : prev.reviewImages,
    volumeReviews:
      'volumeReviews' in payload
        ? payload.volumeReviews && typeof payload.volumeReviews === 'object'
          ? payload.volumeReviews
          : {}
        : prev.volumeReviews
  }

  if (
    prev.review === next.review &&
    prev.reviewSubtitle === next.reviewSubtitle &&
    prev.reviewImages === next.reviewImages &&
    prev.volumeReviews === next.volumeReviews
  ) {
    return prev
  }

  heavyById.set(id, next)
  return next
}

/** 원본 레코드에서 heavy를 스토어에 넣고 목록용 객체를 반환 */
export function ingestRecordHeavy(record) {
  if (!record?.id) return record
  const heavy = extractHeavyFields(record)
  heavyById.set(record.id, heavy)
  return toListRecord(record)
}

export function ingestRecordsHeavy(records, { replace = false } = {}) {
  if (replace) heavyById.clear()
  if (!Array.isArray(records)) return []
  return records.map((r) => ingestRecordHeavy(r))
}

export function removeRecordHeavy(id) {
  if (id) heavyById.delete(id)
}

export function removeRecordsHeavy(ids) {
  if (!ids) return
  for (const id of ids) heavyById.delete(id)
}

export function clearRecordHeavyStore() {
  heavyById.clear()
}

/** 상세 패널용 — 목록 레코드 + 스토어 heavy 병합 */
export function hydrateRecord(record) {
  if (!record?.id) return record ?? null
  const heavy = heavyById.get(record.id)
  if (!heavy) {
    if (
      record.review != null ||
      record.reviewSubtitle != null ||
      record.reviewImages != null ||
      record.volumeReviews != null
    ) {
      return record
    }
    return {
      ...record,
      review: EMPTY_HEAVY.review,
      reviewSubtitle: EMPTY_HEAVY.reviewSubtitle,
      reviewImages: [],
      volumeReviews: {}
    }
  }
  if (
    record.review === heavy.review &&
    record.reviewSubtitle === heavy.reviewSubtitle &&
    record.reviewImages === heavy.reviewImages &&
    record.volumeReviews === heavy.volumeReviews
  ) {
    return record
  }
  return {
    ...record,
    review: heavy.review,
    reviewSubtitle: heavy.reviewSubtitle,
    reviewImages: heavy.reviewImages,
    volumeReviews: heavy.volumeReviews
  }
}

/** 저장/내보내기용 — JSON 스키마와 동일한 풀 레코드 (__heavyRev 등 런타임 키 제거) */
export function hydrateRecordForPersist(record) {
  if (!record?.id) return record
  const { __heavyRev: _rev, ...rest } = record
  void _rev
  const heavy = heavyById.get(record.id)
  if (!heavy) {
    return {
      ...rest,
      review: rest.review ?? '',
      reviewSubtitle: rest.reviewSubtitle ?? '',
      reviewImages: Array.isArray(rest.reviewImages) ? rest.reviewImages : [],
      volumeReviews:
        rest.volumeReviews && typeof rest.volumeReviews === 'object'
          ? rest.volumeReviews
          : {}
    }
  }
  return {
    ...rest,
    review: heavy.review ?? '',
    reviewSubtitle: heavy.reviewSubtitle ?? '',
    reviewImages: Array.isArray(heavy.reviewImages) ? heavy.reviewImages : [],
    volumeReviews:
      heavy.volumeReviews && typeof heavy.volumeReviews === 'object'
        ? heavy.volumeReviews
        : {}
  }
}

export function hydrateRecordsForPersist(records) {
  if (!Array.isArray(records)) return []
  return records.map((r) => hydrateRecordForPersist(r))
}

export function isHeavyRecordField(key) {
  return HEAVY_FIELD_SET.has(key)
}

/** 검색용 — 스토어에 있는 감상 텍스트 */
export function getRecordReviewSearchText(id, listRecord) {
  const heavy = id ? heavyById.get(id) : null
  const review = listRecord?.review ?? heavy?.review ?? ''
  const subtitle = listRecord?.reviewSubtitle ?? heavy?.reviewSubtitle ?? ''
  return { review, subtitle }
}
