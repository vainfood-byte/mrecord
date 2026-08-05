import { useEffect, useRef, useState } from 'react'

export default function InlineTextCell({
  value,
  onSave,
  onActivate,
  locked,
  lockedLabel = '🔒',
  className = '',
  inputClassName = '',
  title = '더블클릭하여 수정',
  activateDelay = 250
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef(null)
  const activateTimerRef = useRef(null)

  useEffect(() => () => clearTimeout(activateTimerRef.current), [])

  if (locked) return <>{lockedLabel}</>

  const startEdit = (e) => {
    e?.stopPropagation?.()
    clearTimeout(activateTimerRef.current)
    activateTimerRef.current = null
    setDraft(value)
    setEditing(true)
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }

  const stopBubble = (e) => e.stopPropagation()

  const handleClick = (e) => {
    e.stopPropagation()
    if (!onActivate) return
    clearTimeout(activateTimerRef.current)
    activateTimerRef.current = setTimeout(() => {
      activateTimerRef.current = null
      onActivate()
    }, activateDelay)
  }

  const handleDoubleClick = (e) => {
    e.stopPropagation()
    if (onActivate) {
      clearTimeout(activateTimerRef.current)
      activateTimerRef.current = null
    }
    startEdit(e)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        data-inline-edit
        data-no-side-open
        value={draft}
        onClick={stopBubble}
        onMouseDown={stopBubble}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const trimmed = draft.trim()
          if (trimmed !== (value || '').trim()) onSave(trimmed)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.target.blur()
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        className={
          inputClassName ||
          'w-full min-w-[80px] rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-sm outline-none'
        }
      />
    )
  }

  return (
    <span
      data-inline-edit={onActivate ? undefined : true}
      data-record-title={onActivate ? true : undefined}
      onClick={onActivate ? handleClick : stopBubble}
      onMouseDown={stopBubble}
      onDoubleClick={handleDoubleClick}
      className={className}
      title={title}
    >
      {value || '-'}
    </span>
  )
}