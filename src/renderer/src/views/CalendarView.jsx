import {
  addMonths,
  format,
  getMonth,
  getYear,
  isSameDay,
  isSameMonth,
  startOfMonth,
  subMonths
} from 'date-fns'
import { ko } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Flower2, ImageDown } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { isRecordLocked } from '../components/layout/LockToggle'
import { resolveFontFamily } from '../data/defaults'
import CalendarCoverPicker from '../components/calendar/CalendarCoverPicker'
import CalendarDayCell from '../components/calendar/CalendarDayCell'
import CalendarDayRecordPopup from '../components/calendar/CalendarDayRecordPopup'
import CalendarExportMenu from '../components/calendar/CalendarExportMenu'
import CalendarJumpPicker from '../components/calendar/CalendarJumpPicker'
import PetitStickerLayer from '../components/calendar/PetitStickerLayer'
import PetitStickerLibrary from '../components/calendar/PetitStickerLibrary'
import {
  buildLibraryFromStickers,
  generateMonthGridWeeks,
  indexRecordsByReadDate,
  recordsPerCell,
  weekStartKey,
  weeksInMonthGrid
} from '../utils/calendarHelpers'
import { exportCalendarMonth, exportCalendarYearGrid } from '../utils/exportCalendar'
import { waitForExportTick } from '../utils/exportBackground'
import {
  LOCK_EXPORT_WARNING_MESSAGE,
  shouldConfirmLockExport
} from '../utils/exportTabHelpers'
import {
  createPetitSticker,
  loadImageSize,
  readPngFile
} from '../utils/stickerHelpers'
import DeleteConfirmDialog from '../components/ui/DeleteConfirmDialog'

export default function CalendarView() {
  const { state, dispatch } = useApp()
  const today = useMemo(() => new Date(), [])

  const savedMonthKey = state.calendarDisplayMonth
  const [displayMonth, setDisplayMonth] = useState(() => {
    if (savedMonthKey) {
      const parsed = new Date(`${savedMonthKey}-01T12:00:00`)
      if (!Number.isNaN(parsed.getTime())) return startOfMonth(parsed)
    }
    return startOfMonth(today)
  })

  useEffect(() => {
    if (!savedMonthKey) return
    const parsed = new Date(`${savedMonthKey}-01T12:00:00`)
    if (Number.isNaN(parsed.getTime())) return
    const next = startOfMonth(parsed)
    setDisplayMonth((prev) => (prev.getTime() === next.getTime() ? prev : next))
  }, [savedMonthKey])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [clockTipVisible, setClockTipVisible] = useState(false)
  const [flowerTipVisible, setFlowerTipVisible] = useState(false)
  const clockTipTimerRef = useRef(null)
  const flowerTipTimerRef = useRef(null)
  const [coverPicker, setCoverPicker] = useState(null)
  const [recordPopup, setRecordPopup] = useState(null)
  const [jumpPicker, setJumpPicker] = useState(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [lockWarnOpen, setLockWarnOpen] = useState(false)
  const pendingLockExportRef = useRef(null)

  const boxRef = useRef(null)
  const viewportRef = useRef(null)
  const inputRef = useRef(null)
  const ctxInputRef = useRef(null)
  const pendingStickerPos = useRef(null)
  const jumpBtnRef = useRef(null)
  const exportBtnRef = useRef(null)

  const [cellHeight, setCellHeight] = useState(80)
  const dayCovers = state.settings.calendarDayCovers || {}
  const gradientColors = state.settings.calendarGradientColors || {
    custom1: '#ffffff',
    custom2: '#333333'
  }
  const library =
    state.settings.petitStickerLibrary?.length > 0
      ? state.settings.petitStickerLibrary
      : buildLibraryFromStickers(state.settings.calendarPetitStickers)

  const weeks = useMemo(
    () => generateMonthGridWeeks(displayMonth),
    [displayMonth]
  )

  const monthKey = format(displayMonth, 'yyyy-MM')
  const year = getYear(displayMonth)
  const month = getMonth(displayMonth) + 1
  const maxRecords = recordsPerCell(cellHeight)
  const monthWeekCount = weeksInMonthGrid(displayMonth)

  const recordsByDate = useMemo(
    () => indexRecordsByReadDate(state.records),
    [state.records]
  )

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const syncCellHeight = () => {
      const row = viewport.querySelector('[data-calendar-week]')
      if (!row) return
      const h = Math.round(row.getBoundingClientRect().height)
      if (h > 0) setCellHeight((prev) => (prev === h ? prev : h))
    }

    syncCellHeight()
    const ro = new ResizeObserver(syncCellHeight)
    ro.observe(viewport)
    return () => ro.disconnect()
  }, [monthWeekCount, displayMonth, libraryOpen])

  const goToMonth = useCallback(
    (target) => {
      const month = startOfMonth(target)
      setDisplayMonth(month)
      dispatch({ type: 'SET_CALENDAR_DISPLAY_MONTH', payload: format(month, 'yyyy-MM') })
    },
    [dispatch]
  )

  useEffect(() => {
    const onEsc = (e) => {
      if (exportMenuOpen) {
        setExportMenuOpen(false)
        e.preventDefault()
      } else if (jumpPicker) {
        setJumpPicker(null)
        e.preventDefault()
      } else if (coverPicker) {
        setCoverPicker(null)
        e.preventDefault()
      } else if (recordPopup) {
        setRecordPopup(null)
        e.preventDefault()
      } else if (libraryOpen) {
        setLibraryOpen(false)
        e.preventDefault()
      }
    }
    window.addEventListener('mrecord:escape', onEsc)
    return () => window.removeEventListener('mrecord:escape', onEsc)
  }, [coverPicker, recordPopup, libraryOpen, jumpPicker, exportMenuOpen])

  const exportImageOptions = state.settings.exportImageOptions || {
    showDate: true,
    showBackgroundImage: true
  }

  const brandedExportOptions = useCallback(
    () => ({
      branded: true,
      showDate: exportImageOptions.showDate !== false,
      showBackgroundImage: exportImageOptions.showBackgroundImage !== false,
      titleLabel: '',
      presets: state.settings.presets,
      activePresetSlot: state.settings.activePresetSlot ?? 0,
      fontFamily: resolveFontFamily(state.settings),
      backgroundImage: state.settings.backgroundImage,
      backgroundImageOpacity: state.settings.backgroundImageOpacity,
      backgroundImageMode: state.settings.backgroundImageMode,
      calendarPetitStickers: state.settings.calendarPetitStickers || [],
      monthKey
    }),
    [
      exportImageOptions.showDate,
      exportImageOptions.showBackgroundImage,
      monthKey,
      state.settings.presets,
      state.settings.activePresetSlot,
      state.settings.fontId,
      state.settings.backgroundImage,
      state.settings.backgroundImageOpacity,
      state.settings.backgroundImageMode,
      state.settings.calendarPetitStickers
    ]
  )

  const handleExportMonth = useCallback(async () => {
    const root = boxRef.current
    if (!root) return
    setExportMenuOpen(false)
    await waitForExportTick(80)
    try {
      await exportCalendarMonth(root, year, month, brandedExportOptions())
    } catch (err) {
      console.error(err)
      alert(`해당 월 내보내기에 실패했습니다.\n${err?.message || err}`)
    }
  }, [year, month, brandedExportOptions])

  const handleExportYear = useCallback(
    async (targetYear) => {
      const root = boxRef.current
      if (!root) return
      setExportMenuOpen(false)
      const savedDisplay = displayMonth
      try {
        await exportCalendarYearGrid({
          year: targetYear,
          scrollToMonth: goToMonth,
          getElement: () => boxRef.current,
          ...brandedExportOptions()
        })
      } catch (err) {
        console.error(err)
        alert(`연도별 내보내기에 실패했습니다.\n${err?.message || err}`)
      } finally {
        goToMonth(savedDisplay)
      }
    },
    [displayMonth, goToMonth, brandedExportOptions]
  )

  const requestCalendarExport = useCallback(
    (job) => {
      if (shouldConfirmLockExport(state.settings)) {
        pendingLockExportRef.current = job
        setExportMenuOpen(false)
        setLockWarnOpen(true)
        return
      }
      if (job.type === 'year') handleExportYear(job.year)
      else handleExportMonth()
    },
    [state.settings, handleExportMonth, handleExportYear]
  )

  const confirmLockExport = useCallback(
    async (skipAsk) => {
      if (skipAsk) {
        dispatch({ type: 'UPDATE_SETTINGS', payload: { confirmLockExportWarning: false } })
      }
      const job = pendingLockExportRef.current
      pendingLockExportRef.current = null
      setLockWarnOpen(false)
      if (!job) return
      if (job.type === 'year') await handleExportYear(job.year)
      else await handleExportMonth()
    },
    [dispatch, handleExportMonth, handleExportYear]
  )

  const placeSticker = useCallback(
    async (src, clientX, clientY) => {
      const box = boxRef.current
      if (!box || !src) return
      const rect = box.getBoundingClientRect()
      const { width: natW, height: natH } = await loadImageSize(src)
      const width = Math.min(120, Math.max(48, natW > 0 ? natW * 0.35 : 72))
      const heightRatio = natW > 0 ? natH / natW : 1
      const sticker = createPetitSticker({
        src,
        x: clientX - rect.left - width / 2,
        y: clientY - rect.top - (width * heightRatio) / 2,
        width,
        heightRatio,
        monthKey,
        boxW: rect.width,
        boxH: rect.height
      })
      dispatch({ type: 'ADD_PETIT_STICKER', payload: sticker })
    },
    [dispatch, monthKey]
  )

  const addPetitSticker = async (file, atPos = null) => {
    try {
      const src = await readPngFile(file)
      const box = boxRef.current
      const rect = box?.getBoundingClientRect()
      const { width: natW, height: natH } = await loadImageSize(src)
      const width = Math.min(120, Math.max(48, natW > 0 ? natW * 0.35 : 72))
      const heightRatio = natW > 0 ? natH / natW : 1
      if (atPos) {
        await placeSticker(src, atPos.x, atPos.y)
        return
      }
      const count = (state.settings.calendarPetitStickers || []).filter(
        (s) => s.monthKey === monthKey
      ).length
      const sticker = createPetitSticker({
        src,
        x: 24 + count * 16,
        y: 24 + count * 16,
        width,
        heightRatio,
        monthKey,
        boxW: rect?.width ?? 0,
        boxH: rect?.height ?? 0
      })
      dispatch({ type: 'ADD_PETIT_STICKER', payload: sticker })
    } catch {
      /* invalid file */
    }
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    pendingStickerPos.current = { x: e.clientX, y: e.clientY }
    ctxInputRef.current?.click()
  }

  const handleBoxDragOver = (e) => {
    if (e.dataTransfer.types.includes('application/x-petit-sticker-src')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleBoxDrop = async (e) => {
    const src = e.dataTransfer.getData('application/x-petit-sticker-src')
    if (!src) return
    e.preventDefault()
    await placeSticker(src, e.clientX, e.clientY)
  }

  const handleNewRecord = (dateKey) => {
    setRecordPopup(null)
    dispatch({
      type: 'CREATE_NEW_RECORD',
      payload: { readDate: dateKey, finishDate: dateKey.slice(0, 4), autoEditTitle: true }
    })
  }

  const handleOpenRecord = (id) => {
    const rec = state.records.find((r) => r.id === id)
    if (rec && isRecordLocked(rec, state.settings.lockSettings)) return
    setRecordPopup(null)
    dispatch({ type: 'SELECT_RECORD', payload: { id, editTitle: true } })
  }

  const lock = state.settings.lockSettings
  const exportInProgress = state.exportInProgress

  const handleShowRecords = (dateKey, dayRecords, pos) => {
    setRecordPopup({ dateKey, records: dayRecords, x: pos.x, y: pos.y })
  }

  const handleDoubleClick = (dateKey, dayRecords) => {
    setRecordPopup(null)
    setCoverPicker({ dateKey, records: dayRecords, cover: dayCovers[dateKey] })
  }

  const handleDeleteRecord = (id) => {
    setRecordPopup(null)
    dispatch({ type: 'DELETE_RECORD', payload: id })
  }

  const handleEditRecordTitle = (id, title) => {
    const rec = state.records.find((r) => r.id === id)
    if (!rec) return
    dispatch({ type: 'UPDATE_RECORD', payload: { ...rec, title } })
  }

  const showClockTip = () => {
    clockTipTimerRef.current = window.setTimeout(() => setClockTipVisible(true), 1000)
  }

  const hideClockTip = () => {
    if (clockTipTimerRef.current) {
      window.clearTimeout(clockTipTimerRef.current)
      clockTipTimerRef.current = null
    }
    setClockTipVisible(false)
  }

  const showFlowerTip = () => {
    flowerTipTimerRef.current = window.setTimeout(() => setFlowerTipVisible(true), 1000)
  }

  const hideFlowerTip = () => {
    if (flowerTipTimerRef.current) {
      window.clearTimeout(flowerTipTimerRef.current)
      flowerTipTimerRef.current = null
    }
    setFlowerTipVisible(false)
  }

  useEffect(
    () => () => {
      hideClockTip()
      hideFlowerTip()
    },
    []
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        ref={boxRef}
        data-calendar-root
        data-calendar-export-root
        data-current-month={displayMonth.toISOString()}
        className="relative flex min-h-0 flex-1 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 shadow-sm"
        onDragOver={handleBoxDragOver}
        onDrop={handleBoxDrop}
        onContextMenu={handleContextMenu}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between gap-2" data-calendar-header>
          <h2 className="text-lg font-semibold">
            {format(displayMonth, 'yyyy년 M월', { locale: ko })}
          </h2>
          <div className="flex items-center gap-1" data-export-hide>
            <button
              ref={jumpBtnRef}
              type="button"
              data-calendar-jump-trigger
              onClick={() => {
                if (jumpPicker) {
                  setJumpPicker(null)
                  return
                }
                const rect = jumpBtnRef.current?.getBoundingClientRect()
                setJumpPicker({
                  x: rect?.left ?? 0,
                  y: (rect?.bottom ?? 0) + 4
                })
              }}
              className="rounded-lg border border-[var(--color-border)] p-1.5 hover:bg-black/5"
              title="날짜 이동"
            >
              <CalendarDays size={18} />
            </button>
            <button
              type="button"
              onClick={() => goToMonth(subMonths(displayMonth, 1))}
              className="rounded-lg p-1.5 hover:bg-black/5"
              title="이전 달"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => goToMonth(today)}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs hover:bg-black/5"
              title="오늘"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => goToMonth(addMonths(displayMonth, 1))}
              className="rounded-lg p-1.5 hover:bg-black/5"
              title="다음 달"
            >
              <ChevronRight size={18} />
            </button>
            <div className="relative ml-1">
              <button
                type="button"
                onClick={() => setLibraryOpen((v) => !v)}
                onMouseEnter={showClockTip}
                onMouseLeave={hideClockTip}
                className={`rounded-lg border border-[var(--color-border)] p-1.5 hover:bg-[var(--color-accent)]/10 ${
                  libraryOpen ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]' : 'text-[var(--color-accent)]'
                }`}
              >
                <Clock size={18} />
              </button>
              {clockTipVisible && (
                <div className="pointer-events-none absolute right-0 top-full z-20 mt-1 whitespace-nowrap rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-2 py-1.5 text-[10px] text-[var(--color-text-muted)] shadow-md">
                  최근 사용한 쁘띠스티커
                </div>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onMouseEnter={showFlowerTip}
                onMouseLeave={hideFlowerTip}
                className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
              >
                <Flower2 size={18} />
              </button>
              {flowerTipVisible && (
                <div className="pointer-events-none absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-2 py-1.5 text-[10px] leading-snug text-[var(--color-text-muted)] shadow-md">
                  쁘띠스티커 추가
                  <br />
                  달력 우클릭으로 쁘띠스티커 추가가능
                </div>
              )}
            </div>
            <button
              ref={exportBtnRef}
              type="button"
              data-calendar-export-trigger
              onClick={() => setExportMenuOpen((v) => !v)}
              className={`rounded-lg border border-[var(--color-border)] p-1.5 hover:bg-black/5 ${
                exportMenuOpen ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]' : ''
              }`}
              title="이미지 내보내기"
            >
              <ImageDown size={18} />
            </button>
          </div>
        </div>

        <PetitStickerLibrary
          library={library}
          open={libraryOpen}
          onAddFile={addPetitSticker}
        />

        <div
          data-calendar-daynames
          className="mb-1 grid shrink-0 grid-cols-7 text-center text-xs text-[var(--color-text-muted)]"
        >
          {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div
          ref={viewportRef}
          data-calendar-viewport
          className="min-h-0 flex-1 overflow-hidden pb-px"
        >
          <div
            data-calendar-scroll-body
            className="box-border flex h-full min-h-0 flex-col border border-[var(--color-border)] border-b-[var(--color-border)]"
          >
            {weeks.map((week, wi) => {
              const ws = week[0]
              const wKey = weekStartKey(ws)
              const isLastWeek = wi === weeks.length - 1
              return (
                <div
                  key={wKey}
                  data-calendar-week={wKey}
                  data-week-start={wKey}
                  className={`grid min-h-0 flex-1 grid-cols-7 ${wi === 0 ? '' : 'border-t border-[var(--color-border)]'} ${isLastWeek ? 'border-b border-[var(--color-border)]' : ''}`}
                >
                  {week.map((day) => {
                    const dateKey = format(day, 'yyyy-MM-dd')
                    const dayRecords = recordsByDate[dateKey] || []
                    return (
                      <CalendarDayCell
                        key={dateKey}
                        day={day}
                        inMonth={isSameMonth(day, displayMonth)}
                        isToday={isSameDay(day, today)}
                        dayRecords={dayRecords}
                        maxRecords={maxRecords}
                        cellHeight={cellHeight}
                        fillRow
                        dayCover={dayCovers[dateKey]}
                        gradientColors={gradientColors}
                        lock={lock}
                        eagerCover={exportInProgress}
                        onNewRecord={handleNewRecord}
                        onShowRecords={handleShowRecords}
                        onOpenRecord={handleOpenRecord}
                        onDeleteRecord={handleDeleteRecord}
                        onEditTitle={handleEditRecordTitle}
                        onDoubleClick={handleDoubleClick}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        <PetitStickerLayer
          monthKey={monthKey}
          containerRef={boxRef}
          viewportRef={viewportRef}
        />

        <input
          ref={inputRef}
          type="file"
          accept="image/png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) addPetitSticker(file)
            e.target.value = ''
          }}
        />
        <input
          ref={ctxInputRef}
          type="file"
          accept="image/png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            const pos = pendingStickerPos.current
            if (file) addPetitSticker(file, pos)
            pendingStickerPos.current = null
            e.target.value = ''
          }}
        />
      </div>

      {recordPopup && (
        <CalendarDayRecordPopup
          dateKey={recordPopup.dateKey}
          records={recordPopup.records}
          x={recordPopup.x}
          y={recordPopup.y}
          lock={lock}
          onSelect={(id) => handleOpenRecord(id)}
          onClose={() => setRecordPopup(null)}
        />
      )}

      {coverPicker && (
        <CalendarCoverPicker
          dateKey={coverPicker.dateKey}
          records={coverPicker.records}
          initialCover={coverPicker.cover}
          onClose={() => setCoverPicker(null)}
        />
      )}

      {jumpPicker && (
        <CalendarJumpPicker
          x={jumpPicker.x}
          y={jumpPicker.y}
          initialDate={displayMonth}
          onJump={(date) => goToMonth(date)}
          onClose={() => setJumpPicker(null)}
        />
      )}

      {exportMenuOpen && (
        <CalendarExportMenu
          anchorRef={exportBtnRef}
          displayYear={year}
          onExportMonth={() => requestCalendarExport({ type: 'month' })}
          onExportYear={(y) => requestCalendarExport({ type: 'year', year: y })}
          onClose={() => setExportMenuOpen(false)}
        />
      )}

      {lockWarnOpen && (
        <DeleteConfirmDialog
          title="안내"
          message={LOCK_EXPORT_WARNING_MESSAGE}
          skipAskLabel="다시 질문하지 않기"
          confirmLabel="진행"
          confirmClassName="flex-1 rounded-lg bg-[var(--color-accent)] py-2 text-sm text-white hover:opacity-90"
          onConfirm={confirmLockExport}
          onCancel={() => {
            pendingLockExportRef.current = null
            setLockWarnOpen(false)
          }}
        />
      )}
    </div>
  )
}
