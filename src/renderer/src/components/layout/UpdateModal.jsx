import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { OVERLAY_ABOVE_SIDE_PANEL } from '../../constants/overlayZIndex'

const overlayRoot = document.getElementById('overlay-root')

/**
 * electron-updater IPC → 인앱 커스텀 모달
 * - update-available: 다운로드 안내
 * - update-downloaded: 재시작 / 나중에
 */
export default function UpdateModal() {
  const [phase, setPhase] = useState(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    const api = window.mrecord
    if (!api?.onUpdateAvailable || !api?.onUpdateDownloaded) return undefined

    const offAvailable = api.onUpdateAvailable((info) => {
      setVersion(info?.version || '')
      setPhase('available')
    })
    const offDownloaded = api.onUpdateDownloaded((info) => {
      setVersion(info?.version || '')
      setPhase('downloaded')
    })

    return () => {
      offAvailable?.()
      offDownloaded?.()
    }
  }, [])

  if (!phase || !overlayRoot) return null

  const isReady = phase === 'downloaded'

  const handleLater = () => setPhase(null)

  const handleRestart = () => {
    window.mrecord?.quitAndInstall?.()
  }

  return createPortal(
    <div
      data-update-dialog
      data-popup-root
      className="fixed inset-0 flex items-center justify-center bg-black/30"
      style={{ zIndex: OVERLAY_ABOVE_SIDE_PANEL }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isReady) handleLater()
      }}
    >
      <div
        className="w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
      >
        <h3 id="update-dialog-title" className="mb-2 text-base font-semibold text-[var(--color-text)]">
          {isReady ? '업데이트 준비 완료' : '새 버전 다운로드'}
        </h3>
        <p className="mb-5 whitespace-pre-line text-sm leading-relaxed text-[var(--color-text-muted)]">
          {isReady
            ? `새 버전이 준비되었습니다.${version ? `\n버전 ${version}` : ''}\n재시작하여 적용하시겠습니까?`
            : `새 버전을 다운로드하고 있습니다.${version ? `\n버전 ${version}` : ''}\n완료되면 다시 알려 드립니다.`}
        </p>
        <div className="flex gap-2">
          {isReady ? (
            <>
              <button
                type="button"
                onClick={handleLater}
                className="flex-1 rounded-lg border border-[var(--color-border)] py-2 text-sm text-[var(--color-text)] hover:bg-black/5"
              >
                나중에
              </button>
              <button
                type="button"
                onClick={handleRestart}
                className="flex-1 rounded-lg bg-[var(--color-accent)] py-2 text-sm text-white hover:opacity-90"
              >
                지금 재시작
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleLater}
              className="flex-1 rounded-lg bg-[var(--color-accent)] py-2 text-sm text-white hover:opacity-90"
            >
              확인
            </button>
          )}
        </div>
      </div>
    </div>,
    overlayRoot
  )
}
