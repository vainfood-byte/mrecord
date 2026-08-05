/** 내보내기 공통 프레임 — My Record 헤더 + 여백 + 타이틀/날짜 */

import { resolveFontFamily } from '../data/defaults'
import { iconUrl } from './iconUrl'

export const EXPORT_FRAME_PAD = 40
export const EXPORT_HEADER_H = 96

export function formatExportDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}.${m}.${d}`
}

export function formatExportHeaderRight(titleLabel, options = {}) {
  const {
    showDate = true,
    exportPage,
    exportTotalPages,
    splitExportPages = false,
    date = new Date()
  } = options

  const parts = []
  if (titleLabel) parts.push(titleLabel)
  if (
    splitExportPages &&
    exportPage != null &&
    exportTotalPages != null &&
    exportTotalPages > 0
  ) {
    parts.push(`(${exportPage}/${exportTotalPages})`)
  }
  if (showDate) parts.push(formatExportDate(date))
  return parts.join(' - ')
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`image load failed: ${src}`))
    img.src = src
  })
}

function readThemeColors() {
  if (typeof document === 'undefined') {
    return { bg: '#faf8f3', text: '#745039', muted: '#9a8070' }
  }
  const cs = getComputedStyle(document.documentElement)
  const pick = (v, fb) => cs.getPropertyValue(v).trim() || fb
  return {
    bg: pick('--color-bg', '#faf8f3'),
    text: pick('--color-text', '#745039'),
    muted: pick('--color-text-muted', '#9a8070')
  }
}

function drawTintedImage(ctx, img, x, y, w, h, color) {
  const off = document.createElement('canvas')
  off.width = Math.max(1, Math.ceil(w))
  off.height = Math.max(1, Math.ceil(h))
  const octx = off.getContext('2d')
  octx.drawImage(img, 0, 0, w, h)
  octx.globalCompositeOperation = 'source-in'
  octx.fillStyle = color
  octx.fillRect(0, 0, w, h)
  ctx.drawImage(off, x, y, w, h)
}

function readAppFontFamily(options = {}) {
  if (options.fontFamily) return options.fontFamily
  if (typeof document !== 'undefined') {
    const fromCss = getComputedStyle(document.documentElement).getPropertyValue('--font-family').trim()
    if (fromCss) return fromCss
  }
  return resolveFontFamily(options.settings)
}

async function drawExportBackground(ctx, w, h, options, colors) {
  ctx.fillStyle = options.bgColor || colors.bg
  ctx.fillRect(0, 0, w, h)

  if (options.showBackgroundImage === false || !options.backgroundImage) return

  const opacity = options.backgroundImageOpacity ?? 0.3
  const mode = options.backgroundImageMode || 'fill'

  try {
    const img = await loadImage(options.backgroundImage)
    ctx.save()
    ctx.globalAlpha = opacity

    if (mode === 'tile') {
      const pattern = ctx.createPattern(img, 'repeat')
      if (pattern) {
        ctx.fillStyle = pattern
        ctx.fillRect(0, 0, w, h)
      }
    } else if (mode === 'fill') {
      const scale = Math.max(w / img.width, h / img.height)
      const dw = img.width * scale
      const dh = img.height * scale
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
    } else {
      ctx.drawImage(img, (w - img.width) / 2, (h - img.height) / 2)
    }

    ctx.restore()
  } catch {
    /* solid fill only */
  }
}

async function drawExportHeader(ctx, width, options) {
  const {
    pad = EXPORT_FRAME_PAD,
    titleLabel = '',
    showDate = true,
    exportPage,
    exportTotalPages,
    splitExportPages = false,
    textColor,
    mutedColor,
    presets = [],
    activePresetSlot = 0
  } = options

  const rightText = formatExportHeaderRight(titleLabel, {
    showDate,
    exportPage,
    exportTotalPages,
    splitExportPages
  })
  const logoSize = 48
  const acornSize = 22
  let logoImg = null
  let acornImg = null

  try {
    logoImg = await loadImage(iconUrl('marico-logo.png'))
  } catch {
    logoImg = null
  }
  try {
    acornImg = await loadImage(iconUrl('preset-icon.png'))
  } catch {
    acornImg = null
  }

  const baseY = Math.floor(EXPORT_HEADER_H / 2)
  let x = pad

  if (logoImg) {
    drawTintedImage(ctx, logoImg, x, baseY - logoSize / 2, logoSize, logoSize, textColor)
    x += logoSize + 12
  }

  ctx.textBaseline = 'middle'
  ctx.fillStyle = textColor
  ctx.font = '600 22px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
  ctx.fillText('My Record', x, baseY - 10)
  ctx.fillStyle = mutedColor
  ctx.font = '13px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
  ctx.fillText('마이리코드', x, baseY + 12)

  if (acornImg) {
    let ax = x + 132
    for (let slot = 0; slot < 4; slot++) {
      const preset = presets[slot]
      const filled = Boolean(preset?.data)
      const isActive = activePresetSlot === slot
      const alpha = filled || slot === 0 ? (isActive ? 1 : 0.45) : 0.25
      const tint = isActive ? textColor : mutedColor
      ctx.save()
      ctx.globalAlpha = alpha
      drawTintedImage(ctx, acornImg, ax, baseY - acornSize / 2, acornSize, acornSize, tint)
      ctx.restore()
      ax += acornSize + 6
    }
  }

  if (rightText) {
    const appFont = readAppFontFamily(options)
    ctx.fillStyle = textColor
    ctx.font = `500 20px ${appFont}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(rightText, width - pad, baseY)
    ctx.textAlign = 'left'
  }
}

export async function composeBrandedExportCanvas(contentCanvas, options = {}) {
  const colors = readThemeColors()
  const pad = options.pad ?? EXPORT_FRAME_PAD
  const headerH = EXPORT_HEADER_H
  const minW = options.minWidth ?? 720
  const contentW = contentCanvas.width
  const contentH = contentCanvas.height

  if (options.skipHeader) {
    const fixedW = options.fixedWidth ?? minW ?? contentW
    const outW =
      options.strictFixedWidth === true ? fixedW : Math.max(fixedW, contentW)
    const outH = contentH

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')

    await drawExportBackground(ctx, outW, outH, options, colors)
    const contentX = Math.floor((outW - contentW) / 2)
    ctx.drawImage(contentCanvas, contentX, 0)

    return canvas
  }

  const innerW = Math.max(contentW, minW - pad * 2)
  const outW = innerW + pad * 2
  const outH = headerH + contentH + pad * 2

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')

  await drawExportBackground(ctx, outW, outH, options, colors)

  if (!options.skipHeaderText) {
    await drawExportHeader(ctx, outW, {
      pad,
      titleLabel: options.titleLabel ?? '',
      showDate: options.showDate !== false,
      exportPage: options.exportPage,
      exportTotalPages: options.exportTotalPages,
      splitExportPages: options.splitExportPages === true,
      textColor: options.textColor || colors.text,
      mutedColor: options.mutedColor || colors.muted,
      presets: options.presets,
      activePresetSlot: options.activePresetSlot,
      fontFamily: options.fontFamily,
      settings: options.settings
    })
  }

  const contentX = pad + Math.floor((innerW - contentW) / 2)
  const contentY = headerH + pad
  ctx.drawImage(contentCanvas, contentX, contentY)

  return canvas
}
