import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useTabExport } from '../../hooks/useTabExport'
import { useOutsideDismiss } from '../../hooks/useOutsideDismiss'
import {
  isTabImageExportable,
  LOCK_EXPORT_WARNING_MESSAGE,
  shouldConfirmLockExport
} from '../../utils/exportTabHelpers'
import DeleteConfirmDialog from '../ui/DeleteConfirmDialog'

const overlayRoot = document.getElementById('overlay-root')

function ExportOptionsMenu({ x, y, options, onChange, onClose }) {
  const ref = useRef(null)
  useOutsideDismiss(ref, true, onClose)

  const titleFontSizeRaw = options.titleFontSize ?? options.titleSize
  const titleFontSize =
    titleFontSizeRaw === 'small' || titleFontSizeRaw === 'large'
      ? titleFontSizeRaw
      : 'medium'

  const left = Math.min(x, window.innerWidth - 220)
  const top = Math.min(y, window.innerHeight - 260)

  const menu = (
    <>
      <div
        className="fixed inset-0 z-[99998]"
        aria-hidden
        data-export-popup
        onMouseDown={onClose}
      />
      <div
        ref={ref}
        data-popup-root
        className="fixed z-[99999] w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-2 shadow-lg"
        style={{ left, top, WebkitAppRegion: 'no-drag' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="mb-1 px-1 text-[10px] font-medium text-[var(--color-text-muted)]">
          내보내기 옵션
        </p>
        <label className="flex items-center gap-2 px-1 py-1.5 text-xs">
          <input
            type="checkbox"
            checked={options.showDate}
            onChange={(e) => onChange({ showDate: e.target.checked })}
          />
          날짜 표기
        </label>
        <label className="flex items-center gap-2 px-1 py-1.5 text-xs">
          <input
            type="checkbox"
            checked={options.showBackgroundImage !== false}
            onChange={(e) => onChange({ showBackgroundImage: e.target.checked })}
          />
          배경 이미지 표시
        </label>
        <p className="mb-0.5 mt-1.5 px-1 text-[10px] font-medium text-[var(--color-text-muted)]">
          작품명 크기
        </p>
        {[
          { value: 'large', label: '대' },
          { value: 'medium', label: '중' },
          { value: 'small', label: '소' }
        ].map(({ value, label }) => (
          <label key={value} className="flex items-center gap-2 px-1 py-1 text-xs">
            <input
              type="radio"
              name="export-title-size"
              checked={titleFontSize === value}
              onChange={() => onChange({ titleFontSize: value, titleSize: value })}
            />
            {label}
          </label>
        ))}
      </div>
    </>
  )

  return overlayRoot ? createPortal(menu, overlayRoot) : menu
}

export default function ExportCameraButton() {
  const { state, dispatch } = useApp()
  const { exportActiveTabImage, exportInProgress } = useTabExport()
  const [menu, setMenu] = useState(null)
  const [lockWarnOpen, setLockWarnOpen] = useState(false)
  const runningRef = useRef(false)

  const options = state.settings.exportImageOptions || {
    showDate: true,
    showBackgroundImage: true,
    titleFontSize: 'medium',
    titleSize: 'medium'
  }

  const updateOptions = (patch) => {
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        exportImageOptions: { ...options, ...patch }
      }
    })
  }

  const doExport = async () => {
    if (runningRef.current || exportInProgress) return
    runningRef.current = true
    setMenu(null)
    try {
      await exportActiveTabImage(options)
    } catch (err) {
      console.error(err)
      alert(`내보내기에 실패했습니다.\n${err?.message || err}`)
    } finally {
      runningRef.current = false
    }
  }

  const runExport = async () => {
    if (runningRef.current || exportInProgress) return

    if (!isTabImageExportable(state.activeTab, state.settings)) {
      alert('이 탭에서는 이미지 내보내기를 사용할 수 없습니다.\n(태그형 속성, 메모형 카드 보기, 기록/갤러리/캘린더)')
      return
    }

    if (shouldConfirmLockExport(state.settings)) {
      setLockWarnOpen(true)
      return
    }

    await doExport()
  }

  const confirmLockWarn = async (skipAsk) => {
    if (skipAsk) {
      dispatch({ type: 'UPDATE_SETTINGS', payload: { confirmLockExportWarning: false } })
    }
    setLockWarnOpen(false)
    await doExport()
  }

  return (
    <>
      <button
        type="button"
        data-export-camera-trigger
        disabled={exportInProgress}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={runExport}
        onContextMenu={(e) => {
          e.preventDefault()
          if (exportInProgress) return
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        className={`rounded-lg p-2 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-45 ${
          exportInProgress ? 'text-[var(--color-accent)]' : ''
        }`}
        style={{ WebkitAppRegion: 'no-drag' }}
        title="이미지 내보내기 (우클릭: 옵션)"
      >
        <Camera size={16} />
      </button>
      {menu && (
        <ExportOptionsMenu
          x={menu.x}
          y={menu.y}
          options={options}
          onChange={updateOptions}
          onClose={() => setMenu(null)}
        />
      )}
      {lockWarnOpen && (
        <DeleteConfirmDialog
          title="안내"
          message={LOCK_EXPORT_WARNING_MESSAGE}
          skipAskLabel="다시 질문하지 않기"
          confirmLabel="진행"
          confirmClassName="flex-1 rounded-lg bg-[var(--color-accent)] py-2 text-sm text-white hover:opacity-90"
          onConfirm={confirmLockWarn}
          onCancel={() => setLockWarnOpen(false)}
        />
      )}
    </>
  )
}
