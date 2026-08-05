/** 스티커 개별 스타일 — 그림자·테두리 (PNG 알파 실루엣 따라감) */

export const STICKER_BORDER_OPTIONS = [
  { id: 'white', label: '흰색', color: '#ffffff' },
  { id: 'black', label: '검은색', color: '#000000' },
  { id: 'text', label: '글자색', color: 'var(--color-text)' },
  { id: 'custom', label: '사용자 지정색', color: '#888888' }
]

const BORDER_WIDTH = 1.25

const BORDER_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.707, 0.707],
  [-0.707, 0.707],
  [0.707, -0.707],
  [-0.707, -0.707]
]

function buildShapeBorderFilter(color) {
  const w = BORDER_WIDTH
  return BORDER_DIRS.map(([dx, dy]) => `drop-shadow(${dx * w}px ${dy * w}px 0 ${color})`).join(' ')
}

function resolveBorderColor(sticker) {
  const borderColor = sticker.borderColor
  if (!borderColor) return null
  if (borderColor === 'white') return '#ffffff'
  if (borderColor === 'black') return '#000000'
  if (borderColor === 'custom') return sticker.borderCustomColor || '#888888'
  if (borderColor === 'text') {
    if (typeof document !== 'undefined') {
      const resolved = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-text')
        .trim()
      if (resolved) return resolved
    }
    return '#745039'
  }
  return null
}

export function getStickerImageStyle(sticker, widthOverride) {
  const width = widthOverride ?? sticker.width
  const style = { width }
  const isMultiply = sticker.blendMode === 'multiply'
  const filters = []

  const borderColor = resolveBorderColor(sticker)
  if (borderColor && !isMultiply) {
    filters.push(buildShapeBorderFilter(borderColor))
  }

  if (!isMultiply && sticker.shadowEnabled !== false) {
    filters.push('drop-shadow(0 4px 8px rgba(0,0,0,0.25))')
  }

  if (filters.length) {
    style.filter = filters.join(' ')
  }

  if (isMultiply) {
    style.mixBlendMode = 'multiply'
  }

  const opacity = sticker.opacity
  if (opacity != null && opacity < 1) {
    style.opacity = opacity
  }

  return style
}
