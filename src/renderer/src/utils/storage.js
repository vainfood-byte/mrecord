import { DEFAULT_SETTINGS, DEFAULT_TAGS } from '../data/defaults'
import { SAMPLE_RECORDS } from '../data/sampleRecords'
import { migrateSettings } from './tabHelpers'

/** 구버전 localStorage 전체 저장 키 (마이그레이션용) */
const LEGACY_STORAGE_KEY = 'mrecord-data-v1'
const STORAGE_META_KEY = 'mrecord-data-v1-meta'
const THEME_SNAPSHOT_KEY = 'mrecord-theme-snapshot-v1'

export const FLUSH_PENDING_SAVES_EVENT = 'mrecord:flush-pending-saves'
export const PERSIST_SCHEMA_VERSION = 2

const SAMPLE_RECORD_IDS = new Set(SAMPLE_RECORDS.map((r) => r.id))

/** 디스크 저장 직렬화 — 이전 비동기 저장이 새 데이터를 덮어쓰지 않도록 */
let diskSaveChain = Promise.resolve()
let diskSaveSeq = 0

export function flushPendingSaves() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(FLUSH_PENDING_SAVES_EVENT))
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function readMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_META_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return null
}

function writeMeta(meta) {
  try {
    localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta))
  } catch {
    /* ignore */
  }
}

function writeThemeSnapshot(settings) {
  if (!settings || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      THEME_SNAPSHOT_KEY,
      JSON.stringify({
        themePresetId: settings.themePresetId,
        useCustomTheme: settings.useCustomTheme,
        customTheme: settings.customTheme,
        fontId: settings.fontId,
        fontSize: settings.fontSize,
        uiScale: settings.uiScale
      })
    )
  } catch {
    /* ignore */
  }
}

/** React 마운트 전 테마 복원용 (소량만 localStorage) */
export function loadThemeSnapshot() {
  try {
    const raw = localStorage.getItem(THEME_SNAPSHOT_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  const legacy = loadLegacyLocalStoragePayload()
  return legacy?.settings || null
}

function clearLegacyLocalStoragePayload() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** 구버전: localStorage에 전체 JSON 저장 */
export function loadLegacyLocalStoragePayload() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) {
    console.warn('Failed to load legacy localStorage data:', e)
  }
  return null
}

/** @deprecated 파일 기반 저장으로 대체 — 마이그레이션·테마용 */
export function loadData() {
  return loadLegacyLocalStoragePayload()
}

export function isLikelyDefaultSampleData(data) {
  const records = data?.records
  if (!Array.isArray(records) || !records.length || records.length > SAMPLE_RECORDS.length) {
    return false
  }
  return records.every((r) => r?.id && SAMPLE_RECORD_IDS.has(r.id))
}

/** 저장 시점·용량 비교용 — 작품 수 우선 (샘플 최신 덮어쓰기 방지) */
export function getPersistedSnapshotScore(data) {
  if (!data) return Number.NEGATIVE_INFINITY
  const savedAt = Number(data.savedAt) || 0
  const recordCount = Array.isArray(data.records) ? data.records.length : 0
  const revision = Number(data.persistRevision) || 0
  const samplePenalty = isLikelyDefaultSampleData(data) ? -1e15 : 0
  return samplePenalty + recordCount * 1e12 + savedAt + revision * 1e-6
}

export function isPersistedDataNewer(a, b) {
  return getPersistedSnapshotScore(a) > getPersistedSnapshotScore(b)
}

function pickBestCandidate(list) {
  if (!list.length) return null
  return list.reduce((best, item) => (isPersistedDataNewer(item.data, best.data) ? item : best))
}

function stampPersistedData(data, { bumpRevision = true } = {}) {
  const prevRevision = Number(data?.persistRevision) || 0
  return {
    ...data,
    schemaVersion: PERSIST_SCHEMA_VERSION,
    savedAt: Date.now(),
    persistRevision: bumpRevision ? prevRevision + 1 : prevRevision || 1
  }
}

/** 앱 최초 실행과 동일한 작품 목록 */
export function buildDefaultRecords() {
  return SAMPLE_RECORDS.map((r) => ({
    series: { enabled: false, unit: '권', volumes: [1] },
    reviewImages: [],
    volumeReviews: {},
    reviewSubtitle: '',
    customFields: {},
    tagFieldValues: {},
    ...r
  }))
}

export function cloneDefaultSettings() {
  return migrateSettings(cloneJson(DEFAULT_SETTINGS))
}

export function buildDefaultAppState() {
  return {
    records: buildDefaultRecords(),
    tags: cloneJson(DEFAULT_TAGS),
    settings: cloneDefaultSettings(),
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
    propertyRemoteOpen: false,
    exportInProgress: false,
    exportProgress: null,
    exportRecordSlice: null,
    easterEggResetEpoch: 0
  }
}

/** 백업 JSON과 동일 형식의 저장 스냅샷 */
export function buildPersistedData(state) {
  return stampPersistedData({
    records: state.records,
    tags: state.tags,
    settings: state.settings,
    session: {
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
  })
}

export function buildFreshPersistedData() {
  return buildPersistedData(buildDefaultAppState())
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** IPC — userData 주 파일(또는 구 Documents 경로) JSON */
export async function loadPersistentDataFile() {
  try {
    if (typeof window !== 'undefined' && window.mrecord?.loadPersistentData) {
      const result = await window.mrecord.loadPersistentData()
      if (result?.ok && result.data) {
        const parsed = JSON.parse(result.data)
        if (result.savedAt && !parsed.savedAt) {
          parsed.savedAt = result.savedAt
        }
        parsed.__loadSource = result.source
        return parsed
      }
    }
  } catch (e) {
    console.warn('Failed to load persistent data file:', e)
  }
  return null
}

async function loadPersistentDataFileWithRetry(attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    const file = await loadPersistentDataFile()
    if (file) return file
    if (i < attempts - 1) await sleep(150 * (i + 1))
  }
  return null
}

/**
 * 시작 시 — 모든 저장소 후보 중 최신(작품 수 우선) 선택
 * @returns {{ data: object, source: string } | null}
 */
export async function loadBestPersistedData() {
  const candidates = []

  const file = await loadPersistentDataFileWithRetry()
  if (file) candidates.push({ data: file, source: file.__loadSource || 'file' })

  const legacyLocal = loadLegacyLocalStoragePayload()
  if (legacyLocal) candidates.push({ data: legacyLocal, source: 'localStorage-legacy' })

  const best = pickBestCandidate(candidates)
  if (!best) return null

  const { __loadSource, ...data } = best.data
  return { data, source: best.source || __loadSource || 'unknown' }
}

/** localStorage에는 메타·테마만 — 전체 JSON은 파일 전용 */
export function saveDataMeta(data) {
  const meta = {
    savedAt: data?.savedAt || Date.now(),
    recordCount: Array.isArray(data?.records) ? data.records.length : 0,
    persistRevision: data?.persistRevision || 0,
    schemaVersion: PERSIST_SCHEMA_VERSION,
    mode: 'file-primary'
  }
  writeMeta(meta)
  writeThemeSnapshot(data?.settings)
  clearLegacyLocalStoragePayload()
}

function shouldBlockDestructiveSave(data, { force = false } = {}) {
  if (force) return false
  const meta = readMeta()
  const nextCount = Array.isArray(data?.records) ? data.records.length : 0
  const prevCount = Number(meta?.recordCount) || 0

  if (prevCount >= 5 && isLikelyDefaultSampleData(data) && nextCount < prevCount) {
    return true
  }
  if (prevCount >= 10 && nextCount <= 4 && nextCount < prevCount * 0.5) {
    return true
  }
  return false
}

function queueDiskSave(json, options = {}) {
  const seq = ++diskSaveSeq
  diskSaveChain = diskSaveChain
    .then(async () => {
      if (seq < diskSaveSeq) return { ok: true, skipped: true }
      if (!window.mrecord?.savePersistentData) return { ok: true }
      const result = await window.mrecord.savePersistentData(json, {
        force: options.force === true
      })
      if (!result?.ok) throw new Error(result?.error || '영구 데이터 저장 실패')
      return result
    })
    .catch((err) => {
      console.warn('Disk save failed:', err)
      throw err
    })
  return diskSaveChain
}

/** @deprecated — saveDataMeta + 파일 저장 사용 */
export function saveData(data) {
  if (shouldBlockDestructiveSave(data)) {
    console.warn('Blocked destructive local meta update (sample/default overwrite)')
    return { ok: false, blocked: true }
  }
  saveDataMeta(data)
  return { ok: true, mode: 'file-primary' }
}

/** 설정 내보내기 — 주 파일(mrecord-data.json)과 동일한 전체 스냅샷 */
export function exportData(data) {
  const { __loadSource, ...clean } = data || {}
  void __loadSource
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mrecord-data-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function importData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        resolve(data)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsText(file)
  })
}

/**
 * [저장] / 종료 — 주 저장 파일(mrecord-data.json)에 기록
 * @param {object} data
 * @param {{ force?: boolean, bumpRevision?: boolean }} [options]
 */
export async function flushAllPersistedData(data, options = {}) {
  const force = options.force === true
  if (shouldBlockDestructiveSave(data, { force })) {
    console.warn('Blocked destructive flush (would overwrite richer data with sample/default)')
    return { ok: false, blocked: true }
  }

  const stamped = stampPersistedData(data, { bumpRevision: options.bumpRevision !== false })
  const json = JSON.stringify(stamped, null, 2)
  await queueDiskSave(json, { force })
  saveDataMeta(stamped)
  return { ok: true, data: stamped }
}

/** 자동 저장(debounce) — 주 파일만 갱신 */
export function schedulePersistedData(data, options = {}) {
  if (shouldBlockDestructiveSave(data, options)) {
    console.warn('Blocked destructive autosave')
    return
  }
  const stamped = stampPersistedData(data)
  const json = JSON.stringify(stamped, null, 2)
  saveDataMeta(stamped)
  void queueDiskSave(json, options).catch(() => {})
}

/** debounce 타이머 대신 즉시 파일에 반영 (종료·[저장]용) */
export async function commitPersistedData(data, options = {}) {
  return flushAllPersistedData(data, options)
}
