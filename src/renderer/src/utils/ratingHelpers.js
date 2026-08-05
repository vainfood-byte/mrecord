/** 별점 정렬용 — 해골은 5가 최저점 */

export function getRatingSortValue(rating, iconType = 'star') {

  const r = rating || 0

  if (iconType === 'skull') return 6 - r

  return r

}



/** 작품별 별점 아이콘 — 미설정 시 star */

export function getRecordRatingIcon(record, field) {

  if (!record) return 'star'

  if (field?.id && field.id !== 'rating') {

    return record.customFields?.[`${field.id}_icon`] || 'star'

  }

  return record.ratingIcon || 'star'

}



/** @deprecated 전역 기본값 — 정렬 fallback용 */

export function getRatingIconType(propertyFields = []) {

  const field = propertyFields.find((f) => f.id === 'rating')

  return field?.ratingIcon || 'star'

}


