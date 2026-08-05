import { deriveCardBackground } from '../utils/colorUtils'
import { getCustomFontStack, injectCustomFont, removeCustomFont } from '../utils/customFont'

/** 시리즈 단위 옵션 */
export const SERIES_UNITS = ['권', '화', '편', '기', '시즌', 'EP']

/** 기본 속성 필드 (5종: 별점형·메모형·태그형·링크형·달력형) */
export const DEFAULT_PROPERTY_FIELDS = [
  { id: 'rating', label: '별점', icon: 'Star', type: 'rating', ratingIcon: 'star', visible: true, exportVisible: true },
  { id: 'oneLine', label: '한마디', icon: 'PenLine', type: 'memo', visible: true, exportVisible: true },
  { id: 'author', label: '저자', icon: 'PenLine', type: 'memo', visible: true, exportVisible: true },
  { id: 'mediaType', label: '유형', icon: 'BookOpen', type: 'tags', tagCategory: '유형', visible: true, exportVisible: true },
  { id: 'genre', label: '장르', icon: 'List', type: 'tags', tagCategory: '장르', visible: true, exportVisible: true },
  { id: 'status', label: '상태', icon: 'List', type: 'tags', tagCategory: '상태', visible: true, exportVisible: true },
  { id: 'site', label: '사이트', icon: 'ExternalLink', type: 'tags', tagCategory: '사이트', visible: true, exportVisible: true },
  { id: 'publisher', label: '출판사', icon: 'Building2', type: 'tags', tagCategory: '출판사', visible: true, exportVisible: true },
  { id: 'grade', label: '등급', icon: 'Hash', type: 'tags', tagCategory: '등급', visible: true, exportVisible: true },
  { id: 'link', label: '링크', icon: 'Link2', type: 'link', visible: true, exportVisible: true },
  { id: 'readDate', label: '처음 읽은 날', icon: 'Calendar', type: 'date', visible: true, exportVisible: true },
  { id: 'finishDate', label: '연도', icon: 'Calendar', type: 'year', visible: true, exportVisible: true }
]

/** @deprecated — CORE_TABS + propertyFields 로 대체됨 */
export const TABS = [
  { id: 'record', label: '기록' },
  { id: 'gallery', label: '갤러리' },
  { id: 'calendar', label: '캘린더' }
]

export const DEFAULT_VISIBLE_TABS = ['record', 'gallery', 'calendar', 'oneLine', 'genre']

export function buildDefaultTabOrder() {
  return ['record', 'gallery', 'calendar', ...DEFAULT_PROPERTY_FIELDS.map((f) => f.id)]
}

export const TAB_LABELS = Object.fromEntries(TABS.map((t) => [t.id, t.label]))

/** 테마 프리셋 — 배경/글자색 변경용 */
export const THEME_PRESETS = [
  {
    id: 'cream',
    name: '크림',
    bg: '#FAF8F3',
    bgPanel: '#F5F1E5',
    bgCard: '#FFFFFF',
    text: '#745039',
    textMuted: '#9A8070',
    accent: '#745039',
    border: '#E8E2D6'
  },
  {
    id: 'olive',
    name: '올리브',
    bg: '#E8EBE0',
    bgPanel: '#F4F6EF',
    bgCard: '#FFFFFF',
    text: '#2F3528',
    textMuted: '#6B7560',
    accent: '#6B7F4E',
    border: '#C8D0BC'
  },
  {
    id: 'sky',
    name: '하늘',
    bg: '#E3EDF5',
    bgPanel: '#F0F6FB',
    bgCard: '#FFFFFF',
    text: '#2C3A4A',
    textMuted: '#6B7F94',
    accent: '#5B8DB8',
    border: '#C2D4E4'
  },
  {
    id: 'rose',
    name: '로즈',
    bg: '#F0E6E8',
    bgPanel: '#FAF2F4',
    bgCard: '#FFFFFF',
    text: '#4A3538',
    textMuted: '#8A7074',
    accent: '#B87B85',
    border: '#E0C8CC'
  },
  {
    id: 'dark',
    name: '다크',
    bg: '#2A2826',
    bgPanel: '#353230',
    bgCard: '#3E3B38',
    text: '#F0EBE3',
    textMuted: '#A89F94',
    accent: '#C4A882',
    border: '#4A4642'
  },
  {
    id: 'obsidian',
    name: '암흑',
    bg: '#141312',
    bgPanel: '#1C1B19',
    bgCard: '#252322',
    text: '#E8E2D8',
    textMuted: '#8A8278',
    accent: '#B8956E',
    border: '#333130'
  }
]

/** 태그 프리셋 컬러 (파스텔 4개) + 사용자 지정 2슬롯 */
export const TAG_COLOR_PRESETS = [
  { id: 'pastel-pink', color: '#FFD6E0', label: '파스텔 핑크' },
  { id: 'pastel-blue', color: '#D6E8FF', label: '파스텔 블루' },
  { id: 'pastel-green', color: '#D6FFD6', label: '파스텔 그린' },
  { id: 'pastel-yellow', color: '#FFF3D6', label: '파스텔 옐로' }
]

export const TAG_CUSTOM_SLOTS = [
  { id: 'custom-1', color: '#E8D6FF', label: '사용자 지정 1' },
  { id: 'custom-2', color: '#D6FFF0', label: '사용자 지정 2' }
]

/** 글꼴 프리셋 */
export const CUSTOM_FONT_ID = 'custom-user'

export const FONT_PRESETS = [
  { id: 'default', name: '기본', family: "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" },
  { id: 'bookk', name: '부크크 명조', family: "'Bookk Myungjo', 'Batang', serif" },
  { id: 'mabinogi', name: '마비노기옛체', family: "'Mabinogi Classic', 'Malgun Gothic', sans-serif" },
  { id: 'paperlogy', name: '페이퍼로지 미디엄', family: "'Paperlogy', 'Malgun Gothic', sans-serif" }
]

const LEGACY_FONT_IDS = {
  serif: 'bookk',
  sans: 'default',
  hand: 'paperlogy'
}

/** 기본 태그 (장르 / 상태 / 사이트 / 유형) */
export const DEFAULT_TAGS = [
  { id: 'tag-manga', name: '만화', colorId: 'pastel-pink', category: '유형' },
  { id: 'tag-novel', name: '소설', colorId: 'pastel-blue', category: '유형' },
  { id: 'tag-webtoon', name: '웹툰', colorId: 'pastel-green', category: '유형' },
  { id: 'tag-movie', name: '영화', colorId: 'pastel-yellow', category: '유형' },
  { id: 'tag-game', name: '게임', colorId: 'custom-1', category: '유형' },
  { id: 'tag-anime', name: '애니', colorId: 'custom-2', category: '유형' },
  { id: 'tag-drama', name: '드라마', colorId: 'pastel-pink', category: '유형' },
  { id: 'tag-romance', name: '로맨스', colorId: 'pastel-pink', category: '장르' },
  { id: 'tag-fantasy', name: '판타지', colorId: 'pastel-blue', category: '장르' },
  { id: 'tag-action', name: '액션', colorId: 'pastel-green', category: '장르' },
  { id: 'tag-thriller', name: '스릴러', colorId: 'pastel-yellow', category: '장르' },
  { id: 'tag-mystery', name: '추리', colorId: 'custom-1', category: '장르' },
  { id: 'tag-finished', name: '완독', colorId: 'pastel-green', category: '상태' },
  { id: 'tag-reading', name: '읽는 중', colorId: 'pastel-blue', category: '상태' },
  { id: 'tag-latest', name: '최신권', colorId: 'pastel-yellow', category: '상태' },
  { id: 'tag-wish', name: '위시', colorId: 'pastel-pink', category: '상태' },
  { id: 'tag-ridi', name: '리디북스', colorId: 'pastel-blue', category: '사이트' },
  { id: 'tag-naver', name: '네이버', colorId: 'pastel-green', category: '사이트' },
  { id: 'tag-kakao', name: '카카오페이지', colorId: 'pastel-yellow', category: '사이트' },
  { id: 'tag-19', name: '19', colorId: 'pastel-pink', category: '등급' },
  { id: 'tag-2025', name: '2025', colorId: 'pastel-yellow', category: '연도' },
  { id: 'tag-2026', name: '2026', colorId: 'pastel-yellow', category: '연도' }
]

export const STATUS_OPTIONS = ['읽는 중', '완독', '나온 데까지', '보류']

export const DEFAULT_TRACE_WIDGETS = [
  {
    id: 'trace-default-genre-count',
    type: 'stat',
    coverUrl: '',
    sourceId: 'genre',
    keywordId: '__none__',
    formatType: 'number',
    prefixText: '',
    suffixText: '권의 책을 읽었어요',
    statPrefixText: '',
    statSuffixText: '예요',
    graphType: 'none'
  },
  {
    id: 'trace-default-genre-stat',
    type: 'stat',
    coverUrl: '',
    sourceId: 'genre',
    keywordId: '__none__',
    formatType: 'stat',
    prefixText: '',
    suffixText: '권의 책을 읽었어요',
    statPrefixText: '가장 많이 읽은 장르는',
    statSuffixText: '예요',
    graphType: 'pie',
    graphColorMode: 'theme',
    graphColorSeed: 0
  }]

export const CUSTOM_THEME_SLOT_COUNT = 6

export const DEFAULT_CUSTOM_THEME = {
  bg: '#FAF8F3',
  bgPanel: '#F5F1E5',
  bgSubPanel: '#FFFFFF',
  text: '#745039',
  /** 글자색과 독립 — 테두리/레트로 그림자 */
  border: '#E8E2D6'
}

export const UI_STYLE_IDS = ['default', 'glass', 'retro']

export function normalizeUiStyle(value) {
  return UI_STYLE_IDS.includes(value) ? value : 'default'
}

/** #RRGGBB / #RGB → "r, g, b" (rgba(var(--x), a)용) */
export function hexToRgbChannels(hex) {
  const raw = String(hex || '').trim().replace(/^#/, '')
  let r = 255
  let g = 255
  let b = 255
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    r = parseInt(raw[0] + raw[0], 16)
    g = parseInt(raw[1] + raw[1], 16)
    b = parseInt(raw[2] + raw[2], 16)
  } else if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    r = parseInt(raw.slice(0, 2), 16)
    g = parseInt(raw.slice(2, 4), 16)
    b = parseInt(raw.slice(4, 6), 16)
  }
  return `${r}, ${g}, ${b}`
}

export function ensureCustomThemeSlots(slots) {
  const next = [...(slots || [])]
  while (next.length < CUSTOM_THEME_SLOT_COUNT) next.push(null)
  return next.slice(0, CUSTOM_THEME_SLOT_COUNT)
}

export function normalizeCustomTheme(theme, fallbackBg = DEFAULT_CUSTOM_THEME.bg) {
  const bg = theme?.bg || fallbackBg
  const text = theme?.text ?? DEFAULT_CUSTOM_THEME.text
  return {
    bg,
    bgPanel: theme?.bgPanel ?? DEFAULT_CUSTOM_THEME.bgPanel,
    bgSubPanel: theme?.bgSubPanel ?? deriveCardBackground(bg),
    text,
    /* 구버전: border 없으면 배경색을 테두리로 쓰던 동작과 호환 */
    border: theme?.border ?? theme?.bg ?? DEFAULT_CUSTOM_THEME.border,
    slotColor: theme?.slotColor || text
  }
}

export function buildThemeSlotSave(theme) {
  const normalized = normalizeCustomTheme(theme)
  return { ...normalized, slotColor: normalized.text }
}

export function getThemeSlotPreviewColor(saved) {
  if (!saved) return null
  return saved.slotColor || saved.text || normalizeCustomTheme(saved).text
}

export function normalizeCustomThemeSlots(slots) {
  return ensureCustomThemeSlots(slots).map((slot) =>
    slot ? buildThemeSlotSave(slot) : null
  )
}

export const DEFAULT_SETTINGS = {
  themePresetId: 'cream',
  customTheme: { ...DEFAULT_CUSTOM_THEME },
  /** 사용자 테마 저장 슬롯 (최대 6) */
  customThemeSlots: ensureCustomThemeSlots([]),
  useCustomTheme: false,
  /** UI 스타일 스킨 — 테마 색과 독립 (default | glass | retro) */
  uiStyle: 'default',
  fontId: 'default',
  customFont: null,
  fontSize: 14,
  uiScale: 100,
  tagCustomColors: {
    'custom-1': '#E8D6FF',
    'custom-2': '#D6FFF0'
  },
  backgroundImage: null,
  backgroundImageOpacity: 0.3,
  backgroundImageMode: 'fill',
  customSeriesUnits: [],
  propertyFields: DEFAULT_PROPERTY_FIELDS,
  detailPanelWidth: 480,
  visibleTabs: DEFAULT_VISIBLE_TABS,
  tabOrder: buildDefaultTabOrder(),
  traceWidgets: DEFAULT_TRACE_WIDGETS,
  traceBoxCollapsed: false,
  presets: [
    { name: '', data: null },
    { name: '', data: null },
    { name: '', data: null },
    { name: '', data: null }
  ],
  selectedPresetSlot: 0,
  activePresetSlot: 0,
  lockSettings: {
    enabled: false,
    propertyFieldId: 'grade',
    tagId: 'tag-19',
    lockOnStartup: false
  },
  /** 삭제 전 확인 (false = 다시 묻지 않음) */
  confirmBeforeDelete: true,
  /** 시리즈 회차 삭제 전 확인 (false = 다시는 묻지 않음) */
  confirmBeforeDeleteSeriesVolume: true,
  /** 윈도우 시작 시 자동 실행 */
  autoStartOnLaunch: false,
  /** 바탕화면 바로가기 생성 */
  desktopShortcut: false,
  /** 속성 리모컨 팝업 위치/크기 */
  propertyRemoteLayout: { x: 120, y: 80, width: 360, height: 480 },
  /** 태그형 속성 탭 — 필드 id별 태그 블록 표시 순서 */
  tagBlockOrders: {},
  /** 꾸미기 스티커 목록 (배열 순서 = 레이어 순) */
  stickers: [],
  /** 스티커 그림자 ON/OFF */
  stickerShadowEnabled: true,
  /** 캘린더 쁘띠 스티커 */
  calendarPetitStickers: [],
  /** 헤더 카메라 내보내기 옵션 */
  exportImageOptions: {
    showDate: true,
    showBackgroundImage: true,
    /** 내보내기 카드 작품명 크기: small | medium | large */
    titleFontSize: 'medium',
    titleSize: 'medium'
  },
  /** 갤러리 카드 크기: small | medium | large | xlarge */
  galleryCardSize: 'medium',
  /** 갤러리 — 제목 영역 숨김 (표지만 표시) */
  galleryHideTitle: false,
  /** 갤러리 — 표지 블러 처리 (표지 숨기기) */
  galleryHideCover: false,
  /** 작품 목록 — 100개씩 페이지 보기 (OFF: 무한 스크롤) */
  pagedView: false,
  /** 100개 작품 기념 이스터에그 — 한 번 본 뒤 다시 표시하지 않음 */
  easterEgg100Dismissed: false,
  /** 태그 카드 크기: small | medium | large | xlarge (기본 대) */
  tagBlockSize: 'large',
  /** 메모형 속성 탭 — 필드 id별 카드/리스트 보기 설정 */
  memoTabSettings: {},
  /** 쁘띠스티커 라이브러리 (최근 6개 src) */
  petitStickerLibrary: [],
  /** 캘린더 날짜별 커버 */
  calendarDayCovers: {},
  /** 캘린더 그라데이션 사용자 지정색 */
  calendarGradientColors: { custom1: '#ffffff', custom2: '#333333' },
  /** 캘린더 날짜 칸 최소 높이(px) */
  calendarCellHeight: 80,
  /** 전체보기 레이아웃 크기 */
  fullViewLayout: {
    leftWidth: 288,
    coverHeight: 384,
    reviewHeight: 480,
    reviewPercent: 80
  },
  /** 태그 색상: 커스텀 팔레트만 사용 */
  tagCustomColorOnly: false,
  /** 사용자 지정 태그 색상 팔레트 — 기본: 화이트·블랙·그레이 */
  tagCustomPalette: ['#FFFFFF', '#000000', '#9CA3AF'],
  /** 컬러피커 최근 사용 색상 (5칸) */
  recentPickColors: [null, null, null, null, null],
  /** 창 크기·위치 (재시작 시 복원) */
  windowBounds: null
}

/** 이전 8색 기본 팔레트 (마이그레이션용) */
export const LEGACY_TAG_CUSTOM_PALETTE = [
  '#FFD6E0', '#D6E8FF', '#D6FFD6', '#FFF5D6', '#E8D6FF', '#FFE0D6', '#D6FFF0', '#F0D6FF'
]

export function getTagColor(colorId, tagCustomColors = {}) {
  const preset = TAG_COLOR_PRESETS.find((t) => t.id === colorId)
  if (preset) return preset.color
  const custom = TAG_CUSTOM_SLOTS.find((t) => t.id === colorId)
  if (custom) return tagCustomColors[colorId] || custom.color
  return '#E0E0E0'
}

/** 태그 블록 헤더 색 — 사용자 지정 headerColor 우선 */
export function getTagBlockColor(tag, tagCustomColors = {}) {
  if (tag.headerColor) return tag.headerColor
  return getTagColor(tag.colorId, tagCustomColors)
}

export function resolveFontFamily(settings) {
  const fontId = LEGACY_FONT_IDS[settings?.fontId] || settings?.fontId || 'default'
  if (fontId === CUSTOM_FONT_ID && settings?.customFont?.dataUrl) {
    return getCustomFontStack()
  }
  const font = FONT_PRESETS.find((f) => f.id === fontId) || FONT_PRESETS[0]
  return font.family
}

export function applyTheme(settings) {
  const root = document.documentElement
  let theme

  if (settings.useCustomTheme) {
    const custom = normalizeCustomTheme(settings.customTheme)
    theme = {
      bg: custom.bg,
      bgPanel: custom.bgPanel,
      bgCard: custom.bgSubPanel,
      bgSubPanel: custom.bgSubPanel,
      text: custom.text,
      textMuted: custom.text + '99',
      accent: custom.text,
      border: custom.border
    }
  } else {
    const preset = THEME_PRESETS.find((t) => t.id === settings.themePresetId) || THEME_PRESETS[0]
    theme = {
      ...preset,
      bgCard: deriveCardBackground(preset.bg, preset.bgCard),
      bgSubPanel: preset.bgCard ?? deriveCardBackground(preset.bg, preset.bgCard)
    }
  }

  const panelBg = theme.bgPanel
  const subPanelBg = theme.bgSubPanel ?? theme.bgCard
  const bgRgb = hexToRgbChannels(theme.bg)

  root.style.setProperty('--color-bg', theme.bg)
  root.style.setProperty('--color-bg-panel', panelBg)
  root.style.setProperty('--color-bg-card', theme.bgCard)
  root.style.setProperty('--color-bg-sub-panel', subPanelBg)
  root.style.setProperty('--color-text', theme.text)
  root.style.setProperty('--color-text-muted', theme.textMuted)
  root.style.setProperty('--color-accent', theme.accent)
  root.style.setProperty('--color-border', theme.border)
  root.style.setProperty('--color-sidebar', panelBg)

  /* UI 스타일용 별칭 — 기존 테마/커스텀 색상 연동 */
  root.style.setProperty('--bg-color', theme.bg)
  root.style.setProperty('--panel-color', panelBg)
  root.style.setProperty('--sub-panel-color', subPanelBg)
  root.style.setProperty('--text-color', theme.text)
  root.style.setProperty('--border-color', theme.border)
  root.style.setProperty('--panel-bg-rgb', hexToRgbChannels(panelBg))
  root.style.setProperty('--subpanel-bg-rgb', hexToRgbChannels(subPanelBg))
  root.style.setProperty('--bg-color-rgb', bgRgb)
  root.style.setProperty('--bg-rgb', bgRgb)

  root.setAttribute('data-ui-style', normalizeUiStyle(settings.uiStyle))

  if (settings.customFont?.dataUrl) {
    injectCustomFont(settings.customFont.dataUrl, settings.customFont.ext || 'ttf')
  } else {
    removeCustomFont()
  }

  const fontId = LEGACY_FONT_IDS[settings.fontId] || settings.fontId
  let fontFamily = FONT_PRESETS.find((f) => f.id === fontId)?.family || FONT_PRESETS[0].family
  if (fontId === CUSTOM_FONT_ID && settings.customFont?.dataUrl) {
    fontFamily = getCustomFontStack()
  } else if (fontId === CUSTOM_FONT_ID) {
    fontFamily = FONT_PRESETS[0].family
  }

  root.style.setProperty('--font-family', fontFamily)
  root.style.setProperty('--font-size', `${settings.fontSize}px`)
  root.style.setProperty('--ui-scale', String((settings.uiScale ?? 100) / 100))
}
