export function getStickerHitsAtPoint(clientX, clientY) {
  const nodes = document.querySelectorAll('[data-sticker-root]')
  const hits = []
  nodes.forEach((node) => {
    const rect = node.getBoundingClientRect()
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      hits.push({
        id: node.getAttribute('data-sticker-id'),
        zIndex: Number(node.style.zIndex) || 0
      })
    }
  })
  return hits.sort((a, b) => b.zIndex - a.zIndex)
}

export function fitMenuPosition(x, y, width, height, padding = 8) {
  const maxX = window.innerWidth - width - padding
  const maxY = window.innerHeight - height - padding
  return {
    x: Math.min(Math.max(padding, x), Math.max(padding, maxX)),
    y: Math.min(Math.max(padding, y), Math.max(padding, maxY))
  }
}

export function readPngFile(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/png$/i.test(file.type)) {
      reject(new Error('PNG만 첨부할 수 있습니다'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function stickerVisualHeight(sticker, stickerW) {
  const w = stickerW || sticker.width || 80
  if (sticker.heightRatio != null && sticker.heightRatio > 0) return w * sticker.heightRatio
  return w * 0.75
}

function clampRatio(value) {
  return Math.max(0, Math.min(1, value))
}

export function clampStickerToWindow(x, y, stickerW, containerW, containerH, sticker = null) {
  const w = stickerW || sticker?.width || 80
  const h = stickerVisualHeight(sticker || { width: w }, w)
  return {
    x: Math.min(Math.max(0, x), Math.max(0, containerW - w)),
    y: Math.min(Math.max(0, y), Math.max(0, containerH - h))
  }
}

export function isStickerInViewport(x, y, stickerW, containerW, containerH, sticker = null) {
  const w = stickerW || sticker?.width || 80
  const h = stickerVisualHeight(sticker || { width: w }, w)
  return x + w > 0 && y + h > 0 && x < containerW && y < containerH
}

/** 스티커 표시 좌표 — 잠금: 고정 픽셀 / 해제: 창 내부 클램프 */
export function resolveStickerDisplayPosition(sticker, containerW, containerH, stickerW) {
  const w = stickerW || sticker.width || 80

  if (sticker.locked) {
    const x = sticker.fixedX ?? sticker.x ?? 0
    const y = sticker.fixedY ?? sticker.y ?? 0
    return {
      x,
      y,
      visible: isStickerInViewport(x, y, w, containerW, containerH, sticker)
    }
  }

  const pos = resolveAnchoredPosition(sticker, containerW, containerH, w)
  return { ...pos, visible: true }
}

/** 앵커 기준 비율 → 픽셀 좌표 (스티커 크기 유지) */
export function resolveAnchoredPosition(sticker, containerW, containerH, stickerW) {
  const w = stickerW || sticker.width || 80
  const h = stickerVisualHeight(sticker, w)

  if (containerW <= 0 || containerH <= 0) {
    return clampStickerToWindow(sticker.x ?? 0, sticker.y ?? 0, w, containerW || w, containerH || h, sticker)
  }

  const anchor = sticker.anchor || (sticker.monthKey != null ? 'top-right' : 'bottom-right')
  let x
  let y

  if (anchor === 'bottom-right') {
    const rightR = clampRatio(sticker.offsetRightRatio ?? inferRightRatio(sticker, containerW, w))
    const bottomR = clampRatio(sticker.offsetBottomRatio ?? inferBottomRatio(sticker, containerH, h))
    x = containerW - rightR * containerW - w
    y = containerH - bottomR * containerH - h
  } else if (anchor === 'top-right') {
    const topR = clampRatio(sticker.offsetTopRatio ?? inferTopRatio(sticker, containerH))
    const rightR = clampRatio(sticker.offsetRightRatio ?? inferRightRatio(sticker, containerW, w))
    x = containerW - rightR * containerW - w
    y = topR * containerH
  } else if (sticker.xRatio != null && sticker.yRatio != null) {
    x = sticker.xRatio * containerW
    y = sticker.yRatio * containerH
  } else {
    x = sticker.x ?? 0
    y = sticker.y ?? 0
  }

  return clampStickerToWindow(x, y, w, containerW, containerH, sticker)
}

function inferRightRatio(sticker, containerW, stickerW) {
  if (sticker.offsetRightRatio != null) return sticker.offsetRightRatio
  if (sticker.x != null && containerW > 0) {
    return clampRatio((containerW - sticker.x - stickerW) / containerW)
  }
  return 0.01
}

function inferTopRatio(sticker, containerH) {
  if (sticker.offsetTopRatio != null) return sticker.offsetTopRatio
  if (sticker.yRatio != null) return sticker.yRatio
  if (sticker.y != null && containerH > 0) return sticker.y / containerH
  return 0.05
}

function inferBottomRatio(sticker, containerH, stickerH) {
  if (sticker.offsetBottomRatio != null) return sticker.offsetBottomRatio
  if (sticker.y != null && containerH > 0) {
    return clampRatio((containerH - sticker.y - stickerH) / containerH)
  }
  return 0.02
}

/** 드래그 종료 시 앵커 비율 저장 */
export function withAnchorRatios(sticker, x, y, containerW, containerH, stickerW, { petit = false } = {}) {
  const w = stickerW || sticker.width || 80
  const h = stickerVisualHeight(sticker, w)

  if (petit) {
    return {
      ...sticker,
      x,
      y,
      anchor: 'top-right',
      offsetTopRatio: Math.max(0, y / containerH),
      offsetRightRatio: Math.max(0, (containerW - x - w) / containerW)
    }
  }

  return {
    ...sticker,
    x,
    y,
    anchor: 'bottom-right',
    offsetRightRatio: Math.max(0, (containerW - x - w) / containerW),
    offsetBottomRatio: Math.max(0, (containerH - y - h) / containerH)
  }
}

export function createPetitSticker({
  src,
  x = 40,
  y = 40,
  width = 80,
  monthKey,
  boxW,
  boxH,
  heightRatio = 1
}) {
  const sticker = {
    id: createStickerId().replace(/^sticker-/, 'petit-'),
    src,
    x,
    y,
    width,
    heightRatio,
    rotation: 0,
    monthKey,
    anchor: 'top-right',
    pinned: false,
    locked: false,
    opacity: 1,
    shadowEnabled: true,
    borderColor: null,
    borderCustomColor: null,
    frameShape: null
  }
  const bw = boxW ?? 0
  const bh = boxH ?? 0
  if (bw > 0 && bh > 0) {
    const clamped = clampInBox(x, y, width, bw, bh, width, heightRatio)
    sticker.x = clamped.x
    sticker.y = clamped.y
    sticker.offsetTopRatio = clamped.y / bh
    sticker.offsetRightRatio = (bw - clamped.x - width) / bw
  }
  return sticker
}

export function clampInBox(x, y, width, boxW, boxH, stickerW = 80, heightRatio = null) {
  const w = stickerW || width || 80
  const h = heightRatio != null && heightRatio > 0 ? w * heightRatio : w
  const maxX = Math.max(0, boxW - w)
  const maxY = Math.max(0, boxH - h)
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY)
  }
}

export function createStickerId() {
  return `sticker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function createSticker({
  src,
  x,
  y,
  width = 120,
  rotation = 0,
  heightRatio,
  containerW,
  containerH
}) {
  const cw = containerW ?? (typeof window !== 'undefined' ? window.innerWidth : 800)
  const ch = containerH ?? (typeof window !== 'undefined' ? window.innerHeight : 600)
  const w = width
  const h = stickerVisualHeight({ width: w, heightRatio }, w)
  const cx = x ?? (cw - w) / 2
  const cy = y ?? (ch - h) / 2
  const clamped = clampStickerToWindow(cx, cy, w, cw, ch, { width: w, heightRatio, rotation, locked: false })
  const ratios = withAnchorRatios(
    { width: w, rotation, locked: false, heightRatio },
    clamped.x,
    clamped.y,
    cw,
    ch,
    w
  )

  return {
    id: createStickerId(),
    src,
    ...ratios,
    opacity: 1,
    shadowEnabled: true,
    borderColor: null,
    borderCustomColor: null,
    blendMode: 'normal',
    framed: false,
    frameShape: null,
    tabId: null
  }
}

export function resolveStickerPosition(sticker, containerW, containerH) {
  return resolveAnchoredPosition(sticker, containerW, containerH, sticker.width)
}

export function withStickerRatios(sticker, x, y, containerW, containerH) {
  return withAnchorRatios(sticker, x, y, containerW, containerH, sticker.width, {
    petit: Boolean(sticker.monthKey)
  })
}

export function reorderStickers(stickers, id, action) {
  const list = [...stickers]
  const idx = list.findIndex((s) => s.id === id)
  if (idx < 0) return list

  const item = list[idx]

  switch (action) {
    case 'front':
      list.splice(idx, 1)
      list.push(item)
      break
    case 'back':
      list.splice(idx, 1)
      list.unshift(item)
      break
    case 'forward':
      if (idx < list.length - 1) {
        ;[list[idx], list[idx + 1]] = [list[idx + 1], list[idx]]
      }
      break
    case 'backward':
      if (idx > 0) {
        ;[list[idx], list[idx - 1]] = [list[idx - 1], list[idx]]
      }
      break
    default:
      break
  }
  return list
}

export function loadImageSize(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = reject
    img.src = src
  })
}

export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.match(/^image\/(png|gif|jpeg|webp)$/i)) {
      reject(new Error('PNG/GIF 이미지만 첨부할 수 있습니다'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
