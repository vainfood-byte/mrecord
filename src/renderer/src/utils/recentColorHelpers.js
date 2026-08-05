const RECENT_COLOR_SLOTS = 5

export function normalizeRecentColors(slots) {
  const arr = Array.isArray(slots) ? [...slots] : []
  while (arr.length < RECENT_COLOR_SLOTS) arr.push(null)
  return arr.slice(0, RECENT_COLOR_SLOTS)
}

/** 최근 선택 색상 — 5칸 FIFO (가장 오래된 것부터 대체) */
export function pushRecentColor(slots, hex, max = RECENT_COLOR_SLOTS) {
  if (!hex) return normalizeRecentColors(slots)

  let colors = normalizeRecentColors(slots).filter(Boolean)
  colors = colors.filter((c) => c.toLowerCase() !== hex.toLowerCase())
  colors.push(hex)
  if (colors.length > max) colors = colors.slice(colors.length - max)

  const result = Array(max).fill(null)
  colors.forEach((color, index) => {
    result[index] = color
  })
  return result
}

export { RECENT_COLOR_SLOTS }
