/** 메모형 카드 — 표지(작품 표지) vs 커버(카드·필드별 커스텀 이미지) */

export function getMemoCoverEntry(rec, fieldId) {
  return rec.memoCovers?.[fieldId] || null
}

export function isMemoCoverActive(rec, fieldId) {
  const entry = getMemoCoverEntry(rec, fieldId)
  return Boolean(entry?.active || entry?.coverUrl)
}

/** @returns {{ mode: 'poster'|'cover'|'upload', url: string, color: string|undefined }} */
export function getMemoCardImageState(rec, fieldId) {
  const color = rec.coverColor
  const entry = getMemoCoverEntry(rec, fieldId)

  if (!entry?.active && !entry?.coverUrl) {
    return { mode: 'poster', url: rec.coverUrl || '', color }
  }
  if (entry?.coverUrl) {
    return { mode: 'cover', url: entry.coverUrl, color }
  }
  return { mode: 'upload', url: '', color }
}

export function buildMemoCoverPatch(rec, fieldId, entry) {
  const prev = { ...(rec.memoCovers || {}) }
  if (!entry || (!entry.coverUrl && !entry.active)) {
    delete prev[fieldId]
    return { memoCovers: Object.keys(prev).length ? prev : {} }
  }
  const stored = { ...entry }
  if (!stored.coverUrl) delete stored.coverUrl
  return { memoCovers: { ...prev, [fieldId]: stored } }
}

/** 카드별 커버 모드 토글 */
export function toggleMemoCover(rec, fieldId) {
  if (isMemoCoverActive(rec, fieldId)) {
    return buildMemoCoverPatch(rec, fieldId, null)
  }
  return buildMemoCoverPatch(rec, fieldId, { active: true })
}

export function setMemoCoverUrl(rec, fieldId, coverUrl) {
  return buildMemoCoverPatch(rec, fieldId, { active: true, coverUrl })
}

/** 커버 삭제 → 표지로 복귀 */
export function clearMemoCover(rec, fieldId) {
  return buildMemoCoverPatch(rec, fieldId, null)
}
