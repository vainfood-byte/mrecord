import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Lock, LockOpen } from 'lucide-react'
import { useApp } from '../../context/AppContext'

const overlayRoot = document.getElementById('overlay-root')

function LockDialogShell({ children, onBackdropClose }) {
  if (!overlayRoot) return null

  return createPortal(
    <div
      data-lock-dialog
      className="fixed inset-0 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onBackdropClose?.()
      }}
    >
      <div
        className="w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    overlayRoot
  )
}

function LockConfigDialog({ onClose, lockSettings, tags, propertyFields, onSave }) {
  const tagFields = useMemo(
    () => (propertyFields || []).filter((f) => f.type === 'tags'),
    [propertyFields]
  )
  const defaultFieldId = lockSettings.propertyFieldId || tagFields.find((f) => f.id === 'grade')?.id || tagFields[0]?.id || 'grade'
  const [fieldId, setFieldId] = useState(defaultFieldId)
  const selectedField = tagFields.find((f) => f.id === fieldId) || tagFields[0]
  const tagCategory = selectedField?.tagCategory || '등급'
  const tagOptions = useMemo(() => {
    let list = tags.filter((t) => t.category === tagCategory)
    const currentId = lockSettings.tagId || 'tag-19'
    if (currentId && !list.some((t) => t.id === currentId)) {
      const current = tags.find((t) => t.id === currentId)
      if (current) list = [current, ...list]
    }
    return list
  }, [tags, tagCategory, lockSettings.tagId])

  const defaultTagId =
    lockSettings.tagId && tagOptions.some((t) => t.id === lockSettings.tagId)
      ? lockSettings.tagId
      : tagOptions.find((t) => t.id === 'tag-19')?.id || tagOptions[0]?.id || 'tag-19'

  const tagRef = useRef(null)
  const startupRef = useRef(null)

  const handleSave = () => {
    onSave({
      propertyFieldId: fieldId,
      tagId: tagRef.current?.value || defaultTagId,
      lockOnStartup: Boolean(startupRef.current?.checked)
    })
    onClose()
  }

  return (
    <LockDialogShell onBackdropClose={onClose}>
      <h3 className="mb-3 font-semibold">잠금 설정</h3>
      <label className="mb-1 block text-xs text-[var(--color-text-muted)]">블러 처리할 태그 (1개)</label>
      <select
        value={fieldId}
        onChange={(e) => setFieldId(e.target.value)}
        className="mb-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm outline-none"
      >
        {tagFields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        ref={tagRef}
        key={`${fieldId}-${defaultTagId}`}
        defaultValue={defaultTagId}
        className="mb-4 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm outline-none"
      >
        {tagOptions.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <label className="mb-4 flex items-center gap-2 text-xs">
        <input ref={startupRef} type="checkbox" defaultChecked={Boolean(lockSettings.lockOnStartup)} />
        프로그램 시작 시 잠금 항상 ON
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm hover:bg-black/5">
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 rounded-lg bg-[var(--color-accent)] py-2 text-sm text-white hover:opacity-90"
        >
          저장
        </button>
      </div>
    </LockDialogShell>
  )
}

export default function LockToggle() {
  const { state, dispatch } = useApp()
  const lock = state.settings.lockSettings || {}
  const lockRef = useRef(lock)
  lockRef.current = lock

  const [configOpen, setConfigOpen] = useState(false)
  const enabled = lock.enabled

  const saveLockSettings = (patch) => {
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        lockSettings: {
          ...lockRef.current,
          ...patch
        }
      }
    })
  }

  const toggleLock = () => {
    if (!lock.tagId) {
      alert('우클릭하여 블러 처리할 태그를 먼저 선택하세요.')
      return
    }
    saveLockSettings({ enabled: !enabled })
  }

  const openConfig = () => {
    window.setTimeout(() => setConfigOpen(true), 0)
  }

  return (
    <>
      <button
        type="button"
        onClick={toggleLock}
        onContextMenu={(e) => {
          e.preventDefault()
          openConfig()
        }}
        className={`rounded-lg p-2 hover:bg-black/5 ${enabled ? 'text-[var(--color-accent)]' : ''}`}
        title={enabled ? '잠금 OFF (클릭)' : '잠금 ON (클릭) · 우클릭: 태그 설정'}
      >
        {enabled ? <Lock size={16} /> : <LockOpen size={16} />}
      </button>
      {configOpen && (
        <LockConfigDialog
          key={`${lock.propertyFieldId || 'grade'}-${lock.tagId || 'tag-19'}`}
          lockSettings={lock}
          tags={state.tags}
          propertyFields={state.settings.propertyFields}
          onClose={() => setConfigOpen(false)}
          onSave={(data) => saveLockSettings(data)}
        />
      )}
    </>
  )
}

export function isRecordLocked(record, lockSettings) {
  if (!lockSettings?.enabled || !lockSettings.tagId) return false
  return (record.tagIds || []).includes(lockSettings.tagId)
}
