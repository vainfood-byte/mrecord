import { useEffect, useRef, useState } from 'react'

function EditableTitle({
  title,
  onSave,
  autoEdit,
  onEditStart,
  onEditEnd,
  className = '',
  inputClassName = ''
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  const inputRef = useRef(null)
  const initialTitleRef = useRef(title)

  useEffect(() => {
    if (!editing) setValue(title)
  }, [title, editing])

  useEffect(() => {
    if (autoEdit) {
      initialTitleRef.current = title
      setValue(title)
      setEditing(true)
    }
  }, [autoEdit, title])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const markEditedIfChanged = (next) => {
    if (next.trim() !== initialTitleRef.current) onEditStart?.()
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        data-detail-title-input
        value={value}
        style={{ WebkitAppRegion: 'no-drag' }}
        onChange={(e) => {
          setValue(e.target.value)
          markEditedIfChanged(e.target.value)
        }}
        onBlur={() => {
          const trimmed = value.trim()
          if (trimmed) onSave(trimmed)
          setEditing(false)
          onEditEnd?.()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.target.blur()
          if (e.key === 'Escape') {
            setValue(title)
            setEditing(false)
            onEditEnd?.()
          }
        }}
        className={
          inputClassName ||
          'min-w-0 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-lg font-semibold outline-none'
        }
      />
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      className={`cursor-text truncate hover:text-[var(--color-accent)] ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        initialTitleRef.current = title
        setValue(title)
        setEditing(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          initialTitleRef.current = title
          setValue(title)
          setEditing(true)
        }
      }}
      title="클릭하여 작품명 변경"
    >
      {title}
    </span>
  )
}

export default EditableTitle
