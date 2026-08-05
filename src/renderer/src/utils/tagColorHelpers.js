import { TAG_COLOR_PALETTE } from '../data/propertyTypes'
import { getTagColor, TAG_COLOR_PRESETS, TAG_CUSTOM_SLOTS } from '../data/defaults'

const LEGACY_COVER_COLORS = [
  ...TAG_COLOR_PRESETS.map((t) => t.color),
  ...TAG_CUSTOM_SLOTS.map((t) => t.color)
]

/** 단일 색상 → 커스텀 팔레트 매핑 */
export function mapColorToCustomPalette(color, customPalette = [], fallbackIndex = 0) {
  const palette = customPalette.filter(Boolean)
  if (!palette.length) return color
  if (color && palette.includes(color)) return color

  const oldIdx = TAG_COLOR_PALETTE.indexOf(color)
  if (oldIdx >= 0) return palette[oldIdx % palette.length]

  const legacyIdx = LEGACY_COVER_COLORS.indexOf(color)
  if (legacyIdx >= 0) return palette[legacyIdx % palette.length]

  return palette[fallbackIndex % palette.length]
}

/** 태그 추가·표지 랜덤 색 — 동일 팔레트 */
export function randomTagColor(settings = {}) {
  const custom = (settings.tagCustomPalette || []).filter(Boolean)
  const palette = settings.tagCustomColorOnly
    ? custom
    : [...TAG_COLOR_PALETTE, ...custom.filter((c) => !TAG_COLOR_PALETTE.includes(c))]

  if (!palette.length) return TAG_COLOR_PALETTE[0]
  return palette[Math.floor(Math.random() * palette.length)]
}

/** 태그 표시 색 — 커스텀색만 사용 시 런타임 매핑 포함 */
export function resolveTagDisplayColor(tag, settings = {}, fallbackIndex = 0) {
  const tagCustomColors = settings.tagCustomColors || {}
  const base = tag.headerColor || getTagColor(tag.colorId, tagCustomColors)
  const customPalette = (settings.tagCustomPalette || []).filter(Boolean)
  if (settings.tagCustomColorOnly && customPalette.length) {
    return mapColorToCustomPalette(base, customPalette, fallbackIndex)
  }
  return base
}

/** 커스텀색상만 쓰기 활성화 시 기존 태그 색 → 커스텀 팔레트로 치환 */
export function remapTagsToCustomPalette(tags, customPalette = []) {
  const palette = customPalette.filter(Boolean)
  if (!palette.length) return tags

  return tags.map((tag, i) => {
    const current = tag.headerColor || getTagColor(tag.colorId)
    const headerColor = mapColorToCustomPalette(current, palette, i)
    return tag.headerColor === headerColor ? tag : { ...tag, headerColor }
  })
}

/** 커스텀색상만 쓰기 활성화 시 기존 표지 색 → 커스텀 팔레트로 치환 */
export function remapRecordsCoverToCustomPalette(records, customPalette = []) {
  const palette = customPalette.filter(Boolean)
  if (!palette.length) return records

  return records.map((rec, i) => {
    const coverColor = mapColorToCustomPalette(rec.coverColor, palette, i)
    return rec.coverColor === coverColor ? rec : { ...rec, coverColor }
  })
}
