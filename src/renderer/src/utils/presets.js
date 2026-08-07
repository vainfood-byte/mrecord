import { DEFAULT_SETTINGS } from '../data/defaults'

/** 슬롯 간 공유 — 작품(레코드·태그) 및 앱 전역 설정 */
export const SHARED_SETTING_FIELDS = [
  'presets',
  'selectedPresetSlot',
  'activePresetSlot',
  'propertyFields',
  'customSeriesUnits',
  'tagCustomColors',
  'tagCustomColorOnly',
  'tagCustomPalette',
  'recentPickColors',
  'pagedView',
  'lockSettings',
  'confirmBeforeDelete',
  'autoStartOnLaunch',
  'desktopShortcut',
  'windowBounds',
  'easterEgg100Dismissed'
]

/** 프리셋 슬롯별로 독립 저장되는 설정 (작품 정보 제외) */
export const PRESET_SETTING_FIELDS = [
  'themePresetId',
  'useCustomTheme',
  'customTheme',
  'customThemeSlots',
  'uiStyle',
  'fontId',
  'customFont',
  'fontSize',
  'uiScale',
  'borderWidth',
  'backgroundImage',
  'backgroundImageOpacity',
  'backgroundImageMode',
  'stickers',
  'stickerShadowEnabled',
  'traceWidgets',
  'traceBoxCollapsed',
  'calendarPetitStickers',
  'petitStickerLibrary',
  'calendarDayCovers',
  'calendarGradientColors',
  'calendarCellHeight',
  'visibleTabs',
  'tabOrder',
  'tagBlockOrders',
  'tagBlockSize',
  'memoTabSettings',
  'galleryCardSize',
  'galleryHideTitle',
  'galleryHideCover',
  'exportImageOptions',
  'detailPanelWidth',
  'propertyRemoteLayout',
  'fullViewLayout'
]

/** 슬롯 전환 시에도 유지 — 작품 목록(데이터·필터·정렬·검색) */
export const SHARED_CATALOG_KEYS = [
  'records',
  'tags',
  'filterTagIds',
  'sortBy',
  'sortDir',
  'searchQuery'
]

export function getActivePresetSlot(settings) {
  return settings?.activePresetSlot ?? settings?.selectedPresetSlot ?? 0
}

export function extractPresetUi(uiState) {
  return {
    activeTab: uiState.activeTab ?? 'gallery',
    filterTagIds: uiState.filterTagIds || [],
    sortBy: uiState.sortBy || 'readDate',
    sortDir: uiState.sortDir || 'desc',
    searchQuery: uiState.searchQuery || '',
    selectedRecordId: uiState.selectedRecordId ?? null,
    detailMode: uiState.detailMode ?? null,
    selectedVolume: uiState.selectedVolume ?? null,
    calendarDisplayMonth: uiState.calendarDisplayMonth ?? null,
    detailPropertyCollapsed: uiState.detailPropertyCollapsed ?? false
  }
}

export function extractPresetData(settings, uiState) {
  const settingsPart = PRESET_SETTING_FIELDS.reduce((acc, key) => {
    acc[key] = settings[key]
    return acc
  }, {})
  return sanitizePresetPayload({
    settings: settingsPart,
    ui: extractPresetUi(uiState)
  })
}

function stripWorkData(value) {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value
  const { records, tags, ...rest } = value
  void records
  void tags
  return rest
}

export function sanitizePresetPayload(presetData) {
  if (!presetData || typeof presetData !== 'object') return null

  const payload = presetData.settings
    ? presetData
    : { settings: presetData, ui: presetData.ui || {} }

  const settings = stripWorkData(payload.settings || {})
  const ui = stripWorkData(payload.ui || {})

  if (!Object.keys(settings).length && !Object.keys(ui).length) {
    return null
  }

  return { settings, ui }
}

export function isPresetFilled(preset) {
  return Boolean(sanitizePresetPayload(preset?.data))
}

export function sanitizeAllPresets(settings) {
  const presets = ensurePresets(settings?.presets).map((preset) => {
    const clean = sanitizePresetPayload(preset?.data)
    if (!clean) {
      return { ...preset, data: null }
    }
    return { ...preset, data: clean }
  })
  return { ...settings, presets }
}

export function applyPresetData(currentSettings, presetData) {
  const normalized = sanitizePresetPayload(presetData)
  if (!normalized?.settings) return currentSettings

  const shared = SHARED_SETTING_FIELDS.reduce((acc, key) => {
    if (key in currentSettings) acc[key] = currentSettings[key]
    return acc
  }, {})

  const presetPart = PRESET_SETTING_FIELDS.reduce((acc, key) => {
    if (key in normalized.settings) {
      acc[key] = normalized.settings[key]
    } else if (key in DEFAULT_SETTINGS) {
      acc[key] = DEFAULT_SETTINGS[key]
    }
    return acc
  }, {})

  return { ...currentSettings, ...presetPart, ...shared }
}

export function applyPresetUiState(ui = {}, records = []) {
  const selectedRecordId = ui.selectedRecordId ?? null
  const hasSelection =
    Boolean(selectedRecordId) && records.some((record) => record.id === selectedRecordId)
  return {
    activeTab: ui.activeTab ?? 'gallery',
    filterTagIds: Array.isArray(ui.filterTagIds) ? [...ui.filterTagIds] : [],
    sortBy: ui.sortBy ?? 'readDate',
    sortDir: ui.sortDir ?? 'desc',
    searchQuery: ui.searchQuery ?? '',
    selectedRecordId: hasSelection ? selectedRecordId : null,
    detailMode: hasSelection ? (ui.detailMode ?? null) : null,
    selectedVolume: hasSelection ? (ui.selectedVolume ?? null) : null,
    calendarDisplayMonth: ui.calendarDisplayMonth ?? null,
    detailPropertyCollapsed: ui.detailPropertyCollapsed ?? false,
    recordViewPage: 0,
    recordSelectedIds: [],
    recordEditMode: false
  }
}

export function pickSharedCatalog(state) {
  return SHARED_CATALOG_KEYS.reduce((acc, key) => {
    if (key in state) acc[key] = state[key]
    return acc
  }, {})
}

export const EMPTY_PRESETS = [
  { name: '', data: null },
  { name: '', data: null },
  { name: '', data: null },
  { name: '', data: null }
]

export function ensurePresets(presets) {
  const next = [...(presets?.length ? presets : EMPTY_PRESETS)]
  while (next.length < 4) {
    next.push({ name: '', data: null })
  }
  return next.slice(0, 4)
}

export function resolveActivePresetState(settings, slot) {
  const sanitizedSettings = sanitizeAllPresets(settings)
  const presets = ensurePresets(sanitizedSettings.presets)
  const preset = presets[slot]
  const data = sanitizePresetPayload(preset?.data)

  if (!data) {
    return {
      settings: {
        ...sanitizedSettings,
        presets,
        activePresetSlot: slot,
        selectedPresetSlot: slot
      },
      ui: null
    }
  }

  return {
    settings: {
      ...applyPresetData({ ...sanitizedSettings, presets }, data),
      activePresetSlot: slot,
      selectedPresetSlot: slot
    },
    ui: data.ui
  }
}
