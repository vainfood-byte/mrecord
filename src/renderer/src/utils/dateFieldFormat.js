import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

export const DATE_FORMAT_OPTIONS = [
  { id: 'year', label: '연도 (yyyy)' },
  { id: 'year-month', label: '연월 (yyyy.mm)' },
  { id: 'full', label: '연월일 (yyyy.mm.dd)' }
]

export function normalizeDateValue(value, dateFormat = 'full') {
  if (!value) return ''
  const raw = String(value).trim()
  if (dateFormat === 'year') {
    const y = raw.slice(0, 4)
    return /^\d{4}$/.test(y) ? y : raw
  }
  if (dateFormat === 'year-month') {
    if (/^\d{4}-\d{2}$/.test(raw)) return raw
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 7)
    return raw
  }
  if (/^\d{4}$/.test(raw)) return `${raw}-01-01`
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`
  return raw.slice(0, 10)
}

export function formatDateByMode(value, dateFormat = 'full') {
  if (!value) return ''
  const v = normalizeDateValue(value, dateFormat)
  try {
    if (dateFormat === 'year') return `${v.slice(0, 4)}년`
    if (dateFormat === 'year-month') {
      const d = parseISO(`${v.slice(0, 7)}-01`)
      return format(d, 'yyyy.MM', { locale: ko })
    }
    const d = v.includes('T') ? new Date(v) : parseISO(v)
    return format(d, 'yyyy년 M월 d일', { locale: ko })
  } catch {
    return v
  }
}

export function collectYearsFromRecords(records, fieldId) {
  const years = new Set()
  records.forEach((rec) => {
    const v = rec[fieldId] ?? rec.customFields?.[fieldId]
    if (!v) return
    const y = String(v).slice(0, 4)
    if (/^\d{4}$/.test(y)) years.add(y)
  })
  return [...years].sort((a, b) => Number(b) - Number(a))
}
