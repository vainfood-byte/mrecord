import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDownAZ,
  BookOpen,
  Calendar,
  Clock,
  Eye,
  EyeOff,
  Filter,
  Grid3X3,
  List,
  PenLine,
  Search,
  SlidersHorizontal,
  Star,
  Trash2
} from 'lucide-react'
import { resetInteractionLocks } from '../../utils/restoreFocusAfterDialog'
import { useApp, useVisibleTabs } from '../../context/AppContext'
import { getAllTabs } from '../../utils/tabHelpers'
import { getPropertyIcon } from '../../constants/propertyIcons'
import { resolveTagDisplayColor } from '../../utils/tagColorHelpers'
import LockToggle from './LockToggle'
import ViewModeToggle from './ViewModeToggle'
import DecorateButton from '../decorate/DecorateButton'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { buildRecordListIndex } from '../../utils/recordFilters'
import { searchRecordsWithReview } from '../../utils/searchRecords'
import AnchoredPopup from '../ui/AnchoredPopup'
import DeleteConfirmDialog from '../ui/DeleteConfirmDialog'

const overlayRoot = document.getElementById('overlay-root')

const SORT_OPTIONS = [
  { key: 'alpha', label: '가나다순', Icon: ArrowDownAZ },
  { key: 'readDate', label: '최근 읽은순', Icon: Clock },
  { key: 'createdAt', label: '최근 등록순', Icon: BookOpen },
  { key: 'rating', label: '별점 높은순', Icon: Star }
]

const CORE_TAB_ICONS = {
  record: List,
  gallery: Grid3X3,
  calendar: Calendar
}

const POPUP_SHELL =
  'z-[100001] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] shadow-lg'

function getTabIcon(tab) {
  if (CORE_TAB_ICONS[tab.id]) return CORE_TAB_ICONS[tab.id]
  return getPropertyIcon(tab.field?.icon)
}

function RecordTabMenu({ x, y, onClose }) {
  const { state, dispatch } = useApp()
  const ref = useRef(null)
  const editMode = state.recordEditMode

  useEffect(() => {
    const handler = (e) => {
      if (ref.current?.contains(e.target)) return
      onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const startEdit = () => {
    dispatch({ type: 'SET_TAB', payload: 'record' })
    dispatch({ type: 'SET_RECORD_EDIT_MODE', payload: true })
    onClose()
  }

  const endEdit = () => {
    dispatch({ type: 'SET_RECORD_EDIT_MODE', payload: false })
    onClose()
  }

  if (!overlayRoot) return null

  return createPortal(
    <div
      ref={ref}
      data-popup-root
      data-record-tab-menu
      className={`${POPUP_SHELL} min-w-[120px] py-1`}
      style={{ position: 'fixed', left: x, top: y, WebkitAppRegion: 'no-drag' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {!editMode ? (
        <button
          type="button"
          onClick={startEdit}
          className="block w-full px-3 py-2 text-left text-xs hover:bg-black/5"
        >
          편집
        </button>
      ) : (
        <button
          type="button"
          onClick={endEdit}
          className="block w-full px-3 py-2 text-left text-xs hover:bg-black/5"
        >
          편집 종료
        </button>
      )}
    </div>,
    overlayRoot
  )
}

function FilterMenuContent() {
  const { state, dispatch } = useApp()
  const selected = state.filterTagIds || []

  const toggle = (tagId) => {
    const next = selected.includes(tagId)
      ? selected.filter((id) => id !== tagId)
      : [...selected, tagId]
    dispatch({ type: 'SET_FILTER_TAGS', payload: next })
  }

  return (
    <div className="w-56 p-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium">태그 필터</span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_FILTER_TAGS', payload: [] })}
            className="text-[10px] text-[var(--color-accent)] hover:underline"
          >
            초기화
          </button>
        )}
      </div>
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {state.tags.map((tag) => {
          const active = selected.includes(tag.id)
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                active ? 'bg-[var(--color-accent)]/15 font-medium' : 'hover:bg-black/5'
              }`}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: resolveTagDisplayColor(tag, state.settings) }}
              />
              <span className="flex-1 truncate">{tag.name}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{tag.category}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] text-[var(--color-text-muted)]">
        선택한 태그를 모두 포함한 작품만 표시
      </p>
      {selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selected.map((id) => {
            const tag = state.tags.find((t) => t.id === id)
            if (!tag) return null
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px]"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: resolveTagDisplayColor(tag, state.settings) }}
                />
                {tag.name}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SearchMenuContent({ onClose }) {
  const { state, dispatch } = useApp()
  const [, startTransition] = useTransition()
  const inputRef = useRef(null)
  const [query, setQuery] = useState(state.searchQuery || '')
  const debouncedQuery = useDebouncedValue(query, 180)
  const deferredQuery = useDeferredValue(debouncedQuery)

  const listIndex = useMemo(
    () => buildRecordListIndex(state.records),
    [state.records]
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    startTransition(() => {
      dispatch({ type: 'SET_SEARCH', payload: debouncedQuery })
    })
  }, [debouncedQuery, dispatch, startTransition])

  const results = useMemo(
    () => searchRecordsWithReview(state.records, deferredQuery, 40, listIndex),
    [state.records, deferredQuery, listIndex]
  )

  return (
    <div className="w-72 p-2">
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5">
        <Search size={14} className="shrink-0 text-[var(--color-text-muted)]" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목, 저자, 본문 검색..."
          style={{ WebkitAppRegion: 'no-drag' }}
          className="min-w-0 flex-1 bg-transparent text-xs outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              startTransition(() => {
                dispatch({ type: 'SET_SEARCH', payload: '' })
              })
            }}
            className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            지우기
          </button>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto">
        {debouncedQuery.trim() && results.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-[var(--color-text-muted)]">
            검색 결과가 없습니다
          </p>
        )}
        {results.map((rec) => (
          <button
            key={rec.id}
            type="button"
            onClick={() => {
              dispatch({ type: 'SET_TAB', payload: 'record' })
              dispatch({ type: 'SELECT_RECORD', payload: rec.id })
              onClose()
            }}
            className="block w-full rounded-md px-2 py-2 text-left hover:bg-[var(--color-accent)]/10"
          >
            <p className="truncate text-xs font-semibold">{rec.title}</p>
            {rec.author && (
              <p className="truncate text-[10px] text-[var(--color-text-muted)]">{rec.author}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function TabBar() {
  const { state, dispatch } = useApp()
  const visibleTabs = useVisibleTabs()
  const [, startTransition] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [recordTabMenu, setRecordTabMenu] = useState(null)
  const [bulkDeleteIds, setBulkDeleteIds] = useState(null)
  const [dragIdx, setDragIdx] = useState(null)
  /** 탭 클릭 즉시 하이라이트 — 무거운 목록 전환은 startTransition으로 양보 */
  const [visualTab, setVisualTab] = useState(state.activeTab)
  const menuRef = useRef(null)
  const sortRef = useRef(null)
  const searchRef = useRef(null)
  const filterRef = useRef(null)

  const allOrdered = getAllTabs(state.settings)

  useEffect(() => {
    setVisualTab(state.activeTab)
  }, [state.activeTab])

  useEffect(() => {
    if (!state.recordEditMode) {
      setRecordTabMenu(null)
    }
  }, [state.recordEditMode])

  const selectTab = (tabId) => {
    if (!tabId || tabId === visualTab) return
    setVisualTab(tabId)
    startTransition(() => {
      dispatch({ type: 'SET_TAB', payload: tabId })
    })
  }

  const handleTabDrop = (toIdx) => {
    if (dragIdx === null || dragIdx === toIdx) return
    const fromId = visibleTabs[dragIdx]?.id
    const toId = visibleTabs[toIdx]?.id
    if (!fromId || !toId) return
    const order = [...(state.settings.tabOrder || [])]
    const fromOrderIdx = order.indexOf(fromId)
    const toOrderIdx = order.indexOf(toId)
    if (fromOrderIdx < 0 || toOrderIdx < 0) return
    dispatch({ type: 'REORDER_TABS', payload: { from: fromOrderIdx, to: toOrderIdx } })
    setDragIdx(null)
  }

  const hasFilter = (state.filterTagIds || []).length > 0
  const hasSearch = Boolean(state.searchQuery?.trim())
  const recordSelectedCount = state.recordSelectedIds?.length || 0
  const recordEditMode = state.recordEditMode
  const activeSort = SORT_OPTIONS.find((o) => o.key === state.sortBy) || SORT_OPTIONS[1]
  const SortIcon = activeSort.Icon

  const confirmBulkDelete = () => {
    if (!bulkDeleteIds?.length) return
    dispatch({ type: 'DELETE_RECORDS', payload: [...bulkDeleteIds] })
    setBulkDeleteIds(null)
    resetInteractionLocks()
    window.mrecord?.focusWindow?.()
  }

  return (
    <div className="relative z-[70] flex items-center gap-2 border-b border-[var(--color-border)] px-5 pb-2" data-tab-bar>
      <button
        type="button"
        data-add-record
        onClick={() => {
          resetInteractionLocks()
          dispatch({ type: 'CREATE_NEW_RECORD', payload: { autoEditTitle: true } })
        }}
        className="mr-2 flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-[var(--color-accent)] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--color-accent)] hover:text-white"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <PenLine size={14} />
        기록하기
      </button>

      <nav className="flex flex-1 flex-wrap items-center gap-1">
        {visibleTabs.map((tab, idx) => {
          const Icon = getTabIcon(tab)
          const active = visualTab === tab.id
          return (
            <div
              key={tab.id}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleTabDrop(idx)}
              onDragEnd={() => setDragIdx(null)}
              className={`flex items-center ${dragIdx === idx ? 'opacity-50' : ''}`}
            >
              <div
                className={`cursor-grab active:cursor-grabbing ${tab.id === 'record' && recordSelectedCount > 0 && active ? 'flex items-center' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  onContextMenu={
                    tab.id === 'record'
                      ? (e) => {
                          e.preventDefault()
                          setRecordTabMenu({ x: e.clientX, y: e.clientY })
                        }
                      : undefined
                  }
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                    active
                      ? recordEditMode && tab.id === 'record'
                        ? 'bg-[var(--color-accent)] font-medium text-white ring-2 ring-[var(--color-accent)]/40 ring-offset-1'
                        : 'bg-[var(--color-accent)] font-medium text-white'
                      : 'text-[var(--color-text-muted)] hover:bg-black/5 hover:text-[var(--color-text)]'
                  }`}
                  style={{ WebkitAppRegion: 'no-drag' }}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              </div>
              {tab.id === 'record' && active && recordEditMode && recordSelectedCount > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setBulkDeleteIds([...state.recordSelectedIds])
                  }}
                  className="ml-0.5 flex items-center gap-0.5 rounded-md bg-red-500/90 px-1.5 py-1 text-[10px] font-medium text-white shadow-sm hover:bg-red-600"
                  title="선택한 작품 삭제"
                  style={{ WebkitAppRegion: 'no-drag' }}
                >
                  <Trash2 size={12} />
                  {recordSelectedCount}
                </button>
              )}
            </div>
          )
        })}
      </nav>

      <div className="relative flex shrink-0 items-center gap-1">
        <div ref={sortRef}>
          <button
            type="button"
            onClick={() => setSortOpen(!sortOpen)}
            className={`rounded-lg p-2 hover:bg-black/5 ${sortOpen ? 'bg-black/10 text-[var(--color-accent)]' : ''}`}
            title={`정렬: ${activeSort.label} (${state.sortDir === 'asc' ? '오름차순' : '내림차순'})`}
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <SortIcon size={16} />
          </button>
          <AnchoredPopup
            anchorRef={sortRef}
            open={sortOpen}
            onClose={() => setSortOpen(false)}
            className={`${POPUP_SHELL} w-44 py-1`}
          >
            <p className="px-3 py-1.5 text-[10px] text-[var(--color-text-muted)]">정렬</p>
            {SORT_OPTIONS.map(({ key, label, Icon }) => {
              const active = state.sortBy === key
              const dirLabel = state.sortDir === 'asc' ? '↑' : '↓'
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    startTransition(() => {
                      dispatch({ type: 'SET_SORT', payload: { key, toggle: true } })
                    })
                    setSortOpen(false)
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/[0.03] ${
                    active ? 'font-medium text-[var(--color-accent)]' : ''
                  }`}
                >
                  <Icon size={14} />
                  <span className="flex-1">{label}</span>
                  {active && <span className="text-xs text-[var(--color-text-muted)]">{dirLabel}</span>}
                </button>
              )
            })}
          </AnchoredPopup>
        </div>

        <div ref={searchRef}>
          <button
            type="button"
            onClick={() => setSearchOpen(!searchOpen)}
            className={`rounded-lg p-2 hover:bg-black/5 ${searchOpen || hasSearch ? 'text-[var(--color-accent)]' : ''}`}
            title="검색"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <Search size={16} />
          </button>
          <AnchoredPopup
            anchorRef={searchRef}
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            className={POPUP_SHELL}
          >
            <SearchMenuContent onClose={() => setSearchOpen(false)} />
          </AnchoredPopup>
        </div>

        <div ref={filterRef}>
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            className={`rounded-lg p-2 hover:bg-black/5 ${hasFilter ? 'text-[var(--color-accent)]' : ''}`}
            title="태그 필터"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <Filter size={16} />
          </button>
          <AnchoredPopup
            anchorRef={filterRef}
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            className={POPUP_SHELL}
          >
            <FilterMenuContent />
          </AnchoredPopup>
        </div>

        <LockToggle />
        <ViewModeToggle />

        <div className="relative">
          <DecorateButton />
        </div>

        <div ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className={`rounded-lg p-2 hover:bg-black/5 ${menuOpen ? 'bg-black/10 text-[var(--color-accent)]' : ''}`}
            title="속성바 표시 편집"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <SlidersHorizontal size={16} />
          </button>
          <AnchoredPopup
            anchorRef={menuRef}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            className={`${POPUP_SHELL} max-h-80 w-52 overflow-y-auto py-1`}
          >
            <p className="px-3 py-1.5 text-[10px] text-[var(--color-text-muted)]">속성바 표시</p>
            {allOrdered.map((tab) => {
              const Icon = getTabIcon(tab)
              const isVisible = (state.settings.visibleTabs || []).includes(tab.id)
              return (
                <div
                  key={tab.id}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-black/[0.03]"
                >
                  {Icon && <Icon size={14} className="shrink-0 text-[var(--color-text-muted)]" />}
                  <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'TOGGLE_TAB_VISIBILITY', payload: tab.id })}
                    className="shrink-0 rounded p-0.5 hover:bg-black/5"
                  >
                    {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </div>
              )
            })}
          </AnchoredPopup>
        </div>
      </div>

      {recordTabMenu && (
        <RecordTabMenu
          x={recordTabMenu.x}
          y={recordTabMenu.y}
          onClose={() => setRecordTabMenu(null)}
        />
      )}

      {bulkDeleteIds && (
        <DeleteConfirmDialog
          message="선택한 작품들을 삭제하시겠습니까?"
          showSkipAsk={false}
          onConfirm={confirmBulkDelete}
          onCancel={() => setBulkDeleteIds(null)}
        />
      )}
    </div>
  )
}
