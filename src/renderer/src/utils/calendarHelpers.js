/** 캘린더 헬퍼 — 그라데이션·라이브러리·셀 높이 */

import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek
} from 'date-fns'

export function recordsPerCell(cellHeight) {
  return Math.max(1, Math.floor((cellHeight - 28) / 14))
}

export function pushPetitStickerLibrary(library, src, max = 6) {
  if (!src) return library || []
  return [src, ...(library || []).filter((s) => s !== src)].slice(0, max)
}

export function buildLibraryFromStickers(stickers, library, max = 6) {
  const fromStickers = [...(stickers || [])].reverse().map((s) => s.src)
  let merged = [...(library || [])]
  fromStickers.forEach((src) => {
    merged = pushPetitStickerLibrary(merged, src, max)
  })
  return merged.slice(0, max)
}

const GRADIENT_STOPS = {
  white: 'rgba(255,255,255,0.88) 0%, transparent 50%',
  black: 'rgba(0,0,0,0.72) 0%, transparent 50%',
  custom1: null,
  custom2: null
}

function hexToRgba(hex, alpha) {
  const h = (hex || '#ffffff').replace('#', '')
  if (h.length < 6) return `rgba(255,255,255,${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function getCalendarGradientStyle(gradient, customColors = {}) {
  if (!gradient || gradient === 'none') return null
  let stops = GRADIENT_STOPS[gradient]
  if (gradient === 'custom1') {
    stops = `${hexToRgba(customColors.custom1, 0.88)} 0%, transparent 50%`
  } else if (gradient === 'custom2') {
    stops = `${hexToRgba(customColors.custom2, 0.88)} 0%, transparent 50%`
  }
  if (!stops) return null
  return { background: `linear-gradient(to bottom, ${stops})` }
}

export function getDateBadgeClass() {
  return 'bg-[var(--color-bg-panel)]/40 text-[var(--color-text)]'
}

/** 달력 day 배열을 주(7일) 단위로 분할 */
export function chunkWeeks(days) {
  const weeks = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }
  return weeks
}

/** 시작 주부터 count개 주 생성 */
export function generateWeeksFrom(startWeek, count) {
  const weeks = []
  for (let w = 0; w < count; w++) {
    const ws = addDays(startWeek, w * 7)
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(ws, i)))
  }
  return weeks
}

/** 첫 번째 보이는 주 기준 헤더 월 — 해당 주에 1일이 있으면 그 월 */
export function headerMonthFromWeek(weekDays) {
  const firstOfMonth = weekDays.find((d) => d.getDate() === 1)
  if (firstOfMonth) return startOfMonth(firstOfMonth)
  return startOfMonth(weekDays[0])
}

/** 월별 달력 그리드(앞뒤 빈칸 포함)에 속하는 주인지 */
export function isWeekInMonthGrid(weekStart, targetMonth) {
  const ms = startOfMonth(targetMonth)
  const me = endOfMonth(targetMonth)
  const calStart = startOfWeek(ms, { weekStartsOn: 0 })
  const calEnd = endOfWeek(me, { weekStartsOn: 0 })
  const weekEnd = addDays(weekStart, 6)
  return weekStart <= calEnd && weekEnd >= calStart
}

/** 월별 달력 그리드에 필요한 주 수 (5~6주) */
export function weeksInMonthGrid(targetMonth) {
  const ms = startOfMonth(targetMonth)
  const me = endOfMonth(targetMonth)
  const calStart = startOfWeek(ms, { weekStartsOn: 0 })
  const calEnd = endOfWeek(me, { weekStartsOn: 0 })
  let count = 0
  for (let d = calStart; d <= calEnd; d = addDays(d, 7)) count++
  return count
}

/** 월별 달력 그리드 주 배열 (1일~말일 포함) */
export function generateMonthGridWeeks(targetMonth) {
  const ms = startOfMonth(targetMonth)
  const me = endOfMonth(targetMonth)
  const calStart = startOfWeek(ms, { weekStartsOn: 0 })
  const calEnd = endOfWeek(me, { weekStartsOn: 0 })
  const weeks = []
  for (let d = calStart; d <= calEnd; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)))
  }
  return weeks
}

export function weekStartKey(weekStart) {
  return format(weekStart, 'yyyy-MM-dd')
}

/** 뷰포트에 표시할 주 수 (휠 스크롤 단위) */
export const CALENDAR_VISIBLE_WEEKS = 4

/** 초기·추가 로드 주 수 */
export const CALENDAR_WEEK_BATCH = 12
export const CALENDAR_INITIAL_WEEKS = 52
