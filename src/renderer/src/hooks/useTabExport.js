import { useCallback } from 'react'

import { format, startOfMonth } from 'date-fns'

import { useApp, useFilteredRecords } from '../context/AppContext'

import { resolveFontFamily } from '../data/defaults'

import { viewExportBasename } from '../utils/exportView'

import { exportCalendarMonth, exportCardGridSplitAsPng, exportRecordSplitAsPng, exportTagPropertySplitAsPng, preloadExportImages, restoreAllLockedExportCards } from '../utils/exportCalendar'

import { getTabLabel, getPropertyFieldForTab, isCoreTab } from '../utils/tabHelpers'

import { isPropertyTabExportable } from '../utils/exportTabHelpers'

import { isMemoFieldType } from '../utils/memoTabSettings'
import {
  beginExportBackground,
  endExportBackground,
  waitForExportTick
} from '../utils/exportBackground'

const RENDER_WAIT_MS = 360
const SLICE_RENDER_WAIT_MS = 400
const LOCK_RENDER_WAIT_MS = 800

const TAB_TITLE_LABEL = {
  record: '기록',
  gallery: '갤러리',
  calendar: ''
}

function isElementVisible(el) {
  if (!el) return false
  let node = el
  while (node) {
    if (node.hidden) return false
    node = node.parentElement
  }
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function findVisibleExportRoot(selector) {
  for (const el of document.querySelectorAll(selector)) {
    if (isElementVisible(el)) return el
  }
  return null
}

function waitForPaint() {
  return waitForExportTick(32)
}

export function useTabExport() {
  const { state, dispatch } = useApp()
  const filteredRecords = useFilteredRecords()
  const totalRecordCount = filteredRecords.length

  const waitForRender = (ms = RENDER_WAIT_MS) =>
    new Promise((resolve) => window.setTimeout(resolve, ms))

  const reportProgress = useCallback(
    (payload) => {
      dispatch({ type: 'SET_EXPORT_PROGRESS', payload })
    },
    [dispatch]
  )

  const applyExportSlice = useCallback(
    async (slice) => {
      dispatch({ type: 'SET_EXPORT_RECORD_SLICE', payload: slice })
      await waitForPaint()
      await waitForRender(slice ? SLICE_RENDER_WAIT_MS : RENDER_WAIT_MS)
      await waitForPaint()
    },
    [dispatch]
  )

  const brandedOptions = useCallback(
    (showDate, titleLabel, showBackgroundImage) => ({
      branded: true,
      showDate,
      titleLabel,
      showBackgroundImage,
      backgroundImage: state.settings.backgroundImage,
      backgroundImageOpacity: state.settings.backgroundImageOpacity,
      backgroundImageMode: state.settings.backgroundImageMode,
      presets: state.settings.presets,
      activePresetSlot: state.settings.activePresetSlot ?? 0,
      fontFamily: resolveFontFamily(state.settings)
    }),
    [
      state.settings.presets,
      state.settings.activePresetSlot,
      state.settings.fontId,
      state.settings.backgroundImage,
      state.settings.backgroundImageOpacity,
      state.settings.backgroundImageMode
    ]
  )

  const exportActiveTabImage = useCallback(
    async (imageOptions) => {
      if (state.exportInProgress) {
        throw new Error('이미 내보내기가 진행 중입니다.')
      }

      const tab = state.activeTab
      const settings = state.settings
      const exportable =
        isCoreTab(tab) || isPropertyTabExportable(tab, settings)

      if (!exportable) {
        throw new Error(
          '이 탭에서는 이미지 내보내기를 사용할 수 없습니다. (태그형 속성 또는 메모형 카드 보기)'
        )
      }

      const showDate = imageOptions?.showDate !== false
      const showBackgroundImage = imageOptions?.showBackgroundImage !== false
      const titleFontSizeRaw = imageOptions?.titleFontSize ?? imageOptions?.titleSize
      const titleFontSize =
        titleFontSizeRaw === 'small' || titleFontSizeRaw === 'large'
          ? titleFontSizeRaw
          : 'medium'
      const lockActive = Boolean(settings.lockSettings?.enabled)
      const titleLabel = isCoreTab(tab)
        ? TAB_TITLE_LABEL[tab] ?? ''
        : getTabLabel(tab, settings)

      const preloadOptions = {
        onProgress: reportProgress,
        timeoutMs: lockActive ? 20000 : 12000,
        perImageTimeoutMs: lockActive ? 10000 : 6000,
        lockExport: lockActive
      }

      const exportOpts = {
        onProgress: reportProgress,
        onExportSlice: applyExportSlice,
        resolveExportRoot: findVisibleExportRoot,
        totalRecordCount,
        preloadImages: false,
        lockExport: lockActive,
        preloadTimeoutMs: preloadOptions.timeoutMs,
        preloadPerImageTimeoutMs: preloadOptions.perImageTimeoutMs,
        ...brandedOptions(showDate, titleLabel, showBackgroundImage),
        titleFontSize,
        titleSize: titleFontSize
      }

      const prepareRoot = async (selector, slice) => {
        if (slice) {
          await applyExportSlice(slice)
          await waitForRender(lockActive ? LOCK_RENDER_WAIT_MS : SLICE_RENDER_WAIT_MS)
          await waitForPaint()
        }
        const root = findVisibleExportRoot(selector)
        if (!root) throw new Error('내보낼 화면을 찾을 수 없습니다')
        await preloadExportImages(root, preloadOptions)
        return root
      }

      dispatch({ type: 'SET_EXPORT_IN_PROGRESS', payload: true })
      reportProgress({ label: '내보내기 준비 중…', percent: null })
      await beginExportBackground()

      const initialRenderWait = lockActive ? LOCK_RENDER_WAIT_MS : RENDER_WAIT_MS

      try {
        await waitForRender(initialRenderWait)
        await waitForPaint()

        if (tab === 'record') {
          const root = findVisibleExportRoot('[data-record-export-root]')
          if (!root) throw new Error('기록 화면을 찾을 수 없습니다')
          await exportRecordSplitAsPng(root, '기록', {
            ...exportOpts,
            records: filteredRecords
          })
          return
        }

        if (tab === 'gallery') {
          const root = findVisibleExportRoot('[data-gallery-export-root]')
          if (!root) throw new Error('갤러리 화면을 찾을 수 없습니다')
          // 보기 모드와 무관 — 항상 10×10 타일 프레임
          await exportCardGridSplitAsPng(root, '갤러리', {
            ...exportOpts,
            galleryTenByTen: true
          })
          return
        }

        if (tab === 'calendar') {
          const root = await prepareRoot('[data-calendar-export-root]', null)
          const monthIso = root.getAttribute('data-current-month')
          const displayMonth = monthIso
            ? startOfMonth(new Date(monthIso))
            : startOfMonth(new Date())
          await exportCalendarMonth(
            root,
            displayMonth.getFullYear(),
            displayMonth.getMonth() + 1,
            {
              ...exportOpts,
              calendarPetitStickers: settings.calendarPetitStickers || [],
              monthKey: format(displayMonth, 'yyyy-MM')
            }
          )
          return
        }

        const field = getPropertyFieldForTab(tab, settings)
        if (field?.type === 'tags') {
          const filename = `${viewExportBasename(titleLabel)}.png`
          const root = findVisibleExportRoot('[data-tag-export-root]')
          if (!root) throw new Error('태그형 속성 화면을 찾을 수 없습니다')
          await exportTagPropertySplitAsPng(root, filename, exportOpts)
          return
        }

        if (field && isMemoFieldType(field.type)) {
          const root = findVisibleExportRoot('[data-memo-export-root]')
          if (!root) throw new Error('메모형 카드 화면을 찾을 수 없습니다')
          // 보기 모드와 무관 — 항상 10×10 타일 프레임
          await exportCardGridSplitAsPng(root, titleLabel, {
            ...exportOpts,
            galleryTenByTen: true
          })
          return
        }

        throw new Error('내보낼 화면을 찾을 수 없습니다')
      } finally {
        restoreAllLockedExportCards()
        await applyExportSlice(null)
        await waitForExportTick(350)
        dispatch({ type: 'SET_EXPORT_IN_PROGRESS', payload: false })
        dispatch({ type: 'SET_EXPORT_PROGRESS', payload: null })
        await endExportBackground()
      }
    },
    [
      state.activeTab,
      state.settings,
      state.exportInProgress,
      totalRecordCount,
      brandedOptions,
      dispatch,
      reportProgress,
      applyExportSlice
    ]
  )

  return { exportActiveTabImage, exportInProgress: state.exportInProgress }
}
