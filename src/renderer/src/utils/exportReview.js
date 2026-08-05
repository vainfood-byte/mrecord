/** 감상 박스 PNG / PDF 내보내기 */
export async function exportReviewAsPng(element, filename = 'review.png') {
  if (!element) return

  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(element, {
    backgroundColor: '#FFF9E5',
    scale: 2,
    useCORS: true
  })
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}

export async function exportReviewAsPdf(element, filename = 'review.pdf') {
  if (!element) return

  const { default: html2canvas } = await import('html2canvas')
  const { jsPDF } = await import('jspdf')

  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true
  })
  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 10
  const imgW = pageW - margin * 2
  const imgH = (canvas.height * imgW) / canvas.width

  let y = margin
  let remaining = imgH
  let srcY = 0
  const sliceH = pageH - margin * 2

  while (remaining > 0) {
    const h = Math.min(remaining, sliceH)
    const sliceCanvas = document.createElement('canvas')
    sliceCanvas.width = canvas.width
    sliceCanvas.height = (h / imgW) * canvas.width
    const ctx = sliceCanvas.getContext('2d')
    ctx.drawImage(
      canvas,
      0,
      srcY * (canvas.width / imgW),
      canvas.width,
      sliceCanvas.height,
      0,
      0,
      sliceCanvas.width,
      sliceCanvas.height
    )
    pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, y, imgW, h)
    remaining -= h
    srcY += h
    if (remaining > 0) pdf.addPage()
  }

  pdf.save(filename)
}
