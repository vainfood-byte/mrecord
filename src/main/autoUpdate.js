/**
 * Electron 자동 업데이트 (electron-updater + GitHub Releases)
 * publish: github.com/vainfood-byte/mrecord
 */
import { dialog, app } from 'electron'
import { autoUpdater } from 'electron-updater'

let installingUpdate = false

/** quitAndInstall 중 앱의 prepare-quit 가드가 설치를 막지 않도록 */
export function isInstallingUpdate() {
  return installingUpdate
}

function log(...args) {
  console.log('[autoUpdater]', ...args)
}

function logError(...args) {
  console.error('[autoUpdater]', ...args)
}

/**
 * 개발 환경·미패키징 빌드에서는 업데이트 체크를 하지 않습니다.
 * (GitHub Releases 없음 / 로컬 실행 시 불필요 에러 방지)
 */
function shouldSkipAutoUpdate() {
  if (process.env.NODE_ENV === 'development') return true
  if (!app.isPackaged) return true
  return false
}

export function setupAutoUpdater() {
  if (shouldSkipAutoUpdate()) {
    log('skipped (development / unpackaged)')
    return
  }

  try {
    autoUpdater.on('update-available', (info) => {
      log('새 버전 다운로드를 시작합니다', info?.version ?? '')
    })

    autoUpdater.on('update-downloaded', async (info) => {
      log('update downloaded', info?.version ?? '')
      try {
        const { response } = await dialog.showMessageBox({
          type: 'info',
          buttons: ['재시작', '나중에'],
          defaultId: 0,
          cancelId: 1,
          title: '업데이트 준비 완료',
          message: '새 버전이 준비되었습니다. 재시작하여 적용하시겠습니까?'
        })
        if (response === 0) {
          installingUpdate = true
          autoUpdater.quitAndInstall()
        }
      } catch (err) {
        logError('update-downloaded dialog failed', err)
      }
    })

    autoUpdater.on('error', (err) => {
      /* 메인 프로세스 크래시 방지 — 로깅만 */
      logError('error', err?.message || err)
    })

    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      logError('checkForUpdatesAndNotify failed', err?.message || err)
    })
  } catch (err) {
    logError('setup failed', err?.message || err)
  }
}
