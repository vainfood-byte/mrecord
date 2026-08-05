import { memo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { List, Plus, Trash2 } from 'lucide-react'
import {
  getCalendarGradientStyle,
  getDateBadgeClass
} from '../../utils/calendarHelpers'
import { coverPlaceholderStyle } from '../../utils/colorUtils'
import { isRecordLocked } from '../layout/LockToggle'

const COVER_CHIP =
  'bg-[var(--color-bg-panel)]/40 text-[var(--color-text)] shadow-sm hover:bg-[var(--color-bg-panel)]/55'
const COVER_ICON_BTN =
  'border-[var(--color-border)]/60 bg-[var(--color-bg-panel)]/40 text-[var(--color-text)] hover:bg-[var(--color-bg-panel)]/55'

function RecordPill({ rec, listPillClass, lock, onOpenRecord, onDeleteRecord, onEditTitle }) {
  const locked = isRecordLocked(rec, lock)
  const [menu, setMenu] = useState(null)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(rec.title)
  const inputRef = useRef(null)

  const startEdit = (e) => {
    if (locked) return
    e.preventDefault()
    e.stopPropagation()
    setValue(rec.title)
    setEditing(true)
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }

  const commitEdit = () => {
    const trimmed = value.trim()
    if (trimmed && trimmed !== rec.title) onEditTitle?.(rec.id, trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        data-record-pill
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.target.blur()
          if (e.key === 'Escape') {
            setValue(rec.title)
            setEditing(false)
          }
        }}
        className={`block w-full rounded px-1.5 py-0.5 text-left text-[11px] font-semibold leading-tight outline-none ring-1 ring-[var(--color-accent)] ${listPillClass}`}
      />
    )
  }

  return (
    <>
      <button
        key={rec.id}
        type="button"
        data-record-pill
        onClick={(e) => {
          e.stopPropagation()
          if (locked) return
          onOpenRecord?.(rec.id)
        }}
        onDoubleClick={startEdit}
        onContextMenu={(e) => {
          if (locked) return
          e.preventDefault()
          e.stopPropagation()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold leading-tight transition-colors ${listPillClass} ${locked ? 'blur-sm select-none' : ''}`}
        title={locked ? '잠금된 작품' : '더블클릭: 제목 수정 · 우클릭: 삭제'}
      >
        {rec.title}
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setMenu(null)} />
          <div
            data-popup-root
            className="fixed z-[201] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
            style={{ left: menu.x, top: menu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                onDeleteRecord?.(rec.id)
                setMenu(null)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-500/10"
            >
              <Trash2 size={14} />
              삭제
            </button>
          </div>
        </>
      )}
    </>
  )
}

function CalendarDayCell({
  day,
  inMonth,
  isToday,
  dayRecords,
  maxRecords,
  cellHeight,
  fillRow = false,
  dayCover,
  gradientColors,
  lock,
  eagerCover = false,
  onNewRecord,
  onShowRecords,
  onOpenRecord,
  onDeleteRecord,
  onEditTitle,
  onDoubleClick
}) {
  const dblRef = useRef(false)
  const clickTimerRef = useRef(null)
  /** 펜/마우스 더블탭 — 300ms·10px 허용 + dblclick 이중 실행 방지 */
  const dblTapRef = useRef({ time: 0, x: 0, y: 0, openedAt: 0 })
  const [hovered, setHovered] = useState(false)
  const dateKey = format(day, 'yyyy-MM-dd')
  const hasCover = Boolean(dayCover?.coverUrl || dayCover?.coverColor)
  const gradientStyle = dayCover?.gradient
    ? getCalendarGradientStyle(dayCover.gradient, gradientColors)
    : null
  const previewCount = Math.min(dayRecords.length, maxRecords)

  const isCellChromeTarget = (target) =>
    Boolean(
      target?.closest?.('[data-new-record-btn]') ||
        target?.closest?.('[data-list-records-btn]') ||
        target?.closest?.('[data-record-pill]')
    )

  const fireCellDoubleClick = () => {
    const now = performance.now()
    if (now - (dblTapRef.current.openedAt || 0) < 400) return
    dblTapRef.current = { time: 0, x: 0, y: 0, openedAt: now }
    dblRef.current = true
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    onDoubleClick?.(dateKey, dayRecords)
  }

  const handleClick = (e) => {
    if (isCellChromeTarget(e.target)) return
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null
      if (dblRef.current) {
        dblRef.current = false
      }
    }, 280)
  }

  const handlePointerDown = (e) => {
    if (isCellChromeTarget(e.target)) return
    if (e.button != null && e.button !== 0) return
    const now = performance.now()
    const prev = dblTapRef.current
    const dt = now - (prev.time || 0)
    const dist = Math.hypot(e.clientX - (prev.x || 0), e.clientY - (prev.y || 0))
    if (dt <= 300 && dist <= 10) {
      e.preventDefault()
      fireCellDoubleClick()
      return
    }
    dblTapRef.current = { ...prev, time: now, x: e.clientX, y: e.clientY }
  }

  const handleDoubleClick = (e) => {
    if (e.target.closest('[data-record-pill]')) return
    e.preventDefault()
    fireCellDoubleClick()
  }

  const listPillClass = hasCover
    ? COVER_CHIP
    : 'border border-[var(--color-border)] bg-[var(--color-bg-panel)] text-[var(--color-text)] shadow-sm hover:bg-[var(--color-accent)]/10 hover:text-[var(--color-accent)]'

  return (
    <div
      data-calendar-cell
      data-date-key={dateKey}
      style={fillRow ? undefined : { height: cellHeight }}
      className={`group/cell relative overflow-hidden border-b border-r border-[var(--color-border)] p-1 ${
        fillRow ? 'h-full min-h-0' : ''
      } ${
        !inMonth ? 'bg-black/[0.02] text-[var(--color-text-muted)]' : ''
      } ${isToday && !hasCover ? 'ring-1 ring-inset ring-[var(--color-accent)]/40' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {hasCover && (
        <>
          {dayCover.coverUrl ? (
            <img
              src={dayCover.coverUrl}
              data-cover-url={dayCover.coverUrl}
              data-calendar-day-cover
              alt=""
              loading={eagerCover ? 'eager' : 'lazy'}
              decoding={eagerCover ? 'sync' : 'async'}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div
              data-calendar-day-cover-color
              className="pointer-events-none absolute inset-0"
              style={coverPlaceholderStyle(dayCover.coverColor)}
            />
          )}
          {gradientStyle && (
            <div
              data-calendar-day-cover-gradient
              className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[55%]"
              style={gradientStyle}
            />
          )}
        </>
      )}

      {hovered && (
        <button
          type="button"
          data-new-record-btn
          title="새 게시글 작성"
          onClick={(e) => {
            e.stopPropagation()
            onNewRecord?.(dateKey)
          }}
          className={`absolute right-1 top-1 z-[5] flex h-6 w-6 items-center justify-center rounded-full border shadow-sm ${
            hasCover
              ? COVER_ICON_BTN
              : 'border-[var(--color-border)] bg-[var(--color-bg-panel)] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10'
          }`}
        >
          <Plus size={14} strokeWidth={2.5} />
        </button>
      )}

      {hovered && dayRecords.length > 0 && (
        <button
          type="button"
          data-list-records-btn
          title="작품 목록"
          onClick={(e) => {
            e.stopPropagation()
            const rect = e.currentTarget.getBoundingClientRect()
            onShowRecords?.(dateKey, dayRecords, {
              x: rect.left,
              y: rect.top
            })
          }}
          className={`absolute bottom-1 right-1 z-[5] flex h-6 w-6 items-center justify-center rounded-full border shadow-sm ${
            hasCover
              ? COVER_ICON_BTN
              : 'border-[var(--color-border)] bg-[var(--color-bg-panel)] text-[var(--color-text-muted)] hover:bg-[var(--color-accent)]/10 hover:text-[var(--color-accent)]'
          }`}
        >
          <List size={12} strokeWidth={2.5} />
        </button>
      )}

      <div className="relative z-[2] pr-7 pb-7">
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
            isToday && !hasCover
              ? 'bg-[var(--color-accent)] font-bold text-white'
              : hasCover
                ? getDateBadgeClass()
                : ''
          }`}
        >
          {format(day, 'd')}
        </span>
        {dayRecords.length > 0 && (
          <div className="mt-1 space-y-1">
            {dayRecords.slice(0, previewCount).map((rec) => (
              <RecordPill
                key={rec.id}
                rec={rec}
                listPillClass={listPillClass}
                lock={lock}
                onOpenRecord={onOpenRecord}
                onDeleteRecord={onDeleteRecord}
                onEditTitle={onEditTitle}
              />
            ))}
            {dayRecords.length > previewCount && (
              <button
                type="button"
                data-list-records-btn
                onClick={(e) => {
                  e.stopPropagation()
                  const rect = e.currentTarget.getBoundingClientRect()
                  onShowRecords?.(dateKey, dayRecords, {
                    x: rect.left,
                    y: rect.top
                  })
                }}
                className={`block w-full rounded px-1.5 py-0.5 text-left text-[10px] font-medium transition-colors ${
                  hasCover
                    ? `${COVER_CHIP} hover:text-[var(--color-accent)]`
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-accent)]'
                }`}
              >
                +{dayRecords.length - previewCount}개 더보기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(CalendarDayCell)
