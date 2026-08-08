/** 감상박스 본문 첨부 이미지 — 가로 최대 1200px, WebP(또는 JPEG 0.85) 압축 */

const MAX_WIDTH = 1200
const QUALITY = 0.85

function loadHtmlImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

function canvasToCompressedDataUrl(canvas) {
  try {
    const webp = canvas.toDataURL('image/webp', QUALITY)
    if (typeof webp === 'string' && webp.startsWith('data:image/webp')) return webp
  } catch {
    /* WebP 미지원 */
  }
  /* JPEG는 알파 없음 — 흰 배경 위에 합성 */
  const flat = document.createElement('canvas')
  flat.width = canvas.width
  flat.height = canvas.height
  const fctx = flat.getContext('2d')
  fctx.fillStyle = '#ffffff'
  fctx.fillRect(0, 0, flat.width, flat.height)
  fctx.drawImage(canvas, 0, 0)
  return flat.toDataURL('image/jpeg', QUALITY)
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('invalid image'))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Data URL을 가로 최대 1200px로 리사이즈 후 WebP/JPEG로 압축합니다.
 * 실패 시 원본을 반환해 엑박을 막습니다.
 */
export async function compressReviewImageDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return dataUrl
  try {
    const img = await loadHtmlImage(dataUrl)
    const natW = img.naturalWidth || img.width
    const natH = img.naturalHeight || img.height
    if (!natW || !natH) return dataUrl
    const scale = natW > MAX_WIDTH ? MAX_WIDTH / natW : 1
    const w = Math.max(1, Math.round(natW * scale))
    const h = Math.max(1, Math.round(natH * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, w, h)
    return canvasToCompressedDataUrl(canvas)
  } catch {
    return dataUrl
  }
}

/** File → 압축 Data URL */
export async function compressReviewImageFile(file) {
  const dataUrl = await readFileAsDataURL(file)
  return compressReviewImageDataUrl(dataUrl)
}
