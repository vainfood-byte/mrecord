import { createContext, useContext, useEffect, useReducer, useRef, useMemo, useCallback, useState, startTransition, useDeferredValue } from 'react'
import {
  DEFAULT_SETTINGS,
  DEFAULT_TAGS,
  DEFAULT_PROPERTY_FIELDS,
  DEFAULT_VISIBLE_TABS,
  buildDefaultTabOrder,
  applyTheme
} from '../data/defaults'
import { migrateSettings, mergeTags, getVisibleTabs, isCoreTab } from '../utils/tabHelpers'
import { SAMPLE_RECORDS } from '../data/sampleRecords'
import { createEmptyRecord, createRecordFromSource, recordDraftFingerprint } from '../utils/recordHelpers'
import { saveData, buildDefaultAppState, buildEmptyPersistedData, buildPersistedData, flushAllPersistedData, flushPendingSaves, loadBestPersistedData, schedulePersistedData, commitPersistedData } from '../utils/storage'
import { applyPresetUiState, extractPresetData, EMPTY_PRESETS, ensurePresets, getActivePresetSlot, resolveActivePresetState, sanitizeAllPresets } from '../utils/presets'
import { reorderStickers } from '../utils/stickerHelpers'
import { pushPetitStickerLibrary } from '../utils/calendarHelpers'
import { buildRecordListIndex, filterRecordsOnly, sortRecordsList } from '../utils/recordFilters'
import { remapTagsToCustomPalette, remapRecordsCoverToCustomPalette } from '../utils/tagColorHelpers'
import {
  migrateBase64RecordCovers,
  ensureMissingCoverThumbnails,
  isBase64CoverUrl
} from '../utils/coverImageHelpers'
import {
  HEAVY_RECORD_FIELDS,
  getRecordHeavy,
  hydrateRecord,
  ingestRecordHeavy,
  ingestRecordsHeavy,
  isHeavyRecordField,
  removeRecordHeavy,
  removeRecordsHeavy,
  syncRecordHeavyFromPayload,
  toListRecord
} from '../utils/recordHeavyStore'

function uiSnapshot(state) {
  return {
    activeTab: state.activeTab,
    filterTagIds: state.filterTagIds,
    sortBy: state.sortBy,
    sortDir: state.sortDir,
    searchQuery: state.searchQuery,
    selectedRecordId: state.selectedRecordId,
    detailMode: state.detailMode,
    selectedVolume: state.selectedVolume,
    calendarDisplayMonth: state.calendarDisplayMonth,
    detailPropertyCollapsed: state.detailPropertyCollapsed
  }
}

function stateWithPresetUiSync(state, patch) {
  const next = { ...state, ...patch }
  return {
    ...next,
    settings: syncPresetSlot(next.settings, uiSnapshot(next))
  }
}

function recordsDiffIsReviewOnly(prevRecords, nextRecords) {
  if (prevRecords === nextRecords) return false
  if (!prevRecords || !nextRecords || prevRecords.length !== nextRecords.length) return false
  let sawReviewChange = false
  for (let i = 0; i < prevRecords.length; i++) {
    const a = prevRecords[i]
    const b = nextRecords[i]
    if (a === b) continue
    if (a.id !== b.id) return false
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (isHeavyRecordField(key) || key === '__heavyRev') continue
      if (a[key] !== b[key]) return false
    }
    if (
      (a.__heavyRev || 0) !== (b.__heavyRev || 0) ||
      a.review !== b.review ||
      a.reviewSubtitle !== b.reviewSubtitle ||
      a.reviewImages !== b.reviewImages ||
      a.volumeReviews !== b.volumeReviews
    ) {
      sawReviewChange = true
    } else {
      return false
    }
  }
  return sawReviewChange
}

/** UPDATE 시 heavy 스토어 동기화 + 목록용 레코드 생성 */
function commitRecordToListState(prevListRecord, payload) {
  const prevHeavy = payload?.id ? getRecordHeavy(payload.id) : null
  const nextHeavy = payload?.id ? syncRecordHeavyFromPayload(payload.id, payload) : null
  const list = toListRecord(payload)
  const heavyTouched =
    Boolean(payload?.id) &&
    HEAVY_RECORD_FIELDS.some((key) => key in payload) &&
    prevHeavy !== nextHeavy
  const heavyRev = heavyTouched
    ? (prevListRecord?.__heavyRev || 0) + 1
    : prevListRecord?.__heavyRev || 0
  return heavyRev ? { ...list, __heavyRev: heavyRev } : list
}

function isSelectedRecordMissing(state, nextRecords) {
  return (
    Boolean(state.selectedRecordId) &&
    !nextRecords.some((r) => r.id === state.selectedRecordId)
  )
}

function detailClearPatch() {
  return {
    selectedRecordId: null,
    selectedVolume: null,
    detailMode: null,
    detailDraftSnapshot: null,
    detailIsDraft: false,
    detailEditTitle: false,
    detailTitleEdited: false,
    detailSkipSlideIn: false,
    activePropertyMenu: null,
    focusPropertyFieldId: null,
    propertyRemoteOpen: false
  }
}

function syncPresetSlot(settings, uiState) {
  const slot = getActivePresetSlot(settings)
  const presets = ensurePresets(settings.presets)
  presets[slot] = {
    ...presets[slot],
    name: presets[slot]?.name || `${slot + 1}번`,
    data: extractPresetData(settings, uiState)
  }
  return {
    ...settings,
    presets,
    activePresetSlot: slot,
    selectedPresetSlot: slot
  }
}

function settingsWithPresetSync(state, settings) {
  return syncPresetSlot(settings, uiSnapshot(state))
}

function finishPresetSwitch(state, resolved) {
  const uiPatch = resolved.ui ? applyPresetUiState(resolved.ui, state.records) : {}
  return {
    ...state,
    ...uiPatch,
    records: state.records,
    tags: state.tags,
    settings: resolved.settings,
    // 프리셋 전환 시 이전 슬롯 스티커 선택/메뉴 잔상 제거 (저장 포맷 무관)
    selectedStickerId: null,
    stickerContextMenu: null
  }
}

const AppContext = createContext(null)

const initialState = {
  records: SAMPLE_RECORDS,
  tags: DEFAULT_TAGS,
  settings: DEFAULT_SETTINGS,
  activeTab: 'gallery',
  selectedRecordId: null,
  selectedVolume: null,
  detailMode: null,
  settingsOpen: false,
  sortBy: 'readDate',
  sortDir: 'desc',
  filterTagIds: [],
  searchQuery: '',
  detailPropertyCollapsed: false,
  detailPropertyEditMode: false,
  mainBarEditMode: false,
  activePropertyMenu: null,
  traceAddOpen: false,
  traceEditId: null,
  decorateMode: false,
  selectedStickerId: null,
  stickerContextMenu: null,
  detailDraftSnapshot: null,
  detailIsDraft: false,
  detailEditTitle: false,
  detailTitleEdited: false,
  detailSkipSlideIn: false,
  calendarDisplayMonth: null,
  focusPropertyFieldId: null,
  recordSelectedIds: [],
  recordEditMode: false,
  recordViewPage: 0,
  propertyRemoteOpen: false,
  exportInProgress: false,
  exportProgress: null,
  exportRecordSlice: null,
  /** INIT/RESET 시 이스터에그 UI 리셋용 (저장하지 않음) */
  easterEggResetEpoch: 0
}

/** 누락 필드만 채우고, 이미 완전한 레코드는 JSON parse 객체를 그대로 재사용 */
function normalizeLoadedRecord(r) {
  if (!r || typeof r !== 'object') return r
  const needsSeries = r.series == null
  const needsReviewImages = r.reviewImages == null
  const needsVolumeReviews = r.volumeReviews == null
  const needsReviewSubtitle = r.reviewSubtitle == null
  const needsCustomFields = r.customFields == null
  const needsTagFieldValues = r.tagFieldValues == null
  if (
    !needsSeries &&
    !needsReviewImages &&
    !needsVolumeReviews &&
    !needsReviewSubtitle &&
    !needsCustomFields &&
    !needsTagFieldValues
  ) {
    return r
  }
  return {
    ...(needsSeries ? { series: { enabled: false, unit: '권', volumes: [1] } } : null),
    ...(needsReviewImages ? { reviewImages: [] } : null),
    ...(needsVolumeReviews ? { volumeReviews: {} } : null),
    ...(needsReviewSubtitle ? { reviewSubtitle: '' } : null),
    ...(needsCustomFields ? { customFields: {} } : null),
    ...(needsTagFieldValues ? { tagFieldValues: {} } : null),
    ...r
  }
}

export function buildInitPayload(saved) {
  const session = saved.session || {}
  const lock = {
    ...DEFAULT_SETTINGS.lockSettings,
    ...saved.settings?.lockSettings
  }
  const rawRecords = saved.records ?? SAMPLE_RECORDS
  const normalized = rawRecords.map((r) => normalizeLoadedRecord(r))
  /* 고용량 감상 필드는 스토어로 분리 — React 목록 state는 경량 레코드만 유지 */
  const records = ingestRecordsHeavy(normalized, { replace: true })
  const selectedId = session.selectedRecordId
  const hasSelection = selectedId && records.some((r) => r.id === selectedId)
  const { lockSettings: _ignoredLock, ...savedSettingsRest } = saved.settings || {}
  void _ignoredLock
  return {
    records,
    tags: mergeTags(saved.tags ?? [], DEFAULT_TAGS),
    settings: {
      ...savedSettingsRest,
      lockSettings: lock.lockOnStartup ? { ...lock, enabled: true } : lock
    },
    activeTab: session.activeTab ?? 'gallery',
    selectedRecordId: hasSelection ? selectedId : null,
    selectedVolume: hasSelection ? (session.selectedVolume ?? null) : null,
    detailMode: hasSelection ? (session.detailMode ?? null) : null,
    filterTagIds: session.filterTagIds ?? [],
    sortBy: session.sortBy ?? 'readDate',
    sortDir: session.sortDir ?? 'desc',
    searchQuery: session.searchQuery ?? '',
    detailPropertyCollapsed: session.detailPropertyCollapsed ?? false,
    calendarDisplayMonth: session.calendarDisplayMonth ?? null
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'INIT': {
      const merged = {
        ...DEFAULT_SETTINGS,
        ...action.payload?.settings,
        propertyFields:
          action.payload?.settings?.propertyFields ?? DEFAULT_PROPERTY_FIELDS,
        visibleTabs:
          action.payload?.settings?.visibleTabs ?? DEFAULT_VISIBLE_TABS,
        tabOrder:
          action.payload?.settings?.tabOrder ?? buildDefaultTabOrder(),
        traceWidgets: (() => {
          const saved = action.payload?.settings?.traceWidgets
          const list = saved?.length ? saved : DEFAULT_SETTINGS.traceWidgets
          return list.filter((w) => w.type !== 'cover')
        })(),
        presets: action.payload?.settings?.presets ?? EMPTY_PRESETS,
        selectedPresetSlot: action.payload?.settings?.selectedPresetSlot ?? 0,
        activePresetSlot: action.payload?.settings?.activePresetSlot ?? 0,
        lockSettings: {
          ...DEFAULT_SETTINGS.lockSettings,
          ...action.payload?.settings?.lockSettings
        },
        easterEgg100Dismissed: action.payload?.preserveEasterEggDismissed
          ? state.settings.easterEgg100Dismissed
          : (action.payload?.settings?.easterEgg100Dismissed ??
            DEFAULT_SETTINGS.easterEgg100Dismissed)
      }
      const settings = migrateSettings(sanitizeAllPresets(merged))
      const customPalette = settings.tagCustomPalette
      let tags = action.payload?.tags ?? []
      let records = action.payload?.records ?? state.records
      if (settings.tagCustomColorOnly) {
        tags = remapTagsToCustomPalette(tags, customPalette)
        records = remapRecordsCoverToCustomPalette(records, customPalette)
      }
      const activeSlot = getActivePresetSlot(settings)
      const resolved = resolveActivePresetState(settings, activeSlot)
      const uiFromPreset = resolved.ui ? applyPresetUiState(resolved.ui, records) : {}
      return {
        ...state,
        ...action.payload,
        ...uiFromPreset,
        records,
        tags,
        settings: resolved.settings,
        easterEggResetEpoch: state.easterEggResetEpoch + 1,
        exportInProgress: false,
        exportProgress: null,
        exportRecordSlice: null
      }
    }
    case 'SET_TAB':
      return stateWithPresetUiSync(state, {
        activeTab: action.payload,
        recordSelectedIds: action.payload === 'record' ? state.recordSelectedIds : [],
        recordEditMode: action.payload === 'record' ? state.recordEditMode : false
      })
    case 'SET_CALENDAR_DISPLAY_MONTH':
      return stateWithPresetUiSync(state, { calendarDisplayMonth: action.payload })
    case 'SELECT_RECORD': {
      const payload = action.payload
      const id = payload?.id ?? payload
      const hasRecord = Boolean(id)
      // 사이드/전체 보기 중 다른 작품 선택 → 패널 유지·내용만 교체
      const keepDetailMode =
        hasRecord && (state.detailMode === 'side' || state.detailMode === 'full')
          ? state.detailMode
          : hasRecord
            ? 'side'
            : null
      return {
        ...state,
        selectedRecordId: id,
        selectedVolume: payload?.volume ?? null,
        detailMode: keepDetailMode,
        detailDraftSnapshot: null,
        detailIsDraft: false,
        detailEditTitle: Boolean(payload?.editTitle),
        detailTitleEdited: false,
        detailSkipSlideIn: state.detailMode === 'side' && hasRecord,
        focusPropertyFieldId: hasRecord ? (payload?.focusPropertyFieldId ?? null) : null,
        detailPropertyCollapsed: payload?.focusPropertyFieldId
          ? false
          : state.detailPropertyCollapsed
      }
    }
    case 'CLEAR_FOCUS_PROPERTY':
      return { ...state, focusPropertyFieldId: null }
    case 'SET_DETAIL_MODE':
      return { ...state, detailMode: action.payload }
    case 'CLOSE_DETAIL':
      return {
        ...state,
        selectedRecordId: null,
        selectedVolume: null,
        detailMode: null,
        activePropertyMenu: null,
        detailDraftSnapshot: null,
        detailIsDraft: false,
        detailEditTitle: false,
        detailTitleEdited: false,
        detailSkipSlideIn: false,
        focusPropertyFieldId: null
      }
    case 'DISMISS_DETAIL': {
      const id = state.selectedRecordId
      const record = hydrateRecord(state.records.find((r) => r.id === id))
      const unchanged =
        state.detailIsDraft &&
        !state.detailTitleEdited &&
        record &&
        state.detailDraftSnapshot === recordDraftFingerprint(record)
      if (unchanged && id) removeRecordHeavy(id)
      return {
        ...state,
        records: unchanged ? state.records.filter((r) => r.id !== id) : state.records,
        selectedRecordId: null,
        selectedVolume: null,
        detailMode: null,
        activePropertyMenu: null,
        detailDraftSnapshot: null,
        detailIsDraft: false,
        detailEditTitle: false,
        detailTitleEdited: false,
        detailSkipSlideIn: false,
        focusPropertyFieldId: null
      }
    }
    case 'MARK_DETAIL_TITLE_EDITED':
      return { ...state, detailTitleEdited: true, detailEditTitle: false }
    case 'CLEAR_DETAIL_EDIT_TITLE':
      return { ...state, detailEditTitle: false }
    case 'CLEAR_DETAIL_SKIP_SLIDE':
      return { ...state, detailSkipSlideIn: false }
    case 'SET_VOLUME':
      return { ...state, selectedVolume: action.payload }
    case 'TOGGLE_SETTINGS':
      return { ...state, settingsOpen: !state.settingsOpen }
    case 'UPDATE_SETTINGS': {
      let newSettings = { ...state.settings, ...action.payload }
      if (action.payload.lockSettings) {
        newSettings.lockSettings = {
          ...state.settings.lockSettings,
          ...action.payload.lockSettings
        }
      }
      const uiState = uiSnapshot(state)
      if (!('presets' in action.payload) && !('selectedPresetSlot' in action.payload)) {
        newSettings = syncPresetSlot(newSettings, uiState)
      }

      const customOnly = newSettings.tagCustomColorOnly === true
      const enablingCustomOnly = customOnly && !state.settings.tagCustomColorOnly
      const paletteChanged = customOnly && 'tagCustomPalette' in action.payload
      const shouldRemap = enablingCustomOnly || paletteChanged
      const customPalette = newSettings.tagCustomPalette
      const tags = shouldRemap
        ? remapTagsToCustomPalette(state.tags, customPalette)
        : state.tags
      const records = shouldRemap
        ? remapRecordsCoverToCustomPalette(state.records, customPalette)
        : state.records

      return {
        ...state,
        settings: newSettings,
        tags,
        records,
        recordViewPage: 'pagedView' in action.payload ? 0 : state.recordViewPage
      }
    }
    case 'SET_RECORD_VIEW_PAGE':
      return {
        ...state,
        recordViewPage: Math.max(0, Number(action.payload) || 0)
      }
    case 'SET_SORT': {
      const { key, toggle } = action.payload
      if (toggle && state.sortBy === key) {
        return stateWithPresetUiSync(state, {
          sortDir: state.sortDir === 'asc' ? 'desc' : 'asc',
          recordViewPage: 0
        })
      }
      const defaultDir = key === 'alpha' ? 'asc' : 'desc'
      return stateWithPresetUiSync(state, { sortBy: key, sortDir: defaultDir, recordViewPage: 0 })
    }
    case 'SET_FILTER_TAGS':
      return stateWithPresetUiSync(state, { filterTagIds: action.payload, recordViewPage: 0 })
    case 'SET_SEARCH':
      return stateWithPresetUiSync(state, { searchQuery: action.payload, recordViewPage: 0 })
    case 'TOGGLE_DETAIL_PROPERTY_COLLAPSE':
      return stateWithPresetUiSync(state, {
        detailPropertyCollapsed: !state.detailPropertyCollapsed
      })
    case 'TOGGLE_DETAIL_PROPERTY_EDIT':
      return {
        ...state,
        detailPropertyEditMode: !state.detailPropertyEditMode,
        activePropertyMenu: null
      }
    case 'TOGGLE_MAIN_BAR_EDIT':
      return { ...state, mainBarEditMode: !state.mainBarEditMode }
    case 'TOGGLE_TAB_VISIBILITY': {
      const visible = state.settings.visibleTabs || []
      const id = action.payload
      const next = visible.includes(id)
        ? visible.filter((t) => t !== id)
        : [...visible, id]
      return {
        ...state,
        settings: settingsWithPresetSync(state, {
          ...state.settings,
          visibleTabs: next.length ? next : [id]
        })
      }
    }
    case 'TOGGLE_TRACE_BOX':
      return {
        ...state,
        settings: settingsWithPresetSync(state, {
          ...state.settings,
          traceBoxCollapsed: !state.settings.traceBoxCollapsed
        })
      }
    case 'SET_TRACE_ADD_OPEN':
      return { ...state, traceAddOpen: action.payload }
    case 'ADD_TRACE_WIDGET':
      return {
        ...state,
        settings: settingsWithPresetSync(state, {
          ...state.settings,
          traceWidgets: [...(state.settings.traceWidgets || []), action.payload]
        }),
        traceAddOpen: false
      }
    case 'UPDATE_TRACE_WIDGET':
      return {
        ...state,
        settings: settingsWithPresetSync(state, {
          ...state.settings,
          traceWidgets: state.settings.traceWidgets.map((w) =>
            w.id === action.payload.id ? { ...w, ...action.payload.data } : w
          )
        })
      }
    case 'DELETE_TRACE_WIDGET':
      return {
        ...state,
        settings: settingsWithPresetSync(state, {
          ...state.settings,
          traceWidgets: state.settings.traceWidgets.filter((w) => w.id !== action.payload)
        })
      }
    case 'REORDER_TRACE_WIDGETS': {
      const { from, to, id, toId } = action.payload
      const widgets = [...(state.settings.traceWidgets || [])]
      let fromIdx = from
      let toIdx = to
      if (id != null && toId != null) {
        fromIdx = widgets.findIndex((w) => w.id === id)
        toIdx = widgets.findIndex((w) => w.id === toId)
      }
      if (fromIdx == null || toIdx == null || fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) {
        return state
      }
      const [moved] = widgets.splice(fromIdx, 1)
      widgets.splice(toIdx, 0, moved)
      return {
        ...state,
        settings: settingsWithPresetSync(state, {
          ...state.settings,
          traceWidgets: widgets
        })
      }
    }
    case 'SET_PROPERTY_MENU':
      return { ...state, activePropertyMenu: action.payload }
    case 'REORDER_PROPERTIES': {
      const fields = [...state.settings.propertyFields]
      const from =
        action.payload.fromId != null
          ? fields.findIndex((f) => f.id === action.payload.fromId)
          : action.payload.from
      const to =
        action.payload.toId != null
          ? fields.findIndex((f) => f.id === action.payload.toId)
          : action.payload.to
      if (from < 0 || to < 0 || from === to) return state
      const [moved] = fields.splice(from, 1)
      fields.splice(to, 0, moved)
      const coreIds = ['record', 'gallery', 'calendar']
      const tabOrder = [
        ...coreIds.filter((id) => (state.settings.tabOrder || []).includes(id)),
        ...fields.map((f) => f.id)
      ]
      return {
        ...state,
        settings: settingsWithPresetSync(state, {
          ...state.settings,
          propertyFields: fields,
          tabOrder
        })
      }
    }
    case 'UPDATE_PROPERTY_FIELD': {
      const fields = state.settings.propertyFields.map((f) =>
        f.id === action.payload.id ? { ...f, ...action.payload.data } : f
      )
      return { ...state, settings: { ...state.settings, propertyFields: fields } }
    }
    case 'DELETE_PROPERTY_FIELD': {
      const id = action.payload
      const nextTab =
        state.activeTab === id ? 'gallery' : state.activeTab
      return {
        ...state,
        activeTab: nextTab,
        settings: {
          ...state.settings,
          propertyFields: state.settings.propertyFields.filter((f) => f.id !== id),
          visibleTabs: (state.settings.visibleTabs || []).filter((t) => t !== id),
          tabOrder: (state.settings.tabOrder || []).filter((t) => t !== id)
        },
        activePropertyMenu: null
      }
    }
    case 'ADD_PROPERTY_FIELD': {
      const field = { exportVisible: true, dateFormat: 'full', ...action.payload }
      const tabOrder = [...(state.settings.tabOrder || [])]
      if (!tabOrder.includes(field.id)) tabOrder.push(field.id)
      const visibleTabs = [...(state.settings.visibleTabs || [])]
      if (!visibleTabs.includes(field.id)) visibleTabs.push(field.id)
      return {
        ...state,
        settings: {
          ...state.settings,
          propertyFields: [...state.settings.propertyFields, field],
          tabOrder,
          visibleTabs
        }
      }
    }
    case 'SET_PANEL_WIDTH':
      return {
        ...state,
        settings: { ...state.settings, detailPanelWidth: action.payload }
      }
    case 'ADD_TAG':
      return { ...state, tags: [...state.tags, action.payload] }
    case 'UPDATE_TAG': {
      const nextTag = action.payload
      const prevTag = state.tags.find((t) => t.id === nextTag.id)
      const nameChanged = Boolean(prevTag && prevTag.name !== nextTag.name && nextTag.name != null)
      const tagKey = `tag-${nextTag.id}`
      return {
        ...state,
        tags: state.tags.map((t) => (t.id === nextTag.id ? nextTag : t)),
        records: nameChanged
          ? state.records.map((r) => {
              const tfv = r.tagFieldValues
              if (!tfv || typeof tfv !== 'object') return r
              let changed = false
              const nextTfv = { ...tfv }
              for (const fieldId of Object.keys(tfv)) {
                const fieldVals = tfv[fieldId]
                if (!fieldVals || typeof fieldVals !== 'object' || !fieldVals[tagKey]) continue
                nextTfv[fieldId] = {
                  ...fieldVals,
                  [tagKey]: { ...fieldVals[tagKey], text: nextTag.name }
                }
                changed = true
              }
              return changed ? { ...r, tagFieldValues: nextTfv } : r
            })
          : state.records
      }
    }
    case 'DELETE_TAG': {
      const tagId = action.payload
      return {
        ...state,
        tags: state.tags.filter((t) => t.id !== tagId),
        records: state.records.map((r) => ({
          ...r,
          tagIds: (r.tagIds || []).filter((id) => id !== tagId)
        }))
      }
    }
    case 'ADD_RECORD': {
      const listRec = ingestRecordHeavy(action.payload)
      return { ...state, records: [listRec, ...state.records] }
    }
    case 'CREATE_NEW_RECORD': {
      const { autoEditTitle = true, cloneFrom, cloneFromId, ...patch } = action.payload || {}
      let records = state.records
      const currentId = state.selectedRecordId
      if (state.detailIsDraft && !state.detailTitleEdited && currentId) {
        const draft = hydrateRecord(records.find((r) => r.id === currentId))
        if (draft && state.detailDraftSnapshot === recordDraftFingerprint(draft)) {
          removeRecordHeavy(currentId)
          records = records.filter((r) => r.id !== currentId)
        }
      }
      const sourceId =
        cloneFrom === false ? null : cloneFromId ?? state.selectedRecordId
      const source = sourceId ? hydrateRecord(records.find((r) => r.id === sourceId)) : null
      const rec = source
        ? createRecordFromSource(source, patch, state.settings)
        : { ...createEmptyRecord(state.settings), ...patch }
      const listRec = ingestRecordHeavy(rec)
      return {
        ...state,
        records: [listRec, ...records],
        selectedRecordId: rec.id,
        selectedVolume: null,
        detailMode: 'side',
        detailDraftSnapshot: recordDraftFingerprint(hydrateRecord(listRec)),
        detailIsDraft: true,
        detailEditTitle: Boolean(autoEditTitle),
        detailTitleEdited: false,
        detailSkipSlideIn: state.detailMode === 'side'
      }
    }
    case 'UPDATE_RECORD': {
      const payload = action.payload
      if (!payload?.id) return state
      const prev = state.records.find((r) => r.id === payload.id)
      const listRec = commitRecordToListState(prev, payload)
      return {
        ...state,
        records: state.records.map((r) => (r.id === payload.id ? listRec : r))
      }
    }
    /* 백그라운드 썸네일 마이그레이션 — thumbnailUrl만 병합 (다른 편집 보존) */
    case 'MERGE_RECORD_THUMBNAILS': {
      const byId = action.payload
      if (!byId || typeof byId !== 'object') return state
      let changed = false
      const records = state.records.map((r) => {
        const thumb = byId[r.id]
        if (typeof thumb !== 'string' || !thumb || r.thumbnailUrl === thumb) return r
        changed = true
        return { ...r, thumbnailUrl: thumb }
      })
      return changed ? { ...state, records } : state
    }
    case 'DELETE_RECORD': {
      const id = action.payload
      removeRecordHeavy(id)
      const nextRecords = state.records.filter((r) => r.id !== id)
      const clearDetail = isSelectedRecordMissing(state, nextRecords)
      return {
        ...state,
        records: nextRecords,
        ...(clearDetail ? detailClearPatch() : {}),
        recordSelectedIds: state.recordSelectedIds.filter((rid) => rid !== id),
        recordEditMode: false
      }
    }
    case 'DELETE_RECORDS': {
      const ids = new Set(action.payload || [])
      removeRecordsHeavy(ids)
      const nextRecords = state.records.filter((r) => !ids.has(r.id))
      const clearDetail = isSelectedRecordMissing(state, nextRecords)
      return {
        ...state,
        records: nextRecords,
        ...(clearDetail ? detailClearPatch() : {}),
        recordSelectedIds: [],
        recordEditMode: false,
        activePropertyMenu: null,
        focusPropertyFieldId: null,
        propertyRemoteOpen: false
      }
    }
    case 'TOGGLE_RECORD_SELECT': {
      const id = action.payload
      const set = new Set(state.recordSelectedIds)
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return { ...state, recordSelectedIds: [...set] }
    }
    case 'SET_RECORD_SELECT_ALL':
      return { ...state, recordSelectedIds: action.payload || [] }
    case 'CLEAR_RECORD_SELECT':
      return { ...state, recordSelectedIds: [] }
    case 'SET_RECORD_EDIT_MODE':
      return {
        ...state,
        recordEditMode: Boolean(action.payload),
        recordSelectedIds: action.payload ? state.recordSelectedIds : []
      }
    case 'SET_EXPORT_IN_PROGRESS':
      return { ...state, exportInProgress: Boolean(action.payload) }
    case 'SET_EXPORT_RECORD_SLICE':
      return { ...state, exportRecordSlice: action.payload ?? null }
    case 'SET_EXPORT_PROGRESS':
      return { ...state, exportProgress: action.payload ?? null }
    case 'SET_TRACE_EDIT':
      return { ...state, traceEditId: action.payload }
    case 'LOAD_PRESET': {
      const slot = action.payload
      const uiState = uiSnapshot(state)
      let settings = state.settings
      const currentSlot = getActivePresetSlot(settings)
      if (currentSlot !== slot) {
        settings = syncPresetSlot(settings, uiState)
      }
      return finishPresetSwitch(state, resolveActivePresetState(settings, slot))
    }
    case 'SAVE_PRESET': {
      const { slot, name } = action.payload
      const presets = [...(state.settings.presets || EMPTY_PRESETS)]
      presets[slot] = {
        name: name || presets[slot]?.name || `${slot + 1}번`,
        data: extractPresetData(state.settings, uiSnapshot(state))
      }
      return {
        ...state,
        settings: {
          ...state.settings,
          presets,
          activePresetSlot: slot,
          selectedPresetSlot: slot
        }
      }
    }
    case 'ACTIVATE_PRESET_SLOT': {
      const slot = action.payload
      const uiState = uiSnapshot(state)
      let settings = syncPresetSlot(state.settings, uiState)
      const presets = ensurePresets(settings.presets)
      if (!presets[slot]?.data) {
        presets[slot] = {
          name: presets[slot]?.name || `${slot + 1}번`,
          data: extractPresetData(settings, uiState)
        }
        settings = { ...settings, presets }
      }
      return finishPresetSwitch(state, resolveActivePresetState(settings, slot))
    }
    case 'SET_PRESET_SLOT': {
      const newSlot = action.payload
      const oldSlot = getActivePresetSlot(state.settings)
      let settings = state.settings
      if (oldSlot !== newSlot) {
        settings = syncPresetSlot(settings, uiSnapshot(state))
      }
      return {
        ...state,
        settings: {
          ...settings,
          selectedPresetSlot: newSlot,
          activePresetSlot: newSlot
        }
      }
    }
    case 'REORDER_TABS': {
      const order = [...(state.settings.tabOrder || TABS.map((t) => t.id))]
      const [moved] = order.splice(action.payload.from, 1)
      order.splice(action.payload.to, 0, moved)
      return {
        ...state,
        settings: settingsWithPresetSync(state, { ...state.settings, tabOrder: order })
      }
    }
    case 'REORDER_TAG_BLOCKS': {
      const { fieldId, order } = action.payload
      return {
        ...state,
        settings: settingsWithPresetSync(state, {
          ...state.settings,
          tagBlockOrders: {
            ...(state.settings.tagBlockOrders || {}),
            [fieldId]: order
          }
        })
      }
    }
    case 'TOGGLE_DECORATE_MODE':
      return {
        ...state,
        decorateMode: !state.decorateMode,
        selectedStickerId: null,
        stickerContextMenu: null
      }
    case 'SET_SELECTED_STICKER':
      if (state.selectedStickerId === action.payload) return state
      return {
        ...state,
        selectedStickerId: action.payload,
        stickerContextMenu: null
      }
    case 'SET_STICKER_CONTEXT_MENU':
      return { ...state, stickerContextMenu: action.payload }
    case 'ADD_STICKER': {
      const settings = syncPresetSlot(
        {
          ...state.settings,
          stickers: [...(state.settings.stickers || []), action.payload]
        },
        uiSnapshot(state)
      )
      return {
        ...state,
        settings,
        selectedStickerId: action.payload.id,
        decorateMode: true
      }
    }
    case 'UPDATE_STICKER': {
      const { id, data, skipPresetSync } = action.payload
      const nextSettings = {
        ...state.settings,
        stickers: (state.settings.stickers || []).map((s) =>
          s.id === id ? { ...s, ...data } : s
        )
      }
      return {
        ...state,
        settings: skipPresetSync
          ? nextSettings
          : syncPresetSlot(nextSettings, uiSnapshot(state))
      }
    }
    case 'DELETE_STICKER': {
      const settings = syncPresetSlot(
        {
          ...state.settings,
          stickers: (state.settings.stickers || []).filter((s) => s.id !== action.payload)
        },
        uiSnapshot(state)
      )
      return {
        ...state,
        settings,
        selectedStickerId: state.selectedStickerId === action.payload ? null : state.selectedStickerId,
        stickerContextMenu: null
      }
    }
    case 'REORDER_STICKER': {
      const { id, direction } = action.payload
      const settings = syncPresetSlot(
        {
          ...state.settings,
          stickers: reorderStickers(state.settings.stickers || [], id, direction)
        },
        uiSnapshot(state)
      )
      return { ...state, settings }
    }
    case 'ADD_PETIT_STICKER': {
      const lib = pushPetitStickerLibrary(
        state.settings.petitStickerLibrary,
        action.payload.src
      )
      return {
        ...state,
        settings: settingsWithPresetSync(state, {
          ...state.settings,
          calendarPetitStickers: [...(state.settings.calendarPetitStickers || []), action.payload],
          petitStickerLibrary: lib
        })
      }
    }
    case 'UPDATE_PETIT_STICKER': {
      const { id, data } = action.payload
      return {
        ...state,
        settings: settingsWithPresetSync(state, {
          ...state.settings,
          calendarPetitStickers: (state.settings.calendarPetitStickers || []).map((s) =>
            s.id === id ? { ...s, ...data } : s
          )
        })
      }
    }
    case 'DELETE_PETIT_STICKER':
      return {
        ...state,
        settings: settingsWithPresetSync(state, {
          ...state.settings,
          calendarPetitStickers: (state.settings.calendarPetitStickers || []).filter(
            (s) => s.id !== action.payload
          )
        })
      }
    case 'REORDER_PETIT_STICKER': {
      const { id, direction } = action.payload
      return {
        ...state,
        settings: settingsWithPresetSync(state, {
          ...state.settings,
          calendarPetitStickers: reorderStickers(
            state.settings.calendarPetitStickers || [],
            id,
            direction
          )
        })
      }
    }
    case 'SET_CALENDAR_DAY_COVER': {
      const { dateKey, cover } = action.payload
      const covers = { ...(state.settings.calendarDayCovers || {}) }
      if (cover) covers[dateKey] = cover
      else delete covers[dateKey]
      return {
        ...state,
        settings: settingsWithPresetSync(state, {
          ...state.settings,
          calendarDayCovers: covers
        })
      }
    }
    case 'SET_PROPERTY_REMOTE_OPEN':
      return { ...state, propertyRemoteOpen: Boolean(action.payload) }
    case 'UPDATE_PROPERTY_REMOTE_LAYOUT':
      return {
        ...state,
        settings: settingsWithPresetSync(state, {
          ...state.settings,
          propertyRemoteLayout: {
            ...(state.settings.propertyRemoteLayout || {}),
            ...action.payload
          }
        })
      }
    case 'RESET_ALL': {
      const fresh = action.payload ?? buildDefaultAppState()
      const records = ingestRecordsHeavy(fresh.records || [], { replace: true })
      return { ...fresh, records, easterEggResetEpoch: state.easterEggResetEpoch + 1 }
    }
    default:
      return state
  }
}

function createInitialReducerState() {
  return initialState
}

export function AppProvider({ children }) {
  const [bootstrapping, setBootstrapping] = useState(true)
  const bootstrapDoneRef = useRef(false)
  /** 디스크에서 복원했거나, 저장 파일이 없음을 확인한 뒤에만 자동저장 허용 */
  const persistReadyRef = useRef(false)
  const stateRef = useRef(initialState)
  const [state, dispatchBase] = useReducer(
    (current, action) => {
      const next = reducer(current, action)
      stateRef.current = next
      return next
    },
    undefined,
    createInitialReducerState
  )
  stateRef.current = state

  /** 프리셋 전환 중 헤더/설정 UI용 즉시 슬롯 (저장·작품 데이터와 무관) */
  const [uiPresetSlot, setUiPresetSlot] = useState(null)
  const presetSwitchGenRef = useRef(0)

  const dispatch = useCallback((action) => {
    if (action?.type === 'LOAD_PRESET' || action?.type === 'ACTIVATE_PRESET_SLOT') {
      const slot = action.payload
      const gen = ++presetSwitchGenRef.current
      // 1) 테마/CSS 변수 · 슬롯 하이라이트만 즉시 (0ms)
      try {
        const peeked = resolveActivePresetState(stateRef.current.settings, slot)
        applyTheme(peeked.settings)
      } catch {
        /* peek 실패 시에도 전환은 진행 */
      }
      setUiPresetSlot(slot)
      // 2) 스티커·필터·꾸밈 등 무거운 상태 반영은 transition으로 분리
      startTransition(() => {
        if (presetSwitchGenRef.current !== gen) return
        dispatchBase(action)
      })
      return
    }
    dispatchBase(action)
  }, [])

  useEffect(() => {
    if (uiPresetSlot == null) return
    if ((state.settings.activePresetSlot ?? 0) === uiPresetSlot) {
      setUiPresetSlot(null)
    }
  }, [state.settings.activePresetSlot, uiPresetSlot])

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      try {
        const loaded = await loadBestPersistedData()
        if (cancelled) return

        if (loaded?.data) {
          let { data } = loaded
          let coversMigrated = false

          const flushMigratedData = async (nextData, { bumpRevision = true } = {}) => {
            const { __loadSource, ...clean } = nextData
            void __loadSource
            await commitPersistedData(clean, {
              bumpRevision,
              force: true
            })
          }

          /*
           * Base64 → media:// 배치 마이그레이션 (INIT 전)
           * 15개 단위 + rAF/setTimeout 양보로 메인 스레드 멈춤 방지
           * 배치마다 mrecord-data.json 비동기 flush (JSON 내 Base64 제거)
           */
          try {
            const prevRecords = data.records || []
            const needsCoverMigration = prevRecords.some(
              (r) => isBase64CoverUrl(r?.coverUrl) || isBase64CoverUrl(r?.thumbnailUrl)
            )
            if (needsCoverMigration) {
              const migrateSignal = {
                get cancelled() {
                  return cancelled
                }
              }
              const { records, changed } = await migrateBase64RecordCovers(prevRecords, {
                signal: migrateSignal,
                onBatchComplete: async ({ records: batchRecords }) => {
                  if (cancelled) return
                  const partialData = { ...data, records: batchRecords }
                  data = partialData
                  coversMigrated = true
                  try {
                    await flushMigratedData(partialData, { bumpRevision: true })
                  } catch (err) {
                    console.warn('Cover migration batch flush failed:', err)
                  }
                }
              })
              if (changed) {
                data = { ...data, records }
                coversMigrated = true
              }
            }
          } catch (err) {
            console.warn('Cover image migration failed:', err)
          }

          if (cancelled) return

          if (coversMigrated) {
            try {
              await flushMigratedData(data, { bumpRevision: true })
            } catch (err) {
              console.warn('Primary data migration save failed:', err)
            }
          }

          if (cancelled) return

          dispatch({ type: 'INIT', payload: buildInitPayload(data) })

          /* 썸네일 누락분 — UI 차단 없이 백그라운드 생성 후 state 병합(자동 저장) */
          const recordsForThumbs = data.records || []
          void (async () => {
            try {
              const { records: withThumbs, changed: thumbsChanged } =
                await ensureMissingCoverThumbnails(recordsForThumbs)
              if (cancelled || !thumbsChanged) return

              const prevById = new Map()
              for (const prev of recordsForThumbs) {
                if (prev?.id) prevById.set(prev.id, prev)
              }
              const thumbById = {}
              for (const rec of withThumbs) {
                if (rec?.id && typeof rec.thumbnailUrl === 'string' && rec.thumbnailUrl) {
                  const prev = prevById.get(rec.id)
                  if (prev?.thumbnailUrl !== rec.thumbnailUrl) {
                    thumbById[rec.id] = rec.thumbnailUrl
                  }
                }
              }
              if (!Object.keys(thumbById).length) return
              dispatch({ type: 'MERGE_RECORD_THUMBNAILS', payload: thumbById })
            } catch (err) {
              console.warn('Cover thumbnail migration failed:', err)
            }
          })()
        } else {
          /*
           * 주 파일 없음 — 레거시/백업 자동 복구 없이 빈 records로 시작
           * (Documents mrecord-data.json · backups · .bak 무시)
           */
          const empty = buildEmptyPersistedData()
          dispatch({ type: 'INIT', payload: buildInitPayload(empty) })
          try {
            await commitPersistedData(empty, { force: true, bumpRevision: false })
          } catch (err) {
            console.warn('Empty primary data seed failed:', err)
          }
        }
      } catch (err) {
        console.warn('Bootstrap load failed:', err)
      } finally {
        if (!cancelled) {
          persistReadyRef.current = true
          bootstrapDoneRef.current = true
          setBootstrapping(false)
        }
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    applyTheme(state.settings)
  }, [state.settings])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('[data-lock-dialog]')) return
      const ev = new CustomEvent('mrecord:escape', { cancelable: true })
      window.dispatchEvent(ev)
      if (ev.defaultPrevented) return

      if (state.settingsOpen) {
        dispatch({ type: 'TOGGLE_SETTINGS' })
        return
      }
      if (state.traceAddOpen) {
        dispatch({ type: 'SET_TRACE_ADD_OPEN', payload: false })
        return
      }
      if (state.traceEditId) {
        dispatch({ type: 'SET_TRACE_EDIT', payload: null })
        return
      }
      if (state.stickerContextMenu) {
        dispatch({ type: 'SET_STICKER_CONTEXT_MENU', payload: null })
        return
      }
      if (state.detailMode) {
        dispatch({ type: 'DISMISS_DETAIL' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state.settingsOpen, state.traceAddOpen, state.traceEditId, state.stickerContextMenu, state.detailMode])

  const saveTimerRef = useRef(null)
  const latestDataRef = useRef(null)
  const prevRecordsRef = useRef(state.records)
  /** buildPersistedData는 records를 hydrate하므로, 세션-only 갱신 비교용 목록 참조 */
  const persistedListRecordsRef = useRef(null)

  const persistAll = useCallback(async (options = {}) => {
    flushPendingSaves()
    clearTimeout(saveTimerRef.current)
    const data = buildPersistedData(stateRef.current)
    latestDataRef.current = data
    persistedListRecordsRef.current = stateRef.current.records
    await flushAllPersistedData(data, options)
    return data
  }, [])

  useEffect(() => {
    if (state.easterEggResetEpoch > 0) {
      clearTimeout(saveTimerRef.current)
      const data = buildPersistedData(state)
      latestDataRef.current = data
      persistedListRecordsRef.current = state.records
      saveData(data)
    }
  }, [state.easterEggResetEpoch])

  useEffect(() => {
    if (bootstrapping || !bootstrapDoneRef.current || !persistReadyRef.current) return undefined

    const prev = latestDataRef.current
    if (
      prev &&
      persistedListRecordsRef.current === state.records &&
      prev.tags === state.tags &&
      prev.settings === state.settings
    ) {
      latestDataRef.current = {
        ...prev,
        session: {
          ...prev.session,
          activeTab: state.activeTab,
          selectedRecordId: state.selectedRecordId,
          selectedVolume: state.selectedVolume,
          detailMode: state.detailMode,
          filterTagIds: state.filterTagIds,
          sortBy: state.sortBy,
          sortDir: state.sortDir,
          searchQuery: state.searchQuery,
          detailPropertyCollapsed: state.detailPropertyCollapsed,
          calendarDisplayMonth: state.calendarDisplayMonth
        }
      }
    } else {
      latestDataRef.current = buildPersistedData(state)
      persistedListRecordsRef.current = state.records
    }

    const reviewOnlySave = recordsDiffIsReviewOnly(prevRecordsRef.current, state.records)
    prevRecordsRef.current = state.records
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (!bootstrapDoneRef.current || !persistReadyRef.current) return
      const data = buildPersistedData(stateRef.current)
      latestDataRef.current = data
      persistedListRecordsRef.current = stateRef.current.records
      schedulePersistedData(data)
    }, reviewOnlySave ? 2500 : 600)

    return () => clearTimeout(saveTimerRef.current)
  }, [
    bootstrapping,
    state.records,
    state.tags,
    state.settings,
    state.activeTab,
    state.selectedRecordId,
    state.selectedVolume,
    state.detailMode,
    state.filterTagIds,
    state.sortBy,
    state.sortDir,
    state.searchQuery,
    state.detailPropertyCollapsed,
    state.calendarDisplayMonth
  ])

  useEffect(() => {
    const onBeforeUnload = () => {
      if (!bootstrapDoneRef.current) return
      flushPendingSaves()
      const data = buildPersistedData(stateRef.current)
      latestDataRef.current = data
      saveData(data)
      const json = JSON.stringify(data, null, 2)
      void window.mrecord?.savePersistentData?.(json)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    const onPrepareQuit = async () => {
      try {
        await persistAll()
      } catch (err) {
        console.error('Quit save failed:', err)
        const data = buildPersistedData(stateRef.current)
        latestDataRef.current = data
        saveData(data)
        try {
          await flushAllPersistedData(data)
        } catch (flushErr) {
          console.error('Quit fallback save failed:', flushErr)
        }
      } finally {
        window.mrecord?.notifyQuitReady?.()
      }
    }

    const unsubPrepareQuit = window.mrecord?.onPrepareQuit?.(onPrepareQuit)

    return () => {
      unsubPrepareQuit?.()
      clearTimeout(saveTimerRef.current)
      if (!bootstrapDoneRef.current) return
      flushPendingSaves()
      const data = buildPersistedData(stateRef.current)
      latestDataRef.current = data
      saveData(data)
      const json = JSON.stringify(data, null, 2)
      void window.mrecord?.savePersistentData?.(json)
    }
  }, [persistAll])

  /** records 변경 시에만 검색/태그 인덱스 재구축 */
  const recordListIndex = useMemo(
    () => buildRecordListIndex(state.records),
    [state.records]
  )

  /** 입력·필터 UI를 우선하고, 대용량 목록 재계산은 양보 */
  const deferredSearchQuery = useDeferredValue(state.searchQuery)
  const deferredFilterTagIds = useDeferredValue(state.filterTagIds)

  const filteredOnly = useMemo(
    () =>
      filterRecordsOnly(
        state.records,
        deferredFilterTagIds,
        deferredSearchQuery,
        recordListIndex
      ),
    [state.records, deferredFilterTagIds, deferredSearchQuery, recordListIndex]
  )

  const filteredRecords = useMemo(
    () => sortRecordsList(filteredOnly, state.sortBy, state.sortDir),
    [filteredOnly, state.sortBy, state.sortDir]
  )

  const contextValue = useMemo(
    () => ({
      state,
      dispatch,
      filteredRecords,
      persistAll,
      uiPresetSlot: uiPresetSlot ?? state.settings.activePresetSlot ?? 0
    }),
    [state, dispatch, filteredRecords, persistAll, uiPresetSlot]
  )

  if (bootstrapping) {
    return <div className="h-full w-full bg-[var(--color-bg)]" aria-busy="true" aria-label="불러오는 중" />
  }

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

export function useFilteredRecords() {
  const { filteredRecords } = useApp()
  return filteredRecords
}

export function useSelectedRecord() {
  const { state } = useApp()
  const listRec = state.selectedRecordId
    ? state.records.find((r) => r.id === state.selectedRecordId) ?? null
    : null
  const heavy = listRec ? getRecordHeavy(listRec.id) : null
  return useMemo(
    () => (listRec ? hydrateRecord(listRec) : null),
    [listRec, heavy]
  )
}

export function useTagsMap() {
  const { state } = useApp()
  return useMemo(
    () => Object.fromEntries(state.tags.map((t) => [t.id, t])),
    [state.tags]
  )
}

export function useVisibleTabs() {
  const { state } = useApp()
  return getVisibleTabs(state.settings)
}

export { isCoreTab }
