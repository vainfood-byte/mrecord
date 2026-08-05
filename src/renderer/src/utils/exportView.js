import { exportElementAsPdf, exportElementAsPng } from './exportCalendar'

export function viewExportBasename(kind) {
  const d = new Date()
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `MyR_${kind}_${yy}${mm}${dd}`
}

export async function exportViewAsPng(rootEl, filename) {
  if (!rootEl) throw new Error('내보낼 영역이 없습니다')
  await exportElementAsPng(rootEl, filename)
}

export async function exportViewAsPdf(rootEl, filename) {
  if (!rootEl) throw new Error('내보낼 영역이 없습니다')
  await exportElementAsPdf(rootEl, filename)
}

function csvEscape(val) {
  const s = String(val ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function exportRecordsAsExcel(records, tagsMap, filename) {
  const headers = ['제목', '저자', '별점', '상태', '사이트', '장르', '한마디', '처음 읽은 날', '링크']
  const rows = records.map((rec) => {
    const tags = (rec.tagIds || []).map((id) => tagsMap[id]).filter(Boolean)
    const byCat = (cat) => tags.filter((t) => t.category === cat).map((t) => t.name).join(', ')
    return [
      rec.title,
      rec.author,
      rec.rating || 0,
      byCat('상태'),
      byCat('사이트'),
      byCat('장르'),
      rec.oneLine,
      rec.readDate,
      rec.link
    ]
  })

  const bom = '\uFEFF'
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n')
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })

  if (window.mrecord?.saveDownload) {
    const reader = new FileReader()
    const base64 = await new Promise((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result
        const i = String(result).indexOf(',')
        resolve(i >= 0 ? String(result).slice(i + 1) : '')
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    const result = await window.mrecord.saveDownload(filename, base64)
    if (!result?.ok) throw new Error(result?.error || '파일 저장 실패')
    return result.filePath
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
