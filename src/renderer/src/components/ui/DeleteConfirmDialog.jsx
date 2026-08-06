import { useState } from 'react'
import { createPortal } from 'react-dom'
import { OVERLAY_ABOVE_SIDE_PANEL } from '../../constants/overlayZIndex'

const overlayRoot = document.getElementById('overlay-root')

export default function DeleteConfirmDialog({
  title = '기록 삭제',
  message,
  onConfirm,
  onCancel,
  showSkipAsk = true,
  skipAskLabel = '다시 묻지 않기',
  confirmLabel = '삭제',
  confirmClassName = 'flex-1 rounded-lg bg-red-500 py-2 text-sm text-white hover:bg-red-600'
}) {
  const [skipAsk, setSkipAsk] = useState(false)

  if (!overlayRoot) return null

  return createPortal(
    <div
      data-delete-confirm-dialog
      className="fixed inset-0 flex items-center justify-center bg-black/30"
      style={{ zIndex: OVERLAY_ABOVE_SIDE_PANEL }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="w-80 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 font-semibold">{title}</h3>
        <p className="mb-4 whitespace-pre-line text-sm text-[var(--color-text-muted)]">{message}</p>
        {showSkipAsk && (
          <label className="mb-4 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={skipAsk}
              onChange={(e) => setSkipAsk(e.target.checked)}
            />
            {skipAskLabel}
          </label>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-[var(--color-border)] py-2 text-sm hover:bg-black/5"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(skipAsk)}
            className={confirmClassName}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    overlayRoot
  )
}
