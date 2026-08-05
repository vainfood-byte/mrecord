import {
  DEFAULT_PROPERTY_FIELDS,
  DEFAULT_SETTINGS,
  ensureCustomThemeSlots,
  LEGACY_TAG_CUSTOM_PALETTE,
  normalizeCustomTheme,
  normalizeCustomThemeSlots
} from '../data/defaults'
import { normalizeRecentColors } from './recentColorHelpers'

export const CORE_TABS = [
  { id: 'record', label: '기록' },
  { id: 'gallery', label: '갤러리' },
  { id: 'calendar', label: '캘린더' }
]

export const CORE_TAB_IDS = CORE_TABS.map((t) => t.id)

const LEGACY_TAB_MAP = {
  category: 'genre',
  oneline: null,
  year: null,
  lifebook: null,
  publisher: 'publisher'
}

export function getPropertyTabs(propertyFields = []) {
  return propertyFields
    .filter((f) => f.visible !== false)
    .map((f) => ({ id: f.id, label: f.label, field: f, isProperty: true }))
}

export function getAllTabs(settings) {
  const fields = settings?.propertyFields || DEFAULT_PROPERTY_FIELDS
  return [...CORE_TABS, ...getPropertyTabs(fields)]
}

export function mergePropertyFields(saved = [], defaults = DEFAULT_PROPERTY_FIELDS) {
  const byId = new Map(
    (saved || []).map((f) => [f.id, { ...f, exportVisible: f.exportVisible !== false }])
  )
  const result = []
  const used = new Set()

  // 저장된 propertyFields 순서를 우선 유지 (드래그 정렬 영속화)
  for (const f of saved || []) {
    if (!f?.id || used.has(f.id)) continue
    used.add(f.id)
    const def = defaults.find((d) => d.id === f.id)
    if (def) {
      result.push({ ...def, ...byId.get(f.id) })
    } else {
      result.push({ ...f, exportVisible: f.exportVisible !== false })
    }
  }

  // 기본값에만 있는 필드는 뒤에 추가
  for (const def of defaults) {
    if (used.has(def.id)) continue
    used.add(def.id)
    result.push({ ...def })
  }

  return result
}

export function mergeTags(saved = [], defaults = []) {
  const ids = new Set(saved.map((t) => t.id))
  return [...saved, ...defaults.filter((t) => !ids.has(t.id))]
}

function normalizeTagCustomPalette(saved) {
  const fallback = DEFAULT_SETTINGS.tagCustomPalette
  if (!saved?.length) return fallback
  const sameLegacy =
    saved.length === LEGACY_TAG_CUSTOM_PALETTE.length &&
    saved.every((c, i) => c === LEGACY_TAG_CUSTOM_PALETTE[i])
  if (sameLegacy) return fallback
  return saved.map((c) => c || null)
}

export function migrateSettings(settings) {
  let propertyFields = mergePropertyFields(settings.propertyFields)
  propertyFields = propertyFields.map((f) =>
    f.id === 'finishDate' ? { ...f, label: '연도', type: 'year' } : f
  )
  const fieldIds = propertyFields.map((f) => f.id)
  const validIds = new Set([...CORE_TAB_IDS, ...fieldIds])

  const mapId = (id) => {
    if (LEGACY_TAB_MAP[id] === null) return null
    if (LEGACY_TAB_MAP[id]) return LEGACY_TAB_MAP[id]
    return validIds.has(id) ? id : null
  }

  let visibleTabs = (settings.visibleTabs || DEFAULT_SETTINGS_VISIBLE).map(mapId).filter(Boolean)
  visibleTabs = [...new Set(visibleTabs)]
  if (!visibleTabs.length) visibleTabs = [...CORE_TAB_IDS]

  const isLegacyDefault =
    visibleTabs.length === LEGACY_DEFAULT_VISIBLE.length &&
    LEGACY_DEFAULT_VISIBLE.every((id) => visibleTabs.includes(id))
  if (isLegacyDefault && fieldIds.includes('genre') && !visibleTabs.includes('genre')) {
    visibleTabs.push('genre')
  }

  if (
    fieldIds.includes('oneLine') &&
    !visibleTabs.includes('oneLine') &&
    visibleTabs.includes('record') &&
    visibleTabs.includes('gallery') &&
    visibleTabs.includes('calendar')
  ) {
    const genreIdx = visibleTabs.indexOf('genre')
    if (genreIdx >= 0) {
      visibleTabs.splice(genreIdx, 0, 'oneLine')
    } else {
      const calIdx = visibleTabs.indexOf('calendar')
      visibleTabs.splice(calIdx >= 0 ? calIdx + 1 : visibleTabs.length, 0, 'oneLine')
    }
  }

  let tabOrder = (settings.tabOrder || []).map(mapId).filter(Boolean)
  tabOrder = [...new Set(tabOrder)]
  CORE_TAB_IDS.forEach((id) => {
    if (!tabOrder.includes(id)) tabOrder.unshift(id)
  })
  fieldIds.forEach((id) => {
    if (!tabOrder.includes(id)) tabOrder.push(id)
  })

  return {
    ...settings,
    propertyFields,
    visibleTabs,
    tabOrder,
    tagBlockOrders: settings.tagBlockOrders || {},
    stickers: settings.stickers || [],
    stickerShadowEnabled: settings.stickerShadowEnabled !== false,
    calendarPetitStickers: settings.calendarPetitStickers || [],
    exportImageOptions: (() => {
      const raw =
        settings.exportImageOptions?.titleFontSize ??
        settings.exportImageOptions?.titleSize
      const titleFontSize = raw === 'small' || raw === 'large' ? raw : 'medium'
      return {
        showDate: true,
        showBackgroundImage: true,
        ...(settings.exportImageOptions || {}),
        titleFontSize,
        titleSize: titleFontSize
      }
    })(),
    galleryCardSize: settings.galleryCardSize || 'medium',
    galleryHideTitle: settings.galleryHideTitle === true,
    galleryHideCover: settings.galleryHideCover === true,
    pagedView: settings.pagedView === true,
    tagBlockSize: settings.tagBlockSize || 'large',
    memoTabSettings: settings.memoTabSettings || {},
    fullViewLayout: {
      leftWidth: 288,
      coverHeight: 384,
      reviewHeight: 480,
      reviewPercent: 80,
      ...(settings.fullViewLayout || {})
    },
    confirmBeforeDelete:
      settings.confirmBeforeDelete !== undefined ? settings.confirmBeforeDelete : true,
    confirmBeforeDeleteSeriesVolume:
      settings.confirmBeforeDeleteSeriesVolume !== undefined
        ? settings.confirmBeforeDeleteSeriesVolume
        : true,
    autoStartOnLaunch: settings.autoStartOnLaunch === true,
    desktopShortcut: settings.desktopShortcut === true,
    propertyRemoteLayout: {
      x: 120,
      y: 80,
      width: 360,
      height: 480,
      ...(settings.propertyRemoteLayout || {})
    },
    tagCustomColorOnly: settings.tagCustomColorOnly === true,
    tagCustomPalette: normalizeTagCustomPalette(settings.tagCustomPalette),
    recentPickColors: normalizeRecentColors(settings.recentPickColors),
    customThemeSlots: normalizeCustomThemeSlots(settings.customThemeSlots),
    customTheme: normalizeCustomTheme(settings.customTheme),
    uiStyle: ['default', 'glass', 'retro'].includes(settings.uiStyle)
      ? settings.uiStyle
      : 'default',
    customFont: settings.customFont?.dataUrl
      ? {
          name: String(settings.customFont.name || '사용자 글꼴'),
          dataUrl: settings.customFont.dataUrl,
          ext: settings.customFont.ext || 'ttf'
        }
      : null,
    calendarCellHeight: settings.calendarCellHeight || 80,
    calendarHeightManual: false,
    petitStickerLibrary: settings.petitStickerLibrary || [],
    calendarDayCovers: settings.calendarDayCovers || {},
    calendarGradientColors: settings.calendarGradientColors || {
      custom1: '#ffffff',
      custom2: '#333333'
    },
    traceWidgets: (settings.traceWidgets || []).filter((w) => w.type !== 'cover'),
    lockSettings: {
      ...DEFAULT_SETTINGS.lockSettings,
      ...(settings.lockSettings || {}),
      propertyFieldId: settings.lockSettings?.propertyFieldId || 'grade',
      tagId: settings.lockSettings?.tagId || 'tag-19'
    }
  }
}

const LEGACY_DEFAULT_VISIBLE = ['record', 'gallery', 'calendar']
const DEFAULT_SETTINGS_VISIBLE = ['record', 'gallery', 'calendar', 'oneLine', 'genre']

export function getVisibleTabs(settings) {
  const migrated = migrateSettings(settings)
  const visible = new Set(migrated.visibleTabs || DEFAULT_SETTINGS_VISIBLE)
  const order = migrated.tabOrder || []
  const all = getAllTabs(migrated)
  const ordered = order.map((id) => all.find((t) => t.id === id)).filter(Boolean)
  const rest = all.filter((t) => !order.includes(t.id))
  return [...ordered, ...rest].filter((t) => visible.has(t.id))
}

export function getTabLabel(tabId, settings) {
  const tab = getAllTabs(settings).find((t) => t.id === tabId)
  return tab?.label || tabId
}

export function isCoreTab(tabId) {
  return CORE_TAB_IDS.includes(tabId)
}

export function getPropertyFieldForTab(tabId, settings) {
  return (settings?.propertyFields || []).find((f) => f.id === tabId)
}
