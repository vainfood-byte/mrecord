/** 흔적 박스 — 속성·키워드·통계 계산 */

import { TAG_COLOR_PALETTE } from '../data/propertyTypes'
import { TAG_COLOR_PRESETS } from '../data/defaults'
import { getThemeColors } from './colorUtils'
import { resolveTagDisplayColor } from './tagColorHelpers'

export const TRACE_GRAPH_COLOR_MODES = ['theme', 'custom', 'random']

export const TRACE_GRAPH_COLOR_MODE_LABELS = {
  theme: '테마',
  custom: '커스텀',
  random: '랜덤'
}

export function cycleTraceGraphColorMode(current = 'theme') {
  const idx = TRACE_GRAPH_COLOR_MODES.indexOf(current)
  const safeIdx = idx >= 0 ? idx : 0
  return TRACE_GRAPH_COLOR_MODES[(safeIdx + 1) % TRACE_GRAPH_COLOR_MODES.length]
}

function createSeededRandom(seed = 0) {
  let state = (Math.abs(seed) || 1) >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function parseHexRgb(hex) {
  if (!hex) return null
  const h = String(hex).replace('#', '').trim()
  if (h.length < 6) return null
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if ([r, g, b].some((v) => Number.isNaN(v))) return null
  return [r, g, b]
}

function rgbToHex([r, g, b]) {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.round(Math.max(0, Math.min(255, v)))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

function rgbToHsl([r, g, b]) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
        break
      case gn:
        h = ((bn - rn) / d + 2) / 6
        break
      default:
        h = ((rn - gn) / d + 4) / 6
        break
    }
  }

  return { h: h * 360, s, l }
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360 / 360
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hueToRgb = (t) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }

  return [
    Math.round(hueToRgb(hue + 1 / 3) * 255),
    Math.round(hueToRgb(hue) * 255),
    Math.round(hueToRgb(hue - 1 / 3) * 255)
  ]
}

function hslToHex(h, s, l) {
  return rgbToHex(hslToRgb(h, s, l))
}

/** 블랙·화이트·무채색 계열 제외 */
function isBlackOrWhiteLike(hex) {
  const rgb = parseHexRgb(hex)
  if (!rgb) return true
  const { s, l } = rgbToHsl(rgb)
  if (s < 0.1) return true
  if (l <= 0.1 || l >= 0.93) return true
  return false
}

function getThemeChromaticReference(theme = getThemeColors()) {
  const candidates = [
    theme.accent,
    theme.border,
    theme.textMuted,
    theme.text,
    theme.bg,
    theme.bgPanel,
    theme.bgSubPanel,
    theme.bgCard
  ].filter(Boolean)

  let best = null
  for (const hex of candidates) {
    if (isBlackOrWhiteLike(hex)) continue
    const rgb = parseHexRgb(hex)
    if (!rgb) continue
    const hsl = rgbToHsl(rgb)
    if (!best || hsl.s > best.s) best = hsl
  }

  return best || { h: 32, s: 0.38, l: 0.52 }
}

/** 테마 채도에 맞춘 색상 팔레트 — 블랙/화이트 제외, 시드 기준 셔플 */
function buildThemeSaturationPalette(theme = getThemeColors(), size = 10) {
  const ref = getThemeChromaticReference(theme)
  const hueOffsets = [0, 28, -28, 56, -56, 84, -84, 112, -112, 140, -140, 168]
  const palette = []

  for (let i = 0; i < size; i += 1) {
    const h = (ref.h + hueOffsets[i % hueOffsets.length] + 360) % 360
    const s = Math.min(0.82, Math.max(0.22, ref.s + ((i % 3) - 1) * 0.07))
    const l = Math.min(0.7, Math.max(0.36, ref.l + ((i % 4) - 1.5) * 0.05))
    palette.push(hslToHex(h, s, l))
  }

  return palette
}

/** 시드 기준 팔레트 셔플 → 항목별 색상 매핑 */
export function buildTraceGraphColorMap(distribution = [], options = {}) {
  const {
    mode = 'theme',
    seed = 0,
    settings = {},
    theme = getThemeColors()
  } = options

  const palette = getTraceGraphPalette(mode, settings, theme)

  if (!palette.length || !distribution.length) return {}

  const rand = createSeededRandom(seed)
  const shuffled = [...palette]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const map = {}
  distribution.forEach((item, index) => {
    const id = item?.id ?? `idx-${index}`
    map[id] = shuffled[index % shuffled.length]
  })
  return map
}

/** 흔적 그래프 슬라이스 색 */
export function resolveTraceGraphSliceColor(item, index, _distribution, options = {}, colorMap = null) {
  const id = item?.id ?? `idx-${index}`
  if (colorMap && colorMap[id]) return colorMap[id]

  const {
    mode = 'theme',
    seed = 0,
    settings = {},
    theme = getThemeColors()
  } = options
  const palette = getTraceGraphPalette(mode, settings, theme)
  if (!palette.length) return '#888888'

  let hash = 0
  const key = `${id}:${seed}`
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0
  }
  return palette[Math.abs(hash) % palette.length]
}

function getDefaultTagColorPalette() {
  const seen = new Set()
  const palette = []
  for (const color of [...TAG_COLOR_PRESETS.map((t) => t.color), ...TAG_COLOR_PALETTE]) {
    const key = color.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    palette.push(color)
  }
  return palette
}

export function getTraceGraphPalette(mode = 'theme', settings = {}, theme = getThemeColors()) {
  if (mode === 'custom') {
    const custom = (settings.tagCustomPalette || []).filter(Boolean)
    return custom.length ? custom : getDefaultTagColorPalette()
  }
  if (mode === 'random') {
    return getDefaultTagColorPalette()
  }
  return buildThemeSaturationPalette(theme)
}

export function getPropertyField(propertyFields, fieldId) {
  return propertyFields.find((f) => f.id === fieldId)
}

export function getKeywordsForProperty(records, tags, field, propertyFields) {
  if (!field) return []

  if (field.type === 'year') {
    const years = new Set()
    records.forEach((rec) => {
      const v = rec[field.id] ?? rec.customFields?.[field.id]
      if (!v) return
      const y = String(v).slice(0, 4)
      if (/^\d{4}$/.test(y)) years.add(y)
    })
    return [...years].sort((a, b) => Number(b) - Number(a)).map((y) => ({
      id: y,
      name: y,
      category: field.label
    }))
  }

  if (field.type === 'date') {
    const values = new Set()
    records.forEach((rec) => {
      const v = rec[field.id] ?? rec.customFields?.[field.id]
      if (v) values.add(String(v).slice(0, 10))
    })
    return [...values].sort().reverse().map((v) => ({
      id: v,
      name: v,
      category: field.label
    }))
  }

  if (field.type === 'tags' && field.tagCategory) {
    return tags.filter((t) => t.category === field.tagCategory)
  }

  return []
}

function recordMatchesKeyword(rec, tags, field, keywordId) {
  if (!keywordId || keywordId === '__none__') return true

  if (field.type === 'year' || field.type === 'date') {
    const v = rec[field.id] ?? rec.customFields?.[field.id]
    if (!v) return false
    if (field.type === 'year') return String(v).slice(0, 4) === keywordId
    return String(v).slice(0, 10) === keywordId
  }

  if (field.type === 'tags') {
    return rec.tagIds?.includes(keywordId)
  }

  return false
}

export function filterRecordsForTrace(records, tags, fieldId, keywordId, propertyFields) {
  const field = getPropertyField(propertyFields, fieldId)
  if (!field) return []

  return records.filter((rec) => {
    if (field.type === 'tags') {
      const catTags = tags.filter((t) => t.category === field.tagCategory)
      const hasAny = catTags.some((t) => rec.tagIds?.includes(t.id))
      if (!hasAny) return false
    } else {
      const v = rec[field.id] ?? rec.customFields?.[field.id]
      if (!v) return false
    }
    return recordMatchesKeyword(rec, tags, field, keywordId)
  })
}

export function countByTraceWidget(records, tags, widget, propertyFields) {
  const filtered = filterRecordsForTrace(
    records,
    tags,
    widget.sourceId,
    widget.keywordId,
    propertyFields
  )
  return filtered.length
}

export function getTopTagStat(records, tags, fieldId, keywordId, propertyFields, settings = {}) {
  const field = getPropertyField(propertyFields, fieldId)
  if (!field || field.type !== 'tags' || !field.tagCategory) return null

  const filtered = filterRecordsForTrace(
    records,
    tags,
    fieldId,
    keywordId ?? widgetKeywordNone(),
    propertyFields
  )
  const catTags = tags.filter((t) => t.category === field.tagCategory)
  const counts = {}

  filtered.forEach((rec) => {
    catTags.forEach((tag) => {
      if (rec.tagIds?.includes(tag.id)) {
        counts[tag.id] = (counts[tag.id] || 0) + 1
      }
    })
  })

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (!entries.length) return null

  const [topId, topCount] = entries[0]
  const tag = tags.find((t) => t.id === topId)
  const total = filtered.length || 1
  const distribution = entries.map(([id, count]) => {
    const tag = tags.find((t) => t.id === id)
    return {
      id,
      name: tag?.name || id,
      count,
      percent: Math.round((count / total) * 100),
      color: tag ? resolveTagDisplayColor(tag, settings) : undefined
    }
  })

  return {
    tag: tag?.name || topId,
    count: topCount,
    percent: Math.round((topCount / total) * 100),
    distribution
  }
}

export function widgetKeywordNone() {
  return '__none__'
}

export function countPropertyRecords(records, tags, fieldId, propertyFields) {
  return filterRecordsForTrace(records, tags, fieldId, widgetKeywordNone(), propertyFields).length
}

export function countKeywordRecords(records, tags, fieldId, keywordId, propertyFields) {
  return filterRecordsForTrace(records, tags, fieldId, keywordId, propertyFields).length
}

export function isLegacyTraceWidget(widget) {
  return Boolean(widget?.sourceType)
}

export function resolveTraceWidget(widget) {
  if (isLegacyTraceWidget(widget)) return widget
  return {
    formatType: 'number',
    keywordId: widgetKeywordNone(),
    statPrefixText: '',
    statSuffixText: '예요',
    graphType: 'none',
    graphColorMode: 'theme',
    graphColorSeed: 0,
    ...widget
  }
}
