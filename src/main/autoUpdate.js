/**
 * Electron 자동 업데이트 (electron-updater + GitHub Releases)
 * publish: github.com/vainfood-byte/mrecord
 * UI 알림은 렌더러 커스텀 모달(IPC)로 전달 — 시스템 dialog 미사용
 */
import { app, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

let installingUpdate = false
let quitAndInstallBound = false

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

function sendToRenderer(getWindow, channel, payload) {
  try {
    const win = typeof getWindow === 'function' ? getWindow() : getWindow
    if (!win || win.isDestroyed?.()) return
    win.webContents.send(channel, payload)
  } catch (err) {
    logError('send failed', channel, err?.message || err)
  }
}

function bindQuitAndInstall() {
  if (quitAndInstallBound) return
  quitAndInstallBound = true
  ipcMain.on('quit-and-install', () => {
    log('quit-and-install requested by renderer')
    installingUpdate = true
    try {
      autoUpdater.quitAndInstall()
    } catch (err) {
      installingUpdate = false
      logError('quitAndInstall failed', err?.message || err)
    }
  })
}

/**
 * @param {(() => import('electron').BrowserWindow | null) | import('electron').BrowserWindow} getWindow
 */
export function setupAutoUpdater(getWindow) {
  bindQuitAndInstall()

  if (shouldSkipAutoUpdate()) {
    log('skipped (development / unpackaged)')
    return
  }

  try {
    autoUpdater.on('checking-for-update', () => {
      log('checking-for-update', app.getVersion())
    })

    autoUpdater.on('update-available', (info) => {
      const version = info?.version ?? ''
      log('update-available', version)
      sendToRenderer(getWindow, 'update-available', {
        version,
        currentVersion: app.getVersion()
      })
    })

    autoUpdater.on('update-not-available', (info) => {
      log('update-not-available', info?.version ?? app.getVersion())
    })

    autoUpdater.on('error', (err) => {
      /* 메인 프로세스 크래시 방지 — 로깅만 */
      logError('error', err?.message || err)
    })

    autoUpdater.on('update-downloaded', (info) => {
      const version = info?.version ?? ''
      log('update-downloaded', version)
      sendToRenderer(getWindow, 'update-downloaded', {
        version,
        currentVersion: app.getVersion()
      })
    })

    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      logError('checkForUpdatesAndNotify failed', err?.message || err)
    })
  } catch (err) {
    logError('setup failed', err?.message || err)
  }
}
