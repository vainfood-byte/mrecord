import { useMemo, useState } from 'react'

import { GripVertical, Palette, Plus } from 'lucide-react'

import { useApp } from '../../context/AppContext'
import { useRecordListView } from '../../hooks/useRecordListView'

import { resolveTagDisplayColor } from '../../utils/tagColorHelpers'

import { contrastText } from '../../utils/colorUtils'

import { TagBlockAddCard } from '../../components/ui/AddRecordCard'

import TagColorPalettePopover from '../../components/ui/TagColorPalettePopover'

import { isRecordLocked } from '../../components/layout/LockToggle'

import { TAG_BLOCK_SIZES, getTagBlockDimensions } from '../../constants/tagBlockSizes'

function orderTags(tags, savedOrder = []) {
  const byId = new Map(tags.map((t) => [t.id, t]))
  const ordered = savedOrder.filter((id) => byId.has(id)).map((id) => byId.get(id))
  const rest = tags.filter((t) => !savedOrder.includes(t.id))
  return [...ordered, ...rest]
}

function TagBlockSizeMenu({ x, y, current, onSelect, onClose }) {
  return (
    <>
      <div className="fixed inset-0 z-[200]" onMouseDown={onClose} />
      <div
        data-popup-root
        className="fixed z-[201] min-w-[140px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
        style={{ left: x, top: y, WebkitAppRegion: 'no-drag' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="px-3 py-1.5 text-[10px] font-medium text-[var(--color-text-muted)]">카드 크기 변경</p>
        {Object.entries(TAG_BLOCK_SIZES).map(([key, { label }]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              onSelect(key)
              onClose()
            }}
            className={`block w-full px-3 py-2 text-left text-xs hover:bg-black/5 ${
              current === key ? 'bg-[var(--color-accent)]/10 font-medium text-[var(--color-accent)]' : ''
            }`}
          >
            {label}
            {current === key ? ' ✓' : ''}
          </button>
        ))}
      </div>
    </>
  )
}

function TagBlock({
  tag,
  records,
  blockColor,
  blockWidth,
  blockMinHeight,
  settings,
  lockSettings,
  onOpenRecord,
  onColorChange,
  onContextMenu,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dragging
}) {
  const [colorPicker, setColorPicker] = useState(null)
  const bg = blockColor

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
      data-tag-block
      className={`flex shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-sm transition-opacity ${
        dragging ? 'opacity-50' : ''
      }`}
      style={{ width: blockWidth, minHeight: blockMinHeight, WebkitAppRegion: 'no-drag' }}
    >
      <div
        data-tag-block-header
        className="relative flex cursor-grab items-center gap-1.5 border-b border-black/5 px-3 py-2 active:cursor-grabbing"
        style={{ backgroundColor: bg, color: contrastText(bg) }}
      >
        <GripVertical size={14} className="shrink-0 opacity-60" />
        <span
          data-tag-block-title
          className="min-w-0 flex-1 truncate pr-5 text-sm font-medium leading-none"
        >
          {tag.name}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setColorPicker({ x: e.clientX, y: e.clientY + 8 })
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 opacity-70 hover:bg-black/10 hover:opacity-100"
          title="블록 색상 변경"
        >
          <Palette size={14} />
        </button>
        {colorPicker && (
          <TagColorPalettePopover
            value={bg.startsWith('#') && bg.length >= 7 ? bg.slice(0, 7) : bg}
            x={colorPicker.x}
            y={colorPicker.y}
            settings={settings}
            onSelect={onColorChange}
            onClose={() => setColorPicker(null)}
          />
        )}
      </div>

      <div className="flex min-h-[120px] flex-1 flex-col p-2">
        <div className="flex min-h-[108px] flex-1 flex-col overflow-y-auto rounded-lg bg-transparent p-2" data-tag-block-scroll>
          {records.length === 0 ? (
            <p className="flex flex-1 items-center justify-center px-1 py-4 text-center text-xs text-[var(--color-text-muted)]">
              작품 없음
            </p>
          ) : (
            <ul className="space-y-1">
              {records.map((rec) => {
                const locked = isRecordLocked(rec, lockSettings)
                return (
                <li key={rec.id}>
                  <button
                    type="button"
                    data-tag-record-item
                    data-open-record
                    onClick={() => !locked && onOpenRecord(rec.id)}
                    disabled={locked}
                    className={`block w-full truncate rounded-md border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-2 py-1 text-left text-xs font-medium leading-snug shadow-sm transition-colors ${
                      locked
                        ? 'blur-sm select-none'
                        : 'hover:bg-[var(--color-accent)]/10 hover:text-[var(--color-accent)]'
                    }`}
                  >
                    {rec.title}
                  </button>
                </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TagPropertyView({ field }) {
  const { state, dispatch } = useApp()
  const records = useRecordListView().records
  const [dragIdx, setDragIdx] = useState(null)
  const [sizeMenu, setSizeMenu] = useState(null)

  const blockSize = state.settings.tagBlockSize || 'large'
  const { width: blockWidth, minHeight: blockMinHeight } = getTagBlockDimensions(blockSize)

  const lockSettings = state.settings.lockSettings

  const category = field.tagCategory || field.label
  const tags = useMemo(
    () => state.tags.filter((t) => t.category === category),
    [state.tags, category]
  )

  const savedOrder = state.settings.tagBlockOrders?.[field.id] || []
  const orderedTags = useMemo(() => orderTags(tags, savedOrder), [tags, savedOrder])

  const recordsByTag = useMemo(() => {
    const map = new Map()
    for (let i = 0; i < orderedTags.length; i++) {
      map.set(orderedTags[i].id, [])
    }
    for (let i = 0; i < records.length; i++) {
      const rec = records[i]
      const ids = rec.tagIds
      if (!ids?.length) continue
      for (let j = 0; j < ids.length; j++) {
        const list = map.get(ids[j])
        if (list) list.push(rec)
      }
    }
    return map
  }, [orderedTags, records])

  const handleDrop = (toIdx) => {
    if (dragIdx === null || dragIdx === toIdx) return
    const ids = orderedTags.map((t) => t.id)
    const [moved] = ids.splice(dragIdx, 1)
    ids.splice(toIdx, 0, moved)
    dispatch({ type: 'REORDER_TAG_BLOCKS', payload: { fieldId: field.id, order: ids } })
    setDragIdx(null)
  }

  const openSizeMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setSizeMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <span
        data-export-hide
        className="mb-2 block text-xs text-[var(--color-text-muted)]"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        ※ 태그형 속성 카드에서는 작품명 텍스트 크기 변경을 지원하지 않습니다.
      </span>
      <div className="flex flex-col" style={{ minHeight: blockMinHeight }} data-tag-export-root>
        <div
          data-tag-block-grid
          className="flex flex-1 flex-wrap content-start items-start gap-3 pb-2"
          style={{ WebkitAppRegion: 'no-drag' }}
          onContextMenu={openSizeMenu}
        >
          {orderedTags.map((tag, idx) => (
            <TagBlock
              key={tag.id}
              tag={tag}
              records={recordsByTag.get(tag.id) || []}
              blockColor={resolveTagDisplayColor(tag, state.settings)}
              blockWidth={blockWidth}
              blockMinHeight={blockMinHeight}
              settings={state.settings}
              lockSettings={lockSettings}
              onColorChange={(headerColor) =>
                dispatch({ type: 'UPDATE_TAG', payload: { ...tag, headerColor } })
              }
              onOpenRecord={(id) => dispatch({ type: 'SELECT_RECORD', payload: id })}
              onContextMenu={openSizeMenu}
              draggable
              dragging={dragIdx === idx}
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => setDragIdx(null)}
            />
          ))}

          <TagBlockAddCard
            onClick={() => dispatch({ type: 'CREATE_NEW_RECORD' })}
            width={blockWidth}
            minHeight={blockMinHeight}
          />

          {orderedTags.length === 0 && (
            <p className="py-12 text-center text-sm text-[var(--color-text-muted)]">
              {field.label} 태그가 없습니다
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => dispatch({ type: 'CREATE_NEW_RECORD' })}
          data-export-hide
          className="mt-2 flex w-fit items-center gap-1 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <Plus size={14} /> 새 페이지
        </button>
      </div>

      {sizeMenu && (
        <TagBlockSizeMenu
          x={sizeMenu.x}
          y={sizeMenu.y}
          current={blockSize}
          onSelect={(key) =>
            dispatch({ type: 'UPDATE_SETTINGS', payload: { tagBlockSize: key } })
          }
          onClose={() => setSizeMenu(null)}
        />
      )}
    </>
  )
}
