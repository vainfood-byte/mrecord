import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import Header from './components/layout/Header'
import TabBar from './components/layout/TabBar'
import { useApp, isCoreTab } from './context/AppContext'
import { MainScrollProvider, MainScrollContainer } from './context/MainScrollContext'
import RecordPageNav from './components/layout/RecordPageNav'

/** 초기 번들 축소 — 탭/패널은 사용 시점에 비동기 로드 */
const RecordView = lazy(() => import('./views/RecordView'))
const GalleryView = lazy(() => import('./views/GalleryView'))
const CalendarView = lazy(() => import('./views/CalendarView'))
const PropertyTabView = lazy(() => import('./views/PropertyTabView'))
const DetailPanel = lazy(() => import('./components/layout/DetailPanel'))
const SettingsPanel = lazy(() => import('./components/layout/SettingsPanel'))
const TraceBox = lazy(() => import('./components/layout/TraceBox'))
const StickerLayer = lazy(() => import('./components/decorate/StickerLayer'))
const PropertyRemotePanel = lazy(() => import('./components/detail/PropertyRemotePanel'))

function ViewFallback() {
  return (
    <div
      className="flex min-h-[120px] items-center justify-center py-10 text-sm text-[var(--color-text-muted)]"
      aria-busy="true"
    >
      불러오는 중…
    </div>
  )
}

function BackgroundLayer() {
  const { state } = useApp()
  const s = state.settings
  if (!s.backgroundImage) return null

  const mode = s.backgroundImageMode || 'fill'
  const opacity = s.backgroundImageOpacity ?? 0.3
  const slot = s.activePresetSlot ?? 0

  const style = {
    opacity,
    backgroundImage: `url(${s.backgroundImage})`,
    backgroundRepeat: mode === 'tile' ? 'repeat' : 'no-repeat',
    backgroundPosition: 'center',
    backgroundSize: mode === 'fill' ? 'cover' : mode === 'tile' ? 'auto' : 'auto',
    contain: 'layout style',
    willChange: 'transform'
  }

  return (
    <div
      key={slot}
      className="pointer-events-none fixed inset-0 z-0"
      data-background-layer
      style={style}
      aria-hidden
    />
  )
}

/**
 * 탭 전환 시 200+ 카드 DOM 파괴/재생성을 피하기 위해,
 * 한 번 열린 탭은 display:none 으로 숨기고 유지한다.
 */
function MainView() {
  const { state } = useApp()
  const tab = state.activeTab
  const [mountedTabs, setMountedTabs] = useState(() => [tab])

  useEffect(() => {
    setMountedTabs((prev) => (prev.includes(tab) ? prev : [...prev, tab]))
  }, [tab])

  return (
    <Suspense fallback={<ViewFallback />}>
      {mountedTabs.includes('record') && (
        <div
          data-tab-panel="record"
          style={{ display: tab === 'record' ? undefined : 'none' }}
          aria-hidden={tab !== 'record'}
        >
          <RecordView />
        </div>
      )}
      {mountedTabs.includes('gallery') && (
        <div
          data-tab-panel="gallery"
          style={{ display: tab === 'gallery' ? undefined : 'none' }}
          aria-hidden={tab !== 'gallery'}
        >
          <GalleryView />
        </div>
      )}
      {mountedTabs.includes('calendar') && (
        <div
          data-tab-panel="calendar"
          className="h-full min-h-0"
          style={{ display: tab === 'calendar' ? undefined : 'none' }}
          aria-hidden={tab !== 'calendar'}
        >
          <CalendarView />
        </div>
      )}
      {mountedTabs
        .filter((id) => id && !isCoreTab(id))
        .map((fieldId) => (
          <div
            key={fieldId}
            data-tab-panel={fieldId}
            style={{ display: tab === fieldId ? undefined : 'none' }}
            aria-hidden={tab !== fieldId}
          >
            <PropertyTabView fieldId={fieldId} />
          </div>
        ))}
    </Suspense>
  )
}

const SIDE_DISMISS_IGNORE = [
  '[data-detail-panel]',
  '[data-add-record]',
  '[data-no-side-open]',
  '[data-popup-root]',
  '[data-property-popup]',
  '[data-tag-editor]',
  '[data-date-picker-portal]',
  '[data-inline-edit]',
  '[data-property-remote]',
  '[data-delete-confirm-dialog]',
  '[data-tag-context-menu]',
  '[data-char-insert-menu]',
  '[data-quote-wrap-menu]',
  '[data-marico-restart-menu]',
  '[data-title-credit-menu]',
  '[data-color-picker-popover]',
  '[data-color-picker-native]',
  '[data-cover-picker]',
  '[data-cover-crop]',
  '[data-review-img-ui]',
  '[data-trace-dialog]',
  '[data-trace-widget]',
  '[data-trace-toggle]',
  '[data-settings-panel]'
].join(',')

/** 목록에서 작품 클릭 → 사이드 닫지 않고 SELECT_RECORD로 내용 교체 */
const SIDE_RECORD_OPENERS = [
  '[data-gallery-card-export]',
  '[data-gallery-card]',
  '[data-memo-card-export]',
  '[data-memo-card]',
  '[data-open-record]',
  '[data-record-export-root] tbody tr'
].join(',')

function shouldDismissSidePanel(target) {
  if (!(target instanceof Element)) return false
  if (target.closest(SIDE_DISMISS_IGNORE)) return false
  if (target.closest(SIDE_RECORD_OPENERS)) return false
  return true
}

export default function App() {
  const { state, dispatch } = useApp()
  const windowRestoredRef = useRef(false)

  const isGallery = state.activeTab === 'gallery'
  const isCalendar = state.activeTab === 'calendar'
  const sideOpen = state.detailMode === 'side'
  const isFullDetail = state.detailMode === 'full'
  const panelWidth = state.settings.detailPanelWidth || 480
  const showDetailPanel = sideOpen || isFullDetail
  const showSettings = Boolean(state.settingsOpen)
  const showPropertyRemote = Boolean(state.propertyRemoteOpen)

  useEffect(() => {
    if (windowRestoredRef.current) return
    const bounds = state.settings.windowBounds
    if (!bounds || !window.mrecord?.setWindowBounds) return
    windowRestoredRef.current = true
    window.mrecord.setWindowBounds(bounds).catch(() => {})
  }, [state.settings.windowBounds])

  useEffect(() => {
    if (!window.mrecord?.onWindowBoundsChanged) return undefined
    let timer = null
    const unsub = window.mrecord.onWindowBoundsChanged(() => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        try {
          const bounds = await window.mrecord.getWindowBounds?.()
          if (bounds) {
            dispatch({ type: 'UPDATE_SETTINGS', payload: { windowBounds: bounds } })
          }
        } catch {
          /* ignore */
        }
      }, 400)
    })
    return () => {
      clearTimeout(timer)
      unsub?.()
    }
  }, [dispatch])

  useEffect(() => {
    if (!sideOpen) return undefined

    const onMouseDown = (e) => {
      if (!shouldDismissSidePanel(e.target)) return
      const active = document.activeElement
      if (active?.tagName === 'INPUT' && active.closest('[data-detail-panel]')) {
        active.blur()
      }
      dispatch({ type: 'DISMISS_DETAIL' })
    }

    document.addEventListener('mousedown', onMouseDown, true)
    return () => document.removeEventListener('mousedown', onMouseDown, true)
  }, [sideOpen, dispatch])

  /** 첫 화면 그린 뒤 idle에만 다른 탭 청크를 예열 — 기동 CPU 피크 회피 */
  useEffect(() => {
    const ric = window.requestIdleCallback
      ? (cb) => window.requestIdleCallback(cb, { timeout: 4000 })
      : (cb) => window.setTimeout(cb, 1200)
    const cancel = window.cancelIdleCallback
      ? (id) => window.cancelIdleCallback(id)
      : (id) => window.clearTimeout(id)

    const id = ric(() => {
      void import('./views/RecordView')
      void import('./views/CalendarView')
      void import('./views/PropertyTabView')
      void import('./components/layout/DetailPanel')
    })
    return () => cancel(id)
  }, [])

  const handleMainMouseDown = (e) => {
    if (
      state.settingsOpen &&
      !e.target.closest('[data-settings-panel]') &&
      !e.target.closest('[data-settings-trigger]') &&
      !e.target.closest('[data-color-picker-popover]') &&
      !e.target.closest('[data-color-picker-native]')
    ) {
      dispatch({ type: 'TOGGLE_SETTINGS' })
    }
    if (
      (state.traceAddOpen || state.traceEditId) &&
      !e.target.closest('[data-trace-dialog]') &&
      !e.target.closest('[data-trace-widget]')
    ) {
      dispatch({ type: 'SET_TRACE_ADD_OPEN', payload: false })
      dispatch({ type: 'SET_TRACE_EDIT', payload: null })
    }
  }

  return (
    <MainScrollProvider>
      <div className="relative flex h-full flex-col bg-[var(--color-bg)]">
        <BackgroundLayer />
        <div className="relative z-10 flex h-full flex-col">
          <Header />
          {!isFullDetail && <TabBar />}

          {isFullDetail ? (
            <Suspense fallback={<ViewFallback />}>
              <DetailPanel />
            </Suspense>
          ) : (
            <div className="relative flex flex-1 overflow-hidden" data-main-content>
              <div className="relative flex min-w-0 flex-1 overflow-hidden">
                <main
                  className={`flex h-full flex-col ${
                    isGallery && sideOpen ? 'py-5 pl-5 pr-2' : 'w-full p-5'
                  } ${state.settings.pagedView && state.activeTab !== 'calendar' ? 'pb-0' : ''}`}
                  onMouseDown={handleMainMouseDown}
                  style={
                    isGallery && sideOpen
                      ? { width: `calc(100% - ${panelWidth}px)`, flexShrink: 0 }
                      : undefined
                  }
                >
                  <MainScrollContainer
                    className={`min-h-0 flex-1 ${isCalendar ? 'overflow-hidden' : 'overflow-y-auto'}`}
                  >
                    <MainView />
                  </MainScrollContainer>
                  <RecordPageNav />
                </main>
              </div>
              <Suspense fallback={null}>
                <TraceBox />
              </Suspense>
              {showDetailPanel && (
                <Suspense fallback={null}>
                  <DetailPanel />
                </Suspense>
              )}
            </div>
          )}
          {!isFullDetail && (
            <Suspense fallback={null}>
              <StickerLayer placement="multiply" />
            </Suspense>
          )}
        </div>
        {!isFullDetail && (
          <Suspense fallback={null}>
            <StickerLayer placement="normal" />
          </Suspense>
        )}
        {showSettings && (
          <Suspense fallback={null}>
            <SettingsPanel />
          </Suspense>
        )}
        {showPropertyRemote && (
          <Suspense fallback={null}>
            <PropertyRemotePanel />
          </Suspense>
        )}
      </div>
    </MainScrollProvider>
  )
}
