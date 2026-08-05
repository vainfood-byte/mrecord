/** 레거시 단일 태그형 속성 ID (사용자 추가 tag 타입용) */
export const TAG_TYPE_FIELD_IDS = []

export const TAG_COLOR_PALETTE = [
  '#FFD6E0', '#D6E8FF', '#D6FFD6', '#FFF3D6',
  '#E8D6FF', '#D6FFF0', '#FFE8D6', '#D6F5FF'
]

export const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 48, 64]

export const EDIT_BOX_FONT_OPTIONS = [
  { label: '돋움', value: 'Dotum', stack: '"Dotum", "돋움", sans-serif' },
  {
    label: '궁서',
    value: 'Gungsuh',
    stack: '"Gungsuh", "GungSeo", "궁서", "GungsuhChe", "Batang", "Bookk Myungjo", serif'
  },
  {
    label: '고딕',
    value: 'Malgun Gothic',
    stack: '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif'
  },
  { label: '바탕', value: 'Batang', stack: '"Batang", "바탕", "Bookk Myungjo", serif' }
]

export function resolveEditBoxFontStack(value) {
  const normalized = value === 'GungSeo' ? 'Gungsuh' : value
  const option = EDIT_BOX_FONT_OPTIONS.find((font) => font.value === normalized)
  return option?.stack || value
}
