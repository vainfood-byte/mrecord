/** 메모형 속성 탭 — 카드 보기 설정 */

import { getThemeColors, hexToRgba } from './colorUtils'

export const MEMO_TEXT_SIZES = {
  small: { px: 10, label: '소' },
  medium: { px: 12, label: '중' },
  large: { px: 14, label: '대' },
  xlarge: { px: 16, label: '특대' }
}

export function getMemoTabSettings(settings, fieldId) {
  const saved = settings?.memoTabSettings?.[fieldId] || {}
  const cardSize = saved.cardSize && ['small', 'medium', 'large', 'xlarge'].includes(saved.cardSize)
    ? saved.cardSize
    : 'large'
  const textSize = saved.textSize && ['small', 'medium', 'large', 'xlarge'].includes(saved.textSize)
    ? saved.textSize
    : 'large'
  const gradient = ['white', 'theme', 'black'].includes(saved.gradient) ? saved.gradient : 'black'

  return {
    cardSize,
    textSize,
    hideCover: saved.hideCover === true,
    maintainLayout: saved.maintainLayout === true,
    cardVersion: saved.cardVersion === 'v2' ? 'v2' : 'v1',
    gradient
  }
}

export function patchMemoTabSettings(settings, fieldId, patch) {
  const current = getMemoTabSettings(settings, fieldId)
  return {
    ...(settings.memoTabSettings || {}),
    [fieldId]: { ...current, ...patch }
  }
}

export function isMemoFieldType(type) {
  return type === 'memo' || type === 'link' || type === 'text' || type === 'multiline'
}

export function getMemoTextSizePx(sizeKey) {
  return MEMO_TEXT_SIZES[sizeKey]?.px ?? MEMO_TEXT_SIZES.small.px
}

/** 내보내기 전용 글자 크기 — 화면 설정과 분리(기본값 large) */
export const MEMO_EXPORT_TEXT_SIZE = 'large'

export function getMemoExportTextSizePx() {
  return getMemoTextSizePx(MEMO_EXPORT_TEXT_SIZE)
}

/** V1 카드 표지 상단 그라데이션 높이 비율 */
export const MEMO_GRADIENT_COVER_RATIO = 0.3

/** V2 카드 — 표지↔텍스트박스 바깥 여백 / 박스 안쪽 패딩 (상하좌우 동일) */
export const MEMO_V2_PANEL_INSET_PX = 6
export const MEMO_V2_PANEL_PAD_PX = 6
export const MEMO_V2_PANEL_INSET_Y_PX = MEMO_V2_PANEL_INSET_PX
export const MEMO_V2_PANEL_INSET_X_PX = MEMO_V2_PANEL_INSET_PX
/** 비-규격유지 모드에서만 사용 — 표지 대비 텍스트 박스 최소 높이 */
export const MEMO_V2_PANEL_HEIGHT_RATIO = 0.93

/** cover 크기 기준 — inset 안쪽 영역과 텍스트 최대 높이 */
export function computeMemoV2LayoutMetrics(coverWidth, coverHeight) {
  const w = Math.max(1, Math.round(coverWidth))
  const h = Math.max(1, Math.round(coverHeight))
  const inset = MEMO_V2_PANEL_INSET_PX
  const pad = MEMO_V2_PANEL_PAD_PX
  const innerWidth = Math.max(1, w - inset * 2)
  const innerHeight = Math.max(1, h - inset * 2)
  const textMaxHeight = Math.max(1, innerHeight - pad * 2)
  const panelMinHeight = Math.min(Math.round(h * MEMO_V2_PANEL_HEIGHT_RATIO), innerHeight)
  return {
    coverWidth: w,
    coverHeight: h,
    innerWidth,
    innerHeight,
    textMaxHeight,
    panelMinHeight
  }
}

export function getMemoGradientStyle(gradient) {
  if (gradient === 'white') {
    return 'linear-gradient(to bottom, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.5) 65%, rgba(255,255,255,0) 100%)'
  }
  if (gradient === 'theme') {
    const { bg } = getThemeColors()
    return `linear-gradient(to bottom, ${hexToRgba(bg, 0.92)} 0%, ${hexToRgba(bg, 0.5)} 65%, ${hexToRgba(bg, 0)} 100%)`
  }
  return 'linear-gradient(to bottom, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.42) 65%, rgba(0,0,0,0) 100%)'
}

export function getMemoGradientTextStyle(gradient) {
  if (gradient === 'white') return { color: '#000000' }
  if (gradient === 'theme') return { color: 'var(--color-text)' }
  return { color: '#ffffff' }
}

export function getMemoPanelStyle(gradient) {
  if (gradient === 'white') {
    return { background: 'rgba(255,255,255,0.7)', color: '#000000' }
  }
  if (gradient === 'theme') {
    const { bg, text } = getThemeColors()
    return {
      background: hexToRgba(bg, 0.7),
      color: text
    }
  }
  return { background: 'rgba(0,0,0,0.7)', color: '#ffffff' }
}
