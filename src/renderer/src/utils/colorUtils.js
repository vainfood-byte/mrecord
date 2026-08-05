function parseHexRgb(hex) {
  if (!hex) return null
  const h = hex.replace('#', '')
  if (h.length < 6) return null
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ]
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

function rgbLuminance([r, g, b]) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function mixRgb(a, b, ratio) {
  return a.map((v, i) => v * (1 - ratio) + b[i] * ratio)
}

/** 두 hex 색상을 ratio 비율로 혼합 (0.5 = 반반) */
export function mixHexColors(hexA, hexB, ratio = 0.5) {
  const a = parseHexRgb(hexA)
  const b = parseHexRgb(hexB)
  if (!a || !b) return hexA || hexB || '#FFFFFF'
  return rgbToHex(mixRgb(a, b, ratio))
}

/** 여러 hex 중 가장 어두운 색 */
export function darkestHex(...hexes) {
  const parsed = hexes.filter(Boolean).map(parseHexRgb).filter(Boolean)
  if (!parsed.length) return '#000000'
  let pick = parsed[0]
  let minLum = rgbLuminance(pick)
  for (let i = 1; i < parsed.length; i += 1) {
    const lum = rgbLuminance(parsed[i])
    if (lum < minLum) {
      minLum = lum
      pick = parsed[i]
    }
  }
  return rgbToHex(pick)
}

/** 배경색에서 카드/태그 본문용 배경 — 배경 틴트를 유지하면서 구분감 확보 */
export function deriveCardBackground(bgHex, towardHex = '#FFFFFF') {
  const bg = parseHexRgb(bgHex)
  const toward = parseHexRgb(towardHex)
  if (!bg || !toward) return '#FFFFFF'

  const bgLum = rgbLuminance(bg)
  let ratio = bgLum > 0.55 ? 0.78 : 0.42
  let mixed = mixRgb(bg, toward, ratio)
  let cardLum = rgbLuminance(mixed)

  if (bgLum > 0.55) {
    while (cardLum - bgLum < 0.08 && ratio < 0.96) {
      ratio += 0.04
      mixed = mixRgb(bg, toward, ratio)
      cardLum = rgbLuminance(mixed)
    }
  } else {
    while (cardLum - bgLum < 0.12 && ratio < 0.88) {
      ratio += 0.05
      mixed = mixRgb(bg, toward, ratio)
      cardLum = rgbLuminance(mixed)
    }
  }

  return rgbToHex(mixed)
}

/** 배경색에 맞는 대비 텍스트 색상 */
export function contrastText(hex) {
  if (!hex) return 'var(--color-text)'
  const h = hex.replace('#', '')
  if (h.length < 6) return 'var(--color-text)'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.55 ? '#2A2826' : '#FFFFFF'
}

/** 표지 미지정 placeholder — 배경색 대비 가독성 */
export function coverPlaceholderStyle(hex) {
  const bg = hex || '#C4A882'
  const color = contrastText(bg)
  return {
    backgroundColor: bg,
    color,
    textShadow: color === '#FFFFFF' ? '0 1px 4px rgba(0,0,0,0.5)' : 'none'
  }
}

/** CSS 변수 또는 hex에서 테마 색상 읽기 */
export function getThemeColors() {
  const style = getComputedStyle(document.documentElement)
  const get = (v, fallback) => style.getPropertyValue(v).trim() || fallback
  return {
    bg: get('--color-bg', '#FAF8F3'),
    bgPanel: get('--color-bg-panel', '#F5F1E5'),
    bgSubPanel: get('--color-bg-sub-panel', '#FFFFFF'),
    bgCard: get('--color-bg-card', '#FFFFFF'),
    text: get('--color-text', '#3D3830'),
    textMuted: get('--color-text-muted', '#7A7268'),
    border: get('--color-border', '#D4CBB8'),
    accent: get('--color-accent', '#8B7355')
  }
}

/** hex → rgba 문자열 */
export function hexToRgba(hex, alpha = 1) {
  const h = String(hex || '').replace('#', '')
  if (h.length < 6) return `rgba(245, 241, 229, ${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
