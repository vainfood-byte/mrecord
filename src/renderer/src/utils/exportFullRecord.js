import { formatDateByMode } from './dateFieldFormat'
import { contrastText } from './colorUtils'
import { composeBrandedExportCanvas } from './exportBrandedFrame'
import { downloadDataUrl, reviewExportBasename } from './downloadFile'
import { getRecordRatingIcon } from './ratingHelpers'

export async function exportFullRecord({
  record,
  fields,
  tagsMap,
  reviewSections,
  seriesExport = false,
  theme,
  presets = [],
  activePresetSlot = 0,
  fontFamily,
  backgroundImage,
  backgroundImageOpacity,
  backgroundImageMode,
  showBackgroundImage = true
}) {
  const colors = theme || getThemeColorsFallback()
  const container = buildExportDOM(record, fields, tagsMap, reviewSections, colors)
  document.body.appendChild(container)

  const filename = `${reviewExportBasename(record.title)}.png`

  try {
    await exportAsPng(container, filename, colors.bg, {
      presets,
      activePresetSlot,
      fontFamily,
      showBackgroundImage,
      backgroundImage,
      backgroundImageOpacity,
      backgroundImageMode
    })
  } finally {
    document.body.removeChild(container)
  }
}

function getThemeColorsFallback() {
  if (typeof document === 'undefined') {
    return { bg: '#FFF9E5', bgCard: '#FFFFFF', text: '#3D3830', textMuted: '#7A7268', border: '#D4CBB8' }
  }
  const style = getComputedStyle(document.documentElement)
  const get = (v, fb) => style.getPropertyValue(v).trim() || fb
  return {
    bg: get('--color-bg-panel', '#FFF9E5'),
    bgCard: get('--color-bg-card', '#FFFFFF'),
    text: get('--color-text', '#3D3830'),
    textMuted: get('--color-text-muted', '#7A7268'),
    border: get('--color-border', '#D4CBB8')
  }
}

function getExportUiStyleAttr() {
  if (typeof document === 'undefined') return 'default'
  const raw = document.documentElement.getAttribute('data-ui-style')
  return raw === 'glass' || raw === 'retro' ? raw : 'default'
}

function buildExportDOM(record, fields, tagsMap, reviewSections, colors) {
  const el = document.createElement('div')
  const themeStyle = getExportUiStyleAttr()
  el.setAttribute('data-ui-style', themeStyle || 'default')
  /* 오프스크린 배치만 인라인 — 높이/라운드는 CSS·data-ui-style에 위임 */
  el.style.cssText = `position:fixed;left:-9999px;top:0;width:600px;padding:24px;background:var(--color-bg-panel, ${colors.bg});color:var(--color-text, ${colors.text});font-family:inherit;`

  const top = document.createElement('div')
  top.style.cssText = 'display:flex;gap:16px;margin-bottom:16px;align-items:stretch;'

  const cover = document.createElement('div')
  cover.style.cssText = 'width:180px;flex-shrink:0;margin-top:0;padding-top:0;'
  if (record.coverUrl) {
    const img = document.createElement('img')
    img.src = record.coverUrl
    img.style.cssText =
      'max-width:180px;width:auto;height:auto;object-fit:contain;display:block;margin-top:0;padding-top:0;'
    cover.appendChild(img)
  } else {
    const bg = record.coverColor || '#C4A882'
    const fg = contrastText(bg)
    const shadow = fg === '#FFFFFF' ? '0 1px 4px rgba(0,0,0,0.5)' : 'none'
    cover.style.cssText += `width:180px;aspect-ratio:3/4;background:${bg};display:flex;align-items:center;justify-content:center;color:${fg};font-size:14px;font-weight:600;padding:8px;padding-top:0;margin-top:0;text-align:center;flex-shrink:0;text-shadow:${shadow};`
    cover.textContent = record.title
  }

  const props = buildPropsPanel(record, fields, tagsMap, colors)

  top.appendChild(cover)
  top.appendChild(props)
  el.appendChild(top)

  reviewSections.forEach((sec) => {
    const disabled = Boolean(sec.disabled)
    const grayText = '#9CA3AF'
    const grayMuted = '#B8BFC7'
    const grayBorder = '#D1D5DB'
    const grayBg = '#F3F4F6'

    const box = document.createElement('div')
    box.style.cssText = disabled
      ? `border:1px solid ${grayBorder};padding:16px;background:${grayBg};margin-bottom:12px;`
      : `border:1px solid var(--border-color, ${colors.border});padding:16px;background:var(--color-bg-card, ${colors.bgCard});margin-bottom:12px;`

    const title = document.createElement('div')
    title.style.cssText = disabled
      ? `font-weight:bold;font-size:16px;margin-top:0;margin-bottom:4px;padding-top:0;color:${grayText};`
      : `font-weight:bold;font-size:16px;margin-top:0;margin-bottom:4px;padding-top:0;color:var(--color-text, ${colors.text});`
    title.textContent = sec.label
    box.appendChild(title)

    if (disabled) {
      const sub = document.createElement('div')
      sub.style.cssText = `font-size:13px;color:${grayMuted};margin-bottom:8px;`
      sub.textContent = sec.subtitle || '\u00A0'
      box.appendChild(sub)
      const body = document.createElement('div')
      body.style.cssText = `font-size:14px;line-height:1.6;color:${grayMuted};word-break:break-word;min-height:20px;`
      el.appendChild(box)
      return
    }

    if (sec.subtitle) {
      const sub = document.createElement('div')
      sub.style.cssText = `font-size:13px;color:var(--color-text-muted, ${colors.textMuted});margin-bottom:8px;`
      sub.textContent = sec.subtitle
      box.appendChild(sub)
    }
    const body = document.createElement('div')
    body.style.cssText = `font-size:14px;line-height:1.6;color:var(--color-text, ${colors.text});word-break:break-word;`
    body.innerHTML = sec.content || ''
    body.querySelectorAll('img').forEach((img) => {
      img.style.maxWidth = '100%'
      img.style.height = 'auto'
      img.style.display = 'block'
      img.style.margin = '8px 0'
      img.style.marginTop = '0'
      img.style.paddingTop = '0'
    })
    box.appendChild(body)
    el.appendChild(box)
  })

  return el
}

function buildPropsPanel(record, fields, tagsMap, colors) {
  const exportFields = fields.filter((f) => f.visible !== false && f.exportVisible !== false)
  const authorField = exportFields.find((f) => f.id === 'author')
  const authorText = authorField ? getFieldText(record, authorField, tagsMap) : ''

  const props = document.createElement('div')
  props.style.cssText = `flex:1;border:1px solid var(--border-color, ${colors.border});padding:14px 16px;padding-top:0;margin-top:0;background:var(--color-bg-card, ${colors.bgCard});display:flex;flex-direction:column;overflow:visible;`

  const header = document.createElement('div')
  header.style.cssText =
    'display:flex;align-items:flex-start;gap:10px;margin-top:0;margin-bottom:10px;padding-top:0;padding-left:2px;'

  const titleEl = document.createElement('div')
  titleEl.style.cssText = `flex:1;font-weight:700;font-size:17px;line-height:1.35;color:var(--color-text, ${colors.text});overflow:visible;word-break:keep-all;margin-top:0;padding-top:0;`
  titleEl.textContent = record.title || '—'
  header.appendChild(titleEl)

  if (authorField) {
    const authorEl = document.createElement('div')
    authorEl.style.cssText = `flex-shrink:0;font-size:11px;color:var(--color-text-muted, ${colors.textMuted});max-width:42%;text-align:right;line-height:1.35;word-break:keep-all;margin-top:0;padding-top:0;`
    authorEl.textContent = authorText || '—'
    header.appendChild(authorEl)
  }

  props.appendChild(header)

  exportFields.forEach((f) => {
    if (f.id === 'author') return

    const row = document.createElement('div')
    row.style.cssText = 'font-size:12px;margin-bottom:5px;line-height:1.45;padding-left:2px;'

    let valueHtml
    if (f.type === 'rating') {
      valueHtml = renderRatingHtml(record, f, colors)
    } else {
      const val = getFieldText(record, f, tagsMap)
      valueHtml = val
        ? `<span style="color:${colors.text};">${escapeHtml(val)}</span>`
        : `<span style="color:${colors.textMuted};">—</span>`
    }

    row.innerHTML = `<span style="color:${colors.textMuted};">${escapeHtml(f.label)}: </span>${valueHtml}`
    props.appendChild(row)
  })

  return props
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderRatingHtml(record, field, colors) {
  const rating = Number(record.rating ?? record.customFields?.[field.id] ?? 0)
  if (!rating) {
    return `<span style="color:${colors.textMuted};">—</span>`
  }
  const iconType = getRecordRatingIcon(record, field)
  if (iconType === 'heart') {
    const filled = '♥'.repeat(rating)
    const empty = '♡'.repeat(Math.max(0, 5 - rating))
    return `<span style="color:#F43F5E;letter-spacing:1px;">${filled}${empty}</span>`
  }
  if (iconType === 'skull') {
    return `<span style="color:${colors.text};">${rating}점</span>`
  }
  const filled = '★'.repeat(rating)
  const empty = '☆'.repeat(Math.max(0, 5 - rating))
  return `<span style="color:#F59E0B;letter-spacing:1px;">${filled}${empty}</span>`
}

function getFieldText(record, field, tagsMap) {
  const tf = record.tagFieldValues?.[field.id]
  if (tf?.text) return tf.text
  if (field.type === 'tags' || field.type === 'tag') {
    const tags = (record.tagIds || [])
      .map((id) => tagsMap[id])
      .filter(Boolean)
      .filter((t) => !field.tagCategory || t.category === field.tagCategory)
    return tags.map((t) => t.name).join(', ')
  }
  if (field.type === 'rating') {
    const val = record.rating ?? record.customFields?.[field.id] ?? 0
    return val ? `${val}점` : ''
  }
  if (field.type === 'tag' && field.id === 'rating') return `${record.rating || 0}점`
  if (field.type === 'tag') return tf?.text || record[field.id] || ''
  if (field.type === 'date') {
    const val = record[field.id] || record.customFields?.[field.id] || ''
    return formatDateByMode(val, field.dateFormat || 'full')
  }
  if (field.type === 'year') {
    const val = record[field.id] || record.customFields?.[field.id] || ''
    return val ? `${String(val).slice(0, 4)}년` : ''
  }
  if (field.type === 'link') return record.link || ''
  return record[field.id] || record.customFields?.[field.id] || ''
}

async function exportAsPng(
  element,
  filename,
  bgColor,
  {
    presets,
    activePresetSlot,
    fontFamily,
    showBackgroundImage,
    backgroundImage,
    backgroundImageOpacity,
    backgroundImageMode
  }
) {
  const { default: html2canvas } = await import('html2canvas')
  await waitForImages(element)
  const canvas = await html2canvas(element, {
    backgroundColor: bgColor || '#FFF9E5',
    scale: 2,
    useCORS: true,
    height: element.scrollHeight,
    windowHeight: element.scrollHeight
  })
  const framed = await composeBrandedExportCanvas(canvas, {
    titleLabel: '',
    showDate: true,
    presets,
    activePresetSlot,
    fontFamily,
    bgColor,
    showBackgroundImage,
    backgroundImage,
    backgroundImageOpacity,
    backgroundImageMode
  })
  await downloadDataUrl(framed.toDataURL('image/png'), filename, { openFolder: true })
}

function waitForImages(el) {
  const imgs = el.querySelectorAll('img')
  return Promise.all(
    [...imgs].map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((res) => {
              img.onload = res
              img.onerror = res
            })
    )
  )
}

export function buildReviewSections(record, selectedVolume) {
  const series = record.series || { enabled: false, unit: '권', volumes: [1] }
  const sections = []

  if (series.enabled && selectedVolume != null) {
    const vol = record.volumeReviews?.[selectedVolume] || {}
    sections.push({
      label: `${record.title} - ${selectedVolume}${series.unit}`,
      subtitle: vol.subtitle || '',
      content: vol.content || ''
    })
    return sections
  }

  sections.push({
    label: record.title,
    subtitle: record.reviewSubtitle || '',
    content: record.review || ''
  })
  return sections
}

export function buildSeriesReviewSections(record) {
  const series = record.series || { enabled: false, unit: '권', volumes: [1] }
  const sections = [
    {
      label: `${record.title} (전체)`,
      subtitle: record.reviewSubtitle || '',
      content: record.review || ''
    }
  ]
  if (series.enabled) {
    const vol = record.volumeReviews || {}
    const disabled = series.disabledVolumes || []
    series.volumes.forEach((v) => {
      const vr = vol[v] || {}
      const isDisabled = disabled.includes(v)
      sections.push({
        label: `${v}${series.unit}`,
        subtitle: isDisabled ? '' : vr.subtitle || '',
        content: isDisabled ? '' : vr.content || '',
        disabled: isDisabled
      })
    })
  }
  return sections
}
