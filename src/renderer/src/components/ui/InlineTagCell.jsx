import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { randomTagColor, resolveTagDisplayColor } from '../../utils/tagColorHelpers'
import TagBadge from './TagBadge'

const overlayRoot = document.getElementById('overlay-root')

function InlineTagCell({
  record,
  category,
  categoryTags: categoryTagsProp,
  settings: settingsProp,
  locked,
  onUpdate
}) {
  const { state, dispatch } = useApp()
  const settings = settingsProp ?? state.settings
  const categoryTags = categoryTagsProp ?? state.tags.filter((t) => t.category === category)

  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [menuPos, setMenuPos] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const inputRef = useRef(null)

  const selectedIds = record.tagIds || []
  const selected = categoryTags.filter((t) => selectedIds.includes(t.id))

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
      setAdding(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    const menuHeight = 220
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < menuHeight && rect.top > menuHeight
    setMenuPos({
      left: Math.min(rect.left, window.innerWidth - 188),
      top: openUp ? rect.top - 8 : rect.bottom + 4,
      openUp
    })
    setOpen(true)
  }

  const toggleTag = (tagId) => {
    const ids = record.tagIds || []
    if (ids.includes(tagId)) {
      onUpdate({ tagIds: ids.filter((id) => id !== tagId) })
    } else {
      onUpdate({ tagIds: [...ids, tagId] })
    }
  }

  const addTag = () => {
    const name = newName.trim()
    if (!name) return
    const id = `tag-${Date.now()}`
    const headerColor = randomTagColor(settings)
    dispatch({
      type: 'ADD_TAG',
      payload: { id, name, colorId: 'pastel-pink', category, headerColor }
    })
    onUpdate({ tagIds: [...(record.tagIds || []), id] })
    setNewName('')
    setAdding(false)
  }

  const menu = open && !locked && menuPos && (
    <>
      <div
        ref={menuRef}
        data-popup-root
        className="fixed z-[99999] w-44 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-2 shadow-lg"
        style={{
          left: menuPos.left,
          top: menuPos.top,
          transform: menuPos.openUp ? 'translateY(-100%)' : undefined,
          WebkitAppRegion: 'no-drag'
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="mb-1 px-1 text-[10px] font-medium text-[var(--color-text-muted)]">{category}</p>
        <div className="max-h-40 space-y-0.5 overflow-y-auto">
          {categoryTags.map((t) => {
            const active = selectedIds.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTag(t.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                  active ? 'bg-[var(--color-accent)]/15 font-medium' : 'hover:bg-black/5'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: resolveTagDisplayColor(t, settings) }}
                />
                <span className="truncate">{t.name}</span>
              </button>
            )
          })}
        </div>
        {adding ? (
          <div className="mt-2 flex gap-1 border-t border-[var(--color-border)] pt-2">
            <input
              ref={inputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addTag()
                if (e.key === 'Escape') setAdding(false)
              }}
              placeholder="새 태그"
              className="min-w-0 flex-1 rounded border border-[var(--color-border)] px-2 py-1 text-xs outline-none"
            />
            <button
              type="button"
              onClick={addTag}
              className="rounded bg-[var(--color-accent)] px-2 py-1 text-[10px] text-white"
            >
              추가
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[var(--color-border)] py-1.5 text-[10px] text-[var(--color-text-muted)] hover:bg-black/5"
          >
            <Plus size={12} />
            새 태그
          </button>
        )}
      </div>
    </>
  )

  return (
    <>
      <div
        className="relative min-w-[72px] w-full"
        data-inline-edit
        data-no-side-open
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button
          ref={btnRef}
          type="button"
          disabled={locked}
          onClick={(e) => {
            e.stopPropagation()
            if (locked) return
            if (open) {
              setOpen(false)
              setAdding(false)
            } else {
              openMenu()
            }
          }}
          className={`flex min-h-[28px] w-full flex-wrap items-center gap-1 rounded-md px-1 py-0.5 text-left ${
            locked ? '' : 'hover:bg-black/[0.04]'
          }`}
          title="클릭: 태그 선택·추가"
        >
          {selected.length ? (
            selected.map((t) => <TagBadge key={t.id} tag={t} settings={settings} small />)
          ) : (
            <span className="text-[var(--color-text-muted)]">—</span>
          )}
        </button>
      </div>
      {menu && (overlayRoot ? createPortal(menu, overlayRoot) : menu)}
    </>
  )
}

export default memo(InlineTagCell)
