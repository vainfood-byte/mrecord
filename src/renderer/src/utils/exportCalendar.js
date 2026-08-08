/** 탭 화면 PNG/PDF 내보내기 — Electron 캡처 우선, html2canvas는 oklch 안전 처리 */

import { isWeekInMonthGrid, weekStartKey } from './calendarHelpers'
import { resolveAnchoredPosition } from './stickerHelpers'
import { applyFrameClipToCanvas } from './stickerFrame'
import { getThemeColors, hexToRgba } from './colorUtils'
import {
  isExportBackgroundActive,
  waitForExportTick,
  withExportBackground
} from './exportBackground'
import {
  calendarMonthFilename,
  calendarYearFilename,
  downloadDataUrl,
  downloadPngBase64
} from './downloadFile'
import {
  MEMO_GRADIENT_COVER_RATIO,
  MEMO_V2_PANEL_INSET_PX,
  MEMO_V2_PANEL_PAD_PX,
  computeMemoV2LayoutMetrics,
  getMemoExportTextSizePx,
  getMemoPanelStyle
} from './memoTabSettings'
import {
  GALLERY_TITLE_BAR_PX,
  getGalleryCardExportHeight,
  getGalleryCoverExportHeight
} from '../constants/galleryCardSizes'

/** Chromium/Electron canvas 한계 — 초과 시 렌더러 OOM으로 앱이 종료될 수 있음 */
const MAX_CANVAS_EDGE = 8192
const MAX_ELECTRON_CAPTURE_EDGE = 4096
export const CALENDAR_MONTH_EXPORT_WIDTH = 1500
export const CALENDAR_YEAR_EXPORT_WIDTH = 2500
export const RECORD_EXPORT_WIDTH = 1200
const RECORD_CAPTURE_WIDTH = RECORD_EXPORT_WIDTH
const RECORD_EXPORT_TEXT_OFFSET_Y = -5
const CARD_GRID_EXPORT_RADIUS_PX = 12
const MEMO_V1_EXPORT_RADIUS_PX = CARD_GRID_EXPORT_RADIUS_PX
/** 내보내기 제목 2줄 + line-height/padding 여유 (고정 height 대체용 상한 예산) */
const GALLERY_TITLE_BAR_TWO_LINE_PX = Math.ceil(GALLERY_TITLE_BAR_PX * 1.7)
/** 내보내기 전용 작품명 글자 크기 (화면 카드 text-xs와 무관) */
const EXPORT_TITLE_SIZE_STYLES = {
  small: { fontSize: '11px', lineHeight: '1.35' },
  medium: { fontSize: '14px', lineHeight: '1.35' },
  large: { fontSize: '17px', lineHeight: '1.35' }
}

function resolveExportTitleSizeKey(titleSize) {
  if (titleSize === 'small' || titleSize === 'large') return titleSize
  return 'medium'
}

/** options.titleFontSize | options.titleSize | data-export-title-size */
function resolveExportTitleSizeFromOptions(options = {}) {
  return resolveExportTitleSizeKey(options.titleFontSize ?? options.titleSize)
}

function getExportTitleSizeStyle(titleSize) {
  return EXPORT_TITLE_SIZE_STYLES[resolveExportTitleSizeKey(titleSize)]
}

/** text-xs !important 및 클론 경로를 이기도록 인라인 !important로 강제 */
function forceExportTitleTextStyle(el, titleSize) {
  if (!el) return
  const style = getExportTitleSizeStyle(titleSize)
  el.style.setProperty('font-size', style.fontSize, 'important')
  el.style.setProperty('line-height', '1.35', 'important')
  el.style.setProperty('word-break', 'keep-all', 'important')
  el.style.setProperty('overflow-wrap', 'break-word', 'important')
  el.style.setProperty('white-space', 'normal', 'important')
}

/**
 * 내보내기 타이틀 박스만 화면 카드(px-2 py-2, left, leading)와 동기화.
 * 화면 DOM/클래스는 변경하지 않음.
 */
function applyExportTitleBoxScreenSync(titleBar, text, { textAlign = 'left' } = {}) {
  if (titleBar) {
    titleBar.style.display = 'flex'
    titleBar.style.flexDirection = 'column'
    titleBar.style.alignItems = textAlign === 'center' ? 'center' : 'flex-start'
    titleBar.style.justifyContent = 'flex-start'
    titleBar.style.boxSizing = 'border-box'
    titleBar.style.height = 'auto'
    titleBar.style.maxHeight = 'none'
    titleBar.style.minHeight = `${GALLERY_TITLE_BAR_PX}px`
    titleBar.style.overflow = 'visible'
    titleBar.style.setProperty('padding-top', '8px', 'important')
    titleBar.style.setProperty('padding-bottom', '8px', 'important')
    titleBar.style.setProperty('padding-left', '8px', 'important')
    titleBar.style.setProperty('padding-right', '8px', 'important')
    titleBar.style.setProperty('text-align', textAlign, 'important')
    titleBar.style.setProperty('line-height', '1.35', 'important')
    titleBar.style.marginTop = '0'
    titleBar.style.marginBottom = '0'
  }
  if (text) {
    text.style.display = 'block'
    text.style.width = '100%'
    text.style.maxWidth = '100%'
    text.style.height = 'auto'
    text.style.maxHeight = 'none'
    text.style.minHeight = '0'
    text.style.overflow = 'visible'
    text.style.margin = '0'
    text.style.padding = '0'
    text.style.transform = 'none'
    text.style.webkitLineClamp = 'unset'
    text.style.lineClamp = 'unset'
    text.style.webkitBoxOrient = 'unset'
    text.style.setProperty('text-align', textAlign, 'important')
    text.style.setProperty('white-space', 'normal', 'important')
    text.style.setProperty('word-break', 'keep-all', 'important')
    text.style.setProperty('overflow-wrap', 'break-word', 'important')
    text.style.setProperty('line-height', '1.35', 'important')
  }
}

function resolveExportTitleTextAlign(titleBar, text) {
  if (text?.classList?.contains('text-center')) return 'center'
  if (titleBar?.classList?.contains('text-center')) return 'center'
  return 'left'
}

/** 작품명 크기(대)일 때 제목바 최소 높이 — forceExportTitleBarFlexible와 동일 기준 */
function getMemoV1ExportTitleBarHeight(titleSize = 'medium') {
  return resolveExportTitleSizeKey(titleSize) === 'large'
    ? Math.ceil(GALLERY_TITLE_BAR_PX * 1.45)
    : GALLERY_TITLE_BAR_PX
}

function forceExportTitleBarFlexible(titleBar, titleSize) {
  if (!titleBar) return
  const minH = getMemoV1ExportTitleBarHeight(titleSize)
  titleBar.style.height = 'auto'
  titleBar.style.maxHeight = 'none'
  titleBar.style.minHeight = `${minH}px`
  titleBar.style.overflow = 'visible'
  titleBar.style.setProperty('line-height', '1.35', 'important')
}

/** 글래스/레트로 하단 그림자가 overflow에 잘리지 않도록 카드 셀 하단 여백 */
const EXPORT_CARD_SHADOW_PAD_PX = 6
/** 레트로 하드 그림자용 세로 간격/셀 패딩 — html2canvas가 margin을 무시해도 공간 확보 */
const EXPORT_RETRO_SHADOW_GAP_PX = 14
const MEMO_EXPORT_FONT_PX = () => `${getMemoExportTextSizePx()}px`

function getExportCardShadowPadPx() {
  return getLiveUiStyle() === 'retro' ? EXPORT_RETRO_SHADOW_GAP_PX : EXPORT_CARD_SHADOW_PAD_PX
}

/**
 * 레트로 내보내기 래퍼: margin 대신 padding-bottom 으로 그림자 공간 확보
 * content-box → height(본문) + padding(그림자)이 셀 영역에 포함
 */
function applyExportRetroWrapperBottomPad(card, contentHeightPx, padPx) {
  const contentH = Math.max(1, contentHeightPx)
  card.style.boxSizing = 'content-box'
  card.style.height = `${contentH}px`
  card.style.minHeight = `${contentH}px`
  card.style.marginBottom = '0'
  card.style.setProperty('padding-bottom', `${padPx}px`, 'important')
}

/** 윗줄 > 아랫줄 역순 z-index — 레트로 그림자 가림 방지 */
function applyExportCardStackOrder(cards, saved) {
  saved.stackStyles = saved.stackStyles || []
  cards.forEach((card, i) => {
    saved.stackStyles.push({
      el: card,
      position: card.style.position,
      zIndex: card.style.zIndex
    })
    card.style.position = 'relative'
    card.style.zIndex = String(200 - i)
    card.style.setProperty('--export-stack-index', String(i))
  })
}

function restoreExportCardStackOrder(saved) {
  saved?.stackStyles?.forEach(({ el, position, zIndex }) => {
    if (!el) return
    el.style.position = position
    el.style.zIndex = zIndex
    el.style.removeProperty('--export-stack-index')
  })
}
/** 텍스트박스 바깥(표지↔박스) / 안쪽(박스↔텍스트) 여백 — UI와 동일 6px */
const MEMO_V2_EXPORT_BOX_INSET_PX = MEMO_V2_PANEL_INSET_PX
const MEMO_V2_EXPORT_PANEL_PAD_PX = MEMO_V2_PANEL_PAD_PX

function computeMemoV2StructuralMetrics(cardWidth) {
  const w = Math.max(1, Math.round(cardWidth))
  const coverHeight = getGalleryCoverExportHeight(w)
  return computeMemoV2LayoutMetrics(w, coverHeight)
}

function pushMemoLayoutEntry(saved, el, keys) {
  if (!el) return
  saved.memoLayoutStyles = saved.memoLayoutStyles || []
  const entry = { el }
  keys.forEach((key) => {
    entry[key] = el.style[key]
  })
  saved.memoLayoutStyles.push(entry)
}

/** 내보내기 — 표지 가장자리↔텍스트박스 6px, 패널↔텍스트 6px */
function applyMemoV2ExportTextBoxPadding(panel, outerWrap, saved) {
  const inset = `${MEMO_V2_EXPORT_BOX_INSET_PX}px`
  const pad = `${MEMO_V2_EXPORT_PANEL_PAD_PX}px`

  if (outerWrap) {
    pushMemoLayoutEntry(saved, outerWrap, [
      'position',
      'inset',
      'top',
      'right',
      'bottom',
      'left',
      'zIndex',
      'display',
      'padding',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'boxSizing',
      'width',
      'height',
      'alignItems',
      'justifyContent'
    ])
    outerWrap.style.position = 'absolute'
    outerWrap.style.inset = '0'
    outerWrap.style.top = '0'
    outerWrap.style.right = '0'
    outerWrap.style.bottom = '0'
    outerWrap.style.left = '0'
    outerWrap.style.zIndex = '10'
    outerWrap.style.display = 'flex'
    outerWrap.style.alignItems = 'stretch'
    outerWrap.style.justifyContent = 'stretch'
    outerWrap.style.boxSizing = 'border-box'
    outerWrap.style.width = ''
    outerWrap.style.height = ''
    outerWrap.style.padding = inset
    outerWrap.style.paddingTop = inset
    outerWrap.style.paddingRight = inset
    outerWrap.style.paddingBottom = inset
    outerWrap.style.paddingLeft = inset
  }

  if (!panel) return
  pushMemoLayoutEntry(saved, panel, [
    'flex',
    'minHeight',
    'minWidth',
    'width',
    'height',
    'maxWidth',
    'maxHeight',
    'padding',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'boxSizing',
    'display',
    'alignItems',
    'justifyContent',
    'overflow'
  ])
  panel.style.flex = '1'
  panel.style.minWidth = '0'
  panel.style.minHeight = '0'
  panel.style.width = '100%'
  panel.style.height = '100%'
  panel.style.maxWidth = '100%'
  panel.style.maxHeight = '100%'
  panel.style.boxSizing = 'border-box'
  panel.style.display = 'flex'
  panel.style.alignItems = 'center'
  panel.style.justifyContent = 'center'
  panel.style.overflow = 'hidden'
  panel.style.padding = pad
  panel.style.paddingTop = pad
  panel.style.paddingRight = pad
  panel.style.paddingBottom = pad
  panel.style.paddingLeft = pad
}

function setCloneMemoV2ExportTextBoxPadding(clonePanel, cloneOuter) {
  const inset = `${MEMO_V2_EXPORT_BOX_INSET_PX}px`
  const pad = `${MEMO_V2_EXPORT_PANEL_PAD_PX}px`
  if (cloneOuter) {
    cloneOuter.style.position = 'absolute'
    cloneOuter.style.inset = '0'
    cloneOuter.style.top = '0'
    cloneOuter.style.right = '0'
    cloneOuter.style.bottom = '0'
    cloneOuter.style.left = '0'
    cloneOuter.style.zIndex = '10'
    cloneOuter.style.display = 'flex'
    cloneOuter.style.alignItems = 'stretch'
    cloneOuter.style.justifyContent = 'stretch'
    cloneOuter.style.boxSizing = 'border-box'
    cloneOuter.style.width = ''
    cloneOuter.style.height = ''
    cloneOuter.style.padding = inset
    cloneOuter.style.paddingTop = inset
    cloneOuter.style.paddingRight = inset
    cloneOuter.style.paddingBottom = inset
    cloneOuter.style.paddingLeft = inset
  }
  if (!clonePanel) return
  clonePanel.style.flex = '1'
  clonePanel.style.minWidth = '0'
  clonePanel.style.minHeight = '0'
  clonePanel.style.width = '100%'
  clonePanel.style.height = '100%'
  clonePanel.style.maxWidth = '100%'
  clonePanel.style.maxHeight = '100%'
  clonePanel.style.boxSizing = 'border-box'
  clonePanel.style.display = 'flex'
  clonePanel.style.alignItems = 'center'
  clonePanel.style.justifyContent = 'center'
  clonePanel.style.overflow = 'hidden'
  clonePanel.style.padding = pad
  clonePanel.style.paddingTop = pad
  clonePanel.style.paddingRight = pad
  clonePanel.style.paddingBottom = pad
  clonePanel.style.paddingLeft = pad
}

/** -webkit-box는 flex 세로 중앙을 깨뜨려 상하 여백이 어긋남 → block+overflow로 클립 */
function applyMemoV2ExportTextClip(textEl, maxHeightPx) {
  textEl.style.display = 'block'
  textEl.style.webkitBoxOrient = 'unset'
  textEl.style.webkitLineClamp = 'unset'
  textEl.style.lineClamp = 'unset'
  textEl.style.overflow = 'hidden'
  textEl.style.height = 'auto'
  textEl.style.maxHeight = `${Math.max(maxHeightPx, 1)}px`
  textEl.style.whiteSpace = 'pre-wrap'
  textEl.style.wordBreak = 'keep-all'
  textEl.style.textAlign = 'center'
  textEl.style.lineHeight = '1.45'
  textEl.style.margin = '0'
  textEl.style.padding = '0'
}

function applyMemoV2MaintainLayoutSizing(card, cardWidth, saved) {
  const cover = card.querySelector('[data-memo-cover]')
  const panel = card.querySelector('[data-memo-panel]')
  const text = card.querySelector('[data-memo-text]')
  const outerWrap = panel?.parentElement
  if (!cover || !panel || !text) return

  const { coverHeight, textMaxHeight } = computeMemoV2StructuralMetrics(cardWidth)

  pushMemoLayoutEntry(saved, card, ['overflow', 'height', 'minHeight', 'maxHeight'])
  card.style.overflow = 'hidden'

  pushMemoLayoutEntry(saved, cover, [
    'width',
    'height',
    'minHeight',
    'maxHeight',
    'overflow',
    'aspectRatio'
  ])
  cover.style.width = `${cardWidth}px`
  cover.style.aspectRatio = 'auto'
  cover.style.height = `${coverHeight}px`
  cover.style.minHeight = `${coverHeight}px`
  cover.style.maxHeight = `${coverHeight}px`
  cover.style.overflow = 'hidden'

  if (outerWrap) {
    pushMemoLayoutEntry(saved, outerWrap, ['overflow'])
    outerWrap.style.overflow = 'hidden'
  }

  applyMemoV2ExportTextBoxPadding(panel, outerWrap, saved)

  pushMemoLayoutEntry(saved, text, [
    'display',
    'overflow',
    'maxHeight',
    'height',
    'margin',
    'padding',
    'webkitLineClamp',
    'lineClamp',
    'webkitBoxOrient',
    'whiteSpace',
    'wordBreak',
    'textAlign',
    'lineHeight'
  ])
  applyMemoV2ExportTextClip(text, textMaxHeight)
}

function computeSafeScale(width, height, preferred = 2) {
  let scale = preferred
  while (scale > 0.5 && (width * scale > MAX_CANVAS_EDGE || height * scale > MAX_CANVAS_EDGE)) {
    scale -= 0.25
  }
  return Math.max(0.5, scale)
}

function yieldToMain() {
  if (isExportBackgroundActive()) {
    return waitForExportTick(16)
  }
  return new Promise((resolve) => {
    setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    }, 0)
  })
}

async function waitForExportFrame() {
  if (isExportBackgroundActive()) {
    await waitForExportTick(32)
    return
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

async function notifyProgress(onProgress, payload) {
  await onProgress?.(payload)
  await yieldToMain()
}

function assertCanvasDimensions(width, height) {
  if (width > MAX_CANVAS_EDGE || height > MAX_CANVAS_EDGE) {
    throw new Error(
      '내보내기 이미지가 너무 큽니다. 작품 수를 줄이거나 카드 크기를 줄여 주세요.'
    )
  }
}

const COLOR_PROPS = new Set([
  'color',
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'outlineColor',
  'textDecorationColor',
  'columnRuleColor',
  'caretColor'
])

const INLINE_PROPS = [
  ...COLOR_PROPS,
  'borderWidth',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'fontSize',
  'fontWeight',
  'fontFamily',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'textDecoration',
  'whiteSpace',
  'wordBreak',
  'display',
  'position',
  'top',
  'left',
  'right',
  'bottom',
  'zIndex',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'boxSizing',
  'overflow',
  'overflowX',
  'overflowY',
  'flex',
  'flexDirection',
  'flexWrap',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignItems',
  'alignSelf',
  'justifyContent',
  'justifyItems',
  'gap',
  'rowGap',
  'columnGap',
  'gridTemplateColumns',
  'gridTemplateRows',
  'gridColumn',
  'gridRow',
  'gridAutoFlow',
  'opacity',
  'visibility',
  'objectFit',
  'objectPosition',
  'aspectRatio',
  'verticalAlign',
  'tableLayout',
  'borderCollapse',
  'borderSpacing',
  /* glass/retro 카드 그림자 — 스타일시트 제거 후에도 캡처 반영 */
  'boxShadow'
]

let colorProbeEl = null

function getColorProbe() {
  if (!colorProbeEl) {
    colorProbeEl = document.createElement('span')
    colorProbeEl.style.display = 'none'
    document.body.appendChild(colorProbeEl)
  }
  return colorProbeEl
}

function parseCssAlphaToken(token) {
  if (token == null || token === '') return 1
  const t = String(token).trim()
  if (t.endsWith('%')) return Math.max(0, Math.min(1, parseFloat(t) / 100))
  const n = parseFloat(t)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1
}

function formatClassicRgba(r, g, b, a = 1) {
  const rr = Math.max(0, Math.min(255, Math.round(Number(r) || 0)))
  const gg = Math.max(0, Math.min(255, Math.round(Number(g) || 0)))
  const bb = Math.max(0, Math.min(255, Math.round(Number(b) || 0)))
  const aa = Number(a)
  if (!Number.isFinite(aa) || aa >= 0.999) return `rgb(${rr}, ${gg}, ${bb})`
  const alpha = Math.round(aa * 1000) / 1000
  return `rgba(${rr}, ${gg}, ${bb}, ${alpha})`
}

/** html2canvas는 `rgb(r g b / a)`·color-mix를 못 파싱 → 콤마 rgba로 정규화 */
function toClassicCssColor(value) {
  const s = String(value || '').trim()
  if (!s || s === 'none' || s === 'transparent' || s === 'currentcolor') return s

  if (/^#[0-9a-f]{8}$/i.test(s)) {
    return formatClassicRgba(
      parseInt(s.slice(1, 3), 16),
      parseInt(s.slice(3, 5), 16),
      parseInt(s.slice(5, 7), 16),
      parseInt(s.slice(7, 9), 16) / 255
    )
  }
  if (/^#[0-9a-f]{4}$/i.test(s)) {
    const r = parseInt(s[1] + s[1], 16)
    const g = parseInt(s[2] + s[2], 16)
    const b = parseInt(s[3] + s[3], 16)
    const a = parseInt(s[4] + s[4], 16) / 255
    return formatClassicRgba(r, g, b, a)
  }
  if (/^#[0-9a-f]{3,6}$/i.test(s)) return s

  let m = s.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+%?))?\s*\)$/i
  )
  if (m) return formatClassicRgba(m[1], m[2], m[3], m[4] !== undefined ? parseCssAlphaToken(m[4]) : 1)

  m = s.match(/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i)
  if (m) return formatClassicRgba(m[1], m[2], m[3], m[4] !== undefined ? parseCssAlphaToken(m[4]) : 1)

  return null
}

function isSimpleCssColor(val) {
  const s = String(val || '').trim()
  if (!s || s === 'none' || s === 'transparent' || s === 'currentcolor') return true
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return true
  if (/^rgba?\(/i.test(s)) return true
  return false
}

function isUnsafeCssColor(val) {
  const s = String(val || '').toLowerCase()
  if (isSimpleCssColor(val)) return false
  return (
    s.includes('oklab') ||
    s.includes('oklch') ||
    s.includes('color-mix') ||
    /\bcolor\s*\(/.test(s) ||
    /\blab\s*\(/.test(s) ||
    /\blch\s*\(/.test(s) ||
    /\bhwb\s*\(/.test(s) ||
    s.includes('var(')
  )
}

function toSafeCssColor(value, prop = 'color') {
  const raw = String(value || '').trim()
  if (!raw || raw === 'none' || raw === 'transparent') return raw

  const classic = toClassicCssColor(raw)
  if (classic) return classic

  if (!isUnsafeCssColor(raw)) {
    return raw
  }

  try {
    const probe = getColorProbe()
    probe.style.cssText = ''
    if (COLOR_PROPS.has(prop)) {
      probe.style[prop] = raw
      const resolved = getComputedStyle(probe)[prop]
      const normalized = toClassicCssColor(resolved)
      if (normalized) return normalized
      if (resolved && isSimpleCssColor(resolved)) return resolved
      if (resolved && !isUnsafeCssColor(resolved)) return resolved
    }
    if (prop.includes('background')) {
      probe.style.backgroundColor = raw
      const resolved = getComputedStyle(probe).backgroundColor
      const normalized = toClassicCssColor(resolved)
      if (normalized) return normalized
      if (resolved && isSimpleCssColor(resolved)) return resolved
      if (resolved && !isUnsafeCssColor(resolved)) return resolved
    }
    probe.style.color = raw
    const resolved = getComputedStyle(probe).color
    const normalized = toClassicCssColor(resolved)
    if (normalized) return normalized
    if (resolved && isSimpleCssColor(resolved)) return resolved
    if (resolved && !isUnsafeCssColor(resolved)) return resolved
  } catch {
    // fall through
  }

  if (prop.includes('background')) return '#ffffff'
  if (prop.includes('border') || prop.includes('outline')) return '#e8e2d6'
  return '#745039'
}

/** V2 텍스트박스 — UI와 동일한 0.7 알파 배경을 내보내기용 classic rgba로 고정 */
function applyMemoV2PanelExportBackground(panel, origPanel) {
  if (!panel) return
  const source = origPanel || panel
  const colorMode =
    panel.getAttribute('data-memo-color') ||
    source.getAttribute('data-memo-color') ||
    'black'
  const preset = getMemoPanelStyle(colorMode)
  let safeBg = toSafeCssColor(preset.background, 'backgroundColor') || preset.background

  const computedRaw = getComputedStyle(source).backgroundColor
  const computed =
    toClassicCssColor(computedRaw) || toSafeCssColor(computedRaw, 'backgroundColor')
  const m =
    computed &&
    String(computed).match(
      /^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i
    )
  if (m) {
    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1
    if (alpha > 0.05 && alpha < 0.999) {
      safeBg = formatClassicRgba(m[1], m[2], m[3], alpha)
    } else if (alpha >= 0.999) {
      // html2canvas/computed에서 알파가 유실된 경우 UI 기본 0.7 복원
      safeBg = formatClassicRgba(m[1], m[2], m[3], 0.7)
    }
  }

  panel.style.background = 'none'
  panel.style.backgroundImage = 'none'
  panel.style.backgroundColor = safeBg
  /* shadow-sm → html2canvas 안쪽 테두리 잔상 방지 (패딩/크기는 유지) */
  panel.style.setProperty('box-shadow', 'none', 'important')
  panel.style.setProperty('border', 'none', 'important')
  panel.style.setProperty('outline', 'none', 'important')
  if (preset.color && !panel.style.color) {
    panel.style.color = toSafeCssColor(preset.color, 'color') || preset.color
  }
}

function getLiveUiStyle() {
  const raw = document.documentElement.getAttribute('data-ui-style')
  return raw === 'glass' || raw === 'retro' ? raw : 'default'
}

/** 내보내기 캡처 래퍼/클론에 현재 UI 스타일(data-ui-style) 주입 */
function injectExportUiStyleAttr(target, uiStyle = getLiveUiStyle()) {
  if (!target) return
  target.setAttribute('data-ui-style', uiStyle)
}

/** retro는 직각(0), glass/default는 기존 내보내기 라운드 유지 */
function getExportCardRadiusPx() {
  return getLiveUiStyle() === 'retro' ? 0 : CARD_GRID_EXPORT_RADIUS_PX
}

function copySafeThemeVars(clonedDoc) {
  const src = document.documentElement
  const dst = clonedDoc.documentElement
  injectExportUiStyleAttr(dst)
  const styles = getComputedStyle(src)
  for (let i = 0; i < styles.length; i++) {
    const prop = styles[i]
    if (!prop.startsWith('--')) continue
    const val = styles.getPropertyValue(prop).trim()
    if (!val) continue
    dst.style.setProperty(
      prop,
      isUnsafeCssColor(val) ? toSafeCssColor(val, 'backgroundColor') : val
    )
  }
  dst.style.backgroundColor = toSafeCssColor(getComputedStyle(src).backgroundColor, 'backgroundColor')
  dst.style.color = toSafeCssColor(getComputedStyle(src).color, 'color')
}

/**
 * glass/retro: 라이브 카드에 적용된 computed 테두리·그림자·라운드를
 * 인라인으로 고정해 Electron/html2canvas 캡처에 동일하게 남긴다.
 * retro는 직각 프레임/그림자를 !important 로 강제 (둥근 크롬 덮어쓰기 방지)
 */
/** 내보내기 캡처 전용 — box-shadow 대신 비대칭 border로 레트로 직각 그림자 재현 */
function applyExportRetroPseudoBorder(el, borderColor) {
  if (!el) return
  const c = borderColor || '#E8E2D6'
  el.style.setProperty('border-radius', '0px', 'important')
  el.style.setProperty('border-top-left-radius', '0px', 'important')
  el.style.setProperty('border-top-right-radius', '0px', 'important')
  el.style.setProperty('border-bottom-left-radius', '0px', 'important')
  el.style.setProperty('border-bottom-right-radius', '0px', 'important')
  el.style.setProperty('box-shadow', 'none', 'important')
  el.style.setProperty('border-top', `2px solid ${c}`, 'important')
  el.style.setProperty('border-left', `2px solid ${c}`, 'important')
  el.style.setProperty('border-right', `5px solid ${c}`, 'important')
  el.style.setProperty('border-bottom', `5px solid ${c}`, 'important')
  el.style.setProperty('outline', 'none', 'important')
}

function bakeExportUiStyleChromeOnLiveCards(root, saved) {
  if (!root) return
  const uiStyle = getLiveUiStyle()
  injectExportUiStyleAttr(root)
  if (uiStyle === 'default') return

  const radius = `${getExportCardRadiusPx()}px`
  root
    .querySelectorAll('[data-gallery-card-export], [data-memo-card-export], [data-tag-block]')
    .forEach((card) => {
      const cs = getComputedStyle(card)
      pushCardChromeStyle(saved, card, [
        'borderRadius',
        'borderTopLeftRadius',
        'borderTopRightRadius',
        'borderBottomLeftRadius',
        'borderBottomRightRadius',
        'boxShadow',
        'border',
        'borderTop',
        'borderRight',
        'borderBottom',
        'borderLeft',
        'borderWidth',
        'borderStyle',
        'borderColor',
        'backgroundColor',
        'overflow',
        'boxSizing',
        'backdropFilter',
        'webkitBackdropFilter'
      ])

      card.style.boxSizing = 'border-box'

      const bg = toSafeCssColor(cs.backgroundColor, 'backgroundColor')
      if (bg) card.style.backgroundColor = bg

      const borderColor =
        toSafeCssColor(cs.borderTopColor, 'borderColor') ||
        toSafeCssColor(
          getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() ||
            getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim(),
          'borderColor'
        ) ||
        '#E8E2D6'

      if (uiStyle === 'retro') {
        applyExportRetroPseudoBorder(card, borderColor)
        /* 표지가 비대칭 border 밖으로 삐지지 않게 클립 (그림자 없음 → visible 불필요) */
        card.style.setProperty('overflow', 'hidden', 'important')
      } else {
        if (cs.borderTopWidth && cs.borderTopWidth !== '0px') {
          card.style.borderStyle = cs.borderTopStyle || 'solid'
          card.style.borderWidth = cs.borderTopWidth
          if (borderColor) card.style.borderColor = borderColor
        }
        card.style.borderRadius = radius
        /*
         * glass inset box-shadow → html2canvas가 작품명 옆 굵은 흰 틀로 그림.
         * 내보내기에서는 제거(화면 UI 글래스 하이라이트는 CSS 그대로).
         */
        if (uiStyle === 'glass') {
          card.style.setProperty('box-shadow', 'none', 'important')
          card.style.setProperty('-webkit-backdrop-filter', 'none', 'important')
          card.style.setProperty('backdrop-filter', 'none', 'important')
          if (borderColor) {
            card.style.setProperty('border', `1px solid ${borderColor}`, 'important')
          }
        } else if (cs.boxShadow && cs.boxShadow !== 'none') {
          card.style.boxShadow = cs.boxShadow
        }
      }

      if (uiStyle !== 'retro') return

      card
        .querySelectorAll(
          '[data-gallery-cover], [data-memo-cover], [data-gallery-title-bar], [data-memo-title-bar]'
        )
        .forEach((el) => {
          pushCardChromeStyle(saved, el, [
            'borderRadius',
            'borderTopLeftRadius',
            'borderTopRightRadius',
            'borderBottomLeftRadius',
            'borderBottomRightRadius',
            'marginTop',
            'marginBottom',
            'paddingTop',
            'top'
          ])
          el.style.setProperty('border-radius', '0px', 'important')
          el.style.marginTop = '0'
          el.style.marginBottom = '0'
          el.style.paddingTop = '0'
          el.style.top = '0'
        })

      /* 표지 들뜸 방지 — inline gap / 음수 마진 제거 */
      card.querySelectorAll('[data-gallery-cover] img, [data-memo-cover] img').forEach((img) => {
        pushCardChromeStyle(saved, img, [
          'display',
          'marginTop',
          'marginBottom',
          'marginLeft',
          'marginRight',
          'paddingTop',
          'paddingBottom',
          'top',
          'verticalAlign'
        ])
        img.style.setProperty('display', 'block', 'important')
        img.style.setProperty('box-sizing', 'border-box', 'important')
        img.style.setProperty('width', '100%', 'important')
        img.style.setProperty('max-width', '100%', 'important')
        img.style.margin = '0'
        img.style.padding = '0'
        img.style.top = '0'
        img.style.left = '0'
        img.style.verticalAlign = 'top'
      })
      card.querySelectorAll('[data-gallery-cover], [data-memo-cover]').forEach((cover) => {
        pushCardChromeStyle(saved, cover, [
          'width',
          'maxWidth',
          'boxSizing',
          'overflow',
          'marginLeft',
          'marginRight',
          'paddingLeft',
          'paddingRight',
          'left'
        ])
        cover.style.setProperty('box-sizing', 'border-box', 'important')
        cover.style.setProperty('width', '100%', 'important')
        cover.style.setProperty('max-width', '100%', 'important')
        cover.style.setProperty('overflow', 'hidden', 'important')
        cover.style.marginLeft = '0'
        cover.style.marginRight = '0'
        cover.style.paddingLeft = '0'
        cover.style.paddingRight = '0'
        cover.style.left = '0'
      })
    })
}

/**
 * html2canvas 클론: 스타일시트 제거·크롬 보정 이후에도 glass/retro 외형을 소스에서 재동기화
 */
function syncExportCardUiChrome(sourceCard, clonedCard) {
  if (!sourceCard || !clonedCard) return
  const uiStyle = getLiveUiStyle()
  if (uiStyle === 'default') return

  const cs = getComputedStyle(sourceCard)
  const bg = toSafeCssColor(cs.backgroundColor, 'backgroundColor')
  if (bg) clonedCard.style.backgroundColor = bg

  const borderColor =
    toSafeCssColor(cs.borderTopColor, 'borderColor') ||
    toSafeCssColor(
      getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() ||
        getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim(),
      'borderColor'
    ) ||
    '#E8E2D6'

  clonedCard.style.boxSizing = 'border-box'

  if (uiStyle === 'retro') {
    applyExportRetroPseudoBorder(clonedCard, borderColor)
    clonedCard.style.setProperty('overflow', 'hidden', 'important')
  } else {
    if (cs.borderTopWidth && cs.borderTopWidth !== '0px') {
      clonedCard.style.borderStyle = cs.borderTopStyle || 'solid'
      clonedCard.style.borderWidth = cs.borderTopWidth
      if (borderColor) clonedCard.style.borderColor = borderColor
    }
    clonedCard.style.borderRadius = `${getExportCardRadiusPx()}px`
    if (uiStyle === 'glass') {
      clonedCard.style.setProperty('box-shadow', 'none', 'important')
      clonedCard.style.setProperty('-webkit-backdrop-filter', 'none', 'important')
      clonedCard.style.setProperty('backdrop-filter', 'none', 'important')
      if (borderColor) {
        clonedCard.style.setProperty('border', `1px solid ${borderColor}`, 'important')
      }
    } else if (cs.boxShadow && cs.boxShadow !== 'none') {
      clonedCard.style.boxShadow = cs.boxShadow
    }
  }

  if (uiStyle !== 'retro') return

  clonedCard
    .querySelectorAll(
      '[data-gallery-cover], [data-memo-cover], [data-gallery-title-bar], [data-memo-title-bar]'
    )
    .forEach((el) => {
      el.style.setProperty('border-radius', '0px', 'important')
      el.style.marginTop = '0'
      el.style.marginBottom = '0'
      el.style.paddingTop = '0'
      el.style.top = '0'
      el.style.left = '0'
    })
  clonedCard.querySelectorAll('[data-gallery-cover], [data-memo-cover]').forEach((cover) => {
    cover.style.setProperty('box-sizing', 'border-box', 'important')
    cover.style.setProperty('width', '100%', 'important')
    cover.style.setProperty('max-width', '100%', 'important')
    cover.style.setProperty('overflow', 'hidden', 'important')
    cover.style.marginLeft = '0'
    cover.style.marginRight = '0'
    cover.style.paddingLeft = '0'
    cover.style.paddingRight = '0'
  })
  clonedCard.querySelectorAll('[data-gallery-cover] img, [data-memo-cover] img').forEach((img) => {
    img.style.setProperty('display', 'block', 'important')
    img.style.setProperty('box-sizing', 'border-box', 'important')
    img.style.setProperty('width', '100%', 'important')
    img.style.setProperty('max-width', '100%', 'important')
    img.style.margin = '0'
    img.style.padding = '0'
    img.style.top = '0'
    img.style.left = '0'
    img.style.verticalAlign = 'top'
  })
}

function stripStylesheets(clonedDoc) {
  clonedDoc.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => node.remove())
}

function stripClassNames(clonedRoot) {
  clonedRoot.removeAttribute('class')
  clonedRoot.querySelectorAll('[class]').forEach((el) => el.removeAttribute('class'))
}

function getVisualEffects(orig) {
  const cs = getComputedStyle(orig)
  const filter = cs.filter && cs.filter !== 'none' ? cs.filter : ''
  const transform = cs.transform && cs.transform !== 'none' ? cs.transform : ''
  return { filter, transform }
}

function inlineSafeComputedStyles(sourceRoot, clonedRoot) {
  const origEls = [sourceRoot, ...sourceRoot.querySelectorAll('*')]
  const cloneEls = [clonedRoot, ...clonedRoot.querySelectorAll('*')]

  cloneEls.forEach((el, i) => {
    const orig = origEls[i]
    if (!orig || !el) return
    const cs = getComputedStyle(orig)
    const { filter: blurFilter, transform } = getVisualEffects(orig)

    INLINE_PROPS.forEach((p) => {
      const val = cs[p]
      if (!val || val === 'auto' || val === 'normal') return
      if (COLOR_PROPS.has(p)) {
        if (p === 'backgroundColor' && val.includes('gradient')) return
        el.style[p] = toSafeCssColor(val, p)
        return
      }
      if (isUnsafeCssColor(val)) {
        return
      }
      el.style[p] = val
    })

    el.style.backdropFilter = 'none'
    el.style.webkitBackdropFilter = 'none'
    el.style.backgroundImage = 'none'
    el.style.filter = blurFilter || 'none'
    if (transform) el.style.transform = transform
  })
}

function clearUnsafeInlineStyles(clonedRoot) {
  clonedRoot.querySelectorAll('[style]').forEach((el) => {
    const attr = el.getAttribute('style') || ''
    if (isUnsafeCssColor(attr) || /var\s*\(/.test(attr)) {
      el.removeAttribute('style')
    }
  })
}

function sanitizeClonedColors(clonedRoot) {
  if (!clonedRoot) return
  const els = [clonedRoot, ...clonedRoot.querySelectorAll('*')]
  for (const el of els) {
    if (!el?.style) continue
    for (let i = el.style.length - 1; i >= 0; i--) {
      const prop = el.style[i]
      const val = el.style.getPropertyValue(prop)
      if (!val || !isUnsafeCssColor(val)) continue
      el.style.setProperty(prop, toSafeCssColor(val, prop))
    }
  }
}

function elementFitsViewport(element) {
  const rect = element.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return false
  if (
    rect.width > MAX_ELECTRON_CAPTURE_EDGE ||
    rect.height > MAX_ELECTRON_CAPTURE_EDGE
  ) {
    return false
  }
  const margin = 2
  return (
    rect.top >= -margin &&
    rect.left >= -margin &&
    rect.bottom <= window.innerHeight + margin &&
    rect.right <= window.innerWidth + margin
  )
}

async function scrollExportRootIntoView(element) {
  if (!element) return
  element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
  await waitForExportFrame()
}

function fixCalendarExportClone(sourceEl, clonedRoot) {
  if (!sourceEl?.hasAttribute('data-calendar-export-root') || !clonedRoot) return

  const applyGrid7 = (orig, clone) => {
    if (!orig || !clone) return
    const cs = getComputedStyle(orig)
    clone.style.display = 'grid'
    clone.style.gridTemplateColumns = cs.gridTemplateColumns || 'repeat(7, minmax(0, 1fr))'
    clone.style.gridTemplateRows = cs.gridTemplateRows || 'none'
    clone.style.gap = cs.gap && cs.gap !== 'normal' ? cs.gap : '0px'
    clone.style.width = '100%'
    clone.style.boxSizing = 'border-box'
  }

  const rootCs = getComputedStyle(sourceEl)
  clonedRoot.style.width = rootCs.width
  clonedRoot.style.minWidth = rootCs.minWidth || rootCs.width
  clonedRoot.style.height = rootCs.height
  clonedRoot.style.minHeight = rootCs.minHeight || rootCs.height
  clonedRoot.style.boxSizing = 'border-box'
  clonedRoot.style.overflow = 'visible'
  clonedRoot.style.flex = 'none'
  if (sourceEl.style.zoom) clonedRoot.style.zoom = sourceEl.style.zoom

  applyGrid7(
    sourceEl.querySelector('[data-calendar-daynames]'),
    clonedRoot.querySelector('[data-calendar-daynames]')
  )

  const scrollBodyOrig = sourceEl.querySelector('[data-calendar-scroll-body]')
  const scrollBodyClone = clonedRoot.querySelector('[data-calendar-scroll-body]')
  if (scrollBodyOrig && scrollBodyClone) {
    scrollBodyClone.style.width = '100%'
    scrollBodyClone.style.boxSizing = 'border-box'
  }

  const origWeeks = sourceEl.querySelectorAll('[data-calendar-week]')
  clonedRoot.querySelectorAll('[data-calendar-week]').forEach((cloneWeek, i) => {
    if (cloneWeek.style.display === 'none') return
    const origWeek = origWeeks[i]
    applyGrid7(origWeek, cloneWeek)
    if (origWeek) {
      const weekCs = getComputedStyle(origWeek)
      cloneWeek.style.flex = 'none'
      cloneWeek.style.height = weekCs.height
      cloneWeek.style.minHeight = weekCs.height
    }
  })

  const origCells = sourceEl.querySelectorAll('[data-calendar-cell]')
  clonedRoot.querySelectorAll('[data-calendar-cell]').forEach((cell, i) => {
    const orig = origCells[i]
    if (!orig) return
    const cs = getComputedStyle(orig)
    cell.style.minWidth = '0'
    cell.style.width = 'auto'
    cell.style.boxSizing = 'border-box'
    cell.style.height = cs.height
    cell.style.minHeight = cs.minHeight
    cell.style.overflow = 'hidden'
  })

  const syncNode = (selector, patch) => {
    const orig = sourceEl.querySelector(selector)
    const clone = clonedRoot.querySelector(selector)
    if (!orig || !clone) return
    patch(orig, clone)
  }

  syncNode('[data-calendar-header]', (orig, clone) => {
    const cs = getComputedStyle(orig)
    clone.style.overflow = 'visible'
    clone.style.paddingTop = `${(parseFloat(cs.paddingTop) || 0) + 2}px`
    clone.querySelectorAll('h2, button').forEach((child) => {
      child.style.overflow = 'visible'
      child.style.lineHeight = '1.35'
    })
  })

  syncNode('[data-calendar-daynames]', (_, clone) => {
    clone.style.overflow = 'visible'
  })

  syncNode('[data-calendar-viewport]', (orig, clone) => {
    const cs = getComputedStyle(orig)
    clone.style.overflow = 'hidden'
    clone.style.width = '100%'
    clone.style.boxSizing = 'border-box'
    clone.style.flex = 'none'
    clone.style.height = cs.height
    clone.style.minHeight = cs.height
    clone.style.maxHeight = cs.height
  })

  syncNode('[data-calendar-scroll-body]', (orig, clone) => {
    const cs = getComputedStyle(orig)
    clone.style.overflow = 'hidden'
    clone.style.width = '100%'
    clone.style.boxSizing = 'border-box'
    clone.style.display = 'flex'
    clone.style.flexDirection = 'column'
    clone.style.height = cs.height
    clone.style.minHeight = cs.height
  })

  fixCalendarDayCoverImages(sourceEl, clonedRoot)
}

function fixCalendarDayCoverImages(sourceEl, clonedRoot) {
  const origCells = sourceEl.querySelectorAll('[data-calendar-cell]')
  clonedRoot.querySelectorAll('[data-calendar-cell]').forEach((cloneCell, i) => {
    const origCell = origCells[i]
    if (!origCell) return

    const origImg = origCell.querySelector('img[data-calendar-day-cover], img[data-cover-url]')
    const cloneImg = cloneCell.querySelector('img[data-calendar-day-cover], img[data-cover-url]')
    if (origImg && cloneImg) {
      const coverUrl = origImg.getAttribute('data-cover-url') || origImg.getAttribute('src') || origImg.src
      if (coverUrl && !origImg.src) origImg.src = coverUrl

      let baked = bakeImageToDisplayRect(origImg)
      if (!baked && coverUrl) baked = coverUrl
      if (baked) {
        cloneImg.src = baked
        cloneImg.style.position = 'absolute'
        cloneImg.style.inset = '0'
        cloneImg.style.width = '100%'
        cloneImg.style.height = '100%'
        cloneImg.style.objectFit = 'cover'
        cloneImg.style.pointerEvents = 'none'
      }
    }

    const origPlaceholder = origCell.querySelector('[data-calendar-day-cover-color]')
    const clonePlaceholder = cloneCell.querySelector('[data-calendar-day-cover-color]')
    if (origPlaceholder && clonePlaceholder) {
      const cs = getComputedStyle(origPlaceholder)
      clonePlaceholder.style.backgroundColor = cs.backgroundColor
      clonePlaceholder.style.color = cs.color
    }
  })
}

function readCalendarExportFill(element) {
  const bg = element ? getComputedStyle(element).backgroundColor : ''
  return toSafeCssColor(bg, 'backgroundColor') || '#ffffff'
}

function readThemeBgColor() {
  if (typeof document === 'undefined') return '#E6E1D3'
  const fromVar = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()
  if (fromVar) return toSafeCssColor(fromVar, 'backgroundColor') || fromVar
  return getThemeColors()?.bg || '#E6E1D3'
}

function scaleCanvasToWidth(canvas, targetWidth) {
  if (!canvas || canvas.width < 1 || targetWidth < 1) return canvas
  if (canvas.width === targetWidth) return canvas
  const out = document.createElement('canvas')
  out.width = targetWidth
  out.height = Math.max(1, Math.round((canvas.height * targetWidth) / canvas.width))
  const ctx = out.getContext('2d')
  ctx.drawImage(canvas, 0, 0, out.width, out.height)
  return out
}

function padCanvasToFixedSize(canvas, targetWidth, targetHeight, fill) {
  if (!canvas || targetWidth < 1 || targetHeight < 1) return canvas
  if (canvas.width === targetWidth && canvas.height === targetHeight) return canvas

  const out = document.createElement('canvas')
  out.width = targetWidth
  out.height = targetHeight
  const ctx = out.getContext('2d')
  ctx.fillStyle = fill || readThemeBgColor()
  ctx.fillRect(0, 0, targetWidth, targetHeight)

  const drawW = Math.min(canvas.width, targetWidth)
  const drawH = Math.min(canvas.height, targetHeight)
  ctx.drawImage(canvas, 0, 0, drawW, drawH)
  return out
}

function normalizeCalendarExportCanvas(canvas, targetW, targetH, fill = '#ffffff') {
  if (canvas.width === targetW && canvas.height === targetH) return canvas

  const out = document.createElement('canvas')
  out.width = targetW
  out.height = targetH
  const ctx = out.getContext('2d')
  ctx.fillStyle = fill
  ctx.fillRect(0, 0, targetW, targetH)

  const scale = Math.min(targetW / canvas.width, targetH / canvas.height)
  const dw = Math.round(canvas.width * scale)
  const dh = Math.round(canvas.height * scale)
  const dx = Math.floor((targetW - dw) / 2)
  ctx.drawImage(canvas, dx, 0, dw, dh)
  return out
}

function elementWithinCaptureLimits(element) {
  const { width, height } = getExportElementSize(element)
  return width <= MAX_ELECTRON_CAPTURE_EDGE && height <= MAX_ELECTRON_CAPTURE_EDGE
}

/** 분할 내보내기는 기본 html2canvas — 잠금 시 CSS blur를 Electron 네이티브 캡처로 처리 */
function canTryElectronCapture(element, exportOptions = {}) {
  if (!window.mrecord?.capturePageRect) return false
  if (!elementWithinCaptureLimits(element)) return false
  // 기록 목록: 뷰포트 밖 scrollHeight 영역이 Electron 캡처에서 잘리므로 html2canvas 우선
  // (잠금 모드만 blur 보존을 위해 Electron 허용 — 단 뷰포트에 완전 수용될 때)
  if (exportOptions.recordSplitExport === true) {
    if (exportOptions.lockExport === true) return elementFitsViewport(element)
    return false
  }
  /*
   * 갤러리/메모 10×10 분할: Electron capturePage는 뷰포트 픽셀만 찍어
   * applyTenByTen 타일 레이아웃이 깨지고 "현재 화면 캡처"처럼 나옴.
   * 잠금·표지숨기기 블러는 html2canvas 전 bake로 처리.
   */
  if (exportOptions.splitPageCapture === true && isCardGridExportRoot(element)) {
    return false
  }
  if (exportOptions.splitPageCapture !== true) return true
  return exportOptions.lockExport === true
}

function getExportElementSize(element) {
  if (element.hasAttribute('data-calendar-export-root')) {
    const rect = element.getBoundingClientRect()
    return {
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height))
    }
  }

  if (element.hasAttribute('data-record-export-root')) {
    return measureRecordExportSize(element)
  }

  return {
    width: Math.max(element.scrollWidth, element.offsetWidth, 1),
    height: Math.max(element.scrollHeight, element.offsetHeight, 1)
  }
}

function measureRecordExportSize(root) {
  const table = root?.querySelector('table')
  const rows = getRecordExportRows(root)
  const thead = table?.querySelector('thead')
  const tbody = table?.querySelector('tbody')
  const headerH = thead ? Math.ceil(thead.getBoundingClientRect().height) : 36
  const width = RECORD_CAPTURE_WIDTH

  finalizeRecordExportRowLayout(root)

  let bodyH = 0
  if (tbody) {
    bodyH = Math.max(
      Math.ceil(tbody.scrollHeight),
      Math.ceil(tbody.getBoundingClientRect().height),
      Math.ceil(tbody.offsetHeight)
    )
  }
  if (rows.length) {
    const rowSum = rows.reduce(
      (sum, row) => sum + Math.max(1, Math.ceil(row.getBoundingClientRect().height)),
      0
    )
    bodyH = Math.max(bodyH, rowSum)
  }
  if (!bodyH) {
    bodyH = RECORD_SPLIT_EXPORT_ROW_HEIGHT
  }

  const tableH = table
    ? Math.max(
        Math.ceil(table.scrollHeight),
        Math.ceil(table.offsetHeight),
        headerH + bodyH
      )
    : headerH + bodyH
  const rootScrollH = root
    ? Math.max(Math.ceil(root.scrollHeight), Math.ceil(root.offsetHeight))
    : 0
  const height = Math.max(1, headerH + bodyH + 2, tableH + 2, rootScrollH)
  return { width, height }
}

function finalizeRecordExportRowLayout(root) {
  if (!root) return

  const table = root.querySelector('table')
  if (table) {
    table.style.height = 'auto'
    table.style.maxHeight = 'none'
  }

  getRecordExportRows(root).forEach((row) => {
    row.style.height = 'auto'
    row.style.maxHeight = 'none'
    row.style.overflow = 'visible'
  })

  root.querySelectorAll('[data-record-title-col], [data-record-oneline-col]').forEach((cell) => {
    cell.style.height = 'auto'
    cell.style.maxHeight = 'none'
    cell.style.overflow = 'visible'
    cell.style.verticalAlign = 'top'
  })
}

function prepareRecordSplitPageLayout(root, saved) {
  if (!root?.hasAttribute('data-record-export-root')) return
  saved.recordSplitScrollTop = root.scrollTop
  root.scrollTop = 0

  const { height: measuredH } = measureRecordExportSize(root)
  const fullHeight = Math.max(
    measuredH,
    Math.ceil(root.scrollHeight),
    Math.ceil(root.offsetHeight)
  )

  saved.recordSplitLayout = {
    el: root,
    width: root.style.width,
    minWidth: root.style.minWidth,
    height: root.style.height,
    minHeight: root.style.minHeight,
    maxHeight: root.style.maxHeight,
    overflow: root.style.overflow,
    overflowX: root.style.overflowX,
    overflowY: root.style.overflowY
  }
  root.style.width = `${RECORD_CAPTURE_WIDTH}px`
  root.style.minWidth = `${RECORD_CAPTURE_WIDTH}px`
  root.style.height = `${fullHeight}px`
  root.style.minHeight = `${fullHeight}px`
  root.style.maxHeight = 'none'
  root.style.overflow = 'visible'
  root.style.overflowX = 'hidden'
  root.style.overflowY = 'visible'

  // 상위 스크롤 컨테이너가 뷰포트로 자르지 않도록 전체 높이로 확장
  saved.recordSplitScrollAncestors = []
  findScrollableAncestors(root).forEach((node) => {
    saved.recordSplitScrollAncestors.push({
      el: node,
      scrollTop: node.scrollTop,
      height: node.style.height,
      maxHeight: node.style.maxHeight,
      overflow: node.style.overflow,
      overflowY: node.style.overflowY
    })
    node.scrollTop = 0
    node.style.maxHeight = 'none'
    node.style.overflow = 'visible'
    node.style.overflowY = 'visible'
    node.style.height = `${Math.max(node.scrollHeight, fullHeight + 32)}px`
  })
}

function restoreRecordSplitPageLayout(saved) {
  const layout = saved?.recordSplitLayout
  if (saved?.recordSplitScrollAncestors?.length) {
    saved.recordSplitScrollAncestors.forEach(
      ({ el, scrollTop, height, maxHeight, overflow, overflowY }) => {
        if (!el) return
        el.style.height = height
        el.style.maxHeight = maxHeight
        el.style.overflow = overflow
        el.style.overflowY = overflowY
        el.scrollTop = scrollTop ?? 0
      }
    )
    saved.recordSplitScrollAncestors = []
  }
  if (!layout?.el) return
  const { el, width, minWidth, height, minHeight, maxHeight, overflow, overflowX, overflowY } = layout
  el.style.width = width
  el.style.minWidth = minWidth
  el.style.height = height
  el.style.minHeight = minHeight
  el.style.maxHeight = maxHeight
  el.style.overflow = overflow
  el.style.overflowX = overflowX
  el.style.overflowY = overflowY
  if (saved?.recordSplitScrollTop != null) {
    el.scrollTop = saved.recordSplitScrollTop
  }
}

function withTimeout(promise, ms, message) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function stripUnsafeBackgrounds(sourceRoot, clonedRoot) {
  const origEls = [sourceRoot, ...sourceRoot.querySelectorAll('*')]
  const cloneEls = [clonedRoot, ...clonedRoot.querySelectorAll('*')]

  cloneEls.forEach((el, i) => {
    const orig = origEls[i]
    if (!orig) return
    const cs = getComputedStyle(orig)
    const bgImg = cs.backgroundImage
    const bg = cs.background

    if (
      (bgImg && bgImg !== 'none' && bgImg.includes('gradient')) ||
      (bg && bg.includes('linear-gradient'))
    ) {
      el.style.background = 'none'
      el.style.backgroundImage = 'none'
    }

    if (el.style.background && String(el.style.background).includes('gradient')) {
      el.style.background = 'none'
    }
  })
}

function fixGradientOverlays(sourceEl, clonedRoot) {
  const origCells = sourceEl.querySelectorAll('[data-calendar-cell]')
  const cloneCells = clonedRoot.querySelectorAll('[data-calendar-cell]')

  cloneCells.forEach((cell, i) => {
    const orig = origCells[i]
    if (!orig) return
    const origOverlays = orig.querySelectorAll('[style*="linear-gradient"]')
    const cloneOverlays = cell.querySelectorAll('[style*="linear-gradient"], [style*="gradient"]')
    cloneOverlays.forEach((overlay, j) => {
      const origOverlay = origOverlays[j]
      const bg = origOverlay ? getComputedStyle(origOverlay).background : ''
      overlay.style.background = 'none'
      overlay.style.backgroundImage = 'none'
      if (bg.includes('255, 255, 255') || bg.includes('255,255,255')) {
        overlay.style.backgroundColor = 'rgba(255,255,255,0.75)'
      } else {
        overlay.style.backgroundColor = 'rgba(0,0,0,0.55)'
      }
    })
  })
}

function clearRenderHints(el) {
  if (!el) return
  el.style.removeProperty('content-visibility')
  el.style.removeProperty('contain-intrinsic-size')
}

/** camelCase style key → CSS property (export !important 해제용) */
function stylePropToKebab(prop) {
  if (!prop) return prop
  if (prop === 'webkitLineClamp') return '-webkit-line-clamp'
  if (prop === 'webkitBoxOrient') return '-webkit-box-orient'
  if (prop === 'webkitFilter') return '-webkit-filter'
  if (prop.startsWith('webkit')) {
    return `-${prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`
  }
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

/** setProperty(..., important) 잔존까지 제거하고 원본 인라인 복원 */
function restoreStyleProp(el, camelProp, value) {
  if (!el || value === undefined) return
  el.style.removeProperty(stylePropToKebab(camelProp))
  if (value !== '' && value != null) {
    el.style[camelProp] = value
  }
}

/**
 * 내보내기가 표지에 남긴 고정 height / aspect-ratio:auto / !important width 등을 제거.
 * React style prop에 없는 인라인은 리렌더만으로는 지워지지 않아 카드 비율이 깨진다.
 */
function scrubLiveCardGridExportGeometry(root) {
  if (!root) return

  const boxProps = [
    'width',
    'height',
    'min-height',
    'max-height',
    'max-width',
    'aspect-ratio',
    'flex',
    'flex-shrink',
    'box-sizing',
    'overflow',
    'position',
    'top',
    'left',
    'right',
    'bottom',
    'margin-top',
    'margin-bottom',
    'margin-left',
    'margin-right',
    'padding-top',
    'padding-bottom',
    'padding-left',
    'padding-right',
    'border-radius',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-left-radius',
    'border-bottom-right-radius'
  ]

  root.querySelectorAll('[data-gallery-cover], [data-memo-cover]').forEach((cover) => {
    // hideTitle 모드의 React aspectRatio(예: "140 / 230")는 유지, export용 "auto"는 제거
    const aspect = cover.style.aspectRatio || ''
    const keepAspect = aspect.includes('/')
    boxProps.forEach((p) => cover.style.removeProperty(p))
    if (keepAspect) cover.style.aspectRatio = aspect
  })

  root.querySelectorAll('[data-gallery-cover] img, [data-memo-cover] img').forEach((img) => {
    ;[
      'position',
      'top',
      'left',
      'right',
      'bottom',
      'inset',
      'width',
      'height',
      'max-width',
      'max-height',
      'object-fit',
      'object-position',
      'margin',
      'padding',
      'border',
      'display',
      'transform',
      'filter',
      '-webkit-filter',
      'box-sizing',
      'vertical-align',
      'border-radius',
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-left-radius',
      'border-bottom-right-radius',
      'overflow'
    ].forEach((p) => img.style.removeProperty(p))
  })

  /* 기본 모드 내보내기 크롬(흰색 제목/카드·강제 라운드) !important 잔존 제거 */
  root.querySelectorAll('[data-gallery-card-export], [data-memo-card-export]').forEach((card) => {
    ;[
      'background',
      'background-color',
      'border',
      'border-width',
      'border-style',
      'border-color',
      'border-radius',
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-left-radius',
      'border-bottom-right-radius',
      'box-shadow',
      'outline',
      'overflow'
    ].forEach((p) => card.style.removeProperty(p))
  })

  root.querySelectorAll('[data-gallery-title-bar], [data-memo-title-bar]').forEach((bar) => {
    ;[
      'height',
      'min-height',
      'max-height',
      'overflow',
      'display',
      'align-items',
      'line-height',
      'padding-top',
      'padding-bottom',
      'box-sizing',
      'flex',
      'border-radius',
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-left-radius',
      'border-bottom-right-radius',
      'background',
      'background-color',
      'background-image',
      'border',
      'border-width',
      'border-style',
      'border-color',
      'box-shadow',
      'outline'
    ].forEach((p) => bar.style.removeProperty(p))
  })

  root
    .querySelectorAll(
      '[data-gallery-title-bar] [data-inline-edit], [data-gallery-title], [data-memo-title-bar] [data-inline-edit], [data-memo-title], [data-memo-title-bar] span, [data-memo-title-bar] p, [data-gallery-title-bar] span, [data-gallery-title-bar] p'
    )
    .forEach((text) => {
      ;[
        'display',
        'overflow',
        'height',
        'max-height',
        'line-height',
        'padding-bottom',
        'font-size',
        'word-break',
        'overflow-wrap',
        '-webkit-line-clamp',
        'line-clamp',
        '-webkit-box-orient',
        'background',
        'background-color',
        'border',
        'box-shadow',
        'outline'
      ].forEach((p) => text.style.removeProperty(p))
    })
}

function drawImageObjectFitCover(ctx, img, dw, dh, scaleVal = 1) {
  const nw = img.naturalWidth || dw
  const nh = img.naturalHeight || dh
  if (!nw || !nh) {
    ctx.drawImage(img, 0, 0, dw, dh)
    return
  }

  const ir = nw / nh
  const dr = dw / dh
  let sx = 0
  let sy = 0
  let sw = nw
  let sh = nh

  if (ir > dr) {
    sh = nh
    sw = sh * dr
    sx = (nw - sw) / 2
  } else {
    sw = nw
    sh = sw / dr
    sy = (nh - sh) / 2
  }

  const drawW = dw * scaleVal
  const drawH = dh * scaleVal
  ctx.drawImage(img, sx, sy, sw, sh, (dw - drawW) / 2, (dh - drawH) / 2, drawW, drawH)
}

function isTitleFirstCard(card) {
  const cover = card.querySelector('[data-gallery-cover], [data-memo-cover]')
  const titleBar = card.querySelector('[data-gallery-title-bar], [data-memo-title-bar]')
  if (!cover || !titleBar) return false
  return Boolean(titleBar.compareDocumentPosition(cover) & Node.DOCUMENT_POSITION_FOLLOWING)
}

function isMemoV1TitleFirstCard(card) {
  if (!card?.querySelector('[data-memo-text-wrap]') || card.querySelector('[data-memo-panel]')) return false
  return isTitleFirstCard(card)
}

function getMemoV1ExportCardHeight(cardWidth, titleSize = 'medium') {
  /* 제목바(+작품명 대 여유) + 표지 3:4 — 여분(+2) 없이 맞춰 표지 하단 들뜸/잔선 방지 */
  return getMemoV1ExportTitleBarHeight(titleSize) + getGalleryCoverExportHeight(cardWidth)
}

/**
 * 메모 v1 내보내기 전용 — 표지를 카드 콘텐츠 하단(테두리 안쪽)에 밀착.
 * 제목 높이를 뺀 나머지 높이를 표지에 강제(레트로 비대칭 border 포함).
 * 그라데이션/텍스트 노드는 수정하지 않는다.
 */
function sealMemoV1ExportCoverToBottom(root, saved = null) {
  if (!root) return
  root.querySelectorAll('[data-memo-card-export]').forEach((card) => {
    if (!isMemoV1TitleFirstCard(card)) return
    const cover = card.querySelector('[data-memo-cover]')
    const titleBar = card.querySelector('[data-memo-title-bar]')
    if (!cover) return

    if (saved) {
      pushMemoLayoutEntry(saved, card, [
        'paddingBottom',
        'overflow',
        'display',
        'flexDirection',
        'boxSizing'
      ])
      if (titleBar) {
        pushMemoLayoutEntry(saved, titleBar, [
          'height',
          'minHeight',
          'maxHeight',
          'flex',
          'flexShrink',
          'overflow'
        ])
      }
      pushMemoLayoutEntry(saved, cover, [
        'height',
        'minHeight',
        'maxHeight',
        'flex',
        'flexGrow',
        'flexShrink',
        'borderBottomLeftRadius',
        'borderBottomRightRadius',
        'marginBottom',
        'paddingBottom',
        'position',
        'top',
        'bottom',
        'left',
        'right',
        'width'
      ])
      cover.querySelectorAll('img').forEach((img) => {
        pushMemoLayoutEntry(saved, img, [
          'borderBottomLeftRadius',
          'borderBottomRightRadius'
        ])
      })
    }

    card.style.paddingBottom = '0'
    card.style.boxSizing = 'border-box'
    card.style.overflow = 'hidden'
    card.style.display = 'flex'
    card.style.flexDirection = 'column'

    cover.style.setProperty('border-bottom-left-radius', '0px', 'important')
    cover.style.setProperty('border-bottom-right-radius', '0px', 'important')
    cover.style.marginBottom = '0'
    cover.style.paddingBottom = '0'
    cover.querySelectorAll('img').forEach((img) => {
      img.style.setProperty('border-bottom-left-radius', '0px', 'important')
      img.style.setProperty('border-bottom-right-radius', '0px', 'important')
    })

    const cs = getComputedStyle(card)
    const borderTop = parseFloat(cs.borderTopWidth) || 0
    const borderBottom = parseFloat(cs.borderBottomWidth) || 0
    const cardRect = card.getBoundingClientRect()
    const innerH = Math.max(1, Math.round(cardRect.height - borderTop - borderBottom))
    const titleH = titleBar
      ? Math.max(1, Math.ceil(titleBar.getBoundingClientRect().height))
      : 0

    if (titleBar) {
      titleBar.style.setProperty('flex', `0 0 ${titleH}px`, 'important')
      titleBar.style.setProperty('height', `${titleH}px`, 'important')
      titleBar.style.setProperty('min-height', `${titleH}px`, 'important')
      titleBar.style.setProperty('max-height', `${titleH}px`, 'important')
      titleBar.style.overflow = 'hidden'
      titleBar.style.flexShrink = '0'
    }

    /* 제목을 뺀 나머지를 표지가 전부 차지 — 레트로 5px 하단 border 안쪽까지 밀착 */
    const targetCoverH = Math.max(1, innerH - titleH)
    cover.style.position = 'relative'
    cover.style.top = '0'
    cover.style.bottom = 'auto'
    cover.style.left = '0'
    cover.style.right = 'auto'
    cover.style.width = '100%'
    cover.style.flex = 'none'
    cover.style.flexGrow = '0'
    cover.style.flexShrink = '0'
    cover.style.setProperty('height', `${targetCoverH}px`, 'important')
    cover.style.setProperty('min-height', `${targetCoverH}px`, 'important')
    cover.style.setProperty('max-height', `${targetCoverH}px`, 'important')
  })
}

function bakeImageToCoverRect(imgEl, width, height, dpr = 2) {
  const dw = Math.max(1, Math.round(width))
  const dh = Math.max(1, Math.round(height))
  if (!imgEl?.src && !imgEl?.getAttribute('data-cover-url')) return null

  try {
    const cs = getComputedStyle(imgEl)
    const blurPx = parseBlurPx(cs.filter)

    const canvas = document.createElement('canvas')
    canvas.width = dw * dpr
    canvas.height = dh * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`
    drawImageObjectFitCover(ctx, imgEl, dw, dh, 1)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function pushCoverImageStyle(saved, img, keys) {
  if (!img) return
  saved.coverImageStyles = saved.coverImageStyles || []
  const entry = { el: img }
  keys.forEach((key) => {
    entry[key] = img.style[key]
  })
  if (img.src) entry.src = img.src
  saved.coverImageStyles.push(entry)
}

function prepareCoverImagesForLiveExport(root, cardWidth, saved) {
  const coverH = getGalleryCoverExportHeight(cardWidth)
  root.querySelectorAll('[data-gallery-cover] img, [data-memo-cover] img').forEach((img) => {
    const cover = img.closest('[data-gallery-cover], [data-memo-cover]')
    if (!cover) return
    const memoCard = cover.closest('[data-memo-card-export]')
    const memoV1TitleFirst = isMemoV1TitleFirstCard(memoCard)

    pushCoverImageStyle(saved, img, [
      'position',
      'top',
      'left',
      'right',
      'bottom',
      'width',
      'height',
      'maxWidth',
      'maxHeight',
      'objectFit',
      'objectPosition',
      'margin',
      'padding',
      'border',
      'display',
      'transform',
      'filter',
      'webkitFilter'
    ])

    // 표지 박스 geometry도 저장 — 미저장 시 내보내기 후 비율이 깨진 채로 남을 수 있음
    if (!saved.cardSizes?.some((entry) => entry.el === cover && entry._coverGeom)) {
      saved.cardSizes = saved.cardSizes || []
      saved.cardSizes.push({
        el: cover,
        _coverGeom: true,
        width: cover.style.width,
        height: cover.style.height,
        minHeight: cover.style.minHeight,
        maxHeight: cover.style.maxHeight,
        aspectRatio: cover.style.aspectRatio,
        overflow: cover.style.overflow,
        position: cover.style.position,
        flex: cover.style.flex,
        flexGrow: cover.style.flexGrow,
        flexShrink: cover.style.flexShrink
      })
    }

    img.style.position = 'absolute'
    img.style.inset = '0'
    img.style.top = '0'
    img.style.right = '0'
    img.style.bottom = '0'
    img.style.left = '0'
    img.style.width = '100%'
    img.style.height = '100%'
    img.style.maxWidth = 'none'
    img.style.maxHeight = 'none'
    img.style.objectFit = 'cover'
    img.style.objectPosition = 'center'
    img.style.margin = '0'
    img.style.padding = '0'
    img.style.border = 'none'
    img.style.display = 'block'

    const coverUrl = img.getAttribute('data-cover-url')
    if (coverUrl && !img.src) img.src = coverUrl

    cover.style.position = 'relative'
    cover.style.overflow = 'hidden'
    cover.style.width = `${cardWidth}px`
    cover.style.marginBottom = '0'
    /*
     * 메모 v1(제목 상단): 표지가 카드 하단까지 flex로 채워
     * 테두리/반올림 여유 때문에 생기던 하단 잔선을 막는다.
     */
    if (memoV1TitleFirst) {
      cover.style.height = 'auto'
      cover.style.minHeight = `${coverH}px`
      cover.style.maxHeight = 'none'
      cover.style.flex = '1 1 auto'
      cover.style.flexGrow = '1'
      cover.style.flexShrink = '0'
    } else {
      cover.style.height = `${coverH}px`
      cover.style.minHeight = `${coverH}px`
      cover.style.maxHeight = `${coverH}px`
    }
  })
}

function stripLiveExportCoverVisualEffects(root) {
  root.querySelectorAll('[data-gallery-cover] img, [data-memo-cover] img').forEach((img) => {
    img.style.transform = 'none'
    img.style.filter = 'none'
    img.style.webkitFilter = 'none'
  })
}

async function prepareBlurredContentForLiveExport(root, options = {}) {
  if (!root || lockedExportSaved.has(root)) return
  if (isCardGridExportRoot(root)) {
    await prepareLockedCardsForExport(root, options)
  } else if (root.hasAttribute('data-record-export-root')) {
    await prepareLockedRowsForExport(root, options)
  }
}

async function prepareCardGridLiveExportCapture(root, layoutSaved, options = {}) {
  const reinjectExportTitleSize = () => {
    const titleSize = resolveExportTitleSizeFromOptions({
      titleFontSize: layoutSaved?.exportTitleSize ?? options.titleFontSize ?? options.titleSize
    })
    root.setAttribute('data-export-title-size', titleSize)
    applyExportCardTitleTextOptions(root, layoutSaved || {}, titleSize)
  }

  await preloadExportImages(root, {
    onProgress: options.onProgress,
    timeoutMs: options.preloadTimeoutMs ?? 15000,
    perImageTimeoutMs: options.preloadPerImageTimeoutMs ?? 8000,
    lockExport: options.lockExport === true
  })
  /* 잠금/표지숨기기: Electron 뷰포트 캡처 대신 블러 bake + 10×10 레이아웃 유지 */
  await prepareBlurredContentForLiveExport(root, options)
  stripLiveExportCoverVisualEffects(root)
  await bakeCoverImagesForLiveExport(root, layoutSaved.exportCardWidth, layoutSaved)
  // 캡처 직전 재주입 — bake/레이아웃 이후에도 titleFontSize가 DOM에 남도록
  reinjectExportTitleSize()
  /*
   * 기본 모드 흰색·라운드 재적용만 — saved에 다시 push 금지.
   * (push하면 이미 하얀 mid-export 값이 "원본"으로 쌓여 restore 후에도 인앱에 남음)
   */
  applyDefaultModeExportCardChromeOnRoot(root, null)
  /* 크롬 재적용 이후 — 메모 v1 표지 하단 밀착(캡처 직전) */
  sealMemoV1ExportCoverToBottom(root, null)
  await yieldToMain()
}

async function prepareLockExportFallbackCapture(element, exportOptions = {}) {
  if (exportOptions.lockExport !== true) return
  await prepareBlurredContentForLiveExport(element, exportOptions)
  if (isCardGridExportRoot(element) && exportOptions.exportCardWidth) {
    stripLiveExportCoverVisualEffects(element)
    await bakeCoverImagesForLiveExport(element, exportOptions.exportCardWidth, {
      coverImageStyles: []
    })
  }
}

async function bakeCoverImagesForLiveExport(root, cardWidth, saved) {
  const coverH = getGalleryCoverExportHeight(cardWidth)
  const imgs = [...root.querySelectorAll('[data-gallery-cover] img, [data-memo-cover] img')]
  await mapWithConcurrency(imgs, 6, async (img) => {
    const coverUrl = img.getAttribute('data-cover-url') || img.src
    if (coverUrl && (!img.complete || !img.naturalWidth)) {
      await preloadImageUrl(coverUrl)
      if (!img.src) img.src = coverUrl
    }

    img.style.transform = 'none'
    img.style.filter = 'none'
    img.style.webkitFilter = 'none'

    const baked = bakeImageToCoverRect(img, cardWidth, coverH)
    if (!baked) return

    if (!saved.coverImageStyles?.some((entry) => entry.el === img && entry.src !== undefined)) {
      pushCoverImageStyle(saved, img, ['src'])
    }
    img.src = baked
    img.style.objectFit = 'fill'
  })
}

function prepareMemoV1TitleBarsForLiveExport(root, saved, titleSize = 'medium') {
  const titleStyle = getExportTitleSizeStyle(titleSize)
  const titleBarPx = getMemoV1ExportTitleBarHeight(titleSize)
  saved.titleStyles = saved.titleStyles || []
  root.querySelectorAll('[data-memo-card-export][data-maintain-layout]').forEach((inner) => {
    if (!isMemoV1TitleFirstCard(inner)) return

    const titleBar = inner.querySelector('[data-memo-title-bar]')
    const text = titleBar?.querySelector('[data-memo-title]')
    const titleH = `${titleBarPx}px`

    if (titleBar) {
      saved.titleStyles.push({
        el: titleBar,
        height: titleBar.style.height,
        minHeight: titleBar.style.minHeight,
        maxHeight: titleBar.style.maxHeight,
        overflow: titleBar.style.overflow,
        flex: titleBar.style.flex,
        lineHeight: titleBar.style.lineHeight
      })
      titleBar.style.setProperty('height', titleH, 'important')
      titleBar.style.setProperty('min-height', titleH, 'important')
      titleBar.style.setProperty('max-height', titleH, 'important')
      titleBar.style.overflow = 'hidden'
      titleBar.style.setProperty('flex', `0 0 ${titleH}`, 'important')
      titleBar.style.lineHeight = titleStyle.lineHeight
    }

    if (text) {
      saved.titleStyles.push({
        el: text,
        overflow: text.style.overflow,
        display: text.style.display,
        webkitLineClamp: text.style.webkitLineClamp,
        lineClamp: text.style.lineClamp,
        webkitBoxOrient: text.style.webkitBoxOrient,
        maxHeight: text.style.maxHeight,
        fontSize: text.style.fontSize,
        lineHeight: text.style.lineHeight,
        wordBreak: text.style.wordBreak,
        overflowWrap: text.style.overflowWrap
      })
      text.style.display = '-webkit-box'
      text.style.webkitBoxOrient = 'vertical'
      text.style.webkitLineClamp = '2'
      text.style.lineClamp = '2'
      text.style.overflow = 'hidden'
      text.style.maxHeight = `${Math.max(titleBarPx - 12, 1)}px`
      forceExportTitleTextStyle(text, titleSize)
    }
  })
}

function prepareMemoV1MaintainLayoutCoverForLiveExport(root, cardWidth, saved) {
  const coverH = getGalleryCoverExportHeight(cardWidth)
  root.querySelectorAll('[data-memo-card-export][data-maintain-layout]').forEach((inner) => {
    const cover = inner.querySelector('[data-memo-cover]')
    const wrap = inner.querySelector('[data-memo-text-wrap]')
    if (!cover || !wrap || inner.querySelector('[data-memo-panel]')) return

    pushMemoLayoutEntry(saved, inner, ['display', 'flexDirection', 'height', 'maxHeight'])
    if (isTitleFirstCard(inner)) {
      inner.style.display = 'flex'
      inner.style.flexDirection = 'column'
    }

    pushMemoLayoutEntry(saved, cover, [
      'width',
      'height',
      'minHeight',
      'maxHeight',
      'aspectRatio',
      'overflow',
      'flex',
      'flexGrow',
      'flexShrink',
      'position',
      'display',
      'marginBottom'
    ])
    cover.style.width = `${cardWidth}px`
    cover.style.aspectRatio = 'auto'
    cover.style.overflow = 'hidden'
    cover.style.position = 'relative'
    cover.style.display = 'block'
    cover.style.marginBottom = '0'
    if (isTitleFirstCard(inner)) {
      cover.style.height = 'auto'
      cover.style.minHeight = `${coverH}px`
      cover.style.maxHeight = 'none'
      cover.style.flex = '1 1 auto'
      cover.style.flexGrow = '1'
      cover.style.flexShrink = '0'
    } else {
      cover.style.height = `${coverH}px`
      cover.style.minHeight = `${coverH}px`
      cover.style.maxHeight = `${coverH}px`
      cover.style.flexShrink = '0'
    }
  })
}

function bakeImageToDisplayRect(imgEl, dpr = 2) {
  const rect = imgEl.getBoundingClientRect()
  const dw = Math.max(1, Math.round(rect.width))
  const dh = Math.max(1, Math.round(rect.height))
  if (dw < 1 || dh < 1) return null

  try {
    const cs = getComputedStyle(imgEl)
    const blurPx = parseBlurPx(cs.filter)
    const scaleVal = parseScale(cs.transform) || 1

    const canvas = document.createElement('canvas')
    canvas.width = dw * dpr
    canvas.height = dh * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`

    const objectFit = cs.objectFit || 'fill'
    if (objectFit === 'cover' || objectFit === 'contain') {
      drawImageObjectFitCover(ctx, imgEl, dw, dh, scaleVal)
    } else {
      const drawW = dw * scaleVal
      const drawH = dh * scaleVal
      ctx.drawImage(imgEl, (dw - drawW) / 2, (dh - drawH) / 2, drawW, drawH)
    }

    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function hydrateCoverImagesForExport(root) {
  if (!root) return
  root.querySelectorAll('img[data-cover-url]').forEach((img) => {
    const url = img.getAttribute('data-cover-url')
    if (!url) return
    if (!img.getAttribute('src')) img.src = url
    img.loading = 'eager'
    img.decoding = 'sync'
  })
  hydrateCalendarDayCoversForExport(root)
}

/** 달력 날짜 셀 표지/커버 — lazy 미로드 방지 및 html2canvas용 data-cover-url 부여 */
function hydrateCalendarDayCoversForExport(root) {
  if (!root?.hasAttribute('data-calendar-export-root')) return
  root.querySelectorAll('[data-calendar-cell] img').forEach((img) => {
    const url = img.getAttribute('data-cover-url') || img.getAttribute('src') || img.src
    if (!url) return
    img.setAttribute('data-cover-url', url)
    img.setAttribute('data-calendar-day-cover', '')
    if (!img.getAttribute('src')) img.src = url
    img.loading = 'eager'
    img.decoding = 'sync'
  })
}

function bakeCoverImagesForExport(origCover, clonedCover) {
  if (!origCover || !clonedCover) return
  const origImgs = [...origCover.querySelectorAll('img')]
  const cloneImgs = [...clonedCover.querySelectorAll('img')]
  origImgs.forEach((origImg, i) => {
    const cloneImg = cloneImgs[i]
    if (!cloneImg) return
    const coverUrl = origImg.getAttribute('data-cover-url')
    if (coverUrl && !origImg.src) origImg.src = coverUrl

    let baked = bakeImageToDisplayRect(origImg)
    if (!baked && coverUrl) baked = coverUrl
    if (baked) cloneImg.src = baked
    cloneImg.style.position = 'absolute'
    cloneImg.style.inset = '0'
    cloneImg.style.width = '100%'
    cloneImg.style.height = '100%'
    cloneImg.style.objectFit = 'fill'
    cloneImg.style.objectPosition = 'center'
    cloneImg.style.transform = 'none'
    cloneImg.style.filter = 'none'
    cloneImg.style.webkitFilter = 'none'
    cloneImg.style.display = 'block'
  })
}

function fixExportTextClipping(
  cloneEl,
  origEl,
  {
    keepLineClamp = false,
    lineHeight = '1.45',
    offsetY = 0,
    whiteSpace = 'pre-wrap',
    textAlign,
    clearMaxHeight = true
  } = {}
) {
  if (!cloneEl) return

  cloneEl.style.overflow = 'visible'
  cloneEl.style.display = 'block'
  cloneEl.style.boxSizing = 'border-box'
  cloneEl.style.lineHeight = lineHeight
  cloneEl.style.margin = '0'
  cloneEl.style.padding = '0'
  cloneEl.style.transform = offsetY ? `translateY(${offsetY}px)` : 'none'

  if (!keepLineClamp) {
    cloneEl.style.webkitBoxOrient = 'unset'
    cloneEl.style.webkitLineClamp = 'unset'
    cloneEl.style.lineClamp = 'unset'
    if (clearMaxHeight) cloneEl.style.maxHeight = 'none'
    cloneEl.style.whiteSpace = whiteSpace
    cloneEl.style.overflow = 'visible'
  } else if (origEl) {
    cloneEl.style.webkitBoxOrient = 'unset'
    cloneEl.style.webkitLineClamp = 'unset'
    cloneEl.style.lineClamp = 'unset'
    cloneEl.style.display = 'block'
    cloneEl.style.whiteSpace = whiteSpace
    cloneEl.style.overflow = 'hidden'
    const limitEl = origEl.parentElement || origEl
    cloneEl.style.maxHeight = `${Math.max(Math.ceil(limitEl.getBoundingClientRect().height), 1)}px`
  }

  if (origEl) {
    const cs = getComputedStyle(origEl)
    cloneEl.style.fontSize = cs.fontSize
    cloneEl.style.textAlign = textAlign ?? cs.textAlign
    cloneEl.style.fontWeight = cs.fontWeight
    cloneEl.style.color = toSafeCssColor(cs.color, 'color')
  } else if (textAlign) {
    cloneEl.style.textAlign = textAlign
  }
}

function relaxCardExportHeight(sourceCard, clonedCard, extraPx = 4) {
  const cardRect = sourceCard.getBoundingClientRect()
  if (cardRect.height <= 0) return
  const cardH = Math.round(cardRect.height) + extraPx
  clonedCard.style.height = `${cardH}px`
  clonedCard.style.minHeight = `${cardH}px`
  clonedCard.style.maxHeight = `${cardH}px`
}

function fixGalleryTitleExport(sourceCard, clonedCard, blurBakes, doc) {
  const origTitleBar = sourceCard.querySelector('[data-gallery-title-bar]')
  const cloneTitleBar = clonedCard.querySelector('[data-gallery-title-bar]')
  if (!origTitleBar || !cloneTitleBar) return

  if (blurBakes?.titleBar) {
    applyBlurBakeToTitleBar(cloneTitleBar, blurBakes, doc, origTitleBar)
    return
  }

  /* 잠금 라이브 bake된 작품명 — 클론에서 표지 src가 덮어쓰지 않도록 보존 */
  if (isTitleBarBlurBaked(origTitleBar)) {
    const bakedSrc =
      origTitleBar.querySelector('img[data-export-title-blur-bake]')?.src ||
      origTitleBar.querySelector('img')?.src
    if (bakedSrc) {
      applyBlurBakeToTitleBar(cloneTitleBar, { titleBar: bakedSrc }, doc, origTitleBar)
    }
    return
  }

  if (hasBlurFilter(origTitleBar)) {
    cloneTitleBar.style.filter = getComputedStyle(origTitleBar).filter
    cloneTitleBar.style.transform = getComputedStyle(origTitleBar).transform
  }

  const origText =
    origTitleBar.querySelector('[data-gallery-title]') ||
    origTitleBar.querySelector('[data-inline-edit]') ||
    origTitleBar.querySelector('span, p')
  const cloneText =
    cloneTitleBar.querySelector('[data-gallery-title]') ||
    cloneTitleBar.querySelector('[data-inline-edit]') ||
    cloneTitleBar.querySelector('span, p')
  const barRect = origTitleBar.getBoundingClientRect()

  const exportTitleSize = resolveExportTitleSizeKey(
    sourceCard.closest('[data-export-title-size]')?.getAttribute('data-export-title-size')
  )
  const textAlign = resolveExportTitleTextAlign(origTitleBar, origText)
  fixExportTextClipping(cloneText, origText, {
    lineHeight: '1.35',
    whiteSpace: 'normal',
    textAlign,
    offsetY: 0
  })
  forceExportTitleTextStyle(cloneText, exportTitleSize)
  applyExportTitleBoxScreenSync(cloneTitleBar, cloneText, { textAlign })
  forceExportTitleBarFlexible(cloneTitleBar, exportTitleSize)
  cloneTitleBar.style.minHeight = `${Math.max(Math.ceil(barRect.height), GALLERY_TITLE_BAR_PX)}px`

  const origCoverTitle = sourceCard.querySelector('[data-gallery-cover-title]')
  const cloneCoverTitle = clonedCard.querySelector('[data-gallery-cover-title]')
  if (origCoverTitle && cloneCoverTitle) {
    fixExportTextClipping(cloneCoverTitle, origCoverTitle, {
      lineHeight: '1.35',
      whiteSpace: 'normal',
      textAlign: 'center',
      offsetY: 0
    })
    forceExportTitleTextStyle(cloneCoverTitle, exportTitleSize)
  }
}

function fixCardExportDimensions(sourceCard, clonedCard) {
  if (!sourceCard || !clonedCard) return
  const rect = sourceCard.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return
  clonedCard.style.boxSizing = 'border-box'
  clonedCard.style.flexShrink = '0'
  clonedCard.style.width = `${Math.round(rect.width)}px`
  clonedCard.style.height = `${Math.round(rect.height)}px`
  clonedCard.style.minWidth = `${Math.round(rect.width)}px`
  clonedCard.style.minHeight = `${Math.round(rect.height)}px`
  clonedCard.style.maxWidth = `${Math.round(rect.width)}px`
  clonedCard.style.maxHeight = `${Math.round(rect.height)}px`
  clearRenderHints(clonedCard)
}

function fixCardCoverAspect(sourceCard, clonedCard, coverSelector) {
  const origCovers = sourceCard.querySelectorAll(coverSelector)
  const titleBar = sourceCard.querySelector('[data-gallery-title-bar], [data-memo-title-bar]')
  clonedCard.querySelectorAll(coverSelector).forEach((el, i) => {
    const orig = origCovers[i]
    if (!orig) return
    const rect = orig.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      const coverW = Math.round(rect.width)
      const coverH = titleBar ? getGalleryCoverExportHeight(coverW) : Math.round(rect.height)
      el.style.position = 'relative'
      el.style.aspectRatio = 'auto'
      el.style.width = `${coverW}px`
      el.style.height = `${coverH}px`
      el.style.minHeight = `${coverH}px`
      el.style.maxHeight = `${coverH}px`
      el.style.overflow = 'hidden'
      el.style.flexShrink = '0'
    }
    bakeCoverImagesForExport(orig, el)
  })
}

function pushCardChromeStyle(saved, el, keys) {
  if (!el) return
  saved.cardChromeStyles = saved.cardChromeStyles || []
  const entry = { el }
  keys.forEach((key) => {
    entry[key] = el.style[key]
  })
  saved.cardChromeStyles.push(entry)
}

function isCoverFirstCard(card) {
  const cover = card.querySelector('[data-gallery-cover], [data-memo-cover]')
  const titleBar = card.querySelector('[data-gallery-title-bar], [data-memo-title-bar]')
  if (!cover) return false
  if (!titleBar) return true
  return Boolean(cover.compareDocumentPosition(titleBar) & Node.DOCUMENT_POSITION_FOLLOWING)
}

/**
 * 기본 모드 내보내기 전용 — 카드 외곽 정리 + 표지 라운드.
 * 작품명 바는 서브패널색 유지. 표지→작품명(하단) 카드는 카드 배경을 서브패널로 맞춰
 * 하단 흰 잔상을 막고, 테마 테두리색을 유지한다.
 * glass/retro 및 화면 UI는 호출부에서 getLiveUiStyle()==='default'일 때만 진입.
 */
function applyDefaultModeExportCardChrome(card, saved = null) {
  if (!card || getLiveUiStyle() !== 'default') return

  const radius = `${CARD_GRID_EXPORT_RADIUS_PX}px`
  const titleBar = card.querySelector('[data-gallery-title-bar], [data-memo-title-bar]')
  const cover = card.querySelector('[data-gallery-cover], [data-memo-cover]')
  const theme = getThemeColors()
  const titleBarBg = theme?.bgSubPanel || '#F5F1E5'
  const cardBg = theme?.bgCard || '#ffffff'
  const borderColor = theme?.border || '#D4CBB8'
  const coverFirst = isCoverFirstCard(card)
  /* 작품명 하단형: 카드 여백이 흰색으로 비치지 않도록 서브패널과 동일 표면 */
  const surfaceBg = coverFirst && titleBar ? titleBarBg : cardBg

  if (saved) {
    pushCardChromeStyle(saved, card, [
      'background',
      'backgroundColor',
      'border',
      'borderWidth',
      'borderStyle',
      'borderColor',
      'borderRadius',
      'boxShadow',
      'outline',
      'overflow'
    ])
    if (titleBar) {
      pushCardChromeStyle(saved, titleBar, [
        'background',
        'backgroundColor',
        'border',
        'borderWidth',
        'borderStyle',
        'borderColor',
        'boxShadow',
        'outline',
        'borderTopLeftRadius',
        'borderTopRightRadius',
        'borderBottomLeftRadius',
        'borderBottomRightRadius'
      ])
    }
    if (cover) {
      pushCardChromeStyle(saved, cover, [
        'overflow',
        'borderRadius',
        'borderTopLeftRadius',
        'borderTopRightRadius',
        'borderBottomLeftRadius',
        'borderBottomRightRadius'
      ])
      cover.querySelectorAll('img').forEach((img) => {
        pushCardChromeStyle(saved, img, [
          'borderRadius',
          'borderTopLeftRadius',
          'borderTopRightRadius',
          'borderBottomLeftRadius',
          'borderBottomRightRadius',
          'overflow'
        ])
      })
    }
  }

  card.style.setProperty('background', surfaceBg, 'important')
  card.style.setProperty('background-color', surfaceBg, 'important')
  card.style.setProperty('border', `1px solid ${borderColor}`, 'important')
  card.style.setProperty('border-color', borderColor, 'important')
  card.style.setProperty('box-shadow', 'none', 'important')
  card.style.setProperty('outline', 'none', 'important')
  card.style.setProperty('border-radius', radius, 'important')
  card.style.setProperty('overflow', 'hidden', 'important')

  if (titleBar) {
    titleBar.style.setProperty('background', titleBarBg, 'important')
    titleBar.style.setProperty('background-color', titleBarBg, 'important')
    titleBar.style.setProperty('border', 'none', 'important')
    titleBar.style.setProperty('box-shadow', 'none', 'important')
    titleBar.style.setProperty('outline', 'none', 'important')
    if (coverFirst) {
      titleBar.style.setProperty('border-bottom-left-radius', radius, 'important')
      titleBar.style.setProperty('border-bottom-right-radius', radius, 'important')
      titleBar.style.setProperty('border-top-left-radius', '0px', 'important')
      titleBar.style.setProperty('border-top-right-radius', '0px', 'important')
    } else {
      titleBar.style.setProperty('border-top-left-radius', radius, 'important')
      titleBar.style.setProperty('border-top-right-radius', radius, 'important')
      titleBar.style.setProperty('border-bottom-left-radius', '0px', 'important')
      titleBar.style.setProperty('border-bottom-right-radius', '0px', 'important')
    }
    titleBar
      .querySelectorAll('[data-inline-edit], [data-gallery-title], [data-memo-title], span, p')
      .forEach((el) => {
        el.style.setProperty('background', 'transparent', 'important')
        el.style.setProperty('background-color', 'transparent', 'important')
        el.style.setProperty('border', 'none', 'important')
        el.style.setProperty('box-shadow', 'none', 'important')
      })
  }

  if (!cover) return

  cover.style.setProperty('overflow', 'hidden', 'important')
  if (coverFirst) {
    if (titleBar) {
      cover.style.setProperty('border-top-left-radius', radius, 'important')
      cover.style.setProperty('border-top-right-radius', radius, 'important')
      cover.style.setProperty('border-bottom-left-radius', '0px', 'important')
      cover.style.setProperty('border-bottom-right-radius', '0px', 'important')
      cover.querySelectorAll('img').forEach((img) => {
        img.style.setProperty('overflow', 'hidden', 'important')
        img.style.setProperty('border-top-left-radius', radius, 'important')
        img.style.setProperty('border-top-right-radius', radius, 'important')
        img.style.setProperty('border-bottom-left-radius', '0px', 'important')
        img.style.setProperty('border-bottom-right-radius', '0px', 'important')
      })
    } else {
      cover.style.setProperty('border-radius', radius, 'important')
      cover.querySelectorAll('img').forEach((img) => {
        img.style.setProperty('overflow', 'hidden', 'important')
        img.style.setProperty('border-radius', radius, 'important')
      })
    }
  } else if (titleBar) {
    /* 메모 v1: 표지 하단 라운드 금지(카드 clip만) — 중첩 radius 출력 잔선 방지 */
    const bottomR = isMemoV1TitleFirstCard(card) ? '0px' : radius
    cover.style.setProperty('border-bottom-left-radius', bottomR, 'important')
    cover.style.setProperty('border-bottom-right-radius', bottomR, 'important')
    cover.style.setProperty('border-top-left-radius', '0px', 'important')
    cover.style.setProperty('border-top-right-radius', '0px', 'important')
    cover.querySelectorAll('img').forEach((img) => {
      img.style.setProperty('overflow', 'hidden', 'important')
      img.style.setProperty('border-bottom-left-radius', bottomR, 'important')
      img.style.setProperty('border-bottom-right-radius', bottomR, 'important')
      img.style.setProperty('border-top-left-radius', '0px', 'important')
      img.style.setProperty('border-top-right-radius', '0px', 'important')
    })
  }
}

function applyDefaultModeExportCardChromeOnRoot(root, saved = null) {
  if (!root || getLiveUiStyle() !== 'default') return
  root
    .querySelectorAll('[data-gallery-card-export], [data-memo-card-export]')
    .forEach((card) => applyDefaultModeExportCardChrome(card, saved))
}

function applyCardGridChromeForLiveExport(root, saved) {
  const radius = `${getExportCardRadiusPx()}px`
  root.querySelectorAll('[data-gallery-card-export], [data-memo-card-export]').forEach((card) => {
    const cover = card.querySelector('[data-gallery-cover], [data-memo-cover]')
    const titleBar = card.querySelector('[data-gallery-title-bar], [data-memo-title-bar]')

    pushCardChromeStyle(saved, card, [
      'borderRadius',
      'overflow',
      'borderTopLeftRadius',
      'borderTopRightRadius',
      'borderBottomLeftRadius',
      'borderBottomRightRadius'
    ])
    card.style.borderRadius = radius
    card.style.overflow = 'hidden'

    if (isCoverFirstCard(card)) {
      if (cover) {
        pushCardChromeStyle(saved, cover, [
          'overflow',
          'borderRadius',
          'borderTopLeftRadius',
          'borderTopRightRadius',
          'borderBottomLeftRadius',
          'borderBottomRightRadius'
        ])
        cover.style.overflow = 'hidden'
        if (titleBar) {
          cover.style.borderTopLeftRadius = radius
          cover.style.borderTopRightRadius = radius
          cover.style.borderBottomLeftRadius = '0'
          cover.style.borderBottomRightRadius = '0'
        } else {
          cover.style.borderRadius = radius
        }
      }
      if (titleBar) {
        pushCardChromeStyle(saved, titleBar, ['borderBottomLeftRadius', 'borderBottomRightRadius'])
        titleBar.style.borderBottomLeftRadius = radius
        titleBar.style.borderBottomRightRadius = radius
      }
    } else if (cover && titleBar) {
      pushCardChromeStyle(saved, titleBar, ['borderTopLeftRadius', 'borderTopRightRadius'])
      pushCardChromeStyle(saved, cover, [
        'overflow',
        'borderBottomLeftRadius',
        'borderBottomRightRadius',
        'borderTopLeftRadius',
        'borderTopRightRadius'
      ])
      titleBar.style.borderTopLeftRadius = radius
      titleBar.style.borderTopRightRadius = radius
      cover.style.overflow = 'hidden'
      /* 메모 v1: 하단 라운드는 카드 overflow에만 맡김 */
      const bottomR = isMemoV1TitleFirstCard(card) ? '0' : radius
      cover.style.borderBottomLeftRadius = bottomR
      cover.style.borderBottomRightRadius = bottomR
    } else if (cover) {
      pushCardChromeStyle(saved, cover, ['overflow', 'borderRadius'])
      cover.style.overflow = 'hidden'
      cover.style.borderRadius = radius
    }

    /* 기본 모드: 테마 표면·테두리 + 표지 라운드를 !important로 최종 고정 */
    applyDefaultModeExportCardChrome(card, saved)
  })
}

function fixGalleryCardChromeExport(sourceCard, clonedCard) {
  if (!sourceCard || !clonedCard) return
  const radius = `${getExportCardRadiusPx()}px`
  const cloneCover = clonedCard.querySelector('[data-gallery-cover]')
  const cloneTitleBar = clonedCard.querySelector('[data-gallery-title-bar]')

  clonedCard.style.borderRadius = radius
  clonedCard.style.overflow = 'hidden'

  if (cloneCover) {
    cloneCover.style.overflow = 'hidden'
    if (cloneTitleBar) {
      cloneCover.style.borderTopLeftRadius = radius
      cloneCover.style.borderTopRightRadius = radius
      cloneCover.style.borderBottomLeftRadius = '0'
      cloneCover.style.borderBottomRightRadius = '0'
    } else {
      cloneCover.style.borderRadius = radius
    }
  }
  if (cloneTitleBar) {
    cloneTitleBar.style.borderBottomLeftRadius = radius
    cloneTitleBar.style.borderBottomRightRadius = radius
  }

  applyDefaultModeExportCardChrome(clonedCard, null)
}

function fixGalleryCardExport(sourceCard, clonedCard, blurBakes, clonedDoc) {
  if (!sourceCard || !clonedCard) return
  fixCardExportDimensions(sourceCard, clonedCard)
  fixGalleryCardChromeExport(sourceCard, clonedCard)
  relaxCardExportHeight(sourceCard, clonedCard)
  fixCardCoverAspect(sourceCard, clonedCard, '[data-gallery-cover]')
  const doc = clonedDoc || clonedCard.ownerDocument
  applyBlurBakeToCover(clonedCard.querySelector('[data-gallery-cover]'), blurBakes, doc)
  fixGalleryTitleExport(sourceCard, clonedCard, blurBakes, doc)
  /* 타이틀 sync 이후에도 기본 모드 표면·테두리/라운드 유지 */
  applyDefaultModeExportCardChrome(clonedCard, null)
}

function bakeMemoGradientDataUrl(orig, colorMode) {
  const rect = orig.getBoundingClientRect()
  const w = Math.max(1, Math.ceil(rect.width))
  const h = Math.max(1, Math.ceil(rect.height) + 8)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, h)

  if (colorMode === 'white') {
    g.addColorStop(0, 'rgba(255,255,255,0.92)')
    g.addColorStop(0.55, 'rgba(255,255,255,0.42)')
    g.addColorStop(0.82, 'rgba(255,255,255,0.08)')
    g.addColorStop(0.96, 'rgba(255,255,255,0.02)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
  } else if (colorMode === 'theme') {
    const { bg } = getThemeColors()
    g.addColorStop(0, hexToRgba(bg, 0.92))
    g.addColorStop(0.55, hexToRgba(bg, 0.42))
    g.addColorStop(0.82, hexToRgba(bg, 0.08))
    g.addColorStop(0.96, hexToRgba(bg, 0.02))
    g.addColorStop(1, hexToRgba(bg, 0))
  } else {
    g.addColorStop(0, 'rgba(0,0,0,0.78)')
    g.addColorStop(0.55, 'rgba(0,0,0,0.36)')
    g.addColorStop(0.82, 'rgba(0,0,0,0.08)')
    g.addColorStop(0.96, 'rgba(0,0,0,0.02)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
  }

  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h }
}

function applyMemoGradientExport(orig, cloneEl, doc) {
  if (!orig || !cloneEl) return
  const colorMode = orig.getAttribute('data-memo-color') || 'black'
  const { dataUrl, height } = bakeMemoGradientDataUrl(orig, colorMode)

  cloneEl.textContent = ''
  cloneEl.style.background = 'none'
  cloneEl.style.backgroundColor = 'transparent'
  cloneEl.style.backgroundImage = 'none'
  cloneEl.style.border = 'none'
  cloneEl.style.outline = 'none'
  cloneEl.style.boxShadow = 'none'
  cloneEl.style.position = 'absolute'
  cloneEl.style.left = '0'
  cloneEl.style.right = '0'
  cloneEl.style.top = '0'
  cloneEl.style.width = '100%'
  cloneEl.style.height = `${height}px`
  cloneEl.style.marginBottom = '-8px'
  cloneEl.style.padding = '0'
  cloneEl.style.pointerEvents = 'none'
  cloneEl.style.overflow = 'visible'
  cloneEl.style.zIndex = '1'
  cloneEl.style.lineHeight = '0'
  cloneEl.style.fontSize = '0'

  const img = doc.createElement('img')
  img.src = dataUrl
  img.alt = ''
  img.draggable = false
  img.style.display = 'block'
  img.style.width = '100%'
  img.style.height = `${height}px`
  img.style.margin = '0'
  img.style.padding = '0'
  img.style.border = 'none'
  img.style.verticalAlign = 'top'
  cloneEl.appendChild(img)
}

function hasBlurFilter(el) {
  if (!el) return false
  return (getComputedStyle(el).filter || '').includes('blur')
}

function parseBlurPx(filter) {
  const match = String(filter || '').match(/blur\(([\d.]+)px\)/)
  return match ? parseFloat(match[1]) : 0
}

function parseScale(transform) {
  if (!transform || transform === 'none') return 1
  const match = transform.match(/matrix\(([^)]+)\)/)
  if (!match) return 1
  const scale = parseFloat(match[1].split(',')[0])
  return Number.isFinite(scale) ? Math.abs(scale) : 1
}

function preloadImageUrl(url, timeoutMs = 8000) {
  if (!url) return Promise.resolve(false)
  return Promise.race([
    new Promise((resolve) => {
      const img = new Image()
      const finish = (ok) => resolve(ok)
      img.onload = () => finish(true)
      img.onerror = () => finish(false)
      img.src = url
      if (img.complete && img.naturalWidth > 0) finish(true)
    }),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs))
  ])
}

const lockedExportSaved = new WeakMap()
const LOCKED_EXPORT_CONCURRENCY = 2

async function mapWithConcurrency(items, concurrency, worker) {
  if (!items.length) return []
  const results = new Array(items.length)
  let nextIndex = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

function findBlurredCoverPlaceholder(card) {
  const cover = card.querySelector('[data-gallery-cover], [data-memo-cover]')
  if (!cover) return null
  const galleryTitle = cover.querySelector('[data-gallery-cover-title]')
  if (galleryTitle && hasBlurFilter(galleryTitle)) return galleryTitle
  for (const el of cover.children) {
    if (el.tagName === 'IMG') continue
    if (hasBlurFilter(el)) return el
  }
  return null
}

function cardNeedsLockedExportPrep(card) {
  const coverImg = card.querySelector('[data-gallery-cover] img, [data-memo-cover] img')
  const titleBar = card.querySelector('[data-gallery-title-bar], [data-memo-title-bar]')
  const coverPlaceholder = findBlurredCoverPlaceholder(card)
  return (
    (coverImg && hasBlurFilter(coverImg)) ||
    (titleBar && hasBlurFilter(titleBar)) ||
    Boolean(coverPlaceholder)
  )
}

async function bakeCoverBlurCached(imgEl, cache) {
  const key = imgEl.getAttribute('src') || imgEl.getAttribute('data-cover-url') || ''
  if (key && cache.has(key)) return cache.get(key)
  const baked = await bakeBlurredImageSrc(imgEl)
  if (key && baked) cache.set(key, baked)
  return baked
}

async function prepareLockedCard(card, coverBlurCache) {
  const saved = []

  const coverImg = card.querySelector('[data-gallery-cover] img, [data-memo-cover] img')
  if (coverImg && hasBlurFilter(coverImg)) {
    const baked = await bakeCoverBlurCached(coverImg, coverBlurCache)
    saved.push({
      el: coverImg,
      src: coverImg.getAttribute('src') || coverImg.src,
      filter: coverImg.style.filter,
      transform: coverImg.style.transform,
      webkitFilter: coverImg.style.webkitFilter
    })
    if (baked) {
      coverImg.src = baked
      coverImg.style.filter = 'none'
      coverImg.style.webkitFilter = 'none'
      coverImg.style.transform = 'none'
    }
  } else {
    const coverPlaceholder = findBlurredCoverPlaceholder(card)
    if (coverPlaceholder) {
      const baked = await bakeBlurredLayerSnapshot(coverPlaceholder)
      saved.push({
        el: coverPlaceholder,
        filter: coverPlaceholder.style.filter,
        webkitFilter: coverPlaceholder.style.webkitFilter,
        transform: coverPlaceholder.style.transform,
        overflow: coverPlaceholder.style.overflow,
        color: coverPlaceholder.style.color,
        innerHTML: coverPlaceholder.innerHTML
      })
      if (baked) {
        const rect = coverPlaceholder.getBoundingClientRect()
        const w = Math.max(1, Math.round(rect.width))
        const h = Math.max(1, Math.round(rect.height))
        coverPlaceholder.style.filter = 'none'
        coverPlaceholder.style.webkitFilter = 'none'
        coverPlaceholder.style.transform = 'none'
        coverPlaceholder.style.overflow = 'hidden'
        coverPlaceholder.style.color = 'transparent'
        coverPlaceholder.innerHTML = `<img src="${baked}" alt="" style="display:block;position:absolute;inset:0;width:${w}px;height:${h}px;object-fit:fill" />`
        coverPlaceholder.style.position = 'relative'
      }
    }
  }

  const titleBar = card.querySelector('[data-gallery-title-bar], [data-memo-title-bar]')
  if (titleBar && hasBlurFilter(titleBar)) {
    // 표지 스냅샷이 작품명 영역에 섞이지 않도록 텍스트 전용 bake 우선
    const baked =
      (await bakeBlurredTitleBarSnapshot(titleBar)) || (await bakeBlurredLayerSnapshot(titleBar))
    saved.push({
      el: titleBar,
      filter: titleBar.style.filter,
      webkitFilter: titleBar.style.webkitFilter,
      transform: titleBar.style.transform,
      overflow: titleBar.style.overflow,
      color: titleBar.style.color,
      innerHTML: titleBar.innerHTML,
      titleBlurBakeAttr: titleBar.getAttribute('data-export-title-blur-bake')
    })
    if (baked) {
      applyBlurBakeToTitleBar(titleBar, { titleBar: baked }, document, titleBar)
    }
  }

  return saved
}

async function prepareLockedCardsForExport(root, options = {}) {
  const cards = [...root.querySelectorAll('[data-gallery-card-export], [data-memo-card-export]')].filter(
    cardNeedsLockedExportPrep
  )
  if (!cards.length) return []

  const coverBlurCache = new Map()
  const saved = []
  let prepared = 0
  const total = cards.length

  await mapWithConcurrency(cards, LOCKED_EXPORT_CONCURRENCY, async (card) => {
    const cardSaved = await prepareLockedCard(card, coverBlurCache)
    saved.push(...cardSaved)
    prepared += 1
    if (prepared === 1 || prepared % 8 === 0 || prepared === total) {
      await notifyProgress(options.onProgress, {
        label: `잠금 카드 준비 중… (${prepared}/${total})`,
        percent: 10 + Math.round((prepared / total) * 10)
      })
    }
    if (prepared % 16 === 0) await yieldToMain()
  })

  lockedExportSaved.set(root, saved)
  return saved
}

function restoreLockedCardsForExport(root) {
  const saved = lockedExportSaved.get(root)
  if (!saved?.length) return
  saved.forEach(
    ({ el, src, filter, webkitFilter, transform, overflow, color, innerHTML, titleBlurBakeAttr }) => {
      if (!el) return
      if (src !== undefined) el.src = src
      if (filter !== undefined) el.style.filter = filter
      if (webkitFilter !== undefined) el.style.webkitFilter = webkitFilter
      if (transform !== undefined) el.style.transform = transform
      if (overflow !== undefined) el.style.overflow = overflow
      if (color !== undefined) el.style.color = color
      if (innerHTML !== undefined) el.innerHTML = innerHTML
      if (titleBlurBakeAttr !== undefined) {
        if (titleBlurBakeAttr == null) el.removeAttribute('data-export-title-blur-bake')
        else el.setAttribute('data-export-title-blur-bake', titleBlurBakeAttr)
      } else if (innerHTML !== undefined) {
        el.removeAttribute('data-export-title-blur-bake')
      }
    }
  )
  lockedExportSaved.delete(root)
}

export function restoreAllLockedExportCards() {
  document
    .querySelectorAll('[data-gallery-export-root], [data-memo-export-root], [data-record-export-root]')
    .forEach((root) => restoreLockedCardsForExport(root))
}

function rowNeedsLockedExportPrep(row) {
  if (!row || row.getAttribute('aria-hidden') === 'true') return false
  return hasBlurFilter(row)
}

async function prepareLockedRowsForExport(root, options = {}) {
  const rows = [...root.querySelectorAll('tbody tr')].filter(rowNeedsLockedExportPrep)
  if (!rows.length) return []

  const saved = []
  let prepared = 0
  const total = rows.length

  for (const row of rows) {
    prepared += 1
    if (prepared === 1 || prepared % 6 === 0 || prepared === total) {
      await notifyProgress(options.onProgress, {
        label: `잠금 행 준비 중… (${prepared}/${total})`,
        percent: 10 + Math.round((prepared / total) * 10)
      })
    }

    const baked = await bakeBlurredLayerSnapshot(row)
    const rect = row.getBoundingClientRect()
    const colSpan =
      row.closest('table')?.querySelector('thead tr')?.children.length || row.children.length

    saved.push({
      el: row,
      innerHTML: row.innerHTML,
      filter: row.style.filter,
      webkitFilter: row.style.webkitFilter
    })

    if (baked && rect.width > 0 && rect.height > 0) {
      row.innerHTML = ''
      row.style.filter = 'none'
      row.style.webkitFilter = 'none'
      const td = document.createElement('td')
      td.colSpan = colSpan
      td.style.padding = '0'
      td.style.border = 'none'
      td.style.lineHeight = '0'
      td.style.verticalAlign = 'middle'
      const img = document.createElement('img')
      img.src = baked
      img.alt = ''
      img.style.display = 'block'
      img.style.width = `${Math.max(1, Math.round(rect.width))}px`
      img.style.height = `${Math.max(1, Math.round(rect.height))}px`
      img.style.objectFit = 'fill'
      td.appendChild(img)
      row.appendChild(td)
    }

    if (prepared % 2 === 0) await yieldToMain()
  }

  lockedExportSaved.set(root, saved)
  return saved
}

/** 내보내기 전 표지 URL을 한 번 선로드한 뒤 DOM img에 반영 */
export async function preloadExportImages(root, options = {}) {
  if (!root) return { loaded: 0, total: 0 }

  const { onProgress, timeoutMs = 15000, perImageTimeoutMs = 8000, lockExport = false } = options
  await notifyProgress(onProgress, { label: '이미지 불러오는 중…', percent: 8 })

  hydrateCoverImagesForExport(root)

  const urlToImgs = new Map()
  root.querySelectorAll('img[data-cover-url]').forEach((img) => {
    const url = img.getAttribute('data-cover-url')
    if (!url) return
    if (!urlToImgs.has(url)) urlToImgs.set(url, [])
    urlToImgs.get(url).push(img)
    img.src = url
    img.loading = 'eager'
    img.decoding = 'sync'
  })

  const urls = [...urlToImgs.keys()]
  if (urls.length) {
    const batchSize = lockExport ? 8 : urls.length
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize)
      await Promise.all(batch.map((url) => preloadImageUrl(url, perImageTimeoutMs)))
      if (lockExport) await yieldToMain()
    }
    urlToImgs.forEach((imgs, url) => {
      imgs.forEach((img) => {
        if (!img.src) img.src = url
      })
    })
  }

  await waitForImages(root, timeoutMs)

  await waitForExportTick(48)

  return { loaded: urls.length, total: urls.length }
}

function ensureImageSrc(img) {
  if (!img) return false
  const coverUrl = img.getAttribute('data-cover-url')
  if (!img.getAttribute('src') && !img.src && coverUrl) {
    img.src = coverUrl
    img.loading = 'eager'
    img.decoding = 'sync'
  }
  return Boolean(img.getAttribute('src') || img.src || coverUrl)
}

function waitForImage(img, timeoutMs = 12000) {
  if (!img) return Promise.resolve()
  ensureImageSrc(img)
  if (!img.getAttribute('src') && !img.src) return Promise.resolve()

  if (img.complete && img.naturalWidth > 0) return Promise.resolve()

  return Promise.race([
    new Promise((resolve) => {
      if (img.complete && img.naturalWidth > 0) {
        resolve()
        return
      }
      const done = () => resolve()
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
    }),
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ])
}

async function bakeBlurredImageSrc(imgEl) {
  const cs = getComputedStyle(imgEl)
  const blurPx = parseBlurPx(cs.filter) || 12
  const scaleVal = parseScale(cs.transform) || 1
  ensureImageSrc(imgEl)
  if (!imgEl.getAttribute('src') && !imgEl.src) return null
  await waitForImage(imgEl)
  if (!imgEl.naturalWidth) return null

  const rect = imgEl.getBoundingClientRect()
  const w = Math.max(1, Math.round(rect.width) || imgEl.naturalWidth || 1)
  const h = Math.max(1, Math.round(rect.height) || imgEl.naturalHeight || 1)
  const dpr = 2

  try {
    const canvas = document.createElement('canvas')
    canvas.width = w * dpr
    canvas.height = h * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none'

    const dw = w * scaleVal
    const dh = h * scaleVal
    ctx.drawImage(imgEl, (w - dw) / 2, (h - dh) / 2, dw, dh)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

async function bakeBlurredLayerSnapshot(sourceEl) {
  const cs = getComputedStyle(sourceEl)
  const blurPx = parseBlurPx(cs.filter) || 4
  const scaleVal = parseScale(cs.transform) || 1
  const rect = sourceEl.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return null

  await yieldToMain()

  const savedFilter = sourceEl.style.filter
  const savedWebkitFilter = sourceEl.style.webkitFilter
  sourceEl.style.filter = 'none'
  sourceEl.style.webkitFilter = 'none'

  const { default: html2canvas } = await import('html2canvas')
  let snap = null
  try {
    snap = await withTimeout(
      html2canvas(sourceEl, {
        scale: 1,
        backgroundColor: null,
        logging: false,
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height)
      }),
      10000,
      'blur snapshot timeout'
    )
  } catch {
    return null
  } finally {
    sourceEl.style.filter = savedFilter
    sourceEl.style.webkitFilter = savedWebkitFilter
  }
  if (!snap) return null

  const canvas = document.createElement('canvas')
  canvas.width = snap.width
  canvas.height = snap.height
  const ctx = canvas.getContext('2d')
  ctx.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none'
  if (scaleVal !== 1) {
    const dw = snap.width * scaleVal
    const dh = snap.height * scaleVal
    ctx.drawImage(snap, (snap.width - dw) / 2, (snap.height - dh) / 2, dw, dh)
  } else {
    ctx.drawImage(snap, 0, 0)
  }

  await yieldToMain()
  return canvas.toDataURL('image/png')
}

function wrapExportTitleLines(ctx, text, maxWidth, maxLines = 2) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim()
  if (!raw) return []
  const words = raw.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next
      continue
    }
    lines.push(current)
    current = word
    if (lines.length >= maxLines) break
  }
  if (lines.length < maxLines && current) lines.push(current)
  return lines.slice(0, maxLines)
}

/**
 * 잠금 카드 작품명 전용 — 표지 픽셀이 섞이지 않도록
 * 타이틀 바 배경 + 텍스트만 캔버스에 그려 블러 bake
 */
async function bakeBlurredTitleBarSnapshot(titleBar) {
  if (!titleBar) return null
  const cs = getComputedStyle(titleBar)
  const blurPx = parseBlurPx(cs.filter) || 4
  const rect = titleBar.getBoundingClientRect()
  const w = Math.max(1, Math.round(rect.width))
  const h = Math.max(1, Math.round(rect.height))
  if (w < 2 || h < 2) return null

  const textEl =
    titleBar.querySelector('[data-gallery-title], [data-inline-edit], [data-memo-title], span, p') ||
    null
  const textCs = textEl ? getComputedStyle(textEl) : cs
  const text = String(textEl?.innerText || textEl?.textContent || '').replace(/\s+/g, ' ').trim()

  const dpr = 2
  const canvas = document.createElement('canvas')
  canvas.width = w * dpr
  canvas.height = h * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const theme = getThemeColors()
  const bg =
    toSafeCssColor(cs.backgroundColor, 'backgroundColor') ||
    theme?.bgSubPanel ||
    '#F5F1E5'
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  if (!text) {
    await yieldToMain()
    return canvas.toDataURL('image/png')
  }

  const padL = Number.parseFloat(cs.paddingLeft) || 8
  const padR = Number.parseFloat(cs.paddingRight) || 8
  const padT = Number.parseFloat(cs.paddingTop) || 8
  const fontSize = textCs.fontSize || '12px'
  const fontWeight = textCs.fontWeight || '500'
  const fontFamily = textCs.fontFamily || 'sans-serif'
  const color = toSafeCssColor(textCs.color, 'color') || theme?.text || '#745039'
  const align = textCs.textAlign === 'center' || textCs.textAlign === 'right' ? textCs.textAlign : 'left'
  const lineHeightRaw = Number.parseFloat(textCs.lineHeight)
  const fontPx = Number.parseFloat(fontSize) || 12
  const lineHeight = Number.isFinite(lineHeightRaw) ? lineHeightRaw : fontPx * 1.35
  const maxWidth = Math.max(1, w - padL - padR)

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()
  if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`
  ctx.fillStyle = color
  ctx.font = `${fontWeight} ${fontSize} ${fontFamily}`
  ctx.textBaseline = 'top'
  ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'
  const x = align === 'center' ? w / 2 : align === 'right' ? w - padR : padL
  const lines = wrapExportTitleLines(ctx, text, maxWidth, 2)
  let y = padT
  for (const line of lines) {
    ctx.fillText(line, x, y, maxWidth)
    y += lineHeight
  }
  ctx.restore()

  await yieldToMain()
  return canvas.toDataURL('image/png')
}

function isTitleBarBlurBaked(titleBar) {
  return Boolean(
    titleBar?.hasAttribute?.('data-export-title-blur-bake') ||
      titleBar?.querySelector?.('img[data-export-title-blur-bake]')
  )
}

async function buildMemoCardBlurBakes(sourceCard) {
  const bakes = { coverImg: null, coverPlaceholder: null, titleBar: null }
  const cover = sourceCard.querySelector('[data-memo-cover]')
  if (cover) {
    const img = cover.querySelector('img')
    if (img && hasBlurFilter(img)) {
      bakes.coverImg = await bakeBlurredImageSrc(img)
    }
  }
  return bakes
}

async function buildGalleryCardBlurBakes(sourceCard) {
  const bakes = { coverImg: null, coverPlaceholder: null, titleBar: null }
  const cover = sourceCard.querySelector('[data-gallery-cover]')
  if (!cover) return bakes
  const img = cover.querySelector('img')
  if (img && hasBlurFilter(img)) {
    bakes.coverImg = await bakeBlurredImageSrc(img)
  }
  return bakes
}

function applyBlurBakeToCover(clonedCover, bakes, doc) {
  if (!clonedCover || !bakes) return

  if (bakes.coverImg) {
    const cloneImg = clonedCover.querySelector('img')
    if (cloneImg) {
      cloneImg.src = bakes.coverImg
      cloneImg.style.filter = 'none'
      cloneImg.style.webkitFilter = 'none'
      cloneImg.style.transform = 'none'
    }
  }

  if (bakes.coverPlaceholder) {
    const placeholder = [...clonedCover.children].find((c) => !c.hasAttribute('data-memo-gradient'))
    if (placeholder) {
      const img = doc.createElement('img')
      img.src = bakes.coverPlaceholder
      img.alt = ''
      img.style.position = 'absolute'
      img.style.inset = '0'
      img.style.width = '100%'
      img.style.height = '100%'
      img.style.objectFit = 'cover'
      img.style.display = 'block'
      placeholder.replaceWith(img)
    }
  }
}

function applyBlurBakeToTitleBar(clonedBar, bakes, doc, sourceBar) {
  if (!clonedBar || !bakes?.titleBar) return
  const rect = sourceBar?.getBoundingClientRect() || clonedBar.getBoundingClientRect()
  const w = Math.max(1, Math.round(rect.width))
  const h = Math.max(1, Math.round(rect.height))
  clonedBar.innerHTML = ''
  clonedBar.setAttribute('data-export-title-blur-bake', '1')
  clonedBar.style.filter = 'none'
  clonedBar.style.webkitFilter = 'none'
  clonedBar.style.transform = 'none'
  clonedBar.style.overflow = 'hidden'
  clonedBar.style.padding = '0'
  clonedBar.style.border = 'none'
  clonedBar.style.position = 'relative'
  clonedBar.style.boxSizing = 'border-box'
  clonedBar.style.width = `${w}px`
  clonedBar.style.minWidth = `${w}px`
  clonedBar.style.height = `${h}px`
  clonedBar.style.minHeight = `${h}px`
  clonedBar.style.maxHeight = `${h}px`
  const img = doc.createElement('img')
  img.src = bakes.titleBar
  img.alt = ''
  img.setAttribute('data-export-title-blur-bake', '1')
  img.setAttribute('draggable', 'false')
  img.style.display = 'block'
  img.style.position = 'absolute'
  img.style.inset = '0'
  img.style.width = `${w}px`
  img.style.height = `${h}px`
  img.style.objectFit = 'fill'
  img.style.objectPosition = 'center'
  img.style.pointerEvents = 'none'
  clonedBar.appendChild(img)
}

function fixMemoTitleBarExport(sourceCard, clonedCard, blurBakes, doc) {
  const origBars = sourceCard.querySelectorAll('[data-memo-title-bar]')
  clonedCard.querySelectorAll('[data-memo-title-bar]').forEach((bar, i) => {
    const origBar = origBars[i]
    if (!origBar) return

    bar.style.overflow = 'visible'
    bar.style.borderBottom = 'none'
    bar.style.borderTop = 'none'
    bar.style.boxSizing = 'border-box'

    if (blurBakes?.titleBar) {
      applyBlurBakeToTitleBar(bar, blurBakes, doc, origBar)
      return
    }

    if (isTitleBarBlurBaked(origBar)) {
      const bakedSrc =
        origBar.querySelector('img[data-export-title-blur-bake]')?.src ||
        origBar.querySelector('img')?.src
      if (bakedSrc) {
        applyBlurBakeToTitleBar(bar, { titleBar: bakedSrc }, doc, origBar)
      }
      return
    }

    if (hasBlurFilter(origBar)) {
      bar.style.filter = getComputedStyle(origBar).filter
      bar.style.transform = getComputedStyle(origBar).transform
    }

    const origTitle = origBar.querySelector('[data-memo-title]')
    const cloneTitle = bar.querySelector('[data-memo-title]')
    const barRect = origBar.getBoundingClientRect()

    if (!cloneTitle) return

    const exportTitleSize = resolveExportTitleSizeKey(
      sourceCard.closest('[data-export-title-size]')?.getAttribute('data-export-title-size')
    )
    const textAlign = resolveExportTitleTextAlign(origBar, origTitle)
    fixExportTextClipping(cloneTitle, origTitle, {
      lineHeight: '1.35',
      whiteSpace: 'normal',
      textAlign,
      offsetY: 0
    })
    forceExportTitleTextStyle(cloneTitle, exportTitleSize)
    applyExportTitleBoxScreenSync(bar, cloneTitle, { textAlign })
    if (!sourceCard.hasAttribute('data-maintain-layout')) {
      forceExportTitleBarFlexible(bar, exportTitleSize)
    }
    bar.style.minHeight = `${Math.max(Math.ceil(barRect.height), GALLERY_TITLE_BAR_PX)}px`
  })
}

function fixMemoV2PanelForExport(clonePanel, origPanel, origText, maintainLayout = false, cardWidth = 0) {
  if (!clonePanel || !origPanel) return

  const cloneText = clonePanel.querySelector('[data-memo-text]')
  if (maintainLayout) {
    const metrics = computeMemoV2StructuralMetrics(
      cardWidth ||
        origPanel.closest('[data-memo-card-export]')?.getBoundingClientRect().width ||
        origPanel.getBoundingClientRect().width
    )
    const { textMaxHeight } = metrics

    if (cloneText && origText) {
      cloneText.style.fontSize = MEMO_EXPORT_FONT_PX()
      applyMemoV2ExportTextClip(cloneText, textMaxHeight)
      cloneText.style.textAlign = origText ? getComputedStyle(origText).textAlign : 'center'

      const colorMode = origText.getAttribute('data-memo-color')
      if (colorMode === 'theme') {
        const cs = getComputedStyle(origText)
        const safeColor = toSafeCssColor(cs.color, 'color')
        if (safeColor) cloneText.style.color = safeColor
      }
    }

    const cloneOuter = clonePanel.parentElement
    setCloneMemoV2ExportTextBoxPadding(clonePanel, cloneOuter)
    if (cloneOuter) cloneOuter.style.overflow = 'hidden'

    applyMemoV2PanelExportBackground(clonePanel, origPanel)
    return
  }

  if (cloneText && origText) {
    fixExportTextClipping(cloneText, origText, {
      keepLineClamp: false,
      lineHeight: '1.45'
    })
    cloneText.style.height = 'auto'
    cloneText.style.minHeight = '0'
    cloneText.style.margin = '0'
    cloneText.style.padding = '0'
    cloneText.style.fontSize = MEMO_EXPORT_FONT_PX()

    const colorMode = origText.getAttribute('data-memo-color')
    if (colorMode === 'theme') {
      const cs = getComputedStyle(origText)
      const safeColor = toSafeCssColor(cs.color, 'color')
      if (safeColor) cloneText.style.color = safeColor
    }
  }

  const textH = origText ? Math.ceil(origText.scrollHeight) : 0
  const panelH = Math.max(
    Math.ceil(origPanel.getBoundingClientRect().height),
    textH + MEMO_V2_EXPORT_PANEL_PAD_PX * 2,
    1
  )

  clonePanel.style.overflow = 'visible'
  clonePanel.style.maxHeight = 'none'
  clonePanel.style.minHeight = `${panelH}px`
  clonePanel.style.height = 'auto'
  clonePanel.style.display = 'flex'
  clonePanel.style.alignItems = 'center'
  clonePanel.style.justifyContent = 'center'
  clonePanel.style.webkitBoxOrient = 'unset'
  clonePanel.style.webkitLineClamp = 'unset'
  clonePanel.style.lineClamp = 'unset'

  const cloneOuter = clonePanel.parentElement
  setCloneMemoV2ExportTextBoxPadding(clonePanel, cloneOuter)
  applyMemoV2PanelExportBackground(clonePanel, origPanel)

  if (cloneOuter) cloneOuter.style.overflow = 'visible'
}

function fixMemoV2CoverExport(sourceCard, clonedCard, maintainLayout = false) {
  const origCover = sourceCard.querySelector('[data-memo-cover]')
  const cloneCover = clonedCard.querySelector('[data-memo-cover]')
  if (!origCover?.querySelector('[data-memo-panel]') || !cloneCover) return

  const origPanel = origCover.querySelector('[data-memo-panel]')
  const origWrap = origPanel?.parentElement
  const origText = origPanel?.querySelector('[data-memo-text]')
  if (!origPanel || !origWrap) return

  const coverW = Math.max(1, Math.round(origCover.getBoundingClientRect().width))
  const coverH = Math.max(1, Math.round(origCover.getBoundingClientRect().height))

  if (maintainLayout) {
    const cardWidth = Math.max(
      1,
      Math.round(
        sourceCard.querySelector('[data-memo-card-export]')?.getBoundingClientRect().width ||
          sourceCard.getBoundingClientRect().width
      )
    )
    const { cardWidth: w, coverHeight } = computeMemoV2StructuralMetrics(cardWidth)
    cloneCover.style.width = `${w}px`
    cloneCover.style.height = `${coverHeight}px`
    cloneCover.style.minHeight = `${coverHeight}px`
    cloneCover.style.maxHeight = `${coverHeight}px`
    cloneCover.style.overflow = 'hidden'
    cloneCover.style.aspectRatio = 'auto'
    return
  }

  const panelCs = getComputedStyle(origPanel)
  const panelPadY = (parseFloat(panelCs.paddingTop) || 0) + (parseFloat(panelCs.paddingBottom) || 0)
  const textH = origText ? Math.ceil(origText.scrollHeight) : 0
  const panelH = Math.max(Math.ceil(origPanel.getBoundingClientRect().height), textH + panelPadY + 2, 1)
  const wrapCs = getComputedStyle(origWrap)
  const wrapPadY = (parseFloat(wrapCs.paddingTop) || 0) + (parseFloat(wrapCs.paddingBottom) || 0)
  const contentH = Math.ceil(panelH + wrapPadY)
  const expandedCoverH = Math.max(coverH, contentH)

  cloneCover.style.width = `${coverW}px`
  cloneCover.style.height = `${expandedCoverH}px`
  cloneCover.style.minHeight = `${expandedCoverH}px`
  cloneCover.style.maxHeight = `${expandedCoverH}px`
  cloneCover.style.overflow = 'hidden'
  cloneCover.style.aspectRatio = 'auto'
}

function fixMemoTextExport(sourceCard, clonedCard, keepLayout) {
  const origTexts = sourceCard.querySelectorAll('[data-memo-text]')
  clonedCard.querySelectorAll('[data-memo-text]').forEach((el, i) => {
    const orig = origTexts[i]
    const origPanel = orig?.closest('[data-memo-panel]')
    const panel = el.closest('[data-memo-panel]')

    if (panel && origPanel) {
      const cardWidth = sourceCard.querySelector('[data-memo-card-export]')?.getBoundingClientRect().width
      fixMemoV2PanelForExport(panel, origPanel, orig, keepLayout, cardWidth)
      return
    }

    fixExportTextClipping(el, orig, {
      keepLineClamp: keepLayout,
      lineHeight: '1.5'
    })
    el.style.fontSize = MEMO_EXPORT_FONT_PX()

    const colorMode = orig?.getAttribute('data-memo-color')
    if (colorMode === 'theme' && orig) {
      const cs = getComputedStyle(orig)
      const safeColor = toSafeCssColor(cs.color, 'color')
      if (safeColor) el.style.color = safeColor
    }

    const wrap = el.closest('[data-memo-text-wrap]')
    const origWrap = orig?.closest('[data-memo-text-wrap]')
    if (!wrap || !origWrap) return

    const wrapCs = getComputedStyle(origWrap)
    wrap.style.position = 'absolute'
    wrap.style.left = '0'
    wrap.style.right = '0'
    wrap.style.top = '0'
    wrap.style.zIndex = '5'
    wrap.style.boxSizing = 'border-box'
    wrap.style.padding = wrapCs.padding
    wrap.style.pointerEvents = 'none'
    wrap.style.display = 'block'
    wrap.style.webkitBoxOrient = 'unset'
    wrap.style.webkitLineClamp = 'unset'
    wrap.style.lineClamp = 'unset'

    if (keepLayout) {
      const cover = orig?.closest('[data-memo-cover]')
      const coverH = cover ? cover.getBoundingClientRect().height : 0
      const maxH = coverH
        ? Math.max(Math.ceil(coverH * MEMO_GRADIENT_COVER_RATIO) + 4, 1)
        : Math.max(Math.ceil(origWrap.getBoundingClientRect().height), 1)
      wrap.style.maxHeight = `${maxH}px`
      wrap.style.height = `${maxH}px`
      wrap.style.overflow = 'hidden'
      el.style.display = '-webkit-box'
      el.style.webkitBoxOrient = 'vertical'
      el.style.webkitLineClamp = '7'
      el.style.lineClamp = '7'
      el.style.overflow = 'hidden'
      el.style.maxHeight = `${Math.max(maxH - 8, 1)}px`
    } else {
      wrap.style.maxHeight = 'none'
      wrap.style.overflow = 'visible'
    }
  })
}

function syncMemoCoverVisualEffects(sourceCover, clonedCover) {
  if (!sourceCover || !clonedCover) return

  clonedCover.style.overflow = 'hidden'

  const syncNode = (origNode, cloneNode) => {
    if (!origNode || !cloneNode) return
    const cs = getComputedStyle(origNode)
    if (cs.filter && cs.filter !== 'none') {
      cloneNode.style.filter = cs.filter
      cloneNode.style.webkitFilter = cs.filter
    }
    if (cs.transform && cs.transform !== 'none') {
      cloneNode.style.transform = cs.transform
    }
  }

  syncNode(sourceCover.querySelector('img'), clonedCover.querySelector('img'))

  const origChildren = [...sourceCover.children].filter((c) => !c.hasAttribute('data-memo-gradient'))
  const cloneChildren = [...clonedCover.children].filter((c) => !c.hasAttribute('data-memo-gradient'))
  origChildren.forEach((origChild, i) => syncNode(origChild, cloneChildren[i]))
}

function fixMemoV1CardChromeExport(sourceCard, clonedCard) {
  const origTitleBar = sourceCard.querySelector('[data-memo-title-bar]')
  const origCover = sourceCard.querySelector('[data-memo-cover]')
  if (!origTitleBar || !origCover) return
  if (!(origTitleBar.compareDocumentPosition(origCover) & Node.DOCUMENT_POSITION_FOLLOWING)) return

  const safeBorder =
    toSafeCssColor(getComputedStyle(sourceCard).borderTopColor, 'borderColor') || '#E8E2D6'
  const radiusPx = getExportCardRadiusPx()
  const uiStyle = getLiveUiStyle()
  const themeSubPanel = getThemeColors()?.bgSubPanel || '#F5F1E5'
  const computedTitleBg = toSafeCssColor(
    getComputedStyle(origTitleBar).backgroundColor,
    'backgroundColor'
  )
  /* 기본 모드: 테마 서브패널색 우선(라이브 bake로 흰값이 들어와도 덮어씀) */
  const subPanelBg =
    uiStyle === 'default' ? themeSubPanel : computedTitleBg || themeSubPanel

  clonedCard.style.outline = 'none'
  clonedCard.style.borderRadius = `${radiusPx}px`
  clonedCard.style.overflow = 'hidden'
  clonedCard.style.display = 'flex'
  clonedCard.style.flexDirection = 'column'

  /* default: 테마 카드색·테두리 유지 (작품명 바는 서브패널색) */
  if (uiStyle === 'default') {
    const themeCardBg = getThemeColors()?.bgCard || '#ffffff'
    const themeBorder = getThemeColors()?.border || safeBorder
    clonedCard.style.setProperty('background', themeCardBg, 'important')
    clonedCard.style.setProperty('background-color', themeCardBg, 'important')
    clonedCard.style.setProperty('border', `1px solid ${themeBorder}`, 'important')
    clonedCard.style.setProperty('border-color', themeBorder, 'important')
    clonedCard.style.boxShadow = 'none'
  } else {
    clonedCard.style.border = `${uiStyle === 'retro' ? 2 : 1}px solid ${safeBorder}`
    clonedCard.style.borderColor = safeBorder
  }

  const cloneTitleBar = clonedCard.querySelector('[data-memo-title-bar]')
  if (cloneTitleBar) {
    cloneTitleBar.style.border = 'none'
    cloneTitleBar.style.borderBottom = 'none'
    cloneTitleBar.style.borderTop = 'none'
    cloneTitleBar.style.outline = 'none'
    cloneTitleBar.style.boxShadow = 'none'
    cloneTitleBar.style.marginBottom = '0'
    cloneTitleBar.style.flex = `0 0 ${GALLERY_TITLE_BAR_PX}px`
    cloneTitleBar.style.flexShrink = '0'
    cloneTitleBar.style.borderTopLeftRadius = `${radiusPx}px`
    cloneTitleBar.style.borderTopRightRadius = `${radiusPx}px`
    cloneTitleBar.style.setProperty('background', subPanelBg, 'important')
    cloneTitleBar.style.setProperty('background-color', subPanelBg, 'important')
  }

  const cloneCover = clonedCard.querySelector('[data-memo-cover]')
  if (cloneCover) {
    cloneCover.style.border = 'none'
    cloneCover.style.outline = 'none'
    cloneCover.style.boxShadow = 'none'
    cloneCover.style.marginTop = '0'
    cloneCover.style.marginBottom = '0'
    cloneCover.style.paddingTop = '0'
    cloneCover.style.paddingBottom = '0'
    cloneCover.style.overflow = 'hidden'
    cloneCover.style.flex = '1 1 auto'
    cloneCover.style.flexGrow = '1'
    cloneCover.style.flexShrink = '0'
    /* 하단 라운드는 카드 clip만 — 중첩 radius 출력 잔선 방지 */
    cloneCover.style.borderBottomLeftRadius = '0'
    cloneCover.style.borderBottomRightRadius = '0'
  }
}

function fixMemoCardExport(sourceCard, clonedCard, blurBakes, clonedDoc) {
  if (!sourceCard || !clonedCard) return
  const inner = sourceCard.querySelector('[data-memo-card-export]')
  const maintainLayout = inner?.hasAttribute('data-maintain-layout')
  const hasV2Panel = Boolean(sourceCard.querySelector('[data-memo-panel]'))
  fixCardExportDimensions(sourceCard, clonedCard)
  if (!maintainLayout) relaxCardExportHeight(sourceCard, clonedCard)
  if (!maintainLayout || !hasV2Panel) {
    fixCardCoverAspect(sourceCard, clonedCard, '[data-memo-cover]')
  }
  fixMemoV1CardChromeExport(sourceCard, clonedCard)

  const doc = clonedDoc || clonedCard.ownerDocument
  const origCovers = sourceCard.querySelectorAll('[data-memo-cover]')
  clonedCard.querySelectorAll('[data-memo-cover]').forEach((el, i) => {
    if (blurBakes?.coverImg || blurBakes?.coverPlaceholder) {
      applyBlurBakeToCover(el, blurBakes, doc)
    } else {
      syncMemoCoverVisualEffects(origCovers[i], el)
    }
  })

  const origGradients = sourceCard.querySelectorAll('[data-memo-gradient]')
  clonedCard.querySelectorAll('[data-memo-gradient]').forEach((el, i) => {
    const orig = origGradients[i]
    if (!orig) return
    applyMemoGradientExport(orig, el, doc)
  })

  fixMemoTitleBarExport(sourceCard, clonedCard, blurBakes, doc)
  fixMemoTextExport(sourceCard, clonedCard, maintainLayout)

  if (sourceCard.querySelector('[data-memo-panel]')) {
    fixMemoV2CoverExport(sourceCard, clonedCard, maintainLayout)
    if (!maintainLayout) relaxCardExportHeight(sourceCard, clonedCard)
  }

  applyDefaultModeExportCardChrome(clonedCard, null)
}

function fixRecordStarRatings(sourceEl, clonedRoot) {
  if (!sourceEl?.hasAttribute('data-record-export-root') || !clonedRoot) return

  const origRoots = sourceEl.querySelectorAll('[data-star-rating]')
  const cloneRoots = clonedRoot.querySelectorAll('[data-star-rating]')

  cloneRoots.forEach((root, ri) => {
    const origRoot = origRoots[ri]
    if (!origRoot) return

    const origSvgs = origRoot.querySelectorAll('svg')
    const cloneSvgs = root.querySelectorAll('svg')

    cloneSvgs.forEach((svg, i) => {
      const origSvg = origSvgs[i]
      if (!origSvg) return
      const cs = getComputedStyle(origSvg)
      const color = toSafeCssColor(cs.color, 'color')
      const rawFill = cs.fill
      const rawStroke = cs.stroke
      const resolvedFill =
        rawFill && rawFill !== 'none'
          ? toSafeCssColor(rawFill, 'color') || color || '#fbbf24'
          : 'none'
      const resolvedStroke =
        rawStroke && rawStroke !== 'none'
          ? toSafeCssColor(rawStroke, 'color') || color || '#d1d5db'
          : color || '#d1d5db'

      svg.style.fill = resolvedFill
      svg.style.stroke = resolvedStroke
      svg.style.color = color || resolvedStroke
      svg.setAttribute('fill', resolvedFill)
      svg.setAttribute('stroke', resolvedStroke)

      svg.querySelectorAll('path, polygon, circle, line, polyline').forEach((node) => {
        node.style.fill = resolvedFill
        node.style.stroke = resolvedStroke
        node.setAttribute('fill', resolvedFill)
        node.setAttribute('stroke', resolvedStroke)
      })
    })
  })
}

/** 기록 내보내기 텍스트 — 띄어쓰기 기준 줄바꿈, 단어 중간 끊김 방지 */
function applyRecordExportTextWrapProps(el) {
  if (!el) return
  el.style.setProperty('word-break', 'keep-all', 'important')
  el.style.setProperty('overflow-wrap', 'break-word', 'important')
  el.style.setProperty('white-space', 'normal', 'important')
  el.style.setProperty('max-width', 'none', 'important')
  el.style.setProperty('overflow', 'visible', 'important')
  el.style.setProperty('text-overflow', 'clip', 'important')
}

function applyPlainTagTextStyle(el, origRef) {
  const sample = origRef.querySelector('[data-tag-badge]') || origRef
  const cs = getComputedStyle(sample)
  const td = origRef.closest?.('td') || (origRef.tagName === 'TD' ? origRef : null)
  const tdCs = getComputedStyle(td || origRef)

  /* 배경색 제거(텍스트만) — 기존 규칙 유지 */
  el.style.background = 'transparent'
  el.style.backgroundColor = 'transparent'
  el.style.border = '0'
  el.style.borderRadius = '0'
  el.style.padding = '0'
  el.style.margin = '0'
  el.style.boxSizing = 'border-box'
  el.style.lineHeight = '1.4'
  el.style.fontSize = cs.fontSize || tdCs.fontSize || '12px'
  el.style.fontWeight = cs.fontWeight || '400'
  el.style.color = toSafeCssColor(tdCs.color, 'color') || '#745039'
  el.style.textAlign = 'left'
  el.style.verticalAlign = 'middle'

  el.style.setProperty('display', 'block', 'important')
  el.style.setProperty('width', '100%', 'important')
  el.style.setProperty('min-width', '0', 'important')
  el.style.setProperty('height', 'auto', 'important')
  el.style.setProperty('max-height', 'none', 'important')
  applyRecordExportTextWrapProps(el)

  if (td) {
    applyRecordExportTextWrapProps(td)
    td.style.height = 'auto'
    td.style.maxHeight = 'none'
    td.style.verticalAlign = 'middle'
  }

  const wrap = el.closest?.('[data-inline-edit]')
  if (wrap && wrap !== el) {
    wrap.style.setProperty('display', 'block', 'important')
    wrap.style.setProperty('width', '100%', 'important')
    applyRecordExportTextWrapProps(wrap)
    wrap.style.background = 'transparent'
    wrap.style.padding = '0'
    wrap.style.margin = '0'
  }
}

function collectTagLabels(container) {
  const badges = container.querySelectorAll('[data-tag-badge]')
  if (badges.length) {
    return [...badges].map((badge) => badge.textContent.trim()).filter(Boolean)
  }
  const text = container.textContent.trim()
  if (!text || text === '—') return []
  return [text]
}

function flattenRecordTagsForExport(root, saved) {
  saved.tagFlattens = saved.tagFlattens || []

  root.querySelectorAll('[data-inline-edit]').forEach((cell) => {
    if (cell.querySelector('[data-record-date]') || cell.closest('[data-record-date-col]')) return
    if (cell.closest('[data-record-oneline-col]')) return
    if (cell.closest('[data-record-title-col]')) return
    const labels = collectTagLabels(cell)
    const btn = cell.querySelector('button')
    const target = btn || cell
    saved.tagFlattens.push({
      target,
      html: target.innerHTML,
      className: target.getAttribute('class'),
      style: target.getAttribute('style')
    })
    target.replaceChildren()
    target.textContent = labels.length ? labels.join(', ') : '—'
    applyPlainTagTextStyle(target, cell)
    if (btn) btn.className = ''
  })

  root.querySelectorAll('td').forEach((td) => {
    if (td.querySelector('[data-inline-edit]')) return
    if (!td.querySelector('[data-tag-badge]')) return
    const labels = collectTagLabels(td)
    saved.tagFlattens.push({
      target: td,
      html: td.innerHTML,
      className: td.getAttribute('class'),
      style: td.getAttribute('style')
    })
    td.replaceChildren()
    td.textContent = labels.length ? labels.join(', ') : '—'
    applyPlainTagTextStyle(td, td)
  })
}

function restoreRecordTagTextExport(saved) {
  saved?.tagFlattens?.forEach(({ target, html, className, style }) => {
    if (!target) return
    target.innerHTML = html
    if (className == null) target.removeAttribute('class')
    else target.setAttribute('class', className)
    if (style == null) target.removeAttribute('style')
    else target.setAttribute('style', style)
  })
}

function hideRecordLinkColumns(root, saved) {
  if (!root) return
  saved.hiddenCols = saved.hiddenCols || []
  root.querySelectorAll('[data-record-link-col]').forEach((el) => {
    saved.hiddenCols.push({ el, display: el.style.display })
    el.style.display = 'none'
  })
}

function restoreRecordLinkColumns(saved) {
  saved?.hiddenCols?.forEach(({ el, display }) => {
    if (!el) return
    el.style.display = display
  })
}

function applyRecordExportTextOffset(root) {
  if (!root) return

  root.querySelectorAll('tbody td').forEach((td) => {
    if (td.querySelector('[data-star-rating], [data-record-select]')) return
    if (td.hasAttribute('data-record-date-col') || td.querySelector('[data-record-date]')) return
    if (td.hasAttribute('data-record-oneline-col')) return

    let target =
      td.querySelector('[data-record-title]') ||
      td.querySelector('[data-inline-edit] span, [data-inline-edit] button, [data-inline-edit]')

    if (!target && td.childElementCount === 1) target = td.firstElementChild
    if (!target) target = td

    target.style.display = target.style.display || 'block'
    target.style.transform = `translateY(${RECORD_EXPORT_TEXT_OFFSET_Y}px)`
  })
}

function applyRecordTitleExportStyle(root) {
  root.querySelectorAll('[data-record-title-col]').forEach((td) => {
    td.style.verticalAlign = 'top'
    td.style.minWidth = '140px'
    td.style.lineHeight = '1.35'
    td.style.height = 'auto'
    applyRecordExportTextWrapProps(td)
  })

  root.querySelectorAll('[data-record-title]').forEach((titleEl) => {
    titleEl.style.display = 'block'
    titleEl.style.webkitBoxOrient = 'unset'
    titleEl.style.webkitLineClamp = 'unset'
    titleEl.style.lineClamp = 'unset'
    titleEl.style.lineHeight = '1.35'
    titleEl.style.height = 'auto'
    titleEl.style.width = '100%'
    applyRecordExportTextWrapProps(titleEl)
  })

  root.querySelectorAll('[data-record-title-col] [data-inline-edit]').forEach((wrap) => {
    wrap.style.maxHeight = 'none'
    wrap.style.height = 'auto'
    applyRecordExportTextWrapProps(wrap)
  })
}

function applyRecordDateExportStyle(root) {
  root.querySelectorAll('[data-record-date-col]').forEach((td) => {
    td.style.verticalAlign = 'middle'
    td.style.whiteSpace = 'nowrap'
    td.style.overflow = 'visible'
    td.style.minWidth = '136px'
    td.style.maxWidth = 'none'
    td.style.width = 'auto'
    td.style.lineHeight = '1.35'
  })

  root.querySelectorAll('[data-record-date]').forEach((dateEl) => {
    dateEl.style.display = 'inline-block'
    dateEl.style.whiteSpace = 'nowrap'
    dateEl.style.overflow = 'visible'
    dateEl.style.textOverflow = 'clip'
    dateEl.style.lineHeight = '1.35'
    dateEl.style.maxWidth = 'none'
    dateEl.style.width = 'auto'
    dateEl.style.background = 'transparent'
    dateEl.style.border = '0'
    dateEl.style.padding = '0'
    dateEl.style.margin = '0'
    dateEl.style.textAlign = 'left'
    dateEl.style.fontSize = 'inherit'
    dateEl.style.transform = 'none'
    dateEl.style.verticalAlign = 'middle'
  })

  root.querySelectorAll('[data-record-date-col] [data-inline-edit]').forEach((wrap) => {
    wrap.style.overflow = 'visible'
    wrap.style.width = 'auto'
    wrap.style.maxWidth = 'none'
  })
}

function applyRecordStatusExportStyle(root) {
  root.querySelectorAll('[data-record-status-col]').forEach((cell) => {
    cell.style.verticalAlign = 'middle'
    cell.style.minWidth = '72px'
    cell.style.width = 'auto'
    applyRecordExportTextWrapProps(cell)
  })
}

function applyRecordOneLineExportStyle(root) {
  root.querySelectorAll('[data-record-oneline-col]').forEach((cell) => {
    cell.style.verticalAlign = 'top'
    cell.style.lineHeight = '1.35'
    cell.style.width = '25%'
    cell.style.minWidth = '160px'
    applyRecordExportTextWrapProps(cell)
  })

  root.querySelectorAll(
    '[data-record-oneline-col] [data-inline-edit], [data-record-oneline-col] span, [data-record-oneline-col] button'
  ).forEach((el) => {
    el.style.display = 'block'
    el.style.width = '100%'
    el.style.transform = 'none'
    applyRecordExportTextWrapProps(el)
  })

  root.querySelectorAll('[data-record-oneline-col] .truncate').forEach((el) => {
    el.classList.remove('truncate')
    applyRecordExportTextWrapProps(el)
  })
}

/** fixed layout nowrap 이후 — 저자/유형/장르/사이트/제목 등 단어 단위 줄바꿈 재적용 */
function applyRecordExportWordWrapStyle(root) {
  if (!root) return

  root.querySelectorAll('tbody td').forEach((td) => {
    if (td.querySelector('[data-star-rating], [data-record-select]')) return
    if (td.hasAttribute('data-record-date-col') || td.querySelector('[data-record-date]')) return
    if (td.hasAttribute('data-record-link-col')) return

    applyRecordExportTextWrapProps(td)
    td.style.height = 'auto'
    td.style.maxHeight = 'none'
    /* 극단적 폭 수축으로 단어가 세로 쪼개지는 것 방지 */
    if (!td.style.minWidth) td.style.minWidth = '72px'

    td.querySelectorAll(
      '[data-inline-edit], [data-inline-edit] > button, [data-inline-edit] span, [data-record-title]'
    ).forEach((el) => {
      applyRecordExportTextWrapProps(el)
      el.style.setProperty('height', 'auto', 'important')
      el.style.setProperty('max-height', 'none', 'important')
    })
  })
}

function saveRecordExportStyledElements(root, saved) {
  saved.recordExportStyledEls = saved.recordExportStyledEls || []
  root.querySelectorAll('thead th, tbody td, [data-record-title], [data-record-date]').forEach((el) => {
    saved.recordExportStyledEls.push({
      el,
      cssText: el.style.cssText,
      className: el.className
    })
  })
}

function restoreRecordExportStyledElements(saved) {
  saved?.recordExportStyledEls?.forEach(({ el, cssText, className }) => {
    if (!el) return
    el.style.cssText = cssText
    el.className = className
  })
}

function applyRecordFixedTableLayout(root) {
  const table = root?.querySelector('table')
  if (!table) return

  table.style.tableLayout = 'fixed'

  root.querySelectorAll('[data-record-oneline-col]').forEach((cell) => {
    cell.style.width = '25%'
    cell.style.minWidth = '160px'
  })
  root.querySelectorAll('[data-record-title-col]').forEach((cell) => {
    cell.style.width = '18%'
    cell.style.minWidth = '120px'
    cell.style.maxWidth = 'none'
  })
  root.querySelectorAll('[data-record-date-col]').forEach((cell) => {
    cell.style.width = '11%'
    cell.style.minWidth = '120px'
  })
  root.querySelectorAll('[data-record-status-col]').forEach((cell) => {
    cell.style.width = '8%'
    cell.style.minWidth = '72px'
  })

  root.querySelectorAll('thead th, tbody td').forEach((cell) => {
    if (cell.hasAttribute('data-record-title-col')) return
    if (cell.hasAttribute('data-record-oneline-col')) return
    /* 날짜만 한 줄 유지 — 저자/태그 등 텍스트 칸은 단어 단위 줄바꿈 */
    if (cell.hasAttribute('data-record-date-col')) {
      cell.style.overflow = 'hidden'
      cell.style.textOverflow = 'ellipsis'
      cell.style.whiteSpace = 'nowrap'
      return
    }
    cell.style.overflow = 'visible'
    cell.style.textOverflow = 'clip'
    cell.style.whiteSpace = 'normal'
    cell.style.maxWidth = 'none'
  })
}

function applyRecordExportRootWidth(root, width) {
  root.style.width = `${width}px`
  root.style.minWidth = `${width}px`
  root.style.boxSizing = 'border-box'
  root.style.overflowX = 'hidden'
  root.style.overflowY = 'visible'

  const table = root.querySelector('table')
  if (table) {
    table.style.width = `${width}px`
    table.style.minWidth = `${width}px`
    applyRecordFixedTableLayout(root)
    finalizeRecordExportRowLayout(root)
  }
}

function prepareRecordExportLayout(root, saved) {
  saveRecordExportStyledElements(root, saved)
  hideRecordLinkColumns(root, saved)
  applyRecordTitleExportStyle(root)
  applyRecordDateExportStyle(root)
  applyRecordStatusExportStyle(root)
  applyRecordOneLineExportStyle(root)
  applyRecordExportTextOffset(root)

  const table = root.querySelector('table')

  saved.recordExportWidth = {
    el: root,
    width: root.style.width,
    minWidth: root.style.minWidth,
    boxSizing: root.style.boxSizing,
    overflow: root.style.overflow,
    overflowX: root.style.overflowX,
    table,
    tableWidth: table?.style.width ?? '',
    tableMinWidth: table?.style.minWidth ?? '',
    tableLayout: table?.style.tableLayout ?? ''
  }

  applyRecordExportRootWidth(root, RECORD_CAPTURE_WIDTH)
  applyRecordExportWordWrapStyle(root)
}

function restoreRecordExportLayout(saved) {
  restoreRecordLinkColumns(saved)
  restoreRecordExportStyledElements(saved)
  if (saved?.recordExportWidth?.el) {
    const {
      el,
      width,
      minWidth,
      boxSizing,
      overflow,
      overflowX,
      table,
      tableWidth,
      tableMinWidth,
      tableLayout
    } = saved.recordExportWidth
    el.style.width = width
    el.style.minWidth = minWidth
    el.style.boxSizing = boxSizing
    el.style.overflow = overflow
    el.style.overflowX = overflowX
    if (table) {
      table.style.width = tableWidth
      table.style.minWidth = tableMinWidth
      table.style.tableLayout = tableLayout
    }
  }
}

function fixRecordDateExport(sourceEl, clonedRoot) {
  const origDates = sourceEl.querySelectorAll('[data-record-date]')
  clonedRoot.querySelectorAll('[data-record-date]').forEach((cloneDate, i) => {
    const origDate = origDates[i]
    if (!origDate) return
    fixExportTextClipping(cloneDate, origDate, { lineHeight: '1.35', offsetY: 0 })
    cloneDate.style.display = 'inline-block'
    cloneDate.style.whiteSpace = 'nowrap'
    cloneDate.style.overflow = 'visible'
    cloneDate.style.textOverflow = 'clip'
    cloneDate.style.maxWidth = 'none'
    cloneDate.style.width = 'auto'
    cloneDate.style.transform = 'none'
  })

  clonedRoot.querySelectorAll('[data-record-date-col]').forEach((td, i) => {
    const origTd = sourceEl.querySelectorAll('[data-record-date-col]')[i]
    if (!origTd) return
    td.style.overflow = 'visible'
    td.style.whiteSpace = 'nowrap'
    td.style.minWidth = '136px'
    td.style.maxWidth = 'none'
    td.style.width = 'auto'
  })
}

function fixRecordLockedRowsExport(sourceRoot, clonedRoot) {
  if (!sourceRoot?.hasAttribute('data-record-export-root') || !clonedRoot) return

  const sourceRows = [...sourceRoot.querySelectorAll('tbody tr')].filter(
    (row) => row.getAttribute('aria-hidden') !== 'true'
  )
  const cloneRows = [...clonedRoot.querySelectorAll('tbody tr')].filter(
    (row) => row.getAttribute('aria-hidden') !== 'true'
  )

  sourceRows.forEach((sourceRow, index) => {
    const cloneRow = cloneRows[index]
    if (!cloneRow || !hasBlurFilter(sourceRow)) return
    if (cloneRow.querySelector('td img')) return
    const cs = getComputedStyle(sourceRow)
    cloneRow.style.filter = cs.filter
    cloneRow.style.webkitFilter = cs.filter
    if (cs.transform && cs.transform !== 'none') {
      cloneRow.style.transform = cs.transform
    }
  })
}

function fixRecordOneLineExport(sourceEl, clonedRoot) {
  const origCells = sourceEl.querySelectorAll('[data-record-oneline-col]')
  clonedRoot.querySelectorAll('[data-record-oneline-col]').forEach((cell, i) => {
    const orig = origCells[i]
    if (!orig) return
    const text = (orig.textContent || '').trim() || '—'
    cell.replaceChildren()
    cell.textContent = text
    cell.style.whiteSpace = 'pre-wrap'
    cell.style.wordBreak = 'break-word'
    cell.style.overflow = 'visible'
    cell.style.textOverflow = 'clip'
    cell.style.height = 'auto'
    cell.style.maxHeight = 'none'
  })
}

function fixRecordExportLayout(sourceEl, clonedRoot) {
  if (!sourceEl?.hasAttribute('data-record-export-root') || !clonedRoot) return
  hideRecordLinkColumns(clonedRoot, { hiddenCols: [] })
  applyRecordTitleExportStyle(clonedRoot)
  applyRecordDateExportStyle(clonedRoot)
  applyRecordStatusExportStyle(clonedRoot)
  applyRecordOneLineExportStyle(clonedRoot)
  fixRecordOneLineExport(sourceEl, clonedRoot)
  fixRecordDateExport(sourceEl, clonedRoot)
  applyRecordExportTextOffset(clonedRoot)
  fixRecordLockedRowsExport(sourceEl, clonedRoot)
  applyRecordExportRootWidth(clonedRoot, RECORD_CAPTURE_WIDTH)
  applyRecordExportWordWrapStyle(clonedRoot)
}

function fixRecordTagBadges(sourceEl, clonedRoot) {
  if (!clonedRoot || !sourceEl) return

  const isRecordExport = sourceEl.hasAttribute('data-record-export-root')
  if (!isRecordExport && !sourceEl.querySelector('[data-tag-badge]')) return

  const origCells = sourceEl.querySelectorAll('[data-inline-edit]')
  const cloneCells = clonedRoot.querySelectorAll('[data-inline-edit]')
  cloneCells.forEach((cell, i) => {
    const origCell = origCells[i]
    if (!origCell) return
    if (origCell.querySelector('[data-record-date]') || origCell.closest('[data-record-date-col]')) return
    if (origCell.closest('[data-record-oneline-col]')) return
    if (origCell.closest('[data-record-title-col]')) return
    const labels = collectTagLabels(origCell)
    const btn = cell.querySelector('button')
    const target = btn || cell
    target.replaceChildren()
    target.textContent = labels.length ? labels.join(', ') : '—'
    applyPlainTagTextStyle(target, origCell)
    cell.style.background = 'transparent'
    cell.style.padding = '0'
    cell.style.margin = '0'
  })

  clonedRoot.querySelectorAll('td').forEach((td, i) => {
    const origTd = sourceEl.querySelectorAll('td')[i]
    if (!origTd || origTd.querySelector('[data-inline-edit]')) return
    const labels = collectTagLabels(origTd)
    if (!labels.length && !origTd.querySelector('[data-tag-badge]')) return
    td.replaceChildren()
    td.textContent = labels.length ? labels.join(', ') : '—'
    applyPlainTagTextStyle(td, origTd)
    td.style.verticalAlign = 'middle'
  })

  clonedRoot.querySelectorAll('[data-tag-badge]').forEach((el) => el.remove())
}

function fixCardGridExports(sourceRoot, clonedRoot, clonedDoc, blurBakesList) {
  const sourceCards = [
    ...sourceRoot.querySelectorAll('[data-gallery-card-export], [data-memo-card-export]')
  ]
  const clonedCards = [
    ...clonedRoot.querySelectorAll('[data-gallery-card-export], [data-memo-card-export]')
  ]

  clonedCards.forEach((clonedCard, i) => {
    const sourceCard = sourceCards[i]
    const blurBakes = blurBakesList?.[i]
    if (!sourceCard) return
    if (sourceCard.hasAttribute('data-memo-card-export')) {
      fixMemoCardExport(sourceCard, clonedCard, blurBakes, clonedDoc)
    } else {
      fixGalleryCardExport(sourceCard, clonedCard, blurBakes, clonedDoc)
    }
    syncExportCardUiChrome(sourceCard, clonedCard)
  })
}

async function buildCardGridBlurBakes(root, options = {}) {
  const cards = [
    ...root.querySelectorAll('[data-gallery-card-export], [data-memo-card-export]')
  ]
  if (!cards.length) return null

  hydrateCoverImagesForExport(root)
  await waitForImages(root, 8000)

  const cardNeedsBlurBake = (card) => {
    const cover = card.querySelector('[data-gallery-cover], [data-memo-cover]')
    const img = cover?.querySelector('img')
    return Boolean(img && hasBlurFilter(img))
  }

  const results = []
  let index = 0
  for (const card of cards) {
    index += 1
    if (!cardNeedsBlurBake(card)) {
      results.push(null)
      continue
    }
    if (index === 1 || index % 5 === 0) {
      await notifyProgress(options.onProgress, {
        label: `블러 처리 중… (${index}/${cards.length})`,
        percent: 12 + Math.round((index / cards.length) * 8)
      })
    }
    results.push(
      await (card.hasAttribute('data-memo-card-export')
        ? buildMemoCardBlurBakes(card)
        : buildGalleryCardBlurBakes(card))
    )
    if (index % 4 === 0) await yieldToMain()
  }

  return results
}

function isCardGridExportRoot(element) {
  return (
    element?.hasAttribute('data-gallery-export-root') ||
    element?.hasAttribute('data-memo-export-root')
  )
}

function fixExportStyles(clonedDoc, sourceEl) {
  clonedDoc.querySelectorAll('[data-calendar-cell]').forEach((cell, i) => {
    const orig = sourceEl.querySelectorAll('[data-calendar-cell]')[i]
    if (!orig) return
    cell.style.boxShadow = 'none'
    cell.style.outline = 'none'
  })

  if (sourceEl.hasAttribute('data-record-export-root') || sourceEl.querySelector('[data-tag-badge]')) {
    const clonedRoot = findClonedExportRoot(clonedDoc, sourceEl)
    fixRecordTagBadges(sourceEl, clonedRoot)
  }

  if (sourceEl.hasAttribute('data-record-export-root')) {
    fixRecordExportLayout(sourceEl, findClonedExportRoot(clonedDoc, sourceEl))
    fixRecordStarRatings(sourceEl, findClonedExportRoot(clonedDoc, sourceEl))
  }
}

function findClonedExportRoot(clonedDoc, sourceEl) {
  const markers = [
    'data-record-export-root',
    'data-gallery-export-root',
    'data-calendar-export-root',
    'data-tag-export-root',
    'data-memo-export-root',
    'data-calendar-root'
  ]
  for (const attr of markers) {
    if (sourceEl.hasAttribute(attr)) {
      return clonedDoc.querySelector(`[${attr}]`) || clonedDoc.body
    }
  }
  return (
    clonedDoc.querySelector('[data-calendar-export-root]') ||
    clonedDoc.querySelector('[data-record-export-root]') ||
    clonedDoc.querySelector('[data-gallery-export-root]') ||
    clonedDoc.querySelector('[data-tag-export-root]') ||
    clonedDoc.querySelector('[data-memo-export-root]') ||
    clonedDoc.body
  )
}

function resolveExportPanelBgColor() {
  const panel = getThemeColors()?.bgPanel || '#F5F1E5'
  return toSafeCssColor(panel, 'backgroundColor') || panel || '#F5F1E5'
}

function resolveExportSubPanelBgColor() {
  const sub = getThemeColors()?.bgSubPanel || '#FFFFFF'
  return toSafeCssColor(sub, 'backgroundColor') || sub || '#FFFFFF'
}

/** 기본 모드 태그형 — 카드 내부 서브패널 단색 + 작품명 패널 단색 */
function applyDefaultTagBlockExportColors(block, saved) {
  if (!block) return
  const subPanelBg = resolveExportSubPanelBgColor()
  const panelBg = resolveExportPanelBgColor()

  if (saved) saveTagBlockExportStyle(block, saved)
  block.style.setProperty('background', 'none', 'important')
  block.style.setProperty('background-image', 'none', 'important')
  block.style.setProperty('background-color', subPanelBg, 'important')
  block.style.setProperty('opacity', '1', 'important')
  block.style.setProperty('box-shadow', 'none', 'important')
  block.style.setProperty('-webkit-backdrop-filter', 'none', 'important')
  block.style.setProperty('backdrop-filter', 'none', 'important')

  const scroll = block.querySelector('[data-tag-block-scroll]')
  if (scroll) {
    if (saved) saveTagBlockExportStyle(scroll, saved)
    scroll.style.setProperty('background', 'none', 'important')
    scroll.style.setProperty('background-image', 'none', 'important')
    scroll.style.setProperty('background-color', subPanelBg, 'important')
    scroll.style.setProperty('opacity', '1', 'important')
    scroll.style.setProperty('box-shadow', 'none', 'important')
  }

  block.querySelectorAll('[data-tag-record-item]').forEach((item) => {
    if (saved) saveTagBlockExportStyle(item, saved)
    item.style.setProperty('background', 'none', 'important')
    item.style.setProperty('background-image', 'none', 'important')
    item.style.setProperty('background-color', panelBg, 'important')
    item.style.setProperty('opacity', '1', 'important')
    item.style.setProperty('overflow', 'hidden', 'important')
    item.style.setProperty('box-shadow', 'none', 'important')
    item.style.setProperty('-webkit-backdrop-filter', 'none', 'important')
    item.style.setProperty('backdrop-filter', 'none', 'important')
  })
}

function saveTagBlockExportStyle(el, saved, extra = {}) {
  saved.nodes.push({
    el,
    display: el.style.display,
    alignItems: el.style.alignItems,
    justifyContent: el.style.justifyContent,
    height: el.style.height,
    minHeight: el.style.minHeight,
    maxHeight: el.style.maxHeight,
    lineHeight: el.style.lineHeight,
    paddingTop: el.style.paddingTop,
    paddingBottom: el.style.paddingBottom,
    margin: el.style.margin,
    transform: el.style.transform,
    boxSizing: el.style.boxSizing,
    backgroundColor: el.style.backgroundColor,
    backgroundImage: el.style.backgroundImage,
    opacity: el.style.opacity,
    overflow: el.style.overflow,
    boxShadow: el.style.boxShadow,
    backdropFilter: el.style.backdropFilter,
    webkitBackdropFilter: el.style.webkitBackdropFilter,
    ...extra
  })
}

/** 글래스 태그형 내보내기 — 작품명 항목을 패널 단색으로 고정 + 텍스트 위로 보정 */
function applyGlassTagRecordItemExportStyle(item) {
  if (!item) return
  const panelBg = resolveExportPanelBgColor()
  item.style.setProperty('background', 'none', 'important')
  item.style.setProperty('background-image', 'none', 'important')
  item.style.setProperty('background-color', panelBg, 'important')
  item.style.setProperty('opacity', '1', 'important')
  item.style.setProperty('overflow', 'hidden', 'important')
  item.style.setProperty('box-shadow', 'none', 'important')
  item.style.setProperty('-webkit-backdrop-filter', 'none', 'important')
  item.style.setProperty('backdrop-filter', 'none', 'important')
  /* html2canvas 텍스트 하단 쏠림 — 패딩 비대칭으로 최소 3px 위로 */
  item.style.setProperty('padding-top', '1px', 'important')
  item.style.setProperty('padding-bottom', '7px', 'important')
  item.style.setProperty('line-height', '1.35', 'important')
  item.style.setProperty('transform', 'translateY(-3px)', 'important')
}

function applyTagBlockTextExportFix(sourceEl, targetEl, { offsetY = 0, lineHeight = '1.4' } = {}) {
  if (!sourceEl || !targetEl) return
  const cs = getComputedStyle(sourceEl)
  targetEl.style.display = 'block'
  targetEl.style.setProperty('line-height', lineHeight, 'important')
  targetEl.style.setProperty('overflow', 'visible', 'important')
  targetEl.style.setProperty('padding-top', '4px', 'important')
  targetEl.style.paddingBottom = '0'
  targetEl.style.margin = '0'
  targetEl.style.maxHeight = 'none'
  targetEl.style.height = 'auto'
  targetEl.style.fontSize = cs.fontSize
  targetEl.style.fontWeight = cs.fontWeight
  targetEl.style.fontFamily = cs.fontFamily
  targetEl.style.color = toSafeCssColor(cs.color, 'color')
  targetEl.style.transform = offsetY ? `translateY(${offsetY}px)` : 'none'
}

/** html2canvas 스타일시트 제거 후 ul/li 기본 bullet(•)이 생기는 것 차단 */
function stripTagExportListBullets(root) {
  if (!root) return
  root.querySelectorAll('ul, ol, li, [data-tag-record-item]').forEach((el) => {
    el.style.setProperty('list-style', 'none', 'important')
    el.style.setProperty('list-style-type', 'none', 'important')
    el.style.setProperty('padding-left', '0', 'important')
    el.style.setProperty('margin-left', '0', 'important')
  })
}

function applyTagExportHeaderNoClip(header, title, saved) {
  if (!header) return
  if (saved) saveTagBlockExportStyle(header, saved, {
    overflow: header.style.overflow,
    paddingLeft: header.style.paddingLeft,
    paddingRight: header.style.paddingRight
  })
  header.style.display = 'flex'
  header.style.alignItems = 'center'
  header.style.boxSizing = 'border-box'
  header.style.height = 'auto'
  header.style.minHeight = '0'
  header.style.maxHeight = 'none'
  header.style.setProperty('overflow', 'visible', 'important')
  header.style.setProperty('line-height', '1.4', 'important')
  header.style.setProperty('padding-top', '4px', 'important')

  if (title) {
    if (saved) saveTagBlockExportStyle(title, saved, {
      overflow: title.style.overflow,
      maxHeight: title.style.maxHeight,
      height: title.style.height
    })
    applyTagBlockTextExportFix(title, title, { offsetY: 0, lineHeight: '1.4' })
  }
}

function fixTagBlockExportLayout(sourceBlock, cloneBlock) {
  if (!sourceBlock || !cloneBlock) return

  stripTagExportListBullets(cloneBlock)

  const sourceHeader = sourceBlock.querySelector('[data-tag-block-header]')
  const cloneHeader = cloneBlock.querySelector('[data-tag-block-header]')
  if (sourceHeader && cloneHeader) {
    const sourceTitle = sourceHeader.querySelector('[data-tag-block-title]')
    const cloneTitle = cloneHeader.querySelector('[data-tag-block-title]')
    applyTagExportHeaderNoClip(cloneHeader, null, null)
    if (sourceTitle && cloneTitle) {
      /* 글래스: 태그명 텍스트를 최소 3px 위로 */
      applyTagBlockTextExportFix(sourceTitle, cloneTitle, {
        offsetY: getLiveUiStyle() === 'glass' ? -3 : 0,
        lineHeight: '1.4'
      })
      if (getLiveUiStyle() === 'glass') {
        cloneHeader.style.setProperty('padding-top', '2px', 'important')
        cloneTitle.style.setProperty('padding-top', '0', 'important')
        cloneTitle.style.setProperty('transform', 'translateY(-3px)', 'important')
      }
    }
  }

  const uiStyle = getLiveUiStyle()
  if (uiStyle === 'glass') {
    cloneBlock.querySelectorAll('[data-tag-record-item]').forEach((cloneItem) => {
      applyGlassTagRecordItemExportStyle(cloneItem)
    })
  } else if (uiStyle === 'default') {
    applyDefaultTagBlockExportColors(cloneBlock, null)
  }
}

function prepareTagBlockExportLayout(element, saved) {
  stripTagExportListBullets(element)
  const uiStyle = getLiveUiStyle()
  const isGlass = uiStyle === 'glass'
  const isDefault = uiStyle === 'default'

  element.querySelectorAll('[data-tag-block]').forEach((block) => {
    if (isDefault) {
      applyDefaultTagBlockExportColors(block, saved)
      const header = block.querySelector('[data-tag-block-header]')
      if (header) {
        const title = header.querySelector('[data-tag-block-title]')
        applyTagExportHeaderNoClip(header, title, saved)
      }
      return
    }

    const header = block.querySelector('[data-tag-block-header]')
    if (header) {
      const title = header.querySelector('[data-tag-block-title]')
      applyTagExportHeaderNoClip(header, title, saved)
      if (isGlass && title) {
        header.style.setProperty('padding-top', '2px', 'important')
        title.style.setProperty('padding-top', '0', 'important')
        title.style.setProperty('transform', 'translateY(-3px)', 'important')
      }
    }

    block.querySelectorAll('[data-tag-record-item]').forEach((item) => {
      saveTagBlockExportStyle(item, saved)
      if (isGlass) {
        applyGlassTagRecordItemExportStyle(item)
      } else {
        item.style.backgroundColor = 'var(--color-bg-panel)'
        item.style.opacity = '1'
        item.style.overflow = 'hidden'
      }
    })
  })
}

function fixTagBlockExportClone(sourceRoot, clonedRoot) {
  stripTagExportListBullets(clonedRoot)
  const sourceBlocks = [...sourceRoot.querySelectorAll('[data-tag-block]')]
  const cloneBlocks = [...clonedRoot.querySelectorAll('[data-tag-block]')]
  sourceBlocks.forEach((sourceBlock, index) => {
    const cloneBlock = cloneBlocks[index]
    fixTagBlockExportLayout(sourceBlock, cloneBlock)
    syncExportCardUiChrome(sourceBlock, cloneBlock)
  })
}

/** html2canvas 태그형 카드 텍스트 수직 쏠림 — 클론 DOM 전용 보정 */
function nudgeTagExportTextInClone(clonedRoot) {
  if (!clonedRoot) return
  const doc = clonedRoot.ownerDocument || document
  clonedRoot.querySelectorAll('[data-tag-record-item]').forEach((item) => {
    const textNodes = [...item.childNodes].filter(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent
    )
    textNodes.forEach((node) => {
      const span = doc.createElement('span')
      span.style.display = 'inline-block'
      span.style.transform = 'translateY(-3px)'
      span.textContent = node.textContent
      item.replaceChild(span, node)
    })
  })
}

function prepareGenericViewExport(element) {
  const saved = { nodes: [], element, cardChromeStyles: [] }
  if (!element) return saved

  saved.uiStyleAttr = element.getAttribute('data-ui-style')
  injectExportUiStyleAttr(element)
  /* 10카드 분할은 applyTenByTen에서 bake — 태그 등 단건 캡처만 여기서 고정 */
  if (element.hasAttribute('data-tag-export-root')) {
    bakeExportUiStyleChromeOnLiveCards(element, saved)
  }

  if (element.scrollTop > 0) {
    saved.elementScrollTop = element.scrollTop
    element.scrollTop = 0
  }

  const isRecordSplit =
    element.hasAttribute('data-record-export-root') &&
    element.dataset.recordSplitExport === '1'
  const isTagExport = element.hasAttribute('data-tag-export-root')

  /* 태그형은 height:auto !important 경로로 전체 높이 확보 — 일반 expand와 중복 방지 */
  if (!isRecordSplit && !isTagExport) {
    const expand = (el) => {
      saved.nodes.push({
        el,
        height: el.style.height,
        maxHeight: el.style.maxHeight,
        overflow: el.style.overflow,
        overflowY: el.style.overflowY,
        width: el.style.width
      })
      el.style.height = `${Math.max(el.scrollHeight, el.offsetHeight)}px`
      el.style.maxHeight = 'none'
      el.style.overflow = 'visible'
      el.style.overflowY = 'visible'
    }
    expand(element)
  }

  if (element.hasAttribute('data-record-export-root')) {
    const table = element.querySelector('table')
    if (table) {
      saved.nodes.push({
        el: table,
        width: table.style.width
      })
      table.style.width = `${table.scrollWidth}px`
    }
    flattenRecordTagsForExport(element, saved)
    prepareRecordExportLayout(element, saved)
    if (table) {
      table.style.width = `${table.scrollWidth}px`
    }
  }

  if (
    element.hasAttribute('data-gallery-export-root') ||
    element.hasAttribute('data-memo-export-root')
  ) {
    prepareCardGridWrappers(element, saved)
    element.querySelectorAll('[data-export-hide]').forEach((el) => {
      saved.nodes.push({ el, display: el.style.display })
      el.style.display = 'none'
    })
    expandScrollAncestors(element, saved)
  }

  if (isTagExport) {
    element.querySelectorAll('[data-export-hide]').forEach((el) => {
      saved.nodes.push({ el, display: el.style.display })
      el.style.display = 'none'
    })
    expandScrollAncestors(element, saved)
    element.style.width = `${Math.max(element.scrollWidth, element.offsetWidth)}px`
    /* 글래스/기본 태그형만 단색·보정 (레트로·타 탭 미적용) */
    {
      const tagUi = getLiveUiStyle()
      if (tagUi === 'glass' || tagUi === 'default') {
        prepareTagBlockExportLayout(element, saved)
      }
    }
    const injectTagCaptureExpand = (el) => {
      saved.nodes.push({
        el,
        height: el.style.height,
        maxHeight: el.style.maxHeight,
        overflow: el.style.overflow,
        overflowY: el.style.overflowY
      })
      el.style.setProperty('overflow', 'visible', 'important')
      el.style.setProperty('height', 'auto', 'important')
      el.style.maxHeight = 'none'
      el.style.overflowY = 'visible'
    }
    injectTagCaptureExpand(element)
    element.querySelectorAll('[data-tag-block-scroll]').forEach(injectTagCaptureExpand)
  }

  return saved
}

function restoreGenericViewExport(saved) {
  if (saved?.elementScrollTop != null && saved.nodes?.[0]?.el) {
    saved.nodes[0].el.scrollTop = saved.elementScrollTop
  }
  saved?.nodes?.forEach(
    ({
      el,
      height,
      maxHeight,
      overflow,
      overflowY,
      width,
      contentVisibility,
      containIntrinsicSize,
      display,
      scrollTop,
      transform,
      lineHeight,
      paddingTop,
      paddingBottom,
      margin,
      alignItems,
      justifyContent,
      boxSizing,
      minHeight,
      backgroundColor,
      backgroundImage,
      opacity,
      boxShadow,
      backdropFilter,
      webkitBackdropFilter
    }) => {
      if (!el) return
      if (height !== undefined) {
        el.style.removeProperty('height')
        el.style.height = height
      }
      if (minHeight !== undefined) el.style.minHeight = minHeight
      if (maxHeight !== undefined) {
        el.style.removeProperty('max-height')
        el.style.maxHeight = maxHeight
      }
      if (overflow !== undefined) {
        el.style.removeProperty('overflow')
        el.style.overflow = overflow
      }
      if (overflowY !== undefined) el.style.overflowY = overflowY
      if (width !== undefined) el.style.width = width
      if (contentVisibility !== undefined) el.style.contentVisibility = contentVisibility
      if (containIntrinsicSize !== undefined) el.style.containIntrinsicSize = containIntrinsicSize
      if (display !== undefined) el.style.display = display
      if (scrollTop !== undefined) el.scrollTop = scrollTop
      if (transform !== undefined) {
        el.style.removeProperty('transform')
        el.style.transform = transform
      }
      if (lineHeight !== undefined) {
        el.style.removeProperty('line-height')
        el.style.lineHeight = lineHeight
      }
      if (paddingTop !== undefined) {
        el.style.removeProperty('padding-top')
        el.style.paddingTop = paddingTop
      }
      if (paddingBottom !== undefined) {
        el.style.removeProperty('padding-bottom')
        el.style.paddingBottom = paddingBottom
      }
      if (margin !== undefined) el.style.margin = margin
      if (alignItems !== undefined) el.style.alignItems = alignItems
      if (justifyContent !== undefined) el.style.justifyContent = justifyContent
      if (boxSizing !== undefined) el.style.boxSizing = boxSizing
      if (backgroundColor !== undefined) {
        el.style.removeProperty('background')
        el.style.removeProperty('background-color')
        el.style.backgroundColor = backgroundColor
      }
      if (backgroundImage !== undefined) {
        el.style.removeProperty('background-image')
        el.style.backgroundImage = backgroundImage
      }
      if (opacity !== undefined) {
        el.style.removeProperty('opacity')
        el.style.opacity = opacity
      }
      if (boxShadow !== undefined) {
        el.style.removeProperty('box-shadow')
        el.style.boxShadow = boxShadow
      }
      if (backdropFilter !== undefined) {
        el.style.removeProperty('backdrop-filter')
        el.style.backdropFilter = backdropFilter
      }
      if (webkitBackdropFilter !== undefined) {
        el.style.removeProperty('-webkit-backdrop-filter')
        el.style.webkitBackdropFilter = webkitBackdropFilter
      }
    }
  )
  if (saved?.scrollParent) {
    saved.scrollParent.scrollTop = saved.scrollParentTop ?? 0
  }
  saved?.cardChromeStyles?.forEach((entry) => {
    const { el, ...styles } = entry
    if (!el) return
    Object.entries(styles).forEach(([key, value]) => {
      if (value !== undefined) el.style[key] = value
    })
  })
  if (saved?.element) {
    if (saved.uiStyleAttr == null || saved.uiStyleAttr === '') {
      saved.element.removeAttribute('data-ui-style')
    } else {
      saved.element.setAttribute('data-ui-style', saved.uiStyleAttr)
    }
  }
  restoreRecordTagTextExport(saved)
  restoreRecordExportLayout(saved)
}

function prepareCardGridWrappers(root, saved) {
  const selector = root.hasAttribute('data-memo-export-root')
    ? '[data-memo-card]'
    : '[data-gallery-card]'
  hydrateCoverImagesForExport(root)
  root.querySelectorAll(selector).forEach((wrapper) => {
    saved.nodes.push({
      el: wrapper,
      contentVisibility: wrapper.style.contentVisibility,
      containIntrinsicSize: wrapper.style.containIntrinsicSize
    })
    clearRenderHints(wrapper)
  })
  root.querySelectorAll('img').forEach((img) => {
    img.loading = 'eager'
  })
}

function findScrollableAncestors(element) {
  const nodes = []
  let node = element.parentElement
  while (node && node !== document.documentElement) {
    const cs = getComputedStyle(node)
    if (
      /(auto|scroll|overlay)/.test(cs.overflowY) ||
      /(auto|scroll|overlay)/.test(cs.overflow)
    ) {
      nodes.push(node)
    }
    node = node.parentElement
  }
  return nodes
}

function expandScrollAncestors(element, saved) {
  const exportHeight = Math.max(element.scrollHeight, element.offsetHeight, 1)
  findScrollableAncestors(element).forEach((node) => {
    saved.nodes.push({
      el: node,
      scrollTop: node.scrollTop,
      height: node.style.height,
      maxHeight: node.style.maxHeight,
      overflow: node.style.overflow,
      overflowY: node.style.overflowY
    })
    node.scrollTop = 0
    node.style.maxHeight = 'none'
    node.style.overflow = 'visible'
    node.style.overflowY = 'visible'
    node.style.height = `${Math.max(node.scrollHeight, exportHeight + 32)}px`
  })
}

function freezeImagesFromSource(sourceEl, clonedDoc) {
  /* 문서 전체 img 인덱스가 어긋나면 표지 src가 작품명 bake img에 섞임 → export root로 한정 */
  const clonedRoot = findClonedExportRoot(clonedDoc, sourceEl) || clonedDoc.body
  const origImgs = [...sourceEl.querySelectorAll('img')]
  const cloneImgs = [...clonedRoot.querySelectorAll('img')]

  cloneImgs.forEach((cloneImg, i) => {
    const orig = origImgs[i]
    if (!orig) return
    try {
      /* 잠금 작품명 블러 bake는 표지 natural size로 다시 그리지 말고 src만 유지 */
      if (
        orig.hasAttribute('data-export-title-blur-bake') ||
        cloneImg.hasAttribute('data-export-title-blur-bake')
      ) {
        const src = orig.currentSrc || orig.src
        if (src) cloneImg.src = src
        cloneImg.setAttribute('data-export-title-blur-bake', '1')
        return
      }
      const coverUrl = orig.getAttribute('data-cover-url')
      if (coverUrl && !orig.src) orig.src = coverUrl
      const w = orig.naturalWidth || orig.width || 1
      const h = orig.naturalHeight || orig.height || 1
      if (!w || !h) {
        const src = orig.currentSrc || orig.src || coverUrl
        if (src) cloneImg.src = src
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(orig, 0, 0, w, h)
      cloneImg.src = canvas.toDataURL('image/png')
    } catch {
      const src = orig.currentSrc || orig.src || orig.getAttribute('data-cover-url')
      if (src) cloneImg.src = src
    }
  })
}

/** 내보내기: 화면에 보이는 배치·비율 그대로 — zoom 없이 캡처 후 1500px로 스케일 */
function lockCalendarVisibleLayout(root, saved) {
  const rootRect = root.getBoundingClientRect()
  const w = Math.max(1, Math.round(rootRect.width))
  const h = Math.max(1, Math.round(rootRect.height))

  saved.rootLayout = {
    el: root,
    width: root.style.width,
    minWidth: root.style.minWidth,
    height: root.style.height,
    minHeight: root.style.minHeight,
    flex: root.style.flex,
    flexGrow: root.style.flexGrow,
    flexShrink: root.style.flexShrink,
    overflow: root.style.overflow,
    boxSizing: root.style.boxSizing,
    zoom: root.style.zoom
  }

  root.style.flex = 'none'
  root.style.flexGrow = '0'
  root.style.flexShrink = '0'
  root.style.width = `${w}px`
  root.style.minWidth = `${w}px`
  root.style.height = `${h}px`
  root.style.minHeight = `${h}px`
  root.style.boxSizing = 'border-box'
  root.style.overflow = 'hidden'

  const viewport = root.querySelector('[data-calendar-viewport]')
  saved.viewportOffset = viewport?.offsetTop ?? 0
  saved.scrollTop = 0
  if (viewport) {
    const vpH = Math.max(1, Math.round(viewport.getBoundingClientRect().height))
    saved.nodes.push({
      el: viewport,
      overflow: viewport.style.overflow,
      overflowY: viewport.style.overflowY,
      scrollTop: viewport.scrollTop,
      height: viewport.style.height,
      minHeight: viewport.style.minHeight,
      flex: viewport.style.flex
    })
    viewport.scrollTop = 0
    viewport.style.overflow = 'hidden'
    viewport.style.overflowY = 'hidden'
    viewport.style.flex = 'none'
    viewport.style.height = `${vpH}px`
    viewport.style.minHeight = `${vpH}px`
  }

  root.querySelectorAll('[data-calendar-week]').forEach((row) => {
    if (row.style.display === 'none') return
    const rowH = Math.max(1, Math.round(row.getBoundingClientRect().height))
    saved.layoutLocked.push({
      el: row,
      height: row.style.height,
      minHeight: row.style.minHeight,
      flex: row.style.flex
    })
    row.style.flex = 'none'
    row.style.height = `${rowH}px`
    row.style.minHeight = `${rowH}px`
  })
}

function readCalendarCoverGradientOverlay(el) {
  if (!el) return null
  const bg = getComputedStyle(el).background || getComputedStyle(el).backgroundColor || ''
  if (bg.includes('255, 255, 255') || bg.includes('255,255,255')) {
    return { color: 'rgba(255,255,255,0.75)', heightRatio: 0.55 }
  }
  return { color: 'rgba(0,0,0,0.55)', heightRatio: 0.55 }
}

function collectCalendarDayCoverLayouts(root) {
  if (!root?.hasAttribute('data-calendar-export-root')) return []
  const rootRect = root.getBoundingClientRect()
  if (rootRect.width < 1 || rootRect.height < 1) return []

  const layouts = []
  root.querySelectorAll('[data-calendar-cell]').forEach((cell) => {
    if (cell.style.display === 'none') return
    const coverImg = cell.querySelector('img[data-calendar-day-cover]')
    const coverColorEl = cell.querySelector('[data-calendar-day-cover-color]')
    if (!coverImg && !coverColorEl) return

    const cellRect = cell.getBoundingClientRect()
    if (cellRect.width < 1 || cellRect.height < 1) return

    const gradientEl = cell.querySelector('[data-calendar-day-cover-gradient]')
    layouts.push({
      x: cellRect.left - rootRect.left,
      y: cellRect.top - rootRect.top,
      w: cellRect.width,
      h: cellRect.height,
      imgSrc: coverImg
        ? coverImg.currentSrc || coverImg.src || coverImg.getAttribute('data-cover-url') || ''
        : '',
      bgColor: coverColorEl ? getComputedStyle(coverColorEl).backgroundColor : '',
      gradient: readCalendarCoverGradientOverlay(gradientEl)
    })
  })
  return layouts
}

async function compositeCalendarDayCovers(canvas, layouts, meta) {
  if (!layouts?.length || !canvas || !meta?.naturalW) return canvas
  const scale = canvas.width / meta.naturalW
  const ctx = canvas.getContext('2d')

  for (const layout of layouts) {
    const x = layout.x * scale
    const y = layout.y * scale
    const w = layout.w * scale
    const h = layout.h * scale
    if (w < 1 || h < 1) continue

    const off = document.createElement('canvas')
    off.width = Math.max(1, Math.ceil(w))
    off.height = Math.max(1, Math.ceil(h))
    const octx = off.getContext('2d')

    const bgColor = layout.bgColor
    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      octx.fillStyle = bgColor
      octx.fillRect(0, 0, w, h)
    }

    if (layout.imgSrc) {
      const img = await loadStickerImage(layout.imgSrc)
      if (img) drawImageObjectFitCover(octx, img, w, h, 1)
    }

    if (layout.gradient) {
      const gh = h * layout.gradient.heightRatio
      octx.fillStyle = layout.gradient.color
      octx.fillRect(0, 0, w, gh)
    }

    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    ctx.globalCompositeOperation = 'destination-over'
    ctx.drawImage(off, x, y, w, h)
    ctx.restore()
  }

  return canvas
}

function prepareCalendarForExport(root, targetMonth, targetWidth = CALENDAR_MONTH_EXPORT_WIDTH) {
  const saved = { nodes: [], hiddenWeeks: [], rootLayout: null, petitHidden: [], layoutLocked: [] }
  if (!root) return saved

  if (targetMonth) {
    root.querySelectorAll('[data-calendar-week]').forEach((row) => {
      const key = row.getAttribute('data-week-start')
      if (!key) return
      const weekStart = new Date(`${key}T12:00:00`)
      const show = isWeekInMonthGrid(weekStart, targetMonth)
      if (!show) {
        saved.hiddenWeeks.push({ el: row, display: row.style.display })
        row.style.display = 'none'
      }
    })
  }

  void root.offsetHeight
  lockCalendarVisibleLayout(root, saved)

  const rect = root.getBoundingClientRect()
  saved.naturalW = Math.max(1, Math.round(rect.width))
  saved.naturalH = Math.max(1, Math.round(rect.height))
  saved.captureScale = targetWidth / saved.naturalW

  root.querySelectorAll('[data-petit-sticker-root]').forEach((el) => {
    saved.petitHidden.push({ el, visibility: el.style.visibility })
    el.style.visibility = 'hidden'
  })

  hydrateCalendarDayCoversForExport(root)

  void root.offsetHeight
  return saved
}

function restoreCalendarAfterExport(saved) {
  saved?.layoutLocked?.forEach(({ el, height, minHeight, flex }) => {
    if (!el) return
    el.style.height = height
    el.style.minHeight = minHeight
    el.style.flex = flex
  })
  saved?.petitHidden?.forEach(({ el, visibility }) => {
    if (!el) return
    el.style.visibility = visibility
  })
  saved?.nodes?.forEach(({ el, overflow, overflowY, scrollTop, height, minHeight, flex }) => {
    el.style.overflow = overflow
    el.style.overflowY = overflowY
    el.scrollTop = scrollTop ?? 0
    if (height !== undefined) el.style.height = height
    if (minHeight !== undefined) el.style.minHeight = minHeight
    if (flex !== undefined) el.style.flex = flex
  })
  saved?.hiddenWeeks?.forEach(({ el, display }) => {
    el.style.display = display
  })
  if (saved?.rootLayout) {
    const {
      el,
      width,
      minWidth,
      height,
      minHeight,
      flex,
      flexGrow,
      flexShrink,
      overflow,
      boxSizing,
      zoom
    } = saved.rootLayout
    el.style.width = width
    el.style.minWidth = minWidth
    el.style.height = height
    el.style.minHeight = minHeight
    el.style.flex = flex
    el.style.flexGrow = flexGrow
    el.style.flexShrink = flexShrink
    el.style.overflow = overflow
    el.style.boxSizing = boxSizing
    el.style.zoom = zoom
  }
}

function buildCalendarExportMeta(savedCalendar, root) {
  if (!savedCalendar?.naturalW) return null
  return {
    naturalW: savedCalendar.naturalW,
    naturalH: savedCalendar.naturalH,
    captureScale: savedCalendar.captureScale,
    viewportOffset: savedCalendar.viewportOffset ?? 0,
    scrollTop: savedCalendar.scrollTop ?? 0,
    coverLayouts: root ? collectCalendarDayCoverLayouts(root) : []
  }
}

async function waitForImages(element, timeoutMs = 15000) {
  hydrateCoverImagesForExport(element)
  const imgs = element.querySelectorAll('img')
  await Promise.all([...imgs].map((img) => waitForImage(img, timeoutMs)))
}

import { composeBrandedExportCanvas, EXPORT_FRAME_PAD, EXPORT_HEADER_H } from './exportBrandedFrame'

function hideUiOverlaysForCapture(exportRoot, options = {}) {
  const saved = []
  const hide = (el) => {
    saved.push({ el, visibility: el.style.visibility })
    el.style.visibility = 'hidden'
  }

  document.querySelectorAll('[data-global-sticker-layer], [data-export-popup]').forEach(hide)
  document.querySelectorAll('[data-trace-box]').forEach(hide)
  document.querySelectorAll('[data-popup-root]').forEach((el) => {
    if (exportRoot?.contains(el)) return
    hide(el)
  })

  if (options.showBackgroundImage === false) {
    document.querySelectorAll('[data-background-layer]').forEach(hide)
  }

  return saved
}

function restoreUiOverlays(saved) {
  saved?.forEach(({ el, visibility }) => {
    if (!el) return
    el.style.visibility = visibility
  })
}

async function renderWithHtml2Canvas(element, scale, { cardGridBlurBakes } = {}) {
  const { default: html2canvas } = await import('html2canvas')
  const isCalendar = element.hasAttribute('data-calendar-export-root')
  const isRecord = element.hasAttribute('data-record-export-root')
  const elBg = getComputedStyle(element).backgroundColor
  const bg = toSafeCssColor(elBg, 'backgroundColor') || '#E6E1D3'
  const rect = element.getBoundingClientRect()
  const recordSize = isRecord ? measureRecordExportSize(element) : null
  const scrollW = isCalendar
    ? Math.max(1, Math.round(rect.width))
    : isRecord
      ? Math.max(recordSize.width, element.scrollWidth, element.offsetWidth)
      : Math.max(element.scrollWidth, element.offsetWidth)
  const scrollH = isCalendar
    ? Math.max(1, Math.round(rect.height))
    : isRecord
      ? Math.max(
          recordSize.height,
          Math.ceil(element.scrollHeight),
          Math.ceil(element.offsetHeight)
        )
      : Math.max(element.scrollHeight, element.offsetHeight)

  return html2canvas(element, {
    backgroundColor: bg,
    scale,
    width: scrollW,
    height: scrollH,
    scrollX: 0,
    scrollY: 0,
    useCORS: true,
    allowTaint: true,
    logging: false,
    imageTimeout: 20000,
    ignoreElements: (el) => el.hasAttribute('data-export-hide'),
    onclone: (clonedDoc) => {
      stripStylesheets(clonedDoc)
      const clonedRoot = findClonedExportRoot(clonedDoc, element)
      copySafeThemeVars(clonedDoc)
      injectExportUiStyleAttr(clonedRoot)
      stripClassNames(clonedRoot)
      clearUnsafeInlineStyles(clonedRoot)
      inlineSafeComputedStyles(element, clonedRoot)
      stripUnsafeBackgrounds(element, clonedRoot)
      fixGradientOverlays(element, clonedRoot)
      freezeImagesFromSource(element, clonedDoc)
      fixExportStyles(clonedDoc, element)
      if (isCalendar) {
        fixCalendarExportClone(element, clonedRoot)
      }
      if (isCardGridExportRoot(element)) {
        fixCardGridExports(element, clonedRoot, clonedDoc, cardGridBlurBakes)
      }
      /* 글래스/기본 태그형만 클론 보정 — 단색·불릿 제거 (레트로·타 탭 미적용) */
      if (element.hasAttribute('data-tag-export-root')) {
        const tagUi = getLiveUiStyle()
        if (tagUi === 'glass' || tagUi === 'default') {
          fixTagBlockExportClone(element, clonedRoot)
        }
      }
      sanitizeClonedColors(clonedRoot)
      if (element.hasAttribute('data-tag-export-root')) {
        nudgeTagExportTextInClone(clonedRoot)
      }
    }
  })
}

async function renderWithElectronCapture(element, { useScrollDimensions = false } = {}) {
  if (!window.mrecord?.capturePageRect) return null

  const rect = element.getBoundingClientRect()
  const isCalendar = element.hasAttribute('data-calendar-export-root')
  const isRecord = element.hasAttribute('data-record-export-root')

  let width
  let height
  if (isCalendar) {
    width = Math.round(rect.width)
    height = Math.round(rect.height)
  } else if (isRecord) {
    const measured = measureRecordExportSize(element)
    width = measured.width
    height = measured.height
  } else {
    width = Math.round(
      useScrollDimensions
        ? Math.max(element.scrollWidth, element.offsetWidth, rect.width)
        : rect.width
    )
    height = Math.round(
      useScrollDimensions
        ? Math.max(element.scrollHeight, element.offsetHeight, rect.height)
        : rect.height
    )
  }

  if (width < 1 || height < 1) return null
  if (width > MAX_ELECTRON_CAPTURE_EDGE || height > MAX_ELECTRON_CAPTURE_EDGE) {
    return null
  }

  const result = await window.mrecord.capturePageRect({
    x: rect.x,
    y: rect.y,
    width,
    height
  })

  if (!result?.ok || !result.dataBase64) {
    throw new Error(result?.error || '화면 캡처에 실패했습니다')
  }

  return result.dataBase64
}

async function tryElectronExportCapture(element, useScrollDimensions = false) {
  element.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' })
  await waitForExportFrame()
  return renderWithElectronCapture(element, { useScrollDimensions })
}

function calendarExportMetaFromSaved(savedCalendar, root) {
  return buildCalendarExportMeta(savedCalendar, root)
}

export function filterPetitStickersForMonth(stickers, monthKey) {
  if (!stickers?.length || !monthKey) return []
  return stickers.filter((s) => s.locked || s.monthKey === monthKey)
}

function petitStickerExportY(sticker, scrollMetrics) {
  if (!scrollMetrics) return sticker.y
  if (sticker.pinned) {
    return scrollMetrics.viewportOffset + sticker.y - scrollMetrics.scrollTop
  }
  return sticker.y
}

function stickerVisualHeight(sticker, stickerW) {
  const w = stickerW || sticker.width || 80
  if (sticker.heightRatio != null && sticker.heightRatio > 0) return w * sticker.heightRatio
  return w * 0.75
}

function loadStickerImage(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

async function drawPetitStickerOnCanvas(ctx, sticker, boxW, boxH, canvasScale, scrollMetrics) {
  const img = await loadStickerImage(sticker.src)
  if (!img) return

  const w = sticker.width || 80
  const natW = img.naturalWidth || 1
  const natH = img.naturalHeight || 1
  const h = stickerVisualHeight(sticker, w) || (w * natH) / natW

  const pos = resolveAnchoredPosition(sticker, boxW, boxH, w)
  const x = pos.x
  const y = petitStickerExportY({ ...sticker, y: pos.y }, scrollMetrics)

  const cx = (x + w / 2) * canvasScale
  const cy = (y + h / 2) * canvasScale
  const dw = w * canvasScale
  const dh = h * canvasScale

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(((sticker.rotation || 0) * Math.PI) / 180)

  const opacity = sticker.opacity ?? 1
  if (opacity < 1) ctx.globalAlpha = opacity

  if (sticker.blendMode === 'multiply') {
    ctx.globalCompositeOperation = 'multiply'
  }

  if (sticker.shadowEnabled !== false && sticker.blendMode !== 'multiply') {
    ctx.shadowColor = 'rgba(0,0,0,0.25)'
    ctx.shadowBlur = 8 * canvasScale
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 4 * canvasScale
  }

  // 프레임 마스킹: CSS clip-path와 동일한 path로 Canvas clip (export 안전)
  applyFrameClipToCanvas(ctx, sticker.frameShape, dw, dh, -dw / 2, -dh / 2)
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
}

async function compositeCalendarPetitStickers(canvas, stickers, meta) {
  if (!stickers?.length || !canvas || !meta?.naturalW) return canvas
  const { naturalW, naturalH } = meta
  const canvasScale = canvas.width / naturalW
  const scrollMetrics = {
    scrollTop: meta.scrollTop ?? 0,
    viewportOffset: meta.viewportOffset ?? 0
  }
  const ctx = canvas.getContext('2d')
  for (const sticker of stickers) {
    await drawPetitStickerOnCanvas(ctx, sticker, naturalW, naturalH, canvasScale, scrollMetrics)
  }
  return canvas
}

async function captureElement(element, targetMonth, exportOptions = {}) {
  if (!element) throw new Error('내보낼 요소가 없습니다')

  const isCalendar = element.hasAttribute('data-calendar-export-root')
  const isGenericView =
    element.hasAttribute('data-record-export-root') ||
    element.hasAttribute('data-gallery-export-root') ||
    element.hasAttribute('data-memo-export-root') ||
    element.hasAttribute('data-tag-export-root')

  const savedCalendar = isCalendar ? prepareCalendarForExport(element, targetMonth) : null
  const savedGeneric = isGenericView ? prepareGenericViewExport(element) : null
  const savedOverlays = hideUiOverlaysForCapture(element, {
    showBackgroundImage: exportOptions.showBackgroundImage
  })

  await scrollExportRootIntoView(element)
  if (exportOptions.preloadImages !== false) {
    await preloadExportImages(element, {
      onProgress: exportOptions.onProgress,
      timeoutMs: exportOptions.preloadTimeoutMs ?? 15000,
      perImageTimeoutMs: exportOptions.preloadPerImageTimeoutMs ?? 8000,
      lockExport: exportOptions.lockExport === true
    })
  } else {
    await waitForImages(element)
  }
  await waitForExportFrame()

  let cardGridBlurBakes = null
  let lastError = null
  const splitPage = exportOptions.splitPageCapture === true
  const tagFullScroll = exportOptions.tagFullScrollExport === true
  const useScrollCapture = (splitPage || tagFullScroll) && !isCalendar
  const canTryElectron = canTryElectronCapture(element, exportOptions)

  try {
    if (canTryElectron) {
      await notifyProgress(exportOptions.onProgress, { label: '화면 캡처 중…', percent: 30 })
      try {
        const base64 = await tryElectronExportCapture(element, useScrollCapture)
        if (base64) {
          return {
            mode: 'base64',
            base64,
            calendarExportMeta: calendarExportMetaFromSaved(savedCalendar, element)
          }
        }
      } catch (err) {
        lastError = err
      }
    }

    if (exportOptions.lockExport === true) {
      await prepareLockExportFallbackCapture(element, exportOptions)
    } else {
      await prepareBlurredContentForLiveExport(element, exportOptions)
    }

    if (isCardGridExportRoot(element) && exportOptions.lockExport !== true) {
      await notifyProgress(exportOptions.onProgress, { label: '내보내기 준비 중…', percent: 12 })
      cardGridBlurBakes = await buildCardGridBlurBakes(element, exportOptions)
    }

    const { width: exportW, height: exportH } = getExportElementSize(element)
    const calendarScale = savedCalendar?.captureScale
    const scaleCandidates =
      isCalendar && calendarScale
        ? [calendarScale]
        : splitPage
          ? [1]
          : [1.5, 1]

    await notifyProgress(exportOptions.onProgress, { label: '화면 캡처 중…', percent: 30 })

    for (const preferredScale of scaleCandidates) {
      const scale = computeSafeScale(exportW, exportH, preferredScale)
      try {
        const canvas = await withTimeout(
          renderWithHtml2Canvas(element, scale, { cardGridBlurBakes }),
          splitPage ? 120000 : 180000,
          '화면 캡처 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'
        )
        if (!canvas || canvas.width < 1 || canvas.height < 1) {
          throw new Error('캡처 데이터가 비어 있습니다')
        }
        return {
          mode: 'canvas',
          canvas,
          calendarExportMeta: calendarExportMetaFromSaved(savedCalendar, element)
        }
      } catch (err) {
        lastError = err
      }
    }
  } finally {
    restoreUiOverlays(savedOverlays)
    restoreLockedCardsForExport(element)
    if (savedCalendar) restoreCalendarAfterExport(savedCalendar)
    if (savedGeneric) restoreGenericViewExport(savedGeneric)
    await waitForExportTick(16)
  }

  throw lastError || new Error('캡처에 실패했습니다')
}

async function resultToCanvas(result) {
  if (result.mode === 'canvas') return result.canvas
  const img = new Image()
  await new Promise((res, rej) => {
    img.onload = res
    img.onerror = rej
    img.src = `data:image/png;base64,${result.base64}`
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  canvas.getContext('2d').drawImage(img, 0, 0)
  return canvas
}

async function compositeOverlayStickers(canvas, rootEl, stickers) {
  if (!stickers?.length) return canvas
  const rect = rootEl.getBoundingClientRect()
  const ctx = canvas.getContext('2d')
  const isCalendar = rootEl.hasAttribute('data-calendar-export-root')

  const stickersToDraw = isCalendar
    ? stickers.filter((s) => !s.monthKey)
    : stickers

  await Promise.all(
    stickersToDraw.map(
      (sticker) =>
        new Promise((resolve) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            const w = sticker.width || 80
            const natW = img.naturalWidth || 1
            const natH = img.naturalHeight || 1
            const h = (w * natH) / natW
            const x = sticker.monthKey ? sticker.x : sticker.x - rect.left
            const y = sticker.monthKey ? sticker.y : sticker.y - rect.top
            ctx.save()
            ctx.translate(x + w / 2, y + h / 2)
            ctx.rotate(((sticker.rotation || 0) * Math.PI) / 180)
            applyFrameClipToCanvas(ctx, sticker.frameShape, w, h, -w / 2, -h / 2)
            ctx.drawImage(img, -w / 2, -h / 2, w, h)
            ctx.restore()
            resolve()
          }
          img.onerror = () => resolve()
          img.src = sticker.src
        })
    )
  )
  return canvas
}

function normalizeExportOptions(third) {
  if (!third) return {}
  if (third instanceof Date) return { targetMonth: third }
  return third
}

export const CARD_GRID_EXPORT_WIDTH = 2000

export const SPLIT_EXPORT_COLS = 10
export const SPLIT_EXPORT_ROWS = 3
export const SPLIT_EXPORT_PAGE_SIZE = SPLIT_EXPORT_COLS * SPLIT_EXPORT_ROWS
/** 갤러리·메모 이미지 내보내기 — 보기 모드와 무관하게 10×10 타일 프레임 */
export const GALLERY_EXPORT_ROWS_PAGED = 10
export const GALLERY_EXPORT_ROWS_SCROLL = 10
export const GALLERY_EXPORT_PAGE_SIZE_PAGED = SPLIT_EXPORT_COLS * GALLERY_EXPORT_ROWS_PAGED
export const GALLERY_EXPORT_PAGE_SIZE_SCROLL = SPLIT_EXPORT_COLS * GALLERY_EXPORT_ROWS_SCROLL
/** 기록 탭 분할 내보내기 — 가로 1200 · 무한스크롤 세로 최대 ~4500 */
export const RECORD_EXPORT_TARGET_HEIGHT = 4500
export const RECORD_SPLIT_EXPORT_MAX_ITEMS = 30
/** 기록 목록 자동 분할 단위 (100개 이하 1장, 초과 시 100개씩) */
export const RECORD_EXPORT_CHUNK_SIZE = 100
export const RECORD_SPLIT_EXPORT_ROW_HEIGHT = 44

function recordExportPageFilename(tabTitle, pageNum) {
  const safe = sanitizeExportTabTitle(tabTitle) || '기록'
  return `${safe}_${pageNum}.png`
}
const RECORD_EXPORT_BRANDED_FRAME_EXTRA = EXPORT_HEADER_H + EXPORT_FRAME_PAD * 2
const RECORD_EXPORT_BRANDED_WIDTH_SCALE =
  RECORD_EXPORT_WIDTH / (RECORD_EXPORT_WIDTH + EXPORT_FRAME_PAD * 2)

function getRecordExportMaxContentHeight(includeBrandedHeader, { pagedView = false } = {}) {
  if (pagedView) {
    const frameExtra = includeBrandedHeader ? RECORD_EXPORT_BRANDED_FRAME_EXTRA : 0
    return Math.max(
      RECORD_SPLIT_EXPORT_ROW_HEIGHT * 2,
      Math.floor(MAX_ELECTRON_CAPTURE_EDGE / RECORD_EXPORT_BRANDED_WIDTH_SCALE - frameExtra)
    )
  }
  if (!includeBrandedHeader) return RECORD_EXPORT_TARGET_HEIGHT
  return Math.max(
    RECORD_SPLIT_EXPORT_ROW_HEIGHT * 2,
    Math.floor(
      RECORD_EXPORT_TARGET_HEIGHT / RECORD_EXPORT_BRANDED_WIDTH_SCALE -
        RECORD_EXPORT_BRANDED_FRAME_EXTRA
    )
  )
}

const MAX_RECORD_EXPORT_CONTENT_HEIGHT = getRecordExportMaxContentHeight(true)
const MAX_MEMO_GRID_EXPORT_HEIGHT = 3600
const RECORD_EXPORT_HEADER_HEIGHT = 36
const RECORD_ONELINE_COL_WIDTH_PX = 280

function sanitizeExportTabTitle(title) {
  return String(title || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .replace(/\s+/g, '')
}

function formatExportFilenameDate(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

/**
 * 카드 그리드 분할 내보내기 파일명
 * 규칙: [탭 이름] - ([현재]/[전체]) - [yymmdd]
 * 예: 갤러리 - (1/2) - 260807.png
 * Windows 경로 안전을 위해 페이지 구분 `/` 는 전각 `／` 로 저장
 */
export function cardGridPageFilename(
  tabTitle,
  pageNum,
  { totalPages = 1, date = new Date() } = {}
) {
  const safe =
    String(tabTitle || '')
      .replace(/[\\/:*?"<>|]/g, '')
      .trim()
      .replace(/\s+/g, ' ') || '내보내기'
  const stamp = formatExportFilenameDate(date)
  const current = Math.max(1, Number(pageNum) || 1)
  const total = Math.max(current, Number(totalPages) || 1)
  return `${safe} - (${current}／${total}) - ${stamp}.png`
}

export const TAG_SPLIT_EXPORT_COLS = 7
export const TAG_SPLIT_EXPORT_ROWS = 1
export const TAG_SPLIT_EXPORT_PAGE_SIZE = TAG_SPLIT_EXPORT_COLS * TAG_SPLIT_EXPORT_ROWS

function getCardGridItems(root) {
  if (root?.hasAttribute('data-gallery-export-root')) {
    return [...root.querySelectorAll('[data-gallery-card]')]
  }
  if (root?.hasAttribute('data-memo-export-root')) {
    return [...root.querySelectorAll('[data-memo-card]')]
  }
  return []
}

function parseCardGridColumnWidth(root) {
  const inline = root.style.gridTemplateColumns
  const computed = getComputedStyle(root).gridTemplateColumns
  const source = inline || computed
  const repeatMatch = source.match(/repeat\s*\([^,]+,\s*(\d+(?:\.\d+)?)px\s*\)/i)
  if (repeatMatch) return parseFloat(repeatMatch[1])
  const pxMatch = source.match(/(\d+(?:\.\d+)?)px/)
  if (pxMatch) return parseFloat(pxMatch[1])
  const first = getCardGridItems(root)[0]
  return first ? Math.max(1, Math.round(first.getBoundingClientRect().width)) : 140
}

function parseGridGap(root) {
  const cs = getComputedStyle(root)
  const raw = cs.columnGap && cs.columnGap !== 'normal' ? cs.columnGap : cs.gap
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : 16
}

function measureCardGridCellSize(root) {
  const cards = getCardGridItems(root)
  const measuredWidth = cards[0]
    ? Math.max(1, Math.round(cards[0].getBoundingClientRect().width))
    : parseCardGridColumnWidth(root)
  const cardWidth = measuredWidth || parseCardGridColumnWidth(root)
  let cardHeight = 0
  if (cards.length) {
    cardHeight = Math.max(
      ...cards.map((card) => Math.max(1, Math.round(card.getBoundingClientRect().height)))
    )
  }
  if (!cardHeight) cardHeight = getGalleryCardExportHeight(cardWidth)
  return { cardWidth, cardHeight, gap: parseGridGap(root) }
}

function forceCardGridFullyVisible(root) {
  const selector = root.hasAttribute('data-memo-export-root')
    ? '[data-memo-card]'
    : '[data-gallery-card]'
  root.querySelectorAll(selector).forEach(clearRenderHints)
  hydrateCoverImagesForExport(root)
}

async function waitForCardGridCount(root, expected, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const count = getCardGridItems(root).length
    if (count >= expected) return count
    await yieldToMain()
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  return getCardGridItems(root).length
}

function getRecordExportRows(root) {
  if (!root?.hasAttribute('data-record-export-root')) return []
  return [...root.querySelectorAll('tbody tr')].filter((tr) => !tr.hasAttribute('aria-hidden'))
}

async function waitForRecordRowCount(root, expected, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const count = getRecordExportRows(root).length
    if (count >= expected) return count
    await yieldToMain()
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  return getRecordExportRows(root).length
}

function estimateRecordExportRowHeight(record) {
  const base = RECORD_SPLIT_EXPORT_ROW_HEIGHT
  const text = String(record?.oneLine || '').trim()
  if (!text) return base

  const charWidth = 7
  const charsPerLine = Math.max(8, Math.floor(RECORD_ONELINE_COL_WIDTH_PX / charWidth))
  const lines = Math.ceil(text.length / charsPerLine)
  const lineHeight = 19
  const padding = 20
  return Math.max(base, padding + lines * lineHeight)
}

export function computeRecordExportPageRanges(
  records,
  maxContentHeight = MAX_RECORD_EXPORT_CONTENT_HEIGHT,
  maxItemsPerPage = RECORD_SPLIT_EXPORT_MAX_ITEMS
) {
  if (!records?.length) return [{ start: 0, end: 0 }]

  const maxBody = maxContentHeight - RECORD_EXPORT_HEADER_HEIGHT - 2
  const itemLimit = Number.isFinite(maxItemsPerPage) ? maxItemsPerPage : Infinity
  const ranges = []
  let start = 0
  let accHeight = 0
  let count = 0

  for (let i = 0; i < records.length; i++) {
    const rowH = estimateRecordExportRowHeight(records[i])
    const wouldOverflow =
      count > 0 && (accHeight + rowH > maxBody || count >= itemLimit)

    if (wouldOverflow) {
      ranges.push({ start, end: i })
      start = i
      accHeight = rowH
      count = 1
    } else {
      accHeight += rowH
      count += 1
    }
  }

  if (start < records.length) {
    ranges.push({ start, end: records.length })
  }

  return ranges.length ? ranges : [{ start: 0, end: 0 }]
}

async function measureRecordExportSliceHeight(start, end, onExportSlice, resolveRoot) {
  await onExportSlice({ start, end })
  await waitForExportTick(480)
  await yieldToMain()

  const root = resolveRoot()
  if (!root) throw new Error('내보낼 화면을 찾을 수 없습니다')

  await waitForRecordRowCount(root, end - start, 6000)

  const measureSaved = { hiddenCols: [], recordExportStyledEls: [] }
  prepareRecordExportLayout(root, measureSaved)
  await waitForExportFrame()
  const { height } = measureRecordExportSize(root)
  restoreRecordExportLayout(measureSaved)
  return height
}

async function fitRecordExportSliceEnd(
  start,
  initialEnd,
  onExportSlice,
  resolveRoot,
  maxContentHeight = MAX_RECORD_EXPORT_CONTENT_HEIGHT,
  { maximize = false } = {}
) {
  if (maximize && initialEnd > start + 1) {
    let lo = start + 1
    let hi = initialEnd
    let best = start + 1

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2)
      const height = await measureRecordExportSliceHeight(start, mid, onExportSlice, resolveRoot)
      if (height <= maxContentHeight) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    return best
  }

  let end = initialEnd

  while (end > start) {
    const height = await measureRecordExportSliceHeight(start, end, onExportSlice, resolveRoot)

    if (height <= maxContentHeight || end - start <= 1) {
      return end
    }

    end = start + Math.max(1, Math.ceil((end - start) * 0.65))
  }

  return Math.min(start + 1, initialEnd)
}

function computeSplitExportCardHeight(sample, cardWidth, titleSize = 'medium') {
  if (!sample) return getGalleryCardExportHeight(cardWidth)

  const inner =
    sample.querySelector('[data-gallery-card-export]') ||
    sample.querySelector('[data-memo-card-export]')

  if (isMemoV1TitleFirstCard(inner)) {
    return getMemoV1ExportCardHeight(cardWidth, titleSize)
  }

  const titleBar = (inner || sample).querySelector(
    '[data-gallery-title-bar], [data-memo-title-bar]'
  )
  const cover = (inner || sample).querySelector('[data-gallery-cover], [data-memo-cover]')

  if (!titleBar && cover) {
    return getGalleryCardExportHeight(cardWidth, true)
  }

  const titleH = titleBar
    ? Math.max(
        GALLERY_TITLE_BAR_TWO_LINE_PX,
        Math.ceil(titleBar.getBoundingClientRect().height)
      )
    : 0
  const coverH = getGalleryCoverExportHeight(cardWidth)

  const shadowPad = getExportCardShadowPadPx()
  if (titleBar && cover && titleBar.compareDocumentPosition(cover) & Node.DOCUMENT_POSITION_FOLLOWING) {
    return titleH + coverH + 2 + shadowPad
  }
  return coverH + titleH + 2 + shadowPad
}

function computeSplitExportCardMetrics(root, titleSize = 'medium') {
  const gap = parseGridGap(root)
  const natural = measureCardGridCellSize(root)
  const fitWidth = Math.floor(
    (CARD_GRID_EXPORT_WIDTH - (SPLIT_EXPORT_COLS - 1) * gap) / SPLIT_EXPORT_COLS
  )
  const cardWidth = Math.max(natural.cardWidth, fitWidth)
  const sample = getCardGridItems(root)[0]
  const cardHeight = computeSplitExportCardHeight(sample, cardWidth, titleSize)
  return { cardWidth, cardHeight, gap }
}

function prepareMemoExportTypographyForLiveExport(root, saved) {
  saved.memoTypographyStyles = saved.memoTypographyStyles || []
  const exportFont = MEMO_EXPORT_FONT_PX()
  root.querySelectorAll('[data-memo-title], [data-memo-text]').forEach((el) => {
    saved.memoTypographyStyles.push({ el, fontSize: el.style.fontSize })
    el.style.fontSize = exportFont
  })
}

function prepareMemoV2PanelColorsForLiveExport(root, saved) {
  saved.memoLayoutStyles = saved.memoLayoutStyles || []
  root.querySelectorAll('[data-memo-panel]').forEach((panel) => {
    pushMemoLayoutEntry(saved, panel, [
      'background',
      'backgroundColor',
      'backgroundImage',
      'color',
      'boxShadow',
      'border',
      'outline'
    ])
    applyMemoV2PanelExportBackground(panel, panel)
  })
}

function prepareMemoV1ChromeForLiveExport(root, saved) {
  applyCardGridChromeForLiveExport(root, saved)
}

function prepareMemoFixedGridClampForLiveExport(root, saved) {
  saved.memoLayoutStyles = saved.memoLayoutStyles || []

  root.querySelectorAll('[data-memo-card-export]:not([data-maintain-layout])').forEach((card) => {
    const cover = card.querySelector('[data-memo-cover]')
    const panel = card.querySelector('[data-memo-panel]')
    const wrap = card.querySelector('[data-memo-text-wrap]')
    const text = card.querySelector('[data-memo-text]')
    if (!text || !cover) return

    saved.memoLayoutStyles.push({
      el: card,
      overflow: card.style.overflow,
      height: card.style.height,
      maxHeight: card.style.maxHeight
    })
    card.style.overflow = 'hidden'

    saved.memoLayoutStyles.push({
      el: cover,
      overflow: cover.style.overflow,
      height: cover.style.height,
      maxHeight: cover.style.maxHeight
    })
    cover.style.overflow = 'hidden'

    if (panel) {
      const panelRect = panel.getBoundingClientRect()
      const panelH = Math.max(1, Math.ceil(panelRect.height))
      const outerWrap = panel.parentElement
      saved.memoLayoutStyles.push(
        {
          el: panel,
          height: panel.style.height,
          minHeight: panel.style.minHeight,
          maxHeight: panel.style.maxHeight,
          overflow: panel.style.overflow
        },
        {
          el: text,
          display: text.style.display,
          overflow: text.style.overflow,
          maxHeight: text.style.maxHeight,
          webkitLineClamp: text.style.webkitLineClamp,
          lineClamp: text.style.lineClamp,
          webkitBoxOrient: text.style.webkitBoxOrient
        }
      )
      panel.style.height = `${panelH}px`
      panel.style.minHeight = `${panelH}px`
      panel.style.maxHeight = `${panelH}px`
      panel.style.overflow = 'hidden'
      panel.style.display = 'flex'
      panel.style.alignItems = 'center'
      panel.style.justifyContent = 'center'
      applyMemoV2ExportTextBoxPadding(panel, outerWrap, saved)
      applyMemoV2ExportTextClip(text, panelH - MEMO_V2_EXPORT_PANEL_PAD_PX * 2)
      return
    }

    if (!wrap) return

    const coverH = Math.max(1, Math.ceil(cover.getBoundingClientRect().height))
    const wrapH = Math.max(1, Math.ceil(coverH * MEMO_GRADIENT_COVER_RATIO) + 4)
    saved.memoLayoutStyles.push(
      {
        el: wrap,
        height: wrap.style.height,
        maxHeight: wrap.style.maxHeight,
        overflow: wrap.style.overflow
      },
      {
        el: text,
        display: text.style.display,
        overflow: text.style.overflow,
        maxHeight: text.style.maxHeight,
        webkitLineClamp: text.style.webkitLineClamp,
        lineClamp: text.style.lineClamp,
        webkitBoxOrient: text.style.webkitBoxOrient
      }
    )
    wrap.style.height = `${wrapH}px`
    wrap.style.maxHeight = `${wrapH}px`
    wrap.style.overflow = 'hidden'
    text.style.display = '-webkit-box'
    text.style.webkitBoxOrient = 'vertical'
    text.style.webkitLineClamp = '7'
    text.style.lineClamp = '7'
    text.style.overflow = 'hidden'
    text.style.maxHeight = `${Math.max(wrapH - 8, 1)}px`
  })
}

function prepareMemoMaintainLayoutForLiveExport(root, saved) {
  saved.memoLayoutStyles = saved.memoLayoutStyles || []

  root.querySelectorAll('[data-memo-card-export][data-maintain-layout]').forEach((card) => {
    saved.memoLayoutStyles.push({
      el: card,
      overflow: card.style.overflow,
      height: card.style.height,
      maxHeight: card.style.maxHeight
    })
    card.style.overflow = 'hidden'

    const cover = card.querySelector('[data-memo-cover]')
    const coverH = cover ? Math.max(1, Math.ceil(cover.getBoundingClientRect().height)) : 0

    if (cover) {
      saved.memoLayoutStyles.push({
        el: cover,
        overflow: cover.style.overflow,
        height: cover.style.height,
        maxHeight: cover.style.maxHeight
      })
      cover.style.overflow = 'hidden'
    }

    const panel = card.querySelector('[data-memo-panel]')
    const wrap = card.querySelector('[data-memo-text-wrap]')
    const text = card.querySelector('[data-memo-text]')
    if (!text) return

    if (panel && coverH) {
      const cardWidth = Math.max(1, Math.ceil(card.getBoundingClientRect().width))
      applyMemoV2MaintainLayoutSizing(card, cardWidth, saved)
      return
    }

    if (wrap && coverH) {
      const cardWidth = Math.max(1, Math.ceil(card.getBoundingClientRect().width))
      const structuralCoverH = getGalleryCoverExportHeight(cardWidth)
      const wrapH = Math.max(1, Math.ceil(structuralCoverH * MEMO_GRADIENT_COVER_RATIO) + 4)
      saved.memoLayoutStyles.push(
        {
          el: cover,
          width: cover.style.width,
          height: cover.style.height,
          minHeight: cover.style.minHeight,
          maxHeight: cover.style.maxHeight,
          aspectRatio: cover.style.aspectRatio,
          overflow: cover.style.overflow,
          flexShrink: cover.style.flexShrink,
          position: cover.style.position,
          display: cover.style.display
        },
        {
          el: wrap,
          height: wrap.style.height,
          maxHeight: wrap.style.maxHeight,
          overflow: wrap.style.overflow
        },
        {
          el: text,
          display: text.style.display,
          overflow: text.style.overflow,
          maxHeight: text.style.maxHeight,
          webkitLineClamp: text.style.webkitLineClamp,
          lineClamp: text.style.lineClamp,
          webkitBoxOrient: text.style.webkitBoxOrient
        }
      )
      cover.style.width = `${cardWidth}px`
      cover.style.aspectRatio = 'auto'
      cover.style.height = `${structuralCoverH}px`
      cover.style.minHeight = `${structuralCoverH}px`
      cover.style.maxHeight = `${structuralCoverH}px`
      cover.style.overflow = 'hidden'
      cover.style.flexShrink = '0'
      cover.style.position = 'relative'
      cover.style.display = 'block'
      wrap.style.height = `${wrapH}px`
      wrap.style.maxHeight = `${wrapH}px`
      wrap.style.overflow = 'hidden'
      text.style.display = '-webkit-box'
      text.style.webkitBoxOrient = 'vertical'
      text.style.webkitLineClamp = '7'
      text.style.lineClamp = '7'
      text.style.overflow = 'hidden'
      text.style.maxHeight = `${Math.max(wrapH - 8, 1)}px`
    }
  })
}

function prepareCardGridTitlesForLiveExport(root, saved, titleSize = 'medium') {
  saved.titleStyles = saved.titleStyles || []
  root.querySelectorAll('[data-gallery-card-export], [data-memo-card-export]').forEach((card) => {
    // 메모 v1 제목 고정은 prepareMemoV1TitleBars / applyExportCardTitleTextOptions가 담당
    if (isMemoV1TitleFirstCard(card)) return

    const titleBar = card.querySelector('[data-gallery-title-bar], [data-memo-title-bar]')
    if (!titleBar) return
    saved.titleStyles.push({
      el: titleBar,
      overflow: titleBar.style.overflow,
      minHeight: titleBar.style.minHeight,
      height: titleBar.style.height,
      maxHeight: titleBar.style.maxHeight,
      display: titleBar.style.display,
      alignItems: titleBar.style.alignItems,
      lineHeight: titleBar.style.lineHeight,
      paddingTop: titleBar.style.paddingTop,
      paddingBottom: titleBar.style.paddingBottom,
      boxSizing: titleBar.style.boxSizing
    })
    const text = titleBar.querySelector(
      '[data-gallery-title], [data-inline-edit], [data-memo-title], span, p'
    )
    if (!text) return
    saved.titleStyles.push({
      el: text,
      overflow: text.style.overflow,
      display: text.style.display,
      webkitLineClamp: text.style.webkitLineClamp,
      lineClamp: text.style.lineClamp,
      maxHeight: text.style.maxHeight,
      height: text.style.height,
      fontSize: text.style.fontSize,
      lineHeight: text.style.lineHeight,
      paddingBottom: text.style.paddingBottom,
      paddingTop: text.style.paddingTop,
      wordBreak: text.style.wordBreak,
      overflowWrap: text.style.overflowWrap,
      textAlign: text.style.textAlign,
      whiteSpace: text.style.whiteSpace,
      transform: text.style.transform
    })
    const textAlign = resolveExportTitleTextAlign(titleBar, text)
    forceExportTitleTextStyle(text, titleSize)
    applyExportTitleBoxScreenSync(titleBar, text, { textAlign })
  })
}

/**
 * 팝업 titleFontSize → 라이브 내보내기 DOM 최종 주입
 * (.text-xs !important / 메모 typography / 카드 래퍼 적용 이후에도 이기도록 !important)
 */
function applyExportCardTitleTextOptions(root, saved, titleSize = 'medium') {
  const sizeKey = resolveExportTitleSizeKey(titleSize)
  saved.titleStyles = saved.titleStyles || []
  root.querySelectorAll('[data-gallery-card-export], [data-memo-card-export]').forEach((card) => {
    const titleBar = card.querySelector('[data-gallery-title-bar], [data-memo-title-bar]')
    if (!titleBar) return
    /* 잠금 블러 bake된 작품명은 텍스트 스타일 주입 대상에서 제외 */
    if (isTitleBarBlurBaked(titleBar)) return

    /* 메모 v1: 제목바 높이 고정 유지 — flexible로 풀리면 행 간격이 잠식됨 */
    const memoV1TitleFirst = isMemoV1TitleFirstCard(card)

    const text = titleBar.querySelector(
      '[data-gallery-title], [data-inline-edit], [data-memo-title], span, p'
    )
    if (!text) return
    saved.titleStyles.push({
      el: text,
      fontSize: text.style.fontSize,
      lineHeight: text.style.lineHeight,
      wordBreak: text.style.wordBreak,
      overflowWrap: text.style.overflowWrap,
      textAlign: text.style.textAlign,
      whiteSpace: text.style.whiteSpace,
      transform: text.style.transform
    })
    const textAlign = resolveExportTitleTextAlign(titleBar, text)
    forceExportTitleTextStyle(text, sizeKey)
    if (!memoV1TitleFirst) {
      saved.titleStyles.push({
        el: titleBar,
        height: titleBar.style.height,
        minHeight: titleBar.style.minHeight,
        maxHeight: titleBar.style.maxHeight,
        overflow: titleBar.style.overflow,
        lineHeight: titleBar.style.lineHeight,
        paddingTop: titleBar.style.paddingTop,
        paddingBottom: titleBar.style.paddingBottom,
        paddingLeft: titleBar.style.paddingLeft,
        paddingRight: titleBar.style.paddingRight,
        textAlign: titleBar.style.textAlign,
        alignItems: titleBar.style.alignItems,
        justifyContent: titleBar.style.justifyContent
      })
      applyExportTitleBoxScreenSync(titleBar, text, { textAlign })
      forceExportTitleBarFlexible(titleBar, sizeKey)
    } else {
      const titleH = `${getMemoV1ExportTitleBarHeight(sizeKey)}px`
      saved.titleStyles.push({
        el: titleBar,
        height: titleBar.style.height,
        minHeight: titleBar.style.minHeight,
        maxHeight: titleBar.style.maxHeight,
        overflow: titleBar.style.overflow,
        flex: titleBar.style.flex
      })
      titleBar.style.setProperty('flex', `0 0 ${titleH}`, 'important')
      titleBar.style.setProperty('height', titleH, 'important')
      titleBar.style.setProperty('min-height', titleH, 'important')
      titleBar.style.setProperty('max-height', titleH, 'important')
      titleBar.style.overflow = 'hidden'
      forceExportTitleTextStyle(text, sizeKey)
      text.style.setProperty('word-break', 'keep-all', 'important')
      text.style.setProperty('overflow-wrap', 'break-word', 'important')
      text.style.setProperty('line-height', '1.35', 'important')
      text.style.setProperty('text-align', textAlign, 'important')
      text.style.setProperty('white-space', 'normal', 'important')
    }
  })
}

function pushMemoLayoutStyle(saved, el, keys) {
  if (!el) return
  saved.memoLayoutStyles = saved.memoLayoutStyles || []
  const entry = { el }
  keys.forEach((key) => {
    entry[key] = el.style[key]
  })
  saved.memoLayoutStyles.push(entry)
}

function unclampMemoTextForExport(text, saved) {
  if (!text) return
  pushMemoLayoutStyle(saved, text, [
    'display',
    'overflow',
    'maxHeight',
    'height',
    'webkitLineClamp',
    'lineClamp',
    'webkitBoxOrient',
    'whiteSpace',
    'wordBreak',
    'fontSize'
  ])
  text.style.display = 'block'
  text.style.overflow = 'visible'
  text.style.maxHeight = 'none'
  text.style.height = 'auto'
  text.style.webkitLineClamp = 'unset'
  text.style.lineClamp = 'unset'
  text.style.webkitBoxOrient = 'unset'
  text.style.whiteSpace = 'pre-wrap'
  text.style.wordBreak = 'break-word'
}

function expandMemoCardForFullTextExport(card, cardWidth, saved) {
  const inner = card.querySelector('[data-memo-card-export]') || card
  const titleBar = inner.querySelector('[data-memo-title-bar]')
  const cover = inner.querySelector('[data-memo-cover]')
  const panel = inner.querySelector('[data-memo-panel]')
  const wrap = inner.querySelector('[data-memo-text-wrap]')
  const text = inner.querySelector('[data-memo-text]')

  pushMemoLayoutStyle(saved, inner, ['height', 'minHeight', 'maxHeight', 'overflow'])
  inner.style.height = 'auto'
  inner.style.minHeight = '0'
  inner.style.maxHeight = 'none'
  inner.style.overflow = 'visible'

  if (text) unclampMemoTextForExport(text, saved)

  if (wrap) {
    pushMemoLayoutStyle(saved, wrap, ['maxHeight', 'height', 'overflow', 'webkitLineClamp', 'lineClamp'])
    wrap.style.maxHeight = 'none'
    wrap.style.height = 'auto'
    wrap.style.overflow = 'visible'
    wrap.style.webkitLineClamp = 'unset'
    wrap.style.lineClamp = 'unset'
  }

  if (panel) {
    pushMemoLayoutStyle(saved, panel, [
      'height',
      'minHeight',
      'maxHeight',
      'overflow',
      'display',
      'alignItems'
    ])
    panel.style.overflow = 'visible'
    panel.style.maxHeight = 'none'
    panel.style.height = 'auto'
    panel.style.minHeight = '0'
    panel.style.display = 'flex'
    panel.style.alignItems = 'center'
  }

  const titleH = titleBar ? Math.max(44, Math.ceil(titleBar.getBoundingClientRect().height)) : 0
  const baseCoverH = Math.round(cardWidth * (4 / 3))
  let coverH = baseCoverH

  if (text) {
    const textH = Math.max(1, Math.ceil(text.scrollHeight))

    if (cover) {
      pushMemoLayoutStyle(saved, cover, [
        'width',
        'height',
        'minHeight',
        'maxHeight',
        'overflow',
        'aspectRatio'
      ])
      cover.style.aspectRatio = 'auto'
      cover.style.width = `${cardWidth}px`
      cover.style.overflow = 'visible'
    }

    if (panel && cover) {
      const panelCs = getComputedStyle(panel)
      const padY = (parseFloat(panelCs.paddingTop) || 0) + (parseFloat(panelCs.paddingBottom) || 0)
      const panelH = Math.max(textH + padY + 4, 48)
      panel.style.minHeight = `${panelH}px`
      coverH = Math.max(baseCoverH, panelH + 24)
    } else if (wrap && cover) {
      coverH = Math.max(baseCoverH, textH + 28)
    } else if (cover) {
      coverH = Math.max(baseCoverH, textH + 24)
    }

    if (cover) {
      cover.style.height = `${coverH}px`
      cover.style.minHeight = `${coverH}px`
      cover.style.maxHeight = 'none'
    }
  }

  return titleH + coverH + 2
}

function applyMemoCardWrapperExportSize(card, cardWidth, cardHeight, saved) {
  saved.cardSizes.push({
    el: card,
    width: card.style.width,
    minWidth: card.style.minWidth,
    minHeight: card.style.minHeight,
    height: card.style.height,
    overflow: card.style.overflow,
    paddingBottom: card.style.paddingBottom,
    boxSizing: card.style.boxSizing,
    marginBottom: card.style.marginBottom
  })
  const shadowPad = getExportCardShadowPadPx()
  const isRetro = getLiveUiStyle() === 'retro'
  const contentH = Math.max(1, cardHeight - (isRetro ? shadowPad : 0))
  card.style.width = `${cardWidth}px`
  card.style.minWidth = `${cardWidth}px`
  card.style.overflow = 'visible'
  if (isRetro) {
    applyExportRetroWrapperBottomPad(card, contentH, shadowPad)
  } else {
    card.style.boxSizing = 'border-box'
    card.style.minHeight = `${cardHeight}px`
    card.style.height = `${cardHeight}px`
    card.style.paddingBottom = `${shadowPad}px`
  }

  const inner = card.querySelector('[data-memo-card-export]')
  if (!inner) return

  saved.cardSizes.push({
    el: inner,
    width: inner.style.width,
    minWidth: inner.style.minWidth,
    minHeight: inner.style.minHeight,
    height: inner.style.height,
    maxHeight: inner.style.maxHeight,
    overflow: inner.style.overflow
  })
  inner.style.width = `${cardWidth}px`
  inner.style.minWidth = `${cardWidth}px`
  inner.style.minHeight = `${Math.max(1, cardHeight - shadowPad)}px`
  inner.style.height = 'auto'
  inner.style.maxHeight = 'none'
  inner.style.setProperty(
    'overflow',
    getLiveUiStyle() === 'retro' ? 'hidden' : 'visible',
    'important'
  )
}

function computeMemoExportRowHeights(cardHeights, rowCount = SPLIT_EXPORT_ROWS) {
  const rowHeights = []
  for (let row = 0; row < rowCount; row++) {
    let maxH = 0
    for (let col = 0; col < SPLIT_EXPORT_COLS; col++) {
      const idx = row * SPLIT_EXPORT_COLS + col
      if (idx < cardHeights.length) maxH = Math.max(maxH, cardHeights[idx])
    }
    if (maxH > 0) rowHeights.push(maxH)
  }
  const fallback = cardHeights[0] || 240
  while (rowHeights.length < rowCount) {
    rowHeights.push(rowHeights[rowHeights.length - 1] || fallback)
  }
  return rowHeights.slice(0, rowCount)
}

function measureMemoGridExportHeight(root) {
  const height = parseInt(root.style.height, 10)
  if (Number.isFinite(height) && height > 0) return height
  return Math.max(1, Math.ceil(root.getBoundingClientRect().height))
}

async function fitMemoExportSliceEnd(start, initialEnd, onExportSlice, resolveRoot) {
  let end = initialEnd

  while (end > start) {
    await onExportSlice({ start, end })
    await waitForExportTick(480)
    await yieldToMain()

    const root = resolveRoot()
    if (!root) throw new Error('내보낼 화면을 찾을 수 없습니다')

    await waitForCardGridCount(root, end - start, 6000)

    let layoutSaved = null
    try {
      layoutSaved = applyTenByTenExportLayout(root)
      const gridH = measureMemoGridExportHeight(root)
      if (gridH <= MAX_MEMO_GRID_EXPORT_HEIGHT || end - start <= 1) {
        return end
      }
    } finally {
      restoreTenByTenExportLayout(root, layoutSaved)
    }

    end = start + Math.max(1, Math.ceil((end - start) * 0.65))
  }

  return Math.min(start + 1, initialEnd)
}

function applyCardWrapperExportSize(card, cardWidth, cardHeight, saved, titleSize = 'medium') {
  const inner =
    card.querySelector('[data-gallery-card-export]') ||
    card.querySelector('[data-memo-card-export]')
  const maintainLayout = inner?.hasAttribute('data-maintain-layout')
  const memoV1TitleFirst = isMemoV1TitleFirstCard(inner)
  const resolvedCardHeight = memoV1TitleFirst
    ? getMemoV1ExportCardHeight(cardWidth, titleSize)
    : cardHeight

  saved.cardSizes.push({
    el: card,
    width: card.style.width,
    minWidth: card.style.minWidth,
    minHeight: card.style.minHeight,
    height: card.style.height,
    overflow: card.style.overflow,
    paddingBottom: card.style.paddingBottom,
    boxSizing: card.style.boxSizing,
    marginBottom: card.style.marginBottom
  })
  const shadowPad = getExportCardShadowPadPx()
  const isRetro = getLiveUiStyle() === 'retro'
  card.style.width = `${cardWidth}px`
  card.style.minWidth = `${cardWidth}px`
  // 하단 그림자·2줄 제목이 셀 밖으로 잘리지 않게
  // 메모 v1 / glass(overflow:visible !important) — 행 간격 잠식 방지
  if (maintainLayout || memoV1TitleFirst) {
    card.style.setProperty('overflow', 'hidden', 'important')
  } else {
    card.style.overflow = 'visible'
  }
  if (!maintainLayout) {
    if (memoV1TitleFirst) {
      /* 그림자 여백을 카드 안에 넣지 않음 — 표지가 테두리에 밀착 (기본/글래스/레트로) */
      card.style.boxSizing = 'border-box'
      card.style.minHeight = `${resolvedCardHeight}px`
      card.style.height = `${resolvedCardHeight}px`
      card.style.paddingBottom = '0'
      card.style.marginBottom = '0'
    } else if (isRetro) {
      /* content-box + padding-bottom: 그림자 공간을 셀 내부에 포함 (margin 무시 대응) */
      applyExportRetroWrapperBottomPad(card, resolvedCardHeight - shadowPad, shadowPad)
    } else {
      card.style.boxSizing = 'border-box'
      card.style.minHeight = `${resolvedCardHeight}px`
      card.style.height = `${resolvedCardHeight}px`
      card.style.paddingBottom = `${shadowPad}px`
    }
  } else {
    card.style.minHeight = `${resolvedCardHeight}px`
    card.style.height = `${resolvedCardHeight}px`
    if (memoV1TitleFirst) card.style.paddingBottom = '0'
  }

  if (inner) {
    saved.cardSizes.push({
      el: inner,
      width: inner.style.width,
      minWidth: inner.style.minWidth,
      minHeight: inner.style.minHeight,
      height: inner.style.height,
      maxHeight: inner.style.maxHeight,
      overflow: inner.style.overflow,
      borderRadius: inner.style.borderRadius,
      display: inner.style.display,
      flexDirection: inner.style.flexDirection,
      marginBottom: inner.style.marginBottom
    })
    inner.style.width = `${cardWidth}px`
    inner.style.minWidth = `${cardWidth}px`
    inner.style.minHeight = `${Math.max(
      1,
      resolvedCardHeight - (maintainLayout || memoV1TitleFirst ? 0 : shadowPad)
    )}px`
    inner.style.borderRadius = `${getExportCardRadiusPx()}px`
    if (isTitleFirstCard(inner)) {
      inner.style.display = 'flex'
      inner.style.flexDirection = 'column'
    }
    if (maintainLayout || memoV1TitleFirst) {
      /* 메모 v1: 작품명 대 등으로 내부가 커져도 행 간격을 잠식하지 않도록 셀 높이에 고정 */
      inner.style.height = `${resolvedCardHeight}px`
      inner.style.maxHeight = `${resolvedCardHeight}px`
      inner.style.setProperty('overflow', 'hidden', 'important')
      inner.style.marginBottom = '0'
    } else {
      inner.style.height = 'auto'
      inner.style.maxHeight = 'none'
      /* 레트로 내보내기는 비대칭 border 클립 / 그 외는 그림자 보존 */
      inner.style.setProperty('overflow', isRetro ? 'hidden' : 'visible', 'important')
      inner.style.marginBottom = '0'
    }

    const titleBar = inner.querySelector('[data-gallery-title-bar], [data-memo-title-bar]')
    if (titleBar && memoV1TitleFirst) {
      const titleH = `${getMemoV1ExportTitleBarHeight(titleSize)}px`
      saved.cardSizes.push({
        el: titleBar,
        height: titleBar.style.height,
        minHeight: titleBar.style.minHeight,
        maxHeight: titleBar.style.maxHeight,
        overflow: titleBar.style.overflow,
        flex: titleBar.style.flex
      })
      titleBar.style.setProperty('flex', `0 0 ${titleH}`, 'important')
      titleBar.style.setProperty('height', titleH, 'important')
      titleBar.style.setProperty('min-height', titleH, 'important')
      titleBar.style.setProperty('max-height', titleH, 'important')
      titleBar.style.overflow = 'hidden'
    } else if (titleBar && !maintainLayout) {
      // 갤러리/메모 일반 카드: 제목 2줄에 맞춰 유연 높이 (고정 height 금지)
      saved.cardSizes.push({
        el: titleBar,
        height: titleBar.style.height,
        minHeight: titleBar.style.minHeight,
        maxHeight: titleBar.style.maxHeight,
        overflow: titleBar.style.overflow,
        flex: titleBar.style.flex
      })
      titleBar.style.flex = '0 0 auto'
      titleBar.style.height = 'auto'
      titleBar.style.minHeight = `${GALLERY_TITLE_BAR_PX}px`
      titleBar.style.maxHeight = 'none'
      titleBar.style.overflow = 'visible'
    }

    const cover = inner.querySelector('[data-gallery-cover], [data-memo-cover]')
    if (cover) {
      const coverH = titleBar
        ? getGalleryCoverExportHeight(cardWidth)
        : Math.max(1, resolvedCardHeight - (maintainLayout ? 0 : shadowPad + 2))
      saved.cardSizes.push({
        el: cover,
        width: cover.style.width,
        height: cover.style.height,
        minHeight: cover.style.minHeight,
        maxHeight: cover.style.maxHeight,
        aspectRatio: cover.style.aspectRatio,
        overflow: cover.style.overflow,
        position: cover.style.position,
        flex: cover.style.flex,
        flexGrow: cover.style.flexGrow,
        flexShrink: cover.style.flexShrink,
        marginTop: cover.style.marginTop,
        marginBottom: cover.style.marginBottom,
        top: cover.style.top
      })
      cover.style.width = `${cardWidth}px`
      cover.style.aspectRatio = 'auto'
      cover.style.overflow = 'hidden'
      cover.style.position = 'relative'
      cover.style.top = '0'
      cover.style.marginTop = '0'
      cover.style.marginBottom = '0'
      if (memoV1TitleFirst) {
        /* 남은 높이를 표지가 채움 — 하단 빈 띠/잔선 제거 */
        cover.style.height = 'auto'
        cover.style.minHeight = `${coverH}px`
        cover.style.maxHeight = 'none'
        cover.style.flex = '1 1 auto'
        cover.style.flexGrow = '1'
        cover.style.flexShrink = '0'
      } else {
        cover.style.height = `${coverH}px`
        cover.style.minHeight = `${coverH}px`
        cover.style.maxHeight = `${coverH}px`
        cover.style.flex = ''
        cover.style.flexShrink = '0'
      }
      cover.querySelectorAll('img').forEach((img) => {
        img.style.setProperty('display', 'block', 'important')
        img.style.margin = '0'
        img.style.padding = '0'
        img.style.top = '0'
      })
    }
  }
}

function resolveCardGridExportGridConfig(element, options = {}) {
  const root =
    element?.hasAttribute?.('data-gallery-export-root') ||
    element?.hasAttribute?.('data-memo-export-root')
      ? element
      : resolveCardGridExportRoot(element, options)

  if (options.galleryTenByTen || root?.hasAttribute('data-gallery-export-root') || root?.hasAttribute('data-memo-export-root')) {
    return {
      cols: SPLIT_EXPORT_COLS,
      rows: GALLERY_EXPORT_ROWS_PAGED,
      pageSize: GALLERY_EXPORT_PAGE_SIZE_PAGED,
      fixedMemoGrid: root?.hasAttribute('data-memo-export-root')
    }
  }

  return {
    cols: SPLIT_EXPORT_COLS,
    rows: SPLIT_EXPORT_ROWS,
    pageSize: SPLIT_EXPORT_PAGE_SIZE
  }
}

function applyTenByTenExportLayout(
  root,
  gridConfig = resolveCardGridExportGridConfig(root),
  options = {}
) {
  const {
    cols = SPLIT_EXPORT_COLS,
    rows = SPLIT_EXPORT_ROWS,
    pageSize = SPLIT_EXPORT_PAGE_SIZE,
    fixedMemoGrid = false
  } = gridConfig
  const titleSize = resolveExportTitleSizeFromOptions(options)
  const saved = {
    layout: {
      gridTemplateColumns: root.style.gridTemplateColumns,
      gridTemplateRows: root.style.gridTemplateRows,
      gridAutoRows: root.style.gridAutoRows,
      gridAutoFlow: root.style.gridAutoFlow,
      width: root.style.width,
      minWidth: root.style.minWidth,
      height: root.style.height,
      minHeight: root.style.minHeight,
      maxHeight: root.style.maxHeight,
      gap: root.style.gap,
      columnGap: root.style.columnGap,
      rowGap: root.style.rowGap,
      overflow: root.style.overflow,
      alignItems: root.style.alignItems,
      justifyItems: root.style.justifyItems
    },
    hiddenExportEls: [],
    placeholders: [],
    scrollNodes: [],
    cardSizes: [],
    titleStyles: [],
    memoLayoutStyles: [],
    memoTypographyStyles: [],
    memoV1ChromeStyles: [],
    cardChromeStyles: [],
    coverImageStyles: [],
    uiStyleAttr: root.getAttribute('data-ui-style'),
    exportTitleSizeAttr: root.getAttribute('data-export-title-size'),
    exportTitleSize: titleSize,
    stackStyles: []
  }

  injectExportUiStyleAttr(root)
  root.setAttribute('data-export-title-size', titleSize)

  root.querySelectorAll('[data-export-hide]').forEach((el) => {
    saved.hiddenExportEls.push({ el, display: el.style.display })
    el.style.display = 'none'
  })

  forceCardGridFullyVisible(root)
  expandScrollAncestors(root, { nodes: saved.scrollNodes })

  const isMemo = root.hasAttribute('data-memo-export-root')
  /* 가로 간격(카드 폭) 유지 — 레트로만 세로 간격을 그림자용으로 확보 */
  const colGap = parseGridGap(root)
  const rowGap =
    getLiveUiStyle() === 'retro' ? Math.max(colGap, EXPORT_RETRO_SHADOW_GAP_PX) : colGap
  const natural = measureCardGridCellSize(root)
  const fitWidth = Math.floor((CARD_GRID_EXPORT_WIDTH - (cols - 1) * colGap) / cols)
  const cardWidth = Math.max(natural.cardWidth, fitWidth)

  prepareCardGridTitlesForLiveExport(root, saved, titleSize)
  prepareMemoExportTypographyForLiveExport(root, saved)
  prepareMemoV1ChromeForLiveExport(root, saved)
  prepareMemoV1TitleBarsForLiveExport(root, saved, titleSize)
  applyExportCardTitleTextOptions(root, saved, titleSize)
  if (isMemo) prepareMemoV2PanelColorsForLiveExport(root, saved)

  const allCards = getCardGridItems(root)
  // pageSize 초과분은 숨겨 암시적 추가 행(예: 17행)이 생기지 않게 함
  allCards.forEach((card, i) => {
    if (i < pageSize) return
    saved.hiddenExportEls.push({ el: card, display: card.style.display })
    card.style.display = 'none'
  })
  const cards = allCards.slice(0, pageSize)
  let cardHeights = []
  let rowHeights = []

  if (isMemo && fixedMemoGrid) {
    prepareMemoMaintainLayoutForLiveExport(root, saved)
    prepareMemoV1MaintainLayoutCoverForLiveExport(root, cardWidth, saved)
    prepareMemoFixedGridClampForLiveExport(root, saved)
    const { cardHeight } = computeSplitExportCardMetrics(root, titleSize)
    cards.forEach((card) => {
      applyCardWrapperExportSize(card, cardWidth, cardHeight, saved, titleSize)
      cardHeights.push(cardHeight)
    })
    rowHeights = Array(rows).fill(cardHeight)
  } else if (isMemo) {
    const shadowPad = getExportCardShadowPadPx()
    cards.forEach((card) => {
      cardHeights.push(
        expandMemoCardForFullTextExport(card, cardWidth, saved) + shadowPad
      )
    })
    rowHeights = computeMemoExportRowHeights(cardHeights, rows)
    cards.forEach((card, i) => {
      const row = Math.floor(i / cols)
      const rowH = rowHeights[row] || cardHeights[i]
      applyMemoCardWrapperExportSize(card, cardWidth, rowH, saved)
    })
  } else {
    const { cardHeight } = computeSplitExportCardMetrics(root, titleSize)
    cards.forEach((card) => {
      applyCardWrapperExportSize(card, cardWidth, cardHeight, saved, titleSize)
      cardHeights.push(cardHeight)
    })
    rowHeights = Array(rows).fill(cardHeight)
    prepareMemoMaintainLayoutForLiveExport(root, saved)
  }

  applyExportCardStackOrder(cards, saved)
  prepareCoverImagesForLiveExport(root, cardWidth, saved)

  const gridWidth = cardWidth * cols + (cols - 1) * colGap
  const gridHeight = rowHeights.reduce((sum, h, i) => sum + h + (i > 0 ? rowGap : 0), 0)
  const sizeStyle = `${gridWidth}px`

  root.style.gridTemplateColumns = `repeat(${cols}, ${cardWidth}px)`
  root.style.gridTemplateRows = rowHeights.map((h) => `${h}px`).join(' ')
  root.style.gridAutoRows = '0'
  root.style.gridAutoFlow = 'row'
  root.style.columnGap = `${colGap}px`
  root.style.rowGap = `${rowGap}px`
  root.style.gap = `${rowGap}px ${colGap}px`
  /* 14~15줄이 stretch 로 눌려 그림자/타이틀이 겹치지 않도록 상단 정렬 고정 */
  root.style.alignItems = 'start'
  root.style.justifyItems = 'start'
  root.style.width = sizeStyle
  root.style.minWidth = sizeStyle
  root.style.height = `${gridHeight}px`
  root.style.minHeight = `${gridHeight}px`
  root.style.maxHeight = `${gridHeight}px`
  root.style.overflow = getLiveUiStyle() === 'retro' ? 'visible' : 'hidden'

  const missing = Math.max(0, pageSize - cards.length)
  for (let i = 0; i < missing; i++) {
    const placeholder = document.createElement('div')
    placeholder.setAttribute('data-split-export-placeholder', '')
    placeholder.setAttribute('aria-hidden', 'true')
    placeholder.style.width = `${cardWidth}px`
    placeholder.style.height = `${rowHeights[Math.floor(i / cols)] || rowHeights[0]}px`
    placeholder.style.minHeight = placeholder.style.height
    placeholder.style.pointerEvents = 'none'
    root.appendChild(placeholder)
    saved.placeholders.push(placeholder)
  }

  bakeExportUiStyleChromeOnLiveCards(root, saved)

  // 카드 래퍼/크롬 bake 이후 최종 재주입 — titleFontSize가 DOM에 확실히 남도록
  applyExportCardTitleTextOptions(root, saved, titleSize)

  /* 표지 geometry/타이틀 주입 이후 — 기본 모드 흰색·상단 라운드 최종 고정 */
  applyDefaultModeExportCardChromeOnRoot(root, saved)
  /* 메모 v1: 측정 후 표지를 카드 하단에 밀착 (위쪽 유격 없이 높이만 확장) */
  sealMemoV1ExportCoverToBottom(root, saved)

  saved.exportCardWidth = cardWidth
  saved.exportTitleSize = titleSize
  return saved
}

function restoreTenByTenExportLayout(root, saved) {
  if (!root || !saved) return
  if (saved.uiStyleAttr == null || saved.uiStyleAttr === '') {
    root.removeAttribute('data-ui-style')
  } else {
    root.setAttribute('data-ui-style', saved.uiStyleAttr)
  }
  if (saved.exportTitleSizeAttr == null || saved.exportTitleSizeAttr === '') {
    root.removeAttribute('data-export-title-size')
  } else {
    root.setAttribute('data-export-title-size', saved.exportTitleSizeAttr)
  }
  restoreExportCardStackOrder(saved)
  saved.placeholders?.forEach((node) => node.remove())
  saved.cardSizes?.forEach((entry) => {
    const { el, _coverGeom, ...styles } = entry
    if (!el) return
    Object.entries(styles).forEach(([key, value]) => {
      restoreStyleProp(el, key, value)
    })
  })
  saved.coverImageStyles?.forEach((entry) => {
    const { el, src, ...styles } = entry
    if (!el) return
    if (src !== undefined) el.src = src
    Object.entries(styles).forEach(([key, value]) => {
      restoreStyleProp(el, key, value)
    })
  })
  saved.titleStyles?.forEach((entry) => {
    const { el, ...styles } = entry
    if (!el) return
    Object.entries(styles).forEach(([key, value]) => {
      restoreStyleProp(el, key, value)
    })
  })
  saved.memoLayoutStyles?.forEach((entry) => {
    const { el, ...styles } = entry
    if (!el) return
    Object.entries(styles).forEach(([key, value]) => {
      restoreStyleProp(el, key, value)
    })
  })
  saved.memoTypographyStyles?.forEach(({ el, fontSize }) => {
    restoreStyleProp(el, 'fontSize', fontSize)
  })
  saved.memoV1ChromeStyles?.forEach((entry) => {
    const { el, ...styles } = entry
    if (!el) return
    Object.entries(styles).forEach(([key, value]) => {
      restoreStyleProp(el, key, value)
    })
  })
  saved.cardChromeStyles?.forEach((entry) => {
    const { el, ...styles } = entry
    if (!el) return
    Object.entries(styles).forEach(([key, value]) => {
      // bake 중 저장된 mid-export 값(예: width:200px)으로 되돌리면 비율이 깨짐 → !important만 제거
      if (
        el.matches?.('[data-gallery-cover], [data-memo-cover]') &&
        (key === 'width' || key === 'maxWidth' || key === 'boxSizing' || key === 'overflow')
      ) {
        el.style.removeProperty(stylePropToKebab(key))
        return
      }
      restoreStyleProp(el, key, value)
    })
  })
  saved.hiddenExportEls?.forEach(({ el, display }) => {
    restoreStyleProp(el, 'display', display)
  })
  saved.scrollNodes?.forEach(
    ({ el, scrollTop, height, maxHeight, overflow, overflowY }) => {
      if (!el) return
      restoreStyleProp(el, 'height', height)
      restoreStyleProp(el, 'maxHeight', maxHeight)
      restoreStyleProp(el, 'overflow', overflow)
      restoreStyleProp(el, 'overflowY', overflowY)
      if (scrollTop !== undefined) el.scrollTop = scrollTop
    }
  )
  if (saved.layout) {
    Object.entries(saved.layout).forEach(([key, value]) => {
      restoreStyleProp(root, key, value)
    })
  }

  // React가 관리하지 않는 표지 geometry / !important 잔존 최종 제거 → 3:4 클래스 비율 복구
  scrubLiveCardGridExportGeometry(root)
}

function getTagBlocks(root) {
  const grid = root?.querySelector('[data-tag-block-grid]')
  if (!grid) return []
  return [...grid.querySelectorAll('[data-tag-block]')]
}

function expandTagBlockScrolls(block, saved) {
  block.querySelectorAll('[data-tag-block-scroll]').forEach((el) => {
    saved.scrollEls.push({
      el,
      height: el.style.height,
      maxHeight: el.style.maxHeight,
      overflow: el.style.overflow,
      overflowY: el.style.overflowY
    })
    el.style.setProperty('overflow', 'visible', 'important')
    el.style.setProperty('height', 'auto', 'important')
    el.style.maxHeight = 'none'
    el.style.overflowY = 'visible'
  })
}

function measureTagBlockCellSize(grid, blocks) {
  const visible = blocks.filter((block) => block.style.display !== 'none')
  const sample = visible[0] || blocks[0]
  const gap = parseGridGap(grid)
  if (!sample) {
    return { blockWidth: 200, blockHeight: 480, gap }
  }

  void grid.offsetHeight

  const blockWidth = Math.max(1, Math.round(sample.getBoundingClientRect().width))
  let blockHeight = 0
  if (visible.length) {
    blockHeight = Math.max(
      ...visible.map((block) => Math.max(1, Math.round(block.getBoundingClientRect().height)))
    )
  }
  if (!blockHeight) blockHeight = Math.round(sample.getBoundingClientRect().height) || 480

  return { blockWidth, blockHeight, gap }
}

function applyTagRowExportLayout(root, visibleBlocks) {
  const grid = root.querySelector('[data-tag-block-grid]')
  const saved = {
    layout: grid
      ? {
          display: grid.style.display,
          flexWrap: grid.style.flexWrap,
          alignItems: grid.style.alignItems,
          gridTemplateColumns: grid.style.gridTemplateColumns,
          gridTemplateRows: grid.style.gridTemplateRows,
          gridAutoRows: grid.style.gridAutoRows,
          gridAutoFlow: grid.style.gridAutoFlow,
          width: grid.style.width,
          minWidth: grid.style.minWidth,
          height: grid.style.height,
          minHeight: grid.style.minHeight,
          gap: grid.style.gap,
          overflow: grid.style.overflow
        }
      : null,
    rootLayout: {
      width: root.style.width,
      minWidth: root.style.minWidth,
      height: root.style.height,
      minHeight: root.style.minHeight,
      overflow: root.style.overflow
    },
    hiddenExportEls: [],
    scrollEls: [],
    scrollNodes: [],
    blockHeights: []
  }

  root.querySelectorAll('[data-export-hide]').forEach((el) => {
    saved.hiddenExportEls.push({ el, display: el.style.display })
    el.style.display = 'none'
  })

  visibleBlocks.forEach((block) => {
    saved.blockHeights.push({
      el: block,
      height: block.style.height,
      minHeight: block.style.minHeight
    })
    expandTagBlockScrolls(block, saved)
  })

  expandScrollAncestors(root, { nodes: saved.scrollNodes })

  if (!grid) return saved

  const { blockWidth, blockHeight, gap } = measureTagBlockCellSize(grid, visibleBlocks)
  const gridWidth = TAG_SPLIT_EXPORT_COLS * blockWidth + (TAG_SPLIT_EXPORT_COLS - 1) * gap
  const gridHeight = TAG_SPLIT_EXPORT_ROWS * blockHeight + (TAG_SPLIT_EXPORT_ROWS - 1) * gap
  const sizeStyle = `${gridWidth}px`

  grid.style.display = 'grid'
  grid.style.flexWrap = ''
  grid.style.alignItems = 'start'
  grid.style.gridTemplateColumns = `repeat(${TAG_SPLIT_EXPORT_COLS}, ${blockWidth}px)`
  grid.style.gridTemplateRows = `repeat(${TAG_SPLIT_EXPORT_ROWS}, ${blockHeight}px)`
  grid.style.gridAutoRows = ''
  grid.style.gridAutoFlow = 'row'
  grid.style.gap = `${gap}px`
  grid.style.width = sizeStyle
  grid.style.minWidth = sizeStyle
  grid.style.height = `${gridHeight}px`
  grid.style.minHeight = `${gridHeight}px`
  grid.style.overflow = 'visible'

  visibleBlocks.forEach((block) => {
    block.style.height = `${blockHeight}px`
    block.style.minHeight = `${blockHeight}px`
  })

  root.style.width = sizeStyle
  root.style.minWidth = sizeStyle
  root.style.height = `${gridHeight}px`
  root.style.minHeight = `${gridHeight}px`
  root.style.overflow = 'visible'

  return saved
}

function restoreTagRowExportLayout(root, saved) {
  if (!root || !saved) return
  saved.hiddenExportEls?.forEach(({ el, display }) => {
    if (!el) return
    el.style.display = display
  })
  saved.scrollEls?.forEach(({ el, height, maxHeight, overflow, overflowY }) => {
    if (!el) return
    if (height !== undefined) {
      el.style.removeProperty('height')
      el.style.height = height
    }
    if (maxHeight !== undefined) el.style.maxHeight = maxHeight
    if (overflow !== undefined) {
      el.style.removeProperty('overflow')
      el.style.overflow = overflow
    }
    if (overflowY !== undefined) el.style.overflowY = overflowY
  })
  saved.blockHeights?.forEach(({ el, height, minHeight }) => {
    if (!el) return
    if (height !== undefined) el.style.height = height
    if (minHeight !== undefined) el.style.minHeight = minHeight
  })
  saved.scrollNodes?.forEach(({ el, scrollTop, height, maxHeight, overflow, overflowY }) => {
    if (!el) return
    if (height !== undefined) {
      el.style.removeProperty('height')
      el.style.height = height
    }
    if (maxHeight !== undefined) el.style.maxHeight = maxHeight
    if (overflow !== undefined) {
      el.style.removeProperty('overflow')
      el.style.overflow = overflow
    }
    if (overflowY !== undefined) el.style.overflowY = overflowY
    if (scrollTop !== undefined) el.scrollTop = scrollTop
  })

  const grid = root.querySelector('[data-tag-block-grid]')
  if (grid && saved.layout) {
    Object.entries(saved.layout).forEach(([key, value]) => {
      grid.style[key] = value
    })
  }
  if (saved.rootLayout) {
    Object.entries(saved.rootLayout).forEach(([key, value]) => {
      if (key === 'height' || key === 'overflow') {
        root.style.removeProperty(key === 'height' ? 'height' : 'overflow')
      }
      root.style[key] = value
    })
  }
}

export async function exportTagPropertySplitAsPng(element, filename, options = {}) {
  return withExportBackground(async () => {
    const blocks = getTagBlocks(element)
    const total = blocks.length

    if (!total) {
      await exportElementAsPng(element, splitExportPageFilename(filename, 1), {
        ...options,
        splitExportPages: true,
        splitPageCapture: true,
        exportPage: 1,
        exportTotalPages: 1
      })
      return
    }

    const pages = Math.max(1, Math.ceil(total / TAG_SPLIT_EXPORT_PAGE_SIZE))
    const savedDisplays = blocks.map((block) => block.style.display)

    try {
      for (let page = 0; page < pages; page++) {
        const start = page * TAG_SPLIT_EXPORT_PAGE_SIZE
        const end = Math.min(start + TAG_SPLIT_EXPORT_PAGE_SIZE, total)

        blocks.forEach((block, i) => {
          block.style.display = i >= start && i < end ? savedDisplays[i] || '' : 'none'
        })

        let pageLayoutSaved = null
        try {
          pageLayoutSaved = applyTagRowExportLayout(element, blocks.slice(start, end))
          await preloadExportImages(element, {
            onProgress: options.onProgress,
            timeoutMs: options.preloadTimeoutMs ?? 15000,
            perImageTimeoutMs: options.preloadPerImageTimeoutMs ?? 8000
          })
          await yieldToMain()

          const pageFilename = splitExportPageFilename(filename, page + 1)
          const pageBase = (page / pages) * 100
          const pageOptions = {
            ...options,
            splitExportPages: true,
            splitPageCapture: true,
            exportPage: page + 1,
            exportTotalPages: pages,
            openFolder: page === pages - 1,
            onProgress: async (payload) => {
              const local = payload?.percent
              const blended =
                local != null ? Math.min(99, Math.round(pageBase + local / pages)) : null
              await notifyProgress(options.onProgress, {
                ...payload,
                label:
                  pages > 1
                    ? `${payload?.label || '내보내기'} (${page + 1}/${pages}페이지)`
                    : payload?.label,
                percent: blended
              })
            }
          }

          await exportElementAsPng(element, pageFilename, pageOptions)
        } finally {
          restoreTagRowExportLayout(element, pageLayoutSaved)
        }
      }
    } finally {
      blocks.forEach((block, i) => {
        block.style.display = savedDisplays[i]
      })
    }
  })
}

export function splitExportPageFilename(baseFilename, pageNum) {
  const dot = baseFilename.lastIndexOf('.')
  if (dot <= 0) return `${baseFilename}${pageNum}page`
  return `${baseFilename.slice(0, dot)}${pageNum}page${baseFilename.slice(dot)}`
}

function getCardGridExportSelector(element) {
  if (element?.hasAttribute('data-gallery-export-root')) return '[data-gallery-export-root]'
  if (element?.hasAttribute('data-memo-export-root')) return '[data-memo-export-root]'
  return null
}

function resolveCardGridExportRoot(element, options) {
  const selector = getCardGridExportSelector(element)
  if (selector && typeof options.resolveExportRoot === 'function') {
    return options.resolveExportRoot(selector) || element
  }
  return element
}

export async function exportCardGridSplitAsPng(element, tabTitle, options = {}) {
  return withExportBackground(async () => {
  const { onExportSlice, totalRecordCount } = options
  const gridConfig = resolveCardGridExportGridConfig(element, options)
  const exportPageSize = gridConfig.pageSize
  const useSlice = typeof onExportSlice === 'function'
  const total = useSlice ? (totalRecordCount ?? 0) : getCardGridItems(element).length

  const buildPageFilename = (pageNum, totalPages = 1) =>
    typeof options.buildPageFilename === 'function'
      ? options.buildPageFilename(tabTitle, pageNum, totalPages)
      : cardGridPageFilename(tabTitle, pageNum, { totalPages })

  if (!total && !useSlice) {
    let emptyLayoutSaved = null
    try {
      emptyLayoutSaved = applyTenByTenExportLayout(element, gridConfig, options)
      await prepareCardGridLiveExportCapture(element, emptyLayoutSaved, options)
      await exportElementAsPng(element, buildPageFilename(1, 1), {
        ...options,
        splitExportPages: true,
        splitPageCapture: true,
        exportPage: 1,
        exportTotalPages: 1,
        exportCardWidth: emptyLayoutSaved.exportCardWidth,
        exportTargetWidth: CARD_GRID_EXPORT_WIDTH,
        brandedMinWidth: CARD_GRID_EXPORT_WIDTH,
        skipBrandedHeader: false,
        skipBrandedHeaderText: false,
        showDate: options.showDate !== false,
        titleLabel: options.titleLabel ?? ''
      })
    } finally {
      restoreTenByTenExportLayout(element, emptyLayoutSaved)
    }
    return
  }

  const isMemoExport = element.hasAttribute('data-memo-export-root')
  const saved = {
    gridTemplateColumns: element.style.gridTemplateColumns,
    gridTemplateRows: element.style.gridTemplateRows,
    gridAutoRows: element.style.gridAutoRows,
    gridAutoFlow: element.style.gridAutoFlow,
    width: element.style.width,
    minWidth: element.style.minWidth,
    height: element.style.height,
    minHeight: element.style.minHeight,
    gap: element.style.gap
  }
  const legacyCards = useSlice ? null : getCardGridItems(element)
  const savedCardDisplays = legacyCards?.map((card) => card.style.display) ?? []
  let root = resolveCardGridExportRoot(element, options)

  const exportMemoOrGridPage = async (pageNum, start, end, totalPages, _isFirstPage, isLastPage) => {
    if (useSlice) {
      await onExportSlice({ start, end: total ? end : 0 })
      await waitForExportTick(400)
      await yieldToMain()
      root = resolveCardGridExportRoot(element, options)
      if (!root) throw new Error('내보낼 화면을 찾을 수 없습니다')
    } else {
      legacyCards.forEach((card, i) => {
        card.style.display = i >= start && i < end ? savedCardDisplays[i] || '' : 'none'
      })
    }

    let pageLayoutSaved = null
    try {
      const expectedCards = total ? end - start : 0
      await waitForCardGridCount(root, expectedCards)
      pageLayoutSaved = applyTenByTenExportLayout(root, gridConfig, options)
      await prepareCardGridLiveExportCapture(root, pageLayoutSaved, options)

      const pageFilename = buildPageFilename(pageNum, totalPages)
      const pageBase = totalPages > 0 ? ((pageNum - 1) / totalPages) * 100 : 0
      const pageOptions = {
        ...options,
        // 모든 페이지에 동일 브랜디드 프레임·타이틀·우측상단 정보 적용
        splitExportPages: true,
        splitPageCapture: true,
        exportPage: pageNum,
        exportTotalPages: totalPages,
        exportCardWidth: pageLayoutSaved.exportCardWidth,
        exportTargetWidth: CARD_GRID_EXPORT_WIDTH,
        brandedMinWidth: CARD_GRID_EXPORT_WIDTH,
        skipBrandedHeader: false,
        skipBrandedHeaderText: false,
        showDate: options.showDate !== false,
        titleLabel: options.titleLabel ?? '',
        openFolder: isLastPage,
        onProgress: async (payload) => {
          const local = payload?.percent
          const blended =
            local != null ? Math.min(99, Math.round(pageBase + local / Math.max(totalPages, 1))) : null
          await notifyProgress(options.onProgress, {
            ...payload,
            label:
              pageNum > 1 || totalPages > 1
                ? `${payload?.label || '내보내기'} (${pageNum}/${totalPages}페이지)`
                : payload?.label,
            percent: blended
          })
        }
      }

      await exportElementAsPng(root, pageFilename, pageOptions)
    } finally {
      restoreTenByTenExportLayout(root, pageLayoutSaved)
    }
  }

  try {
    const useMemoHeightFit =
      isMemoExport && useSlice && total > 0 && !options.galleryTenByTen

    if (useMemoHeightFit) {
      let start = 0
      let page = 0
      const estimatedPages = Math.max(1, Math.ceil(total / exportPageSize))

      while (start < total) {
        page += 1
        const initialEnd = Math.min(start + exportPageSize, total)
        const end = await fitMemoExportSliceEnd(start, initialEnd, onExportSlice, () =>
          resolveCardGridExportRoot(element, options)
        )
        await exportMemoOrGridPage(
          page,
          start,
          end,
          Math.max(page, estimatedPages),
          page === 1,
          end >= total
        )
        start = end
      }
    } else {
      const pages = Math.max(1, Math.ceil(total / exportPageSize) || 1)

      for (let page = 0; page < pages; page++) {
        const start = page * exportPageSize
        const end = Math.min(start + exportPageSize, total || exportPageSize)
        await exportMemoOrGridPage(page + 1, start, end, pages, page === 0, page === pages - 1)
      }
    }
  } finally {
    root = resolveCardGridExportRoot(element, options)
    root.style.gridTemplateColumns = saved.gridTemplateColumns
    root.style.gridTemplateRows = saved.gridTemplateRows
    root.style.gridAutoRows = saved.gridAutoRows
    root.style.gridAutoFlow = saved.gridAutoFlow
    root.style.width = saved.width
    root.style.minWidth = saved.minWidth
    root.style.height = saved.height
    root.style.minHeight = saved.minHeight
    root.style.gap = saved.gap
    legacyCards?.forEach((card, i) => {
      card.style.display = savedCardDisplays[i]
    })
    if (useSlice) {
      await onExportSlice(null)
    }
  }
  })
}

export async function exportRecordSplitAsPng(element, tabTitle, options = {}) {
  return withExportBackground(async () => {
    const { onExportSlice, totalRecordCount, records = [] } = options
    if (typeof onExportSlice !== 'function') {
      throw new Error('기록 분할 내보내기 설정이 올바르지 않습니다.')
    }

    const total = totalRecordCount ?? records.length ?? 0
    const buildPageFilename = (pageNum) =>
      typeof options.buildPageFilename === 'function'
        ? options.buildPageFilename(tabTitle, pageNum)
        : recordExportPageFilename(tabTitle, pageNum)

    const resolveRoot = () => {
      if (typeof options.resolveExportRoot === 'function') {
        return options.resolveExportRoot('[data-record-export-root]') || element
      }
      return element
    }

    const emptyExportOptions = {
      ...options,
      recordSplitExport: true,
      splitPageCapture: false,
      preloadImages: false,
      splitExportPages: false,
      exportPage: 1,
      exportTotalPages: 1,
      exportTargetWidth: RECORD_EXPORT_WIDTH,
      brandedMinWidth: RECORD_EXPORT_WIDTH,
      strictBrandedFixedWidth: true,
      skipBrandedHeader: false,
      skipBrandedHeaderText: false
    }

    if (!total) {
      const root = resolveRoot()
      root.dataset.recordSplitExport = '1'
      const layoutSaved = { recordSplitLayout: null, hiddenCols: [], recordExportStyledEls: [] }
      try {
        prepareRecordExportLayout(root, layoutSaved)
        await waitForExportFrame()
        prepareRecordSplitPageLayout(root, layoutSaved)
        await scrollExportRootIntoView(root)
        await waitForExportFrame()
        await exportElementAsPng(root, buildPageFilename(1), emptyExportOptions)
      } finally {
        restoreRecordSplitPageLayout(layoutSaved)
        restoreRecordExportLayout(layoutSaved)
        delete root.dataset.recordSplitExport
      }
      return
    }

    // 100개 이하: 1장 / 초과: 100개 단위 분할 (팜플렛 헤더·양식 각 장 동일 유지)
    const chunkSize = RECORD_EXPORT_CHUNK_SIZE
    const estimatedPages = Math.max(1, Math.ceil(total / chunkSize))

    try {
      let start = 0
      let page = 0

      while (start < total) {
        page += 1
        const end = Math.min(start + chunkSize, total)
        const isLastPage = end >= total
        const expectedRows = end - start

        await onExportSlice({ start, end })
        await waitForExportTick(400)
        await yieldToMain()

        const root = resolveRoot()
        if (!root) throw new Error('내보낼 화면을 찾을 수 없습니다')

        root.dataset.recordSplitExport = '1'
        const layoutSaved = { recordSplitLayout: null, hiddenCols: [], recordExportStyledEls: [] }

        try {
          await waitForRecordRowCount(root, expectedRows, 6000)
          prepareRecordExportLayout(root, layoutSaved)
          await waitForExportFrame()
          prepareRecordSplitPageLayout(root, layoutSaved)
          await scrollExportRootIntoView(root)
          await waitForExportFrame()
          await yieldToMain()

          const pageFilename = buildPageFilename(page)
          const pageBase = estimatedPages > 0 ? ((page - 1) / estimatedPages) * 100 : 0
          const pageOptions = {
            ...options,
            recordSplitExport: true,
            splitPageCapture: false,
            preloadImages: false,
            splitExportPages: estimatedPages > 1,
            exportPage: page,
            exportTotalPages: estimatedPages,
            exportTargetWidth: RECORD_EXPORT_WIDTH,
            brandedMinWidth: RECORD_EXPORT_WIDTH,
            strictBrandedFixedWidth: true,
            skipBrandedHeader: false,
            skipBrandedHeaderText: false,
            showDate: options.showDate !== false,
            titleLabel: options.titleLabel ?? '',
            openFolder: isLastPage,
            onProgress: async (payload) => {
              const local = payload?.percent
              const blended =
                local != null
                  ? Math.min(99, Math.round(pageBase + local / Math.max(1, estimatedPages)))
                  : null
              await notifyProgress(options.onProgress, {
                ...payload,
                label:
                  estimatedPages > 1
                    ? `${payload?.label || '내보내기'} (${page}/${estimatedPages}페이지)`
                    : payload?.label,
                percent: blended
              })
            }
          }

          await exportElementAsPng(root, pageFilename, pageOptions)
        } finally {
          // 레이아웃·스크롤 즉시 원상복구
          restoreRecordSplitPageLayout(layoutSaved)
          restoreRecordExportLayout(layoutSaved)
          delete root.dataset.recordSplitExport
        }

        start = end

        // 연속 분할 시 UI 먹통 방지
        if (!isLastPage) {
          await yieldToMain()
          await new Promise((resolve) => setTimeout(resolve, 48))
        }
      }
    } finally {
      await onExportSlice(null)
    }
  })
}

export async function exportElementAsPng(element, filename, third) {
  return withExportBackground(async () => {
  const options = normalizeExportOptions(third)
  const onProgress = options.onProgress

  await notifyProgress(onProgress, { label: '화면 준비 중…', percent: null })
  await notifyProgress(onProgress, { label: '화면 캡처 중…', percent: 20 })
  const result = await captureElement(element, options.targetMonth, options)
  await notifyProgress(onProgress, { label: '이미지 생성 중…', percent: 70 })
  let canvas = await resultToCanvas(result)

  if (options.recordSplitExport === true && options.exportTargetWidth) {
    canvas = scaleCanvasToWidth(canvas, options.exportTargetWidth)
  }

  if (result.calendarExportMeta?.coverLayouts?.length) {
    await notifyProgress(onProgress, { label: '표지/커버 합성 중…', percent: 74 })
    canvas = await compositeCalendarDayCovers(
      canvas,
      result.calendarExportMeta.coverLayouts,
      result.calendarExportMeta
    )
  }

  const petitStickers = filterPetitStickersForMonth(
    options.calendarPetitStickers,
    options.monthKey
  )
  if (petitStickers.length && result.calendarExportMeta) {
    await notifyProgress(onProgress, { label: '쁘띠스티커 합성 중…', percent: 78 })
    canvas = await compositeCalendarPetitStickers(
      canvas,
      petitStickers,
      result.calendarExportMeta
    )
  }

  if (options.overlayStickers?.length) {
    await notifyProgress(onProgress, { label: '스티커 합성 중…', percent: 82 })
    canvas = await compositeOverlayStickers(canvas, element, options.overlayStickers)
  }
  if (options.branded !== false) {
    await notifyProgress(onProgress, { label: '프레임 합성 중…', percent: 88 })
    canvas = await composeBrandedExportCanvas(canvas, {
      titleLabel: options.titleLabel ?? '',
      showDate: options.showDate !== false,
      exportPage: options.exportPage,
      exportTotalPages: options.exportTotalPages,
      splitExportPages: options.splitExportPages === true,
      skipHeader: options.skipBrandedHeader === true,
      skipHeaderText: options.skipBrandedHeaderText === true,
      fixedWidth: options.exportTargetWidth,
      strictFixedWidth: options.strictBrandedFixedWidth === true,
      presets: options.presets,
      activePresetSlot: options.activePresetSlot,
      fontFamily: options.fontFamily,
      showBackgroundImage: options.showBackgroundImage,
      backgroundImage: options.backgroundImage,
      backgroundImageOpacity: options.backgroundImageOpacity,
      backgroundImageMode: options.backgroundImageMode,
      minWidth: options.brandedMinWidth
    })
  }
  if (options.exportTargetWidth) {
    canvas = scaleCanvasToWidth(canvas, options.exportTargetWidth)
  }
  if (options.recordSplitExport === true && options.exportTargetHeight) {
    canvas = padCanvasToFixedSize(
      canvas,
      options.exportTargetWidth || canvas.width,
      options.exportTargetHeight
    )
  }
  assertCanvasDimensions(canvas.width, canvas.height)
  await notifyProgress(onProgress, { label: '저장 중…', percent: 95 })
  await downloadDataUrl(canvas.toDataURL('image/png'), filename, {
    openFolder: options.openFolder !== false
  })
  await notifyProgress(onProgress, { label: '완료', percent: 100 })
  })
}

export async function exportElementAsPdf(element, filename, third) {
  return withExportBackground(async () => {
  const options = normalizeExportOptions(third)
  const { jsPDF } = await import('jspdf')
  const result = await captureElement(element, options.targetMonth, options)
  let canvas = await resultToCanvas(result)
  if (options.overlayStickers?.length) {
    canvas = await compositeOverlayStickers(canvas, element, options.overlayStickers)
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pageWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width
  const imgData = canvas.toDataURL('image/png')

  let heightLeft = imgHeight
  let position = 0
  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST')
  heightLeft -= pageHeight
  while (heightLeft > 0) {
    position -= pageHeight
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST')
    heightLeft -= pageHeight
  }
  pdf.save(filename)
  })
}

export async function exportCalendarMonth(element, year, month, options = {}) {
  const targetMonth = new Date(year, month - 1, 1)
  await exportElementAsPng(element, calendarMonthFilename(year, month), {
    targetMonth,
    exportTargetWidth: CALENDAR_MONTH_EXPORT_WIDTH,
    ...options
  })
}

export async function exportCalendarYearGrid({
  year,
  scrollToMonth,
  getElement,
  onProgress,
  overlayStickers = [],
  calendarPetitStickers = [],
  titleLabel = '',
  showDate = true,
  showBackgroundImage = true,
  presets,
  activePresetSlot,
  backgroundImage,
  backgroundImageOpacity,
  backgroundImageMode,
  fontFamily
}) {
  return withExportBackground(async () => {
  const canvases = []
  const captureOptions = { showBackgroundImage, calendarExport: true }
  const exportRoot = getElement()
  const calendarFill = readCalendarExportFill(exportRoot)

  for (let m = 0; m < 12; m++) {
    const targetMonth = new Date(year, m, 1)
    await scrollToMonth?.(targetMonth)
    await waitForExportTick(320)
    await waitForExportFrame()
    const el = getElement()
    if (!el) continue
    await scrollExportRootIntoView(el)
    const monthKey = `${year}-${String(m + 1).padStart(2, '0')}`
    const result = await captureElement(el, targetMonth, captureOptions)
    let canvas = await resultToCanvas(result)
    if (result.calendarExportMeta?.coverLayouts?.length) {
      canvas = await compositeCalendarDayCovers(
        canvas,
        result.calendarExportMeta.coverLayouts,
        result.calendarExportMeta
      )
    }
    const petitStickers = filterPetitStickersForMonth(calendarPetitStickers, monthKey)
    if (petitStickers.length && result.calendarExportMeta) {
      canvas = await compositeCalendarPetitStickers(
        canvas,
        petitStickers,
        result.calendarExportMeta
      )
    }
    if (overlayStickers.length) {
      canvas = await compositeOverlayStickers(canvas, el, overlayStickers)
    }
    canvases.push({ mode: 'canvas', canvas })
    onProgress?.(m + 1, 12)
  }

  if (!canvases.length) throw new Error('캡처할 달력이 없습니다')

  const themeBg = readThemeBgColor()
  const gap = 20
  const cols = 3
  const innerW = CALENDAR_YEAR_EXPORT_WIDTH - EXPORT_FRAME_PAD * 2
  const cellW = Math.floor((innerW - (cols - 1) * gap) / cols)

  const sizes = canvases.map((item) => ({
    w: item.canvas.width,
    h: item.canvas.height
  }))
  const cellH = Math.max(...sizes.map((s) => Math.round((s.h * cellW) / Math.max(1, s.w))))
  const outW = cols * cellW + (cols - 1) * gap
  const outH = 4 * cellH + 3 * gap

  const normalized = canvases.map((item) => {
    const scaled = document.createElement('canvas')
    scaled.width = cellW
    scaled.height = cellH
    const sctx = scaled.getContext('2d')
    sctx.fillStyle = calendarFill
    sctx.fillRect(0, 0, cellW, cellH)
    const scale = Math.min(cellW / item.canvas.width, cellH / item.canvas.height)
    const dw = Math.round(item.canvas.width * scale)
    const dh = Math.round(item.canvas.height * scale)
    sctx.drawImage(item.canvas, Math.floor((cellW - dw) / 2), 0, dw, dh)
    return scaled
  })

  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const ctx = out.getContext('2d')
  ctx.fillStyle = themeBg
  ctx.fillRect(0, 0, outW, outH)

  for (let i = 0; i < normalized.length; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = col * (cellW + gap)
    const y = row * (cellH + gap)
    ctx.drawImage(normalized[i], x, y)
  }

  const padded = await composeBrandedExportCanvas(out, {
    titleLabel,
    showDate,
    presets,
    activePresetSlot,
    fontFamily,
    showBackgroundImage,
    backgroundImage,
    backgroundImageOpacity,
    backgroundImageMode,
    minWidth: CALENDAR_YEAR_EXPORT_WIDTH,
    bgColor: themeBg
  })
  const finalCanvas = scaleCanvasToWidth(padded, CALENDAR_YEAR_EXPORT_WIDTH)
  await downloadDataUrl(finalCanvas.toDataURL('image/png'), calendarYearFilename(year), {
    openFolder: true
  })
  })
}
