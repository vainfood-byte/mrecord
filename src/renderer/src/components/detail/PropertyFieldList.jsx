import { useState, useEffect, useRef, useMemo, memo } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUpRight,
  Award,
  Bell,
  BookOpen,
  Bookmark,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Film,
  Flag,
  Flame,
  Globe,
  Hash,
  Heart,
  Image,
  Layers,
  Link2,
  List,
  Mail,
  MapPin,
  MessageSquare,
  Moon,
  Music,
  Palette,
  PenLine,
  Plus,
  Radio,
  Skull,
  SlidersHorizontal,
  Star,
  Sun,
  Tag,
  Trash2,
  Trophy,
  User,
  Users,
  X,
  Zap
} from 'lucide-react'
import { useApp, useSelectedRecord, useTagsMap } from '../../context/AppContext'
import { useOutsideDismiss } from '../../hooks/useOutsideDismiss'
import StarRating, { RATING_ICON_OPTIONS } from '../ui/StarRating'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { TAG_COLOR_PALETTE } from '../../data/propertyTypes'
import { randomTagColor, resolveTagDisplayColor } from '../../utils/tagColorHelpers'
import { TAG_TYPE_FIELD_IDS } from '../../data/propertyTypes'
import { contrastText } from '../../utils/colorUtils'
import { debounce } from '../../utils/debounce'
import ColorPickerPopover from '../ui/ColorPickerPopover'
import { ensurePaletteSlots } from '../../utils/colorPickerHelpers'
import YearPickerPopover from '../ui/YearPickerPopover'
import InlineDateCell from '../ui/InlineDateCell'
import { getRecordRatingIcon } from '../../utils/ratingHelpers'
import { DATE_FORMAT_OPTIONS } from '../../utils/dateFieldFormat'
import { PROPERTY_ICON_OPTIONS, getPropertyIcon } from '../../constants/propertyIcons'
import { OVERLAY_ABOVE_SIDE_PANEL } from '../../constants/overlayZIndex'

export { PROPERTY_ICON_OPTIONS }

function formatDate(d) {
  if (!d) return ''
  try {
    return format(new Date(d), 'yyyy년 M월 d일', { locale: ko })
  } catch {
    return d
  }
}

function formatDateTime(d) {
  if (!d) return '-'
  try {
    return format(new Date(d), 'yyyy년 M월 d일 a h:mm', { locale: ko })
  } catch {
    return d
  }
}

function isTagTypeField(field) {
  return field.type === 'tags' || field.type === 'tag' || TAG_TYPE_FIELD_IDS.includes(field.id)
}

import DeleteConfirmDialog from '../ui/DeleteConfirmDialog'

const overlayRoot = document.getElementById('overlay-root')

function TagChip({ text, color, onTextClick, onDoubleClick, onContextMenu, onRemove, removeTitle, clickTitle, small = false }) {
  const bg = color || '#E0E0E0'
  return (
    <span className="relative inline-flex max-w-full">
      <button
        type="button"
        onClick={onTextClick}
        onDoubleClick={(e) => {
          e.preventDefault()
          onDoubleClick?.(e)
        }}
        onContextMenu={(e) => {
          if (!onContextMenu) return
          e.preventDefault()
          e.stopPropagation()
          onContextMenu(e)
        }}
        className={`inline-flex max-w-full items-center truncate rounded-full border border-black/5 py-0.5 whitespace-nowrap ${
          onRemove ? 'pl-2 pr-4' : 'px-2'
        } ${small ? 'text-[10px]' : 'text-xs'}`}
        style={{ backgroundColor: bg, color: contrastText(bg) }}
        title={clickTitle}
      >
        {text || '—'}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-text-muted)] text-[8px] leading-none text-white hover:bg-red-500"
          title={removeTitle}
        >
          <X size={8} strokeWidth={3} />
        </button>
      )}
    </span>
  )
}

function TagEditor({ text, color, onSave, onClose, mode = 'both', selectAll = false, anchor }) {
  const { state, dispatch } = useApp()
  const [val, setVal] = useState(text || '')
  const [col, setCol] = useState(color || TAG_COLOR_PALETTE[0])
  const [showCustom, setShowCustom] = useState(mode !== 'text')
  const [pickerPos, setPickerPos] = useState(null)
  const pickerPauseRef = useRef(false)
  const pickerReadyAtRef = useRef(0)
  const inputRef = useRef(null)
  const pendingPickRef = useRef(null)
  const colorOnly = mode === 'color'
  const textOnly = mode === 'text'
  const debouncedSaveRef = useRef(null)
  const popoverRef = useRef(null)

  const customOnly = state.settings.tagCustomColorOnly
  const customPalette = ensurePaletteSlots(state.settings.tagCustomPalette, 10)
  const baseColors = customOnly ? [] : TAG_COLOR_PALETTE
  const customPaletteOpen = customOnly || showCustom

  useOutsideDismiss(popoverRef, true, onClose, { pauseRef: pickerPauseRef })

  useEffect(() => {
    if (!selectAll || !inputRef.current) return
    inputRef.current.focus()
    inputRef.current.select()
  }, [selectAll])

  useEffect(() => {
    if (!colorOnly) return undefined
    const save = debounce((nextColor) => onSave(text, nextColor), 150)
    debouncedSaveRef.current = save
    return () => {
      save.cancel()
    }
  }, [colorOnly, onSave, text])

  const pickColor = (nextColor, { keepOpen = false } = {}) => {
    setCol(nextColor)
    if (colorOnly) {
      onSave(text, nextColor)
      if (!keepOpen) onClose()
    }
  }

  const addCustomColor = (hex) => {
    if (!hex) return

    const { mode: pickMode, index } = pendingPickRef.current || {}
    if (pickMode === 'replace' && index != null) {
      const next = [...customPalette]
      next[index] = hex
      dispatch({ type: 'UPDATE_SETTINGS', payload: { tagCustomPalette: next } })
      pickColor(hex, { keepOpen: true })
    } else if (pickMode === 'fill' && index != null) {
      const next = [...customPalette]
      next[index] = hex
      dispatch({ type: 'UPDATE_SETTINGS', payload: { tagCustomPalette: next } })
      pickColor(hex, { keepOpen: true })
    } else if (pickMode === 'append') {
      const next = [...customPalette]
      const emptyIdx = next.findIndex((c) => !c)
      if (emptyIdx >= 0) next[emptyIdx] = hex
      else if (!next.includes(hex)) next.push(hex)
      dispatch({ type: 'UPDATE_SETTINGS', payload: { tagCustomPalette: next } })
      pickColor(hex, { keepOpen: true })
    } else {
      pickColor(hex)
    }
    pendingPickRef.current = null
  }

  const openPickerAt = (e, pick) => {
    e.preventDefault()
    e.stopPropagation()
    pendingPickRef.current = pick
    pickerReadyAtRef.current = Date.now()
    pickerPauseRef.current = true
    setPickerPos({ x: e.clientX, y: e.clientY + 8 })
  }

  const renderCustomSlot = (color, index) => {
    if (!color) {
      return (
        <button
          key={`empty-${index}`}
          type="button"
          onClick={(e) => openPickerAt(e, { mode: 'fill', index })}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[var(--color-border)] bg-[#E8E8E8] text-[var(--color-text-muted)] hover:bg-[#DDDDDD]"
          title="색상 추가"
        >
          +
        </button>
      )
    }
    return (
      <button
        key={`slot-${index}-${color}`}
        type="button"
        onClick={() => pickColor(color)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          openPickerAt(e, { mode: 'replace', index })
        }}
        title="우클릭: 색상 교체"
        className={`h-9 w-9 rounded-full border ${col === color ? 'ring-2 ring-[var(--color-accent)]' : 'border-black/10'}`}
        style={{ backgroundColor: color }}
      />
    )
  }

  const renderBaseColor = (c) => (
    <button
      key={c}
      type="button"
      onClick={() => pickColor(c)}
      className={`h-8 w-8 rounded-full border ${col === c ? 'ring-2 ring-[var(--color-accent)]' : 'border-black/10'}`}
      style={{ backgroundColor: c }}
    />
  )

  const left = anchor ? Math.min(anchor.left, window.innerWidth - 300) : 0
  const top = anchor ? Math.min(anchor.top, window.innerHeight - 400) : 0

  const panel = (
    <div
      ref={popoverRef}
      data-popup-root
      data-tag-editor
      className="fixed w-72 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-4 shadow-lg"
      style={{ left, top, zIndex: OVERLAY_ABOVE_SIDE_PANEL, WebkitAppRegion: 'no-drag' }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {textOnly && (
        <>
          <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">태그명 변경</p>
          <input
            ref={inputRef}
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const next = val.trim()
                if (!next) return
                onSave(next, col)
                onClose()
              }
            }}
            className="mb-2 w-full rounded border border-[var(--color-border)] px-2 py-1 text-xs outline-none"
            placeholder="태그 이름"
            onMouseDown={(e) => e.stopPropagation()}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const next = val.trim()
                if (!next) return
                onSave(next, col)
                onClose()
              }}
              className="flex-1 rounded bg-[var(--color-accent)] py-2 text-xs text-white"
            >
              저장
            </button>
            <button type="button" onClick={onClose} className="rounded border px-3 py-2 text-xs">
              취소
            </button>
          </div>
        </>
      )}

      {!textOnly && (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-[var(--color-text-muted)]">배경 색상</p>
            {!customOnly && (
              <button
                type="button"
                onClick={() => setShowCustom((v) => !v)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  showCustom
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] hover:bg-black/5'
                }`}
              >
                커스텀
              </button>
            )}
          </div>

          {!customOnly && baseColors.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {baseColors.map((c) => renderBaseColor(c))}
            </div>
          )}

          {customPaletteOpen && (
            <div className="mb-3 min-h-[88px] rounded-lg border border-dashed border-[var(--color-border)] bg-[#F5F5F5] p-2.5">
              <div className="grid grid-cols-5 gap-2">
                {customPalette.map((c, idx) => renderCustomSlot(c, idx))}
              </div>
            </div>
          )}

          {pickerPos && (
            <ColorPickerPopover
              value={col}
              x={pickerPos.x}
              y={pickerPos.y}
              onPreview={(hex) => {
                setCol(hex)
                if (colorOnly) debouncedSaveRef.current?.(hex)
              }}
              onChange={addCustomColor}
              onClose={() => {
                setPickerPos(null)
                pickerPauseRef.current = false
                pendingPickRef.current = null
              }}
            />
          )}
        </>
      )}

      {!colorOnly && !textOnly && (
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => { onSave(val, col); onClose() }}
            className="flex-1 rounded bg-[var(--color-accent)] py-2 text-xs text-white"
          >
            저장
          </button>
          <button type="button" onClick={onClose} className="rounded border px-3 py-2 text-xs">
            취소
          </button>
        </div>
      )}

      {colorOnly && (
        <button type="button" onClick={onClose} className="w-full rounded border py-2 text-xs hover:bg-black/5">
          닫기
        </button>
      )}
    </div>
  )

  return overlayRoot ? createPortal(panel, overlayRoot) : panel
}

function TagContextMenu({ x, y, onRename, onColor, onDelete, onClose }) {
  useEffect(() => {
    const ignoreTarget = (target) =>
      target?.closest?.('[data-tag-context-menu]') ||
      target?.closest?.('[data-tag-list-panel] button') ||
      target?.closest?.('[data-tag-panel] button')

    const onPointerDown = (e) => {
      if (e.button === 2) return
      if (ignoreTarget(e.target)) return
      onClose()
    }
    const onContext = (e) => {
      if (ignoreTarget(e.target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('contextmenu', onContext, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('contextmenu', onContext, true)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 140)
  const top = Math.min(y, window.innerHeight - 120)
  const menu = (
    <div
      data-tag-context-menu
      className="fixed min-w-[128px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
      style={{ left, top, zIndex: OVERLAY_ABOVE_SIDE_PANEL, WebkitAppRegion: 'no-drag' }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onRename()
        }}
        className="block w-full px-3 py-2 text-left text-xs hover:bg-black/5"
      >
        태그명 변경
      </button>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onColor()
        }}
        className="block w-full px-3 py-2 text-left text-xs hover:bg-black/5"
      >
        색상 변경
      </button>
      <div className="my-0.5 border-t border-[var(--color-border)]" />
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
      >
        현재 태그 삭제
      </button>
    </div>
  )
  return overlayRoot ? createPortal(menu, overlayRoot) : menu
}

function sortCategoryTags(tags, field) {
  const list = [...tags]
  if (field.tagCategory === '등급') {
    list.sort((a, b) => {
      if (a.id === 'tag-19') return -1
      if (b.id === 'tag-19') return 1
      return a.name.localeCompare(b.name, 'ko')
    })
  }
  return list
}

function TagsFieldEditor({ field, record, tagFieldValues, onUpdate, focusRequest, onFocusHandled }) {
  const { state, dispatch } = useApp()
  const [tagEdit, setTagEdit] = useState(null)
  const [tagMenu, setTagMenu] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [expanded, setExpanded] = useState(true)
  const [addingTag, setAddingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const newTagInputRef = useRef(null)
  const tagPanelRef = useRef(null)

  useOutsideDismiss(
    tagPanelRef,
    addingTag,
    () => setAddingTag(false),
    { ignoreSelector: '[data-tag-editor], [data-color-picker-popover], [data-color-picker-native], [data-tag-context-menu], [data-delete-confirm-dialog]' }
  )

  const categoryTags = sortCategoryTags(
    state.tags.filter((t) => !field.tagCategory || t.category === field.tagCategory),
    field
  )
  const selectedIds = record.tagIds || []

  const openTagEdit = (t, mode = 'color', e, menuPoint) => {
    const el = e?.currentTarget || e?.target
    const rect = el?.getBoundingClientRect?.()
    const anchor = rect
      ? { left: rect.left, top: rect.bottom + 4 }
      : menuPoint
        ? { left: menuPoint.x, top: menuPoint.y + 4 }
        : null
    setTagEdit({
      fieldId: field.id,
      tagId: t.id,
      text: t.name,
      color:
        tagFieldValues[field.id]?.[`tag-${t.id}`]?.color ||
        resolveTagDisplayColor(t, state.settings),
      mode,
      anchor
    })
  }

  const openTagMenu = (t, e) => {
    setTagMenu({
      tagId: t.id,
      x: e.clientX,
      y: e.clientY
    })
  }

  useEffect(() => {
    if (!focusRequest) return
    setExpanded(true)
    onFocusHandled?.()
  }, [focusRequest, onFocusHandled])

  const saveTagEdit = (text, color) => {
    if (!tagEdit?.tagId) return
    const tag = state.tags.find((t) => t.id === tagEdit.tagId)
    if (!tag) return
    const nextName = String(text || '').trim()
    if (tagEdit.mode === 'text') {
      if (!nextName || nextName === tag.name) return
      dispatch({ type: 'UPDATE_TAG', payload: { ...tag, name: nextName } })
      return
    }
    if (color && tag.headerColor !== color) {
      dispatch({ type: 'UPDATE_TAG', payload: { ...tag, headerColor: color } })
    }
    onUpdate({
      tagFieldValues: {
        ...tagFieldValues,
        [field.id]: {
          ...(tagFieldValues[field.id] || {}),
          [`tag-${tagEdit.tagId}`]: { text: tag.name, color }
        }
      }
    })
  }

  const addNewTag = () => {
    const name = newTagName.trim()
    if (!name) return
    const id = `tag-${Date.now()}`
    const headerColor = randomTagColor(state.settings)
    dispatch({
      type: 'ADD_TAG',
      payload: { id, name, colorId: 'pastel-pink', category: field.tagCategory || '장르', headerColor }
    })
    onUpdate({ tagIds: [...selectedIds, id] })
    setAddingTag(false)
    setNewTagName('')
  }

  const addFromList = (tagId) => {
    if (!selectedIds.includes(tagId)) {
      onUpdate({ tagIds: [...selectedIds, tagId] })
    }
  }

  const confirmDeleteTag = () => {
    if (!deleteTarget) return
    dispatch({ type: 'DELETE_TAG', payload: deleteTarget })
    if (selectedIds.includes(deleteTarget)) {
      onUpdate({ tagIds: selectedIds.filter((id) => id !== deleteTarget) })
    }
    setDeleteTarget(null)
    setTagMenu(null)
  }

  const deselectTag = (tagId) => {
    onUpdate({ tagIds: selectedIds.filter((id) => id !== tagId) })
  }

  return (
    <div ref={tagPanelRef} data-tag-panel style={{ WebkitAppRegion: 'no-drag' }}>
      <div className="flex flex-wrap items-center gap-1">
        {categoryTags
          .filter((t) => selectedIds.includes(t.id))
          .map((t) => (
            <TagChip
              key={t.id}
              text={t.name}
              color={
                tagFieldValues[field.id]?.[`tag-${t.id}`]?.color ||
                resolveTagDisplayColor(t, state.settings)
              }
              onTextClick={() => deselectTag(t.id)}
              onDoubleClick={(e) => openTagEdit(t, 'color', e)}
              onContextMenu={(e) => openTagMenu(t, e)}
              clickTitle="클릭: 선택 취소 · 더블클릭: 색상 · 우클릭: 태그명/색상/삭제"
            />
          ))}
        {selectedIds.filter((id) => categoryTags.some((t) => t.id === id)).length === 0 && (
          <span className="text-sm text-[var(--color-text-muted)]">—</span>
        )}
        <button
          type="button"
          onClick={() => { setAddingTag(true); setNewTagName('') }}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-black/5"
          title="신규 태그 추가"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-black/5"
          title={expanded ? '태그 목록 닫기' : '태그 목록 열기'}
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {addingTag && (
        <div className="mt-1.5 flex gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
          <input
            ref={newTagInputRef}
            autoFocus
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNewTag()}
            placeholder="새 태그 이름"
            className="min-w-0 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs outline-none"
            onMouseDown={(e) => e.stopPropagation()}
          />
          <button type="button" onClick={addNewTag} className="rounded bg-[var(--color-accent)] px-2 text-xs text-white">
            추가
          </button>
          <button type="button" onClick={() => setAddingTag(false)} className="rounded border px-2 text-xs">
            취소
          </button>
        </div>
      )}

      {expanded && (
        <div
          className="mt-1.5 flex flex-wrap gap-1.5 rounded-lg border border-dashed border-[var(--color-border)] p-1.5"
          data-tag-list-panel
        >
          {categoryTags.map((t, i) => {
            const selected = selectedIds.includes(t.id)
            const bg =
              tagFieldValues[field.id]?.[`tag-${t.id}`]?.color ||
              resolveTagDisplayColor(t, state.settings, i)
            return (
              <TagChip
                key={t.id}
                text={t.name}
                color={bg}
                small
                onTextClick={() => {
                  if (selected) deselectTag(t.id)
                  else addFromList(t.id)
                }}
                onContextMenu={(e) => openTagMenu(t, e)}
                clickTitle={
                  selected
                    ? '클릭: 선택 취소 · 우클릭: 태그명/색상/삭제'
                    : '클릭: 선택 · 우클릭: 태그명/색상/삭제'
                }
              />
            )
          })}
        </div>
      )}

      {tagEdit?.fieldId === field.id && tagEdit?.tagId && (
        <TagEditor
          text={tagEdit.text}
          color={tagEdit.color}
          mode={tagEdit.mode || 'color'}
          selectAll={tagEdit.mode === 'text'}
          anchor={tagEdit.anchor}
          onSave={(text, color) => {
            saveTagEdit(text, color)
          }}
          onClose={() => setTagEdit(null)}
        />
      )}

      {tagMenu && (
        <TagContextMenu
          x={tagMenu.x}
          y={tagMenu.y}
          onClose={() => setTagMenu(null)}
          onRename={() => {
            const t = categoryTags.find((tag) => tag.id === tagMenu.tagId)
            if (t) {
              openTagEdit(t, 'text', null, { x: tagMenu.x, y: tagMenu.y })
            }
            setTagMenu(null)
          }}
          onColor={() => {
            const t = categoryTags.find((tag) => tag.id === tagMenu.tagId)
            if (t) {
              openTagEdit(t, 'color', null, { x: tagMenu.x, y: tagMenu.y })
            }
            setTagMenu(null)
          }}
          onDelete={() => {
            setDeleteTarget(tagMenu.tagId)
            setTagMenu(null)
          }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmDialog
          title="현재 태그 삭제"
          message="이 태그를 목록에서 삭제할까요?"
          showSkipAsk={false}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteTag}
        />
      )}
    </div>
  )
}

function YearFieldEditor({ value, onSave, records, fieldId }) {
  const [open, setOpen] = useState(false)
  const year = value ? String(value).slice(0, 4) : ''

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm hover:text-[var(--color-accent)]"
      >
        {year ? `${year}년` : '연도 선택'}
      </button>
      {open && (
        <YearPickerPopover
          value={year}
          records={records}
          fieldId={fieldId}
          onChange={onSave}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function recordEqualForPropertyEditor(a, b) {
  if (a === b) return true
  if (!a || !b || a.id !== b.id) return false
  const skip = new Set(['review', 'reviewSubtitle', 'reviewImages', 'volumeReviews'])
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (skip.has(key)) continue
    if (a[key] !== b[key]) return false
  }
  return true
}

function PropertyValueEditor({ field, record, tagsMap, onUpdate, focusRequest, onFocusHandled }) {
  const { state, dispatch } = useApp()
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [tagEdit, setTagEdit] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef(null)

  const tagFieldValues = record.tagFieldValues || {}

  const saveField = (key, value) => {
    onUpdate({ [key]: value })
  }

  const saveTagField = (fieldId, text, color) => {
    onUpdate({
      tagFieldValues: {
        ...tagFieldValues,
        [fieldId]: { text, color }
      },
      ...(fieldId !== 'rating' && fieldId !== 'genre' ? { [fieldId]: text } : {})
    })
  }

  useEffect(() => {
    if (!focusRequest || field.type !== 'link') return
    const val = record.link || record[field.id] || ''
    setEditText(val)
    setEditing(true)
    window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    onFocusHandled?.()
  }, [focusRequest, field.type, field.id, record.link, record, onFocusHandled])

  // 텍스트형
  if (field.type === 'text' || field.type === 'multiline' || field.type === 'memo' || field.type === 'custom') {
    const val = record[field.id] ?? record.customFields?.[field.id] ?? ''
    if (editing) {
      return (
        <input
          autoFocus
          value={editText}
          style={{ WebkitAppRegion: 'no-drag' }}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={() => {
            if (field.type === 'custom') {
              onUpdate({ customFields: { ...record.customFields, [field.id]: editText } })
            } else {
              saveField(field.id, editText)
            }
            setEditing(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          className="w-full rounded border border-[var(--color-border)] px-1.5 py-0.5 text-sm outline-none"
        />
      )
    }
    return (
      <button
        type="button"
        onClick={() => { setEditText(val); setEditing(true) }}
        className="w-full text-left text-sm hover:text-[var(--color-accent)]"
      >
        {val || <span className="text-[var(--color-text-muted)]">클릭하여 입력</span>}
      </button>
    )
  }

  // 달력형
  if (field.type === 'date') {
    const val = record[field.id] || record.customFields?.[field.id] || ''
    const dateFormat = field.dateFormat || 'full'

    const saveDate = (dateStr) => {
      if (field.id in (record.customFields || {}) || field.id.startsWith('custom-')) {
        onUpdate({ customFields: { ...record.customFields, [field.id]: dateStr } })
      } else {
        saveField(field.id, dateStr)
      }
    }

    return (
      <InlineDateCell
        value={val}
        onSave={saveDate}
        dateFormat={dateFormat}
        placeholder="날짜 선택"
        className="text-sm hover:text-[var(--color-accent)]"
      />
    )
  }

  // 연도형
  if (field.type === 'year') {
    const val = record[field.id] || record.customFields?.[field.id] || ''

    const saveYear = (year) => {
      const normalized = year ? String(year).slice(0, 4) : ''
      if (field.id in (record.customFields || {}) || field.id.startsWith('custom-')) {
        onUpdate({ customFields: { ...record.customFields, [field.id]: normalized } })
      } else {
        saveField(field.id, normalized)
      }
    }

    return (
      <YearFieldEditor
        value={val}
        onSave={saveYear}
        records={state.records}
        fieldId={field.id}
      />
    )
  }

  // 링크형
  if (field.type === 'link') {
    const val = record.link || record[field.id] || ''

    if (editing) {
      return (
        <input
          ref={inputRef}
          autoFocus
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={() => {
            saveField('link', editText)
            setEditing(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          placeholder="https://"
          className="w-full rounded border border-[var(--color-border)] px-1.5 py-0.5 text-sm outline-none"
        />
      )
    }
    if (val) {
      return (
        <div className="flex items-center gap-1">
          <a
            href={val.startsWith('http') ? val : `https://${val}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 truncate text-sm text-[var(--color-accent)] underline"
          >
            {val.replace(/^https?:\/\//, '').slice(0, 28)}
            <ArrowUpRight size={10} />
          </a>
          <button
            type="button"
            onClick={() => { setEditText(val); setEditing(true) }}
            className="text-[10px] text-[var(--color-text-muted)] hover:underline"
          >
            편집
          </button>
        </div>
      )
    }
    return (
      <button
        type="button"
        onClick={() => { setEditText(''); setEditing(true) }}
        className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
      >
        링크 추가
      </button>
    )
  }

  // 별점형
  if (field.type === 'rating') {
    const ratingVal =
      field.id === 'rating' ? record.rating || 0 : record.customFields?.[field.id] ?? 0
    const iconType = getRecordRatingIcon(record, field)

    const setRating = (r) => {
      if (field.id === 'rating') {
        saveField('rating', r)
      } else {
        onUpdate({ customFields: { ...record.customFields, [field.id]: r } })
      }
    }

    return (
      <StarRating
        rating={ratingVal}
        iconType={iconType}
        size={16}
        interactive
        onChange={setRating}
      />
    )
  }

  // 태그형 (다중 태그 — 장르/상태/사이트)
  if (field.type === 'tags') {
    return (
      <TagsFieldEditor
        field={field}
        record={record}
        tagFieldValues={tagFieldValues}
        onUpdate={onUpdate}
        focusRequest={focusRequest}
        onFocusHandled={onFocusHandled}
      />
    )
  }

  // 태그형 (단일 - 상태/출판사/연도)
  if (isTagTypeField(field)) {
    const tf = tagFieldValues[field.id]
    const displayText = tf?.text || record[field.id] || ''
    const displayColor = tf?.color

    return (
      <div className="relative">
        <div className="flex flex-wrap items-center gap-1">
          <TagChip
            text={displayText}
            color={displayColor}
            onTextClick={(e) => {
              const rect = e.currentTarget?.getBoundingClientRect?.()
              setTagEdit({
                fieldId: field.id,
                text: displayText,
                color: displayColor,
                anchor: rect ? { left: rect.left, top: rect.bottom + 4 } : null
              })
            }}
          />
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded p-0.5 hover:bg-black/5"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
        {tagEdit?.fieldId === field.id && !tagEdit?.tagId && (
          <TagEditor
            text={tagEdit.text}
            color={tagEdit.color}
            anchor={tagEdit.anchor}
            onSave={(text, color) => saveTagField(field.id, text, color)}
            onClose={() => setTagEdit(null)}
          />
        )}
      </div>
    )
  }

  return <span className="text-sm">{record[field.id] || '—'}</span>
}

const MemoPropertyValueEditor = memo(PropertyValueEditor, (prev, next) =>
  prev.field === next.field &&
  prev.tagsMap === next.tagsMap &&
  prev.focusRequest === next.focusRequest &&
  recordEqualForPropertyEditor(prev.record, next.record)
)

export default function PropertyFieldList({
  recordOverride,
  onRecordPatch,
  remoteMode = false,
  layoutMode = 'vertical'
}) {
  const { state, dispatch } = useApp()
  const selectedRecord = useSelectedRecord()
  const record = recordOverride ?? selectedRecord
  const tagsMap = useTagsMap()
  const [dragIdx, setDragIdx] = useState(null)
  const [renameId, setRenameId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [iconPickerId, setIconPickerId] = useState(null)
  const [ratingIconPickerId, setRatingIconPickerId] = useState(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [exportEditOpen, setExportEditOpen] = useState(false)
  const panelRef = useRef(null)
  const fields = useMemo(
    () => (state.settings.propertyFields || []).filter((f) => f.visible !== false),
    [state.settings.propertyFields]
  )

  const clearFocusProperty = () => dispatch({ type: 'CLEAR_FOCUS_PROPERTY' })

  useEffect(() => {
    const fieldId = state.focusPropertyFieldId
    if (!fieldId || !record) return
    if (state.detailPropertyCollapsed) {
      dispatch({ type: 'TOGGLE_DETAIL_PROPERTY_COLLAPSE' })
    }
    const timer = window.setTimeout(() => {
      const el = panelRef.current?.querySelector(`[data-property-field-id="${fieldId}"]`)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      const field = fields.find((f) => f.id === fieldId)
      if (field?.type === 'tags') {
        setTagEditActive((prev) => ({ ...prev, [fieldId]: true }))
      }
    }, 120)
    return () => window.clearTimeout(timer)
  }, [state.focusPropertyFieldId, fields, state.detailPropertyCollapsed, dispatch])

  const anyFieldPopup =
    Boolean(state.activePropertyMenu) ||
    Boolean(iconPickerId) ||
    Boolean(ratingIconPickerId) ||
    Boolean(renameId) ||
    addDialogOpen ||
    exportEditOpen

  useEffect(() => {
    if (!anyFieldPopup) return undefined

    const closeAll = () => {
      dispatch({ type: 'SET_PROPERTY_MENU', payload: null })
      setIconPickerId(null)
      setRatingIconPickerId(null)
      setRenameId(null)
      setAddDialogOpen(false)
      setExportEditOpen(false)
    }

    const onDown = (e) => {
      if (e.target.closest('[data-property-popup]')) return
      if (e.target.closest('[data-date-picker-portal]')) return
      closeAll()
    }

    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [anyFieldPopup, dispatch])

  if (!record) return null

  const collapsed = remoteMode ? false : state.detailPropertyCollapsed
  const visibleSet = new Set(state.settings.visibleTabs || [])
  const allFields = state.settings.propertyFields

  const updateRecord = (patch) => {
    if (onRecordPatch) {
      onRecordPatch(patch)
      return
    }
    dispatch({ type: 'UPDATE_RECORD', payload: { ...record, ...patch } })
  }

  const handleDragStart = (idx) => setDragIdx(idx)
  const handleDragOver = (e) => e.preventDefault()
  const handleDrop = (e, idx) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    const fromId = fields[dragIdx]?.id
    const toId = fields[idx]?.id
    if (!fromId || !toId) return
    dispatch({ type: 'REORDER_PROPERTIES', payload: { fromId, toId } })
    setDragIdx(null)
  }

  const openMenu = (fieldId) => {
    dispatch({
      type: 'SET_PROPERTY_MENU',
      payload: state.activePropertyMenu === fieldId ? null : fieldId
    })
    setIconPickerId(null)
  }

  const startRename = (field) => {
    setRenameId(field.id)
    setRenameValue(field.label)
    dispatch({ type: 'SET_PROPERTY_MENU', payload: null })
  }

  const commitRename = () => {
    if (renameId && renameValue.trim()) {
      dispatch({
        type: 'UPDATE_PROPERTY_FIELD',
        payload: { id: renameId, data: { label: renameValue.trim() } }
      })
    }
    setRenameId(null)
  }

  const addProperty = (propType) => {
    const id = `custom-${Date.now()}`
    const typeMap = {
      tag: { label: '새 태그', icon: 'Tag', type: 'tags', tagCategory: '기타' },
      rating: { label: '새 별점', icon: 'Star', type: 'rating', ratingIcon: 'star' },
      memo: { label: '새 메모', icon: 'PenLine', type: 'memo' },
      calendar: { label: '새 날짜', icon: 'Calendar', type: 'date', dateFormat: 'full' },
      link: { label: '새 링크', icon: 'Link2', type: 'link' }
    }
    const cfg = typeMap[propType]
    dispatch({
      type: 'ADD_PROPERTY_FIELD',
      payload: { id, ...cfg, visible: true, exportVisible: true }
    })
    setAddDialogOpen(false)
  }

  const getIcon = getPropertyIcon

  return (
    <div ref={panelRef} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">속성</span>
        <div className="flex items-center gap-0.5">
          {!remoteMode && (
            <>
              <button
                type="button"
                onClick={() => dispatch({ type: 'SET_PROPERTY_REMOTE_OPEN', payload: true })}
                className={`rounded p-1 hover:bg-black/5 ${state.propertyRemoteOpen ? 'text-[var(--color-accent)]' : ''}`}
                title="속성 리모컨"
              >
                <Radio size={14} />
              </button>
              <button
                type="button"
                onClick={() => setExportEditOpen(!exportEditOpen)}
                className={`rounded p-1 hover:bg-black/5 ${exportEditOpen ? 'text-[var(--color-accent)]' : ''}`}
                title="내보내기 표시 편집"
              >
                <SlidersHorizontal size={14} />
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: 'TOGGLE_DETAIL_PROPERTY_COLLAPSE' })}
                className="rounded p-1 hover:bg-black/5"
                title={collapsed ? '펼치기' : '접기'}
              >
                {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            </>
          )}
        </div>
      </div>

      {exportEditOpen && (
        <div
          data-property-popup
          className="mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2"
        >
          <p className="mb-1.5 text-[10px] font-medium text-[var(--color-text-muted)]">
            PNG 내보내기에 표시할 속성
          </p>
          <div className="space-y-1">
            {allFields.map((f) => (
              <label
                key={f.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-black/[0.03]"
              >
                <input
                  type="checkbox"
                  checked={f.exportVisible !== false}
                  onChange={() =>
                    dispatch({
                      type: 'UPDATE_PROPERTY_FIELD',
                      payload: {
                        id: f.id,
                        data: { exportVisible: f.exportVisible === false }
                      }
                    })
                  }
                />
                <span>{f.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {!collapsed && (
        <>
          <div
            className={
              layoutMode === 'horizontal'
                ? 'grid grid-cols-2 gap-1.5 lg:grid-cols-3'
                : 'space-y-1.5'
            }
          >
            {fields.map((field, idx) => {
              const FieldIcon = getIcon(field.icon)
              const menuOpen = state.activePropertyMenu === field.id

              return (
                <div
                  key={field.id}
                  data-property-field-id={field.id}
                  draggable={!remoteMode}
                  onDragStart={() => !remoteMode && handleDragStart(idx)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => !remoteMode && handleDrop(e, idx)}
                  onDragEnd={() => setDragIdx(null)}
                  className={`relative flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2.5 py-2 ${
                    remoteMode ? '' : 'cursor-grab active:cursor-grabbing'
                  } ${dragIdx === idx ? 'opacity-60' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => openMenu(field.id)}
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-bg)] hover:bg-black/5"
                  >
                    <FieldIcon size={14} className="text-[var(--color-text-muted)]" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-[var(--color-text-muted)]">
                      {renameId === field.id ? (
                        <input
                          data-property-popup
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => e.key === 'Enter' && commitRename()}
                          className="w-full rounded border border-[var(--color-border)] px-1 py-0.5 text-[10px]"
                          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        field.label
                      )}
                    </div>
                    <MemoPropertyValueEditor
                      field={field}
                      record={record}
                      tagsMap={tagsMap}
                      onUpdate={updateRecord}
                      focusRequest={state.focusPropertyFieldId === field.id}
                      onFocusHandled={clearFocusProperty}
                    />
                  </div>

                  {menuOpen && (
                    <div
                      data-property-popup
                      className="absolute left-8 top-full z-20 mt-1 w-36 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
                    >
                      <button
                        type="button"
                        onClick={() => startRename(field)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-black/5"
                      >
                        <PenLine size={12} /> 속성명 변경
                      </button>
                      <button
                        type="button"
                        onClick={() => setIconPickerId(iconPickerId === field.id ? null : field.id)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-black/5"
                      >
                        <Star size={12} /> 아이콘 변경
                      </button>
                      {field.type === 'rating' && (
                        <button
                          type="button"
                          onClick={() =>
                            setRatingIconPickerId(ratingIconPickerId === field.id ? null : field.id)
                          }
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-black/5"
                        >
                          <Heart size={12} /> 별점 아이콘
                        </button>
                      )}
                      {field.type === 'date' && (
                        <>
                          <p className="px-3 py-1 text-[10px] text-[var(--color-text-muted)]">
                            날짜 표시 형식
                          </p>
                          {DATE_FORMAT_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                dispatch({
                                  type: 'UPDATE_PROPERTY_FIELD',
                                  payload: { id: field.id, data: { dateFormat: opt.id } }
                                })
                                dispatch({ type: 'SET_PROPERTY_MENU', payload: null })
                              }}
                              className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-black/5 ${
                                (field.dateFormat || 'full') === opt.id
                                  ? 'font-medium text-[var(--color-accent)]'
                                  : ''
                              }`}
                            >
                              <Calendar size={12} /> {opt.label}
                            </button>
                          ))}
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'TOGGLE_TAB_VISIBILITY', payload: field.id })}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-black/5"
                      >
                        {visibleSet.has(field.id) ? (
                          <>
                            <EyeOff size={12} /> 속성바에서 숨기기
                          </>
                        ) : (
                          <>
                            <Eye size={12} /> 속성바에 표시
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'DELETE_PROPERTY_FIELD', payload: field.id })}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={12} /> 삭제
                      </button>
                    </div>
                  )}

                  {iconPickerId === field.id && (
                    <div
                      data-property-popup
                      className="absolute left-8 top-full z-30 mt-1 grid max-h-48 grid-cols-6 gap-1 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-2 shadow-lg"
                    >
                      {PROPERTY_ICON_OPTIONS.map(({ id, Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            dispatch({
                              type: 'UPDATE_PROPERTY_FIELD',
                              payload: { id: field.id, data: { icon: id } }
                            })
                            setIconPickerId(null)
                            dispatch({ type: 'SET_PROPERTY_MENU', payload: null })
                          }}
                          className="rounded p-1.5 hover:bg-black/5"
                        >
                          <Icon size={14} />
                        </button>
                      ))}
                    </div>
                  )}

                  {ratingIconPickerId === field.id && (
                    <div
                      data-property-popup
                      className="absolute left-8 top-full z-30 mt-1 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-2 shadow-lg"
                    >
                      {RATING_ICON_OPTIONS.map(({ id, Icon, label }) => {
                        const currentIcon = getRecordRatingIcon(record, field)
                        return (
                        <button
                          key={id}
                          type="button"
                          title={label}
                          onClick={() => {
                            if (field.id === 'rating') {
                              updateRecord({ ratingIcon: id })
                            } else {
                              updateRecord({
                                customFields: {
                                  ...record.customFields,
                                  [`${field.id}_icon`]: id
                                }
                              })
                            }
                            setRatingIconPickerId(null)
                            dispatch({ type: 'SET_PROPERTY_MENU', payload: null })
                          }}
                          className={`rounded p-1.5 hover:bg-black/5 ${
                            currentIcon === id ? 'bg-[var(--color-accent)]/15' : ''
                          }`}
                        >
                          <Icon size={14} />
                        </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="relative mt-2">
            <button
              type="button"
              onClick={() => setAddDialogOpen(!addDialogOpen)}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--color-border)] py-2 text-xs text-[var(--color-text-muted)] hover:bg-black/[0.03]"
            >
              <Plus size={14} /> 새 속성 추가
            </button>
            {addDialogOpen && (
              <div
                data-property-popup
                className="absolute bottom-full left-0 z-20 mb-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-2 shadow-lg"
              >
                <p className="mb-2 text-[10px] text-[var(--color-text-muted)]">속성 유형 선택</p>
                {[
                  ['tag', Tag, '태그형 속성'],
                  ['rating', Star, '별점형 속성'],
                  ['memo', PenLine, '메모형 속성'],
                  ['calendar', Calendar, '달력형 속성'],
                  ['link', Link2, '링크형 속성']
                ].map(([type, Icon, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addProperty(type)}
                    className="mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs hover:bg-black/5"
                  >
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export { formatDateTime }
