/** 편집박스 텍스트 색 — 표준 팔레트 (그레이스케일 · 8×5 색상) */

export const TEXT_COLOR_GRAYSCALE_ROW = [
  '#FFFFFF',
  '#F2F2F2',
  '#E0E0E0',
  '#CFCFCF',
  '#BFBFBF',
  '#A0A0A0',
  '#7F7F7F',
  '#5F5F5F',
  '#000000'
]

/** 8열 × 5행 — 열 단위 색상 계열 */
export const TEXT_COLOR_CHROMATIC_COLS = [
  ['#FFEBEE', '#FFCDD2', '#EF9A9A', '#E57373', '#C62828'],
  ['#FFF3E0', '#FFE0B2', '#FFCC80', '#FFB74D', '#E65100'],
  ['#FFFDE7', '#FFF9C4', '#FFF176', '#FFEE58', '#9E9D24'],
  ['#E8F5E9', '#C8E6C9', '#A5D6A7', '#81C784', '#2E7D32'],
  ['#E0F7FA', '#B2EBF2', '#80DEEA', '#4DD0E1', '#00838F'],
  ['#E3F2FD', '#BBDEFB', '#90CAF9', '#64B5F6', '#1565C0'],
  ['#F3E5F5', '#E1BEE7', '#CE93D8', '#BA68C8', '#6A1B9A'],
  ['#FCE4EC', '#F8BBD0', '#F48FB1', '#F06292', '#AD1457']
]

export function flattenTextColorPalette() {
  const rows = []
  for (let r = 0; r < 5; r += 1) {
    rows.push(TEXT_COLOR_CHROMATIC_COLS.map((col) => col[r]))
  }
  return rows
}
