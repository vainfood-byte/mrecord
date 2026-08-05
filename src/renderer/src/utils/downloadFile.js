/** 파일 다운로드 — Electron IPC (MyR 마이리코드 폴더) 또는 브라우저 fallback */

function dataUrlToBase64(dataUrl) {
  const i = dataUrl.indexOf(',')
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl
}

export async function downloadDataUrl(dataUrl, filename, options = {}) {
  const base64 = dataUrlToBase64(dataUrl)

  if (window.mrecord?.saveDownload) {
    const result = await window.mrecord.saveDownload(filename, base64, options)
    if (result?.ok) {
      return result
    }
    throw new Error(result?.error || '파일 저장 실패')
  }

  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** PNG base64(raw) 저장 */
export async function downloadPngBase64(base64, filename, options = {}) {
  if (window.mrecord?.saveDownload) {
    const result = await window.mrecord.saveDownload(filename, base64, options)
    if (result?.ok) return result
    throw new Error(result?.error || '파일 저장 실패')
  }

  await downloadDataUrl(`data:image/png;base64,${base64}`, filename, options)
}

export function calendarMonthFilename(year, month) {
  const m = String(month).padStart(2, '0')
  return `${year}${m}MyR.png`
}

export function calendarYearFilename(year) {
  return `${year}allMyR.png`
}

export function reviewExportBasename(title, date = new Date()) {
  const safe = (title || 'review').replace(/[\\/:*?"<>|]/g, '').trim() || 'review'
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${safe}${yy}${mm}${dd}MyR`
}
