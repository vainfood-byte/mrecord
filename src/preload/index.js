import { contextBridge, ipcRenderer } from 'electron'

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
  savePersistentData: (jsonString, options) =>
    ipcRenderer.invoke('save-persistent-data', jsonString, options || {}),
  loadPersistentData: () => ipcRenderer.invoke('load-persistent-data'),
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
  getWindowBounds: () => ipcRenderer.invoke('window-get-bounds'),
  setWindowBounds: (bounds) => ipcRenderer.invoke('window-set-bounds', bounds),
  relaunch: () => ipcRenderer.invoke('app-relaunch'),
  notifyQuitReady: () => ipcRenderer.send('app-quit-ready')
})
