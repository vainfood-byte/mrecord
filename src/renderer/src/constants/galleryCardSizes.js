export const GALLERY_CARD_SIZES = {
  small: { width: 100, label: '소' },
  medium: { width: 140, label: '중' },
  large: { width: 180, label: '대' },
  xlarge: { width: 220, label: '특대' }
}

export function getGalleryCardWidth(sizeKey) {
  return GALLERY_CARD_SIZES[sizeKey]?.width ?? GALLERY_CARD_SIZES.medium.width
}

/** 제목 영역(min-h-[2.75rem]) 높이 — 제목 생략 시 표지가 이 영역까지 확장 */
export const GALLERY_TITLE_BAR_PX = 44

/** 표지 비율 3:4 (width:height) — height = width × 4/3 */
export const GALLERY_COVER_HEIGHT_RATIO = 4 / 3

export function getGalleryCoverExportHeight(cardWidth) {
  return Math.round(Math.max(1, cardWidth) * GALLERY_COVER_HEIGHT_RATIO)
}

/** 제목 포함 카드 전체 높이 (표지 3:4 + 제목바 + 테두리 여유) */
export function getGalleryCardExportHeight(cardWidth, hideTitle = false) {
  if (hideTitle) return Math.round(Math.max(1, cardWidth) * 0.75)
  return getGalleryCoverExportHeight(cardWidth) + GALLERY_TITLE_BAR_PX + 2
}

export function getGalleryCoverAspectStyle(cardWidth, hideTitle) {
  if (!hideTitle) return undefined
  const coverH = cardWidth * (4 / 3)
  return { aspectRatio: `${cardWidth} / ${coverH + GALLERY_TITLE_BAR_PX}` }
}
