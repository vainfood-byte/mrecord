export const TAG_BLOCK_SIZES = {
  small: { width: 140, minHeight: 336, label: '소' },
  medium: { width: 170, minHeight: 408, label: '중' },
  large: { width: 200, minHeight: 480, label: '대' },
  xlarge: { width: 240, minHeight: 576, label: '특대' }
}

export function getTagBlockDimensions(sizeKey) {
  const size = TAG_BLOCK_SIZES[sizeKey] ?? TAG_BLOCK_SIZES.large
  return { width: size.width, minHeight: size.minHeight }
}
