import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('mrecord', {
  platform: process.platform,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  focusWindow: () => ipcRenderer.invoke('window-focus'),
  getAlwaysOnTop: () => ipcRenderer.invoke('window-get-always-on-top'),
  setAlwaysOnTop: (flag) => ipcRenderer.send('window-set-always-on-top', flag),
  saveDownload: (filename, dataBase64, options = {}) =>
    ipcRenderer.invoke('save-download', { filename, dataBase64, ...options }),
  openExportFolder: () => ipcRenderer.invoke('open-export-folder'),
  saveCoverImage: (payload) => ipcRenderer.invoke('save-cover-image', payload || {}),
  saveCoverThumbnail: (payload) => ipcRenderer.invoke('save-cover-thumbnail', payload || {}),
  ensureCoverThumbnail: (payload) => ipcRenderer.invoke('ensure-cover-thumbnail', payload || {}),
  deleteCoverImage: (payload) => ipcRenderer.invoke('delete-cover-image', payload),
  savePersistentData: (jsonString, options) =>
    ipcRenderer.invoke('save-persistent-data', jsonString, options || {}),
  loadPersistentData: () => ipcRenderer.invoke('load-persistent-data'),
  /** Electron File → 절대 경로 (대용량 import-data용) */
  getPathForFile: (file) => {
    try {
      if (file && typeof webUtils?.getPathForFile === 'function') {
        return webUtils.getPathForFile(file) || ''
      }
    } catch {
      /* ignore */
    }
    try {
      return typeof file?.path === 'string' ? file.path : ''
    } catch {
      return ''
    }
  },
  /** 대용량 백업 JSON — 메인 프로세스 안전 파싱 + Base64 추출 + flush */
  importData: (filePath) => ipcRenderer.invoke('import-data', filePath),
  capturePageRect: (rect) => ipcRenderer.invoke('capture-page-rect', rect),
  beginExportBackground: () => ipcRenderer.invoke('export-background-begin'),
  endExportBackground: () => ipcRenderer.invoke('export-background-end'),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  getDesktopShortcut: () => ipcRenderer.invoke('get-desktop-shortcut'),
  setDesktopShortcut: (enabled) => ipcRenderer.invoke('set-desktop-shortcut', enabled),
  onPrepareQuit: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('app-prepare-quit', handler)
    return () => ipcRenderer.removeListener('app-prepare-quit', handler)
  },
  onWindowBoundsChanged: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('window-bounds-changed', handler)
    return () => ipcRenderer.removeListener('window-bounds-changed', handler)
  },
  onUpdateAvailable: (callback) => {
    const handler = (_event, info) => callback(info)
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_event, info) => callback(info)
    ipcRenderer.on('update-downloaded', handler)
    return () => ipcRenderer.removeListener('update-downloaded', handler)
  },
  /** 부팅 Base64 → media:// 자동 경량화 완료 */
  onDataOptimizationComplete: (callback) => {
    const handler = (_event, info) => callback(info)
    ipcRenderer.on('data-optimization-complete', handler)
    return () => ipcRenderer.removeListener('data-optimization-complete', handler)
  },
  getDataOptimizationResult: () => ipcRenderer.invoke('get-data-optimization-result'),
  quitAndInstall: () => ipcRenderer.send('quit-and-install'),
  getWindowBounds: () => ipcRenderer.invoke('window-get-bounds'),
  setWindowBounds: (bounds) => ipcRenderer.invoke('window-set-bounds', bounds),
  relaunch: () => ipcRenderer.invoke('app-relaunch'),
  notifyQuitReady: () => ipcRenderer.send('app-quit-ready')
})
