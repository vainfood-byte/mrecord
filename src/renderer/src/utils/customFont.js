/** 사용자 업로드 글꼴 — @font-face 동적 등록 */

export const CUSTOM_FONT_FACE_NAME = 'Mrecord User Font'
const STYLE_ID = 'mrecord-custom-font-face'
const MAX_FONT_BYTES = 8 * 1024 * 1024

function fontFormatFromExt(ext) {
  switch (ext) {
    case 'woff2':
      return 'woff2'
    case 'woff':
      return 'woff'
    case 'otf':
      return 'opentype'
    default:
      return 'truetype'
  }
}

export function getCustomFontStack() {
  return `'${CUSTOM_FONT_FACE_NAME}', 'Malgun Gothic', sans-serif`
}

export function injectCustomFont(dataUrl, ext = 'ttf') {
  if (!dataUrl || typeof document === 'undefined') return

  let style = document.getElementById(STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }

  const format = fontFormatFromExt(ext)
  style.textContent = `
@font-face {
  font-family: '${CUSTOM_FONT_FACE_NAME}';
  src: url("${dataUrl}") format('${format}');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}`
}

export function removeCustomFont() {
  document.getElementById(STYLE_ID)?.remove()
}

export function readFontFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('글꼴 파일이 없습니다.'))
      return
    }

    const ext = file.name.match(/\.(ttf|otf|woff2?)$/i)?.[1]?.toLowerCase()
    if (!ext) {
      reject(new Error('TTF, OTF, WOFF, WOFF2 파일만 추가할 수 있습니다.'))
      return
    }

    if (file.size > MAX_FONT_BYTES) {
      reject(new Error('8MB 이하의 글꼴 파일만 추가할 수 있습니다.'))
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('글꼴 파일을 읽을 수 없습니다.'))
        return
      }

      const name = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').trim() || '사용자 글꼴'
      resolve({
        name,
        dataUrl: reader.result,
        ext
      })
    }
    reader.onerror = () => reject(reader.error || new Error('글꼴 파일을 읽을 수 없습니다.'))
    reader.readAsDataURL(file)
  })
}
